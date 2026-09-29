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
  tx:    { name: 'Κινήσεις',   cols: { date: 'Ημερομηνία', type: 'Τύπος', amount: 'Ποσό', cat: 'Κατηγορία', sub: 'Υποκατηγορία', note: 'Σημείωση', acc: 'Ταμείο', to: 'Προς ταμείο', profile: 'Προφίλ', id: 'ID' } },
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
  house:    { name: 'Σπίτι', shared: true, cols: { date: 'Ημερομηνία', kind: 'Είδος', cat: 'Κατηγορία', amount: 'Ποσό', note: 'Σημείωση', paidBy: 'Πλήρωσε', owedBy: 'Για / Προς', share: 'Μερίδιο άλλου %', payAcc: 'Ταμείο πληρωτή', recvAcc: 'Ταμείο παραλήπτη', addedBy: 'Πρόσθεσε', id: 'ID' } },
  houseCat: { name: 'Κατηγορίες Σπιτιού', shared: true, cols: { name: 'Όνομα', icon: 'Εικονίδιο', id: 'ID' } },
  houseRec: { name: 'Πάγια Σπιτιού', shared: true, cols: { name: 'Όνομα', cat: 'Κατηγορία', amount: 'Ποσό', paidBy: 'Πληρώνει', share: 'Μερίδιο άλλου %', every: 'Κάθε', unit: 'Περίοδος', next: 'Επόμενη χρέωση', id: 'ID' } },
  // Αποθηκευμένα προϊόντα: κρατάνε τη φωτογραφία ώστε να ξαναχρησιμοποιείται.
  prod:  { name: 'Προϊόντα', shared: true, cols: { name: 'Όνομα', photo: 'Φωτογραφία', list: 'Λίστα', id: 'ID' } },
};
// Στήλες που προστίθενται αυτόματα αν λείπουν από το φύλλο.
const AUTO_COLS = ['acc', 'to', 'profile', 'id'];
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

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let res;
    switch (p.action) {
      case 'all':
        if (!read_('cat', profile).length) seedCats_(profile);
        if (!read_('lists', profile).length) STARTER_LISTS.forEach(([name, icon]) => add_('lists', { name, icon }, profile));
        if (!read_('houseCat', profile).length) STARTER_HOUSE_CATS.forEach(([name, icon]) => add_('houseCat', { name, icon }, profile));
        res = {
          profile, members: members_(),
          house: read_('house', profile), houseCat: read_('houseCat', profile), houseRec: read_('houseRec', profile),
          tx: read_('tx', profile), acc: read_('acc', profile), rec: read_('rec', profile), quick: read_('quick', profile), loan: read_('loan', profile), cat: read_('cat', profile),
          lists: read_('lists', profile), shop: read_('shop', profile), prod: read_('prod', profile),
        };
        break;
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
      case 'changePin':   res = changePin_(p, profile); break;
      default: throw new Error('Άγνωστη ενέργεια');
    }
    return json_({ ok: true, data: res });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
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
function info_(key) {
  const def = SHEETS[key];
  if (!def) throw new Error('Άγνωστο φύλλο');
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    const heads = Object.keys(def.cols).map(k => def.cols[k]);
    sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  let header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(str_);
  let c = header.length;
  while (c > 0 && !header[c - 1]) c--;
  let added = false;
  AUTO_COLS.forEach(k => {
    if (def.cols[k] && header.indexOf(def.cols[k]) < 0) {
      sh.getRange(1, ++c).setValue(def.cols[k]).setFontWeight('bold');
      added = true;
    }
  });
  if (added) header = sh.getRange(1, 1, 1, c).getValues()[0].map(str_);

  const idx = {};
  for (const k in def.cols) {
    const i = header.indexOf(def.cols[k]);
    if (i < 0) throw new Error('Λείπει η στήλη «' + def.cols[k] + '» στο φύλλο «' + def.name + '»');
    idx[k] = i;
  }

  const width = header.length;
  const n = sh.getLastRow() - 1;
  let rows = n > 0 ? sh.getRange(2, 1, n, width).getValues() : [];

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
  return { sh, def, idx, width, rows, isData, mine };
}

function read_(key, profile) {
  const inf = info_(key);
  const tz = tz_();
  return inf.rows.filter(r => inf.mine(r, profile)).map(r => {
    const o = {};
    for (const k in inf.idx) {
      if (k === 'profile') continue;
      let v = r[inf.idx[k]];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, k === 'doneAt' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
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
  inf.sh.getRange(i + 2, 1, 1, inf.width).setValues([cur]);
  if (key === 'shop' && ('photo' in row || 'name' in row)) {
    const name = str_(cur[inf.idx.name]), photo = str_(cur[inf.idx.photo]);
    if ('photo' in row) setProductPhoto_(name, photo, str_(cur[inf.idx.list]));
  }
  if (key === 'prod' && 'photo' in row) syncProductPhoto_(str_(cur[inf.idx.name]), str_(row.photo));
  if (oldPhoto && oldPhoto !== str_(cur[inf.idx.photo])) trashIfUnused_(oldPhoto);
  return res;
}

function remove_(key, id, profile) {
  const inf = info_(key);
  const i = findRow_(inf, id, profile);
  const photo = inf.idx.photo != null ? str_(inf.rows[i][inf.idx.photo]) : '';
  inf.sh.deleteRow(i + 2);
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
