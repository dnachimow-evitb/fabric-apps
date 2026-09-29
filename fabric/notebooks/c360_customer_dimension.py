# %% [markdown]
# # Customer 360: unified customer dimension
#
# Builds one omnichannel customer from four systems (ERP, Shopify, Klaviyo, Zendesk).
#
# 1. **Bronze**: load the raw CSVs from `Files/bronze/` as-is (all strings).
# 2. **Silver**: typed, cleaned tables with normalised emails.
# 3. **Identity resolution**: every source record gets a `unified_customer_id`, with the rule that matched it
#    and a confidence: shared IDs, then normalised email, then email domain (wholesale), then new customer.
# 4. **Gold**: `gold_dim_customer`, one row per real customer with source presence, consent, recency per
#    channel, the channels they are active in, and lifecycle stage.
# 5. **QA**: score the matching against `Files/_truth/identity_truth.csv` (test data only).

# %%
from pyspark.sql import functions as F, Window

AS_OF = "2026-09-28"
BRONZE = "Files/bronze"
CONFIDENCE = {"source_of_record": 1.0, "shared_id": 1.0, "zendesk_org": 0.95, "email": 0.95,
              "email_via_marketing": 0.9, "email_domain": 0.8, "new_marketing_only": 0.5, "new_support_only": 0.5,
              "new_unresolved_org": 0.5}
STATE_REGION = {**{s: "Northeast" for s in ["NY", "MA", "CT", "PA", "NJ"]}, **{s: "Southeast" for s in ["FL", "GA", "NC", "TN"]},
                **{s: "Central" for s in ["IL", "TX", "MN", "MO"]}, **{s: "West" for s in ["CA", "AZ", "WA", "CO"]}}


def blank(c):
    """Empty string -> null."""
    c = F.col(c) if isinstance(c, str) else c
    return F.when(F.trim(c) == "", None).otherwise(c)


def norm_email(c):
    return F.lower(F.trim(F.col(c) if isinstance(c, str) else c))


def email_domain(c):
    return blank(F.regexp_extract(norm_email(c), "@(.+)$", 1))


def save(df, name):
    df.write.mode("overwrite").option("overwriteSchema", "true").format("delta").saveAsTable(name)
    print(f"{name}: {spark.table(name).count():,} rows")

# %% [markdown]
# ## 1. Bronze

# %%
SOURCES = {
    "sales": ["erp_customers", "shopify_customers", "products", "sales_orders", "sales_order_lines"],
    "returns": ["returns"],
    "klaviyo": ["profiles", "campaigns", "flows", "metrics", "events"],
    "zendesk": ["organizations", "users", "tickets", "ticket_metrics"],
}
for src, names in SOURCES.items():
    for n in names:
        df = (spark.read.option("header", True).option("multiLine", True).option("escape", '"')
              .csv(f"{BRONZE}/{src}/{n}.csv"))
        save(df, f"bronze_{n}" if n.startswith(src) else f"bronze_{src}_{n}")

# %% [markdown]
# ## 2. Silver

# %%
region_map = F.create_map(*[F.lit(x) for kv in STATE_REGION.items() for x in kv])

save(spark.table("bronze_sales_erp_customers").select(
    F.col("customer_number").alias("erp_customer_number"), "account_name", "region", "city", "state", "account_manager",
    F.to_date("customer_since").alias("customer_since"), F.col("location_count").cast("int").alias("location_count"),
    "payment_terms", "account_status", norm_email("primary_contact_email").alias("primary_email"),
).withColumn("email_domain", email_domain("primary_email")), "silver_erp_customers")

save(spark.table("bronze_sales_shopify_customers").select(
    F.col("id").alias("shopify_customer_id"), norm_email("email").alias("email"), "first_name", "last_name",
    F.to_timestamp("created_at").alias("created_at"), "city", F.col("province_code").alias("state"),
    region_map[F.col("province_code")].alias("region"), blank("tags").alias("tags"),
), "silver_shopify_customers")

save(spark.table("bronze_sales_products").select(
    "sku", "model_number", "product_name", "product_line", "category", "material", "pack_size",
    F.col("retail_price").cast("decimal(12,2)").alias("retail_price"),
    F.col("wholesale_price").cast("decimal(12,2)").alias("wholesale_price"), F.to_date("launch_date").alias("launch_date"),
), "silver_products")

