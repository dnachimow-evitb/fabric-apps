# %% [markdown]
# # Customer 360: SKU and risk analytics
#
# | Table | Grain | Used for |
# |---|---|---|
# | `gold_sku_performance` | SKU x customer type | SKU drill-down: sales, units, buyers, returns, linked tickets, YoY |
# | `gold_customer_sku` | customer x SKU (last 24 months) | who buys a SKU; a customer's SKU list |
# | `gold_sku_affinity` | SKU pair x customer type (top 5 per SKU) | "customers who buy X also buy Y" |
# | `gold_customer_sku_recs` | customer x recommended SKU (top 5) | SKU-level upsell |
# | `gold_issue_cascade` | group x customer type x month relative to a support spike | event study: tickets -> engagement -> sales |
# | `gold_customer_cascade` | customer with a support spike | per-customer cascade pattern and lags |
# | `gold_driver_correlation` | driver x customer type | which drivers predict the next 6 months of sales |
# | `gold_risk_concentration` | dimension value x customer type | where revenue at risk sits |
#
# Runs after `c360_customer_metrics` (reads its gold tables).

# %%
from pyspark.sql import functions as F, Window

AS_OF = "2026-09-28"
as_of = F.to_date(F.lit(AS_OF))
ttm_start = F.date_sub(as_of, 365)
prior_start = F.date_sub(as_of, 730)

idm = spark.table("silver_customer_identity_map")
metrics = spark.table("gold_customer_metrics")
cust = metrics.select("unified_customer_id", "customer_type", "customer_name", "region", "account_manager")
products = spark.table("silver_products").select("sku", "product_name", "product_line", "category")


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
tickets = spark.table("silver_zendesk_tickets").join(ids("Zendesk User", "requester_id"), "requester_id")
in_ttm = lambda c: (F.col(c) > ttm_start) & (F.col(c) <= as_of)
in_prior = lambda c: (F.col(c) > prior_start) & (F.col(c) <= ttm_start)

# %% [markdown]
# ## SKU performance and customer x SKU

# %%
line_ret = (returns.groupBy("order_id", "line_number")
            .agg(F.sum("refund_amount").alias("refund"), F.sum(F.when(F.col("reason_code") == "DEFECT", F.col("refund_amount"))
                                                              .otherwise(0)).alias("defect_refund")))
l = (lines.join(line_ret, ["order_id", "line_number"], "left").na.fill(0, ["refund", "defect_refund"])
     .join(cust.select("unified_customer_id", "customer_type"), "unified_customer_id"))

# tickets that reference an order, attributed to every SKU on that order
ticket_sku = (tickets.where(F.col("order_number").isNotNull() & (F.to_date("created_at") > ttm_start))
              .join(lines.select(F.col("order_id").alias("order_number"), "sku").distinct(), "order_number")
              .join(cust.select("unified_customer_id", "customer_type"), "unified_customer_id")
              .groupBy("sku", "customer_type").agg(F.countDistinct("ticket_id").alias("tickets_linked_ttm")))

sku_perf = (l.groupBy("sku", "customer_type").agg(
    F.sum(F.when(in_ttm("order_date"), F.col("net_amount")).otherwise(0)).alias("net_sales_ttm"),
    F.sum(F.when(in_prior("order_date"), F.col("net_amount")).otherwise(0)).alias("net_sales_prior_ttm"),
    F.sum(F.when(in_ttm("order_date"), F.col("quantity")).otherwise(0)).alias("units_ttm"),
    F.countDistinct(F.when(in_ttm("order_date"), F.col("unified_customer_id"))).alias("buyers_ttm"),
    F.sum(F.when(in_ttm("order_date"), F.col("refund")).otherwise(0)).alias("returns_ttm"),
    F.sum(F.when(in_ttm("order_date"), F.col("defect_refund")).otherwise(0)).alias("defect_returns_ttm"))
    .join(ticket_sku, ["sku", "customer_type"], "left")
    .join(products, "sku")
    .withColumn("tickets_linked_ttm", F.coalesce("tickets_linked_ttm", F.lit(0)))
    .withColumn("return_rate_ttm", F.when(F.col("net_sales_ttm") > 0, F.col("returns_ttm").cast("double") / F.col("net_sales_ttm").cast("double")))
    .withColumn("sales_yoy", F.when(F.col("net_sales_prior_ttm") > 0,
                                    F.col("net_sales_ttm").cast("double") / F.col("net_sales_prior_ttm").cast("double") - 1)))
