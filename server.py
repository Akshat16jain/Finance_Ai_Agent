import json
import pandas as pd
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from langchain_groq import ChatGroq
from langchain.tools import tool
from langchain.agents import create_agent

load_dotenv()  # reads GROQ_API_KEY

coa = pd.read_csv("inputs/chart_of_accounts.csv")
with open("inputs/manual_adjustments.json") as f:
    adjustments = json.load(f)
VALID_ACCOUNTS = set(coa["account_code"].astype(str))


def check_balance(entry):
    return sum(l["debit"] for l in entry["lines"]) == sum(l["credit"] for l in entry["lines"])

def check_accounts(entry):
    return all(str(l["account"]) in VALID_ACCOUNTS for l in entry["lines"])

def check_circular(entry):
    if "intercompany" in entry["description"].lower():
        return len({l["account"] for l in entry["lines"]}) == 1
    return False

def validate_entry(entry):
    errors = []
    if not check_balance(entry): errors.append("debit and credit are not equal")
    if not check_accounts(entry): errors.append("invalid account code found")
    if check_circular(entry): errors.append("suspecious circular intercompany entry")
    return {"id": entry["id"], "description": entry["description"],
            "status": "QUARANTINED" if errors else "valid", "errors": errors}


@tool
def validate_adjustments() -> str:
    """Validate all journal entries loaded from manual_adjustments.json.
    Use when the user asks to validate entries, find invalid or suspicious
    adjustments, or check debit and credit."""
    return json.dumps([validate_entry(e) for e in adjustments["entries"]], indent=2)


agent = create_agent(
    ChatGroq(model="openai/gpt-oss-120b", temperature=0),
    tools=[validate_adjustments],
    system_prompt="""You are a financial adjustment validation assistant.
1. Understand the user's financial queries.
2. Use the validation tool when the user asks to validate journal entries.
3. Explain invalid entries clearly.
4. Identify entries that need human review.
5. Never modify or post financial transactions.
6. Never invent account codes or financial values.
Always explain the validation results in simple English.""",
)

app = Flask(__name__, static_folder="ui", static_url_path="")


@app.get("/")
def index():
    return send_from_directory("ui", "index.html")


@app.get("/api/entries")
def api_entries():
    out = []
    for e in adjustments["entries"]:
        out.append({**validate_entry(e), "lines": e["lines"]})
    return jsonify({"entries": out})


@app.post("/api/chat")
def api_chat():
    data = request.get_json(force=True)
    messages = data.get("history", []) + [{"role": "user", "content": data["message"]}]
    result = agent.invoke({"messages": messages})
    return jsonify({"reply": result["messages"][-1].content})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
