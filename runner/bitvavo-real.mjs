// v233 · 💶 BITVAVO CON DINERO REAL (50 €): copia a UNO de los submodos de «IA y laboratorio» (el que elijas en la app)
//  · cuando el submodo ficticio compra, aquí se compra la misma proporción del dinero; cuando vende (entera o una parte), también
//  · solo copia compras NUEVAS (de menos de 5 min) y no persigue el precio: si ya ha subido > 1,5 % desde la compra ficticia, no entra
//  · cambiar de submodo en la app → vende lo abierto y empieza a copiar al nuevo
//  · FRENOS: nunca usa más de 50 € (aunque haya más en la cuenta) · ninguna orden de más de 30 € · se para sola y vende todo si el
//    saldo cae un 25 % (por debajo de 37,50 €) · /parar en Telegram o el botón de la app lo detiene al momento
//  · la clave de Bitvavo debe tener SOLO permiso de operar (nunca de retirar): aunque se filtrara, no podría sacar dinero
// Privacidad: el estado va CIFRADO (REAL_VIEW_PASS) en la rama «bitvavo-real»; en público solo el estado (activo/parado), sin importes
// ni criptos. La orden (submodo, parar/seguir) va en la rama «bitvavo-ctl». Nunca se escriben importes en los registros públicos.
import { randomUUID } from "node:crypto";
import { T_ESPERA_D, conP as tortP, describe as tortDesc, tamano as tortTam, perfil as tortPerfil } from "./tortugas.mjs";
// v313 · 🐢 UN SOLO MÉTODO para el dinero real: las TORTUGAS (que aprenden solas en el examen largo). Ni campeón de laboratorio, ni base, ni profesionales:
// lo que ya estaba abierto de esos se sigue vigilando y se vende con sus reglas, pero ya no se compra nada nuevo con ellos.
export const soloT = () => process.env.SOLO_TORT !== "0";   // (las pruebas antiguas del copiado de métodos lo apagan con SOLO_TORT=0)
import { createHmac } from "node:crypto";
import { encrypt, openAny } from "./real-cfg.mjs";

export const FRENO_DIA = 0.10;   // v235 · si en un mismo día pierde un 10 %, vende todo y descansa hasta el día siguiente
export const API = "https://api.bitvavo.com", CAPITAL = 50, FRENO = 0.25, MAX_ORDEN = 30, PERSIGUE = 0.015, OPERADOR = 224224, FEE = 0.0025;
export const SUBS_OK = ["eq", "turbo", "mix", "cuant", "consenso", "tend", "mixokx", "eqokx", "turbookx", "cuantokx", "consensookx", "tendokx", "explora", "exploraokx"];
// v266 · cada exchange elige SOLO entre sus métodos: OKX entre los hechos con criptos de OKX (lo que compran se copia 1 a 1); Bitvavo, entre los de todas
export const FAMILIA = { okx: ["mixokx", "eqokx", "turbookx", "cuantokx", "consensookx", "tendokx"], bitvavo: ["eq", "turbo", "mix", "cuant", "consenso", "tend"] };
// v266 · un cambio de método automático cada 6 h como mucho (salvo que el actual pierda la 🏆): cambiar a menudo es la forma más fácil de perder
// v247 · ⭐ «MUY GANADORA»: además de ganar en los tres tramos de 90 días, gana ≥ 0,6 % por operación en CADA tramo,
// con ≥ 30 operaciones en cada uno y un factor de beneficio ≥ 1,4 (gana 1,4 € por cada € que pierde)
export const MUY = { med: 0.6, n: 30, pf: 1.4 };
export function reglaEnUso(C) { if (!C || C.prueba !== false || !C.genomeId || !C.lab) return null; return (C.lab.pop || []).find((v) => v.id === C.genomeId) || null; }
export function esMuy(v) { const X = v ? [v.a, v.b, v.c] : []; return !!(v && v.ok && X.every((x) => x && x.n >= MUY.n && x.med >= MUY.med && x.pf >= MUY.pf)); }
// 🤖 modo automático: copia al método con regla ganadora más fuerte (primero las ⭐, luego la mejor nota). Para no marear:
// solo cambia cuando no hay nada abierto con dinero real, y solo si el actual ya no gana o el nuevo es claramente mejor (+1 de nota o ⭐ frente a no ⭐)
// v259 · ⭐⭐ ESTABLE: los laboratorios cambian de regla cada pocos minutos, y un método podía ser ⭐⭐ un rato y dejar de serlo al siguiente.
// Para que el dinero real no salte de uno a otro (vendiendo y comprando, pagando comisiones), solo cuenta como ⭐⭐ si lleva ≥ 60 min siéndolo.
export const TAM_COMPRA = 0.10, TAM_MUY = 0.15, TAM_MAX = 0.25, TOPE_INV = 0.60;   // v285 · cada compra ≥ 10 % de la cuenta · nunca más del 60 % invertido
export const STOP_EMERG = 0.10, HUECO_MAX = 0.015, BASE_PCT = 0.35, BASE_STOP = 0.15;   // v291 · stop de emergencia alojado en el exchange: −10 % (el del bot, −6 %, actúa antes)
export const MUY_ESTABLE_MS = 60 * 60000;
export function marcaMuy(S, fuentes, now) { S.muyDesde = S.muyDesde || {}; for (const k of SUBS_OK) { const v = reglaEnUso(fuentes[k]); if (v && esMuy(v)) S.muyDesde[k] = S.muyDesde[k] || now.toISOString(); else delete S.muyDesde[k]; } return S.muyDesde; }
export const PERMANENCIA_MS = 24 * 3600e3;   // v289 · como mucho un cambio de método al día (antes 6 h): menos vaivenes
export const STOP_REAL = 0.06;
// v295 · huella del comité de Consenso: si cambia una regla del comité, cambia lo que hace Consenso → hay que volver a examinarlo
export const huellaComite = (lista, genomeIdDe) => lista.map((o) => genomeIdDe(o) || "-").join(",");
export function estadoExamen(EL, k, fuentes, now = new Date()) {
  const src = fuentes[k], r = EL && EL.res && EL.res[k]; if (!src || !r || !EL.t || !r.t) return "pendiente";
  if (r.v !== VEX_REAL) return "pendiente";   // v297 · un examen con reglas antiguas no vale
  const tEL = Date.parse(EL.t), tR = Date.parse(r.t); if (!(tEL > 0 && tR > 0) || tEL > +now + 600e3 || tR > +now + 600e3) return "pendiente";   // fechas raras o del futuro: no vale
  if (r.genomeId !== src.genomeId) return "pendiente";
  if (r.comite != null) { const lista = /okx$/.test(k) ? COMITE_OKX_R : COMITE_R; const h = huellaComite(lista, (o) => (fuentes[o] && fuentes[o].prueba === false ? fuentes[o].genomeId : null)); if (h !== r.comite) return "pendiente"; }
  if (now - Date.parse(EL.t) > 12 * 3600e3 || now - Date.parse(r.t) > 36 * 3600e3) return "pendiente";
  if (r.ok === true || r.suave === true) return "aprobada"; if (r.ok === false) return "suspendida"; return "pendiente";
}
export const VEX_REAL = 304;   // debe coincidir con VEX de examen-largo.mjs
const COMITE_R = ["eq", "turbo", "mix", "mixokx"], COMITE_OKX_R = ["mixokx", "eqokx", "turbookx", "tendokx"];
export const muchoMejor = (b, c) => !!(b && c && b.k !== c.k && ((b.muy && !c.muy) || (b.s >= c.s * 1.3 && b.s >= c.s + 2)));
export function autoElige(fuentes, actual, abiertas, muyDesde = null, now = new Date(), familia = null, desde = null) {
  const estable = (k, v) => esMuy(v) && (!muyDesde || (muyDesde[k] && now - Date.parse(muyDesde[k]) >= MUY_ESTABLE_MS));
  const lista = familia && familia.length ? familia : SUBS_OK;
  if (familia && familia.length && actual && !familia.includes(actual)) actual = null;   // si venía de otra familia, elige ya dentro de la suya
  const c = lista.map((k) => { const v = reglaEnUso(fuentes[k]); return v ? { k, s: +v.s || 0, muy: estable(k, v) } : null; }).filter(Boolean).sort((a, b) => (b.muy - a.muy) || b.s - a.s);
  const cur = c.find((x) => x.k === actual), best = c[0];
  if (cur && best && best.k !== actual && desde && now - Date.parse(desde) < PERMANENCIA_MS) return { copia: actual, muy: cur.muy, motivo: "lleva poco con este método (se cambia como mucho cada 24 h)" };
  if (!best) return { copia: SUBS_OK.includes(actual) ? actual : lista[0], muy: false, motivo: "ningún método tiene regla ganadora ahora" };
  // v258 · con algo abierto solo espera si el cambio no es urgente: si aparece uno ⭐⭐ muy bueno (y el actual no lo es) o el actual pierde la 🏆, cambia ya
  if (abiertas && SUBS_OK.includes(actual) && cur && !(best.muy && !cur.muy)) return { copia: actual, muy: !!cur.muy, motivo: "espera a cerrar lo abierto para cambiar" };
  // v290 · 🧱 FIEL A SU MÉTODO: mientras el actual conserve su regla ganadora, solo cambia si aparece uno MUCHO mejor
  // (💎 estable frente a uno que no lo es, o una puntuación ≥ 30 % y ≥ 2 puntos mayor). Cada cambio se avisa por Telegram.
  if (cur && !muchoMejor(best, cur)) return { copia: actual, muy: cur.muy, motivo: "se queda con su método (ninguno es MUCHO mejor)" };
  return { copia: best.k, muy: best.muy, motivo: !cur && actual ? "el método anterior ha perdido su regla ganadora" : best.muy ? "💎 MUCHO mejor que el anterior" : "MUCHO mejor que el anterior" };
}
export const EXS = ["bitvavo", "okx"];
const env = (k) => (process.env[k] || "").trim(), r2 = (x) => Math.round(x * 100) / 100;

// ---- API privada (firma HMAC-SHA256 de timestamp + método + ruta con /v2 + cuerpo)
export function firma(secret, ts, method, ruta, body) { return createHmac("sha256", secret).update(String(ts) + method + ruta + (body || "")).digest("hex"); }
export function cliente(key, secret, fx = fetch) {
  return async function api(method, ruta, cuerpo) {
    const body = cuerpo ? JSON.stringify(cuerpo) : "", ts = Date.now(), p = "/v2" + ruta;
    const r = await fx(API + p, { method, headers: { "Bitvavo-Access-Key": key, "Bitvavo-Access-Signature": firma(secret, ts, method, p, body), "Bitvavo-Access-Timestamp": String(ts), "Bitvavo-Access-Window": "20000", "Content-Type": "application/json" }, body: body || undefined, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j && j.errorCode)) { const e = new Error(`Bitvavo ${r.status}${j && j.errorCode ? " · código " + j.errorCode : ""}${j && j.error ? " · " + String(j.error).slice(0, 80) : ""}`); e.status = r.status; e.code = j && j.errorCode; throw e; }
    return j;
  };
}
// errores de clave: no tiene sentido reintentar (clave mal puesta, sin permiso de operar, etc.)
export const errClave = (e) => e && (e.status === 401 || e.status === 403 || [105, 107, 108, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 317].includes(+e.code));

