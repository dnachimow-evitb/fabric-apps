# Customer 360 test data

Fictional, deterministic test data for the Customer 360 dashboard, shaped like the real sources
so the Fabric pipeline and app can be built before the client's data is connected. The business is a
fictional hardware and widgets maker selling wholesale (hardware stores, distributors, contractor supply)
and direct to consumers (Shopify).

```bash
python generate_testdata.py            # seed 42, 60 wholesale accounts, 3,000 DTC customers, 800 prospects
python generate_testdata.py --seed 7 --dtc 10000 --prospects 2000
```

Stdlib only (Python 3.10+). Writes CSVs to `output/` (git-ignored, ~50 MB at default size).
Everything is fictional: people and company names are made up and emails use `example.com` / `example.net`.

## Tables (`output/bronze/`)

| Source | File | Grain | Joins to |
|---|---|---|---|
| Sales (ERP) | `sales/erp_customers.csv` | wholesale account | `customer_number` |
| Sales (Shopify) | `sales/shopify_customers.csv` | DTC customer | `id` |
| Sales | `sales/products.csv` | SKU (product line, category, material, pack size, prices) | `sku` |
| Sales | `sales/sales_orders.csv` | order (`source_system` ERP or Shopify) | `customer_ref` → ERP `customer_number` / Shopify `id` |
| Sales | `sales/sales_order_lines.csv` | order line | `order_id`, `sku` |
| Returns | `returns/returns.csv` | RMA at order-line level, reason codes | `order_id` + `line_number`, `customer_ref` |
| Klaviyo | `klaviyo/profiles.csv` | profile (DTC customer, wholesale buyer contact, or prospect) | `external_id` → Shopify id / ERP number (often blank) |
| Klaviyo | `klaviyo/campaigns.csv` | campaign send (email / SMS, DTC or Wholesale) | `id` |
| Klaviyo | `klaviyo/flows.csv` | flow (Welcome, Post-Purchase, Browse Abandonment, Winback, Reorder) | `id` |
| Klaviyo | `klaviyo/metrics.csv` | metric catalog | `id` |
| Klaviyo | `klaviyo/events.csv` | event (Received/Opened/Clicked Email, SMS, Unsubscribed, Placed Order, Viewed Product) | `profile_id`, `metric_id`, `campaign_id`, `flow_id` |
| Zendesk | `zendesk/organizations.csv` | organization (one per wholesale account) | `external_id` → ERP number |
| Zendesk | `zendesk/users.csv` | end-users and agents | `organization_id`, `external_id` → Shopify id (often blank) |
| Zendesk | `zendesk/tickets.csv` | ticket (status, priority, type, channel, CSAT) | `requester_id`, `organization_id`, `custom_field_order_number` |
| Zendesk | `zendesk/ticket_metrics.csv` | ticket metrics (reply / resolution minutes, reopens) | `ticket_id` |

Klaviyo and Zendesk columns follow their API field names (flattened), so the cleaned layer can
be pointed at real exports later with minimal changes.

## Identity: the unified customer

The test data is deliberately messy, the way real source systems are, so the unified customer
dimension has to earn its matches:

| Source record | Link it carries | Mess built in |
|---|---|---|
| ERP account | `customer_number` | - |
| Shopify customer | `id`, `email` | - |
| Klaviyo profile | `external_id` (Shopify id or ERP number), `email` | ~27% have no `external_id` (form sign-ups, unlinked buyer contacts); some emails differ in case or have stray spaces; 800 are prospects who never bought |
| Zendesk organization | `external_id` (ERP number), `domain_names` | - |
| Zendesk user | `external_id` (Shopify id), `email`, `organization_id` | ~12% of consumer users are email-only guests; ~3% wrote in from a different address and cannot be matched |

Matching rules, in order: (1) shared IDs, (2) normalised email, (3) email domain to wholesale
account, (4) anything left becomes its own unresolved customer. `output/_truth/identity_truth.csv`
holds the true owner of every source record so match accuracy can be measured.

## Built-in patterns

Each customer is assigned a hidden persona (`output/_truth/customer_personas.csv`, **for validating
scores only, never load it into the dashboard**):

| Persona | What the data shows |
|---|---|
| growing | Sales +50-65% YoY, adopts new product lines, browses lines they don't buy yet (upsell signal) |
| stable | Flat sales, normal returns and service |
| declining | Sales down 40-55% in the last year, return rate up (more "Defective / does not work"), Zendesk ticket spike just before the decline with more high priority and bad CSAT, Klaviyo opens fade from ~20-33% to under 10% |
| churned | Stops ordering 7-12 months before the end; tickets and bad CSAT beforehand; engagement near zero |
| single_line | Buys from only 1-2 product lines (SKU diversification / upsell target) |
| high_returner | Return rate 2-3x normal |
| new (DTC) | First purchase partway through the window |
| prospect | Klaviyo subscriber with no purchases; occasional pre-purchase Zendesk question |

Window: 1 Oct 2024 to 28 Sep 2026. Seasonality: DTC peaks in spring DIY season, Father's Day and
Black Friday; wholesale peaks when stores stock up ahead of spring.
