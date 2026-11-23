# Shoely AI — Business Features & Capabilities

**What it is:** an AI-assisted inventory and supply-chain system for a multi-store footwear retailer. It watches stock, predicts demand, drafts and issues purchase orders, chases suppliers, checks deliveries and flags dead stock — and a conversational **agentic assistant** lets managers do all of it by talking.

**The operating principle:** *agents do the legwork, humans keep the authority.* The system proposes and prepares; the manager approves anything that matters.

For setup see [SETUP_README.md](SETUP_README.md). For internals see [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md).

---

## 1. The problem it solves

| Without Shoely | With Shoely |
|---|---|
| Managers eyeball stock, find out about stock-outs when a customer asks for a size | Every SKU/size/store is checked continuously; low stock triggers a recommendation before it hurts |
| Reorder quantities are gut feel | Quantities come from a 30-day demand forecast, trend and seasonality, with a stated confidence |
| Purchase orders are manual emails and spreadsheets | Approved reorders become POs and supplier messages automatically |
| Late suppliers are discovered too late | Supplier replies are parsed, delays are scored, and stock-out risk is calculated |
| Short or damaged deliveries are argued from memory | Receipts are reconciled line-by-line with evidence and a recommended remedy |
| Slow sellers quietly tie up cash | Overstock and dead stock are flagged with days of supply |
| Approvals stall in someone's inbox | Reminders after 24 h and escalation after 48 h |

---

## 2. Who uses it

| Role | What they do in the system |
|---|---|
| **Store Manager** (one per store) | Reviews recommendations, approves requisitions, handles delays and discrepancies, chats with the assistant |
| **Regional / Ops Manager** | Receives escalations (unreviewed approvals, unacknowledged critical delays, unresolved discrepancies) |
| **Procurement Manager** | Exists as a role in the data model; no workflow is routed to it yet |
| **Receiving clerk / Receiving Lead** | Logs deliveries; short shipments of minor size route to the Receiving Lead |

The demo data has three Texas stores (Dallas, Austin, Houston) and five named managers; switch between them in the UI to see each person's view.

---

## 3. End-to-end flow

```
 ① MONITOR ──► ② FORECAST ──► ③ RECOMMEND ──► ④ REQUISITION ──► ⑤ APPROVE ──► ⑥ PURCHASE ORDER
 stock vs        30-day         reorder         supplier, qty,    auto (≤ limit)    sent to supplier,
 threshold       demand         quantity +      cost, written     or manager        tracked, delays
                 + confidence   reasoning       justification     decision          scored
                                                                                        │
 ⑨ INSIGHTS ◄── ⑧ STOCK IN ◄── ⑦ RECEIVE & RECONCILE ◄─────────────────────────────────┘
 overstock /      inventory      match delivery to PO,
 deadstock        updated        flag shortages & damage
                    ▲
        💬 The agentic assistant can drive steps ①–⑨ from a chat box
```

---

## 4. Capabilities, page by page

### 4.1 Dashboard — the morning view
- **KPI tiles:** pending recommendations (and how many need extra scrutiny), open POs, delayed POs, requisitions waiting on you, stock-health flags, deadstock, open receiving discrepancies.
- **Action buttons:** **Run monitoring**, **Periodic review**, **Ask the assistant**.
- Live panels: top recommendations, active/delayed POs, recent monitoring decisions, latest notifications.

### 4.2 Monitoring — never miss a low-stock item
- Compares on-hand stock against each item's **reorder threshold** for every size and store.
- Produces one of three outcomes per SKU: **Reorder recommended**, **No reorder**, or **Flagged for review**.
- **Smart restraint:** it will not recommend if a recommendation, requisition or PO is already open for that item (no duplicate orders).
- **It refuses to guess.** It flags instead of recommending when the threshold is missing or the inventory data is more than 48 hours old.
- **Periodic review mode** also looks for items that are *above* threshold but will not cover forecast demand.
- Managers can edit thresholds and see the full monitoring log and parameters.
- Every recommendation includes a plain-English **rationale** (e.g. "14 on hand vs threshold 30; predicted demand 62 over 30 days, High confidence").

### 4.3 Forecasts — demand you can trust
- 30-day demand prediction for any item at any store, with a **12-week sales chart**.
- Blends sales history, **seasonality** and trend. With Claude enabled it reasons over the data and writes a justification; without it, a statistical model runs.
- Every forecast carries a **confidence level** (High / Medium / Low / Unreliable) and a **review flag**.
- **Honest about uncertainty:** with too little history the forecast is marked *Unreliable* with no number rather than a fake one; a forecast that swings more than 50 % from recent actuals is flagged.
- New products (e.g. a shoe launched 10 days ago) and discontinued ones are handled explicitly.

### 4.4 Requisitions — the approval inbox
A requisition is the purchase request the agent prepares from an approved recommendation. It includes item, quantity (rounded to **case-pack** sizes), cheapest supplier, estimated cost, lead time, and a forecast-based written justification.

How it is routed:

