// Ajustes de la CARTERA REAL (Trading 212). Se guardan en real-ajustes.json (rama main), CIFRADOS con REAL_VIEW_PASS.
// El repositorio es público: ni este archivo ni los registros de GitHub Actions muestran nunca un valor en claro.
// Lo usan: el flujo «Ajustes de la cartera real» (real-ajustes.yml) para validar lo que llega de la web (también cifrado),
// y el motor real (real.mjs) para leerlos. Lo que se salga de rango se rechaza.
// Uso como script: REAL_JSON='<objeto cifrado o JSON>' REAL_VIEW_PASS=… node real-cfg.mjs ../real-ajustes.json
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";

export const DEF = {
  on: 0,              // 1 = la cartera real está activada
  env: "live",        // live = dinero real · demo = cuenta de práctica de Trading 212
  modo: "confirmar",  // confirmar = propone y esperas a aprobar · auto = ejecuta solo · pausa = solo mira
  metodo: "sect",     // clave interna del método · sect = Rotación de sectores, el único que ha batido al SPY en la prueba histórica
  limite: 100,        // € como máximo que gestiona el bot (aunque haya más dinero en la cuenta)
  minOrden: 5,        // € · no envía órdenes más pequeñas
  umbral: 5,          // % del presupuesto: solo reajusta una posición si se desvía más que esto
  reserva: 2,         // % del presupuesto que se deja siempre en efectivo (margen de precio)
  maxOrdenes: 8,      // órdenes como máximo por ejecución
  maxPerdida: 25,     // % · si la cuenta cae esto desde lo aportado, el bot se pausa solo y avisa
  divisa: "eur",      // eur = solo ETFs que cotizan en euros (sin comisión de cambio) · cualquiera = también en $ o £
  acciones: 1,        // 1 = permite acciones de EE. UU. (si el método las usa)
  movil: 1,           // avisos al móvil (ntfy)
  telegram: 1,        // avisos por Telegram (con botones para aprobar o rechazar); necesita TELEGRAM_TOKEN y TELEGRAM_CHAT
  correo: 1,          // avisos por correo
  avisos: "todo",     // todo = avisa de cada cosa que hace (revisión, foto, aprobación…) · importante = solo órdenes, propuestas, errores e informe semanal
  discreto: 1,        // 1 = los avisos al MÓVIL no llevan importes ni posiciones (ntfy es público para quien adivine el tema); el correo sí lleva el informe completo
  aceptoReal: 0,      // 1 = el usuario confirmó que entiende que es dinero real
  reajuste: "revision", // revision = solo reajusta cuando el método revisa su cartera (igual que la simulación) · desvio = también si un activo se desvía más del umbral
  semanal: 1,         // 1 = informe semanal los viernes (móvil y correo)
  mapa: {},           // sustituciones manuales: {"XLK":"XLKSd_EQ"}
};

const NUM = { limite: [5, 100000], minOrden: [1, 1000], umbral: [1, 50], reserva: [0, 20], maxOrdenes: [1, 30], maxPerdida: [5, 90] };
const BIN = ["on", "acciones", "movil", "telegram", "correo", "aceptoReal", "semanal", "discreto"];
const ENUM = { env: ["live", "demo"], modo: ["confirmar", "auto", "pausa"], divisa: ["eur", "cualquiera"], reajuste: ["revision", "desvio"], avisos: ["todo", "importante"] };

// ---------- cifrado (mismo formato que la web): PBKDF2-SHA256 + AES-256-GCM ----------
// v16: 600 000 iteraciones (recomendación OWASP 2023). El número va guardado con cada dato («it»): lo cifrado antes (250 000) se sigue leyendo.
export const KDF_IT = 600000;
const b64 = (u) => Buffer.from(u).toString("base64"), unb64 = (t) => new Uint8Array(Buffer.from(t, "base64"));
async function kdf(pw, salt, it) {
  const k = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return webcrypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: it, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encrypt(txt, pw) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16)), iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, await kdf(pw, salt, KDF_IT), new TextEncoder().encode(txt));
  return { s: b64(salt), i: b64(iv), c: b64(new Uint8Array(ct)), it: KDF_IT };
}
export async function decrypt(o, pw) {
  const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.i) }, await kdf(pw, unb64(o.s), +o.it || 250000), unb64(o.c));
  return new TextDecoder().decode(pt);
}
// prueba la contraseña actual y, si se acaba de cambiar, la anterior
export async function openAny(o, pws) {
  if (!o || !o.enc) return { j: o, pw: null };
  for (const pw of pws.filter(Boolean)) { try { return { j: JSON.parse(await decrypt(o, pw)), pw }; } catch {} }
  return { error: "no se puede descifrar con la contraseña de la cartera (REAL_VIEW_PASS)" };
}

