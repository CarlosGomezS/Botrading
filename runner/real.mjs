// CARTERA REAL · Trading 212
// Sigue con dinero real el método que elijas del bot (sus pesos objetivo) en tu cuenta Invest de Trading 212.
// No necesita navegador: lee el estado del bot (rama data → state.json), consulta tu cuenta, calcula qué comprar/vender,
// y, según el modo, lo ejecuta (auto), lo deja propuesto para que lo apruebes en la web (confirmar) o solo lo anota (pausa).
// Guarda todo (valor diario, órdenes, informes y la propuesta pendiente) en la rama "real" → real.json (cifrado si hay REAL_VIEW_PASS).
//
// Uso: node real.mjs [normal | aprobar | rechazar | probar | foto | reanudar]   (PLAN_ID=… para aprobar/rechazar)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadAsync as loadCfg, encrypt, decrypt, openAny } from "./real-cfg.mjs";

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
const seur = (n) => { const v = r2(+n || 0); return (v > 0 ? "+" : v < 0 ? "−" : "") + eur(Math.abs(v)); };   // importe con signo (+1,20 € / −0,35 € / 0,00 €)

const NOMBRES = {
  sect: "Rotación de sectores (Faber)", sectx: "Rotación ampliada (sectores + QQQ + SMH + IWM)", trq: "Tendencia QQQ de 10 meses (Faber)",
  dmu: "Dual Momentum EE. UU. (QQQ, SPY, IWM, SMH)", mix: "Mezcla 50/50: sectores + QQQ en tendencia",
  smh: "Semiconductores en tendencia (SMH)", qld: "Nasdaq x2 con filtro de tendencia", aic: "Líderes de la IA en tendencia", aim: "Momentum de líderes tecnológicos", m10: "Momentum de acciones grandes (top 10)",
};
const DESC = {
  SPY: "S&P 500", QQQ: "Nasdaq 100", SMH: "Semiconductores", IWM: "Pequeñas empresas EE. UU.", XLK: "Sector tecnología", XLV: "Sector salud",
  XLE: "Sector energía", XLF: "Sector financiero", XLY: "Consumo discrecional", XLP: "Consumo básico", XLI: "Sector industrial", XLU: "Servicios públicos",
  XLB: "Materiales", XLC: "Comunicaciones", SHY: "Bonos EE. UU. 1-3 años", IEF: "Bonos EE. UU. 7-10 años", TLT: "Bonos EE. UU. 20+ años",
  AGG: "Bonos agregados EE. UU.", GLD: "Oro", LQD: "Bonos de empresas EE. UU.", DBC: "Materias primas", XLRE: "Inmobiliario EE. UU.", SPHQ: "Calidad EE. UU.", SPMO: "Momentum EE. UU.", QLD: "Nasdaq 100 x2", TQQQ: "Nasdaq 100 x3", SSO: "S&P 500 x2", "BRK.B": "Berkshire Hathaway", EFA: "Desarrollados ex-EE. UU.", EEM: "Emergentes", URTH: "MSCI World", VNQ: "Inmobiliario EE. UU.", DIA: "Dow Jones",
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
  // v19: más equivalentes para los métodos de la prueba histórica
  XLRE: [/Real Estate.*Select Sector|Select Sector.*Real Estate/i, /S&P 500 Real Estate/i, /US Property Yield/i, /US Real Estate/i],
  LQD: [/\$ Corp(?:orate)? Bond(?!.*(?:0-3|1-5|Short|Interest Rate))/i, /USD Corporate Bond/i],
  DBC: [/Diversified Commodity/i, /Bloomberg Commodity(?! ex)/i, /Broad Commodit/i],
  SPHQ: [/MSCI USA Quality Factor/i, /USA Quality/i],
  SPMO: [/MSCI USA Momentum Factor/i, /USA Momentum/i],
  // apalancados (ETPs europeos): solo si tu cuenta los tiene
  QLD: [/Nasdaq[- ]?100.*\b2x\b|\b2x\b.*Nasdaq[- ]?100|Nasdaq[- ]?100 Daily \(2x\)/i],
  TQQQ: [/Nasdaq[- ]?100.*\b3x\b|\b3x\b.*Nasdaq[- ]?100/i],
  SSO: [/S&P 500.*\b2x\b|\b2x\b.*S&P 500/i],
};
// para estos se permiten productos apalancados o de permuta (swap), que el filtro general descarta
const LEVOK = new Set(["QLD", "TQQQ", "SSO", "DBC"]), BADL = /Short|Inverse|Hedged|ESG/i;
const BAD = /Hedged|Leverag|Short|Daily|\b[23]x\b|Equal|ESG|SRI|Paris|Screened|Swap|Covered Call|Buffer/i;
const BASE_UNI = Object.keys(PAT);

// ---------- hora de Madrid ----------
// REAL_NOW (fecha simulada) solo funciona en las pruebas automáticas (REAL_TEST=1, que nunca se pone en el flujo real) y contra el Trading 212 simulado
const NOWF = () => (env("REAL_TEST") === "1" && env("REAL_NOW") && /^http:\/\/127\.0\.0\.1/.test(env("T212_BASE")) ? new Date(env("REAL_NOW")) : new Date());
function madrid(d = NOWF()) {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, wk: !/^(Sat|Sun)$/.test(p.weekday), fri: p.weekday === "Fri", hm: `${p.hour}:${p.minute}` };
}

// cifrado: en real-cfg.mjs (mismo formato que la web: PBKDF2 250 000 + AES-GCM)
export { encrypt, decrypt };

// ---------- git: leer y publicar ----------
function sh(cmd) { return execSync(cmd, { stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 30 }); }
function gitShow(branch, file) {
  if (env("LOCAL_" + branch.toUpperCase())) return readFileSync(env("LOCAL_" + branch.toUpperCase()), "utf8");   // pruebas locales
  if (!REPO || !TOKEN) throw new Error("sin repositorio/token (ejecución local)");
  sh(`git -C "${ROOT}" fetch -q --depth 1 https://x-access-token:${TOKEN}@github.com/${REPO}.git ${branch}`);
  return sh(`git -C "${ROOT}" show FETCH_HEAD:${file}`);
}
const SECRET_NAMES = ["T212_KEY", "T212_SECRET", "REAL_VIEW_PASS", "NTFY_TOPIC", "SMTP_USER", "SMTP_PASS", "EMAIL"];
// El repositorio es PÚBLICO y los registros de GitHub Actions también: aquí nunca se escriben importes, posiciones ni tickers.
function secretsMeta() { const o = {}; for (const k of SECRET_NAMES) o[k] = !!env(k); return o; }

async function loadReal() {
  let txt;
  try { txt = gitShow("real", "real.json"); } catch (e) { log("Todavía no hay historial de la cartera real (rama real): se empieza de cero."); return freshReal(); }
  let j = JSON.parse(txt);
  if (j.enc) {
    const r = await openAny(j, [env("REAL_VIEW_PASS"), env("REAL_VIEW_PASS_OLD")]);
    if (r.error) throw new Error("No puedo descifrar el historial de la cartera real: la contraseña REAL_VIEW_PASS no es la que se usó al guardarlo. Si la has cambiado, pon la anterior en REAL_VIEW_PASS_OLD (la web lo hace sola al cambiarla).");
    j = r.j;
  }
  return Object.assign(freshReal(), j);
}
function freshReal() { return { v: 2, created: new Date().toISOString(), days: [], orders: [], reports: [], plan: null, planHist: [], map: {}, inst: null, paused: null, botTickers: [], last: null, lastNormal: null, account: null, positions: [], deposits: null, cfg: null, ledger: null, pendBot: [], approved: null, flows: {}, cuenta: [] }; }

