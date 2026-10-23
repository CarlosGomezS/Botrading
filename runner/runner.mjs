// Ejecuta el bot (index.html) en un Chromium sin pantalla dentro de GitHub Actions.
// Uso: node runner.mjs daily | backtest | vigilante | test
// Guarda el estado en la rama "data" (state.json) para que la web publicada lo muestre.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MODE = process.argv[2] || "daily";
const EVENT = (process.env.GITHUB_EVENT_NAME || "local").trim();
const ROOT = path.resolve(process.cwd(), "..");
const env = (k) => (process.env[k] || "").trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- hora de Nueva York (para el vigilante) ----------
function nyNow() {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return { min: (+p.hour % 24) * 60 + +p.minute, wk: !/^(Sat|Sun)$/.test(p.weekday) };
}

// ---------- lista blanca de datos que se publican (nunca claves) ----------
const LS_OK = (k) => k === "pb19" || k === "pbh3" || k === "pbi1" || k === "vgidx" || k === "pbReportsFallback" || k.startsWith("vgd:");
function scrubState(S) {
  try {
    if (S && S.mail) { delete S.mail.key; delete S.mail.to; }
    // v75: restos del vigilante retirado
    if (S) { delete S.vix; delete S.ivs; delete S.intra; }
  } catch {}
  return S;
}
// Los informes de más de 30 días conservan su texto (.md) pero pierden los datos pesados (cotizaciones, detalle de operaciones y curvas de la
// prueba histórica), para que el archivo publicado no crezca sin límite (GitHub rechaza archivos de más de 100 MB).
const OLD_MS = 7 * 864e5;   // v75: antes 30 días (el archivo publicado llegó a 60 MB)
function slimReport(v) {
  try {
    // v75: las pruebas históricas guardaban todas las operaciones y curvas de cada método (hasta 26 MB por informe): se publica solo el resumen
    if (v && /^prueba-historica/.test(String(v.status || ""))) {
      const o = { ...v }; delete o.state; delete o.detalle; delete o.markdown;
      if (typeof o.mdInforme === "string" && o.mdInforme.length > 150000) o.mdInforme = o.mdInforme.slice(0, 150000) + "\n\n[… recortado: el detalle completo de operaciones no se publica para que la web cargue rápido]\n";
      return o;
    }
    if (!v || !v.ts || Date.now() - Date.parse(v.ts) < OLD_MS) return v;
    const o = { ...v };
    delete o.state; delete o.detalle; delete o.markdown;
    if (typeof o.mdInforme === "string" && o.mdInforme.length > 40000) o.mdInforme = o.mdInforme.slice(0, 40000) + "\n\n[… recortado por antigüedad (más de 30 días) para no hacer crecer el archivo]\n";
    if (o.datos && typeof o.datos === "object") {
      for (const k of ["cotizaciones", "prueba_historica", "objetivos_por_metodo", "registro_senales_del_dia", "diagnostico", "consultas", "bitacora"]) delete o.datos[k];
    }
    return o;
  } catch { return v; }
}
function slimDay(k, v) {
  try {
    const d = String(k).slice(4);
    if (!v || !Array.isArray(v.scans) || Date.now() - Date.parse(d) < OLD_MS) return v;
    return { ...v, scans: v.scans.map((x) => { const y = { ...x }; delete y.px; delete y.rows; delete y.mv; return y; }) };
  } catch { return v; }
}
function sanitize(dump) {
  const ls = {};
  for (const k of Object.keys(dump.ls || {})) {
    if (!LS_OK(k)) continue;
    let v = dump.ls[k];
    if (k === "pb19") { try { v = JSON.stringify(scrubState(JSON.parse(v))); } catch {} }
    ls[k] = v;
  }
  const idb = {};
  for (const [name, db] of Object.entries(dump.idb || {})) {
    const stores = {};
    for (const [sn, sc] of Object.entries(db.stores)) {
      let rows = sc.rows;
      if (sn === "kv") {
        // "btl:*" (histórico largo descargado para la prueba) y "btpool" solo valen para el día en que se bajan: no se publican
        rows = rows.filter(([k]) => k !== "keys" && !String(k).startsWith("btl:") && k !== "btpool" && !String(k).startsWith("vgd:") && k !== "vgidx");
        rows = rows.map(([k, v]) => [k, k === "S" ? scrubState(v) : String(k).startsWith("vgd:") ? slimDay(k, v) : v]);
      }
      if (sn === "reports") rows = rows.map(([k, v]) => [k, slimReport(v)]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : 1).slice(-150);   // v75: como mucho los 150 informes más recientes
      stores[sn] = { ...sc, rows };
    }
    idb[name] = { version: db.version, stores };
  }
  const secretNames = ["ALPACA_KEY", "TWELVEDATA_KEY", "POLYGON_KEY", "ALPHAVANTAGE_KEY", "FMP_KEY", "SMTP_USER", "SMTP_PASS", "EMAIL", "NTFY_TOPIC", "WEB3FORMS_KEY", "SMTP_HOST", "SMTP_PORT"];
  const secrets = {}; for (const k of secretNames) secrets[k] = !!env(k);
  return { v: 1, savedAt: Date.now(), ls, idb, meta: { secrets } };
}