| Situation | Outcome |
|---|---|
| Cost within the **auto-approval limit** and forecast is confident | **Auto-approved**, PO issued immediately |
| Cost over the limit | **Pending manager review** |
| Forecast confidence low/flagged | **Pending manager review** |
| Supplier not valid | **On Hold** — agent offers a fix ("revise requisition") |
| Missing data / zero quantity | **Flagged** with the reason |

Manager decisions: **Approve**, **Reject** or **Return for revision** (a reason is mandatory for the last two). Approval issues the PO. The full decision history is kept. The **auto-approval limit is adjustable** on the System page.

### 4.5 Purchase orders — supplier tracking without the chasing
- A PO is created from the approved requisition with ship and delivery dates based on supplier lead time, and a message is generated for the supplier's **preferred channel** (EDI, email or portal). With Claude enabled the message is professionally worded while keeping quantities, prices and dates unchanged.
- **Paste a supplier's reply** (any wording) and the system extracts status and dates: acknowledged, in production, shipped, delayed. If the message is unclear it **asks for manual review instead of guessing**.
- **Delay intelligence:** the delay is measured in days and rated **minor / moderate / critical**. It is critical if 8+ days late **or** if stock would run out before the new delivery date — the alert states the stock-out risk and a recommended action (expedite, split shipment, alternate supplier, store transfer).
- **Automatic follow-ups:** no supplier acknowledgement in 24 h → reminder sent. A critical delay left unacknowledged for 4 h → escalated to the Regional/Ops Manager.
- Full correspondence log and timeline per PO.

### 4.6 Receiving — close the loop at the dock
- Record what physically arrived: quantity and condition (good / damaged / partial damage) per item, plus carrier and tracking.
- The system **reconciles against the PO** and labels the receipt **full match / partial match / mismatch**.
- Each variance becomes a **discrepancy** with type (short, over, damaged, wrong item), **severity** (by % variance) and a **recommended remedy** (request credit, request replacement, accept variance, return to supplier, contact supplier).
- **Evidence rule:** a damage claim with no photo is held as *pending documentation* — nothing is routed to the supplier until proof is attached. This protects supplier relationships and credit claims.
- Auto-routing: the right team gets the issue (Receiving Lead, Store Manager, or Supplier Relations).
- Good stock is added to inventory immediately; disputed stock waits for the manager's decision. Only a manager can resolve a discrepancy — the agent never does.
- Reminder after 48 h, escalation after about a week.

### 4.7 Stock health — protect cash
- Calculates **days of supply** (stock ÷ forecast daily demand) for every item and store.
- Flags **Overstock** (more than 90 days of supply) and **Deadstock Risk** (more than 180 days, no forecast demand, or no sales in 90 days).
- Items without usable sales history are excluded rather than mis-flagged. Managers acknowledge flags; they are not duplicated.

### 4.8 System — admin and demo controls
- Change the **auto-approval limit**.
- **Time travel:** advance the clock 24 h / 48 h and run the SLA timers to watch reminders and escalations fire.
- **Audit views:** action log (who did what), notification history, **every AI call the system made**, and live row counts per table.
- Reset demo data.

### 4.9 Cross-cutting
Notifications for every important event, a searchable **command palette**, light/dark theme, and a full **audit trail** of approvals, rejections and instructions.

---

## 5. The agentic chatbot — end-to-end capabilities

Open it from **Ask the assistant** on the Dashboard (or the command palette). It knows who you are, your store, today's date and your approval limit.

### 5.1 What makes it genuinely agentic

A normal chatbot answers from text it was given. This assistant has **hands**:

1. **It decides what to look up.** Ask a question and it chooses the right tools itself.
2. **It chains steps.** "Do we have enough Trail Runner 2 in size 9?" → checks inventory → fetches the forecast → compares → answers with real numbers.
3. **It takes actions**, not just gives advice: runs monitoring, approves or rejects reorders, decides on requisitions, changes thresholds, runs stock-health analysis.
4. **It reads results and adapts.** If a tool errors or an item isn't found, it explains rather than inventing.
5. **It is transparent.** Under each reply you can see chips for **every tool it called**, so you can audit the reasoning.
6. **It remembers** the recent conversation (last several exchanges), so follow-ups like "approve that one" work.
7. **It keeps humans in control** (see 5.3).

### 5.2 What you can ask it to do

| Category | Example requests |
|---|---|
| **Inventory** | "What is low on stock at my store?" · "How many Coast Slides in size 8 across all stores?" |
| **Forecast** | "Forecast for Trail Runner 2 size 9" · "What's the demand outlook for Aero Trainer?" |
| **Review queue** | "Show pending recommendations" · "What needs my attention?" |
| **Approve / reject** | "Approve the reorder for Trail Runner 2 size 10" · "Reject RR-4, we have a promo coming" · "Approve REQ-2" |
| **Configure** | "Set the reorder threshold for Coast Slide size 8 to 12" |
| **Run analyses** | "Run monitoring" · "Check for overstock" |
| **Track orders** | "Where is PO-1?" · "Any delayed orders?" |
| **Explain** | "Why was REQ-3 sent to me?" (reads the requisition and its justification) |
| **Multi-step** | "Run monitoring, then tell me which items are most urgent and what they'd cost" |

