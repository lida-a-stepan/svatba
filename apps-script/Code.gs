/** @OnlyCurrentDoc */
/**
 * Svatební RSVP – backend v Google Apps Scriptu.
 *
 * Bezpečnost:
 *  - @OnlyCurrentDoc: skript má přístup jen k této tabulce, ne k celému Drivu.
 *  - Odpověď i soukromé údaje (adresa, kontakty…) jen s platným kódem z pozvánky.
 *  - Kódy mají 8 znaků z 31 (≈ 8,5 × 10^11 možností), hádání není reálné.
 *  - Rate limit na kód i celkově, limit e-mailových upozornění.
 *  - Ořezání délek a ochrana proti vzorcům v tabulce.
 *  - Soukromé údaje jsou jen v listu „Pro hosty“, nikdy ne v kódu ani v repu.
 *
 * Postup: vložit do Rozšíření → Apps Script, spustit setup(), nasadit jako
 * webovou aplikaci (Spustit jako: Já, Přístup: Kdokoli).
 */

const SITE_URL = 'https://lida-a-stepan.github.io/svatba/'; // pro osobní odkazy
const NOTIFY_EMAIL = true;           // upozornění majiteli tabulky na každou odpověď

const SHEETS = {
  rsvp:    { name: 'Odpovědi',  headers: ['Čas', 'Kód', 'Domácnost', 'Vyplnil(a)', 'E-mail', 'Přijde', 'Osob', 'Dětí', 'Strava', 'Přespání', 'Vzkaz'] },
  guests:  { name: 'Hosté',     headers: ['Kód', 'Jméno / domácnost', 'Max. osob', 'Osobní odkaz', 'Poslední odpověď'] },
  details: { name: 'Pro hosty', headers: ['Klíč', 'Hodnota', 'Poznámka'] },
};

// Údaje, které web ukáže jen hostům s platným kódem. Hodnoty se vyplňují v listu „Pro hosty“.
const DETAIL_KEYS = [
  ['adresa_obrad',   'Přesná adresa obřadu (víc řádků povoleno)'],
  ['adresa_hostina', 'Přesná adresa hostiny'],
  ['mapa_url',       'Odkaz na mapu, musí začínat https://'],
  ['dary',           'Informace k darům, případně číslo účtu'],
  ['kontakty',       'Kontakty, každý na vlastním řádku, např. „Lída: 600 000 001“'],
];

const LIMITS = {
  perCodePerHour: 10,   // kolikrát může jedna domácnost odeslat formulář za hodinu
  totalPerHour: 120,    // celkový strop odpovědí za hodinu
  mailReserve: 5,       // nechat rezervu z denní e-mailové kvóty
};

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // bez i, l, o, 0, 1
const CODE_LENGTH = 8;

/* ====================== ruční funkce ====================== */

/** Přidá do tabulky menu „Svatba“, ať se funkce nemusí spouštět z editoru skriptu. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Svatba')
    .addItem('Vygenerovat odkazy pro hosty', 'generateInviteLinks')
    .addSeparator()
    .addItem('Obnovit listy a záhlaví', 'setup')
    .addToUi();
}

/** Spusťte jednou: vytvoří listy se záhlavím a klíči pro soukromé údaje. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.values(SHEETS).forEach(s => ensureSheet_(ss, s.name, s.headers));

  const det = ss.getSheetByName(SHEETS.details.name);
  const existing = new Set(det.getRange(1, 1, Math.max(det.getLastRow(), 1), 1).getValues().flat());
  DETAIL_KEYS.filter(([k]) => !existing.has(k)).forEach(([k, note]) => det.appendRow([k, '', note]));

  ['List 1', 'List1', 'Sheet1'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

/** Doplní kódy a osobní odkazy do listu Hosté (vyplňte jen jméno a max. osob). */
function generateInviteLinks() {
  const sh = sheet_('guests');
  const last = sh.getLastRow();
  if (last < 2) {
    SpreadsheetApp.getActive().toast('V listu Hosté zatím nejsou žádní hosté.', 'Svatba');
    return;
  }
  const range = sh.getRange(2, 1, last - 1, 4);
  const rows = range.getValues();
  const used = new Set(rows.map(r => normCode_(r[0])).filter(Boolean));
  let created = 0;
  rows.forEach(r => {
    if (!String(r[1]).trim()) return;
    if (!normCode_(r[0])) {
      let code;
      do { code = randomCode_(); } while (used.has(code));
      used.add(code);
      r[0] = code;
      created++;
    }
    r[3] = SITE_URL + '?g=' + normCode_(r[0]);
  });
  range.setValues(rows);
  SpreadsheetApp.getActive().toast('Nové kódy: ' + created + '. Odkazy jsou ve sloupci Osobní odkaz.', 'Svatba');
}

/* ====================== webová aplikace ====================== */

