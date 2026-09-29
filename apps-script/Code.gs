/**
 * Household Desk — backend για το app.
 * Μπαίνει στο Google Sheet: Επεκτάσεις → Apps Script.
 *
 * Προφίλ: στις Ρυθμίσεις έργου → Ιδιότητες σεναρίου (Script properties) βάζεις
 * μία ιδιότητα για κάθε άτομο, με όνομα PIN_<Όνομα> και τιμή το PIN του, π.χ.
 *   PIN_Άννα     = 1234
 *   PIN_Γιώργος  = 5678
 * Τα PIN πρέπει να είναι διαφορετικά. Ο καθένας βλέπει μόνο τα δικά του οικονομικά.
 * Τα Ψώνια είναι κοινά για όλους.
 */

const DEFAULT_PROFILE = 'Άννα'; // σε αυτό ανήκουν οι παλιές γραμμές χωρίς προφίλ
const PHOTO_FOLDER = 'Household Desk — Φωτογραφίες';

const SHEETS = {
  tx:    { name: 'Κινήσεις',   cols: { date: 'Ημερομηνία', type: 'Τύπος', amount: 'Ποσό', cat: 'Κατηγορία', sub: 'Υποκατηγορία', note: 'Σημείωση', acc: 'Ταμείο', to: 'Προς ταμείο', receipt: 'Απόδειξη', profile: 'Προφίλ', id: 'ID' } },
  // Ταμεία (Μετρητά, τράπεζες…): από πού βγαίνουν / πού μπαίνουν τα λεφτά κάθε κίνησης.
  acc:   { name: 'Ταμεία',     cols: { name: 'Όνομα', icon: 'Εικονίδιο', start: 'Αρχικό υπόλοιπο', profile: 'Προφίλ', id: 'ID' } },
  // Πάγια: επαναλαμβανόμενες χρεώσεις (κάθε <every> <unit>), με την ημερομηνία της επόμενης.
  rec:   { name: 'Πάγια',      cols: { name: 'Όνομα', type: 'Τύπος', amount: 'Ποσό', cat: 'Κατηγορία', sub: 'Υποκατηγορία', acc: 'Ταμείο', every: 'Κάθε', unit: 'Περίοδος', next: 'Επόμενη χρέωση', profile: 'Προφίλ', id: 'ID' } },
  // Γρήγορες καταχωρήσεις: έτοιμα κουμπιά για συχνές κινήσεις (ποσό κενό = ρωτάει).
  quick: { name: 'Γρήγορες',   cols: { name: 'Όνομα', icon: 'Εικονίδιο', type: 'Τύπος', amount: 'Ποσό', cat: 'Κατηγορία', sub: 'Υποκατηγορία', acc: 'Ταμείο', profile: 'Προφίλ', id: 'ID' } },
  loan:  { name: 'Δανεικά',    cols: { date: 'Ημερομηνία', type: 'Τύπος', person: 'Άτομο', amount: 'Ποσό', note: 'Σημείωση', paid: 'Ξοφλήθηκε', profile: 'Προφίλ', id: 'ID' } },
  cat:   { name: 'Κατηγορίες', cols: { type: 'Τύπος', cat: 'Κατηγορία', sub: 'Υποκατηγορία', profile: 'Προφίλ', id: 'ID' } },
  lists: { name: 'Λίστες', shared: true, cols: { name: 'Όνομα', icon: 'Εικονίδιο', id: 'ID' } },
  shop:  { name: 'Ψώνια',  shared: true, cols: { list: 'Λίστα', name: 'Προϊόν', qty: 'Ποσότητα', note: 'Σημείωση', photo: 'Φωτογραφία', addedBy: 'Πρόσθεσε', done: 'Αγοράστηκε', doneBy: 'Από', doneAt: 'Πότε', id: 'ID' } },
  // Σπίτι (κοινά): έξοδα με το ποιος πλήρωσε και πώς μοιράζονται, και εξοφλήσεις μεταξύ σας.
  // «Μερίδιο άλλου %» = πόσο από το ποσό αναλογεί σε αυτόν που ΔΕΝ πλήρωσε (50 = μισά-μισά).
  house:    { name: 'Σπίτι', shared: true, cols: { date: 'Ημερομηνία', kind: 'Είδος', cat: 'Κατηγορία', amount: 'Ποσό', note: 'Σημείωση', paidBy: 'Πλήρωσε', owedBy: 'Για / Προς', share: 'Μερίδιο άλλου %', payAcc: 'Ταμείο πληρωτή', recvAcc: 'Ταμείο παραλήπτη', receipt: 'Απόδειξη', addedBy: 'Πρόσθεσε', id: 'ID' } },
  houseCat: { name: 'Κατηγορίες Σπιτιού', shared: true, cols: { name: 'Όνομα', icon: 'Εικονίδιο', id: 'ID' } },
  houseRec: { name: 'Πάγια Σπιτιού', shared: true, cols: { name: 'Όνομα', cat: 'Κατηγορία', amount: 'Ποσό', paidBy: 'Πληρώνει', share: 'Μερίδιο άλλου %', every: 'Κάθε', unit: 'Περίοδος', next: 'Επόμενη χρέωση', id: 'ID' } },
  // Αποθηκευμένα προϊόντα: κρατάνε τη φωτογραφία ώστε να ξαναχρησιμοποιείται.
  prod:  { name: 'Προϊόντα', shared: true, cols: { name: 'Όνομα', photo: 'Φωτογραφία', list: 'Λίστα', id: 'ID' } },
  // Ειδοποιήσεις: μία γραμμή ανά συσκευή (Web Push), με την ώρα της καθημερινής υπενθύμισης.
  push:  { name: 'Ειδοποιήσεις', cols: { endpoint: 'Endpoint', p256dh: 'Κλειδί', auth: 'Auth', time: 'Ώρα', last: 'Στάλθηκε', device: 'Συσκευή', profile: 'Προφίλ', id: 'ID' } },
};
// Στήλες που προστίθενται αυτόματα αν λείπουν από το φύλλο.
const AUTO_COLS = ['acc', 'to', 'receipt', 'profile', 'id'];
// Στήλες που δεν μετράνε για να θεωρηθεί μια γραμμή «γεμάτη».
const META_COLS = ['paid', 'done', 'profile', 'id'];

