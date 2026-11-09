// v198 · 🇪🇺 BITVAVO (SOLO DINERO FICTICIO): criptos contra euros en un exchange europeo regulado (MiCA, aprobado en España).
// Costes bajos (0,25 % por orden + la mitad del diferencial compra/venta), así que tiene sentido hacer muchas compras y ventas.
// Cada minuto: precios de todos los mercados en euros (1 petición) y velas de 5 min de los más líquidos; el terminal compra cuando
// sus reglas (el «genoma») ven una oportunidad y vende con stop, venta parcial, stop móvil y tiempo máximo.
// 🧠 APRENDE SOLO: cada 30 min descarga ~3,5 días de velas de 5 min de los 40 mercados más líquidos y prueba al momento cientos
// de reglas distintas con los costes reales; cada regla se puntúa con su PEOR mitad (días antiguos y recientes por separado).
// El terminal adopta la mejor solo si gana en las dos mitades; si ninguna gana, opera en «modo prueba» (compras a la mitad).
import * as CU from "./cuant.mjs";
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
export const SLIP = 0.0005;
// v291 · deslizamiento SEGÚN LA LIQUIDEZ (volumen de 24 h en €): en criptos pequeñas una orden mueve más el precio
export const deslizamiento = (vq) => (!(vq > 0) ? 0.0015 : vq < 250e3 ? 0.002 : vq < 1e6 ? 0.001 : vq < 5e6 ? 0.0007 : SLIP);   // v271 · deslizamiento por orden en las pruebas (además de comisión y spread)
export const FEE = 0.0025, START = 100, MIN_VOL = 2e5, MAX_MKT = 50, HIST_MKT = 40, GEN_MIN = 15, POP = 60, ESTS = ["tendencia", "rebote", "ruptura", "media", "tortuga", "williams", "connors", "rotacion", "capitulacion", "fade", "maximos", "ia", "copia"];   // v205 · aprende cada 10 min, con 7 días y 4 estilos
export const NO = /^(USDC|USDT|EURC|EURT|DAI|PYUSD|TUSD|FDUSD|USDE|EURI|XAUT|PAXG)-/;   // estables y oro: no se mueven
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cl = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- reglas (genoma). Estilos: «tendencia» (sube con fuerza y sin pasarse) o «rebote» (cayó mucho y empieza a girarse)
export const BASE = { estilo: "tendencia", m15Min: 0.002, m60Min: 0.006, m60Max: 0.05, m240Min: -0.01, ema: 1, hlMin: 0.5, volMin: 1.2, pullMax: 0.03,
  stop: 0.025, tp: 0.03, tpFrac: 0.5, trailOn: 0.015, trail: 0.012, maxHoldH: 6, size: 0.15, maxPos: 6, cooldownH: 1, k: 0.5, rsiMax: 10, rkMax: 0.1, pir: 0, pirOn: 0.04, iaMin: 0, regimen: 0, fgLo: 0, fgHi: 100, fundMax: 0.0002, vmin: 2, ventaV: 0 };
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
  stop: [0.008, 0.08], tp: [0.006, 0.12], tpFrac: [0, 0.8], trailOn: [0.004, 0.06], trail: [0.003, 0.05], maxHoldH: [0.5, 48], size: [0.05, 0.25], cooldownH: [0.25, 12], k: [0.15, 1.2], rsiMax: [2, 30], rkMax: [0.03, 0.35], pir: [0, 1], pirOn: [0.01, 0.1], iaMin: [0, 0.8],
  // v245 · 🌡️ termómetro del mercado: miedo/codicia (0-100) y financiación de los futuros de BTC (si los profesionales están muy comprados)
  fgLo: [0, 60], fgHi: [40, 100], fundMax: [-0.00002, 0.0002],
  // v257 · 🧬 consenso: cuántos de los otros métodos tienen que coincidir (vmin) y si sale cuando ya no coincide ninguno (ventaV)
  vmin: [1, 4], ventaV: [0, 1] };
