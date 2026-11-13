// Sample data used only when the Flask backend is not reachable.
const DEMO = [
  {id:"JE-001",description:"Accrued rent adjustment",status:"valid",errors:[],
   lines:[{account:"6100",debit:5000,credit:0},{account:"2100",debit:0,credit:5000}]},
  {id:"JE-002",description:"Bonus provision",status:"QUARANTINED",errors:["debit and credit are not equal"],
   lines:[{account:"6200",debit:8000,credit:0},{account:"2200",debit:0,credit:7500}]},
  {id:"JE-003",description:"Intercompany loan settlement",status:"QUARANTINED",errors:["suspecious circular intercompany entry"],
   lines:[{account:"1500",debit:12000,credit:0},{account:"1500",debit:0,credit:12000}]},
  {id:"JE-004",description:"Depreciation true-up",status:"QUARANTINED",errors:["invalid account code found"],
   lines:[{account:"9999",debit:900,credit:0},{account:"1600",debit:0,credit:900}]}
];

let entries = [], filter = "all", live = false;
const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

async function loadEntries(){
  $("rerun").disabled = true;
  try{
    const r = await fetch("/api/entries");
    if(!r.ok) throw new Error(r.status);
    entries = (await r.json()).entries; live = true;
  }catch(e){ entries = DEMO; live = false; }
  $("mode").textContent = live ? "Live data" : "Demo data (backend not found)";
  $("mode").className = "pill" + (live ? " live" : "");
  $("rerun").disabled = false;
  render();
}

function el(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}

function renderSummary(){
  const bad = entries.filter(e => e.status === "QUARANTINED").length;
  const box = $("summary"); box.replaceChildren();
  [["Entries checked", entries.length, ""],["Valid", entries.length-bad, "ok"],["Quarantined", bad, "bad"]]
   .forEach(([label,n,cls]) => {
     const s = el("div","stat "+cls); s.append(el("b","",n), el("span","",label)); box.append(s);
   });
}

function renderEntry(e){
  const bad = e.status === "QUARANTINED";
  const card = el("article","entry"+(bad?" bad":""));
  const head = el("button","entry-head");
  head.setAttribute("aria-expanded","false");
  head.append(el("span","eid",e.id), el("span","desc",e.description), el("span","badge",bad?"Quarantined":"Valid"));
  head.onclick = () => {
    const open = card.classList.toggle("open");
    head.setAttribute("aria-expanded", open);
  };
  const body = el("div","entry-body");
  if(e.errors.length){
    const ul = el("ul","errors");
    e.errors.forEach(x => ul.append(el("li","",x)));
    body.append(ul);
  }
  const t = el("table");
  const th = el("thead"); const hr = el("tr");
  [["Account",""],["Debit","n"],["Credit","n"]].forEach(([h,c]) => hr.append(el("th",c,h)));
  th.append(hr); t.append(th);
  const tb = el("tbody"); let dr = 0, cr = 0;
  e.lines.forEach(l => {
    dr += l.debit; cr += l.credit;
    const r = el("tr");
    r.append(el("td","",l.account), el("td","n",l.debit?fmt(l.debit):"–"), el("td","n",l.credit?fmt(l.credit):"–"));
    tb.append(r);
  });
  t.append(tb);
  const tf = el("tfoot"); const fr = el("tr");
  const diff = Math.abs(dr-cr) > 1e-9;
  fr.append(el("td", diff?"off":"", diff?`Out of balance by ${fmt(Math.abs(dr-cr))}`:"Balanced"), el("td","n",fmt(dr)), el("td","n",fmt(cr)));
  tf.append(fr); t.append(tf); body.append(t);
  card.append(head, body);
  return card;
}

function render(){
  renderSummary();
  const list = $("entries"); list.replaceChildren();
  const shown = entries.filter(e => filter === "all" || e.status === filter);
  if(!shown.length) list.append(el("div","empty","No entries in this view."));
  shown.forEach(e => list.append(renderEntry(e)));
}

document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active"); filter = t.dataset.filter; render();
});
$("rerun").onclick = loadEntries;

// ---- chat ----
const history = [];
function addMsg(role, text, cls=""){
  const m = el("div","m "+role+" "+cls,text);
  $("log").append(m); $("log").scrollTop = $("log").scrollHeight; return m;
}

function demoReply(){
  const bad = entries.filter(e => e.status === "QUARANTINED");
  if(!bad.length) return "All entries passed validation. None need human review.";
  return "These entries need human review:\n\n" + bad.map(e => `• ${e.id} (${e.description}): ${e.errors.join("; ")}`).join("\n")
    + "\n\n(Demo mode: connect the Flask backend for full agent answers.)";
}

async function send(text){
  text = text.trim(); if(!text) return;
  addMsg("user", text); $("msg").value = ""; $("chips").hidden = true;
  const wait = addMsg("bot","Checking the entries…","wait");
  $("send").disabled = true;
  try{
    if(!live) throw new Error("demo");
    const r = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:text,history})});
    if(!r.ok) throw new Error(r.status);
    const reply = (await r.json()).reply;
    history.push({role:"user",content:text},{role:"assistant",content:reply});
    wait.textContent = reply; wait.classList.remove("wait");
  }catch(e){
    wait.textContent = live ? "The agent did not respond. Check the server log and try again." : demoReply();
    wait.classList.remove("wait");
  }
  $("send").disabled = false; $("log").scrollTop = $("log").scrollHeight;
}

$("send").onclick = () => send($("msg").value);
$("msg").addEventListener("keydown", e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send($("msg").value); }});
document.querySelectorAll(".chip").forEach(c => c.onclick = () => send(c.textContent));
addMsg("bot","Hi. Ask me which entries failed validation and why.");
loadEntries();
