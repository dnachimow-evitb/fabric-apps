# %% [markdown]
# # Customer 360: metrics, scores and dashboard tables
#
# Reads the silver tables and the unified customer (`gold_dim_customer`, `silver_customer_identity_map`) and
# builds everything the dashboard needs:
#
# | Table | Grain | Used for |
# |---|---|---|
# | `gold_customer_metrics` | customer | KPI tiles, churn x upsell matrix, priority table, profile strip, churn drivers |
# | `gold_customer_monthly` | customer x month | sales / returns / marketing / ticket trends |
# | `gold_customer_product_line` | customer x product line | SKU mix and whitespace |
# | `gold_customer_upsell` | customer x recommendation (top 3) | upsell opportunities |
# | `gold_product_line_penetration` | customer type x product line | portfolio penetration chart |
# | `gold_customer_timeline` | event (latest 25 per customer) | activity timeline |
#
# Scores are rules-based and explainable (every point of churn risk has a named driver). They're a
# starting point to be replaced by a trained model once real history is available.

# %%
import json
from pyspark.sql import functions as F, Window

AS_OF = "2026-09-28"
as_of = F.to_date(F.lit(AS_OF))
ttm_start = F.date_sub(as_of, 365)
prior_start = F.date_sub(as_of, 730)
d90 = F.date_sub(as_of, 90)

idm = spark.table("silver_customer_identity_map")
dim = spark.table("gold_dim_customer")
customers = dim.where(F.col("customer_type").isin("Wholesale", "Direct")).select(
    "unified_customer_id", "customer_type", "customer_name", "region", "account_manager", "is_pro_member")


def save(df, name):
    df.write.mode("overwrite").option("overwriteSchema", "true").format("delta").saveAsTable(name)
    print(f"{name}: {spark.table(name).count():,} rows")


def ids(system, alias):
    return idm.where(F.col("source_system") == system).select("unified_customer_id", F.col("source_id").alias(alias))


order_keys = idm.where(F.col("source_system").isin("ERP", "Shopify")).select(
    "unified_customer_id", F.col("source_system").alias("key_system"), F.col("source_id").alias("key_id"))
orders = (spark.table("silver_orders")
          .join(order_keys, (F.col("customer_ref") == F.col("key_id")) & (F.col("source_system") == F.col("key_system")))
          .drop("key_system", "key_id"))
lines = spark.table("silver_order_lines").join(orders.select("order_id", "unified_customer_id", "order_date"), "order_id")
returns = spark.table("silver_returns").join(orders.select("order_id", "unified_customer_id"), "order_id")
events = spark.table("silver_klaviyo_events").join(ids("Klaviyo", "profile_id"), "profile_id")
tickets = spark.table("silver_zendesk_tickets").join(ids("Zendesk User", "requester_id"), "requester_id")


def in_ttm(c):
    return (F.col(c) > ttm_start) & (F.col(c) <= as_of)


def in_prior(c):
    return (F.col(c) > prior_start) & (F.col(c) <= ttm_start)

# %% [markdown]
# ## Monthly facts

# %%
month = lambda c: F.trunc(F.to_date(c), "month")
m_sales = orders.groupBy("unified_customer_id", month("order_date").alias("month")).agg(
    F.sum("net_sales").alias("net_sales"), F.count("*").alias("orders"))
m_returns = returns.groupBy("unified_customer_id", month("return_date").alias("month")).agg(
    F.sum("refund_amount").alias("returns_amount"), F.count("*").alias("returns_count"))
m_mkt = (events.where(F.col("campaign_id").isNotNull())
         .groupBy("unified_customer_id", month("event_at").alias("month")).agg(
             F.sum(F.when(F.col("metric_name").isin("Received Email", "Received SMS"), 1).otherwise(0)).alias("marketing_touches"),
             F.sum(F.when(F.col("metric_name").isin("Opened Email", "Clicked Email", "Clicked SMS"), 1).otherwise(0)).alias("marketing_engagements")))
m_tix = tickets.groupBy("unified_customer_id", month("created_at").alias("month")).agg(F.count("*").alias("tickets"))