// v225 · 🎛️ SUBMODOS: cada uno con sus 100 €, su propio laboratorio y sus propios límites (lo que la bola puede tocar)
const rangos = (P) => ({ ...RANG, ...((P && P.rang) || {}) });
export function ajustar(g, P) {
  if (!P) return g; const R0 = rangos(P), ests = P.ests || ESTS; for (const [k, [a, b]] of Object.entries(R0)) if (typeof g[k] === "number") g[k] = r4(cl(g[k], a, b));
  if (!ests.includes(g.estilo)) g.estilo = ests[0]; return Object.assign(g, P.fijo || {});
}
export function aleatorio(rnd = Math.random, P = null) { const ests = (P && P.ests) || ESTS, R0 = rangos(P), g = { ...BASE, estilo: ests[Math.floor(rnd() * ests.length)], ema: rnd() < 0.7 ? 1 : 0, regimen: rnd() < 0.5 ? 1 : 0 }; for (const [k, [a, b]] of Object.entries(R0)) g[k] = r4(a + rnd() * (b - a)); if (rnd() < 0.5) { g.fgLo = 0; g.fgHi = 100; } if (rnd() < 0.5) g.fundMax = 0.0002; return ajustar(g, P); }
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
  return CU.rasgosCuant(c, out);   // v251 · Bollinger, RSI(14), ATR(14), VWAP, EMA(9), barridos y compresión (método cuantitativo)
}
export function entra(g, f) {
  if (!f) return false;
  // v223 · 🌡️ «regimen»: solo compra cuando el mercado acompaña (el bitcoin sube en 4 h y está sobre su media larga). La bola decide si exigirlo.
  if (g.regimen && f.reg === 0) return false;
  // v245 · solo compra con el miedo/codicia entre fgLo y fgHi, y si los futuros de BTC no están demasiado cargados de compras
  if (f.fg != null && g.fgLo != null && (f.fg < g.fgLo || f.fg > g.fgHi)) return false;
  if (f.fund != null && g.fundMax != null && f.fund > g.fundMax) return false;
  // v219 · 🧠 la IA como filtro de cualquier estilo (si la regla lo pide) y como estilo propio («ia»: compra lo que la IA ve más probable)
  if (g.iaMin > 0 && !(f.ia >= g.iaMin)) return false;
  // v220 · «copia»: comprar lo que los mejores traders de Hyperliquid tienen claramente en largo (y no están soltando)
  if (g.estilo === "cuant") return !!CU.plan(f, f.cl, g.pil || "ABC", g);
  // v257 · 🧬 «consenso»: compra solo cuando VARIOS de los mejores métodos (sus reglas en uso) quieren comprar a la vez la misma cripto,
  // con la IA de acuerdo; además aprende sus propias salidas, tamaño y filtros de mercado
  if (g.estilo === "consenso") return f.votos != null && f.votos >= Math.round(g.vmin || 2) && (f.ia == null || f.ia >= (g.iaMin || 0)) && f.m15 > -0.02;
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
export function backtest(g, H, desde = 0, hasta = Infinity) { return backtestTramos(g, H, [desde, hasta])[0]; }
// v245 · un solo recorrido para varios tramos de tiempo (cortes = [t0, t1, …, tn]): lo abierto al cruzar un corte se cierra ahí
export function backtestTramos(g, H, cortes) {
  const T = cortes.length - 1, RS = Array.from({ length: T }, () => []), TR = Array.from({ length: T }, () => []), apunta = (p, tf, r) => { RS[p.k].push(r); TR[p.k].push({ a: p.t, b: tf, r, w: p.lo ? Math.min(0, p.lo / p.px - 1) : 0, s: p.mk }); },   /* v295 · w = peor momento de la operación (a precio de mercado) */ tramo = (t) => { if (t < cortes[0] || t >= cortes[T]) return -1; let k = 0; while (k < T - 1 && t >= cortes[k + 1]) k++; return k; };
  for (const [mkN, m] of Object.entries(H.m || {})) {
    const c = m.c, F = m.f, sp = (m.sp || 0.001) + 2 * (m.slip || SLIP); let pos = null, cool = 0;   // v271 · spread + deslizamiento (ida y vuelta)
    for (let i = 48; i < c.length; i++) {
      const t = c[i][0], k = tramo(t);
      if (pos && k !== pos.k) { apunta(pos, t, (pos.cob + pos.q * c[i][4] * (1 - sp / 2) * (1 - FEE)) / pos.cost - 1); pos = null; }
      if (k < 0) continue;
      if (pos && pos.plan) {   // v251 · método cuantitativo: stops y objetivos con precio de cada operación
        const [, , h, l, cc] = c[i]; pos.lo = Math.min(pos.lo || pos.px, l); const x = CU.salida(pos, h, l, cc, F[i]), ven = (px, q) => q * px * (1 - sp / 2) * (1 - FEE); pos.peak = Math.max(pos.peak, h);   /* v297 · el stop móvil mira el máximo de ANTES de esta vela */
        if (x) { const pxo = x.px === pos.plan.sl ? Math.min(c[i][1], x.px) : x.px; if (x.sale >= 1) { apunta(pos, t, (pos.cob + ven(pxo, pos.q)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; continue; } pos.cob += ven(pxo, pos.q * x.sale); pos.q *= 1 - x.sale; pos.tp = 1; }
        else if ((t - pos.t) / 3600e3 >= 48) { apunta(pos, t, (pos.cob + ven(cc, pos.q)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; }
        continue;
      }
      if (pos) {
        const [, , h, l, cc] = c[i]; const ven = (px) => pos.q * px * (1 - sp / 2) * (1 - FEE);
        // v228 · PESIMISTA: si en la misma vela se tocan el stop y la venta con ganancia, se supone que el stop llegó primero
        let out = null; const sl = Math.max(pos.px * (1 - g.stop), pos.be || 0);
        if (l <= sl) { pos.lo = Math.min(pos.lo || pos.px, l); out = Math.min(c[i][1], sl); apunta(pos, t, (pos.cob + ven(out)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; continue; }
        const peak0 = pos.peak; pos.peak = Math.max(pos.peak, h); pos.lo = Math.min(pos.lo || pos.px, l);   // v295 · peak0: el máximo de ANTES de esta vela (no se sabe si el máximo llegó antes que el mínimo)
        if (g.pir > 0 && !pos.pir && h >= pos.px * (1 + g.pirOn)) { const ap = pos.px * (1 + g.pirOn) * (1 + sp / 2); pos.q += g.pir * (1 - FEE) / ap; pos.cost += g.pir; pos.pir = 1; pos.be = (pos.cost - pos.cob) / (pos.q * (1 - sp / 2) * (1 - FEE)); }
        if (g.tpFrac > 0 && !pos.tp && h >= pos.px * (1 + g.tp)) { pos.cob += pos.q * g.tpFrac * pos.px * (1 + g.tp) * (1 - sp / 2) * (1 - FEE); pos.q *= 1 - g.tpFrac; pos.tp = 1; }
        if (peak0 >= pos.px * (1 + g.trailOn) && l <= peak0 * (1 - g.trail)) out = Math.min(c[i][1], peak0 * (1 - g.trail));
        else if ((t - pos.t) / 3600e3 >= g.maxHoldH) out = cc;
        else if (g.estilo === "consenso" && g.ventaV >= 0.5 && F[i] && F[i].votos === 0 && cc > pos.px * (1 + 2 * FEE)) out = cc;   // v257 · el comité ya no la quiere
        if (out != null) { apunta(pos, t, (pos.cob + ven(out)) / pos.cost - 1); pos = null; cool = t + g.cooldownH * 3600e3; }
        continue;
      }
      if (t >= cool && entra(g, F[i]) && i + 1 < c.length && tramo(c[i + 1][0]) === k) { const px = c[i + 1][1] * (1 + sp / 2), P = g.estilo === "cuant" ? CU.plan(F[i], px, g.pil || "ABC", g) : null; if (g.estilo === "cuant" && !P) continue; pos = { mk: mkN, k, px, q: (1 - FEE) / px, cob: 0, cost: 1, peak: px, t: c[i + 1][0], plan: P }; }   // v228 · la vela de entrada también se revisa
    }
    if (pos) { const x = c[c.length - 1]; apunta(pos, x[0], (pos.cob + pos.q * x[4] * (1 - sp / 2) * (1 - FEE)) / pos.cost - 1); }
  }
  const out = RS.map((rs) => {
    const n = rs.length; if (!n) return { n: 0 };
    const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(Math.max(1e-12, rs.reduce((a, b) => a + (b - m) ** 2, 0) / n));
    let gw = 0, gl = 0, w = 0; for (const x of rs) { if (x > 0) { gw += x; w++; } else gl -= x; }
    return { n, win: r2(w / n * 100), med: r4(m * 100), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, t: r2(m / (sd / Math.sqrt(n))) };
  });
  out.cart = TR.map((tr) => cartera(tr, g)); out.cartTodo = cartera(TR.flat(), g); out.trades = TR; return out;   // v295 · también la curva de TODO el periodo
}
// v291 · 💼 EXAMEN DE CARTERA COMPLETA: las operaciones de TODAS las criptos juntas, como en una cuenta real: un solo dinero, como mucho
// maxPos posiciones a la vez y cada una con su tamaño (si no hay hueco o dinero, esa operación no se hace). Devuelve lo que ganaría la cuenta
// en el tramo (ret, %) y su peor caída desde un máximo (dd, %). Una regla puede ganar «operación a operación» y perder como cartera.
export function cartera(trades, g, opt = {}) {
  const maxPos = Math.max(1, Math.round(g.maxPos || 6)), size = Math.min(1, g.size > 0 ? g.size : 0.15), ts = [...trades].sort((x, y) => x.a - y.a);
  // v295 · caída a PRECIO DE MERCADO (pesimista): en cada momento se supone que todo lo abierto está en su peor punto de la operación
  let cash = 1, abiertas = [], pico = 1, dd = 0, n = 0; const eq = () => cash + abiertas.reduce((s2, o) => s2 + o.amt, 0), eqPeor = () => cash + abiertas.reduce((s2, o) => s2 + o.amt * (1 + (o.w || 0)), 0);
  const mira = () => { const e = eqPeor(); dd = Math.max(dd, 1 - e / pico); pico = Math.max(pico, eq()); };
  const cierra = (hasta) => { abiertas.sort((x, y) => x.b - y.b); while (abiertas.length && abiertas[0].b <= hasta) { const o = abiertas.shift(); cash += o.amt * (1 + o.r); mira(); } };
  const tope = opt.tope || 1, minAmt = opt.min || 0, maxAmt = opt.max || 1;
  for (const x of ts) { cierra(x.a); if (abiertas.length >= maxPos) continue; if (opt.unaPorMercado && x.s && abiertas.some((o) => o.s === x.s)) continue;   /* v297 · como el dinero real: una sola posición por cripto */ const E = eq(), inv = E - cash; let amt = Math.min(Math.max(size, minAmt), maxAmt) * E; amt = Math.min(amt, tope * E - inv); if (!(amt > 0) || cash < amt * 0.999) continue; cash -= amt; abiertas.push({ b: x.b, amt, r: x.r, w: x.w, s: x.s }); n++; mira(); }
  cierra(Infinity); return { ret: r2((cash - 1) * 100), dd: r2(dd * 100), n };
}
// ¿aprueba como cartera? gana en TODOS los tramos y nunca cae más de ddMax %
export const aprueba = (X, ddMax = 15) => !!(X && X.cart && X.cart.length && X.cart.every((c) => c.n > 0 && c.ret > 0 && c.dd < ddMax));
// v245 · 🎓 EXAMEN EN TRES TRAMOS: los días se parten en tres trozos con las mismas velas; la regla tiene que ganar en LOS TRES
// (antes, en dos mitades). Con 90 días de datos cada tramo es de ~30 días: menos «ganadoras por suerte», más que aguantan en vivo.
export const TRAMOS = 3;
function cortesH(H) { if (H._cortes) return H._cortes; const ts = Object.values(H.m || {}).flatMap((m) => m.c.slice(48).map((x) => x[0])).sort((a, b) => a - b); if (!ts.length) return (H._cortes = null);
  const cs = [ts[0]]; for (let k = 1; k < TRAMOS; k++) cs.push(ts[Math.floor(ts.length * k / TRAMOS)]); cs.push(ts[ts.length - 1] + 1); return (H._cortes = cs); }
const peor = (xs, k) => Math.min(...xs.map((x) => x[k]));
// ⚡ turbo: se puntúa por lo que gana EN TOTAL cada tramo (muchas operaciones pequeñas ganadoras valen más que pocas grandes)
// v274 · 📅 ¿OPERA EN EL MERCADO DE AHORA? Operaciones en los últimos 7 días (una regla que solo ganaba en otra fase del mercado no sirve hoy)
function ultimos7(g, H, cs) { const fin = cs[cs.length - 1]; return backtestTramos(g, H, [fin - 7 * 86400e3, fin])[0]; }
const AHORA = 3;   // mínimo de operaciones en los últimos 7 días para dar la ⭐
export function robustaTurbo(g, H) {
  const cs = cortesH(H); if (!cs) return { s: -99 }; const X = backtestTramos(g, H, cs), [a, b, c] = X, r = robustaTurbo0(X, a, b, c); if (r.s <= -99) return r;
  const w = ultimos7(g, H, cs); return { ...r, w, cart: X.cart, s: r2(r.s * Math.min(1, ((w.n || 0) + 1) / (AHORA + 1))), ok: !!r.ok && aprueba(X) && (w.n || 0) >= AHORA && !((w.n || 0) >= 5 && w.med < -0.5) };
}
function robustaTurbo0(X, a, b, c) {
  if (!X.every((x) => x.n >= 12)) return { s: -99, a, b, c };   // (v274: g, H en la envoltura)
  const conf = Math.min(1, Math.sqrt(peor(X, "n") / 40));
  return { s: r2((Math.min(...X.map((x) => x.med * x.n)) / 20 + peor(X, "t")) * conf), a, b, c, ok: X.every((x) => x.n >= 20 && x.med > 0 && x.pf > 1.1) };
}
export function robusta(g, H) {
  const cs = cortesH(H); if (!cs) return { s: -99 }; const X = backtestTramos(g, H, cs), [a, b, c] = X, r = robusta0(X, a, b, c); if (r.s <= -99) return r;
  const w = ultimos7(g, H, cs); return { ...r, w, cart: X.cart, s: r2(r.s * Math.min(1, ((w.n || 0) + 1) / (AHORA + 1))), ok: !!r.ok && aprueba(X) && (w.n || 0) >= AHORA && !((w.n || 0) >= 5 && w.med < -0.5) };
}
function robusta0(X, a, b, c) {
  // v222/v245 · contra la sobreoptimización: con pocas operaciones cualquier regla «gana» por casualidad. ≥ 15 por tramo para puntuar,
  // la nota se rebaja si hay pocas (hasta 60 por tramo para nota completa) y «ganadora» exige ≥ 25 en CADA uno de los tres tramos
  if (!X.every((x) => x.n >= 15)) return { s: -99, a, b, c };
  const conf = Math.min(1, Math.sqrt(peor(X, "n") / 60));
  return { s: r2((peor(X, "t") + peor(X, "med") * 2) * conf), a, b, c, ok: X.every((x) => x.n >= 25 && x.med > 0 && x.pf > 1.15) };
}

export const PERF = {
  eq: { nombre: "⚖️ Equilibrado", txt: "los 13 estilos; elige la regla más fiable (gana en los tres tramos de los 90 días, con ≥ 25 operaciones en cada uno)", ests: ESTS, rang: {}, fijo: {}, robusta },
  turbo: { nombre: "⚡ Turbo", txt: "muchas operaciones cortas (como mucho 3 h), hasta 8 a la vez y más tamaño; se puntúa por lo que gana en total, no por operación", ests: ESTS,
    rang: { maxHoldH: [0.25, 3], size: [0.12, 0.3], cooldownH: [0.1, 1.5], stop: [0.006, 0.04], tp: [0.006, 0.05], trailOn: [0.004, 0.03] }, fijo: { maxPos: 8 }, robusta: robustaTurbo },
  mix: { nombre: "🧠 IA + los mejores", txt: "solo compra con la IA de predicción o copiando a los mejores traders de Hyperliquid; la bola aprende umbrales y cuándo vender", ests: ["ia", "copia"],
    rang: { iaMin: [0.3, 0.75] }, fijo: {}, robusta } };
// v236 · 🟦 el mismo «IA + los mejores», pero que solo mira criptos que también se pueden comprar en OKX (para copiarlo 1 a 1 con dinero real en OKX)
PERF.mixokx = { ...PERF.mix, nombre: "🧠 IA + los mejores · solo OKX", txt: "como «IA + los mejores», pero solo con criptos que también están en OKX: lo que compre aquí se puede copiar 1 a 1 con dinero real en OKX", soloOkx: true };
for (const P of Object.values(PERF)) P.base = ajustar({ ...BASE }, P);
// v251 · 📐 el método cuantitativo que pediste (fijo: no lo cambia la evolución; el laboratorio solo le hace el examen de 90 días)
// v258 · ahora también APRENDE: su laboratorio ajusta los números de tus tres pilares (empieza exactamente con los tuyos)
PERF.cuant = { nombre: "📐 Cuantitativo", txt: "tu método: reversión a la media (Bollinger + RSI), caza de stops y compresión de volatilidad; arriesga el 1,5 % por operación y se frena si cae un 8 %; su laboratorio ajusta los números de cada pilar", ests: ["cuant"], rang: CU.RANG_CU, fijo: { estilo: "cuant", maxPos: CU.MAX_POS, cooldownH: 1 }, robusta };
PERF.cuant.base = { ...BASE, ...CU.DEF, estilo: "cuant", maxPos: CU.MAX_POS, cooldownH: 1 };
// v257 · 🧬 CONSENSO DE LOS MEJORES (método propio): un «comité» con las reglas en uso de Equilibrado, Turbo, IA + los mejores y su versión OKX.
// Solo entra cuando al menos «vmin» de ellas coinciden en la misma cripto en la misma vela (y la IA lo ve probable). La idea, de los
// «ensembles» que usan los equipos cuantitativos: los fallos de cada regla se parecen poco entre sí, así que cuando varias coinciden
// las falsas alarmas se filtran. El laboratorio aprende cuántas tienen que coincidir, el filtro de IA, las salidas y el tamaño.
// v266 · 🟦 métodos propios de OKX: cada familia también con solo las criptos que hay en OKX (lo que compran se puede copiar 1 a 1 allí)
PERF.eqokx = { ...PERF.eq, nombre: "⚖️ Equilibrado · OKX", txt: "como «Equilibrado», pero solo con criptos que están en OKX: su laboratorio busca la regla ganadora para ESAS criptos", soloOkx: true };
PERF.turbookx = { ...PERF.turbo, nombre: "⚡ Turbo · OKX", txt: "como «Turbo», pero solo con criptos que están en OKX", soloOkx: true };
// v271 · 📈 TENDENCIA (lo que hacen los traders de tendencia profesionales: tortugas, rupturas, máximos, rotación hacia lo más fuerte)
PERF.tend = { ...PERF.eq, nombre: "📈 Tendencia", txt: "seguir la tendencia como los traders profesionales: rupturas de máximos (tortugas), rotación hacia lo más fuerte y cortar pérdidas rápido; su laboratorio aprende cuándo entrar y salir", ests: ["tendencia", "ruptura", "tortuga", "maximos", "rotacion"] };
PERF.tend.base = ajustar({ ...BASE, estilo: "tortuga" }, PERF.tend);
PERF.cuantokx = { ...PERF.cuant, nombre: "📐 Cuantitativo · OKX", txt: "tu método cuantitativo (Bollinger, caza de stops, compresión) solo con criptos de OKX", soloOkx: true };
PERF.consensookx = { ...PERF.consenso, nombre: "🧬 Consenso · OKX", txt: "compra cuando varios métodos de OKX coinciden a la vez en la misma cripto (y la IA está de acuerdo)", soloOkx: true, comite: "okx" };
PERF.tendokx = { ...PERF.tend, nombre: "📈 Tendencia · OKX", txt: "seguir la tendencia (tortugas, rupturas, rotación) solo con criptos de OKX", soloOkx: true };
export const COMITE_OKX = ["mixokx", "eqokx", "turbookx", "tendokx"];
// v272 · 🚀 EXPLORADORES: buscan sin parar reglas de CUALQUIER estilo (sobre todo inventadas). Si encuentran una 💎 muy buena que supera
// claramente al peor de los 6 métodos visibles, la sustituyen (el peor sigue aprendiendo por detrás y puede volver).
PERF.explora = { ...PERF.eq, nombre: "🚀 Explorador", txt: "busca sin parar reglas nuevas de cualquier estilo; cuando encuentra una muy buena, entra en lugar del peor método", explora: true };
PERF.exploraokx = { ...PERF.eq, nombre: "🚀 Explorador · OKX", txt: "busca sin parar reglas nuevas solo con criptos de OKX; cuando encuentra una muy buena, entra en lugar del peor método de OKX", explora: true, soloOkx: true };
export const FAMILIA = { okx: ["mixokx", "eqokx", "turbookx", "cuantokx", "consensookx", "tendokx"], bitvavo: ["eq", "turbo", "mix", "cuant", "consenso", "tend"] };
export const COMITE = ["eq", "turbo", "mix", "mixokx"];
PERF.consenso = { nombre: "🧬 Consenso", txt: "compra solo cuando varios de los mejores métodos coinciden a la vez en la misma cripto (y la IA está de acuerdo); aprende cuántos tienen que coincidir y cuándo vender", ests: ["consenso"], rang: { iaMin: [0, 0.6] }, fijo: {}, robusta };
PERF.consenso.base = ajustar({ ...BASE, estilo: "consenso", vmin: 2 }, PERF.consenso);
// votos de cada vela: cuántas reglas del comité darían compra ahí
export function ponVotos(H, genomas) { const gs = genomas.filter(Boolean); for (const x of Object.values(H.m || {})) for (const f of x.f) if (f) { let v = 0; for (const g of gs) if (entra(g, f)) v++; f.votos = v; } }
// v276 · 🎢 ALTO RIESGO (solo ficticio; el dinero real nunca lo sigue solo): busca subidas explosivas (impulso, rupturas, máximos) con
// MUCHO dinero por operación (40-90 %), 1-2 posiciones, objetivos grandes (15-60 %) y stop rápido. Se puntúa por lo que GANA EN TOTAL en cada tramo.
export function robustaRiesgo(g, H) {
  const cs = cortesH(H); if (!cs) return { s: -99 }; const X = backtestTramos(g, H, cs), [a, b, c] = X;
  if (!X.every((x) => x.n >= 6)) return { s: -99, a, b, c };
  const tot = (x) => x.med * x.n * (g.size || 0.5), w = ultimos7(g, H, cs);
  const s = r2(Math.min(...X.map(tot)) / 10 * Math.min(1, Math.sqrt(peor(X, "n") / 20)) * Math.min(1, ((w.n || 0) + 1) / 2));
  return { s, a, b, c, w, cart: X.cart, ok: X.every((x) => x.n >= 8 && x.med > 0 && x.pf > 1.2) && aprueba(X, 40) && (w.n || 0) >= 1 };
}
PERF.riesgo = { nombre: "🎢 Alto riesgo", txt: "busca subidas explosivas (impulso, rupturas, máximos) metiendo mucho en cada operación, con objetivos grandes y stop rápido; solo ficticio: el dinero real no lo sigue", ests: ["ruptura", "maximos", "tendencia", "rotacion", "tortuga"],
  rang: { size: [0.4, 0.9], maxPos: [1, 2], stop: [0.03, 0.12], tp: [0.15, 0.6], tpFrac: [0, 0.6], trailOn: [0.08, 0.3], trail: [0.04, 0.15], maxHoldH: [6, 96], cooldownH: [0.5, 12] }, fijo: {}, robusta: robustaRiesgo, soloFicticio: true };
PERF.riesgo.base = ajustar({ ...BASE, estilo: "ruptura", size: 0.6, maxPos: 1, stop: 0.06, tp: 0.3, trailOn: 0.12, trail: 0.07, maxHoldH: 48 }, PERF.riesgo);
PERF.riesgookx = { ...PERF.riesgo, nombre: "🎢 Alto riesgo · OKX", txt: "como «Alto riesgo», pero solo con criptos de OKX; solo ficticio: el dinero real no lo sigue", soloOkx: true };
export const SUBS = ["turbo", "mix", "cuant", "consenso", "tend", "mixokx", "eqokx", "turbookx", "cuantokx", "consensookx", "tendokx", "explora", "exploraokx", "riesgo", "riesgookx"];
export const EXPLORA = { bitvavo: "explora", okx: "exploraokx" };
// v272 · 🔄 ROTACIÓN: los 6 métodos que se ven (y que puede seguir el dinero real) por exchange. Si un método fuera de la lista (el explorador o
// uno que salió) es 💎 desde hace ≥ 1 h y su nota supera en ≥ 1 punto a la del peor de la lista, entra y el peor sale. Como mucho un cambio cada 12 h.
export function rotar(S, now, notas, muy) {
  S.visibles = S.visibles || { bitvavo: [...FAMILIA.bitvavo], okx: [...FAMILIA.okx] }; S.rotAt = S.rotAt || {}; const msgs = [];
  for (const ex of ["bitvavo", "okx"]) {
    const vis = S.visibles[ex], cands = [...new Set([...FAMILIA[ex], EXPLORA[ex]])].filter((k) => !vis.includes(k) && muy(k) && notas[k] != null);
    if (!cands.length || (S.rotAt[ex] && now - Date.parse(S.rotAt[ex]) < 12 * 3600e3)) continue;
    const mejor = cands.sort((a, b) => notas[b] - notas[a])[0], peor = vis.slice().sort((a, b) => (notas[a] ?? -99) - (notas[b] ?? -99))[0];
    if (notas[mejor] >= (notas[peor] ?? -99) + 1) { S.visibles[ex] = vis.map((k) => (k === peor ? mejor : k)); S.rotAt[ex] = now.toISOString();
      msgs.push(`🔄💎 ${ex === "okx" ? "OKX" : "Bitvavo"}: entra «${PERF[mejor].nombre}» (MUY BUENO, nota ${notas[mejor]}) y sale «${PERF[peor].nombre}» (nota ${notas[peor] ?? "sin regla"}). Si el dinero real está en 🤖 Automático, ya puede seguirlo.`); } }
  return msgs;
}
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
// v258 · 📸 «foto» de todos los rasgos en el momento de comprar: así el laboratorio puede aprender de cada error real (qué había cuando falló)
export function foto(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) if (typeof v === "number" && isFinite(v)) o[k] = Math.abs(v) >= 100 ? Math.round(v * 100) / 100 : r4(v); else if (v == null) o[k] = null; return o; }
// v258 · 🩹 APRENDER DE LOS ERRORES: con las fotos de las últimas operaciones reales de la cuenta, cada regla candidata se mira contra ellas:
// si habría vuelto a comprar en los momentos en que se perdió dinero (y no en los que se ganó), baja su nota; si los habría evitado, sube.
export function lecciones(S) { const cl = (S.closed || []).filter((c) => c.fx).slice(0, 80); return { L: cl.filter((c) => +c.pc < 0).map((c) => ({ f: c.fx, pc: +c.pc })), W: cl.filter((c) => +c.pc >= 0).map((c) => ({ f: c.fx, pc: +c.pc })) }; }
export function ajusteErrores(g, Lc) { if (!Lc || Lc.L.length + Lc.W.length < 5) return { d: 0 }; let pl = 0, pw = 0, hL = 0, hW = 0;
  for (const x of Lc.L) if (entra(g, x.f)) { hL++; pl += Math.abs(x.pc); } for (const x of Lc.W) if (entra(g, x.f)) { hW++; pw += x.pc; }
  const n = Lc.L.length + Lc.W.length, d = r2(Math.max(-2, Math.min(1, (pw - pl) / Math.max(10, n)))); return { d, hL, hW }; }
function cerrar(S, m, now, bid, why) {
  const p = S.pos[m], got = p.q * bid * (1 - FEE), gotT = got + (p.cob || 0), pnl = gotT - p.cost;
  S.cash += got; S.st.pnl += pnl; S.st.fees += p.q * bid * FEE; if (pnl >= 0) S.st.wins++; else S.st.losses++;
  S.closed.unshift({ m, gid: p.gid || null, ...(p.fx ? { fx: p.fx } : {}), sym: m.replace("-EUR", ""), t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(gotT), pnl: r2(pnl), pc: r2((gotT / p.cost - 1) * 100), why: p.cob ? why + " (tras vender parte con ganancia)" : why, h: (p.h || []).slice(-120), px0: p.px, peak: p.peak, out: bid });
  S.closed = S.closed.slice(0, 500); for (let i = 40; i < S.closed.length && S.closed[i].h; i++) delete S.closed[i].h; S.cool[m] = now.getTime(); delete S.pos[m];
  L(S, now, pnl >= 0 ? "WIN" : "LOSS", m.replace("-EUR", ""), `${pnl >= 0 ? "+" : ""}${r2(pnl)} € · ${r2((gotT / p.cost - 1) * 100)} % · ${why}`);
}
// una vuelta: vigila lo abierto y compra lo que diga el genoma
// v271 · 🧪 práctica: sin 🏆, en vez de su regla (que puede no dar señales en días) usa la más ACTIVA de sus 10 mejores candidatas
// v273 · entre TODAS sus candidatas que no pierden en conjunto, la que más opera (≥ 5 al día si la hay): así siempre hay movimiento para aprender
export function reglaPractica(S) { if (S.practG && S.practAt && Date.now() - Date.parse(S.practAt) < 60 * 60000) return S.practG; return reglaPractica0(S); }
function reglaPractica0(S) { const n = (v) => (v.a ? v.a.n : 0) + (v.b ? v.b.n : 0) + (v.c ? v.c.n : 0), med = (v) => ((v.a ? v.a.med * v.a.n : 0) + (v.b ? v.b.med * v.b.n : 0) + (v.c ? v.c.med * v.c.n : 0)) / Math.max(1, n(v));
  const pop = ((S.lab && S.lab.pop) || []).filter((v) => v.g && v.a && v.b && v.c && n(v) > 0); if (!pop.length) return null;
  const buenas = pop.filter((v) => med(v) > -0.15), L = (buenas.length ? buenas : pop).sort((a, b) => n(b) - n(a)); return L[0].g; }
export function paso(S, tick, F, now = new Date()) {
  const gp = S.prueba ? reglaPractica(S) : null, g = { ...BASE, ...S.genome, ...(gp || {}) }, tnow = now.getTime(), px = tick;
  for (const [m, p] of Object.entries(S.pos)) {
    const t = tick[m]; if (!t || !(t.bid > 0)) continue; const bid = t.bid;
    p.last = bid; p.peak = Math.max(p.peak, bid); p.h = (p.h || []).concat([[now.toISOString(), bid]]).slice(-200);
    if (p.plan) { const x = CU.salida(p, bid, bid, bid, F && F[m]); if (!x) { if ((tnow - Date.parse(p.t0)) / 3600e3 >= 48) cerrar(S, m, now, bid, "tiempo máximo (48 h)"); continue; }
      if (x.sale >= 1) { cerrar(S, m, now, bid, x.por); continue; } const qv = p.q * x.sale, got = qv * bid * (1 - FEE); S.cash += got; p.cob = (p.cob || 0) + got; p.q -= qv; p.tp = 1; S.st.fees += qv * bid * FEE; L(S, now, "TP", p.sym, `${x.por}: vende el ${Math.round(x.sale * 100)} %`); continue; }
    if (g.tpFrac > 0 && !p.tp && bid >= p.px * (1 + g.tp)) { const qv = p.q * g.tpFrac, got = qv * bid * (1 - FEE); S.cash += got; p.cob = (p.cob || 0) + got; p.q -= qv; p.tp = 1; S.st.fees += qv * bid * FEE; L(S, now, "TP", m.replace("-EUR", ""), `+${r2(g.tp * 100)} %: vende el ${Math.round(g.tpFrac * 100)} %`); }
    if (g.pir > 0 && !p.pir && bid >= p.px * (1 + g.pirOn) && tick[m].ask > 0) { const add = Math.min(S.cash, (p.cost0 || p.cost) * g.pir); if (add >= 2) { const q2 = add * (1 - FEE) / tick[m].ask; S.cash -= add; S.st.fees += add * FEE; p.q += q2; p.cost += add; p.pir = 1; p.be = (p.cost - (p.cob || 0)) / (p.q * (1 - FEE)); L(S, now, "ENTER", m.replace("-EUR", ""), `piramida: +${r2(add)} € (ya gana ${r2(g.pirOn * 100)} %) · stop a «sin pérdidas»`); } }
    if (g.estilo === "consenso" && g.ventaV >= 0.5 && F && F[m] && F[m].votos === 0 && bid > p.px * (1 + 2 * FEE)) { cerrar(S, m, now, bid, "el comité ya no la quiere (y va ganando)"); continue; }
    if (bid <= Math.max(p.px * (1 - g.stop), p.be || 0)) cerrar(S, m, now, bid, p.be && bid > p.px * (1 - g.stop) ? "stop sin pérdidas (tras piramidar)" : `stop −${r2(g.stop * 100)} %`);
    else if (p.peak >= p.px * (1 + g.trailOn) && bid <= p.peak * (1 - g.trail)) cerrar(S, m, now, bid, `stop móvil (${r2(g.trail * 100)} % bajo el máximo)`);
    else if ((tnow - Date.parse(p.t0)) / 3600e3 >= g.maxHoldH) cerrar(S, m, now, bid, `tiempo máximo (${g.maxHoldH} h)`);
  }
  if (!F) return;
  const cand = Object.entries(F).filter(([m, f]) => !S.pos[m] && !(S.cool[m] && tnow - S.cool[m] < g.cooldownH * 3600e3) && entra(g, f) && tick[m] && tick[m].ask > 0)
    .sort((a, b) => b[1].m60 - a[1].m60);
  for (const [m, f] of cand) {
    if (Object.keys(S.pos).length >= g.maxPos) break;
    // v267 · 🧪 PRÁCTICA (solo dinero ficticio): sin 🏆 ya no se queda quieto; prueba su mejor regla con poco dinero (¼ del tamaño, máx. 2 a la vez)
    // para tener operaciones REALES de las que aprender (🩹). Lo de práctica nunca lo copia el dinero real.
    if (S.prueba && Object.values(S.pos).filter((p) => p.practica).length >= 3) break;
    if (false && S.prueba) break;   // v223 · REGLA ESTRICTA: sin reglas con ventaja demostrada (pruebas + vida real), NO compra; solo observa y aprende (el cuantitativo es tu método fijo: opera siempre en ficticio)
    const eq = equity(S, tick); let amt = Math.min(S.cash, eq * g.size * (S.prueba ? 0.25 : 1)), P = null;
    if (g.estilo === "cuant") { S.pico = Math.max(S.pico || S.start || 100, eq); if (S.pausaDD && tnow < S.pausaDD) break; if (eq < S.pico * (1 - CU.DD_MAX)) { S.pausaDD = tnow + 86400e3; S.pico = eq; L(S, now, "INFO", "", `🛑 ha caído un ${CU.DD_MAX * 100} % desde su máximo: no compra en 24 h`); break; }
      P = CU.plan(f, tick[m].ask, "ABC", g); if (!P) continue; amt = CU.tamano(eq, S.cash, tick[m].ask, P) * (S.prueba ? 0.25 : 1); }
    if (amt < 2) break;
    const ask = tick[m].ask, q = amt * (1 - FEE) / ask; S.cash -= amt; S.st.trades++; S.st.fees += amt * FEE;
    S.pos[m] = { gid: S.genomeId || "base", sym: m.replace("-EUR", ""), q, q0: q, px: ask, cost: amt, cost0: amt, t0: now.toISOString(), peak: ask, last: ask, h: [[now.toISOString(), ask]], f: { m15: r4(f.m15), m60: r4(f.m60), m240: r4(f.m240), vol: r2(f.vol) }, fx: foto(f), ...(P ? { plan: P } : {}), ...(S.prueba ? { practica: 1 } : {}) };
    L(S, now, "ENTER", m.replace("-EUR", ""), P ? `${r2(amt)} € · pilar ${P.pilar} (${CU.NOMBRE_PILAR[P.pilar]}) · stop ${r2((1 - P.sl / ask) * 100)} % · objetivo +${r2((P.tp1 / ask - 1) * 100)} % · arriesga ${r2(amt * (1 - P.sl / ask))} €` : `${r2(amt)} € · sube ${r2(f.m60 * 100)} % en 1 h · volumen ×${r2(f.vol)}${S.prueba ? " · 🧪 práctica (¼, sin 🏆: no se copia con dinero real)" : ""}`);
  }
}
// ---- laboratorio: búsqueda dirigida con backtest robusto
// v294 · 📆 entre las que ganan los 90 días: primero las que aprueban el año (2), luego las que lo ganan en total sin caer un 10 % (1), luego las
// aún no examinadas (0). Las que suspenden el año del todo (−1) no pueden ser la ganadora. v222 · estabilidad: la actual se queda salvo +0,5 de nota.
export function eligeGanadora(pop, curId, AN = {}) {
  const rk = (v) => { const r = v && AN && AN[gkey(v.g)]; return !r ? 0 : r.ok ? 2 : r.suave ? 1 : -1; };
  const cur = pop.find((v) => v.id === curId), g0 = pop.filter((v) => v.ok && rk(v) >= 0).sort((a, b) => rk(b) - rk(a) || b.s - a.s)[0];
  return g0 && cur && cur.ok && rk(cur) >= 0 && rk(cur) >= rk(g0) && cur.id !== g0.id && g0.s < cur.s + 0.5 ? cur : g0;
}
export function evolucionar(S, H, now = new Date(), rnd = Math.random, budgetMs = 20e3, P = PERF.eq, fuera = []) {
  const Lc = lecciones(S), BASE = P.base, robustaV = (g, H) => { const r = P.robusta(g, H), e = r.s > -99 ? ajusteErrores(g, Lc) : { d: 0 }; return { s: r2(r.s + e.d), s0: r.s, err: e.d ? { d: e.d, hL: e.hL, hW: e.hW } : null, ok: !!r.ok && !(e.d <= -1), a: r.a || null, b: r.b || null, c: r.c || null, w: r.w || null }; };
  const mutarP = (g, rnd) => mutar(g, rnd, P), aleatorioP = (rnd) => aleatorio(rnd, P), cruzarP = (a, b, rnd) => ajustar(cruzar(a, b, rnd), P);
  const B = S.lab; B.gen++; B.lastGen = now.toISOString(); const t0 = Date.now(), ev = (txt) => { B.log.unshift({ t: now.toISOString(), txt }); B.log = B.log.slice(0, 120); };
  for (const v of B.pop) Object.assign(v, robustaV(v.g, H));
  if (!B.pop.some((v) => v.id === "base")) B.pop.push({ id: "base", g: { ...BASE }, born: now.toISOString(), why: "reglas de partida", ...robustaV(BASE, H) });
  const top = B.pop.slice().sort((a, b) => b.s - a.s).slice(0, 8), seen = new Set(B.pop.map((v) => gkey(v.g))), cand = [];
  // v245 · 🧬 CRUCE ENTRE LABORATORIOS: las mejores reglas de los otros submodos se prueban aquí (adaptadas a sus límites) y se mezclan con las propias
  for (const x of fuera) { if (Date.now() - t0 > budgetMs / 3) break; const gi = ajustar({ ...BASE, ...x.g }, P), k0 = gkey(gi); if (!seen.has(k0)) { seen.add(k0); cand.push({ g: gi, why: "traída de " + x.de, ...robustaV(gi, H) }); }
    if (top.length) { const p = top[Math.floor(rnd() * top.length)], gx = cruzarP(gi, p.g, rnd), k1 = gkey(gx); if (!seen.has(k1)) { seen.add(k1); cand.push({ g: gx, why: `cruce de ${x.de} con ${p.id}`, ...robustaV(gx, H) }); } } }
  for (let i = 0; i < 2000 && Date.now() - t0 < budgetMs; i++) {
    const r = rnd(); let g, why;
    const inv = P.explora ? 0.55 : 0;   // v272 · 🚀 el explorador inventa mucho más (reglas nuevas de cualquier estilo)
    if (r < inv) { g = aleatorioP(rnd); why = "inventada"; }
    else if (r < 0.5 + inv * 0.4 && top.length) { const p = top[Math.floor(rnd() * top.length)]; g = mutarP(p.g, rnd); why = "mutación de " + p.id; }
    else if (r < 0.7 && top.length > 1) { const a = top[Math.floor(rnd() * top.length)], b = top[Math.floor(rnd() * top.length)]; if (a === b) continue; g = cruzarP(a.g, b.g, rnd); why = `cruce de ${a.id} y ${b.id}`; }
    else { g = aleatorioP(rnd); why = "inventada"; }
    const k = gkey(g); if (seen.has(k)) continue; seen.add(k); cand.push({ g, why, ...robustaV(g, H) });
  }
  // v222 · variedad: dos reglas que hacen exactamente las mismas operaciones son la misma regla (se queda una)
  const huella = (v) => (v.a && v.b ? [v.a.n, v.a.med, v.b.n, v.b.med, v.c ? v.c.n : "", v.c ? v.c.med : ""].join("|") : "x" + Math.random());
  const vet = B.vetadas || {}, vistasH = new Set();
  const todos = B.pop.concat(cand.map((c) => ({ id: "b" + (B.next = (B.next || 0) + 1), g: c.g, born: now.toISOString(), why: c.why, s: c.s, s0: c.s0, err: c.err, ok: c.ok, a: c.a, b: c.b, c: c.c, w: c.w })))
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
  // v294 · 📆 EXAMEN DE UN AÑO: entre las que ganan los 90 días, primero las que aprueban el año (2), luego las que lo ganan en total sin caer un 10 % (1),
  // luego las aún no examinadas (0). Las que suspenden el año del todo (−1) ya no pueden ser la regla ganadora.
  const best = B.pop.slice().sort((a, b) => b.s - a.s)[0], ganadora = eligeGanadora(B.pop, S.genomeId, B.anio);
  const elegida = ganadora || best;
  if (elegida && (elegida.id !== S.genomeId || S.prueba !== !ganadora)) {
    S.genome = { ...elegida.g }; S.genomeId = elegida.id; S.prueba = !ganadora;
    B.adopt.unshift({ t: now.toISOString(), id: elegida.id, s: elegida.s, ok: !!ganadora }); B.adopt = B.adopt.slice(0, 50);
    ev(ganadora ? `🏆 adopta ${elegida.id}: gana en los tres tramos (${[elegida.a, elegida.b, elegida.c].filter(Boolean).map((x) => `${x.med} % en ${x.n} ops`).join(" · ")})${/traída|cruce de [a-z]/.test(elegida.why || "") ? " · " + elegida.why : ""}` : `🛑 ninguna regla gana aún en los tres tramos: no compra (vigila con ${elegida.id} y sigue aprendiendo)`);
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
// v301 · 🧺 TENDENCIA DE LA CARTERA BASE: BTC y ETH frente a su media de 50 días (velas diarias). Con margen del 1 % para no ir y venir:
// sube si cierra > media × 1,01; baja si cierra < media × 0,99; en medio, se queda como estaba.
export const BASE_MKT = ["BTC-EUR", "ETH-EUR"];
export function tendencia(diarias, antes = null) { const c = diarias.slice(-51, -1).map((x) => x[4]); if (c.length < 50) return null; const sma = c.reduce((a, b) => a + b, 0) / c.length, px = diarias[diarias.length - 1][4];
  const up = px > sma * 1.01 ? true : px < sma * 0.99 ? false : antes != null ? antes : px > sma; return { up, px, sma: Math.round(sma * 100) / 100 }; }
export async function tendenciaBase(prev = null) { const m = {}; for (const mk of BASE_MKT) { const d = velas(await J(`${API}/${mk}/candles?interval=1d&limit=60`, 3)); const T = tendencia(d, prev && prev.m && prev.m[mk] ? prev.m[mk].up : null); if (T) m[mk] = T; } return Object.keys(m).length ? { t: Date.now(), m } : null; }
// la misma regla en el pasado (velas diarias): entra/sale al cierre, comisión 0,25 % por lado. Devuelve rentabilidad, peor caída y la de comprar y aguantar
export function simulaBase(diarias, fee = 0.0025) { let eq = 1, pico = 1, dd = 0, dentro = false, up = null, n = 0; const ret = [];
  for (let i = 51; i < diarias.length; i++) { if (dentro) eq *= diarias[i][4] / diarias[i - 1][4]; const T = tendencia(diarias.slice(0, i + 1), up); up = T.up;
    if (up && !dentro) { dentro = true; eq *= 1 - fee; n++; } else if (!up && dentro) { dentro = false; eq *= 1 - fee; } pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); ret.push([diarias[i][0], eq]); }
  const bh = diarias.length > 51 ? diarias[diarias.length - 1][4] / diarias[51][4] - 1 : 0; return { ret: Math.round((eq - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, bh: Math.round(bh * 10000) / 100, n, curva: ret }; }
export async function diariasLargas(mk, dias = 730) { let out = [], fin = Date.now(); for (let k = 0; k < Math.ceil(dias / 1000) + 1 && out.length < dias; k++) { const d = velas(await J(`${API}/${mk}/candles?interval=1d&limit=1000&end=${fin}`, 3)); if (!d.length) break; out = d.concat(out); fin = d[0][0] - 1; } const mp = new Map(out.map((x) => [x[0], x])); return [...mp.values()].sort((a, b) => a[0] - b[0]).slice(-dias); }
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
// v245 · 📚 DATOS: descarga (con freno para no pasarse del límite de Bitvavo), relleno de huecos y rasgos por separado,
// para que los 4 laboratorios compartan una sola descarga de 90 días y luego solo pidan lo nuevo.
export const VELA = 300e3;
export async function descargar(hm, paginas = 4, hilos = 6, ritmo = 0) {
  const raw = {}, desde = Date.now() - paginas * 1000 * VELA, pide = async (u) => { if (ritmo) await sleep(ritmo); return velas(await J(u, 3)); };
  await enParalelo(hm, hilos, async (m) => { try { let c = await pide(`${API}/${m}/candles?interval=5m&limit=1000`); for (let k = 0; k < paginas - 1 && c.length && c[0][0] > desde; k++) { const prev = await pide(`${API}/${m}/candles?interval=5m&limit=1000&end=${c[0][0] - 1}`); if (!prev.length) break; c = prev.concat(c); }
    raw[m] = c.filter((x) => x[0] + VELA <= Date.now() && x[0] >= desde); } catch (e) {} });
  return { t: Date.now(), paginas, m: raw };
}
// solo lo nuevo (las últimas 1.000 velas de cada una) y se tira lo que ya pasa de los días que se guardan
export async function ponerAlDia(raw, hm, hilos = 4, ritmo = 0) {
  const desde = Date.now() - raw.paginas * 1000 * VELA;
  await enParalelo(hm, hilos, async (m) => { try { if (ritmo) await sleep(ritmo); const nu = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 3)).filter((x) => x[0] + VELA <= Date.now());
    const old = raw.m[m] || [], ult = old.length ? old[old.length - 1][0] : 0; raw.m[m] = old.concat(nu.filter((x) => x[0] > ult)).filter((x) => x[0] >= desde); } catch (e) {} });
  raw.t = Date.now(); return raw;
}
// huecos (5 min sin ninguna operación): se rellenan con una vela plana al último precio y volumen 0, así «1 h» son siempre 12 velas
export function rellenar(c) {
  if (c.length < 2) return c; const out = [c[0]];
  for (let i = 1; i < c.length; i++) { let t = out[out.length - 1][0] + VELA; const pc = out[out.length - 1][4]; while (t < c[i][0] && out.length < 1e6) { out.push([t, pc, pc, pc, pc, 0]); t += VELA; } out.push(c[i]); }
  return out;
}
// valor de una serie [[t, v], …] (ordenada) en el momento t: el último conocido
export function enSerie(se, t) { if (!se || !se.length || t < se[0][0]) return null; let a = 0, b = se.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (se[m][0] <= t) a = m; else b = m - 1; } return se[a][1]; }
// 🌡️ termómetro del mercado: miedo/codicia diario (alternative.me) y financiación horaria de BTC en Hyperliquid (media de las últimas 8 h)
export async function termometro(dias = 90, fx = fetch) {
  const out = { t: Date.now(), fg: null, fund: null };
  try { const r = await fx(`https://api.alternative.me/fng/?limit=${dias + 3}`, { signal: AbortSignal.timeout(15000) }); const j = await r.json(); out.fg = (j.data || []).map((x) => [+x.timestamp * 1000, +x.value]).filter((x) => x[0] > 0 && x[1] >= 0).sort((a, b) => a[0] - b[0]); } catch (e) {}
  try { let ini = Date.now() - (dias + 1) * 86400e3; const all = [];
    for (let k = 0; k < 12 && ini < Date.now(); k++) { const r = await fx("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "fundingHistory", coin: "BTC", startTime: ini }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (!Array.isArray(j) || !j.length) break; for (const x of j) all.push([+x.time, +x.fundingRate]); const last = +j[j.length - 1].time; if (!(last > ini)) break; ini = last + 1; if (j.length < 400) break; }
    all.sort((a, b) => a[0] - b[0]); const f8 = all.map((x, i) => { const w = all.slice(Math.max(0, i - 7), i + 1); return [x[0], w.reduce((s2, y) => s2 + y[1], 0) / w.length]; }); out.fund = f8.length ? f8 : null; } catch (e) {}
  return out;
}
export function ponTermometro(f, TM) { if (!f || !TM) return; f.fg = TM.fg ? enSerie(TM.fg, f.t) : null; f.fund = TM.fund ? enSerie(TM.fund, f.t) : null; }
// velas en bruto → historial listo para probar reglas (con rasgos, fuerza relativa, régimen de BTC, termómetro y señal de los mejores)
export async function construirH(raw, tick, opt = {}) {
  const H = { m: {} }, esperadas = raw.paginas * 1000, cob = opt.cobertura ?? 0.85;
  for (const [m, c0] of Object.entries(raw.m || {})) { if (!c0 || c0.length < esperadas * cob || !tick[m]) continue; const c = opt.rellenar ? rellenar(c0) : c0; H.m[m] = { c, f: rasgos(c), sp: tick[m].sp, slip: deslizamiento(tick[m].vq) }; }
  rankear(Object.fromEntries(Object.entries(H.m).map(([m, x]) => [m, x.f])));
  { const B = H.m["BTC-EUR"], R = new Map(); if (B) B.f.forEach((f) => { if (f) R.set(f.t, f.m240 > 0 && f.sobre200 ? 1 : 0); }); for (const x of Object.values(H.m)) for (const f of x.f) if (f) f.reg = R.has(f.t) ? R.get(f.t) : null; }
  if (opt.termo) for (const x of Object.values(H.m)) for (const f of x.f) ponTermometro(f, opt.termo);
  // historial de la señal de los mejores (cada 10 min, 7 días) → rasgo de cada vela para la IA y las reglas (el bot de cada minuto lo va anotando)
  try { let hh = null; try { hh = await leer("hl-hist.json", RAMA_H); } catch (e) {} hh = hh || {};
    for (const [m, x] of Object.entries(H.m)) { const se = hh[m.replace("-EUR", "")]; for (const f of x.f) if (f) { f.smart = HLm.enMomento(se, f.t); const s1 = HLm.enMomento(se, f.t - 3600e3); f.smartD = f.smart != null && s1 != null ? f.smart - s1 : null; } } } catch (e) { console.log("Bitvavo: historial de los mejores: " + e.message); }
  return H;
}
export async function cargarHist(hm, tick, paginas = 4, S = null, now = new Date(), hilos = 6, opt = {}) { void S; void now; return construirH(await descargar(hm, paginas, hilos, opt.ritmo || 0), tick, opt); }
// precios de todo (una petición) → tick y los mercados líquidos ordenados por volumen
// v354 · el bot ficticio de cripto ya no decide nada (el dinero real solo sigue a las Tortugas): sus líneas de estado salen cada 30 min, no cada minuto
const soloTortugasRuido = (now) => process.env.SOLO_TORT === "0" || now.getUTCMinutes() % 30 === 0;
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
  // v295 · sin contraseña NUNCA se publica nada privado: se quitan el dinero real y la conexión con los exchanges
  if (!PW()) { const { real, conex, ...pub } = S; void real; void conex; publicar("bitvavo.json", pub, RAMA); return; }
  const enc = await encrypt(JSON.stringify(S), PW());
  const cx = S.conex ? Object.fromEntries(["bitvavo", "okx"].map((k) => [k, S.conex[k] ? S.conex[k].estado : null])) : null; if (cx && S.conex) cx.cod = Object.fromEntries(["bitvavo", "okx"].map((k) => { const t = String((S.conex[k] && S.conex[k].txt) || ""), m = t.match(/código (\w+)/) || t.match(/\b(\d{3,5})\b/); return [k, m ? m[1] : null]; })); if (cx && S.conex) cx.diag = Object.assign({}, ...["bitvavo", "okx"].map((k) => (S.conex[k] && S.conex[k].diag) || {})); if (cx && S.conex) cx.tiene = Object.assign({}, ...["bitvavo", "okx"].map((k) => (S.conex[k] && S.conex[k].tiene) || {}));   /* solo si hay clave y si funciona: nunca importes */
  publicar("bitvavo.json", { enc: 1, v: 1, ...enc, meta: { t: S.last, vivo: 1, seg: S.diag ? S.diag.seg : null, conex: cx } }, RAMA);
}

// v341 · 🖥️ histórico del terminal (48 h, hasta 12 000 líneas); si no se puede leer o descifrar el que hay, NO se pisa (se reintenta en la siguiente)
export function mezclaTerminal(L, pend, ahora, horas = 48, max = 12000) {
  const out = Array.isArray(L) ? L.slice() : [];
  for (const [t, x] of pend) { let hit = null; for (let k = out.length - 1; k >= Math.max(0, out.length - 80); k--) if (out[k][1] === x && new Date(out[k][0]).toDateString() === new Date(t).toDateString()) { hit = out[k]; break; } if (hit) { hit[0] = Math.max(hit[0], t); hit[2] = (hit[2] || 1) + 1; } else out.push([t, x, 1]); }
  out.sort((a, b) => a[0] - b[0]); return out.filter((l) => l[0] >= ahora - horas * 3600e3).slice(-max);
}
async function guardaTerminal(pend, ahora) {
  const j = await leer("terminal.json", "terminal-cripto"); let L = [];
  if (j && j.enc) { const o = await openAny(j, PWS()); if (o.error) throw new Error("no se pudo descifrar"); L = (o.j && o.j.l) || []; } else if (j) throw new Error("formato desconocido");
  const l = mezclaTerminal(L, pend, ahora); publicar("terminal.json", { enc: 1, v: 1, ...(await encrypt(JSON.stringify({ v: 1, l }), PW())), meta: { t: new Date(ahora).toISOString(), n: l.length } }, "terminal-cripto"); return [];
}
// v302 · 🖥️ TERMINAL: todo lo que el bot escribe en cada vuelta se guarda (cifrado, con el resto del estado) para verlo en la app como una terminal
const CONSOLA = []; { const _log = console.log; console.log = (...a) => { _log(...a); try { CONSOLA.push([Date.now(), a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ").slice(0, 600)]); } catch (e) {} }; }
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
  const HF = {}, F = {}, LAT = {}, VEL = {}, quiero = [...new Set([...U, ...Object.keys(S.pos), ...SUBS.flatMap((k) => Object.keys(S.sub[k].pos)), ...Object.values(S.rejs).flatMap((r) => Object.keys((r && r.g) || {}))])];
  await enParalelo(quiero, 8, async (m) => { try { const c0 = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 2)), c = c0.length && c0[c0.length - 1][0] + 300e3 > Date.now() ? c0.slice(0, -1) : c0; const f = rasgos(c); F[m] = f[f.length - 1]; HF[m] = f.slice(-288); LAT[m] = REJ.lateral(c); VEL[m] = c.slice(-12); /* v222 · solo velas CERRADAS (igual que en las pruebas): la vela en curso engañaba al volumen y al impulso */ } catch (e) { S.err = String(e.message).slice(0, 60); } });
  { const vs = Object.values(F).filter(Boolean).sort((x, y) => y.m240 - x.m240); vs.forEach((f, i) => { f.rk = vs.length > 4 ? i / (vs.length - 1) : null; }); }
  // 👑 lo que hacen ahora los mejores traders de Hyperliquid
  try { S.hl = await HLm.actualizar(S.hl, now); } catch (e) {}
  const hlFresco = !!(S.hl && S.hl.at && now.getTime() - S.hl.at < 30 * 60e3);   // v295 · señal de Hyperliquid de hace más de 30 min: no se usa ni se anota
  { const sn = (hlFresco && S.hl.snap) || {}, pv = (hlFresco && HLm.hace(S.hl, S.hl.at || now.getTime(), 3600e3)) || {};   /* v228 · cambio en 1 h (como en las pruebas), no en 3 min */ for (const [m, f] of Object.entries(F)) if (f) { const c = m.replace("-EUR", ""); f.smart = sn[c] ? sn[c].s : null; f.smartD = sn[c] && pv[c] ? sn[c].s - pv[c].s : null; } }
  { const b = F["BTC-EUR"], reg = b ? (b.m240 > 0 && b.sobre200 ? 1 : 0) : null; for (const f of Object.values(F)) if (f) f.reg = reg; S.regimen = reg; }
  // v245 · 🌡️ termómetro del mercado ahora (miedo/codicia y financiación de BTC), cada 30 min; igual que en las pruebas
  if (!S.termo || now - S.termo.t > 30 * 60000) try { const TM = await termometro(2); if (TM.fg || TM.fund) S.termo = { t: TM.t, fg: TM.fg ? TM.fg.slice(-3) : (S.termo && S.termo.fg) || null, fund: TM.fund ? TM.fund.slice(-3) : (S.termo && S.termo.fund) || null }; } catch (e) {}
  if (S.termo && now - S.termo.t < 48 * 3600e3) for (const f of Object.values(F)) ponTermometro(f, S.termo);   // v295 · un termómetro de hace más de 2 días no se usa
  if (S.iaM) for (const f of Object.values(F)) if (f) f.ia = predecir(S.iaM, vector(f));
  // v257 · 🧬 votos del comité para el método «consenso» (las reglas en uso de los 4 métodos, igual que en el laboratorio)
  // v291 · el comité del Consenso solo vota con reglas VALIDADAS (no las que están en práctica)
  const comiteGs = (lista) => lista.map((k) => { const C = k === "eq" ? S : S.sub && S.sub[k]; return C && C.genome && !C.prueba ? { ...BASE, ...C.genome } : null; }).filter(Boolean);
  const votar = (FF, gs) => { for (const f of Object.values(FF)) if (f) { let v = 0; for (const g of gs) if (entra(g, f)) v++; f.votos = v; } };
  votar(F, comiteGs(COMITE));
  paso(S, tick, F, now);
  let FO = Object.fromEntries(Object.entries(F).filter(([m]) => enOkx(OKX, m)).map(([m, f]) => [m, f ? { ...f } : f]));
  // v287 · 🟦 OKX CON SUS PROPIOS OJOS: los métodos de OKX miran las velas y los precios DE OKX y TODAS sus criptos (no solo las que comparte con Bitvavo)
  let tickO = tick, tickOkxReal = null; const HFO = {};   // v295 · el dinero real de OKX SOLO con precios de OKX (del par con el que opera); sin ellos, ese minuto no opera
  if (okxI || OKX) try { const OK = await import("./okx.mjs"), fs = await import("node:fs"), I = okxI || (okxI = await OK.instrumentos()), PO = await OK.preciosOkx(I); tickOkxReal = PO.tickEx && Object.keys(PO.tickEx).length ? PO.tickEx : null;   /* v297 · basta con que haya precio de OKX (cada operación exige el suyo) */
    const cand = Object.keys(PO.tick).filter((m) => PO.tick[m].vq >= MIN_VOL / 2 && PO.tick[m].sp < 0.012).sort((a, b) => PO.tick[b].vq - PO.tick[a].vq).slice(0, 60);
    const abiertas = SUBS.filter((k) => PERF[k].soloOkx).flatMap((k) => Object.keys(S.sub[k].pos || {})).filter((m) => PO.tick[m]);
    const CF = "/tmp/okx-velas.json"; let cache = {}; try { cache = JSON.parse(fs.readFileSync(CF, "utf8")); } catch (e) {}
    const FO2 = {}; let ok = 0;
    await enParalelo([...new Set([...cand, ...abiertas])], 6, async (m) => { if (Date.now() - t0 > 40e3) return; try { const t = PO.tick[m], c0 = await OK.velasOkx(t.par, t.k, cache), c = c0.length && c0[c0.length - 1][0] + 300e3 > Date.now() ? c0.slice(0, -1) : c0; if (c.length < 320) return;
      const f = rasgos(c); FO2[m] = f[f.length - 1]; HFO[m] = f.slice(-288); ok++; } catch (e) {} });
    try { fs.writeFileSync(CF, JSON.stringify(cache)); } catch (e) {}
    if (ok >= 10) { const sn = (hlFresco && S.hl.snap) || {}, pv = (hlFresco && HLm.hace(S.hl, S.hl.at || now.getTime(), 3600e3)) || {};
      const vs = Object.values(FO2).filter(Boolean).sort((x, y) => y.m240 - x.m240); vs.forEach((f, i) => { f.rk = vs.length > 4 ? i / (vs.length - 1) : null; });
      for (const [m, f] of Object.entries(FO2)) if (f) { const c = m.replace("-EUR", ""); f.smart = sn[c] ? sn[c].s : null; f.smartD = sn[c] && pv[c] ? sn[c].s - pv[c].s : null; f.reg = S.regimen; if (S.termo) ponTermometro(f, S.termo); if (S.iaM) f.ia = predecir(S.iaM, vector(f)); }
      FO = FO2; tickO = { ...tick, ...PO.tick }; S.okxVivo = { t: now.toISOString(), n: ok, solo: Object.keys(FO2).filter((m) => !tick[m]).length }; }
    console.log(`OKX con sus datos: ${ok} criptos con velas de OKX (${S.okxVivo ? S.okxVivo.solo : 0} que no están en Bitvavo)`);
  } catch (e) { console.log("OKX con sus datos: " + String(e.message).slice(0, 60) + " (sigue con los de Bitvavo)"); }
  votar(FO, comiteGs(COMITE_OKX));   // v291 · solo reglas validadas
  if (!S.dbg24 || now - Date.parse(S.dbg24) > 15 * 60000) { S.dbg24 = now.toISOString();   // v273 · diagnóstico: señales que habría dado cada método en las últimas 24 h con los datos de ahora
    const bt = HF["BTC-EUR"] || [], regAt = new Map(bt.filter(Boolean).map((f) => [f.t, f.m240 > 0 && f.sobre200 ? 1 : 0])), TMx = S.termo;
    for (const fs of Object.values(HF)) for (const f of fs) if (f) { f.reg = regAt.has(f.t) ? regAt.get(f.t) : null; if (TMx) { f.fg = TMx.fg && TMx.fg.length ? TMx.fg[TMx.fg.length - 1][1] : null; f.fund = TMx.fund && TMx.fund.length ? TMx.fund[TMx.fund.length - 1][1] : null; } if (S.iaM) f.ia = predecir(S.iaM, vector(f)); }
    // v278 · 🧪 práctica: de sus 20 mejores candidatas que no pierden, la que MÁS señales habría dado en las últimas 24 h con el mercado de AHORA
    for (const k of SUBS) { const C = S.sub[k]; if (!C || !C.prueba) { if (C) delete C.practG; continue; }
      const n = (v) => (v.a ? v.a.n : 0) + (v.b ? v.b.n : 0) + (v.c ? v.c.n : 0), med = (v) => ((v.a ? v.a.med * v.a.n : 0) + (v.b ? v.b.med * v.b.n : 0) + (v.c ? v.c.med * v.c.n : 0)) / Math.max(1, n(v));
      const cands = ((C.lab && C.lab.pop) || []).filter((v) => v.g && v.a && v.b && v.c && n(v) > 0 && med(v) > -0.15).sort((a, b) => b.s - a.s).slice(0, 20); if (!cands.length) continue;
      const HX = PERF[k].soloOkx && Object.keys(HFO).length ? HFO : HF, ms = Object.keys(HX).filter((m) => !PERF[k].soloOkx || HX === HFO || enOkx(OKX, m)); let best = null, bn = -1;   // v287 · OKX: sus propias velas
      for (const v of cands) { const g = { ...BASE, ...v.g }; let c = 0; for (const m of ms) { for (const f of HX[m]) if (f && entra(g, f)) { c++; if (c > 300) break; } } if (c > bn) { bn = c; best = v; } }
      if (best) { C.practG = best.g; C.practAt = now.toISOString(); C.practN = bn; } }
    console.log(`Señales en 24 h (fg ${TMx && TMx.fg ? TMx.fg[TMx.fg.length - 1][1] : "?"}, fund ${TMx && TMx.fund ? TMx.fund[TMx.fund.length - 1][1] : "?"}):` + SUBS.concat(["eq"]).map((k) => { const C = k === "eq" ? S : S.sub[k], g = { ...BASE, ...C.genome, ...((C.prueba && reglaPractica(C)) || {}) }, ms = Object.keys(HF).filter((m) => !PERF[k] || !PERF[k].soloOkx || enOkx(OKX, m)); let n = 0; for (const m of ms) for (const f of HF[m]) if (f && entra(g, f)) n++; return ` ${k} ${n}`; }).join(",")); }
  { if (soloTortugasRuido(now)) console.log(`Señales ahora (OKX: ${OKX ? OKX.size : "SIN LISTA"} criptos, ${Object.keys(FO).length} con datos):` + SUBS.map((k) => { const C = S.sub[k], g = { ...BASE, ...C.genome, ...((C.prueba && reglaPractica(C)) || {}) }, FF = PERF[k].soloOkx ? FO : F; return ` ${k} ${Object.values(FF).filter((f) => f && entra(g, f)).length}${C.prueba ? "🧪" : "⭐"}`; }).join(",")); }
  for (const k of SUBS) paso(S.sub[k], PERF[k].soloOkx ? tickO : tick, PERF[k].soloOkx ? FO : F, now);
  // v224/v225 · cobrar financiación y rejilla: tres submodos cada uno, con sus propios 100 € ficticios
  // v271 · «Cobrar financiación» y «Rejilla» QUITADOS (no aportaban; necesitaban futuros o perdían): el código queda, pero ya no se ejecuta
  if (false) { const u = T.find((x) => x.market === "USDC-EUR"), ue = u ? +u.last || (+u.bid + +u.ask) / 2 : 0;
    try { const D = await FIN.datos(S.finD, tick, now, fetch, Object.values(S.fins).flatMap((f) => Object.keys((f && f.pos) || {})));
      if (D.series) for (const k of Object.keys(FIN.PERF)) try { const ti = Date.now(), A = FIN.aprender(D.series, (c) => (tick[FIN.moneda(c) + "-EUR"] || {}).sp || 0.003, k); A.seg = Math.round((Date.now() - ti) / 1000); S.fins[k] = S.fins[k] || FIN.fresh(now); S.fins[k].apr = A; } catch (e) { console.log("Financiación (aprender): " + String(e.message).slice(0, 80)); }
      delete D.series;
      for (const k of Object.keys(FIN.PERF)) S.fins[k] = FIN.vuelta(S.fins[k], D, tick, ue, now, FIN.PERF[k]); S.finD = { fr: D.fr, frAt: D.frAt, err: D.err || null }; } catch (e) { console.log("Financiación: " + String(e.message).slice(0, 80)); }
    for (const k of Object.keys(REJ.PERF)) try { S.rejs[k] = REJ.vuelta(S.rejs[k], tick, LAT, now, REJ.PERF[k], VEL); } catch (e) { console.log("Rejilla: " + String(e.message).slice(0, 80)); } }
  // 👑 apunta la señal de los mejores cada 10 min (7 días) para que la IA y las reglas aprendan de ella
  if (hlFresco && (!S.hlAnotAt || now - S.hlAnotAt >= 10 * 60000)) try { let hh = null; try { hh = await leer("hl-hist.json", RAMA_H); } catch (e) {} hh = HLm.anotar(hh, S.hl && S.hl.snap, now.getTime()); publicar("hl-hist.json", hh, RAMA_H); S.hlHist = Object.keys(hh).length; S.hlAnotAt = now.getTime(); } catch (e) { console.log("Bitvavo: historial de los mejores: " + e.message); }
  // v227 · 🚀 LABORATORIO DEDICADO: tres procesos en la nube (uno por submodo) que prueban reglas SIN PARAR con 30 días de datos.
  // Cada 3 min se recoge lo que han demostrado (reglas, IA y escalones de rejilla). Si el laboratorio se para, este bot vuelve a aprender solo.
  if (!S.labAt || now - S.labAt >= 3 * 60000) { S.labAt = now.getTime();
    for (const k of ["eq", ...SUBS]) try { const Lb = await leer(`lab-${k}.json`, `bitvavo-lab-${k}`); if (!Lb || now - Date.parse(Lb.t) > 30 * 60000) continue;
      const C = k === "eq" ? S : S.sub[k], antes = { gid: C.genomeId, pr: C.prueba, gen: C.lab && C.lab.gen };
      Object.assign(C, { lab: Lb.lab, genome: Lb.genome, genomeId: Lb.genomeId, prueba: Lb.prueba, labInfo: Lb.info });
      // v304 · 🧠 la terminal cuenta lo que APRENDE cada laboratorio: generaciones, mejor candidata, cambios de regla y si gana o no
      { const pop = (Lb.lab && Lb.lab.pop) || [], best = pop.slice().sort((a, b) => (b.s || 0) - (a.s || 0))[0], okN = pop.filter((v) => v.ok).length, g = (Lb.lab && Lb.lab.gen) || 0;
        if (antes.gid !== Lb.genomeId && antes.gid) console.log(`🧠 ${k}: CAMBIA de regla → ${Lb.prueba ? "ninguna gana el examen (practica)" : "nueva regla ganadora («" + ((Lb.genome && Lb.genome.estilo) || "?") + "»)"}`);
        else if (antes.pr !== Lb.prueba && antes.pr != null) console.log(`🧠 ${k}: ${Lb.prueba ? "su regla deja de ganar el examen → practica" : "¡encuentra regla ganadora! («" + ((Lb.genome && Lb.genome.estilo) || "?") + "»)"}`);
        if (g && g !== antes.gen) console.log(`🧠 ${k}: generación ${g} · ${pop.length} candidatas, ${okN} aprueban los 90 días · mejor «${(best && best.g && best.g.estilo) || "?"}» nota ${best ? Math.round(best.s * 100) / 100 : "-"}${best && best.a ? ` (tramos ${[best.a, best.b, best.c].map((x) => (x ? x.med : "-")).join(" / ")} % por operación)` : ""}`); }
      if (k === "eq") { if (Lb.iaM) { S.iaM = Lb.iaM; S.ia = Lb.ia; } for (const [r, a] of Object.entries(Lb.rej || {})) if (S.rejs[r]) { S.rejs[r].apr = a; S.rejs[r].aprAt = Lb.t; } S.labFresh = Lb.t; } } catch (e) { console.log("Laboratorio " + k + ": " + String(e.message).slice(0, 60)); } }
  const labVivo = S.labFresh && now - Date.parse(S.labFresh) < 30 * 60000;
  // 3) si no hay laboratorio dedicado: generación propia cada 15 min
  let H = null;
  if (!labVivo && (!S.lab.lastGen || !(now - Date.parse(S.lab.lastGen) < GEN_MIN * 60000 && now - Date.parse(S.lab.lastGen) >= 0))) {
    H = await cargarHist(U.slice(0, HIST_MKT), tick, 4, S, now, 6, { termo: await termometro(15).catch(() => null) });
    try { const ti = Date.now(), IA = entrenarIA(H); S.iaM = IA.listo ? IA.modelo : null; delete IA.modelo; S.ia = { ...IA, seg: Math.round((Date.now() - ti) / 1000) }; if (IA.listo) L(S, now, "INFO", "", `🧠 IA reentrenada con ${IA.n} momentos: con días que no ha visto ordena bien subidas y caídas ${Math.round(IA.auc * 100)} de cada 100`); } catch (e) { S.ia = { listo: false, err: String(e.message).slice(0, 60) }; }
    if (false && Object.keys(H.m).length >= 10) for (const k of Object.keys(REJ.PERF)) try { const R0 = S.rejs[k]; if (!R0) continue; const ti = Date.now(); R0.apr = REJ.aprender(H, REJ.PERF[k]); R0.aprAt = now.toISOString(); R0.aprSeg = Math.round((Date.now() - ti) / 1000); } catch (e) { console.log("Rejilla (aprender): " + String(e.message).slice(0, 80)); }
    // v228 · por turnos (equilibrado → turbo → IA + los mejores): cada generación examina un submodo para no pasar nunca de ~75 s
    if (Object.keys(H.m).length >= 10 && Date.now() - t0 < 60e3) { const PR = +process.env.BV_PRISA || 1, ks = ["eq", ...SUBS.filter((x) => !PERF[x].fijoTotal)], k = ks[(S.labTurno = ((S.labTurno || 0) + 1) % ks.length)], C = k === "eq" ? S : S.sub[k];
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
    // v258 · 🔕 Telegram sin ruido: ya no avisa de cada regla nueva ni de cada buena operación en ficticio. Solo cuando un método pasa a ser
    // ⭐⭐ MUY BUENO (gana ≥ 0,6 % por operación en los tres tramos de 90 días, con ≥ 30 operaciones en cada uno), como mucho una vez al día por método.
    const AV = await import("./avisos.mjs"), RL0 = await import("./bitvavo-real.mjs"); S.av = S.av || {}; const msgs = [];
    // v272 · 🔄 rotación de los 6 visibles (solo entra un 💎 que supere claramente al peor) + aviso SOLO de lo muy bueno
    { const fu = { eq: S, ...S.sub }, notas = {}, muyE = (k) => { const v = RL0.reglaEnUso(fu[k]), dd = S.muyDesde && S.muyDesde[k]; return !!(v && RL0.esMuy(v) && dd && now - Date.parse(dd) >= RL0.MUY_ESTABLE_MS); };
      for (const k of ["eq", ...SUBS]) { const v = RL0.reglaEnUso(fu[k]); notas[k] = v ? +v.s : null; }
      for (const m of rotar(S, now, notas, muyE)) msgs.push(m);
      for (const k of ["eq", ...SUBS]) { if (!muyE(k)) continue; const v = RL0.reglaEnUso(fu[k]), t3 = [v.a, v.b, v.c].map((x) => `${x.med >= 0 ? "+" : ""}${x.med} % en ${x.n} ops`).join(" · "), m = AV.avisoReglas(S.av, "bv-muy:" + k, `💎 ${PERF[k].nombre} es MUY BUENO\n• Examen de 90 días (por operación, con comisiones y deslizamiento): ${t3}${S.visibles && !Object.values(S.visibles).flat().includes(k) ? "\n• Aún no está entre los 6: entrará si supera claramente al peor." : "\n• Si tu cuenta real está en 🤖 Automático, ya lo sigue."}`, now); if (m) msgs.push(m); } }
    // v238 · 📊 resumen diario por Telegram (21:00 en España): como los datos van cifrados, así te llegan los números sin abrir la app
    { const hES = +now.toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }), dES = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      if (hES >= 21 && S.resumenDia !== dES) { S.resumenDia = dES; const f = (n, C) => { if (!C) return null; const cl = C.closed || [], w = cl.filter((c) => c.pnl > 0).length; return `• ${n}: ${r2(C.lastEq)} € (${C.lastEq >= (C.start || 100) ? "+" : ""}${r2((C.lastEq / (C.start || 100) - 1) * 100)} %) · ${cl.length} cerradas (${w} G / ${cl.length - w} P)${C.prueba === true ? " · sin regla ganadora" : C.prueba === false ? " · 🏆 regla ganadora" : ""}`; };
        const L2 = [`📊 Cripto · resumen del día (dinero ficticio, 100 € por submodo)`, "🧠 IA y laboratorio", f("⚖️ Equilibrado", S), ...SUBS.map((k) => f(PERF[k].nombre, S.sub[k])), ...[], "Rejilla", ...Object.entries(S.rejs).map(([k, X]) => f(REJ.PERF[k].nombre, X)), `🧠 IA de predicción: acierta ${S.ia && S.ia.auc ? Math.round(S.ia.auc * 100) : "—"} de cada 100`].filter(Boolean);
        msgs.unshift(L2.join("\n")); } }
    // v313 · 🔕 Telegram SOLO del dinero real: los métodos/laboratorios ficticios ya no avisan (aprenden en silencio)
    void msgs;
  } catch (e) { console.log("Bitvavo: avisos no enviados"); }
  // v233 · 💶 dinero real (50 €) copiando al submodo elegido; sin clave de Bitvavo no hace nada
  /* solo si queda tiempo de sobra en esta vuelta: así nunca se corta a medias entre una orden real y el guardado */
  if (!S.base || now - S.base.t > 60 * 60e3) try { const T = await tendenciaBase(S.base); if (T) S.base = T; } catch (e) { console.log("Cartera base: sin velas diarias (" + String(e.message).slice(0, 40) + ")"); }   // v301 · cada hora
  // v316 · 🧪🐋 HYPERLIQUID en directo con dinero FICTICIO: el método que aprobó la caza (cada 5 min y al empezar cada hora)
  if (Date.now() - t0 < 40e3 && (!S.hlp || now - S.hlp.t >= 5 * 60e3 || Math.floor(now / 3600e3) * 3600e3 !== S.hlp.ultHora)) try { const HP = await import("./hl-momento.mjs"); S.hlp = await HP.paso(S.hlp, now.getTime(), fetch, (x) => console.log(x)); const z = HP.resumen(S.hlp); if (z && (!S.hlpLogAt || now - S.hlpLogAt >= 3600e3)) { S.hlpLogAt = now.getTime(); console.log(`🧪🐋 Hyperliquid (ficticio): ${z.pc >= 0 ? "+" : ""}${z.pc} % en ${z.dias} días · ${z.ops} operaciones (${z.opsDia}/día) · ${z.aciertos} % aciertos · abiertas ${z.abiertas.length}`); } } catch (e) { console.log("🧪🐋 Hyperliquid (ficticio): " + String(e.message).slice(0, 60)); }
  // v304 · 🐢 TORTUGAS: señales diarias de las 20 criptos más líquidas de CADA exchange (con sus velas); se recalculan al cerrar el día (o cada 6 h)
  S.tort = S.tort || {}; const hoyT = new Date().toISOString().slice(0, 10);
  // v318 · 🎚️ las reglas aprendidas de cada perfil de riesgo (se leen cada 30 min; si cambian, se recalculan las señales enseguida)
  if (!S.tortELat || now - S.tortELat >= 30 * 60e3) try { const EL = await leer("examen-largo.json", "examen-largo"); S.tortELat = now.getTime(); if (EL && EL.tortugas) S.tortP = Object.fromEntries(["bitvavo", "okx"].map((ex) => { const T = EL.tortugas[ex] || {}; return [ex, Object.fromEntries(["bajo", "medio", "alto"].map((rk) => [rk, (T.perfiles && T.perfiles[rk] && T.perfiles[rk].P) || (rk === "medio" ? T.P : null) || null]))]; })); } catch (e) {}
  // v320 · 🌍 TODAS las criptos líquidas (hasta 150 por exchange): las velas se piden POR TANDAS (unas 25 por minuto) y al terminar se cambian las señales
  S.tortJob = S.tortJob || {};
  for (const ex of ["bitvavo", "okx"]) { const T0 = S.tort[ex], PS = (S.tortP && S.tortP[ex]) || { medio: null }, clave = JSON.stringify(PS); if (Date.now() - t0 > 35e3) break;
    let J = S.tortJob[ex]; const toca = !(T0 && T0.dia === hoyT && now - T0.t < 6 * 3600e3 && T0.clave === clave);
    if (!J && !toca) continue;
    try { const TT = await import("./tortugas.mjs");
      if (!J || J.clave !== clave || now - J.t0 > 2 * 3600e3) { let lista = [];
        if (ex === "bitvavo") lista = TT.universo(tick).map(([m]) => ({ m })); else if (tickOkxReal) lista = TT.universo(tickOkxReal).map(([m, x]) => ({ m, par: x.par, k: x.k }));
        if (!lista.length) continue; const Ps = Object.fromEntries(Object.entries(PS).map(([rk, P]) => [rk, TT.conP(P)]));
        J = S.tortJob[ex] = { t0: now.getTime(), clave, lista, i: 0, Ps, dias: Math.max(90, ...Object.values(Ps).map((P) => Math.max(P.ent + 30, (P.filtro ? P.mFil : 0) + 30))), per: Object.fromEntries(Object.keys(Ps).map((rk) => [rk, { P: Ps[rk], sen: {} }])) }; }
      const fin = Date.now() + 15e3; while (J.i < J.lista.length && Date.now() < fin) { const { m, par, k } = J.lista[J.i++]; try { const d = await TT.diarias(ex, m, J.dias, par, k || 1); for (const rk of Object.keys(J.Ps)) { const x = TT.senal(d, J.Ps[rk]); if (x) J.per[rk].sen[m] = x; } } catch (e) {} }
      if (J.i >= J.lista.length) { delete S.tortJob[ex]; const per = J.per, M = per.medio || Object.values(per)[0];
        if (M && Object.keys(M.sen).length >= 5) { S.tort[ex] = { t: now.getTime(), dia: hoyT, clave, sen: M.sen, P: M.P, perfiles: per };
          console.log(`🐢 Tortugas ${ex}: ${Object.keys(M.sen).length} criptos vigiladas · ` + Object.entries(per).map(([rk, x]) => { const en = Object.entries(x.sen).filter(([, y]) => y.entra).map(([mm]) => mm.split("-")[0]); return `${TT.perfil(rk).nombre}: ${en.length ? en.slice(0, 12).join(", ") + (en.length > 12 ? ` y ${en.length - 12} más` : "") : "ninguna"}`; }).join(" · ")); } } }
    catch (e) { console.log(`🐢 Tortugas ${ex}: sin velas diarias (${String(e.message).slice(0, 40)})`); } }
  // v306 · 🐋 COPIA A LOS PROFESIONALES: los mejores traders de Hyperliquid (cuentas > 500.000 $ que ganan este mes y en total).
  // Si la mayoría de su dinero está COMPRADO en una cripto (≥ 60 %, al menos 4 de ellos) y además están metiendo más (sube en la última hora), es señal.
  if (hlFresco && S.hl && S.hl.snap) { const pv = HLm.hace(S.hl, S.hl.at || now.getTime(), 3600e3) || {}, m = {};
    for (const [c, x] of Object.entries(S.hl.snap)) { const d = pv[c] ? x.s - pv[c].s : 0; m[c + "-EUR"] = { s: x.s, nl: x.nl, ns: x.ns, d: Math.round(d * 1000) / 1000, entra: x.s >= 0.6 && x.nl >= 4 && d >= 0.05, sale: x.s < 0.2 }; }
    S.ballenas = { t: now.getTime(), m }; const en = Object.entries(m).filter(([, x]) => x.entra).map(([k]) => k.split("-")[0]);
    console.log(`🐋 Profesionales de Hyperliquid: ${Object.keys(m).length} criptos seguidas · están comprando fuerte: ${en.length ? en.join(", ") : "ninguna ahora"}`); }
  if (S.base) console.log("Cartera base: " + Object.entries(S.base.m).map(([m, T]) => `${m.split("-")[0]} ${T.up ? "📈 por encima" : "📉 por debajo"} de su media de 50 días (${Math.round((T.px / T.sma - 1) * 1000) / 10} %)`).join(" · "));
  if (Date.now() - t0 < 55e3) try { const RL = await import("./bitvavo-real.mjs"), AV = await import("./avisos.mjs"); await RL.paso(S, tick, now, { leer, publicar, tg: AV.tg, okxI, tickOkx: tickOkxReal }); } catch (e) { console.log("Real: error"); } else console.log("Real: vuelta larga, espera a la siguiente");
  if (soloTortugasRuido(now)) console.log(`Submodos IA: ${SUBS.map((k) => k + " " + S.sub[k].lastEq + " € (" + S.sub[k].st.trades + " op, " + Object.keys(S.sub[k].pos).length + " abiertas, " + (S.sub[k].prueba ? "sin ventaja" : "gana") + ")").join(" · ")}`);
  if (soloTortugasRuido(now)) console.log(`Bitvavo: ${U.length} mercados · saldo ${S.lastEq} € · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades} · gen ${S.lab.gen} · ${S.diag.seg} s`);
  // v302 · 🖥️ terminal: una línea que se repite igual (mismo texto) no se duplica: se actualiza su hora y cuántas veces lleva así
  { const C = S.consola || [], NUEVAS = CONSOLA.splice(0); S.termPend = PW() ? (S.termPend || []).concat(NUEVAS).slice(-4000) : []; for (const [t, x] of NUEVAS) { let hit = null; for (let k = C.length - 1; k >= Math.max(0, C.length - 60); k--) if (C[k][1] === x) { hit = C[k]; break; } if (hit) { hit[0] = t; hit[2] = (hit[2] || 1) + 1; } else C.push([t, x, 1]); } S.consola = C.slice(-500); }
  // v341 · 🖥️ TERMINAL LARGO: cada 5 min, lo nuevo se añade (cifrado) a terminal.json en su propia rama, con las últimas 48 h; la app lo lee en la pestaña Terminal
  if (PW() && S.termPend.length && (!S.termAt || now - S.termAt >= 5 * 60e3) && Date.now() - t0 < 75e3) try { S.termPend = await guardaTerminal(S.termPend, now.getTime()); S.termAt = now.getTime(); } catch (e) { console.log("Terminal: no se pudo guardar el histórico (" + String(e.message || e).slice(0, 60) + ")"); }
  await publicarEstado(S);
}
export { main };
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Bitvavo: " + (e.message || e)); process.exit(0); });
