// v198 · 🇪🇺 BITVAVO (SOLO DINERO FICTICIO): criptos contra euros en un exchange europeo regulado (MiCA, aprobado en España).
// Costes bajos (0,25 % por orden + la mitad del diferencial compra/venta), así que tiene sentido hacer muchas compras y ventas.
// Cada minuto: precios de todos los mercados en euros (1 petición) y velas de 5 min de los más líquidos; el terminal compra cuando
// sus reglas (el «genoma») ven una oportunidad y vende con stop, venta parcial, stop móvil y tiempo máximo.
// 🧠 APRENDE SOLO: cada 30 min descarga ~3,5 días de velas de 5 min de los 40 mercados más líquidos y prueba al momento cientos
// de reglas distintas con los costes reales; cada regla se puntúa con su PEOR mitad (días antiguos y recientes por separado).
// El terminal adopta la mejor solo si gana en las dos mitades; si ninguna gana, opera en «modo prueba» (compras a la mitad).
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { entrenarIA, predecir, vector } from "./bitvavo-ia.mjs";
import * as HLm from "./hyperliquid.mjs";

const API = "https://api.bitvavo.com/v2", REPO = process.env.GITHUB_REPOSITORY || "", TOKEN = process.env.GITHUB_TOKEN || "";
const RAMA = "bitvavo", RAMA_H = "bitvavo-hist";
export const FEE = 0.0025, START = 100, MIN_VOL = 2e5, MAX_MKT = 50, HIST_MKT = 40, GEN_MIN = 10, POP = 60, ESTS = ["tendencia", "rebote", "ruptura", "media", "tortuga", "williams", "connors", "rotacion", "capitulacion", "fade", "maximos", "ia", "copia"];   // v205 · aprende cada 10 min, con 7 días y 4 estilos
export const NO = /^(USDC|USDT|EURC|EURT|DAI|PYUSD|TUSD|FDUSD|USDE|EURI|XAUT|PAXG)-/;   // estables y oro: no se mueven
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cl = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- reglas (genoma). Estilos: «tendencia» (sube con fuerza y sin pasarse) o «rebote» (cayó mucho y empieza a girarse)
export const BASE = { estilo: "tendencia", m15Min: 0.002, m60Min: 0.006, m60Max: 0.05, m240Min: -0.01, ema: 1, hlMin: 0.5, volMin: 1.2, pullMax: 0.03,
  stop: 0.025, tp: 0.03, tpFrac: 0.5, trailOn: 0.015, trail: 0.012, maxHoldH: 6, size: 0.15, maxPos: 6, cooldownH: 1, k: 0.5, rsiMax: 10, rkMax: 0.1, pir: 0, pirOn: 0.04, iaMin: 0 };
// v206 · 🏛️ MÉTODOS DE GRANDES TRADERS (la bola los prueba, los mezcla y se queda con los que ganen aquí y ahora):
//  · «tortuga»: las Tortugas de Richard Dennis (años 80): comprar cuando el precio rompe el máximo de las últimas 20 velas (aquí, 20 h)
//  · «williams»: ruptura de volatilidad de Larry Williams (ganó la Robbins World Cup de 1987 pasando de 10.000 $ a más de 1,1 M$):
//    comprar cuando el precio supera la apertura del día + k × el rango del día anterior
//  · «connors»: RSI(2) de Larry Connors: comprar un sobreventa muy corto dentro de una tendencia de fondo (por encima de su media larga)
//  · «rotacion»: momentum entre criptos (estudiado en cripto por Liu y Tsyvinski, entre otros): comprar las más fuertes del momento
// v207 · versiones al contado (sin apalancamiento ni cortos) de métodos atribuidos a traders cripto conocidos:
//  · «capitulacion» (estilo Eugene Ng Ah Sio): tras una caída fuerte con volumen de pánico, comprar cuando deja de marcar mínimos nuevos
//  · «fade» (estilo SalsaTekila): una vela de 5 min que cae de golpe con volumen enorme → comprar el exceso y salir rápido
//  · «maximos» (estilo Andrew Kang / Unipcs): rompe el máximo de los últimos ~3,5 días con volumen y tendencia
//  · piramidar («pir»): si la posición ya gana «pirOn», se añade una parte más y el stop sube a «sin pérdidas»
export const RANG = { m15Min: [-0.01, 0.01], m60Min: [-0.02, 0.03], m60Max: [0.01, 0.12], m240Min: [-0.15, 0.03], hlMin: [0, 1], volMin: [0.5, 4], pullMax: [0.005, 0.1],
  stop: [0.008, 0.08], tp: [0.006, 0.12], tpFrac: [0, 0.8], trailOn: [0.004, 0.06], trail: [0.003, 0.05], maxHoldH: [0.5, 48], size: [0.05, 0.25], cooldownH: [0.25, 12], k: [0.15, 1.2], rsiMax: [2, 30], rkMax: [0.03, 0.35], pir: [0, 1], pirOn: [0.01, 0.1], iaMin: [0, 0.8] };
