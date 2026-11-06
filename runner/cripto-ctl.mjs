// v240 · guarda lo que eliges en la tarjeta 💶 Dinero real (método, dónde opera, cuánto dinero, parar/seguir) en la rama «bitvavo-ctl».
// Lo lanza la app (cripto-ctl.yml): así basta con que tu token pueda lanzar flujos; no necesita permiso para escribir en el repositorio.
import { leer, publicar } from "./bitvavo.mjs";
const SUBS = ["mix", "eq", "turbo", "mixokx", "cuant", "consenso", "eqokx", "turbookx", "auto"], EXS = ["bitvavo", "okx"];
let c = {}; try { c = JSON.parse(process.env.CAMBIO || "{}"); } catch (e) { console.log("Cambio no válido"); process.exit(1); }
const ctl = (await leer("ctl.json", "bitvavo-ctl")) || { copia: "mix", parado: false, capital: 50, ex: "bitvavo" };
// v243 · cada cuenta por separado: { cuenta: "okx", on, copia, capital, parado }
const { cuentas } = await import("./bitvavo-real.mjs");
if (!ctl.cuentas) { const C = cuentas(ctl); ctl.cuentas = Object.fromEntries(EXS.map((e) => [e, { on: C[e].on, copia: C[e].copia, capital: C[e].capital }])); }
if (c.cuenta != null) {
  if (!EXS.includes(c.cuenta)) throw new Error("cuenta no válida");
  const k = (ctl.cuentas[c.cuenta] = ctl.cuentas[c.cuenta] || {});
  if (c.on != null) k.on = !!c.on;
  if (c.adoptar === true) k.adoptarAt = new Date().toISOString();
  if (c.espejo != null) k.espejo = !!c.espejo;
  if (c.convertir != null) { const sym = String(c.convertir).toUpperCase(); if (!/^[A-Z0-9]{2,10}$/.test(sym) || sym === "EUR") throw new Error("cripto no válida"); k.convertir = { sym, at: new Date().toISOString() }; }   // v260 · vender a euros TODO lo de esa cripto   // v256 · 🪞 copiar SIEMPRE todo lo que el método tenga abierto   // v253 · copiar ya lo que el método tiene abierto
  if (c.copia != null) { if (!SUBS.includes(c.copia)) throw new Error("método no válido"); k.copia = c.copia; }
  if (c.capital != null) { const v = Math.round(+c.capital); if (!(v >= 10 && v <= 100000)) throw new Error("cantidad no válida"); k.capital = v; }
  if (c.parado === false || c.on === true) { k.parado = false; k.motivo = null; }
  ctl.t = new Date().toISOString(); publicar("ctl.json", ctl, "bitvavo-ctl");
  console.log("Guardado (cuenta): " + Object.keys(c).join(", ")); process.exit(0);
}
if (c.copia != null) { if (!SUBS.includes(c.copia)) throw new Error("método no válido"); ctl.copia = c.copia; }
if (c.ex != null) { if (!EXS.includes(c.ex)) throw new Error("exchange no válido"); ctl.ex = c.ex; }
if (c.capital != null) { const v = Math.round(+c.capital); if (!(v >= 10 && v <= 100000)) throw new Error("cantidad no válida"); ctl.capital = v; }
if (c.parado === true) { ctl.parado = true; ctl.motivo = "lo has parado tú"; } else if (c.parado === false) { ctl.parado = false; ctl.motivo = null; for (const e of EXS) if (ctl.cuentas[e]) { ctl.cuentas[e].parado = false; ctl.cuentas[e].motivo = null; } }
ctl.t = new Date().toISOString(); publicar("ctl.json", ctl, "bitvavo-ctl");
console.log("Guardado: " + Object.keys(c).join(", "));   // sin importes en el registro público
