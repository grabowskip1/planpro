const API_BASE = 'https://uz-plan.grabowski-piotrekk.workers.dev';

const GROUP_NP = '31489';
const GROUP_AIR = '31324';
const TZ = 'Europe/Warsaw';

const MODES = {
  BREAKS: 'breaks',
  NP: 'np',
  AIR: 'air'
};

const DAYS_PL = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela'
];

const WEEKDAYS = DAYS_PL.slice(0, 5);
const WEEKEND = DAYS_PL.slice(5);

let weekOffset = getOffsetFromURL();
let mode = getModeFromURL() || MODES.BREAKS;

document.addEventListener('DOMContentLoaded', () => {
  ensureWeekSwitchUI();
  mountMenu();
  bindWeekButtons();
  load();
});

async function load() {
  setTitle();
  setRangeLabel();
  qs('#status').textContent = 'Ładowanie…';

  try {
    if (mode === MODES.NP) {
      const { from, to } = rangeForDays(WEEKEND);
      const entries = await fetchPlan(GROUP_NP, from, to);
      renderLessons(entries, WEEKEND);
    } else if (mode === MODES.AIR) {
      const { from, to } = rangeForDays(WEEKDAYS);
      const entries = await fetchPlan(GROUP_AIR, from, to);
      renderLessons(entries, WEEKDAYS);
    } else {
      const npRange = rangeForDays(WEEKEND);
      const airRange = rangeForDays(WEEKDAYS);

      const [npEntries, airEntries] = await Promise.all([
        fetchPlan(GROUP_NP, npRange.from, npRange.to),
        fetchPlan(GROUP_AIR, airRange.from, airRange.to)
      ]);

      renderBreaks(npEntries, airEntries);
    }

    qs('#status').textContent = '';
  } catch (err) {
    console.error(err);
    qs('#status').textContent = 'Błąd pobierania danych.';
    clearCols();
  }
}

// ===== API =====

async function fetchPlan(group, from, to) {
  const params = new URLSearchParams({
    group,
    from,
    to
  });

  const res = await fetch(`${API_BASE}/api/plan?${params}`);

  if (!res.ok) {
    let message = `HTTP ${res.status}`;

    try {
      const data = await res.json();
      if (data?.error) message += `: ${data.error}`;
    } catch {
      // Brak JSON-u w odpowiedzi błędu.
    }

    throw new Error(message);
  }

  const data = await res.json();
  return data.entries || [];
}

// ===== week/date =====

function datesForWeek(offset = weekOffset) {
  const monday = baseMonday();
  monday.setDate(monday.getDate() + offset * 7);

  const out = {};

  for (let i = 0; i < DAYS_PL.length; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    out[DAYS_PL[i]] = date;
  }

  return out;
}

function rangeForDays(days) {
  const dates = datesForWeek(weekOffset);

  return {
    from: iso(dates[days[0]]),
    to: iso(dates[days[days.length - 1]])
  };
}

function currentModeRange() {
  if (mode === MODES.NP) {
    return rangeForDays(WEEKEND);
  }

  if (mode === MODES.AIR) {
    return rangeForDays(WEEKDAYS);
  }

  return rangeForDays(DAYS_PL);
}

function setRangeLabel() {
  const { from, to } = currentModeRange();
  qs('#range').textContent = `${from} — ${to}`;
}

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();

  return `${dd}.${mm}.${yyyy}`;
}

// ===== lessons =====

function renderLessons(entries, days) {
  const byDay = groupBy(entries, entry => entry.day);
  const dates = datesForWeek(weekOffset);

  clearCols();

  const leftCount = Math.ceil(days.length / 2);

  days.forEach((day, index) => {
    const rows = (byDay[day] || []).sort((a, b) =>
      a.from.localeCompare(b.from)
    );

    const target = index < leftCount
      ? qs('#col-left')
      : qs('#col-right');

    target.appendChild(dayCard(day, rows, dates[day]));
  });
}

// ===== breaks =====

