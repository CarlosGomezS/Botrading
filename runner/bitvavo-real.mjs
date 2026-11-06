// v233 · 💶 BITVAVO CON DINERO REAL (50 €): copia a UNO de los submodos de «IA y laboratorio» (el que elijas en la app)
//  · cuando el submodo ficticio compra, aquí se compra la misma proporción del dinero; cuando vende (entera o una parte), también
//  · solo copia compras NUEVAS (de menos de 5 min) y no persigue el precio: si ya ha subido > 1,5 % desde la compra ficticia, no entra
//  · cambiar de submodo en la app → vende lo abierto y empieza a copiar al nuevo
//  · FRENOS: nunca usa más de 50 € (aunque haya más en la cuenta) · ninguna orden de más de 30 € · se para sola y vende todo si el
//    saldo cae un 25 % (por debajo de 37,50 €) · /parar en Telegram o el botón de la app lo detiene al momento
//  · la clave de Bitvavo debe tener SOLO permiso de operar (nunca de retirar): aunque se filtrara, no podría sacar dinero
// Privacidad: el estado va CIFRADO (REAL_VIEW_PASS) en la rama «bitvavo-real»; en público solo el estado (activo/parado), sin importes
// ni criptos. La orden (submodo, parar/seguir) va en la rama «bitvavo-ctl». Nunca se escriben importes en los registros públicos.
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
export const MUY_ESTABLE_MS = 60 * 60000;
export function marcaMuy(S, fuentes, now) { S.muyDesde = S.muyDesde || {}; for (const k of SUBS_OK) { const v = reglaEnUso(fuentes[k]); if (v && esMuy(v)) S.muyDesde[k] = S.muyDesde[k] || now.toISOString(); else delete S.muyDesde[k]; } return S.muyDesde; }
export const PERMANENCIA_MS = 6 * 3600e3;
export function autoElige(fuentes, actual, abiertas, muyDesde = null, now = new Date(), familia = null, desde = null) {
  const estable = (k, v) => esMuy(v) && (!muyDesde || (muyDesde[k] && now - Date.parse(muyDesde[k]) >= MUY_ESTABLE_MS));
  const lista = familia && familia.length ? familia : SUBS_OK;
  if (familia && familia.length && actual && !familia.includes(actual)) actual = null;   // si venía de otra familia, elige ya dentro de la suya
  const c = lista.map((k) => { const v = reglaEnUso(fuentes[k]); return v ? { k, s: +v.s || 0, muy: estable(k, v) } : null; }).filter(Boolean).sort((a, b) => (b.muy - a.muy) || b.s - a.s);
  const cur = c.find((x) => x.k === actual), best = c[0];
  if (cur && best && best.k !== actual && desde && now - Date.parse(desde) < PERMANENCIA_MS) return { copia: actual, muy: cur.muy, motivo: "lleva poco con este método (se cambia como mucho cada 6 h)" };
  if (!best) return { copia: SUBS_OK.includes(actual) ? actual : lista[0], muy: false, motivo: "ningún método tiene regla ganadora ahora" };
  // v258 · con algo abierto solo espera si el cambio no es urgente: si aparece uno ⭐⭐ muy bueno (y el actual no lo es) o el actual pierde la 🏆, cambia ya
  if (abiertas && SUBS_OK.includes(actual) && cur && !(best.muy && !cur.muy)) return { copia: actual, muy: !!cur.muy, motivo: "espera a cerrar lo abierto para cambiar" };
  if (cur && !(best.muy && !cur.muy) && best.s < cur.s + 1) return { copia: actual, muy: cur.muy, motivo: "sigue siendo de los mejores" };
  return { copia: best.k, muy: best.muy, motivo: best.muy ? "⭐ muy ganadora" : "la de regla ganadora más fuerte" };
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
async function comprar(api, m, eur) {
  const o = await api("POST", "/order", { market: m, side: "buy", orderType: "market", amountQuote: eur.toFixed(2), operatorId: OPERADOR });
  const q = +o.filledAmount || 0, quote = +o.filledAmountQuote || 0, fee = o.feeCurrency === "EUR" || !o.feeCurrency ? +o.feePaid || 0 : 0, feeBase = o.feeCurrency && o.feeCurrency !== "EUR" ? +o.feePaid || 0 : 0;
  if (!(q > 0)) throw new Error("la compra no se ejecutó");
  return { q: q - feeBase, coste: quote + fee, fee, px: quote / q };
}
async function vender(api, m, q, dec) {
  const f = 10 ** dec, amount = Math.floor(q * f) / f; if (!(amount > 0)) return { q: 0, got: 0, fee: 0 };
  const o = await api("POST", "/order", { market: m, side: "sell", orderType: "market", amount: amount.toFixed(dec), operatorId: OPERADOR });
  const quote = +o.filledAmountQuote || 0, fee = +o.feePaid || 0; return { q: +o.filledAmount || amount, got: quote - fee, fee, px: quote / Math.max(1e-12, +o.filledAmount || amount) };
}

// v236 · adaptador de Bitvavo (misma forma que el de OKX: comprar, vender, mercado, saldoEur, tiene)
export function bitvavoEx(api, mercado, saldoEur) {
  const saldo = async (sym) => { const b = await api("GET", "/balance?symbol=" + sym), x = (Array.isArray(b) ? b : [b]).find((y) => y && y.symbol === sym); return x ? +x.available || 0 : 0; };
  return { nombre: "Bitvavo", fee: FEE, tiene: () => true, comprar: (m, eur) => comprar(api, m, eur), vender: async (m, q) => { const mk = await mercado(m); return vender(api, m, q, mk.dec); }, mercado, saldoEur, saldo, errClave };
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
  const alMinimo = async (quiere, mk) => { const need = Math.max(mk.min, 5) * 1.02; if (quiere >= need) return quiere; const tope = Math.min(RS.cash, valor(RS, tick) * 0.25, Math.max(0, (await libre()) - 0.5)); return need <= tope ? need : quiere; };
  RS.vistos = RS.vistos || {};
  const vendeTodo = async (por) => { for (const m of Object.keys(RS.pos)) await cerrar(m, por); };
  async function cerrar(m, por, frac = 1) {
    const p = RS.pos[m], mk = await mercado(m), bid = tick[m] ? tick[m].bid : p.px;
    if (frac < 1 && p.q * (1 - frac) * bid < mk.min) frac = 1;   // si lo que quedaría es menos que el mínimo, se vende todo
    const qv = frac >= 1 ? p.q : p.q * frac;
    if (qv * bid < mk.min) { if (frac < 1) { p.tp = 1; return; } L(RS, now, `${p.sym}: lo que queda es menos que el mínimo de ${EX} (${r2(mk.min)} €); se queda como «polvo» en la cuenta`); RS.cash += qv * bid * (1 - RS.fee); delete RS.pos[m]; return; }
    let r; try { r = await X.vender(m, qv); } catch (e) { if (/216|51008|insufficient|saldo/i.test(e.message) && frac >= 1) { L(RS, now, `⚠️ ${p.sym}: no queda saldo que vender; se da por cerrada`); delete RS.pos[m]; return; } throw e; }
    RS.cash += r.got; RS.st.fees += r.fee; p.cob = (p.cob || 0) + r.got; p.q -= r.q;
    if (frac >= 1 || p.q * (tick[m] ? tick[m].bid : p.px) < mk.min) {
      const pnl = p.cob - p.cost; RS.st.pnl += pnl; if (pnl >= 0) RS.st.wins++; else RS.st.losses++;
      RS.closed.unshift({ m, sym: p.sym, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(p.cob), pnl: r2(pnl), pc: r2((p.cob / p.cost - 1) * 100), why: por }); RS.closed = RS.closed.slice(0, 300); delete RS.pos[m];
      L(RS, now, `${pnl >= 0 ? "✅" : "🔻"} vende ${p.sym}: ${pnl >= 0 ? "+" : ""}${r2(pnl)} € (${r2((p.cob / p.cost - 1) * 100)} %) · ${por}`); msgs.push(`💶 ${pnl >= 0 ? "✅" : "🔻"} REAL: vende ${p.sym} → ${pnl >= 0 ? "+" : ""}${r2(pnl)} € (${r2((p.cob / p.cost - 1) * 100)} %) · ${por}`);
    } else { p.tp = 1; L(RS, now, `💰 vende parte de ${p.sym} (+${r2(r.got)} €) · ${por}`); msgs.push(`💶 💰 REAL: vende parte de ${p.sym} (${r2(r.got)} €) · ${por}`); }
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
    // 2) freno: si el saldo cae un 25 %, vende todo y se para
    const eq = valor(RS, tick);
    if (eq < RS.start * (1 - FRENO)) { await vendeTodo(`freno: el saldo ha caído un ${FRENO * 100} %`); ctl = { ...ctl, parado: true, motivo: `freno automático: el saldo cayó un ${FRENO * 100} %` }; RS.estado = "parado"; RS.paradaAt = now.toISOString(); msgs.push(`💶 🛑 REAL PARADO por el freno: el saldo ha caído por debajo de ${r2(RS.start * (1 - FRENO))} €. He vendido todo y no compraré más. Te avisaré cuando se cumplan las condiciones para retomar (el método se recupera en ficticio, vuelve a tener regla ganadora y pasan 2 días). Para volver antes: /seguir`); return { RS, msgs, ctl, ctlCambia: true }; }
    // 2b) freno diario: si hoy pierde un 10 % desde el principio del día, vende todo y descansa hasta mañana
    { const d = diaES(now); if (!RS.dia || RS.dia.d !== d) RS.dia = { d, eq0: eq };
      if (RS.pausaDia === d) { if (Object.keys(RS.pos).length) await vendeTodo("descanso hasta mañana (freno diario)"); RS.estado = "pausa"; return { RS, msgs, ctl }; }
      if (RS.pausaDia && RS.pausaDia !== d) { delete RS.pausaDia; L(RS, now, "▶️ nuevo día: vuelve a operar tras el freno diario"); msgs.push("💶 ▶️ REAL: nuevo día, vuelve a operar tras el descanso del freno diario."); }
      if (eq < RS.dia.eq0 * (1 - FRENO_DIA)) { await vendeTodo(`freno diario: hoy ha perdido un ${FRENO_DIA * 100} %`); RS.pausaDia = d; RS.estado = "pausa"; msgs.push(`💶 ⏸️ REAL: hoy ha perdido más de un ${FRENO_DIA * 100} % (de ${r2(RS.dia.eq0)} € a ${r2(eq)} €). He vendido todo y descansa hasta mañana; mañana vuelve solo.`); return { RS, msgs, ctl }; } }
    // 3) lo que tengo: ¿el submodo lo ha vendido entero, o una parte, o ha añadido (piramidar)?
    for (const [m, p] of Object.entries(RS.pos)) {
      const srcP = (p.src && fuentes[p.src]) || src, sp = srcP && srcP.pos ? srcP.pos[m] : null; if (tick[m]) p.last = tick[m].bid;
      if (!sp || sp.t0 !== p.srcT0) { await cerrar(m, "el método ficticio ha vendido"); continue; }
      if (sp.cob > 0 && !p.tp && sp.q0 > 0) { const frac = 1 - sp.q / sp.q0; if (frac > 0.05) await cerrar(m, "venta parcial con ganancia (como el método)", frac); }
      if (sp.pir && !p.pir && sp.cost0 > 0) { const add = Math.min(RS.cash, p.cost0 * (sp.cost - sp.cost0) / sp.cost0, maxOrden(), Math.max(0, (await libre()) - 0.5)), mk = await mercado(m); p.pir = 1; if (add >= mk.min) { const r = await X.comprar(m, add); RS.cash -= r.coste; RS.st.fees += r.fee; p.q += r.q; p.cost += r.coste; L(RS, now, `➕ añade ${r2(r.coste)} € a ${p.sym} (como el método)`); } }
    }
    // 4) compras nuevas del submodo (de menos de 5 min) en la misma proporción
    // v269 · en 🤖 Automático copia a la vez a TODOS los métodos con 🏆 de su exchange (más operaciones, siempre ganadores), repartiendo el dinero
    const lista = [copia, ...(ctl.extra || [])].filter((k, i, a) => fuentes[k] && a.indexOf(k) === i), w = 1 / Math.max(1, lista.length);
    for (const kS of lista) { const srcK = fuentes[kS], eqSrc = +srcK.lastEq || 100;
    // v253 · «📥 Copiar ya lo abierto» (lo pides tú): compra ahora lo que el método YA tiene abierto (lo que esté en este exchange), a precio de ahora
    // v256 · «🪞 espejo» (siempre): en cada vuelta compra todo lo que el método tenga abierto y aún no tenga la cuenta real (cada posición una sola vez)
    const pedido = ctl.adoptarAt && RS.adoptAt !== ctl.adoptarAt;
    if (pedido || ctl.espejo) { if (pedido) RS.adoptAt = ctl.adoptarAt; let nA = 0, mira = 0;
      for (const [m, sp] of Object.entries(srcK.pos)) { if (RS.pos[m] || sp.practica) continue; const tk = tick[m]; if (!tk || !(tk.ask > 0)) continue;   /* lo de 🧪 práctica no se copia */ if (!pedido && RS.vistos[m + "|" + sp.t0]) continue; mira++;
        RS.vistos[m + "|" + sp.t0] = now.toISOString();
        if (!X.tiene(m)) { L(RS, now, `⏭️ no copia ${sp.sym} (abierta): no está en ${EX}`); continue; }
        const frac = sp.q0 > 0 ? sp.q / sp.q0 : 1, mk = await mercado(m), quiere = await alMinimo(Math.min(RS.cash, maxOrden(), valor(RS, tick) * (sp.cost0 || sp.cost) * frac * w / eqSrc, Math.max(0, (await libre()) - 0.5)), mk);
        if (quiere < Math.max(mk.min, 5) * 1.02) { L(RS, now, `⏭️ no copia ${sp.sym} (abierta): tocarían ${r2(quiere)} € y el mínimo de ${EX} es ${r2(mk.min)} €`); continue; }
        const r = await X.comprar(m, quiere); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++; nA++;
        RS.pos[m] = { src: kS, sym: sp.sym, q: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), srcT0: sp.t0, last: tk.bid, tp: sp.cob > 0 ? 1 : 0, pir: sp.pir ? 1 : 0 };
        L(RS, now, `📥 copia lo abierto: compra ${sp.sym} por ${r2(r.coste)} € (el método la compró a ${sp.px}; ahora ${r.px})`); msgs.push(`💶 📥 REAL: copia lo que ya tenía abierto el método: compra ${sp.sym} por ${r2(r.coste)} €`); }
      if (!nA && pedido) L(RS, now, "📥 copiar lo abierto: no había nada que se pudiera copiar ahora"); void mira; }
    for (const [m, sp] of Object.entries(srcK.pos)) {
      const k = m + "|" + sp.t0; if (RS.pos[m] || RS.vistos[k] || sp.practica) continue; RS.vistos[k] = now.toISOString();   // v267 · 🧪 práctica (sin 🏆): nunca con dinero real
      if (Date.parse(sp.t0) < Date.parse(RS.since)) continue;
      if (now - Date.parse(sp.t0) > 5 * 60000) { L(RS, now, `⏭️ no compra ${sp.sym}: la señal del método llegó tarde (hace más de 5 min)`); continue; }
      const tk = tick[m]; if (!tk || !(tk.ask > 0)) continue;
      if (!X.tiene(m)) { L(RS, now, `⏭️ no compra ${sp.sym}: no está en ${EX}`); RS.saltadas = (RS.saltadas || 0) + 1; continue; }
      if (tk.ask > sp.px * (1 + PERSIGUE)) { L(RS, now, `⏭️ no compra ${sp.sym}: ya ha subido más de un ${PERSIGUE * 100} % desde la señal`); continue; }
      const mk = await mercado(m), quiere = await alMinimo(Math.min(RS.cash, maxOrden(), valor(RS, tick) * (sp.cost0 || sp.cost) * w / eqSrc, Math.max(0, (await libre()) - 0.5)), mk);
      if (quiere < Math.max(mk.min, 5) * 1.02) { L(RS, now, `⏭️ no compra ${sp.sym}: tocarían ${r2(quiere)} € y el mínimo de ${EX} es ${r2(mk.min)} €`); continue; }
      const r = await X.comprar(m, quiere); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++;
      RS.pos[m] = { src: kS, sym: sp.sym, q: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), srcT0: sp.t0, last: tk.bid };
      L(RS, now, `🟢 compra ${sp.sym}: ${r2(r.coste)} € (a ${r.px})`); msgs.push(`💶 🟢 REAL: compra ${sp.sym} por ${r2(r.coste)} € (copiando a «${nombre(kS)}»)`);
    }
    }
    for (const k of Object.keys(RS.vistos)) if (now - Date.parse(RS.vistos[k]) > 3 * 86400e3) delete RS.vistos[k];
    RS.estado = "activo"; delete RS.err;
  } catch (e) {
    RS.err = String(e.message).slice(0, 120); L(RS, now, "⚠️ " + RS.err);
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
    parado: !!x.parado, motivo: x.motivo || null, avisoSinSaldo: x.avisoSinSaldo || 0, auto: x.copia === "auto", adoptarAt: x.adoptarAt || null, espejo: !!x.espejo, convertir: x.convertir || null }]; }));
}
const NOMBRE_EX = { bitvavo: "Bitvavo", okx: "OKX" };
export async function paso(S, tick, now, io) {
  const pw = env("REAL_VIEW_PASS");
  try { const c = await probar(S, tick, now, io); console.log(`Conexión: Bitvavo ${c.bitvavo.estado} · OKX ${c.okx.estado}`); } catch (e) {}
  if (!(env("BITVAVO_KEY") && env("BITVAVO_SECRET")) && !(env("OKX_KEY") && env("OKX_SECRET") && env("OKX_PASSPHRASE"))) { S.real = { estado: "sin clave" }; return; }
  let ctl = await io.leer("ctl.json", "bitvavo-ctl"); if (!ctl) { ctl = { copia: "mix", parado: false, capital: CAPITAL, ex: "bitvavo", t: now.toISOString() }; io.publicar("ctl.json", ctl, "bitvavo-ctl"); }
  const CU = cuentas(ctl); let ctlMod = false;
  const fuentes = { eq: S, ...Object.fromEntries(SUBS_OK.filter((k) => k !== "eq").map((k) => [k, S.sub && S.sub[k]])) };
  S.real = { estado: EXS.some((e) => CU[e].on) ? "activo" : "apagado", parado: !!ctl.parado, cuentas: {} };
  marcaMuy(S, fuentes, now);
  for (const ex of EXS) {
    const cfg = CU[ex], N = NOMBRE_EX[ex], R0 = (S.real.cuentas[ex] = { on: cfg.on, copia: cfg.copia, estado: cfg.on ? "sin clave" : "apagada", t: now.toISOString() });
    const cx = S.conex && S.conex[ex];
    if (cfg.on && cx && ["clave mala", "error"].includes(cx.estado)) { R0.estado = cx.estado === "clave mala" ? "clave" : "error"; console.log("Real: la conexión con " + ex + " no funciona"); continue; }
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
    if (cfg.auto) { const A = autoElige(fuentes, RS && RS.copia, !!(RS && Object.keys(RS.pos || {}).length), S.muyDesde, now, ((S.visibles && S.visibles[ex]) || FAMILIA[ex]), RS && RS.copiaDesde); copia = A.copia; R0.auto = A;
      if (RS && RS.copia && RS.copia !== copia) await io.tg(`💶 ${N} · 🤖 AUTOMÁTICO: ahora copia a «${nombre(copia)}» (${A.motivo}).`); }
    R0.copia = copia;
    // v269/v270 · los demás ganadores: primero los de su exchange y luego TODOS los demás con 🏆 (lo que no esté en el exchange se salta solo)
    const extra = cfg.auto ? [...((S.visibles && S.visibles[ex]) || FAMILIA[ex]), ...SUBS_OK].filter((k) => k !== "riesgo").filter((k, i, a) => a.indexOf(k) === i && k !== copia && reglaEnUso(fuentes[k])) : [];
    if (cfg.auto) R0.extra = extra;
    const c2 = { copia, extra, capital: cfg.capital, adoptarAt: cfg.adoptarAt || null, espejo: !!cfg.espejo, avisoSinSaldo: cfg.avisoSinSaldo,
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
