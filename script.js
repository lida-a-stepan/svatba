// URL webové aplikace z Apps Scriptu (končí na /exec). Není to tajemství,
// bez platného kódu z pozvánky nic nevrátí a nic neuloží.
const SCRIPT_URL = "";

const STORAGE_KEY = "svatba-kod";
const CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

/* ---------------- Louka v úvodu ---------------- */

(function drawMeadow() {
  const svg = document.getElementById("meadow");
  if (!svg) return;
  const W = 1200, H = 260, NS = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // Deterministický generátor, aby louka vypadala pokaždé stejně.
  let seed = 12062027;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  const c = {
    grass: "#7E9A68", poppy: "#C73A2E", poppyDark: "#26304A",
    corn: "#4A68B0", cornDark: "#33497F", wheat: "#D9B45A",
  };

  for (let x = -10; x < W + 10; x += 9 + rnd() * 14) {
    const r = rnd();
    const kind = r < 0.62 ? "grass" : r < 0.76 ? "wheat" : r < 0.89 ? "poppy" : "corn";
    const h = kind === "grass" ? 40 + rnd() * 90 : 95 + rnd() * 120;
    const lean = (rnd() - 0.5) * (kind === "grass" ? 40 : 26);
    const tx = x + lean, ty = H - h;
    const delay = (x / W) * 0.6 + rnd() * 0.35;

    // Styly přes CSSOM (el.style), ne atributem style – kvůli Content-Security-Policy.
    const g = el("g", { class: "grow" }, svg);
    g.style.animationDelay = `${delay.toFixed(2)}s`;
    const stalk = el("path", {
      d: `M${x.toFixed(1)} ${H + 4} Q${(x + lean * 0.2).toFixed(1)} ${(H - h * 0.5).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`,
      class: "stalk",
    }, g);
    if (kind === "grass") {
      stalk.style.stroke = c.grass;
      stalk.style.strokeWidth = "1.6";
      continue;
    }

    const head = el("g", { class: "bloom" }, svg);
    head.style.animationDelay = `${(delay + 0.9).toFixed(2)}s`;

    if (kind === "poppy") {
      const s = 9 + rnd() * 6;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd();
        el("circle", { cx: tx + Math.cos(a) * s * 0.55, cy: ty + Math.sin(a) * s * 0.55, r: s * 0.78, fill: c.poppy, opacity: 0.92 }, head);
      }
      el("circle", { cx: tx, cy: ty, r: s * 0.28, fill: c.poppyDark }, head);
    } else if (kind === "corn") {
      const s = 8 + rnd() * 4;
      for (let i = 0; i < 9; i++) {
        el("ellipse", { cx: tx, cy: ty - s * 0.55, rx: s * 0.22, ry: s * 0.6, fill: c.corn, transform: `rotate(${(i / 9) * 360} ${tx} ${ty})` }, head);
      }
      el("circle", { cx: tx, cy: ty, r: s * 0.3, fill: c.cornDark }, head);
    } else {
      const ang = Math.atan2(-h, lean) * 180 / Math.PI + 90;
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        el("ellipse", {
          cx: tx + side * 3.2, cy: ty + i * 6, rx: 2.6, ry: 5.2, fill: c.wheat,
          transform: `rotate(${ang + side * 22} ${tx} ${ty})`,
        }, head);
      }
    }
  }
})();

/* ---------------- Pomocné funkce ---------------- */

const $ = (id) => document.getElementById(id);

const store = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* soukromý režim apod. */ } },
  clear() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* nic */ } },
};

function normCode(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function personsWord(n) {
  if (n === 1) return "1 osobu";
  if (n >= 2 && n <= 4) return `${n} osoby`;
  return `${n} osob`;
}

// Víceřádkový text vložený jen přes textContent (žádné innerHTML = žádné XSS).
// Telefonní čísla se převedou na odkazy tel:.
function fillText(node, text) {
  node.replaceChildren();
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (i) node.append(document.createElement("br"));
    const phone = line.match(/(\+?\d[\d ]{7,}\d)/);
    if (!phone) { node.append(line); return; }
    const a = document.createElement("a");
    a.href = "tel:" + phone[1].replace(/ /g, "");
    a.textContent = phone[1];
    node.append(line.slice(0, phone.index), a, line.slice(phone.index + phone[1].length));
  });
}

/* ---------------- Kód z pozvánky ---------------- */

const codeForm = $("code-form");
const codeInput = $("code");
const codeError = $("code-error");
const form = $("rsvp-form");
const guestsInput = $("guests");