// Αρχικές κατηγορίες για νέο προφίλ.
const STARTER_CATS = [
  ['Έσοδο', 'Μισθός', ''], ['Έσοδο', 'Δώρα', ''], ['Έσοδο', 'Άλλο', ''],
  ['Έξοδο', 'Λογαριασμοί', 'Ρεύμα'], ['Έξοδο', 'Λογαριασμοί', 'Νερό'], ['Έξοδο', 'Λογαριασμοί', 'Internet'], ['Έξοδο', 'Λογαριασμοί', 'Κινητό'],
  ['Έξοδο', 'Σούπερ μάρκετ', ''],
  ['Έξοδο', 'Μετακίνηση', 'Βενζίνη'], ['Έξοδο', 'Μετακίνηση', 'Διόδια'], ['Έξοδο', 'Μετακίνηση', 'Σέρβις'],
  ['Έξοδο', 'Φαγητό έξω', 'Καφές'], ['Έξοδο', 'Φαγητό έξω', 'Delivery'], ['Έξοδο', 'Φαγητό έξω', 'Εστιατόριο'],
  ['Έξοδο', 'Συνδρομές', ''],
  ['Έξοδο', 'Shopping', 'Ρούχα'], ['Έξοδο', 'Shopping', 'Gadgets'],
  ['Έξοδο', 'Διασκέδαση', ''], ['Έξοδο', 'Υγεία', ''], ['Έξοδο', 'Άλλα', ''],
];
const STARTER_LISTS = [['Σούπερ μάρκετ', '🛒'], ['IKEA', '🛋️']];
const STARTER_HOUSE_CATS = [['Ενοίκιο', '🏠'], ['Ρεύμα', '⚡'], ['Νερό', '💧'], ['Internet', '🌐'], ['Κοινόχρηστα', '🏢'],
  ['Σούπερ μάρκετ', '🛒'], ['Είδη σπιτιού', '🧽'], ['Φαγητό', '🍕'], ['Άλλο', '📦']];

function doGet() {
  return json_({ ok: true, data: 'Household Desk API' });
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}

  const profile = profileForPin_(p.pin);
  if (!profile) return json_({ ok: false, error: 'Λάθος PIN' });

  // Οι αναγνώσεις δεν περιμένουν στην ουρά πίσω από τις αλλαγές (το κλείδωμα είναι μόνο για εγγραφές).
  const needLock = ['all', 'photo', 'reminder', 'pushKey'].indexOf(p.action) < 0;
  const lock = LockService.getScriptLock();
  if (needLock) lock.waitLock(20000);
  try {
    let res;
    switch (p.action) {
      case 'all':         res = all_(profile); break;
      case 'add':         res = add_(p.sheet, p.row || {}, profile); break;
      case 'update':      res = update_(p.sheet, p.row || {}, profile); break;
      case 'delete':      res = remove_(p.sheet, p.id, profile); break;
      case 'renameCat':   res = renameCat_(p, profile); break;
      case 'deleteCat':   res = deleteCat_(p, profile); break;
      case 'renameAcc':   res = renameAcc_(p, profile); break;
      case 'renameHouseCat': res = renameHouseCat_(p, profile); break;
      case 'renameList':  res = renameList_(p, profile); break;
      case 'deleteList':  res = deleteList_(p, profile); break;
      case 'clearDone':   res = clearDone_(p, profile); break;
      case 'uploadPhoto': res = uploadPhoto_(p); break;
      case 'photo':       res = photo_(p.id); break;
      case 'discardPhoto': trashIfUnused_(p.id); res = {}; break;
      case 'pushKey':     res = { key: vapidKeys_().pub }; break;
      case 'pushSave':    res = pushSave_(p, profile); break;
      case 'pushDelete':  res = pushDelete_(p, profile); break;
      case 'pushTest':    res = { code: sendPush_(str_(p.endpoint)) }; break;
      case 'reminder':    res = reminderFor_(profile); break;
      case 'changePin':   res = changePin_(p, profile); break;
      default: throw new Error('Άγνωστη ενέργεια');
    }
    return json_({ ok: true, data: res });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (needLock) lock.releaseLock();
  }
}

/** Όλα τα δεδομένα του προφίλ με μία φόρτωση: κάθε φύλλο διαβάζεται μία φορά. */
function all_(profile) {
  MEMO_ = {};
  try {
    const needsSeed = () => !read_('cat', profile).length || !read_('lists', profile).length || !read_('houseCat', profile).length;
    if (needsSeed()) {
      // Πρώτη είσοδος: αρχικές κατηγορίες/λίστες, με κλείδωμα ώστε να μη γραφτούν διπλές.
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        MEMO_ = {};
        if (!read_('cat', profile).length) seedCats_(profile);
        if (!read_('lists', profile).length) STARTER_LISTS.forEach(([name, icon]) => add_('lists', { name, icon }, profile));
        if (!read_('houseCat', profile).length) STARTER_HOUSE_CATS.forEach(([name, icon]) => add_('houseCat', { name, icon }, profile));
      } finally {
        lock.releaseLock();
      }
      MEMO_ = {};
    }
    return {
      profile, members: members_(),
      house: read_('house', profile), houseCat: read_('houseCat', profile), houseRec: read_('houseRec', profile),
      tx: read_('tx', profile), acc: read_('acc', profile), rec: read_('rec', profile), quick: read_('quick', profile), loan: read_('loan', profile), cat: read_('cat', profile),
      lists: read_('lists', profile), shop: read_('shop', profile), prod: read_('prod', profile),
    };
  } finally {
    MEMO_ = null;
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

const tz_ = () => SpreadsheetApp.getActive().getSpreadsheetTimeZone();
const str_ = v => String(v == null ? '' : v).trim();

/** Βρίσκει ποιο προφίλ έχει αυτό το PIN (ιδιότητες PIN_<Όνομα>). */
function profileForPin_(pin) {
  pin = str_(pin);
  if (!pin) return null;
  const props = PropertiesService.getScriptProperties().getProperties();
  for (const k in props) {
    if (k.indexOf('PIN_') === 0 && str_(props[k]) === pin) return k.slice(4).trim();
  }
  return null;
}

/** Όλα τα προφίλ (όσοι έχουν PIN) — για το «ποιος πλήρωσε» στο Σπίτι. */
function members_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).filter(k => k.indexOf('PIN_') === 0).map(k => k.slice(4).trim()).sort();
}

