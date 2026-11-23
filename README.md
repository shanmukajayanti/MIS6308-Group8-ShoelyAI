# Shoely AI — agentic shoe inventory & supply chain

A working app that helps a shoe-store manager keep the right stock on the shelves. It watches inventory, forecasts demand, drafts purchase orders, tracks suppliers, checks deliveries and flags overstock. **Agents do the legwork; the manager stays the approver.**

It includes a **Claude-powered agentic chatbot** that can look up real data and take real actions (approve a reorder, set a threshold, run a stock check) using tool calls against the app's database.

- Backend: Node.js + SQLite (built in, **zero npm dependencies**)
- Frontend: plain HTML/CSS/JS served by the backend
- AI: Anthropic Claude API (chatbot, forecasts, supplier-reply parsing)

---

## Quick start (copy and paste)

If you already have Node 22+ and an Anthropic API key, this is all you need:

```bash
git clone <THIS_REPO_URL>
cd shoely-ai
cp .env.example .env          # then open .env and paste your key (see Step 4)
npm start
```

Then open **http://localhost:3000**. The detailed guide below explains each step.

---

## Detailed setup guide

### Step 1 — Install Node.js (version 22 or newer)

This app uses Node's built-in SQLite, which needs **Node 22+**.

1. Check whether you already have it. Open a terminal (Mac: Terminal app; Windows: PowerShell; Linux: any terminal) and run:
   ```bash
   node -v
   ```
2. If it prints `v22.x.x` or higher (e.g. `v22.16.0`, `v24.1.0`), skip to Step 2.
3. If it prints a lower number or "command not found", download the **LTS** installer from https://nodejs.org and run it. Then **close and reopen your terminal** and run `node -v` again to confirm.

> You do **not** need to run `npm install`. There are no dependencies.

### Step 2 — Get the code

Pick one:

- **With git:**
  ```bash
  git clone <THIS_REPO_URL>
  cd shoely-ai
  ```
- **Without git:** on the GitHub page click the green **Code** button, then **Download ZIP**. Unzip it, then in your terminal `cd` into the unzipped folder (the one that contains `package.json`).

Confirm you are in the right place by running `ls` (Mac/Linux) or `dir` (Windows). You should see `package.json`, `server`, `public` and `.env.example`.

### Step 3 — Get an Anthropic (Claude) API key

The chatbot needs an API key from Anthropic. The rest of the app works without one (see "Running without a key" below), but the **agentic chatbot will not be truly agentic without it**.

1. Go to https://console.anthropic.com and sign up or log in.
2. Add a small amount of credit under **Billing** (the API is pay-as-you-go; a demo costs pennies).
3. Open **API Keys** and click **Create Key**. Give it any name, e.g. `shoely-local`.
4. **Copy the key now.** It starts with `sk-ant-...` and is only shown once.

### Step 4 — Create your `.env` file and add your key

The key goes in a file named **`.env`** in the **root of the project** (the same folder as `package.json`). This file is private and git-ignored, so it will never be uploaded to GitHub.

**Create it by copying the template:**

- Mac / Linux:
  ```bash
  cp .env.example .env
  ```
- Windows (PowerShell):
  ```powershell
  copy .env.example .env
  ```

**Then edit it.** Open `.env` in any text editor (VS Code, TextEdit in plain-text mode, Notepad). Note that files starting with a dot may be hidden in Finder/Explorer; using the terminal command `code .env` (VS Code) or `open -e .env` (Mac) is easiest.

