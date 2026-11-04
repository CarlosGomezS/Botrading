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
export const SUBS_OK = ["mix", "eq", "turbo"];
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
export const valor = (RS, tick) => RS.cash + Object.entries(RS.pos).reduce((s, [m, p]) => s + p.q * ((tick[m] && tick[m].bid) || p.last || p.px) * (1 - FEE), 0);

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

// ---- una vuelta (cada minuto, justo después de que los submodos ficticios hayan comprado o vendido)
// fuentes = { eq: S, turbo: S.sub.turbo, mix: S.sub.mix } · ctl = { copia, parado } · deps = { api, tg, mercados(m) → {min, dec} }
export async function vuelta(RS, fuentes, ctl, tick, now, deps) {
  const { api, tg = async () => {}, mercado } = deps, msgs = [];
  const copia = SUBS_OK.includes(ctl.copia) ? ctl.copia : "mix", objetivo = Math.max(10, Math.round(+ctl.capital || CAPITAL));
  // saldo libre en euros en la cuenta de Bitvavo (una consulta por vuelta, solo si hace falta)
  let libre0 = null; const libre = async () => (libre0 != null ? libre0 : (libre0 = deps.saldoEur ? await deps.saldoEur() : Infinity));
  if (!RS || RS.v !== 1) {
    const hay = await libre().catch(() => 0), cap = Math.min(objetivo, Math.floor(hay * 100) / 100);
    if (!(cap >= 10)) { return { RS: RS && RS.v === 1 ? RS : null, msgs: ctl.avisoSinSaldo ? [] : [`💶 ⚠️ Bitvavo REAL: en tu cuenta hay ${r2(hay)} € libres; hacen falta al menos 10 € para empezar.`], ctl: { ...ctl, avisoSinSaldo: 1 }, ctlCambia: !ctl.avisoSinSaldo, sinEmpezar: true }; }
    RS = fresh(now, copia, cap); L(RS, now, `💶 empieza con ${cap} € reales copiando a «${copia}»`);
    msgs.push(`💶 Bitvavo REAL empieza: ${cap} € copiando al submodo «${nombre(copia)}»${cap < objetivo ? ` (pediste ${objetivo} €, pero en Bitvavo solo hay ${r2(hay)} € libres)` : ""}. Frenos: nunca más de esa cantidad, se para sola si cae un ${FRENO * 100} %. /parar cuando quieras.`);
  }
  RS.capital = RS.capital ?? RS.start;
  const maxOrden = () => Math.max(MAX_ORDEN, RS.start * 0.6);
  RS.vistos = RS.vistos || {};
  const vendeTodo = async (por) => { for (const m of Object.keys(RS.pos)) await cerrar(m, por); };
  async function cerrar(m, por, frac = 1) {
    const p = RS.pos[m], mk = await mercado(m), bid = tick[m] ? tick[m].bid : p.px;
    if (frac < 1 && p.q * (1 - frac) * bid < mk.min) frac = 1;   // si lo que quedaría es menos que el mínimo de Bitvavo, se vende todo
    const qv = frac >= 1 ? p.q : p.q * frac;
    if (qv * bid < mk.min) { if (frac < 1) { p.tp = 1; return; } L(RS, now, `${p.sym}: lo que queda es menos que el mínimo de Bitvavo (${mk.min} €); se queda como «polvo» en la cuenta`); RS.cash += qv * bid * (1 - FEE); delete RS.pos[m]; return; }
    let r; try { r = await vender(api, m, qv, mk.dec); } catch (e) { if (/216|insufficient|saldo/i.test(e.message) && frac >= 1) { L(RS, now, `⚠️ ${p.sym}: no queda saldo que vender; se da por cerrada`); delete RS.pos[m]; return; } throw e; }
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
    // 💰 cuánto dinero usar (lo eliges en la app): nunca más de lo que haya libre de verdad en tu cuenta de Bitvavo
    if (Math.abs(objetivo - RS.capital) >= 1) {
      let d = objetivo - RS.capital;
      if (d > 0) { const hay = await libre(); const max = Math.max(0, Math.floor((hay - RS.cash) * 100) / 100); if (max < d) { d = max; if (!RS.avisoSaldo || now - Date.parse(RS.avisoSaldo) > 6 * 3600e3) { RS.avisoSaldo = now.toISOString(); msgs.push(`💶 ⚠️ Pediste usar ${objetivo} € pero en tu cuenta de Bitvavo solo hay ${r2(hay)} € libres: usa ${r2(RS.capital + d)} €. Si ingresas más, lo cogerá solo.`); } } }
      else d = -Math.min(-d, RS.cash);
      if (Math.abs(d) >= 0.01) { RS.cash += d; RS.start += d; RS.capital += d; if (RS.dia) RS.dia.eq0 += d; L(RS, now, `💰 ${d > 0 ? "añade" : "retira"} ${r2(Math.abs(d))} €: ahora usa ${r2(RS.capital)} €`); if (Math.abs(objetivo - RS.capital) < 1) msgs.push(`💶 💰 REAL: ahora usa ${r2(RS.capital)} €${d < 0 ? " (lo que se quita, cuando esté libre)" : ""}.`); }
    }
    if (RS.copia !== copia) { await vendeTodo(`cambias de método: ahora copia a «${nombre(copia)}»`); L(RS, now, `🔁 ahora copia a «${copia}»`); msgs.push(`💶 🔁 REAL: ahora copia a «${nombre(copia)}» (lo abierto del método anterior se ha vendido)`); RS.copia = copia; RS.since = now.toISOString(); }
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
      const sp = src.pos[m]; if (tick[m]) p.last = tick[m].bid;
      if (!sp || sp.t0 !== p.srcT0) { await cerrar(m, "el método ficticio ha vendido"); continue; }
      if (sp.cob > 0 && !p.tp && sp.q0 > 0) { const frac = 1 - sp.q / sp.q0; if (frac > 0.05) await cerrar(m, "venta parcial con ganancia (como el método)", frac); }
      if (sp.pir && !p.pir && sp.cost0 > 0) { const add = Math.min(RS.cash, p.cost0 * (sp.cost - sp.cost0) / sp.cost0, maxOrden(), Math.max(0, (await libre()) - 0.5)), mk = await mercado(m); p.pir = 1; if (add >= mk.min) { const r = await comprar(api, m, add); RS.cash -= r.coste; RS.st.fees += r.fee; p.q += r.q; p.cost += r.coste; L(RS, now, `➕ añade ${r2(r.coste)} € a ${p.sym} (como el método)`); } }
    }
    // 4) compras nuevas del submodo (de menos de 5 min) en la misma proporción
    const eqSrc = +src.lastEq || 100;
    for (const [m, sp] of Object.entries(src.pos)) {
      const k = m + "|" + sp.t0; if (RS.pos[m] || RS.vistos[k]) continue; RS.vistos[k] = now.toISOString();
      if (Date.parse(sp.t0) < Date.parse(RS.since) || now - Date.parse(sp.t0) > 5 * 60000) continue;
      const tk = tick[m]; if (!tk || !(tk.ask > 0)) continue;
      if (tk.ask > sp.px * (1 + PERSIGUE)) { L(RS, now, `⏭️ no compra ${sp.sym}: ya ha subido más de un ${PERSIGUE * 100} % desde la señal`); continue; }
      const mk = await mercado(m), quiere = Math.min(RS.cash, maxOrden(), valor(RS, tick) * (sp.cost0 || sp.cost) / eqSrc, Math.max(0, (await libre()) - 0.5));
      if (quiere < Math.max(mk.min, 5) * 1.02) { L(RS, now, `⏭️ no compra ${sp.sym}: tocarían ${r2(quiere)} € y el mínimo de Bitvavo es ${mk.min} €`); continue; }
      const r = await comprar(api, m, quiere); RS.cash -= r.coste; RS.st.fees += r.fee; RS.st.trades++;
      RS.pos[m] = { sym: sp.sym, q: r.q, px: r.px, cost: r.coste, cost0: r.coste, t0: now.toISOString(), srcT0: sp.t0, last: tk.bid };
      L(RS, now, `🟢 compra ${sp.sym}: ${r2(r.coste)} € (a ${r.px})`); msgs.push(`💶 🟢 REAL: compra ${sp.sym} por ${r2(r.coste)} € (copiando a «${nombre(copia)}»)`);
    }
    for (const k of Object.keys(RS.vistos)) if (now - Date.parse(RS.vistos[k]) > 3 * 86400e3) delete RS.vistos[k];
    RS.estado = "activo"; delete RS.err;
  } catch (e) {
    RS.err = String(e.message).slice(0, 120); L(RS, now, "⚠️ " + RS.err);
    if (errClave(e)) { RS.estado = "clave"; if (!RS.avisoClave || now - Date.parse(RS.avisoClave) > 6 * 3600e3) { RS.avisoClave = now.toISOString(); msgs.push("💶 ⚠️ Bitvavo REAL: la clave no funciona (" + RS.err + "). Revisa que tenga permiso de OPERAR y que esté bien copiada en Ajustes."); } }
  }
  const e2 = valor(RS, tick); RS.eq.push([now.toISOString(), r2(e2)]); if (RS.eq.length > 3000) RS.eq = RS.eq.filter((_, i) => i % 2 === 0 || i > RS.eq.length - 500);
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
export const nombre = (k) => ({ mix: "🧠 IA + los mejores", eq: "⚖️ Equilibrado", turbo: "⚡ Turbo" })[k] || k;