function renderBreaks(npEntries, airEntries) {
  const dates = datesForWeek(weekOffset);
  clearCols();

  const items = [
    ...WEEKDAYS.map(day => ({
      day,
      plan: '21AiR SP',
      entries: airEntries
    })),
    ...WEEKEND.map(day => ({
      day,
      plan: '11E NP',
      entries: npEntries
    }))
  ];

  const leftCount = 4;

  items.forEach((item, index) => {
    const target = index < leftCount
      ? qs('#col-left')
      : qs('#col-right');

    target.appendChild(
      breakCard(
        item.day,
        item.plan,
        item.entries,
        dates[item.day]
      )
    );
  });
}

function breakCard(day, plan, entries, dateObj) {
  const card = document.createElement('div');
  card.className = 'card';

  const h2 = document.createElement('h2');
  h2.textContent = day;
  card.appendChild(h2);

  const date = document.createElement('p');
  date.className = 'meta daydate';
  date.textContent = fmtDate(dateObj);
  card.appendChild(date);

  const planLabel = document.createElement('p');
  planLabel.className = 'plan-label';
  planLabel.textContent = plan;
  card.appendChild(planLabel);

  card.appendChild(hr());

  const busy = mergeIntervals(
    (entries || [])
      .filter(entry => entry.day === day)
      .map(toInterval)
  );

  if (!busy.length) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = 'Brak zajęć';
    card.appendChild(p);
    return card;
  }

  card.appendChild(
    infoLine(`Start: ${firstStart(busy) || '—'}`)
  );

  const breaks = invertIntervals(busy);

  if (!breaks.length) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = 'Brak przerw między zajęciami';
    card.appendChild(p);
  } else {
    for (const [start, end] of breaks) {
      const div = document.createElement('div');
      div.className = 'row';
      div.textContent = `${toHH(start)} — ${toHH(end)}`;
      card.appendChild(div);
    }
  }

  card.appendChild(
    infoLine(`Koniec: ${lastEnd(busy) || '—'}`)
  );

  return card;
}

function toInterval(entry) {
  return [toMin(entry.from), toMin(entry.to)];
}

function toMin(hm) {
  const [h, m] = hm.split(':').map(n => parseInt(n, 10));
  return h * 60 + m;
}

function toHH(mins) {
  const h = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, '0');

  return `${String(h).padStart(2, '0')}:${m}`;
}

function mergeIntervals(arr) {
  if (!arr || arr.length === 0) {
    return [];
  }

  const sorted = arr
    .map(interval => interval.slice())
    .sort((a, b) => a[0] - b[0]);

  const out = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    const last = out[out.length - 1];

    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      out.push([start, end]);
    }
  }

  return out;
}

function invertIntervals(busy) {
  if (!busy || busy.length === 0) {
    return [];
  }

  const free = [];
  let cursor = busy[0][1];

  for (let i = 1; i < busy.length; i++) {
    const [start, end] = busy[i];

    if (start > cursor) {
      free.push([cursor, start]);
    }

    cursor = Math.max(cursor, end);
  }

  return free;
}

function firstStart(busy) {
  return busy.length ? toHH(busy[0][0]) : null;
}

function lastEnd(busy) {
  return busy.length
    ? toHH(busy[busy.length - 1][1])
    : null;
}

// ===== UI helpers =====

function dayCard(day, rows, dateObj) {
  const card = document.createElement('div');
  card.className = 'card';

  const h2 = document.createElement('h2');
  h2.textContent = day;
  card.appendChild(h2);

  if (dateObj) {
    const sub = document.createElement('p');
    sub.className = 'meta daydate';
    sub.textContent = fmtDate(dateObj);
    card.appendChild(sub);
  }

  card.appendChild(hr());

  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = 'Brak zajęć';
    card.appendChild(p);
  } else {
    for (const row of rows) {
      const div = document.createElement('div');
      div.className = 'row';
      div.textContent = [
        row.from,
        row.to,
        row.subject,
        row.type,
        row.teacher,
        row.room
      ].join(' | ');

      card.appendChild(div);
    }
  }

  return card;
}