export function aleatorio(rnd = Math.random) { const g = { ...BASE, estilo: ESTS[Math.floor(rnd() * ESTS.length)], ema: rnd() < 0.7 ? 1 : 0 }; for (const [k, [a, b]] of Object.entries(RANG)) g[k] = r4(a + rnd() * (b - a)); return g; }
export function mutar(p, rnd = Math.random) {
  const g = { ...p }, ks = Object.keys(RANG), n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const k = ks[Math.floor(rnd() * ks.length)], [a, b] = RANG[k]; g[k] = r4(cl(g[k] + (rnd() - 0.5) * (b - a) * 0.3, a, b)); }
  if (rnd() < 0.1) g.estilo = ESTS[Math.floor(rnd() * ESTS.length)]; if (rnd() < 0.08) g.ema = g.ema ? 0 : 1; return g;
}
export function cruzar(a, b, rnd = Math.random) { const g = {}; for (const k of Object.keys(BASE)) g[k] = rnd() < 0.5 ? a[k] : b[k]; return g; }
export const gkey = (g) => JSON.stringify(Object.keys(BASE).map((k) => (typeof g[k] === "number" ? r4(g[k]) : g[k])));

// ---- rasgos de cada vela de 5 min (iguales en el backtest y en vivo). c = [[t, o, h, l, c, v], …] de antigua a reciente
export function rasgos(c) {
  const n = c.length, cs = c.map((x) => x[4]), out = new Array(n).fill(null); let e = cs[0], e200 = cs[0]; const k = 2 / 21, k2 = 2 / 201;
  // días (UTC): apertura de cada día y rango del día anterior (para Williams); RSI(2) de Wilder (para Connors)
  const dia = c.map((x) => Math.floor(x[0] / 86400e3)), D = {}; for (let i = 0; i < n; i++) { const d = D[dia[i]] || (D[dia[i]] = { o: c[i][1], h: c[i][2], l: c[i][3] }); d.h = Math.max(d.h, c[i][2]); d.l = Math.min(d.l, c[i][3]); }
  let ag = 0, al = 0; const dq = [];
  for (let i = 0; i < n; i++) {
    e = cs[i] * k + e * (1 - k); e200 = cs[i] * k2 + e200 * (1 - k2);
    if (i > 0) { const d = cs[i] - cs[i - 1]; ag = (ag + Math.max(0, d)) / 2; al = (al + Math.max(0, -d)) / 2; }
    if (i < 48) { while (dq.length && c[dq[dq.length - 1]][2] <= c[i][2]) dq.pop(); dq.push(i); continue; }
    const ch = (j) => cs[i] / cs[i - j] - 1, w = cs.slice(i - 11, i + 1), m1 = Math.min(...w.slice(0, 4)), m2 = Math.min(...w.slice(4, 8)), m3 = Math.min(...w.slice(8));
    let va = 0; for (let j = i - 47; j <= i - 4; j++) va += c[j][5]; va /= 44; const vr = (c[i][5] + c[i - 1][5] + c[i - 2][5]) / 3 / Math.max(1e-9, va);
    const mx = Math.max(...cs.slice(i - 23, i + 1)), mxPrev = Math.max(...cs.slice(Math.max(0, i - 287), i - 2));
    let hiD = 0; if (i >= 241) for (let j = i - 240; j < i; j++) hiD = Math.max(hiD, c[j][2]);
    const hoy = D[dia[i]], ayer = D[dia[i] - 1], rng = ayer ? ayer.h - ayer.l : 0;
    let lr = Infinity, lp = Infinity; for (let j = i - 2; j <= i; j++) lr = Math.min(lr, c[j][3]); for (let j = i - 11; j <= i - 3; j++) lp = Math.min(lp, c[j][3]);
    while (dq.length && dq[0] < i - 1000) dq.shift();   // máximo de las ~1.000 velas anteriores (ventana móvil)
    const maxW = dq.length ? c[dq[0]][2] : 0;
    out[i] = { m15: ch(3), m60: ch(12), m240: ch(48), sobre: cs[i] > e ? 1 : 0, hl: (m2 > m1 ? 0.5 : 0) + (m3 > m2 ? 0.5 : 0), vol: vr, pull: 1 - cs[i] / mx, rompe: cs[i] / mxPrev - 1,
      t: c[i][0], don: hiD > 0 ? cs[i] / hiD - 1 : null, vb: rng > 0 && hoy ? (cs[i] - hoy.o) / rng : null, rsi2: al + ag > 0 ? Math.min(100, Math.max(0, 100 * ag / (ag + al))) : 50, sobre200: i >= 200 && cs[i] > e200 ? 1 : 0, rk: null,
      c1: cs[i] / cs[i - 1] - 1, v1: c[i][5] / Math.max(1e-9, va), vmax: Math.max(...c.slice(i - 11, i + 1).map((x) => x[5])) / Math.max(1e-9, va), estab: lr > lp ? 1 : 0, maxW: maxW > 0 && i >= 300 ? cs[i] / maxW - 1 : null };
    while (dq.length && c[dq[dq.length - 1]][2] <= c[i][2]) dq.pop(); dq.push(i);
  }
  return out;
}
export function entra(g, f) {
  if (!f) return false;
  // v219 · 🧠 la IA como filtro de cualquier estilo (si la regla lo pide) y como estilo propio («ia»: compra lo que la IA ve más probable)
  if (g.iaMin > 0 && !(f.ia >= g.iaMin)) return false;
  // v220 · «copia»: comprar lo que los mejores traders de Hyperliquid tienen claramente en largo (y no están soltando)
  if (g.estilo === "copia") return f.smart != null && f.smart >= 0.2 + g.k * 0.5 && (f.smartD == null || f.smartD >= 0) && f.m60 > -0.02;
  if (g.estilo === "ia") return f.ia != null && f.ia >= Math.max(0.25, g.iaMin) && f.m15 > -0.01;
  // ruptura: supera el máximo de las últimas ~24 h con volumen; media: en tendencia de fondo, compra una bajada corta
  if (g.estilo === "ruptura") return f.rompe > 0 && f.rompe <= Math.max(0.004, g.pullMax) && f.vol >= g.volMin && f.m60 >= g.m60Min && f.m60 <= g.m60Max;
  if (g.estilo === "media") return f.m240 >= Math.max(0, g.m240Min) && f.m15 <= -Math.abs(g.m15Min) - 0.003 && f.pull >= 0.008 && f.pull <= g.pullMax + 0.02 && (!g.ema || !f.sobre);
  if (g.estilo === "tortuga") return f.don != null && f.don > 0 && f.don <= Math.max(0.004, g.pullMax) && f.vol >= Math.min(g.volMin, 1.5);
  if (g.estilo === "williams") return f.vb != null && f.vb >= g.k && f.vb <= g.k + 0.25 && f.m15 > 0;
  if (g.estilo === "connors") return f.sobre200 === 1 && f.rsi2 <= g.rsiMax;
  if (g.estilo === "rotacion") return f.rk != null && f.rk <= g.rkMax && f.m240 > 0 && f.m60 > 0;
  if (g.estilo === "capitulacion") return f.m60 <= -(0.03 + g.k * 0.05) && f.vmax >= g.volMin * 1.5 && f.estab === 1 && f.m15 >= 0;
  if (g.estilo === "fade") return f.c1 <= -(0.015 + g.k * 0.03) && f.v1 >= 2.5;
  if (g.estilo === "maximos") return f.maxW != null && f.maxW > 0 && f.maxW <= Math.max(0.004, g.pullMax) && f.vol >= g.volMin * 1.3 && f.m240 > 0;
  if (g.estilo === "rebote") return f.m240 <= -Math.abs(g.m240Min) - 0.03 && f.m15 >= Math.max(0.001, g.m15Min) && f.vol >= g.volMin && f.pull >= 0.02;
  return f.m15 >= g.m15Min && f.m60 >= g.m60Min && f.m60 <= g.m60Max && f.m240 >= g.m240Min && (!g.ema || f.sobre) && f.hl >= g.hlMin && f.vol >= g.volMin && f.pull <= g.pullMax;
}
// posición de cada cripto frente a las demás en cada momento (0 = la más fuerte en 4 h, 1 = la más floja): para «rotacion»
export function rankear(F) {   // F: { mercado: rasgos[] } con los mismos tiempos (velas de 5 min) → rellena f.rk
  const porT = new Map(); for (const [m, arr] of Object.entries(F)) arr.forEach((f, i) => { if (f && f.t != null) { let a = porT.get(f.t); if (!a) porT.set(f.t, (a = [])); a.push(f); } });
  for (const a of porT.values()) { if (a.length < 5) continue; a.sort((x, y) => y.m240 - x.m240); a.forEach((f, i) => { f.rk = i / (a.length - 1); }); }
}
// ---- backtest de un genoma sobre las velas de varios mercados (con comisión y diferencial)
export function backtest(g, H, desde = 0, hasta = Infinity) {
  const rs = [];
  for (const m of Object.values(H.m || {})) {
    const c = m.c, F = m.f, sp = m.sp || 0.001; let pos = null, cool = 0;
    for (let i = 48; i < c.length; i++) {
      const t = c[i][0]; if (t < desde || t >= hasta) { if (pos && t >= hasta) { rs.push((pos.cob + pos.q * c[i][4] * (1 - sp / 2) * (1 - FEE)) / pos.cost - 1); pos = null; } continue; }
      if (pos) {
        const [, , h, l, cc] = c[i]; pos.peak = Math.max(pos.peak, h); const ven = (px) => pos.q * px * (1 - sp / 2) * (1 - FEE);
        if (g.pir > 0 && !pos.pir && h >= pos.px * (1 + g.pirOn)) { const ap = pos.px * (1 + g.pirOn) * (1 + sp / 2); pos.q += g.pir * (1 - FEE) / ap; pos.cost += g.pir; pos.pir = 1; pos.be = (pos.cost - pos.cob) / (pos.q * (1 - sp / 2) * (1 - FEE)); }
        if (g.tpFrac > 0 && !pos.tp && h >= pos.px * (1 + g.tp)) { pos.cob += pos.q * g.tpFrac * pos.px * (1 + g.tp) * (1 - sp / 2) * (1 - FEE); pos.q *= 1 - g.tpFrac; pos.tp = 1; }
        let out = null; const sl = Math.max(pos.px * (1 - g.stop), pos.be || 0);
        if (l <= sl) out = Math.min(c[i][1], sl);
        else if (pos.peak >= pos.px * (1 + g.trailOn) && l <= pos.peak * (1 - g.trail)) out = Math.min(c[i][1], pos.peak * (1 - g.trail));
        else if ((t - pos.t) / 3600e3 >= g.maxHoldH) out = cc;
        if (out != null) { rs.push((pos.cob + ven(out)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; }
        continue;
      }
      if (t >= cool && entra(g, F[i]) && i + 1 < c.length) { const px = c[i + 1][1] * (1 + sp / 2); pos = { px, q: (1 - FEE) / px, cob: 0, cost: 1, peak: px, t: c[i + 1][0] }; i++; }
    }
  }
  const n = rs.length; if (!n) return { n: 0 };
  const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(Math.max(1e-12, rs.reduce((a, b) => a + (b - m) ** 2, 0) / n));
  let gw = 0, gl = 0, w = 0; for (const x of rs) { if (x > 0) { gw += x; w++; } else gl -= x; }
  return { n, win: r2(w / n * 100), med: r4(m * 100), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, t: r2(m / (sd / Math.sqrt(n))) };
}
export function robusta(g, H) {
  const ts = Object.values(H.m || {}).flatMap((m) => m.c.slice(48).map((x) => x[0])).sort((a, b) => a - b); if (!ts.length) return { s: -99 };
  const corte = ts[Math.floor(ts.length / 2)], a = backtest(g, H, 0, corte), b = backtest(g, H, corte);
  if (!(a.n >= 10 && b.n >= 10)) return { s: -99, a, b };
  return { s: r2(Math.min(a.t, b.t) + Math.min(a.med, b.med) * 2), a, b, ok: a.med > 0 && b.med > 0 && a.pf > 1.15 && b.pf > 1.15 };
}

// ---- estado
export function fresh(now = new Date()) {
  return { v: 1, start: START, cash: START, pos: {}, closed: [], log: [], eq: [], cool: {}, st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0 }, since: now.toISOString(),
    genome: { ...BASE }, genomeId: "base", prueba: true, lab: { gen: 0, lastGen: null, pop: [], log: [], adopt: [] } };
}
const L = (S, now, ev, sym, txt) => { S.log.unshift({ t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 200); };
const equity = (S, px) => S.cash + Object.entries(S.pos).reduce((t, [m, p]) => t + p.q * ((px[m] && px[m].bid) || p.last || p.px), 0);
function cerrar(S, m, now, bid, why) {
  const p = S.pos[m], got = p.q * bid * (1 - FEE), gotT = got + (p.cob || 0), pnl = gotT - p.cost;
  S.cash += got; S.st.pnl += pnl; S.st.fees += p.q * bid * FEE; if (pnl >= 0) S.st.wins++; else S.st.losses++;
  S.closed.unshift({ m, sym: m.replace("-EUR", ""), t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(gotT), pnl: r2(pnl), pc: r2((gotT / p.cost - 1) * 100), why: p.cob ? why + " (tras vender parte con ganancia)" : why, h: (p.h || []).slice(-120), px0: p.px, peak: p.peak, out: bid });
  S.closed = S.closed.slice(0, 500); S.cool[m] = now.getTime(); delete S.pos[m];
  L(S, now, pnl >= 0 ? "WIN" : "LOSS", m.replace("-EUR", ""), `${pnl >= 0 ? "+" : ""}${r2(pnl)} € · ${r2((gotT / p.cost - 1) * 100)} % · ${why}`);
}
// una vuelta: vigila lo abierto y compra lo que diga el genoma
export function paso(S, tick, F, now = new Date()) {
  const g = { ...BASE, ...S.genome }, tnow = now.getTime(), px = tick;
  for (const [m, p] of Object.entries(S.pos)) {
    const t = tick[m]; if (!t || !(t.bid > 0)) continue; const bid = t.bid;
    p.last = bid; p.peak = Math.max(p.peak, bid); p.h = (p.h || []).concat([[now.toISOString(), bid]]).slice(-200);
    if (g.tpFrac > 0 && !p.tp && bid >= p.px * (1 + g.tp)) { const qv = p.q * g.tpFrac, got = qv * bid * (1 - FEE); S.cash += got; p.cob = (p.cob || 0) + got; p.q -= qv; p.tp = 1; S.st.fees += qv * bid * FEE; L(S, now, "TP", m.replace("-EUR", ""), `+${r2(g.tp * 100)} %: vende el ${Math.round(g.tpFrac * 100)} %`); }
    if (g.pir > 0 && !p.pir && bid >= p.px * (1 + g.pirOn) && tick[m].ask > 0) { const add = Math.min(S.cash, (p.cost0 || p.cost) * g.pir); if (add >= 2) { const q2 = add * (1 - FEE) / tick[m].ask; S.cash -= add; S.st.fees += add * FEE; p.q += q2; p.cost += add; p.pir = 1; p.be = (p.cost - (p.cob || 0)) / (p.q * (1 - FEE)); L(S, now, "ENTER", m.replace("-EUR", ""), `piramida: +${r2(add)} € (ya gana ${r2(g.pirOn * 100)} %) · stop a «sin pérdidas»`); } }
    if (bid <= Math.max(p.px * (1 - g.stop), p.be || 0)) cerrar(S, m, now, bid, p.be && bid > p.px * (1 - g.stop) ? "stop sin pérdidas (tras piramidar)" : `stop −${r2(g.stop * 100)} %`);
    else if (p.peak >= p.px * (1 + g.trailOn) && bid <= p.peak * (1 - g.trail)) cerrar(S, m, now, bid, `stop móvil (${r2(g.trail * 100)} % bajo el máximo)`);
    else if ((tnow - Date.parse(p.t0)) / 3600e3 >= g.maxHoldH) cerrar(S, m, now, bid, `tiempo máximo (${g.maxHoldH} h)`);
  }
  if (!F) return;
  const cand = Object.entries(F).filter(([m, f]) => !S.pos[m] && !(S.cool[m] && tnow - S.cool[m] < g.cooldownH * 3600e3) && entra(g, f) && tick[m] && tick[m].ask > 0)
    .sort((a, b) => b[1].m60 - a[1].m60);
  for (const [m, f] of cand) {
    if (Object.keys(S.pos).length >= g.maxPos) break;
    const eq = equity(S, tick), amt = Math.min(S.cash, eq * g.size * (S.prueba ? 0.5 : 1)); if (amt < 2) break;
    const ask = tick[m].ask, q = amt * (1 - FEE) / ask; S.cash -= amt; S.st.trades++; S.st.fees += amt * FEE;
    S.pos[m] = { sym: m.replace("-EUR", ""), q, px: ask, cost: amt, cost0: amt, t0: now.toISOString(), peak: ask, last: ask, h: [[now.toISOString(), ask]], f: { m15: r4(f.m15), m60: r4(f.m60), m240: r4(f.m240), vol: r2(f.vol) } };
    L(S, now, "ENTER", m.replace("-EUR", ""), `${r2(amt)} € · sube ${r2(f.m60 * 100)} % en 1 h · volumen ×${r2(f.vol)}${S.prueba ? " · modo prueba (mitad)" : ""}`);
  }
}
// ---- laboratorio: búsqueda dirigida con backtest robusto
export function evolucionar(S, H, now = new Date(), rnd = Math.random, budgetMs = 20e3) {
  const B = S.lab; B.gen++; B.lastGen = now.toISOString(); const t0 = Date.now(), ev = (txt) => { B.log.unshift({ t: now.toISOString(), txt }); B.log = B.log.slice(0, 120); };
  for (const v of B.pop) Object.assign(v, robustaV(v.g, H));
  if (!B.pop.some((v) => v.id === "base")) B.pop.push({ id: "base", g: { ...BASE }, born: now.toISOString(), why: "reglas de partida", ...robustaV(BASE, H) });
  const top = B.pop.slice().sort((a, b) => b.s - a.s).slice(0, 8), seen = new Set(B.pop.map((v) => gkey(v.g))), cand = [];
  for (let i = 0; i < 2000 && Date.now() - t0 < budgetMs; i++) {
    const r = rnd(); let g, why;
    if (r < 0.5 && top.length) { const p = top[Math.floor(rnd() * top.length)]; g = mutar(p.g, rnd); why = "mutación de " + p.id; }
    else if (r < 0.7 && top.length > 1) { const a = top[Math.floor(rnd() * top.length)], b = top[Math.floor(rnd() * top.length)]; if (a === b) continue; g = cruzar(a.g, b.g, rnd); why = `cruce de ${a.id} y ${b.id}`; }
    else { g = aleatorio(rnd); why = "inventada"; }
    const k = gkey(g); if (seen.has(k)) continue; seen.add(k); cand.push({ g, why, ...robustaV(g, H) });
  }
  const todos = B.pop.concat(cand.map((c) => ({ id: "b" + (B.next = (B.next || 0) + 1), g: c.g, born: now.toISOString(), why: c.why, s: c.s, ok: c.ok, a: c.a, b: c.b })))
    .sort((a, b) => b.s - a.s);
  const keep = todos.filter((v) => v.id === "base" || v.id === S.genomeId).concat(todos.filter((v) => v.id !== "base" && v.id !== S.genomeId)).slice(0, POP);
  const nuevos = keep.filter((v) => !B.pop.includes(v)).length; B.pop = keep; B.probadas = cand.length;
  ev(`🔬 generación ${B.gen}: ${cand.length} reglas probadas en ${Object.keys(H.m || {}).length} mercados · entran ${nuevos} nuevas`);
  // adopción: la mejor que gane en las DOS mitades; si ninguna, la mejor en «modo prueba»
  const best = B.pop.slice().sort((a, b) => b.s - a.s)[0], ganadora = B.pop.filter((v) => v.ok).sort((a, b) => b.s - a.s)[0];
  const elegida = ganadora || best;
  if (elegida && (elegida.id !== S.genomeId || S.prueba !== !ganadora)) {
    S.genome = { ...elegida.g }; S.genomeId = elegida.id; S.prueba = !ganadora;
    B.adopt.unshift({ t: now.toISOString(), id: elegida.id, s: elegida.s, ok: !!ganadora }); B.adopt = B.adopt.slice(0, 50);
    ev(ganadora ? `🏆 adopta ${elegida.id}: gana en los días antiguos (${elegida.a.med} % de media, ${elegida.a.n} ops) y en los recientes (${elegida.b.med} %, ${elegida.b.n} ops)` : `🧪 ninguna regla gana aún en las dos mitades: usa la mejor (${elegida.id}) en modo prueba, con compras a la mitad`);
  }
  return { gen: B.gen, probadas: cand.length };
}
function robustaV(g, H) { const r = robusta(g, H); return { s: r.s, ok: !!r.ok, a: r.a || null, b: r.b || null }; }

// ---- red
async function J(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "bot-trading" }, signal: AbortSignal.timeout(15000) }); if (r.status === 429) { await sleep(2000 * (i + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { if (i === tries - 1) throw e; await sleep(1000 * (i + 1)); }
  }
  return null;
}
async function enParalelo(xs, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const x = xs[i++]; await fn(x); } })); }
const velas = (j) => (Array.isArray(j) ? j.map((x) => [+x[0], +x[1], +x[2], +x[3], +x[4], +x[5]]).filter((x) => x[4] > 0).sort((a, b) => a[0] - b[0]) : []);
async function leer(f, rama) {
  if (!REPO || !TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=${rama}`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null; if (!r.ok) throw new Error("no pude leer " + f + " (HTTP " + r.status + ")"); return await r.json();
}
function publicar(f, obj, rama) {
  const out = JSON.stringify(obj); if (!REPO || !TOKEN) { writeFileSync(f, out); return; }
  const pub = path.join(process.cwd(), ".pub-" + rama); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, f), out);
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g("init -q -b x"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add -A"); g(`commit -q -m "${rama} ${new Date().toISOString()}"`);
  for (let i = 0; i < 3; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${rama}`); return; } catch (e) { if (i === 2) console.log("Bitvavo: no pude guardar " + f); } }
}