// Mezcla `inp` sobre `prev` validando cada campo. Devuelve {cfg} o {error}. Los errores no incluyen valores (los registros son públicos).
export function validate(inp, prev = {}) {
  const out = { ...DEF, ...clean(prev) };
  if (!inp || typeof inp !== "object" || Array.isArray(inp)) return { error: "los ajustes deben ser un objeto JSON" };
  for (const [k, v] of Object.entries(inp)) {
    if (NUM[k]) {
      const n = +v;
      if (!Number.isFinite(n) || n < NUM[k][0] || n > NUM[k][1]) return { error: `${k} fuera de rango (${NUM[k][0]} a ${NUM[k][1]})` };
      out[k] = k === "maxOrdenes" ? Math.round(n) : +n.toFixed(2);
    } else if (BIN.includes(k)) {
      if (![0, 1, "0", "1", true, false].includes(v)) return { error: `${k} debe ser 0 o 1` };
      out[k] = +!!(+v);
    } else if (ENUM[k]) {
      if (!ENUM[k].includes(v)) return { error: `${k} no válido` };
      out[k] = v;
    } else if (k === "metodo") {
      if (v !== "" && !/^[A-Za-z0-9_-]{1,40}$/.test(String(v))) return { error: "método no válido" };
      out.metodo = String(v);
    } else if (k === "mapa") {
      if (!v || typeof v !== "object" || Array.isArray(v)) return { error: "mapa debe ser un objeto {SIMBOLO: TICKER_T212}" };
      const m = {};
      for (const [s, t] of Object.entries(v)) {
        if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) return { error: "símbolo no válido en las sustituciones" };
        if (t === "" || t == null) continue;
        if (t !== "-" && !/^[A-Za-z0-9._-]{2,40}$/.test(String(t))) return { error: "ticker de Trading 212 no válido en las sustituciones" };
        m[s] = String(t);
      }
      if (Object.keys(m).length > 60) return { error: "demasiadas sustituciones (máx. 60)" };
      out.mapa = m;
    } else if (k === "savedAt") continue;
    else return { error: "ajuste desconocido: " + String(k).slice(0, 20) };
  }
  if (out.minOrden > out.limite) return { error: "la orden mínima no puede ser mayor que el límite" };
  return { cfg: out };
}
function clean(p) { const o = {}; for (const k of Object.keys(DEF)) if (p && p[k] !== undefined) o[k] = p[k]; return o; }

// Lee real-ajustes.json (cifrado o, si nunca se ha guardado desde la web, los valores por defecto en claro).
export async function loadAsync(file, pws) {
  let a = {};
  try { a = JSON.parse(readFileSync(file, "utf8")); } catch {}
  if (a && a.enc) { const r = await openAny(a, pws); if (r.error) return { cfg: { ...DEF }, error: "ajustes: " + r.error }; a = r.j; }
  const r = validate(clean(a), {});
  return { cfg: r.cfg || { ...DEF } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const file = process.argv[2] || "real-ajustes.json", pw = (process.env.REAL_VIEW_PASS || "").trim(), old = (process.env.REAL_VIEW_PASS_OLD || "").trim();
    if (!pw) { console.error("Falta el secreto REAL_VIEW_PASS (contraseña de la cartera real): por privacidad no se guarda nada sin cifrar."); process.exit(1); }
    let prev = {};
    try { const raw = JSON.parse(readFileSync(file, "utf8")); const r = await openAny(raw, [pw, old]); if (!r.error) prev = r.j || {}; } catch {}
    let inp;
    try { inp = JSON.parse(process.env.REAL_JSON || "{}"); } catch { console.error("Lo recibido no es JSON válido"); process.exit(1); }
    if (inp && inp.enc) { const r = await openAny(inp, [pw, old]); if (r.error) { console.error("No puedo descifrar los ajustes enviados: la contraseña de la web no coincide con REAL_VIEW_PASS."); process.exit(1); } inp = r.j; }
    const r = validate(inp, prev);
    if (r.error) { console.error("Ajuste rechazado: " + r.error); process.exit(1); }
    r.cfg.savedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify({ enc: 1, v: 1, ...(await encrypt(JSON.stringify(r.cfg), pw)) }) + "\n");
    console.log("Ajustes de la cartera real validados y guardados (cifrados).");
  })();
}
