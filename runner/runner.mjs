// Ejecuta el bot (index.html) en un Chromium sin pantalla dentro de GitHub Actions.
// Uso: node runner.mjs daily | vigilante
// Guarda el estado en la rama "data" (state.json) para que la web publicada lo muestre.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MODE = process.argv[2] || "daily";
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
  } catch {}
  return S;
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
        rows = rows.filter(([k]) => k !== "keys");
        rows = rows.map(([k, v]) => [k, k === "S" ? scrubState(v) : v]);
      }
      stores[sn] = { ...sc, rows };
    }
    idb[name] = { version: db.version, stores };
  }
  return { v: 1, savedAt: Date.now(), ls, idb };
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
          c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else ok(out); };
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

// ---------- programa principal ----------
async function main() {
  if (MODE === "vigilante") {
    const n = nyNow();
    if (!n.wk || n.min < 9 * 60 || n.min > 16 * 60 + 30) { log("Fuera del horario del vigilante (NY). Nada que hacer."); return; }
  }
  const keys = keysFromEnv();
  if (!Object.values(keys).some(Boolean)) log("AVISO: no hay ninguna clave de datos en los Secrets. Sin clave solo funcionan las fuentes gratuitas sin clave (Yahoo/Stooq) y el vigilante NO podrá consultar.");

  const snap0 = fetchState();
  const html = patchedHtml();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1200, height: 900 } });
  await ctx.route("https://app.local/**", (route) => {
    const u = new URL(route.request().url());
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: u.pathname === "/blank" ? "<!doctype html><title>x</title>" : html });
  });
  await ctx.addInitScript((mode) => {
    window.__RUNNER = true;
    try { localStorage.setItem("pbt", String(Date.now())); } catch {}   // evita el arranque automático de "Actualizar" al abrir
  }, MODE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("pageerror:", String(e.message).slice(0, 200)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  // 1) restaurar el estado anterior en el navegador vacío
  await page.goto("https://app.local/blank");
  if (snap0) await restoreAll(page, snap0);
  // 2) abrir la app
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
  await page.evaluate(() => {
    try { localStorage.setItem("pbt", String(Date.now())); } catch {}
    // seguimiento de reintentos automáticos de "Actualizar"
    const _as = autoSchedule; autoSchedule = function (ms, why) { window.__retryAt = Date.now() + ms; return _as.apply(this, arguments); };
  });

  const snapshot = async () => sanitize(await dumpAll(page));
  const t0 = Date.now();

  if (MODE === "daily") {
    log("Lanzando «Actualizar precios y que el bot decida»");
    await page.evaluate(() => { run(); });
    const MAX = 5.5 * 3600e3;
    let lastPub = Date.now();
    for (;;) {
      await sleep(15000);
      const st = await page.evaluate(() => ({
        busy: !!busy,
        pending: !!(window.__retryAt && Date.now() < window.__retryAt + 4000),
        msg: (document.querySelector("#st") || {}).textContent || "",
      }));
      if (!st.busy && !st.pending) { log("Actualización terminada:", st.msg.slice(0, 200)); break; }
      if (Date.now() - t0 > MAX) { log("Tiempo máximo alcanzado; se guarda lo avanzado (continuará mañana)."); break; }
      if (Date.now() - lastPub > 20 * 60e3) { try { publish(await snapshot()); } catch (e) { log("publicación intermedia falló:", e.message.slice(0, 160)); } lastPub = Date.now(); }
    }
    await sleep(3000);
  } else {
    // vigilante: la propia app consulta cada X minutos mientras haya mercado; aquí solo la mantenemos viva
    await page.evaluate(() => { VGC.on = true; vgSave(); vgRefresh(); });
    log("Vigilante activo");
    const MAX = 55 * 60e3;
    let lastPub = Date.now();
    for (;;) {
      await sleep(30000);
      await page.evaluate(() => { try { localStorage.setItem("pbt", String(Date.now())); } catch {} }).catch(() => {});
      const n = nyNow();
      if (Date.now() - t0 > MAX) { log("Fin del turno de 55 min"); break; }
      if (!n.wk || n.min > 16 * 60 + 30) { log("Mercado cerrado: fin"); break; }
      if (Date.now() - lastPub > 10 * 60e3) { try { publish(await snapshot()); } catch (e) { log("publicación intermedia falló:", e.message.slice(0, 160)); } lastPub = Date.now(); }
    }
    // dejar terminar una consulta en curso
    for (let i = 0; i < 8; i++) { const b = await page.evaluate(() => !!VG.busy).catch(() => false); if (!b) break; await sleep(5000); }
  }

  publish(await snapshot());
  await browser.close();
}

export { dumpAll, restoreAll, sanitize, patchedHtml };
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
}
