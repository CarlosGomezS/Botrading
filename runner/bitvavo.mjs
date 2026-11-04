// v198 · 🇪🇺 BITVAVO (SOLO DINERO FICTICIO): criptos contra euros en un exchange europeo regulado (MiCA, aprobado en España).
// Costes bajos (0,25 % por orden + la mitad del diferencial compra/venta), así que tiene sentido hacer muchas compras y ventas.
// Cada minuto: precios de todos los mercados en euros (1 petición) y velas de 5 min de los más líquidos; el terminal compra cuando
// sus reglas (el «genoma») ven una oportunidad y vende con stop, venta parcial, stop móvil y tiempo máximo.
// 🧠 APRENDE SOLO: cada 30 min descarga ~3,5 días de velas de 5 min de los 40 mercados más líquidos y prueba al momento cientos
// de reglas distintas con los costes reales; cada regla se puntúa con su PEOR mitad (días antiguos y recientes por separado).
// El terminal adopta la mejor solo si gana en las dos mitades; si ninguna gana, opera en «modo prueba» (compras a la mitad).
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { entrenarIA, predecir, vector } from "./bitvavo-ia.mjs";
import { encrypt, openAny } from "./real-cfg.mjs";
import * as HLm from "./hyperliquid.mjs";
import * as FIN from "./financiacion.mjs";
import * as REJ from "./rejilla.mjs";