monthly = (m_sales.join(m_returns, ["unified_customer_id", "month"], "full")
           .join(m_mkt, ["unified_customer_id", "month"], "full").join(m_tix, ["unified_customer_id", "month"], "full")
           .na.fill(0).where(F.col("month") <= as_of)
           # denormalised filter columns so the app can aggregate by month server-side under any filter
           .join(customers.select("unified_customer_id", "customer_type", "region", "account_manager"), "unified_customer_id"))
save(monthly.select("unified_customer_id", "customer_type", "region", "account_manager", "month",
                    F.col("net_sales").cast("decimal(14,2)").alias("net_sales"),
                    F.col("orders").cast("int").alias("orders"), F.col("returns_amount").cast("decimal(14,2)").alias("returns_amount"),
                    F.col("returns_count").cast("int").alias("returns_count"),
                    F.col("marketing_touches").cast("int").alias("marketing_touches"),
                    F.col("marketing_engagements").cast("int").alias("marketing_engagements"),
                    F.col("tickets").cast("int").alias("tickets")), "gold_customer_monthly")

# %% [markdown]
# ## Product lines: mix, penetration and whitespace

# %%
line_ttm = (lines.where(in_ttm("order_date")).groupBy("unified_customer_id", "product_line")
            .agg(F.sum("net_amount").alias("net_sales_ttm")))
line_life = lines.groupBy("unified_customer_id", "product_line").agg(F.max("order_date").alias("last_purchased"))
active = (orders.where(in_ttm("order_date")).select("unified_customer_id").distinct()
          .join(customers.select("unified_customer_id", "customer_type"), "unified_customer_id"))
all_lines = spark.table("silver_products").select("product_line").distinct()

penetration = (active.crossJoin(all_lines)
               .join(line_ttm.select("unified_customer_id", "product_line", F.lit(1).alias("bought")),
                     ["unified_customer_id", "product_line"], "left")
               .groupBy("customer_type", "product_line")
               .agg(F.avg(F.coalesce("bought", F.lit(0))).alias("penetration"), F.count("*").alias("active_customers")))
avg_spend = (line_ttm.join(customers.select("unified_customer_id", "customer_type"), "unified_customer_id")
             .groupBy("customer_type", "product_line").agg(F.avg("net_sales_ttm").alias("avg_spend_per_buyer")))
penetration = penetration.join(avg_spend, ["customer_type", "product_line"], "left")
save(penetration.select("customer_type", "product_line", F.round("penetration", 4).alias("penetration"),
                        "active_customers", F.col("avg_spend_per_buyer").cast("decimal(14,2)").alias("avg_spend_per_buyer")),
     "gold_product_line_penetration")

w_cust = Window.partitionBy("unified_customer_id")
browsed = (events.where((F.col("metric_name") == "Viewed Product") & (F.col("event_at") > d90))
           .select("unified_customer_id", F.get_json_object("properties", "$.ProductLine").alias("product_line"))
           .groupBy("unified_customer_id", "product_line").agg(F.count("*").alias("views_90d")))
cpl = (customers.select("unified_customer_id", "customer_type").crossJoin(all_lines)
       .join(line_ttm, ["unified_customer_id", "product_line"], "left")
       .join(line_life, ["unified_customer_id", "product_line"], "left")
       .join(browsed, ["unified_customer_id", "product_line"], "left")
       .join(penetration.select("customer_type", "product_line", "penetration", "avg_spend_per_buyer"),
             ["customer_type", "product_line"], "left")
       .withColumn("net_sales_ttm", F.coalesce("net_sales_ttm", F.lit(0)))
       .withColumn("share_of_sales_ttm", F.col("net_sales_ttm") / F.sum("net_sales_ttm").over(w_cust))
       .withColumn("purchased_ttm", F.col("net_sales_ttm") > 0))
save(cpl.select("unified_customer_id", "product_line", F.col("net_sales_ttm").cast("decimal(14,2)").alias("net_sales_ttm"),
                F.round("share_of_sales_ttm", 4).alias("share_of_sales_ttm"), "purchased_ttm", "last_purchased",
                F.coalesce("views_90d", F.lit(0)).cast("int").alias("views_90d"),
                F.round("penetration", 4).alias("peer_penetration")), "gold_customer_product_line")

# %% [markdown]
# ## Customer metrics

