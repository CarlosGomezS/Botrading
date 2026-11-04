// v240 · guarda lo que eliges en la tarjeta 💶 Dinero real (método, dónde opera, cuánto dinero, parar/seguir) en la rama «bitvavo-ctl».
// Lo lanza la app (cripto-ctl.yml): así basta con que tu token pueda lanzar flujos; no necesita permiso para escribir en el repositorio.
import { leer, publicar } from "./bitvavo.mjs";
const SUBS = ["mix", "eq", "turbo", "mixokx"], EXS = ["bitvavo", "okx"];
let c = {}; try { c = JSON.parse(process.env.CAMBIO || "{}"); } catch (e) { console.log("Cambio no válido"); process.exit(1); }
const ctl = (await leer("ctl.json", "bitvavo-ctl")) || { copia: "mix", parado: false, capital: 50, ex: "bitvavo" };
if (c.copia != null) { if (!SUBS.includes(c.copia)) throw new Error("método no válido"); ctl.copia = c.copia; }
if (c.ex != null) { if (!EXS.includes(c.ex)) throw new Error("exchange no válido"); ctl.ex = c.ex; }
if (c.capital != null) { const v = Math.round(+c.capital); if (!(v >= 10 && v <= 100000)) throw new Error("cantidad no válida"); ctl.capital = v; }
if (c.parado === true) { ctl.parado = true; ctl.motivo = "lo has parado tú"; } else if (c.parado === false) { ctl.parado = false; ctl.motivo = null; }
ctl.t = new Date().toISOString(); publicar("ctl.json", ctl, "bitvavo-ctl");
console.log("Guardado: " + Object.keys(c).join(", "));   // sin importes en el registro público