async function unlock(code, { silent = false } = {}) {
  codeError.hidden = true;
  if (!CODE_RE.test(code)) {
    if (!silent) { codeError.textContent = "Kód má 8 znaků, zkontrolujte ho prosím na pozvánce."; codeError.hidden = false; }
    return false;
  }
  if (!SCRIPT_URL) {
    codeError.textContent = "Web zatím není propojený s tabulkou. Doplňte SCRIPT_URL v souboru script.js.";
    codeError.hidden = false;
    return false;
  }

  $("code-submit").disabled = true;
  let data;
  try {
    const res = await fetch(`${SCRIPT_URL}?g=${encodeURIComponent(code)}`, { credentials: "omit" });
    data = await res.json();
  } catch {
    codeError.textContent = "Nepodařilo se spojit se serverem. Zkuste to prosím za chvíli znovu.";
    codeError.hidden = false;
    return false;
  } finally {
    $("code-submit").disabled = false;
  }

  if (!data.ok) {
    store.clear();
    if (!silent) { codeError.textContent = "Tento kód neznáme. Zkontrolujte ho prosím na pozvánce."; codeError.hidden = false; }
    return false;
  }

  store.set(code);
  $("token").value = code;

  // Soukromé údaje
  const details = data.details || {};
  document.querySelectorAll("[data-private]").forEach((node) => {
    const v = details[node.dataset.private];
    if (v) { fillText(node, v); node.classList.add("unlocked"); }
  });
  if (details.mapa_url && /^https:\/\//.test(details.mapa_url)) {
    const link = $("map-link");
    link.href = details.mapa_url;
    link.rel = "noopener noreferrer";
    link.hidden = false;
  }

  // Pozdrav a limit osob
  let text = `Ahoj, ${data.name}!`;
  if (data.max) {
    guestsInput.max = data.max;
    $("kids").max = data.max;
    guestsInput.value = data.max;
    text += ` Pozvánka platí pro ${personsWord(data.max)}.`;
  }
  $("greeting").textContent = text;
  $("greeting").hidden = false;

  codeForm.hidden = true;
  form.hidden = false;
  return true;
}

codeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (await unlock(normCode(codeInput.value))) $("name").focus();
});

(function init() {
  const params = new URLSearchParams(location.search);
  const fromUrl = normCode(params.get("g"));
  if (fromUrl) {
    // Kód z adresy uložíme a z adresního řádku ho odstraníme,
    // aby se neposílal dál při sdílení odkazu nebo na snímcích obrazovky.
    params.delete("g");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  }
  const code = fromUrl || store.get();
  if (code) {
    codeInput.value = code;
    unlock(code, { silent: !fromUrl });
  }
})();

/* ---------------- RSVP ---------------- */

const errorBox = $("form-error");
const submitBtn = $("submit");
const thanks = $("thanks");

form.addEventListener("change", (e) => {
  if (e.target.name === "attending") $("attending-fields").hidden = e.target.value !== "ano";
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

const SERVER_ERRORS = {
  unknown_code: "Kód z pozvánky už neplatí. Načtěte prosím stránku znovu z odkazu na pozvánce.",
  rate_limited: "Odpovědí bylo v poslední hodině příliš mnoho. Zkuste to prosím později.",
  busy: "Server je právě vytížený. Zkuste to prosím za chvíli.",
  missing_fields: "Doplňte prosím jméno a jestli přijdete.",
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  form.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));

  const data = Object.fromEntries(new FormData(form));
  const problems = [];

  if (!data.name.trim()) {
    problems.push("kdo formulář vyplňuje");
    $("name").closest(".field").classList.add("invalid");
  }
  if (!data.attending) {
    problems.push("jestli přijdete");
    form.querySelector('[name="attending"]').closest(".field").classList.add("invalid");
  }
  if (data.attending === "ano") {
    const g = Number(data.guests), k = Number(data.kids), max = Number(guestsInput.max);
    if (!Number.isInteger(g) || g < 1 || g > max) {
      problems.push(`počet osob (1 až ${max})`);
      guestsInput.closest(".field").classList.add("invalid");
    } else if (!Number.isInteger(k) || k < 0 || k > g) {
      problems.push("počet dětí (nejvýš tolik, kolik je osob celkem)");
      $("kids").closest(".field").classList.add("invalid");
    }
  } else {
    delete data.guests; delete data.kids; delete data.diet; delete data.lodging;
  }

  if (problems.length) {
    showError(`Doplňte prosím: ${problems.join(", ")}.`);
    form.querySelector(".invalid input")?.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Odesílám…";
  try {
    // text/plain = „simple request“ bez CORS preflightu, který Apps Script neumí.
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
      credentials: "omit",
    });
    const out = await res.json();
    if (!out.ok) {
      showError(SERVER_ERRORS[out.error] || "Odpověď se nepodařilo uložit. Zkuste to prosím znovu.");
      return;
    }
    form.hidden = true;
    $("thanks-text").textContent = data.attending === "ano"
      ? "Děkujeme, máme vás v seznamu. Moc se těšíme!"
      : "Děkujeme za odpověď. Bude nám smutno, oslavíme to spolu jindy.";
    thanks.hidden = false;
    thanks.focus();
  } catch {
    showError("Odpověď se nepodařilo odeslat. Zkuste to prosím znovu, nebo nám zavolejte (kontakt je níže).");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Odeslat odpověď";
  }
});

$("again").addEventListener("click", () => {
  thanks.hidden = true;
  form.hidden = false;
  $("name").focus();
});
