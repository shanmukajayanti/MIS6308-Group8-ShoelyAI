# Shoely AI

**Agentic application for supply chain automation.** An inventory and procurement assistant for a multi-store footwear retailer. It watches stock, forecasts demand, drafts and issues purchase orders, chases suppliers, reconciles deliveries and flags dead stock. A Claude-powered chatbot lets a manager do all of it in plain English.

> Agents do the legwork; the manager stays the approver.

MIS6308 — Group 8

## What it does

| Stage | Capability |
|---|---|
| Monitor | Compares stock to reorder thresholds for every size and store; flags stale or missing data instead of guessing |
| Forecast | 30-day demand prediction with a confidence level, using sales history and seasonality |
| Requisition | Drafts the purchase request, picks a supplier, auto-approves under a spending limit or routes to the manager |
| Order | Issues the PO, parses supplier replies, scores delays and stock-out risk, escalates on a clock |
| Receive | Reconciles deliveries against the PO, classifies shortages and damage, requires photo evidence |
| Insights | Flags overstock and dead stock using days of supply |
| Chatbot | Claude tool-use agent: checks stock, runs forecasts, approves or rejects reorders, sets thresholds, tracks POs, with confirmation gates for high-impact actions |

## Run it in 3 steps

Requires **Node.js 22+** and an [Anthropic API key](https://console.anthropic.com).

```bash
git clone https://github.com/shanmukajayanti/MIS6308-Group8-ShoelyAI.git
cd MIS6308-Group8-ShoelyAI
cp .env.example .env      # open .env and paste your ANTHROPIC_API_KEY
npm start                 # then open http://localhost:3000
```

No `npm install` is needed because there are no dependencies. Your key lives only in `.env`, which is git-ignored and never uploaded.

## Documentation

| Document | Read it for |
|---|---|
| [SETUP_README.md](SETUP_README.md) | Detailed step-by-step setup, how to create the `.env` file, troubleshooting, demo script |
| [BUSINESS_FEATURES.md](BUSINESS_FEATURES.md) | End-to-end product capabilities, page-by-page tour, how the agentic chatbot works, business rules |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | System design, REST API, all 33 database tables, LLM integration, chatbot internals, limitations |

## Tech stack

Node.js 22 · built-in SQLite (`node:sqlite`) · vanilla JS frontend · Anthropic Claude API. Zero npm dependencies.

## Try the chatbot

Open the app, click **Ask the assistant**, and try:
- *"What is low on stock at my store?"*
- *"Forecast for Trail Runner 2 size 9"*
- *"Approve the reorder for Trail Runner 2 size 10"*
- *"Set the reorder threshold for Coast Slide size 8 to 12 at all stores"* (it asks you to confirm first)

Without an API key the app still runs, using statistical forecasts and a basic keyword chatbot.
