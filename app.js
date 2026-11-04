/* zSAM Usage Tracker
 * A browser-only app for tracking IBM Z software usage against entitlements.
 * All data is kept in this browser's localStorage. Nothing is sent anywhere.
 */
'use strict';

const STORE_KEY = 'zsam-tracker-v1';
const PREFS_KEY = 'zsam-tracker-prefs-v1';

/** state.usage:        [{month:'YYYY-MM', cpc, lpar, pid, product, msu}]
 *  state.entitlements: [{id, pid, product, metric, licensedMsu, annualCost, renewal:'YYYY-MM-DD', contract, notes}] */
let state = { usage: [], entitlements: [] };
let selectedPid = null;

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pidKey = (s) => String(s ?? '').trim().toUpperCase();
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n)) ? '–'
  : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => (n === null || n === undefined) ? '–'
  : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function normMonth(v) {
  v = String(v ?? '').trim();
  let m = v.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?$/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0');
  m = v.match(/^(\d{4})(\d{2})$/);
  if (m) return m[1] + '-' + m[2];
  m = v.match(/^(\d{1,2})[-\/.](\d{4})$/);
  if (m) return m[2] + '-' + m[1].padStart(2, '0');
  m = v.toLowerCase().match(/^([a-z]{3})[a-z]*[\s\-\/,]+(\d{4})$/);
  if (m) {
    const i = MONTH_NAMES.indexOf(m[1]);
    if (i >= 0) return m[2] + '-' + String(i + 1).padStart(2, '0');
  }
  return null;
}
function normDate(v) {
  v = String(v ?? '').trim();
  if (!v) return '';
  let m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); // assume US M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
function daysUntil(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function setMsg(sel, text, kind) {
  const el = $(sel);
  el.textContent = text;
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

/* ---------- storage ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      state.usage = Array.isArray(d.usage) ? d.usage : [];
      state.entitlements = Array.isArray(d.entitlements) ? d.entitlements : [];
    }
  } catch (e) { /* storage unavailable: start empty */ }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Could not save in this browser. Use Data → Export to keep a copy.');
  }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
}
function savePref(key, value) {
  try {
    const p = loadPrefs(); p[key] = value;
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch (e) { /* ignore */ }
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  // Accept semicolon- or tab-separated files too (common in exports)
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== '')).map((r) => r.map((v) => v.trim()));
}
function toCSV(rows) {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n') + '\r\n';
}
function mapHeaders(header, spec) {
  const h = header.map(norm);
  const idx = {};
  for (const [key, aliases] of Object.entries(spec)) idx[key] = h.findIndex((x) => aliases.includes(x));
  return idx;
}
const USAGE_COLS = {
  month: ['month', 'period', 'reportmonth', 'yearmonth', 'reportingperiod', 'date'],
  cpc: ['cpc', 'cpcserial', 'machine', 'serial', 'machineserial', 'serialnumber', 'cec'],
  lpar: ['lpar', 'lparname', 'system', 'sysname', 'sid', 'smfid', 'systemid'],
  pid: ['pid', 'productid', 'programid', 'programnumber', 'productnumber'],
  product: ['product', 'productname', 'name', 'description', 'programname'],
  msu: ['peakmsu', 'msu', 'msus', 'productmsu', 'max4hra', 'peak4hra', '4hrapeak', 'msupeak', 'billablemsu', 'productmaxcontributor'],
};
const ENT_COLS = {
  pid: USAGE_COLS.pid,
  product: USAGE_COLS.product,
  metric: ['metric', 'pricingmetric', 'pricing', 'chargetype', 'licensetype', 'type'],
  licensedMsu: ['licensedmsu', 'licensed', 'msu', 'entitledmsu', 'budgetedmsu', 'licensedbudgetedmsu', 'capacity', 'msulimit'],
  annualCost: ['annualcost', 'cost', 'annualcharge', 'yearlycost', 'snscost', 'price'],
  renewal: ['renewaldate', 'renewal', 'snsrenewal', 'snsdate', 'expiry', 'expirydate', 'expires', 'enddate'],
  contract: ['contract', 'contractid', 'ref', 'reference', 'agreement'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

function importUsageCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file has no data rows.');
  const idx = mapHeaders(rows[0], USAGE_COLS);
  const missing = [];
  if (idx.month < 0) missing.push('Month');
  if (idx.pid < 0 && idx.product < 0) missing.push('PID or Product');
  if (idx.msu < 0) missing.push('Peak_MSU');
  if (missing.length) throw new Error('Missing column(s): ' + missing.join(', ') + '. Found: ' + rows[0].join(', '));

  const incoming = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const month = normMonth(r[idx.month]);
    const msu = num(r[idx.msu]);
    const pid = pidKey(idx.pid >= 0 ? r[idx.pid] : '') || pidKey(r[idx.product]);
    if (!month || msu === null || !pid) { skipped++; continue; }
    incoming.push({
      month, msu, pid,
      cpc: idx.cpc >= 0 ? r[idx.cpc] : '',
      lpar: idx.lpar >= 0 ? r[idx.lpar] : '',
      product: idx.product >= 0 ? r[idx.product] : pid,
    });
  }
  if (!incoming.length) throw new Error('No valid rows found. Check the Month and MSU values.');
  const key = (u) => [u.month, norm(u.cpc), norm(u.lpar), u.pid].join('|');
  const incomingKeys = new Set(incoming.map(key));
  const before = state.usage.length;
  state.usage = state.usage.filter((u) => !incomingKeys.has(key(u)));
  const replaced = before - state.usage.length;
  // Collapse duplicate keys inside the file itself (last one wins)
  const merged = new Map(incoming.map((u) => [key(u), u]));
  state.usage.push(...merged.values());
  save();
  const months = new Set(incoming.map((u) => u.month));
  return `Imported ${merged.size} row(s) covering ${months.size} month(s)` +
    (replaced ? `, replacing ${replaced} existing row(s)` : '') +
    (skipped ? `. Skipped ${skipped} row(s) with a missing month, PID or MSU.` : '.');
}

function importEntCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file has no data rows.');
  const idx = mapHeaders(rows[0], ENT_COLS);
  if (idx.pid < 0) throw new Error('Missing PID column. Found: ' + rows[0].join(', '));
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const pid = pidKey(r[idx.pid]);
    if (!pid) { skipped++; continue; }
    const get = (k) => (idx[k] >= 0 ? r[idx[k]] : '');
    const metricRaw = get('metric').toUpperCase();
    const rec = {
      pid,
      product: get('product') || pid,
      metric: ['MLC', 'IPLA', 'TFP'].includes(metricRaw) ? metricRaw : (metricRaw ? 'Other' : 'MLC'),
      licensedMsu: num(get('licensedMsu')),
      annualCost: num(get('annualCost')),
      renewal: normDate(get('renewal')),
      contract: get('contract'),
      notes: get('notes'),
    };
    const existing = state.entitlements.find((e) => pidKey(e.pid) === pid);
    if (existing) { Object.assign(existing, rec); updated++; }
    else { state.entitlements.push({ id: uid(), ...rec }); added++; }
  }
  save();
  return `Added ${added}, updated ${updated} entitlement(s)` + (skipped ? `, skipped ${skipped} row(s) without a PID.` : '.');
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function readFile(input, cb) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { cb(String(reader.result), file.name); input.value = ''; };
  reader.onerror = () => { toast('Could not read that file.'); input.value = ''; };
  reader.readAsText(file);
}