# %%
o_agg = orders.groupBy("unified_customer_id").agg(
    F.sum(F.when(in_ttm("order_date"), F.col("net_sales")).otherwise(0)).alias("net_sales_ttm"),
    F.sum(F.when(in_prior("order_date"), F.col("net_sales")).otherwise(0)).alias("net_sales_prior_ttm"),
    F.sum(F.when(in_ttm("order_date"), 1).otherwise(0)).alias("orders_ttm"),
    F.max("order_date").alias("last_order_date"))
l_agg = lines.where(in_ttm("order_date")).groupBy("unified_customer_id").agg(
    F.sum("net_amount").alias("line_sales_ttm"), F.countDistinct("product_line").alias("product_lines_ttm"))
r_agg = returns.where(in_ttm("return_date")).groupBy("unified_customer_id").agg(
    F.sum("refund_amount").alias("returns_ttm"),
    F.sum(F.when(F.col("reason_code") == "DEFECT", 1).otherwise(0)).alias("defect_returns_ttm"))
t_agg = tickets.groupBy("unified_customer_id").agg(
    F.sum(F.when(F.to_date("created_at") > ttm_start, 1).otherwise(0)).alias("tickets_12m"),
    F.sum(F.when(F.to_date("created_at") > d90, 1).otherwise(0)).alias("tickets_90d"),
    F.sum(F.when(F.col("status").isin("new", "open", "pending", "hold"), 1).otherwise(0)).alias("open_tickets"),
    F.sum(F.when(F.col("status").isin("new", "open", "pending", "hold") & F.col("priority").isin("high", "urgent"), 1)
          .otherwise(0)).alias("high_priority_open"),
    F.sum(F.when((F.col("satisfaction_rating") == "bad") & (F.to_date("created_at") > ttm_start), 1).otherwise(0)).alias("bad_csat_12m"),
    F.avg(F.when(F.to_date("created_at") > ttm_start, F.col("resolution_minutes"))).alias("avg_resolution_minutes_12m"))
camp = events.where(F.col("campaign_id").isNotNull())
recv = F.col("metric_name").isin("Received Email", "Received SMS")
eng = F.col("metric_name").isin("Opened Email", "Clicked Email", "Clicked SMS")
e_agg = camp.groupBy("unified_customer_id").agg(
    F.sum(F.when(recv & (F.col("event_at") > d90), 1).otherwise(0)).alias("touches_90d"),
    F.sum(F.when(eng & (F.col("event_at") > d90), 1).otherwise(0)).alias("engagements_90d"),
    F.sum(F.when(recv & (F.col("event_at") <= d90) & (F.col("event_at") > ttm_start), 1).otherwise(0)).alias("touches_prior"),
    F.sum(F.when(eng & (F.col("event_at") <= d90) & (F.col("event_at") > ttm_start), 1).otherwise(0)).alias("engagements_prior"),
    F.max(F.when(eng, F.col("event_at"))).alias("last_engaged_at"))

m = (customers.join(o_agg, "unified_customer_id", "left").join(l_agg, "unified_customer_id", "left")
     .join(r_agg, "unified_customer_id", "left").join(t_agg, "unified_customer_id", "left")
     .join(e_agg, "unified_customer_id", "left")
     .na.fill(0, ["net_sales_ttm", "net_sales_prior_ttm", "orders_ttm", "line_sales_ttm", "product_lines_ttm",
                  "returns_ttm", "defect_returns_ttm", "tickets_12m", "tickets_90d", "open_tickets", "high_priority_open",
                  "bad_csat_12m", "touches_90d", "engagements_90d", "touches_prior", "engagements_prior"])
     # ratios as double: string formatting (%f) and scoring expect floating point, not decimal
     .withColumn("sales_yoy", F.when(F.col("net_sales_prior_ttm") > 0,
                                     F.col("net_sales_ttm").cast("double") / F.col("net_sales_prior_ttm").cast("double") - 1))
     .withColumn("return_rate_ttm", F.when(F.col("line_sales_ttm") > 0,
                                           F.col("returns_ttm").cast("double") / F.col("line_sales_ttm").cast("double")))
     .withColumn("engagement_rate_90d", F.when(F.col("touches_90d") > 0, F.col("engagements_90d") / F.col("touches_90d")))
     .withColumn("engagement_rate_prior", F.when(F.col("touches_prior") > 0, F.col("engagements_prior") / F.col("touches_prior")))
     .withColumn("days_since_order", F.datediff(as_of, "last_order_date"))
     .withColumn("days_since_engaged", F.datediff(as_of, F.to_date("last_engaged_at"))))

