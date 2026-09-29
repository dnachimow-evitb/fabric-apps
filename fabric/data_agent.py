"""
Create or update the "Customer 360 Q&A" Fabric data agent over the lakehouse gold tables, draft and published.

    python data_agent.py            # create or update, then print the MCP endpoint the app calls

Uses your Azure CLI sign-in (see deploy.py). Definition format:
https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/data-agent-definition
"""
import base64
import json
import uuid

from deploy import CFG, FABRIC, LH, WS, call, find_item, wait_operation

NAME = "Customer 360 Q&A"
SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition"
TABLES = {
    "gold_dim_customer": "One row per unified customer across ERP, Shopify, Klaviyo and Zendesk: type, name, region, owner, source presence, consent, lifecycle stage, active channels.",
    "gold_customer_metrics": "One row per Wholesale/Direct customer: last-12-month (TTM) sales, prior-year sales, YoY, returns, product lines bought, tickets, engagement, churn_risk_score (0-100) with band and drivers, upsell score/value, revenue_at_risk, next_best_action.",
    "gold_customer_monthly": "Customer x month facts: net sales, orders, returns, Klaviyo touches/engagements, Zendesk tickets, plus customer_type/region/account_manager for filtering.",
    "gold_customer_product_line": "Customer x product line: TTM sales, share of sales, purchased flag, product views (90d), peer penetration.",
    "gold_customer_upsell": "Top 3 product-line upsell recommendations per customer with estimated annual value and reason.",
    "gold_product_line_penetration": "Share of active customers (by type) who bought each product line.",
    "gold_sku_performance": "SKU x customer type: TTM and prior sales, units, buyers, returns, defect returns, linked support tickets, return rate, YoY, repeat buyer rate.",
    "gold_customer_sku": "Customer x SKU over 24 months: TTM and prior sales, units, returns, last purchase.",
    "gold_sku_affinity": "SKU pairs frequently bought by the same customers (confidence, lift).",
    "gold_customer_sku_recs": "Top 5 recommended SKUs per customer with estimated annual value.",
    "gold_issue_cascade": "Event study: sales index and marketing engagement by month relative to a support spike, for spiking customers vs. customers with no tickets.",
    "gold_customer_cascade": "Customers with a support spike: engagement and sales before/after, months until disengagement / sales decline, and the pattern.",
    "gold_driver_correlation": "Correlation of each risk driver (measured 6 months ago) with the sales change since.",
    "gold_risk_concentration": "Revenue at risk by region, account owner, product line and risk band.",
}
INSTRUCTIONS = """You answer questions about Contoso Hardware's customers (a fictional hardware & widgets maker; this is test data).
Customers are unified across ERP (wholesale accounts), Shopify (direct consumers), Klaviyo (marketing) and Zendesk (support).
- customer_type is 'Wholesale' (B2B retailers/distributors), 'Direct' (B2C), 'Prospect' (marketing-only) or 'Unresolved' (support-only).
- Data is as of 2026-09-28. "TTM" / "last 12 months" columns end on that date; "prior" means the 12 months before.
- churn_risk_score is 0-100 (High >= 60, Medium 35-59, Low < 35); churn_drivers is JSON listing the points behind the score.
- revenue_at_risk = net_sales_ttm x churn_risk_score / 100. upsell_value_est is estimated incremental annual sales.
- Product lines: Fasteners, Hand Tools, Power Tools, Widgets, Smart Widgets, Plumbing, Electrical, Storage & Organization, Safety Gear.
Use only the gold_* tables. Prefer gold_customer_metrics for customer-level questions and join to gold_dim_customer on unified_customer_id for identity details.
Show money as dollars with no decimals, percentages with one decimal, and name customers by customer_name. Keep answers short and say which table you used."""
FEWSHOTS = [
    ("Which wholesale accounts have the most revenue at risk?",
     "SELECT TOP 10 customer_name, net_sales_ttm, churn_risk_score, top_churn_driver, revenue_at_risk FROM gold_customer_metrics WHERE customer_type = 'Wholesale' ORDER BY revenue_at_risk DESC"),
    ("What share of active direct customers buy from only one product line?",
     "SELECT CAST(SUM(CASE WHEN product_lines_ttm = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) AS share_single_line FROM gold_customer_metrics WHERE customer_type = 'Direct' AND orders_ttm > 0"),
    ("Which SKUs have the highest return rate?",
     "SELECT TOP 10 sku, product_name, SUM(returns_ttm) / NULLIF(SUM(net_sales_ttm), 0) AS return_rate, SUM(net_sales_ttm) AS sales FROM gold_sku_performance GROUP BY sku, product_name HAVING SUM(net_sales_ttm) > 1000 ORDER BY return_rate DESC"),
    ("How many customers had a support spike followed by disengagement and a sales decline, by region?",
     "SELECT region, COUNT(*) AS customers FROM gold_customer_cascade WHERE pattern = 'Ticket → disengage → sales decline' GROUP BY region ORDER BY customers DESC"),
    ("What are the biggest upsell opportunities for K. Osei's accounts?",
     "SELECT TOP 10 customer_name, top_upsell_product_line, upsell_value_est, churn_risk_score FROM gold_customer_metrics WHERE account_manager = 'K. Osei' ORDER BY upsell_value_est DESC"),
]