async function main() {
  const now = new Date(), t0 = Date.now();
  let S = null; try { S = await leer("bitvavo.json", RAMA); } catch (e) { console.log("Bitvavo: " + e.message); return; }
  if (!S || S.v !== 1) { S = fresh(now); L(S, now, "INFO", "", "🇪🇺 empieza Bitvavo con 100 € ficticios: criptos contra euros, costes del 0,25 %"); }
  // 1) precios de todo (una petición)
  const T = await J(`${API}/ticker/24h`); if (!Array.isArray(T)) { console.log("Bitvavo: sin precios"); return; }
  const tick = {}, uni = [];
  for (const x of T) { if (!/-EUR$/.test(x.market) || NO.test(x.market)) continue; const bid = +x.bid, ask = +x.ask, vq = +x.volumeQuote || 0; if (!(bid > 0 && ask > 0)) continue; tick[x.market] = { bid, ask, last: +x.last, vq, ch24: +x.open > 0 ? +x.last / +x.open - 1 : 0, sp: (ask - bid) / ((ask + bid) / 2) }; if (vq >= MIN_VOL && tick[x.market].sp < 0.01) uni.push(x.market); }
  uni.sort((a, b) => tick[b].vq - tick[a].vq); const U = uni.slice(0, MAX_MKT);
  // 2) velas de 5 min de los mercados líquidos (y de lo abierto) → rasgos
  const F = {}, quiero = [...new Set([...U, ...Object.keys(S.pos)])];
  await enParalelo(quiero, 8, async (m) => { try { const c = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 2)); const f = rasgos(c); F[m] = f[f.length - 1]; } catch (e) { S.err = String(e.message).slice(0, 60); } });
  { const vs = Object.values(F).filter(Boolean).sort((x, y) => y.m240 - x.m240); vs.forEach((f, i) => { f.rk = vs.length > 4 ? i / (vs.length - 1) : null; }); }
  // 👑 lo que hacen ahora los mejores traders de Hyperliquid
  try { S.hl = await HLm.actualizar(S.hl, now); } catch (e) {}
  { const sn = (S.hl && S.hl.snap) || {}, pv = (S.hl && S.hl.prev) || {}; for (const [m, f] of Object.entries(F)) if (f) { const c = m.replace("-EUR", ""); f.smart = sn[c] ? sn[c].s : null; f.smartD = sn[c] && pv[c] ? sn[c].s - pv[c].s : null; } }
  if (S.iaM) for (const f of Object.values(F)) if (f) f.ia = predecir(S.iaM, vector(f));
  paso(S, tick, F, now);
  // 3) laboratorio cada 30 min
  let H = null;
  if (!S.lab.lastGen || now - Date.parse(S.lab.lastGen) >= GEN_MIN * 60000) {
    H = { m: {} }; const hm = U.slice(0, HIST_MKT);
    // 7 días: dos tandas de 1.000 velas de 5 min por mercado
    await enParalelo(hm, 6, async (m) => { try { const c1 = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 2)); const c0 = c1.length ? velas(await J(`${API}/${m}/candles?interval=5m&limit=1000&end=${c1[0][0] - 1}`, 2)) : []; const c = c0.concat(c1); if (c.length > 300) H.m[m] = { c, f: rasgos(c), sp: tick[m].sp }; } catch (e) {} });
    rankear(Object.fromEntries(Object.entries(H.m).map(([m, x]) => [m, x.f])));
    // historial de la señal de los mejores (cada 10 min, 7 días) → rasgo de cada vela para la IA y las reglas
    try { let hh = null; try { hh = await leer("hl-hist.json", RAMA_H); } catch (e) {} hh = HLm.anotar(hh, S.hl && S.hl.snap, now.getTime()); publicar("hl-hist.json", hh, RAMA_H); S.hlHist = Object.keys(hh).length;
      for (const [m, x] of Object.entries(H.m)) { const se = hh[m.replace("-EUR", "")]; for (const f of x.f) if (f) { f.smart = HLm.enMomento(se, f.t); const s1 = HLm.enMomento(se, f.t - 3600e3); f.smartD = f.smart != null && s1 != null ? f.smart - s1 : null; } } } catch (e) { console.log("Bitvavo: historial de los mejores: " + e.message); }
    try { const ti = Date.now(), IA = entrenarIA(H); S.iaM = IA.listo ? IA.modelo : null; delete IA.modelo; S.ia = { ...IA, seg: Math.round((Date.now() - ti) / 1000) }; if (IA.listo) L(S, now, "INFO", "", `🧠 IA reentrenada con ${IA.n} momentos: con días que no ha visto ordena bien subidas y caídas ${Math.round(IA.auc * 100)} de cada 100`); } catch (e) { S.ia = { listo: false, err: String(e.message).slice(0, 60) }; }
    if (Object.keys(H.m).length >= 10) { const evo = evolucionar(S, H, now, Math.random, Math.max(5e3, 45e3 - (Date.now() - t0))); L(S, now, "INFO", "", `🔬 generación ${evo.gen}: ${evo.probadas} reglas probadas en ${Object.keys(H.m).length} mercados`); }
  }
  const eq = equity(S, tick); S.eq.push([now.toISOString(), r2(eq)]); if (S.eq.length > 3000) S.eq = S.eq.filter((_, i) => i % 2 === 0 || i > S.eq.length - 500);
  S.lastEq = r2(eq); S.last = now.toISOString(); S.diag = { mercados: Object.keys(tick).length, liquidos: U.length, velas: Object.keys(F).length, t: now.toISOString(), seg: Math.round((Date.now() - t0) / 1000) };
  S.top = U.slice(0, 12).map((m) => ({ m, sym: m.replace("-EUR", ""), px: tick[m].last, ch24: r2(tick[m].ch24 * 100), f: F[m] ? { m60: r2(F[m].m60 * 100), vol: r2(F[m].vol), ok: entra({ ...BASE, ...S.genome }, F[m]) } : null }));
  for (const v of S.lab.pop) { delete v.c; }
  // 🔔 avisos por Telegram cuando algo es MUY efectivo
  try {
    const AV = await import("./avisos.mjs"); S.av = S.av || {}; const msgs = AV.avisosCuenta(S.av, "bv", "🇪🇺 Bitvavo", S, now, { med: 1, big: 5 });
    const ad = (S.lab.adopt || [])[0]; if (ad && ad.ok && now - Date.parse(ad.t) < 3 * 60000) { const m = AV.avisoReglas(S.av, "bv-adopta:" + ad.id, `🏆 Bitvavo ha encontrado reglas que GANAN tanto en los días antiguos como en los recientes (${ad.id}). Deja el modo prueba y opera con ellas (dinero ficticio).`, now); if (m) msgs.push(m); }
    for (const m of msgs.slice(0, 4)) await AV.tg(m);
  } catch (e) { console.log("Bitvavo: avisos no enviados"); }
  publicar("bitvavo.json", S, RAMA);
  console.log(`Bitvavo: ${U.length} mercados · saldo ${S.lastEq} € · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades} · gen ${S.lab.gen} · ${S.diag.seg} s`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Bitvavo: " + (e.message || e)); process.exit(0); });