repeat = (l.where(in_ttm("order_date")).groupBy("sku", "customer_type", "unified_customer_id").agg(F.countDistinct("order_id").alias("n"))
          .groupBy("sku", "customer_type").agg(F.avg((F.col("n") > 1).cast("int")).alias("repeat_buyer_rate")))
sku_perf = sku_perf.join(repeat, ["sku", "customer_type"], "left")
save(sku_perf.select("sku", "product_name", "product_line", "category", "customer_type",
                     *[F.col(c).cast("decimal(14,2)").alias(c) for c in ["net_sales_ttm", "net_sales_prior_ttm", "returns_ttm", "defect_returns_ttm"]],
                     F.col("units_ttm").cast("int").alias("units_ttm"), F.col("buyers_ttm").cast("int").alias("buyers_ttm"),
                     F.col("tickets_linked_ttm").cast("int").alias("tickets_linked_ttm"),
                     F.round("return_rate_ttm", 4).alias("return_rate_ttm"), F.round("sales_yoy", 4).alias("sales_yoy"),
                     F.round("repeat_buyer_rate", 4).alias("repeat_buyer_rate")), "gold_sku_performance")

csku = (l.where(F.col("order_date") > prior_start).groupBy("unified_customer_id", "sku").agg(
    F.sum(F.when(in_ttm("order_date"), F.col("net_amount")).otherwise(0)).alias("net_sales_ttm"),
    F.sum(F.when(in_prior("order_date"), F.col("net_amount")).otherwise(0)).alias("net_sales_prior_ttm"),
    F.sum(F.when(in_ttm("order_date"), F.col("quantity")).otherwise(0)).alias("units_ttm"),
    F.sum(F.when(in_ttm("order_date"), F.col("refund")).otherwise(0)).alias("returns_ttm"),
    F.max("order_date").alias("last_purchased"))
    .join(cust, "unified_customer_id").join(products, "sku"))
save(csku.select("unified_customer_id", "customer_type", "customer_name", "region", "account_manager",
                 "sku", "product_name", "product_line",
                 *[F.col(c).cast("decimal(14,2)").alias(c) for c in ["net_sales_ttm", "net_sales_prior_ttm", "returns_ttm"]],
                 F.col("units_ttm").cast("int").alias("units_ttm"), "last_purchased"), "gold_customer_sku")

# %% [markdown]
# ## SKU affinity ("bought together") and SKU recommendations

# %%
baskets = spark.table("gold_customer_sku").where(F.col("net_sales_ttm") > 0).select("unified_customer_id", "customer_type", "sku")
n_type = baskets.groupBy("customer_type").agg(F.countDistinct("unified_customer_id").alias("n_customers"))
sku_n = baskets.groupBy("customer_type", "sku").agg(F.countDistinct("unified_customer_id").alias("sku_customers"))
pairs = (baskets.alias("a").join(baskets.alias("b"),
                                 (F.col("a.unified_customer_id") == F.col("b.unified_customer_id")) & (F.col("a.sku") != F.col("b.sku")))
         .groupBy(F.col("a.customer_type").alias("customer_type"), F.col("a.sku").alias("sku"), F.col("b.sku").alias("related_sku"))
         .agg(F.countDistinct("a.unified_customer_id").alias("pair_customers"))
         .where("pair_customers >= 3"))
aff = (pairs.join(sku_n, ["customer_type", "sku"])
       .join(sku_n.select("customer_type", F.col("sku").alias("related_sku"), F.col("sku_customers").alias("related_customers")),
             ["customer_type", "related_sku"])
       .join(n_type, "customer_type")
       .withColumn("confidence", F.col("pair_customers") / F.col("sku_customers"))
       .withColumn("lift", F.col("confidence") / (F.col("related_customers") / F.col("n_customers")))
       .withColumn("rank", F.row_number().over(Window.partitionBy("customer_type", "sku")
                                               .orderBy(F.desc(F.col("lift") * F.col("confidence")))))
       .where("rank <= 5")
       .join(products.select(F.col("sku").alias("related_sku"), F.col("product_name").alias("related_product_name"),
                             F.col("product_line").alias("related_product_line")), "related_sku"))
