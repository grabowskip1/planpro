const API_BASE = "https://uz-plan.grabowski-piotrekk.workers.dev";
const GROUP_ID = "30197";
const GROUP_BT = "30214";
const TZ = "Europe/Warsaw";
const MODES = { BREAKS: "breaks", ID: "id", BT: "bt" };
const DAYS_PL = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];

let weekOffset = getOffsetFromURL();
let mode = getModeFromURL() || MODES.BREAKS;

document.addEventListener("DOMContentLoaded", () => {
  ensureWeekSwitchUI();
  mountMenu();
  bindWeekButtons();
  load();
});

async function load(){
  setTitle();
  const { from, to } = getDisplayRange(weekOffset);
  qs('#range').textContent = `${from} — ${to}`;
  qs('#status').textContent = "Ładowanie…";
  try {
    if (mode === MODES.ID) {
      const entries = await fetchPlan(GROUP_ID, from, to);
      renderLessons(entries);
    } else if (mode === MODES.BT) {
      const entries = await fetchPlan(GROUP_BT, from, to);
      renderLessons(entries);
    } else {
      const [idEntries, btEntries] = await Promise.all([
        fetchPlan(GROUP_ID, from, to),
        fetchPlan(GROUP_BT, from, to)
      ]);
      renderBreaks(idEntries, btEntries);
    }
    qs('#status').textContent = "";
  } catch (err) {
    console.error(err);
    qs('#status').textContent = "Błąd pobierania danych.";
  }
}

