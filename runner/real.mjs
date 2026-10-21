// CARTERA REAL · Trading 212
// Sigue con dinero real el método que elijas del bot (sus pesos objetivo) en tu cuenta Invest de Trading 212.
// No necesita navegador: lee el estado del bot (rama data → state.json), consulta tu cuenta, calcula qué comprar/vender,
// y, según el modo, lo ejecuta (auto), lo deja propuesto para que lo apruebes en la web (confirmar) o solo lo anota (pausa).
// Guarda todo (valor diario, órdenes, informes y la propuesta pendiente) en la rama "real" → real.json (cifrado si hay REAL_VIEW_PASS).
//
// Uso: node real.mjs [normal | aprobar | rechazar | probar | foto | reanudar]   (PLAN_ID=… para aprobar/rechazar)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, appendFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadCfg } from "./real-cfg.mjs";

const env = (k) => (process.env[k] || "").trim();
const ACCION = (process.argv[2] || env("ACCION") || "normal").toLowerCase();
const EVENT = env("GITHUB_EVENT_NAME") || "local";
const ROOT = path.resolve(process.cwd(), "..");
const REPO = env("GITHUB_REPOSITORY"), TOKEN = env("GITHUB_TOKEN");
const SITE = REPO.includes("/") ? `https://${REPO.split("/")[0]}.github.io/${REPO.split("/")[1]}/` : "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const r2 = (n) => Math.round(n * 100) / 100;
const eur = (n) => (n == null || !Number.isFinite(+n) ? "—" : (+n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const pct = (n) => (n == null || !Number.isFinite(+n) ? "—" : (n > 0 ? "+" : "") + (+n).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%");
const qtyTxt = (q) => (+q).toLocaleString("es-ES", { maximumFractionDigits: 6 });

const NOMBRES = {
  sect: "Rotación de sectores (Faber)", sectx: "Rotación ampliada (sectores + QQQ + SMH + IWM)", trq: "Tendencia QQQ de 10 meses (Faber)",
  dmu: "Dual Momentum EE. UU. (QQQ, SPY, IWM, SMH)", mix: "Mezcla 50/50: sectores + QQQ en tendencia",
};
const DESC = {
  SPY: "S&P 500", QQQ: "Nasdaq 100", SMH: "Semiconductores", IWM: "Pequeñas empresas EE. UU.", XLK: "Sector tecnología", XLV: "Sector salud",
  XLE: "Sector energía", XLF: "Sector financiero", XLY: "Consumo discrecional", XLP: "Consumo básico", XLI: "Sector industrial", XLU: "Servicios públicos",
  XLB: "Materiales", XLC: "Comunicaciones", SHY: "Bonos EE. UU. 1-3 años", IEF: "Bonos EE. UU. 7-10 años", TLT: "Bonos EE. UU. 20+ años",
  AGG: "Bonos agregados EE. UU.", GLD: "Oro", EFA: "Desarrollados ex-EE. UU.", EEM: "Emergentes", URTH: "MSCI World", VNQ: "Inmobiliario EE. UU.", DIA: "Dow Jones",
};

// ---------- ETFs de EE. UU. → equivalentes UCITS (los ETFs de EE. UU. no se pueden comprar desde la UE) ----------
// Se buscan por nombre en la lista de instrumentos de TU cuenta de Trading 212 (por orden de preferencia).
function secPat(w) {
  return [new RegExp(`(?:${w}).*Select Sector|Select Sector.*(?:${w})`, "i"), new RegExp(`S&P 500 (?:Capped )?(?:${w})(?: Sector)?\\b`, "i")];
}
// Fondos UCITS conocidos y líquidos: si el nombre ya encaja, se prefieren a otros candidatos (nunca sustituyen la comprobación por nombre).
const ISIN_PREF = {
  SPY: ["IE00B5BMR087", "IE00B3XXRP09"], QQQ: ["IE00B53SZB19", "IE00BFZXGZ54", "IE0032077012"], SMH: ["IE00BMC38736"], IWM: ["IE00BJ38QD84"],
  XLK: ["IE00B3WJKG14"], XLV: ["IE00B43HR379"], XLE: ["IE00B42NKQ00"], XLF: ["IE00B4JNQZ49"], XLY: ["IE00B4MCHD36"], XLP: ["IE00B40B8R38"],
  XLI: ["IE00B4LN9N13"], XLU: ["IE00B4KBBD01"], XLB: ["IE00B4MKCJ84"], SHY: ["IE00B14X4S71"], GLD: ["IE00B4ND3602"], URTH: ["IE00B4L5Y983"],
};
const normName = (s) => String(s || "").replace(/U\.\s?S\.?/g, "US").replace(/\s+/g, " ");
const PAT = {
  SPY: [/^iShares Core S&P 500/i, /^Vanguard S&P 500/i, /SPDR S&P 500 UCITS/i, /S&P 500 UCITS/i],
  QQQ: [/EQQQ|Invesco.*Nasdaq[- ]?100/i, /iShares Nasdaq[- ]?100/i, /Nasdaq[- ]?100/i],
  SMH: [/VanEck Semiconductor/i, /Semiconductor/i],
  IWM: [/Russell 2000/i],
  // sectores: SPDR «S&P U.S. <Sector> Select Sector UCITS» o iShares «S&P 500 <Sector> Sector UCITS» (Trading 212 abrevia los nombres de formas distintas)
  XLK: secPat("Technology|Info(?:rmation)? ?Tech(?:nology)?"),
  XLV: secPat("Health ?Care"),
  XLE: secPat("Energy"),
  XLF: secPat("Financials?"),
  XLY: secPat("(?:Consumer )?Discretionary"),
  XLP: secPat("(?:Consumer )?Staples"),
  XLI: secPat("Industrials?"),
  XLU: secPat("Utilities"),
  XLB: secPat("Materials"),
  XLC: secPat("Communication(?:s| Services)?"),
  SHY: [/\$ Treasury Bond 1-3/i, /US Treasury 1-3/i],
  IEF: [/\$ Treasury Bond 7-10/i, /US Treasury 7-10/i],
  TLT: [/\$ Treasury Bond 20\+/i, /Treasury 20\+/i],
  AGG: [/US Aggregate Bond/i],
  GLD: [/Physical Gold/i],
  EFA: [/MSCI EAFE/i],
  EEM: [/Core MSCI EM IMI/i, /MSCI Emerging Markets UCITS/i],
  URTH: [/Core MSCI World/i, /MSCI World UCITS/i],
  VNQ: [/US Property Yield/i, /US Real Estate/i],
  DIA: [/Dow Jones Industrial Average/i],
};
const BAD = /Hedged|Leverag|Short|Daily|\b[23]x\b|Equal|ESG|SRI|Paris|Screened|Swap|Covered Call|Buffer/i;
const BASE_UNI = Object.keys(PAT);

// ---------- hora de Madrid ----------
function madrid(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, wk: !/^(Sat|Sun)$/.test(p.weekday), fri: p.weekday === "Fri", hm: `${p.hour}:${p.minute}` };
}

// ---------- cifrado (mismo formato que la web: PBKDF2 250 000 + AES-GCM) ----------
const b64 = (u) => Buffer.from(u).toString("base64"), unb64 = (t) => new Uint8Array(Buffer.from(t, "base64"));
async function kdf(pw, salt) {
  const k = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return webcrypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encrypt(txt, pw) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16)), iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, await kdf(pw, salt), new TextEncoder().encode(txt));
  return { s: b64(salt), i: b64(iv), c: b64(new Uint8Array(ct)) };
}
export async function decrypt(o, pw) {
  const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.i) }, await kdf(pw, unb64(o.s)), unb64(o.c));
  return new TextDecoder().decode(pt);
}

// ---------- git: leer y publicar ----------
function sh(cmd) { return execSync(cmd, { stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 30 }); }
function gitShow(branch, file) {
  if (env("LOCAL_" + branch.toUpperCase())) return readFileSync(env("LOCAL_" + branch.toUpperCase()), "utf8");   // pruebas locales
  if (!REPO || !TOKEN) throw new Error("sin repositorio/token (ejecución local)");
  sh(`git -C "${ROOT}" fetch -q --depth 1 https://x-access-token:${TOKEN}@github.com/${REPO}.git ${branch}`);
  return sh(`git -C "${ROOT}" show FETCH_HEAD:${file}`);
}
const SECRET_NAMES = ["T212_KEY", "T212_SECRET", "REAL_VIEW_PASS", "NTFY_TOPIC", "SMTP_USER", "SMTP_PASS", "EMAIL"];
function secretsMeta() { const o = {}; for (const k of SECRET_NAMES) o[k] = !!env(k); return o; }