save(spark.table("bronze_sales_orders").select(
    "order_id", "source_system", "customer_ref", "channel", F.to_date("order_date").alias("order_date"), "order_status",
    F.col("subtotal").cast("decimal(14,2)").alias("net_sales"), F.col("tax").cast("decimal(14,2)").alias("tax"),
    F.col("total").cast("decimal(14,2)").alias("total"), blank("discount_code").alias("discount_code"),
    "ship_city", "ship_state", blank("sales_rep").alias("sales_rep"),
), "silver_orders")

save(spark.table("bronze_sales_order_lines").alias("l")
     .join(spark.table("silver_products").select("sku", "product_line", "category"), "sku", "left")
     .select("order_id", F.col("line_number").cast("int").alias("line_number"), "sku", "product_line", "category",
             F.col("quantity").cast("int").alias("quantity"), F.col("unit_price").cast("decimal(12,2)").alias("unit_price"),
             F.col("line_discount").cast("decimal(12,2)").alias("line_discount"),
             F.col("net_amount").cast("decimal(14,2)").alias("net_amount")), "silver_order_lines")

save(spark.table("bronze_returns").select(
    "rma_id", "order_id", F.col("line_number").cast("int").alias("line_number"), "sku", "customer_ref", "source_system",
    F.to_date("return_date").alias("return_date"), F.col("quantity").cast("int").alias("quantity"), "reason_code", "reason",
    F.col("refund_amount").cast("decimal(14,2)").alias("refund_amount"), "item_condition", "status",
), "silver_returns")

save(spark.table("bronze_klaviyo_profiles").select(
    F.col("id").alias("profile_id"), norm_email("email").alias("email"), blank("phone_number").alias("phone_number"),
    blank("external_id").alias("external_id"), "first_name", "last_name", blank("organization").alias("organization"),
    blank("title").alias("title"), F.col("location_city").alias("city"), F.col("location_region").alias("state"),
    F.to_timestamp("created").alias("created_at"), "email_consent", "sms_consent", "properties",
), "silver_klaviyo_profiles")

save(spark.table("bronze_klaviyo_events").alias("e")
     .join(spark.table("bronze_klaviyo_metrics").select(F.col("id").alias("metric_id"), F.col("name").alias("metric_name")),
           "metric_id", "left")
     .select(F.col("id").alias("event_id"), "profile_id", "metric_id", "metric_name",
             F.to_timestamp("datetime").alias("event_at"), blank("campaign_id").alias("campaign_id"),
             blank("flow_id").alias("flow_id"), F.col("value").cast("decimal(14,2)").alias("value"), "properties"),
     "silver_klaviyo_events")

save(spark.table("bronze_klaviyo_campaigns").select(
    F.col("id").alias("campaign_id"), "name", "channel", "audience", "segment", F.to_timestamp("send_time").alias("send_time"),
    blank("subject").alias("subject")), "silver_klaviyo_campaigns")

save(spark.table("bronze_zendesk_organizations").select(
    F.col("id").alias("organization_id"), "name", blank("external_id").alias("external_id"),
    F.lower(F.trim("domain_names")).alias("domain"), "tags", "group_name", F.to_timestamp("created_at").alias("created_at"),
), "silver_zendesk_organizations")

save(spark.table("bronze_zendesk_users").select(
    F.col("id").alias("user_id"), "name", norm_email("email").alias("email"), "role",
    blank("organization_id").alias("organization_id"), blank("external_id").alias("external_id"),
    F.to_timestamp("created_at").alias("created_at"), "tags",
), "silver_zendesk_users")

save(spark.table("bronze_zendesk_tickets").alias("t")
     .join(spark.table("bronze_zendesk_ticket_metrics").alias("m"), F.col("t.id") == F.col("m.ticket_id"), "left")
     .select(F.col("t.id").alias("ticket_id"), F.to_timestamp("t.created_at").alias("created_at"),
             F.to_timestamp(blank("m.solved_at")).alias("solved_at"), "subject", "status", "priority", "type",
             "via_channel", "requester_id", blank("t.organization_id").alias("organization_id"), "group_name", "tags",
             blank("custom_field_order_number").alias("order_number"), "satisfaction_rating",
             F.col("m.reply_time_in_minutes").cast("int").alias("first_reply_minutes"),
             F.col("m.full_resolution_time_in_minutes").cast("int").alias("resolution_minutes"),
             F.col("m.reopens").cast("int").alias("reopens")), "silver_zendesk_tickets")