/* ---------- analysis ---------- */
function allMonths() {
  return Array.from(new Set(state.usage.map((u) => u.month))).sort();
}
/** Months in the look-back window ending at the latest month with data. */
function windowMonths(n) {
  const months = allMonths();
  if (!months.length) return [];
  if (!n) return months;
  const latest = months[months.length - 1];
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(latest, -i));
  return out;
}
/** Monthly total MSU per PID: Map pid -> Map month -> msu */
function monthlyTotals() {
  const map = new Map();
  for (const u of state.usage) {
    const p = pidKey(u.pid);
    if (!map.has(p)) map.set(p, new Map());
    const m = map.get(p);
    m.set(u.month, (m.get(u.month) || 0) + (Number(u.msu) || 0));
  }
  return map;
}
function productNames() {
  const names = new Map();
  for (const u of state.usage) if (u.product) names.set(pidKey(u.pid), u.product);
  for (const e of state.entitlements) if (e.product) names.set(pidKey(e.pid), e.product);
  return names;
}
function entitlementsByPid() {
  const map = new Map();
  for (const e of state.entitlements) {
    const p = pidKey(e.pid);
    const cur = map.get(p) || { licensedMsu: null, annualCost: null, metric: e.metric, items: [] };
    if (e.licensedMsu !== null && e.licensedMsu !== undefined) cur.licensedMsu = (cur.licensedMsu || 0) + Number(e.licensedMsu);
    if (e.annualCost !== null && e.annualCost !== undefined) cur.annualCost = (cur.annualCost || 0) + Number(e.annualCost);
    cur.items.push(e);
    map.set(p, cur);
  }
  return map;
}
/** One summary row per product (entitled or used) for a set of months. */
function analyse(months) {
  const totals = monthlyTotals();
  const ents = entitlementsByPid();
  const names = productNames();
  const monthSet = new Set(months);
  const pids = new Set([...totals.keys(), ...ents.keys()]);
  const latest = months[months.length - 1];
  const rows = [];
  for (const pid of pids) {
    const t = totals.get(pid) || new Map();
    let peak = 0, peakMonth = null, usedMonths = 0, lastUsed = null;
    for (const [m, v] of t) {
      if (v > 0 && (!lastUsed || m > lastUsed)) lastUsed = m;
      if (!monthSet.has(m)) continue;
      if (v > 0) usedMonths++;
      if (v > peak) { peak = v; peakMonth = m; }
    }
    const ent = ents.get(pid);
    const licensed = ent ? ent.licensedMsu : null;
    const current = latest ? (t.get(latest) || 0) : 0;
    const util = licensed ? peak / licensed : null;
    let status;
    if (!ent && peak > 0) status = { key: 'unlicensed', label: 'Not entitled', cls: 'info', rank: 0 };
    else if (!ent) continue; // only historic usage outside the window, no entitlement
    else if (peak === 0) status = { key: 'unused', label: 'Unused', cls: 'muted', rank: 3 };
    else if (util === null) status = { key: 'tracked', label: 'No MSU limit', cls: 'muted', rank: 5 };
    else if (util > 1) status = { key: 'over', label: 'Over', cls: 'bad', rank: 1 };
    else if (util >= 0.9) status = { key: 'near', label: 'Near limit', cls: 'warn', rank: 2 };
    else status = { key: 'ok', label: 'OK', cls: 'ok', rank: 4 };
    rows.push({
      pid, product: names.get(pid) || pid, metric: ent ? ent.metric : '', licensed, peak, peakMonth,
      current, util, usedMonths, lastUsed, annualCost: ent ? ent.annualCost : null, status, ent,
    });
  }
  rows.sort((a, b) => a.status.rank - b.status.rank || (b.util ?? -1) - (a.util ?? -1) || a.product.localeCompare(b.product));
  return rows;
}

/* ---------- rendering ---------- */
function badge(status) { return `<span class="badge ${status.cls}">${esc(status.label)}</span>`; }
function utilBar(util) {
  if (util === null) return '<span class="muted">–</span>';
  const pct = Math.round(util * 100);
  const cls = util > 1 ? 'bad' : util >= 0.9 ? 'warn' : '';
  return `<div style="display:flex;align-items:center;gap:8px">
    <div class="bar ${cls}" title="${pct}%"><span style="width:${Math.min(pct, 100)}%"></span></div>
    <span>${pct}%</span></div>`;
}
function emptyRow(cols, text) { return `<tr><td class="empty" colspan="${cols}">${esc(text)}</td></tr>`; }