export function fresh(now = new Date(), copia = "mix", capital = CAPITAL) {
  return { v: 1, start: capital, cash: capital, capital, pos: {}, closed: [], log: [], eq: [], st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0 }, since: now.toISOString(), copia, vistos: {} };
}
const L = (RS, now, txt) => { RS.log.unshift({ t: now.toISOString(), txt }); RS.log = RS.log.slice(0, 200); };
export const valor = (RS, tick) => RS.cash + Object.entries(RS.pos).reduce((s, [m, p]) => s + p.q * ((tick[m] && tick[m].bid) || p.last || p.px) * (1 - (RS.fee ?? FEE)), 0);

// ---- órdenes (el importe real lo dice la respuesta de Bitvavo, no lo que pedimos)
// v291 · 🔐 ÓRDENES SEGURAS: cada orden lleva un identificador propio (clientOrderId). Si la respuesta se pierde (red, tiempo agotado),
// se pregunta a Bitvavo por ESA orden antes de darla por fallida: nunca se compra dos veces ni se pierde el rastro de una compra hecha.
async function enviar(api, m, cuerpo) { const clientOrderId = randomUUID();
  try { return await api("POST", "/order", { ...cuerpo, market: m, clientOrderId, operatorId: OPERADOR }); }
  catch (e) { if (e && e.status && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
    // v295 · se pregunta por ESA orden hasta 5 veces (~10 s) hasta conocer su estado final; lo ejecutado se apunta tal cual
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 1000 + i * 600)); let o = null; try { o = await api("GET", `/order?market=${m}&clientOrderId=${clientOrderId}`); } catch (e2) { continue; }
      if (o && ["filled", "canceled", "cancelled", "expired", "rejected"].includes(o.status)) { if (+o.filledAmount > 0) return o; throw e; } }   // v297 · solo con estado FINAL (si no, se cuadra después con el saldo)
    throw e; } }
async function comprar(api, m, eur) {
  const o = await enviar(api, m, { side: "buy", orderType: "market", amountQuote: eur.toFixed(2) });
  const q = +o.filledAmount || 0, quote = +o.filledAmountQuote || 0, fee = o.feeCurrency === "EUR" || !o.feeCurrency ? +o.feePaid || 0 : 0, feeBase = o.feeCurrency && o.feeCurrency !== "EUR" ? +o.feePaid || 0 : 0;
  if (!(q > 0)) throw new Error("la compra no se ejecutó");
  return { q: q - feeBase, coste: quote + fee, fee, px: quote / q };
}
async function vender(api, m, q, dec) {
  const f = 10 ** dec, amount = Math.floor(q * f) / f; if (!(amount > 0)) return { q: 0, got: 0, fee: 0 };
  const o = await enviar(api, m, { side: "sell", orderType: "market", amount: amount.toFixed(dec) });
  const quote = +o.filledAmountQuote || 0, fee = +o.feePaid || 0; return { q: +o.filledAmount || amount, got: quote - fee, fee, px: quote / Math.max(1e-12, +o.filledAmount || amount) };
}

// v236 · adaptador de Bitvavo (misma forma que el de OKX: comprar, vender, mercado, saldoEur, tiene)
export function bitvavoEx(api, mercado, saldoEur) {
  const saldo = async (sym) => { const b = await api("GET", "/balance?symbol=" + sym), x = (Array.isArray(b) ? b : [b]).find((y) => y && y.symbol === sym); return x ? +x.available || 0 : 0; };
  const saldos = async () => { const b = await api("GET", "/balance"), o = {}; for (const x of Array.isArray(b) ? b : []) { const q = (+x.available || 0) + (+x.inOrder || 0); if (q > 0) o[x.symbol] = q; } return o; };   // v278
  // v282 · operaciones REALES de la cuenta (las mismas del historial de Bitvavo), cripto a cripto
  const operaciones = async (syms) => { const out = []; for (const sym of syms) { if (/^(EUR|USDC|USDT|EURC)$/.test(sym)) continue; let d; try { d = await api("GET", `/trades?market=${sym}-EUR&limit=500`); } catch { continue; }
    for (const x of Array.isArray(d) ? d : []) { const q = +x.amount || 0, px = +x.price || 0, fee = +x.fee || 0, feeE = !x.feeCurrency || x.feeCurrency === "EUR" ? fee : fee * px; out.push({ t: +x.timestamp, sym, side: x.side, q: q - (x.side === "buy" && x.feeCurrency === sym ? fee : 0), eur: q * px, fee: feeE }); } } return out; };
  // v291 · 🛡️ STOP DE EMERGENCIA EN EL PROPIO EXCHANGE (por si el bot no pudiera actuar): orden «stopLoss» de Bitvavo. Bloquea esas criptos,
  // así que antes de cualquier venta del bot se quita y, si queda algo, se vuelve a poner.
  const ponStop = async (m, q, px) => { const mk = await mercado(m), f = 10 ** mk.dec, amount = Math.floor(q * f) / f; if (!(amount > 0) || amount * px < mk.min) return null;
    const o = await api("POST", "/order", { market: m, side: "sell", orderType: "stopLoss", amount: amount.toFixed(mk.dec), triggerAmount: String(+px.toPrecision(5)), triggerType: "price", triggerReference: "lastTrade", operatorId: OPERADOR }); return o && o.orderId ? String(o.orderId) : null; };
  const quitaStop = async (m, id) => { try { await api("DELETE", `/order?market=${m}&orderId=${id}`); } catch (e) { if (!/240|no.*(exist|encontr)|not found|filled|cancel/i.test(String(e.message))) throw e; } };
  const estadoStop = async (m, id) => { const o = await api("GET", `/order?market=${m}&orderId=${id}`); return { activo: !!o && ["new", "awaitingTrigger", "partiallyFilled"].includes(o.status), q: o ? +o.amountRemaining || +o.amount || 0 : 0 }; };   // v297
  // v299 · compras hechas POR EL BOT (sus órdenes llevan su «operatorId»), para no apropiarse de compras tuyas
  const comprasBot = async (sym, desde) => { const d = await api("GET", `/orders?market=${sym}-EUR&start=${Math.floor(desde)}&limit=100`); let q = 0;
    const L0 = Array.isArray(d) ? d : []; if (L0.length && !L0.some((o) => o.operatorId != null)) return null;   // si Bitvavo no informa del operatorId, se usa el historial
    for (const o of L0) if (o.side === "buy" && +o.operatorId === OPERADOR && +o.filledAmount > 0) q += +o.filledAmount - (o.feeCurrency === sym ? +o.feePaid || 0 : 0); return q; };
  return { nombre: "Bitvavo", fee: FEE, tiene: () => true, ponStop, quitaStop, estadoStop, comprasBot, comprar: (m, eur) => comprar(api, m, eur), vender: async (m, q) => { const mk = await mercado(m); return vender(api, m, q, mk.dec); }, mercado, saldoEur, saldo, saldos, operaciones, errClave };
}
// v282 · 📒 LIBRO REAL: con las operaciones del exchange, casa compras y ventas (la primera que entra es la primera que sale) y saca
// las cerradas con su % de verdad (comisiones incluidas) y el coste de lo que sigue abierto. Es lo mismo que verías haciendo las cuentas en la app del exchange.
export function libro(ops) {
  const cola = {}, cerradas = [];
  for (const o of [...ops].sort((a, b) => a.t - b.t)) { const c = cola[o.sym] || (cola[o.sym] = []);
    if (o.side === "buy") { if (o.q > 0) c.push({ q: o.q, cost: o.eur + o.fee, t: o.t }); continue; }
    let q = o.q, cost = 0, qm = 0, t0 = null; const got = o.eur - o.fee;
    while (q > 1e-12 && c.length) { const l = c[0], u = Math.min(q, l.q), part = l.cost * (u / l.q); cost += part; l.cost -= part; l.q -= u; q -= u; qm += u; t0 = t0 ?? l.t; if (l.q <= 1e-12) c.shift(); }
    if (qm > 0) { const g = got * (qm / o.q), pnl = g - cost; const prev = cerradas[cerradas.length - 1];
      if (prev && prev.sym === o.sym && o.t - prev.t1 < 5 * 60000) { prev.cost += cost; prev.got += g; prev.pnl += pnl; prev.t1 = o.t; prev.pc = (prev.got / prev.cost - 1) * 100; }   // ventas troceadas de la misma orden → una
      else cerradas.push({ sym: o.sym, t0, t1: o.t, cost, got: g, pnl, pc: (g / cost - 1) * 100 }); } }
  const abiertas = {}; for (const [sym, c] of Object.entries(cola)) { const q = c.reduce((s, l) => s + l.q, 0), cost = c.reduce((s, l) => s + l.cost, 0); if (q > 0 && cost > 0.01) abiertas[sym] = { q, cost: r2(cost), px: cost / q, t0: c[0].t }; }
  return { cerradas: cerradas.reverse().slice(0, 100).map((x) => ({ ...x, cost: r2(x.cost), got: r2(x.got), pnl: r2(x.pnl), pc: r2(x.pc), t0: x.t0 ? new Date(x.t0).toISOString() : null, t1: new Date(x.t1).toISOString() })), abiertas };
}