# %% [markdown]
# ## Churn risk (0-100) with named drivers
#
# | Driver | Points |
# |---|---|
# | Sales decline year over year | up to 35 (50 pts per 100% decline) |
# | Overdue for next order vs. usual cadence (wholesale 45 days, direct 150 days) | up to 25 |
# | Return rate above 6% | up to 12 |
# | Open / high-priority tickets, bad CSAT, recent ticket volume | up to 18 |
# | Marketing engagement falling off | up to 12 |
# | Buys from only 1-2 product lines | up to 5 |

# %%
expected_gap = F.when(F.col("customer_type") == "Wholesale", 45).otherwise(150)
drivers = {
    "Sales decline": (F.least(F.lit(35.0), F.greatest(F.lit(0.0), -F.coalesce("sales_yoy", F.lit(0.0)) * 50)),
                      F.format_string("Net sales %s%.0f%% vs. prior year", F.when(F.col("sales_yoy") < 0, "").otherwise("+"),
                                      F.coalesce("sales_yoy", F.lit(0.0)) * 100)),
    "Overdue order": (F.least(F.lit(25.0), F.greatest(F.lit(0.0), (F.coalesce("days_since_order", F.lit(730)) - expected_gap) / expected_gap * 12)),
                      F.format_string("%d days since last order", F.coalesce("days_since_order", F.lit(730)))),
    "High returns": (F.least(F.lit(12.0), F.greatest(F.lit(0.0), (F.coalesce("return_rate_ttm", F.lit(0.0)) - 0.06) * 150)),
                     F.format_string("Return rate %.1f%% (%d defect returns)", F.coalesce("return_rate_ttm", F.lit(0.0)) * 100,
                                     F.col("defect_returns_ttm"))),
    "Service issues": (F.least(F.lit(18.0), F.col("high_priority_open") * 6 + F.col("open_tickets") * 2
                               + F.col("bad_csat_12m") * 4 + F.col("tickets_90d") * 2),
                       F.format_string("%d open tickets (%d high priority), %d bad CSAT in 12 months",
                                       F.col("open_tickets"), F.col("high_priority_open"), F.col("bad_csat_12m"))),
    "Disengaging": (F.least(F.lit(12.0),
                            F.when((F.col("engagement_rate_prior") > 0.05)
                                   & (F.coalesce("engagement_rate_90d", F.lit(0.0)) < F.col("engagement_rate_prior") * 0.5), 8).otherwise(0)
                            + F.when(F.coalesce("days_since_engaged", F.lit(999)) > 90, 4).otherwise(0)),
                    F.format_string("Engagement %.0f%% (last 90 days) vs. %.0f%% before",
                                    F.coalesce("engagement_rate_90d", F.lit(0.0)) * 100, F.coalesce("engagement_rate_prior", F.lit(0.0)) * 100)),
    "Narrow product mix": (F.when(F.col("product_lines_ttm") <= 1, 5.0).when(F.col("product_lines_ttm") == 2, 3.0).otherwise(0.0),
                           F.format_string("Buys from %d product line(s)", F.col("product_lines_ttm"))),
}
for name, (pts, _) in drivers.items():
    m = m.withColumn(f"_pts_{name}", pts.cast("double"))
m = m.withColumn("churn_risk_score", F.least(F.lit(100), F.round(F.lit(5.0) + sum(F.col(f"_pts_{n}") for n in drivers)).cast("int")))
driver_structs = F.array(*[F.struct(F.lit(n).alias("driver"), F.round(F.col(f"_pts_{n}"), 1).alias("points"), detail.alias("detail"))
                           for n, (_, detail) in drivers.items()])
m = (m.withColumn("_drivers", F.filter(driver_structs, lambda x: x["points"] > 0))
     .withColumn("_drivers", F.sort_array(F.transform("_drivers", lambda x: F.struct(x["points"].alias("points"), x["driver"].alias("driver"),
                                                                                  x["detail"].alias("detail"))), asc=False))
     .withColumn("churn_drivers", F.to_json(F.slice("_drivers", 1, 4)))
     .withColumn("top_churn_driver", F.col("_drivers")[0]["driver"])
     .withColumn("churn_risk_band", F.when(F.col("churn_risk_score") >= 60, "High").when(F.col("churn_risk_score") >= 35, "Medium")
                 .otherwise("Low")))