save(aff.select("customer_type", "sku", "rank", "related_sku", "related_product_name", "related_product_line",
                F.col("pair_customers").cast("int").alias("pair_customers"), F.round("confidence", 4).alias("confidence"),
                F.round("lift", 3).alias("lift")), "gold_sku_affinity")

avg_spend = (spark.table("gold_customer_sku").where(F.col("net_sales_ttm") > 0).groupBy("customer_type", "sku")
             .agg(F.avg("net_sales_ttm").alias("avg_spend")))
owned = baskets.select("unified_customer_id", "customer_type", "sku")
cand = (owned.join(spark.table("gold_sku_affinity"), ["customer_type", "sku"])
        .join(owned.select("unified_customer_id", F.col("sku").alias("related_sku"), F.lit(1).alias("already")),
              ["unified_customer_id", "related_sku"], "left")
        .where(F.col("already").isNull())
        .groupBy("unified_customer_id", "customer_type", "related_sku", "related_product_name", "related_product_line")
        .agg(F.sum("confidence").alias("score"), F.max("confidence").alias("best_conf"),
             F.max_by("sku", "confidence").alias("because_sku"))
        .join(products.select(F.col("sku").alias("because_sku"), F.col("product_name").alias("because_product_name")), "because_sku")
        .join(avg_spend.select("customer_type", F.col("sku").alias("related_sku"), "avg_spend"), ["customer_type", "related_sku"], "left")
        .join(metrics.select("unified_customer_id", "churn_risk_score"), "unified_customer_id")
        .withColumn("estimated_annual_value",
                    (F.least(F.lit(1.0), F.col("score")) * F.coalesce("avg_spend", F.lit(0)) * (1 - F.col("churn_risk_score") / 200))
                    .cast("decimal(14,2)"))
        .withColumn("reason", F.format_string("%.0f%% of customers who buy %s also buy it", F.col("best_conf") * 100,
                                              F.col("because_product_name")))
        .withColumn("rank", F.row_number().over(Window.partitionBy("unified_customer_id").orderBy(F.desc("score"), F.desc("avg_spend"))))
        .where("rank <= 5"))
save(cand.select("unified_customer_id", "rank", F.col("related_sku").alias("sku"), F.col("related_product_name").alias("product_name"),
                 F.col("related_product_line").alias("product_line"), F.round("score", 4).alias("score"), "estimated_annual_value",
                 "because_sku", "reason"), "gold_customer_sku_recs")

# %% [markdown]
# ## Issue cascade: support spike -> marketing engagement -> sales
#
# A **support spike** is a customer's first month (with at least 6 months of history before it) with 2+ tickets,
# or (direct customers) at least one high/urgent ticket. Each spiking customer is compared with customers who never
# had a spike, aligned on the same calendar months (their pseudo-event month is drawn from the spike-month distribution).
# Months are indexed relative to the spike (-6 .. +9).

# %%
monthly = spark.table("gold_customer_monthly")
months = monthly.select("month").distinct()
high_tix = (tickets.where(F.col("priority").isin("high", "urgent"))
            .groupBy("unified_customer_id", F.trunc(F.to_date("created_at"), "month").alias("month"))
            .agg(F.count("*").alias("high_tickets")))
grid = (cust.select("unified_customer_id", "customer_type").crossJoin(months)
        .join(monthly.select("unified_customer_id", "month", "net_sales", "tickets", "marketing_touches", "marketing_engagements"),
              ["unified_customer_id", "month"], "left")
        .join(high_tix, ["unified_customer_id", "month"], "left").na.fill(0)
        .withColumn("m", F.months_between("month", F.lit("2024-10-01")).cast("int")))

is_spike = (F.col("tickets") >= 2) | ((F.col("customer_type") == "Direct") & (F.col("high_tickets") >= 1))
spikes = (grid.where((F.col("m") >= 6) & (F.col("m") <= 20) & is_spike)
          .groupBy("unified_customer_id").agg(F.min("m").alias("event_m")))
spike_ids = spikes.select("unified_customer_id")
never = (grid.select("unified_customer_id").distinct().join(spike_ids, "unified_customer_id", "left_anti"))
# pseudo event month for controls, sampled deterministically from the spike-month distribution
dist = spikes.groupBy("event_m").count().collect()
bucket = []
for r in dist:
    bucket += [r["event_m"]] * r["count"]
