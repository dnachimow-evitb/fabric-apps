# %% [markdown]
# # Customer 360: summary export
# Writes small CSV summaries of the unified customer build to `Files/_reports/` for review outside Fabric.

# %%
from pyspark.sql import functions as F

OUT = "Files/_reports"


def export(df, name):
    df.coalesce(1).write.mode("overwrite").option("header", True).csv(f"{OUT}/{name}")


export(spark.table("qa_identity_resolution").orderBy("source_system", F.desc("records")), "qa_identity_resolution")
export(spark.table("silver_customer_identity_map").groupBy("source_system", "match_rule").count()
       .orderBy("source_system", F.desc("count")), "identity_rules")
dim = spark.table("gold_dim_customer")
export(dim.groupBy("customer_type", "lifecycle_stage").count().orderBy("customer_type", "lifecycle_stage"), "dim_type_lifecycle")
export(dim.groupBy("customer_type", "active_channels_12m").count().orderBy("customer_type", F.desc("count")), "dim_channel_mix")
export(dim.groupBy("customer_type").agg(
    F.count("*").alias("customers"), F.avg("source_system_count").alias("avg_source_systems"),
    F.avg("active_channel_count_12m").alias("avg_active_channels"), F.avg("identity_confidence").alias("avg_identity_confidence"),
    F.avg(F.col("email_marketing_consent").cast("int")).alias("email_consent_rate")), "dim_summary")
export(dim.where("customer_type = 'Wholesale'").orderBy("customer_name").limit(5), "dim_sample_wholesale")
if spark.catalog.tableExists("qa_score_validation"):
    export(spark.table("qa_score_validation").orderBy("customer_type", F.desc("avg_churn_risk")), "qa_score_validation")
    met = spark.table("gold_customer_metrics")
    export(met.groupBy("customer_type").agg(
        F.count("*").alias("customers"), F.sum("net_sales_ttm").alias("net_sales_ttm"), F.sum("net_sales_prior_ttm").alias("prior"),
        F.sum("returns_ttm").alias("returns_ttm"), F.sum("revenue_at_risk").alias("revenue_at_risk"),
        F.sum("upsell_value_est").alias("upsell_value"), F.avg("product_lines_ttm").alias("avg_lines"),
        F.sum((F.col("churn_risk_band") == "High").cast("int")).alias("high_risk")), "metrics_summary")
    export(met.orderBy(F.desc("priority_score")).limit(10).select(
        "customer_name", "customer_type", "net_sales_ttm", "sales_yoy", "churn_risk_score", "top_churn_driver",
        "upsell_score", "top_upsell_product_line", "next_best_action", "churn_drivers"), "metrics_top_priority")
export(dim.where("customer_type = 'Direct' and source_system_count = 3").limit(5), "dim_sample_direct")