function renderDashboard() {
  const n = Number($('#window-select').value);
  const months = windowMonths(n);
  const rows = analyse(months);
  const hasData = state.usage.length || state.entitlements.length;
  $('#empty-hint').classList.toggle('hidden', !!hasData);
  $('#period-label').textContent = months.length
    ? `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])} (latest month with data)` : '';

  const count = (k) => rows.filter((r) => r.status.key === k).length;
  const unusedCost = rows.filter((r) => r.status.key === 'unused').reduce((s, r) => s + (r.annualCost || 0), 0);
  const renewSoon = state.entitlements.filter((e) => e.renewal && daysUntil(e.renewal) <= 90 && daysUntil(e.renewal) >= 0).length;
  const totalCost = state.entitlements.reduce((s, e) => s + (Number(e.annualCost) || 0), 0);
  $('#kpis').innerHTML = [
    { label: 'Products tracked', value: rows.length, note: `${state.entitlements.length} entitlement(s)` },
    { label: 'Over licence', value: count('over'), note: `${count('near')} near the limit`, cls: count('over') ? 'bad' : '' },
    { label: 'Not entitled', value: count('unlicensed'), note: 'used, no entitlement', cls: count('unlicensed') ? 'info' : '' },
    { label: 'Unused', value: count('unused'), note: `${money(unusedCost)} / yr at stake`, cls: count('unused') ? 'warn' : '' },
    { label: 'Renewals ≤ 90 days', value: renewSoon, note: `${money(totalCost)} / yr total cost` },
  ].map((k) => `<div class="kpi ${k.cls || ''}"><div class="label">${esc(k.label)}</div>
      <div class="value">${esc(k.value)}</div><div class="note">${esc(k.note)}</div></div>`).join('');

  const head = `<thead><tr><th>Status</th><th>Product</th><th>PID</th><th>Metric</th>
    <th class="num">Licensed MSU</th><th class="num">Peak MSU</th><th>Peak month</th>
    <th class="num">Latest MSU</th><th>Utilisation</th></tr></thead>`;
  const body = rows.length ? rows.map((r) => `<tr class="clickable ${r.pid === selectedPid ? 'selected' : ''}" data-pid="${esc(r.pid)}">
      <td>${badge(r.status)}</td><td>${esc(r.product)}</td><td class="nowrap">${esc(r.pid)}</td><td>${esc(r.metric || '–')}</td>
      <td class="num">${fmt(r.licensed)}</td><td class="num">${fmt(r.peak)}</td>
      <td>${r.peakMonth ? monthLabel(r.peakMonth) : '–'}</td><td class="num">${fmt(r.current)}</td>
      <td>${utilBar(r.util)}</td></tr>`).join('') : emptyRow(9, 'No products yet.');
  $('#dash-table').innerHTML = head + '<tbody>' + body + '</tbody>';

  if (selectedPid && !rows.some((r) => r.pid === selectedPid)) selectedPid = null;
  renderTrend(selectedPid, months, rows.find((r) => r.pid === selectedPid));
}

function renderTrend(pid, months, row) {
  const box = $('#trend-chart');
  if (!pid || !row) {
    $('#trend-title').textContent = 'Monthly trend';
    box.innerHTML = '<p class="muted">Tap a product above to see its monthly trend.</p>';
    return;
  }
  $('#trend-title').textContent = `Monthly trend: ${row.product} (${pid})`;
  const t = monthlyTotals().get(pid) || new Map();
  const vals = months.map((m) => t.get(m) || 0);
  const limit = row.licensed;
  const max = Math.max(1, ...vals, limit || 0) * 1.12;
  const W = 720, H = 260, padL = 44, padR = 12, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const bw = iw / Math.max(months.length, 1);
  const y = (v) => padT + ih - (v / max) * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly MSU for ${esc(row.product)}">`;
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" />
      <text class="lbl" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  months.forEach((m, i) => {
    const v = vals[i];
    const x = padL + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const over = limit && v > limit;
    svg += `<rect class="col ${over ? 'over' : ''}" x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, padT + ih - y(v))}" rx="3">
      <title>${monthLabel(m)}: ${fmt(v)} MSU</title></rect>`;
    if (months.length <= 12 && v > 0) svg += `<text class="val" x="${x + w / 2}" y="${y(v) - 4}" text-anchor="middle">${fmt(v)}</text>`;
    const every = Math.ceil(months.length / 12);
    if (i % every === 0) svg += `<text class="lbl" x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${monthLabel(m)}</text>`;
  });
  if (limit) svg += `<line class="limit" x1="${padL}" x2="${W - padR}" y1="${y(limit)}" y2="${y(limit)}" />`;
  svg += '</svg>';
  box.innerHTML = svg + `<div class="legend"><span><i style="background:var(--accent)"></i>Monthly MSU</span>
    <span><i style="background:var(--bad)"></i>Over licensed MSU</span>
    ${limit ? `<span><i style="background:none;border-top:2px dashed var(--bad);height:0;border-radius:0"></i>Licensed ${fmt(limit)} MSU</span>` : ''}</div>`;
}