bucket = sorted(bucket) or [12]
pick = F.udf(lambda h: bucket[h % len(bucket)], "int")
controls = never.withColumn("event_m", pick(F.abs(F.hash("unified_customer_id"))))

events = (spikes.withColumn("cohort", F.lit("Support spike"))
          .unionByName(controls.withColumn("cohort", F.lit("No spike"))))
rel = (grid.join(events, "unified_customer_id").withColumn("rel_month", F.col("m") - F.col("event_m"))
       .where((F.col("rel_month") >= -6) & (F.col("rel_month") <= 9)))
baseline = (rel.where((F.col("rel_month") >= -6) & (F.col("rel_month") <= -1))
            .groupBy("unified_customer_id").agg(F.avg("net_sales").alias("base_sales"),
                                                F.sum("marketing_engagements").alias("base_eng"),
                                                F.sum("marketing_touches").alias("base_touch")))
rel = rel.join(baseline, "unified_customer_id")
study = (rel.groupBy("cohort", "customer_type", "rel_month").agg(
    F.countDistinct("unified_customer_id").alias("customers"),
    (F.sum("net_sales") / F.sum("base_sales")).alias("sales_index"),
    (F.sum("marketing_engagements") / F.sum("marketing_touches")).alias("engagement_rate"),
    F.avg("tickets").alias("tickets_per_customer")))
save(study.select("cohort", "customer_type", F.col("rel_month").cast("int").alias("rel_month"),
                  F.col("customers").cast("int").alias("customers"), F.round(F.col("sales_index").cast("double"), 4).alias("sales_index"),
                  F.round("engagement_rate", 4).alias("engagement_rate"), F.round("tickets_per_customer", 4).alias("tickets_per_customer")),
     "gold_issue_cascade")

# per-customer cascade pattern
sp = rel.where(F.col("cohort") == "Support spike")
eng_before = F.col("base_eng") / F.col("base_touch")
w2 = Window.partitionBy("unified_customer_id").orderBy("rel_month").rowsBetween(0, 1)
w3 = Window.partitionBy("unified_customer_id").orderBy("rel_month").rowsBetween(0, 2)
roll = (sp.where(F.col("rel_month") >= 0)
        .withColumn("eng2", F.sum("marketing_engagements").over(w2) / F.sum("marketing_touches").over(w2))
        .withColumn("sales3", F.avg("net_sales").over(w3)))
lags = roll.groupBy("unified_customer_id").agg(
    F.min(F.when((eng_before > 0.05) & (F.col("eng2") < eng_before * 0.5), F.col("rel_month"))).alias("engagement_drop_lag"),
    F.min(F.when((F.col("base_sales") > 0) & (F.col("sales3") < F.col("base_sales") * 0.6), F.col("rel_month"))).alias("sales_drop_lag"))
after = sp.where((F.col("rel_month") >= 1) & (F.col("rel_month") <= 6)).groupBy("unified_customer_id").agg(
    F.avg("net_sales").alias("sales_after"), (F.sum("marketing_engagements") / F.sum("marketing_touches")).alias("eng_after"))
cc = (spikes.join(baseline, "unified_customer_id").join(lags, "unified_customer_id", "left").join(after, "unified_customer_id", "left")
      .join(grid.select("unified_customer_id", "m", "tickets").withColumnRenamed("m", "event_m"), ["unified_customer_id", "event_m"])
      .join(cust, "unified_customer_id")
      .withColumn("pattern",
                  F.when(F.col("engagement_drop_lag").isNotNull() & F.col("sales_drop_lag").isNotNull()
                         & (F.col("engagement_drop_lag") <= F.col("sales_drop_lag")), "Ticket → disengage → sales decline")
                  .when(F.col("sales_drop_lag").isNotNull(), "Ticket → sales decline")
                  .when(F.col("engagement_drop_lag").isNotNull(), "Ticket → disengage")
                  .otherwise("Recovered")))
