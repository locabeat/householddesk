'use strict';

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];
const IN = 'Έσοδο', OUT = 'Έξοδο';
const OWED = 'Μου Χρωστάνε', OWE = 'Χρωστάω';
const NO_CAT = 'Χωρίς κατηγορία';
// Η διεύθυνση του Apps Script (μπαίνει εδώ μόλις γίνει η ανάπτυξη), ώστε να χρειάζεται μόνο PIN.
const API_URL = 'https://script.google.com/macros/s/AKfycbzPSOSv8a5Y9-kf9RQq2b13aIZdJkML1hdMThy0NXoegBXQmP3gwdR8bTT1Djl5_slX/exec';

/* ---------- helpers ---------- */

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const eur = n => money.format(n || 0);
const sum = a => a.reduce((s, x) => s + x, 0);
const round2 = n => Math.round(n * 100) / 100;

function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function ymOf(iso) { return String(iso).slice(0, 7); }
function fmtDate(iso) { const [y, m, d] = String(iso).split('-'); return d ? `${d}/${m}/${y}` : ''; }
function monthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; }
function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!d) return 'Χωρίς ημερομηνία';
  return new Date(y, m - 1, d).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[€\s ]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function normalize(d) {
  d = d || {};
  const s = v => String(v ?? '').trim();
  return {
    profile: s(d.profile),
    tx: (d.tx || []).map(r => ({ id: s(r.id), date: s(r.date), type: s(r.type), amount: num(r.amount), cat: s(r.cat), sub: s(r.sub), note: s(r.note) })),
    loan: (d.loan || []).map(r => ({ id: s(r.id), date: s(r.date), type: s(r.type), person: s(r.person), amount: num(r.amount), note: s(r.note), paid: r.paid === true || String(r.paid).toLowerCase() === 'true' })),
    cat: (d.cat || []).map(r => ({ id: s(r.id), type: s(r.type), cat: s(r.cat), sub: s(r.sub) })),
    lists: (d.lists || []).map(r => ({ id: s(r.id), name: s(r.name), icon: s(r.icon) })),
    shop: (d.shop || []).map(r => ({
      id: s(r.id), list: s(r.list), name: s(r.name), qty: s(r.qty), note: s(r.note), photo: s(r.photo),
      addedBy: s(r.addedBy), done: r.done === true || String(r.done).toLowerCase() === 'true', doneBy: s(r.doneBy), doneAt: s(r.doneAt),
    })),
    prod: (d.prod || []).map(r => ({ id: s(r.id), name: s(r.name), photo: s(r.photo), list: s(r.list) })),
  };
}

/* ---------- state ---------- */

let cfg = store.get('household.cfg', { url: '', pin: '' });
if (!cfg.url && API_URL) cfg.url = API_URL;
let data = normalize(store.get('household.data', null));
const loggedIn = () => cfg.url === 'demo' || (!!cfg.url && !!cfg.pin);
const today = new Date();
const ui = {
  tab: 'home',
  year: today.getFullYear(),
  month: today.getMonth(),
  txMonth: ymOf(isoDate(today)),
  txType: 'all',
  txCat: '',
  txQuery: '',
  catType: OUT,
  setSection: 'fin',
  shopList: '',
  shopDraft: '',
  qaPhoto: '',
  prodQuery: '',
};
let chart = null;
let busyCount = 0;

function saveData() { store.set('household.data', data); }
function saveCfg() { store.set('household.cfg', cfg); }
function logout() {
  cfg = { url: cfg.url === 'demo' ? API_URL : cfg.url, pin: '' };
  saveCfg();
  data = normalize(null);
  saveData();
  ui.tab = 'login';
  render();
}
function setBusy(on) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  document.body.classList.toggle('busy', busyCount > 0);
}
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, err ? 4500 : 2200);
}

/** Κατηγορίες ενός τύπου: Map κατηγορία → [υποκατηγορίες], με τη σειρά του φύλλου. */
function catMap(type) {
  const m = new Map();
  for (const r of data.cat) {
    if (r.type !== type || !r.cat) continue;
    if (!m.has(r.cat)) m.set(r.cat, []);
    if (r.sub && !m.get(r.cat).includes(r.sub)) m.get(r.cat).push(r.sub);
  }
  return m;
}

/* ---------- API ---------- */

async function api(action, payload = {}) {
  if (cfg.url === 'demo') return mockApi(action, payload);
  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, pin: cfg.pin }),
    });
  } catch {
    throw new Error('Δεν υπάρχει σύνδεση');
  }
  let j;
  try { j = await res.json(); } catch { throw new Error('Μη έγκυρη απάντηση — έλεγξε το URL'); }
  if (!j.ok) throw new Error(j.error || 'Σφάλμα');
  return j.data;
}

async function refresh(silent = false) {
  if (!loggedIn()) { ui.tab = 'login'; render(); return false; }
  setBusy(true);
  try {
    data = normalize(await api('all'));
    saveData();
    if (ui.tab === 'login') ui.tab = 'home';
    render();
    if (!silent) toast('Ενημερώθηκε');
    return true;
  } catch (e) {
    if (e.message === 'Λάθος PIN') { logout(); toast('Λάθος PIN', true); }
    else toast('Δεν έγινε ενημέρωση: ' + e.message, true);
    return false;
  } finally {
    setBusy(false);
  }
}

/** Στέλνει μια αλλαγή στο Sheet και ενημερώνει τα τοπικά δεδομένα. */
async function run(action, payload, okMsg) {
  setBusy(true);
  try {
    const res = await api(action, payload);
    const sheet = payload.sheet;
    if (action === 'add') data[sheet].push({ ...payload.row, ...res });
    else if (action === 'update') Object.assign(data[sheet].find(r => r.id === payload.row.id) || {}, payload.row, res);
    else if (action === 'delete') data[sheet] = data[sheet].filter(r => r.id !== payload.id);
    else data = await api('all');
    data = normalize(data);
    saveData();
    render();
    if (okMsg) toast(okMsg);
    // Τα ψώνια είναι κοινά και ο server ενημερώνει και τα αποθηκευμένα προϊόντα: συγχρονισμός στο παρασκήνιο.
    if (sheet === 'shop' || sheet === 'prod') refresh(true);
    return res || true;
  } catch (e) {
    toast('Σφάλμα: ' + e.message, true);
    return false;
  } finally {
    setBusy(false);
  }
}

/* ---------- δοκιμαστική λειτουργία (χωρίς Sheet) ---------- */