// ---------- git: rama "data" con un único commit (no crece el historial) ----------
const REPO = env("GITHUB_REPOSITORY");
const TOKEN = env("GITHUB_TOKEN");
const STATE_FILE = path.join(process.cwd(), "state.json");
function sh(cmd, opts = {}) { return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts }); }

function fetchState() {
  try {
    if (!REPO || !TOKEN) throw new Error("sin repo/token (ejecución local)");
    sh(`git -C "${ROOT}" fetch --depth 1 https://x-access-token:${TOKEN}@github.com/${REPO}.git data`);
    writeFileSync(STATE_FILE, sh(`git -C "${ROOT}" show FETCH_HEAD:state.json`, { maxBuffer: 1 << 30 }));
    log("Estado anterior recuperado de la rama data");
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    log("No hay estado anterior en la rama data todavía:", String(e.message).split("\n")[0].slice(0, 120));
    return null;
  }
}

let lastHash = "";
function publish(snap) {
  const txt = JSON.stringify(snap);
  writeFileSync(STATE_FILE, txt);
  const h = createHash("sha1").update(txt.replace(/"savedAt":\d+/g, "")).digest("hex");
  if (h === lastHash) { log("Sin cambios que publicar"); return; }
  if (!REPO || !TOKEN) { log("Ejecución local: estado guardado en", STATE_FILE); lastHash = h; return; }
  const pub = path.join(process.cwd(), ".pub");
  rmSync(pub, { recursive: true, force: true });
  mkdirSync(pub);
  writeFileSync(path.join(pub, "state.json"), txt);
  const g = (c) => sh(`git -C "${pub}" ${c}`);
  g("init -q -b data");
  g('config user.name "bot-trading"');
  g('config user.email "bot-trading@users.noreply.github.com"');
  g("add state.json");
  g(`commit -q -m "estado ${new Date().toISOString()}"`);
  g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git data`);
  lastHash = h;
  log(`Estado publicado (${(txt.length / 1e6).toFixed(2)} MB)`);
}

// ---------- funciones que se ejecutan dentro de la página ----------
async function dumpAll(page) {
  return page.evaluate(async () => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const idb = {};
    const dbs = (indexedDB.databases ? await indexedDB.databases() : []);
    for (const { name } of dbs) {
      const db = await new Promise((ok, no) => { const o = indexedDB.open(name); o.onsuccess = () => ok(o.result); o.onerror = () => no(o.error); });
      const stores = {};
      for (const sn of Array.from(db.objectStoreNames)) {
        const tx = db.transaction(sn, "readonly"), os = tx.objectStore(sn);
        const rows = await new Promise((ok, no) => {
          const out = []; const c = os.openCursor();
          c.onsuccess = () => { const cur = c.result; if (cur) { if (!(typeof cur.key === "string" && cur.key.startsWith("btl:"))) out.push([cur.key, cur.value]); cur.continue(); } else ok(out); };
          c.onerror = () => no(c.error);
        });
        stores[sn] = {
          keyPath: os.keyPath, autoIncrement: os.autoIncrement, rows,
          indexes: Array.from(os.indexNames).map((n) => { const ix = os.index(n); return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; }),
        };
      }
      idb[name] = { version: db.version, stores };
      db.close();
    }
    return { ls, idb };
  });
}

async function restoreAll(page, snap) {
  await page.evaluate(async (snap) => {
    for (const k of Object.keys(snap.ls || {})) localStorage.setItem(k, snap.ls[k]);
    for (const name of Object.keys(snap.idb || {})) {
      const db = snap.idb[name];
      await new Promise((r) => { const d = indexedDB.deleteDatabase(name); d.onsuccess = d.onerror = d.onblocked = () => r(); });
      const conn = await new Promise((ok, no) => {
        const o = indexedDB.open(name, db.version || 1);
        o.onupgradeneeded = () => {
          for (const s of Object.keys(db.stores)) {
            const sc = db.stores[s], p = {};
            if (sc.keyPath != null) p.keyPath = sc.keyPath;
            if (sc.autoIncrement) p.autoIncrement = true;
            const st = o.result.createObjectStore(s, p);
            (sc.indexes || []).forEach((ix) => st.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry }));
          }
        };
        o.onsuccess = () => ok(o.result); o.onerror = () => no(o.error);
      });
      for (const s of Object.keys(db.stores)) {
        const sc = db.stores[s]; if (!sc.rows.length) continue;
        await new Promise((ok, no) => {
          const tx = conn.transaction(s, "readwrite"), os = tx.objectStore(s);
          sc.rows.forEach(([k, v]) => (sc.keyPath != null ? os.put(v) : os.put(v, k)));
          tx.oncomplete = ok; tx.onerror = tx.onabort = () => no(tx.error);
        });
      }
      conn.close();
    }
  }, snap);
}

// ---------- claves y ajustes (solo vienen de los "Secrets" de GitHub) ----------
function keysFromEnv() {
  return { td: env("TWELVEDATA_KEY"), pg: env("POLYGON_KEY"), al: env("ALPACA_KEY"), av: env("ALPHAVANTAGE_KEY"), fm: env("FMP_KEY") };
}
function patchedHtml() {
  let h = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const k = keysFromEnv();
  const swap = (a, b) => { if (!h.includes(a)) throw new Error("No encuentro en index.html: " + a.slice(0, 50)); h = h.replace(a, () => b); };
  swap('email:""', "email:" + JSON.stringify(env("EMAIL")));
  swap('key_w3:""', "key_w3:" + JSON.stringify(env("WEB3FORMS_KEY")));
  swap('ntt:""', "ntt:" + JSON.stringify(env("NTFY_TOPIC")));
  swap('keys:{td:"",pg:"",al:"",av:"",fm:""}', "keys:" + JSON.stringify(k));
  return h;
}

// ---------- ajustes que llegan desde la web (archivo ajustes.json del repositorio) ----------
function loadAjustes() {
  let a = {};
  try { a = JSON.parse(readFileSync(path.join(ROOT, "ajustes.json"), "utf8")); } catch {}
  const vm = [10, 15, 30, 60].includes(+a.vigilante_min) ? +a.vigilante_min : null;
  let bmax = Math.round(+a.bt_max);
  if (!(bmax >= 10)) bmax = 300;
  bmax = Math.min(500, bmax);
  const cfg = {};
  if (a.cfg && typeof a.cfg === "object") for (const k of Object.keys(a.cfg)) if (Number.isFinite(+a.cfg[k])) cfg[k] = +a.cfg[k];
  const main = typeof a.main === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(a.main) ? a.main : "";
  const vgc = {};
  if (a.vgc && typeof a.vgc === "object") {
    const VL = { thr: [0.5, 50], top: [0, 300], trade: [0, 1] };
    for (const k of Object.keys(VL)) { const v = +a.vgc[k]; if (a.vgc[k] != null && Number.isFinite(v) && v >= VL[k][0] && v <= VL[k][1]) vgc[k] = v; }
  }
  const mv = Math.round(+a.mins);
  const mins = Number.isFinite(mv) && mv >= 2 && mv <= 60 ? mv : null;
  const avisos = { movil: 1, correo: 1 };
  if (a.avisos && typeof a.avisos === "object") for (const k of ["movil", "correo"]) if (a.avisos[k] != null && [0, 1].includes(+a.avisos[k])) avisos[k] = +a.avisos[k];
  const cp = Math.round(+a.capital);
  const capital = Number.isFinite(cp) && cp >= 100 && cp <= 1000000 ? cp : null;
  const extra = {};
  if (a.extra && typeof a.extra === "object") {
    const XL = { mon: [0, 1], mc: [0, 1], mv: [0, 1], nt: [0, 1], fx: [0.3, 3] };
    for (const k of Object.keys(XL)) { const v = +a.extra[k]; if (a.extra[k] != null && Number.isFinite(v) && v >= XL[k][0] && v <= XL[k][1]) extra[k] = v; }
  }
  // recálculo único de las comisiones ya pagadas: lo pide la web / el flujo «Ajustes de la nube» con un identificador nuevo
  const recalc = a.recalc && typeof a.recalc.id === "string" && a.recalc.id.length > 0 && a.recalc.id.length <= 80 ? a.recalc.id : "";
  // ajustes de la prueba histórica (web → ajustes.json → bt)
  const bt = { min: Math.min(200, bmax), max: bmax, excl: 0, ini: 1999, acc: 1, auto: 1, sim: [] };
  if (a.bt && typeof a.bt === "object") {
    for (const [k, lo, hi] of [["min", 10, 500], ["max", 10, 500], ["ini", 1999, 2022]]) { const v = Math.round(+a.bt[k]); if (Number.isFinite(v) && v >= lo && v <= hi) bt[k] = v; }
    for (const k of ["acc", "auto"]) if ([0, 1].includes(+a.bt[k])) bt[k] = +a.bt[k];
    { let v = Math.round(+a.bt.excl); if (v === 1) v = 12; if (Number.isFinite(v) && v >= 0 && v <= 40) bt.excl = v; }
    if (Array.isArray(a.bt.sim)) bt.sim = a.bt.sim.filter((k) => typeof k === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(k)).slice(0, 30);
    if (bt.min > bt.max) bt.min = bt.max;
  }
  return { vigilante_min: vm, bt_max: bt.max, cfg, main, vgc, mins, avisos, capital, extra, recalc, bt };
}
// número aleatorio de acciones: entre 200 y el máximo (si el máximo es menor de 200, se usa el máximo)
function btCount(max, min) { const lo = Math.min(min != null ? min : 200, max); return lo + Math.floor(Math.random() * (max - lo + 1)); }

// ---------- avisos: móvil (ntfy) y correo (Web3Forms) ----------
const REPO_PARTS = REPO ? REPO.split("/") : [];
const SITE = REPO_PARTS.length === 2 ? `https://${REPO_PARTS[0]}.github.io/${REPO_PARTS[1]}/` : "";
const MAIL_MAX = 15000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function twice(fn) { try { return await fn(); } catch (e) { await wait(4000); return await fn(); } }

async function sendNtfy(title, message) {
  const topic = env("NTFY_TOPIC");
  if (!topic) return { ok: false, txt: "NO enviado al móvil: falta el secreto NTFY_TOPIC en GitHub (Settings → Secrets and variables → Actions)." };
  try {
    await twice(async () => {
      const body = { topic, title, message: String(message).slice(0, 3500), tags: ["chart_with_upwards_trend"] };
      if (SITE) body.click = SITE;
      const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 120));
    });
    return { ok: true, txt: `enviado al móvil (tema ntfy «${topic.slice(0, 4)}…»)` };
  } catch (e) { return { ok: false, txt: "NO enviado al móvil: " + String(e.message).slice(0, 200) }; }
}
// Correo por SMTP (p. ej. Gmail con «contraseña de aplicación»): funciona desde servidores, a diferencia de Web3Forms gratis.
async function sendMailSmtp(subject, text) {
  const user = env("SMTP_USER"), pass = env("SMTP_PASS");
  if (!user || !pass) return null;
  const to = env("EMAIL") || user, port = +env("SMTP_PORT") || 465;
  try {
    const { default: nodemailer } = await import("nodemailer");
    const tr = nodemailer.createTransport({ host: env("SMTP_HOST") || "smtp.gmail.com", port, secure: port === 465, auth: { user, pass } });
    await twice(() => tr.sendMail({ from: `"Bot Trading Pro" <${user}>`, to, subject, text: String(text).slice(0, MAIL_MAX) }));
    return { ok: true, txt: "correo enviado por SMTP" };
  } catch (e) { return { ok: false, txt: "SMTP falló: " + String(e.message).slice(0, 160) }; }
}
async function sendMail(page, subject, text) {
  const smtp = await sendMailSmtp(subject, text);
  if (smtp && smtp.ok) return smtp;
  const key = env("WEB3FORMS_KEY");
  if (!key) return smtp || { ok: false, txt: "NO enviado el correo: faltan los secretos SMTP_USER y SMTP_PASS (recomendado) o WEB3FORMS_KEY en GitHub (Settings → Secrets and variables → Actions)." };
  let msg = String(text);
  if (msg.length > MAIL_MAX) msg = msg.slice(0, MAIL_MAX) + "\n\n[… recortado: el informe completo está en la web → Informe → Registro]";
  const body = { access_key: key, subject, from_name: "Bot Trading Pro", message: msg };
  const okRes = (st, d) => st < 300 && d && d.success !== false && d.success !== "false";
  let why = "";
  // 1) igual que lo hace la app: desde la página
  try {
    const r = await page.evaluate(async (b) => {
      const r = await fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(b) });
      let d = {}; try { d = await r.json(); } catch {}
      return { st: r.status, d };
    }, body);
    if (okRes(r.st, r.d)) return { ok: true, txt: "correo enviado (Web3Forms: " + String(r.d.message || "ok").slice(0, 80) + ")" };
    why = `desde la página: HTTP ${r.st} ${String((r.d && r.d.message) || "").slice(0, 120)}`;
  } catch (e) { why = "desde la página: " + String(e.message).slice(0, 120); }
  // 2) respaldo: desde el propio servidor de GitHub
  try {
    const r = await fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...(SITE ? { Origin: new URL(SITE).origin, Referer: SITE } : {}) }, body: JSON.stringify(body) });
    let d = {}; try { d = await r.json(); } catch {}
    if (okRes(r.status, d)) return { ok: true, txt: "correo enviado (Web3Forms, vía servidor: " + String(d.message || "ok").slice(0, 80) + ")" };
    why += ` · desde el servidor: HTTP ${r.status} ${String(d.message || "").slice(0, 120)}`;
  } catch (e) { why += " · desde el servidor: " + String(e.message).slice(0, 120); }
  return { ok: false, txt: "NO enviado el correo (" + (smtp ? smtp.txt + " · " : "") + why + ")" };
}
// v24: todo va a Telegram (tu bot). Móvil (ntfy) y correo solo de respaldo si Telegram no está configurado o falla.
async function sendTg(text) {
  const tok = env("TELEGRAM_TOKEN"), chat = env("TELEGRAM_CHAT");
  if (!tok || !chat) return { ok: false, none: true, txt: "Telegram sin configurar (faltan TELEGRAM_TOKEN y TELEGRAM_CHAT)" };
  let last = "";
  for (const w of [0, 3000, 8000, 20000]) {
    if (w) await wait(w);
    try {
      const body = { chat_id: chat, text: String(text).slice(0, 3900), disable_web_page_preview: true, ...(SITE ? { reply_markup: { inline_keyboard: [[{ text: "🌐 Abrir la web", url: SITE }]] } } : {}) };
      const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (r.ok) return { ok: true, txt: "enviado a Telegram" + (w ? " (tras reintentar)" : "") };
      last = "HTTP " + r.status; if ([400, 401, 403].includes(r.status)) break;
    } catch (e) { last = String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 100); }
  }
  return { ok: false, txt: "Telegram falló: " + last };
}
async function avisar(page, rep, { title, short, subject, silent = false, force = false }) {
  if (!silent) {
    const tgr = await sendTg([title, "", short].join("\n"));
    log("Aviso Telegram:", tgr.txt);
    if (tgr.ok) {
      const bloque = `\n\n## Avisos de esta ejecución\n- Telegram: ✔ ${tgr.txt}\n`;
      if (rep && rep.id) { try { await page.evaluate(([id, t]) => __API.appendToReport(id, t), [rep.id, bloque]); } catch {} }
      try { if (env("GITHUB_STEP_SUMMARY")) appendFileSync(env("GITHUB_STEP_SUMMARY"), `\n### ${title}\n${rep && rep.md ? rep.md.slice(0, 60000) : short}${bloque}\n`); } catch {}
      return { n: tgr, m: tgr };
    }
  }
  return avisar0(page, rep, { title, short, subject, silent, force });
}
// respaldo: móvil + correo (como antes) y deja constancia en el propio informe individual.
async function avisar0(page, rep, { title, short, subject, silent = false, force = false }) {
  const body = [short, "", SITE ? "Web: " + SITE : ""].join("\n").trim();
  const mailTxt = ["BOT TRADING PRO · simulación, sin dinero real", title, "", ...(rep && rep.md ? [short, "", "—".repeat(20), "", rep.md] : [short]), "", SITE ? "Web: " + SITE : ""].join("\n");
  // silent: el turno del vigilante deja su informe en la web pero NO manda móvil ni correo (serían demasiados). Los errores sí avisan.
  const off = { ok: false, txt: "no enviado a propósito (los turnos del vigilante no avisan; solo los errores)" };
  // avisos apagados desde la web (Ajustes de la nube): los errores (force) avisan siempre
  const AV = loadAjustes().avisos;
  const offM = { ok: false, txt: "no enviado a propósito (apagado en Ajustes de la nube → avisos al móvil)" };
  const offC = { ok: false, txt: "no enviado a propósito (apagado en Ajustes de la nube → avisos por correo)" };
  const [n, m] = silent ? [off, off] : [(force || AV.movil) ? await sendNtfy(title, body) : offM, (force || AV.correo) ? await sendMail(page, subject, mailTxt) : offC];
  log("Aviso móvil:", n.txt); log("Aviso correo:", m.txt);
  const bloque = silent ? `\n\n## Avisos de esta ejecución\n- Sin aviso al móvil ni correo (turno del vigilante: solo se avisa si hay un error).\n`
    : `\n\n## Avisos de esta ejecución\n- Móvil (ntfy): ${n.ok ? "✔ " : "✖ "}${n.txt}\n- Correo: ${m.ok ? "✔ " : "✖ "}${m.txt}\n`;
  if (rep && rep.id) { try { await page.evaluate(([id, t]) => __API.appendToReport(id, t), [rep.id, bloque]); } catch (e) { log("No se pudo anotar el aviso en el informe:", String(e.message).slice(0, 120)); } }
  try { if (env("GITHUB_STEP_SUMMARY")) appendFileSync(env("GITHUB_STEP_SUMMARY"), `\n### ${title}\n${rep && rep.md ? rep.md.slice(0, 60000) : short}${bloque}\n`); } catch {}
  return { n, m };
}
const grab = (md, re) => { const x = String(md || "").match(re); return x ? x[1].trim() : ""; };
function shortDaily(r) {
  const val = grab(r.md, /Valor cartera principal: ([^\n]+)/), ops = grab(r.md, /## Operaciones de este informe \((\d+)\)/);
  // v24: en Telegram, además, la lista de operaciones de la cartera ficticia (sin el motivo largo)
  const sec = grab(r.md, /## Operaciones de este informe \(\d+\)\n((?:- [^\n]*\n?)+)/).split("\n").filter((x) => x && !/\(ninguna\)/.test(x)).map((x) => x.replace(/ · .*$/, ""));
  const list = sec.length ? "\n" + sec.slice(0, 20).join("\n") + (sec.length > 20 ? `\n… y ${sec.length - 20} más (en la web)` : "") : "";
  return [`${r.status}${r.message ? ": " + r.message : ""}`.slice(0, 400), val && "Cartera: " + val, ops !== "" && ops + " operaciones nuevas" + list].filter(Boolean).join("\n");
}
function shortBt(r) {
  const rk = grab(r.md, /### Ranking por rentabilidad anual compuesta\n((?:- [^\n]*\n?)+)/).split("\n").slice(0, 4).join("\n");
  return [`${r.status}: ${r.message || ""}`.slice(0, 400), rk && "Mejores (rentab. anual):\n" + rk].filter(Boolean).join("\n");
}

// ---------- arranque del navegador con el estado anterior ----------
async function boot() {
  const keys = keysFromEnv();
  if (!Object.values(keys).some(Boolean)) log("AVISO: no hay ninguna clave de datos en los Secrets. Sin clave solo funcionan las fuentes gratuitas sin clave (Yahoo/Stooq) y el vigilante NO podrá consultar.");
  const snap0 = fetchState();
  const html = patchedHtml();
  const browser = await chromium.launch({ args: ["--no-sandbox"], ...(env("CHROMIUM_PATH") ? { executablePath: env("CHROMIUM_PATH") } : {}) });
  const ctx = await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1200, height: 900 } });
  await ctx.route("https://app.local/**", (route) => {
    const u = new URL(route.request().url());
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: u.pathname === "/blank" ? "<!doctype html><title>x</title>" : html });
  });
  await ctx.addInitScript(() => {
    window.__RUNNER = true;
    // el aviso de fin de actualización / prueba histórica lo envía el runner (con el informe); aquí se silencia el duplicado
    // También se silencian los avisos propios de la página (p. ej. «posible entrada en X» del vigilante, uno por consulta): el único que avisa es el runner.
    window.__NOTIFY_QUIET = /./;
    try { localStorage.setItem("pbt", String(Date.now())); } catch {}   // evita el arranque automático de "Actualizar" al abrir
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("pageerror:", String(e.message).slice(0, 200)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto("https://app.local/blank");
  if (snap0) await restoreAll(page, snap0);
  await page.goto("https://app.local/");
  await page.waitForFunction(() => window.__loaded === true, null, { timeout: 120000 });
  await sleep(4000);
  const bootstrap = path.join(ROOT, "backup-inicial.json");
  if (!snap0 && existsSync(bootstrap)) {
    log("Primera ejecución: importando backup-inicial.json con la función de restaurar de la app");
    await page.evaluate((t) => { restoreFrom(t); }, readFileSync(bootstrap, "utf8"));
    await sleep(5000);
    await page.goto("https://app.local/");
    await page.waitForFunction(() => window.__loaded === true, null, { timeout: 120000 });
    await sleep(4000);
  }
  // capital inicial editado desde la web: si no coincide con el actual, se reinician las cuentas (la app archiva antes una copia)
  try {
    const cap = loadAjustes().capital;
    if (cap) {
      const r = await page.evaluate(async (c) => {
        if (typeof START !== "number" || START === c) return "";
        const antes = START; await resetAccounts(c); return "capital " + antes + " → " + c + " (cuentas reiniciadas)";
      }, cap);
      if (r) log("Ajustes de la web aplicados:", r);
    }
  } catch (e) { log("No se pudo aplicar el capital:", String(e.message).slice(0, 160)); }
  // métodos que el usuario pasó de la prueba histórica a la cartera ficticia (ajustes.json → bt.sim) y ajustes de la prueba
  try {
    const bt = loadAjustes().bt;
    const r = await page.evaluate(async (o) => (typeof __API !== "undefined" && __API.setBt ? (await __API.setBt(o)).sim.join(",") : ""), bt);
    if (r) log("Métodos pasados a la cartera ficticia:", r);
  } catch (e) { log("No se pudieron aplicar los ajustes de la prueba:", String(e.message).slice(0, 160)); }
  // correo automático de la app, notificaciones y cambio €/$ (ajustes.json → extra)
  try {
    const ex = loadAjustes().extra || {};
    if (Object.keys(ex).length) {
      const r = await page.evaluate(async (x) => {
        const done = [];
        if (x.mon != null || x.mc != null || x.mv != null) { const M = mailGet(); if (x.mon != null) M.on = !!x.mon; if (x.mc != null) M.c = !!x.mc; if (x.mv != null) M.v = !!x.mv; mailSet(M); done.push("correo app"); }
        if (x.nt != null) { try { localStorage.setItem("pbnc", x.nt ? "1" : "0"); const el = document.querySelector("#nt"); if (el) el.checked = !!x.nt; done.push("nt=" + x.nt); } catch {} }
        if (x.fx != null && S.fx !== x.fx) { S.fx = x.fx; await save(); done.push("fx=" + x.fx); }
        return done;
      }, ex);
      if (r.length) log("Ajustes de la web aplicados (extra):", r.join(", "));
    }
  } catch (e) { log("No se pudieron aplicar los ajustes extra:", String(e.message).slice(0, 160)); }
  // ajustes editados desde la web (ajustes.json → cfg): se aplican a los parámetros del bot antes de cada ejecución
  try {
    const cfg = loadAjustes().cfg || {};
    if (Object.keys(cfg).length) {
      const r = await page.evaluate(async (c) => {
        const okK = FIELDS.map((f) => f[0]), done = [], bad = [];
        for (const k of Object.keys(c)) {
          const v = +c[k], lim = LIM[k];
          if (!okK.includes(k) || !Number.isFinite(v) || (lim && (v < lim[0] || v > lim[1]))) { bad.push(k + "=" + c[k]); continue; }
          if (CFG[k] !== v) { CFG[k] = v; done.push(k + "=" + v); }
        }
        if (done.length) { S.cfg = { ...CFG }; await save(); }
        return { done, bad };
      }, cfg);
      log("Ajustes de la web aplicados:", r.done.join(", ") || "sin cambios", r.bad.length ? "· rechazados (fuera de rango): " + r.bad.join(", ") : "");
    }
  } catch (e) { log("No se pudieron aplicar los ajustes de la web:", String(e.message).slice(0, 160)); }
  // recalcular la cartera con la comisión vigente (una sola vez por cada identificador nuevo de ajustes.json → recalc)
  try {
    const rc = loadAjustes().recalc;
    if (rc) {
      const r = await page.evaluate(async (id) => {
        if (typeof recalcFees !== "function") return "";
        if (S.feeRecalcId === id) return "";
        try { await archiveReport("antes-de-recalcular-comision", "Copia automática antes de recalcular la comisión a " + CFG.fee + " €."); } catch {}
        const msg = recalcFees(CFG.fee);
        S.feeRecalcId = id; await save();
        return msg;
      }, rc);
      if (r) log("Recálculo de comisiones:", r);
    }
  } catch (e) { log("No se pudo recalcular la comisión:", String(e.message).slice(0, 200)); }
  // método principal, ajustes del vigilante y tiempo máximo por actualización (también vienen de la web)
  try {
    const A = loadAjustes();
    const r = await page.evaluate(async ([main, vgc, mins]) => {
      const done = [];
      if (main && typeof STR === "object" && STR[main] && S.main !== main) {
        S.main = main;
        const B = (S.books || {})[S.main];
        if (B && Array.isArray(S.days)) S.days.forEach((z) => { const y = B.days.find((d) => d.d === z.d); if (y) z.eq = y.eq; });
        done.push("método principal=" + main); await save();
      }
      let vchg = false;
      if (vgc.thr != null && VGC.thr !== vgc.thr) { VGC.thr = vgc.thr; vchg = true; done.push("vigilante.thr=" + vgc.thr); }
      if (vgc.top != null && VGC.top !== vgc.top) { VGC.top = vgc.top; vchg = true; done.push("vigilante.top=" + vgc.top); }
      if (vgc.trade != null && VGC.trade !== !!vgc.trade) { VGC.trade = !!vgc.trade; vchg = true; done.push("vigilante.trade=" + !!vgc.trade); }
      if (vchg) vgSave();
      if (mins) { const el = document.querySelector("#mins"); if (el) { el.value = String(mins); done.push("tiempo máximo=" + mins + " min"); } }
      return done;
    }, [A.main, A.vgc || {}, A.mins]);
    if (r.length) log("Ajustes de la web aplicados (método/vigilante/tiempo):", r.join(", "));
  } catch (e) { log("No se pudieron aplicar método/vigilante/tiempo:", String(e.message).slice(0, 160)); }
  await page.evaluate(() => {
    try { localStorage.setItem("pbt", String(Date.now())); } catch {}
    // seguimiento de reintentos automáticos de "Actualizar"
    const _as = autoSchedule; autoSchedule = function (ms, why) { window.__retryAt = Date.now() + ms; return _as.apply(this, arguments); };
  });
  return { browser, page };
}

const DEADLINE = (+env("JOB_DEADLINE") || 0) * 1000 || Date.now() + 5.5 * 3600e3;

// ---------- programa principal ----------
async function main() {
  const AJ = loadAjustes();
  if (MODE === "vigilante") { log("El vigilante se ha retirado (v74): nada que hacer."); return; }
  const { browser, page } = await boot();
  const snapshot = async () => sanitize(await dumpAll(page));
  const t0 = Date.now(), startIso = new Date(t0).toISOString();
  let rep = null, titleTxt = "", subj = "", shortTxt = "", vgOps = [];
  try {
    if (MODE === "daily") {
      log("Lanzando «Actualizar precios y que el bot decida»");
      await page.evaluate(() => { run(); });
      const MAX = Math.max(20 * 60e3, Math.min(150 * 60e3, DEADLINE - Date.now() - 60 * 60e3));
      let lastPub = Date.now(), timedOut = false;
      for (;;) {
        await sleep(15000);
        const st = await page.evaluate(() => ({
          busy: !!busy,
          pending: !!(window.__retryAt && Date.now() < window.__retryAt + 4000),
          msg: (document.querySelector("#st") || {}).textContent || "",
        }));
        if (!st.busy && !st.pending) { log("Actualización terminada:", st.msg.slice(0, 200)); break; }
        if (Date.now() - t0 > MAX) { log("Tiempo máximo alcanzado; se guarda lo avanzado (continuará mañana)."); timedOut = true; break; }
        if (Date.now() - lastPub > 20 * 60e3) { try { publish(await snapshot()); } catch (e) { log("publicación intermedia falló:", e.message.slice(0, 160)); } lastPub = Date.now(); }
      }
      await sleep(3000);
      rep = await page.evaluate((s) => __API.newestReport(s), startIso);
      if (!rep || timedOut) {
        const msg = timedOut ? "La actualización no terminó en el tiempo disponible de este turno; lo descargado queda guardado y continúa en la próxima ejecución." : "La actualización terminó sin generar su informe habitual.";
        const it = await page.evaluate(([m]) => __API.custom("actualizacion-incompleta", m, null, null), [msg]);
        rep = await page.evaluate((s) => __API.newestReport(s), startIso);
        if (!rep && it) rep = { id: it.id, status: it.status, message: it.message, md: it.mdInforme };
      }
      titleTxt = "Bot Trading: actualización diaria · " + rep.status;
      subj = "Bot Trading · Actualización diaria · " + rep.status;
      shortTxt = shortDaily(rep);
    } else if (MODE === "backtest") {
      const n = btCount(AJ.bt.max, AJ.bt.min);
      log(`Prueba histórica: ${AJ.bt.acc ? n + " acciones al azar (entre " + AJ.bt.min + " y " + AJ.bt.max + ")" : "sin acciones sueltas"}${AJ.bt.excl ? " · sin las " + AJ.bt.excl + " que más subieron" : ""} · desde ${AJ.bt.ini}`);
      await page.evaluate(async (o) => { if (__API.setBt) await __API.setBt(o); else __API.setBtMax(o.n); }, { ...AJ.bt, n });
      await page.evaluate(() => { btRun(); });
      const MAX = Math.max(10 * 60e3, DEADLINE - Date.now() - 5 * 60e3);
      let lastPub = Date.now(), timedOut = false;
      await sleep(20000);
      for (;;) {
        const st = await page.evaluate(() => __API.state());
        const r = await page.evaluate((s) => __API.newestReport(s), startIso);
        if (!st.btBusy && !st.btPend && r && /^prueba-historica/.test(r.status)) { rep = r; log("Prueba histórica terminada:", st.btst.slice(0, 200)); break; }
        if (Date.now() - t0 > MAX) { log("Tiempo máximo alcanzado en la prueba histórica."); timedOut = true; break; }
        if (Date.now() - lastPub > 20 * 60e3) { try { publish(await snapshot()); } catch (e) { log("publicación intermedia falló:", e.message.slice(0, 160)); } lastPub = Date.now(); }
        await sleep(15000);
      }
      if (!timedOut && rep && rep.id && rep.status === "prueba-historica-completada") {
        const sum = await page.evaluate(() => __API.btSummary());
        const head = `\n## Resumen de la prueba histórica de hoy\n\n- Acciones pedidas al azar: **${AJ.bt.acc ? n : 0}** (entre ${AJ.bt.min} y ${AJ.bt.max})${AJ.bt.excl ? " · sin las " + AJ.bt.excl + " que más subieron" : ""} · desde ${AJ.bt.ini}\n`;
        await page.evaluate(([id, t]) => __API.prependToReport(id, t), [rep.id, head + sum]);
        rep = (await page.evaluate((s) => __API.newestReport(s), startIso)) || rep;
      }
      if (timedOut) {
        const st = await page.evaluate(() => __API.state());
        const msg = `La prueba histórica de ${n} acciones no terminó en el tiempo disponible (${st.btst || "sin detalle"}). Se repetirá mañana con otra muestra.`;
        const it = await page.evaluate(([m]) => __API.custom("prueba-historica-incompleta", m, null, null), [msg]);
        rep = it ? { id: it.id, status: it.status, message: it.message, md: it.mdInforme } : { status: "prueba-historica-incompleta", message: msg, md: msg };
      }
      titleTxt = "Bot Trading: prueba histórica · " + rep.status.replace("prueba-historica-", "");
      subj = "Bot Trading · Prueba histórica diaria · " + rep.status.replace("prueba-historica-", "") + ` · ${n} acciones`;
      shortTxt = shortBt(rep);
    } else if (MODE === "test") {
      const sec = ["ALPACA_KEY", "TWELVEDATA_KEY", "POLYGON_KEY", "ALPHAVANTAGE_KEY", "FMP_KEY", "TELEGRAM_TOKEN", "TELEGRAM_CHAT"];
      const L = ["# Prueba de avisos", "", `Fecha: ${new Date().toISOString()}`, "", "## Secretos configurados en GitHub (solo si existen o no; nunca su valor)", ""];
      sec.forEach((k) => L.push(`- ${k}: ${env(k) ? "✔ configurado" : "✖ FALTA"}`));
      L.push("", "## Ajustes de la nube", "", `- Vigilante: cada ${AJ.vigilante_min || "(el que tenga guardado la app)"} min`, `- Prueba histórica diaria: entre 200 y ${AJ.bt_max} acciones al azar`);
      const it = await page.evaluate(([md]) => __API.custom("prueba-de-avisos", "Prueba de avisos (Telegram)", md, null), [L.join("\n") + "\n"]);
      rep = { id: it && it.id, status: "prueba-de-avisos", message: "Prueba de avisos", md: L.join("\n") };
      titleTxt = "Bot Trading: PRUEBA de avisos";
      subj = "Bot Trading · PRUEBA de avisos";
      shortTxt = "Si lees esto en Telegram, los avisos del simulador funcionan.\n" + sec.filter((k) => !env(k)).map((k) => "Falta " + k).join("\n");
    } else throw new Error("Modo desconocido: " + MODE);

    await avisar(page, rep, { title: titleTxt, short: shortTxt, subject: subj, silent: MODE === "vigilante" && !vgOps.length });
  } catch (e) {
    // cualquier fallo queda registrado en un informe y avisado
    const msg = `Fallo del proceso automático (${MODE}): ${String(e && e.message || e).slice(0, 400)}`;
    log("ERROR:", msg);
    try {
      const it = await page.evaluate(([m, md]) => __API.custom("error-ejecucion", m, md, null), [msg, `# Error de ejecución (${MODE})\n\n- Hora: ${new Date().toISOString()}\n- ${msg}\n`]);
      await avisar(page, { id: it && it.id, status: "error-ejecucion", message: msg, md: msg }, { title: `Bot Trading: ERROR en ${MODE}`, short: msg, subject: `Bot Trading · ERROR en ${MODE}`, force: true });
    } catch (e2) { await sendNtfy(`Bot Trading: ERROR en ${MODE}`, msg).catch(() => {}); }
    try { publish(await snapshot()); } catch {}
    await browser.close().catch(() => {});
    process.exitCode = 1;
    return;
  }
  publish(await snapshot());
  await browser.close();
}

export { dumpAll, restoreAll, sanitize, patchedHtml, loadAjustes, btCount };
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
}