async function publishReal(R) {
  R.savedAt = Date.now();
  // se guarda todo: los informes más antiguos (a partir del 500) conservan los primeros 6.000 caracteres; todos te llegaron completos por correo
  R.reports = R.reports.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 5000).map((x, i) => (i >= 500 && x.md && x.md.length > 6000 ? { ...x, md: x.md.slice(0, 6000) + "\n\n[… recortado por antigüedad: el informe completo te llegó por correo]\n" } : x));
  R.orders = R.orders.slice(0, 20000); R.planHist = (R.planHist || []).slice(0, 1000);
  if (R.ledger) R.ledger.hist = R.ledger.hist.slice(0, 20000);
  const plain = JSON.stringify(R);
  const pw = env("REAL_VIEW_PASS");
  if (!pw) throw new Error("sin REAL_VIEW_PASS no se publica nada (privacidad)");
  const out = JSON.stringify({ enc: 1, v: 1, savedAt: R.savedAt, meta: { secrets: secretsMeta() }, ...(await encrypt(plain, pw)) });
  const local = path.join(process.cwd(), "real.json");
  writeFileSync(local, out);
  if (!REPO || !TOKEN) { log("Ejecución local: guardado en", local); return; }
  const pub = path.join(process.cwd(), ".pubreal");
  rmSync(pub, { recursive: true, force: true }); mkdirSync(pub);
  writeFileSync(path.join(pub, "real.json"), out);
  const g = (c) => sh(`git -C "${pub}" ${c}`);
  g("init -q -b real"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"');
  g("add real.json"); g(`commit -q -m "cartera real ${new Date().toISOString()}"`);
  for (let i = 0; i < 6; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git real`); break; } catch (e) { if (i === 5) throw new Error("no pude guardar el historial en GitHub tras 6 intentos"); await sleep(5000 * (i + 1)); } }
  log("Cartera real publicada (cifrada).");
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
  // T212_BASE solo existe para las pruebas automáticas (simulador en 127.0.0.1); en GitHub nunca se usa otra dirección que la oficial
  const tb = env("T212_BASE"), base = tb && env("REAL_TEST") === "1" && /^http:\/\/127\.0\.0\.1:\d+\//.test(tb) ? tb : which === "demo" ? "https://demo.trading212.com/api/v0" : "https://live.trading212.com/api/v0";
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
        log(`Límite de peticiones de Trading 212: espero ${Math.round(Math.max(1000, Math.min(w, 70000)) / 1000)} s`);
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
const YH = env("REAL_TEST") === "1" && /^http:\/\/127\.0\.0\.1/.test(env("YH_BASE")) ? env("YH_BASE") : "https://query1.finance.yahoo.com";
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
        if (LEVOK.has(sym) ? BADL.test(nm) : (i.type !== "ETF" || BAD.test(nm))) return;
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

// ---------- SUBCUENTA DEL BOT dentro de tu cuenta de Trading 212 ----------
// El bot lleva su propia contabilidad, aparte de lo tuyo:
//  · cap   = dinero que le has dado a trabajar (el ajuste «Dinero que trabaja el bot»). Subirlo = aportar; bajarlo = retirar.
//  · cash  = efectivo del bot (lo que le queda sin invertir de su capital, más lo cobrado en sus ventas).
//  · lots  = participaciones que ha comprado ÉL, con su coste. Nunca vende más de esto, aunque tú tengas más del mismo ETF.
//  · real  = ganancia o pérdida realizada en sus ventas (lo que se declara en la renta).
// Así: si ingresas dinero en Trading 212, el bot no lo toca hasta que subas su capital; sus ganancias se reinvierten solas.
const unitVal = (p) => { const q = +p.quantity || 0, v = +((p.walletImpact && p.walletImpact.currentValue) || 0); return q > 0 ? v / q : 0; };
function hist(R, e) { R.ledger.hist.unshift({ ts: new Date().toISOString(), ...e, cashBot: r2(R.ledger.cash) }); }
function flowAdd(R, d, v) { R.flows = R.flows || {}; R.flows[d] = r2((R.flows[d] || 0) + v); }
export function ensureLedger(R, A, positions, m, notas) {
  const byT = Object.fromEntries(positions.map((p) => [p.instrument.ticker, p]));
  if (!R.ledger) {
    R.ledger = { cap: 0, cash: 0, lots: {}, real: 0, hist: [], limite: null, desde: m.date };
    // versión anterior: posiciones que el bot ya había comprado (se asume que son todas suyas)
    for (const t of R.botTickers || []) { const p = byT[t]; if (p && +p.quantity > 0) R.ledger.lots[t] = { q: +p.quantity, cost: r2(+((p.walletImpact && p.walletImpact.totalCost) || 0)), d: m.date }; }
  }
  const L = R.ledger;
  // capital: el ajuste manda. La primera vez se crea; después, cada cambio es una aportación (+) o retirada (−) del bot
  if (L.limite == null) {
    const cost = Object.values(L.lots).reduce((t, x) => t + x.cost, 0);
    L.cap = A.limite; L.cash = r2(A.limite - cost); L.limite = A.limite;
    hist(R, { tipo: "capital", eur: A.limite, nota: `capital inicial del bot: ${eur(A.limite)}` }); flowAdd(R, m.date, A.limite);
  } else if (Math.abs(A.limite - L.limite) > 0.004) {
    // al cambiar el ajuste, el bot pasa a trabajar con ESA cantidad: la diferencia con lo que vale ahora es lo que le das (+) o le quitas (−)
    const byT0 = Object.fromEntries(positions.map((p) => [p.instrument.ticker, p]));
    const eqNow = L.cash + Object.entries(L.lots).reduce((t, [tk, l]) => { const p = byT0[tk]; return t + (p ? Math.min(l.q, +p.quantity || 0) * unitVal(p) : 0); }, 0);
    const dlt = r2(A.limite - eqNow);
    L.cap = r2(L.cap + dlt); L.cash = r2(L.cash + dlt); L.limite = A.limite; R.applied = null;   // se recalcula la cartera entera con el dinero nuevo (el freno de pérdidas no se ve afectado: usa la rentabilidad)
    hist(R, { tipo: dlt > 0 ? "aportación" : "retirada", eur: dlt, nota: `has cambiado el dinero que trabaja el bot a ${eur(A.limite)}: valía ${eur(eqNow)}, así que ${dlt >= 0 ? "le das" : "le quitas"} ${eur(Math.abs(dlt))}` }); flowAdd(R, m.date, dlt);
    notas.push(`Has cambiado el dinero que trabaja el bot a ${eur(A.limite)}. Valía ${eur(eqNow)}: ${dlt >= 0 ? "le das" : "le quitas"} ${eur(Math.abs(dlt))}. Cuenta como ${dlt >= 0 ? "aportación" : "retirada"}, no como ganancia ni pérdida.`);
  }
  return L;
}
export function syncLots(R, positions, m, notas) {
  const L = R.ledger, byT = Object.fromEntries(positions.map((p) => [p.instrument.ticker, p]));
  // desdoblamiento o agrupación (split): las participaciones se multiplican por k y el precio medio se divide por k, sin órdenes de por medio
  for (const [t, lot] of Object.entries(L.lots)) {
    const p = byT[t], sn = (R.seen || {})[t];
    if (!p || !sn || !(sn.q > 0) || !(sn.avg > 0)) continue;
    const q = +p.quantity || 0, avg = +p.averagePricePaid || 0, k = q / sn.q;
    const K = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10, 1 / 20, 1 / 100].find((x) => Math.abs(k / x - 1) < 0.005);
    if (K && avg > 0 && Math.abs((avg * K) / sn.avg - 1) < 0.03) {
      const old = lot.q; lot.q = +(lot.q * K).toFixed(8);
      hist(R, { tipo: "ajuste", t, q: lot.q - old, eur: 0, nota: `desdoblamiento ${K >= 1 ? "1:" + K : Math.round(1 / K) + ":1"} detectado en ${t}: el bot pasa de ${r2(old)} a ${r2(lot.q)} participaciones (el coste no cambia)` });
      notas.push(`${t}: Trading 212 muestra un desdoblamiento (${K >= 1 ? "1:" + K : Math.round(1 / K) + ":1"}). Se ajustan las participaciones del bot; su coste no cambia.`);
    }
  }
  // participaciones del bot frente a lo que hay de verdad en la cuenta (si vendiste tú a mano, se descuenta)
  for (const [t, lot] of Object.entries(L.lots)) {
    const p = byT[t], have = p ? +p.quantity || 0 : 0;
    if (have + 1e-6 < lot.q) {
      const gone = lot.q - have, frac = gone / lot.q, val = p ? gone * unitVal(p) : 0, cost = lot.cost * frac;
      lot.q = have; lot.cost = r2(lot.cost - cost);
      L.cap = r2(L.cap - val); flowAdd(R, m.date, -val);   // (el ajuste «Dinero que trabaja el bot» no cambia: solo el capital)
      hist(R, { tipo: "ajuste", t, q: gone, eur: -r2(val), nota: `en la cuenta hay ${have} participaciones de ${t} y el bot tenía ${r2(gone + have)}: se descuentan ${r2(gone)} (¿las vendiste tú?). Se cuenta como retirada del bot.` });
      notas.push(`${t}: en Trading 212 hay menos participaciones que las que compró el bot (¿las vendiste a mano?). Se descuentan de su cartera.`);
      if (lot.q <= 1e-6) delete L.lots[t];
    }
  }
  return L;
}
// valor actual de lo que es del bot y de lo que es tuyo, ticker a ticker
export function split(R, positions) {
  const L = R.ledger, out = [];
  for (const p of positions) {
    const t = p.instrument.ticker, u = unitVal(p), q = +p.quantity || 0, bq = Math.min(q, (L.lots[t] && L.lots[t].q) || 0);
    out.push({ t, p, u, q, bq, uq: Math.max(0, q - bq), bv: bq * u, uv: Math.max(0, q - bq) * u, qa: +p.quantityAvailableForTrading || 0 });
  }
  return out;
}
export function botEquity(R, positions, accCash) {
  const inv = split(R, positions).reduce((t, x) => t + x.bv, 0), c = Math.max(0, Math.min(R.ledger.cash, accCash));
  return { inv: r2(inv), cash: r2(R.ledger.cash), cashUsable: r2(c), eq: r2(inv + R.ledger.cash) };
}
// apunta una orden ejecutada en la subcuenta del bot; devuelve {coste, pnl}
export function applyFill(R, side, t, q, eurAmt, meta = {}) {
  const L = R.ledger; q = Math.abs(+q || 0); eurAmt = Math.abs(+eurAmt || 0);
  if (!(q > 0)) return { coste: null, pnl: null };
  if (side === "COMPRA") {
    const lot = L.lots[t] || (L.lots[t] = { q: 0, cost: 0, d: meta.d || null });
    lot.q = +(lot.q + q).toFixed(8); lot.cost = r2(lot.cost + eurAmt); L.cash = r2(L.cash - eurAmt);
    hist(R, { tipo: "compra", t, q, eur: -eurAmt, px: meta.px || null, id: meta.id || null, nota: meta.why || "" });
    return { coste: eurAmt, pnl: null };
  }
  const lot = L.lots[t] || { q: 0, cost: 0 }, frac = lot.q > 0 ? Math.min(1, q / lot.q) : 1, cost = r2(lot.cost * frac), pnl = r2(eurAmt - cost);
  lot.q = Math.max(0, +(lot.q - q).toFixed(8)); lot.cost = r2(lot.cost - cost); L.cash = r2(L.cash + eurAmt); L.real = r2(L.real + pnl);
  if (lot.q <= 1e-6) delete L.lots[t]; else L.lots[t] = lot;
  hist(R, { tipo: "venta", t, q, eur: eurAmt, px: meta.px || null, id: meta.id || null, coste: cost, pnl, nota: meta.why || "" });
  return { coste: cost, pnl };
}
// órdenes del bot que quedaron pendientes (bolsa cerrada, festivo…): se mira cómo acabaron y se apuntan
async function reconcile(T, R, rep) {
  const keep = [];
  for (const o of R.pendBot || []) {
    let still = false;
    try { const x = await T.call("GET", "/equity/orders/" + o.id); if (x && !/FILLED|CANCEL|REJECT/.test(String(x.status))) still = true; } catch (e) { if (e.st !== 404) still = true; }
    if (still) { if (Date.now() - Date.parse(o.ts) < 10 * 864e5) keep.push(o); else rep.push(`- ⚠️ La orden ${o.side} ${o.t} lleva más de 10 días pendiente: revísala en Trading 212.`); continue; }
    let it = null;
    try { const h = await T.call("GET", `/equity/history/orders?ticker=${encodeURIComponent(o.t)}&limit=20`); it = ((h && h.items) || []).find((x) => x.order && String(x.order.id) === String(o.id)); } catch { keep.push(o); continue; }
    const rec = (R.orders || []).find((x) => String(x.id) === String(o.id));
    if (it && /FILLED/.test(String(it.order.status))) {
      const q = +it.order.filledQuantity || o.qty, net = it.fill && it.fill.walletImpact ? Math.abs(+it.fill.walletImpact.netValue) : o.eur, px = it.fill && it.fill.price;
      const r = applyFill(R, o.side, o.t, q, net, { px, id: o.id, d: String(it.fill && it.fill.filledAt || "").slice(0, 10), why: "orden pendiente que se ejecutó después" });
      if (rec) Object.assign(rec, { estado: "ejecutada", qty: Math.abs(q), px: px || rec.px, eur: r2(net), coste: r.coste, pnl: r.pnl, ejecutadaEn: it.fill && it.fill.filledAt, err: "se ejecutó después de enviarla (bolsa cerrada o festivo)" });
      rep.push(`- ✔ La orden pendiente ${o.side} ${o.t} se ejecutó${px ? " a " + px : ""} · ${eur(net)}${r.pnl != null ? ` · resultado ${seur(r.pnl)}` : ""}.`);
    } else if (it) {
      if (rec) Object.assign(rec, { estado: "rechazada", err: "Trading 212: " + it.order.status });
      rep.push(`- ✖ La orden pendiente ${o.side} ${o.t} terminó como ${it.order.status}: no se ejecutó.`);
    } else if (Date.now() - Date.parse(o.ts) < 3 * 864e5) keep.push(o);
    else { if (rec) Object.assign(rec, { estado: "desconocida", err: "no aparece en el historial de Trading 212" }); rep.push(`- ⚠️ No encuentro la orden ${o.side} ${o.t} en el historial de Trading 212: revísala en la app.`); }
  }
  R.pendBot = keep;
}
// ¿está abierta la bolsa europea? (las órdenes de ETFs europeos solo se envían de 9:05 a 17:20, hora de España)
// festivos en los que Xetra (Fráncfort) no abre: 1 ene, Viernes Santo, Lunes de Pascua, 1 may, 24, 25, 26 y 31 dic
export function xetraHoliday(d) {
  const y = +d.slice(0, 4), a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * mm + 114) / 31), da = ((h + l - 7 * mm + 114) % 31) + 1, easter = Date.UTC(y, mo - 1, da), iso = (t) => new Date(t).toISOString().slice(0, 10);
  return new Set([`${y}-01-01`, iso(easter - 2 * 864e5), iso(easter + 864e5), `${y}-05-01`, `${y}-12-24`, `${y}-12-25`, `${y}-12-26`, `${y}-12-31`]).has(d);
}
export const euOpen = (m) => m.wk && !xetraHoliday(m.date) && m.min >= 9 * 60 + 5 && m.min <= 17 * 60 + 20;

// ---------- plan: qué comprar y vender para parecerse al método ----------
export function makePlan({ A, R, bot, account, positions, pending, map, now }) {
  const notas = [], orders = [], m = madrid(now);
  const S = bot.S, key = A.metodo || S.main || "sect", B = (S.books || {})[key];
  if (!B) return { block: `el método «${key}» no tiene cartera en el bot (¿lo han quitado?). Elige otro en los ajustes de la cartera real.` };
  const tgt = B.tgt;
  if (!tgt || !tgt.w) return { block: `el método «${NOMBRES[key] || key}» todavía no ha calculado su cartera objetivo` };
  const age = S.lastDate ? (now - Date.parse(S.lastDate + "T22:00:00Z")) / 864e5 : 99;
  if (age > 5) return { block: `los datos del bot son del ${S.lastDate || "—"} (hace ${Math.floor(age)} días): no opero con datos viejos. Revisa la actualización diaria.` };

  const sp = split(R, positions), accCash = +((account.cash && account.cash.availableToTrade) || 0), E = botEquity(R, positions, accCash);
  const mine = sp.filter((x) => x.bq > 0), others = sp.filter((x) => x.uq > 0);
  const managedVal = mine.reduce((t, x) => t + x.bv, 0), cash = E.cashUsable;
  if (R.ledger.cash > accCash + 0.5) notas.push(`El efectivo del bot (${eur(R.ledger.cash)}) es mayor que el efectivo libre de tu cuenta (${eur(accCash)}): ¿has retirado dinero o lo has usado tú? El bot solo usa ${eur(accCash)}. Si quieres darle menos dinero, baja «Dinero que trabaja el bot».`);
  if (R.ledger.cash < -0.5) notas.push(`El bot ha invertido más que su capital (${eur(-R.ledger.cash)} de más): en esta revisión ajusta su cartera.`);
  const presupuesto = Math.max(0, managedVal + Math.min(R.ledger.cash, accCash));   // = dinero del bot (capital ± ganancias), nunca más de lo que hay
  const invest = presupuesto * (1 - A.reserva / 100);
  const thr = Math.max(A.minOrden, (A.umbral / 100) * invest);
  if (others.length) notas.push(`Posiciones tuyas que el bot no toca: ${others.map((x) => `${x.t} (${qtyTxt(x.uq)})`).join(", ")}.`);
  const pend = new Set((pending || []).map((o) => o.ticker || (o.instrument && o.instrument.ticker)));
  const yaAplicada = A.reajuste !== "desvio" && R.applied && R.applied.metodo === key && R.applied.tgtD === (tgt.d || null) && R.ledger.cash >= -0.5;
  if (yaAplicada) notas.push(`La cartera objetivo del ${tgt.d || "—"} ya está aplicada: hasta la próxima revisión del método solo se compra lo que falte o con dinero nuevo (como en la simulación).`);

  const objetivo = [], tv = {}, symOf = {};
  const W = Object.fromEntries(Object.entries(tgt.w).filter(([, w]) => Number.isFinite(+w) && +w > 0).map(([s0, w]) => [s0, +w]));
  const sumW = Object.values(W).reduce((t, w) => t + w, 0);
  if (sumW > 1.0001) { for (const k of Object.keys(W)) W[k] /= sumW; notas.push(`Los pesos del método sumaban ${(sumW * 100).toFixed(1)}%: se reducen proporcionalmente al 100% (nunca se invierte más de lo que tiene el bot).`); }
  for (const [sym, w] of Object.entries(W)) {
    if (!(w > 0)) continue;
    const mp = map[sym] || { t: null, why: "sin buscar todavía" };
    objetivo.push({ sym, w: +w, t: mp.t, name: mp.name || "", why: (tgt.why && tgt.why[sym]) || "", disp: mp.t ? "" : mp.why });
    if (!mp.t) { notas.push(`${sym} (${(w * 100).toFixed(0)}% del método) no se puede comprar: ${mp.why}. Esa parte se queda en efectivo.`); continue; }
    tv[mp.t] = (tv[mp.t] || 0) + w * invest; symOf[mp.t] = sym;
  }
  for (const [sym, mp] of Object.entries(map)) if (mp.t && !symOf[mp.t]) symOf[mp.t] = sym;

  for (const x of mine) {
    const t = x.t, cur = x.bv, q = Math.min(x.bq, x.qa), goal = tv[t] || 0;
    if (pend.has(t)) { notas.push(`${t} tiene una orden pendiente en Trading 212: no se toca hasta que se resuelva.`); continue; }
    if (!(q > 0)) { notas.push(`${t}: sus participaciones no están disponibles para vender ahora (¿en un «pie»?).`); continue; }
    if (goal <= 0) {
      if (cur < 1) { notas.push(`${t}: resto de ${eur(cur)} demasiado pequeño para vender.`); continue; }
      orders.push({ side: "VENTA", t, sym: symOf[t] || "", name: x.p.instrument.name || "", qty: q, full: true, eur: r2(q * x.u), why: `ya no está en la cartera del método${tgt.bull === false ? " (el método está fuera del mercado)" : ""}` });
    } else if (!yaAplicada && cur - goal > thr) {
      const sell = cur - goal, full = cur - sell < A.minOrden;
      orders.push({ side: "VENTA", t, sym: symOf[t] || "", name: x.p.instrument.name || "", qty: full ? q : Math.min(q, Math.floor((x.bq * sell) / cur * 1e4) / 1e4), full, eur: r2(full ? q * x.u : sell), why: `reduce a su peso objetivo (${eur(goal)} de ${eur(cur)})` });
    }
  }
  // si el bot tiene invertido más que su capital (p. ej. porque lo has bajado), vende ese sobrante aunque en cada posición sea pequeño:
  // se saca de la posición más cargada, en órdenes de al menos la orden mínima
  if (!yaAplicada) {
    let excess = managedVal - orders.reduce((t, o) => t + o.eur, 0) - invest;
    const cand = mine.filter((x) => !pend.has(x.t) && !orders.some((o) => o.t === x.t) && Math.min(x.bq, x.qa) > 0).map((x) => ({ x, over: x.bv - (tv[x.t] || 0) })).sort((a, b) => b.over - a.over || b.x.bv - a.x.bv);
    for (const { x } of cand) {
      if (excess < A.minOrden) break;
      const amt = Math.min(excess, x.bv), full = x.bv - amt < A.minOrden, q = Math.min(x.bq, x.qa);
      orders.push({ side: "VENTA", t: x.t, sym: symOf[x.t] || "", name: x.p.instrument.name || "", qty: full ? q : Math.min(q, Math.floor((x.bq * amt) / x.bv * 1e4) / 1e4), full, eur: r2(full ? q * x.u : amt), why: `el bot tiene invertido ${eur(excess)} más que su capital: se vende la diferencia` });
      excess -= full ? x.bv : amt;
    }
    if (excess > 0.5 && excess < A.minOrden) notas.push(`El bot tiene ${eur(excess)} invertidos de más: es menos que la orden mínima (${eur(A.minOrden)}), así que no se vende por ahora.`);
  }
  const sells = orders.reduce((t, o) => t + o.eur, 0);
  let freeCash = Math.min(cash + sells - presupuesto * (A.reserva / 100), accCash + sells);
  const buys = [];
  for (const [t, goal] of Object.entries(tv)) {
    if (pend.has(t)) continue;
    const x = mine.find((y) => y.t === t), cur = x ? x.bv : 0, diff = goal - cur;
    if (diff > thr || (!x && diff >= A.minOrden)) buys.push({ side: "COMPRA", t, sym: symOf[t], name: (Object.values(map).find((y) => y.t === t) || {}).name || "", eur: r2(diff), why: (tgt.why && tgt.why[symOf[t]]) || "está en la cartera objetivo del método" });
  }
  buys.sort((a, b) => b.eur - a.eur);
  for (const b of buys) {
    const amt = Math.min(b.eur, freeCash);
    if (amt < A.minOrden) { if (!yaAplicada || !mine.some((x) => x.t === b.t)) notas.push(`${b.t}: faltan ${eur(b.eur)} pero al bot solo le quedan ${eur(Math.max(0, freeCash))} libres (mínimo por orden ${eur(A.minOrden)}).`); continue; }
    orders.push({ ...b, eur: r2(amt) }); freeCash -= amt;
  }
  let cut = 0;
  while (orders.length > A.maxOrdenes) { orders.pop(); cut++; }
  if (cut) notas.push(`Se han dejado ${cut} órdenes para la próxima revisión (máximo ${A.maxOrdenes} por vez).`);
  const firma = orders.map((o) => o.side + ":" + o.t).sort().join("|");
  return { plan: { id: m.date.replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 7), ts: now.toISOString(), d: m.date, metodo: key, metodoNombre: NOMBRES[key] || key, tgtD: tgt.d || null, yaAplicada: !!yaAplicada, bull: tgt.bull !== false, datos: S.lastDate || null, presupuesto: r2(presupuesto), invertible: r2(invest), umbral: r2(thr), cash: r2(cash), cashCuenta: r2(accCash), gestionado: r2(managedVal), capital: R.ledger.cap, reajuste: A.reajuste, orders, notas, objetivo, firma, estado: orders.length ? "pendiente" : "sin-cambios" } };
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
  if (ys) { try { const y = await yahoo(ys); if (!y.cur || y.cur === cur || (cur === "GBX" && /GBp/i.test(y.cur))) return { px: y.px, cur, src: "Yahoo " + ys }; } catch (e) { log("Precio: Yahoo no respondió; pruebo otra fuente"); } }
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
      const r = await fetch(`${env("REAL_TEST") === "1" && /^http:\/\/127\.0\.0\.1/.test(env("STOOQ_BASE")) ? env("STOOQ_BASE") : "https://stooq.com"}/q/l/?s=${encodeURIComponent(st.toLowerCase())}&f=sd2t2c&h&e=csv`, { signal: AbortSignal.timeout(15000) });
      const row = (await r.text()).trim().split("\n")[1] || "", c = +row.split(",")[4];
      if (r.ok && c > 0 && !(cur === "GBX" && /\.uk$/.test(st) && c < 5)) return { px: c, cur, src: "Stooq " + st };
    } catch (e) { log("Precio: Stooq no respondió"); }
  }
  // último recurso: el precio de la última orden ejecutada de ese ETF (máx. 10 días); se compra un 3% menos por si ha subido
  const lastO = (REAL_ORDERS || []).find((o) => o.t === t && o.px > 0 && /ejecutada/.test(o.estado) && Date.now() - Date.parse(o.ts) < 10 * 864e5);
  if (lastO) return { px: lastO.px * 1.03, cur, src: `última orden del ${String(lastO.ts).slice(0, 10)} (+3% de margen)` };
  return null;
}
async function execute(T, A, R, plan, ctx, rep) {
  const res = [], m = madrid();
  REAL_ORDERS = R.orders || [];
  R.pendBot = R.pendBot || [];
  const ordered = [...plan.orders.filter((o) => o.side === "VENTA"), ...plan.orders.filter((o) => o.side === "COMPRA")];
  let positions = ctx.positions, fx = null, sellsDone = false, spent = 0;
  // dinero del bot al empezar esta revisión: ninguna revisión puede comprar más que esto (más lo que cobre en sus ventas)
  const eq0 = botEquity(R, ctx.positions, +((ctx.account.cash && ctx.account.cash.availableToTrade) || 0)).eq;
  for (const o of ordered) {
    const inst = Object.values(ctx.map).find((x) => x.t === o.t) || {};
    const us = /_US_EQ$/.test(o.t);
    const skip = (estado, err) => { res.push({ ...o, estado, err }); rep.push(`- ${o.side} ${o.t}: ${estado} · ${err}`); };
    if (us && (!m.wk || m.min < 15 * 60 + 35 || m.min > 21 * 60 + 55)) { skip("aplazada", "acción de EE. UU.: se envía con la bolsa de Nueva York abierta (15:35-21:55 hora de España)"); continue; }
    if (!us && !euOpen(m)) { skip("aplazada", xetraHoliday(m.date) ? "hoy es festivo en la bolsa de Fráncfort: se hará en el próximo día de bolsa" : "la bolsa europea está cerrada (las órdenes se envían de 9:05 a 17:20, hora de España): se hará en la próxima revisión con la bolsa abierta"); continue; }
    if (o.side === "COMPRA" && !sellsDone) {
      sellsDone = true;
      if (res.some((x) => x.side === "VENTA" && x.estado === "ejecutada")) {
        try { await sleep(5200); ctx.account = await T.call("GET", "/equity/account/summary"); positions = await T.call("GET", "/equity/positions"); ctx.positions = positions; } catch (e) { rep.push("  · no pude refrescar el efectivo tras las ventas: " + explainT212(e)); }
      }
    }
    let qty;
    if (o.side === "VENTA") qty = -o.qty;
    else {
      const acc = +((ctx.account.cash && ctx.account.cash.availableToTrade) || 0) - spent;
      const cashNow = Math.min(R.ledger.cash, acc);
      const amt = Math.min(o.eur, cashNow - 0.3);
      if (amt < A.minOrden) { skip("omitida", `al bot solo le quedan ${eur(Math.max(0, cashNow))} libres (cuenta ${eur(Math.max(0, acc))})`); continue; }
      if (!fx && inst.cur && inst.cur !== "EUR") fx = await fxRates();
      const pr = await priceOf(o.t, ctx.map, positions, fx);
      if (!pr) { skip("omitida", "no encontré un precio fiable para calcular las participaciones"); continue; }
      const rate = pr.cur === "EUR" ? 1 : fx && fx[pr.cur];
      if (!rate) { skip("omitida", "no tengo el cambio € → " + pr.cur); continue; }
      qty = (amt * rate * 0.99) / pr.px;
      o.pxEst = pr.px; o.pxSrc = pr.src; o.eur = r2(amt);
    }
    // ---- guardas de seguridad: si algo no cuadra, NO se envía ----
    {
      const lot = R.ledger.lots[o.t], pos = (positions || []).find((x) => x.instrument && x.instrument.ticker === o.t), why = [];
      if (o.side === "VENTA") {
        const aq = Math.abs(qty);
        if (!lot || aq > lot.q + 1e-6) why.push(`vendería ${qtyTxt(aq)} participaciones y el bot solo tiene ${qtyTxt(lot ? lot.q : 0)}`);
        if (pos && aq > (+pos.quantityAvailableForTrading || 0) + 1e-6) why.push("más participaciones de las disponibles en tu cuenta");
      } else {
        const bought = spent + o.eur;
        if (!(o.eur > 0) || bought > eq0 * 1.02 + 0.5) why.push(`las compras de esta revisión (${eur(bought)}) superarían el dinero del bot (${eur(eq0)})`);
        const ref = (pos && +pos.currentPrice > 0 && +pos.currentPrice) || ((REAL_ORDERS || []).find((x) => x.t === o.t && x.px > 0 && /ejecutada/.test(x.estado) && Date.now() - Date.parse(x.ts) < 10 * 864e5) || {}).px;
        if (ref && o.pxEst > 0 && Math.abs(o.pxEst / ref - 1) > 0.15) why.push(`el precio obtenido (${o.pxEst}) se aleja más de un 15% del último conocido (${ref}): precio sospechoso`);
      }
      if (why.length) { res.push({ ...o, estado: "error", err: "bloqueada por seguridad: " + why.join("; ") }); rep.push(`- ✋ ${o.side} ${o.t}: bloqueada por seguridad · ${why.join("; ")}`); continue; }
    }
    rep.push(`- ${new Date().toISOString().slice(11, 19)} UTC · enviando ${o.side} ${o.t} · ${qtyTxt(Math.floor(Math.abs(qty) * 1e4) / 1e4)} participaciones${o.side === "COMPRA" ? ` (~${eur(o.eur)} a ${o.pxEst} ${inst.cur || ""}, precio de ${o.pxSrc})` : ""}`);
    R.prec = R.prec || {};
    const p = await placeMarket(T, o.t, qty, false, rep, R.prec[o.t]);
    if (p.ok && p.dec != null) R.prec[o.t] = p.dec;
    if (!p.ok) { res.push({ ...o, estado: "error", err: p.err }); rep.push("  ✖ " + p.err); continue; }
    const f = await waitFill(T, p.o), st = String(f.status || "");
    let estado = /^FILLED$/.test(st) ? "ejecutada" : /FILLED\?/.test(st) ? "ejecutada" : /CANCEL|REJECT/.test(st) ? "rechazada" : "pendiente";
    const r = { ...o, id: p.o.id, qtyEnv: Math.abs(p.qty), estado, fillQty: f.filledQuantity, fillPx: f.price, eurReal: f.net != null ? Math.abs(+f.net) : null, nota: f.nota || (p.dudosa ? "confirmada tras perder la respuesta" : ""), hora: new Date().toISOString() };
    if (estado === "ejecutada") {
      const q = +f.filledQuantity || Math.abs(p.qty), amt = r.eurReal != null ? r.eurReal : o.side === "COMPRA" ? o.eur : o.eur;
      const a = applyFill(R, o.side, o.t, q, amt, { px: f.price || o.pxEst, id: p.o.id, d: m.date, why: o.why });
      r.coste = a.coste; r.pnl = a.pnl; if (r.eurReal == null) r.nota = (r.nota ? r.nota + " · " : "") + "importe estimado (Trading 212 aún no da el definitivo)";
      if (o.side === "COMPRA") spent += amt;
    } else if (estado === "pendiente") {
      R.pendBot.push({ id: p.o.id, t: o.t, side: o.side, qty: Math.abs(p.qty), eur: o.eur, ts: new Date().toISOString(), plan: plan.id });
      if (o.side === "COMPRA") spent += o.eur;
      r.nota = "Trading 212 aún no la ha ejecutado (¿bolsa cerrada?): se comprobará y apuntará en la próxima ejecución";
    } else if (estado === "rechazada") r.err = "Trading 212 la ha " + (/REJECT/.test(st) ? "rechazado" : "cancelado") + " (" + st + ")";
    res.push(r);
    rep.push(`  ${estado === "ejecutada" ? "✔" : estado === "rechazada" ? "✖" : "⏳"} ${estado}${f.price ? ` a ${f.price}` : ""}${r.eurReal != null ? ` · ${eur(r.eurReal)}` : ""}${r.pnl != null ? ` · resultado ${seur(r.pnl)}` : ""}${r.nota ? ` · ${r.nota}` : ""}${r.err ? ` · ${r.err}` : ""}`);
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
    p.reajuste === "desvio" ? `- Se reajusta una posición si se desvía más de ${eur(p.umbral)} de su peso.` : `- Como en la simulación: solo opera cuando el método cambia su cartera (o hay dinero nuevo), no por pequeñas variaciones de precio.`, "", "### Cartera objetivo del método"];
  for (const o of p.objetivo) L.push(`- ${o.sym} ${(o.w * 100).toFixed(1)}% → ${o.t ? o.t : "✖ " + o.disp}${o.why ? " · " + o.why : ""}`);
  if (!p.objetivo.length) L.push("- (vacía: todo en efectivo)");
  L.push("", `### Órdenes (${p.orders.length})`);
  for (const o of p.orders) L.push(`- ${o.side === "COMPRA" ? "🟢 COMPRAR" : "🔴 VENDER"} ${o.t}${o.sym ? ` (señal ${o.sym})` : ""} · ${o.side === "VENTA" ? qtyTxt(o.qty) + " participaciones" + (o.full ? " (todo)" : "") + " · ≈ " : "≈ "}${eur(o.eur)} · ${o.why}`);
  if (!p.orders.length) L.push("- Ninguna: la cartera ya se parece a la del método.");
  if (p.notas.length) { L.push("", "### Notas"); p.notas.forEach((n) => L.push("- " + n)); }
  return L.join("\n");
}

// ---------- rentabilidad del bot (descontando aportaciones y retiradas) y comparación con la simulación ----------
// Rentabilidad «ponderada en el tiempo»: cada día cuenta lo que ha variado el dinero del bot SIN contar lo que le has dado o quitado ese día.
export function twr(days) {
  const D = (days || []).filter((x) => x.be != null), out = [];
  let idx = 1;
  for (let i = 0; i < D.length; i++) {
    const x = D[i], prev = D[i - 1];
    if (prev && prev.be > 0) { const r = (x.be - (x.bf || 0)) / prev.be; if (isFinite(r) && r > 0) idx *= r; }
    out.push({ d: x.d, i: idx, be: x.be, bc: x.bc });
  }
  return out;
}
export function simCompare(R, S, key) {
  const B = S && S.books && S.books[key], T = twr(R.days);
  if (!B || !B.days || !B.days.length || T.length < 2) return null;
  const d0 = T[0].d, e = B.days, at = (d) => { let v = null; for (const x of e) { if (x.d <= d) v = x.eq; else break; } return v; };
  const e0 = at(d0) ?? e[0].eq, e1 = e[e.length - 1].eq;
  return e0 > 0 ? { d0, ret: (e1 / e0 - 1) * 100, hasta: e[e.length - 1].d } : null;
}
export function resumen(R, S, A) {
  const T = twr(R.days), D = (R.days || []).filter((x) => x.be != null), last = D[D.length - 1], acc = (R.days || []).filter((x) => x.v > 0).pop();
  if (!last) return null;
  let pk = -Infinity, dd = 0; for (const x of T) { pk = Math.max(pk, x.i); dd = Math.min(dd, x.i / pk - 1); }
  const prev = D.length > 1 ? D[D.length - 2] : null, O = R.orders || [];
  const key = (A && A.metodo) || (S && S.main) || "sect", sim = S ? simCompare(R, S, key) : null, L = R.ledger || {};
  return { d0: D[0].d, cap: last.bc, be: last.be, res: r2(last.be - last.bc), pct: T.length ? (T[T.length - 1].i - 1) * 100 : 0, dia: prev ? r2(last.be - prev.be - (last.bf || 0)) : null,
    dd: dd * 100, real: L.real || 0, nOrd: O.filter((o) => o.estado === "ejecutada").length, nBad: O.filter((o) => /error|rechazada/.test(o.estado)).length, key, sim,
    cashBot: last.bcash, invBot: r2(last.be - (last.bcash || 0)), v: acc ? acc.v : null, ap: acc ? acc.ap : null, cash: acc ? acc.cash : null };
}
function resumenMd(R, S, A) {
  const x = resumen(R, S, A);
  if (!x) return "";
  const L = ["", "## Resumen del bot (su subcuenta dentro de tu cuenta)", "",
    `- Desde el ${x.d0}: el bot trabaja con **${eur(x.cap)}** tuyos · ahora vale **${eur(x.be)}** · resultado **${seur(x.res)}** · rentabilidad ${pct(x.pct)} (sin contar aportaciones ni retiradas)`,
    `- Último día: ${x.dia != null ? seur(x.dia) : "—"} · peor caída desde el máximo: ${pct(x.dd)} · ganancia realizada en ventas: ${seur(x.real)}`,
    `- Invertido por el bot ${eur(x.invBot)} · efectivo del bot ${eur(x.cashBot)} · órdenes ejecutadas ${x.nOrd}${x.nBad ? ` · con error o rechazadas ${x.nBad}` : ""}`,
    `- Tu cuenta de Trading 212 entera: ${eur(x.v)}${x.ap != null ? ` · ingresado neto ${eur(x.ap)}` : ""} · efectivo libre ${eur(x.cash)}`];
  if (x.sim && (R.days || []).length > 1) L.push(`- Mismo método en la simulación desde el ${x.sim.d0}: ${pct(x.sim.ret)} · bot real: ${pct(x.pct)} → diferencia ${pct((x.pct || 0) - x.sim.ret)} (precio, ETF europeo en vez del de EE. UU., cambio €/$ y momento de ejecución)`);
  return L.join("\n");
}
function semanaMd(R, S, A, m) {
  const t0 = Date.parse(m.date) - 7 * 864e5, D = (R.days || []).filter((x) => x.be != null);
  const first = D.filter((x) => Date.parse(x.d) <= t0).pop() || D[0], last = D[D.length - 1], wk = D.filter((x) => Date.parse(x.d) > t0);
  const ords = (R.orders || []).filter((o) => Date.parse(o.ts) > t0), L = [`## Semana del ${new Date(t0 + 864e5).toISOString().slice(0, 10)} al ${m.date}`, ""];
  if (first && last) {
    const flow = wk.reduce((t, x) => t + (x.bf || 0), 0) - (first === wk[0] ? first.bf || 0 : 0), g = r2(last.be - first.be - flow);
    L.push(`- Dinero del bot: ${eur(first.be)} → ${eur(last.be)}${flow ? ` (le diste ${flow > 0 ? "+" : ""}${eur(flow)})` : ""} · resultado de la semana **${seur(g)}** (${pct(first.be > 0 ? (g / first.be) * 100 : 0)})`);
  }
  L.push(`- Órdenes esta semana: ${ords.length}${ords.length ? "" : " (ninguna: el método no ha cambiado su cartera)"}`);
  ords.forEach((o) => L.push(`  - ${String(o.ts).slice(0, 16).replace("T", " ")} UTC · ${o.side === "COMPRA" ? "🟢" : "🔴"} ${o.side} ${o.t}${o.sym ? " (" + o.sym + ")" : ""} · ${eur(o.eur)} · ${o.estado}${o.pnl != null ? ` · resultado ${seur(o.pnl)}` : ""}${o.err ? " · " + o.err : ""}`));
  L.push("", "### Lo que tiene el bot ahora");
  const lots = Object.entries((R.ledger && R.ledger.lots) || {});
  lots.forEach(([t, l]) => { const p = (R.positions || []).find((x) => x.t === t), u = p && p.q > 0 ? p.val / p.q : 0; L.push(`- ${t} · ${p ? p.name : ""} · ${qtyTxt(l.q)} participaciones · costó ${eur(l.cost)} · vale ${eur(l.q * u)} · ${seur(l.q * u - l.cost)}`); });
  if (!lots.length) L.push("- Nada: todo en efectivo.");
  return L.join("\n");
}

// ---------- programa principal ----------
async function main() {
  const PW = env("REAL_VIEW_PASS");
  const LC = await loadCfg(path.join(ROOT, "real-ajustes.json"), [PW, env("REAL_VIEW_PASS_OLD")]);
  const A = LC.cfg;
  const now = NOWF(), m = madrid(now);
  if (!PW) {
    // privacidad: sin contraseña no se lee ni se publica nada de la cuenta (el repositorio es público)
    if (EVENT === "schedule" && !A.on) { log("Cartera real sin configurar: nada que hacer."); return; }
    const msg = "Falta la contraseña de la cartera real (REAL_VIEW_PASS). Por privacidad el bot no consulta tu cuenta ni guarda nada hasta que la pongas en 💶 Real → Ajustes de la cartera real.";
    log(msg); await ntfy("✖ Cartera real: falta la contraseña", msg, 4); await mail("✖ Cartera real: falta la contraseña", msg);
    process.exitCode = 1; return;
  }
  if (LC.error) {
    const msg = "No puedo leer los ajustes de la cartera real: la contraseña REAL_VIEW_PASS no coincide con la que los cifró. No opero.";
    log(msg); await ntfy("✖ Cartera real: ajustes ilegibles", msg, 4); await mail("✖ Cartera real: ajustes ilegibles", msg);
    process.exitCode = 1; return;
  }
  let R;
  try { R = await loadReal(); } catch (e) { if (A.on || EVENT !== "schedule") { await ntfy("✖ Cartera real: error", String(e.message), 4); await mail("✖ Cartera real: error", String(e.message)); } throw e; }
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
    let account, positions, pending;   // positions puede refrescarse tras conciliar
    try {
      account = await T.call("GET", "/equity/account/summary");
      positions = (await T.call("GET", "/equity/positions")) || [];
      pending = (await T.call("GET", "/equity/orders")) || [];
    } catch (e) { estado = "error"; titulo = "No pude conectar con Trading 212"; rep.push(explainT212(e)); aviso = { title: "✖ Cartera real: sin conexión con Trading 212", msg: explainT212(e), prio: 4 }; return; }
    const { id: _id, ...acc } = account || {};   // el número de cuenta no se guarda
    R.account = { ...acc, at: now.toISOString() };
    R.positions = mapPos(positions, R);
    R.pending = pending.map((o) => ({ id: o.id, t: o.ticker || (o.instrument && o.instrument.ticker), side: o.side, type: o.type, q: o.quantity, status: o.status, at: o.createdAt }));
    if (acc.currency && acc.currency !== "EUR") rep.push(`⚠️ La divisa principal de tu cuenta es ${acc.currency}: los importes se muestran en esa divisa aunque ponga €.`);

    // subcuenta del bot: primero se miran las órdenes que quedaron pendientes, después el capital y las participaciones
    const notasL = [];
    ensureLedger(R, A, positions, m, notasL);
    if ((R.pendBot || []).length) { rep.push("## Órdenes que estaban pendientes", ""); await reconcile(T, R, rep); rep.push(""); try { positions = (await T.call("GET", "/equity/positions")) || positions; } catch {} }
    syncLots(R, positions, m, notasL);
    R.positions = mapPos(positions, R); noteSeen(R, positions);
    // ingresos y retiradas de TU cuenta (no cambian el dinero del bot: para eso está «Dinero que trabaja el bot»)
    try {
      const prevNet = R.deposits ? R.deposits.net : null;
      const tx = await T.pages("/equity/history/transactions?limit=50", 20);
      let net = 0, n = 0;
      for (const x of tx) { const a = Math.abs(+x.amount || 0); if (x.type === "DEPOSIT") { net += a; n++; } else if (x.type === "WITHDRAW") { net -= a; n++; } else if (x.type === "TRANSFER") { net += +x.amount || 0; n++; } }
      R.deposits = { net: r2(net), n, at: now.toISOString() };
      if (prevNet != null && Math.abs(net - prevNet) > 0.004) {
        const d = r2(net - prevNet);
        R.cuenta = (R.cuenta || []); R.cuenta.unshift({ ts: now.toISOString(), eur: d, net: r2(net) });
        notasL.push(d > 0 ? `Has ingresado ${eur(d)} en tu cuenta de Trading 212. El bot NO lo usa: sigue trabajando con ${eur(A.limite)} más sus ganancias. Si quieres que invierta también lo nuevo, sube «Dinero que trabaja el bot».` : `Has retirado ${eur(-d)} de tu cuenta de Trading 212. Si el efectivo libre queda por debajo del del bot, este usará solo lo que haya.`);
        aviso = { title: d > 0 ? `💶 Cartera real: has ingresado ${eur(d)}` : `💶 Cartera real: has retirado ${eur(-d)}`, msg: notasL[notasL.length - 1], prio: 3 };
      }
    } catch (e) { rep.push("· No pude leer los ingresos y retiradas (se usa el último dato): " + explainT212(e)); }
    if (notasL.length) rep.push("## Movimientos de dinero", "", ...notasL.map((x) => "- " + x), "");

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
    const BE = botEquity(R, positions, cash);
    R.days.push({ d: m.date, t: now.toISOString(), v: total, cash: r2(cash), inv: r2(inv), ap: aport, be: BE.eq, bc: R.ledger.cap, bf: (R.flows || {})[m.date] || 0, bcash: R.ledger.cash, foto: tipo === "foto" || undefined });
    R.days.sort((a, b) => (a.d < b.d ? -1 : 1));
    R.last = now.toISOString();
    head.push(`- Bot: trabaja con ${eur(R.ledger.cap)} · vale ${eur(BE.eq)} (${seur(BE.eq - R.ledger.cap)}) · invertido ${eur(BE.inv)} · efectivo del bot ${eur(R.ledger.cash)}${R.ledger.cash < -0.5 ? " (negativo: tiene invertido más que su capital, p. ej. porque lo has bajado; esta revisión vende la diferencia)" : ""} · ganancia realizada ${eur(R.ledger.real)}`,
      `- Tu cuenta de Trading 212: ${eur(total)} · efectivo libre ${eur(cash)} · invertido ${eur(inv)}${aport != null ? ` · ingresado neto ${eur(aport)}` : ""}`);

    // freno por pérdidas: se mide con la RENTABILIDAD del bot (no cuenta lo que le das o le quitas), desde el inicio o desde que pulsaste «Reanudar»
    const T1 = twr(R.days), iNow = T1.length ? T1[T1.length - 1].i : 1;
    if (R.lossRef && R.lossRef.i == null) R.lossRef = null;   // formato de versiones anteriores
    if (R.rearm) { R.lossRef = { i: iNow, d: m.date }; delete R.rearm; }
    const iRef = R.lossRef ? R.lossRef.i : 1, caida = (iNow / iRef - 1) * 100, refTxt = R.lossRef ? `el ${R.lossRef.d}, cuando reanudaste` : "que empezó";
    if (caida < -A.maxPerdida && !R.paused) {
      R.paused = { ts: now.toISOString(), why: `la rentabilidad del bot ha caído un ${pct(caida)} desde ${refTxt} (el límite es −${A.maxPerdida}%)` };
      aviso = { title: "⛔ Cartera real en PAUSA automática", msg: `El bot deja de operar: ${R.paused.why}. Revísalo y pulsa «Reanudar» en la web si quieres seguir.`, prio: 5 };
    }

    if (tipo === "foto") {
      titulo = "Foto diaria del valor"; rep.push(`Guardado para la gráfica: el bot vale ${eur(BE.eq)} y tu cuenta ${eur(total)}.`);
      if (m.fri && A.semanal && R.lastWeekly !== m.date) {
        const b = getBot();
        titulo = "Informe semanal de la cartera real"; rep.push("", semanaMd(R, b.S, A, m)); R.lastWeekly = m.date;
        const x = resumen(R, b.S, A);
        aviso = aviso || { title: `📊 Cartera real · semana`, msg: `El bot vale ${eur(BE.eq)}${x ? ` · desde el inicio ${seur(x.res)} (${pct(x.pct)})` : ""}${x && x.sim ? `\nSimulación del mismo método: ${pct(x.sim.ret)}` : ""}\nÓrdenes de la semana: ${(R.orders || []).filter((o) => Date.now() - Date.parse(o.ts) < 7 * 864e5).length}`, prio: 3, tags: ["bar_chart"] };
      }
      return;
    }
    if (tipo === "probar") {
      titulo = "Prueba de conexión con Trading 212 ✔";
      rep.push(`Conexión correcta con Trading 212 (${A.env === "demo" ? "demo" : "cuenta real"}). Divisa de la cuenta: ${acc.currency || "—"}.`, `Posiciones: ${positions.length} · órdenes pendientes: ${pending.length} · instrumentos disponibles: ${R.inst ? R.inst.n : "—"}.`, "", "## ¿Se puede operar todo lo que usa el bot?", "", mapTable(R.map));
      // v19: qué productos de los métodos existen en TU cuenta (para saber qué métodos se pueden usar en real)
      try {
        const okS = Object.values(R.map).filter((x) => x.t), noS = Object.values(R.map).filter((x) => !x.t);
        rep.push("", "## Productos disponibles en tu cuenta", "", `- Encontrados (${okS.length}): ` + okS.map((x) => `${x.sym} → ${x.short || x.t}`).join(", "),
          `- No encontrados (${noS.length}): ` + (noS.map((x) => `${x.sym} (${x.why})`).join("; ") || "ninguno"), "");
      } catch {}
      aviso = aviso || { title: "✔ Cartera real: conexión correcta con Trading 212", msg: `Cuenta ${eur(total)} · efectivo libre ${eur(cash)} · el bot trabaja con ${eur(R.ledger.cap)} · ${Object.values(R.map).filter((x) => x.t).length} de ${Object.keys(R.map).length} activos disponibles.`, prio: 3 };
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
      R.approved = { firma: plan.firma, metodo: plan.metodo, ts: now.toISOString(), d: m.date };
      if (!ejecutar) { titulo = "Nada que ejecutar"; R.applied = { metodo: plan.metodo, tgtD: plan.tgtD, d: m.date }; rep.push("", "Al recalcular, ya no hace falta ninguna orden."); return; }
    } else if (R.approved && plan.orders.length && R.approved.firma === plan.firma && R.approved.metodo === plan.metodo && Date.now() - Date.parse(R.approved.ts) < 4 * 864e5) {
      ejecutar = true; rep.push("", `Ya aprobaste estas órdenes el ${R.approved.d}, pero entonces la bolsa estaba cerrada: se ejecutan ahora sin volver a preguntarte.`);
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
    const ok = res.filter((x) => x.estado === "ejecutada"), bad = res.filter((x) => x.estado === "error" || x.estado === "rechazada"), later = res.filter((x) => x.estado === "aplazada"), omit = res.filter((x) => x.estado === "omitida"), pendQ = res.filter((x) => x.estado === "pendiente");
    if (!later.length) R.approved = null;
    for (const x of res) R.orders.unshift({ ts: x.hora || new Date().toISOString(), d: m.date, side: x.side, t: x.t, sym: x.sym, name: x.name, eur: x.eurReal != null ? r2(x.eurReal) : x.eur, qty: Math.abs(+(x.fillQty || x.qtyEnv || x.qty || 0)) || null, px: x.fillPx || x.pxEst || null, pxFuente: x.pxSrc || null, coste: x.coste ?? null, pnl: x.pnl ?? null, estado: x.estado, err: x.err || x.nota || "", why: x.why, id: x.id || null, plan: plan.id, metodo: plan.metodo, modo: tipo === "aprobar" || R.approved ? "aprobada" : "auto", env: A.env, cashBot: R.ledger.cash });
    plan.estado = bad.length ? "con-errores" : "ejecutada"; plan.res = res.map((x) => ({ t: x.t, side: x.side, estado: x.estado, err: x.err || "" }));
    R.planHist.unshift({ ...plan, fin: new Date().toISOString() });
    if (!later.length) R.lastNormal = m.date;
    if (!bad.length && !later.length && !omit.length) R.applied = { metodo: plan.metodo, tgtD: plan.tgtD, d: m.date };
    if (bad.length) estado = "error";
    titulo = `${ok.length} ${ok.length === 1 ? "orden ejecutada" : "órdenes ejecutadas"}${bad.length ? ` · ${bad.length} con error` : ""}${pendQ.length ? ` · ${pendQ.length} pendientes en Trading 212` : ""}${later.length ? ` · ${later.length} aplazadas (bolsa cerrada)` : ""}${omit.length ? ` · ${omit.length} omitidas` : ""}`;
    aviso = { title: `${bad.length ? "✖" : later.length && !ok.length ? "⏳" : "💶"} Cartera real: ${titulo}`, msg: res.map((x) => `${x.side === "COMPRA" ? "🟢" : "🔴"} ${x.side} ${x.t}${x.sym ? " (" + x.sym + ")" : ""} · ${x.estado}${x.eurReal != null ? " · " + eur(x.eurReal) : x.eur ? " · ≈" + eur(x.eur) : ""}${x.pnl != null ? ` · resultado ${seur(x.pnl)}` : ""}${x.err ? " · " + x.err : ""}\n   ${String(x.why || "").slice(0, 120)}`).join("\n") + `\n\nMétodo: ${plan.metodoNombre} · ${A.env === "demo" ? "DEMO" : "dinero real"}`, prio: bad.length ? 5 : 4 };
    // posiciones tras ejecutar
    // foto del valor tras ejecutar (la de arriba es de antes de las órdenes)
    try {
      await sleep(5200); const a2 = await T.call("GET", "/equity/account/summary");
      const c2 = +((a2.cash && a2.cash.availableToTrade) || 0), i2 = +((a2.investments && a2.investments.currentValue) || 0), r2v = +((a2.cash && a2.cash.reservedForOrders) || 0) + +((a2.cash && a2.cash.inPies) || 0);
      let ps2 = positions; try { await sleep(1200); ps2 = (await T.call("GET", "/equity/positions")) || positions; } catch {}
      const be2 = botEquity(R, ps2, c2);
      const dd = R.days.find((x) => x.d === m.date); if (dd) Object.assign(dd, { v: r2(c2 + i2 + r2v), cash: r2(c2), inv: r2(i2), be: be2.eq, bcash: R.ledger.cash, t: new Date().toISOString() });
      const { id: _i2, ...acc2 } = a2 || {}; R.account = { ...acc2, at: new Date().toISOString() };
    } catch {}
    try { const ps = await T.call("GET", "/equity/positions"); R.positions = mapPos(ps, R); noteSeen(R, ps); } catch {}
  } catch (e) {
    estado = "error"; titulo = "Error inesperado"; rep.push("✖ " + String((e && e.stack) || e).slice(0, 800));
    log("Error inesperado (detalle en el informe cifrado)");
    aviso = { title: "✖ Cartera real: error", msg: String((e && e.message) || e).slice(0, 500), prio: 4 };
  } finally {
    if (!titulo) titulo = estado;
    let resu = "";
    try { const b = R.days.length ? getBot() : {}; resu = resumenMd(R, b.S, A); } catch {}
    const md = [...head, "", `## ${titulo}`, "", ...rep].join("\n") + "\n" + (resu ? resu + "\n" : "");
    let avTxt = "";
    if (!aviso && A.avisos !== "importante") {
      const x = (() => { try { return resumen(R, (R.days.length ? getBot() : {}).S, A); } catch { return null; } })();
      const ex = {
        normal: "Revisión diaria hecha.", foto: "Foto del valor de la cuenta guardada.", aprobar: "Tu aprobación se ha procesado.", rechazar: "Propuesta rechazada: no se ha enviado nada.",
        probar: "Prueba de conexión hecha.", reanudar: "Pausa quitada: el bot vuelve a operar.",
      }[tipo] || "Ejecución hecha.";
      aviso = { title: `${estado === "error" ? "✖" : "💶"} Cartera real · ${titulo}`, msg: `${ex}${x ? `\nValor ${eur(x.v)}${x.res != null ? ` · ${seur(x.res)} (${pct(x.pct)})` : ""}` : ""}${R.lastPlan && tipo === "normal" && R.lastPlan.notas && R.lastPlan.notas.length ? "\n" + R.lastPlan.notas[R.lastPlan.notas.length - 1].slice(0, 200) : ""}`, prio: estado === "error" ? 4 : 2, tags: [] };
    }
    if (aviso) {
      // modo discreto: el aviso al móvil no lleva importes, tickers ni posiciones (el correo y la web sí)
      const dTitle = A.discreto ? String(aviso.title).replace(/[−+-]?\d[\d.,]*\s?€/g, "").replace(/\s*·\s*$/, "").replace(/:\s*$/, "").trim() : aviso.title;
      const dMsg = A.discreto ? "Detalle completo en tu correo y en la web (pestaña 💶 Real)." : aviso.msg;
      const n = A.movil || aviso.prio >= 5 || estado === "error" ? await ntfy(dTitle, dMsg, aviso.prio, aviso.tags || []) : "· móvil apagado en ajustes";
      const c = A.correo || estado === "error" ? await mail(aviso.title, md) : "· correo apagado en ajustes";
      avTxt = `\n## Avisos\n- Móvil: ${n}\n- Correo: ${c}\n`;
    }
    R.reports.unshift({ id: now.toISOString().replace(/[:.]/g, "-") + "-" + tipo, ts: now.toISOString(), tipo, estado, titulo, md: md + avTxt });
    // los registros de GitHub Actions son públicos: solo una línea sin datos (el informe completo va cifrado a la web y por correo)
    const pub = `Cartera real · ${tipo} · ${estado} · informe guardado cifrado en la web${aviso ? " · avisos enviados" : ""}`;
    try { if (env("GITHUB_STEP_SUMMARY")) appendFileSync(env("GITHUB_STEP_SUMMARY"), pub + "\n"); } catch {}
    log(pub);
    if (env("REAL_DEBUG_LOCAL") && !REPO) console.log(md + avTxt);   // solo en pruebas en el ordenador
    try { await publishReal(R); }
    catch (e) {
      // no se pudo guardar en GitHub: para no perder nada, te llega el informe completo por correo
      const msg = "No pude guardar el historial de la cartera real en GitHub (" + String(e.message).slice(0, 120) + "). Te envío el informe completo para que no se pierda; en la próxima ejecución se intenta de nuevo.";
      log(msg); await ntfy("✖ Cartera real: no se pudo guardar el historial", msg, 5); await mail("✖ Cartera real: no se pudo guardar el historial · informe completo", msg + "\n\n" + md + avTxt);
      process.exitCode = 1;
    }
    if (estado === "error") process.exitCode = 1;
  }
}
// lo que se vio en esta ejecución (para detectar desdoblamientos la próxima vez)
function noteSeen(R, ps) { R.seen = Object.fromEntries((ps || []).map((p) => [p.instrument.ticker, { q: +p.quantity || 0, avg: +p.averagePricePaid || 0, d: new Date().toISOString() }])); }
// posiciones de la cuenta con lo que es del bot (bq, botCost) y lo que es tuyo
function mapPos(ps, R) {
  const L = (R.ledger && R.ledger.lots) || {};
  return (ps || []).map((p) => { const t = p.instrument.ticker, q = +p.quantity || 0, lot = L[t], bq = lot ? Math.min(q, lot.q) : 0;
    return { t, name: p.instrument.name, cur: p.instrument.currency, isin: p.instrument.isin, q, qa: p.quantityAvailableForTrading, avg: p.averagePricePaid, px: p.currentPrice, val: p.walletImpact && p.walletImpact.currentValue, cost: p.walletImpact && p.walletImpact.totalCost, pnl: p.walletImpact && p.walletImpact.unrealizedProfitLoss, fx: p.walletImpact && p.walletImpact.fxImpact, desde: p.createdAt, bq: +bq.toFixed(8), botCost: lot ? r2(lot.cost * (lot.q > 0 ? bq / lot.q : 0)) : 0 }; });
}
function oneLine(o) { return `${o.side === "COMPRA" ? "🟢 COMPRAR" : "🔴 VENDER"} ${o.t}${o.sym ? " (" + o.sym + ")" : ""} · ≈ ${eur(o.eur)}`; }

export { resolveMap, yahooSym, madrid, loadBot };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("ERROR:", String((e && e.message) || e).slice(0, 300)); process.exit(1); });
}