function demoSeed() {
  const cats = [
    [IN, 'Μισθός', ''], [IN, 'Paypall', ''], [IN, 'Cashback', ''], [IN, 'Gifts', ''],
    [OUT, 'Λογαριασμοί', 'Starlink'], [OUT, 'Λογαριασμοί', 'Vodafone'],
    [OUT, 'Συνδρομές', 'Spotify'], [OUT, 'Συνδρομές', 'Discord'], [OUT, 'Συνδρομές', 'iCloud'],
    [OUT, 'Μετακίνηση', 'Βενζίνη'], [OUT, 'Μετακίνηση', 'Διόδια'],
    [OUT, 'Daily Habits', 'Καφές'], [OUT, 'Daily Habits', 'Snacks'], [OUT, 'Daily Habits', 'Φαγητό έξω'],
    [OUT, 'Shopping', 'Ρούχα'], [OUT, 'Shopping', 'Supermarket'], [OUT, 'Fun', 'Games'],
  ];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const y = today.getFullYear();
  const tx = [];
  for (let m = 0; m <= today.getMonth(); m++) {
    const d = day => `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    tx.push({ id: uid(), date: d(14), type: IN, amount: 400, cat: 'Μισθός', sub: '', note: 'GOLDLED' });
    tx.push({ id: uid(), date: d(28), type: IN, amount: 500, cat: 'Μισθός', sub: '', note: 'PURE' });
    tx.push({ id: uid(), date: d(1), type: OUT, amount: 80, cat: 'Λογαριασμοί', sub: 'Starlink', note: '' });
    tx.push({ id: uid(), date: d(3), type: OUT, amount: 8.99, cat: 'Συνδρομές', sub: 'Spotify', note: '' });
    tx.push({ id: uid(), date: d(5), type: OUT, amount: 50, cat: 'Μετακίνηση', sub: 'Βενζίνη', note: '' });
    for (let k = 0; k < 8; k++) {
      tx.push({ id: uid(), date: d(2 + k * 3), type: OUT, amount: round2(2 + Math.random() * 20), cat: 'Daily Habits', sub: ['Καφές', 'Snacks', 'Φαγητό έξω'][k % 3], note: '' });
    }
    tx.push({ id: uid(), date: d(20), type: OUT, amount: round2(40 + Math.random() * 90), cat: 'Shopping', sub: 'Supermarket', note: '' });
  }
  return {
    tx,
    cat: cats.map(([type, cat, sub]) => ({ id: uid(), type, cat, sub })),
    loan: [
      { id: uid(), date: `${y}-03-27`, type: OWED, person: 'Βαγγέλης', amount: 450, note: '', paid: false },
      { id: uid(), date: `${y}-04-04`, type: OWE, person: 'D&D', amount: 60, note: '', paid: false },
    ],
    lists: [{ id: uid(), name: 'Σούπερ μάρκετ', icon: '🛒' }, { id: uid(), name: 'IKEA', icon: '🛋️' }],
    shop: [
      { id: uid(), list: 'Σούπερ μάρκετ', name: 'Γάλα', qty: '2', note: 'φρέσκο, όχι light', photo: '', addedBy: 'Άννα', done: false },
      { id: uid(), list: 'Σούπερ μάρκετ', name: 'Ψωμί του τοστ', qty: '', note: '', photo: '', addedBy: 'Γιώργος', done: false },
      { id: uid(), list: 'Σούπερ μάρκετ', name: 'Αυγά', qty: '6', note: '', photo: '', addedBy: 'Άννα', done: true, doneBy: 'Γιώργος', doneAt: `${isoDate(today)} 18:40` },
      { id: uid(), list: 'IKEA', name: 'Κρεμάστρες', qty: '10', note: '', photo: '', addedBy: 'Άννα', done: false },
    ],
    prod: [],
    photos: {},
  };
}

function mockApi(action, p) {
  const db = store.get('household.demo', null) || demoSeed();
  db.lists ||= []; db.shop ||= []; db.prod ||= []; db.photos ||= {};
  const uid = () => Math.random().toString(36).slice(2, 10);
  let res = {};
  const same = (r, sub) => r.type === p.type && r.cat === p.cat && (!sub || r.sub === p.sub);
  const low = s => String(s || '').trim().toLowerCase();
  const inUse = id => db.prod.some(r => r.photo === id) || db.shop.some(r => r.photo === id);
  const trash = id => { if (id && !inUse(id)) delete db.photos[id]; };
  const remember = (name, photo, list) => {
    const pr = db.prod.find(r => low(r.name) === low(name));
    if (!pr) { db.prod.push({ id: uid(), name, photo: photo || '', list }); return photo || ''; }
    if (!photo) return pr.photo;
    if (photo !== pr.photo) { const old = pr.photo; pr.photo = photo; trash(old); }
    return photo;
  };
  if (action === 'all') { const { photos, ...rest } = db; res = { ...rest, profile: 'Δοκιμή' }; }
  else if (action === 'add') {
    const row = { ...p.row, id: uid() };
    if (p.sheet === 'shop') Object.assign(row, { addedBy: 'Δοκιμή', done: false, doneBy: '', doneAt: '', photo: remember(row.name, row.photo, row.list) });
    db[p.sheet].push(row);
    res = { id: row.id, addedBy: row.addedBy, photo: row.photo };
  } else if (action === 'update') {
    const r = db[p.sheet].find(x => x.id === p.row.id) || {};
    const oldPhoto = r.photo;
    Object.assign(r, p.row);
    if (p.sheet === 'shop' && 'done' in p.row) {
      r.doneBy = p.row.done ? 'Δοκιμή' : '';
      r.doneAt = p.row.done ? `${isoDate(new Date())} ${new Date().toTimeString().slice(0, 5)}` : '';
      res = { doneBy: r.doneBy, doneAt: r.doneAt };
    }
    if (p.sheet === 'shop' && 'photo' in p.row) {
      const pr = db.prod.find(x => low(x.name) === low(r.name));
      if (pr) pr.photo = r.photo; else remember(r.name, r.photo, r.list);
    }
    if (p.sheet === 'prod' && 'photo' in p.row) db.shop.forEach(x => { if (low(x.name) === low(r.name)) x.photo = r.photo; });
    if (oldPhoto && oldPhoto !== r.photo) trash(oldPhoto);
  } else if (action === 'delete') {
    const r = db[p.sheet].find(x => x.id === p.id);
    db[p.sheet] = db[p.sheet].filter(x => x.id !== p.id);
    if (r && p.sheet === 'prod') db.shop.forEach(x => { if (low(x.name) === low(r.name) && x.photo === r.photo) x.photo = ''; });
    if (r && r.photo) trash(r.photo);
  } else if (action === 'renameList') {
    const l = db.lists.find(x => x.id === p.id);
    db.shop.forEach(x => { if (x.list === l.name) x.list = p.name; });
    l.name = p.name;
    if ('icon' in p) l.icon = p.icon;
  } else if (action === 'deleteList') {
    const l = db.lists.find(x => x.id === p.id);
    const gone = db.shop.filter(x => x.list === l.name);
    db.shop = db.shop.filter(x => x.list !== l.name);
    db.lists = db.lists.filter(x => x.id !== p.id);
    gone.forEach(x => trash(x.photo));
  } else if (action === 'clearDone') {
    const gone = db.shop.filter(x => x.list === p.list && x.done);
    db.shop = db.shop.filter(x => !(x.list === p.list && x.done));
    gone.forEach(x => trash(x.photo));
  } else if (action === 'uploadPhoto') {
    res = { id: 'demo-' + uid() };
    db.photos[res.id] = p.data;
  } else if (action === 'photo') {
    res = { data: db.photos[p.id] || '' };
  } else if (action === 'renameCat') {
    const col = p.sub ? 'sub' : 'cat';
    for (const key of ['cat', 'tx']) db[key].forEach(r => { if (same(r, !!p.sub)) r[col] = p.name; });
  } else if (action === 'deleteCat') {
    db.cat = db.cat.filter(r => !same(r, !!p.sub));
    if (p.sub && !db.cat.some(r => same(r, false))) db.cat.push({ id: Math.random().toString(36).slice(2, 10), type: p.type, cat: p.cat, sub: '' });
  }
  store.set('household.demo', db);
  return new Promise(r => setTimeout(() => r(JSON.parse(JSON.stringify(res))), 250));
}

/* ---------- rendering ---------- */

const TITLES = { login: 'Household Desk', home: 'Household Desk', tx: 'Κινήσεις', loans: 'Δανεικά', settings: 'Ρυθμίσεις', shop: 'Ψώνια' };

function render() {
  if (!loggedIn()) ui.tab = 'login';
  document.body.classList.toggle('logged-out', ui.tab === 'login');
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#title').textContent = TITLES[ui.tab];
  $('#shopBtn').classList.toggle('active', ui.tab === 'shop');
  const missing = data.shop.filter(i => !i.done).length;
  $('#shopBadge').hidden = !missing;
  $('#shopBadge').textContent = missing > 99 ? '99+' : missing;
  const v = $('#view');
  if (chart) { chart.destroy(); chart = null; }
  if (ui.tab === 'login') renderLogin(v);
  else if (ui.tab === 'shop') renderShop(v);
  else if (ui.tab === 'home') renderHome(v);
  else if (ui.tab === 'tx') renderTx(v);
  else if (ui.tab === 'loans') renderLoans(v);
  else renderSettings(v);
}

function bars(entries, cls) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([k, v]) => `
    <div class="bar-row">
      <div class="bar-label"><span>${esc(k)}</span><b>${eur(v)}</b></div>
      <div class="bar"><i class="${cls}" style="width:${(v / max * 100).toFixed(1)}%"></i></div>
    </div>`).join('');
}

function renderHome(v) {
  const years = [...new Set([ui.year, today.getFullYear(), ...data.tx.map(t => +t.date.slice(0, 4)).filter(Boolean)])].sort((a, b) => b - a);
  const inYear = data.tx.filter(t => t.date.startsWith(ui.year + '-'));
  const months = Array.from({ length: 12 }, () => ({ inc: 0, out: 0 }));
  for (const t of inYear) {
    const m = +t.date.slice(5, 7) - 1;
    if (m < 0 || m > 11) continue;
    if (t.type === IN) months[m].inc += t.amount;
    else if (t.type === OUT) months[m].out += t.amount;
  }
  const totIn = sum(months.map(m => m.inc)), totOut = sum(months.map(m => m.out));

  const mm = String(ui.month + 1).padStart(2, '0');
  const inMonth = inYear.filter(t => t.date.slice(5, 7) === mm);
  const incBy = new Map();
  const outBy = new Map();
  for (const t of inMonth) {
    const c = t.cat || NO_CAT;
    if (t.type === IN) incBy.set(c, (incBy.get(c) || 0) + t.amount);
    else if (t.type === OUT) {
      if (!outBy.has(c)) outBy.set(c, { total: 0, subs: new Map() });
      const o = outBy.get(c);
      o.total += t.amount;
      const s = t.sub || '—';
      o.subs.set(s, (o.subs.get(s) || 0) + t.amount);
    }
  }
  const incEntries = [...incBy].sort((a, b) => b[1] - a[1]);
  const outEntries = [...outBy].sort((a, b) => b[1].total - a[1].total);
  const outMax = Math.max(1, ...outEntries.map(e => e[1].total));
  const mIn = sum(incEntries.map(e => e[1])), mOut = sum(outEntries.map(e => e[1].total));
  const win = n => `<span class="${n < 0 ? 'neg' : 'pos'}">${eur(n)}</span>`;

  v.innerHTML = `
    ${data.profile ? `<p class="hello">Γεια σου, <b>${esc(data.profile)}</b> 👋</p>` : ''}
    <div class="head-row">
      <h2>Σύνοψη έτους</h2>
      <select id="yearSel" class="year-select">${years.map(y => `<option ${y === ui.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Έσοδα</span><b class="pos">${eur(totIn)}</b></div>
      <div class="kpi"><span>Έξοδα</span><b class="neg">${eur(totOut)}</b></div>
      <div class="kpi hero"><span>Υπόλοιπο</span><b>${win(totIn - totOut)}</b></div>
    </div>

    <section class="card">
      <h2>Ανά μήνα</h2>
      <div class="chart-wrap"><canvas id="chart" aria-label="Έσοδα και έξοδα ανά μήνα"></canvas></div>
      <table class="months">
        <thead><tr><th>Μήνας</th><th>Έσοδα</th><th>Έξοδα</th><th>Υπόλοιπο</th></tr></thead>
        <tbody>${months.map((m, i) => `
          <tr data-m="${i}" class="${i === ui.month ? 'sel' : ''}">
            <td>${MONTHS[i]}</td><td>${eur(m.inc)}</td><td class="neg">${eur(m.out)}</td><td>${win(m.inc - m.out)}</td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td>Σύνολο</td><td>${eur(totIn)}</td><td class="neg">${eur(totOut)}</td><td>${win(totIn - totOut)}</td></tr></tfoot>
      </table>
    </section>

    <section class="card">
      <div class="month-nav">
        <button class="icon-btn" id="mPrev" aria-label="Προηγούμενος μήνας"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <div class="label">${MONTHS[ui.month]} ${ui.year}</div>
        <button class="icon-btn" id="mNext" aria-label="Επόμενος μήνας"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="kpis" style="margin:10px 0 0">
        <div class="kpi"><span>Έσοδα</span><b class="pos">${eur(mIn)}</b></div>
        <div class="kpi"><span>Έξοδα</span><b class="neg">${eur(mOut)}</b></div>
        <div class="kpi hero"><span>Υπόλοιπο</span><b>${win(mIn - mOut)}</b></div>
      </div>
      <div class="two-col">
        <div>
          <h3>Έσοδα από</h3>
          ${incEntries.length ? bars(incEntries, 'in') : '<p class="muted small">Κανένα έσοδο.</p>'}
        </div>
        <div>
          <h3>Έξοδα ανά κατηγορία</h3>
          ${outEntries.length ? outEntries.map(([c, o]) => `
            <details class="cat-break">
              <summary>
                <div class="bar-row">
                  <div class="bar-label"><span>${esc(c)}</span><b>${eur(o.total)}</b></div>
                  <div class="bar"><i class="out" style="width:${(o.total / outMax * 100).toFixed(1)}%"></i></div>
                </div>
              </summary>
              <div class="subs">${[...o.subs].sort((a, b) => b[1] - a[1]).map(([s, a]) => `<div><span>${esc(s)}</span><span>${eur(a)}</span></div>`).join('')}</div>
            </details>`).join('') : '<p class="muted small">Κανένα έξοδο.</p>'}
        </div>
      </div>
    </section>`;

  $('#yearSel').onchange = e => { ui.year = +e.target.value; render(); };
  $$('tbody tr[data-m]', v).forEach(tr => tr.onclick = () => { ui.month = +tr.dataset.m; render(); });
  $('#mPrev').onclick = () => { if (ui.month === 0) { ui.month = 11; ui.year--; } else ui.month--; render(); };
  $('#mNext').onclick = () => { if (ui.month === 11) { ui.month = 0; ui.year++; } else ui.month++; render(); };
  drawChart(months);
}

function drawChart(months) {
  const c = $('#chart');
  if (!c || !window.Chart) return;
  const cs = getComputedStyle(document.documentElement);
  const color = n => cs.getPropertyValue(n).trim();
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  chart = new Chart(c, {
    type: 'bar',
    data: {
      labels: MONTHS_SHORT,
      datasets: [
        { label: 'Έσοδα', data: months.map(m => round2(m.inc)), backgroundColor: color('--inc'), borderRadius: 6, barPercentage: .7, categoryPercentage: .7 },
        { label: 'Έξοδα', data: months.map(m => round2(m.out)), backgroundColor: color('--neg'), borderRadius: 6, barPercentage: .7, categoryPercentage: .7 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { align: 'end', labels: { color: color('--muted'), boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { family: 'Inter', weight: 600 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${eur(ctx.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: color('--muted') }, grid: { display: false } },
        y: { ticks: { color: color('--muted'), callback: v => eur(v).replace(/,00\s?€/, ' €') }, grid: { color: color('--line') } },
      },
      onClick: (e, els) => { if (els[0]) { ui.month = els[0].index; render(); } },
    },
  });
}

/* ----- Κινήσεις ----- */

function renderTx(v) {
  const months = [...new Set([ymOf(isoDate(today)), ...data.tx.map(t => ymOf(t.date))])]
    .filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  if (ui.txMonth !== 'all' && !months.includes(ui.txMonth)) ui.txMonth = months[0];
  const cats = [...new Set([...data.cat.map(c => c.cat), ...data.tx.map(t => t.cat)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));

  v.innerHTML = `
    <section class="card filters">
      <div class="month-nav">
        <button class="icon-btn" data-step="1" aria-label="Προηγούμενος μήνας"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <select id="txMonth">
          <option value="all" ${ui.txMonth === 'all' ? 'selected' : ''}>Όλοι οι μήνες</option>
          ${months.map(m => `<option value="${m}" ${m === ui.txMonth ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}
        </select>
        <button class="icon-btn" data-step="-1" aria-label="Επόμενος μήνας"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="seg" id="txType">
        ${[['all', 'Όλα'], [IN, 'Έσοδα'], [OUT, 'Έξοδα']].map(([k, l]) => `<button data-v="${k}" class="${ui.txType === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div class="row2">
        <select id="txCat">
          <option value="">Όλες οι κατηγορίες</option>
          ${cats.map(c => `<option ${c === ui.txCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <input id="txQ" type="search" placeholder="Αναζήτηση…" value="${esc(ui.txQuery)}">
      </div>
    </section>
    <div id="txSummary" class="summary"></div>
    <div id="txList"></div>`;

  $('#txMonth').onchange = e => { ui.txMonth = e.target.value; renderTxList(); };
  $$('[data-step]', v).forEach(b => b.onclick = () => {
    const i = months.indexOf(ui.txMonth);
    const j = ui.txMonth === 'all' ? 0 : Math.min(months.length - 1, Math.max(0, i + +b.dataset.step));
    ui.txMonth = months[j];
    $('#txMonth').value = ui.txMonth;
    renderTxList();
  });
  $$('#txType button', v).forEach(b => b.onclick = () => {
    ui.txType = b.dataset.v;
    $$('#txType button', v).forEach(x => x.classList.toggle('on', x === b));
    renderTxList();
  });
  $('#txCat').onchange = e => { ui.txCat = e.target.value; renderTxList(); };
  $('#txQ').oninput = e => { ui.txQuery = e.target.value; renderTxList(); };
  renderTxList();
}

function renderTxList() {
  const q = ui.txQuery.trim().toLowerCase();
  const list = data.tx
    .filter(t => ui.txMonth === 'all' || ymOf(t.date) === ui.txMonth)
    .filter(t => ui.txType === 'all' || t.type === ui.txType)
    .filter(t => !ui.txCat || t.cat === ui.txCat)
    .filter(t => !q || [t.cat, t.sub, t.note, String(t.amount).replace('.', ',')].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

  const inc = sum(list.filter(t => t.type === IN).map(t => t.amount));
  const out = sum(list.filter(t => t.type === OUT).map(t => t.amount));
  $('#txSummary').innerHTML = `<span>${list.length} κινήσεις</span><span><span class="pos">+${eur(inc)}</span> · <span class="neg">−${eur(out)}</span></span>`;

  if (!list.length) { $('#txList').innerHTML = '<div class="empty">Δεν βρέθηκαν κινήσεις.</div>'; return; }
  const days = new Map();
  for (const t of list) { if (!days.has(t.date)) days.set(t.date, []); days.get(t.date).push(t); }
  $('#txList').innerHTML = [...days].map(([d, items]) => `
    <div class="day">
      <div class="day-h"><span>${esc(dayLabel(d))}</span></div>
      <div class="list">${items.map(t => `
        <button class="item" data-id="${esc(t.id)}">
          <span class="dot ${t.type === IN ? 'in' : 'out'}"></span>
          <span class="item-main">
            <b>${esc(t.cat || NO_CAT)}${t.sub ? ' · ' + esc(t.sub) : ''}</b>
            ${t.note ? `<small>${esc(t.note)}</small>` : ''}
          </span>
          <span class="amt ${t.type === IN ? 'pos' : 'neg'}">${t.type === IN ? '+' : '−'}${eur(t.amount)}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
  $$('#txList .item').forEach(b => b.onclick = () => openTxForm(data.tx.find(t => t.id === b.dataset.id)));
}

/* ----- Δανεικά ----- */

function renderLoans(v) {
  const open = data.loan.filter(l => !l.paid);
  const paid = data.loan.filter(l => l.paid).sort((a, b) => b.date.localeCompare(a.date));
  const owed = open.filter(l => l.type === OWED), owe = open.filter(l => l.type === OWE);
  const item = l => `
    <div class="item ${l.paid ? 'paid' : ''}">
      <input type="checkbox" class="check" data-paid="${esc(l.id)}" ${l.paid ? 'checked' : ''} aria-label="Ξοφλήθηκε">
      <button class="item-main" data-id="${esc(l.id)}" style="background:none;border:0;text-align:left;padding:0">
        <b>${esc(l.person || '—')}</b>
        <small>${fmtDate(l.date)}${l.note ? ' · ' + esc(l.note) : ''}${l.paid ? ' · ' + esc(l.type) : ''}</small>
      </button>
      <span class="amt ${l.type === OWED ? 'pos' : 'neg'}">${eur(l.amount)}</span>
    </div>`;
  const section = (title, arr) => `
    <h3 style="margin:16px 4px 8px">${title}</h3>
    ${arr.length ? `<div class="list">${arr.map(item).join('')}</div>` : '<p class="muted small" style="margin:0 4px">Τίποτα ανοιχτό.</p>'}`;

  v.innerHTML = `
    <div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Μου χρωστάνε</span><b class="pos">${eur(sum(owed.map(l => l.amount)))}</b></div>
      <div class="kpi"><span>Χρωστάω</span><b class="neg">${eur(sum(owe.map(l => l.amount)))}</b></div>
    </div>
    <button class="btn primary block" id="addLoan" style="margin-top:0">+ Νέο δανεικό</button>
    ${section('Μου χρωστάνε', owed)}
    ${section('Χρωστάω', owe)}
    ${paid.length ? `<details style="margin-top:16px"><summary class="muted" style="padding:4px">Ξοφλημένα (${paid.length})</summary><div class="list" style="margin-top:8px">${paid.map(item).join('')}</div></details>` : ''}`;

  $('#addLoan').onclick = () => openLoanForm();
  $$('[data-id]', v).forEach(b => b.onclick = () => openLoanForm(data.loan.find(l => l.id === b.dataset.id)));
  $$('[data-paid]', v).forEach(cb => cb.onchange = () => {
    run('update', { sheet: 'loan', row: { id: cb.dataset.paid, paid: cb.checked } }, cb.checked ? 'Σημειώθηκε ως ξοφλημένο' : 'Άνοιξε ξανά');
  });
}

/* ----- Ψώνια (κοινά) ----- */

const ICON_CAM = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_DOTS = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>';

const photoCache = new Map();
async function photoUrl(id) {
  if (!id) return '';
  if (!photoCache.has(id)) {
    const p = api('photo', { id }).then(r => r.data);
    photoCache.set(id, p);
    p.then(u => photoCache.set(id, u), () => photoCache.delete(id));
  }
  return photoCache.get(id);
}
function hydratePhotos(root) {
  $$('img[data-photo]', root).forEach(async img => {
    try { const u = await photoUrl(img.dataset.photo); if (u) { img.src = u; img.classList.add('loaded'); } } catch { /* ignore */ }
  });
}
function pickImage() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
async function compressImage(file, max = 1000, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** Διαλέγει/τραβάει φωτογραφία, τη μικραίνει και την ανεβάζει. Επιστρέφει το id της. */
async function choosePhoto() {
  const file = await pickImage();
  if (!file) return null;
  setBusy(true);
  try {
    const data = await compressImage(file);
    const { id } = await api('uploadPhoto', { data, mime: 'image/jpeg' });
    photoCache.set(id, data);
    return id;
  } catch (e) {
    toast('Η φωτογραφία δεν ανέβηκε: ' + e.message, true);
    return null;
  } finally {
    setBusy(false);
  }
}
function whenLabel(s) {
  const [d, t] = String(s).split(' ');
  if (!d) return '';
  const today = isoDate(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const day = d === today ? 'σήμερα' : d === isoDate(y) ? 'χθες' : fmtDate(d);
  return t ? `${day} ${t}` : day;
}

function renderShop(v) {
  const lists = data.lists;
  if (!lists.some(l => l.name === ui.shopList)) ui.shopList = lists[0]?.name || '';
  const list = lists.find(l => l.name === ui.shopList);
  const items = data.shop.filter(i => i.list === ui.shopList);
  const pending = items.filter(i => !i.done);
  const done = items.filter(i => i.done).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  const hadFocus = document.activeElement?.id === 'qaName';

  const row = i => `
    <div class="shop-item ${i.done ? 'done' : ''}">
      <button class="tick" data-tick="${esc(i.id)}" aria-label="${i.done ? 'Δεν αγοράστηκε' : 'Αγοράστηκε'}">${ICON_CHECK}</button>
      ${i.photo ? `<button class="thumb" data-zoom="${esc(i.photo)}" aria-label="Φωτογραφία"><img data-photo="${esc(i.photo)}" alt=""></button>` : ''}
      <button class="si-main" data-edit="${esc(i.id)}">
        <b>${esc(i.name)}${i.qty ? ` <span class="qty">×${esc(i.qty)}</span>` : ''}</b>
        ${i.note ? `<small>${esc(i.note)}</small>` : ''}
        <small class="by">${i.done ? `✓ ${esc(i.doneBy)} · ${esc(whenLabel(i.doneAt))}` : `από ${esc(i.addedBy)}`}</small>
      </button>
      ${i.done ? `<button class="icon-btn" data-remove="${esc(i.id)}" aria-label="Διαγραφή">${ICON_X}</button>` : ''}
    </div>`;

  v.innerHTML = `
    <div class="list-tabs">
      ${lists.map(l => {
        const n = data.shop.filter(i => i.list === l.name && !i.done).length;
        return `<button class="ltab ${l.name === ui.shopList ? 'on' : ''}" data-list="${esc(l.name)}"><span>${esc(l.icon || '📝')}</span>${esc(l.name)}${n ? `<i>${n}</i>` : ''}</button>`;
      }).join('')}
      <button class="ltab add" id="addList">+ Λίστα</button>
    </div>
    ${list ? `
      <section class="card quick-add">
        <div class="qa-row">
          <input id="qaName" type="text" placeholder="Τι λείπει; (π.χ. γάλα x2)" autocomplete="off" value="${esc(ui.shopDraft || '')}">
          <button class="qa-cam ${ui.qaPhoto ? 'has' : ''}" id="qaCam" aria-label="Φωτογραφία">
            ${ui.qaPhoto ? `<img data-photo="${esc(ui.qaPhoto)}" alt="">` : ICON_CAM}
          </button>
          <button class="btn primary small" id="qaAdd">Προσθήκη</button>
        </div>
        <div id="qaSugg" class="sugg"></div>
      </section>
      <div class="list-head">
        <h3>${esc(list.icon || '📝')} Λείπουν <span class="muted">${pending.length}</span></h3>
        <button class="icon-btn" id="listMenu" aria-label="Επιλογές λίστας">${ICON_DOTS}</button>
      </div>
      ${pending.length ? `<div class="list">${pending.map(row).join('')}</div>` : '<div class="empty">Δεν λείπει τίποτα 🎉</div>'}
      ${done.length ? `
        <div class="list-head">
          <h3>Αγοράστηκαν <span class="muted">${done.length}</span></h3>
          <button class="link-btn" id="clearDone">Καθάρισμα όλων</button>
        </div>
        <div class="list">${done.map(row).join('')}</div>` : ''}
    ` : '<div class="empty">Φτιάξε την πρώτη σου λίστα με το «+ Λίστα».</div>'}
    <button class="btn block" id="savedProds">⭐ Αποθηκευμένα προϊόντα (${data.prod.length})</button>`;

  hydratePhotos(v);

  $$('[data-list]', v).forEach(b => b.onclick = () => { ui.shopList = b.dataset.list; ui.qaPhoto = ''; render(); });
  $('#addList').onclick = async () => {
    const name = await ask('Νέα λίστα', 'Όνομα λίστας (π.χ. Φαρμακείο)');
    if (!name) return;
    if (lists.some(l => l.name === name)) return toast('Υπάρχει ήδη', true);
    const icon = await ask('Εικονίδιο', 'Ένα emoji για τη λίστα (προαιρετικό)', '📝');
    ui.shopList = name;
    run('add', { sheet: 'lists', row: { name, icon: icon || '📝' } }, 'Νέα λίστα: ' + name);
  };
  $('#savedProds').onclick = openSavedProducts;
  if (!list) return;

  const inp = $('#qaName');
  if (hadFocus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  const showSugg = () => {
    const q = inp.value.trim().toLowerCase();
    const inList = new Set(pending.map(i => i.name.toLowerCase()));
    const hits = q ? data.prod.filter(p => p.name.toLowerCase().includes(q) && !inList.has(p.name.toLowerCase())).slice(0, 6) : [];
    $('#qaSugg').innerHTML = hits.map(p => `
      <button class="sugg-item" data-name="${esc(p.name)}">
        ${p.photo ? `<img data-photo="${esc(p.photo)}" alt="">` : '<span class="sugg-dot"></span>'}${esc(p.name)}
      </button>`).join('');
    hydratePhotos($('#qaSugg'));
    $$('#qaSugg [data-name]').forEach(b => b.onclick = () => addItem(b.dataset.name));
  };
  const addItem = async (text) => {
    let name = String(text ?? inp.value).trim();
    if (!name) return inp.focus();
    let qty = '';
    const m = name.match(/^(.*?)\s*[xX×]\s*(\d+)$/);
    if (m && m[1]) { name = m[1].trim(); qty = m[2]; }
    if (pending.some(i => i.name.toLowerCase() === name.toLowerCase())) return toast('Υπάρχει ήδη στη λίστα', true);
    const photo = ui.qaPhoto || '';
    ui.shopDraft = ''; ui.qaPhoto = '';
    await run('add', { sheet: 'shop', row: { list: list.name, name, qty, note: '', photo } }, `Προστέθηκε: ${name}`);
    $('#qaName')?.focus();
  };
  inp.oninput = () => { ui.shopDraft = inp.value; showSugg(); };
  inp.onkeydown = e => { if (e.key === 'Enter') addItem(); };
  $('#qaAdd').onclick = () => addItem();
  $('#qaCam').onclick = async () => {
    if (ui.qaPhoto) { ui.qaPhoto = ''; render(); return; }
    const id = await choosePhoto();
    if (id) { ui.qaPhoto = id; render(); toast('Η φωτογραφία θα μπει στο επόμενο προϊόν'); }
  };
  showSugg();

  $$('[data-tick]', v).forEach(b => b.onclick = () => {
    const i = data.shop.find(x => x.id === b.dataset.tick);
    run('update', { sheet: 'shop', row: { id: i.id, done: !i.done } }, i.done ? 'Επέστρεψε στη λίστα' : `✓ ${i.name}`);
  });
  $$('[data-remove]', v).forEach(b => b.onclick = () => run('delete', { sheet: 'shop', id: b.dataset.remove }, 'Διαγράφηκε'));
  $$('[data-zoom]', v).forEach(b => b.onclick = () => zoomPhoto(b.dataset.zoom));
  $$('[data-edit]', v).forEach(b => b.onclick = () => openShopItem(data.shop.find(x => x.id === b.dataset.edit)));
  $('#listMenu').onclick = () => listMenu(list);
  const cd = $('#clearDone');
  if (cd) cd.onclick = async () => {
    if (!await confirmBox('Καθάρισμα αγορασμένων;', `Φεύγουν ${done.length} αγορασμένα από τη λίστα. Οι φωτογραφίες τους μένουν στα αποθηκευμένα προϊόντα.`, 'Καθάρισμα')) return;
    run('clearDone', { list: list.name }, 'Καθαρίστηκε');
  };
}

function zoomPhoto(id) {
  const body = openSheet('Φωτογραφία');
  body.innerHTML = `<img class="zoom" data-photo="${esc(id)}" alt="">`;
  hydratePhotos(body);
}

function listMenu(list) {
  const body = openSheet(`${list.icon || '📝'} ${list.name}`);
  body.innerHTML = `
    <div class="menu-list">
      <button class="btn" id="lmRen">✎ Μετονομασία</button>
      <button class="btn" id="lmIcon">😀 Αλλαγή εικονιδίου</button>
      <button class="btn danger" id="lmDel">🗑 Διαγραφή λίστας</button>
    </div>`;
  $('#lmRen', body).onclick = async () => {
    const name = await ask('Μετονομασία λίστας', 'Νέο όνομα', list.name);
    if (!name || name === list.name) return;
    ui.shopList = name;
    run('renameList', { id: list.id, name }, 'Μετονομάστηκε');
  };
  $('#lmIcon', body).onclick = async () => {
    const icon = await ask('Εικονίδιο λίστας', 'Ένα emoji', list.icon);
    if (!icon) return;
    run('renameList', { id: list.id, name: list.name, icon }, 'Άλλαξε');
  };
  $('#lmDel', body).onclick = async () => {
    const n = data.shop.filter(i => i.list === list.name).length;
    if (!await confirmBox(`Διαγραφή «${list.name}»;`, `Η λίστα σβήνεται μαζί με ${n} προϊόντα της. Τα αποθηκευμένα προϊόντα μένουν.`)) return;
    run('deleteList', { id: list.id }, 'Η λίστα διαγράφηκε');
  };
}

function openShopItem(item) {
  const f = { ...item };
  let sureDelete = false;
  const body = openSheet(item.done ? 'Αγορασμένο' : 'Προϊόν');
  const read = () => {
    f.name = $('#siName', body).value.trim();
    f.qty = $('#siQty', body).value.trim();
    f.note = $('#siNote', body).value.trim();
    f.list = $('#siList', body).value;
  };
  const draw = () => {
    body.innerHTML = `
      <div class="si-photo">
        ${f.photo ? `<img data-photo="${esc(f.photo)}" alt="">` : `<div class="si-nophoto">${ICON_CAM}<span>Χωρίς φωτογραφία</span></div>`}
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn small" id="siPhoto">${f.photo ? '📷 Αλλαγή φωτογραφίας' : '📷 Πρόσθεσε φωτογραφία'}</button>
        ${f.photo ? '<button class="btn small" id="siNoPhoto">Αφαίρεση</button>' : ''}
      </div>
      <label class="field"><span>Προϊόν</span><input id="siName" type="text" value="${esc(f.name)}" autocomplete="off"></label>
      <div class="row2">
        <label class="field" style="margin:0"><span>Ποσότητα</span><input id="siQty" type="text" inputmode="numeric" value="${esc(f.qty)}" placeholder="π.χ. 2"></label>
        <label class="field" style="margin:0"><span>Λίστα</span><select id="siList">${data.lists.map(l => `<option ${l.name === f.list ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Σημείωση</span><input id="siNote" type="text" value="${esc(f.note)}" placeholder="π.χ. μάρκα, μέγεθος, χρώμα" autocomplete="off"></label>
      <p class="small muted">${item.done ? `✓ Το πήρε ${esc(item.doneBy)} · ${esc(whenLabel(item.doneAt))}` : `Το πρόσθεσε ${esc(item.addedBy)}`}</p>
      <div class="actions">
        <button class="btn danger ${sureDelete ? 'sure' : ''}" id="siDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>
        <button class="btn" id="siDone">${item.done ? '↩ Δεν αγοράστηκε' : '✓ Αγοράστηκε'}</button>
      </div>
      <button class="btn primary block" id="siSave">Αποθήκευση</button>`;
    hydratePhotos(body);
    $('#siPhoto', body).onclick = async () => { read(); const id = await choosePhoto(); if (id) { f.photo = id; draw(); } };
    const np = $('#siNoPhoto', body);
    if (np) np.onclick = () => { read(); f.photo = ''; draw(); };
    $('#siDone', body).onclick = async () => {
      if (await run('update', { sheet: 'shop', row: { id: item.id, done: !item.done } }, item.done ? 'Επέστρεψε στη λίστα' : `✓ ${item.name}`)) closeSheet();
    };
    $('#siDel', body).onclick = async () => {
      if (!sureDelete) { read(); sureDelete = true; draw(); return; }
      if (await run('delete', { sheet: 'shop', id: item.id }, 'Διαγράφηκε')) closeSheet();
    };
    $('#siSave', body).onclick = async e => {
      read();
      if (!f.name) return toast('Γράψε το προϊόν', true);
      e.target.disabled = true;
      const row = { id: item.id, name: f.name, qty: f.qty, note: f.note, list: f.list };
      if (f.photo !== item.photo) row.photo = f.photo;
      if (await run('update', { sheet: 'shop', row }, 'Αποθηκεύτηκε')) closeSheet(); else e.target.disabled = false;
    };
  };
  draw();
}

function openSavedProducts() {
  const body = openSheet('⭐ Αποθηκευμένα προϊόντα');
  const draw = () => {
    const prods = [...data.prod].sort((a, b) => a.name.localeCompare(b.name, 'el'));
    body.innerHTML = `
      <p class="small muted">Ό,τι έχετε βάλει ποτέ σε λίστα, με τη φωτογραφία του. Όταν το ξαναγράψετε, παίρνει αυτόματα την ίδια φωτογραφία.
      Αν σβήσεις ένα προϊόν από εδώ, σβήνεται και η φωτογραφία του από το Google Drive.</p>
      ${prods.length ? `<div class="list">${prods.map(p => `
        <div class="shop-item">
          ${p.photo ? `<button class="thumb" data-zoom="${esc(p.photo)}"><img data-photo="${esc(p.photo)}" alt=""></button>` : '<span class="thumb empty-thumb"></span>'}
          <div class="si-main"><b>${esc(p.name)}</b>${p.list ? `<small>${esc(p.list)}</small>` : ''}</div>
          <button class="icon-btn" data-readd="${esc(p.id)}" aria-label="Πρόσθεσε στη λίστα">+</button>
          <button class="icon-btn" data-pphoto="${esc(p.id)}" aria-label="Φωτογραφία">${ICON_CAM}</button>
          <button class="icon-btn" data-pdel="${esc(p.id)}" aria-label="Διαγραφή">${ICON_X}</button>
        </div>`).join('')}</div>` : '<div class="empty">Δεν υπάρχουν ακόμα.</div>'}`;
    hydratePhotos(body);
    $$('[data-zoom]', body).forEach(b => b.onclick = () => zoomPhoto(b.dataset.zoom));
    $$('[data-readd]', body).forEach(b => b.onclick = async () => {
      const p = data.prod.find(x => x.id === b.dataset.readd);
      const listName = ui.shopList || data.lists[0]?.name;
      if (!listName) return toast('Φτιάξε πρώτα μια λίστα', true);
      if (data.shop.some(i => i.list === listName && !i.done && i.name.toLowerCase() === p.name.toLowerCase())) return toast('Υπάρχει ήδη στη λίστα', true);
      await run('add', { sheet: 'shop', row: { list: listName, name: p.name, qty: '', note: '', photo: '' } }, `${p.name} → ${listName}`);
    });
    $$('[data-pphoto]', body).forEach(b => b.onclick = async () => {
      const id = await choosePhoto();
      if (!id) return;
      await run('update', { sheet: 'prod', row: { id: b.dataset.pphoto, photo: id } }, 'Η φωτογραφία άλλαξε');
      draw();
    });
    $$('[data-pdel]', body).forEach(b => b.onclick = async () => {
      const p = data.prod.find(x => x.id === b.dataset.pdel);
      if (!await confirmBox(`Διαγραφή «${p.name}»;`, 'Φεύγει από τα αποθηκευμένα και η φωτογραφία του σβήνεται από το Google Drive.')) return;
      await run('delete', { sheet: 'prod', id: p.id }, 'Διαγράφηκε');
      openSavedProducts();
    });
  };
  draw();
}

/* ----- Ρυθμίσεις ----- */

function renderSettings(v) {
  const theme = store.get('household.theme', 'auto');
  v.innerHTML = `
    <h3 class="set-title">Εφαρμογή</h3>
    <section class="card account">
      <div class="avatar">${esc((data.profile || '?').charAt(0))}</div>
      <div class="account-main">
        <b>${esc(data.profile || '—')}</b>
        <small class="muted">${cfg.url === 'demo' ? 'Δοκιμαστικά δεδομένα — δεν γράφεται τίποτα στο Sheet' : 'Συνδεδεμένο με το Google Sheet'}</small>
      </div>
      <button class="btn small" id="logoutBtn">Αποσύνδεση</button>
    </section>
    <section class="card">
      <div class="set-row">
        <div><b>Εμφάνιση</b><small class="muted">Χρώματα του app</small></div>
        <div class="seg" id="themeSeg">
          ${[['auto', 'Αυτόματο'], ['dark', 'Σκούρο'], ['light', 'Φωτεινό']].map(([k, l]) => `<button data-v="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="set-row">
        <div><b>Δεδομένα</b><small class="muted">Φέρε τις τελευταίες αλλαγές από το Sheet</small></div>
        <button class="btn small" id="syncNow">⟳ Ανανέωση</button>
      </div>
      ${cfg.url === 'demo' ? '' : `
      <div class="set-row">
        <div><b>Ασφάλεια</b><small class="muted">Άλλαξε το PIN εισόδου σου</small></div>
        <button class="btn small" id="pinBtn">🔒 Αλλαγή PIN</button>
      </div>`}
    </section>

    <div class="seg big set-switch" id="setSection">
      ${[['fin', '💶 Έσοδα / Έξοδα'], ['shop', '🛒 Ψώνια']].map(([k, l]) => `<button data-v="${k}" class="${ui.setSection === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div id="setBody"></div>`;

  $('#logoutBtn').onclick = async () => {
    if (await confirmBox('Αποσύνδεση;', 'Θα χρειαστεί ξανά το PIN για να μπεις. Τα δεδομένα μένουν στο Sheet.', 'Αποσύνδεση')) logout();
  };
  $$('#themeSeg button', v).forEach(b => b.onclick = () => { store.set('household.theme', b.dataset.v); applyTheme(); render(); });
  $('#syncNow').onclick = () => refresh();
  if ($('#pinBtn')) $('#pinBtn').onclick = openChangePin;
  $$('#setSection button', v).forEach(b => b.onclick = () => { ui.setSection = b.dataset.v; render(); });

  if (ui.setSection === 'shop') renderShopSettings($('#setBody'));
  else renderFinSettings($('#setBody'));
}

function openChangePin() {
  const body = openSheet('Αλλαγή PIN');
  body.innerHTML = `
    <label class="field"><span>Τωρινό PIN</span><input id="cpOld" type="password" inputmode="numeric" autocomplete="current-password" class="pin-input"></label>
    <label class="field"><span>Νέο PIN (6–12 ψηφία)</span><input id="cpNew" type="password" inputmode="numeric" autocomplete="new-password" class="pin-input"></label>
    <label class="field"><span>Νέο PIN ξανά</span><input id="cpNew2" type="password" inputmode="numeric" autocomplete="new-password" class="pin-input"></label>
    <p class="small muted">Αν το app είναι ανοιχτό και σε άλλη συσκευή σου, εκεί θα σου ζητήσει το νέο PIN.</p>
    <button class="btn primary block" id="cpSave">Αλλαγή PIN</button>`;
  setTimeout(() => $('#cpOld', body).focus(), 60);
  $('#cpSave', body).onclick = async e => {
    const oldPin = $('#cpOld', body).value.trim(), p1 = $('#cpNew', body).value.trim(), p2 = $('#cpNew2', body).value.trim();
    if (oldPin !== cfg.pin) return toast('Το τωρινό PIN δεν είναι σωστό', true);
    if (!/^\d{6,12}$/.test(p1)) return toast('Το νέο PIN πρέπει να έχει 6 έως 12 ψηφία', true);
    if (p1 !== p2) return toast('Τα δύο νέα PIN δεν ταιριάζουν', true);
    if (p1 === oldPin) return toast('Το νέο PIN είναι ίδιο με το τωρινό', true);
    e.target.disabled = true;
    setBusy(true);
    try {
      await api('changePin', { newPin: p1 });
      cfg.pin = p1;
      saveCfg();
      closeSheet();
      toast('Το PIN άλλαξε ✓');
    } catch (err) {
      toast('Σφάλμα: ' + err.message, true);
      e.target.disabled = false;
    } finally {
      setBusy(false);
    }
  };
}

function applyTheme() {
  const t = store.get('household.theme', 'auto');
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = dark ? '#061619' : '#eaf2f3';
  if (chart) render();
}

function renderFinSettings(v) {
  const cm = catMap(ui.catType);
  v.innerHTML = `
    <section class="card">
      <h2>Κατηγορίες</h2>
      <div class="seg" id="catType">
        ${[[OUT, 'Έξοδα'], [IN, 'Έσοδα']].map(([k, l]) => `<button data-v="${k}" class="${ui.catType === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div style="margin-top:6px">
        ${cm.size ? [...cm].map(([c, subs]) => `
          <div class="cat-card">
            <div class="cat-head">
              <b>${esc(c)}</b>
              <span>
                <button class="icon-btn" data-ren="${esc(c)}" aria-label="Μετονομασία"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                <button class="icon-btn" data-del="${esc(c)}" aria-label="Διαγραφή"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
              </span>
            </div>
            <div class="chips">
              ${subs.map(s => `<button class="chip" data-cat="${esc(c)}" data-sub="${esc(s)}">${esc(s)}</button>`).join('')}
              <button class="chip add" data-addsub="${esc(c)}">+ υποκατηγορία</button>
            </div>
          </div>`).join('') : '<p class="muted small">Δεν υπάρχουν κατηγορίες ακόμα.</p>'}
      </div>
      <button class="btn primary block" id="addCat">+ Νέα κατηγορία ${ui.catType === IN ? 'εσόδων' : 'εξόδων'}</button>
    </section>`;

  $$('#catType button', v).forEach(b => b.onclick = () => { ui.catType = b.dataset.v; render(); });
  $('#addCat').onclick = async () => {
    const name = await ask('Νέα κατηγορία', 'Όνομα κατηγορίας');
    if (!name) return;
    if (cm.has(name)) return toast('Υπάρχει ήδη', true);
    run('add', { sheet: 'cat', row: { type: ui.catType, cat: name, sub: '' } }, 'Προστέθηκε');
  };
  $$('[data-addsub]', v).forEach(b => b.onclick = async () => {
    const c = b.dataset.addsub;
    const name = await ask(`Νέα υποκατηγορία — ${c}`, 'Όνομα υποκατηγορίας');
    if (!name) return;
    if ((cm.get(c) || []).includes(name)) return toast('Υπάρχει ήδη', true);
    run('add', { sheet: 'cat', row: { type: ui.catType, cat: c, sub: name } }, 'Προστέθηκε');
  });
  $$('[data-ren]', v).forEach(b => b.onclick = async () => {
    const c = b.dataset.ren;
    const name = await ask('Μετονομασία κατηγορίας', 'Νέο όνομα', c, 'Θα αλλάξει και σε όλες τις παλιές κινήσεις.');
    if (!name || name === c) return;
    run('renameCat', { type: ui.catType, cat: c, sub: '', name }, 'Μετονομάστηκε');
  });
  $$('[data-del]', v).forEach(b => b.onclick = async () => {
    const c = b.dataset.del;
    if (!await confirmBox(`Διαγραφή «${c}»;`, 'Η κατηγορία και οι υποκατηγορίες της φεύγουν από τη λίστα. Οι παλιές κινήσεις μένουν όπως είναι.')) return;
    run('deleteCat', { type: ui.catType, cat: c, sub: '' }, 'Διαγράφηκε');
  });
  $$('[data-sub]', v).forEach(b => b.onclick = () => subMenu(b.dataset.cat, b.dataset.sub));
}

/* ----- Είσοδος ----- */

function renderLogin(v) {
  v.innerHTML = `
    <div class="login">
      <div class="login-logo"><img src="icons/icon-192.png" alt=""></div>
      <h1>Household Desk</h1>
      <p class="muted">Βάλε το PIN σου για να μπεις</p>
      <section class="card">
        <label class="field" style="margin-top:0"><span>PIN</span>
          <input id="lgPin" type="password" inputmode="numeric" autocomplete="current-password" class="pin-input" placeholder="••••"></label>
        <details class="adv" ${API_URL ? '' : 'open'}>
          <summary class="small muted">Διεύθυνση σύνδεσης</summary>
          <label class="field"><span>URL του Apps Script</span>
            <input id="lgUrl" type="text" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cfg.url === 'demo' ? API_URL : cfg.url)}"></label>
        </details>
        <button class="btn primary block" id="lgGo">Είσοδος</button>
      </section>
      <button class="link-btn" id="lgDemo">Δοκιμή με ψεύτικα δεδομένα</button>
    </div>`;
  const pin = $('#lgPin');
  setTimeout(() => pin.focus(), 60);
  const go = async () => {
    const url = $('#lgUrl').value.trim(), p = pin.value.trim();
    if (!/^https:\/\/script\.google\.com\//.test(url)) return toast('Η διεύθυνση πρέπει να ξεκινάει με https://script.google.com/', true);
    if (!p) return toast('Βάλε το PIN', true);
    cfg = { url, pin: p };
    saveCfg();
    $('#lgGo').disabled = true;
    if (await refresh(true)) toast(`Καλώς ήρθες, ${data.profile}!`);
    else if ($('#lgGo')) $('#lgGo').disabled = false;
  };
  $('#lgGo').onclick = go;
  pin.onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#lgDemo').onclick = () => {
    cfg = { url: 'demo', pin: '' };
    saveCfg();
    refresh(true);
  };
}

function renderShopSettings(v) {
  const prods = [...data.prod].sort((a, b) => a.name.localeCompare(b.name, 'el'));
  const q = (ui.prodQuery || '').trim().toLowerCase();
  const shown = q ? prods.filter(p => p.name.toLowerCase().includes(q)) : prods;
  v.innerHTML = `
    <section class="card">
      <h2>Λίστες</h2>
      ${data.lists.length ? `<div class="list flat">${data.lists.map(l => {
        const n = data.shop.filter(i => i.list === l.name && !i.done).length;
        return `
          <div class="shop-item">
            <span class="list-emoji">${esc(l.icon || '📝')}</span>
            <div class="si-main"><b>${esc(l.name)}</b><small>${n ? `${n} λείπουν` : 'Τίποτα δεν λείπει'}</small></div>
            <button class="icon-btn" data-lmenu="${esc(l.id)}" aria-label="Επιλογές">${ICON_DOTS}</button>
          </div>`;
      }).join('')}</div>` : '<p class="muted small">Δεν υπάρχουν λίστες.</p>'}
      <button class="btn primary block" id="setAddList">+ Νέα λίστα</button>
    </section>

    <section class="card">
      <h2>Προϊόντα <span class="muted small">(${prods.length})</span></h2>
      <p class="small muted" style="margin-top:-6px">Αποθηκευμένα προϊόντα με φωτογραφία. Όταν τα γράφετε σε λίστα, παίρνουν αυτόματα τη φωτογραφία τους.</p>
      ${prods.length > 6 ? `<input id="prodQ" type="search" placeholder="Αναζήτηση προϊόντος…" value="${esc(ui.prodQuery || '')}" style="margin-bottom:10px">` : ''}
      <div id="prodList">
        ${shown.length ? `<div class="list flat">${shown.map(p => `
          <button class="shop-item prod-row" data-prod="${esc(p.id)}">
            ${p.photo ? `<span class="thumb"><img data-photo="${esc(p.photo)}" alt=""></span>` : `<span class="thumb empty-thumb">${ICON_CAM}</span>`}
            <span class="si-main"><b>${esc(p.name)}</b><small>${esc(p.list || '—')}</small></span>
          </button>`).join('')}</div>` : `<p class="muted small">${q ? 'Δεν βρέθηκε.' : 'Δεν υπάρχουν ακόμα προϊόντα.'}</p>`}
      </div>
      <button class="btn primary block" id="setAddProd">+ Νέο προϊόν</button>
    </section>`;

  hydratePhotos(v);
  $$('[data-lmenu]', v).forEach(b => b.onclick = () => listMenu(data.lists.find(l => l.id === b.dataset.lmenu)));
  $('#setAddList').onclick = async () => {
    const name = await ask('Νέα λίστα', 'Όνομα λίστας (π.χ. Φαρμακείο)');
    if (!name) return;
    if (data.lists.some(l => l.name === name)) return toast('Υπάρχει ήδη', true);
    const icon = await ask('Εικονίδιο', 'Ένα emoji για τη λίστα (προαιρετικό)', '📝');
    run('add', { sheet: 'lists', row: { name, icon: icon || '📝' } }, 'Νέα λίστα: ' + name);
  };
  $$('[data-prod]', v).forEach(b => b.onclick = () => openProductForm(data.prod.find(p => p.id === b.dataset.prod)));
  $('#setAddProd').onclick = () => openProductForm();
  const pq = $('#prodQ');
  if (pq) pq.oninput = () => {
    ui.prodQuery = pq.value;
    const pos = pq.selectionStart;
    render();
    const n = $('#prodQ');
    n.focus();
    n.setSelectionRange(pos, pos);
  };
}

function openProductForm(p) {
  const edit = !!p;
  const f = edit ? { ...p } : { name: '', photo: '', list: ui.shopList || data.lists[0]?.name || '' };
  let sureDelete = false;
  const body = openSheet(edit ? 'Προϊόν' : 'Νέο προϊόν');
  const read = () => { f.name = $('#pfName', body).value.trim(); f.list = $('#pfList', body).value; };
  const draw = () => {
    body.innerHTML = `
      <div class="si-photo">
        ${f.photo ? `<img data-photo="${esc(f.photo)}" alt="">` : `<div class="si-nophoto">${ICON_CAM}<span>Χωρίς φωτογραφία</span></div>`}
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn small" id="pfPhoto">${f.photo ? '📷 Αλλαγή φωτογραφίας' : '📷 Πρόσθεσε φωτογραφία'}</button>
        ${f.photo ? '<button class="btn small" id="pfNoPhoto">Αφαίρεση</button>' : ''}
      </div>
      <label class="field"><span>Όνομα προϊόντος</span><input id="pfName" type="text" value="${esc(f.name)}" placeholder="π.χ. Απορρυπαντικό Skip 3kg" autocomplete="off"></label>
      <label class="field"><span>Συνήθως στη λίστα</span>
        <select id="pfList"><option value="">—</option>${data.lists.map(l => `<option ${l.name === f.list ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      ${edit && f.photo ? '<p class="small muted">Αν σβήσεις το προϊόν ή αλλάξεις φωτογραφία, η παλιά σβήνεται και από το Google Drive.</p>' : ''}
      <div class="actions">
        ${edit ? `<button class="btn danger ${sureDelete ? 'sure' : ''}" id="pfDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="pfSave">Αποθήκευση</button>
      </div>`;
    hydratePhotos(body);
    if (!edit) setTimeout(() => $('#pfName', body)?.focus(), 60);
    $('#pfPhoto', body).onclick = async () => { read(); const id = await choosePhoto(); if (id) { f.photo = id; draw(); } };
    const np = $('#pfNoPhoto', body);
    if (np) np.onclick = () => { read(); f.photo = ''; draw(); };
    const del = $('#pfDel', body);
    if (del) del.onclick = async () => {
      if (!sureDelete) { read(); sureDelete = true; draw(); return; }
      if (await run('delete', { sheet: 'prod', id: p.id }, 'Διαγράφηκε')) closeSheet();
    };
    $('#pfSave', body).onclick = async e => {
      read();
      if (!f.name) return toast('Γράψε το όνομα', true);
      const clash = data.prod.find(x => x.name.toLowerCase() === f.name.toLowerCase() && (!edit || x.id !== p.id));
      if (clash) return toast('Υπάρχει ήδη προϊόν με αυτό το όνομα', true);
      e.target.disabled = true;
      let ok;
      if (edit) {
        const row = { id: p.id, name: f.name, list: f.list };
        if (f.photo !== p.photo) row.photo = f.photo;
        ok = await run('update', { sheet: 'prod', row }, 'Αποθηκεύτηκε');
      } else {
        ok = await run('add', { sheet: 'prod', row: { name: f.name, photo: f.photo, list: f.list } }, 'Νέο προϊόν: ' + f.name);
      }
      if (ok) closeSheet(); else e.target.disabled = false;
    };
  };
  draw();
}

function subMenu(c, s) {
  const body = openSheet(`${c} · ${s}`);
  body.innerHTML = `
    <div class="menu-list">
      <button class="btn" id="mRen">✎ Μετονομασία</button>
      <button class="btn danger" id="mDel">🗑 Διαγραφή</button>
    </div>`;
  $('#mRen', body).onclick = async () => {
    const name = await ask('Μετονομασία υποκατηγορίας', 'Νέο όνομα', s, 'Θα αλλάξει και σε όλες τις παλιές κινήσεις.');
    if (!name || name === s) return;
    run('renameCat', { type: ui.catType, cat: c, sub: s, name }, 'Μετονομάστηκε');
  };
  $('#mDel', body).onclick = async () => {
    if (!await confirmBox(`Διαγραφή «${s}»;`, 'Φεύγει από τη λίστα. Οι παλιές κινήσεις μένουν όπως είναι.')) return;
    run('deleteCat', { type: ui.catType, cat: c, sub: s }, 'Διαγράφηκε');
  };
}

/* ---------- bottom sheet, prompts ---------- */

let sheetOnClose = null;
function openSheet(title) {
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  $('#sheetTitle').textContent = title;
  $('#overlay').classList.remove('hidden');
  const body = $('#sheetBody');
  body.innerHTML = '';
  return body;
}
function closeSheet() {
  $('#overlay').classList.add('hidden');
  $('#sheetBody').innerHTML = '';
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}

function ask(title, label, value = '', hint = '') {
  return new Promise(resolve => {
    const body = openSheet(title);
    body.innerHTML = `
      <label class="field"><span>${esc(label)}</span><input id="askIn" type="text" value="${esc(value)}" autocomplete="off"></label>
      ${hint ? `<p class="small muted">${esc(hint)}</p>` : ''}
      <div class="actions"><button class="btn" id="askNo">Άκυρο</button><button class="btn primary" id="askOk">OK</button></div>`;
    let done = false;
    const finish = val => { if (done) return; done = true; sheetOnClose = null; closeSheet(); resolve(val); };
    sheetOnClose = () => { if (!done) { done = true; resolve(null); } };
    const inp = $('#askIn', body);
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
    inp.onkeydown = e => { if (e.key === 'Enter') finish(inp.value.trim() || null); };
    $('#askOk', body).onclick = () => finish(inp.value.trim() || null);
    $('#askNo', body).onclick = () => finish(null);
  });
}

function confirmBox(title, text, okLabel = 'Διαγραφή') {
  return new Promise(resolve => {
    const body = openSheet(title);
    body.innerHTML = `
      <p>${esc(text)}</p>
      <div class="actions"><button class="btn" id="cNo">Άκυρο</button><button class="btn danger sure" id="cYes">${esc(okLabel)}</button></div>`;
    let done = false;
    const finish = val => { if (done) return; done = true; sheetOnClose = null; closeSheet(); resolve(val); };
    sheetOnClose = () => { if (!done) { done = true; resolve(false); } };
    $('#cYes', body).onclick = () => finish(true);
    $('#cNo', body).onclick = () => finish(false);
  });
}

/* ---------- νέα κίνηση βήμα-βήμα ---------- */

const ICON_BACK = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';

function dateField(id, value) {
  const t = isoDate(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yd = isoDate(y);
  return `
    <div class="field"><span>Ημερομηνία</span>
      <div class="date-row">
        <input id="${id}" type="date" value="${esc(value)}">
        <button type="button" class="chip ${value === t ? 'on' : ''}" data-date="${t}">Σήμερα</button>
        <button type="button" class="chip ${value === yd ? 'on' : ''}" data-date="${yd}">Χθες</button>
      </div>
    </div>`;
}
function wireDateField(body, id) {
  const inp = $('#' + id, body);
  const sync = () => $$('[data-date]', body).forEach(c => c.classList.toggle('on', c.dataset.date === inp.value));
  $$('[data-date]', body).forEach(c => c.onclick = () => { inp.value = c.dataset.date; sync(); });
  inp.oninput = sync;
}

function openTxWizard() {
  const f = { type: '', cat: '', sub: '', amount: '', date: isoDate(new Date()), note: '' };
  let step = 'type';
  let adding = false;
  const body = openSheet('Νέα κίνηση');
  const setTitle = t => { $('#sheetTitle').textContent = t; };
  const hasSubs = () => (catMap(f.type).get(f.cat) || []).length > 0;

  const crumbs = () => `
    <div class="crumbs">
      <button class="icon-btn" id="wBack" aria-label="Πίσω">${ICON_BACK}</button>
      <span class="pill ${f.type === IN ? 'in' : 'out'}">${f.type}</span>
      ${f.cat ? `<span class="pill">${esc(f.cat)}</span>` : ''}
      ${f.sub ? `<span class="pill">${esc(f.sub)}</span>` : ''}
    </div>`;
  const newBox = kind => adding
    ? `<div class="inline-new">
         <input id="newName" type="text" placeholder="${kind === 'cat' ? 'Όνομα κατηγορίας' : 'Όνομα υποκατηγορίας'}" autocomplete="off">
         <button class="btn small primary" id="newOk">Προσθήκη</button>
       </div>`
    : `<button class="tile add" id="wNew">+ Νέα ${kind === 'cat' ? 'κατηγορία' : 'υποκατηγορία'}</button>`;

  const go = s => { step = s; adding = false; draw(); body.scrollTop = 0; };
  const back = () => {
    if (step === 'details') go(f.sub || hasSubs() ? 'sub' : 'cat');
    else if (step === 'sub') { f.sub = ''; go('cat'); }
    else { f.cat = ''; f.sub = ''; go('type'); }
  };
  const readDetails = () => {
    const a = $('#wAmt', body), d = $('#wDate', body), n = $('#wNote', body);
    if (a) f.amount = a.value;
    if (d) f.date = d.value;
    if (n) f.note = n.value;
  };

  const draw = () => {
    if (step === 'type') {
      setTitle('Νέα κίνηση');
      body.innerHTML = `
        <div class="big-choice">
          <button class="choice out" data-t="${OUT}"><b>−</b><span>Έξοδο</span></button>
          <button class="choice in" data-t="${IN}"><b>+</b><span>Έσοδο</span></button>
        </div>`;
      $$('[data-t]', body).forEach(b => b.onclick = () => { f.type = b.dataset.t; go('cat'); });
      return;
    }

    if (step === 'cat' || step === 'sub') {
      const isCat = step === 'cat';
      const items = isCat ? [...catMap(f.type).keys()] : (catMap(f.type).get(f.cat) || []);
      setTitle(isCat ? 'Κατηγορία' : 'Υποκατηγορία');
      body.innerHTML = `
        ${crumbs()}
        <div class="tiles">
          ${items.map(x => `<button class="tile" data-x="${esc(x)}">${esc(x)}</button>`).join('')}
          ${isCat ? '' : '<button class="tile muted-tile" data-x="">Χωρίς υποκατηγορία</button>'}
        </div>
        ${newBox(isCat ? 'cat' : 'sub')}`;
      $$('[data-x]', body).forEach(b => b.onclick = () => {
        if (isCat) { f.cat = b.dataset.x; f.sub = ''; go(hasSubs() ? 'sub' : 'details'); }
        else { f.sub = b.dataset.x; go('details'); }
      });
    } else {
      setTitle('Ποσό');
      body.innerHTML = `
        ${crumbs()}
        <label class="field amount"><span>Ποσό (€)</span><input id="wAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
        ${dateField('wDate', f.date)}
        <label class="field"><span>Σημείωση</span><input id="wNote" type="text" placeholder="προαιρετικό" value="${esc(f.note)}" autocomplete="off"></label>
        <div class="actions"><button class="btn primary" id="wSave">Αποθήκευση</button></div>`;
      wireDateField(body, 'wDate');
      const amt = $('#wAmt', body);
      setTimeout(() => amt.focus(), 60);
      amt.onkeydown = e => { if (e.key === 'Enter') $('#wSave', body).click(); };
      $('#wSave', body).onclick = async e => {
        readDetails();
        const amount = round2(num(f.amount));
        if (!(amount > 0)) { amt.focus(); return toast('Βάλε ποσό', true); }
        if (!f.date) return toast('Βάλε ημερομηνία', true);
        e.target.disabled = true;
        const row = { date: f.date, type: f.type, amount, cat: f.cat, sub: f.sub, note: f.note.trim() };
        if (await run('add', { sheet: 'tx', row }, `${f.type} ${eur(amount)} αποθηκεύτηκε`)) closeSheet();
        else e.target.disabled = false;
      };
    }

    $('#wBack', body).onclick = () => { readDetails(); back(); };
    const wNew = $('#wNew', body);
    if (wNew) wNew.onclick = () => { adding = true; draw(); $('#newName', body).focus(); };
    const newOk = $('#newOk', body);
    if (newOk) {
      const addNew = async () => {
        const name = $('#newName', body).value.trim();
        if (!name) return;
        newOk.disabled = true;
        if (step === 'cat') {
          if (!catMap(f.type).has(name) &&
              !await run('add', { sheet: 'cat', row: { type: f.type, cat: name, sub: '' } }, 'Νέα κατηγορία: ' + name)) { newOk.disabled = false; return; }
          f.cat = name; f.sub = '';
          go(hasSubs() ? 'sub' : 'details');
        } else {
          if (!(catMap(f.type).get(f.cat) || []).includes(name) &&
              !await run('add', { sheet: 'cat', row: { type: f.type, cat: f.cat, sub: name } }, 'Νέα υποκατηγορία: ' + name)) { newOk.disabled = false; return; }
          f.sub = name;
          go('details');
        }
      };
      newOk.onclick = addNew;
      $('#newName', body).onkeydown = e => { if (e.key === 'Enter') addNew(); };
    }
  };

  draw();
}

/* ---------- φόρμα επεξεργασίας κίνησης ---------- */

function openTxForm(t) {
  const edit = !!t;
  const f = edit ? { ...t, amount: String(t.amount).replace('.', ',') } : { type: OUT, amount: '', date: isoDate(new Date()), cat: '', sub: '', note: '' };
  let newKind = '';        // '', 'cat' ή 'sub' — ποιο πεδίο «+ Νέα» είναι ανοιχτό
  let sureDelete = false;
  const body = openSheet(edit ? 'Επεξεργασία κίνησης' : 'Νέα κίνηση');

  const readInputs = () => {
    const a = $('#fAmt', body), d = $('#fDate', body), n = $('#fNote', body);
    if (a) f.amount = a.value;
    if (d) f.date = d.value;
    if (n) f.note = n.value;
  };
  const inlineNew = kind => `
    <div class="inline-new">
      <input id="newName" type="text" placeholder="${kind === 'cat' ? 'Νέα κατηγορία' : 'Νέα υποκατηγορία'}" autocomplete="off">
      <button class="btn small primary" id="newOk">Προσθήκη</button>
    </div>`;

  const draw = () => {
    const cm = catMap(f.type);
    if (f.cat && !cm.has(f.cat)) cm.set(f.cat, []);
    const subs = f.cat ? [...(cm.get(f.cat) || [])] : [];
    if (f.sub && !subs.includes(f.sub)) subs.push(f.sub);

    body.innerHTML = `
      <div class="seg big" id="fType" style="margin-top:10px">
        ${[OUT, IN].map(x => `<button data-v="${x}" class="${x === IN ? 'in' : 'out'} ${f.type === x ? 'on' : ''}">${x}</button>`).join('')}
      </div>
      <label class="field amount"><span>Ποσό (€)</span><input id="fAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
      <div class="field"><span>Κατηγορία</span>
        <div class="chips" id="fCats">
          ${[...cm.keys()].map(c => `<button class="chip ${c === f.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
          <button class="chip add" data-new="cat">+ Νέα</button>
        </div>
        ${newKind === 'cat' ? inlineNew('cat') : ''}
      </div>
      ${f.cat ? `
        <div class="field"><span>Υποκατηγορία</span>
          <div class="chips" id="fSubs">
            ${subs.map(s => `<button class="chip ${s === f.sub ? 'on' : ''}" data-sub="${esc(s)}">${esc(s)}</button>`).join('')}
            <button class="chip add" data-new="sub">+ Νέα</button>
          </div>
          ${newKind === 'sub' ? inlineNew('sub') : ''}
        </div>` : ''}
      ${dateField('fDate', f.date)}
      <label class="field"><span>Σημείωση</span><input id="fNote" type="text" placeholder="προαιρετικό" value="${esc(f.note)}" autocomplete="off"></label>
      <div class="actions">
        ${edit ? `<button class="btn danger ${sureDelete ? 'sure' : ''}" id="fDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="fSave">Αποθήκευση</button>
      </div>`;

    wireDateField(body, 'fDate');
    $$('#fType button', body).forEach(b => b.onclick = () => {
      readInputs();
      if (f.type !== b.dataset.v) { f.type = b.dataset.v; f.cat = ''; f.sub = ''; newKind = ''; }
      draw();
    });
    $$('[data-cat]', body).forEach(b => b.onclick = () => {
      readInputs();
      if (f.cat !== b.dataset.cat) { f.cat = b.dataset.cat; f.sub = ''; }
      newKind = '';
      draw();
    });
    $$('[data-sub]', body).forEach(b => b.onclick = () => {
      readInputs();
      f.sub = f.sub === b.dataset.sub ? '' : b.dataset.sub;
      draw();
    });
    $$('[data-new]', body).forEach(b => b.onclick = () => {
      readInputs();
      newKind = newKind === b.dataset.new ? '' : b.dataset.new;
      draw();
      const n = $('#newName', body);
      if (n) n.focus();
    });
    const newOk = $('#newOk', body);
    if (newOk) {
      const addNew = async () => {
        const name = $('#newName', body).value.trim();
        if (!name) return;
        readInputs();
        const cm2 = catMap(f.type);
        if (newKind === 'cat') {
          if (!cm2.has(name) && !await run('add', { sheet: 'cat', row: { type: f.type, cat: name, sub: '' } }, 'Νέα κατηγορία: ' + name)) return;
          f.cat = name; f.sub = '';
        } else {
          if (!(cm2.get(f.cat) || []).includes(name) && !await run('add', { sheet: 'cat', row: { type: f.type, cat: f.cat, sub: name } }, 'Νέα υποκατηγορία: ' + name)) return;
          f.sub = name;
        }
        newKind = '';
        draw();
      };
      newOk.onclick = addNew;
      $('#newName', body).onkeydown = e => { if (e.key === 'Enter') addNew(); };
    }

    $('#fSave', body).onclick = async e => {
      readInputs();
      const amount = round2(num(f.amount));
      if (!(amount > 0)) return toast('Βάλε ποσό', true);
      if (!f.cat) return toast('Διάλεξε κατηγορία', true);
      if (!f.date) return toast('Βάλε ημερομηνία', true);
      const row = { date: f.date, type: f.type, amount, cat: f.cat, sub: f.sub, note: f.note.trim() };
      e.target.disabled = true;
      const ok = edit
        ? await run('update', { sheet: 'tx', row: { ...row, id: t.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'tx', row }, `${f.type === IN ? 'Έσοδο' : 'Έξοδο'} ${eur(amount)} αποθηκεύτηκε`);
      if (ok) closeSheet(); else e.target.disabled = false;
    };
    const del = $('#fDel', body);
    if (del) del.onclick = async () => {
      if (!sureDelete) { readInputs(); sureDelete = true; draw(); return; }
      del.disabled = true;
      if (await run('delete', { sheet: 'tx', id: t.id }, 'Διαγράφηκε')) closeSheet(); else del.disabled = false;
    };
  };

  draw();
  if (!edit) setTimeout(() => $('#fAmt', body)?.focus(), 80);
}

/* ---------- φόρμα δανεικού ---------- */

function openLoanForm(l) {
  const edit = !!l;
  const f = edit ? { ...l, amount: String(l.amount).replace('.', ',') } : { type: OWED, person: '', amount: '', date: isoDate(new Date()), note: '', paid: false };
  let sureDelete = false;
  const body = openSheet(edit ? 'Επεξεργασία δανεικού' : 'Νέο δανεικό');
  const people = [...new Set(data.loan.map(x => x.person).filter(Boolean))];

  const readInputs = () => {
    f.person = $('#lPerson', body).value;
    f.amount = $('#lAmt', body).value;
    f.date = $('#lDate', body).value;
    f.note = $('#lNote', body).value;
    f.paid = $('#lPaid', body).checked;
  };
  const draw = () => {
    body.innerHTML = `
      <div class="seg big" id="lType" style="margin-top:10px">
        ${[[OWED, 'in'], [OWE, 'out']].map(([x, c]) => `<button data-v="${x}" class="${c} ${f.type === x ? 'on' : ''}">${x}</button>`).join('')}
      </div>
      <label class="field amount"><span>Ποσό (€)</span><input id="lAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
      <label class="field"><span>Άτομο</span><input id="lPerson" type="text" list="people" autocomplete="off" value="${esc(f.person)}"></label>
      <datalist id="people">${people.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      ${dateField('lDate', f.date)}
      <label class="field"><span>Σημείωση</span><input id="lNote" type="text" placeholder="προαιρετικό" value="${esc(f.note)}" autocomplete="off"></label>
      <label class="toggle"><input id="lPaid" type="checkbox" class="check" ${f.paid ? 'checked' : ''}> Ξοφλήθηκε</label>
      <div class="actions">
        ${edit ? `<button class="btn danger ${sureDelete ? 'sure' : ''}" id="lDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="lSave">Αποθήκευση</button>
      </div>`;

    wireDateField(body, 'lDate');
    $$('#lType button', body).forEach(b => b.onclick = () => { readInputs(); f.type = b.dataset.v; draw(); });
    $('#lSave', body).onclick = async e => {
      readInputs();
      const amount = round2(num(f.amount));
      if (!(amount > 0)) return toast('Βάλε ποσό', true);
      if (!f.person.trim()) return toast('Βάλε το άτομο', true);
      const row = { date: f.date, type: f.type, person: f.person.trim(), amount, note: f.note.trim(), paid: f.paid };
      e.target.disabled = true;
      const ok = edit
        ? await run('update', { sheet: 'loan', row: { ...row, id: l.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'loan', row }, 'Αποθηκεύτηκε');
      if (ok) closeSheet(); else e.target.disabled = false;
    };
    const del = $('#lDel', body);
    if (del) del.onclick = async () => {
      if (!sureDelete) { readInputs(); sureDelete = true; draw(); return; }
      del.disabled = true;
      if (await run('delete', { sheet: 'loan', id: l.id }, 'Διαγράφηκε')) closeSheet(); else del.disabled = false;
    };
  };
  draw();
}

/* ---------- init ---------- */

$$('.tabbar [data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
$('#addBtn').onclick = () => {
  if (!loggedIn()) return render();
  if (ui.tab === 'loans') openLoanForm(); else openTxWizard();
};
$('#refreshBtn').onclick = () => refresh();
$('#shopBtn').onclick = () => {
  if (!loggedIn()) return;
  ui.tab = 'shop';
  render();
  window.scrollTo(0, 0);
  refresh(true);
};
// Τα ψώνια είναι κοινά: ανανέωση όταν ξαναγυρνάς στο app και κάθε λίγο όσο είσαι στα Ψώνια.
const idle = () => $('#overlay').classList.contains('hidden') && document.activeElement?.id !== 'qaName';
document.addEventListener('visibilitychange', () => { if (!document.hidden && loggedIn() && idle()) refresh(true); });
setInterval(() => { if (ui.tab === 'shop' && !document.hidden && loggedIn() && idle()) refresh(true); }, 30000);
$('#sheetClose').onclick = closeSheet;
$('#overlay').onclick = e => { if (e.target.id === 'overlay') closeSheet(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#overlay').classList.contains('hidden')) closeSheet(); });

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
render();
if (loggedIn()) refresh(true);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