function infoLine(text) {
  const p = document.createElement('p');
  p.className = 'meta';
  p.textContent = text;
  return p;
}

function groupBy(arr, key) {
  return (arr || []).reduce((acc, item) => {
    const groupKey = typeof key === 'function'
      ? key(item)
      : item[key];

    (acc[groupKey] ||= []).push(item);
    return acc;
  }, {});
}

function hr() {
  const div = document.createElement('div');
  div.className = 'rule';
  return div;
}

function qs(sel) {
  const el = document.querySelector(sel);

  if (!el) {
    throw new Error(`Missing ${sel}`);
  }

  return el;
}

function clearCols() {
  qs('#col-left').innerHTML = '';
  qs('#col-right').innerHTML = '';
}

function ensureWeekSwitchUI() {
  const host = qs('#weeks');
  host.innerHTML = '';

  const prev = document.createElement('button');
  prev.id = 'prev';
  prev.type = 'button';
  prev.textContent = '◀︎';
  prev.setAttribute('aria-label', 'Poprzedni tydzień');

  const range = document.createElement('span');
  range.id = 'range';
  range.className = 'range';
  range.textContent = '';

  const next = document.createElement('button');
  next.id = 'next';
  next.type = 'button';
  next.textContent = '▶︎';
  next.setAttribute('aria-label', 'Następny tydzień');

  host.append(prev, range, next);
}

function bindWeekButtons() {
  qs('#prev').addEventListener('click', () => {
    weekOffset--;
    updateURL();
    load();
  });

  qs('#next').addEventListener('click', () => {
    weekOffset++;
    updateURL();
    load();
  });
}

function mountMenu() {
  const btn = qs('#hamburger');
  const panel = qs('#sidepanel');
  const backdrop = qs('#backdrop');
  const radios = panel.querySelectorAll('input[name="mode"]');

  [...radios].forEach(radio => {
    radio.checked = radio.value === mode;

    radio.addEventListener('change', () => {
      mode = radio.value;
      updateURL();
      load();
      toggle(false);
    });
  });

  function openPanel() {
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('show');
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('show');

    setTimeout(() => {
      backdrop.hidden = true;
    }, 200);

    document.body.style.overflow = '';
  }

  function toggle(force) {
    const willOpen = force == null
      ? !panel.classList.contains('open')
      : force;

    if (willOpen) {
      openPanel();
    } else {
      closePanel();
    }
  }

  btn.addEventListener('click', () => toggle());

  btn.addEventListener('touchstart', event => {
    event.preventDefault();
    btn.click();
  }, { passive: false });

  backdrop.addEventListener('click', closePanel);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePanel();
    }
  });
}

function setTitle() {
  const h = qs('#view-title');

  if (mode === MODES.BREAKS) {
    h.textContent = 'Plan przerw';
  } else if (mode === MODES.NP) {
    h.textContent = 'Plan zajęć - 11E NP';
  } else {
    h.textContent = 'Plan zajęć - 21AiR SP';
  }
}

// ===== URL state =====

function getOffsetFromURL() {
  const url = new URL(location.href);
  const value = parseInt(url.searchParams.get('w') || '0', 10);

  return Number.isFinite(value) ? value : 0;
}

function getModeFromURL() {
  const url = new URL(location.href);
  const value = url.searchParams.get('mode');

  if (Object.values(MODES).includes(value)) {
    return value;
  }

  return null;
}

function updateURL() {
  const url = new URL(location.href);

  if (weekOffset !== 0) {
    url.searchParams.set('w', String(weekOffset));
  } else {
    url.searchParams.delete('w');
  }

  url.searchParams.set('mode', mode);
  history.replaceState(null, '', url.toString());
}

// ===== timezone =====

function zonedToday(tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    12,
    0,
    0,
    0
  );
}

function baseMonday(now = zonedToday()) {
  const monday = new Date(now);
  const distance = (monday.getDay() + 6) % 7;

  monday.setDate(monday.getDate() - distance);
  monday.setHours(12, 0, 0, 0);

  return monday;
}

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
}