Paste your key after the `=` sign so it looks like this:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-5-5
PORT=3000
```

Rules to avoid common mistakes:
- **No spaces** around the `=`.
- **No quotes** around the key.
- Keep the key on a single line.
- Save the file.
- Never commit or share this file. `.gitignore` already excludes it.

| Variable | Meaning | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Claude API key (**required for the chatbot**) | empty |
| `ANTHROPIC_MODEL` | Which Claude model to use | `claude-sonnet-5-5` |
| `PORT` | Port for localhost | `3000` |

### Step 5 — Start the app

From the project folder:

```bash
npm start
```

You should see:

```
Shoely AI → http://localhost:3000  (LLM: claude-sonnet-5-5)
```

If it says `LLM: off` (or similar) instead of a model name, your key was not picked up. Re-check Step 4 (file name is exactly `.env`, in the project root, and you restarted the server after editing it).

The mock database is created and filled with sample data **automatically** on first run. Nothing else to set up.

### Step 6 — Open the app

Go to **http://localhost:3000** in your browser. To stop the server, press `Ctrl + C` in the terminal.

### Step 7 — Confirm the chatbot works

1. On the **Dashboard**, click **Ask the assistant** (or use the assistant button / command palette).
2. Type: `How much Trail Runner 2 do we have in size 9, and what does the forecast say?`
3. You should get an answer with real numbers, and the chat shows which tools it called (e.g. inventory lookup, then forecast). That is the agent working.

If you get generic or keyword-style answers, the app is running in fallback mode: check your key (see Troubleshooting).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `node: command not found` | Install Node (Step 1), then reopen your terminal. |
| `node:sqlite` error / `No such built-in module` / syntax errors | Your Node is too old. Run `node -v`; you need **22 or newer**. |
| `EADDRINUSE: address already in use :::3000` | Something else is on port 3000. Change `PORT=3001` in `.env` and open http://localhost:3001, or stop the other process: `lsof -ti :3000 \| xargs kill` (Mac/Linux). |
| Chatbot gives simple/keyword replies | No valid key loaded. Make sure the file is named exactly `.env` (not `.env.txt` or `.env.example`), is in the project root, contains `ANTHROPIC_API_KEY=sk-ant-...`, and that you **restarted** `npm start`. |
| Chatbot shows an error such as 401 / authentication | The key is wrong, revoked or has a typo/extra space. Create a new one in the Anthropic console. |
| Error about credit / billing / 429 | Add credit in the Anthropic console, or wait and retry if rate-limited. |
| Data is messy after experimenting | Reset it with `npm run seed`, then restart the app. |
| Can't see `.env` in the folder | Dotfiles are hidden by default. In terminal use `ls -a`; in Finder press `Cmd + Shift + .`. |

### Running without a key

Everything still works, just less intelligently: forecasts use a statistical model, supplier replies use a rule-based parser, and the chatbot falls back to keyword intents. This is also what `npm test` uses.

---

## Commands

```bash
npm start      # run the app at http://localhost:3000 (loads .env automatically)
npm test       # 24 end-to-end checks across all use cases (LLM disabled, deterministic)
npm run seed   # reset the mock data
```

---

## App tour (what each page does)

| Group | Page | Purpose |
|---|---|---|
| Operate | **Dashboard** | Overview and the **Run monitoring** button |
| | **Monitoring** | Detects items below their reorder threshold and creates recommendations |
| | **Forecasts** | 30-day demand forecast per item and store |
| Procure | **Requisitions** | Purchase requests awaiting manager approval |
| | **Purchase orders** | Orders sent to suppliers, with delay tracking and alerts |
| | **Receiving** | Check deliveries; log short or damaged items |
| Insights | **Stock health** | Flags overstock and dead stock |
| Admin | **System** | Demo time controls (+24h) and timers |
| — | **Assistant** (chat panel) | The agentic chatbot, available from any page |

## 5-minute demo

1. **Dashboard → Run monitoring.** Expect 7 recommendations, 3 flagged for missing threshold or stale data.
2. **Approve** the reorder for *Trail Runner 2*. Under the cost limit it becomes an auto-approved PO. Over the limit or low-confidence (e.g. *Aero Trainer*) it is routed to **Requisitions**.
3. *Harbor Chelsea Boot* size 10 goes **On Hold** because the cheapest supplier is invalid. Click **Agent: revise requisition** and choose a valid supplier.
4. **Purchase orders → PO-1** → send the supplier delay message to raise a critical delay alert. Then **System** → **+24h** → **Run timers** to trigger the follow-up and escalation.
5. **Receiving** → record short or damaged lines to create discrepancies. Damage with no photo is held as `pending_documentation`.
6. **Stock health** → run the analysis.
7. **Assistant** → "approve the reorder for Trail Runner 2 size 9".

## Try the agentic chatbot

It is agentic because Claude is given real tools wired to the database and decides which to call, in what order, reading each result before choosing the next step. It does not answer from memory.

Tools include: `query_inventory`, `get_forecast`, `run_monitoring`, `approve_recommendation`, `reject_recommendation`, `decide_requisition`, `set_reorder_threshold`, `get_order_status`, `get_requisition`, `run_stock_health`, `list_stock_flags`, `list_pending`.

Prompts to try:
1. **Multi-step:** "How much Trail Runner 2 do we have in size 9, and what does the forecast say?"
2. **Takes action:** "Approve the reorder for Trail Runner 2 size 9." Then check Requisitions / Purchase orders.
3. **Guardrail:** "Set the reorder threshold for Coast Slide to 50 in all stores." It must ask for confirmation first.
4. **Proactive:** "Run monitoring and tell me what needs my attention."
5. **Honesty:** Ask about a shoe that doesn't exist. It should say so rather than invent data.

**Guardrails:** agents never approve for the manager; PO terms are immutable; actions above the limit or across multiple stores need explicit confirmation; ambiguous data is flagged, never guessed.

---

## Project layout

- `server/schema.sql` — tables and CHECK/FK/unique constraints (plus `llm_call_log`, `setting`)
- `server/services/` — `monitoring` (UC1), `forecast` (UC2), `requisition` (UC3/4), `orders` (UC5), `receiving` (UC6), `stockhealth` (UC7), `chat` (UC8)
- `server/index.js` — REST API + static file server
- `server/llm.js` — Claude API calls
- `server/seed.js` — mock data (auto-run on first start)
- `public/` — the UI (`index.html`, `app.js`, `app.css`)
- `data/` — SQLite database, created automatically (git-ignored)

## Security notes

- Your API key lives **only** in `.env`, which is git-ignored. Never paste it into code, issues or screenshots.
- If you ever accidentally expose a key, delete it in the Anthropic console and create a new one.