// ---- una vuelta (cada minuto, justo después de que los submodos ficticios hayan comprado o vendido)
// fuentes = { eq: S, turbo: S.sub.turbo, mix: S.sub.mix } · ctl = { copia, parado } · deps = { api, tg, mercados(m) → {min, dec} }
export async function vuelta(RS, fuentes, ctl, tick, now, deps) {
  const X = deps.ex || bitvavoEx(deps.api, deps.mercado, deps.saldoEur), mercado = X.mercado, EX = X.nombre, msgs = [];
  const copia = SUBS_OK.includes(ctl.copia) ? ctl.copia : "mix", objetivo = Math.max(10, Math.round(+ctl.capital || CAPITAL));
  // saldo libre en euros en la cuenta de Bitvavo (una consulta por vuelta, solo si hace falta)
  let libre0 = null; const libre = async () => (libre0 != null ? libre0 : (libre0 = X.saldoEur ? await X.saldoEur() : Infinity));
  if (!RS || RS.v !== 1) {
    const hay = await libre().catch(() => 0), cap = Math.min(objetivo, Math.floor(hay * 100) / 100);
    if (!(cap >= 10)) { return { RS: RS && RS.v === 1 ? RS : null, msgs: ctl.avisoSinSaldo ? [] : [`💶 ⚠️ ${EX} REAL: en tu cuenta hay ${r2(hay)} € libres; hacen falta al menos 10 € para empezar.`], ctl: { ...ctl, avisoSinSaldo: 1 }, ctlCambia: !ctl.avisoSinSaldo, sinEmpezar: true }; }
    RS = fresh(now, copia, cap); L(RS, now, `💶 empieza con ${cap} € reales copiando a «${copia}»`);
    msgs.push(`💶 ${EX} REAL empieza: ${cap} € copiando al submodo «${nombre(copia)}»${cap < objetivo ? ` (pediste ${objetivo} €, pero en ${EX} solo hay ${r2(hay)} € libres)` : ""}. Frenos: nunca más de esa cantidad, se para sola si cae un ${FRENO * 100} %. /parar cuando quieras.`);
  }
  RS.capital = RS.capital ?? RS.start; RS.fee = X.fee ?? FEE; RS.ex = RS.ex || (EX === "OKX" ? "okx" : "bitvavo");
  const maxOrden = () => Math.max(MAX_ORDEN, RS.start * 0.6);
  // v255 · con poco dinero, la parte proporcional de una compra del método (p. ej. 4 €) queda por debajo del mínimo del exchange (~5 €) y se saltaba
  // todo. Ahora se compra el mínimo, siempre que no pase del 25 % de lo que vale la cuenta ni de lo que haya libre.
  const enBase = () => Object.entries(RS.pos).reduce((s2, [mm, p]) => s2 + (p.src === "base" ? p.q * ((tick[mm] && tick[mm].bid) || p.px) : 0), 0);   // v301 · lo que está en la cartera base no cuenta para el 60 % de los métodos
  const alMinimo = async (quiere, mk) => { const need = Math.max(mk.min, 5) * 1.02; if (quiere >= need) return quiere; const V = valor(RS, tick), hueco = Math.max(0, V * TOPE_INV - (V - RS.cash - enBase())); const tope = Math.min(RS.cash, V * 0.25, hueco, Math.max(0, (await libre()) - 0.5)); return need <= tope ? need : quiere; };   // v295 · el mínimo del exchange tampoco salta el tope del 60 %
  // v285 · 💶 TAMAÑO DE CADA COMPRA (lo eliges tú: 10 %): repartir cada compra entre 7 métodos dejaba compras de céntimos (subidas al mínimo de 5 €)
  // y el 80-90 % del dinero parado. Ahora cada compra es al menos el 10 % de lo que vale la cuenta, sin pasar nunca del 60 % invertido en total.
  // v286 · respeta el % que decide el método (su tamaño aprendido / su fórmula de riesgo), sin dividirlo entre los métodos copiados;
  // mínimo 10 % (15 % si el método es 💎) y como mucho 25 % por compra
  const tam = async (quiere, mk, frac = 1, muy = false) => { const V = valor(RS, tick), hueco = Math.max(0, V * TOPE_INV - (V - RS.cash - enBase())), tope = Math.min(RS.cash, maxOrden(), hueco, V * TAM_MAX * frac, Math.max(0, (await libre()) - 0.5));
    const q = Math.min(Math.max(quiere, V * (muy ? TAM_MUY : TAM_COMPRA) * frac), tope); return alMinimo(q, mk); };
  RS.vistos = RS.vistos || {};
  const vendeTodo = async (por) => { for (const m of Object.keys(RS.pos)) await cerrar(m, por); };
  // v291 · 🛡️ pone (o renueva) el stop de emergencia −10 % en el propio exchange; si falla, el bot sigue vigilando con su stop −6 %
  // v295 · cada posición tiene un estado claro: stopEst = «ok» (confirmado en el exchange) · «no disponible» (ese mercado no lo permite) · «error»
  const protege = async (m) => { const p = RS.pos[m]; if (!p || (ctl.conservar || []).includes(p.sym)) return; if (!X.ponStop) { p.stopEst = "no disponible"; return; }
    try { if (p.stopId) { await X.quitaStop(m, p.stopId); delete p.stopId; } const id = await X.ponStop(m, p.q, p.src === "tortuga" && p.stop > 0 ? Math.min(p.px * (1 - STOP_EMERG), p.stop * 0.97) : p.px * (1 - (p.src === "base" ? BASE_STOP + 0.03 : STOP_EMERG)));   /* v318 · el de emergencia, siempre por debajo del stop de su regla */ if (id) { p.stopId = id; p.stopEst = "ok"; delete p.stopErr; }
      else { if (p.stopEst !== "no disponible") L(RS, now, `ℹ️ ${p.sym}: ${EX} no permite stop de emergencia en este mercado (la vigila el bot con su stop −6 %)`); p.stopEst = "no disponible"; } }
    catch (e) { if (p.stopEst !== "error") L(RS, now, `⚠️ ${p.sym}: no pude poner el stop de emergencia en ${EX} (sigue el del bot; lo reintenta cada 30 min)`); p.stopEst = "error"; } };
  async function cerrar(m, por, frac = 1) {
    const p = RS.pos[m], mk = await mercado(m), bid = tick[m] ? tick[m].bid : p.px;
    if (frac < 1 && p.q * (1 - frac) * bid < mk.min) frac = 1;   // si lo que quedaría es menos que el mínimo, se vende todo
    const qv = frac >= 1 ? p.q : p.q * frac;
    if (qv * bid < mk.min) { if (frac < 1) { p.tp = 1; return; }
      // v289 · 🧹 SIN POLVO: lo que vale menos que el mínimo NO se abandona. Compra lo justo para llegar al mínimo y vende TODO junto (cuesta céntimos de comisión);
      // si no hay euros para eso, la sigue vigilando y lo reintenta cada minuto
      const pon = Math.max(mk.min * 1.08, 5.5);
      if (RS.cash >= pon && (await libre()) >= pon) { try { const rb = await X.comprar(m, pon); RS.cash -= rb.coste; RS.st.fees += rb.fee; p.q += rb.q; p.cost += rb.coste; L(RS, now, `🧹 ${p.sym}: valía menos que el mínimo de ${EX}; compra ${r2(pon)} € para poder venderla entera`); } catch (e) { if (!p.polvo) L(RS, now, `⚠️ ${p.sym}: vale menos que el mínimo y no pude completarla (lo reintenta)`); p.polvo = now.toISOString(); return; }
        return cerrar(m, por, 1); }
      if (!p.polvo) L(RS, now, `⏳ ${p.sym}: vale menos que el mínimo de ${EX} y no hay euros libres para completarla; la sigue vigilando`); p.polvo = now.toISOString(); return; }
    if (p.stopId && X.quitaStop) { try { await X.quitaStop(m, p.stopId); delete p.stopId; } catch (e) { L(RS, now, `⚠️ ${p.sym}: no pude quitar el stop de emergencia para vender; lo reintenta`); return; } }   // v291
    let r; try { r = await X.vender(m, qv); } catch (e) { if (!/216|51008|insufficient|saldo/i.test(e.message)) throw e;
      // v278 · lo apuntado era un poco más de lo que hay (la comisión se cobró en la propia cripto): se vende lo que hay DE VERDAD
      const hay = X.saldo ? await X.saldo(p.sym) : 0, q2 = Math.min(qv, hay);
      if (!(q2 * bid >= mk.min)) { L(RS, now, `⚠️ ${p.sym}: en la cuenta solo quedan ${hay} (menos que el mínimo); se da por cerrada`); delete RS.pos[m]; return; }
      r = await X.vender(m, q2); if (frac >= 1) p.q = r.q; }
    RS.cash += r.got; RS.st.fees += r.fee; p.cob = (p.cob || 0) + r.got; p.q -= r.q; p.tVenta = Date.now();   // v297 · hora de la última venta del bot (para no contar dos veces)
    if (r.pendUsdc > 0) RS.usdcPend = (RS.usdcPend || 0) + r.pendUsdc;   // v297 · USDC del bot que no pudo pasar a euros: solo ESE se convertirá luego
    if (frac >= 1 || p.q * (tick[m] ? tick[m].bid : p.px) < mk.min) {
      const pnl = p.cob - p.cost; RS.st.pnl += pnl; if (pnl >= 0) RS.st.wins++; else RS.st.losses++;
      RS.closed.unshift({ m, sym: p.sym, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(p.cob), pnl: r2(pnl), pc: r2((p.cob / p.cost - 1) * 100), why: por }); RS.closed = RS.closed.slice(0, 300); delete RS.pos[m];
      L(RS, now, `${pnl >= 0 ? "✅" : "🔻"} vende ${p.sym}: ${pnl >= 0 ? "+" : ""}${r2(pnl)} € (${r2((p.cob / p.cost - 1) * 100)} %) · ${por}`); msgs.push(`💶 ${pnl >= 0 ? "✅" : "🔻"} REAL: vende ${p.sym} → ${pnl >= 0 ? "+" : ""}${r2(pnl)} € (${r2((p.cob / p.cost - 1) * 100)} %) · ${por}`);
    } else { p.tp = 1; await protege(m); L(RS, now, `💰 vende parte de ${p.sym} (+${r2(r.got)} €) · ${por}`); msgs.push(`💶 💰 REAL: vende parte de ${p.sym} (${r2(r.got)} €) · ${por}`); }
  }
  try {
    // 1) ¿parado? ¿cambio de submodo?
    if (ctl.parado) {
      if (Object.keys(RS.pos).length) { await vendeTodo("parado: " + (ctl.motivo || "lo has parado tú")); } RS.estado = "parado";
      if (RS.paradaAt) { const rt = retomar(RS, fuentes[copia], now); RS.retomar = rt; if (rt.ok && (!RS.avisoRetomar || now - Date.parse(RS.avisoRetomar) > 86400e3)) { RS.avisoRetomar = now.toISOString(); msgs.push(`💶 ✅ Se cumplen las condiciones para retomar el dinero real:\n• ${rt.c.map((x) => x.txt).join("\n• ")}\n\nSi quieres, escribe /seguir. Mi consejo: las primeras semanas, con la mitad del dinero (cámbialo en la app antes).`); } }
      return { RS, msgs, ctl };
    }
    if (RS.paradaAt) { delete RS.paradaAt; delete RS.retomar; delete RS.avisoRetomar; }
    // al reanudar tras una parada, el freno se mide desde lo que hay ahora (si no, volvería a saltar al momento)
    if (RS.estado === "parado") { const e0 = valor(RS, tick); RS.start = e0; L(RS, now, `▶️ reanuda con ${r2(e0)} € (el freno se mide desde aquí; no repone lo perdido)`); }
    // 1a) v295 · 🧾 VENTAS HECHAS FUERA DEL BOT (el stop de emergencia del exchange, o tú a mano): si una cripto apuntada ya no está en la cuenta,
    // se busca la venta en el historial del exchange y se apunta el dinero que entró (con comisiones) y el resultado. Va ANTES del «cuánto dinero usar»
    // para que esos euros no se confundan con un ingreso tuyo.
    let B0 = null; if (X.saldos) try { B0 = await X.saldos(); } catch (e) {}
    // v297 · se cuentan SOLO las ventas posteriores a la última venta del propio bot (sin contar dos veces), también las PARCIALES; si la venta aún no
    // aparece en el historial, la posición se queda «pendiente de cuadrar» y se reintenta (hasta 15 min) antes de darla por retirada o traspasada
    if (B0) for (const [m, p] of Object.entries(RS.pos)) {
      if ((ctl.conservar || []).includes(p.sym)) continue;
      const hay = +B0[p.sym] || 0, falta = p.q - hay; if (!(falta > p.q * 0.02)) { delete p.pendConc; continue; }
      const desde = Math.max(Date.parse(p.t0), p.tVenta || 0) - 30e3; let got = 0, qv = 0, fee = 0;
      if (X.operaciones) try { for (const o of (await X.operaciones([p.sym])).filter((o) => o.side === "sell" && o.t > desde).sort((a, b) => a.t - b.t)) { if (qv >= falta * 1.01) break; qv += o.q; got += o.eur - o.fee; fee += o.fee; } } catch (e) {}
      if (got > 0) { RS.cash += got; RS.st.fees += fee; p.cob = (p.cob || 0) + got; p.tVenta = Date.now(); delete p.pendConc;
        if (hay * ((tick[m] && tick[m].bid) || p.px) >= 1) { p.q = hay; L(RS, now, `🧾 ${p.sym}: vendida una parte en ${EX} fuera del bot (+${r2(got)} € apuntados)`); continue; }
        const pnl = p.cob - p.cost; RS.st.pnl += pnl; if (pnl >= 0) RS.st.wins++; else RS.st.losses++;
        RS.closed.unshift({ m, sym: p.sym, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(p.cob), pnl: r2(pnl), pc: r2((p.cob / p.cost - 1) * 100), why: "vendida en el exchange (stop de emergencia o a mano)", src: p.src || null }); RS.closed = RS.closed.slice(0, 300);
        L(RS, now, `${pnl >= 0 ? "✅" : "🔻"} ${p.sym}: vendida en ${EX} fuera del bot (stop de emergencia o a mano): ${r2(pnl)} € · se apuntan los ${r2(got)} € que entraron`); msgs.push(`💶 🛡️ REAL: ${p.sym} se ha vendido en ${EX} fuera del bot (stop de emergencia o a mano): ${pnl >= 0 ? "+" : ""}${r2(pnl)} €.`); delete RS.pos[m]; continue; }
      p.pendConc = p.pendConc || now.toISOString();
      if (now - Date.parse(p.pendConc) > 15 * 60e3) { L(RS, now, `🔍 ${p.sym}: falta en la cuenta y no hay venta en el historial en 15 min (¿retirada o traspaso?); ${hay > 0 ? "se apunta lo que queda" : "se quita del apunte"}`); if (hay > 0 && hay * ((tick[m] && tick[m].bid) || p.px) >= 1) { p.q = hay; delete p.pendConc; } else delete RS.pos[m]; }
    }
    // 💰 cuánto dinero usar (lo eliges en la app): nunca más de lo que haya libre de verdad en tu cuenta
    if (Math.abs(objetivo - RS.capital) >= 1) {
      let d = objetivo - RS.capital;
      if (d > 0) { const hay = await libre(); const max = Math.max(0, Math.floor((hay - RS.cash) * 100) / 100); if (max < d) { d = max; if (objetivo < 100000 && (!RS.avisoSaldo || now - Date.parse(RS.avisoSaldo) > 6 * 3600e3)) {   /* «Todo»: no avisa */ RS.avisoSaldo = now.toISOString(); msgs.push(`💶 ⚠️ Pediste usar ${objetivo} € pero en tu cuenta de ${EX} solo hay ${r2(hay)} € libres: usa ${r2(RS.capital + d)} €. Si ingresas más, lo cogerá solo.`); } } }
      else d = -Math.min(-d, RS.cash);
      if (Math.abs(d) >= 0.01) { RS.cash += d; RS.start += d; RS.capital += d; if (RS.dia) RS.dia.eq0 += d; L(RS, now, `💰 ${d > 0 ? "añade" : "retira"} ${r2(Math.abs(d))} €: ahora usa ${r2(RS.capital)} €`); if (Math.abs(objetivo - RS.capital) < 1) msgs.push(`💶 💰 REAL: ahora usa ${r2(RS.capital)} €${d < 0 ? " (lo que se quita, cuando esté libre)" : ""}.`); }
    }
    // v261 · al cambiar de método NO se vende lo abierto: cada posición sigue con el método que la compró y se vende cuando ese método la venda
    if (RS.copia !== copia) { const ab = Object.values(RS.pos); for (const p of ab) p.src = p.src || RS.copia; L(RS, now, `🔁 ahora copia a «${copia}»${ab.length ? ` (lo abierto sigue con su método hasta que lo venda)` : ""}`); msgs.push(`💶 🔁 REAL: ahora copia a «${nombre(copia)}»${ab.length ? `. Lo que ya tenías abierto (${ab.length}) no se vende: sigue con su método y se venderá cuando él lo venda.` : "."}`); RS.copia = copia; RS.since = now.toISOString(); RS.copiaDesde = now.toISOString(); }
    const src = fuentes[copia]; if (!src) { RS.estado = "esperando"; return { RS, msgs, ctl }; }
    // 1b) v278 · 🔍 CUADRE CON LA CUENTA REAL: se leen los saldos de verdad del exchange y se corrige lo apuntado
    //  · si de una cripto hay menos de lo apuntado (comisiones en la propia cripto, ventas fuera del bot…), se apunta lo que hay de verdad
    //  · si hay una cripto en la cuenta que el bot no tenía apuntada (≥ 2 €), se incorpora y se vigila con stop (−6 %), stop móvil y 72 h máx.
    //  · se guarda la foto EXACTA de la cuenta (euros + cada cripto a precio de ahora) para enseñarla en la app
    if (X.saldos) { try { const B = B0 || (await X.saldos()), act = [], PX = X.precios ? await X.precios().catch(() => null) : null; let tot = +(B.EUR || 0);
      for (const [sym, q] of Object.entries(B)) { if (sym === "EUR") continue; const m = sym + "-EUR", bid = (PX && PX[sym]) || (tick[m] ? tick[m].bid : 0), v = q * bid; tot += v; if (v >= 0.01) act.push({ sym, q, eur: r2(v), px: bid });
        const p = RS.pos[m];
        if (p && !p.pendConc && q < p.q * 0.999 && q >= p.q * 0.98) p.q = q;   // v297 · solo ajustes pequeños (comisión cobrada en la cripto); lo grande lo cuadra el paso 1a
        else if (!p && v >= 2 && !/^(USDC|USDT|EURC|EUR)$/.test(sym) && !(ctl.conservar || []).includes(sym)) {   // v295 · 🔒 las que marcas «no tocar» no se adoptan
          // v295 · ¿la compró el bot y se cortó antes de guardarlo (reinicio)? si un método la tiene abierta desde hace < 2 h, se apunta como suya (no se vuelve a comprar)
          const lb = RS.libro && RS.libro.abiertas && RS.libro.abiertas[sym]; let dueno = Object.entries(fuentes).find(([k, f]) => f && f.pos && f.pos[m] && now - Date.parse(f.pos[m].t0) < 2 * 3600e3);
          // v298 · solo se apunta como del bot lo que el historial dice que se COMPRÓ desde que el método abrió (no tus criptos de antes)
          // (v299: primero por las órdenes que llevan la marca del bot; si el exchange no deja consultarlas, por el historial de compras)
          let qBot = q; if (dueno) { const t0 = Date.parse(dueno[1].pos[m].t0) - 60e3; let hecho = false;
            if (X.comprasBot) try { const qb = await X.comprasBot(sym, t0); if (qb != null) { qBot = Math.min(q, qb); hecho = true; } } catch (e) {}
            if (!hecho && X.operaciones) try { qBot = Math.min(q, (await X.operaciones([sym])).filter((o) => o.side === "buy" && o.t >= t0).reduce((s2, o) => s2 + o.q, 0)); } catch (e) {} }
          if (dueno && !(qBot * bid >= 2)) dueno = null;
          if (dueno) { const sp = dueno[1].pos[m], q = qBot; RS.pos[m] = { src: dueno[0], sym, q, q0: q, px: lb && lb.px > 0 ? lb.px : bid, cost: r2(lb ? lb.cost * Math.min(1, q / lb.q) : q * bid), cost0: r2(lb ? lb.cost * Math.min(1, q / lb.q) : q * bid), t0: now.toISOString(), srcT0: sp.t0, last: bid }; RS.vistos[m + "|" + sp.t0] = now.toISOString(); L(RS, now, `🔍 ${sym}: compra del bot que no llegó a apuntarse (reinicio); queda apuntada con «${dueno[0]}»`); await protege(m); }
          else { RS.pos[m] = { sym, q, q0: q, px: bid, cost: r2(v), cost0: r2(v), t0: now.toISOString(), last: bid, peak: bid, huerfana: 1, src: null }; L(RS, now, `🔍 ${sym}: estaba en tu cuenta sin apuntar (${r2(v)} €); ahora la vigila (stop −6 %, stop móvil, 72 h máx.)`); await protege(m); } } }

      // v295 · 💵 USDC que se quedó a medias (compra o venta por USDC en OKX que se cortó en el segundo paso): se vuelve a pasar a euros
      // (v297: solo el USDC que dejó el PROPIO bot a medias, nunca el tuyo; su valor ya se apuntó al vender, aquí se ajusta la diferencia)
      if (X.usdcAEur && RS.usdcPend > 5 && B.USDC > 5) try { const q = Math.min(RS.usdcPend, B.USDC), r = await X.usdcAEur(q); if (r && r.got > 0) { RS.cash += r.got - (r.est || r.got); RS.usdcPend = Math.max(0, RS.usdcPend - q); L(RS, now, `💵 ${r2(q)} USDC del bot que quedaron a medias se pasan a euros (${r2(r.got)} €)`); } } catch (e) {}
      // v295 · 🛡️ revisión cada 30 min: toda posición sin stop de emergencia confirmado lo vuelve a intentar
      // (v297: también se COMPRUEBA que los stops puestos siguen activos y cubren lo que hay; si no, se vuelven a poner)
      if (!RS.stopRev || now - Date.parse(RS.stopRev) > 30 * 60e3) { RS.stopRev = now.toISOString(); for (const m of Object.keys(RS.pos)) { const p = RS.pos[m]; let vale = !!p.stopId;
        if (vale && X.estadoStop) try { const e = await X.estadoStop(m, p.stopId); if (e && (!e.activo || (e.q > 0 && e.q < p.q * 0.97))) { vale = false; L(RS, now, `🛡️ ${p.sym}: el stop de emergencia ya no estaba activo o no cubría todo; se vuelve a poner`); msgs.push(`💶 🛡️ ${EX}: el stop de emergencia de ${p.sym} había desaparecido o no cubría todo; lo he vuelto a poner.`); delete p.stopId; } } catch (e) {}
        if (!vale) await protege(m); } }
      if (B.EUR != null && RS.cash > +B.EUR + 0.01) RS.cash = +B.EUR;
      RS.cuenta = { t: now.toISOString(), eur: r2(+(B.EUR || 0)), total: r2(tot), activos: act.sort((a, b) => b.eur - a.eur) };
      // v309 · 📈 gráfica de la cuenta: un punto cada 30 min (unas 3 semanas)
      RS.curva = RS.curva || []; if (!RS.curva.length || now - RS.curva[RS.curva.length - 1][0] >= 30 * 60e3) { RS.curva.push([now.getTime(), r2(tot)]); RS.curva = RS.curva.slice(-1000); }
      // v282 · 📒 el historial real del exchange, cada 10 min o en cuanto cambian las monedas de la cuenta
      const firmaB = Object.keys(B).sort().join(",");
      if (X.operaciones && (!RS.libro || RS.libro.firma !== firmaB || now - Date.parse(RS.libro.t) > 10 * 60000)) { try {
        const syms = [...new Set([...Object.keys(B), ...(RS.closed || []).map((c) => c.sym), ...((RS.libro && RS.libro.cerradas) || []).map((c) => c.sym)])];
        RS.libro = { t: now.toISOString(), firma: firmaB, ...libro(await X.operaciones(syms)) }; } catch (e) { L(RS, now, "⚠️ no pude leer el historial del exchange: " + String(e.message).slice(0, 80)); } }
      } catch (e) { L(RS, now, "⚠️ no pude leer los saldos de la cuenta: " + String(e.message).slice(0, 80)); } }
    // 2) freno: si el saldo cae un 25 %, vende todo y se para
    const eq = valor(RS, tick);
    if (eq < RS.start * (1 - FRENO)) { await vendeTodo(`freno: el saldo ha caído un ${FRENO * 100} %`); ctl = { ...ctl, parado: true, motivo: `freno automático: el saldo cayó un ${FRENO * 100} %` }; RS.estado = "parado"; RS.paradaAt = now.toISOString(); msgs.push(`💶 🛑 REAL PARADO por el freno: el saldo ha caído por debajo de ${r2(RS.start * (1 - FRENO))} €. He vendido todo y no compraré más. Te avisaré cuando se cumplan las condiciones para retomar (el método se recupera en ficticio, vuelve a tener regla ganadora y pasan 2 días). Para volver antes: /seguir`); return { RS, msgs, ctl, ctlCambia: true }; }
    // 2b) freno diario: si hoy pierde un 10 % desde el principio del día, vende todo y descansa hasta mañana
    { const d = diaES(now); if (!RS.dia || RS.dia.d !== d) RS.dia = { d, eq0: eq };
      if (RS.pausaDia === d) { if (Object.keys(RS.pos).length) await vendeTodo("descanso hasta mañana (freno diario)"); RS.estado = "pausa"; return { RS, msgs, ctl }; }
      if (RS.pausaDia && RS.pausaDia !== d) { delete RS.pausaDia; L(RS, now, "▶️ nuevo día: vuelve a operar tras el freno diario"); msgs.push("💶 ▶️ REAL: nuevo día, vuelve a operar tras el descanso del freno diario."); }
      if (eq < RS.dia.eq0 * (1 - FRENO_DIA)) { await vendeTodo(`freno diario: hoy ha perdido un ${FRENO_DIA * 100} %`); RS.pausaDia = d; RS.estado = "pausa"; msgs.push(`💶 ⏸️ REAL: hoy ha perdido más de un ${FRENO_DIA * 100} % (de ${r2(RS.dia.eq0)} € a ${r2(eq)} €). He vendido todo y descansa hasta mañana; mañana vuelve solo.`); return { RS, msgs, ctl }; } }
    // v319 · 🧹 lo pides tú (una vez): vender TODO lo que quede de los métodos antiguos (todo lo que no sea de las Tortugas ni tuyo)
    if (ctl.liquidar && RS.liqAt !== ctl.liquidar) { RS.liqAt = ctl.liquidar; let n = 0;
      for (const m of Object.keys(RS.pos)) { const p = RS.pos[m]; if (!p || p.src === "tortuga" || (ctl.conservar || []).includes(p.sym)) continue; await cerrar(m, "la vendes tú: era de un método antiguo"); n++; }
      L(RS, now, `🧹 vendidas ${n} criptos de los métodos antiguos; el dinero queda libre para las Tortugas`); msgs.push(`💶 🧹 ${EX}: vendidas ${n} criptos de los métodos antiguos. El dinero queda libre para las 🐢 Tortugas.`); }
    // 3) lo que tengo: ¿el submodo lo ha vendido entero, o una parte, o ha añadido (piramidar)?
    for (const [m, p] of Object.entries(RS.pos)) {
      // v301 · 🧺 CARTERA BASE (BTC/ETH con tendencia): sale cuando la tendencia se gira (cierre por debajo de su media de 50 días) o si cae un 15 % desde la compra
      if (p.src === "base") { if ((ctl.conservar || []).includes(p.sym)) { delete RS.pos[m]; continue; } const T = ctl.base && ctl.base.m && ctl.base.m[m], b = tick[m] ? tick[m].bid : p.px;
        if (ctl.base && T && T.up === false) await cerrar(m, "cartera base: la tendencia se ha girado (por debajo de su media de 50 días)"); else if (b <= p.px * (1 - BASE_STOP)) await cerrar(m, `cartera base: stop −${BASE_STOP * 100} %`); continue; }
      // v304 · 🐢 posiciones de las Tortugas: stop 2N (≤ −8 %) siempre; salida por mínimo de 10 días solo si cubre comisiones (o tras 7 días)
      // v306 · 🐋 copias de los profesionales: salen cuando ellos dejan de estar comprados (si cubre comisiones; máx. 48 h esperando), stop −6 % siempre
      if (p.src === "ballena") { const b = tick[m] ? tick[m].bid : p.px, W = ctl.ballenas && ctl.ballenas.m && ctl.ballenas.m[m];
        if (b <= p.px * (1 - STOP_REAL)) { await cerrar(m, `🐋 stop −${STOP_REAL * 100} %`); continue; }
        if (W && W.sale) { const neto = (p.q * b * (1 - X.fee) + (p.cob || 0)) / p.cost - 1; if (neto > 0 || (p.espera && now - Date.parse(p.espera) > 48 * 3600e3)) { await cerrar(m, `🐋 los profesionales ya no están comprados${neto > 0 ? " (con ganancia neta)" : " (48 h sin cubrir comisiones)"}`); continue; }
          if (!p.espera) { p.espera = now.toISOString(); L(RS, now, `⏳ ${p.sym}: los profesionales salen, pero aún no cubre comisiones; espera (stop activo)`); } }
        continue; }
      if (p.src === "tortuga") { if ((ctl.conservar || []).includes(p.sym)) { delete RS.pos[m]; continue; } const b = tick[m] ? tick[m].bid : p.px, S1 = ctl.tort && ctl.tort.sen && ctl.tort.sen[m];
        if (b <= p.stop) { await cerrar(m, `🐢 stop de las Tortugas (${r2((p.stop / p.px - 1) * 100)} %)`); continue; }
        if (S1 && S1.sale) { const neto = (p.q * b * (1 - X.fee) + (p.cob || 0)) / p.cost - 1; if (neto > 0 || now - Date.parse(p.t0) > T_ESPERA_D * 86400e3) { await cerrar(m, `🐢 cierra por debajo de su mínimo de ${tortP(ctl.tort && ctl.tort.P).sale} días${neto > 0 ? " (con ganancia neta)" : " (7 días sin cubrir comisiones)"}`); continue; }
          if (!p.espera) { p.espera = now.toISOString(); L(RS, now, `⏳ ${p.sym}: señal de salida de las Tortugas, pero aún no cubre comisiones (${r2(neto * 100)} %); espera (stop activo)`); } }
        continue; }
      if ((ctl.conservar || []).includes(p.sym)) { if (p.stopId && X.quitaStop) try { await X.quitaStop(m, p.stopId); } catch (e) {} L(RS, now, `🔒 ${p.sym}: la has marcado como tuya; el bot deja de gestionarla (no la vende)`); delete RS.pos[m]; continue; }   // v297
      // v289 · 🛑 STOP REAL OBLIGATORIO: −6 % desde el precio al que la compraste DE VERDAD (historial del exchange), para todas, y ningún método se lo salta
      const lb = RS.libro && RS.libro.abiertas && RS.libro.abiertas[p.sym], ent = p.huerfana && lb && lb.px > 0 ? lb.px : p.px, bN = tick[m] ? tick[m].bid : p.px;
      if (ent > 0 && bN <= ent * (1 - STOP_REAL)) { await cerrar(m, `stop −${STOP_REAL * 100} % desde tu precio de compra (tope de seguridad)`); continue; }
      if (p.huerfana) { const b = bN; p.last = b; p.peak = Math.max(p.peak || p.px, b);
        if (p.peak >= ent * 1.05 && b <= p.peak * 0.96) await cerrar(m, "stop móvil (cripto que estaba sin apuntar)"); else if (now - Date.parse(p.t0) > 72 * 3600e3) await cerrar(m, "72 h (cripto que estaba sin apuntar)"); continue; }
      const srcP = (p.src && fuentes[p.src]) || src, sp = srcP && srcP.pos ? srcP.pos[m] : null; if (tick[m]) p.last = tick[m].bid;
      // v304 · 💶 el método vende, pero si ESTA venta no cubre las comisiones se espera (hasta 48 h) a que las cubra; el stop −6 % sigue mandando
      if (!sp || sp.t0 !== p.srcT0) { const b = tick[m] ? tick[m].bid : p.px, neto = (p.q * b * (1 - X.fee) + (p.cob || 0)) / p.cost - 1;
        if (neto > 0 || (p.espera && now - Date.parse(p.espera) > 48 * 3600e3)) { await cerrar(m, `el método ficticio ha vendido${neto > 0 ? " (con ganancia neta, comisiones incluidas)" : " (48 h esperando a cubrir comisiones)"}`); continue; }
        if (!p.espera) { p.espera = now.toISOString(); L(RS, now, `⏳ ${p.sym}: el método ha vendido, pero ahora saldría en ${r2(neto * 100)} % tras comisiones; espera a cubrirlas (máx. 48 h, stop −6 % activo)`); } continue; }
      if (sp.cob > 0 && !p.tp && sp.q0 > 0) { const frac = 1 - sp.q / sp.q0; if (frac > 0.05) await cerrar(m, "venta parcial con ganancia (como el método)", frac); }
      // v297 · ampliar también respeta: sin método aprobado no compra, par líquido, tope 25 % por compra y 60 % invertido; se marca hecha solo si se hace
      if (sp.pir && !p.pir && sp.cost0 > 0 && !ctl.noCompra && !soloT() && !(tick[m] && tick[m].sp > HUECO_MAX)) { const V = valor(RS, tick), hueco = Math.max(0, V * TOPE_INV - (V - RS.cash - enBase())), add = Math.min(RS.cash, p.cost0 * (sp.cost - sp.cost0) / sp.cost0, maxOrden(), V * TAM_MAX, hueco, Math.max(0, (await libre()) - 0.5)), mk = await mercado(m); if (add < mk.min) p.pir = 1; else { const r = await X.comprar(m, add); p.pir = 1; RS.cash -= r.coste; RS.st.fees += r.fee; p.px = (p.px * p.q + r.px * r.q) / (p.q + r.q); p.q += r.q; p.cost += r.coste; L(RS, now, `➕ añade ${r2(r.coste)} € a ${p.sym} (como el método)`); await protege(m); } }   // v295 · precio medio
    }
    // 4) compras nuevas del submodo (de menos de 5 min) en la misma proporción
    // v269 · en 🤖 Automático copia a la vez a TODOS los métodos con 🏆 de su exchange (más operaciones, siempre ganadores), repartiendo el dinero
    // v301 · 🧺 CARTERA BASE: mientras BTC/ETH estén en tendencia (por encima de su media de 50 días) se tiene un 35 % de la cuenta repartido entre ellos;
    // solo si su regla aprueba el examen de 2 años. No cuenta para el 60 % de los métodos. Se compra una vez (y se completa si se queda en menos de la mitad).
    if (!soloT() && ctl.base && ctl.base.m) { const V = valor(RS, tick), suben = Object.entries(ctl.base.m).filter(([mm, T]) => T.up && tick[mm] && tick[mm].ask > 0 && !(ctl.conservar || []).includes(mm.split("-")[0]));
      for (const [mm] of suben) { const obj = (V * BASE_PCT) / suben.length, p = RS.pos[mm], ya = p ? p.q * tick[mm].bid : 0; if (p && p.src !== "base") continue; if (ya >= obj * 0.5) continue;
        const mk = await mercado(mm), quiere = Math.min(obj - ya, RS.cash, Math.max(0, (await libre()) - 0.5)); if (quiere < Math.max(mk.min, 5) * 1.02) continue;
        try { const r = await X.comprar(mm, quiere); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++;
          if (p) { p.px = (p.px * p.q + r.px * r.q) / (p.q + r.q); p.q += r.q; p.cost += r.coste; } else RS.pos[mm] = { src: "base", sym: mm.split("-")[0], q: r.q, q0: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), last: tick[mm].bid };
          L(RS, now, `🧺 cartera base: compra ${r2(r.coste)} € de ${mm.split("-")[0]} (está por encima de su media de 50 días)`); await protege(mm); } catch (e) { L(RS, now, `⚠️ cartera base: no pude comprar ${mm.split("-")[0]}: ${String(e.message).slice(0, 60)}`); } } }
    // v304 · 🐢 TORTUGAS: compra las criptos que cierran por encima de su máximo de 20 días (si su regla aprueba 2 años con las comisiones de este exchange)
    if (ctl.tort && ctl.tort.sen) { const V = valor(RS, tick), TP = tortP(ctl.tort.P), btc = ctl.tort.sen["BTC-EUR"]; let nT = Object.values(RS.pos).filter((p) => p.src === "tortuga").length;
      for (const [m, x] of Object.entries(ctl.tort.sen).filter(([, x]) => x.entra).sort((a, b) => b[1].c / b[1].hi20 - a[1].c / a[1].hi20)) {
        if (nT >= TP.maxPos) break; const tk = tick[m], clave = "T|" + m + "|" + x.t; if (RS.pos[m] || RS.vistos[clave] || !tk || !(tk.ask > 0) || tk.sp > HUECO_MAX || (ctl.conservar || []).includes(m.split("-")[0]) || !(x.N > 0)) continue;
        if (TP.filtro && !(btc && (btc.sobreF ?? btc.sobre50))) continue;   // v317 · media del filtro aprendida
        if (TP.atrMax > 0 && x.N / x.c > TP.atrMax) continue;   // v317 · demasiado nerviosa para la regla aprendida   // v313 · la combinación aprendida solo compra si BTC va al alza
        RS.vistos[clave] = now.toISOString(); if (tk.ask > x.c * 1.03) { L(RS, now, `⏭️ 🐢 ${m.split("-")[0]}: rompió su máximo, pero ya ha subido un ${r2((tk.ask / x.c - 1) * 100)} % desde el cierre; no la persigue`); continue; }
        const stopD = Math.min(TP.kN * x.N, tk.ask * TP.stopMax), hueco = soloT() ? RS.cash : Math.max(0, V * TOPE_INV - (V - RS.cash - enBase())), mk = await mercado(m);
        const eur = Math.min(tortTam(V, stopD / tk.ask, TP), hueco, RS.cash, Math.max(0, (await libre()) - 0.5)); if (eur < Math.max(mk.min, 5) * 1.02) { L(RS, now, `⏭️ 🐢 ${m.split("-")[0]}: rompe su máximo, pero no quedan euros libres para comprarla (lo demás está invertido)`); continue; }
        try { const r = await X.comprar(m, eur); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++; nT++;
          RS.pos[m] = { src: "tortuga", sym: m.split("-")[0], q: r.q, q0: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), last: tk.bid, stop: r.px - stopD, N: x.N };
          L(RS, now, `🐢 compra ${m.split("-")[0]} por ${r2(r.coste)} €: cerró por encima de su máximo de ${TP.ent} días · stop ${r2((-stopD / r.px) * 100)} % · sale con su mínimo de ${TP.sale} días`); msgs.push(`💶 🐢 ${EX}: compra ${m.split("-")[0]} (${r2(r.coste)} €) por ruptura de su máximo de ${TP.ent} días.`); await protege(m);
        } catch (e) { L(RS, now, `⚠️ 🐢 no pude comprar ${m.split("-")[0]}: ${String(e.message).slice(0, 60)}`); } } }
    // v306 · 🐋 COPIA A LOS PROFESIONALES de Hyperliquid: como mucho 2 a la vez, 10 % de la cuenta cada una (máx. 20 % en total), solo criptos de este exchange
    if (!soloT() && ctl.ballenas && ctl.ballenas.m) { const V = valor(RS, tick); let nB = Object.values(RS.pos).filter((p) => p.src === "ballena").length;
      for (const [m, w] of Object.entries(ctl.ballenas.m).filter(([, w]) => w.entra).sort((a, b) => b[1].s - a[1].s)) { if (nB >= 2) break; const tk = tick[m]; if (RS.pos[m] || !tk || !(tk.ask > 0) || tk.sp > HUECO_MAX || (ctl.conservar || []).includes(m.split("-")[0])) continue;
        const clave = "W|" + m + "|" + new Date(now).toISOString().slice(0, 13); if (RS.vistos[clave]) continue; RS.vistos[clave] = now.toISOString();
        const hueco = Math.max(0, V * TOPE_INV - (V - RS.cash - enBase())), mk = await mercado(m), eur = Math.min(0.10 * V, hueco, RS.cash, Math.max(0, (await libre()) - 0.5)); if (eur < Math.max(mk.min, 5) * 1.02) continue;
        try { const r = await X.comprar(m, eur); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++; nB++; RS.pos[m] = { src: "ballena", sym: m.split("-")[0], q: r.q, q0: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), last: tk.bid };
          L(RS, now, `🐋 compra ${m.split("-")[0]} por ${r2(r.coste)} €: los mejores traders de Hyperliquid están comprados al ${Math.round(w.s * 100)} % (${w.nl} de ellos) y metiendo más`); msgs.push(`💶 🐋 ${EX}: copia a los profesionales: compra ${m.split("-")[0]} (${r2(r.coste)} €).`); await protege(m);
        } catch (e) { L(RS, now, `⚠️ 🐋 no pude comprar ${m.split("-")[0]}: ${String(e.message).slice(0, 60)}`); } } }
    const lista = ctl.noCompra || soloT() ? [] : [copia, ...(ctl.extra || [])].filter((k, i, a) => fuentes[k] && a.indexOf(k) === i);   // v295 · sin método aprobado: no compra (sí vigila y vende lo abierto)
    for (const kS of lista) { const srcK = fuentes[kS], eqSrc = +srcK.lastEq || 100;
    // v253 · «📥 Copiar ya lo abierto» (lo pides tú): compra ahora lo que el método YA tiene abierto (lo que esté en este exchange), a precio de ahora
    // v256 · «🪞 espejo» (siempre): en cada vuelta compra todo lo que el método tenga abierto y aún no tenga la cuenta real (cada posición una sola vez)
    const pedido = ctl.adoptarAt && RS.adoptAt !== ctl.adoptarAt;
    if (pedido || ctl.espejo) { if (pedido) RS.adoptAt = ctl.adoptarAt; let nA = 0, mira = 0;
      for (const [m, sp] of Object.entries(srcK.pos)) { if (RS.pos[m] || sp.practica || (ctl.conservar || []).includes(sp.sym)) continue; const tk = tick[m]; if (!tk || !(tk.ask > 0) || tk.sp > HUECO_MAX) continue;   /* v295 · par con poca liquidez (diferencia compra/venta > 1,5 %): no se compra */   /* lo de 🧪 práctica no se copia */ if (!pedido && RS.vistos[m + "|" + sp.t0]) continue; mira++;
        RS.vistos[m + "|" + sp.t0] = now.toISOString();
        if (!X.tiene(m)) { L(RS, now, `⏭️ no copia ${sp.sym} (abierta): no está en ${EX}`); continue; }
        const frac = sp.q0 > 0 ? sp.q / sp.q0 : 1, mk = await mercado(m), quiere = await tam(Math.min(RS.cash, maxOrden(), valor(RS, tick) * (sp.cost0 || sp.cost) * frac / eqSrc, Math.max(0, (await libre()) - 0.5)), mk, frac, esMuy(reglaEnUso(srcK)));
        if (quiere < Math.max(mk.min, 5) * 1.02) { L(RS, now, `⏭️ no copia ${sp.sym} (abierta): tocarían ${r2(quiere)} € y el mínimo de ${EX} es ${r2(mk.min)} €`); continue; }
        const r = await X.comprar(m, quiere); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++; nA++;
        RS.pos[m] = { src: kS, sym: sp.sym, q: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), srcT0: sp.t0, last: tk.bid, tp: sp.cob > 0 ? 1 : 0, pir: sp.pir ? 1 : 0 }; await protege(m);
        L(RS, now, `📥 copia lo abierto: compra ${sp.sym} por ${r2(r.coste)} € (el método la compró a ${sp.px}; ahora ${r.px})`); msgs.push(`💶 📥 REAL: copia lo que ya tenía abierto el método: compra ${sp.sym} por ${r2(r.coste)} €`); }
      if (!nA && pedido) L(RS, now, "📥 copiar lo abierto: no había nada que se pudiera copiar ahora"); void mira; }
    for (const [m, sp] of Object.entries(srcK.pos)) {
      const k = m + "|" + sp.t0; if (RS.pos[m] || RS.vistos[k] || sp.practica) continue; RS.vistos[k] = now.toISOString();   // v267 · 🧪 práctica (sin 🏆): nunca con dinero real
      if (Date.parse(sp.t0) < Date.parse(RS.since)) continue;
      if (now - Date.parse(sp.t0) > 5 * 60000) { L(RS, now, `⏭️ no compra ${sp.sym}: la señal del método llegó tarde (hace más de 5 min)`); continue; }
      const tk = tick[m]; if (!tk || !(tk.ask > 0) || tk.sp > HUECO_MAX || (ctl.conservar || []).includes(sp.sym)) continue;
      if (!X.tiene(m)) { L(RS, now, `⏭️ no compra ${sp.sym}: no está en ${EX}`); RS.saltadas = (RS.saltadas || 0) + 1; continue; }
      if (tk.ask > sp.px * (1 + PERSIGUE)) { L(RS, now, `⏭️ no compra ${sp.sym}: ya ha subido más de un ${PERSIGUE * 100} % desde la señal`); continue; }
      const mk = await mercado(m), quiere = await tam(Math.min(RS.cash, maxOrden(), valor(RS, tick) * (sp.cost0 || sp.cost) / eqSrc, Math.max(0, (await libre()) - 0.5)), mk, 1, esMuy(reglaEnUso(srcK)));
      if (quiere < Math.max(mk.min, 5) * 1.02) { L(RS, now, `⏭️ no compra ${sp.sym}: tocarían ${r2(quiere)} € y el mínimo de ${EX} es ${r2(mk.min)} €`); continue; }
      const r = await X.comprar(m, quiere); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++;
      RS.pos[m] = { src: kS, sym: sp.sym, q: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), srcT0: sp.t0, last: tk.bid }; await protege(m);
      L(RS, now, `🟢 compra ${sp.sym}: ${r2(r.coste)} € (a ${r.px})`); msgs.push(`💶 🟢 REAL: compra ${sp.sym} por ${r2(r.coste)} € (copiando a «${nombre(kS)}»)`);
    }
    }
    for (const k of Object.keys(RS.vistos)) if (now - Date.parse(RS.vistos[k]) > 3 * 86400e3) delete RS.vistos[k];
    RS.estado = "activo"; delete RS.err;
  } catch (e) {
    RS.err = String(e.message).slice(0, 120); L(RS, now, "⚠️ " + RS.err);
    if (e && e.pendUsdc > 0) { RS.usdcPend = (RS.usdcPend || 0) + e.pendUsdc; RS.cash -= e.costeEur || 0; L(RS, now, `💵 ${r2(e.pendUsdc)} USDC del bot quedan pendientes de pasar a euros (se reintenta cada minuto)`); }   // v298
    if ((X.errClave || errClave)(e)) { RS.estado = "clave"; if (!RS.avisoClave || now - Date.parse(RS.avisoClave) > 6 * 3600e3) { RS.avisoClave = now.toISOString(); msgs.push(`💶 ⚠️ ${EX} REAL: la clave no funciona (${RS.err}). Revisa que tenga permiso de OPERAR y que esté bien copiada en Ajustes.`); } }
  }
  const e2 = valor(RS, tick); RS.eq.push([now.toISOString(), r2(e2), r2(RS.start)]);   // v266 · también lo aportado hasta entonces (para no contar ingresos como ganancia) if (RS.eq.length > 3000) RS.eq = RS.eq.filter((_, i) => i % 2 === 0 || i > RS.eq.length - 500);
  RS.lastEq = r2(e2); RS.last = now.toISOString();
  return { RS, msgs, ctl };
}
// día en España (para el freno diario)
export const diaES = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
// ¿se dan las condiciones para retomar tras el freno? (lo decides tú; aquí solo se comprueba y se avisa)
export function retomar(RS, src, now) {
  const desde = Date.parse(RS.paradaAt || 0), cl = ((src && src.closed) || []), tras = cl.filter((c) => Date.parse(c.t1) > desde), ult = cl.slice(0, 15);
  const med = (a) => (a.length ? a.reduce((x, c) => x + (+c.pc || 0), 0) / a.length : null), mT = med(tras), mU = med(ult);
  const c = [
    { ok: tras.length >= 5 && mT > 0 && mU > 0, txt: `el método en ficticio se ha recuperado (${tras.length} operaciones desde la parada${mT != null ? `, ${r2(mT)} % de media` : ""}; necesita ≥ 5 y en positivo)` },
    { ok: !!src && !src.prueba, txt: "el laboratorio tiene una regla 🏆 ganadora en uso" },
    { ok: now - desde >= 2 * 86400e3, txt: `han pasado al menos 2 días (${r2((now - desde) / 86400e3)} días)` }];
  return { ok: c.every((x) => x.ok), c };
}
export const nombre = (k) => ({ mix: "🧠 IA + los mejores", eq: "⚖️ Equilibrado", turbo: "⚡ Turbo", mixokx: "🧠 IA + los mejores · solo OKX", cuant: "📐 Cuantitativo", consenso: "🧬 Consenso", eqokx: "⚖️ Equilibrado · OKX", turbookx: "⚡ Turbo · OKX", tend: "📈 Tendencia", cuantokx: "📐 Cuantitativo · OKX", consensookx: "🧬 Consenso · OKX", tendokx: "📈 Tendencia · OKX", explora: "🚀 Explorador", exploraokx: "🚀 Explorador · OKX" })[k] || k;