// ---- todo junto, llamado desde bitvavo.mjs (lee/guarda control y estado cifrado; nunca escribe importes en los registros)
export async function paso(S, tick, now, io) {
  const key = env("BITVAVO_KEY"), secret = env("BITVAVO_SECRET"), pw = env("REAL_VIEW_PASS");
  if (!key || !secret) { S.real = { estado: "sin clave" }; return; }
  if (!pw) { S.real = { estado: "sin REAL_VIEW_PASS" }; console.log("Real: falta REAL_VIEW_PASS (no se guarda nada sin cifrar)"); return; }
  let ctl = await io.leer("ctl.json", "bitvavo-ctl"); if (!ctl) { ctl = { copia: "mix", parado: false, capital: CAPITAL, t: now.toISOString() }; io.publicar("ctl.json", ctl, "bitvavo-ctl"); }
  let RS = null; const j = await io.leer("real.json", "bitvavo-real");
  if (j) { const o = await openAny(j, [pw, env("REAL_VIEW_PASS_OLD")]); if (o.error) { console.log("Real: no puedo descifrar el estado; no opero"); S.real = { estado: "error" }; return; } RS = o.j; }
  const api = cliente(key, secret), cache = {};
  const mercado = async (m) => { if (cache[m]) return cache[m]; const [mk] = await api("GET", "/markets?market=" + m).then((x) => (Array.isArray(x) ? x : [x])); const sym = m.replace("-EUR", ""), [as] = await api("GET", "/assets?symbol=" + sym).then((x) => (Array.isArray(x) ? x : [x])); return (cache[m] = { min: +(mk && mk.minOrderInQuoteAsset) || 5, dec: as && as.decimals != null ? +as.decimals : 8 }); };
  const fuentes = { eq: S, turbo: S.sub && S.sub.turbo, mix: S.sub && S.sub.mix };
  const saldoEur = async () => { const b = await api("GET", "/balance?symbol=EUR"), x = (Array.isArray(b) ? b : [b]).find((y) => y && y.symbol === "EUR"); return x ? +x.available || 0 : 0; };
  const out = await vuelta(RS, fuentes, ctl, tick, now, { api, mercado, saldoEur });
  if (out.sinEmpezar) { if (out.ctlCambia) io.publicar("ctl.json", { ...out.ctl, t: now.toISOString() }, "bitvavo-ctl"); S.real = { estado: "sin saldo", t: now.toISOString() }; for (const m of out.msgs) await io.tg(m); console.log("Real: sin saldo suficiente"); return; }
  if (out.ctlCambia) io.publicar("ctl.json", { ...out.ctl, t: now.toISOString() }, "bitvavo-ctl");
  out.RS.savedAt = Date.now(); const enc = await encrypt(JSON.stringify(out.RS), pw);
  io.publicar("real.json", { enc: 1, v: 1, ...enc, meta: { estado: out.RS.estado || "activo", copia: out.RS.copia, t: now.toISOString() } }, "bitvavo-real");
  S.real = { estado: out.RS.estado, copia: out.RS.copia, t: now.toISOString() };
  for (const m of out.msgs.slice(0, 6)) await io.tg(m);
  console.log(`Real: ${out.RS.estado}${out.RS.err ? " (con avisos)" : ""}`);   // sin importes ni criptos: el registro es público
}