# %% [markdown]
# ## 3. Identity resolution
#
# Anchors are the systems of record: an **ERP account** (wholesale) or a **Shopify customer** (direct).
# Klaviyo and Zendesk records attach to an anchor by the first rule that matches; records that match
# nothing become their own customer, keyed by email so a marketing-only prospect and their Zendesk
# question still land on the same person.

# %%
erp = spark.table("silver_erp_customers")
shop = spark.table("silver_shopify_customers")
kp = spark.table("silver_klaviyo_profiles")
zo = spark.table("silver_zendesk_organizations")
zu = spark.table("silver_zendesk_users").where("role = 'end-user'")

erp_id = erp.select(F.col("erp_customer_number").alias("x_erp"))
erp_dom = (erp.select(F.col("email_domain").alias("x_dom"), F.col("erp_customer_number").alias("dom_erp"))
           .dropDuplicates(["x_dom"]))
shop_id = shop.select(F.col("shopify_customer_id").alias("x_sid"))
shop_em = shop.select(F.col("email").alias("x_em"), F.col("shopify_customer_id").alias("em_sid")).dropDuplicates(["x_em"])


def record(source, id_col, email_col, rules):
    """rules: ordered list of (condition, anchor expression, rule name)."""
    anchor, rule = None, None
    for cond, a, r in rules:
        anchor = F.when(cond, a) if anchor is None else anchor.when(cond, a)
        rule = F.when(cond, F.lit(r)) if rule is None else rule.when(cond, F.lit(r))
    return [F.lit(source).alias("source_system"), F.col(id_col).cast("string").alias("source_id"),
            (F.col(email_col) if email_col else F.lit(None).cast("string")).alias("source_email"),
            anchor.alias("anchor_key"), rule.alias("match_rule")]


erp_map = erp.select(*record("ERP", "erp_customer_number", "primary_email",
                             [(F.lit(True), F.concat(F.lit("ERP:"), "erp_customer_number"), "source_of_record")]))
shop_map = shop.select(*record("Shopify", "shopify_customer_id", "email",
                               [(F.lit(True), F.concat(F.lit("SHOP:"), "shopify_customer_id"), "source_of_record")]))

k = (kp.join(erp_id, kp.external_id == erp_id.x_erp, "left")
       .join(shop_id, kp.external_id == shop_id.x_sid, "left")
       .join(shop_em, kp.email == shop_em.x_em, "left")
       .join(erp_dom, email_domain(kp.email) == erp_dom.x_dom, "left"))
klaviyo_map = k.select(*record("Klaviyo", "profile_id", "email", [
    (F.col("x_erp").isNotNull(), F.concat(F.lit("ERP:"), "x_erp"), "shared_id"),
    (F.col("x_sid").isNotNull(), F.concat(F.lit("SHOP:"), "x_sid"), "shared_id"),
    (F.col("em_sid").isNotNull(), F.concat(F.lit("SHOP:"), "em_sid"), "email"),
    (F.col("dom_erp").isNotNull(), F.concat(F.lit("ERP:"), "dom_erp"), "email_domain"),
    (F.lit(True), F.concat(F.lit("EMAIL:"), "email"), "new_marketing_only"),
]))

o = zo.join(erp_id, zo.external_id == erp_id.x_erp, "left").join(erp_dom, zo.domain == erp_dom.x_dom, "left")
org_map = o.select(*record("Zendesk Organization", "organization_id", None, [
    (F.col("x_erp").isNotNull(), F.concat(F.lit("ERP:"), "x_erp"), "shared_id"),
    (F.col("dom_erp").isNotNull(), F.concat(F.lit("ERP:"), "dom_erp"), "email_domain"),
    (F.lit(True), F.concat(F.lit("ZDORG:"), "organization_id"), "new_unresolved_org"),
]))

org_anchor = org_map.select(F.col("source_id").alias("x_org"), F.col("anchor_key").alias("org_anchor"))
kl_email = klaviyo_map.select(F.col("source_email").alias("x_kem"), F.col("anchor_key").alias("kl_anchor")) \
    .dropDuplicates(["x_kem"])