const API = "https://api.bitvavo.com/v2", REPO = process.env.GITHUB_REPOSITORY || "", TOKEN = process.env.GITHUB_TOKEN || "";
const RAMA = "bitvavo", RAMA_H = "bitvavo-hist";
export const FEE = 0.0025, START = 100, MIN_VOL = 2e5, MAX_MKT = 50, HIST_MKT = 40, GEN_MIN = 15, POP = 60, ESTS = ["tendencia", "rebote", "ruptura", "media", "tortuga", "williams", "connors", "rotacion", "capitulacion", "fade", "maximos", "ia", "copia"];   // v205 · aprende cada 10 min, con 7 días y 4 estilos
export const NO = /^(USDC|USDT|EURC|EURT|DAI|PYUSD|TUSD|FDUSD|USDE|EURI|XAUT|PAXG)-/;   // estables y oro: no se mueven
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cl = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- reglas (genoma). Estilos: «tendencia» (sube con fuerza y sin pasarse) o «rebote» (cayó mucho y empieza a girarse)
export const BASE = { estilo: "tendencia", m15Min: 0.002, m60Min: 0.006, m60Max: 0.05, m240Min: -0.01, ema: 1, hlMin: 0.5, volMin: 1.2, pullMax: 0.03,
  stop: 0.025, tp: 0.03, tpFrac: 0.5, trailOn: 0.015, trail: 0.012, maxHoldH: 6, size: 0.15, maxPos: 6, cooldownH: 1, k: 0.5, rsiMax: 10, rkMax: 0.1, pir: 0, pirOn: 0.04, iaMin: 0, regimen: 0 };
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
// v225 · 🎛️ SUBMODOS: cada uno con sus 100 €, su propio laboratorio y sus propios límites (lo que la bola puede tocar)
const rangos = (P) => ({ ...RANG, ...((P && P.rang) || {}) });
export function ajustar(g, P) {
  if (!P) return g; const R0 = rangos(P), ests = P.ests || ESTS; for (const [k, [a, b]] of Object.entries(R0)) if (typeof g[k] === "number") g[k] = r4(cl(g[k], a, b));
  if (!ests.includes(g.estilo)) g.estilo = ests[0]; return Object.assign(g, P.fijo || {});
}
export function aleatorio(rnd = Math.random, P = null) { const ests = (P && P.ests) || ESTS, R0 = rangos(P), g = { ...BASE, estilo: ests[Math.floor(rnd() * ests.length)], ema: rnd() < 0.7 ? 1 : 0, regimen: rnd() < 0.5 ? 1 : 0 }; for (const [k, [a, b]] of Object.entries(R0)) g[k] = r4(a + rnd() * (b - a)); return ajustar(g, P); }
export function mutar(p, rnd = Math.random, P = null) {
  const g = { ...p }, R0 = rangos(P), ks = Object.keys(R0), n = 1 + Math.floor(rnd() * 3), ests = (P && P.ests) || ESTS;
  for (let i = 0; i < n; i++) { const k = ks[Math.floor(rnd() * ks.length)], [a, b] = R0[k]; g[k] = r4(cl((g[k] ?? a) + (rnd() - 0.5) * (b - a) * 0.3, a, b)); }
  if (rnd() < 0.1) g.estilo = ests[Math.floor(rnd() * ests.length)]; if (rnd() < 0.08) g.ema = g.ema ? 0 : 1; if (rnd() < 0.15) g.regimen = g.regimen ? 0 : 1; return ajustar(g, P);
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
  // v223 · 🌡️ «regimen»: solo compra cuando el mercado acompaña (el bitcoin sube en 4 h y está sobre su media larga). La bola decide si exigirlo.
  if (g.regimen && f.reg === 0) return false;
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
        const [, , h, l, cc] = c[i]; const ven = (px) => pos.q * px * (1 - sp / 2) * (1 - FEE);
        // v228 · PESIMISTA: si en la misma vela se tocan el stop y la venta con ganancia, se supone que el stop llegó primero
        let out = null; const sl = Math.max(pos.px * (1 - g.stop), pos.be || 0);
        if (l <= sl) { out = Math.min(c[i][1], sl); rs.push((pos.cob + ven(out)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; continue; }
        pos.peak = Math.max(pos.peak, h);
        if (g.pir > 0 && !pos.pir && h >= pos.px * (1 + g.pirOn)) { const ap = pos.px * (1 + g.pirOn) * (1 + sp / 2); pos.q += g.pir * (1 - FEE) / ap; pos.cost += g.pir; pos.pir = 1; pos.be = (pos.cost - pos.cob) / (pos.q * (1 - sp / 2) * (1 - FEE)); }
        if (g.tpFrac > 0 && !pos.tp && h >= pos.px * (1 + g.tp)) { pos.cob += pos.q * g.tpFrac * pos.px * (1 + g.tp) * (1 - sp / 2) * (1 - FEE); pos.q *= 1 - g.tpFrac; pos.tp = 1; }
        if (pos.peak >= pos.px * (1 + g.trailOn) && l <= pos.peak * (1 - g.trail)) out = Math.min(c[i][1], pos.peak * (1 - g.trail));
        else if ((t - pos.t) / 3600e3 >= g.maxHoldH) out = cc;
        if (out != null) { rs.push((pos.cob + ven(out)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; }
        continue;
      }
      if (t >= cool && entra(g, F[i]) && i + 1 < c.length && c[i + 1][0] < hasta) { const px = c[i + 1][1] * (1 + sp / 2); pos = { px, q: (1 - FEE) / px, cob: 0, cost: 1, peak: px, t: c[i + 1][0] }; }   // v228 · la vela de entrada también se revisa (antes se saltaba)
    }
  }
  const n = rs.length; if (!n) return { n: 0 };
  const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(Math.max(1e-12, rs.reduce((a, b) => a + (b - m) ** 2, 0) / n));
  let gw = 0, gl = 0, w = 0; for (const x of rs) { if (x > 0) { gw += x; w++; } else gl -= x; }
  return { n, win: r2(w / n * 100), med: r4(m * 100), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, t: r2(m / (sd / Math.sqrt(n))) };
}
function corteH(H) { if (H._corte) return H._corte; const ts = Object.values(H.m || {}).flatMap((m) => m.c.slice(48).map((x) => x[0])).sort((a, b) => a - b); return (H._corte = ts.length ? ts[Math.floor(ts.length / 2)] : null); }
// ⚡ turbo: se puntúa por lo que gana EN TOTAL cada mitad (muchas operaciones pequeñas ganadoras valen más que pocas grandes)
export function robustaTurbo(g, H) {
  const corte = corteH(H); if (corte == null) return { s: -99 }; const a = backtest(g, H, 0, corte), b = backtest(g, H, corte);
  if (!(a.n >= 15 && b.n >= 15)) return { s: -99, a, b };
  const conf = Math.min(1, Math.sqrt(Math.min(a.n, b.n) / 40));
  return { s: r2((Math.min(a.med * a.n, b.med * b.n) / 20 + Math.min(a.t, b.t)) * conf), a, b, ok: a.n >= 20 && b.n >= 20 && a.med > 0 && b.med > 0 && a.pf > 1.1 && b.pf > 1.1 };
}
export function robusta(g, H) {
  const corte = corteH(H); if (corte == null) return { s: -99 }; const a = backtest(g, H, 0, corte), b = backtest(g, H, corte);
  // v222 · contra la sobreoptimización: con pocas operaciones cualquier regla «gana» por casualidad. Se exigen ≥ 20 por mitad,
  // la nota se rebaja si hay pocas (hasta 60 por mitad para nota completa) y «ganadora» exige ≥ 25 por mitad
  if (!(a.n >= 20 && b.n >= 20)) return { s: -99, a, b };
  const conf = Math.min(1, Math.sqrt(Math.min(a.n, b.n) / 60));
  return { s: r2((Math.min(a.t, b.t) + Math.min(a.med, b.med) * 2) * conf), a, b, ok: a.n >= 25 && b.n >= 25 && a.med > 0 && b.med > 0 && a.pf > 1.15 && b.pf > 1.15 };
}

export const PERF = {
  eq: { nombre: "⚖️ Equilibrado", txt: "los 13 estilos; elige la regla más fiable (≥ 25 operaciones ganadoras en cada mitad de los 14 días)", ests: ESTS, rang: {}, fijo: {}, robusta },
  turbo: { nombre: "⚡ Turbo", txt: "muchas operaciones cortas (como mucho 3 h), hasta 8 a la vez y más tamaño; se puntúa por lo que gana en total, no por operación", ests: ESTS,
    rang: { maxHoldH: [0.25, 3], size: [0.12, 0.3], cooldownH: [0.1, 1.5], stop: [0.006, 0.04], tp: [0.006, 0.05], trailOn: [0.004, 0.03] }, fijo: { maxPos: 8 }, robusta: robustaTurbo },
  mix: { nombre: "🧠 IA + los mejores", txt: "solo compra con la IA de predicción o copiando a los mejores traders de Hyperliquid; la bola aprende umbrales y cuándo vender", ests: ["ia", "copia"],
    rang: { iaMin: [0.3, 0.75] }, fijo: {}, robusta } };
// v236 · 🟦 el mismo «IA + los mejores», pero que solo mira criptos que también se pueden comprar en OKX (para copiarlo 1 a 1 con dinero real en OKX)
PERF.mixokx = { ...PERF.mix, nombre: "🧠 IA + los mejores · solo OKX", txt: "como «IA + los mejores», pero solo con criptos que también están en OKX: lo que compre aquí se puede copiar 1 a 1 con dinero real en OKX", soloOkx: true };
for (const P of Object.values(PERF)) P.base = ajustar({ ...BASE }, P);
export const SUBS = ["turbo", "mix", "mixokx"];
// filtros para «solo OKX»: okx = lista de criptos (símbolos) que se pueden operar en OKX contra euros (directo o pasando por USDC)
export const enOkx = (okx, m) => !!okx && okx.has(String(m).replace(/-EUR$/, ""));
export function filtraH(H, okx) { const m = {}; for (const [k, x] of Object.entries(H.m || {})) if (enOkx(okx, k)) m[k] = x; return { m }; }
export function okxSet(I) { const out = new Set(); if (!I) return out; for (const [b, x] of Object.entries(I)) if (x.EUR || (x.USDC && I.USDC && I.USDC.EUR)) out.add(b); return out; }

// ---- estado
export function fresh(now = new Date()) {
  return { v: 1, start: START, cash: START, pos: {}, closed: [], log: [], eq: [], cool: {}, st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0 }, since: now.toISOString(),
    genome: { ...BASE }, genomeId: "base", prueba: true, lab: { gen: 0, lastGen: null, pop: [], log: [], adopt: [] } };
}
const L = (S, now, ev, sym, txt) => { S.log.unshift({ t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 200); };
// v229 · el saldo cuenta lo que se cobraría si se vendiera ahora (precio de compra del libro MENOS la comisión de venta), igual que en la pantalla
const equity = (S, px) => S.cash + Object.entries(S.pos).reduce((t, [m, p]) => t + p.q * ((px[m] && px[m].bid) || p.last || p.px) * (1 - FEE), 0);
function cerrar(S, m, now, bid, why) {
  const p = S.pos[m], got = p.q * bid * (1 - FEE), gotT = got + (p.cob || 0), pnl = gotT - p.cost;
  S.cash += got; S.st.pnl += pnl; S.st.fees += p.q * bid * FEE; if (pnl >= 0) S.st.wins++; else S.st.losses++;
  S.closed.unshift({ m, gid: p.gid || null, sym: m.replace("-EUR", ""), t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(gotT), pnl: r2(pnl), pc: r2((gotT / p.cost - 1) * 100), why: p.cob ? why + " (tras vender parte con ganancia)" : why, h: (p.h || []).slice(-120), px0: p.px, peak: p.peak, out: bid });
  S.closed = S.closed.slice(0, 500); for (let i = 40; i < S.closed.length && S.closed[i].h; i++) delete S.closed[i].h; S.cool[m] = now.getTime(); delete S.pos[m];
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
    if (S.prueba) break;   // v223 · REGLA ESTRICTA: sin reglas con ventaja demostrada (pruebas + vida real), NO compra; solo observa y aprende
    const eq = equity(S, tick), amt = Math.min(S.cash, eq * g.size); if (amt < 2) break;
    const ask = tick[m].ask, q = amt * (1 - FEE) / ask; S.cash -= amt; S.st.trades++; S.st.fees += amt * FEE;
    S.pos[m] = { gid: S.genomeId || "base", sym: m.replace("-EUR", ""), q, q0: q, px: ask, cost: amt, cost0: amt, t0: now.toISOString(), peak: ask, last: ask, h: [[now.toISOString(), ask]], f: { m15: r4(f.m15), m60: r4(f.m60), m240: r4(f.m240), vol: r2(f.vol) } };
    L(S, now, "ENTER", m.replace("-EUR", ""), `${r2(amt)} € · sube ${r2(f.m60 * 100)} % en 1 h · volumen ×${r2(f.vol)}${S.prueba ? " · modo prueba (mitad)" : ""}`);
  }
}
// ---- laboratorio: búsqueda dirigida con backtest robusto
export function evolucionar(S, H, now = new Date(), rnd = Math.random, budgetMs = 20e3, P = PERF.eq) {
  const BASE = P.base, robustaV = (g, H) => { const r = P.robusta(g, H); return { s: r.s, ok: !!r.ok, a: r.a || null, b: r.b || null }; };
  const mutarP = (g, rnd) => mutar(g, rnd, P), aleatorioP = (rnd) => aleatorio(rnd, P), cruzarP = (a, b, rnd) => ajustar(cruzar(a, b, rnd), P);
  const B = S.lab; B.gen++; B.lastGen = now.toISOString(); const t0 = Date.now(), ev = (txt) => { B.log.unshift({ t: now.toISOString(), txt }); B.log = B.log.slice(0, 120); };
  for (const v of B.pop) Object.assign(v, robustaV(v.g, H));
  if (!B.pop.some((v) => v.id === "base")) B.pop.push({ id: "base", g: { ...BASE }, born: now.toISOString(), why: "reglas de partida", ...robustaV(BASE, H) });
  const top = B.pop.slice().sort((a, b) => b.s - a.s).slice(0, 8), seen = new Set(B.pop.map((v) => gkey(v.g))), cand = [];
  for (let i = 0; i < 2000 && Date.now() - t0 < budgetMs; i++) {
    const r = rnd(); let g, why;
    if (r < 0.5 && top.length) { const p = top[Math.floor(rnd() * top.length)]; g = mutarP(p.g, rnd); why = "mutación de " + p.id; }
    else if (r < 0.7 && top.length > 1) { const a = top[Math.floor(rnd() * top.length)], b = top[Math.floor(rnd() * top.length)]; if (a === b) continue; g = cruzarP(a.g, b.g, rnd); why = `cruce de ${a.id} y ${b.id}`; }
    else { g = aleatorioP(rnd); why = "inventada"; }
    const k = gkey(g); if (seen.has(k)) continue; seen.add(k); cand.push({ g, why, ...robustaV(g, H) });
  }
  // v222 · variedad: dos reglas que hacen exactamente las mismas operaciones son la misma regla (se queda una)
  const huella = (v) => (v.a && v.b ? [v.a.n, v.a.med, v.b.n, v.b.med].join("|") : "x" + Math.random());
  const vet = B.vetadas || {}, vistasH = new Set();
  const todos = B.pop.concat(cand.map((c) => ({ id: "b" + (B.next = (B.next || 0) + 1), g: c.g, born: now.toISOString(), why: c.why, s: c.s, ok: c.ok, a: c.a, b: c.b })))
    .filter((v) => !vet[gkey(v.g)]).sort((a, b) => b.s - a.s).filter((v) => { if (v.id === "base" || v.id === S.genomeId) return true; const h = huella(v); if (vistasH.has(h)) return false; vistasH.add(h); return true; });
  const keep = todos.filter((v) => v.id === "base" || v.id === S.genomeId).concat(todos.filter((v) => v.id !== "base" && v.id !== S.genomeId)).slice(0, POP);
  const nuevos = keep.filter((v) => !B.pop.includes(v)).length; B.pop = keep; B.probadas = cand.length;
  ev(`🔬 generación ${B.gen}: ${cand.length} reglas probadas en ${Object.keys(H.m || {}).length} mercados · entran ${nuevos} nuevas`);
  // adopción: la mejor que gane en las DOS mitades; si ninguna, la mejor en «modo prueba»
  // v222 · 🩺 PRUEBA EN VIVO: si con las reglas en uso las últimas ≥ 6 operaciones reales pierden de media más de un 1 %, esas reglas
  // quedan vetadas (no vuelven a adoptarse) aunque en el pasado ganaran: lo que manda es lo que pasa de verdad
  { const vivas = (S.closed || []).filter((c) => c.gid === S.genomeId).slice(0, 12), med = vivas.length ? vivas.reduce((x, c) => x + (+c.pc || 0), 0) / vivas.length : 0;
    if (S.genomeId && S.genomeId !== "base" && vivas.length >= 6 && med < -1) { B.vetadas = B.vetadas || {}; B.vetadas[gkey(S.genome)] = now.toISOString(); const kv = gkey(S.genome); B.pop = B.pop.filter((v) => v.id !== S.genomeId && gkey(v.g) !== kv); ev(`🩺 ${S.genomeId} queda vetada: en vivo pierde ${r2(med)} % de media en ${vivas.length} operaciones aunque en el pasado ganaba`); S.genomeId = null; }
    const ks = Object.keys(B.vetadas || {}); if (ks.length > 300) for (const k of ks.slice(0, ks.length - 300)) delete B.vetadas[k]; }
  const cur = B.pop.find((v) => v.id === S.genomeId), best = B.pop.slice().sort((a, b) => b.s - a.s)[0], ganadora0 = B.pop.filter((v) => v.ok).sort((a, b) => b.s - a.s)[0];
  // v222 · estabilidad: no cambia de reglas cada 10 min por diferencias mínimas; solo si la nueva es claramente mejor (+0,5) o la actual ya no vale
  const ganadora = ganadora0 && cur && cur.ok && cur.id !== ganadora0.id && ganadora0.s < cur.s + 0.5 ? cur : ganadora0;
  const elegida = ganadora || best;
  if (elegida && (elegida.id !== S.genomeId || S.prueba !== !ganadora)) {
    S.genome = { ...elegida.g }; S.genomeId = elegida.id; S.prueba = !ganadora;
    B.adopt.unshift({ t: now.toISOString(), id: elegida.id, s: elegida.s, ok: !!ganadora }); B.adopt = B.adopt.slice(0, 50);
    ev(ganadora ? `🏆 adopta ${elegida.id}: gana en los días antiguos (${elegida.a.med} % de media, ${elegida.a.n} ops) y en los recientes (${elegida.b.med} %, ${elegida.b.n} ops)` : `🛑 ninguna regla gana aún en las dos mitades: no compra (vigila con ${elegida.id} y sigue aprendiendo)`);
  }
  return { gen: B.gen, probadas: cand.length };
}

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
// BV_LOCAL=<carpeta>: modo de pruebas (lee y guarda en esa carpeta en vez de en GitHub)
const LOCAL = process.env.BV_LOCAL || "";
async function leer(f, rama) {
  if (LOCAL) { try { return JSON.parse(readFileSync(path.join(LOCAL, rama + "__" + f), "utf8")); } catch (e) { return null; } }
  if (!REPO || !TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=${rama}`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null; if (!r.ok) throw new Error("no pude leer " + f + " (HTTP " + r.status + ")"); return await r.json();
}
function publicar(f, obj, rama) {
  const out = JSON.stringify(obj); if (LOCAL) { writeFileSync(path.join(LOCAL, rama + "__" + f), out); return; } if (!REPO || !TOKEN) { writeFileSync(f, out); return; }
  const pub = path.join(process.cwd(), ".pub-" + rama); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, f), out);
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g("init -q -b x"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add -A"); g(`commit -q -m "${rama} ${new Date().toISOString()}"`);
  for (let i = 0; i < 3; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${rama}`); return; } catch (e) { if (i === 2) console.log("Bitvavo: no pude guardar " + f); } }
}

