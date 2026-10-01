# Customer 360 on Fabric: project notes for Claude

Contoso Hardware (fictional hardware & widgets maker) Customer 360: test data → Fabric lakehouse →
unified customer + scores → Rayfin Fabric app. Everything uses **fictional test data** in the
user's demo tenant (dsdemo.net), not client data.

## Layout
- `data/testdata/`: deterministic test-data generator (`generate_testdata.py`, stdlib only). Output git-ignored.
- `fabric/`: `deploy.py` (upload / deploy notebook / run / download reports, via Azure CLI sign-in),
  `config.json` (workspace + lakehouse IDs), `data_agent.py`, `notebooks/*.py` (`# %%` cells → ipynb on deploy).
  Pipeline order: `c360_customer_dimension` → `c360_customer_metrics` → `c360_sku_risk` → `c360_summary_export`,
  run via `c360_runner` (set `START_AT`; it writes full errors to `Files/_reports/pipeline_status/status.txt`).
- `customer-360/`: Rayfin app (React/Vite). Read its `AGENTS.md` first. Views in `packages/frontend/src/views/`,
  data layer `src/lib/c360.ts`, merge entity `packages/data/src/MergeProposal.ts` (stewards in `stewards.ts`).
  Pages: Portfolio, Playbook, Risk, Customer 360, Identity, Reports (nav in `App.tsx`). Frontend `src/` paths:
  - **Dependent slicers**: `lib/filter-options.ts` (each slicer lists only values present under the others; a change
    drops selections it made impossible). Options come from the unfiltered `metrics:all` query in `App.tsx`.
  - **Data lineage** panel at the bottom of Portfolio (`views/DataLineage.tsx`): tabs Visuals / Pipeline / Tables / Scores.
    Per-visual records (tables, dimensions, measures, equivalent SQL for the live filters, encoding) are hand-written
    in `lib/visual-lineage.ts`; **update them when a query in `c360.ts` or a visual changes**. `components/LineageLink.tsx`
    is the "Lineage" button on every visual (via `lib/lineage-context.ts`).
  - **Growth Playbook** (`views/PlaybookView.tsx`, engine `lib/playbook.ts`): next best action → commercial play
    (service credit, loyalty rebate/coupon, returns fix, cross-sell bundle, win-back); offers funded by return on spend
    within an incentive budget. Keep/win/returns rates are planning assumptions shown on the page. The user rejected an
    hours/capacity framing: this is an eCommerce + wholesale tools business, so talk budget, offers and business drivers.
  - **Reports** (`views/ReportsView.tsx`): POC. Pick product lines + PDF or PowerPoint; one page/slide per line under the
    slicers (no date range: product-line data is trailing 12 months only). Figures in `lib/product-line-report.ts`; one
    layout drawn by `lib/report-render.ts` into both jsPDF and PptxGenJS (lazy-loaded). Files are in-memory blobs (lost on refresh).
- `mockups/customer-360.html`: early static mockup. `app/`: unused Power Apps code-app starter.

## Fabric (tenant dsdemo.net, trial capacity FTL64)
- Workspace **Customer 360 (Dev)** `a8971f73-fcb7-4423-8b60-6ebdaa13fe59`
- Lakehouse `c360_lakehouse` `ac28df18-23db-4639-b3a1-de7e689cb0a8`, SQL endpoint `27e80b1b-85a7-48fa-a696-1d50f9446b4c`
- App: AppBackend `customer-360` `e2af2de7-0d45-4c8e-9dba-d40e4e75201f`, SQL DB `6919426a-a6ff-45ce-88c6-e3f79ff44859`
  (its `dbo/MergeProposals` is shortcut into the lakehouse as `app_merge_proposal`; approved merges apply on rebuild)
- Hosted app: https://hazy-slate-bd43ec62ab-westus.webapp.fabricapps.net
- Data agent "Customer 360 Q&A" `b69d4fe5-...` exists but **does not run on the trial capacity** ("FTL64 SKU Not Supported").

## Workflows that work on this machine
- Auth: `az login --allow-no-subscriptions` (Fabric CLI `fab` sign-in hangs here). Rayfin CLI reuses the browser session.
- Rebuild data: edit notebook → `python fabric/deploy.py notebook <name>` → set `START_AT` in `c360_runner.py`
  → `python fabric/deploy.py notebook c360_runner && python fabric/deploy.py run c360_runner` → `python fabric/deploy.py download`.
- After schema changes: refresh SQL endpoint metadata (`POST .../sqlEndpoints/<id>/refreshMetadata`), then
  `RAYFIN_TOKEN=<az token for https://analysis.windows.net/powerbi/api> npx rayfin connector add --type fabric-sqlanalytics
  --workspace-id <ws> --item-id <lakehouse id> --name c360lakehouse --yes` (redirect output to a file; Windows pipes crash it),
  then `node scripts/generate-connector-entities.mjs c360lakehouse gold_`. Decimal precision must be ≤ 28.
- App gates (from `customer-360/`): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then
  `npx rayfin up --json --workspace-id a8971f73-fcb7-4423-8b60-6ebdaa13fe59` (user approved this target).
- Set `SWC_NATIVE_BINDING_CACHE=C:\Users\nikna\.swc` before builds/tests (the default cache dir is rejected on this machine).

## Gotchas already solved
- `vite.config.ts` must lower TC39 decorators (`decoratorVersion: '2022-03'`) or the deployed bundle doesn't parse.
- Keep all `@microsoft/rayfin-*` packages on the same version (currently 1.36.1).
- Lakehouse tables are keyless; the connector is read-only. Aggregations use `.where().groupBy().aggregate()`.
- Don't name columns `group`; the SQL endpoint lags Spark writes (refresh metadata before discovery).
- Tailwind `leading-*` utilities map to this design system's tokens: `leading-none` / `leading-relaxed` resolve to 0px.
  Use the numbered tokens (`leading-300`, `leading-hero-1000`, ...) that match the text size.
- Several source files are CRLF; scripted multi-line replacements must normalise line endings first.
- Right after `rayfin up` (or when idle) the trial capacity's SQL endpoint takes ~10 s to answer; pages show skeletons
  until then. That is latency, not missing data.
- Browser checks: the user is signed in to the hosted app in the browser pane. Use the pane's default size (emulated
  viewports render oddly) and set `document.documentElement.style.scrollBehavior='auto'` before scripted scrolling.

## Open items
- **In-app Q&A (Claude)** is complete on branch `qa-claude-wip` but parked: the user must run
  `npx rayfin secret set ANTHROPIC_API_KEY` (masked prompt; never paste keys in chat), then enable functions in
  `rayfin.yml`, run `npm run dev` for function typegen, merge the branch, run the gates, redeploy.
- PR https://github.com/dnachimow-evitb/power-apps/pull/1 (`customer-360-mockup`) is merged into `main`. Start new work on a fresh branch from `main`.
