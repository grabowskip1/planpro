const API_BASE = "https://uz-plan.grabowski-piotrekk.workers.dev";
const GROUP = "30197";
const TZ = "Europe/Warsaw";

let weekOffset = getOffsetFromURL();

ensureWeekSwitchUI();

document.getElementById("prev").addEventListener("click", ()=>{ weekOffset--; updateURL(); load(); });
document.getElementById("next").addEventListener("click", ()=>{ weekOffset++; updateURL(); load(); });

function getOffsetFromURL(){
  const u = new URL(location.href);
  const w = parseInt(u.searchParams.get("w")||"0",10);
  return Number.isFinite(w) ? w : 0;
}
function updateURL(){
  const u = new URL(location.href);
  if (weekOffset !== 0) u.searchParams.set("w", String(weekOffset));
  else u.searchParams.delete("w");
  history.replaceState(null, "", u.toString());
}

function zonedNow(tz=TZ){
  const now = new Date();
  const inTz = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const diff = inTz.getTime() - now.getTime();
  return new Date(now.getTime() + diff);
}

function baseMonday(now = zonedNow()){
  const day = now.getDay(); // 0=nd, 6=sb
  let monday = new Date(now);
  if (day === 6) { 
    monday.setDate(monday.getDate() - (((monday.getDay()+6)%7)) - 7);
  } else if (day === 0) { 
    monday.setDate(monday.getDate() + 1);
  } else {
    monday.setDate(monday.getDate() - (((monday.getDay()+6)%7)));
  }
  monday.setHours(0,0,0,0);
  return monday;
}
function getDisplayRange(offsetWeeks=0){
  const mon = baseMonday();
  mon.setDate(mon.getDate() + offsetWeeks*7);
  const fri = new Date(mon); fri.setDate(mon.getDate()+4);
  return { from: iso(mon), to: iso(fri) };
}
function iso(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), da=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

async function load(){
  const { from, to } = getDisplayRange(weekOffset);
  document.getElementById("range").textContent = `${from} — ${to}`;

  const status = document.getElementById("status");
  status.textContent = "Ładowanie…";

  try {
    const res = await fetch(`${API_BASE}/api/plan?group=${GROUP}&from=${from}&to=${to}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data.entries);
    status.textContent = "";
  } catch (e) {
    status.textContent = "Błąd pobierania danych.";
    console.error(e);
  }
}

function render(entries){
  const orderLeft = ["Poniedziałek","Wtorek","Środa"];
  const orderRight = ["Czwartek","Piątek"];
  const byDay = groupBy(entries, e => e.day);

  const left = dom("col-left");
  const right = dom("col-right");
  left.innerHTML = ""; right.innerHTML = "";

  for (const d of orderLeft) left.appendChild(dayCard(d, byDay[d]||[]));
  for (const d of orderRight) right.appendChild(dayCard(d, byDay[d]||[]));
}

function dayCard(day, rows){
  const card = document.createElement("div");
  card.className = "card";
  const h2 = document.createElement("h2");
  h2.textContent = day;
  card.appendChild(h2);
  card.appendChild(hr());

  if (rows.length === 0) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "Brak zajęć";
    card.appendChild(p);
  } else {
    rows.sort((a,b)=> a.from.localeCompare(b.from));
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "row";
      div.textContent = `${r.from} | ${r.to} | ${r.subject} | ${r.type} | ${r.teacher} | ${r.room}`;
      card.appendChild(div);
    }
  }
  return card;
}

function groupBy(arr, keyFn){
  return arr.reduce((acc, x)=>{ const k = keyFn(x); (acc[k] ||= []).push(x); return acc; }, {});
}
function hr(){ const d=document.createElement("div"); d.className="rule"; return d; }
function dom(id){ const el=document.getElementById(id); if (!el) throw new Error(`Brak elementu #${id} w HTML`); return el; }

function ensureWeekSwitchUI(){
  if (!document.getElementById("prev") || !document.getElementById("next")) {
    const rangeEl = document.getElementById("range") || (()=>{ const p=document.createElement("p"); p.id="range"; document.body.prepend(p); return p; })();
    const wrap = document.createElement("div"); wrap.className = "week-switch";
    const prev = document.createElement("button"); prev.id="prev"; prev.textContent="◀︎";
    const next = document.createElement("button"); next.id="next"; next.textContent="▶︎";
    rangeEl.replaceWith(wrap);
    wrap.appendChild(prev); const rangeSpan=document.createElement("span"); rangeSpan.id="range"; rangeSpan.className="range"; wrap.appendChild(rangeSpan); wrap.appendChild(next);
  }
}

load();