// ---- todo junto, llamado desde bitvavo.mjs (lee/guarda control y estado cifrado; nunca escribe importes en los registros)
// v236 · dos exchanges posibles (Bitvavo u OKX), cada uno con su estado cifrado en su rama. Solo opera el elegido en la app;
// si en el otro quedara algo abierto (porque acabas de cambiar), lo vende y se queda quieto.
const RAMAS = { bitvavo: "bitvavo-real", okx: "okx-real" };
async function exchange(ex, tick, io) {
  if (ex === "bitvavo") {
    const key = env("BITVAVO_KEY"), secret = env("BITVAVO_SECRET"); if (!key || !secret) return null;
    const api = cliente(key, secret), cache = {};
    const mercado = async (m) => { if (cache[m]) return cache[m]; const [mk] = await api("GET", "/markets?market=" + m).then((x) => (Array.isArray(x) ? x : [x])); const sym = m.replace("-EUR", ""), [as] = await api("GET", "/assets?symbol=" + sym).then((x) => (Array.isArray(x) ? x : [x])); return (cache[m] = { min: +(mk && mk.minOrderInQuoteAsset) || 5, dec: as && as.decimals != null ? +as.decimals : 8 }); };
    const saldoEur = async () => { const b = await api("GET", "/balance?symbol=EUR"), x = (Array.isArray(b) ? b : [b]).find((y) => y && y.symbol === "EUR"); return x ? +x.available || 0 : 0; };
    return bitvavoEx(api, mercado, saldoEur);
  }
  const key = env("OKX_KEY"), secret = env("OKX_SECRET"), pass = env("OKX_PASSPHRASE"); if (!key || !secret || !pass) return null;
  const OK = await import("./okx.mjs"), I = io.okxI || (await OK.instrumentos());
  return OK.adaptador(OK.cliente(key, secret, pass), I, tick);
}
// v239 · 🔌 prueba de conexión (cada 5 min, y siempre que cambien las claves): ¿hay clave?, ¿funciona?, ¿cuánto hay libre? (el saldo solo va cifrado)
export async function probar(S, tick, now, io) {
  // huella: resumen corto de las claves (solo para notar que han cambiado y volver a probar al momento; va cifrada y no permite recuperarlas)
  const huella = createHmac("sha256", "huella").update(["BITVAVO_KEY", "BITVAVO_SECRET", "OKX_KEY", "OKX_SECRET", "OKX_PASSPHRASE"].map(env).join("\n")).digest("hex").slice(0, 10);
  if (S.conex && S.conex.h === huella && now - Date.parse(S.conex.t) < 5 * 60000) return S.conex;
  const out = { t: now.toISOString(), h: huella };
  const NOMS = { bitvavo: ["BITVAVO_KEY", "BITVAVO_SECRET"], okx: ["OKX_KEY", "OKX_SECRET", "OKX_PASSPHRASE"] };
  for (const ex of EXS) {
    const tiene = Object.fromEntries(NOMS[ex].map((k) => [k, !!env(k)]));   // solo si está puesta o no (nunca el valor)
    // v243d · diagnóstico SIN el valor: largo, comillas, espacios por dentro, caracteres raros (tildes, ñ, comillas tipográficas…)
    const diag = Object.fromEntries(NOMS[ex].map((k) => { const v = env(k); return [k, v ? { largo: v.length, comillas: /^["'«“‘]|["'»”’]$/.test(v), espacios: /\s/.test(v), raros: /[^\x21-\x7e]/.test(v) } : null]; }));
    let X = null; try { X = await exchange(ex, tick, io); } catch (e) { out[ex] = { estado: "error", txt: "no pude preparar la conexión" }; continue; }
    if (!X) { out[ex] = { estado: "sin clave", tiene, diag }; continue; }
    try { const eur = await X.saldoEur(); out[ex] = { estado: "ok", eur: Math.floor(eur * 100) / 100, tiene, diag }; }
    catch (e) { out[ex] = { estado: (X.errClave || errClave)(e) ? "clave mala" : "error", txt: String(e.message).slice(0, 90), tiene, diag }; }
  }
  S.conex = out; return out;
}
// v243 · ☑️ cada cuenta (Bitvavo y OKX) se enciende o apaga por separado: ninguna, una o las dos a la vez.
// Cada una con su dinero, su método, sus frenos y su estado cifrado. «Parar todo» (/parar) las para las dos.
export function cuentas(ctl) {
  const def = { copia: SUBS_OK.includes(ctl.copia) ? ctl.copia : "mix", capital: Math.max(10, Math.round(+ctl.capital || CAPITAL)) };
  const c = ctl.cuentas && typeof ctl.cuentas === "object" ? ctl.cuentas : null, act = EXS.includes(ctl.ex) ? ctl.ex : "bitvavo";
  return Object.fromEntries(EXS.map((ex) => { const x = (c && c[ex]) || {}; return [ex, {
    on: c ? !!x.on : ex === act, copia: SUBS_OK.includes(x.copia) || x.copia === "auto" ? x.copia : def.copia, capital: x.capital ? Math.max(10, Math.round(+x.capital)) : def.capital,
    parado: !!x.parado, motivo: x.motivo || null, avisoSinSaldo: x.avisoSinSaldo || 0, auto: x.copia === "auto", adoptarAt: x.adoptarAt || null, espejo: !!x.espejo, convertir: x.convertir || null, conservar: Array.isArray(x.conservar) ? x.conservar : [], riesgo: ["bajo", "medio", "alto", "auto"].includes(x.riesgo) ? x.riesgo : "auto", liquidar: x.liquidar || null }]; }));   // v318 · 🎚️ riesgo (de momento, máximo)
}
const NOMBRE_EX = { bitvavo: "Bitvavo", okx: "OKX" };
export async function paso(S, tick, now, io) { const tick0 = tick;
  const pw = env("REAL_VIEW_PASS");
  try { const c = await probar(S, tick, now, io); console.log(`Conexión: Bitvavo ${c.bitvavo.estado} · OKX ${c.okx.estado}`); } catch (e) {}
  if (!(env("BITVAVO_KEY") && env("BITVAVO_SECRET")) && !(env("OKX_KEY") && env("OKX_SECRET") && env("OKX_PASSPHRASE"))) { S.real = { estado: "sin clave" }; return; }
  let EL = null; try { EL = await io.leer("examen-largo.json", "examen-largo"); } catch (e) {}   // v293
  let ctl = await io.leer("ctl.json", "bitvavo-ctl"); if (!ctl) { ctl = { copia: "mix", parado: false, capital: CAPITAL, ex: "bitvavo", t: now.toISOString() }; io.publicar("ctl.json", ctl, "bitvavo-ctl"); }
  const CU = cuentas(ctl); let ctlMod = false;
  const fuentes = { eq: S, ...Object.fromEntries(SUBS_OK.filter((k) => k !== "eq").map((k) => [k, S.sub && S.sub[k]])) };
  S.real = { estado: EXS.some((e) => CU[e].on) ? "activo" : "apagado", parado: !!ctl.parado, cuentas: {} };
  marcaMuy(S, fuentes, now);
  for (const ex of EXS) {
    const cfg = CU[ex], N = NOMBRE_EX[ex], R0 = (S.real.cuentas[ex] = { on: cfg.on, copia: cfg.copia, estado: cfg.on ? "sin clave" : "apagada", t: now.toISOString() });
    const cx = S.conex && S.conex[ex];
    if (cfg.on && cx && ["clave mala", "error"].includes(cx.estado)) { R0.estado = cx.estado === "clave mala" ? "clave" : "error"; console.log("Real: la conexión con " + ex + " no funciona"); continue; }
    if (ex === "okx" && cfg.on && io.tickOkx === null) { console.log("Real (okx): sin precios de OKX este minuto: no opera (nunca con precios de Bitvavo)"); continue; }   // v295
    const tick = ex === "okx" && io.tickOkx ? io.tickOkx : tick0;   // v287 · OKX con precios de OKX
    let X = null; try { X = await exchange(ex, tick, io); } catch (e) { console.log("Real: no pude preparar " + ex); }
    if (!X) continue;
    if (!pw) { R0.estado = "sin REAL_VIEW_PASS"; console.log("Real: falta REAL_VIEW_PASS (no se guarda nada sin cifrar)"); continue; }
    let RS = null; const j = await io.leer("real.json", RAMAS[ex]);
    if (j) { const o = await openAny(j, [pw, env("REAL_VIEW_PASS_OLD")]); if (o.error) { console.log("Real: no puedo descifrar el estado de " + ex + "; no opero"); R0.estado = "error"; continue; } RS = o.j; }
    if (!cfg.on && (!RS || !Object.keys(RS.pos || {}).length)) continue;   // apagada y sin nada abierto: no se toca
    // v260 · 💱 convertir a euros lo que tengas en otra cripto (lo pides tú desde la app, una vez): vende TODO ese saldo a mercado
    if (cfg.on && cfg.convertir && cfg.convertir.at && cfg.convertir.hecho !== cfg.convertir.at && X.saldo) {
      const sym = String(cfg.convertir.sym || "").toUpperCase(), m = sym + "-EUR"; let txt;
      try { const q = await X.saldo(sym), bid = (tick[m] && tick[m].bid) || 0, mk = await X.mercado(m);
        if (!(q * bid >= Math.max(5, mk.min))) txt = `💶 ${N} · 💱 no había ${sym} suficiente para vender (hacen falta al menos ${Math.max(5, mk.min).toFixed(2)} €).`;
        else { const r = await X.vender(m, q); txt = `💶 ${N} · 💱 vendido tu ${sym}: ${r.q} ${sym} → ${r.got.toFixed(2)} € (ya en euros para el bot).`; } }
      catch (e) { txt = `💶 ${N} · ⚠️ no pude vender tu ${sym}: ${String(e.message).slice(0, 100)}`; }
      await io.tg(txt); console.log(`Real (${ex}): conversión a euros pedida · ${/vendido/.test(txt) ? "hecha" : "no hecha"}`);
      const k = (ctl.cuentas = ctl.cuentas || {}); k[ex] = { ...(k[ex] || {}), convertir: { ...cfg.convertir, hecho: cfg.convertir.at, txt: txt.replace(/^💶 \S+ · /, "") } }; ctlMod = true; }
    let copia = cfg.copia;
    // v295 · 📆 TRES ESTADOS por método, según el examen de un año de SU regla actual (y, en Consenso, de su comité):
    //  · «aprobada»: aprueba el año o es «suave», examen reciente → el dinero real la puede seguir
    //  · «pendiente»: aún sin examinar esa regla (o examen viejo) → solo ficticio en automático
    //  · «suspendida»: suspende el año → nunca recibe dinero real (ni en automático ni elegida a mano)
    const estadoAnio = (k) => estadoExamen(EL, k, fuentes, now);
    const fuentesA = Object.fromEntries(Object.entries(fuentes).filter(([k]) => estadoAnio(k) === "aprobada"));
    R0.suspendidos = Object.keys(fuentes).filter((k) => estadoAnio(k) === "suspendida"); R0.pendientes = Object.keys(fuentes).filter((k) => estadoAnio(k) === "pendiente" && reglaEnUso(fuentes[k]));
    if (cfg.auto) { const A = autoElige(fuentesA, RS && RS.copia, !!(RS && Object.keys(RS.pos || {}).length), S.muyDesde, now, ((S.visibles && S.visibles[ex]) || FAMILIA[ex]), RS && RS.copiaDesde); copia = A.copia; R0.auto = A;
      // v313 · solo avisa si el cambio es a un método APROBADO y como mucho una vez al día por exchange
      if (RS && RS.copia && RS.copia !== copia && estadoAnio(copia) === "aprobada" && (!RS.avCambio || now - Date.parse(RS.avCambio) >= 24 * 3600e3) && (RS.avCambio = now.toISOString())) await io.tg(`💶 ${N} · 🤖 CAMBIO DE MÉTODO: de «${nombre(RS.copia)}» a «${nombre(copia)}» — ${A.motivo}. Lo que ya estaba abierto sigue con su método hasta venderlo.`); }
    R0.copia = copia;
    // v269/v270 · los demás ganadores: primero los de su exchange y luego TODOS los demás con 🏆 (lo que no esté en el exchange se salta solo)
    const extra = cfg.auto ? [...((S.visibles && S.visibles[ex]) || FAMILIA[ex]), ...SUBS_OK].filter((k) => !/^riesgo/.test(k)).filter((k, i, a) => a.indexOf(k) === i && k !== copia && reglaEnUso(fuentesA[k])).filter(() => false) : [];   // v304 · UN SOLO método campeón: nunca extras   // v297 · extras solo con la cartera combinada aprobada, reciente y con esos métodos   // v295 · si la cartera combinada suspende, sin extras
    if (cfg.auto) R0.extra = extra;
    // v295 · nunca dinero real a un método suspendido; en automático, solo a aprobados (si no queda ninguno, espera sin comprar)
    let noCompra = false; if (estadoAnio(copia) === "suspendida") { noCompra = true; R0.bloqueo = `«${nombre(copia)}» suspende el examen de un año: no compra con dinero real`; }
    else if (cfg.auto && !reglaEnUso(fuentesA[copia])) { noCompra = true; R0.bloqueo = "ningún método aprobado por el examen de un año ahora: espera sin comprar"; }
    // v301 · cartera base: tendencia fresca (< 3 h) y su regla aprobada por el examen de 2 años (reciente)
    const baseOk = !!(EL && EL.base && EL.base.ok === true && EL.base.v === VEX_REAL && now - Date.parse(EL.t) < 12 * 3600e3), T = S.base && now - S.base.t < 3 * 3600e3 ? S.base : null;
    R0.base = baseOk ? (T ? "activa" : "sin datos de tendencia") : "pendiente del examen";
    // v318 · 🎚️ las reglas y señales del perfil de riesgo elegido para esta cuenta
    // v321 · 🤖 «auto»: en cada examen usa el nivel que MÁS gana en 2 años entre los que aprueban
    const TE0 = EL && EL.tortugas && EL.tortugas[ex], autoRk = (() => { const PF = (TE0 && TE0.perfiles) || {}; const ok = Object.entries(PF).filter(([, x]) => x && x.ok === true).sort((a, b) => b[1].ret - a[1].ret); return ok.length ? ok[0][0] : "medio"; })();
    const rk = !cfg.riesgo || cfg.riesgo === "auto" ? autoRk : cfg.riesgo; const TE = TE0 && TE0.perfiles && TE0.perfiles[rk] ? TE0.perfiles[rk] : rk === "medio" ? TE0 : null, tortOk = !!(TE && TE.ok === true && TE.v === VEX_REAL && now - Date.parse(EL.t) < 12 * 3600e3);
    const TS0 = S.tort && S.tort[ex] && now - S.tort[ex].t < 30 * 3600e3 ? S.tort[ex] : null, TS = TS0 ? (TS0.perfiles && TS0.perfiles[rk] ? { t: TS0.t, ...TS0.perfiles[rk] } : rk === "medio" ? TS0 : null) : null; R0.riesgo = rk;
    R0.tortugas = tortOk ? (TS ? "activas" : "sin velas diarias todavía") : TE ? `no aprueban (${TE.motivo || "examen"})` : "pendientes del examen";
    // v304 · 🖥️ la terminal cuenta qué sigue cada cuenta y por qué
    if (soloT()) { R0.solo = "tortugas"; R0.tortReglas = tortDesc(TE && TE.P); R0.riesgoNombre = tortPerfil(rk).nombre; R0.tortAprende = TE && TE.aprende ? { motivo: TE.aprende.motivo, desde: TE.aprende.desde, total: TE.aprende.total || 0, hoy: TE.aprende.hoy || 0 } : null; R0.bloqueo = R0.tortugas === "activas" ? "" : "🐢 las Tortugas " + R0.tortugas + ": espera sin comprar"; }
    console.log(soloT() ? `💶 ${N}: 🐢 solo Tortugas · riesgo ${R0.riesgoNombre || rk} (${R0.tortugas})${TE && TE.P ? " · " + tortDesc(TE.P) : ""}` : `💶 ${N}: campeón «${copia}» (${estadoAnio(copia)}${R0.auto && R0.auto.motivo ? " · " + R0.auto.motivo : ""}) · ${noCompra ? "⏸️ " + (R0.bloqueo || "no compra") : "compra cuando su método da señal"} · 🐢 Tortugas ${R0.tortugas} · 🧺 base ${R0.base}`);
    const BW = S.ballenas && now - S.ballenas.t < 30 * 60e3 ? S.ballenas : null; R0.ballenas = BW ? "activa" : "sin datos recientes de Hyperliquid";
    const c2 = { copia, extra, noCompra, ballenas: BW, tort: tortOk && TS ? TS : null, base: baseOk && T ? T : null, conservar: Array.isArray(cfg.conservar) ? cfg.conservar.map((x) => String(x).toUpperCase()) : [], capital: cfg.capital, adoptarAt: cfg.adoptarAt || null, liquidar: cfg.liquidar || null, espejo: !!cfg.espejo, avisoSinSaldo: cfg.avisoSinSaldo,
      parado: !cfg.on || !!ctl.parado || cfg.parado, motivo: !cfg.on ? `has apagado ${N}` : ctl.parado ? ctl.motivo || "lo has parado tú" : cfg.motivo };
    const out = await vuelta(RS, fuentes, c2, tick, now, { ex: X });
    const msgs = out.msgs.map((m) => (m.includes(N) ? m : m.replace(/^💶 /, `💶 ${N} · `)));
    if (out.ctlCambia && cfg.on) {   // lo que cambia solo (freno grande, aviso de falta de saldo) se guarda en ESA cuenta
      const k = (ctl.cuentas = ctl.cuentas || Object.fromEntries(EXS.map((e) => [e, { on: CU[e].on, copia: CU[e].copia, capital: CU[e].capital }])));
      k[ex] = { ...(k[ex] || {}), avisoSinSaldo: out.ctl.avisoSinSaldo || 0, ...(out.ctl.parado && !c2.parado ? { parado: true, motivo: out.ctl.motivo } : {}) }; ctlMod = true;
    }
    if (out.sinEmpezar) { R0.estado = "sin saldo"; for (const m of msgs) await io.tg(m); console.log("Real (" + ex + "): sin saldo suficiente"); continue; }
    out.RS.ex = ex; out.RS.savedAt = Date.now(); const enc = await encrypt(JSON.stringify(out.RS), pw);
    io.publicar("real.json", { enc: 1, v: 1, ...enc, meta: { estado: out.RS.estado || "activo", copia: out.RS.copia, ex, t: now.toISOString() } }, RAMAS[ex]);
    R0.estado = cfg.on ? out.RS.estado : "apagada"; R0.copia = out.RS.copia;
    for (const m of msgs.slice(0, 6)) await io.tg(m);
    // v254 · diagnóstico público SIN criptos ni importes: qué ha hecho en esta vuelta (cuántas compras, ventas y saltos, y por qué)
    { const nuevos = (out.RS.log || []).filter((x) => x.t === now.toISOString()), cat = {};
      for (const x of nuevos) { const k = /^🟢|^📥 copia lo abierto: compra|^➕/.test(x.txt) ? "compra" : /^✅|^🔻|vende/.test(x.txt) ? "venta" : /no está en/.test(x.txt) ? "salta: no está en el exchange" : /mínimo/.test(x.txt) ? "salta: menos que el mínimo" : /subido más/.test(x.txt) ? "salta: ya subió" : /tarde/.test(x.txt) ? "salta: señal tarde" : /nada que se pudiera copiar/.test(x.txt) ? "copiar abierto: nada" : /^⚠️/.test(x.txt) ? "aviso/error" : "otro"; cat[k] = (cat[k] || 0) + 1; }
      const pos = Object.keys(out.RS.pos || {}).length, fuente = fuentes[out.RS.copia], abiertasM = fuente ? Object.keys(fuente.pos || {}).length : null;
      console.log(`Real (${ex}): ${out.RS.estado}${out.RS.err ? " (con avisos: " + String(out.RS.err).replace(/[A-Z0-9]{2,10}-EUR|\d+[.,]?\d*\s*€/g, "·").slice(0, 80) + ")" : ""} · copia ${out.RS.copia} (el método tiene ${abiertasM} abiertas) · abiertas reales ${pos}${Object.keys(cat).length ? " · " + Object.entries(cat).map(([k, v]) => k + " ×" + v).join(", ") : ""}`); }
  }
  if (ctlMod) { ctl.t = now.toISOString(); delete ctl.avisoSinSaldo; io.publicar("ctl.json", ctl, "bitvavo-ctl"); }
  // compatibilidad: el estado «principal» es el de la primera cuenta encendida
  const pri = EXS.find((e) => CU[e].on); if (pri) Object.assign(S.real, { estado: S.real.cuentas[pri].estado, ex: pri, copia: S.real.cuentas[pri].copia });
}