u = (zu.join(org_anchor, zu.organization_id == org_anchor.x_org, "left")
       .join(shop_id, zu.external_id == shop_id.x_sid, "left")
       .join(shop_em, zu.email == shop_em.x_em, "left")
       .join(kl_email, zu.email == kl_email.x_kem, "left")
       .join(erp_dom, email_domain(zu.email) == erp_dom.x_dom, "left"))
user_map = u.select(*record("Zendesk User", "user_id", "email", [
    (F.col("org_anchor").isNotNull(), F.col("org_anchor"), "zendesk_org"),
    (F.col("x_sid").isNotNull(), F.concat(F.lit("SHOP:"), "x_sid"), "shared_id"),
    (F.col("em_sid").isNotNull(), F.concat(F.lit("SHOP:"), "em_sid"), "email"),
    (F.col("kl_anchor").isNotNull(), F.col("kl_anchor"), "email_via_marketing"),
    (F.col("dom_erp").isNotNull(), F.concat(F.lit("ERP:"), "dom_erp"), "email_domain"),
    (F.lit(True), F.concat(F.lit("EMAIL:"), "email"), "new_support_only"),
]))

conf = F.create_map(*[F.lit(x) for kv in CONFIDENCE.items() for x in kv])
identity = (erp_map.unionByName(shop_map).unionByName(klaviyo_map).unionByName(org_map).unionByName(user_map)
            .withColumn("unified_customer_id",
                        F.concat(F.lit("CUS-"), F.upper(F.substring(F.sha2("anchor_key", 256), 1, 10))))
            .withColumn("match_confidence", conf[F.col("match_rule")])
            .select("unified_customer_id", "source_system", "source_id", "source_email", "match_rule",
                    "match_confidence", "anchor_key"))
save(identity, "silver_customer_identity_map")
display(spark.table("silver_customer_identity_map").groupBy("source_system", "match_rule").count()
        .orderBy("source_system", F.desc("count")))

# %% [markdown]
# ## 4. Gold: `gold_dim_customer`

# %%
idm = spark.table("silver_customer_identity_map")
as_of = F.to_date(F.lit(AS_OF))
last_12m = F.date_sub(as_of, 365)


def by_source(system):
    return idm.where(F.col("source_system") == system).select("unified_customer_id", F.col("source_id").alias("sid"))


# which systems each customer appears in
presence = idm.groupBy("unified_customer_id", "anchor_key").agg(
    *[F.max(F.when(F.col("source_system") == s, 1).otherwise(0)).cast("boolean").alias(f"in_{a}")
      for s, a in [("ERP", "erp"), ("Shopify", "shopify"), ("Klaviyo", "klaviyo")]],
    F.max(F.when(F.col("source_system").startswith("Zendesk"), 1).otherwise(0)).cast("boolean").alias("in_zendesk"),
    F.sum(F.when(F.col("source_system") == "Klaviyo", 1).otherwise(0)).cast("int").alias("klaviyo_profile_count"),
    F.sum(F.when(F.col("source_system") == "Zendesk User", 1).otherwise(0)).cast("int").alias("zendesk_user_count"),
    F.count("*").cast("int").alias("linked_source_records"),
    F.min("match_confidence").alias("identity_confidence"),
    F.first(F.when(F.col("source_system") == "Zendesk Organization", F.col("source_id")), True).alias("zendesk_organization_id"),
)

# descriptive attributes: systems of record first, then Klaviyo, then Zendesk
erp_attr = erp.select(F.concat(F.lit("ERP:"), "erp_customer_number").alias("anchor_key"),
                      F.col("erp_customer_number"), F.col("account_name").alias("erp_name"),
                      F.col("primary_email").alias("erp_email"), F.col("city").alias("erp_city"),
                      F.col("state").alias("erp_state"), F.col("region").alias("erp_region"), "account_manager",
                      "location_count", "payment_terms", F.col("customer_since").alias("erp_since"))
shop_attr = shop.select(F.concat(F.lit("SHOP:"), "shopify_customer_id").alias("anchor_key"), "shopify_customer_id",
                        F.concat_ws(" ", "first_name", "last_name").alias("shop_name"), F.col("email").alias("shop_email"),
                        F.col("city").alias("shop_city"), F.col("state").alias("shop_state"),
                        F.col("region").alias("shop_region"), F.to_date("created_at").alias("shop_since"),
                        F.coalesce(F.col("tags"), F.lit("")).contains("Pro").alias("is_pro_member"))