/** Αλλαγή του PIN του συνδεδεμένου προφίλ (το τρέχον PIN έχει ήδη ελεγχθεί). */
function changePin_(p, profile) {
  const pin = str_(p.newPin);
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Το νέο PIN πρέπει να έχει 6 έως 12 ψηφία');
  if (profileForPin_(pin)) throw new Error('Διάλεξε διαφορετικό PIN');
  PropertiesService.getScriptProperties().setProperty('PIN_' + profile, pin);
  return {};
}

/** Διαβάζει ένα φύλλο, βρίσκει τις στήλες από τις επικεφαλίδες, προσθέτει ό,τι λείπει. */
// Μνήμη μίας φόρτωσης (μόνο στο 'all', που κυρίως διαβάζει): κάθε φύλλο διαβάζεται μία φορά.
let MEMO_ = null;
function forget_(key) { if (MEMO_) delete MEMO_[key]; }

function info_(key) {
  const def = SHEETS[key];
  if (!def) throw new Error('Άγνωστο φύλλο');
  if (MEMO_ && MEMO_[key]) return MEMO_[key];
  const ss = SpreadsheetApp.getActive();
  let sh;
  if (MEMO_) {
    if (!MEMO_.$sheets) { MEMO_.$sheets = {}; ss.getSheets().forEach(s => { MEMO_.$sheets[s.getName()] = s; }); }
    sh = MEMO_.$sheets[def.name];
  } else sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    const heads = Object.keys(def.cols).map(k => def.cols[k]);
    sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (MEMO_ && MEMO_.$sheets) MEMO_.$sheets[def.name] = sh;
  }

  // Όλο το φύλλο με μία ανάγνωση (επικεφαλίδες + γραμμές).
  let values = sh.getDataRange().getValues();
  let header = values[0].map(str_);
  let c = header.length;
  while (c > 0 && !header[c - 1]) c--;
  let added = false;
  AUTO_COLS.forEach(k => {
    if (def.cols[k] && header.indexOf(def.cols[k]) < 0) {
      sh.getRange(1, ++c).setValue(def.cols[k]).setFontWeight('bold');
      added = true;
    }
  });
  if (added) {
    values = sh.getDataRange().getValues();
    header = values[0].map(str_);
  }

  const idx = {};
  for (const k in def.cols) {
    const i = header.indexOf(def.cols[k]);
    if (i < 0) throw new Error('Λείπει η στήλη «' + def.cols[k] + '» στο φύλλο «' + def.name + '»');
    idx[k] = i;
  }

  const width = header.length;
  let rows = values.slice(1);

  // Τα checkbox (FALSE) μετράνε ως περιεχόμενο, οπότε κόβουμε τις άδειες γραμμές στο τέλος.
  const isData = r => Object.keys(idx).some(k => META_COLS.indexOf(k) < 0 && str_(r[idx[k]]) !== '');
  let count = rows.length;
  while (count > 0 && !isData(rows[count - 1])) count--;
  rows = rows.slice(0, count);

  // Συμπλήρωση ID (και προφίλ, όπου υπάρχει) όπου λείπουν.
  let changedId = false, changedProfile = false;
  rows.forEach(r => {
    if (!isData(r)) return;
    if (!str_(r[idx.id])) { r[idx.id] = Utilities.getUuid(); changedId = true; }
    if (!def.shared && !str_(r[idx.profile])) { r[idx.profile] = DEFAULT_PROFILE; changedProfile = true; }
  });
  if (changedId) sh.getRange(2, idx.id + 1, rows.length, 1).setValues(rows.map(r => [r[idx.id]]));
  if (changedProfile) sh.getRange(2, idx.profile + 1, rows.length, 1).setValues(rows.map(r => [r[idx.profile]]));

  const mine = (r, profile) => isData(r) && (def.shared || str_(r[idx.profile]) === profile);
  const inf = { sh, def, idx, width, rows, isData, mine };
  if (MEMO_) MEMO_[key] = inf;
  return inf;
}

function read_(key, profile) {
  const inf = info_(key);
  const tz = tz_();
  return inf.rows.filter(r => inf.mine(r, profile)).map(r => {
    const o = {};
    for (const k in inf.idx) {
      if (k === 'profile') continue;
      let v = r[inf.idx[k]];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, k === 'doneAt' ? 'yyyy-MM-dd HH:mm' : k === 'time' ? 'HH:mm' : 'yyyy-MM-dd');
      o[k] = v;
    }
    return o;
  });
}

