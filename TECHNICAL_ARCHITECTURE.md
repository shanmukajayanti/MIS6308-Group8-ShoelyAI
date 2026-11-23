# Shoely AI — Technical Architecture

This document describes how Shoely AI is built: the runtime, code layout, request flow, REST API, database schema, the LLM integration, the agentic chatbot's internals, business-rule engines, and known limitations. For setup see [SETUP_README.md](SETUP_README.md); for the product view see [BUSINESS_FEATURES.md](BUSINESS_FEATURES.md).

---

## 1. System at a glance

```
┌──────────────────────────────┐        HTTP/JSON         ┌─────────────────────────────────────────────┐
│  Browser (SPA)               │ ───────────────────────► │  Node.js server  (server/index.js)          │
│  public/index.html           │ ◄─────────────────────── │  node:http · regex router · static files    │
│  public/app.js  app.css      │                          │                                             │
│  vanilla JS, no framework    │                          │  ┌───────────── services/ ────────────────┐ │
│                              │                          │  │ monitoring  forecast   requisition     │ │
│  ┌────────────────────────┐  │                          │  │ orders      receiving  stockhealth     │ │
│  │ Chat panel (assistant) │──┼─ POST /api/chat ────────►│  │ chat  (tool-use agent loop)            │ │
│  └────────────────────────┘  │                          │  └──────┬─────────────────────┬───────────┘ │
└──────────────────────────────┘                          │         │ SQL                 │ HTTPS       │
                                                          │  ┌──────▼───────┐      ┌──────▼───────────┐ │
                                                          │  │ db.js        │      │ llm.js           │ │
                                                          │  │ node:sqlite  │      │ fetch → Anthropic│ │
                                                          │  └──────┬───────┘      │ Messages API     │ │
                                                          └─────────┼──────────────┴──────────────────┘ │
                                                                    ▼
                                                          data/shoely.db  (SQLite file, 33 tables)
```

| Concern | Choice |
|---|---|
| Runtime | Node.js **22+** (uses the built-in `node:sqlite`, global `fetch`, `--env-file-if-exists`) |
| Dependencies | **None** (no `npm install`). No framework, no ORM, no bundler |
| Server | `node:http` with a tiny regex router (`route(method, pattern, fn)`) |
| Database | SQLite via `node:sqlite` `DatabaseSync` (synchronous, single file, `PRAGMA foreign_keys = ON`) |
| Frontend | One HTML page + vanilla JS (`public/app.js`) and CSS; client-side page routing; no build step |
| AI | Anthropic Messages API called directly with `fetch` (no SDK), model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) |
| Config | `.env` loaded by `node --env-file-if-exists=.env` |
| Auth | **None.** The "current user" is a manager picked in the UI (see §11) |

---

## 2. Repository layout

```
shoely-ai/
├── package.json              scripts: start | seed | test   ("type": "module")
├── .env / .env.example       ANTHROPIC_API_KEY, ANTHROPIC_MODEL, PORT   (.env is git-ignored)
├── SETUP_README.md           how to run it
├── TECHNICAL_ARCHITECTURE.md this file
├── BUSINESS_FEATURES.md      product / capability guide
├── data/shoely.db            SQLite database (auto-created, git-ignored)
├── public/
│   ├── index.html            shell (sidebar, topbar, chat drawer mount points)
│   ├── app.js  (257 lines)   SPA: pages, API client, chat UI, command palette, theme
│   ├── app.css               styles, light/dark themes
│   └── index-basic-backup.html, prototype-old.html   older UI versions (unused)
└── server/
    ├── index.js              HTTP server, routes, static serving, "tick" timer endpoint
    ├── db.js                 SQLite connection + helpers: all/get/run/insert/update/tx
    ├── schema.sql            all CREATE TABLE statements (idempotent, run on every boot)
    ├── seed.js               deterministic mock data; auto-runs when DB is empty; `npm run seed` resets
    ├── util.js               simulated clock, settings, notify(), logAction(), lookups
    ├── llm.js                callClaude(), jsonTask(), draftText(), audit log
    ├── test.js               24 end-to-end checks (LLM disabled)
    └── services/
        ├── monitoring.js     UC1  threshold-breach detection → reorder recommendations
        ├── forecast.js       UC2  30-day demand forecast (LLM-first, statistical fallback)
        ├── requisition.js    UC3/UC4  draft requisition, approval routing, review timers
        ├── orders.js         UC5  PO issue, supplier messaging, delay detection, timers
        ├── receiving.js      UC6  goods receipt, reconciliation, discrepancies
        ├── stockhealth.js    UC7  overstock / deadstock flagging
        └── chat.js           UC8  the Claude tool-use agent + keyword fallback
```

