// Decide si toca ejecutar la actualización de precios (node hecho.mjs daily) o la prueba histórica (node hecho.mjs bt) en ESTE disparo.
// La prueba histórica solo toca cuando la actualización de hoy ya está hecha (usa sus datos) y aún no se ha intentado hoy.
// Solo usa módulos de Node (no necesita instalar navegador), así que un disparo que no toca termina en segundos.
// Escribe en $GITHUB_OUTPUT: daily=true|false y bt=true|false.
import { execSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const env = (k) => (process.env[k] || "").trim();
const EVENT = env("GITHUB_EVENT_NAME") || "local";

function ny(d) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, wk: !/^(Sat|Sun)$/.test(p.weekday) };
}

// Decisión pura (se puede probar sin red): `reports` = lista de {ts,status} del estado publicado.
export function decide({ event, now, reports }) {
  if (event === "workflow_dispatch") return { daily: true, bt: true, why: "lanzado a mano: se ejecuta todo" };
  const n = ny(now);
  if (!n.wk) return { daily: false, bt: false, why: "fin de semana en Nueva York: no hay sesión nueva" };
  if (n.min < 17 * 60) return { daily: false, bt: false, why: `en Nueva York son las ${Math.floor(n.min / 60)}:${String(n.min % 60).padStart(2, "0")}: aún no ha pasado una hora desde el cierre` };
  // un informe cuenta como «de hoy» si es de la fecha de hoy en Nueva York y posterior al cierre (16:00)
  const hoy = (r) => { try { const t = ny(new Date(r.ts)); return t.date === n.date && t.min >= 16 * 60; } catch { return false; } };
  const doneDaily = reports.some((r) => r.status === "actualizado" && hoy(r));
  const doneBt = reports.some((r) => /^prueba-historica/.test(String(r.status)) && !/-lab$/.test(String(r.status)) && hoy(r));   // las rondas extra del laboratorio no cuentan
  return { daily: !doneDaily, bt: doneDaily && !doneBt, why: `${doneDaily ? "actualización ya hecha hoy" : "actualización pendiente"} · ${doneBt ? "prueba histórica ya intentada hoy" : doneDaily ? "prueba histórica pendiente" : "prueba histórica en espera (primero la actualización)"}` };
}

function reportsFromState() {
  const REPO = env("GITHUB_REPOSITORY"), TOKEN = env("GITHUB_TOKEN");
  if (!REPO || !TOKEN) throw new Error("sin repo/token");
  execSync(`git fetch --depth 1 https://x-access-token:${TOKEN}@github.com/${REPO}.git data`, { stdio: "pipe" });
  const snap = JSON.parse(execSync("git show FETCH_HEAD:state.json", { stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 30 }));
  const out = [];
  for (const db of Object.values(snap.idb || {})) {
    const st = db && db.stores && db.stores.reports;
    if (st) for (const [, v] of st.rows) if (v && v.ts) out.push({ ts: v.ts, status: v.status });
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  let d;
  try {
    d = decide({ event: EVENT, now: new Date(), reports: EVENT === "workflow_dispatch" ? [] : reportsFromState() });
  } catch (e) {
    // si no se puede leer el estado (primera vez, fallo de red...) es más seguro ejecutar que saltarse el día
    d = { daily: true, bt: true, why: "no se pudo leer el estado anterior (" + String(e.message).split("\n")[0].slice(0, 100) + "): se ejecuta por seguridad" };
  }
  const which = (process.argv[2] || "daily") === "bt" ? "bt" : "daily";
  let go = which === "bt" ? d.bt : d.daily;
  // la prueba automática diaria se puede apagar desde la web (ajustes.json → bt.auto = 0); a mano siempre se ejecuta
  if (which === "bt" && go && EVENT !== "workflow_dispatch") { try { const a = JSON.parse(readFileSync("ajustes.json", "utf8")); if (a.bt && +a.bt.auto === 0) { go = false; d.why += " · prueba automática apagada en los ajustes"; } } catch {} }
  console.log(`Decisión (${which === "bt" ? "prueba histórica" : "actualización de precios"}): ${go ? "SÍ toca" : "no toca"} · ${d.why}`);
  if (env("GITHUB_OUTPUT")) appendFileSync(env("GITHUB_OUTPUT"), `go=${go}\n`);
}
