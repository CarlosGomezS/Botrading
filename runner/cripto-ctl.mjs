// v240 · guarda lo que eliges en la tarjeta 💶 Dinero real (método, dónde opera, cuánto dinero, parar/seguir) en la rama «bitvavo-ctl».
// Lo lanza la app (cripto-ctl.yml): así basta con que tu token pueda lanzar flujos; no necesita permiso para escribir en el repositorio.
import { leer, publicar } from "./bitvavo.mjs";
const SUBS = ["mix", "eq", "turbo", "mixokx", "cuant", "consenso", "eqokx", "turbookx", "tend", "cuantokx", "consensookx", "tendokx", "explora", "exploraokx", "auto"], EXS = ["bitvavo", "okx"];
// v1.0 · R6-10 · lo privado (capital, criptos tuyas, convertir) llega CIFRADO desde la app (c.enc) y se guarda cifrado (ctl.priv); en el registro público no aparece
const { abreCtl, cierraCtl, abreCambio } = await import("./ctl-priv.mjs");
const PW = (process.env.REAL_VIEW_PASS || "").trim(), PW_OLD = (process.env.REAL_VIEW_PASS_OLD || "").trim();
let c = {}; try { c = JSON.parse(process.env.CAMBIO || "{}"); } catch (e) { console.log("Cambio no válido"); process.exit(1); }
try { c = await abreCambio(c, PW); } catch (e) { if (PW_OLD) c = await abreCambio(c, PW_OLD); else { console.log("No puedo descifrar el cambio (¿contraseña distinta?)"); process.exit(1); } }
const raw = await leer("ctl.json", "bitvavo-ctl"), privAnt = raw && raw.priv || null;
let ctl = raw ? await abreCtl(raw, PW) : null; if (ctl && ctl.privOk === false && PW_OLD) ctl = await abreCtl(raw, PW_OLD);
if (ctl && ctl.privOk === false && ["capital", "conservar", "convertir"].some((k) => c[k] != null)) { console.log("No puedo descifrar tus ajustes privados: no cambio el capital ni tus criptos (¿contraseña distinta?)"); process.exit(1); }
if (!ctl) ctl = { copia: "mix", parado: false, capital: 50, ex: "bitvavo" };
const guarda = async () => { ctl.t = new Date().toISOString(); publicar("ctl.json", await cierraCtl(ctl, PW, privAnt), "bitvavo-ctl"); };
// v243 · cada cuenta por separado: { cuenta: "okx", on, copia, capital, parado }
const { cuentas } = await import("./bitvavo-real.mjs");
if (!ctl.cuentas) { const C = cuentas(ctl); ctl.cuentas = Object.fromEntries(EXS.map((e) => [e, { on: C[e].on, copia: C[e].copia, capital: C[e].capital }])); }
if (c.cuenta != null) {
  if (!EXS.includes(c.cuenta)) throw new Error("cuenta no válida");
  const k = (ctl.cuentas[c.cuenta] = ctl.cuentas[c.cuenta] || {});
  if (c.on != null) k.on = !!c.on;
  if (c.adoptar === true) k.adoptarAt = new Date().toISOString();
  if (c.espejo != null) k.espejo = !!c.espejo;
  if (c.conservar != null) { const l = (Array.isArray(c.conservar) ? c.conservar : String(c.conservar).split(/[\s,;]+/)).map((x) => String(x).toUpperCase().trim()).filter((x) => /^[A-Z0-9]{2,10}$/.test(x) && x !== "EUR"); k.conservar = [...new Set(l)].slice(0, 30); }   // v295 · 🔒 criptos tuyas que el bot no debe tocar
  if (c.convertir != null) { const sym = String(c.convertir).toUpperCase(); if (!/^[A-Z0-9]{2,10}$/.test(sym) || sym === "EUR") throw new Error("cripto no válida"); k.convertir = { sym, at: new Date().toISOString() }; }   // v260 · vender a euros TODO lo de esa cripto   // v256 · 🪞 copiar SIEMPRE todo lo que el método tenga abierto   // v253 · copiar ya lo que el método tiene abierto
  if (c.copia != null) { if (!SUBS.includes(c.copia)) throw new Error("método no válido"); k.copia = c.copia; }
  if (c.liquidar === true) k.liquidar = new Date().toISOString();   // v319 · 🧹 vender lo de los métodos antiguos (una vez)
  if (c.riesgo != null) { if (!["bajo", "medio", "alto", "auto"].includes(c.riesgo)) throw new Error("riesgo no válido"); k.riesgo = c.riesgo; }   // v318 · 🎚️
  if (c.capital != null) { const v = Math.round(+c.capital); if (!(v >= 10 && v <= 100000)) throw new Error("cantidad no válida"); k.capital = v; }
  if (c.parado === false || c.on === true) { k.parado = false; k.motivo = null; }
  else if (c.parado === true) { k.parado = true; k.motivo = "lo has parado tú"; }   // v438 · ⏹️ parar solo esta cuenta (vende lo que tenga y no compra)
  await guarda();
  console.log("Guardado (cuenta): " + Object.keys(c).join(", ")); process.exit(0);
}
if (c.copia != null) { if (!SUBS.includes(c.copia)) throw new Error("método no válido"); ctl.copia = c.copia; }
if (c.ex != null) { if (!EXS.includes(c.ex)) throw new Error("exchange no válido"); ctl.ex = c.ex; }
if (c.capital != null) { const v = Math.round(+c.capital); if (!(v >= 10 && v <= 100000)) throw new Error("cantidad no válida"); ctl.capital = v; }
if (c.parado === true) { ctl.parado = true; ctl.motivo = "lo has parado tú"; } else if (c.parado === false) { ctl.parado = false; ctl.motivo = null; for (const e of EXS) if (ctl.cuentas[e]) { ctl.cuentas[e].parado = false; ctl.cuentas[e].motivo = null; } }
await guarda();
console.log("Guardado: " + Object.keys(c).join(", "));   // sin importes en el registro público