kl_attr = (kp.join(by_source("Klaviyo"), kp.profile_id == F.col("sid"))
           .groupBy("unified_customer_id").agg(
               F.first(F.concat_ws(" ", "first_name", "last_name"), True).alias("kl_name"),
               F.first("email", True).alias("kl_email"), F.first("city", True).alias("kl_city"),
               F.first("state", True).alias("kl_state"), F.min(F.to_date("created_at")).alias("kl_since"),
               F.max((F.col("email_consent") == "SUBSCRIBED").cast("int")).cast("boolean").alias("email_marketing_consent"),
               F.max((F.col("sms_consent") == "SUBSCRIBED").cast("int")).cast("boolean").alias("sms_marketing_consent")))
zd_attr = (zu.join(by_source("Zendesk User"), zu.user_id == F.col("sid"))
           .groupBy("unified_customer_id").agg(F.first("name", True).alias("zd_name"), F.first("email", True).alias("zd_email"),
                                               F.min(F.to_date("created_at")).alias("zd_since")))

# activity by channel
order_keys = idm.where(F.col("source_system").isin("ERP", "Shopify")).select(
    "unified_customer_id", F.col("source_system").alias("key_system"), F.col("source_id").alias("key_id"))
orders = (spark.table("silver_orders")
          .join(order_keys, (F.col("customer_ref") == F.col("key_id")) & (F.col("source_system") == F.col("key_system")))
          .groupBy("unified_customer_id").agg(
              F.min("order_date").alias("first_order_date"), F.max("order_date").alias("last_order_date"),
              F.countDistinct("order_id").cast("int").alias("lifetime_orders"),
              F.sum(F.when(F.col("order_date") > last_12m, 1).otherwise(0)).cast("int").alias("orders_12m")))
ev = spark.table("silver_klaviyo_events").join(by_source("Klaviyo"), F.col("profile_id") == F.col("sid"))
marketing = ev.groupBy("unified_customer_id").agg(
    F.max(F.when(F.col("metric_name").isin("Opened Email", "Clicked Email"), F.col("event_at"))).alias("last_email_engagement_at"),
    F.max(F.when(F.col("metric_name") == "Clicked SMS", F.col("event_at"))).alias("last_sms_click_at"),
    F.max(F.when(F.col("metric_name").isin("Viewed Product", "Active on Site"), F.col("event_at"))).alias("last_web_activity_at"))
support = (spark.table("silver_zendesk_tickets").join(by_source("Zendesk User"), F.col("requester_id") == F.col("sid"))
           .groupBy("unified_customer_id").agg(
               F.max("created_at").alias("last_support_contact_at"),
               F.sum(F.when(F.col("created_at") > last_12m, 1).otherwise(0)).cast("int").alias("tickets_12m"),
               F.sum(F.when(F.col("status").isin("new", "open", "pending", "hold"), 1).otherwise(0)).cast("int").alias("open_tickets")))

d = (presence.join(erp_attr, "anchor_key", "left").join(shop_attr, "anchor_key", "left")
     .join(kl_attr, "unified_customer_id", "left").join(zd_attr, "unified_customer_id", "left")
     .join(orders, "unified_customer_id", "left").join(marketing, "unified_customer_id", "left")
     .join(support, "unified_customer_id", "left"))


def recent(col):
    return F.col(col).isNotNull() & (F.to_date(col) > last_12m)


prefix = F.split("anchor_key", ":")[0]
customer_type = (F.when(prefix == "ERP", "Wholesale").when(prefix == "SHOP", "Direct")
                 .when(F.col("in_klaviyo"), "Prospect").otherwise("Unresolved"))
days_since_order = F.datediff(as_of, "last_order_date")
wholesale = customer_type == "Wholesale"
lifecycle = (F.when(F.col("last_order_date").isNull(),
                    F.when(customer_type == "Prospect", "Prospect")
                     .when(customer_type == "Unresolved", "Support Only")
                     .otherwise("Lapsed"))          # a customer of record with no orders in the data window
             .when(F.col("first_order_date") > F.date_sub(as_of, 90), "New")
             .when(days_since_order <= F.when(wholesale, 90).otherwise(180), "Active")
             .when(days_since_order <= F.when(wholesale, 180).otherwise(365), "At Risk")
             .otherwise("Lapsed"))