function renderUsage() {
  const byMonth = new Map();
  for (const u of state.usage) {
    const m = byMonth.get(u.month) || { rows: 0, pids: new Set(), lpars: new Set(), msu: 0 };
    m.rows++; m.pids.add(pidKey(u.pid)); m.lpars.add(norm(u.cpc) + '/' + norm(u.lpar)); m.msu += Number(u.msu) || 0;
    byMonth.set(u.month, m);
  }
  const months = Array.from(byMonth.keys()).sort().reverse();
  const head = `<thead><tr><th>Month</th><th class="num">Rows</th><th class="num">Products</th>
    <th class="num">LPARs</th><th class="num">Total MSU</th><th></th></tr></thead>`;
  const body = months.length ? months.map((m) => {
    const d = byMonth.get(m);
    return `<tr><td>${monthLabel(m)} <span class="muted small">(${m})</span></td><td class="num">${d.rows}</td>
      <td class="num">${d.pids.size}</td><td class="num">${d.lpars.size}</td><td class="num">${fmt(d.msu)}</td>
      <td class="num"><button class="btn sm" data-del-month="${esc(m)}">Delete</button></td></tr>`;
  }).join('') : emptyRow(6, 'No usage imported yet.');
  $('#months-table').innerHTML = head + '<tbody>' + body + '</tbody>';
}

function renderEntitlements() {
  const list = [...state.entitlements].sort((a, b) => String(a.product).localeCompare(String(b.product)));
  const head = `<thead><tr><th>Product</th><th>PID</th><th>Metric</th><th class="num">Licensed MSU</th>
    <th class="num">Annual cost</th><th>Renewal</th><th>Contract</th><th>Notes</th><th></th></tr></thead>`;
  const body = list.length ? list.map((e) => `<tr>
      <td>${esc(e.product)}</td><td class="nowrap">${esc(e.pid)}</td><td>${esc(e.metric)}</td>
      <td class="num">${fmt(e.licensedMsu)}</td><td class="num">${money(e.annualCost)}</td>
      <td>${esc(e.renewal || '–')}</td><td>${esc(e.contract || '')}</td><td>${esc(e.notes || '')}</td>
      <td class="num" style="white-space:nowrap">
        <button class="btn sm" data-edit-ent="${esc(e.id)}">Edit</button>
        <button class="btn sm" data-del-ent="${esc(e.id)}">Delete</button></td></tr>`).join('')
    : emptyRow(9, 'No entitlements yet.');
  const total = list.reduce((s, e) => s + (Number(e.annualCost) || 0), 0);
  const foot = list.length ? `<tfoot><tr><td colspan="4">Total</td><td class="num">${money(total)}</td><td colspan="4"></td></tr></tfoot>` : '';
  $('#ent-table').innerHTML = head + '<tbody>' + body + '</tbody>' + foot;
}

