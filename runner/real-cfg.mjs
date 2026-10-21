// Ajustes de la CARTERA REAL (Trading 212). Se guardan en real-ajustes.json (rama main).
// Lo usan: el flujo «Ajustes de la cartera real» (real-ajustes.yml) para validar lo que llega de la web,
// y el motor real (real.mjs) para leerlos. Lo que se salga de rango se rechaza.
// Uso como script: REAL_JSON='{"modo":"auto"}' node real-cfg.mjs ../real-ajustes.json
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEF = {
  on: 0,              // 1 = la cartera real está activada
  env: "live",        // live = dinero real · demo = cuenta de práctica de Trading 212
  modo: "confirmar",  // confirmar = propone y esperas a aprobar · auto = ejecuta solo · pausa = solo mira
  metodo: "sect",     // clave interna del método (vacío = el método principal del bot) · sect = Rotación de sectores, el único que ha batido al SPY en la prueba histórica
  limite: 100,        // € como máximo que gestiona el bot (aunque haya más dinero en la cuenta)
  minOrden: 5,        // € · no envía órdenes más pequeñas
  umbral: 5,          // % del presupuesto: solo reajusta una posición si se desvía más que esto
  reserva: 2,         // % del presupuesto que se deja siempre en efectivo (margen de precio)
  maxOrdenes: 8,      // órdenes como máximo por ejecución
  maxPerdida: 25,     // % · si la cuenta cae esto desde lo aportado, el bot se pausa solo y avisa
  divisa: "eur",      // eur = solo ETFs que cotizan en euros (sin comisión de cambio) · cualquiera = también en $ o £
  acciones: 1,        // 1 = permite acciones de EE. UU. (si el método las usa)
  movil: 1,           // avisos al móvil (ntfy)
  correo: 1,          // avisos por correo
  aceptoReal: 0,      // 1 = el usuario confirmó que entiende que es dinero real
  reajuste: "revision", // revision = solo reajusta cuando el método revisa su cartera (igual que la simulación) · desvio = también si un activo se desvía más del umbral
  semanal: 1,         // 1 = informe semanal los viernes (móvil y correo)
  mapa: {},           // sustituciones manuales: {"XLK":"XLKSd_EQ"}
};

const NUM = { limite: [5, 100000], minOrden: [1, 1000], umbral: [1, 50], reserva: [0, 20], maxOrdenes: [1, 30], maxPerdida: [5, 90] };
const BIN = ["on", "acciones", "movil", "correo", "aceptoReal", "semanal"];
const ENUM = { env: ["live", "demo"], modo: ["confirmar", "auto", "pausa"], divisa: ["eur", "cualquiera"], reajuste: ["revision", "desvio"] };

// Mezcla `inp` sobre `prev` validando cada campo. Devuelve {cfg} o {error}.
export function validate(inp, prev = {}) {
  const out = { ...DEF, ...clean(prev) };
  if (!inp || typeof inp !== "object" || Array.isArray(inp)) return { error: "los ajustes deben ser un objeto JSON" };
  for (const [k, v] of Object.entries(inp)) {
    if (NUM[k]) {
      const n = +v;
      if (!Number.isFinite(n) || n < NUM[k][0] || n > NUM[k][1]) return { error: `${k} fuera de rango (${NUM[k][0]} a ${NUM[k][1]}): ${v}` };
      out[k] = k === "maxOrdenes" ? Math.round(n) : +n.toFixed(2);
    } else if (BIN.includes(k)) {
      if (![0, 1, "0", "1", true, false].includes(v)) return { error: `${k} debe ser 0 o 1` };
      out[k] = +!!(+v);
    } else if (ENUM[k]) {
      if (!ENUM[k].includes(v)) return { error: `${k} no válido: ${v}` };
      out[k] = v;
    } else if (k === "metodo") {
      if (v !== "" && !/^[A-Za-z0-9_-]{1,40}$/.test(String(v))) return { error: "método no válido: " + v };
      out.metodo = String(v);
    } else if (k === "mapa") {
      if (!v || typeof v !== "object" || Array.isArray(v)) return { error: "mapa debe ser un objeto {SIMBOLO: TICKER_T212}" };
      const m = {};
      for (const [s, t] of Object.entries(v)) {
        if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) return { error: "símbolo no válido en el mapa: " + s };
        if (t === "" || t == null) continue;
        if (t !== "-" && !/^[A-Za-z0-9._-]{2,40}$/.test(String(t))) return { error: "ticker de Trading 212 no válido: " + t };
        m[s] = String(t);
      }
      if (Object.keys(m).length > 60) return { error: "demasiadas sustituciones en el mapa (máx. 60)" };
      out.mapa = m;
    } else return { error: "ajuste desconocido: " + k };
  }
  if (out.minOrden > out.limite) return { error: "la orden mínima no puede ser mayor que el límite" };
  return { cfg: out };
}
function clean(p) { const o = {}; for (const k of Object.keys(DEF)) if (p && p[k] !== undefined) o[k] = p[k]; return o; }

export function load(file) {
  let a = {};
  try { a = JSON.parse(readFileSync(file, "utf8")); } catch {}
  const r = validate(clean(a), {});
  return r.cfg || { ...DEF };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] || "real-ajustes.json";
  let prev = {}; try { prev = JSON.parse(readFileSync(file, "utf8")); } catch {}
  let inp; try { inp = JSON.parse(process.env.REAL_JSON || "{}"); } catch { console.error("El texto recibido no es JSON válido"); process.exit(1); }
  const r = validate(inp, prev);
  if (r.error) { console.error("Ajuste rechazado: " + r.error); process.exit(1); }
  writeFileSync(file, JSON.stringify(r.cfg, null, 2) + "\n");
  console.log(JSON.stringify(r.cfg, null, 2));
}
