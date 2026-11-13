from dotenv import load_dotenv
import os
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
print("API key loded :",bool(GROQ_API_KEY))

import json
import pandas as pd

coa=pd.read_csv("inputs/chart_of_accounts.csv")

with open("inputs/manual_adjustments.json","r") as file:
    adjustments=json.load(file)

# print(coa.head())
# print(adjustments["entries"][0])


def check_balance(entry):
    total_debit=0
    total_credit=0
    for line in entry["lines"]:
        total_debit+=line["debit"]
        total_credit+=line["credit"]

    if total_debit==total_credit:
        return True
    else:
        return False

for entry in adjustments["entries"]:
    result=check_balance(entry)
    #print(entry["id"],result)


def check_accounts(entry):
    valid_account=set(
        coa["account_code"].astype(str)
    )
    for line in entry["lines"]:
        account=str(line["account"])

        if account not in valid_account:
            return False
    return True

for entry in adjustments["entries"]:
    result=check_accounts(entry)
    #print(entry["id"],result)


def check_circular(entry):
    if "intercompany" in entry["description"].lower():
        account=[
            line["account"]
            for line in entry["lines"]]
        if len(set(account))==1:
            return True
    return False


def validate_entry(entry):
    errors=[]

    if not check_balance(entry):
        errors.append("debit and credit are not equal")
    if not check_accounts(entry):
        errors.append("invalid account code found")
    if check_circular(entry):
        errors.append("suspecious circular intercompany entry")
    if errors:
        status="QUARANTINED"
    else:
        status="valid"
    return {
        "id": entry["id"],
        "description": entry["description"],
        "status": status,
        "errors": errors
    }
for entry in adjustments["entries"]:

    result = validate_entry(entry)

    #print(result)

from langchain_groq import ChatGroq
from langchain.tools import tool
from langchain.agents import create_agent
from rich import print

@tool
def validate_adjustments() -> str:
    """
    Validate all journal entries loaded from
    manual_adjustments.json.

    Use this tool whenever the user asks to:
    - Validate journal entries.
    - Find invalid entries.
    - Check debit and credit.
    - Identify suspicious adjustments.
    """

    results=[]
    for entry in adjustments["entries"]:
        result=validate_entry(entry)
        results.append(result)
    return json.dumps(results,indent=2)


llm = ChatGroq(
    model="openai/gpt-oss-120b",
    temperature=0
)

agent=create_agent(
    llm,
    tools=[validate_adjustments],
    system_prompt=
    """You are a financial adjustment validation assistant.

    Your responsibilities:

    1. Understand the user's financial queries.
    2. Use the validation tool when the user asks
       to validate journal entries.
    3. Explain invalid entries clearly.
    4. Identify entries that need human review.
    5. Never modify or post financial transactions.
    6. Never invent account codes or financial values.

    Always explain the validation results in simple English.
    """
)

print("Financial Ai agent")
print("Type exit to quite")

while True:
    user_input=input("you:")
    if user_input.lower()=="exit":
        break
    result=agent.invoke({
        "messages":[{
            "role":"user",
            "content":user_input
        }]
    })

    print("Agent:",result["messages"][-1].content)