save(cc.select("unified_customer_id", "customer_type", "customer_name", "region", "account_manager",
               F.add_months(F.lit("2024-10-01").cast("date"), F.col("event_m")).alias("spike_month"),
               F.col("tickets").cast("int").alias("tickets_in_spike_month"),
               F.round(eng_before, 4).alias("engagement_before"), F.round("eng_after", 4).alias("engagement_after"),
               F.col("base_sales").cast("decimal(14,2)").alias("monthly_sales_before"),
               F.col("sales_after").cast("decimal(14,2)").alias("monthly_sales_after"),
               F.col("engagement_drop_lag").cast("int").alias("engagement_drop_lag"),
               F.col("sales_drop_lag").cast("int").alias("sales_drop_lag"), "pattern"), "gold_customer_cascade")

# %% [markdown]
# ## Which drivers predict the next 6 months of sales?
#
# Features measured as of 6 months ago (T0); outcome = sales in the 6 months after T0 vs the 6 months before.

# %%
t0 = F.date_sub(as_of, 182)
win = lambda c, a, b: (F.col(c) > F.date_sub(t0, a)) & (F.col(c) <= F.date_sub(t0, b))
o6 = orders.groupBy("unified_customer_id").agg(
    F.sum(F.when((F.col("order_date") > t0) & (F.col("order_date") <= as_of), F.col("net_sales")).otherwise(0)).alias("after"),
    F.sum(F.when(win("order_date", 182, 0), F.col("net_sales")).otherwise(0)).alias("before"),
    F.max(F.when(F.col("order_date") <= t0, F.col("order_date"))).alias("last_before"))
t6 = tickets.withColumn("d", F.to_date("created_at")).groupBy("unified_customer_id").agg(
    F.sum(F.when(win("d", 182, 0), 1).otherwise(0)).alias("tickets_6m"),
    F.sum(F.when(win("d", 182, 0) & F.col("priority").isin("high", "urgent"), 1).otherwise(0)).alias("high_priority_6m"),
    F.sum(F.when(win("d", 182, 0) & (F.col("satisfaction_rating") == "bad"), 1).otherwise(0)).alias("bad_csat_6m"))
r6 = returns.groupBy("unified_customer_id").agg(F.sum(F.when(win("return_date", 182, 0), F.col("refund_amount")).otherwise(0)).alias("ret"))
lines6 = lines.groupBy("unified_customer_id").agg(F.countDistinct(F.when(win("order_date", 365, 0), F.col("product_line"))).alias("lines_12m"))
g = monthly.withColumn("d", F.col("month"))
e6 = g.groupBy("unified_customer_id").agg(
    (F.sum(F.when(win("d", 91, 0), F.col("marketing_engagements")).otherwise(0))
     / F.sum(F.when(win("d", 91, 0), F.col("marketing_touches")).otherwise(0))).alias("eng_recent"),
    (F.sum(F.when(win("d", 182, 91), F.col("marketing_engagements")).otherwise(0))
     / F.sum(F.when(win("d", 182, 91), F.col("marketing_touches")).otherwise(0))).alias("eng_prior"))
feat = (cust.select("unified_customer_id", "customer_type").join(o6, "unified_customer_id")
        .where(F.col("before") > 0)
        .join(t6, "unified_customer_id", "left").join(r6, "unified_customer_id", "left")
        .join(lines6, "unified_customer_id", "left").join(e6, "unified_customer_id", "left")
        .na.fill(0, ["tickets_6m", "high_priority_6m", "bad_csat_6m", "ret", "lines_12m"])
        .withColumn("outcome", F.least(F.lit(3.0), F.col("after").cast("double") / F.col("before").cast("double") - 1))
        .withColumn("return_rate_6m", F.col("ret").cast("double") / F.col("before").cast("double"))
        .withColumn("engagement_change", F.coalesce(F.col("eng_recent"), F.lit(0.0)) - F.coalesce(F.col("eng_prior"), F.lit(0.0)))
        .withColumn("days_since_order", F.datediff(t0, "last_before").cast("double")))
DRIVERS = [("tickets_6m", "Support tickets (6 mo)"), ("high_priority_6m", "High-priority tickets (6 mo)"),
           ("bad_csat_6m", "Bad CSAT ratings (6 mo)"), ("return_rate_6m", "Return rate (6 mo)"),
           ("engagement_change", "Change in marketing engagement"), ("lines_12m", "Product lines bought (12 mo)"),
           ("days_since_order", "Days since last order")]