function renderUnused() {
  const n = Number($('#unused-select').value);
  const lowPct = Number($('#lowuse-select').value) / 100;
  const months = windowMonths(n);
  const rows = analyse(months);

  const unused = rows.filter((r) => r.status.key === 'unused');
  const totalUnused = unused.reduce((s, r) => s + (r.annualCost || 0), 0);
  $('#unused-table').innerHTML = `<thead><tr><th>Product</th><th>PID</th><th>Metric</th><th class="num">Licensed MSU</th>
      <th>Last used</th><th class="num">Annual cost</th></tr></thead><tbody>` +
    (unused.length ? unused.map((r) => `<tr><td>${esc(r.product)}</td><td class="nowrap">${esc(r.pid)}</td><td>${esc(r.metric)}</td>
      <td class="num">${fmt(r.licensed)}</td><td>${r.lastUsed ? monthLabel(r.lastUsed) : 'Never (in data)'}</td>
      <td class="num">${money(r.annualCost)}</td></tr>`).join('')
      : emptyRow(6, months.length ? `Every entitled product was used in the last ${n} months.` : 'Import usage data first.')) +
    '</tbody>' + (unused.length ? `<tfoot><tr><td colspan="5">Potential annual saving</td><td class="num">${money(totalUnused)}</td></tr></tfoot>` : '');

  const low = rows.filter((r) => r.util !== null && r.peak > 0 && r.util < lowPct);
  $('#lowuse-table').innerHTML = `<thead><tr><th>Product</th><th>PID</th><th class="num">Licensed MSU</th>
      <th class="num">Peak MSU</th><th>Utilisation</th><th class="num">Annual cost</th></tr></thead><tbody>` +
    (low.length ? low.map((r) => `<tr><td>${esc(r.product)}</td><td class="nowrap">${esc(r.pid)}</td><td class="num">${fmt(r.licensed)}</td>
      <td class="num">${fmt(r.peak)}</td><td>${utilBar(r.util)}</td><td class="num">${money(r.annualCost)}</td></tr>`).join('')
      : emptyRow(6, 'No low-use products.')) + '</tbody>';

  const unl = rows.filter((r) => r.status.key === 'unlicensed');
  $('#unlicensed-table').innerHTML = `<thead><tr><th>Product</th><th>PID</th><th class="num">Peak MSU</th>
      <th>Peak month</th><th class="num">Months used</th></tr></thead><tbody>` +
    (unl.length ? unl.map((r) => `<tr><td>${esc(r.product)}</td><td class="nowrap">${esc(r.pid)}</td><td class="num">${fmt(r.peak)}</td>
      <td>${r.peakMonth ? monthLabel(r.peakMonth) : '–'}</td><td class="num">${r.usedMonths}</td></tr>`).join('')
      : emptyRow(5, 'Everything used has an entitlement.')) + '</tbody>';
}

function renderRenewals() {
  const n = Number($('#renew-select').value);
  const list = state.entitlements
    .filter((e) => e.renewal)
    .map((e) => ({ e, days: daysUntil(e.renewal) }))
    .filter((x) => x.days <= n)
    .sort((a, b) => a.days - b.days);
  const status = (d) => d < 0 ? { label: 'Overdue', cls: 'bad' } : d <= 30 ? { label: 'Due ≤ 30 days', cls: 'bad' }
    : d <= 60 ? { label: 'Due ≤ 60 days', cls: 'warn' } : { label: 'Upcoming', cls: 'ok' };
  const usage = analyse(windowMonths(12));
  const usedMap = new Map(usage.map((r) => [r.pid, r]));
  $('#renew-table').innerHTML = `<thead><tr><th>Status</th><th>Renewal date</th><th class="num">Days</th><th>Product</th>
      <th>PID</th><th class="num">Annual cost</th><th>12-month usage</th><th>Contract</th></tr></thead><tbody>` +
    (list.length ? list.map(({ e, days }) => {
      const u = usedMap.get(pidKey(e.pid));
      const used = !u ? '–' : u.status.key === 'unused' ? '<span class="badge muted">Unused: review</span>' : badge(u.status);
      return `<tr><td>${badge(status(days))}</td><td class="nowrap">${esc(e.renewal)}</td><td class="num">${days}</td>
        <td>${esc(e.product)}</td><td class="nowrap">${esc(e.pid)}</td><td class="num">${money(e.annualCost)}</td>
        <td>${used}</td><td>${esc(e.contract || '')}</td></tr>`;
    }).join('') : emptyRow(8, `No renewals in the next ${n} days.`)) + '</tbody>';
}

function renderStorage() {
  let bytes = 0;
  try { bytes = (localStorage.getItem(STORE_KEY) || '').length; } catch (e) { /* ignore */ }
  $('#storage-info').textContent = `${state.usage.length} usage row(s), ${state.entitlements.length} entitlement(s), ` +
    `about ${fmt(bytes / 1024, 1)} KB stored in this browser.`;
}

function renderAll() {
  renderDashboard(); renderUsage(); renderEntitlements(); renderUnused(); renderRenewals(); renderStorage();
}