function toCell_(k, v) {
  if (k === 'date' || k === 'next') {
    const s = str_(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? Utilities.parseDate(s, tz_(), 'yyyy-MM-dd') : s;
  }
  if (k === 'amount' || k === 'start' || k === 'share') return Number(v) || 0;
  if (k === 'paid' || k === 'done') return v === true || v === 'true';
  if (k === 'doneAt') return v instanceof Date ? v : str_(v);
  if (k === 'time') return "'" + str_(v);   // κείμενο «21:00», όχι ώρα του Sheets
  return str_(v);
}

function findRow_(inf, id, profile) {
  const i = inf.rows.findIndex(r => str_(r[inf.idx.id]) === str_(id) && inf.mine(r, profile));
  if (i < 0) throw new Error('Δεν βρέθηκε η εγγραφή (ίσως άλλαξε στο Sheet). Κάνε ανανέωση.');
  return i;
}

function add_(key, row, profile) {
  // Το app δίνει δικό του ID (για καταχωρήσεις χωρίς internet). Αν έχει ήδη γραφτεί, δεν το ξαναγράφουμε.
  const cid = str_(row.id);
  if (cid) {
    const inf0 = info_(key);
    const r = inf0.rows.find(x => str_(x[inf0.idx.id]) === cid);
    if (r) return { id: cid, addedBy: inf0.idx.addedBy != null ? str_(r[inf0.idx.addedBy]) : '', photo: inf0.idx.photo != null ? str_(r[inf0.idx.photo]) : '' };
  }
  if (key === 'shop') {
    row.addedBy = profile; row.done = false; row.doneBy = ''; row.doneAt = '';
    // Ίδιο προϊόν με πριν: παίρνει την αποθηκευμένη φωτογραφία του.
    row.photo = rememberProduct_(row.name, row.photo, row.list);
  }
  if (key === 'house') row.addedBy = profile;
  const inf = info_(key);
  const out = new Array(inf.width).fill('');
  row.id = cid || Utilities.getUuid();
  if (!inf.def.shared) row.profile = profile;
  for (const k in inf.idx) out[inf.idx[k]] = toCell_(k, row[k]);
  inf.sh.getRange(inf.rows.length + 2, 1, 1, inf.width).setValues([out]);
  forget_(key);
  return { id: row.id, addedBy: row.addedBy, photo: row.photo };
}

function update_(key, row, profile) {
  const inf = info_(key);
  const i = findRow_(inf, row.id, profile);
  const cur = inf.rows[i].slice();
  const locked = ['id', 'profile', 'addedBy', 'doneBy', 'doneAt'];
  for (const k in inf.idx) if (locked.indexOf(k) < 0 && k in row) cur[inf.idx[k]] = toCell_(k, row[k]);
  const res = {};
  if (key === 'shop' && 'done' in row) {
    const done = row.done === true || row.done === 'true';
    cur[inf.idx.doneBy] = done ? profile : '';
    cur[inf.idx.doneAt] = done ? new Date() : '';
    res.doneBy = done ? profile : '';
    res.doneAt = done ? Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') : '';
  }
  const oldPhoto = inf.idx.photo != null ? str_(inf.rows[i][inf.idx.photo]) : '';
  const oldReceipt = inf.idx.receipt != null ? str_(inf.rows[i][inf.idx.receipt]) : '';
  inf.sh.getRange(i + 2, 1, 1, inf.width).setValues([cur]);
  if (key === 'shop' && ('photo' in row || 'name' in row)) {
    const name = str_(cur[inf.idx.name]), photo = str_(cur[inf.idx.photo]);
    if ('photo' in row) setProductPhoto_(name, photo, str_(cur[inf.idx.list]));
  }
  if (key === 'prod' && 'photo' in row) syncProductPhoto_(str_(cur[inf.idx.name]), str_(row.photo));
  if (oldPhoto && oldPhoto !== str_(cur[inf.idx.photo])) trashIfUnused_(oldPhoto);
  if (oldReceipt && oldReceipt !== str_(cur[inf.idx.receipt])) trashIfUnused_(oldReceipt);
  return res;
}

function remove_(key, id, profile) {
  const inf = info_(key);
  const i = findRow_(inf, id, profile);
  const photo = inf.idx.photo != null ? str_(inf.rows[i][inf.idx.photo]) : '';
  const receipt = inf.idx.receipt != null ? str_(inf.rows[i][inf.idx.receipt]) : '';
  inf.sh.deleteRow(i + 2);
  if (receipt) trashIfUnused_(receipt);
  if (key === 'prod') {
    // Το προϊόν φεύγει από τα αποθηκευμένα: βγαίνει η φωτογραφία και από τα προϊόντα των λιστών.
    const name = str_(inf.rows[i][inf.idx.name]);
    const shop = info_('shop');
    shop.rows.forEach((r, j) => {
      if (low_(r[shop.idx.name]) === low_(name) && str_(r[shop.idx.photo]) === photo) shop.sh.getRange(j + 2, shop.idx.photo + 1).setValue('');
    });
  }
  if (photo) trashIfUnused_(photo);
  return {};
}

/* ---------- αποθηκευμένα προϊόντα ---------- */

const low_ = v => str_(v).toLowerCase();

/** Προσθέτει/ενημερώνει το προϊόν στα αποθηκευμένα και επιστρέφει τη φωτογραφία που πρέπει να έχει. */
function rememberProduct_(name, photo, list) {
  name = str_(name); photo = str_(photo);
  if (!name) return photo;
  const prod = info_('prod');
  const i = prod.rows.findIndex(r => low_(r[prod.idx.name]) === low_(name));
  if (i < 0) {
    const out = new Array(prod.width).fill('');
    out[prod.idx.name] = name; out[prod.idx.photo] = photo; out[prod.idx.list] = str_(list); out[prod.idx.id] = Utilities.getUuid();
    prod.sh.getRange(prod.rows.length + 2, 1, 1, prod.width).setValues([out]);
    return photo;
  }
  const saved = str_(prod.rows[i][prod.idx.photo]);
  if (!photo) return saved;                       // ξαναχρησιμοποίηση
  if (photo !== saved) {                          // νέα φωτογραφία για το ίδιο προϊόν
    prod.sh.getRange(i + 2, prod.idx.photo + 1).setValue(photo);
    if (saved) trashIfUnused_(saved);
  }
  return photo;
}

/** Ορίζει (ή αφαιρεί) τη φωτογραφία ενός αποθηκευμένου προϊόντος. */
function setProductPhoto_(name, photo, list) {
  const prod = info_('prod');
  const i = prod.rows.findIndex(r => low_(r[prod.idx.name]) === low_(name));
  if (i < 0) { rememberProduct_(name, photo, list); return; }
  const saved = str_(prod.rows[i][prod.idx.photo]);
  if (saved === photo) return;
  prod.sh.getRange(i + 2, prod.idx.photo + 1).setValue(photo);
  if (saved) trashIfUnused_(saved);
}

/** Όταν αλλάζει η φωτογραφία στα αποθηκευμένα, την περνάει και στα ίδια προϊόντα που είναι σε λίστες. */
function syncProductPhoto_(name, photo) {
  const shop = info_('shop');
  shop.rows.forEach((r, j) => {
    if (low_(r[shop.idx.name]) === low_(name)) shop.sh.getRange(j + 2, shop.idx.photo + 1).setValue(photo);
  });
}

/** Σβήνει μια φωτογραφία από το Drive μόνο αν δεν τη χρησιμοποιεί πια κανένα προϊόν. */
function trashIfUnused_(id) {
  id = str_(id);
  if (!id) return;
  const used = ['prod', 'shop'].some(key => {
    const inf = info_(key);
    return inf.rows.some(r => str_(r[inf.idx.photo]) === id);
  }) || ['tx', 'house'].some(key => {
    const inf = info_(key);
    return inf.rows.some(r => str_(r[inf.idx.receipt]) === id);
  });
  if (!used) trashPhoto_(id);
}

function seedCats_(profile) {
  const inf = info_('cat');
  const out = STARTER_CATS.map(([type, cat, sub]) => {
    const r = new Array(inf.width).fill('');
    r[inf.idx.type] = type; r[inf.idx.cat] = cat; r[inf.idx.sub] = sub;
    r[inf.idx.profile] = profile; r[inf.idx.id] = Utilities.getUuid();
    return r;
  });
  inf.sh.getRange(inf.rows.length + 2, 1, out.length, inf.width).setValues(out);
  forget_('cat');
}

/** Μετονομασία κατηγορίας (ή υποκατηγορίας αν δοθεί sub) — αλλάζει και τις παλιές κινήσεις του ίδιου προφίλ. */
function renameCat_(p, profile) {
  const name = str_(p.name);
  if (!name) throw new Error('Κενό όνομα');
  const col = str_(p.sub) ? 'sub' : 'cat';
  ['cat', 'tx'].forEach(key => {
    const inf = info_(key);
    let changed = false;
    inf.rows.forEach(r => {
      if (inf.mine(r, profile) && str_(r[inf.idx.type]) === str_(p.type) && str_(r[inf.idx.cat]) === str_(p.cat) &&
          (col === 'cat' || str_(r[inf.idx.sub]) === str_(p.sub))) {
        r[inf.idx[col]] = name;
        changed = true;
      }
    });
    if (changed && inf.rows.length) {
      inf.sh.getRange(2, inf.idx[col] + 1, inf.rows.length, 1).setValues(inf.rows.map(r => [r[inf.idx[col]]]));
    }
  });
  return {};
}

/** Διαγραφή κατηγορίας/υποκατηγορίας από τη λίστα. Οι παλιές κινήσεις μένουν ως έχουν. */
function deleteCat_(p, profile) {
  const inf = info_('cat');
  const sub = str_(p.sub);
  const match = r => inf.mine(r, profile) && str_(r[inf.idx.type]) === str_(p.type) && str_(r[inf.idx.cat]) === str_(p.cat) &&
                     (!sub || str_(r[inf.idx.sub]) === sub);
  for (let i = inf.rows.length - 1; i >= 0; i--) {
    if (match(inf.rows[i])) inf.sh.deleteRow(i + 2);
  }
  // Αν σβήστηκε η τελευταία υποκατηγορία, η κατηγορία μένει (χωρίς υποκατηγορίες).
  if (sub && !read_('cat', profile).some(r => str_(r.type) === str_(p.type) && str_(r.cat) === str_(p.cat))) {
    add_('cat', { type: p.type, cat: p.cat, sub: '' }, profile);
  }
  return {};
}

/* ---------- Ταμεία ---------- */

/** Αλλαγή ταμείου (όνομα, εικονίδιο, αρχικό υπόλοιπο) — το νέο όνομα περνάει και στις κινήσεις του. */
function renameAcc_(p, profile) {
  const name = str_(p.name);
  if (!name) throw new Error('Κενό όνομα');
  const acc = info_('acc');
  const i = findRow_(acc, p.id, profile);
  const clash = acc.rows.some((r, j) => j !== i && acc.mine(r, profile) && low_(r[acc.idx.name]) === low_(name));
  if (clash) throw new Error('Υπάρχει ήδη ταμείο με αυτό το όνομα');
  const old = str_(acc.rows[i][acc.idx.name]);
  acc.sh.getRange(i + 2, acc.idx.name + 1).setValue(name);
  if ('icon' in p) acc.sh.getRange(i + 2, acc.idx.icon + 1).setValue(str_(p.icon));
  if ('start' in p) acc.sh.getRange(i + 2, acc.idx.start + 1).setValue(toCell_('start', p.start));
  if (old !== name) {
    const tx = info_('tx');
    ['acc', 'to'].forEach(col => {
      let changed = false;
      tx.rows.forEach(r => { if (tx.mine(r, profile) && str_(r[tx.idx[col]]) === old) { r[tx.idx[col]] = name; changed = true; } });
      if (changed) tx.sh.getRange(2, tx.idx[col] + 1, tx.rows.length, 1).setValues(tx.rows.map(r => [r[tx.idx[col]]]));
    });
  }
  return {};
}

/* ---------- Σπίτι ---------- */

/** Μετονομασία κατηγορίας σπιτιού (και εικονιδίου) — περνάει και στα έξοδα/πάγια του σπιτιού. */
function renameHouseCat_(p, profile) {
  const name = str_(p.name);
  if (!name) throw new Error('Κενό όνομα');
  const cats = info_('houseCat');
  const i = findRow_(cats, p.id, profile);
  const old = str_(cats.rows[i][cats.idx.name]);
  cats.sh.getRange(i + 2, cats.idx.name + 1).setValue(name);
  if ('icon' in p) cats.sh.getRange(i + 2, cats.idx.icon + 1).setValue(str_(p.icon));
  if (old !== name) {
    ['house', 'houseRec'].forEach(key => {
      const inf = info_(key);
      let changed = false;
      inf.rows.forEach(r => { if (str_(r[inf.idx.cat]) === old) { r[inf.idx.cat] = name; changed = true; } });
      if (changed) inf.sh.getRange(2, inf.idx.cat + 1, inf.rows.length, 1).setValues(inf.rows.map(r => [r[inf.idx.cat]]));
    });
  }
  return {};
}

/* ---------- Ψώνια ---------- */

/** Μετονομασία λίστας (και εικονιδίου) — ενημερώνει και τα προϊόντα της. */
function renameList_(p, profile) {
  const name = str_(p.name);
  if (!name) throw new Error('Κενό όνομα');
  const lists = info_('lists');
  const i = findRow_(lists, p.id, profile);
  const old = str_(lists.rows[i][lists.idx.name]);
  lists.sh.getRange(i + 2, lists.idx.name + 1).setValue(name);
  if ('icon' in p) lists.sh.getRange(i + 2, lists.idx.icon + 1).setValue(str_(p.icon));
  if (old !== name) {
    const shop = info_('shop');
    let changed = false;
    shop.rows.forEach(r => { if (str_(r[shop.idx.list]) === old) { r[shop.idx.list] = name; changed = true; } });
    if (changed) shop.sh.getRange(2, shop.idx.list + 1, shop.rows.length, 1).setValues(shop.rows.map(r => [r[shop.idx.list]]));
  }
  return {};
}

/** Διαγραφή λίστας μαζί με τα προϊόντα της. */
function deleteList_(p, profile) {
  const lists = info_('lists');
  const i = findRow_(lists, p.id, profile);
  const name = str_(lists.rows[i][lists.idx.name]);
  const shop = info_('shop');
  const photos = [];
  for (let j = shop.rows.length - 1; j >= 0; j--) {
    if (str_(shop.rows[j][shop.idx.list]) === name) {
      photos.push(str_(shop.rows[j][shop.idx.photo]));
      shop.sh.deleteRow(j + 2);
    }
  }
  lists.sh.deleteRow(i + 2);
  photos.forEach(trashIfUnused_);
  return {};
}

/** Σβήνει από τη λίστα τα αγορασμένα (οι φωτογραφίες μένουν στα αποθηκευμένα προϊόντα). */
function clearDone_(p, profile) {
  const shop = info_('shop');
  const photos = [];
  for (let j = shop.rows.length - 1; j >= 0; j--) {
    const r = shop.rows[j];
    if (str_(r[shop.idx.list]) === str_(p.list) && r[shop.idx.done] === true) {
      photos.push(str_(r[shop.idx.photo]));
      shop.sh.deleteRow(j + 2);
    }
  }
  photos.forEach(trashIfUnused_);
  return {};
}

function photoFolder_() {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

function uploadPhoto_(p) {
  const data = str_(p.data).replace(/^data:[^,]+,/, '');
  if (!data) throw new Error('Κενή φωτογραφία');
  if (data.length > 4000000) throw new Error('Πολύ μεγάλη φωτογραφία');
  const mime = /^image\/(jpeg|png|webp)$/.test(p.mime) ? p.mime : 'image/jpeg';
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, 'photo-' + Date.now() + '.jpg');
  const file = photoFolder_().createFile(blob);
  return { id: file.getId() };
}

function photo_(id) {
  id = str_(id);
  if (!id) throw new Error('Χωρίς φωτογραφία');
  const file = DriveApp.getFileById(id);
  // Μόνο αρχεία από τον φάκελο του app.
  const parents = file.getParents();
  if (!parents.hasNext() || parents.next().getName() !== PHOTO_FOLDER) throw new Error('Μη επιτρεπτό αρχείο');
  const blob = file.getBlob();
  return { data: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

function trashPhoto_(id) {
  if (!id) return;
  try {
    const file = DriveApp.getFileById(id);
    const parents = file.getParents();
    if (parents.hasNext() && parents.next().getName() === PHOTO_FOLDER) file.setTrashed(true);
  } catch (err) { /* ήδη σβησμένη */ }
}

/* ---------- Ειδοποιήσεις (Web Push): υπογραφή VAPID με ECDSA P-256 ---------- */
// Το Apps Script δεν έχει ECDSA, οπότε η καμπύλη P-256 υλοποιείται εδώ με BigInt.
// Χρειάζεται μόνο: SHA-256 και HMAC-SHA256 (από Utilities).

const B0_ = BigInt(0), B1_ = BigInt(1), B2_ = BigInt(2), B3_ = BigInt(3), B4_ = BigInt(4), B8_ = BigInt(8), B255_ = BigInt(255);

const P256_ = {
  p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
  n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
  a: BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc'),
  Gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  Gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
};

function ecMod_(a, m) { const r = a % m; return r < B0_ ? r + m : r; }
function ecInv_(a, m) {           // αντίστροφος (Euclid)
  let [r0, r1] = [ecMod_(a, m), m], [s0, s1] = [B1_, B0_];
  while (r1 !== B0_) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return ecMod_(s0, m);
}
// Σημεία σε Jacobian συντεταγμένες [X, Y, Z]· null = σημείο στο άπειρο.
function ecDouble_(P) {
  if (!P) return null;
  const p = P256_.p, [X, Y, Z] = P;
  if (Y === B0_) return null;
  const YY = ecMod_(Y * Y, p), S = ecMod_(B4_ * X * YY, p);
  const ZZ = ecMod_(Z * Z, p);
  const M = ecMod_(B3_ * (X - ZZ) * (X + ZZ), p);           // a = -3
  const X3 = ecMod_(M * M - B2_ * S, p);
  const Y3 = ecMod_(M * (S - X3) - B8_ * YY * YY, p);
  const Z3 = ecMod_(B2_ * Y * Z, p);
  return [X3, Y3, Z3];
}
function ecAdd_(P, Q) {
  if (!P) return Q; if (!Q) return P;
  const p = P256_.p, [X1, Y1, Z1] = P, [X2, Y2, Z2] = Q;
  const Z1Z1 = ecMod_(Z1 * Z1, p), Z2Z2 = ecMod_(Z2 * Z2, p);
  const U1 = ecMod_(X1 * Z2Z2, p), U2 = ecMod_(X2 * Z1Z1, p);
  const S1 = ecMod_(Y1 * Z2 * Z2Z2, p), S2 = ecMod_(Y2 * Z1 * Z1Z1, p);
  if (U1 === U2) return S1 === S2 ? ecDouble_(P) : null;
  const H = ecMod_(U2 - U1, p), R = ecMod_(S2 - S1, p);
  const HH = ecMod_(H * H, p), HHH = ecMod_(H * HH, p), V = ecMod_(U1 * HH, p);
  const X3 = ecMod_(R * R - HHH - B2_ * V, p);
  const Y3 = ecMod_(R * (V - X3) - S1 * HHH, p);
  const Z3 = ecMod_(Z1 * Z2 * H, p);
  return [X3, Y3, Z3];
}
function ecMulG_(k) {             // k·G, επιστρέφει [x, y] (affine)
  let R = null, Q = [P256_.Gx, P256_.Gy, B1_];
  while (k > B0_) { if (k & B1_) R = ecAdd_(R, Q); Q = ecDouble_(Q); k >>= B1_; }
  const p = P256_.p, zi = ecInv_(R[2], p), zi2 = ecMod_(zi * zi, p);
  return [ecMod_(R[0] * zi2, p), ecMod_(R[1] * zi2 * zi, p)];
}

// Βοηθητικά για bytes (0..255).
const u8_ = arr => arr.map(b => b & 255);
function bytesToBig_(b) { let x = B0_; for (const v of b) x = (x << B8_) | BigInt(v & 255); return x; }
function bigToBytes_(x, len) { const out = new Array(len); for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & B255_); x >>= B8_; } return out; }

/**
 * Υπογραφή ECDSA P-256 / SHA-256 (ντετερμινιστική κατά RFC 6979), σε μορφή JOSE (r||s, 64 bytes).
 * sha256(bytes) → bytes, hmac(keyBytes, dataBytes) → bytes.
 */
function ecdsaSign_(msgBytes, d, sha256, hmac) {
  const n = P256_.n;
  const h = u8_(sha256(msgBytes));
  const z = bytesToBig_(h);
  const x = bigToBytes_(d, 32), h1 = bigToBytes_(ecMod_(z, n), 32);
  let V = new Array(32).fill(1), K = new Array(32).fill(0);
  K = u8_(hmac(K, [...V, 0, ...x, ...h1])); V = u8_(hmac(K, V));
  K = u8_(hmac(K, [...V, 1, ...x, ...h1])); V = u8_(hmac(K, V));
  for (;;) {
    V = u8_(hmac(K, V));
    const k = bytesToBig_(V);
    if (k >= B1_ && k < n) {
      const r = ecMod_(ecMulG_(k)[0], n);
      const s = ecMod_(ecInv_(k, n) * (z + r * d), n);
      if (r !== B0_ && s !== B0_) return [...bigToBytes_(r, 32), ...bigToBytes_(s, 32)];
    }
    K = u8_(hmac(K, [...V, 0])); V = u8_(hmac(K, V));
  }
}

/** Νέο ζευγάρι κλειδιών από 32 τυχαία bytes: επιστρέφει { d (BigInt), pub (65 bytes, 0x04||X||Y) }. */
function ecKeyPair_(seedBytes) {
  const d = ecMod_(bytesToBig_(seedBytes), P256_.n - B1_) + B1_;
  const [X, Y] = ecMulG_(d);
  return { d, pub: [4, ...bigToBytes_(X, 32), ...bigToBytes_(Y, 32)] };
}

// Utilities δουλεύει με bytes -128..127.
const signed_ = arr => arr.map(v => { v &= 255; return v > 127 ? v - 256 : v; });
const sha256G_ = b => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed_(b));
const hmacG_ = (k, d) => Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, signed_(d), signed_(k));
const b64u_ = bytes => Utilities.base64EncodeWebSafe(signed_(bytes)).replace(/=+$/, '');
const utf8_ = s => u8_(Utilities.newBlob(s).getBytes());