async function loadReal() {
  let txt;
  try { txt = gitShow("real", "real.json"); } catch (e) { log("Todavía no hay historial de la cartera real (rama real): se empieza de cero."); return freshReal(); }
  let j = JSON.parse(txt);
  if (j.enc) {
    if (!env("REAL_VIEW_PASS")) throw new Error("El historial de la cartera real está cifrado y falta el secreto REAL_VIEW_PASS. Vuelve a ponerlo (el mismo de antes).");
    try { j = JSON.parse(await decrypt(j, env("REAL_VIEW_PASS"))); } catch { throw new Error("No puedo descifrar el historial de la cartera real: REAL_VIEW_PASS no es la misma clave que se usó al guardarlo."); }
  }
  return Object.assign(freshReal(), j);
}
function freshReal() { return { v: 1, created: new Date().toISOString(), days: [], orders: [], reports: [], plan: null, planHist: [], map: {}, inst: null, paused: null, botTickers: [], last: null, lastNormal: null, account: null, positions: [], deposits: null, cfg: null }; }

async function publishReal(R) {
  R.savedAt = Date.now();
  R.reports = R.reports.slice(0, 300).map((x, i) => (i > 120 && x.md && x.md.length > 20000 ? { ...x, md: x.md.slice(0, 20000) + "\n\n[… recortado por antigüedad]\n" } : x));
  R.orders = R.orders.slice(0, 2000); R.planHist = (R.planHist || []).slice(0, 100);
  const plain = JSON.stringify(R);
  const pw = env("REAL_VIEW_PASS");
  const out = pw ? JSON.stringify({ enc: 1, v: 1, savedAt: R.savedAt, meta: { secrets: secretsMeta() }, ...(await encrypt(plain, pw)) }) : JSON.stringify({ ...R, meta: { secrets: secretsMeta() } });
  const local = path.join(process.cwd(), "real.json");
  writeFileSync(local, out);
  if (!REPO || !TOKEN) { log("Ejecución local: guardado en", local); return; }
  const pub = path.join(process.cwd(), ".pubreal");
  rmSync(pub, { recursive: true, force: true }); mkdirSync(pub);
  writeFileSync(path.join(pub, "real.json"), out);
  const g = (c) => sh(`git -C "${pub}" ${c}`);
  g("init -q -b real"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"');
  g("add real.json"); g(`commit -q -m "cartera real ${new Date().toISOString()}"`);
  for (let i = 0; i < 3; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git real`); break; } catch (e) { if (i === 2) throw e; await sleep(4000); } }
  log(`Cartera real publicada (${(out.length / 1024).toFixed(0)} KB${pw ? ", cifrada" : ", SIN cifrar: pon REAL_VIEW_PASS para que no se vea en la web pública"})`);
}

// ---------- estado del bot (rama data) ----------
function loadBot() {
  let snap;
  try { snap = JSON.parse(gitShow("data", "state.json")); } catch (e) { return { err: "no pude leer el estado del bot (rama data): " + String(e.message).split("\n")[0].slice(0, 160) }; }
  let best = null;
  for (const db of Object.values(snap.idb || {})) {
    const kv = db && db.stores && db.stores.kv;
    if (kv) for (const [k, v] of kv.rows || []) if (k === "S" && v && typeof v === "object" && (!best || (v.savedAt || 0) > (best.savedAt || 0))) best = v;
  }
  try { const a = snap.ls && snap.ls.pb19 ? JSON.parse(snap.ls.pb19) : null; if (a && (!best || (a.savedAt || 0) > (best.savedAt || 0))) best = a; } catch {}
  if (!best) return { err: "el estado del bot no tiene cartera todavía (espera a la primera actualización diaria)" };
  return { S: best };
}

// ---------- Trading 212 ----------
function t212(which) {
  const base = env("T212_BASE") || (which === "demo" ? "https://demo.trading212.com/api/v0" : "https://live.trading212.com/api/v0");
  const key = env("T212_KEY"), sec = env("T212_SECRET");
  const auth = sec ? "Basic " + Buffer.from(key + ":" + sec).toString("base64") : key;
  let calls = 0;
  async function call(method, p, body) {
    for (let a = 0; ; a++) {
      let r;
      calls++;
      try {
        r = await fetch(base + p, { method, headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
      } catch (e) {
        if (method === "GET" && a < 3) { await sleep(3000 * (a + 1)); continue; }
        const er = new Error(`sin respuesta de Trading 212 (${method} ${p}): ${String(e.message).slice(0, 120)}`); er.net = true; throw er;
      }
      // 429 = límite de peticiones: la orden NO se ha procesado, así que reintentar es seguro también para órdenes
      if (r.status === 429 && a < 6) {
        const reset = +r.headers.get("x-ratelimit-reset"), w = reset ? reset * 1000 - Date.now() + 700 : 6000 * (a + 1);
        log(`Límite de peticiones de Trading 212 en ${p}: espero ${Math.round(Math.max(1000, Math.min(w, 70000)) / 1000)} s`);
        await sleep(Math.max(1000, Math.min(w, 70000))); continue;
      }
      if (r.status >= 500 && method === "GET" && a < 3) { await sleep(5000 * (a + 1)); continue; }
      const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
      if (!r.ok) { const er = new Error(`Trading 212 respondió HTTP ${r.status} en ${method} ${p}: ${txt.slice(0, 300)}`); er.st = r.status; er.body = txt; throw er; }
      return j;
    }
  }
  async function pages(p, max = 10) {
    const out = []; let next = p;
    for (let i = 0; i < max && next; i++) {
      const j = await call("GET", next);
      out.push(...((j && j.items) || []));
      next = j && j.nextPagePath ? String(j.nextPagePath).replace(/^\/api\/v0/, "") : null;
    }
    return out;
  }
  return { call, pages, base, get calls() { return calls; } };
}
function explainT212(e) {
  const s = e && e.st;
  if (s === 401) return "Trading 212 rechaza las claves (HTTP 401): revisa T212_KEY y T212_SECRET, y que sean del entorno elegido (real o demo).";
  if (s === 403) return "La clave de Trading 212 no tiene permiso para esto (HTTP 403). Al crearla marca: Account data, Portfolio, Orders (read y execute), History y Metadata.";
  return String((e && e.message) || e).slice(0, 400);
}

// ---------- precios para calcular cuántas participaciones comprar ----------
const YH = env("YH_BASE") || "https://query1.finance.yahoo.com";
const SUF = { d: ".DE", l: ".L", a: ".AS", p: ".PA", m: ".MI", s: ".SW", e: ".MC", b: ".BR" };
function yahooSym(t) {
  let m = String(t).match(/^(.+?)_US_EQ$/); if (m) return m[1].replace(/_/g, "-");
  m = String(t).match(/^(.+?)([a-z])_EQ$/); if (m && SUF[m[2]]) return m[1] + SUF[m[2]];
  return null;
}
async function yahoo(sym) {
  let r = null;
  for (const host of [YH, "https://query2.finance.yahoo.com"]) {
    for (let a = 0; a < 2; a++) {
      try { r = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0 (bot-trading)" }, signal: AbortSignal.timeout(20000) }); } catch { r = null; }
      if (r && r.ok) break;
      await sleep(1500 * (a + 1));
    }
    if (r && r.ok) break;
  }
  if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "sin respuesta"));
  const j = await r.json(), m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error("sin precio");
  return { px: +m.regularMarketPrice, cur: m.currency, t: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null };
}
async function fxRates() {
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,CHF", { signal: AbortSignal.timeout(15000) });
    const j = await r.json(); const o = { EUR: 1, ...j.rates }; if (o.GBP) o.GBX = o.GBP * 100; return o;
  } catch { return { EUR: 1 }; }
}

// ---------- mapeo símbolos del bot → instrumentos de Trading 212 ----------
function resolveMap(insts, syms, A) {
  const byT = new Map(insts.map((i) => [i.ticker, i])), out = {};
  for (const sym of syms) {
    const man = A.mapa && A.mapa[sym];
    if (man === "-") { out[sym] = { sym, t: null, why: "desactivado a mano en los ajustes" }; continue; }
    if (man) { const i = byT.get(man); out[sym] = i ? pick(sym, i, "elegido a mano") : { sym, t: null, why: `el ticker «${man}» que pusiste a mano no existe en tu cuenta` }; continue; }
    if (PAT[sym]) {
      const cands = [];
      insts.forEach((i) => {
        const nm = normName(i.name);
        if (i.type !== "ETF" || BAD.test(nm)) return;
        const k = PAT[sym].findIndex((re) => re.test(nm)); if (k < 0) return;
        let sc = 1000 - k * 100;
        if ((ISIN_PREF[sym] || []).includes(i.isin)) sc += 150;
        if (i.currencyCode === "EUR") sc += 60;
        if (/d_EQ$/.test(i.ticker)) sc += 20;
        if (/\bAcc\b|Accumulat/i.test(i.name || "")) sc += 10;
        if (/\bDist\b/i.test(i.name || "")) sc -= 5;
        cands.push([sc, i]);
      });
      cands.sort((a, b) => b[0] - a[0]);
      const eurC = cands.filter((c) => c[1].currencyCode === "EUR");
      const best = A.divisa === "eur" ? eurC[0] : cands[0];
      if (best) out[sym] = pick(sym, best[1], "equivalente UCITS" + (cands.length > 1 ? ` (de ${cands.length} candidatos)` : ""));
      else out[sym] = { sym, t: null, why: cands.length ? `solo cotiza en ${[...new Set(cands.map((c) => c[1].currencyCode))].join("/")}: pon «Divisa: cualquiera» en los ajustes para permitirlo` : "no hay un equivalente UCITS en tu cuenta de Trading 212" };
      continue;
    }
    // acción de EE. UU.
    if (!A.acciones) { out[sym] = { sym, t: null, why: "acciones desactivadas en los ajustes" }; continue; }
    const i = byT.get(sym.replace(/[.\-]/g, "_") + "_US_EQ");
    out[sym] = i ? pick(sym, i, "acción de EE. UU.") : { sym, t: null, why: "no está en Trading 212" };
    if (i && A.divisa === "eur") { out[sym] = { sym, t: null, why: "cotiza en $ y tienes «Divisa: solo euros»", cand: i.ticker }; }
  }
  return out;
}
function pick(sym, i, why) { return { sym, t: i.ticker, name: i.name || i.shortName || i.ticker, short: i.shortName || "", cur: i.currencyCode, isin: i.isin || "", type: i.type, ext: !!i.extendedHours, why }; }

// ---------- plan: qué comprar y vender para parecerse al método ----------
export function makePlan({ A, R, bot, account, positions, pending, map, now }) {
  const notas = [], orders = [], m = madrid(now);
  const S = bot.S, key = A.metodo || S.main || "sect", B = (S.books || {})[key];
  if (!B) return { block: `el método «${key}» no tiene cartera en el bot (¿lo han quitado?). Elige otro en los ajustes de la cartera real.` };
  const tgt = B.tgt;
  if (!tgt || !tgt.w) return { block: `el método «${NOMBRES[key] || key}» todavía no ha calculado su cartera objetivo` };
  const age = S.lastDate ? (now - Date.parse(S.lastDate + "T22:00:00Z")) / 864e5 : 99;
  if (age > 5) return { block: `los datos del bot son del ${S.lastDate || "—"} (hace ${Math.floor(age)} días): no opero con datos viejos. Revisa la actualización diaria.` };

  const managedSet = new Set([...Object.values(map).map((x) => x.t).filter(Boolean), ...(R.botTickers || [])]);
  const mine = positions.filter((p) => managedSet.has(p.instrument && p.instrument.ticker));
  const others = positions.filter((p) => !managedSet.has(p.instrument && p.instrument.ticker));
  const val = (p) => +((p.walletImpact && p.walletImpact.currentValue) || 0);
  const managedVal = mine.reduce((t, p) => t + val(p), 0);
  const cash = +((account.cash && account.cash.availableToTrade) || 0);
  const base = managedVal + cash;
  const presupuesto = managedVal > A.limite ? Math.min(base, managedVal) : Math.min(base, A.limite);
  const invest = presupuesto * (1 - A.reserva / 100);
  const thr = Math.max(A.minOrden, (A.umbral / 100) * invest);
  if (others.length) notas.push(`Hay ${others.length} posición(es) en tu cuenta que el bot no toca: ${others.map((p) => p.instrument.ticker).join(", ")}.`);
  const pend = new Set((pending || []).map((o) => o.ticker || (o.instrument && o.instrument.ticker)));
  // «Como la simulación»: si esta cartera objetivo ya se aplicó, no se reajusta por pequeñas desviaciones de precio
  // (la simulación solo reajusta cuando el método revisa su cartera). Sí se compra lo que falte y se invierte el dinero nuevo.
  const yaAplicada = A.reajuste !== "desvio" && R.applied && R.applied.metodo === key && R.applied.tgtD === (tgt.d || null);
  if (yaAplicada) notas.push(`La cartera objetivo del ${tgt.d || "—"} ya está aplicada: hasta la próxima revisión del método solo se compra lo que falte o el dinero nuevo (como en la simulación).`);

  // objetivo en € por ticker de Trading 212
  const objetivo = [], tv = {}, symOf = {};
  for (const [sym, w] of Object.entries(tgt.w)) {
    if (!(w > 0)) continue;
    const mp = map[sym] || { t: null, why: "sin buscar todavía" };
    objetivo.push({ sym, w: +w, t: mp.t, name: mp.name || "", why: (tgt.why && tgt.why[sym]) || "", disp: mp.t ? "" : mp.why });
    if (!mp.t) { notas.push(`${sym} (${(w * 100).toFixed(0)}% del método) no se puede comprar: ${mp.why}. Esa parte se queda en efectivo.`); continue; }
    tv[mp.t] = (tv[mp.t] || 0) + w * invest; symOf[mp.t] = sym;
  }
  for (const [sym, mp] of Object.entries(map)) if (mp.t && !symOf[mp.t]) symOf[mp.t] = sym;

  // ventas primero
  for (const p of mine) {
    const t = p.instrument.ticker, cur = val(p), q = +p.quantityAvailableForTrading || 0, goal = tv[t] || 0;
    if (pend.has(t)) { notas.push(`${t} tiene una orden pendiente en Trading 212: no se toca hasta que se resuelva.`); continue; }
    if (!(q > 0)) continue;
    if (goal <= 0) {
      if (cur < 1) { notas.push(`${t}: resto de ${eur(cur)} demasiado pequeño para vender.`); continue; }
      orders.push({ side: "VENTA", t, sym: symOf[t] || "", name: p.instrument.name || "", qty: q, full: true, eur: r2(cur), why: `ya no está en la cartera del método${tgt.bull === false ? " (el método está fuera del mercado)" : ""}` });
    } else if (!yaAplicada && cur - goal > thr) {
      const sell = cur - goal, left = cur - sell;
      const full = left < A.minOrden;
      orders.push({ side: "VENTA", t, sym: symOf[t] || "", name: p.instrument.name || "", qty: full ? q : Math.floor((q * sell) / cur * 1e4) / 1e4, full, eur: r2(full ? cur : sell), why: `reduce a su peso objetivo (${eur(goal)} de ${eur(cur)})` });
    }
  }
  // compras
  const sells = orders.reduce((t, o) => t + o.eur, 0);
  let freeCash = cash + sells - presupuesto * (A.reserva / 100) - (base > presupuesto ? base - presupuesto : 0);
  freeCash = Math.min(freeCash, cash + sells);
  const buys = [];
  for (const [t, goal] of Object.entries(tv)) {
    if (pend.has(t)) continue;
    const p = mine.find((x) => x.instrument.ticker === t), cur = p ? val(p) : 0, diff = goal - cur;
    if (diff > thr || (!p && diff >= A.minOrden)) buys.push({ side: "COMPRA", t, sym: symOf[t], name: (Object.values(map).find((x) => x.t === t) || {}).name || "", eur: r2(diff), why: (tgt.why && tgt.why[symOf[t]]) || "está en la cartera objetivo del método" });
  }
  buys.sort((a, b) => b.eur - a.eur);
  for (const b of buys) {
    const amt = Math.min(b.eur, freeCash);
    if (amt < A.minOrden) { if (!yaAplicada || !mine.some((x) => x.instrument.ticker === b.t)) notas.push(`${b.t}: faltan ${eur(b.eur)} pero solo quedan ${eur(Math.max(0, freeCash))} libres (mínimo por orden ${eur(A.minOrden)}).`); continue; }
    orders.push({ ...b, eur: r2(amt) }); freeCash -= amt;
  }
  let cut = 0;
  while (orders.length > A.maxOrdenes) { orders.pop(); cut++; }
  if (cut) notas.push(`Se han dejado ${cut} órdenes para la próxima ejecución (máximo ${A.maxOrdenes} por vez).`);
  const firma = orders.map((o) => o.side + ":" + o.t).sort().join("|");
  return { plan: { id: m.date.replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 7), ts: now.toISOString(), d: m.date, metodo: key, metodoNombre: NOMBRES[key] || key, tgtD: tgt.d || null, yaAplicada: !!yaAplicada, bull: tgt.bull !== false, datos: S.lastDate || null, presupuesto: r2(presupuesto), invertible: r2(invest), umbral: r2(thr), cash: r2(cash), gestionado: r2(managedVal), orders, notas, objetivo, firma, estado: orders.length ? "pendiente" : "sin-cambios" } };
}

// ---------- ejecución de órdenes (a mercado) ----------
async function placeMarket(T, t, qty, ext, rep, dec0) {
  let q = qty, dec = dec0 != null ? dec0 : 4;
  const fmt = (x, d) => Math.floor(x * 10 ** d) / 10 ** d;
  for (let a = 0; a < 7; a++) {
    const qq = q > 0 ? fmt(q, dec) : -fmt(-q, dec);
    if (!qq) return { ok: false, err: `cantidad demasiado pequeña (${qty})` };
    try {
      const o = await T.call("POST", "/equity/orders/market", { ticker: t, quantity: qq, extendedHours: !!ext });
      return { ok: true, o, qty: qq, dec };
    } catch (e) {
      const b = String(e.body || e.message || "");
      // 400 = Trading 212 no la ha aceptado (no se ha enviado nada): se puede corregir y reintentar
      if (e.st === 400 && /precision/i.test(b) && dec > 0) { const m = b.match(/precision\D{0,12}(\d)/i); dec = m && +m[1] < dec ? +m[1] : dec - 1; rep.push(`  · ${t}: Trading 212 pide menos decimales; reintento con ${dec}`); continue; }
      if (e.st === 400 && /insufficient|not enough|funds|balance/i.test(b) && q > 0 && a < 3) { q = q * 0.97; rep.push(`  · ${t}: no llega el efectivo por el precio; reintento con un 3% menos`); continue; }
      if (e.net || e.st === 408) {
        // respuesta perdida: puede que SÍ se haya enviado. No se repite a ciegas: se comprueba.
        await sleep(4000);
        try {
          const act = await T.call("GET", "/equity/orders");
          const f = (act || []).find((o) => (o.ticker || (o.instrument && o.instrument.ticker)) === t);
          if (f) return { ok: true, o: f, qty: qq, dudosa: true };
          const h = await T.call("GET", `/equity/history/orders?ticker=${encodeURIComponent(t)}&limit=5`);
          const g = ((h && h.items) || []).find((x) => x.order && Date.now() - Date.parse(x.order.createdAt) < 5 * 60e3);
          if (g) return { ok: true, o: g.order, qty: qq, dudosa: true };
        } catch {}
        return { ok: false, err: "no hubo respuesta de Trading 212 y no aparece la orden. NO se reintenta para no duplicarla: revísalo en la app.", dudosa: true };
      }
      return { ok: false, err: explainT212(e) };
    }
  }
  return { ok: false, err: "Trading 212 no aceptó la cantidad tras varios intentos" };
}
async function waitFill(T, o, maxS = 75) {
  const id = o && o.id; if (!id) return { status: o && o.status, filledQuantity: o && o.filledQuantity };
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    await sleep(2500);
    try { const x = await T.call("GET", "/equity/orders/" + id); if (x && /CANCEL|REJECT/.test(x.status)) return { status: x.status }; continue; }
    catch (e) { if (e.st !== 404) continue; }
    // ya no está pendiente: buscar el resultado en el historial
    try {
      const h = await T.call("GET", `/equity/history/orders?ticker=${encodeURIComponent(o.ticker || (o.instrument && o.instrument.ticker))}&limit=10`);
      const it = ((h && h.items) || []).find((x) => x.order && x.order.id === id);
      if (it) return { status: it.order.status, filledQuantity: it.order.filledQuantity, price: it.fill && it.fill.price, net: it.fill && it.fill.walletImpact && it.fill.walletImpact.netValue, fx: it.fill && it.fill.walletImpact && it.fill.walletImpact.fxRate, taxes: it.fill && it.fill.walletImpact && it.fill.walletImpact.taxes };
      return { status: "FILLED?", nota: "ya no está pendiente pero aún no aparece en el historial" };
    } catch { return { status: "DESCONOCIDO" }; }
  }
  return { status: "PENDIENTE", nota: "sigue pendiente (¿mercado cerrado?): se ejecutará cuando abra" };
}
let REAL_ORDERS = [];
async function priceOf(t, map, positions, fx) {
  const pos = positions.find((p) => p.instrument && p.instrument.ticker === t);
  const inst = Object.values(map).find((x) => x.t === t) || {};
  const cur = inst.cur || (pos && pos.instrument.currency) || "EUR";
  if (pos && pos.currentPrice > 0) return { px: +pos.currentPrice, cur, src: "Trading 212 (posición)" };
  const ys = yahooSym(t);
  if (ys) { try { const y = await yahoo(ys); if (!y.cur || y.cur === cur || (cur === "GBX" && /GBp/i.test(y.cur))) return { px: y.px, cur, src: "Yahoo " + ys }; } catch (e) { log("Yahoo", ys, e.message); } }
  if (inst.isin) {
    try {
      const r = await fetch(`${YH}/v1/finance/search?q=${encodeURIComponent(inst.isin)}&quotesCount=8&newsCount=0`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      for (const q of (j.quotes || []).slice(0, 6)) { try { const y = await yahoo(q.symbol); if (y.cur === cur) return { px: y.px, cur, src: "Yahoo " + q.symbol }; } catch {} }
    } catch {}
  }
  // segunda fuente sin clave: Stooq (cotizaciones europeas con sufijo .de, .uk…)
  if (ys) {
    const st = ys.replace(/\.DE$/i, ".de").replace(/\.L$/i, ".uk").replace(/\.(AS|PA|MI|SW|MC|BR)$/i, (x) => x.toLowerCase());
    try {
      const r = await fetch(`${env("STOOQ_BASE") || "https://stooq.com"}/q/l/?s=${encodeURIComponent(st.toLowerCase())}&f=sd2t2c&h&e=csv`, { signal: AbortSignal.timeout(15000) });
      const row = (await r.text()).trim().split("\n")[1] || "", c = +row.split(",")[4];
      if (r.ok && c > 0 && !(cur === "GBX" && /\.uk$/.test(st) && c < 5)) return { px: c, cur, src: "Stooq " + st };
    } catch (e) { log("Stooq", st, e.message); }
  }
  // último recurso: el precio de la última orden ejecutada de ese ETF (máx. 10 días); se compra un 3% menos por si ha subido
  const lastO = (REAL_ORDERS || []).find((o) => o.t === t && o.px > 0 && /ejecutada/.test(o.estado) && Date.now() - Date.parse(o.ts) < 10 * 864e5);
  if (lastO) return { px: lastO.px * 1.03, cur, src: `última orden del ${String(lastO.ts).slice(0, 10)} (+3% de margen)` };
  return null;
}
async function execute(T, A, R, plan, ctx, rep) {
  const res = [], m = madrid();
  REAL_ORDERS = R.orders || [];
  const ordered = [...plan.orders.filter((o) => o.side === "VENTA"), ...plan.orders.filter((o) => o.side === "COMPRA")];
  let positions = ctx.positions, fx = null, sellsDone = false;
  for (const o of ordered) {
    const inst = Object.values(ctx.map).find((x) => x.t === o.t) || {};
    const us = /_US_EQ$/.test(o.t);
    const skip = (estado, err) => { res.push({ ...o, estado, err }); rep.push(`- ${o.side} ${o.t}: ${estado} · ${err}`); };
    if (us && (m.min < 15 * 60 + 35 || m.min > 21 * 60 + 55)) { skip("aplazada", "acción de EE. UU.: se envía con la bolsa de Nueva York abierta (15:35-21:55 hora de España)"); continue; }
    if (o.side === "COMPRA" && !sellsDone) {
      sellsDone = true;
      if (res.some((x) => x.side === "VENTA")) {
        try { const a = await T.call("GET", "/equity/account/summary"); ctx.account = a; positions = await T.call("GET", "/equity/positions"); ctx.positions = positions; } catch (e) { rep.push("  · no pude refrescar el efectivo tras las ventas: " + explainT212(e)); }
      }
    }
    let qty;
    if (o.side === "VENTA") qty = -o.qty;
    else {
      const cashNow = +((ctx.account.cash && ctx.account.cash.availableToTrade) || 0) - res.filter((x) => x.side === "COMPRA" && x.estado !== "error").reduce((t, x) => t + (x.eurReal || x.eur || 0), 0);
      const amt = Math.min(o.eur, cashNow - 0.3);
      if (amt < A.minOrden) { skip("omitida", `solo hay ${eur(Math.max(0, cashNow))} libres`); continue; }
      if (!fx && inst.cur && inst.cur !== "EUR") fx = await fxRates();
      const pr = await priceOf(o.t, ctx.map, positions, fx);
      if (!pr) { skip("omitida", "no encontré un precio fiable para calcular las participaciones"); continue; }
      const rate = pr.cur === "EUR" ? 1 : fx && fx[pr.cur];
      if (!rate) { skip("omitida", "no tengo el cambio € → " + pr.cur); continue; }
      qty = (amt * rate * 0.99) / pr.px;
      o.pxEst = pr.px; o.pxSrc = pr.src; o.eur = r2(amt);
    }
    rep.push(`- Enviando ${o.side} ${o.t} · ${qtyTxt(Math.floor(Math.abs(qty) * 1e4) / 1e4)} participaciones${o.side === "COMPRA" ? ` (~${eur(o.eur)} a ${o.pxEst} ${inst.cur || ""}, precio de ${o.pxSrc})` : ""}`);
    R.prec = R.prec || {};
    const p = await placeMarket(T, o.t, qty, false, rep, R.prec[o.t]);
    if (p.ok && p.dec != null) R.prec[o.t] = p.dec;
    if (!p.ok) { res.push({ ...o, estado: "error", err: p.err }); rep.push("  ✖ " + p.err); continue; }
    const f = await waitFill(T, p.o);
    const filled = /FILLED/.test(String(f.status));
    const r = { ...o, id: p.o.id, qtyEnv: Math.abs(p.qty), estado: filled ? "ejecutada" : String(f.status || "enviada").toLowerCase(), fillQty: f.filledQuantity, fillPx: f.price, eurReal: f.net != null ? Math.abs(+f.net) : null, nota: f.nota || (p.dudosa ? "confirmada tras perder la respuesta" : "") };
    res.push(r);
    rep.push(`  ${filled ? "✔" : "·"} ${r.estado}${f.price ? ` a ${f.price}` : ""}${r.eurReal != null ? ` · ${eur(r.eurReal)}` : ""}${r.nota ? ` · ${r.nota}` : ""}`);
    if (o.side === "COMPRA" && !R.botTickers.includes(o.t)) R.botTickers.push(o.t);
  }
  return res;
}

// ---------- avisos (móvil y correo) ----------
async function ntfy(title, msg, prio = 3, tags = []) {
  const topic = env("NTFY_TOPIC"); if (!topic) return "✖ falta NTFY_TOPIC";
  try {
    const body = { topic, title, message: String(msg).slice(0, 3500), priority: prio, tags, ...(SITE ? { click: SITE + "#real" } : {}) };
    const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok ? "✔ enviado al móvil" : "✖ ntfy HTTP " + r.status;
  } catch (e) { return "✖ ntfy: " + String(e.message).slice(0, 100); }
}
async function mail(subject, text) {
  const user = env("SMTP_USER"), pass = env("SMTP_PASS");
  if (!user || !pass) return "✖ correo sin configurar (SMTP_USER / SMTP_PASS)";
  try {
    const { default: nodemailer } = await import("nodemailer");
    const port = +env("SMTP_PORT") || 465;
    const tr = nodemailer.createTransport({ host: env("SMTP_HOST") || "smtp.gmail.com", port, secure: port === 465, auth: { user, pass } });
    await tr.sendMail({ from: `"Bot Trading · Cartera real" <${user}>`, to: env("EMAIL") || user, subject, text: String(text).slice(0, 20000) });
    return "✔ correo enviado";
  } catch (e) { return "✖ correo: " + String(e.message).slice(0, 120); }
}

// ---------- informe ----------
function mapTable(map) {
  const L = ["| Señal del bot | Se compra en Trading 212 | Divisa | Motivo |", "|---|---|---|---|"];
  for (const x of Object.values(map).sort((a, b) => a.sym.localeCompare(b.sym))) L.push(`| ${x.sym} (${DESC[x.sym] || "acción"}) | ${x.t ? `${x.t} · ${x.name}` : "✖ no disponible"} | ${x.cur || "—"} | ${x.why || ""} |`);
  return L.join("\n");
}
function planMd(p) {
  const L = [`- Método: **${p.metodoNombre}** · cartera objetivo del ${p.tgtD || "—"} · datos del bot del ${p.datos || "—"}${p.bull ? "" : " · el método está FUERA del mercado"}`,
    `- Presupuesto del bot: ${eur(p.presupuesto)} (invertible ${eur(p.invertible)}; se deja una reserva en efectivo) · efectivo libre ${eur(p.cash)} · ya invertido por el bot ${eur(p.gestionado)}`,
    `- Solo se reajusta una posición si se desvía más de ${eur(p.umbral)}.`, "", "### Cartera objetivo del método"];
  for (const o of p.objetivo) L.push(`- ${o.sym} ${(o.w * 100).toFixed(1)}% → ${o.t ? o.t : "✖ " + o.disp}${o.why ? " · " + o.why : ""}`);
  if (!p.objetivo.length) L.push("- (vacía: todo en efectivo)");
  L.push("", `### Órdenes (${p.orders.length})`);
  for (const o of p.orders) L.push(`- ${o.side === "COMPRA" ? "🟢 COMPRAR" : "🔴 VENDER"} ${o.t}${o.sym ? ` (señal ${o.sym})` : ""} · ${o.side === "VENTA" ? qtyTxt(o.qty) + " participaciones" + (o.full ? " (todo)" : "") + " · ≈ " : "≈ "}${eur(o.eur)} · ${o.why}`);
  if (!p.orders.length) L.push("- Ninguna: la cartera ya se parece a la del método.");
  if (p.notas.length) { L.push("", "### Notas"); p.notas.forEach((n) => L.push("- " + n)); }
  return L.join("\n");
}

// ---------- resumen (va al final de cada informe) y comparación con la simulación del mismo método ----------
export function simCompare(R, S, key) {
  const B = S && S.books && S.books[key], days = (R.days || []).filter((x) => x.v > 0);
  if (!B || !B.days || !B.days.length || !days.length) return null;
  const d0 = days[0].d, e = B.days, at = (d) => { let v = null; for (const x of e) { if (x.d <= d) v = x.eq; else break; } return v; };
  const e0 = at(d0) ?? e[0].eq, e1 = e[e.length - 1].eq;
  return e0 > 0 ? { d0, ret: (e1 / e0 - 1) * 100, hasta: e[e.length - 1].d } : null;
}
export function resumen(R, S, A) {
  const days = (R.days || []).filter((x) => x.v > 0), last = days[days.length - 1];
  if (!last) return null;
  const ap = last.ap != null ? last.ap : (R.deposits && R.deposits.net), d0 = days[0].d;
  let pk = -Infinity, dd = 0;
  for (const x of days) { const r = x.ap > 0 ? x.v / x.ap : null; if (r == null) continue; pk = Math.max(pk, r); dd = Math.min(dd, r / pk - 1); }
  const prev = days.length > 1 ? days[days.length - 2] : null;
  const ex = (R.orders || []).filter((o) => o.estado === "ejecutada");
  const key = (A && A.metodo) || (S && S.main) || "sect", sim = S ? simCompare(R, S, key) : null;
  return { d0, ap, v: last.v, res: ap != null ? last.v - ap : null, pct: ap > 0 ? (last.v / ap - 1) * 100 : null, dia: prev ? last.v - prev.v : null, dd: dd * 100, nOrd: ex.length, key, sim, cash: last.cash, inv: last.inv };
}
function resumenMd(R, S, A) {
  const x = resumen(R, S, A);
  if (!x) return "";
  const L = ["", "## Resumen de la cartera real", "",
    `- Desde el ${x.d0}: aportado ${eur(x.ap)} · vale ${eur(x.v)} · resultado **${x.res != null ? (x.res >= 0 ? "+" : "") + eur(x.res) : "—"} (${pct(x.pct)})**`,
    `- Último día: ${x.dia != null ? (x.dia >= 0 ? "+" : "") + eur(x.dia) : "—"} · peor caída desde el máximo: ${pct(x.dd)} · órdenes ejecutadas: ${x.nOrd}`,
    `- Efectivo ${eur(x.cash)} · invertido ${eur(x.inv)}`];
  if (x.sim && (R.days || []).length > 1) L.push(`- Mismo método en la simulación desde el ${x.sim.d0}: ${pct(x.sim.ret)} · real: ${pct(x.pct)} → diferencia ${pct((x.pct || 0) - x.sim.ret)} (precio, UCITS en vez del ETF de EE. UU., cambio €/$ y momento de ejecución)`);
  return L.join("\n");
}
function semanaMd(R, S, A, m) {
  const days = (R.days || []).filter((x) => x.v > 0), t0 = Date.parse(m.date) - 7 * 864e5;
  const wk = days.filter((x) => Date.parse(x.d) > t0), first = days.filter((x) => Date.parse(x.d) <= t0).pop() || wk[0], last = days[days.length - 1];
  const ords = (R.orders || []).filter((o) => Date.parse(o.ts) > t0);
  const L = [`## Semana del ${new Date(t0 + 864e5).toISOString().slice(0, 10)} al ${m.date}`, ""];
  if (first && last) {
    const flow = (last.ap || 0) - (first.ap || 0), g = last.v - first.v - flow;
    L.push(`- Valor: ${eur(first.v)} → ${eur(last.v)}${flow ? ` (aportaste ${eur(flow)})` : ""} · resultado de la semana **${g >= 0 ? "+" : ""}${eur(g)}** (${pct(first.v > 0 ? (g / first.v) * 100 : 0)})`);
  }
  L.push(`- Órdenes esta semana: ${ords.length}${ords.length ? "" : " (ninguna: el método no ha cambiado su cartera)"}`);
  ords.forEach((o) => L.push(`  - ${o.d} ${o.side === "COMPRA" ? "🟢" : "🔴"} ${o.side} ${o.t}${o.sym ? " (" + o.sym + ")" : ""} · ${eur(o.eur)} · ${o.estado}${o.err ? " · " + o.err : ""}`));
  L.push("", "### Lo que tienes ahora");
  (R.positions || []).forEach((p) => L.push(`- ${p.t} · ${p.name || ""} · ${qtyTxt(p.q)} participaciones · vale ${eur(p.val)} · ${p.pnl >= 0 ? "+" : ""}${eur(p.pnl)}`));
  if (!(R.positions || []).length) L.push("- Nada: todo en efectivo.");
  return L.join("\n");
}

// ---------- programa principal ----------
async function main() {
  const A = loadCfg(path.join(ROOT, "real-ajustes.json"));
  const now = new Date(), m = madrid(now);
  let R;
  try { R = await loadReal(); } catch (e) { if (A.on || EVENT !== "schedule") await ntfy("✖ Cartera real: error", String(e.message), 4); throw e; }
  R.cfg = A;
  const rep = [], head = [];
  let botC = null;
  const getBot = () => botC || (botC = loadBot());
  let estado = "ok", titulo = "", aviso = null;   // aviso = {title, msg, prio}
  const scheduled = EVENT === "schedule";
  const tipo = ACCION;

  if (scheduled && !A.on) { log("Cartera real desactivada en los ajustes: nada que hacer."); return; }
  if (scheduled && tipo === "normal") {
    if (!m.wk || m.min < 9 * 60 + 5 || m.min > 21 * 60 + 55) { log(`Fuera del horario de la cartera real (${m.hm} en Madrid).`); return; }
    if (R.lastNormal === m.date) { log(R.plan && R.plan.estado === "pendiente" ? "Hay una propuesta pendiente de hoy: se espera a que la apruebes o la rechaces en la web." : "La revisión de hoy ya está hecha."); return; }
  }
  if (scheduled && tipo === "foto" && R.days.some((x) => x.d === m.date && x.foto)) { log("La foto de hoy ya está hecha."); return; }

  head.push(`# Cartera real · ${tipo} · ${m.date} ${m.hm} (hora de España)`, "", `- Entorno: **${A.env === "demo" ? "DEMO (dinero de práctica)" : "REAL (dinero de verdad)"}** · modo: **${{ confirmar: "con confirmación", auto: "automático", pausa: "en pausa (solo mira)" }[A.modo]}** · ${A.on ? "activada" : "DESACTIVADA"}`, `- Lanzado: ${scheduled ? "programado" : EVENT === "workflow_dispatch" ? "a mano / desde la web" : EVENT}`);

  try {
    if (tipo === "rechazar") {
      if (R.plan && R.plan.estado === "pendiente" && (!env("PLAN_ID") || env("PLAN_ID") === R.plan.id)) { R.plan.estado = "rechazada"; R.plan.fin = now.toISOString(); R.planHist.unshift(R.plan); R.plan = null; titulo = "Propuesta rechazada"; rep.push("Has rechazado la propuesta: no se envía nada. Mañana se vuelve a revisar."); R.lastNormal = m.date; }
      else { titulo = "No había propuesta pendiente"; rep.push("No había ninguna propuesta pendiente con ese identificador."); }
      return;
    }
    if (tipo === "reanudar") { const p = R.paused; R.paused = null; R.rearm = true; titulo = "Cartera real reanudada"; rep.push(p ? `Se quita la pausa automática (${p.why}).` : "No estaba en pausa."); }

    if (!env("T212_KEY")) { estado = "error"; titulo = "Faltan las claves de Trading 212"; rep.push("Pon T212_KEY y T212_SECRET en los ajustes de la cartera real (o en GitHub → Settings → Secrets)."); aviso = { title: "✖ Cartera real: faltan las claves", msg: rep.join("\n"), prio: 4 }; return; }
    const T = t212(A.env);
    let account, positions, pending;
    try {
      account = await T.call("GET", "/equity/account/summary");
      positions = (await T.call("GET", "/equity/positions")) || [];
      pending = (await T.call("GET", "/equity/orders")) || [];
    } catch (e) { estado = "error"; titulo = "No pude conectar con Trading 212"; rep.push(explainT212(e)); aviso = { title: "✖ Cartera real: sin conexión con Trading 212", msg: explainT212(e), prio: 4 }; return; }
    const { id: _id, ...acc } = account || {};   // el número de cuenta no se guarda
    R.account = { ...acc, at: now.toISOString() };
    R.positions = positions.map((p) => ({ t: p.instrument.ticker, name: p.instrument.name, cur: p.instrument.currency, isin: p.instrument.isin, q: p.quantity, qa: p.quantityAvailableForTrading, avg: p.averagePricePaid, px: p.currentPrice, val: p.walletImpact && p.walletImpact.currentValue, cost: p.walletImpact && p.walletImpact.totalCost, pnl: p.walletImpact && p.walletImpact.unrealizedProfitLoss, fx: p.walletImpact && p.walletImpact.fxImpact, desde: p.createdAt }));
    R.pending = pending.map((o) => ({ id: o.id, t: o.ticker || (o.instrument && o.instrument.ticker), side: o.side, type: o.type, q: o.quantity, status: o.status, at: o.createdAt }));
    if (acc.currency && acc.currency !== "EUR") rep.push(`⚠️ La divisa principal de tu cuenta es ${acc.currency}: los importes se muestran en esa divisa aunque ponga €.`);

    // aportaciones netas (depósitos - retiradas) para medir la ganancia de verdad
    try {
      const tx = await T.pages("/equity/history/transactions?limit=50", 20);
      let net = 0, n = 0;
      for (const x of tx) { const a = Math.abs(+x.amount || 0); if (x.type === "DEPOSIT") { net += a; n++; } else if (x.type === "WITHDRAW") { net -= a; n++; } else if (x.type === "TRANSFER") { net += +x.amount || 0; n++; } }
      R.deposits = { net: r2(net), n, at: now.toISOString() };
    } catch (e) { rep.push("· No pude leer los depósitos (se usa el último dato): " + explainT212(e)); }

    // instrumentos y mapeo (se refresca cada 5 días o si cambian los ajustes)
    const bot = getBot();
    const syms = new Set(BASE_UNI);
    if (bot.S) for (const B of Object.values(bot.S.books || {})) { Object.keys((B.tgt && B.tgt.w) || {}).forEach((s) => syms.add(s)); Object.keys(B.pos || {}).forEach((s) => syms.add(s)); }
    const cfgSig = JSON.stringify([A.mapa, A.divisa, A.acciones, [...syms].sort()]);
    if (!R.inst || Date.now() - Date.parse(R.inst.at) > 5 * 864e5 || R.inst.sig !== cfgSig || tipo === "probar" || Object.values(R.map).length === 0) {
      try {
        const insts = await T.call("GET", "/equity/metadata/instruments");
        R.map = resolveMap(insts || [], [...syms], A);
        R.inst = { at: now.toISOString(), n: (insts || []).length, sig: cfgSig };
        log(`Instrumentos de Trading 212: ${R.inst.n} · mapeados ${Object.values(R.map).filter((x) => x.t).length}/${syms.size}`);
      } catch (e) { rep.push("· No pude descargar la lista de instrumentos (" + explainT212(e) + "): uso el mapeo guardado."); }
    }

    // foto del día
    const cash = +((acc.cash && acc.cash.availableToTrade) || 0), inv = +((acc.investments && acc.investments.currentValue) || 0), resv = +((acc.cash && acc.cash.reservedForOrders) || 0) + +((acc.cash && acc.cash.inPies) || 0);
    const total = r2(cash + inv + resv), aport = R.deposits ? R.deposits.net : null;
    R.days = R.days.filter((x) => x.d !== m.date);
    R.days.push({ d: m.date, t: now.toISOString(), v: total, cash: r2(cash), inv: r2(inv), ap: aport, foto: tipo === "foto" || undefined });
    R.days.sort((a, b) => (a.d < b.d ? -1 : 1));
    R.last = now.toISOString();
    head.push(`- Cuenta: valor ${eur(total)} · efectivo ${eur(cash)} · invertido ${eur(inv)}${aport != null ? ` · aportado ${eur(aport)} · resultado ${eur(total - aport)} (${pct(aport ? (total / aport - 1) * 100 : 0)})` : ""}`);

    // freno por pérdidas: referencia = lo aportado, o el valor del día en que pulsaste «Reanudar» (si aportas o retiras dinero, vuelve a lo aportado)
    if (R.lossRef && R.lossRef.ap !== aport) R.lossRef = null;
    if (R.rearm) { R.lossRef = { v: total, ap: aport, d: m.date }; delete R.rearm; }
    const ref = R.lossRef ? R.lossRef.v : aport, refTxt = R.lossRef ? `el valor del ${R.lossRef.d}, cuando reanudaste (${eur(R.lossRef.v)})` : `lo aportado (${eur(aport)})`;
    if (ref > 0 && total < ref * (1 - A.maxPerdida / 100) && !R.paused) {
      R.paused = { ts: now.toISOString(), why: `la cuenta (${eur(total)}) ha caído más de un ${A.maxPerdida}% desde ${refTxt}` };
      aviso = { title: "⛔ Cartera real en PAUSA automática", msg: `El bot deja de operar: ${R.paused.why}. Revísalo y pulsa «Reanudar» en la web si quieres seguir.`, prio: 5 };
    }

    if (tipo === "foto") {
      titulo = "Foto diaria del valor"; rep.push(`Valor de la cuenta guardado para la gráfica: ${eur(total)}.`);
      if (m.fri && A.semanal && R.lastWeekly !== m.date) {
        const b = getBot();
        titulo = "Informe semanal de la cartera real"; rep.push("", semanaMd(R, b.S, A, m)); R.lastWeekly = m.date;
        const x = resumen(R, b.S, A);
        aviso = aviso || { title: `📊 Cartera real · semana: ${x && x.res != null ? (x.res >= 0 ? "+" : "") + eur(x.res) : eur(total)}`, msg: `Valor ${eur(total)}${x && x.ap != null ? ` · aportado ${eur(x.ap)} · ${pct(x.pct)}` : ""}${x && x.sim ? `\nSimulación del mismo método: ${pct(x.sim.ret)}` : ""}\nÓrdenes de la semana: ${(R.orders || []).filter((o) => Date.now() - Date.parse(o.ts) < 7 * 864e5).length}`, prio: 3, tags: ["bar_chart"] };
      }
      return;
    }
    if (tipo === "probar") {
      titulo = "Prueba de conexión con Trading 212 ✔";
      rep.push(`Conexión correcta con Trading 212 (${A.env === "demo" ? "demo" : "cuenta real"}). Divisa de la cuenta: ${acc.currency || "—"}.`, `Posiciones: ${positions.length} · órdenes pendientes: ${pending.length} · instrumentos disponibles: ${R.inst ? R.inst.n : "—"}.`, "", "## ¿Se puede operar todo lo que usa el bot?", "", mapTable(R.map));
      aviso = aviso || { title: "✔ Cartera real: conexión correcta con Trading 212", msg: `Valor ${eur(total)} · efectivo ${eur(cash)} · ${Object.values(R.map).filter((x) => x.t).length} de ${Object.keys(R.map).length} activos del bot disponibles.`, prio: 3 };
      return;
    }

    // ----- decidir -----
    if (!A.on) { titulo = "Desactivada"; rep.push("La cartera real está desactivada en los ajustes: solo se ha guardado el valor de la cuenta."); return; }
    if (A.env === "live" && !A.aceptoReal) { titulo = "Falta tu confirmación de dinero real"; rep.push("Marca en los ajustes «Entiendo que opera con dinero real» para que el bot pueda enviar órdenes."); return; }
    if (R.paused) { titulo = "En pausa automática"; rep.push("⛔ " + R.paused.why + ". No se opera hasta que pulses «Reanudar»."); return; }
    if (bot.err) { estado = "error"; titulo = "Sin datos del bot"; rep.push(bot.err); aviso = { title: "✖ Cartera real: sin datos del bot", msg: bot.err, prio: 4 }; return; }
    const r = makePlan({ A, R, bot, account, positions, pending, map: R.map, now });
    if (r.block) { titulo = "No se opera hoy"; rep.push("✋ " + r.block); estado = "bloqueado"; aviso = { title: "🟡 Cartera real: hoy no opera", msg: r.block, prio: 3 }; R.lastNormal = m.date; return; }
    const plan = r.plan;
    R.lastPlan = { ...plan };
    if (!R.metHist || !R.metHist.length || R.metHist[R.metHist.length - 1].metodo !== plan.metodo) { R.metHist = (R.metHist || []).concat([{ d: m.date, metodo: plan.metodo, nombre: plan.metodoNombre }]); }
    rep.push("## Plan de hoy", "", planMd(plan));

    let ejecutar = false;
    if (tipo === "aprobar") {
      const P = R.plan;
      if (!P || P.estado !== "pendiente" || (env("PLAN_ID") && env("PLAN_ID") !== P.id)) { titulo = "No hay esa propuesta"; rep.push("", "No hay una propuesta pendiente con ese identificador (quizá ya se ejecutó o caducó)."); return; }
      if (P.d !== m.date) { P.estado = "caducada"; R.planHist.unshift(P); R.plan = null; titulo = "Propuesta caducada"; rep.push("", `La propuesta era del ${P.d}: ha caducado. Se ha vuelto a calcular: mírala de nuevo.`); if (plan.orders.length) { R.plan = plan; aviso = { title: "🟡 Cartera real: propuesta nueva", msg: plan.orders.map(oneLine).join("\n") + "\n\nConfírmala en la web.", prio: 4 }; } return; }
      if (plan.firma !== P.firma) { P.estado = "sustituida"; R.planHist.unshift(P); R.plan = plan.orders.length ? plan : null; titulo = "La propuesta ha cambiado"; rep.push("", "Desde que se hizo la propuesta han cambiado los activos a comprar o vender. No se ejecuta: revisa la nueva."); if (plan.orders.length) aviso = { title: "🟡 Cartera real: la propuesta ha cambiado", msg: plan.orders.map(oneLine).join("\n") + "\n\nConfírmala de nuevo en la web.", prio: 4 }; return; }
      ejecutar = plan.orders.length > 0; P.estado = "aprobada"; R.planHist.unshift({ ...P, fin: now.toISOString() }); R.plan = null;
      if (!ejecutar) { titulo = "Nada que ejecutar"; R.applied = { metodo: plan.metodo, tgtD: plan.tgtD, d: m.date }; rep.push("", "Al recalcular, ya no hace falta ninguna orden."); return; }
    } else if (A.modo === "auto") ejecutar = plan.orders.length > 0;
    else if (A.modo === "confirmar") {
      if (!plan.orders.length) { if (R.plan && R.plan.estado === "pendiente") { R.plan.estado = "ya-no-hace-falta"; R.planHist.unshift(R.plan); R.plan = null; } titulo = "Sin cambios"; R.lastNormal = m.date; R.applied = { metodo: plan.metodo, tgtD: plan.tgtD, d: m.date }; R.lastPlan = plan; return; }
      if (R.plan && R.plan.estado === "pendiente" && R.plan.d === m.date && R.plan.firma === plan.firma) { titulo = "Propuesta pendiente (sin cambios)"; R.lastNormal = m.date; return; }
      if (R.plan && R.plan.estado === "pendiente") { R.plan.estado = "sustituida"; R.planHist.unshift(R.plan); }
      R.plan = plan; R.lastNormal = m.date;
      titulo = `Propuesta pendiente de confirmar (${plan.orders.length} ${plan.orders.length === 1 ? "orden" : "órdenes"})`;
      aviso = { title: "🟡 Cartera real: confirma estas órdenes", msg: plan.orders.map(oneLine).join("\n") + `\n\nMétodo: ${plan.metodoNombre}. Toca para abrir la web y pulsa «Aprobar y ejecutar».`, prio: 4, tags: ["warning"] };
      return;
    } else { titulo = plan.orders.length ? `En pausa: haría ${plan.orders.length} órdenes` : "En pausa · sin cambios"; R.lastNormal = m.date; return; }

    if (!ejecutar) { titulo = "Sin cambios · la cartera ya sigue al método"; R.lastNormal = m.date; R.applied = { metodo: plan.metodo, tgtD: plan.tgtD, d: m.date }; return; }
    rep.push("", "## Ejecución");
    const res = await execute(T, A, R, plan, { account, positions, map: R.map }, rep);
    const ok = res.filter((x) => x.estado === "ejecutada"), bad = res.filter((x) => x.estado === "error"), later = res.filter((x) => x.estado === "aplazada"), omit = res.filter((x) => x.estado === "omitida");
    for (const x of res) R.orders.unshift({ ts: new Date().toISOString(), d: m.date, side: x.side, t: x.t, sym: x.sym, name: x.name, eur: x.eurReal != null ? r2(x.eurReal) : x.eur, qty: x.fillQty || x.qtyEnv || x.qty || null, px: x.fillPx || x.pxEst || null, estado: x.estado, err: x.err || x.nota || "", why: x.why, id: x.id || null, plan: plan.id, metodo: plan.metodo, modo: tipo === "aprobar" ? "aprobada" : "auto", env: A.env });
    plan.estado = bad.length ? "con-errores" : "ejecutada"; plan.res = res.map((x) => ({ t: x.t, side: x.side, estado: x.estado, err: x.err || "" }));
    R.planHist.unshift({ ...plan, fin: new Date().toISOString() });
    if (!later.length) R.lastNormal = m.date;
    if (!bad.length && !later.length && !omit.length) R.applied = { metodo: plan.metodo, tgtD: plan.tgtD, d: m.date };
    if (bad.length) estado = "error";
    titulo = `${ok.length} ${ok.length === 1 ? "orden ejecutada" : "órdenes ejecutadas"}${bad.length ? ` · ${bad.length} con error` : ""}${later.length ? ` · ${later.length} aplazadas` : ""}${omit.length ? ` · ${omit.length} omitidas` : ""}`;
    aviso = { title: `${bad.length ? "✖" : "💶"} Cartera real: ${titulo}`, msg: res.map((x) => `${x.side === "COMPRA" ? "🟢" : "🔴"} ${x.side} ${x.t}${x.sym ? " (" + x.sym + ")" : ""} · ${x.estado}${x.eurReal != null ? " · " + eur(x.eurReal) : x.eur ? " · ≈" + eur(x.eur) : ""}${x.err ? " · " + x.err : ""}\n   ${String(x.why || "").slice(0, 120)}`).join("\n") + `\n\nMétodo: ${plan.metodoNombre} · ${A.env === "demo" ? "DEMO" : "dinero real"}`, prio: bad.length ? 5 : 4 };
    // posiciones tras ejecutar
    // foto del valor tras ejecutar (la de arriba es de antes de las órdenes)
    try {
      await sleep(5200); const a2 = await T.call("GET", "/equity/account/summary");
      const c2 = +((a2.cash && a2.cash.availableToTrade) || 0), i2 = +((a2.investments && a2.investments.currentValue) || 0), r2v = +((a2.cash && a2.cash.reservedForOrders) || 0) + +((a2.cash && a2.cash.inPies) || 0);
      const dd = R.days.find((x) => x.d === m.date); if (dd) Object.assign(dd, { v: r2(c2 + i2 + r2v), cash: r2(c2), inv: r2(i2), t: new Date().toISOString() });
      const { id: _i2, ...acc2 } = a2 || {}; R.account = { ...acc2, at: new Date().toISOString() };
    } catch {}
    try { const ps = await T.call("GET", "/equity/positions"); R.positions = ps.map((p) => ({ t: p.instrument.ticker, name: p.instrument.name, cur: p.instrument.currency, isin: p.instrument.isin, q: p.quantity, qa: p.quantityAvailableForTrading, avg: p.averagePricePaid, px: p.currentPrice, val: p.walletImpact && p.walletImpact.currentValue, cost: p.walletImpact && p.walletImpact.totalCost, pnl: p.walletImpact && p.walletImpact.unrealizedProfitLoss, fx: p.walletImpact && p.walletImpact.fxImpact, desde: p.createdAt })); } catch {}
  } catch (e) {
    estado = "error"; titulo = "Error inesperado"; rep.push("✖ " + String((e && e.stack) || e).slice(0, 800));
    aviso = { title: "✖ Cartera real: error", msg: String((e && e.message) || e).slice(0, 500), prio: 4 };
  } finally {
    if (!titulo) titulo = estado;
    let resu = "";
    try { const b = R.days.length ? getBot() : {}; resu = resumenMd(R, b.S, A); } catch {}
    const md = [...head, "", `## ${titulo}`, "", ...rep].join("\n") + "\n" + (resu ? resu + "\n" : "");
    let avTxt = "";
    if (aviso) {
      const n = A.movil || aviso.prio >= 5 || estado === "error" ? await ntfy(aviso.title, aviso.msg, aviso.prio, aviso.tags || []) : "· móvil apagado en ajustes";
      const c = A.correo || estado === "error" ? await mail(aviso.title, md) : "· correo apagado en ajustes";
      avTxt = `\n## Avisos\n- Móvil: ${n}\n- Correo: ${c}\n`;
    }
    R.reports.unshift({ id: now.toISOString().replace(/[:.]/g, "-") + "-" + tipo, ts: now.toISOString(), tipo, estado, titulo, md: md + avTxt });
    try { if (env("GITHUB_STEP_SUMMARY")) appendFileSync(env("GITHUB_STEP_SUMMARY"), md + avTxt); } catch {}
    console.log(md + avTxt);
    await publishReal(R);
    if (estado === "error") process.exitCode = 1;
  }
}
function oneLine(o) { return `${o.side === "COMPRA" ? "🟢 COMPRAR" : "🔴 VENDER"} ${o.t}${o.sym ? " (" + o.sym + ")" : ""} · ≈ ${eur(o.eur)}`; }

export { resolveMap, yahooSym, madrid, loadBot };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
}