/* ---------- entitlement form ---------- */
function resetEntForm() {
  const f = $('#ent-form');
  f.reset(); f.id.value = '';
  $('#ent-form-title').textContent = 'Add entitlement';
  $('#ent-submit').textContent = 'Add entitlement';
  $('#ent-cancel').hidden = true;
}
function editEnt(id) {
  const e = state.entitlements.find((x) => x.id === id);
  if (!e) return;
  const f = $('#ent-form');
  f.id.value = e.id; f.pid.value = e.pid; f.product.value = e.product; f.metric.value = e.metric || 'MLC';
  f.licensedMsu.value = e.licensedMsu ?? ''; f.annualCost.value = e.annualCost ?? '';
  f.renewal.value = e.renewal || ''; f.contract.value = e.contract || ''; f.notes.value = e.notes || '';
  $('#ent-form-title').textContent = 'Edit entitlement';
  $('#ent-submit').textContent = 'Save changes';
  $('#ent-cancel').hidden = false;
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- sample data ---------- */
function sampleData() {
  // Deterministic pseudo-random so the sample looks the same each time.
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const now = new Date();
  const last = addMonths(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), -1);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(last, i - 11));
  const day = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const lpars = [['CPC1', 'PRD1', 0.45], ['CPC1', 'PRD2', 0.35], ['CPC2', 'DEV1', 0.2]];

  // Fictional products and numbers for demonstration only. PIDs are illustrative.
  const products = [
    // pid, product, metric, licensed, cost, renewal offset (days), base MSU, swing, months active (from end)
    ['5650-ZOS', 'z/OS', 'MLC', 900, 1450000, 200, 820, 60, 12],
    ['5655-CIC', 'CICS Transaction Server', 'MLC', 450, 620000, 45, 410, 70, 12],
    ['5698-DB2', 'Db2 for z/OS', 'MLC', 600, 880000, 120, 545, 30, 12],
    ['5655-MQZ', 'IBM MQ for z/OS', 'MLC', 250, 210000, 75, 120, 25, 12],
    ['5635-IMS', 'IMS Database Manager', 'MLC', 200, 340000, 20, 110, 15, 5],
    ['5655-COB', 'Enterprise COBOL for z/OS', 'IPLA', 300, 95000, -10, 150, 30, 12],
    ['5655-FMG', 'File Manager for z/OS', 'IPLA', 100, 42000, 150, 0, 0, 0],
    ['5655-OMG', 'OMEGAMON for z/OS', null, null, null, null, 95, 10, 12], // used, but not entitled
  ];
  const usage = [];
  const entitlements = [];
  for (const [pid, product, metric, licensed, cost, renew, base, swing, activeMonths] of products) {
    if (metric) {
      entitlements.push({
        id: uid(), pid, product, metric, licensedMsu: licensed, annualCost: cost,
        renewal: renew === null ? '' : day(renew), contract: 'SAMPLE-' + pid.slice(-3), notes: 'Sample data',
      });
    }
    months.forEach((m, i) => {
      // IMS stops being used after month 5 (decommissioned)
      const active = activeMonths === 12 ? true : activeMonths > 0 && i < activeMonths;
      if (!active || base === 0) return;
      const total = Math.max(0, base + (rnd() - 0.4) * swing * 2);
      for (const [cpc, lpar, share] of lpars) {
        usage.push({ month: m, cpc, lpar, pid, product, msu: Math.round(total * share) });
      }
    });
  }
  return { usage, entitlements };
}