rows = []
for col, label in DRIVERS:
    q = feat.approxQuantile(col, [0.75], 0.01)[0] if col != "engagement_change" else None
    hi = (F.col(col) >= q) if q is not None else (F.col(col) <= -0.1)
    stats = (feat.groupBy("customer_type").agg(
        F.corr(F.col(col).cast("double"), "outcome").alias("correlation"), F.count("*").alias("n"),
        F.avg(F.when(hi, F.col("outcome"))).alias("outcome_high"), F.avg(F.when(~hi, F.col("outcome"))).alias("outcome_low"))
        .withColumn("driver", F.lit(label)).withColumn("driver_key", F.lit(col))
        .withColumn("high_definition", F.lit("top quartile" if q is not None else "engagement down 10+ pts")))
    rows.append(stats)
corr = rows[0]
for r in rows[1:]:
    corr = corr.unionByName(r)
save(corr.select("driver_key", "driver", "customer_type", F.round("correlation", 4).alias("correlation"), F.col("n").cast("int").alias("n"),
                 F.round("outcome_high", 4).alias("sales_change_when_high"), F.round("outcome_low", 4).alias("sales_change_otherwise"),
                 "high_definition"), "gold_driver_correlation")

# %% [markdown]
# ## Risk concentration

# %%
def conc(dim_col, label):
    return (metrics.groupBy("customer_type", F.coalesce(F.col(dim_col).cast("string"), F.lit("(none)")).alias("value"))
            .agg(F.count("*").alias("customers"), F.sum((F.col("churn_risk_band") == "High").cast("int")).alias("high_risk_customers"),
                 F.sum("net_sales_ttm").alias("net_sales_ttm"), F.sum("revenue_at_risk").alias("revenue_at_risk"))
            .withColumn("dimension", F.lit(label)))

by_line = (spark.table("gold_customer_product_line").where("net_sales_ttm > 0")
           .join(metrics.select("unified_customer_id", "customer_type", "churn_risk_band", "revenue_at_risk"), "unified_customer_id")
           .groupBy("customer_type", F.col("product_line").alias("value"))
           .agg(F.countDistinct("unified_customer_id").alias("customers"),
                F.countDistinct(F.when(F.col("churn_risk_band") == "High", F.col("unified_customer_id"))).alias("high_risk_customers"),
                F.sum("net_sales_ttm").alias("net_sales_ttm"),
                F.sum(F.col("revenue_at_risk") * F.col("share_of_sales_ttm")).alias("revenue_at_risk"))
           .withColumn("dimension", F.lit("Product line")))
concentration = conc("region", "Region").unionByName(conc("account_manager", "Account owner")).unionByName(conc("churn_risk_band", "Risk band")).unionByName(by_line)
w = Window.partitionBy("dimension", "customer_type")
concentration = concentration.withColumn("share_of_risk", F.col("revenue_at_risk") / F.sum("revenue_at_risk").over(w))
save(concentration.select("dimension", "value", "customer_type", F.col("customers").cast("int").alias("customers"),
                          F.col("high_risk_customers").cast("int").alias("high_risk_customers"),
                          F.col("net_sales_ttm").cast("decimal(14,2)").alias("net_sales_ttm"),
                          F.col("revenue_at_risk").cast("decimal(14,2)").alias("revenue_at_risk"),
                          F.round(F.col("share_of_risk").cast("double"), 4).alias("share_of_risk")), "gold_risk_concentration")

# %% [markdown]
# ## QA (test data): cascade patterns by planted persona

# %%
truth_ids = spark.read.option("header", True).csv("Files/_truth/identity_truth.csv").where("source_system in ('ERP','Shopify')")
personas = spark.read.option("header", True).csv("Files/_truth/customer_personas.csv").select(
    F.col("customer_key").alias("true_customer_key"), "persona")
qa = (spark.table("gold_customer_cascade")
      .join(idm.where(F.col("source_system").isin("ERP", "Shopify")).select("unified_customer_id", "source_system", "source_id"), "unified_customer_id")
      .join(truth_ids, ["source_system", "source_id"]).join(personas, "true_customer_key")
      .groupBy("customer_type", "persona", "pattern").count())
save(qa, "qa_cascade_by_persona")
display(spark.table("gold_issue_cascade").where("rel_month in (-3, 0, 3, 6)").orderBy("customer_type", "cohort", "rel_month"))
