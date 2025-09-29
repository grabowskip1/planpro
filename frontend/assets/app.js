const API_BASE = "https://<TWOJ-WORKER>.workers.dev";
const GROUP = "30197";
const TZ = "Europe/Warsaw";

function isoWeekday(d){ return ((d.getDay()+6)%7)+1; }

function getDisplayRange(now = new Date()){
  const local = new Date(now.toLocaleString("en-CA", { timeZone: TZ }));
  const wd = isoWeekday(local);
  const monday = new Date(local);

  if (wd === 6) {
    monday.setDate(monday.getDate() - (wd - 1)); // -5
  } else if (wd === 7) {
    monday.setDate(monday.getDate() + 1);
  } else {
    monday.setDate(monday.getDate() - (wd - 1));
  }

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { from: iso(monday), to: iso(friday) };
}

function iso(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), da=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

async function load(){
  const { from, to } = getDisplayRange();
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

  const left = document.getElementById("col-left");
  const right = document.getElementById("col-right");
  left.innerHTML = ""; right.innerHTML = "";

  for (const day of orderLeft) left.appendChild(dayCard(day, byDay[day]||[]));
  for (const day of orderRight) right.appendChild(dayCard(day, byDay[day]||[]));
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
    // sort safety in UI
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

load();