/* ---------- events ---------- */
function bind() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  const prefs = loadPrefs();
  for (const [id, key] of [['#window-select', 'window'], ['#unused-select', 'unused'], ['#lowuse-select', 'lowuse'], ['#renew-select', 'renew']]) {
    const el = $(id);
    if (prefs[key] && Array.from(el.options).some((o) => o.value === prefs[key])) el.value = prefs[key];
    el.addEventListener('change', () => { savePref(key, el.value); renderAll(); });
  }

  $('#dash-table').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-pid]');
    if (!tr) return;
    selectedPid = tr.dataset.pid === selectedPid ? null : tr.dataset.pid;
    renderDashboard();
    if (selectedPid) $('#trend-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#usage-file').addEventListener('change', (ev) => readFile(ev.target, (text) => {
    try { setMsg('#usage-msg', importUsageCSV(text), 'ok'); renderAll(); }
    catch (e) { setMsg('#usage-msg', e.message, 'bad'); }
  }));
  $('#ent-file').addEventListener('change', (ev) => readFile(ev.target, (text) => {
    try { setMsg('#ent-msg', importEntCSV(text), 'ok'); renderAll(); }
    catch (e) { setMsg('#ent-msg', e.message, 'bad'); }
  }));
  $('#restore-file').addEventListener('change', (ev) => readFile(ev.target, (text) => {
    try {
      const d = JSON.parse(text);
      if (!Array.isArray(d.usage) || !Array.isArray(d.entitlements)) throw new Error('Not a zSAM backup file.');
      if (!confirm(`Restore ${d.usage.length} usage row(s) and ${d.entitlements.length} entitlement(s)? This replaces your current data.`)) return;
      state = { usage: d.usage, entitlements: d.entitlements.map((e) => ({ id: e.id || uid(), ...e })) };
      save(); renderAll(); setMsg('#data-msg', 'Backup restored.', 'ok');
    } catch (e) { setMsg('#data-msg', 'Could not restore: ' + e.message, 'bad'); }
  }));

  $('#months-table').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-del-month]');
    if (!b) return;
    const m = b.dataset.delMonth;
    if (!confirm(`Delete all usage for ${monthLabel(m)}?`)) return;
    state.usage = state.usage.filter((u) => u.month !== m);
    save(); renderAll(); toast(`Deleted usage for ${monthLabel(m)}.`);
  });
  $('#ent-table').addEventListener('click', (ev) => {
    const ed = ev.target.closest('[data-edit-ent]');
    if (ed) return editEnt(ed.dataset.editEnt);
    const del = ev.target.closest('[data-del-ent]');
    if (!del) return;
    const e = state.entitlements.find((x) => x.id === del.dataset.delEnt);
    if (!e || !confirm(`Delete the entitlement for ${e.product} (${e.pid})?`)) return;
    state.entitlements = state.entitlements.filter((x) => x.id !== e.id);
    save(); renderAll(); toast('Entitlement deleted.');
  });

  $('#ent-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const rec = {
      pid: pidKey(f.pid.value), product: f.product.value.trim(), metric: f.metric.value,
      licensedMsu: num(f.licensedMsu.value), annualCost: num(f.annualCost.value),
      renewal: f.renewal.value, contract: f.contract.value.trim(), notes: f.notes.value.trim(),
    };
    if (!rec.pid || !rec.product) return toast('PID and product are required.');
    const dupe = state.entitlements.find((x) => pidKey(x.pid) === rec.pid && x.id !== f.id.value);
    if (dupe && !confirm(`There is already an entitlement for ${rec.pid}. Add another one? (Licensed MSU and cost will be added together.)`)) return;
    if (f.id.value) {
      Object.assign(state.entitlements.find((x) => x.id === f.id.value) || {}, rec);
      toast('Entitlement updated.');
    } else {
      state.entitlements.push({ id: uid(), ...rec });
      toast('Entitlement added.');
    }
    save(); resetEntForm(); renderAll();
  });
  $('#ent-cancel').addEventListener('click', resetEntForm);

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'load-sample') {
      if ((state.usage.length || state.entitlements.length) && !confirm('Replace your current data with sample data?')) return;
      state = sampleData(); save(); selectedPid = null; renderAll(); showTab('dashboard');
      toast('Sample data loaded.');
    } else if (a === 'clear') {
      if (!confirm('Delete ALL usage and entitlements from this browser? Export a backup first if you need it.')) return;
      state = { usage: [], entitlements: [] }; save(); selectedPid = null; renderAll(); toast('All data cleared.');
    } else if (a === 'export') {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`zsam-backup-${stamp}.json`, JSON.stringify({ app: 'zsam-usage-tracker', version: 1, exported: new Date().toISOString(), ...state }, null, 2), 'application/json');
      setMsg('#data-msg', 'Backup downloaded.', 'ok');
    } else if (a === 'template-usage') {
      download('usage-template.csv', toCSV([['Month', 'CPC', 'LPAR', 'PID', 'Product', 'Peak_MSU']]), 'text/csv');
    } else if (a === 'template-ent') {
      download('entitlements-template.csv', toCSV([['PID', 'Product', 'Metric', 'Licensed_MSU', 'Annual_Cost', 'Renewal_Date', 'Contract', 'Notes']]), 'text/csv');
    }
  });
}

function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  savePref('tab', name);
  window.scrollTo({ top: 0 });
}

load();
bind();
renderAll();
const lastTab = loadPrefs().tab;
if (lastTab && $('#tab-' + lastTab)) showTab(lastTab);