/** Τα κλειδιά VAPID του app: φτιάχνονται αυτόματα την πρώτη φορά και μένουν στα Script properties. */
function vapidKeys_() {
  const props = PropertiesService.getScriptProperties();
  let d = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (!d || !pub) {
    const seed = u8_(sha256G_(utf8_(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random())));
    const kp = ecKeyPair_(seed);
    d = kp.d.toString(16); pub = b64u_(kp.pub);
    props.setProperties({ VAPID_D: d, VAPID_PUB: pub });
  }
  return { d: BigInt('0x' + d), pub };
}

/** Στέλνει «ξύπνα» σε μια συσκευή (χωρίς περιεχόμενο· το μήνυμα το φέρνει η ίδια η συσκευή). Επιστρέφει τον κωδικό HTTP. */
function sendPush_(endpoint) {
  const m = String(endpoint).match(/^https:\/\/[^\/]+/);
  if (!m) throw new Error('Μη έγκυρη συσκευή');
  const keys = vapidKeys_();
  const head = b64u_(utf8_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u_(utf8_(JSON.stringify({ aud: m[0], exp: Math.floor(Date.now() / 1000) + 3600, sub: 'https://locabeat.github.io/householddesk/' })));
  const sig = ecdsaSign_(utf8_(head + '.' + body), keys.d, sha256G_, hmacG_);
  const jwt = head + '.' + body + '.' + b64u_(sig);
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post', muteHttpExceptions: true, payload: '',
    headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + jwt + ', k=' + keys.pub },
  });
  return res.getResponseCode();
}