The "UC1–UC8" labels refer to the eight use cases from the original project report; each maps to exactly one service file.

---

## 3. Boot sequence

1. `npm start` → `node --no-warnings --env-file-if-exists=.env server/index.js`.
2. `db.js` opens `data/shoely.db` (path overridable with `SHOELY_DB`), creating the folder if needed, then executes `schema.sql` (all `CREATE TABLE IF NOT EXISTS`, so it is safe on every boot).
3. `index.js` imports `seed.js`; at the bottom of that module, if the `store` table is empty, `seed()` populates mock data.
4. Routes are registered and `http.createServer` listens on `PORT` (default 3000). Setting `SHOELY_NO_LISTEN=1` skips listening (used by tests).
5. The banner prints either the active model or a notice that the API key is missing and fallbacks are in use.

Environment variables:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables all LLM features. If unset, every LLM path degrades to deterministic fallbacks |
| `ANTHROPIC_MODEL` | Model ID for every LLM call (default `claude-sonnet-5-5`) |
| `PORT` | HTTP port (default 3000) |
| `SHOELY_DB` | Override SQLite file path |
| `SHOELY_NO_LLM=1` | Force-disable LLM even if a key exists (used by `npm test`) |
| `SHOELY_NO_LISTEN=1` | Import the server without listening |

---

## 4. HTTP layer

- **Router:** `route(method, '/api/x/:id', handler)` converts `:param` to a named regex group. Handlers receive `{ p: pathParams, q: URLSearchParams, b: jsonBody }` and return a JS object that is serialised as JSON with status 200.
- **Errors:** any thrown error in a handler is returned as `400 { "error": "<message>" }`. Unknown API route → `404`. Malformed JSON body → `400 bad json`.
- **Static files:** anything not under `/api/` is served from `public/` (`/` → `index.html`), with a path-traversal guard (`file.startsWith(PUB)` → else `403`). MIME types: html, js, css, svg.
- **Concurrency model:** SQLite calls are synchronous, so each request runs its DB work without interleaving at the statement level. Multi-statement business operations that must be atomic use `tx()` (BEGIN/COMMIT/ROLLBACK).

---

## 5. REST API reference

All paths are prefixed with `/api`. Bodies are JSON. `managerId` defaults to `1` when omitted.

### 5.1 Read endpoints (GET)

| Endpoint | Returns |
|---|---|
| `/meta` | `{ llm (model or null), today, clockOffsetHours, approvalLimit, managers[], stores[] }` |
| `/dashboard` | KPI counts (pending recs, review-flagged recs, open POs, delayed POs, pending requisitions, stock flags, deadstock, open discrepancies) plus latest recs, active POs, monitoring log and notifications |
| `/inventory` | Every item × store: on-hand, threshold, review frequency, latest forecast |
| `/recommendations` | All reorder recommendations (joined with item and store) |
| `/monitoring-log` | Last 60 monitoring decisions |
| `/forecast/:item/:store` | Latest/generated forecast, 12 weeks of sales history, item and store. `?force=1` regenerates |
| `/requisitions` | All requisitions with item summary, quantity, supplier |
| `/requisitions/:id` | Full requisition: lines, forecast, decisions, linked PO |
| `/purchase-orders` | All POs with supplier, store, items |
| `/purchase-orders/:id` | Full PO: lines, status updates, delay flags, manager alerts, supplier correspondence, receipts |
| `/receipts/:id` | Reconciliation result with received lines and discrepancies |
| `/discrepancies` | All discrepancies with routing and priority |
| `/stock-flags` | Overstock / deadstock flags |
| `/notifications` | Last 50 notifications |
| `/action-log` | Last 40 audited manager/system actions |
| `/llm-log` | Last 30 LLM calls (kind, model, ok, first 200 chars of prompt) |
| `/chat/history?manager=N` | Last 30 chat messages for a manager |
| `/suppliers/:item` | Suppliers for an item, cheapest first, with unit price |
| `/schema` | Every table and its row count (powers the System page) |