channels = [("Commerce", F.coalesce(F.col("orders_12m"), F.lit(0)) > 0), ("Email", recent("last_email_engagement_at")),
            ("SMS", recent("last_sms_click_at")), ("Web", recent("last_web_activity_at")),
            ("Support", F.coalesce(F.col("tickets_12m"), F.lit(0)) > 0)]

dim = d.select(
    "unified_customer_id",
    customer_type.alias("customer_type"),
    F.coalesce("erp_name", "shop_name", "kl_name", "zd_name").alias("customer_name"),
    F.coalesce("erp_email", "shop_email", "kl_email", "zd_email").alias("primary_email"),
    F.coalesce("erp_city", "shop_city", "kl_city").alias("city"),
    F.coalesce("erp_state", "shop_state", "kl_state").alias("state"),
    F.coalesce("erp_region", "shop_region", region_map[F.col("kl_state")]).alias("region"),
    "account_manager", "location_count", "payment_terms", F.coalesce("is_pro_member", F.lit(False)).alias("is_pro_member"),
    F.least("erp_since", "shop_since", "kl_since", "zd_since").alias("customer_since"),
    # source presence
    "in_erp", "in_shopify", "in_klaviyo", "in_zendesk",
    (F.col("in_erp").cast("int") + F.col("in_shopify").cast("int") + F.col("in_klaviyo").cast("int")
     + F.col("in_zendesk").cast("int")).alias("source_system_count"),
    "erp_customer_number", "shopify_customer_id", "zendesk_organization_id", "klaviyo_profile_count",
    "zendesk_user_count", "linked_source_records", "identity_confidence",
    # consent
    F.coalesce("email_marketing_consent", F.lit(False)).alias("email_marketing_consent"),
    F.coalesce("sms_marketing_consent", F.lit(False)).alias("sms_marketing_consent"),
    # recency per channel
    "first_order_date", "last_order_date", "lifetime_orders", "orders_12m", "last_email_engagement_at",
    "last_sms_click_at", "last_web_activity_at", "last_support_contact_at", "tickets_12m", "open_tickets",
    # omnichannel
    F.concat_ws(" + ", *[F.when(cond, F.lit(name)) for name, cond in channels]).alias("active_channels_12m"),
    sum(F.when(cond, 1).otherwise(0) for _, cond in channels).alias("active_channel_count_12m"),
    lifecycle.alias("lifecycle_stage"),
    as_of.alias("as_of_date"),
).withColumn("active_channels_12m", blank("active_channels_12m"))

save(dim, "gold_dim_customer")
display(spark.table("gold_dim_customer").groupBy("customer_type", "lifecycle_stage").count()
        .orderBy("customer_type", "lifecycle_stage"))

# %% [markdown]
# ## 5. QA: identity resolution vs. ground truth (test data only)
#
# **Precision**: share of source records that landed on a customer whose other records belong to the same
# real person. **Fragmentation**: share of real people split across more than one unified customer.

# %%
truth = spark.read.option("header", True).csv("Files/_truth/identity_truth.csv")
j = idm.join(truth, ["source_system", "source_id"], "inner")
dominant = (j.groupBy("unified_customer_id", "true_customer_key").count()
            .withColumn("rn", F.row_number().over(Window.partitionBy("unified_customer_id").orderBy(F.desc("count"))))
            .where("rn = 1").select("unified_customer_id", F.col("true_customer_key").alias("dominant_key")))
scored = j.join(dominant, "unified_customer_id").withColumn("correct", F.col("true_customer_key") == F.col("dominant_key"))
frag = (j.groupBy("true_customer_key").agg(F.countDistinct("unified_customer_id").alias("n"))
        .agg(F.avg((F.col("n") > 1).cast("int")).alias("fragmented_share")).first()[0])

qa = (scored.groupBy("source_system", "match_rule")
      .agg(F.count("*").alias("records"), F.round(F.avg(F.col("correct").cast("int")), 4).alias("precision"))
      .withColumn("overall_precision", F.lit(round(scored.agg(F.avg(F.col("correct").cast("int"))).first()[0], 4)))
      .withColumn("people_fragmented_share", F.lit(round(frag, 4)))
      .withColumn("unmatched_truth_records", F.lit(truth.count() - j.count())))
save(qa, "qa_identity_resolution")
display(spark.table("qa_identity_resolution").orderBy("source_system", F.desc("records")))