/** Καταχωρεί (ή ενημερώνει) τη συσκευή και την ώρα της υπενθύμισης. */
function pushSave_(p, profile) {
  const sub = p.sub || {};
  const endpoint = str_(sub.endpoint);
  if (!/^https:\/\//.test(endpoint)) throw new Error('Μη έγκυρη συσκευή');
  const time = /^\d{2}:\d{2}$/.test(str_(p.time)) ? str_(p.time) : '21:00';
  const inf = info_('push');
  const i = inf.rows.findIndex(r => inf.mine(r, profile) && str_(r[inf.idx.endpoint]) === endpoint);
  if (i >= 0) {
    inf.sh.getRange(i + 2, inf.idx.time + 1).setValue(toCell_('time', time));
    inf.sh.getRange(i + 2, inf.idx.device + 1).setValue(str_(p.device));
  } else {
    add_('push', { endpoint, p256dh: str_(sub.keys && sub.keys.p256dh), auth: str_(sub.keys && sub.keys.auth), time, last: '', device: str_(p.device) }, profile);
  }
  ensurePushTrigger_();
  return {};
}

function pushDelete_(p, profile) {
  const inf = info_('push');
  for (let i = inf.rows.length - 1; i >= 0; i--) {
    if (inf.mine(inf.rows[i], profile) && str_(inf.rows[i][inf.idx.endpoint]) === str_(p.endpoint)) inf.sh.deleteRow(i + 2);
  }
  return {};
}

/** Ο έλεγχος τρέχει μόνος του κάθε 5 λεπτά (Triggers του Apps Script). */
function ensurePushTrigger_() {
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'pushTick')) {
    ScriptApp.newTrigger('pushTick').timeBased().everyMinutes(5).create();
  }
}