### 5.3 Built-in safety (guardrails)

| Rule | What you'll experience |
|---|---|
| **Never acts without a clear instruction** | It will not approve anything unless you said so clearly |
| **One at a time** | If "approve the Trail Runner" matches several recommendations, it lists them and asks which |
| **Big decisions need a second "yes"** | Approving a requisition **above your auto-approval limit**, or changing a threshold at **more than one store**, makes it stop and ask you to confirm in a follow-up message |
| **Asks when unsure** | Ambiguous intent → a short clarifying question, not a guess |
| **No invented facts** | Numbers, IDs and prices come only from live data |
| **Stays in its lane** | It cannot change an issued PO's terms, cancel orders, or contact alternate suppliers — and it says so |
| **Fully audited** | Every action is logged with who, what and which message triggered it |

### 5.4 Resilience
If Claude is unreachable or no API key is set, the assistant drops to a **basic keyword mode** (approve/reject by ID, set thresholds, run monitoring, check POs, list stock) and says so. You lose natural-language flexibility and multi-step reasoning, but not the ability to work.

### 5.5 Try it (suggested script)
1. *"What is low on stock at my store?"* — watch the inventory tool chip appear.
2. *"Forecast for Trail Runner 2 size 9"* — forecast tool; note the confidence.
3. *"Run monitoring and tell me what needs my attention."* — action tool + summary.
4. *"Approve the reorder for Trail Runner 2 size 10."* — approves, drafts the requisition, may issue a PO; the page updates.
5. *"Set the threshold for Coast Slide size 8 to 12 at all stores."* — it should **ask you to confirm** first.
6. *"Where is PO-1?"* — order status with any delay flags.
7. *"Approve the one for the boot."* — if ambiguous it asks which.

---

## 6. Guardrails across the whole system

- **Humans approve:** the agents never approve a requisition for the manager.
- **Spending control:** automatic approval only up to a configurable limit and only with a confident forecast.
- **PO integrity:** terms cannot be altered after issue; one PO per approved requisition; amounts are validated by the database.
- **No guessing:** missing thresholds, stale data, unclear supplier messages, unreliable forecasts and undocumented damage are all *flagged*, never papered over.
- **No duplicates:** one open recommendation and one open requisition per item and store.
- **Escalation, not silence:** unanswered approvals, delays and discrepancies move up the chain on a clock.
- **Graceful degradation:** every AI feature has a rule-based fallback, so the business process never stops if the AI is unavailable.
- **Traceability:** approvals, instructions and every AI call are recorded.

---

## 7. Business-rule cheat sheet

| Topic | Rule |
|---|---|
| Reorder trigger | On-hand ≤ reorder threshold |
| Stale inventory | Not updated for > 48 h → flagged, not recommended |
| Order quantity | `max(forecast − on-hand, threshold − on-hand, 1)`; rounded up to case-pack |
| Auto-approval | Cost ≤ limit (**default $1,500**) **and** High/Medium forecast **and** valid supplier |
| Approval reminder / escalation | 24 h reminder → 48 h escalate to Regional/Ops |
| Supplier follow-up | No acknowledgement after 24 h → automatic reminder |
| Delay severity | Minor < 4 days · Moderate 4–7 days · Critical ≥ 8 days **or** stock-out risk |
| Critical-delay escalation | Unacknowledged 4 h → Regional/Ops |
| Receiving variance severity | ≤ 10 % low · 10–25 % medium · > 25 % high |
| Damage evidence | No photo → *pending documentation* |
| Overstock | > 90 days of supply |
| Deadstock risk | > 180 days of supply, or no forecast demand, or no sales in 90 days |
| Discrepancy follow-up | 48 h reminder → ~7 days escalation |

---

## 8. Demo scenarios built into the sample data

| Scenario | What it demonstrates |
|---|---|
| Trail Runner 2 (low stock, strong trend) | Normal flow: recommend → auto-PO when under the limit |
| Aero Trainer (launched 10 days ago) | Low-confidence forecast → routed for manager review |
| Court Classic Low (one store with stale data) | "Flagged for review" instead of a guess |
| Coast Slide (one store with no threshold; heavy surplus elsewhere) | Missing-threshold flag; overstock detection |
| Dusty Oxford (sold only long ago) | Deadstock detection and unreliable forecast |
| Harbor Chelsea Boot size 10 (cheapest supplier invalid) | **On Hold** → "agent: revise requisition" |
| PO-1 in production | Paste a supplier delay message → critical alert → advance clock → escalation |
| PO-3 awaiting acknowledgement | Advance 24 h → automatic supplier reminder |
| Receiving short/damaged lines | Discrepancies, severity, routing, photo-evidence rule |

---

## 9. Current scope and honest limits

This is a working prototype of the full process, built to prove the workflow:
- Supplier and notification channels are **simulated** (messages are generated and recorded, not actually transmitted).
- There is **no login** — you pick which manager you are acting as.
- Timers run when triggered (clock controls), not on a background schedule.
- Data is sample data in a local database.

These are integration and deployment tasks rather than gaps in the decision logic; see the production-hardening list in [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md#13-known-limitations--production-hardening).