# %% [markdown]
# ## Upsell: peer-based product line recommendations

# %%
risk = m.select("unified_customer_id", "churn_risk_score")
recs = (spark.table("gold_customer_product_line").where(~F.col("purchased_ttm"))
        .join(customers.select("unified_customer_id", "customer_type"), "unified_customer_id")
        .join(penetration.select("customer_type", "product_line", "avg_spend_per_buyer"), ["customer_type", "product_line"], "left")
        .join(risk, "unified_customer_id")
        .withColumn("browsing_boost", F.when(F.col("views_90d") > 0, 1.5).otherwise(1.0))
        .withColumn("estimated_annual_value",
                    (F.col("peer_penetration") * F.coalesce("avg_spend_per_buyer", F.lit(0)) * F.col("browsing_boost")
                     * (1 - F.col("churn_risk_score") / 200)).cast("decimal(14,2)"))
        .withColumn("reason", F.concat(F.format_string("%.0f%% of similar ", F.col("peer_penetration") * 100),
                                       F.when(F.col("customer_type") == "Wholesale", "accounts").otherwise("customers"),
                                       F.lit(" buy it"),
                                       F.when(F.col("views_90d") > 0, F.format_string("; viewed %d times in 90 days", F.col("views_90d")))
                                       .otherwise(F.lit(""))))
        .withColumn("rank", F.row_number().over(Window.partitionBy("unified_customer_id").orderBy(F.desc("estimated_annual_value"))))
        .where("rank <= 3"))
save(recs.select("unified_customer_id", "rank", "product_line", "estimated_annual_value", "peer_penetration", "views_90d", "reason"),
     "gold_customer_upsell")

up = (spark.table("gold_customer_upsell").groupBy("unified_customer_id")
      .agg(F.sum("estimated_annual_value").alias("upsell_value_est"),
           F.first(F.when(F.col("rank") == 1, F.col("product_line")), True).alias("top_upsell_product_line")))
m = (m.join(up, "unified_customer_id", "left").withColumn("upsell_value_est", F.coalesce("upsell_value_est", F.lit(0)))
     .withColumn("upsell_score", (F.percent_rank().over(Window.partitionBy("customer_type").orderBy("upsell_value_est")) * 100)
                 .cast("int")))

# %% [markdown]
# ## Next best action and priority

# %%
m = (m.withColumn("next_best_action",
                  F.when((F.col("high_priority_open") > 0) & (F.col("churn_risk_score") >= 60),
                         F.format_string("Resolve %d high-priority ticket(s), then owner call", F.col("high_priority_open")))
                  .when((F.col("churn_risk_score") >= 60) & (F.col("sales_yoy") < -0.15),
                        F.format_string("Retention review: sales down %.0f%% YoY", -F.col("sales_yoy") * 100))
                  .when(F.col("return_rate_ttm") > 0.12, F.format_string("Investigate returns (%.1f%%)", F.col("return_rate_ttm") * 100))
                  .when((F.col("upsell_score") >= 60) & F.col("top_upsell_product_line").isNotNull(),
                        F.concat(F.lit("Pitch "), F.col("top_upsell_product_line")))
                  .when(F.col("days_since_engaged") > 90, F.format_string("Re-engage: no marketing response in %d days", F.col("days_since_engaged")))
                  .otherwise("Maintain cadence"))
     .withColumn("revenue_at_risk", (F.col("net_sales_ttm") * F.col("churn_risk_score") / 100).cast("decimal(14,2)"))
     .withColumn("priority_score", F.col("revenue_at_risk") * 0.6 + F.col("upsell_value_est") * 2))

cols = ["unified_customer_id", "customer_type", "customer_name", "region", "account_manager", "is_pro_member",
        "net_sales_ttm", "net_sales_prior_ttm", "sales_yoy", "orders_ttm", "last_order_date", "days_since_order",
        "returns_ttm", "return_rate_ttm", "defect_returns_ttm", "product_lines_ttm",
        "tickets_12m", "tickets_90d", "open_tickets", "high_priority_open", "bad_csat_12m", "avg_resolution_minutes_12m",
        "touches_90d", "engagements_90d", "engagement_rate_90d", "engagement_rate_prior", "days_since_engaged",
        "churn_risk_score", "churn_risk_band", "top_churn_driver", "churn_drivers",
        "upsell_score", "upsell_value_est", "top_upsell_product_line", "revenue_at_risk", "priority_score", "next_best_action"]
