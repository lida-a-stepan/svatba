// Termín pro potvrzení účasti (stejný jako na webu).
const TERMIN = "30. dubna 2027";

// Vzorová data pro náhled. Skutečný seznam hostů nikdy necommitujte.
const UKAZKA = [
  { name: "Novákovi", max: 3, code: "8ay7vema", link: "https://lida-a-stepan.github.io/svatba/?g=8ay7vema" },
  { name: "Babička Marie", max: 1, code: "k3pz9wqh", link: "https://lida-a-stepan.github.io/svatba/?g=k3pz9wqh" },
];

const $ = (id) => document.getElementById(id);

function personsWord(n) {
  if (n === 1) return "platí pro 1 osobu";
  if (n >= 2 && n <= 4) return `platí pro ${n} osoby`;
  return `platí pro ${n} osob`;
}

// Jednoduchý CSV parser s podporou uvozovek; oddělovač čárka nebo středník.
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function guestsFromCsv(text) {
  const [header, ...rows] = parseCsv(text);
  const idx = (re) => header.findIndex((h) => re.test(h.trim()));
  const iCode = idx(/^kód/i), iName = idx(/^jméno/i), iMax = idx(/^max/i), iLink = idx(/odkaz/i);
  if ([iCode, iName, iLink].includes(-1)) {
    throw new Error("V CSV chybí sloupce Kód, Jméno / domácnost nebo Osobní odkaz. Stáhněte prosím list Hosté.");
  }
  const guests = [], skipped = [];
  rows.forEach((r) => {
    const g = {
      name: (r[iName] || "").trim(),
      max: parseInt(r[iMax], 10) || null,
      code: (r[iCode] || "").trim().toLowerCase(),
      link: (r[iLink] || "").trim(),
    };
    if (g.name && /^[a-z2-9]{8}$/.test(g.code) && /^https:\/\//.test(g.link)) guests.push(g);
    else if (g.name) skipped.push(g.name);
  });
  return { guests, skipped };
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  }
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${n} ${n}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR kód s osobním odkazem");
  svg.setAttribute("shape-rendering", "crispEdges");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#26304A");
  svg.append(path);
  return svg;
}

function render(guests) {
  const out = $("sheets");
  out.replaceChildren();
  guests.forEach((g) => {
    out.append($("tpl-front").content.cloneNode(true));
    const back = $("tpl-back").content.cloneNode(true);
    const f = (k) => back.querySelector(`[data-f="${k}"]`);
    f("name").textContent = g.name;
    f("persons").textContent = g.max ? personsWord(g.max) : "";
    f("deadline").textContent = TERMIN;
    f("qr").append(qrSvg(g.link));
    const url = new URL(g.link);
    f("site").textContent = (url.host + url.pathname).replace(/\/$/, "");
    f("code").textContent = `${g.code.slice(0, 4)}-${g.code.slice(4)}`;
    out.append(back);
  });
}

$("csv").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { guests, skipped } = guestsFromCsv(await file.text());
    render(guests);
    let msg = `Načteno pozvánek: ${guests.length}.`;
    if (skipped.length) msg += ` Bez platného kódu nebo odkazu (spusťte generateInviteLinks): ${skipped.join(", ")}.`;
    $("status").textContent = msg;
  } catch (err) {
    $("status").textContent = err.message;
  }
});

$("print").addEventListener("click", () => window.print());

render(UKAZKA);
$("status").textContent = `Zobrazena ukázka, pozvánek: ${UKAZKA.length}.`;