// ===== API =====
async function fetchPlan(group, from, to){
  const res = await fetch(`${API_BASE}/api/plan?group=${group}&from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.entries;
}
function datesForWeek(offset = weekOffset){
  const mon = baseMonday();
  mon.setDate(mon.getDate() + offset*7);
  const out = {};
  for (let i=0;i<7;i++){
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    out[DAYS_PL[i]] = d;
  }
  return out;
}
function fmtDate(d){
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function renderLessons(entries){
  const orderLeft = ["Poniedziałek","Wtorek","Środa"];
  const orderRight = ["Czwartek","Piątek"];
  const byDay = groupBy(entries, e=>e.day);
  const dates = datesForWeek(weekOffset);
  clearCols();
  for (const d of orderLeft){
    const rows = (byDay[d]||[]).sort((a,b)=>a.from.localeCompare(b.from));
    qs('#col-left').appendChild(dayCard(d, rows, dates[d]));
  }
  for (const d of orderRight){
    const rows = (byDay[d]||[]).sort((a,b)=>a.from.localeCompare(b.from));
    qs('#col-right').appendChild(dayCard(d, rows, dates[d]));
  }
}

function renderBreaks(idEntries, btEntries){
  const days = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek"];
  const dates = datesForWeek(weekOffset);
  clearCols();

  for (const [idx, d] of days.entries()){
    const target = idx < 3 ? qs('#col-left') : qs('#col-right');
    const card = document.createElement('div'); card.className='card';

    const h2 = document.createElement('h2'); h2.textContent = d; card.appendChild(h2);
    const sub = document.createElement('p'); sub.className='meta daydate'; sub.textContent = fmtDate(dates[d]); card.appendChild(sub);
    card.appendChild(hr());

    const idDay = (idEntries||[]).filter(x=>x.day===d);
    const btDay = (btEntries||[]).filter(x=>x.day===d);

    const idBusy = mergeIntervals(idDay.map(toInterval));
    const btBusy = mergeIntervals(btDay.map(toInterval));

    const idStart = firstStart(idBusy);
    const btStart = firstStart(btBusy);
    const idEnd = lastEnd(idBusy);
    const btEnd = lastEnd(btBusy);

    card.appendChild(infoLine(`Start: (ID - ${idStart||'—'}) (BT - ${btStart||'—'})`));

    const content = document.createElement('div');
    const breaks = commonBreaks(idBusy, btBusy);
    if (breaks.length === 0) {
      const p = document.createElement('p'); p.className='meta'; p.textContent='Brak wspólnych przerw'; content.appendChild(p);
    } else {
      for (const [s,e] of breaks){
        const div = document.createElement('div'); div.className='row'; div.textContent = `${toHH(s)} — ${toHH(e)}`; content.appendChild(div);
      }
    }
    card.appendChild(content);

    card.appendChild(infoLine(`Koniec: (ID - ${idEnd||'—'}) (BT - ${btEnd||'—'})`));
    target.appendChild(card);
  }
}

function toInterval(e){ return [toMin(e.from), toMin(e.to)]; }
function toMin(hm){ const [h,m]=hm.split(':').map(n=>parseInt(n,10)); return h*60+m; }
function toHH(mins){ const h=Math.floor(mins/60), m=String(mins%60).padStart(2,'0'); return `${String(h).padStart(2,'0')}:${m}`; }

function mergeIntervals(arr){
  if (!arr || arr.length===0) return [];
  arr.sort((a,b)=>a[0]-b[0]);
  const out=[arr[0].slice()];
  for (let i=1;i<arr.length;i++){
    const [s,e]=arr[i]; const last=out[out.length-1];
    if (s<=last[1]) last[1]=Math.max(last[1],e); else out.push([s,e]);
  }
  return out;
}
function invertIntervals(busy){
  if (!busy || busy.length===0) return [];
  const start=busy[0][0], end=busy[busy.length-1][1];
  const free=[]; let cur=start;
  for (const [s,e] of busy){ if (s>cur) free.push([cur,s]); cur=Math.max(cur,e); }
  return free;
}
function firstStart(busy){ return busy.length ? toHH(busy[0][0]) : null; }
function lastEnd(busy){ return busy.length ? toHH(busy[busy.length-1][1]) : null; }
function intersectIntervals(a,b){
  const out=[]; let i=0,j=0;
  while(i<a.length && j<b.length){
    const s=Math.max(a[i][0], b[j][0]);
    const e=Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s,e]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
function clampIntervals(ints, window){
  if (!ints.length || !window) return [];
  const [ws,we]=window; const out=[];
  for (const [s,e] of ints){
    const ss=Math.max(s,ws), ee=Math.min(e,we);
    if (ee>ss) out.push([ss,ee]);
  }
  return out;
}
function commonBreaks(idBusy, btBusy){
  if (!idBusy.length || !btBusy.length) return [];
  const idWin=[idBusy[0][0], idBusy[idBusy.length-1][1]];
  const btWin=[btBusy[0][0], btBusy[btBusy.length-1][1]];
  const win=[Math.max(idWin[0], btWin[0]), Math.min(idWin[1], btWin[1])];
  if (win[1] <= win[0]) return [];
  const idFree = invertIntervals(idBusy);
  const btFree = invertIntervals(btBusy);
  const idFreeClamped = clampIntervals(idFree, win);
  const btFreeClamped = clampIntervals(btFree, win);
  return intersectIntervals(idFreeClamped, btFreeClamped);
}

// ===== UI helpers =====
function dayCard(day, rows, dateObj){
  const card=document.createElement('div'); card.className='card';
  const h2=document.createElement('h2'); h2.textContent=day; card.appendChild(h2);

  if (dateObj){
    const sub=document.createElement('p');
    sub.className='meta daydate';
    sub.textContent = fmtDate(dateObj);
    card.appendChild(sub);
  }

  card.appendChild(hr());

  if (rows.length===0){
    const p=document.createElement('p'); p.className='meta'; p.textContent='Brak zajęć'; card.appendChild(p);
  } else {
    for (const r of rows){
      const div=document.createElement('div'); div.className='row';
      div.textContent=`${r.from} | ${r.to} | ${r.subject} | ${r.type} | ${r.teacher} | ${r.room}`;
      card.appendChild(div);
    }
  }
  return card;
}
function infoLine(text){ const p=document.createElement('p'); p.className='meta'; p.textContent=text; return p; }
function groupBy(arr, key){ return (arr||[]).reduce((a,x)=>{ const k=typeof key==='function'?key(x):x[key]; (a[k]||(a[k]=[])).push(x); return a; },{}); }
function hr(){ const d=document.createElement('div'); d.className='rule'; return d; }
function qs(sel){ const el=document.querySelector(sel); if(!el) throw new Error(`Missing ${sel}`); return el; }
function clearCols(){ qs('#col-left').innerHTML=''; qs('#col-right').innerHTML=''; }

function ensureWeekSwitchUI(){
  const host = qs('#weeks');
  host.innerHTML = '';
  const prev=document.createElement('button'); prev.id='prev'; prev.textContent='◀︎';
  const range=document.createElement('span'); range.id='range'; range.className='range'; range.textContent='';
  const next=document.createElement('button'); next.id='next'; next.textContent='▶︎';
  host.append(prev, range, next);
}
function bindWeekButtons(){
  qs('#prev').addEventListener('click', ()=>{ weekOffset--; updateURL(); load(); });
  qs('#next').addEventListener('click', ()=>{ weekOffset++; updateURL(); load(); });
}

function mountMenu(){
  const btn = qs('#hamburger');
  const panel = qs('#sidepanel');
  const backdrop = qs('#backdrop');
  const radios = panel.querySelectorAll('input[name="mode"]');

  [...radios].forEach(r=>{
    r.checked = (r.value===mode);
    r.addEventListener('change', ()=>{
      mode = r.value;
      updateURL();
      setTitle();
      load();
      toggle(false);
    });
  });

  function openPanel(){
    btn.classList.add('active');
    btn.setAttribute('aria-expanded','true');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden','false');
    backdrop.classList.add('show');
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closePanel(){
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded','false');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden','true');
    backdrop.classList.remove('show');
    setTimeout(()=>{ backdrop.hidden = true; }, 200);
    document.body.style.overflow = '';
  }
  function toggle(force){
    const willOpen = force==null ? !panel.classList.contains('open') : force;
    if (willOpen) openPanel(); else closePanel();
  }

  btn.addEventListener('click', ()=> toggle());
  btn.addEventListener('touchstart', e=>{ e.preventDefault(); btn.click(); }, {passive:false});
  backdrop.addEventListener('click', closePanel);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closePanel(); });
}

function setTitle(){
  const h = qs('#view-title');
  if (mode === MODES.BREAKS) h.textContent = 'Plan przerw';
  else if (mode === MODES.ID) h.textContent = 'Plan zajęć - ID';
  else h.textContent = 'Plan zajęć - BT';
}

function getOffsetFromURL(){ const u=new URL(location.href); const w=parseInt(u.searchParams.get('w')||'0',10); return Number.isFinite(w)?w:0; }
function getModeFromURL(){ const u=new URL(location.href); const m=u.searchParams.get('mode'); if ([MODES.BREAKS,MODES.ID,MODES.BT].includes(m)) return m; return null; }
function updateURL(){
  const u = new URL(location.href);
  if (weekOffset!==0) u.searchParams.set('w', String(weekOffset)); else u.searchParams.delete('w');
  u.searchParams.set('mode', mode);
  history.replaceState(null, '', u.toString());
}
function zonedNow(tz=TZ){
  const now=new Date(); const inTz=new Date(now.toLocaleString('en-US',{timeZone:tz}));
  const diff=inTz.getTime()-now.getTime(); return new Date(now.getTime()+diff);
}
function baseMonday(now=zonedNow()){
  const day = now.getDay(); let monday = new Date(now);
  if (day===6) monday.setDate(monday.getDate()-(((monday.getDay()+6)%7))-7);
  else if (day===0) monday.setDate(monday.getDate()+1);
  else monday.setDate(monday.getDate()-(((monday.getDay()+6)%7)));
  monday.setHours(0,0,0,0);
  return monday;
}
function getDisplayRange(offsetWeeks=0){
  const mon=baseMonday(); mon.setDate(mon.getDate()+offsetWeeks*7);
  const fri=new Date(mon); fri.setDate(mon.getDate()+4);
  return { from: iso(mon), to: iso(fri) };
}
function iso(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