out = m.select(*cols)
for c in ["net_sales_ttm", "net_sales_prior_ttm", "returns_ttm", "upsell_value_est", "revenue_at_risk", "priority_score"]:
    out = out.withColumn(c, F.col(c).cast("decimal(14,2)"))
for c in ["sales_yoy", "return_rate_ttm", "engagement_rate_90d", "engagement_rate_prior"]:
    out = out.withColumn(c, F.round(c, 4))
out = out.withColumn("avg_resolution_minutes_12m", F.round("avg_resolution_minutes_12m").cast("int")).withColumn("as_of_date", as_of)
save(out, "gold_customer_metrics")

# %% [markdown]
# ## Activity timeline (latest 25 events per customer)

# %%
tl = (orders.select("unified_customer_id", F.to_timestamp("order_date").alias("event_at"), F.lit("Order").alias("source"),
                    F.concat(F.lit("Order "), "order_id").alias("title"),
                    F.format_string("$%,.0f", F.col("total").cast("double")).alias("detail"))
      .unionByName(returns.select("unified_customer_id", F.to_timestamp("return_date").alias("event_at"), F.lit("Return").alias("source"),
                                  F.concat(F.lit("Return "), "rma_id").alias("title"),
                                  F.concat_ws(" · ", "reason", F.format_string("$%,.0f", F.col("refund_amount").cast("double"))).alias("detail")))
      .unionByName(tickets.select("unified_customer_id", F.col("created_at").alias("event_at"), F.lit("Support").alias("source"),
                                  F.concat(F.lit("Ticket #"), "ticket_id", F.lit(" · "), "subject").alias("title"),
                                  F.concat_ws(" · ", F.initcap("priority"), F.initcap("status")).alias("detail")))
      .unionByName(events.where(F.col("metric_name").isin("Clicked Email", "Clicked SMS", "Unsubscribed from Email Marketing"))
                   .join(spark.table("silver_klaviyo_campaigns").select("campaign_id", F.col("name").alias("campaign")), "campaign_id", "left")
                   .select("unified_customer_id", "event_at", F.lit("Marketing").alias("source"),
                           F.col("metric_name").alias("title"), F.coalesce("campaign", F.lit("")).alias("detail"))))
tl = (tl.where(F.col("event_at") <= F.to_timestamp(F.lit(AS_OF + " 23:59:59")))
      .withColumn("rn", F.row_number().over(Window.partitionBy("unified_customer_id").orderBy(F.desc("event_at"))))
      .where("rn <= 25").drop("rn"))
save(tl, "gold_customer_timeline")

# %% [markdown]
# ## QA: do the scores find the planted personas? (test data only)

# %%
truth_ids = spark.read.option("header", True).csv("Files/_truth/identity_truth.csv").where("source_system in ('ERP','Shopify')")
personas = spark.read.option("header", True).csv("Files/_truth/customer_personas.csv").select(
    F.col("customer_key").alias("true_customer_key"), "persona")
qa = (spark.table("gold_customer_metrics")
      .join(idm.where(F.col("source_system").isin("ERP", "Shopify")).select("unified_customer_id", "source_system", "source_id"),
            "unified_customer_id")
      .join(truth_ids, ["source_system", "source_id"]).join(personas, "true_customer_key")
      .groupBy("customer_type", "persona").agg(
          F.count("*").alias("customers"), F.round(F.avg("churn_risk_score"), 1).alias("avg_churn_risk"),
          F.round(F.avg((F.col("churn_risk_band") == "High").cast("int")), 3).alias("share_high_risk"),
          F.round(F.avg("upsell_score"), 1).alias("avg_upsell_score"), F.round(F.avg("product_lines_ttm"), 2).alias("avg_product_lines")))
save(qa, "qa_score_validation")
display(spark.table("qa_score_validation").orderBy("customer_type", F.desc("avg_churn_risk")))