def b64(obj) -> str:
    return base64.b64encode(json.dumps(obj, ensure_ascii=False, indent=2).encode()).decode()


def definition():
    ds = {
        "$schema": "1.0.0", "artifactId": LH, "workspaceId": WS, "displayName": CFG["lakehouse_name"], "type": "lakehouse_tables",
        "userDescription": "Customer 360 gold tables (unified customers, metrics, SKU and risk analytics).",
        "dataSourceInstructions": "Only the gold_* tables are curated for questions; ignore bronze_, silver_ and qa_ tables.",
        "elements": [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, "dbo")), "display_name": "dbo", "type": "lakehouse_tables.schema", "is_selected": True,
                      "children": [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, t)), "display_name": t, "type": "lakehouse_tables.table",
                                    "is_selected": True, "description": d} for t, d in TABLES.items()]}],
    }
    shots = {"$schema": "1.0.0", "fewShots": [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, q)), "question": q, "query": s} for q, s in FEWSHOTS]}
    stage = {"$schema": "1.0.0", "aiInstructions": INSTRUCTIONS}
    folder = f"lakehouse_tables-{CFG['lakehouse_name']}"
    parts = [("Files/Config/data_agent.json", {"$schema": "2.1.0"}),
             ("Files/Config/publish_info.json", {"$schema": "1.0.0", "description": "Customer 360 Q&A over the gold tables"})]
    for stg in ("draft", "published"):
        parts += [(f"Files/Config/{stg}/stage_config.json", stage),
                  (f"Files/Config/{stg}/{folder}/datasource.json", ds),
                  (f"Files/Config/{stg}/{folder}/fewshots.json", shots)]
    return {"parts": [{"path": p, "payload": b64(o), "payloadType": "InlineBase64"} for p, o in parts]}


if __name__ == "__main__":
    item = find_item(NAME, "DataAgent")
    if item:
        _, h, _ = call("POST", f"{FABRIC}/workspaces/{WS}/items/{item}/updateDefinition", {"definition": definition()})
        wait_operation(h, "update")
        print(f"Updated data agent {NAME} ({item})")
    else:
        _, h, body = call("POST", f"{FABRIC}/workspaces/{WS}/items",
                          {"displayName": NAME, "type": "DataAgent", "description": "Ad-hoc questions over the Customer 360 gold tables",
                           "definition": definition()})
        wait_operation(h, "create")
        item = find_item(NAME, "DataAgent")
        print(f"Created data agent {NAME} ({item})")
    print(f"MCP endpoint: https://api.fabric.microsoft.com/v1/mcp/workspaces/{WS}/dataagents/{item}/agent")