### 5.2 Action endpoints (POST)

| Endpoint | Body | Effect |
|---|---|---|
| `/monitoring/run` | `{ periodic?, storeId? }` | Evaluate all (or one store's) SKUs; create recommendations |
| `/monitoring/threshold` | `{ itemId, storeId, threshold, managerId }` | Upsert reorder threshold |
| `/recommendations/:id/approve` | `{ managerId }` | Approve → draft requisition (→ possibly auto-PO) |
| `/recommendations/:id/reject` | `{ managerId, reason }` | Reject recommendation |
| `/requisitions/:id/decide` | `{ managerId, decision, reason }` | `Approved` / `Rejected` / `Returned For Revision`; approval issues the PO |
| `/requisitions/:id/revise` | `{ supplierId? }` | Agent redrafts the requisition (optionally with a different supplier) |
| `/purchase-orders/:id/supplier-message` | `{ text, source? }` | Ingest a supplier's free-text reply; parse status/dates; detect delays |
| `/delay-flags/:id/acknowledge` | `{ managerId }` | Acknowledge a delay flag and its alerts |
| `/receipts` | `{ poId, lines[{itemId, qty, condition, photo}], receivedBy, carrier, tracking }` | Record goods receipt and reconcile |
| `/discrepancies/:id/photo` | `{ photo }` | Attach evidence; releases `pending_documentation` |
| `/discrepancies/:id/resolve` | `{ managerId, action }` | Manager resolves a discrepancy |
| `/stock-health/run` | – | Run overstock/deadstock analysis |
| `/stock-flags/:id/acknowledge` | `{ managerId }` | Acknowledge a flag |
| `/chat` | `{ managerId, storeId, text }` | Send a message to the assistant → `{ messageId, reply, engine, tools[] }` |
| `/settings/approval-limit` | `{ value }` | Change the auto-approval dollar limit |
| `/clock/advance` | `{ hours }` | Move the simulated clock forward, then run timers |
| `/tick` | – | Run all SLA timers now |
| `/reset` | – | Wipe and re-seed all data |

> The API is unauthenticated and trusts the `managerId` in the request. It is a demo/prototype surface, not a hardened one (see §13).

---

## 6. Database

SQLite, **33 tables**, defined in `server/schema.sql`. Foreign keys are enforced; enumerations are enforced with `CHECK` constraints so invalid states cannot be stored.

### 6.1 Entity-relationship overview

```
 store ─┬─< manager                        item ─┬─< supplier_item_price >─ supplier
        │                                        ├─< inventory_record (item,store) PK
        │                                        ├─< monitoring_parameter (item,store) UNIQUE
        │                                        ├─< sales_record (item,store,date) PK
        │                                        └─< seasonality_data
        │
 UC1  reorder_recommendation ─< notification            monitoring_log
        │ (partial unique index: one open rec per item+store)
        ▼
 UC2  forecast_request ─1:1─ demand_forecast
        │
        ▼
 UC3/4 requisition ─< requisition_line_item
        │      └─< approval_decision
        ▼
 UC5  purchase_order ─< po_line_item
        ├─< llm_supplier_prompt   (all outbound supplier messages)
        ├─< order_status_update   (parsed supplier replies)
        └─< delay_flag ─< manager_alert
        ▼
 UC6  shipment_receipt ─< received_line_item
        └─1:1─ reconciliation_result ─< discrepancy ─< exception_routing
 UC7  stock_flag
 UC8  manager_message ─< action_log
 Platform: setting (k/v), llm_call_log
```

### 6.2 Tables by domain

**Reference data**

| Table | Purpose / key columns |
|---|---|
| `manager` | `role` ∈ Store Manager, Regional/Ops Manager, Procurement Manager; `store_id` |
| `store` | name, address, region |
| `item` | one row per SKU variant: `sku` UNIQUE, `item_name`, `style`, `size`, `colorway`, `material_category`, `unit_cost`, `case_pack`; UNIQUE(style,size,colorway) |
| `supplier` | `lead_time_days`, `preferred_channel` ∈ EDI/Email/Portal, `supplier_valid_flag` ∈ Yes/No |
| `supplier_item_price` | which supplier sells which item at what `unit_price`; UNIQUE(supplier,item) |
| `inventory_record` | PK(item_id, store_id): `quantity_on_hand` ≥ 0, `last_updated_at` |

**UC1 – Monitoring**

| Table | Purpose |
|---|---|
| `monitoring_parameter` | per item+store `reorder_threshold`, `review_frequency` (Daily/Weekly/Monthly), `set_by` |
| `monitoring_log` | every evaluation result: Reorder Recommended / No Reorder / Flagged For Review + detail |
| `reorder_recommendation` | on-hand, threshold, `suggested_quantity`, `rationale`, `trigger_type` (Threshold Breach / Periodic Review), `review_flag`, `recommendation_status` (Pending, Handed Off, No Reorder, Flagged For Review, Approved, Rejected). **Partial unique index `ux_open_rec`** guarantees at most one open (Pending/Handed Off) recommendation per item+store |
| `notification` | in-app notifications: `kind`, subject, body, `delivery_status`, `retry_count`, `read_flag` |

**UC2 – Forecasting**

| Table | Purpose |
|---|---|
| `sales_record` | PK(item, store, sale_date): `quantity_sold`, `sell_through_rate` (0–1) |
| `seasonality_data` | `seasonality_index` > 0, `trend_direction` Up/Down/Flat per item and period |
| `forecast_request` | audit of why/when a forecast was requested (`Reorder Trigger` / `Scheduled Cycle`) |
| `demand_forecast` | `predicted_demand` (NULL allowed only when confidence = `Unreliable`), `forecast_confidence` High/Medium/Low/Unreliable, `model_version` (`stat-v1` or the Claude model ID), `forecast_justification`, `review_flag`, `outdated_flag` |

**UC3/UC4 – Requisition and approval**

| Table | Purpose |
|---|---|
| `requisition` | links recommendation, store, forecast, supplier; `total_estimated_cost`, `approval_limit` (snapshot), `approval_method` Auto/Manager, `requisition_status` ∈ Draft, Flagged, On Hold, Pending Auto Approval, Pending Manager Review, Approved, Rejected, Returned For Revision, PO Issued, Failed; `status_note` |
| `requisition_line_item` | `recommended_quantity` > 0, `unit_price`, `forecast_justification`; UNIQUE(requisition,item) |
| `approval_decision` | `decision_type` ∈ Approved, Rejected, Returned For Revision, Auto Approved; CHECK: reason mandatory for Rejected/Returned; escalation flag/date |

**UC5 – Purchase orders**

| Table | Purpose |
|---|---|
| `purchase_order` | 1:1 with an approved requisition (`requisition_id` UNIQUE); issue/ship/delivery dates, `status` ∈ drafted, sent, acknowledged, in_production, shipped, delayed, delivered, cancelled; CHECK delivery ≥ ship date |
| `po_line_item` | CHECK `line_total = qty × unit_price` (±0.005) |
| `llm_supplier_prompt` | every outbound supplier message: `tone` ∈ transmission / reminder / escalation, channel, body |
| `order_status_update` | parsed supplier replies: reported status/dates, `raw_text`, `source` ∈ supplier_api, supplier_email, manual_entry, agent_inference |
| `delay_flag` | `delay_days` > 0, `severity` ∈ minor/moderate/critical, reason, notes, acknowledgement |
| `manager_alert` | alerts to managers, `priority` medium/high |

**UC6 – Receiving**

| Table | Purpose |
|---|---|
| `shipment_receipt` | who received, when, carrier, tracking |
| `received_line_item` | expected vs received qty, `item_condition` ∈ good/damaged/partial_damage, lot, photo |
| `reconciliation_result` | `match_status` ∈ full_match / partial_match / mismatch, matched and variance totals |
| `discrepancy` | `discrepancy_type` ∈ short_shipment, over_shipment, damaged_goods, wrong_item, quality_mismatch; `severity` low/medium/high; `status` ∈ open, under_review, resolved, escalated, pending_documentation; `recommended_action` ∈ request_credit, request_replacement, accept_variance, return_to_supplier, contact_supplier. CHECK: `resolved` ⇔ `resolved_at` set |
| `exception_routing` | who a discrepancy was routed to and at what priority |

**UC7 – Stock health:** `stock_flag` (Overstock / Deadstock Risk, on-hand, forecasted demand, days of supply, acknowledgement).

**UC8 – Chat:** `manager_message` (message, reply, `engine` used), `action_log` (intent ∈ Instruction/Approval/Rejection/System, details, links to message and recommendation).

**Platform:** `setting` (key/value: `approval_limit`, `clock_offset_hours`), `llm_call_log` (every LLM call: kind, model, prompt ≤4000 chars, response ≤4000, ok flag).

### 6.3 Integrity strategy

Business invariants are pushed into the database where possible (CHECK constraints, partial unique index, FKs, computed-total check), so a bug in application code cannot persist an illegal state. Multi-table writes (drafting a requisition, issuing a PO, receiving a shipment) run inside `tx()`.

### 6.4 Seed data (`seed.js`)

Deterministic (fixed pseudo-random seed 42), so every reset yields identical data:
- 3 Texas stores (Dallas Galleria, Austin South Congress, Houston Rice Village)
- 5 managers (3 Store Managers, 1 Regional/Ops, 1 Procurement)
- 3 suppliers (one deliberately invalid: *Apex Trading Co*)
- 6 products across ~13 size SKUs, 120 days of sales, seasonality indices
- Pre-set thresholds, with deliberate edge cases (missing threshold, stale inventory, brand-new product, product with very old sales only, cheapest supplier invalid)
- Three historical POs (one in production, one delivered, one awaiting acknowledgement)
- Default **auto-approval limit: $1,500**

---

## 7. The simulated clock

`util.js` defines `now() = Date.now() + clock_offset_hours`. All timestamps and SLA calculations use it. `POST /api/clock/advance { hours }` bumps the offset and then calls `tick()`, which runs the three timer jobs. This lets a demo fast-forward 24/48 hours to see reminders and escalations without waiting. In production this would be replaced with a real scheduler (cron/queue) calling `tick()`.

---

## 8. LLM integration (`server/llm.js`)

| Function | Used for | Behaviour |
|---|---|---|
| `callClaude({system, messages, tools, maxTokens})` | everything | `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`; 45 s timeout; throws on non-2xx |
| `jsonTask(kind, system, user)` | forecasting, supplier-reply parsing | Appends "return ONLY valid JSON"; extracts the outermost `{…}`; **retries once**; returns `null` on failure |
| `draftText(kind, system, user, fallback)` | supplier emails, requisition justifications | Returns Claude's text, else the supplied template |
| `audit(kind, prompt, response, ok)` | all of the above | Writes to `llm_call_log` |

**Graceful degradation (a core design principle):** every LLM call site has a deterministic fallback, so the system still functions with no key, no network or an API error.

| Feature | With key | Without key / on failure |
|---|---|---|
| Forecast | Claude reasons over 84 days of sales + seasonality + statistical baseline | Statistical model `stat-v1` |
| Supplier-reply parsing | Claude → JSON | Regex parser (`regexParse`) |
| Supplier emails & requisition text | Claude rewrites a fact-locked template | The template itself |
| Chatbot | Tool-use agent | Keyword/intent matcher (§9.5) |

The model is told to preserve all facts ("do not change any PO quantities, prices or dates") and structured outputs are re-validated in code (enum membership, `YYYY-MM-DD` regex, numeric checks) before being trusted.

---

## 9. The agentic chatbot (`services/chat.js`)

### 9.1 Why it is "agentic"

It is not a prompt-and-reply bot. It is a **tool-use loop**: Claude is given a catalogue of typed tools backed by real services, decides which to call and in what order, observes each result, and keeps going until it has an answer — including **write actions** that change business state.

### 9.2 Request flow

```
POST /api/chat {managerId, storeId, text}
  1. insert manager_message (user text)
  2. if API key:   claudeAgent()      else: fallback()
  3. update manager_message with reply + engine used
  4. return { reply, engine, tools: [{tool, input, ok}] }   ← UI shows tool chips
```

### 9.3 The agent loop

```
messages = last 8 persisted turns for this manager + new user message
repeat up to 8 steps:
    res = callClaude(system, messages, TOOLS, maxTokens=1200)
    append res.content as assistant turn
    if res.stop_reason != "tool_use": return final text
    for each tool_use block:
        out = execTool(name, input, ctx)          # real DB / service call
        record {tool, input, ok} in toolTrace
        collect tool_result (JSON, truncated to 12,000 chars)
    append tool_results as a user turn
if loop exhausted: "I took too many steps — please narrow the request"
```

- **Memory:** the previous 8 message/reply pairs for that manager are replayed each time (stored in `manager_message`).
- **Per-turn context:** the system prompt is rebuilt every call with the current manager (name, role, ID), their store, today's (simulated) date and the current auto-approval limit.
- **Error handling:** tool exceptions are caught and returned to Claude as `{error: …}` so it can explain or recover rather than crash. If the whole Claude call fails, the reply is prefixed with "(Claude is unavailable…)" and the keyword fallback answers instead (`engine = 'fallback'`).

### 9.4 Tool catalogue (12 tools)

| Tool | Type | What it does |
|---|---|---|
| `query_inventory` | read | On-hand, threshold, below-threshold flag, latest forecast, days of supply, any pending RR — filter by item text, size, store (`0` = all stores), low-stock-only. Max 25 rows |
| `list_pending` | read | Pending recommendations (RR-n) and requisitions awaiting review (REQ-n) |
| `get_forecast` | read/compute | Gets or generates the 30-day forecast for item+store |
| `get_order_status` | read | One PO (status, dates, lines, delay flags) or all open POs |
| `get_requisition` | read | Full requisition detail |
| `list_stock_flags` | read | Current overstock/deadstock flags |
| `run_monitoring` | **action** | Runs detection now, creates recommendations |
| `run_stock_health` | **action** | Runs overstock/deadstock analysis |
| `approve_recommendation` | **action** | Approves ONE recommendation → drafts requisition → may auto-issue a PO |
| `reject_recommendation` | **action** | Rejects ONE recommendation (with reason) |
| `decide_requisition` | **action** | Approve / Reject / Return a requisition |
| `set_reorder_threshold` | **action** | Change a threshold for one store or all stores |

After any action tool, the UI re-renders the current page (`render(true)`), so the change appears immediately.

### 9.5 Guardrails (enforced in code and in the prompt)

| Guardrail | Where enforced |
|---|---|
| Never invent numbers, IDs, prices — always call a tool | System prompt |
| Classify intent (Query / Instruction / Approval / Rejection); ask when unclear | System prompt |
| Only approve/reject when the manager clearly said so; match exactly **one** RR/REQ, else list candidates and ask | System prompt |
| Approving a requisition **above the auto-approval limit** needs explicit confirmation | **Code:** `decide_requisition` returns `confirmation_required` unless `confirm=true`; prompt requires confirmation in a *later* message |
| Changing a threshold at **more than one store** needs confirmation | **Code:** `set_reorder_threshold` returns `confirmation_required` |
| Cannot alter issued POs, contact alternate suppliers or cancel orders | No such tools exist; prompt tells the model to say so |
| Reason required for rejection/return | **Code** (`decideRequisition`) |
| Only `Pending Manager Review` requisitions can be approved | **Code** |
| Every action is attributed and audited | `action_log` (intent, details, message link) |
| Bounded execution | max 8 loop steps, 1200 output tokens, 45 s per call, 12k-char tool results |

Key design point: the safety-critical rules live in **code paths the model cannot bypass** (confirmation gates, state-machine checks, DB constraints), not only in the prompt.

### 9.6 Fallback mode (no API key)

`fallback()` is a regex/keyword intent router that reuses the same `execTool` functions. It handles: approve/reject by RR-n or REQ-n (with a typed "confirm approve REQ-n" flow for over-limit), set threshold, run monitoring, PO status, overstock list, pending list, and inventory lookups. It cannot chain steps or interpret free-form language, which is exactly the capability the Claude agent adds.

---

## 10. Business-rule engines (what each service does)

### UC1 — Monitoring (`monitoring.js`)
For each inventory row, `evaluate()` applies ordered rules:
1. Inventory older than **48 h** → *Flagged for review* (stale data).
2. No reorder threshold → *Flagged* (manager must set one).
3. Open recommendation already exists → *No reorder*.
4. Open requisition or active PO already in flight → *No reorder*.
5. `on_hand ≤ threshold` = breach. If not a breach and not a periodic review → *No reorder*.
6. Fetch/generate a forecast. For a periodic review with weak forecast or demand already covered by stock → *No reorder*.
7. Suggested quantity: if forecast is solid → `max(predicted − on_hand, threshold − on_hand, 1)`; if weak (Low/Unreliable/missing) → `max(threshold − on_hand, 1)` and `review_flag = Yes`.
8. Insert recommendation, notify the store manager, write to `monitoring_log`. Per-SKU exceptions are caught and logged as *Flagged* so one bad row never stops the run.

### UC2 — Forecasting (`forecast.js`)
- **Statistical baseline:** `perDay(last 28 d) × 30 × seasonality × (1 + (trendFactor−1)×0.5)`, with `trendFactor = last28/prev28` clamped to 0.6–1.5.
- **Confidence:** High ≥84 days & ≥20 sales records; Medium ≥42 d; Low ≥14 d; else Unreliable (prediction = NULL). A volatile trend downgrades High → Medium.
- **LLM path:** Claude receives 84 days of sales, seasonality and the baseline and returns JSON `{predictedDemand, forecastConfidence, forecastJustification, reviewFlag}`.
- **Review flags:** Low/Unreliable confidence, or prediction deviating **>50 %** from the most recent comparable period.
- **Caching:** a forecast younger than 24 h is reused unless forced.
- **Failure mode:** if the LLM fails twice and a prior forecast exists, that forecast is re-stored marked `outdated_flag = Yes`.

### UC3 — Requisition drafting (`requisition.js: draftRequisition`)
Ordered decision rules produce a status:
| Condition | Status |
|---|---|
| An open requisition already exists for item+store | Flagged (duplicate) |
| Missing inventory / forecast / supplier, or quantity ≤ 0 | **Flagged** |
| Chosen supplier `supplier_valid_flag = No` | **On Hold** |
| Forecast not High/Medium, or forecast/recommendation review flag set | **Pending Manager Review** |
| Cost ≤ auto-approval limit | **Pending Auto Approval** → approval recorded → **PO issued automatically** |
| Cost > limit | **Pending Manager Review** |

Quantity = `forecast − on_hand` when forecast is confident (else the recommendation's suggestion), rounded **up to case-pack multiples**. Supplier = the **cheapest priced** option by default (validity is *not* pre-filtered; a cheapest supplier that is invalid is what triggers On Hold, and `reviseRequisition` with a chosen `supplierId` is the fix). Claude writes a 2–3 sentence justification from facts only (template fallback).

### UC4 — Approval (`decideRequisition`, `reviewTimers`)
- Decisions: Approved / Rejected / Returned For Revision; reason mandatory for the latter two; only `Pending Manager Review` can be approved. Approval immediately calls `issuePO`.
- `reviseRequisition` closes the old requisition and redrafts with fresh data (optionally a different supplier) — the fix path for On Hold / Returned items.
- **Timers:** >24 h pending → reminder to Store Manager; >48 h → escalation to Regional/Ops Manager.

### UC5 — Orders (`orders.js`)
- `issuePO`: creates PO + lines in a transaction (ship date = lead time ÷ 2, delivery = lead time), marks requisition `PO Issued`, then `transmit()` generates the supplier message and sets status `sent`. Only approved/auto-approved requisitions can issue; one PO per requisition.
- `ingestSupplierMessage`: Claude (or regex) turns free text into `{status, shipDate, deliveryDate}`; **never guesses** — if nothing is clear it routes to manual review. Delay = max(ship slip, delivery slip) in days.
- **Severity:** `critical` if delay ≥ 8 days **or** stock-out risk (days of supply < days until revised delivery); `moderate` ≥ 4 days; else `minor`. Minor is logged only; moderate/critical set the PO to `delayed`, create a `manager_alert` (high priority for critical) with a recommended action, and notify.
- **Timers:** sent PO unacknowledged >24 h → automatic supplier reminder; critical delay unacknowledged >4 h → escalation alert to Regional/Ops.

### UC6 — Receiving (`receiving.js`)
- Aggregates scanned lines per item; items on the PO but not received are treated as qty 0.
- `classify()` (deterministic, not LLM): not on PO → `wrong_item` (high, return); damaged → `damaged_goods` (high, return) ; partial damage → medium, request replacement; quantity variance >25 % high, >10 % medium, else low; short → request credit (or contact supplier if high); over → accept (or return if high).
- **Damage without a photo** → status `pending_documentation` and not routed until evidence is attached.
- Routing: low short shipments → Receiving Lead; minor overs → Store Manager; everything else → Supplier Relations.
- Good, expected quantities are added to inventory immediately; disputed goods wait for resolution. PO becomes `delivered`.
- Only a manager can resolve; `accept_variance` adds the accepted stock; credit/replacement/return actions log an outbound supplier message. Timers: 48 h reminder; ~7 days escalation.

### UC7 — Stock health (`stockhealth.js`)
Days of supply = on-hand ÷ (forecast ÷ 30). **Deadstock Risk** if DOS > 180, zero forecast demand, or no sales in 90 days; **Overstock** if DOS > 90. Items with no sales history or no usable forecast are excluded (not guessed). Duplicate unacknowledged flags are suppressed; managers get one summary notification per store.

---

## 11. Frontend (`public/app.js`)

- Single-page app, no framework; template-literal rendering into `#main`; fetch wrapper `api(path, body)`.
- **Navigation:** Operate (Dashboard, Monitoring, Forecasts), Procure (Requisitions, Purchase orders, Receiving), Insights (Stock health), Admin (System).
- **Acting user:** a manager selector (`mgr()`) sets which manager's identity is sent as `managerId` and whose chat history is loaded.
- **Chat drawer** (`toggleChat`, `say`): suggestion chips, welcome capability cards, typing indicator, and **tool chips under each reply** showing exactly which tools the agent called (red if one errored). After any non-read tool, the page re-renders so new data is visible.
- **Command palette** and **light/dark theme** toggle.
- **System page:** approval-limit setting, simulated clock controls, timer runner, table row counts, LLM call log, data reset.

---

## 12. Testing

`npm test` runs `server/test.js`: 24 end-to-end checks against an isolated database with `SHOELY_NO_LLM=1` (deterministic) covering UC1–UC8. LLM-dependent behaviour (Claude forecasts, Claude-written emails, the tool-use agent) is therefore **not** covered by the automated suite and should be verified manually.

---

## 13. Known limitations & production hardening

| Area | Current state | For production |
|---|---|---|
| Authentication | None; `managerId` is client-supplied | Real auth (SSO/JWT), server-derived identity, role-based permissions on every endpoint |
| Transport/secrets | Local HTTP; API key in `.env` | HTTPS, secret manager, per-environment keys |
| Suppliers | EDI/Email/Portal sends are **simulated** (message stored, not transmitted) | Real integrations, delivery receipts |
| Notifications | In-app only; retry fields exist but delivery is simulated | Email/SMS/push with real retry |
| Scheduling | Timers run when `tick()` is called (manual / clock advance) | Cron/queue worker |
| Database | Single-file SQLite, synchronous | Postgres + migrations; connection pooling |
| Chat memory | Last 8 turns per manager, no summarisation | Longer-term memory, summarisation |
| Chat confirmation | Confirmation gate is code-enforced for the two high-impact actions only | Generalise to a policy layer for all writes |
| Observability | `llm_call_log` (no chat tool-use calls logged there) and `action_log` | Structured logs, tracing, token/cost metrics |
| Frontend | Escaping done manually in template strings | Component framework / CSP |
| Tests | No automated coverage of LLM paths | Recorded-response tests, evals for the agent |
