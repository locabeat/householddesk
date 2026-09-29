'use strict';

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
// Για «σε σύγκριση με τον Αύγουστο».
const MONTHS_ACC = ['τον Ιανουάριο', 'τον Φεβρουάριο', 'τον Μάρτιο', 'τον Απρίλιο', 'τον Μάιο', 'τον Ιούνιο', 'τον Ιούλιο', 'τον Αύγουστο', 'τον Σεπτέμβριο', 'τον Οκτώβριο', 'τον Νοέμβριο', 'τον Δεκέμβριο'];
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];
const IN = 'Έσοδο', OUT = 'Έξοδο', TR = 'Μεταφορά';
// Κινήσεις που αλλάζουν μόνο το υπόλοιπο ταμείου (όχι έσοδα/έξοδα). Το ποσό έχει πρόσημο.
const ADJ = 'Διόρθωση', LOAN = 'Δανεικό', HSET = 'Εξόφληση σπιτιού';
const signed = t => t.type === ADJ || t.type === LOAN || t.type === HSET;
// Σπίτι: κοινά έξοδα. Στα προσωπικά μετράει μόνο το μερίδιο του καθενός, με κατηγορία «Σπίτι».
const HOUSE_CAT = 'Σπίτι', H_EXP = 'Έξοδο', H_SET = 'Εξόφληση';
const FREQS = [[1, 'μήνας', 'Κάθε μήνα'], [2, 'μήνας', 'Κάθε 2 μήνες'], [3, 'μήνας', 'Κάθε 3 μήνες'], [6, 'μήνας', 'Κάθε 6 μήνες'],
  [1, 'χρόνος', 'Κάθε χρόνο'], [1, 'εβδομάδα', 'Κάθε εβδομάδα'], [2, 'εβδομάδα', 'Κάθε 2 εβδομάδες']];
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
// Ημερομηνίες όπως στην Ελλάδα: ηη/μμ/εε (π.χ. 29/09/26).
function fmtDate(iso) { const [y, m, d] = String(iso).split('-'); return d ? `${d.slice(0, 2)}/${m}/${y.slice(-2)}` : ''; }
/** Κουτάκι ημερομηνίας για πάγια: μεγάλη η μέρα, από κάτω μμ/εε. */
function recDate(iso) { const [y, m, d] = String(iso).split('-'); return `<span class="rec-date"><b>${d || '?'}</b>${m ? `${m}/${y.slice(-2)}` : ''}</span>`; }
function monthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; }
function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!d) return 'Χωρίς ημερομηνία';
  const wd = new Date(y, m - 1, d).toLocaleDateString('el-GR', { weekday: 'long' });
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${fmtDate(iso)}`;
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
    tx: (d.tx || []).map(r => ({ id: s(r.id), date: s(r.date), type: s(r.type), amount: num(r.amount), cat: s(r.cat), sub: s(r.sub), note: s(r.note), acc: s(r.acc), to: s(r.to), receipt: s(r.receipt) })),
    acc: (d.acc || []).map(r => ({ id: s(r.id), name: s(r.name), icon: s(r.icon), start: num(r.start) })),
    rec: (d.rec || []).map(r => ({
      id: s(r.id), name: s(r.name), type: s(r.type) || OUT, amount: num(r.amount), cat: s(r.cat), sub: s(r.sub), acc: s(r.acc),
      every: Math.max(1, num(r.every) || 1), unit: s(r.unit) || 'μήνας', next: s(r.next),
    })),
    members: (d.members || []).map(s).filter(Boolean),
    house: (d.house || []).map(r => ({
      id: s(r.id), date: s(r.date), kind: s(r.kind) || H_EXP, cat: s(r.cat), amount: num(r.amount), note: s(r.note),
      paidBy: s(r.paidBy), owedBy: s(r.owedBy), share: s(r.share) === '' ? 50 : num(r.share), payAcc: s(r.payAcc), recvAcc: s(r.recvAcc), receipt: s(r.receipt), addedBy: s(r.addedBy),
    })),
    houseCat: (d.houseCat || []).map(r => ({ id: s(r.id), name: s(r.name), icon: s(r.icon) })),
    houseRec: (d.houseRec || []).map(r => ({
      id: s(r.id), name: s(r.name), cat: s(r.cat), amount: num(r.amount), paidBy: s(r.paidBy), share: s(r.share) === '' ? 50 : num(r.share),
      every: Math.max(1, num(r.every) || 1), unit: s(r.unit) || 'μήνας', next: s(r.next),
    })),
    quick: (d.quick || []).map(r => ({ id: s(r.id), name: s(r.name), icon: s(r.icon), type: s(r.type) || OUT, amount: num(r.amount), cat: s(r.cat), sub: s(r.sub), acc: s(r.acc) })),
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
  txAcc: '',
  houseMonth: '',
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
function catMap(type, byUse = false) {
  const m = new Map();
  for (const r of data.cat) {
    if (r.type !== type || !r.cat) continue;
    if (!m.has(r.cat)) m.set(r.cat, []);
    if (r.sub && !m.get(r.cat).includes(r.sub)) m.get(r.cat).push(r.sub);
  }
  return byUse ? sortByUse(type, m) : m;
}

/** Οι πιο συχνές κατηγορίες/υποκατηγορίες (κινήσεις τελευταίων 6 μηνών) πρώτες· ισοπαλία = σειρά του φύλλου. */
function sortByUse(type, m) {
  const from = new Date(); from.setMonth(from.getMonth() - 6);
  const since = isoDate(from);
  const cats = new Map(), subs = new Map();
  for (const t of data.tx) {
    if (t.type !== type || t.date < since || !t.cat) continue;
    cats.set(t.cat, (cats.get(t.cat) || 0) + 1);
    if (t.sub) subs.set(t.cat + '\u0000' + t.sub, (subs.get(t.cat + '\u0000' + t.sub) || 0) + 1);
  }
  const byCount = (get) => (a, b) => get(b) - get(a);   // Array.sort είναι σταθερό: ισοπαλίες μένουν στη σειρά τους
  return new Map([...m]
    .sort(byCount(([c]) => cats.get(c) || 0))
    .map(([c, s]) => [c, [...s].sort(byCount(x => subs.get(c + '\u0000' + x) || 0))]));
}

/* ----- Σπίτι: υπολογισμοί ----- */

const otherOf = p => data.members.find(m => m !== p) || '';
const houseIcon = c => data.houseCat.find(x => x.name === c)?.icon || '📦';
/** Πόσο από ένα κοινό έξοδο αναλογεί στον who. */
function houseShare(h, who) {
  if (h.kind !== H_EXP) return 0;
  const other = h.amount * h.share / 100;
  return who === h.owedBy ? other : who === h.paidBy ? h.amount - other : 0;
}
/** Θετικό = ο άλλος σου χρωστάει, αρνητικό = χρωστάς εσύ. */
function houseBalance(me = data.profile) {
  let n = 0;
  for (const h of data.house) {
    const v = h.kind === H_EXP ? h.amount * h.share / 100 : h.amount;
    if (h.paidBy === me) n += v;
    else if (h.owedBy === me) n -= v;
  }
  return round2(n);
}
/**
 * Οι κοινές κινήσεις όπως φαίνονται στα προσωπικά σου: έξοδο «Σπίτι» με το μερίδιό σου,
 * και εξοφλήσεις. cash/cashAcc = τι βγήκε ή μπήκε πραγματικά στο ταμείο σου.
 */
function houseVirtual() {
  const me = data.profile, out = [];
  for (const h of data.house) {
    if (h.kind === H_EXP) {
      if (h.paidBy !== me && h.owedBy !== me) continue;
      const mine = h.paidBy === me;
      out.push({
        id: 'h:' + h.id, houseId: h.id, house: true, date: h.date, type: OUT, amount: round2(houseShare(h, me)), cat: HOUSE_CAT, sub: h.cat,
        note: [mine ? '' : `πλήρωσε ${h.paidBy}`, h.note].filter(Boolean).join(' · '), acc: mine ? h.payAcc : '', to: '', receipt: h.receipt,
        cash: mine ? -h.amount : 0, cashAcc: mine ? h.payAcc : '',
      });
    } else if (h.paidBy === me || h.owedBy === me) {
      const paid = h.paidBy === me;
      const acc = paid ? h.payAcc : h.recvAcc;
      out.push({
        id: 'h:' + h.id, houseId: h.id, house: true, date: h.date, type: HSET, amount: paid ? -h.amount : h.amount, cat: '', sub: '',
        note: paid ? `προς ${h.owedBy}` : `από ${h.paidBy}`, acc, to: '', cash: paid ? -h.amount : h.amount, cashAcc: acc,
      });
    }
  }
  return out;
}
/** Όλες οι κινήσεις σου: οι δικές σου + το μερίδιό σου από το Σπίτι. */
const allTx = () => [...data.tx, ...houseVirtual()];

/**
 * Υπόλοιπο κάθε ταμείου: αρχικό + έσοδα − έξοδα ± μεταφορές.
 * upTo (ηη προαιρετικό, yyyy-mm-dd): μόνο κινήσεις μέχρι και εκείνη τη μέρα. Το «αρχικό υπόλοιπο» μετράει πάντα (είναι πριν από όλα).
 */
function accBalances(upTo = '') {
  const bal = new Map(data.acc.map(a => [a.name, a.start]));
  const add = (name, n) => { if (bal.has(name)) bal.set(name, bal.get(name) + n); };
  const inRange = t => !upTo || t.date <= upTo;
  for (const v of houseVirtual()) if (v.cashAcc && inRange(v)) add(v.cashAcc, v.cash);
  for (const t of data.tx) {
    if (!inRange(t)) continue;
    if (t.type === IN) add(t.acc, t.amount);
    else if (t.type === OUT) add(t.acc, -t.amount);
    else if (t.type === TR) { add(t.acc, -t.amount); add(t.to, t.amount); }
    else if (signed(t)) add(t.acc, t.amount);
  }
  return bal;
}
/** Σύνολο όλων των ταμείων στο τέλος μιας μέρας (ή πριν από την πρώτη κίνηση, για αρχή περιόδου). */
const totalAt = upTo => round2(sum([...accBalances(upTo).values()]));
/** Η προηγούμενη μέρα ενός yyyy-mm-dd (για «από πριν» = τέλος της προηγούμενης μέρας). */
function dayBefore(iso) { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d - 1)); }

/** Επόμενη ημερομηνία πάγιου: +n εβδομάδες/μήνες/χρόνια (στο τέλος του μήνα αν δεν υπάρχει η μέρα). */
function addPeriod(iso, n, unit) {
  const [y, m, d] = iso.split('-').map(Number);
  if (unit === 'εβδομάδα') return isoDate(new Date(y, m - 1, d + 7 * n));
  const t = new Date(y, m - 1 + (unit === 'χρόνος' ? 12 * n : n), 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return isoDate(t);
}
function freqLabel(r) {
  const f = FREQS.find(([n, u]) => n === r.every && u === r.unit);
  return f ? f[2] : `Κάθε ${r.every} ${r.unit}`;
}
function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 864e5);
}
/** Η σημείωση μιας κίνησης από πρότυπο: το όνομά του, εκτός αν είναι ίδιο με κατηγορία/υποκατηγορία. */
const tplNote = q => [q.cat, q.sub].some(x => x && x.toLowerCase() === q.name.toLowerCase()) ? '' : q.name;
const accIcon = name => data.acc.find(a => a.name === name)?.icon || '💳';
const lastAcc = () => { const n = store.get('household.lastAcc', ''); return data.acc.some(a => a.name === n) ? n : (data.acc[0]?.name || ''); };

/** Κουμπιά επιλογής ταμείου (data-<attr>="όνομα"). */
function accChips(attr, selected, skip = '', none = '') {
  return `<div class="chips">${data.acc.filter(a => a.name !== skip).map(a =>
    `<button type="button" class="chip ${a.name === selected ? 'on' : ''}" data-${attr}="${esc(a.name)}">${esc(a.icon || '💳')} ${esc(a.name)}</button>`).join('')}${
    none ? `<button type="button" class="chip ${!selected ? 'on' : ''}" data-${attr}="">${esc(none)}</button>` : ''}</div>`;
}
/** Συνδέει τα κουμπιά ταμείου: αλλάζει την επιλογή χωρίς να ξαναζωγραφίζει τη φόρμα. */
function wireAccChips(body, attr, set) {
  $$(`[data-${attr}]`, body).forEach(b => b.onclick = () => {
    set(b.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())]);
    $$(`[data-${attr}]`, body).forEach(x => x.classList.toggle('on', x === b));
  });
}

/* ---------- API ---------- */

async function api(action, payload = {}) {
  if (cfg.url === 'demo') return mockApi(action, payload);
  let res;
  // Πολύ αδύναμο σήμα: μετά από 25 δευτερόλεπτα το θεωρούμε «χωρίς internet» (η αλλαγή μπαίνει σε αναμονή).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, pin: cfg.pin }),
      signal: ctrl.signal,
    });
  } catch {
    throw new Error('Δεν υπάρχει σύνδεση');
  } finally {
    clearTimeout(timer);
  }
  let j;
  try { j = await res.json(); } catch { throw new Error('Μη έγκυρη απάντηση — έλεγξε το URL'); }
  if (!j.ok) throw new Error(j.error || 'Σφάλμα');
  return j.data;
}

async function refresh(silent = false) {
  if (!loggedIn()) { ui.tab = 'login'; render(); return false; }
  // Πρώτα στέλνονται όσα περιμένουν. Αν μείνει κάτι (χωρίς internet), κρατάμε τα τοπικά δεδομένα.
  await flushQueue();
  if (pending().length) {
    if (!silent) toast('📴 Χωρίς internet — οι αλλαγές σου περιμένουν να σταλούν', true);
    return false;
  }
  setBusy(true);
  try {
    data = normalize(await api('all'));
    // Όσες αλλαγές έγιναν όσο φόρτωνε και δεν έχουν σταλεί ακόμα, να μη χαθούν από την οθόνη.
    for (const op of pending()) applyLocal(op.action, op.payload, guessRes(op.action, op.payload));
    saveData();
    if (ui.tab === 'login') ui.tab = 'home';
    render();
    if (!silent) toast('Ενημερώθηκε');
    return true;
  } catch (e) {
    if (e.message === 'Λάθος PIN') { logout(); toast('Λάθος PIN', true); }
    else if (!(silent && isOffline(e) && data.profile)) toast('Δεν έγινε ενημέρωση: ' + e.message, true);
    return false;
  } finally {
    setBusy(false);
  }
}

/* ----- χωρίς internet: ουρά αλλαγών ----- */

// Προσθήκες, αλλαγές και διαγραφές μπορούν να περιμένουν στη συσκευή και να σταλούν αργότερα, με τη σειρά.
const QUEUEABLE = ['add', 'update', 'delete'];
const OFFLINE = 'Δεν υπάρχει σύνδεση';
const isOffline = e => e && e.message === OFFLINE;
let offline = false;   // η τελευταία αποστολή απέτυχε επειδή δεν υπήρχε internet
const pending = () => store.get('household.queue', []);
function setPending(q) { store.set('household.queue', q); showPending(); }
function showPending() {
  const n = pending().length;
  const el = $('#pending');
  // Η ένδειξη φαίνεται μόνο όταν οι αλλαγές περιμένουν επειδή δεν υπάρχει internet (όχι στην κανονική αποστολή).
  el.hidden = !n || !offline || !loggedIn();
  el.textContent = `📴 ${n}`;
  el.title = `${n} ${n === 1 ? 'αλλαγή περιμένει' : 'αλλαγές περιμένουν'} να σταλεί${n === 1 ? '' : 'ούν'}`;
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

let flushing = null;
/** Στέλνει τις αλλαγές που περιμένουν, με τη σειρά. Σταματάει αν ξαναχαθεί το internet. */
function flushQueue() {
  // Αν τρέχει ήδη αποστολή (π.χ. ξεκίνησε όσο δεν υπήρχε internet), ξαναδοκιμάζουμε μόλις τελειώσει.
  if (flushing) return flushing.then(() => (pending().length ? flushQueue() : undefined));
  if (!pending().length) return Promise.resolve();
  flushing = sendPending().finally(() => { flushing = null; });
  return flushing;
}
async function sendPending() {
  const wasOffline = offline;
  let sent = 0, failed = false, shared = false;
  setBusy(true);
  try {
    while (pending().length) {
      const op = pending()[0];
      try {
        await api(op.action, op.payload);
        offline = false;
      } catch (e) {
        if (isOffline(e)) { offline = true; break; }
        if (e.message === 'Λάθος PIN') break;
        // Π.χ. η εγγραφή σβήστηκε στο μεταξύ από τον άλλον: η αλλαγή δεν γίνεται, συνεχίζουμε.
        toast('Μια αλλαγή δεν στάλθηκε: ' + e.message, true);
        failed = true;
      }
      if (['shop', 'prod'].includes(op.payload.sheet)) shared = true;
      setPending(pending().slice(1));
      sent++;
    }
  } finally {
    setBusy(false);
    showPending();
  }
  if (sent && wasOffline && !offline) toast(`✓ Στάλθηκ${sent === 1 ? 'ε 1 αλλαγή' : `αν ${sent} αλλαγές`} που περίμεναν`);
  // Κάτι δεν πέρασε ή ο server συμπλήρωσε κοινά στοιχεία (π.χ. φωτογραφία προϊόντος): φέρνουμε τα σωστά δεδομένα.
  if (!pending().length && (failed || shared)) refresh(true);
}

/** Εφαρμόζει μια αλλαγή στα τοπικά δεδομένα (res = ό,τι γύρισε ο server, ή εκτίμηση όταν δεν υπάρχει internet). */
function applyLocal(action, payload, res = {}) {
  const sheet = payload.sheet;
  const same = action === 'add' && data[sheet].find(r => r.id === payload.row.id);
  if (same) Object.assign(same, payload.row, res);     // υπάρχει ήδη (π.χ. ήρθε από τον server): όχι διπλό
  else if (action === 'add') data[sheet].push({ ...payload.row, ...res });
  else if (action === 'update') Object.assign(data[sheet].find(r => r.id === payload.row.id) || {}, payload.row, res);
  else if (action === 'delete') data[sheet] = data[sheet].filter(r => r.id !== payload.id);
  data = normalize(data);
  saveData();
}
/** Τι θα έβαζε ο server σε μια αλλαγή, για να φαίνεται σωστά μέχρι να σταλεί. */
function guessRes(action, payload) {
  const me = data.profile;
  if (action === 'add' && payload.sheet === 'shop') return { addedBy: me, done: false, doneBy: '', doneAt: '' };
  if (action === 'add' && payload.sheet === 'house') return { addedBy: me };
  if (action === 'update' && payload.sheet === 'shop' && 'done' in payload.row) {
    const d = new Date();
    return payload.row.done ? { doneBy: me, doneAt: `${isoDate(d)} ${d.toTimeString().slice(0, 5)}` } : { doneBy: '', doneAt: '' };
  }
  return {};
}

/**
 * Στέλνει μια αλλαγή στο Sheet. Προσθήκες/αλλαγές/διαγραφές εφαρμόζονται αμέσως στη συσκευή
 * και στέλνονται στο παρασκήνιο με τη σειρά (ή όταν βρεθεί internet), ώστε το app να μην περιμένει τον server.
 */
async function run(action, payload, okMsg) {
  // Κάθε νέα εγγραφή παίρνει ID από τη συσκευή, ώστε να μη γραφτεί ποτέ διπλή.
  if (action === 'add') payload = { ...payload, row: { id: newId(), ...payload.row } };
  if (QUEUEABLE.includes(action) && cfg.url !== 'demo') {
    setPending([...pending(), { action, payload }]);
    const res = guessRes(action, payload);
    applyLocal(action, payload, res);
    render();
    if (okMsg) toast(offline ? `📴 ${okMsg} — θα σταλεί μόλις βρεις internet` : okMsg);
    flushQueue();
    return { ...res, id: payload.row?.id ?? payload.id };
  }
  setBusy(true);
  try {
    // Οι υπόλοιπες ενέργειες (μετονομασίες κ.λπ.) θέλουν τον server· πρώτα στέλνονται όσα περιμένουν.
    await flushQueue();
    const res = await api(action, payload);
    const sheet = payload.sheet;
    if (QUEUEABLE.includes(action)) applyLocal(action, payload, res);
    else { data = normalize(await api('all')); saveData(); }
    render();
    if (okMsg) toast(okMsg);
    if (['shop', 'prod'].includes(sheet)) refresh(true);
    return res || true;
  } catch (e) {
    toast(isOffline(e) ? '📴 Αυτό χρειάζεται internet' : 'Σφάλμα: ' + e.message, true);
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
    tx.push({ id: uid(), date: d(15), type: TR, amount: 100, cat: '', sub: '', note: 'ΑΤΜ', acc: 'Πειραιώς', to: 'Μετρητά' });
  }
  tx.forEach(t => { if (!t.acc) t.acc = t.type === IN ? 'Πειραιώς' : t.cat === 'Daily Habits' ? 'Μετρητά' : 'Revolut'; });
  return {
    tx,
    acc: [
      { id: uid(), name: 'Μετρητά', icon: '💵', start: 50 },
      { id: uid(), name: 'Πειραιώς', icon: '🏦', start: 300 },
      { id: uid(), name: 'Revolut', icon: '💳', start: 120 },
    ],
    rec: [
      { id: uid(), name: 'Spotify', type: OUT, amount: 8.99, cat: 'Συνδρομές', sub: 'Spotify', acc: 'Revolut', every: 1, unit: 'μήνας', next: isoDate(new Date(y, today.getMonth(), today.getDate() - 2)) },
      { id: uid(), name: 'Starlink', type: OUT, amount: 80, cat: 'Λογαριασμοί', sub: 'Starlink', acc: 'Πειραιώς', every: 1, unit: 'μήνας', next: isoDate(new Date(y, today.getMonth(), today.getDate() + 3)) },
      { id: uid(), name: 'iCloud', type: OUT, amount: 2.99, cat: 'Συνδρομές', sub: 'iCloud', acc: 'Revolut', every: 1, unit: 'μήνας', next: isoDate(new Date(y, today.getMonth(), today.getDate() + 15)) },
    ],
    members: ['Γιώργος', 'Δοκιμή'],
    houseCat: [['Ενοίκιο', '🏠'], ['Ρεύμα', '⚡'], ['Νερό', '💧'], ['Internet', '🌐'], ['Κοινόχρηστα', '🏢'], ['Σούπερ μάρκετ', '🛒'], ['Είδη σπιτιού', '🧽'], ['Φαγητό', '🍕'], ['Άλλο', '📦']]
      .map(([name, icon]) => ({ id: uid(), name, icon })),
    house: (() => {
      const ym = isoDate(today).slice(0, 8);
      const h = (day, cat, amount, paidBy, note = '', payAcc = '') => ({
        id: uid(), date: ym + String(day).padStart(2, '0'), kind: 'Έξοδο', cat, amount, note, paidBy, owedBy: paidBy === 'Γιώργος' ? 'Δοκιμή' : 'Γιώργος',
        share: 50, payAcc, recvAcc: '', addedBy: paidBy,
      });
      return [
        h(1, 'Ενοίκιο', 600, 'Δοκιμή', '', 'Πειραιώς'),
        h(Math.min(5, today.getDate()), 'Ρεύμα', 72.4, 'Γιώργος'),
        h(Math.min(12, today.getDate()), 'Σούπερ μάρκετ', 43.2, 'Γιώργος', 'Σκλαβενίτης'),
        h(Math.min(20, today.getDate()), 'Φαγητό', 28, 'Δοκιμή', 'pizza', 'Revolut'),
      ];
    })(),
    houseRec: [
      { id: uid(), name: 'Ενοίκιο', cat: 'Ενοίκιο', amount: 600, paidBy: 'Δοκιμή', share: 50, every: 1, unit: 'μήνας', next: isoDate(new Date(y, today.getMonth() + 1, 1)) },
      { id: uid(), name: 'Internet', cat: 'Internet', amount: 30, paidBy: 'Γιώργος', share: 50, every: 1, unit: 'μήνας', next: isoDate(new Date(y, today.getMonth(), today.getDate() - 1)) },
    ],
    quick: [
      { id: uid(), name: 'Καφές', icon: '☕', type: OUT, amount: 2.5, cat: 'Daily Habits', sub: 'Καφές', acc: 'Μετρητά' },
      { id: uid(), name: 'Βενζίνη', icon: '⛽', type: OUT, amount: 0, cat: 'Μετακίνηση', sub: 'Βενζίνη', acc: 'Revolut' },
    ],
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
  db.lists ||= []; db.shop ||= []; db.prod ||= []; db.photos ||= {}; db.acc ||= []; db.rec ||= []; db.quick ||= [];
  db.members ||= ['Γιώργος', 'Δοκιμή']; db.house ||= []; db.houseCat ||= []; db.houseRec ||= [];
  const uid = () => Math.random().toString(36).slice(2, 10);
  let res = {};
  const same = (r, sub) => r.type === p.type && r.cat === p.cat && (!sub || r.sub === p.sub);
  const low = s => String(s || '').trim().toLowerCase();
  const inUse = id => db.prod.some(r => r.photo === id) || db.shop.some(r => r.photo === id) || db.tx.some(r => r.receipt === id) || (db.house || []).some(r => r.receipt === id);
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
    const row = { ...p.row, id: p.row.id || uid() };
    if (p.sheet === 'house') row.addedBy = 'Δοκιμή';
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
  } else if (action === 'discardPhoto') {
    trash(p.id);
  } else if (action === 'photo') {
    res = { data: db.photos[p.id] || '' };
  } else if (action === 'renameHouseCat') {
    const c = db.houseCat.find(x => x.id === p.id);
    [...db.house, ...db.houseRec].forEach(x => { if (x.cat === c.name) x.cat = p.name; });
    Object.assign(c, { name: p.name, icon: p.icon ?? c.icon });
  } else if (action === 'renameAcc') {
    const a = db.acc.find(x => x.id === p.id);
    db.tx.forEach(t => { if (t.acc === a.name) t.acc = p.name; if (t.to === a.name) t.to = p.name; });
    Object.assign(a, { name: p.name, icon: p.icon, start: p.start });
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

const TITLES = { login: 'Household Desk', home: 'Household Desk', tx: 'Κινήσεις', loans: 'Δανεικά', settings: 'Ρυθμίσεις', shop: 'Ψώνια', house: 'Σπίτι' };

function render() {
  if (!loggedIn()) ui.tab = 'login';
  document.body.classList.toggle('logged-out', ui.tab === 'login');
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#title').textContent = TITLES[ui.tab];
  $('#shopBtn').classList.toggle('active', ui.tab === 'shop');
  $('#houseBtn').classList.toggle('active', ui.tab === 'house');
  const hDue = ui.tab === 'login' ? 0 : dueHouseRecs().length;
  $('#houseBadge').hidden = !hDue;
  $('#houseBadge').textContent = hDue;
  const missing = data.shop.filter(i => !i.done).length;
  $('#shopBadge').hidden = !missing;
  $('#shopBadge').textContent = missing > 99 ? '99+' : missing;
  const due = ui.tab === 'login' ? 0 : dueRecs().length;
  $('#dueBadge').hidden = !due;
  $('#dueBadge').textContent = due;
  showPending();
  const v = $('#view');
  if (chart) { chart.destroy(); chart = null; }
  if (ui.tab === 'login') renderLogin(v);
  else if (ui.tab === 'shop') renderShop(v);
  else if (ui.tab === 'house') renderHouse(v);
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
  const years = [...new Set([ui.year, today.getFullYear(), ...allTx().map(t => +t.date.slice(0, 4)).filter(Boolean)])].sort((a, b) => b - a);
  const inYear = allTx().filter(t => t.date.startsWith(ui.year + '-'));
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
  const mIn = sum(incEntries.map(e => e[1])), mOut = sum(outEntries.map(e => e[1].total));
  const win = n => `<span class="${n < 0 ? 'neg' : 'pos'}">${eur(n)}</span>`;

  // Σύγκριση με τον προηγούμενο μήνα. Για τον τρέχοντα μήνα: μόνο οι ίδιες μέρες (1 έως σήμερα).
  const pY = ui.month === 0 ? ui.year - 1 : ui.year, pM = ui.month === 0 ? 11 : ui.month - 1;
  const isCur = ui.year === today.getFullYear() && ui.month === today.getMonth();
  const cutDay = isCur ? today.getDate() : 31;
  const pPrefix = `${pY}-${String(pM + 1).padStart(2, '0')}-`;
  const prevTx = allTx().filter(t => t.date.startsWith(pPrefix) && +t.date.slice(8, 10) <= cutDay);
  const curCut = isCur ? inMonth.filter(t => +t.date.slice(8, 10) <= cutDay) : inMonth;
  const pIn = sum(prevTx.filter(t => t.type === IN).map(t => t.amount));
  const pOut = sum(prevTx.filter(t => t.type === OUT).map(t => t.amount));
  const pOutBy = new Map();
  for (const t of prevTx) if (t.type === OUT) pOutBy.set(t.cat || NO_CAT, (pOutBy.get(t.cat || NO_CAT) || 0) + t.amount);
  const cOut = sum(curCut.filter(t => t.type === OUT).map(t => t.amount));
  const cIn = sum(curCut.filter(t => t.type === IN).map(t => t.amount));
  const hasPrev = prevTx.some(t => t.type === IN || t.type === OUT);
  // Ποσοστό αλλαγής· «καλό» = πράσινο (π.χ. λιγότερα έξοδα).
  const delta = (cur, prev, upIsGood) => {
    if (!hasPrev || !prev) return '';
    const p = Math.round((cur - prev) / prev * 100);
    if (p === 0) return '<small class="delta">= ίδια</small>';
    return `<small class="delta ${(p > 0) === upIsGood ? 'good' : 'bad'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</small>`;
  };
  const catDelta = c => {
    if (!hasPrev) return '';
    const d = round2((outBy.get(c)?.total || 0) - (pOutBy.get(c) || 0));
    return Math.abs(d) < 1 ? '' : `<small class="delta ${d > 0 ? 'bad' : 'good'}">${d > 0 ? '+' : '−'}${eur(Math.abs(d))}</small>`;
  };
  // «Πού πήγαν τα λεφτά»: οι 7 μεγαλύτερες κατηγορίες της χρονιάς έχουν σταθερό χρώμα, οι υπόλοιπες γκρι «Άλλα».
  const byCat = list => {
    const m = new Map();
    for (const t of list) {
      if (t.type !== OUT) continue;
      const c = t.cat || NO_CAT;
      if (!m.has(c)) m.set(c, { total: 0, subs: new Map() });
      const o = m.get(c);
      o.total += t.amount;
      o.subs.set(t.sub || '—', (o.subs.get(t.sub || '—') || 0) + t.amount);
    }
    return m;
  };
  const yearBy = byCat(inYear);
  const topCats = [...yearBy].sort((a, b) => b[1].total - a[1].total).slice(0, 7).map(e => e[0]);
  const colorOf = c => { const i = topCats.indexOf(c); return i >= 0 ? `var(--s${i + 1})` : 'var(--s-other)'; };
  const spScope = ui.spendScope === 'year' ? 'year' : 'month';
  const spEntries = [...(spScope === 'year' ? yearBy : outBy)].sort((a, b) => b[1].total - a[1].total);
  const spTotal = sum(spEntries.map(e => e[1].total));
  const spMax = Math.max(1, ...spEntries.map(e => e[1].total));
  const pctOf = a => spTotal ? Math.round(a / spTotal * 100) : 0;
  const others = sum(spEntries.filter(([c]) => !topCats.includes(c)).map(e => e[1].total));
  const spSegs = [
    ...spEntries.filter(([c]) => topCats.includes(c)).map(([c, o]) => [c, o.total, colorOf(c)]),
    ...(others > 0 ? [['Άλλα', others, 'var(--s-other)']] : []),
  ];

  const changes = hasPrev ? [...new Set([...outBy.keys(), ...pOutBy.keys()])]
    .map(c => [c, round2((outBy.get(c)?.total || 0) - (pOutBy.get(c) || 0))])
    .filter(([, d]) => Math.abs(d) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4) : [];

  v.innerHTML = `
    ${heroCard()}
    ${attentionCard()}

    <section class="card">
      <div class="month-nav">
        <button class="icon-btn" id="mPrev" aria-label="Προηγούμενος μήνας"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <div class="label">${MONTHS[ui.month]} ${ui.year}</div>
        <button class="icon-btn" id="mNext" aria-label="Επόμενος μήνας"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      ${balStrip(`${ui.year}-${mm}-01`, isoDate(new Date(ui.year, ui.month + 1, 0)), 'Στην αρχή του μήνα', 'Στο τέλος του μήνα')}
      <div class="stats">
        <div><span>Έσοδα</span><b class="pos">${eur(mIn)}</b>${delta(cIn, pIn, true)}</div>
        <div><span>Έξοδα</span><b>${eur(mOut)}</b>${delta(cOut, pOut, false)}</div>
        <div><span>Διαφορά</span><b class="${mIn - mOut < 0 ? 'neg' : ''}">${mIn - mOut > 0 ? '+' : ''}${eur(mIn - mOut)}</b></div>
      </div>
      ${hasPrev ? `
        <div class="cmp">
          <span class="muted small">Σε σύγκριση με ${MONTHS_ACC[pM]}${isCur ? ` (1–${cutDay} του μήνα)` : ''}</span>
          ${changes.length ? `<div class="cmp-chips">${changes.map(([c, d]) =>
            `<span class="cmp-chip ${d > 0 ? 'bad' : 'good'}">${esc(c)} <b>${d > 0 ? '+' : '−'}${eur(Math.abs(d))}</b></span>`).join('')}</div>` : ''}
        </div>` : ''}
      <div class="spend">
        <div class="spend-head">
          <h3>Πού πήγαν τα λεφτά</h3>
          <div class="seg small" id="spendScope">
            ${[['month', MONTHS_SHORT[ui.month]], ['year', `Όλο το ${ui.year}`]].map(([k, l]) => `<button data-scope="${k}" class="${spScope === k ? 'on' : ''}">${esc(l)}</button>`).join('')}
          </div>
        </div>
        ${spTotal ? `
          <div class="spend-bar" role="img" aria-label="Έξοδα ανά κατηγορία: ${esc(spSegs.map(([c, a]) => `${c} ${pctOf(a)}%`).join(', '))}">
            ${spSegs.map(([c, a, col]) => `<i data-seg="${esc(c)}" style="flex:${a.toFixed(2)} 1 0;background:${col}" title="${esc(c)}: ${eur(a)} (${pctOf(a)}%)"></i>`).join('')}
          </div>
          <p class="small muted spend-total">Σύνολο εξόδων: <b>${eur(spTotal)}</b></p>` : ''}
        ${spEntries.length ? spEntries.map(([c, o]) => `
          <details class="cat-break" data-cat-row="${esc(c)}">
            <summary>
              <div class="bar-row">
                <div class="bar-label"><span><i class="sw" style="background:${colorOf(c)}"></i>${esc(c)}</span><b>${spScope === 'month' ? catDelta(c) : ''}${eur(o.total)}<small class="pct">${pctOf(o.total)}%</small></b></div>
                <div class="bar"><i style="width:${(o.total / spMax * 100).toFixed(1)}%;background:${colorOf(c)}"></i></div>
              </div>
            </summary>
            <div class="subs">${[...o.subs].sort((a, b) => b[1] - a[1]).map(([s, a]) => `<div><span>${esc(s)}</span><span>${eur(a)}</span></div>`).join('')}</div>
          </details>`).join('') : `<p class="muted small">Κανένα έξοδο ${spScope === 'month' ? 'αυτόν τον μήνα' : 'φέτος'}.</p>`}
      </div>
      <div class="income-block">
        <h3>Έσοδα από</h3>
        ${incEntries.length ? bars(incEntries, 'in') : '<p class="muted small">Κανένα έσοδο.</p>'}
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Η χρονιά</h2>
        <select id="yearSel" class="year-select">${years.map(y => `<option ${y === ui.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>
      ${balStrip(`${ui.year}-01-01`, `${ui.year}-12-31`, 'Στην αρχή της χρονιάς', 'Στο τέλος της χρονιάς')}
      <div class="stats">
        <div><span>Έσοδα</span><b class="pos">${eur(totIn)}</b></div>
        <div><span>Έξοδα</span><b>${eur(totOut)}</b></div>
        <div><span>Διαφορά</span><b class="${totIn - totOut < 0 ? 'neg' : ''}">${totIn - totOut > 0 ? '+' : ''}${eur(totIn - totOut)}</b></div>
      </div>
      <div class="chart-wrap"><canvas id="chart" aria-label="Έσοδα και έξοδα ανά μήνα"></canvas></div>
      <details class="table-toggle">
        <summary>Πίνακας ανά μήνα</summary>
        <table class="months">
          <thead><tr><th>Μήνας</th><th>Έσοδα</th><th>Έξοδα</th><th>Υπόλοιπο</th></tr></thead>
          <tbody>${months.map((m, i) => `
            <tr data-m="${i}" class="${i === ui.month ? 'sel' : ''}">
              <td><span class="m-long">${MONTHS[i]}</span><span class="m-short">${MONTHS_SHORT[i]}</span></td><td>${eur(m.inc)}</td><td>${eur(m.out)}</td><td>${win(m.inc - m.out)}</td>
            </tr>`).join('')}</tbody>
          <tfoot><tr><td>Σύνολο</td><td>${eur(totIn)}</td><td>${eur(totOut)}</td><td>${win(totIn - totOut)}</td></tr></tfoot>
        </table>
      </details>
    </section>`;

  $$('#spendScope button', v).forEach(b => b.onclick = () => { ui.spendScope = b.dataset.scope; render(); });
  // Πάτημα σε κομμάτι της μπάρας: ανοίγει η κατηγορία από κάτω.
  $$('[data-seg]', v).forEach(s => s.onclick = () => {
    const row = $$('[data-cat-row]', v).find(r => r.dataset.catRow === s.dataset.seg);
    if (row) { row.open = true; row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  $$('[data-acc-open]', v).forEach(b => b.onclick = () => {
    ui.txAcc = b.dataset.accOpen; ui.txMonth = 'all'; ui.txType = 'all'; ui.tab = 'tx';
    render(); window.scrollTo(0, 0);
  });
  $$('[data-rec]', v).forEach(b => b.onclick = () => openRecPay(data.rec.find(r => r.id === b.dataset.rec)));
  $$('[data-recpay]', v).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const r = data.rec.find(x => x.id === b.dataset.recpay);
    payRec(r, { amount: r.amount, date: r.next, acc: r.acc });
  });
  if ($('#homeHouse')) $('#homeHouse').onclick = () => { ui.tab = 'house'; render(); window.scrollTo(0, 0); refresh(true); };
  const addAcc = $('#homeAddAcc');
  if (addAcc) addAcc.onclick = () => openAccForm();
  $('#yearSel').onchange = e => { ui.year = +e.target.value; render(); };
  $$('tbody tr[data-m]', v).forEach(tr => tr.onclick = () => { ui.month = +tr.dataset.m; render(); });
  $('#mPrev').onclick = () => { if (ui.month === 0) { ui.month = 11; ui.year--; } else ui.month--; render(); };
  $('#mNext').onclick = () => { if (ui.month === 11) { ui.month = 0; ui.year++; } else ui.month++; render(); };
  drawChart(months);
}

const dueRecs = () => data.rec.filter(r => r.next && daysUntil(r.next) <= 0).sort((a, b) => a.next.localeCompare(b.next));

/** «Να θυμάσαι»: πάγια για χρέωση (και όσα έρχονται την εβδομάδα) και ποιος χρωστάει στο Σπίτι. */
function attentionCard() {
  const rows = data.rec.filter(r => r.next && daysUntil(r.next) <= 7).sort((a, b) => a.next.localeCompare(b.next));
  const house = data.house.length && data.members.length > 1;
  if (!rows.length && !house) return '';
  const when = r => {
    const n = daysUntil(r.next);
    return n < -1 ? `από ${fmtDate(r.next)}` : n === -1 ? 'από χθες' : n === 0 ? 'σήμερα' : n === 1 ? 'αύριο' : `σε ${n} μέρες`;
  };
  const hb = house ? houseBalance() : 0, other = otherOf(data.profile);
  return `
    <section class="card attention">
      <h2>Να θυμάσαι</h2>
      ${rows.map(r => {
        const isDue = daysUntil(r.next) <= 0;
        return `
        <div class="rec-row ${isDue ? 'due' : ''}" data-rec="${esc(r.id)}">
          ${recDate(r.next)}
          <span class="si-main"><b>${esc(r.name)}</b><small>${when(r)}</small></span>
          <span class="amt ${r.type === IN ? 'pos' : ''}">${r.type === IN ? '+' : ''}${eur(r.amount)}</span>
          <button class="rec-ok ${isDue ? '' : 'soft'}" data-recpay="${esc(r.id)}" aria-label="${r.type === IN ? 'Μπήκαν' : 'Χρεώθηκε'}">${ICON_CHECK}</button>
        </div>`;
      }).join('')}
      ${house ? `
        <button class="rec-row house-row" id="homeHouse">
          <span class="rec-date house-ico">${ICON_HOME}</span>
          <span class="si-main"><b>Σπίτι</b><small>${hb > 0 ? `${esc(other)} σου χρωστάει` : hb < 0 ? `χρωστάς σε ${esc(other)}` : 'είστε πάτσι ✓'}</small></span>
          ${hb ? `<span class="amt ${hb > 0 ? 'pos' : 'neg'}">${eur(Math.abs(hb))}</span>` : ''}
          <span class="chev">${ICON_CHEV}</span>
        </button>` : ''}
    </section>`;
}

/** Καταχωρεί τη χρέωση ενός πάγιου και το μεταθέτει στην επόμενη περίοδο. */
async function payRec(r, o) {
  const row = { date: o.date, type: r.type, amount: o.amount, cat: r.cat, sub: r.sub, note: tplNote(r), acc: o.acc || '', to: '' };
  if (!await run('add', { sheet: 'tx', row })) return false;
  return run('update', { sheet: 'rec', row: { id: r.id, next: addPeriod(r.next, r.every, r.unit) } }, `✓ ${r.name} ${eur(o.amount)} — επόμενη ${fmtDate(addPeriod(r.next, r.every, r.unit))}`);
}

function openRecPay(r) {
  const f = { amount: String(r.amount).replace('.', ','), date: daysUntil(r.next) > 0 ? isoDate(new Date()) : r.next, acc: r.acc };
  const body = openSheet(r.name);
  body.innerHTML = `
    <p class="small muted" style="margin-top:4px">${esc(freqLabel(r))} · ${esc(r.cat || NO_CAT)}${r.sub ? ' · ' + esc(r.sub) : ''} · χρέωση ${fmtDate(r.next)}</p>
    <label class="field amount"><span>${r.type === IN ? 'Ποσό που μπήκε' : 'Ποσό που χρεώθηκε'} (€)</span><input id="rpAmt" inputmode="decimal" autocomplete="off" value="${esc(f.amount)}"></label>
    ${data.acc.length ? `<div class="field"><span>${r.type === IN ? 'Μπήκαν σε' : 'Πληρώθηκε από'}</span>${accChips('rpacc', f.acc)}</div>` : ''}
    ${dateField('rpDate', f.date)}
    <div class="actions">
      <button class="btn" id="rpSkip">Παράλειψη</button>
      <button class="btn primary" id="rpOk">${r.type === IN ? '✓ Μπήκαν' : '✓ Χρεώθηκε'}</button>
    </div>
    <button class="link-btn block-link" id="rpEdit">✎ Αλλαγή πάγιου</button>`;
  wireDateField(body, 'rpDate');
  wireAccChips(body, 'rpacc', v => { f.acc = v; });
  $('#rpOk', body).onclick = async e => {
    const amount = round2(num($('#rpAmt', body).value));
    const date = $('#rpDate', body).value;
    if (!(amount > 0)) return toast('Βάλε ποσό', true);
    if (!date) return toast('Βάλε ημερομηνία', true);
    e.target.disabled = true;
    if (await payRec(r, { amount, date, acc: f.acc })) closeSheet(); else e.target.disabled = false;
  };
  $('#rpSkip', body).onclick = async () => {
    if (!await confirmBox(`Παράλειψη «${r.name}»;`, `Δεν καταχωρείται τίποτα αυτή τη φορά. Η επόμενη φορά πάει στις ${fmtDate(addPeriod(r.next, r.every, r.unit))}.`, 'Παράλειψη')) return;
    run('update', { sheet: 'rec', row: { id: r.id, next: addPeriod(r.next, r.every, r.unit) } }, 'Παραλείφθηκε');
  };
  $('#rpEdit', body).onclick = () => openTplForm('rec', r);
}

/**
 * «Από πριν → Στο τέλος» για μια περίοδο: πόσα είχαν όλα τα ταμεία μαζί στην αρχή της
 * (τέλος της προηγούμενης μέρας) και στο τέλος της. Για τον τρέχοντα μήνα/χρόνο, «Σήμερα».
 */
function balStrip(from, to, fromLbl, toLbl) {
  if (!data.acc.length) return '';
  const todayIso = isoDate(new Date());
  if (from > todayIso) return '';
  const open = totalAt(dayBefore(from));
  const cur = to >= todayIso;
  const close = totalAt(cur ? todayIso : to);
  return `
    <div class="bal-strip">
      <div><span>${fromLbl}</span><b>${eur(open)}</b></div>
      <i aria-hidden="true">${ICON_CHEV}</i>
      <div><span>${cur ? 'Σήμερα' : toLbl}</span><b class="${close < open ? 'neg' : close > open ? 'pos' : ''}">${eur(close)}</b></div>
    </div>`;
}

/** Η κεντρική κάρτα της Αρχικής: πόσα λεφτά έχεις (σύνολο ταμείων) και ο τρέχων μήνας με μια ματιά. */
function heroCard() {
  const now = new Date();
  const ym = isoDate(now).slice(0, 7);
  const cur = allTx().filter(t => t.date.startsWith(ym));
  const inc = sum(cur.filter(t => t.type === IN).map(t => t.amount));
  const out = sum(cur.filter(t => t.type === OUT).map(t => t.amount));
  const bal = accBalances();
  const hasAcc = data.acc.length > 0;
  const total = hasAcc ? sum([...bal.values()]) : inc - out;
  return `
    <section class="hero-card">
      <div class="hero-top">
        <span>${hasAcc ? 'Διαθέσιμο' : `Υπόλοιπο ${MONTHS_ACC[now.getMonth()].replace('τον ', '')}`}</span>
        ${data.profile ? `<span class="hero-hello">Γεια σου, ${esc(data.profile)}</span>` : ''}
      </div>
      <b class="hero-amt">${eur(total)}</b>
      <div class="hero-month">
        <span class="hero-m">${MONTHS[now.getMonth()]}</span>
        <span><i class="up">↑</i>${eur(inc)}</span>
        <span><i class="down">↓</i>${eur(out)}</span>
      </div>
      ${hasAcc ? `
        <div class="hero-accs">${data.acc.map(a => {
          const n = bal.get(a.name) || 0;
          return `<button class="hero-acc" data-acc-open="${esc(a.name)}"><span>${esc(a.icon || '💳')} ${esc(a.name)}</span><b>${eur(n)}</b></button>`;
        }).join('')}</div>` : `
        <button class="hero-add" id="homeAddAcc">+ Πρόσθεσε τα ταμεία σου (Μετρητά, τράπεζες…) για να βλέπεις πόσα έχεις</button>`}
    </section>`;
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
  const months = [...new Set([ymOf(isoDate(today)), ...allTx().map(t => ymOf(t.date))])]
    .filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  if (ui.txMonth !== 'all' && !months.includes(ui.txMonth)) ui.txMonth = months[0];
  const cats = [...new Set([...data.cat.map(c => c.cat), ...allTx().map(t => t.cat)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));

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
        ${[['all', 'Όλα'], [IN, 'Έσοδα'], [OUT, 'Έξοδα'], [TR, 'Μεταφορές']].map(([k, l]) => `<button data-v="${k}" class="${ui.txType === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div class="search-row">
        <input id="txQ" type="search" placeholder="Αναζήτηση… (π.χ. καφές >3)" value="${esc(ui.txQuery)}">
        <button class="btn small filter-btn ${ui.txAcc || ui.txCat ? 'on' : ''}" id="txMore" aria-expanded="${ui.txFilters ? 'true' : 'false'}">
          <svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Φίλτρα${ui.txAcc || ui.txCat ? ` <i>${(ui.txAcc ? 1 : 0) + (ui.txCat ? 1 : 0)}</i>` : ''}
        </button>
      </div>
      ${ui.txFilters || ui.txAcc || ui.txCat ? `
      <div class="row2">
        ${data.acc.length ? `
        <select id="txAcc">
          <option value="">Όλα τα ταμεία</option>
          ${data.acc.map(a => `<option value="${esc(a.name)}" ${a.name === ui.txAcc ? 'selected' : ''}>${esc(a.icon || '💳')} ${esc(a.name)}</option>`).join('')}
        </select>` : ''}
        <select id="txCat">
          <option value="">Όλες οι κατηγορίες</option>
          ${cats.map(c => `<option ${c === ui.txCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>` : ''}
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
  $('#txMore').onclick = () => { ui.txFilters = !(ui.txFilters || ui.txAcc || ui.txCat); if (!ui.txFilters) { ui.txAcc = ''; ui.txCat = ''; } render(); };
  if ($('#txCat')) $('#txCat').onchange = e => { ui.txCat = e.target.value; render(); };
  if ($('#txAcc')) $('#txAcc').onchange = e => { ui.txAcc = e.target.value; render(); };
  $('#txQ').oninput = e => { ui.txQuery = e.target.value; renderTxList(); };
  renderTxList();
}

/**
 * Χρώμα κατηγορίας εξόδων: οι 7 μεγαλύτερες της χρονιάς έχουν σταθερό χρώμα (τα ίδια με το
 * «Πού πήγαν τα λεφτά»), οι υπόλοιπες γκρι. Υπολογίζεται μία φορά ανά σχεδίαση.
 */
function catColors(year = new Date().getFullYear()) {
  const by = new Map();
  for (const t of allTx()) if (t.type === OUT && t.date.startsWith(year + '-')) by.set(t.cat || NO_CAT, (by.get(t.cat || NO_CAT) || 0) + t.amount);
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 7).map(e => e[0]);
  return c => { const i = top.indexOf(c || NO_CAT); return i >= 0 ? `var(--s${i + 1})` : 'var(--s-other)'; };
}
let colorCat = c => 'var(--s-other)';
/** Κυκλάκι αριστερά σε κάθε κίνηση: χρώμα και αρχικό της κατηγορίας, ή σύμβολο για μεταφορές κ.λπ. */
function txIcon(t) {
  if (t.type === TR) return `<span class="cat-ico" style="--c:var(--tr)">${ICON_SWAP}</span>`;
  if (t.type === ADJ) return '<span class="cat-ico sym">±</span>';
  if (t.type === LOAN) return '<span class="cat-ico sym">⇄</span>';
  if (t.type === HSET) return `<span class="cat-ico" style="--c:var(--house)">${ICON_SWAP}</span>`;
  if (t.house) return `<span class="cat-ico" style="--c:var(--house)">${ICON_HOME}</span>`;
  const letter = esc((t.cat || '?').trim().charAt(0).toUpperCase());
  return t.type === IN
    ? `<span class="cat-ico" style="--c:var(--pos)">${letter}</span>`
    : `<span class="cat-ico" style="--c:${colorCat(t.cat)}">${letter}</span>`;
}

/** Πεζά χωρίς τόνους, ώστε το «καφες» να βρίσκει το «Καφές». */
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Αναζήτηση: λέξεις + φίλτρα ποσού (>50, <10, >=20, 20-40, ή σκέτο ποσό 8,99). */
function parseQuery(text) {
  const words = [], tests = [];
  const n = s => parseFloat(s.replace(',', '.'));
  for (const tok of fold(text).split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^(>=|<=|>|<)(\d+(?:[.,]\d+)?)€?$/))) {
      const v = n(m[2]), op = m[1];
      tests.push(a => op === '>' ? a > v : op === '<' ? a < v : op === '>=' ? a >= v : a <= v);
    } else if ((m = tok.match(/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)€?$/))) {
      const lo = n(m[1]), hi = n(m[2]);
      tests.push(a => a >= Math.min(lo, hi) && a <= Math.max(lo, hi));
    } else if ((m = tok.match(/^(\d+(?:[.,]\d+)?)€?$/))) {
      const v = n(m[1]);
      tests.push(a => Math.abs(a - v) < 0.005 || String(a).startsWith(m[1].replace(',', '.')));
    } else words.push(tok);
  }
  return { words, amountOk: a => tests.every(f => f(a)) };
}

function renderTxList() {
  colorCat = catColors();
  const { words, amountOk } = parseQuery(ui.txQuery);
  const list = allTx()
    .filter(t => ui.txMonth === 'all' || ymOf(t.date) === ui.txMonth)
    .filter(t => ui.txType === 'all' || t.type === ui.txType)
    .filter(t => !ui.txCat || t.cat === ui.txCat)
    .filter(t => !ui.txAcc || t.acc === ui.txAcc || t.to === ui.txAcc)
    .filter(t => amountOk(Math.abs(t.amount)))
    .filter(t => {
      if (!words.length) return true;
      const hay = fold([t.cat, t.sub, t.note, t.acc, t.to, t.type === ADJ ? 'διόρθωση' : '', t.type === LOAN ? 'δανεικό' : '', t.type === TR ? 'μεταφορά' : ''].join(' '));
      return words.every(w => hay.includes(w));
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Με φίλτρο ταμείου, οι μεταφορές μετράνε ως μπήκαν/βγήκαν από αυτό το ταμείο.
  const inc = sum(list.filter(t => t.type === IN || (ui.txAcc && t.type === TR && t.to === ui.txAcc)).map(t => t.amount))
    + (ui.txAcc ? sum(list.filter(t => signed(t) && t.amount > 0).map(t => t.amount)) : 0);
  const out = sum(list.filter(t => t.type === OUT || (ui.txAcc && t.type === TR && t.acc === ui.txAcc)).map(t => t.amount))
    - (ui.txAcc ? sum(list.filter(t => signed(t) && t.amount < 0).map(t => t.amount)) : 0);
  const acc = data.acc.find(a => a.name === ui.txAcc);
  $('#txSummary').innerHTML = `
    ${acc ? `<div class="acc-bar"><span>${esc(acc.icon || '💳')} Υπόλοιπο <b>${eur(accBalances().get(acc.name))}</b></span><button class="btn small" id="txAdjust">⚖️ Διόρθωση</button></div>` : ''}
    <div class="summary-row"><span>${list.length} ${list.length === 1 ? 'κίνηση' : 'κινήσεις'}</span><span><span class="pos">+${eur(inc)}</span> · <span class="neg">−${eur(out)}</span></span></div>
    ${ui.txQuery.trim() && ui.txMonth !== 'all' ? '<button class="link-btn" id="txAllMonths">🔎 Ψάξε σε όλους τους μήνες</button>' : ''}`;
  if (acc) $('#txAdjust').onclick = () => openAdjust(acc);
  if ($('#txAllMonths')) $('#txAllMonths').onclick = () => { ui.txMonth = 'all'; $('#txMonth').value = 'all'; renderTxList(); };

  if (!list.length) { $('#txList').innerHTML = '<div class="empty">Δεν βρέθηκαν κινήσεις.</div>'; return; }
  const days = new Map();
  for (const t of list) { if (!days.has(t.date)) days.set(t.date, []); days.get(t.date).push(t); }
  $('#txList').innerHTML = [...days].map(([d, items]) => `
    <div class="day">
      <div class="day-h"><span>${esc(dayLabel(d))}</span></div>
      <div class="list">${items.map(t => signed(t) ? `
        <button class="item" data-id="${esc(t.id)}">
          ${txIcon(t)}
          <span class="item-main">
            <b>${t.type === ADJ ? 'Διόρθωση υπολοίπου' : t.type === HSET ? `🏠 Εξόφληση ${esc(t.note)}` : `Δανεικό${t.note ? ' · ' + esc(t.note) : ''}`}</b>
            <small>${t.acc ? `${esc(accIcon(t.acc))} ${esc(t.acc)}` : 'χωρίς ταμείο'}${t.type === ADJ && t.note ? ' · ' + esc(t.note) : ''}</small>
          </span>
          <span class="amt ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${eur(Math.abs(t.amount))}</span>
        </button>` : t.type === TR ? `
        <button class="item" data-id="${esc(t.id)}">
          ${txIcon(t)}
          <span class="item-main">
            <b>${esc(t.acc || '?')} → ${esc(t.to || '?')}</b>
            <small>Μεταφορά${t.note ? ' · ' + esc(t.note) : ''}</small>
          </span>
          <span class="amt ${ui.txAcc === t.to ? 'pos' : ui.txAcc === t.acc ? 'neg' : 'tr-amt'}">${ui.txAcc === t.to ? '+' : ui.txAcc === t.acc ? '−' : ''}${eur(t.amount)}</span>
        </button>` : `
        <button class="item" data-id="${esc(t.id)}">
          ${txIcon(t)}
          <span class="item-main">
            <b>${esc(t.cat || NO_CAT)}${t.sub ? ' · ' + esc(t.sub) : ''}${t.receipt ? ' <span class="clip" title="Έχει απόδειξη">📎</span>' : ''}</b>
            ${t.note || t.acc ? `<small>${t.acc ? `${esc(accIcon(t.acc))} ${esc(t.acc)}` : ''}${t.acc && t.note ? ' · ' : ''}${esc(t.note)}</small>` : ''}
          </span>
          <span class="amt ${t.type === IN ? 'pos' : ''}">${t.type === IN ? '+' : '−'}${eur(t.amount)}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
  $$('#txList .item').forEach(b => b.onclick = () => {
    const t = allTx().find(x => x.id === b.dataset.id);
    if (t.house) openHouseItem(data.house.find(h => h.id === t.houseId));
    else if (signed(t)) openSignedTx(t); else openTxForm(t);
  });
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
    if (cb.checked && data.acc.length) return openLoanSettle(data.loan.find(l => l.id === cb.dataset.paid));
    run('update', { sheet: 'loan', row: { id: cb.dataset.paid, paid: cb.checked } }, cb.checked ? 'Σημειώθηκε ως ξοφλημένο' : 'Άνοιξε ξανά');
  });
}

/* ----- Σπίτι (κοινά) ----- */

const shareLabel = h => h.share === 50 ? 'μισά-μισά' : h.share === 100 ? `όλο για ${h.owedBy}` : h.share === 0 ? `όλο για ${h.paidBy}` : `${h.paidBy} ${100 - h.share}% · ${h.owedBy} ${h.share}%`;
const dueHouseRecs = () => data.houseRec.filter(r => r.next && daysUntil(r.next) <= 0);

function renderHouse(v) {
  const me = data.profile, other = otherOf(me);
  if (data.members.length < 2) {
    v.innerHTML = `<div class="empty">Το Σπίτι είναι κοινό για δύο άτομα. Χρειάζεται και δεύτερο προφίλ (PIN) στο Apps Script.</div>`;
    return;
  }
  const bal = houseBalance();
  const months = [...new Set([ymOf(isoDate(today)), ...data.house.map(h => ymOf(h.date))])].filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  if (!months.includes(ui.houseMonth)) ui.houseMonth = months[0];
  const inMonth = data.house.filter(h => ymOf(h.date) === ui.houseMonth).sort((a, b) => b.date.localeCompare(a.date));
  const exp = inMonth.filter(h => h.kind === H_EXP);
  const total = sum(exp.map(h => h.amount));
  const byCat = new Map();
  exp.forEach(h => byCat.set(h.cat || 'Άλλο', (byCat.get(h.cat || 'Άλλο') || 0) + h.amount));
  const paidBy = data.members.map(m => [m, sum(exp.filter(h => h.paidBy === m).map(h => h.amount))]);
  const shareOf = data.members.map(m => [m, sum(exp.map(h => houseShare(h, m)))]);
  const recs = data.houseRec.filter(r => r.next && daysUntil(r.next) <= 7).sort((a, b) => a.next.localeCompare(b.next));
  const mi = months.indexOf(ui.houseMonth);

  v.innerHTML = `
    <section class="card house-hero ${bal > 0 ? 'plus' : bal < 0 ? 'minus' : 'even'}">
      <span>${bal > 0 ? `${esc(other)} σου χρωστάει` : bal < 0 ? `Χρωστάς → ${esc(other)}` : 'Είστε πάτσι'}</span>
      <b>${bal ? eur(Math.abs(bal)) : '✓'}</b>
      ${bal ? '<button class="btn small" id="hSettle">🤝 Εξόφληση</button>' : ''}
    </section>
    <button class="btn primary block" id="hAdd" style="margin:0 0 14px">+ Κοινό έξοδο</button>

    ${recs.length ? `
    <section class="card recs">
      <div class="accs-head"><h2>Πάγια σπιτιού</h2>${dueHouseRecs().length ? `<span class="due-badge">${dueHouseRecs().length} για πληρωμή</span>` : ''}</div>
      <div class="list flat">${recs.map(r => {
        const due = daysUntil(r.next) <= 0;
        return `
        <div class="rec-row ${due ? 'due' : ''}" data-hrec="${esc(r.id)}">
          ${recDate(r.next)}
          <span class="si-main"><b>${esc(houseIcon(r.cat))} ${esc(r.name)}</b><small>πληρώνει ${esc(r.paidBy || '—')}</small></span>
          <span class="amt">${eur(r.amount)}</span>
          <button class="rec-ok ${due ? '' : 'soft'}" data-hrec="${esc(r.id)}" aria-label="Πληρώθηκε">${ICON_CHECK}</button>
        </div>`;
      }).join('')}</div>
    </section>` : ''}

    <section class="card">
      <div class="month-nav">
        <button class="icon-btn" id="hPrev" ${mi >= months.length - 1 ? 'disabled' : ''} aria-label="Προηγούμενος μήνας"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <div class="label">${monthLabel(ui.houseMonth)}</div>
        <button class="icon-btn" id="hNext" ${mi <= 0 ? 'disabled' : ''} aria-label="Επόμενος μήνας"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="kpis" style="margin:10px 0 0">
        <div class="kpi"><span>Σύνολο σπιτιού</span><b>${eur(total)}</b></div>
        ${shareOf.map(([m, s]) => `<div class="kpi"><span>Μερίδιο ${esc(m)}</span><b>${eur(s)}</b><small class="delta">πλήρωσε ${eur(paidBy.find(p => p[0] === m)[1])}</small></div>`).join('')}
      </div>
      ${byCat.size ? `<div style="margin-top:14px">${bars([...byCat].sort((a, b) => b[1] - a[1]).map(([c, a]) => [`${houseIcon(c)} ${c}`, a]), 'out')}</div>` : ''}
    </section>

    ${inMonth.length ? `<div class="list">${inMonth.map(h => h.kind === H_SET ? `
      <button class="item" data-house="${esc(h.id)}">
        <span class="cat-ico sym">${ICON_SWAP}</span>
        <span class="item-main"><b>🤝 ${esc(h.paidBy)} → ${esc(h.owedBy)}</b><small>Εξόφληση · ${fmtDate(h.date)}${h.note ? ' · ' + esc(h.note) : ''}</small></span>
        <span class="amt tr-amt">${eur(h.amount)}</span>
      </button>` : `
      <button class="item" data-house="${esc(h.id)}">
        <span class="list-emoji">${esc(houseIcon(h.cat))}</span>
        <span class="item-main"><b>${esc(h.cat || 'Άλλο')}${h.note ? ' · ' + esc(h.note) : ''}${h.receipt ? ' <span class="clip" title="Έχει απόδειξη">📎</span>' : ''}</b>
          <small>πλήρωσε <b class="payer">${esc(h.paidBy)}</b> · ${esc(shareLabel(h))} · ${fmtDate(h.date)}</small></span>
        <span class="amt">${eur(h.amount)}</span>
      </button>`).join('')}</div>` : '<div class="empty">Κανένα κοινό έξοδο αυτόν τον μήνα.</div>'}`;

  if ($('#hSettle')) $('#hSettle').onclick = () => openSettle();
  $('#hAdd').onclick = () => openHouseForm();
  $('#hPrev').onclick = () => { ui.houseMonth = months[mi + 1]; render(); };
  $('#hNext').onclick = () => { ui.houseMonth = months[mi - 1]; render(); };
  $$('[data-house]', v).forEach(b => b.onclick = () => openHouseItem(data.house.find(h => h.id === b.dataset.house)));
  $$('[data-hrec]', v).forEach(b => b.onclick = e => { e.stopPropagation(); payHouseRec(data.houseRec.find(r => r.id === b.dataset.hrec)); });
}

function openHouseItem(h) {
  if (!h) return;
  if (h.kind === H_SET) openSettle(h); else openHouseForm(h);
}

/** Πληρωμή κοινού πάγιου: ανοίγει τη φόρμα κοινού εξόδου συμπληρωμένη και μετά πάει στην επόμενη χρέωση. */
function payHouseRec(r) {
  openHouseForm(null, {
    title: r.name,
    prefill: { cat: r.cat, amount: r.amount, paidBy: r.paidBy || data.profile, share: r.share, note: r.name === r.cat ? '' : r.name, date: daysUntil(r.next) > 0 ? isoDate(new Date()) : r.next },
    extra: `<p class="small muted">${esc(freqLabel(r))} · η επόμενη χρέωση θα πάει στις ${fmtDate(addPeriod(r.next, r.every, r.unit))}.</p>
            <button class="link-btn block-link" id="hrEdit">✎ Αλλαγή πάγιου</button>`,
    wire: body => { $('#hrEdit', body).onclick = () => openHouseRecForm(r); },
    onSaved: () => run('update', { sheet: 'houseRec', row: { id: r.id, next: addPeriod(r.next, r.every, r.unit) } }),
  });
}

/** Επιλογές μοιρασιάς: [ποσοστό του άλλου, ετικέτα]. */
const SPLITS = (payer, other) => [[50, 'Μισά-μισά'], [100, `Όλο για ${other}`], [0, `Όλο για ${payer}`]];

/**
 * Κοινό έξοδο: νέο ή επεξεργασία.
 * opts: prefill (τιμές), title, extra (HTML κάτω από τη φόρμα), wire(body), onSaved(), clearList (όνομα λίστας ψωνιών), doneCount.
 */
function openHouseForm(h, opts = {}) {
  const me = data.profile;
  const edit = !!h;
  const p = opts.prefill || {};
  const f = edit
    ? { ...h, amount: String(h.amount).replace('.', ',') }
    : { date: p.date || isoDate(new Date()), cat: p.cat || '', amount: p.amount ? String(p.amount).replace('.', ',') : '', note: p.note || '', paidBy: p.paidBy || me, share: p.share ?? 50, payAcc: lastAcc() };
  let custom = ![0, 50, 100].includes(f.share);
  let clear = !!opts.doneCount;
  let sure = false;
  const rc = { receipt: edit ? h.receipt : '', uploads: [] };   // απόδειξη
  let keptReceipt = null;
  const body = openSheet(opts.title || (edit ? 'Κοινό έξοδο' : 'Νέο κοινό έξοδο'));
  sheetOnClose = () => discardReceipts(rc, keptReceipt);
  const read = () => {
    f.amount = $('#hAmt', body).value;
    f.date = $('#hDate', body).value;
    f.note = $('#hNote', body).value;
    const c = $('#hPct', body);
    if (c) f.share = Math.min(100, Math.max(0, Math.round(num(c.value))));
  };
  const draw = () => {
    const other = otherOf(f.paidBy);
    const amount = num(f.amount);
    const splits = SPLITS(f.paidBy, other);
    body.innerHTML = `
      <label class="field amount"><span>Ποσό (€)</span><input id="hAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
      <div class="field"><span>Κατηγορία</span>
        <div class="chips">${data.houseCat.map(c => `<button type="button" class="chip ${c.name === f.cat ? 'on' : ''}" data-hcat="${esc(c.name)}">${esc(c.icon || '📦')} ${esc(c.name)}</button>`).join('')}</div>
      </div>
      <div class="field"><span>Ποιος πλήρωσε</span>
        <div class="seg big payer-seg">${data.members.map(m => `<button type="button" data-payer="${esc(m)}" class="${m === f.paidBy ? 'on' : ''}">${m === me ? `Εγώ (${esc(m)})` : esc(m)}</button>`).join('')}</div>
      </div>
      ${f.paidBy === me && data.acc.length ? `<div class="field"><span>Από ταμείο</span>${accChips('hacc', f.payAcc, '', 'Κανένα')}</div>` : ''}
      <div class="field"><span>Μοιρασιά</span>
        <div class="chips">
          ${splits.map(([s, l]) => `<button type="button" class="chip ${!custom && f.share === s ? 'on' : ''}" data-split="${s}">${esc(l)}</button>`).join('')}
          <button type="button" class="chip ${custom ? 'on' : ''}" data-split="custom">Άλλο %</button>
        </div>
        ${custom ? `<label class="pct-row">${esc(other)} πληρώνει <input id="hPct" inputmode="numeric" value="${f.share}"> %</label>` : ''}
        ${amount > 0 ? `<p class="small muted split-preview">${esc(f.paidBy)}: <b>${eur(amount * (100 - f.share) / 100)}</b> · ${esc(other)}: <b>${eur(amount * f.share / 100)}</b></p>` : ''}
      </div>
      ${dateField('hDate', f.date)}
      <label class="field"><span>Σημείωση</span><input id="hNote" type="text" placeholder="προαιρετικό (π.χ. Σκλαβενίτης)" value="${esc(f.note)}" autocomplete="off"></label>
      ${opts.doneCount ? `<label class="toggle"><input id="hClear" type="checkbox" class="check" ${clear ? 'checked' : ''}> Καθάρισε και τα ${opts.doneCount} αγορασμένα από τη λίστα</label>` : ''}
      ${receiptBox(rc)}
      ${edit ? `<p class="small muted">Το πρόσθεσε ${esc(h.addedBy || '—')}.</p>` : ''}
      ${opts.extra || ''}
      ${edit ? '<button class="btn block" id="hAgain">↻ Ξανά το ίδιο, με σημερινή ημερομηνία</button>' : ''}
      <div class="actions">
        ${edit ? `<button class="btn danger ${sure ? 'sure' : ''}" id="hDel">${sure ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="hSave">Αποθήκευση</button>
      </div>`;
    wireDateField(body, 'hDate');
    wireReceipt(body, rc, () => { read(); draw(); });
    const again = $('#hAgain', body);
    if (again) again.onclick = () => openHouseForm(null, {
      title: '↻ Ξανά το ίδιο',
      prefill: { cat: h.cat, amount: h.amount, note: h.note, paidBy: h.paidBy, share: h.share },
    });
    if (opts.wire) opts.wire(body);
    if (!edit && !f.amount) setTimeout(() => $('#hAmt', body)?.focus(), 60);
    $('#hAmt', body).onchange = () => { read(); draw(); };
    const pct = $('#hPct', body);
    if (pct) pct.onchange = () => { read(); draw(); };
    if ($('#hClear', body)) $('#hClear', body).onchange = e => { clear = e.target.checked; };
    $$('[data-hcat]', body).forEach(b => b.onclick = () => { read(); f.cat = b.dataset.hcat; draw(); });
    $$('[data-payer]', body).forEach(b => b.onclick = () => { read(); f.paidBy = b.dataset.payer; draw(); });
    wireAccChips(body, 'hacc', v => { f.payAcc = v; });
    $$('[data-split]', body).forEach(b => b.onclick = () => {
      read();
      if (b.dataset.split === 'custom') custom = true; else { custom = false; f.share = +b.dataset.split; }
      draw();
    });
    const del = $('#hDel', body);
    if (del) del.onclick = async () => {
      if (!sure) { read(); sure = true; draw(); return; }
      if (await run('delete', { sheet: 'house', id: h.id }, 'Διαγράφηκε')) closeSheet();
    };
    $('#hSave', body).onclick = async e => {
      read();
      const amount = round2(num(f.amount));
      if (!(amount > 0)) return toast('Βάλε ποσό', true);
      if (!f.cat) return toast('Διάλεξε κατηγορία', true);
      if (!f.date) return toast('Βάλε ημερομηνία', true);
      // Το ταμείο του πληρωτή το ορίζει μόνο ο ίδιος· αν πλήρωσε ο άλλος, κρατάμε ό,τι είχε βάλει.
      const payAcc = f.paidBy === me ? (f.payAcc || '') : (edit && h.paidBy === f.paidBy ? h.payAcc : '');
      const row = { date: f.date, kind: H_EXP, cat: f.cat, amount, note: f.note.trim(), paidBy: f.paidBy, owedBy: otherOf(f.paidBy), share: f.share, payAcc, recvAcc: '', receipt: rc.receipt };
      if (f.paidBy === me && payAcc) store.set('household.lastAcc', payAcc);
      e.target.disabled = true;
      const ok = edit ? await run('update', { sheet: 'house', row: { ...row, id: h.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'house', row }, `🏠 ${f.cat} ${eur(amount)} — πλήρωσε ${f.paidBy}`);
      if (!ok) { e.target.disabled = false; return; }
      keptReceipt = rc.receipt;
      if (opts.onSaved) await opts.onSaved();
      if (opts.clearList && clear) await run('clearDone', { list: opts.clearList });
      closeSheet();
    };
  };
  draw();
}

/** Εξόφληση μεταξύ σας (νέα ή υπάρχουσα). Ο καθένας ορίζει μόνο το δικό του ταμείο. */
function openSettle(h) {
  const me = data.profile, other = otherOf(me);
  const edit = !!h;
  const bal = houseBalance();
  const f = edit ? { ...h, amount: String(h.amount).replace('.', ',') }
    : { date: isoDate(new Date()), amount: String(Math.abs(bal)).replace('.', ','), paidBy: bal > 0 ? other : me, owedBy: bal > 0 ? me : other, note: '', payAcc: '', recvAcc: '' };
  if (!edit) { if (f.paidBy === me) f.payAcc = lastAcc(); else f.recvAcc = lastAcc(); }
  let sure = false;
  const body = openSheet(edit ? 'Εξόφληση' : 'Εξόφληση σπιτιού');
  const read = () => { f.amount = $('#sAmt', body).value; f.date = $('#sDate', body).value; f.note = $('#sNote', body).value; };
  const draw = () => {
    const iPay = f.paidBy === me, iGet = f.owedBy === me;
    body.innerHTML = `
      ${edit ? '' : `<div class="seg big" id="sDir">
        <button data-dir="in" class="${f.owedBy === me ? 'on in' : 'in'}">${esc(other)} → εμένα</button>
        <button data-dir="out" class="${f.paidBy === me ? 'on out' : 'out'}">εγώ → ${esc(other)}</button>
      </div>`}
      ${edit ? `<div class="adj-now"><span>🤝 ${esc(f.paidBy)} → ${esc(f.owedBy)}</span><b>${eur(num(f.amount))}</b></div>` : ''}
      <label class="field amount"><span>Ποσό (€)</span><input id="sAmt" inputmode="decimal" autocomplete="off" value="${esc(f.amount)}"></label>
      ${(iPay || iGet) && data.acc.length ? `<div class="field"><span>${iPay ? 'Από ποιο ταμείο πλήρωσες;' : 'Σε ποιο ταμείο μπήκαν;'}</span>${accChips('sacc', iPay ? f.payAcc : f.recvAcc, '', 'Κανένα')}</div>` : ''}
      ${dateField('sDate', f.date)}
      <label class="field"><span>Σημείωση</span><input id="sNote" type="text" placeholder="προαιρετικό (π.χ. IRIS)" value="${esc(f.note)}" autocomplete="off"></label>
      ${!edit && bal ? `<p class="small muted">Χρωστούμενο τώρα: ${eur(Math.abs(bal))} (${bal > 0 ? `${esc(other)} σε σένα` : `εσύ σε ${esc(other)}`}).</p>` : ''}
      <div class="actions">
        ${edit ? `<button class="btn danger ${sure ? 'sure' : ''}" id="sDel">${sure ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="sSave">${edit ? 'Αποθήκευση' : '✓ Εξόφληση'}</button>
      </div>`;
    wireDateField(body, 'sDate');
    $$('[data-dir]', body).forEach(b => b.onclick = () => {
      read();
      const out = b.dataset.dir === 'out';
      Object.assign(f, { paidBy: out ? me : other, owedBy: out ? other : me, payAcc: out ? (f.payAcc || f.recvAcc) : '', recvAcc: out ? '' : (f.recvAcc || f.payAcc) });
      draw();
    });
    wireAccChips(body, 'sacc', v => { if (f.paidBy === me) f.payAcc = v; else f.recvAcc = v; });
    const del = $('#sDel', body);
    if (del) del.onclick = async () => {
      if (!sure) { read(); sure = true; draw(); return; }
      if (await run('delete', { sheet: 'house', id: h.id }, 'Διαγράφηκε')) closeSheet();
    };
    $('#sSave', body).onclick = async e => {
      read();
      const amount = round2(num(f.amount));
      if (!(amount > 0)) return toast('Βάλε ποσό', true);
      const row = { date: f.date, kind: H_SET, cat: '', amount, note: f.note.trim(), paidBy: f.paidBy, owedBy: f.owedBy, share: 0, payAcc: f.payAcc || '', recvAcc: f.recvAcc || '' };
      e.target.disabled = true;
      const ok = edit ? await run('update', { sheet: 'house', row: { ...row, id: h.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'house', row }, `🤝 Εξόφληση ${eur(amount)}`);
      if (ok) closeSheet(); else e.target.disabled = false;
    };
  };
  draw();
}

/** Κοινό πάγιο σπιτιού (ενοίκιο, λογαριασμοί). */
function openHouseRecForm(r) {
  const edit = !!r;
  const f = edit ? { ...r, amount: String(r.amount).replace('.', ',') }
    : { name: '', cat: '', amount: '', paidBy: data.profile, share: 50, every: 1, unit: 'μήνας', next: isoDate(new Date()) };
  let sure = false;
  const body = openSheet(edit ? 'Πάγιο σπιτιού' : 'Νέο πάγιο σπιτιού');
  const read = () => {
    f.name = $('#hrName', body).value.trim();
    f.amount = $('#hrAmt', body).value;
    f.next = $('#hrNext', body).value;
    const [n, u] = $('#hrFreq', body).value.split('|');
    f.every = +n; f.unit = u;
  };
  const draw = () => {
    const other = otherOf(f.paidBy);
    const freqs = FREQS.some(([n, u]) => n === f.every && u === f.unit) ? FREQS : [...FREQS, [f.every, f.unit, freqLabel(f)]];
    body.innerHTML = `
      <label class="field"><span>Όνομα</span><input id="hrName" type="text" value="${esc(f.name)}" placeholder="π.χ. Ενοίκιο, ΔΕΗ, Nova" autocomplete="off"></label>
      <label class="field amount"><span>Ποσό (€)</span><input id="hrAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
      <div class="field"><span>Κατηγορία</span>
        <div class="chips">${data.houseCat.map(c => `<button type="button" class="chip ${c.name === f.cat ? 'on' : ''}" data-hrcat="${esc(c.name)}">${esc(c.icon || '📦')} ${esc(c.name)}</button>`).join('')}</div>
      </div>
      <div class="field"><span>Συνήθως πληρώνει</span>
        <div class="seg big payer-seg">${data.members.map(m => `<button type="button" data-hrpayer="${esc(m)}" class="${m === f.paidBy ? 'on' : ''}">${esc(m)}</button>`).join('')}</div>
      </div>
      <div class="field"><span>Μοιρασιά</span>
        <div class="chips">${SPLITS(f.paidBy, other).map(([s, l]) => `<button type="button" class="chip ${f.share === s ? 'on' : ''}" data-hrsplit="${s}">${esc(l)}</button>`).join('')}</div>
      </div>
      <div class="row2">
        <label class="field" style="margin:0"><span>Κάθε πότε</span>
          <select id="hrFreq">${freqs.map(([n, u, l]) => `<option value="${n}|${u}" ${n === f.every && u === f.unit ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="field" style="margin:0"><span>Επόμενη πληρωμή</span>${dateInput("hrNext", f.next)}</label>
      </div>
      <div class="actions">
        ${edit ? `<button class="btn danger ${sure ? 'sure' : ''}" id="hrDel">${sure ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="hrSave">Αποθήκευση</button>
      </div>`;
    if (!edit) setTimeout(() => $('#hrName', body)?.focus(), 60);
    $$('[data-hrcat]', body).forEach(b => b.onclick = () => { read(); f.cat = b.dataset.hrcat; if (!f.name) f.name = f.cat; draw(); });
    $$('[data-hrpayer]', body).forEach(b => b.onclick = () => { read(); f.paidBy = b.dataset.hrpayer; draw(); });
    $$('[data-hrsplit]', body).forEach(b => b.onclick = () => { read(); f.share = +b.dataset.hrsplit; draw(); });
    const del = $('#hrDel', body);
    if (del) del.onclick = async () => {
      if (!sure) { read(); sure = true; draw(); return; }
      if (await run('delete', { sheet: 'houseRec', id: r.id }, 'Διαγράφηκε')) closeSheet();
    };
    $('#hrSave', body).onclick = async e => {
      read();
      const amount = round2(num(f.amount));
      if (!f.name) return toast('Γράψε όνομα', true);
      if (!(amount > 0)) return toast('Βάλε ποσό', true);
      if (!f.cat) return toast('Διάλεξε κατηγορία', true);
      if (!f.next) return toast('Βάλε την επόμενη πληρωμή', true);
      const row = { name: f.name, cat: f.cat, amount, paidBy: f.paidBy, share: f.share, every: f.every, unit: f.unit, next: f.next };
      e.target.disabled = true;
      const ok = edit ? await run('update', { sheet: 'houseRec', row: { ...row, id: r.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'houseRec', row }, 'Νέο πάγιο σπιτιού: ' + f.name);
      if (ok) closeSheet(); else e.target.disabled = false;
    };
  };
  draw();
}

function renderHouseSettings(v) {
  v.innerHTML = `
    <section class="card">
      <h2>Πάγια σπιτιού</h2>
      <p class="small muted" style="margin-top:-6px">Ενοίκιο, λογαριασμοί κ.λπ. Τη μέρα της πληρωμής εμφανίζονται και στους δύο στο 🏠 Σπίτι.</p>
      ${data.houseRec.length ? `<div class="list flat">${[...data.houseRec].sort((a, b) => a.next.localeCompare(b.next)).map(r => `
        <button class="shop-item prod-row" data-hrid="${esc(r.id)}">
          <span class="list-emoji">${esc(houseIcon(r.cat))}</span>
          <span class="si-main"><b>${esc(r.name)}</b><small>${esc(freqLabel(r))} · πληρώνει ${esc(r.paidBy)} · επόμενη ${fmtDate(r.next)}</small></span>
          <span class="amt">${eur(r.amount)}</span>
        </button>`).join('')}</div>` : '<p class="muted small">Δεν υπάρχουν ακόμα.</p>'}
      <button class="btn primary block" id="addHouseRec">+ Νέο πάγιο σπιτιού</button>
    </section>
    <section class="card">
      <h2>Κατηγορίες σπιτιού</h2>
      <p class="small muted" style="margin-top:-6px">Κοινές και για τους δύο.</p>
      <div class="list flat">${data.houseCat.map(c => `
        <div class="shop-item">
          <span class="list-emoji">${esc(c.icon || '📦')}</span>
          <div class="si-main"><b>${esc(c.name)}</b><small>${data.house.filter(h => h.cat === c.name).length} έξοδα</small></div>
          <button class="icon-btn" data-hcren="${esc(c.id)}" aria-label="Μετονομασία"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
          <button class="icon-btn" data-hcdel="${esc(c.id)}" aria-label="Διαγραφή">${ICON_X}</button>
        </div>`).join('')}</div>
      <button class="btn primary block" id="addHouseCat">+ Νέα κατηγορία σπιτιού</button>
    </section>`;
  $('#addHouseRec').onclick = () => openHouseRecForm();
  $$('[data-hrid]', v).forEach(b => b.onclick = () => openHouseRecForm(data.houseRec.find(r => r.id === b.dataset.hrid)));
  $('#addHouseCat').onclick = async () => {
    const name = await ask('Νέα κατηγορία σπιτιού', 'Όνομα (π.χ. Θέρμανση)');
    if (!name) return;
    if (data.houseCat.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast('Υπάρχει ήδη', true);
    const icon = await ask('Εικονίδιο', 'Ένα emoji (προαιρετικό)', '📦');
    run('add', { sheet: 'houseCat', row: { name, icon: icon || '📦' } }, 'Προστέθηκε');
  };
  $$('[data-hcren]', v).forEach(b => b.onclick = async () => {
    const c = data.houseCat.find(x => x.id === b.dataset.hcren);
    const name = await ask('Μετονομασία', 'Νέο όνομα', c.name, 'Αλλάζει και στα παλιά κοινά έξοδα.');
    if (!name) return;
    const icon = await ask('Εικονίδιο', 'Ένα emoji', c.icon || '📦');
    run('renameHouseCat', { id: c.id, name, icon: icon || c.icon }, 'Άλλαξε');
  });
  $$('[data-hcdel]', v).forEach(b => b.onclick = async () => {
    const c = data.houseCat.find(x => x.id === b.dataset.hcdel);
    if (!await confirmBox(`Διαγραφή «${c.name}»;`, 'Φεύγει από τη λίστα. Τα παλιά κοινά έξοδα μένουν όπως είναι.')) return;
    run('delete', { sheet: 'houseCat', id: c.id }, 'Διαγράφηκε');
  });
}

/* ----- Ψώνια (κοινά) ----- */

const ICON_CAM = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_HOME = '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5"/></svg>';
const ICON_CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
const ICON_SWAP = '<svg viewBox="0 0 24 24"><path d="M7 7h13l-4-4M17 17H4l4 4"/></svg>';
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
async function choosePhoto(max = 1000, quality = 0.72) {
  const file = await pickImage();
  if (!file) return null;
  setBusy(true);
  try {
    const data = await compressImage(file, max, quality);
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
/* ----- αποδείξεις ----- */

/** Φωτογραφία σε όλη την οθόνη, πάνω από τη φόρμα (χωρίς να την κλείνει). */
function lightbox(id) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img data-photo="${esc(id)}" alt="Απόδειξη"><button class="icon-btn light" aria-label="Κλείσιμο">${ICON_X}</button>`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
  hydratePhotos(lb);
}

/**
 * Πεδίο «Απόδειξη» μέσα σε φόρμα. Η φωτογραφία ανεβαίνει μόλις τη διαλέξεις·
 * αν κλείσεις τη φόρμα χωρίς Αποθήκευση, σβήνεται από το Drive (discard).
 */
function receiptBox(state) {
  return `
    <div class="field receipt"><span>Απόδειξη</span>
      ${state.receipt ? `
        <div class="receipt-row">
          <button type="button" class="thumb receipt-thumb" data-rcpt-zoom><img data-photo="${esc(state.receipt)}" alt=""></button>
          <button type="button" class="btn small" data-rcpt-pick>📷 Αλλαγή</button>
          <button type="button" class="btn small" data-rcpt-clear>Αφαίρεση</button>
        </div>` : '<button type="button" class="btn small" data-rcpt-pick>📷 Πρόσθεσε απόδειξη</button>'}
    </div>`;
}
/** Συνδέει το πεδίο απόδειξης. state.receipt = τρέχουσα, state.uploads = όσες ανέβηκαν σε αυτή τη φόρμα. */
function wireReceipt(body, state, redraw) {
  hydratePhotos(body);
  const zoom = $('[data-rcpt-zoom]', body);
  if (zoom) zoom.onclick = () => lightbox(state.receipt);
  $('[data-rcpt-pick]', body).onclick = async () => {
    const id = await choosePhoto(1600, 0.8);   // πιο καθαρή, για να διαβάζονται τα γράμματα
    if (!id) return;
    state.uploads.push(id);
    state.receipt = id;
    redraw();
  };
  const clr = $('[data-rcpt-clear]', body);
  if (clr) clr.onclick = () => { state.receipt = ''; redraw(); };
}
/** Μετά την αποθήκευση (ή το κλείσιμο): σβήνει όσες ανέβηκαν αλλά δεν κρατήθηκαν. */
function discardReceipts(state, kept) {
  state.uploads.filter(id => id && id !== kept).forEach(id => api('discardPhoto', { id }).catch(() => {}));
  state.uploads = [];
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
          <span>
            ${data.members.length > 1 ? '<button class="btn small primary" id="paidShop">💶 Πλήρωσα</button>' : ''}
            <button class="link-btn" id="clearDone">Καθάρισμα όλων</button>
          </span>
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
  const ps = $('#paidShop');
  if (ps) ps.onclick = () => {
    // Κατηγορία σπιτιού με το ίδιο όνομα με τη λίστα, αλλιώς «Σούπερ μάρκετ»/«Είδη σπιτιού».
    const low = s => s.toLowerCase();
    const cat = data.houseCat.find(c => low(c.name) === low(list.name))?.name
      || data.houseCat.find(c => c.name === 'Σούπερ μάρκετ')?.name || data.houseCat[0]?.name || '';
    openHouseForm(null, { title: `💶 ${list.name}`, prefill: { cat, note: list.name === cat ? '' : list.name }, clearList: list.name, doneCount: done.length });
  };
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
      ${[['fin', '💶 Έσοδα / Έξοδα'], ['house', '🏠 Σπίτι'], ['shop', '🛒 Ψώνια']].map(([k, l]) => `<button data-v="${k}" class="${ui.setSection === k ? 'on' : ''}">${l}</button>`).join('')}
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
  else if (ui.setSection === 'house') renderHouseSettings($('#setBody'));
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
  const bal = accBalances();
  v.innerHTML = `
    <section class="card">
      <h2>Ταμεία</h2>
      <p class="small muted" style="margin-top:-6px">Πού είναι τα λεφτά σου. Κάθε κίνηση γράφει από ποιο ταμείο βγήκαν ή σε ποιο μπήκαν.</p>
      ${data.acc.length ? `<div class="list flat">${data.acc.map(a => `
        <button class="shop-item prod-row" data-accid="${esc(a.id)}">
          <span class="list-emoji">${esc(a.icon || '💳')}</span>
          <span class="si-main"><b>${esc(a.name)}</b><small>Υπόλοιπο ${eur(bal.get(a.name))}</small></span>
        </button>`).join('')}</div>` : '<p class="muted small">Δεν υπάρχουν ταμεία ακόμα.</p>'}
      <button class="btn primary block" id="addAcc">+ Νέο ταμείο</button>
    </section>

    <section class="card">
      <h2>Πάγια</h2>
      <p class="small muted" style="margin-top:-6px">Ό,τι έρχεται τακτικά: λογαριασμοί και συνδρομές (Έξοδο) ή μισθός κ.λπ. (Έσοδο). Τη μέρα τους εμφανίζονται στην Αρχική για να πατήσεις ✓.</p>
      ${data.rec.length ? `<div class="list flat">${[...data.rec].sort((a, b) => a.next.localeCompare(b.next)).map(r => `
        <button class="shop-item prod-row" data-recid="${esc(r.id)}">
          ${recDate(r.next)}
          <span class="si-main"><b>${esc(r.name)}</b><small>${esc(freqLabel(r))}${r.acc ? ` · ${esc(accIcon(r.acc))} ${esc(r.acc)}` : ''}</small></span>
          <span class="amt ${r.type === IN ? 'pos' : ''}">${r.type === IN ? '+' : ''}${eur(r.amount)}</span>
        </button>`).join('')}</div>
        ${(() => {
          // Ό,τι έρχεται κάθε εβδομάδα/χρόνο αναγάγεται σε μήνα.
          const monthly = type => sum(data.rec.filter(r => r.type === type).map(r => r.amount * (r.unit === 'εβδομάδα' ? 52 / 12 : r.unit === 'χρόνος' ? 1 / 12 : 1) / r.every));
          const inc = monthly(IN), out = monthly(OUT);
          return `<p class="small muted">Τον μήνα: ${inc ? `πάγια έσοδα <b class="pos">${eur(inc)}</b> · ` : ''}πάγια έξοδα <b>${eur(out)}</b>${inc ? ` · περισσεύουν <b class="${inc - out < 0 ? 'neg' : ''}">${eur(inc - out)}</b>` : ''}</p>`;
        })()}` : '<p class="muted small">Δεν υπάρχουν πάγια ακόμα.</p>'}
      <button class="btn primary block" id="addRec">+ Νέο πάγιο</button>
    </section>

    <section class="card">
      <h2>Γρήγορες καταχωρήσεις</h2>
      <p class="small muted" style="margin-top:-6px">Κουμπιά στο «+» για ό,τι γράφεις συχνά. Ανοίγουν έτοιμα με ποσό, ταμείο και κατηγορία· αλλάζεις ό,τι χρειάζεται και πατάς Αποθήκευση.</p>
      ${data.quick.length ? `<div class="list flat">${data.quick.map(q => `
        <button class="shop-item prod-row" data-quickid="${esc(q.id)}">
          <span class="list-emoji">${esc(q.icon || '⭐')}</span>
          <span class="si-main"><b>${esc(q.name)}</b><small>${esc(q.cat)}${q.sub ? ' · ' + esc(q.sub) : ''}${q.acc ? ` · ${esc(accIcon(q.acc))} ${esc(q.acc)}` : ''}</small></span>
          <span class="amt ${q.type === IN ? 'pos' : 'neg'}">${q.amount ? eur(q.amount) : '—'}</span>
        </button>`).join('')}</div>` : '<p class="muted small">Δεν υπάρχουν ακόμα.</p>'}
      <button class="btn primary block" id="addQuick">+ Νέα γρήγορη καταχώρηση</button>
    </section>

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

  $('#addAcc').onclick = () => openAccForm();
  $('#addRec').onclick = () => openTplForm('rec');
  $('#addQuick').onclick = () => openTplForm('quick');
  $$('[data-recid]', v).forEach(b => b.onclick = () => openTplForm('rec', data.rec.find(r => r.id === b.dataset.recid)));
  $$('[data-quickid]', v).forEach(b => b.onclick = () => openTplForm('quick', data.quick.find(q => q.id === b.dataset.quickid)));
  $$('[data-accid]', v).forEach(b => b.onclick = () => openAccForm(data.acc.find(a => a.id === b.dataset.accid)));
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
      <div class="login-logo"><img src="icons/icon-192.png?v=2" alt=""></div>
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

const ACC_ICONS = ['💵', '🏦', '💳', '📱', '🐷', '💰', '🪙', '🏧'];

function openAccForm(a) {
  const edit = !!a;
  const f = edit ? { ...a, start: String(a.start).replace('.', ',') } : { name: '', icon: data.acc.length ? '🏦' : '💵', start: '' };
  let sureDelete = false;
  const used = edit ? data.tx.filter(t => t.acc === a.name || t.to === a.name).length : 0;
  const body = openSheet(edit ? 'Ταμείο' : 'Νέο ταμείο');
  const read = () => { f.name = $('#afName', body).value.trim(); f.start = $('#afStart', body).value; };
  const draw = () => {
    body.innerHTML = `
      <label class="field"><span>Όνομα</span><input id="afName" type="text" value="${esc(f.name)}" placeholder="π.χ. Μετρητά, Revolut, Πειραιώς" autocomplete="off"></label>
      <div class="field"><span>Εικονίδιο</span>
        <div class="chips">${ACC_ICONS.map(i => `<button type="button" class="chip emoji ${i === f.icon ? 'on' : ''}" data-icon="${i}">${i}</button>`).join('')}</div>
      </div>
      <label class="field"><span>Αρχικό υπόλοιπο (€)</span><input id="afStart" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.start)}"></label>
      <p class="small muted">Πόσα είχε μέσα όταν ξεκίνησες να το καταγράφεις. Από εκεί και πέρα το υπόλοιπο βγαίνει μόνο του από τις κινήσεις.</p>
      ${edit && used ? `<p class="small muted">Το χρησιμοποιούν ${used} κινήσεις. Αν το μετονομάσεις, αλλάζει και σε αυτές.</p>` : ''}
      ${edit ? `<div class="adj-now"><span>Υπόλοιπο τώρα</span><b>${eur(accBalances().get(a.name))}</b><button class="btn small" id="afAdjust">⚖️ Διόρθωση</button></div>` : ''}
      <div class="actions">
        ${edit ? `<button class="btn danger ${sureDelete ? 'sure' : ''}" id="afDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="afSave">Αποθήκευση</button>
      </div>`;
    if (!edit) setTimeout(() => $('#afName', body)?.focus(), 60);
    $$('[data-icon]', body).forEach(b => b.onclick = () => { read(); f.icon = b.dataset.icon; draw(); });
    if ($('#afAdjust', body)) $('#afAdjust', body).onclick = () => openAdjust(a);
    const del = $('#afDel', body);
    if (del) del.onclick = async () => {
      if (!sureDelete) { read(); sureDelete = true; draw(); return; }
      if (await run('delete', { sheet: 'acc', id: a.id }, 'Το ταμείο διαγράφηκε')) closeSheet();
    };
    $('#afSave', body).onclick = async e => {
      read();
      if (!f.name) return toast('Γράψε όνομα', true);
      if (data.acc.some(x => x.name.toLowerCase() === f.name.toLowerCase() && (!edit || x.id !== a.id))) return toast('Υπάρχει ήδη ταμείο με αυτό το όνομα', true);
      const start = round2(num(f.start));
      e.target.disabled = true;
      const ok = edit
        ? await run('renameAcc', { id: a.id, name: f.name, icon: f.icon, start }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'acc', row: { name: f.name, icon: f.icon, start } }, 'Νέο ταμείο: ' + f.name);
      if (ok) closeSheet(); else e.target.disabled = false;
    };
  };
  draw();
}

/** Διόρθωση υπολοίπου: γράφεις πόσα έχει πραγματικά το ταμείο, μπαίνει κίνηση για τη διαφορά. */
function openAdjust(a) {
  const today0 = isoDate(new Date());
  let date = today0;
  // Τι δείχνει το app για το ταμείο στο τέλος της ημερομηνίας που διάλεξες.
  const appAt = () => round2(accBalances(date).get(a.name) || 0);
  let cur = appAt();
  const body = openSheet(`Διόρθωση · ${a.name}`);
  body.innerHTML = `
    ${dateField('adjDate', date)}
    <div class="adj-now"><span id="adjNowLbl">Το app δείχνει σήμερα</span><b id="adjNow">${eur(cur)}</b></div>
    <label class="field amount"><span id="adjRealLbl">Πόσα έχει πραγματικά; (€)</span><input id="adjReal" inputmode="decimal" autocomplete="off" placeholder="${esc(String(cur).replace('.', ','))}"></label>
    <p class="small muted" id="adjDiff">Γράψε το υπόλοιπο που βλέπεις στην τράπεζα ή στο πορτοφόλι εκείνη τη μέρα. Η διαφορά μπαίνει ως «Διόρθωση» με αυτή την ημερομηνία και δεν μετράει στα έσοδα/έξοδα.</p>
    <label class="field"><span>Σημείωση</span><input id="adjNote" type="text" placeholder="προαιρετικό (π.χ. υπόλοιπο έναρξης)" autocomplete="off"></label>
    <button class="btn primary block" id="adjOk">Διόρθωση</button>`;
  const inp = $('#adjReal', body);
  const showDiff = () => {
    if (!inp.value.trim()) { $('#adjDiff', body).textContent = 'Γράψε το υπόλοιπο που βλέπεις στην τράπεζα ή στο πορτοφόλι εκείνη τη μέρα.'; return; }
    const d = round2(num(inp.value) - cur);
    $('#adjDiff', body).innerHTML = d === 0 ? 'Συμφωνεί ήδη ✓'
      : `Διαφορά: <b class="${d < 0 ? 'neg' : 'pos'}">${d < 0 ? '−' : '+'}${eur(Math.abs(d))}</b>`;
  };
  // Αλλαγή ημερομηνίας: ξαναϋπολογίζεται τι έδειχνε το app εκείνη τη μέρα.
  const onDate = () => {
    date = $('#adjDate', body).value || today0;
    cur = appAt();
    $('#adjNowLbl', body).textContent = date === today0 ? 'Το app δείχνει σήμερα' : `Το app δείχνει στις ${fmtDate(date)}`;
    $('#adjNow', body).textContent = eur(cur);
    inp.placeholder = String(cur).replace('.', ',');
    showDiff();
  };
  wireDateField(body, 'adjDate');
  const di = $('#adjDate', body);
  const prevInput = di.oninput;
  di.oninput = () => { prevInput(); onDate(); };
  $$('[data-date]', body).forEach(c => { const f = c.onclick; c.onclick = () => { f(); onDate(); }; });
  setTimeout(() => inp.focus(), 60);
  inp.oninput = showDiff;
  inp.onkeydown = e => { if (e.key === 'Enter') $('#adjOk', body).click(); };
  $('#adjOk', body).onclick = async e => {
    if (!inp.value.trim()) { inp.focus(); return toast('Γράψε το πραγματικό υπόλοιπο', true); }
    const diff = round2(num(inp.value) - cur);
    if (diff === 0) { closeSheet(); return toast('Συμφωνεί ήδη ✓'); }
    e.target.disabled = true;
    const row = { date, type: ADJ, amount: diff, cat: '', sub: '', note: $('#adjNote', body).value.trim(), acc: a.name, to: '' };
    if (await run('add', { sheet: 'tx', row }, `${a.name}: ${eur(num(inp.value))} στις ${fmtDate(date)}`)) closeSheet(); else e.target.disabled = false;
  };
}

/** Διόρθωση ή κίνηση δανεικού: προβολή και διαγραφή. */
function openSignedTx(t) {
  let sure = false;
  const body = openSheet(t.type === ADJ ? 'Διόρθωση υπολοίπου' : 'Δανεικό');
  const draw = () => {
    body.innerHTML = `
      <div class="adj-now"><span>${esc(accIcon(t.acc))} ${esc(t.acc)} · ${fmtDate(t.date)}</span>
        <b class="${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${eur(Math.abs(t.amount))}</b></div>
      ${t.note ? `<p>${t.type === LOAN ? 'Άτομο: ' : ''}${esc(t.note)}</p>` : ''}
      <p class="small muted">${t.type === ADJ ? 'Αλλάζει μόνο το υπόλοιπο του ταμείου. Αν τη σβήσεις, το υπόλοιπο γυρνάει όπως ήταν.' : 'Λεφτά που βγήκαν ή μπήκαν στο ταμείο από δανεικό. Αν τη σβήσεις, το δανεικό μένει όπως είναι.'}</p>
      <div class="actions"><button class="btn danger ${sure ? 'sure' : ''}" id="stDel">${sure ? 'Σίγουρα;' : 'Διαγραφή'}</button></div>`;
    $('#stDel', body).onclick = async () => {
      if (!sure) { sure = true; draw(); return; }
      if (await run('delete', { sheet: 'tx', id: t.id }, 'Διαγράφηκε')) closeSheet();
    };
  };
  draw();
}

const QUICK_ICONS = ['☕', '🥐', '🍔', '🍕', '🛒', '⛽', '🚌', '🚕', '🍺', '🚬', '💊', '🎮', '💇', '🐶', '🎁', '⭐'];

/** Φόρμα για πάγιο (kind 'rec') ή γρήγορη καταχώρηση (kind 'quick'). */
function openTplForm(kind, item) {
  const isRec = kind === 'rec';
  const edit = !!item;
  const f = edit ? { ...item, amount: item.amount ? String(item.amount).replace('.', ',') : '' }
    : { name: '', icon: '☕', type: OUT, amount: '', cat: '', sub: '', acc: lastAcc(), every: 1, unit: 'μήνας', next: isoDate(new Date()) };
  let sure = false;
  const body = openSheet(isRec ? (edit ? 'Πάγιο' : 'Νέο πάγιο') : (edit ? 'Γρήγορη καταχώρηση' : 'Νέα γρήγορη καταχώρηση'));
  const read = () => {
    f.name = $('#tpName', body).value.trim();
    f.amount = $('#tpAmt', body).value;
    if (isRec) {
      f.next = $('#tpNext', body).value;
      const [n, u] = $('#tpFreq', body).value.split('|');
      f.every = +n; f.unit = u;
    }
  };
  const draw = () => {
    const cm = catMap(f.type, true);
    const subs = f.cat ? (cm.get(f.cat) || []) : [];
    const freqs = FREQS.some(([n, u]) => n === f.every && u === f.unit) ? FREQS : [...FREQS, [f.every, f.unit, freqLabel(f)]];
    body.innerHTML = `
      <label class="field"><span>Όνομα</span><input id="tpName" type="text" value="${esc(f.name)}" placeholder="${isRec ? 'π.χ. Spotify, Ρεύμα, Ενοίκιο' : 'π.χ. Καφές, Βενζίνη'}" autocomplete="off"></label>
      ${isRec ? '' : `<div class="field"><span>Εικονίδιο</span><div class="chips">${QUICK_ICONS.map(i => `<button type="button" class="chip emoji ${i === f.icon ? 'on' : ''}" data-icon="${i}">${i}</button>`).join('')}</div></div>`}
      <div class="seg big" id="tpType">
        ${[OUT, IN].map(x => `<button data-v="${x}" class="${x === IN ? 'in' : 'out'} ${f.type === x ? 'on' : ''}">${x}</button>`).join('')}
      </div>
      <label class="field amount"><span>Ποσό (€)${isRec ? '' : ' — κενό αν αλλάζει κάθε φορά'}</span><input id="tpAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
      ${isRec ? `
        <div class="row2">
          <label class="field" style="margin:0"><span>Κάθε πότε</span>
            <select id="tpFreq">${freqs.map(([n, u, l]) => `<option value="${n}|${u}" ${n === f.every && u === f.unit ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="field" style="margin:0"><span>Επόμενη χρέωση</span>${dateInput("tpNext", f.next)}</label>
        </div>` : ''}
      ${data.acc.length ? `<div class="field"><span>${f.type === IN ? 'Μπαίνουν σε' : 'Πληρώνεται από'}</span>${accChips('tpacc', f.acc)}</div>` : ''}
      <div class="field"><span>Κατηγορία</span>
        <div class="chips">${[...cm.keys()].map(c => `<button type="button" class="chip ${c === f.cat ? 'on' : ''}" data-tcat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      </div>
      ${subs.length ? `<div class="field"><span>Υποκατηγορία</span>
        <div class="chips">${subs.map(s => `<button type="button" class="chip ${s === f.sub ? 'on' : ''}" data-tsub="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>` : ''}
      <div class="actions">
        ${edit ? `<button class="btn danger ${sure ? 'sure' : ''}" id="tpDel">${sure ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="tpSave">Αποθήκευση</button>
      </div>`;
    if (!edit) setTimeout(() => $('#tpName', body)?.focus(), 60);
    $$('[data-icon]', body).forEach(b => b.onclick = () => { read(); f.icon = b.dataset.icon; draw(); });
    $$('#tpType button', body).forEach(b => b.onclick = () => { read(); if (f.type !== b.dataset.v) { f.type = b.dataset.v; f.cat = ''; f.sub = ''; } draw(); });
    wireAccChips(body, 'tpacc', v => { f.acc = v; });
    $$('[data-tcat]', body).forEach(b => b.onclick = () => { read(); if (f.cat !== b.dataset.tcat) { f.cat = b.dataset.tcat; f.sub = ''; } draw(); });
    $$('[data-tsub]', body).forEach(b => b.onclick = () => { read(); f.sub = f.sub === b.dataset.tsub ? '' : b.dataset.tsub; draw(); });
    const del = $('#tpDel', body);
    if (del) del.onclick = async () => {
      if (!sure) { read(); sure = true; draw(); return; }
      if (await run('delete', { sheet: kind, id: item.id }, 'Διαγράφηκε')) closeSheet();
    };
    $('#tpSave', body).onclick = async e => {
      read();
      const amount = round2(num(f.amount));
      if (!f.name) return toast('Γράψε όνομα', true);
      if (isRec && !(amount > 0)) return toast('Βάλε ποσό', true);
      if (isRec && !f.next) return toast('Βάλε την επόμενη χρέωση', true);
      if (!f.cat) return toast('Διάλεξε κατηγορία', true);
      const row = { name: f.name, type: f.type, amount: amount > 0 ? amount : '', cat: f.cat, sub: f.sub, acc: f.acc || '',
        ...(isRec ? { every: f.every, unit: f.unit, next: f.next } : { icon: f.icon }) };
      e.target.disabled = true;
      const ok = edit ? await run('update', { sheet: kind, row: { ...row, id: item.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: kind, row }, `${isRec ? 'Νέο πάγιο' : 'Νέα γρήγορη'}: ${f.name}`);
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

/**
 * Πεδίο ημερομηνίας που δείχνει ηη/μμ/εε: το ημερολόγιο είναι του κινητού (για την επιλογή),
 * αλλά το κείμενό του κρύβεται και από πάνω γράφεται η ημερομηνία όπως στην Ελλάδα.
 */
function dateInput(id, value) {
  return `<span class="date-wrap"><input id="${id}" type="date" value="${esc(value)}"><span class="date-show" aria-hidden="true">${value ? fmtDate(value) : 'ηη/μμ/εε'}</span></span>`;
}
// Όταν αλλάζει οποιοδήποτε τέτοιο πεδίο, ενημερώνεται το κείμενο από πάνω.
document.addEventListener('input', e => {
  const w = e.target.closest?.('.date-wrap');
  if (w) w.querySelector('.date-show').textContent = e.target.value ? fmtDate(e.target.value) : 'ηη/μμ/εε';
});
function dateField(id, value) {
  const t = isoDate(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yd = isoDate(y);
  return `
    <div class="field"><span>Ημερομηνία</span>
      <div class="date-row">
        ${dateInput(id, value)}
        <button type="button" class="chip ${value === t ? 'on' : ''}" data-date="${t}">Σήμερα</button>
        <button type="button" class="chip ${value === yd ? 'on' : ''}" data-date="${yd}">Χθες</button>
      </div>
    </div>`;
}
function wireDateField(body, id) {
  const inp = $('#' + id, body);
  const sync = () => {
    $$('[data-date]', body).forEach(c => c.classList.toggle('on', c.dataset.date === inp.value));
    inp.closest('.date-wrap').querySelector('.date-show').textContent = inp.value ? fmtDate(inp.value) : 'ηη/μμ/εε';
  };
  $$('[data-date]', body).forEach(c => c.onclick = () => { inp.value = c.dataset.date; sync(); });
  inp.oninput = sync;
}

/** Νέα κίνηση βήμα-βήμα. prefill (π.χ. «Ξανά το ίδιο»): ανοίγει κατευθείαν στο τελευταίο βήμα, συμπληρωμένο. */
function openTxWizard(prefill) {
  const f = { type: '', cat: '', sub: '', amount: '', date: isoDate(new Date()), note: '', acc: lastAcc(), to: '', ...(prefill || {}) };
  let step = prefill ? (f.type === TR ? 'transfer' : 'details') : 'type';
  let adding = false;
  const rc = { receipt: '', uploads: [] };   // απόδειξη
  let keptReceipt = null;
  const body = openSheet(prefill ? '↻ Ξανά το ίδιο' : 'Νέα κίνηση');
  sheetOnClose = () => discardReceipts(rc, keptReceipt);
  const setTitle = t => { $('#sheetTitle').textContent = t; };
  const hasSubs = () => (catMap(f.type).get(f.cat) || []).length > 0;

  const crumbs = () => `
    <div class="crumbs">
      <button class="icon-btn" id="wBack" aria-label="Πίσω">${ICON_BACK}</button>
      <span class="pill ${f.type === IN ? 'in' : f.type === TR ? 'tr' : 'out'}">${f.type}</span>
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
    if (step === 'transfer') go('type');
    else if (step === 'details') go(f.sub || hasSubs() ? 'sub' : 'cat');
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
      const due = dueRecs();
      body.innerHTML = `
        ${due.length ? `
        <div class="wiz-due">
          <span class="muted small">📅 Πάγια για χρέωση</span>
          ${due.map(r => `<button class="chip" data-due="${esc(r.id)}">${esc(r.name)} · ${eur(r.amount)}</button>`).join('')}
        </div>` : ''}
        ${data.quick.length ? `
        <div class="quick-grid">
          ${data.quick.map(q => `
            <button class="quick" data-q="${esc(q.id)}">
              <span>${esc(q.icon || '⭐')}</span><b>${esc(q.name)}</b><small class="${q.type === IN ? 'pos' : ''}">${q.amount ? eur(q.amount) : 'ποσό;'}</small>
            </button>`).join('')}
        </div>` : ''}
        <div class="big-choice">
          <button class="choice out" data-t="${OUT}"><b>−</b><span>Έξοδο</span></button>
          <button class="choice in" data-t="${IN}"><b>+</b><span>Έσοδο</span></button>
          ${data.members.length > 1 ? `
          <button class="choice tr slim" data-t="${TR}"><b>⇄</b><span>Μεταφορά<small>ταμείο → ταμείο</small></span></button>
          <button class="choice house slim" id="wHouse"><b>${ICON_HOME}</b><span>Κοινό<small>έξοδο σπιτιού</small></span></button>` : `
          <button class="choice tr wide" data-t="${TR}"><b>⇄</b><span>Μεταφορά<small>από ταμείο σε ταμείο</small></span></button>`}
        </div>`;
      if ($('#wHouse', body)) $('#wHouse', body).onclick = () => openHouseForm();
      $$('[data-t]', body).forEach(b => b.onclick = () => { f.type = b.dataset.t; go(f.type === TR ? 'transfer' : 'cat'); });
      $$('[data-due]', body).forEach(b => b.onclick = () => openRecPay(data.rec.find(r => r.id === b.dataset.due)));
      // Γρήγορη καταχώρηση: ανοίγει έτοιμη (ποσό, ταμείο, κατηγορία) για να αλλάξεις ό,τι χρειάζεται και Αποθήκευση.
      $$('[data-q]', body).forEach(b => b.onclick = () => {
        const q = data.quick.find(x => x.id === b.dataset.q);
        Object.assign(f, {
          type: q.type, cat: q.cat, sub: q.sub, note: tplNote(q), acc: q.acc || f.acc,
          amount: q.amount ? String(q.amount).replace('.', ',') : '',
        });
        go('details');
      });
      return;
    }

    if (step === 'transfer') {
      setTitle('Μεταφορά');
      if (data.acc.length < 2) {
        body.innerHTML = `
          ${crumbs()}
          <p>Για μεταφορά χρειάζονται τουλάχιστον δύο ταμεία (π.χ. Πειραιώς και Μετρητά).</p>
          <button class="btn primary block" id="wAddAcc">+ Νέο ταμείο</button>`;
        $('#wAddAcc', body).onclick = () => openAccForm();
      } else {
        if (f.to === f.acc) f.to = '';
        body.innerHTML = `
          ${crumbs()}
          <div class="field"><span>Από</span>${accChips('from', f.acc)}</div>
          <div class="field"><span>Προς</span>${accChips('to', f.to, f.acc)}</div>
          <label class="field amount"><span>Ποσό (€)</span><input id="wAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
          ${dateField('wDate', f.date)}
          <label class="field"><span>Σημείωση</span><input id="wNote" type="text" placeholder="προαιρετικό (π.χ. ΑΤΜ)" value="${esc(f.note)}" autocomplete="off"></label>
          <div class="actions"><button class="btn primary" id="wSave">Αποθήκευση</button></div>`;
        wireDateField(body, 'wDate');
        $$('[data-from]', body).forEach(b => b.onclick = () => { readDetails(); f.acc = b.dataset.from; draw(); });
        $$('[data-to]', body).forEach(b => b.onclick = () => { readDetails(); f.to = b.dataset.to; draw(); });
        $('#wSave', body).onclick = async e => {
          readDetails();
          const amount = round2(num(f.amount));
          if (!f.acc || !f.to) return toast('Διάλεξε από πού και προς πού', true);
          if (!(amount > 0)) { $('#wAmt', body).focus(); return toast('Βάλε ποσό', true); }
          if (!f.date) return toast('Βάλε ημερομηνία', true);
          e.target.disabled = true;
          const row = { date: f.date, type: TR, amount, cat: '', sub: '', note: f.note.trim(), acc: f.acc, to: f.to };
          if (await run('add', { sheet: 'tx', row }, `Μεταφορά ${eur(amount)}: ${f.acc} → ${f.to}`)) closeSheet();
          else e.target.disabled = false;
        };
      }
      $('#wBack', body).onclick = () => { readDetails(); back(); };
      return;
    }

    if (step === 'cat' || step === 'sub') {
      const isCat = step === 'cat';
      const items = isCat ? [...catMap(f.type, true).keys()] : (catMap(f.type, true).get(f.cat) || []);
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
      setTitle(prefill ? '↻ Ξανά το ίδιο' : 'Ποσό');
      body.innerHTML = `
        ${crumbs()}
        <label class="field amount"><span>Ποσό (€)</span><input id="wAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
        ${data.acc.length ? `<div class="field"><span>${f.type === IN ? 'Μπήκαν σε' : 'Πληρώθηκε από'}</span>${accChips('wacc', f.acc)}</div>` : ''}
        ${dateField('wDate', f.date)}
        <label class="field"><span>Σημείωση</span><input id="wNote" type="text" placeholder="προαιρετικό" value="${esc(f.note)}" autocomplete="off"></label>
        ${receiptBox(rc)}
        <div class="actions"><button class="btn primary" id="wSave">Αποθήκευση</button></div>`;
      wireDateField(body, 'wDate');
      wireReceipt(body, rc, () => { readDetails(); draw(); });
      $$('[data-wacc]', body).forEach(b => b.onclick = () => {
        f.acc = b.dataset.wacc;
        $$('[data-wacc]', body).forEach(x => x.classList.toggle('on', x === b));
      });
      const amt = $('#wAmt', body);
      // Με έτοιμο ποσό δεν ανοίγει το πληκτρολόγιο, για να φαίνονται τα ταμεία και η Αποθήκευση.
      if (!f.amount) setTimeout(() => amt.focus(), 60);
      amt.onkeydown = e => { if (e.key === 'Enter') $('#wSave', body).click(); };
      $('#wSave', body).onclick = async e => {
        readDetails();
        const amount = round2(num(f.amount));
        if (!(amount > 0)) { amt.focus(); return toast('Βάλε ποσό', true); }
        if (!f.date) return toast('Βάλε ημερομηνία', true);
        if (data.acc.length && !f.acc) return toast('Διάλεξε ταμείο', true);
        e.target.disabled = true;
        const row = { date: f.date, type: f.type, amount, cat: f.cat, sub: f.sub, note: f.note.trim(), acc: f.acc, to: '', receipt: rc.receipt };
        if (f.acc) store.set('household.lastAcc', f.acc);
        if (await run('add', { sheet: 'tx', row }, `${f.type} ${eur(amount)} αποθηκεύτηκε`)) { keptReceipt = rc.receipt; closeSheet(); }
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
  const f = edit ? { ...t, amount: String(t.amount).replace('.', ',') } : { type: OUT, amount: '', date: isoDate(new Date()), cat: '', sub: '', note: '', acc: lastAcc(), to: '' };
  let newKind = '';        // '', 'cat' ή 'sub' — ποιο πεδίο «+ Νέα» είναι ανοιχτό
  let sureDelete = false;
  const rc = { receipt: f.receipt || '', uploads: [] };   // απόδειξη
  let keptReceipt = null;
  const body = openSheet(edit ? 'Επεξεργασία κίνησης' : 'Νέα κίνηση');
  sheetOnClose = () => discardReceipts(rc, keptReceipt);

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
    const cm = catMap(f.type, true);
    if (f.cat && !cm.has(f.cat)) cm.set(f.cat, []);
    const subs = f.cat ? [...(cm.get(f.cat) || [])] : [];
    if (f.sub && !subs.includes(f.sub)) subs.push(f.sub);

    body.innerHTML = `
      <div class="seg big" id="fType" style="margin-top:10px">
        ${[OUT, IN, TR].map(x => `<button data-v="${x}" class="${x === IN ? 'in' : x === TR ? 'tr' : 'out'} ${f.type === x ? 'on' : ''}">${x}</button>`).join('')}
      </div>
      <label class="field amount"><span>Ποσό (€)</span><input id="fAmt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amount)}"></label>
      ${f.type === TR ? `
      <div class="field"><span>Από</span>${accChips('facc', f.acc)}</div>
      <div class="field"><span>Προς</span>${accChips('fto', f.to, f.acc)}</div>` : `
      ${data.acc.length ? `<div class="field"><span>${f.type === IN ? 'Μπήκαν σε' : 'Πληρώθηκε από'}</span>${accChips('facc', f.acc)}</div>` : ''}
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
        </div>` : ''}`}
      ${dateField('fDate', f.date)}
      <label class="field"><span>Σημείωση</span><input id="fNote" type="text" placeholder="προαιρετικό" value="${esc(f.note)}" autocomplete="off"></label>
      ${f.type === TR ? '' : receiptBox(rc)}
      ${edit ? '<button class="btn block" id="fAgain">↻ Ξανά το ίδιο, με σημερινή ημερομηνία</button>' : ''}
      <div class="actions">
        ${edit ? `<button class="btn danger ${sureDelete ? 'sure' : ''}" id="fDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="fSave">Αποθήκευση</button>
      </div>`;
    if (f.type !== TR) wireReceipt(body, rc, () => { readInputs(); draw(); });
    const again = $('#fAgain', body);
    if (again) again.onclick = () => openTxWizard({
      type: t.type, cat: t.cat, sub: t.sub, note: t.note, acc: t.acc || lastAcc(), to: t.to, amount: String(t.amount).replace('.', ','),
    });

    wireDateField(body, 'fDate');
    $$('#fType button', body).forEach(b => b.onclick = () => {
      readInputs();
      if (f.type !== b.dataset.v) { f.type = b.dataset.v; f.cat = ''; f.sub = ''; f.to = ''; newKind = ''; }
      draw();
    });
    $$('[data-facc]', body).forEach(b => b.onclick = () => { readInputs(); f.acc = b.dataset.facc; if (f.to === f.acc) f.to = ''; draw(); });
    $$('[data-fto]', body).forEach(b => b.onclick = () => { readInputs(); f.to = b.dataset.fto; draw(); });
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
      if (f.type === TR) {
        if (!f.acc || !f.to || f.acc === f.to) return toast('Διάλεξε από πού και προς πού', true);
      } else if (!f.cat) return toast('Διάλεξε κατηγορία', true);
      if (!f.date) return toast('Βάλε ημερομηνία', true);
      const row = f.type === TR
        ? { date: f.date, type: TR, amount, cat: '', sub: '', note: f.note.trim(), acc: f.acc, to: f.to }
        : { date: f.date, type: f.type, amount, cat: f.cat, sub: f.sub, note: f.note.trim(), acc: f.acc || '', to: '' };
      e.target.disabled = true;
      row.receipt = f.type === TR ? '' : rc.receipt;
      const ok = edit
        ? await run('update', { sheet: 'tx', row: { ...row, id: t.id } }, 'Αποθηκεύτηκε')
        : await run('add', { sheet: 'tx', row }, `${f.type} ${eur(amount)} αποθηκεύτηκε`);
      if (ok) { keptReceipt = row.receipt; closeSheet(); } else e.target.disabled = false;
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

/** Κίνηση ταμείου για δανεικό: + όταν μπαίνουν λεφτά, − όταν βγαίνουν. */
function loanTx(date, amount, person, acc) {
  return run('add', { sheet: 'tx', row: { date, type: LOAN, amount, cat: '', sub: '', note: person, acc, to: '' } });
}

/** Ξόφληση δανεικού: ρωτάει σε/από ποιο ταμείο πήγαν τα λεφτά. */
function openLoanSettle(l) {
  let done = false;
  let acc = lastAcc();
  const body = openSheet('Ξόφληση');
  sheetOnClose = () => { if (!done) render(); };  // άκυρο: το checkbox ξαναγυρνάει
  body.innerHTML = `
    <div class="adj-now"><span>${esc(l.person)} · ${esc(l.type)}</span><b class="${l.type === OWED ? 'pos' : 'neg'}">${eur(l.amount)}</b></div>
    <div class="field"><span>${l.type === OWED ? 'Σε ποιο ταμείο μπήκαν τα λεφτά;' : 'Από ποιο ταμείο πλήρωσες;'}</span>${accChips('sacc', acc, '', 'Κανένα')}</div>
    <p class="small muted">Διάλεξε «Κανένα» αν δεν θέλεις να αλλάξει κάποιο υπόλοιπο.</p>
    <button class="btn primary block" id="sOk">✓ Ξοφλήθηκε</button>`;
  wireAccChips(body, 'sacc', v => { acc = v; });
  $('#sOk', body).onclick = async e => {
    e.target.disabled = true;
    done = true;
    if (!await run('update', { sheet: 'loan', row: { id: l.id, paid: true } }, 'Ξοφλήθηκε ✓')) { done = false; e.target.disabled = false; return; }
    if (acc) await loanTx(isoDate(new Date()), l.type === OWED ? l.amount : -l.amount, l.person, acc);
    closeSheet();
  };
}

function openLoanForm(l) {
  const edit = !!l;
  const f = edit ? { ...l, amount: String(l.amount).replace('.', ',') } : { type: OWED, person: '', amount: '', date: isoDate(new Date()), note: '', paid: false, acc: lastAcc() };
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
      ${!edit && data.acc.length ? `<div class="field"><span>${f.type === OWED ? 'Τα λεφτά βγήκαν από' : 'Τα λεφτά μπήκαν σε'}</span>${accChips('lacc', f.acc, '', 'Κανένα')}</div>` : ''}
      ${dateField('lDate', f.date)}
      <label class="field"><span>Σημείωση</span><input id="lNote" type="text" placeholder="προαιρετικό" value="${esc(f.note)}" autocomplete="off"></label>
      <label class="toggle"><input id="lPaid" type="checkbox" class="check" ${f.paid ? 'checked' : ''}> Ξοφλήθηκε</label>
      <div class="actions">
        ${edit ? `<button class="btn danger ${sureDelete ? 'sure' : ''}" id="lDel">${sureDelete ? 'Σίγουρα;' : 'Διαγραφή'}</button>` : ''}
        <button class="btn primary" id="lSave">Αποθήκευση</button>
      </div>`;

    wireDateField(body, 'lDate');
    $$('#lType button', body).forEach(b => b.onclick = () => { readInputs(); f.type = b.dataset.v; draw(); });
    wireAccChips(body, 'lacc', v => { f.acc = v; });
    $('#lSave', body).onclick = async e => {
      readInputs();
      const amount = round2(num(f.amount));
      if (!(amount > 0)) return toast('Βάλε ποσό', true);
      if (!f.person.trim()) return toast('Βάλε το άτομο', true);
      // Ξόφληση από τη φόρμα: περνάει από την ερώτηση για το ταμείο.
      const settle = edit && !l.paid && f.paid && data.acc.length;
      const row = { date: f.date, type: f.type, person: f.person.trim(), amount, note: f.note.trim(), paid: settle ? false : f.paid };
      e.target.disabled = true;
      let ok;
      if (edit) ok = await run('update', { sheet: 'loan', row: { ...row, id: l.id } }, settle ? '' : 'Αποθηκεύτηκε');
      else {
        ok = await run('add', { sheet: 'loan', row }, 'Αποθηκεύτηκε');
        // Νέο δανεικό: δάνεισα → βγήκαν λεφτά, δανείστηκα → μπήκαν.
        if (ok && f.acc && !f.paid) await loanTx(f.date, f.type === OWED ? -amount : amount, row.person, f.acc);
      }
      if (!ok) { e.target.disabled = false; return; }
      if (settle) openLoanSettle(data.loan.find(x => x.id === l.id)); else closeSheet();
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
$('#houseBtn').onclick = () => {
  if (!loggedIn()) return;
  ui.tab = 'house';
  render();
  window.scrollTo(0, 0);
  refresh(true);
};
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
// Χωρίς internet: μόλις επιστρέψει, στέλνονται όσα περιμένουν.
window.addEventListener('online', () => { if (loggedIn()) refresh(true); });
setInterval(() => { if (pending().length && loggedIn() && !document.hidden) refresh(true); }, 30000);
$('#pending').onclick = () => { toast($('#pending').title + ' — θα σταλούν αυτόματα μόλις βρεις internet'); refresh(true); };
setInterval(() => { if ((ui.tab === 'shop' || ui.tab === 'house') && !document.hidden && loggedIn() && idle()) refresh(true); }, 30000);
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