/** Τρέξ' το μία φορά από τον επεξεργαστή για να δώσεις άδεια (ειδοποιήσεις + αυτόματος έλεγχος). */
function setupPush() {
  vapidKeys_();
  ensurePushTrigger_();
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  return 'OK — οι ειδοποιήσεις είναι έτοιμες';
}

/**
 * Ο καθημερινός «έλεγχος ημέρας»: τι έχεις περάσει σήμερα (για να θυμηθείς τι λείπει)
 * και αν έχεις πάγια για χρέωση. Στέλνεται κάθε μέρα, ακόμα κι αν έχεις περάσει κινήσεις.
 */
function reminderFor_(profile) {
  const tz = tz_(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const day = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : str_(v);
  const money = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
  const tx = info_('tx'), house = info_('house'), rec = info_('rec'), hrec = info_('houseRec');
  const mineToday = tx.rows.filter(r => tx.mine(r, profile) && day(r[tx.idx.date]) === today);
  const houseToday = house.rows.filter(r => house.isData(r) && str_(r[house.idx.addedBy]) === profile && day(r[house.idx.date]) === today);
  const count = mineToday.length + houseToday.length;
  const spent = mineToday.filter(r => str_(r[tx.idx.type]) === 'Έξοδο').reduce((s, r) => s + (Number(r[tx.idx.amount]) || 0), 0);
  // Ονόματα για να θυμηθείς τι πέρασες (υποκατηγορία ή κατηγορία).
  const names = [];
  mineToday.forEach(r => { const n = str_(r[tx.idx.sub]) || str_(r[tx.idx.cat]) || str_(r[tx.idx.note]); if (n && names.indexOf(n) < 0) names.push(n); });
  houseToday.forEach(r => { const n = '🏠 ' + (str_(r[house.idx.cat]) || 'Σπίτι'); if (names.indexOf(n) < 0) names.push(n); });
  const due = rec.rows.filter(r => rec.mine(r, profile) && day(r[rec.idx.next]) && day(r[rec.idx.next]) <= today).length;
  const hdue = hrec.rows.filter(r => hrec.isData(r) && day(r[hrec.idx.next]) && day(r[hrec.idx.next]) <= today).length;
  const parts = [];
  if (!count) parts.push('Δεν έχεις περάσει καμία κίνηση σήμερα. Ξόδεψες κάτι; Πέρασέ το τώρα.');
  else {
    const list = names.slice(0, 4).join(', ') + (names.length > 4 ? ' κ.ά.' : '');
    parts.push(`Σήμερα πέρασες ${count} ${count === 1 ? 'κίνηση' : 'κινήσεις'}${spent ? ` (−${money(spent)})` : ''}: ${list}. Μήπως ξέχασες κάποια αγορά; Έλεγξε ότι τα πέρασες όλα 🧾`);
  }
  if (due) parts.push(`Έχεις ${due} ${due === 1 ? 'πάγιο' : 'πάγια'} για χρέωση.`);
  if (hdue) parts.push(`Στο Σπίτι: ${hdue} ${hdue === 1 ? 'πάγιο' : 'πάγια'} για πληρωμή.`);
  return { needed: true, title: '🧾 Έλεγχος ημέρας', body: parts.join(' ') };
}

/** Κάθε 5 λεπτά: όποια συσκευή έφτασε η ώρα της (και δεν έχει ειδοποιηθεί σήμερα) παίρνει υπενθύμιση, αν χρειάζεται. */
function pushTick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const tz = tz_(), now = new Date();
    const hhmm = Utilities.formatDate(now, tz, 'HH:mm'), today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const inf = info_('push');
    const cache = {};
    for (let i = inf.rows.length - 1; i >= 0; i--) {
      const r = inf.rows[i];
      if (!inf.isData(r)) continue;
      const time = r[inf.idx.time] instanceof Date ? Utilities.formatDate(r[inf.idx.time], tz, 'HH:mm') : str_(r[inf.idx.time]);
      const last = r[inf.idx.last] instanceof Date ? Utilities.formatDate(r[inf.idx.last], tz, 'yyyy-MM-dd') : str_(r[inf.idx.last]);
      if (last === today || !time || time > hhmm) continue;
      const profile = str_(r[inf.idx.profile]);
      const msg = cache[profile] || (cache[profile] = reminderFor_(profile));
      if (msg.needed) {
        const code = sendPush_(str_(r[inf.idx.endpoint]));
        if (code === 404 || code === 410) { inf.sh.deleteRow(i + 2); continue; }   // η συσκευή δεν υπάρχει πια
      }
      inf.sh.getRange(i + 2, inf.idx.last + 1).setValue("'" + today);
    }
  } finally {
    lock.releaseLock();
  }
}