// v227 · historial de velas de 5 min + rasgos (igual en el bot de cada minuto y en el laboratorio dedicado). paginas × 1.000 velas
export async function cargarHist(hm, tick, paginas = 4, S = null, now = new Date(), hilos = 6) {
  const H = { m: {} };
  await enParalelo(hm, hilos, async (m) => { try { let c = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 2)); for (let k = 0; k < paginas - 1 && c.length; k++) { const prev = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000&end=${c[0][0] - 1}`, 2)); if (!prev.length) break; c = prev.concat(c); } const desde = Date.now() - paginas * 1000 * 300e3; c = c.filter((x) => x[0] + 300e3 <= Date.now() && x[0] >= desde);
    // v228 · las criptos con poco volumen tienen huecos (velas sin operaciones): traerían meses viejos y descuadran todo. Solo con ≥ 85 % de las velas
    if (c.length >= paginas * 1000 * 0.85) H.m[m] = { c, f: rasgos(c), sp: tick[m].sp }; } catch (e) {} });
  rankear(Object.fromEntries(Object.entries(H.m).map(([m, x]) => [m, x.f])));
  { const B = H.m["BTC-EUR"], R = new Map(); if (B) B.f.forEach((f) => { if (f) R.set(f.t, f.m240 > 0 && f.sobre200 ? 1 : 0); }); for (const x of Object.values(H.m)) for (const f of x.f) if (f) f.reg = R.has(f.t) ? R.get(f.t) : null; }
  // historial de la señal de los mejores (cada 10 min, 7 días) → rasgo de cada vela para la IA y las reglas (el bot de cada minuto lo va anotando)
  try { let hh = null; try { hh = await leer("hl-hist.json", RAMA_H); } catch (e) {} hh = hh || {};
    for (const [m, x] of Object.entries(H.m)) { const se = hh[m.replace("-EUR", "")]; for (const f of x.f) if (f) { f.smart = HLm.enMomento(se, f.t); const s1 = HLm.enMomento(se, f.t - 3600e3); f.smartD = f.smart != null && s1 != null ? f.smart - s1 : null; } } } catch (e) { console.log("Bitvavo: historial de los mejores: " + e.message); }
  return H;
}
// precios de todo (una petición) → tick y los mercados líquidos ordenados por volumen
export async function universo() {
  const T = await J(`${API}/ticker/24h`); if (!Array.isArray(T)) return null;
  const tick = {}, uni = [];
  for (const x of T) { if (!/-EUR$/.test(x.market) || NO.test(x.market)) continue; const bid = +x.bid, ask = +x.ask, vq = +x.volumeQuote || 0; if (!(bid > 0 && ask > 0)) continue; tick[x.market] = { bid, ask, last: +x.last, vq, ch24: +x.open > 0 ? +x.last / +x.open - 1 : 0, sp: (ask - bid) / ((ask + bid) / 2) }; if (vq >= MIN_VOL && tick[x.market].sp < 0.01) uni.push(x.market); }
  uni.sort((a, b) => tick[b].vq - tick[a].vq); return { T, tick, U: uni.slice(0, MAX_MKT) };
}
export { leer, publicar, J };
// v238 · 🔒 el estado de Cripto va CIFRADO con tu clave (REAL_VIEW_PASS): en GitHub (público) solo se ve la hora y si el bot está vivo
const PW = () => (process.env.REAL_VIEW_PASS || "").trim(), PWS = () => [PW(), (process.env.REAL_VIEW_PASS_OLD || "").trim()].filter(Boolean);
export async function leerEstado() {
  const j = await leer("bitvavo.json", RAMA); if (!j || !j.enc) return j;
  if (!PW()) throw new Error("el estado está cifrado y falta REAL_VIEW_PASS");
  const o = await openAny(j, PWS()); if (o.error) throw new Error("no puedo descifrar el estado (¿ha cambiado la clave?)"); return o.j;
}
export async function publicarEstado(S) {
  if (!PW()) { publicar("bitvavo.json", S, RAMA); return; }
  const enc = await encrypt(JSON.stringify(S), PW());
  const cx = S.conex ? Object.fromEntries(["bitvavo", "okx"].map((k) => [k, S.conex[k] ? S.conex[k].estado : null])) : null;   /* solo si hay clave y si funciona: nunca importes */
  publicar("bitvavo.json", { enc: 1, v: 1, ...enc, meta: { t: S.last, vivo: 1, seg: S.diag ? S.diag.seg : null, conex: cx } }, RAMA);
}

async function main() {
  const now = new Date(), t0 = Date.now();
  let S = null; try { S = await leerEstado(); } catch (e) { console.log("Bitvavo: " + e.message); return; }
  if (!S || S.v !== 1) { S = fresh(now); L(S, now, "INFO", "", "🇪🇺 empieza Bitvavo con 100 € ficticios: criptos contra euros, costes del 0,25 %"); }
  // v225 · todos los modos y submodos vuelven a 100 € (lo aprendido —reglas, IA, rejillas— se conserva)
  if (!S.r225) { Object.assign(S, { cash: START, pos: {}, closed: [], eq: [], cool: {}, st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0 }, since: now.toISOString(), r225: 1, sub: {}, fins: {}, rejs: {} });
    delete S.fin; delete S.rej; L(S, now, "INFO", "", "🔄 todos los modos vuelven a empezar con 100 € (lo aprendido se conserva)"); }
  S.sub = S.sub || {}; S.fins = S.fins || {}; S.rejs = S.rejs || {}; delete S.err;
  for (const k of SUBS) if (!S.sub[k] || S.sub[k].v !== 1) { const c = fresh(now); c.genome = { ...PERF[k].base }; L(c, now, "INFO", "", `🎛️ empieza ${PERF[k].nombre} con 100 € ficticios: ${PERF[k].txt}`); S.sub[k] = c; }
  // 🟦 lista de criptos de OKX (pública), cada 6 h: para el submodo «solo OKX», la medición de cobertura y el dinero real en OKX
  let okxI = null;
  if (!S.okx || !S.okx.t || now - Date.parse(S.okx.t) > 6 * 3600e3 || (process.env.OKX_KEY && process.env.OKX_SECRET)) {
    try { const OK = await import("./okx.mjs"); okxI = await OK.instrumentos(); const set = okxSet(okxI); if (set.size >= 10) S.okx = { t: now.toISOString(), bases: [...set].sort() }; } catch (e) { console.log("OKX: no pude leer la lista de criptos"); } }
  const OKX = S.okx && S.okx.bases ? new Set(S.okx.bases) : null;
  // 1) precios de todo (una petición)
  const UV = await universo(); if (!UV) { console.log("Bitvavo: sin precios"); return; } const { T, tick, U } = UV;
  // 2) velas de 5 min de los mercados líquidos (y de lo abierto) → rasgos
  const F = {}, LAT = {}, VEL = {}, quiero = [...new Set([...U, ...Object.keys(S.pos), ...SUBS.flatMap((k) => Object.keys(S.sub[k].pos)), ...Object.values(S.rejs).flatMap((r) => Object.keys((r && r.g) || {}))])];
  await enParalelo(quiero, 8, async (m) => { try { const c0 = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 2)), c = c0.length && c0[c0.length - 1][0] + 300e3 > Date.now() ? c0.slice(0, -1) : c0; const f = rasgos(c); F[m] = f[f.length - 1]; LAT[m] = REJ.lateral(c); VEL[m] = c.slice(-12); /* v222 · solo velas CERRADAS (igual que en las pruebas): la vela en curso engañaba al volumen y al impulso */ } catch (e) { S.err = String(e.message).slice(0, 60); } });
  { const vs = Object.values(F).filter(Boolean).sort((x, y) => y.m240 - x.m240); vs.forEach((f, i) => { f.rk = vs.length > 4 ? i / (vs.length - 1) : null; }); }
  // 👑 lo que hacen ahora los mejores traders de Hyperliquid
  try { S.hl = await HLm.actualizar(S.hl, now); } catch (e) {}
  { const sn = (S.hl && S.hl.snap) || {}, pv = (S.hl && HLm.hace(S.hl, S.hl.at || now.getTime(), 3600e3)) || {};   /* v228 · cambio en 1 h (como en las pruebas), no en 3 min */ for (const [m, f] of Object.entries(F)) if (f) { const c = m.replace("-EUR", ""); f.smart = sn[c] ? sn[c].s : null; f.smartD = sn[c] && pv[c] ? sn[c].s - pv[c].s : null; } }
  { const b = F["BTC-EUR"], reg = b ? (b.m240 > 0 && b.sobre200 ? 1 : 0) : null; for (const f of Object.values(F)) if (f) f.reg = reg; S.regimen = reg; }
  if (S.iaM) for (const f of Object.values(F)) if (f) f.ia = predecir(S.iaM, vector(f));
  paso(S, tick, F, now);
  for (const k of SUBS) paso(S.sub[k], tick, PERF[k].soloOkx ? Object.fromEntries(Object.entries(F).filter(([m]) => enOkx(OKX, m))) : F, now);
  // v224/v225 · cobrar financiación y rejilla: tres submodos cada uno, con sus propios 100 € ficticios
  { const u = T.find((x) => x.market === "USDC-EUR"), ue = u ? +u.last || (+u.bid + +u.ask) / 2 : 0;
    try { const D = await FIN.datos(S.finD, tick, now, fetch, Object.values(S.fins).flatMap((f) => Object.keys((f && f.pos) || {})));
      if (D.series) for (const k of Object.keys(FIN.PERF)) try { const ti = Date.now(), A = FIN.aprender(D.series, (c) => (tick[FIN.moneda(c) + "-EUR"] || {}).sp || 0.003, k); A.seg = Math.round((Date.now() - ti) / 1000); S.fins[k] = S.fins[k] || FIN.fresh(now); S.fins[k].apr = A; } catch (e) { console.log("Financiación (aprender): " + String(e.message).slice(0, 80)); }
      delete D.series;
      for (const k of Object.keys(FIN.PERF)) S.fins[k] = FIN.vuelta(S.fins[k], D, tick, ue, now, FIN.PERF[k]); S.finD = { fr: D.fr, frAt: D.frAt, err: D.err || null }; } catch (e) { console.log("Financiación: " + String(e.message).slice(0, 80)); }
    for (const k of Object.keys(REJ.PERF)) try { S.rejs[k] = REJ.vuelta(S.rejs[k], tick, LAT, now, REJ.PERF[k], VEL); } catch (e) { console.log("Rejilla: " + String(e.message).slice(0, 80)); } }
  // 👑 apunta la señal de los mejores cada 10 min (7 días) para que la IA y las reglas aprendan de ella
  if (!S.hlAnotAt || now - S.hlAnotAt >= 10 * 60000) try { let hh = null; try { hh = await leer("hl-hist.json", RAMA_H); } catch (e) {} hh = HLm.anotar(hh, S.hl && S.hl.snap, now.getTime()); publicar("hl-hist.json", hh, RAMA_H); S.hlHist = Object.keys(hh).length; S.hlAnotAt = now.getTime(); } catch (e) { console.log("Bitvavo: historial de los mejores: " + e.message); }
  // v227 · 🚀 LABORATORIO DEDICADO: tres procesos en la nube (uno por submodo) que prueban reglas SIN PARAR con 30 días de datos.
  // Cada 3 min se recoge lo que han demostrado (reglas, IA y escalones de rejilla). Si el laboratorio se para, este bot vuelve a aprender solo.
  if (!S.labAt || now - S.labAt >= 3 * 60000) { S.labAt = now.getTime();
    for (const k of ["eq", ...SUBS]) try { const Lb = await leer(`lab-${k}.json`, `bitvavo-lab-${k}`); if (!Lb || now - Date.parse(Lb.t) > 30 * 60000) continue;
      const C = k === "eq" ? S : S.sub[k]; Object.assign(C, { lab: Lb.lab, genome: Lb.genome, genomeId: Lb.genomeId, prueba: Lb.prueba, labInfo: Lb.info });
      if (k === "eq") { if (Lb.iaM) { S.iaM = Lb.iaM; S.ia = Lb.ia; } for (const [r, a] of Object.entries(Lb.rej || {})) if (S.rejs[r]) { S.rejs[r].apr = a; S.rejs[r].aprAt = Lb.t; } S.labFresh = Lb.t; } } catch (e) { console.log("Laboratorio " + k + ": " + String(e.message).slice(0, 60)); } }
  const labVivo = S.labFresh && now - Date.parse(S.labFresh) < 30 * 60000;
  // 3) si no hay laboratorio dedicado: generación propia cada 15 min
  let H = null;
  if (!labVivo && (!S.lab.lastGen || !(now - Date.parse(S.lab.lastGen) < GEN_MIN * 60000 && now - Date.parse(S.lab.lastGen) >= 0))) {
    H = await cargarHist(U.slice(0, HIST_MKT), tick, 4, S, now);
    try { const ti = Date.now(), IA = entrenarIA(H); S.iaM = IA.listo ? IA.modelo : null; delete IA.modelo; S.ia = { ...IA, seg: Math.round((Date.now() - ti) / 1000) }; if (IA.listo) L(S, now, "INFO", "", `🧠 IA reentrenada con ${IA.n} momentos: con días que no ha visto ordena bien subidas y caídas ${Math.round(IA.auc * 100)} de cada 100`); } catch (e) { S.ia = { listo: false, err: String(e.message).slice(0, 60) }; }
    if (Object.keys(H.m).length >= 10) for (const k of Object.keys(REJ.PERF)) try { const R0 = S.rejs[k]; if (!R0) continue; const ti = Date.now(); R0.apr = REJ.aprender(H, REJ.PERF[k]); R0.aprAt = now.toISOString(); R0.aprSeg = Math.round((Date.now() - ti) / 1000); } catch (e) { console.log("Rejilla (aprender): " + String(e.message).slice(0, 80)); }
    // v228 · por turnos (equilibrado → turbo → IA + los mejores): cada generación examina un submodo para no pasar nunca de ~75 s
    if (Object.keys(H.m).length >= 10 && Date.now() - t0 < 60e3) { const PR = +process.env.BV_PRISA || 1, ks = ["eq", ...SUBS], k = ks[(S.labTurno = ((S.labTurno || 0) + 1) % ks.length)], C = k === "eq" ? S : S.sub[k];
      try { if (PERF[k].soloOkx && !OKX) throw new Error("sin lista de OKX todavía"); const e2 = evolucionar(C, PERF[k].soloOkx ? filtraH(H, OKX) : H, now, Math.random, Math.max(4e3, 70e3 - (Date.now() - t0) - 25e3) * PR, PERF[k]); L(C, now, "INFO", "", `🔬 generación ${e2.gen}: ${e2.probadas} reglas probadas en ${Object.keys(H.m).length} mercados`); for (const v of C.lab.pop) delete v.c; if (k !== "eq") S.lab.lastGen = now.toISOString(); } catch (e) { console.log("Laboratorio " + k + ": " + String(e.message).slice(0, 80)); } }
  }
  // 🟦 cobertura en OKX: cuántas de las criptos que vigila están en OKX y, de las últimas compras de cada submodo, cuántas se podrían copiar allí
  if (OKX) { const comp = (C) => { const xs = [...Object.values(C.pos || {}).map((p) => p.sym), ...(C.closed || []).map((c) => c.sym)].slice(0, 40); return [xs.filter((b) => OKX.has(b)).length, xs.length]; };
    S.okxCob = { vigila: [U.filter((m) => enOkx(OKX, m)).length, U.length], comp: { eq: comp(S), ...Object.fromEntries(SUBS.map((k) => [k, comp(S.sub[k])])) }, n: OKX.size, t: now.toISOString() }; }
  for (const k of SUBS) { const C = S.sub[k], e = equity(C, tick); C.eq.push([now.toISOString(), r2(e)]); if (C.eq.length > 2000) C.eq = C.eq.filter((_, i) => i % 2 === 0 || i > C.eq.length - 400); C.lastEq = r2(e); C.last = now.toISOString(); }
  const eq = equity(S, tick); S.eq.push([now.toISOString(), r2(eq)]); if (S.eq.length > 3000) S.eq = S.eq.filter((_, i) => i % 2 === 0 || i > S.eq.length - 500);
  S.lastEq = r2(eq); S.last = now.toISOString(); S.diag = { mercados: Object.keys(tick).length, liquidos: U.length, velas: Object.keys(F).length, t: now.toISOString(), seg: Math.round((Date.now() - t0) / 1000) };
  S.top = U.slice(0, 12).map((m) => ({ m, sym: m.replace("-EUR", ""), px: tick[m].last, ch24: r2(tick[m].ch24 * 100), f: F[m] ? { m60: r2(F[m].m60 * 100), vol: r2(F[m].vol), ok: entra({ ...BASE, ...S.genome }, F[m]) } : null }));
  for (const v of S.lab.pop) { delete v.c; }
  // 🔔 avisos por Telegram cuando algo es MUY efectivo
  try {
    const AV = await import("./avisos.mjs"); S.av = S.av || {}; const msgs = AV.avisosCuenta(S.av, "bv", "🇪🇺 Bitvavo", S, now, { med: 1, big: 5 });
    for (const k of SUBS) msgs.push(...AV.avisosCuenta(S.av, "bv" + k, "🧠 " + PERF[k].nombre, S.sub[k], now, { med: 1, big: 5 }));
    for (const [k, X] of Object.entries(S.fins)) if (X) msgs.push(...AV.avisosCuenta(S.av, "bvfin" + k, "💸 Financiación " + FIN.PERF[k].nombre, X, now, { med: 0.3, big: 2 }));
    for (const [k, X] of Object.entries(S.rejs)) if (X) msgs.push(...AV.avisosCuenta(S.av, "bvrej" + k, "🪜 Rejilla " + REJ.PERF[k].nombre, X, now, { med: 0.5, big: 3 }));
    for (const [k, C] of [["eq", S], ...SUBS.map((k) => [k, S.sub[k]])]) { const ad = ((C.lab || {}).adopt || [])[0]; if (ad && ad.ok && now - Date.parse(ad.t) < 60 * 60000) { const m = AV.avisoReglas(S.av, "bv-adopta:" + k + ":" + ad.id, `🏆 Bitvavo ${PERF[k].nombre} ha encontrado reglas que GANAN tanto en los días antiguos como en los recientes (${ad.id}) y empieza a operar con ellas (dinero ficticio).`, now); if (m) msgs.push(m); } }
    // v238 · 📊 resumen diario por Telegram (21:00 en España): como los datos van cifrados, así te llegan los números sin abrir la app
    { const hES = +now.toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }), dES = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      if (hES >= 21 && S.resumenDia !== dES) { S.resumenDia = dES; const f = (n, C) => { if (!C) return null; const cl = C.closed || [], w = cl.filter((c) => c.pnl > 0).length; return `• ${n}: ${r2(C.lastEq)} € (${C.lastEq >= (C.start || 100) ? "+" : ""}${r2((C.lastEq / (C.start || 100) - 1) * 100)} %) · ${cl.length} cerradas (${w} G / ${cl.length - w} P)${C.prueba === true ? " · sin regla ganadora" : C.prueba === false ? " · 🏆 regla ganadora" : ""}`; };
        const L2 = [`📊 Cripto · resumen del día (dinero ficticio, 100 € por submodo)`, "🧠 IA y laboratorio", f("⚖️ Equilibrado", S), ...SUBS.map((k) => f(PERF[k].nombre, S.sub[k])), "💸 Cobrar financiación", ...Object.entries(S.fins).map(([k, X]) => f(FIN.PERF[k].nombre, X)), "🪜 Rejilla", ...Object.entries(S.rejs).map(([k, X]) => f(REJ.PERF[k].nombre, X)), `🧠 IA de predicción: acierta ${S.ia && S.ia.auc ? Math.round(S.ia.auc * 100) : "—"} de cada 100`].filter(Boolean);
        msgs.unshift(L2.join("\n")); } }
    for (const m of msgs.slice(0, 4)) await AV.tg(m);
  } catch (e) { console.log("Bitvavo: avisos no enviados"); }
  // v233 · 💶 dinero real (50 €) copiando al submodo elegido; sin clave de Bitvavo no hace nada
  /* solo si queda tiempo de sobra en esta vuelta: así nunca se corta a medias entre una orden real y el guardado */
  if (Date.now() - t0 < 55e3) try { const RL = await import("./bitvavo-real.mjs"), AV = await import("./avisos.mjs"); await RL.paso(S, tick, now, { leer, publicar, tg: AV.tg, okxI }); } catch (e) { console.log("Real: error"); } else console.log("Real: vuelta larga, espera a la siguiente");
  await publicarEstado(S);
  console.log(`Submodos IA: ${SUBS.map((k) => k + " " + S.sub[k].lastEq + " € (" + S.sub[k].st.trades + " op, " + (S.sub[k].prueba ? "sin ventaja" : "gana") + ")").join(" · ")}`);
  console.log(`Financiación: ${Object.entries(S.fins).map(([k, X]) => k + " " + (X ? X.lastEq + " € · " + Object.keys(X.pos).length + " abiertas" + (X.err ? " · " + X.err : "") : "—")).join(" · ")}`);
  console.log(`Rejilla: ${Object.entries(S.rejs).map(([k, X]) => k + " " + (X ? X.lastEq + " € · " + Object.keys(X.g).length + " rejillas · aptas " + Object.values(X.apr || {}).filter((a) => a.ok).length : "—")).join(" · ")}`);
  console.log(`Bitvavo: ${U.length} mercados · saldo ${S.lastEq} € · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades} · gen ${S.lab.gen} · ${S.diag.seg} s`);
}
export { main };
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Bitvavo: " + (e.message || e)); process.exit(0); });
