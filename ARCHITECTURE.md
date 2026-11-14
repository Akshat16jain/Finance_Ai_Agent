# Architecture: Finance AI Agent for Manual Adjustment Review

## 1. Problem
During period close, manual journal adjustments are error-prone: unbalanced entries, wrong account codes and circular intercompany postings. A reviewer needs to know quickly which entries are safe and which need human attention, with clear reasons.

## 2. Design principle
**Numbers are checked by code, not by the model.** An LLM is good at understanding a question and explaining findings, but it can get arithmetic wrong and can invent values. So the responsibilities are split:

| Layer | Responsibility | Deterministic? |
|---|---|---|
| Validation functions (`check_balance`, `check_accounts`, `check_circular`, `validate_entry`) | Decide valid or quarantined | Yes |
| Agent (LangChain `create_agent` + Groq `openai/gpt-oss-120b`, temperature 0) | Understand the question, call the tool, explain results | No, but constrained |
| Interfaces (`main.py` terminal, `server.py` Flask) | Deliver the agent to the user | Yes |

## 3. Data flow
```
inputs/chart_of_accounts.csv  ─┐
                               ├─> validate_entry() ──> {id, status, errors[]}
inputs/manual_adjustments.json ┘          │
                                          └─> tool: validate_adjustments
User question ─> Agent ─ tool call ─> JSON results ─> plain-English explanation ─> User
```

## 4. Components
- **Inputs.** The chart of accounts (CSV, loaded with pandas) and the manual adjustments (JSON). Each entry has an id, a description and debit/credit lines.
- **Validation rules.**
  1. *Balance*: sum of debits equals sum of credits.
  2. *Accounts*: every line's account code exists in the chart of accounts.
  3. *Circular intercompany*: description mentions "intercompany" and all lines use the same account.
  
  `validate_entry` combines them and returns `{id, description, status, errors}`. Any error gives the status `QUARANTINED`.
- **Agent.** One read-only tool, `validate_adjustments`, which validates every entry and returns JSON. The system prompt tells the model to explain results simply, flag entries for human review, never modify or post transactions, and never invent account codes or values. Temperature 0 keeps answers consistent.
- **Terminal app (`main.py`).** A chat loop around the agent.
- **Web app (`server.py`).** Flask serves `ui/index.html`. `GET /api/entries` returns entries with status and lines. `POST /api/chat` passes the conversation history and the new message to the agent.

## 5. Controls and guardrails
- **Quarantine, not delete or fix.** Failing entries are flagged for human review. Nothing is changed.
- **Read-only tool surface.** The agent has no write tool, so it cannot post or edit an entry even if it misbehaves.
- **Rules decide, model explains.** The pass/fail decision never depends on the LLM.
- **Secrets.** The API key is read from an environment variable (`.env`), and `.env` is git-ignored.

## 6. Known limitations
- The balance check compares floating-point sums with `==`, so rounding could wrongly flag a balanced entry. Decimal arithmetic would fix this.
- The circular check is a heuristic: it needs the word "intercompany" and a single account. It misses multi-entity cycles and unlabeled entries.
- The validation rules are written separately in `main.py` and `server.py`, so they could drift apart.
- No checks yet for duplicates, closed periods, amount thresholds or preparer/approver separation.
- No authentication on the Flask app, and it runs in debug mode.
- The model's wording is not guaranteed to match the tool output exactly.

## 7. Next steps
1. Use Decimal amounts and move the rules into one shared module.
2. Detect intercompany cycles across entities, and add rules for duplicates, closed periods and large amounts.
3. Require structured output so every explanation cites entry IDs.
4. Add unit tests and an evaluation set of tricky entries for the agent.
5. Add an approve/reject workflow with an audit trail, authentication and role-based access.
6. Deploy with gunicorn and log every tool call for tracing.