/** GET ?g=kod → { ok, name, max, details } */
function doGet(e) {
  const code = normCode_(e && e.parameter && e.parameter.g);
  const guest = code && findGuest_(code);
  if (!guest) return json_({ ok: false, error: 'unknown_code' });
  return json_({ ok: true, name: guest.name, max: guest.max, details: readDetails_() });
}

/** POST (Content-Type text/plain, JSON tělo) → zapíše odpověď. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, error: 'busy' });
  try {
    let d;
    try { d = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: 'bad_request' }); }
    if (!d || typeof d !== 'object') return json_({ ok: false, error: 'bad_request' });
    if (d.website) return json_({ ok: true }); // honeypot: bot dostane „ok“, nic se neuloží

    const code = normCode_(d.token);
    const guest = code && findGuest_(code);
    if (!guest) return json_({ ok: false, error: 'unknown_code' });

    if (!rateOk_('c:' + code, LIMITS.perCodePerHour) || !rateOk_('all', LIMITS.totalPerHour)) {
      return json_({ ok: false, error: 'rate_limited' });
    }

    const name = clean_(d.name, 200);
    const attending = d.attending === 'ano' ? 'ano' : d.attending === 'ne' ? 'ne' : '';
    if (!name || !attending) return json_({ ok: false, error: 'missing_fields' });

    const maxGuests = guest.max || 10;
    let guests = '', kids = '';
    if (attending === 'ano') {
      guests = clampInt_(d.guests, 1, maxGuests, 1);
      kids = clampInt_(d.kids, 0, guests, 0);
    }

    const now = new Date();
    const row = [
      now, code, safe_(guest.name), name, clean_(d.email, 200), attending, guests, kids,
      attending === 'ano' ? clean_(d.diet, 500) : '',
      attending === 'ano' ? (d.lodging === 'ano' ? 'ano' : 'ne') : '',
      clean_(d.note, 2000),
    ];
    sheet_('rsvp').appendRow(row);
    sheet_('guests').getRange(guest.row, 5).setValue(
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'd. M. yyyy H:mm') + ' – ' +
      (attending === 'ano' ? 'přijde (' + guests + ')' : 'nepřijde'));

    notify_(guest.name, attending, guests, row);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

/* ====================== pomocné funkce ====================== */

function sheet_(key) {
  return SpreadsheetApp.getActive().getSheetByName(SHEETS[key].name);
}

function findGuest_(code) {
  const sh = sheet_('guests');
  if (!sh || sh.getLastRow() < 2) return null;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  const i = rows.findIndex(r => normCode_(r[0]) === code);
  if (i < 0) return null;
  return { row: i + 2, name: String(rows[i][1]).trim(), max: Number(rows[i][2]) || null };
}

function readDetails_() {
  const sh = sheet_('details');
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const allowed = new Set(DETAIL_KEYS.map(k => k[0]));
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(([k, v]) => {
    k = String(k).trim();
    v = String(v).trim();
    if (!allowed.has(k) || !v) return;
    if (k === 'mapa_url' && !/^https:\/\//.test(v)) return;
    out[k] = v;
  });
  return out;
}

// Jednoduchý klouzavý limit po hodinových oknech (volá se uvnitř zámku).
function rateOk_(key, max) {
  const cache = CacheService.getScriptCache();
  const k = 'rl:' + key + ':' + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(k) || 0);
  if (n >= max) return false;
  cache.put(k, String(n + 1), 3700);
  return true;
}

function notify_(household, attending, guests, row) {
  if (!NOTIFY_EMAIL) return;
  try {
    if (MailApp.getRemainingDailyQuota() <= LIMITS.mailReserve) return;
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'RSVP: ' + household + (attending === 'ano' ? ' přijdou (' + guests + ')' : ' nepřijdou'),
      SHEETS.rsvp.headers.map((h, i) => h + ': ' + row[i]).join('\n')
    );
  } catch (err) { console.error(err); }
}

function normCode_(v) {
  const s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
  return new RegExp('^[' + CODE_ALPHABET + ']{' + CODE_LENGTH + '}$').test(s) ? s : '';
}

function randomCode_() {
  // Utilities.getUuid() je kryptograficky náhodné; Math.random() ne.
  let bytes = [];
  while (bytes.length < CODE_LENGTH) {
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid())
      .forEach(b => { b &= 0xff; if (b < 248) bytes.push(b % 31); }); // 248 = 8×31, bez zkreslení
  }
  return bytes.slice(0, CODE_LENGTH).map(i => CODE_ALPHABET[i]).join('');
}

function ensureSheet_(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function clean_(v, max) {
  return safe_(String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max));
}

// Text začínající =, +, -, @ by tabulka vyhodnotila jako vzorec.
function safe_(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function clampInt_(v, min, max, dflt) {
  const n = parseInt(v, 10);
  return isNaN(n) ? dflt : Math.min(max, Math.max(min, n));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
