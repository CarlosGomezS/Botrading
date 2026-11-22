// v1.0 · R6-10 · 🔒 en los ajustes de Bitvavo/OKX (ctl.json, rama pública «bitvavo-ctl») lo que habla de TU dinero va CIFRADO con tu contraseña
//   dentro del propio archivo (campo «priv»): cuánto dinero usa cada cuenta (capital), las criptos que marcas como tuyas (conservar) y la que pides
//   pasar a euros (convertir). En claro solo queda lo que no dice nada de tu dinero: encendida/parada, método, riesgo, motivo…
//   Antes todo iba en claro y cualquiera podía leer cuánto dinero real tenía cada exchange y qué criptos tienes aparte del bot.
//   Lectura: se descifra «priv» y se junta (lo cifrado manda). Un ctl.json antiguo con esos datos en claro se sigue leyendo y se limpia al guardar.
import { encrypt, decrypt } from "./real-cfg.mjs";

const PRIV_TOP = ["capital"], PRIV_CTA = ["capital", "conservar", "convertir"];
const clon = (x) => JSON.parse(JSON.stringify(x == null ? {} : x));

// separa un ctl completo en { pub, priv }; priv = { capital?, cuentas: { ex: { capital?, conservar?, convertir? } } }
export function separa(ctl) {
  const pub = clon(ctl), priv = { cuentas: {} }; delete pub.priv; delete pub.privOk;
  for (const k of PRIV_TOP) if (k in pub) { priv[k] = pub[k]; delete pub[k]; }
  for (const [ex, c] of Object.entries(pub.cuentas || {})) {
    if (!c || typeof c !== "object") continue;
    for (const k of PRIV_CTA) if (k in c) { (priv.cuentas[ex] = priv.cuentas[ex] || {})[k] = c[k]; delete c[k]; }
  }
  return { pub, priv };
}

// junta lo público con lo privado ya descifrado
export function junta(pub, priv) {
  const out = clon(pub); delete out.priv; if (!priv || typeof priv !== "object") return out;
  for (const k of PRIV_TOP) if (k in priv) out[k] = priv[k];
  for (const [ex, c] of Object.entries(priv.cuentas || {})) { out.cuentas = out.cuentas || {}; out.cuentas[ex] = { ...(out.cuentas[ex] || {}), ...c }; }
  return out;
}

const vacio = (p) => !p || (!PRIV_TOP.some((k) => k in p) && !Object.values(p.cuentas || {}).some((c) => c && Object.keys(c).length));

// ctl.json tal y como está en la rama → ctl completo. Sin contraseña (o si no se puede descifrar): lo público, con privOk = false.
export async function abreCtl(ctl, pw) {
  if (!ctl || typeof ctl !== "object") return ctl;
  if (!ctl.priv || !ctl.priv.c) { const o = clon(ctl); o.privOk = true; return o; }
  if (!pw) { const o = junta(ctl, null); o.privOk = false; return o; }
  try { const o = junta(ctl, JSON.parse(await decrypt(ctl.priv, pw))); o.privOk = true; return o; } catch (e) { const o = junta(ctl, null); o.privOk = false; return o; }
}

// ctl completo → lo que se publica (sin nada privado en claro). Sin contraseña NUNCA se escribe lo privado: lanza.
// Si el ctl se leyó sin poder descifrar (privOk === false), se conserva el «priv» cifrado que había, sin tocarlo.
export async function cierraCtl(ctl, pw, privAnterior = null) {
  const okLeido = ctl && ctl.privOk !== false; const { pub, priv } = separa(ctl);
  if (!okLeido) { if (privAnterior) pub.priv = privAnterior; return pub; }
  if (vacio(priv)) return pub;
  if (!pw) throw new Error("sin contraseña no se pueden guardar los ajustes privados (capital y criptos tuyas)");
  pub.priv = { enc: 1, v: 1, ...(await encrypt(JSON.stringify(priv), pw)) };
  return pub;
}

// descifra los campos privados que manda la app (cambio.enc) y los junta al cambio
export async function abreCambio(cambio, pw) {
  const c = { ...(cambio || {}) }; if (!c.enc) return c;
  if (!pw) throw new Error("el cambio viene cifrado y no hay contraseña");
  const p = JSON.parse(await decrypt(c.enc, pw)); delete c.enc;
  for (const k of ["capital", "conservar", "convertir"]) if (k in p) c[k] = p[k];
  return c;
}
