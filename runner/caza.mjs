// v314 · 🔎 CAZA DE MÉTODOS DE MUCHAS OPERACIONES: prueba cientos de estrategias (conocidas e inventadas) con un año de velas de 5 min
// de las criptos más líquidas, con las comisiones de Bitvavo y OKX. Para no engañarse:
//  · cada estrategia se juzga en los primeros 7 meses (ENTRENO) y solo cuenta si también gana en los 5 últimos (PRUEBA, que no se usan para elegir)
//  · se compara con «entradas al azar» para saber cuántas aprobarían solo por suerte
// Solo dinero ficticio. Resultado en la rama «caza» (caza.json): porcentajes y recuentos, nunca dinero real.
import { existsSync, readFileSync } from "node:fs";

export const FEES = { "Bitvavo (a mercado 0,25 %)": 0.0025, "Bitvavo (límite 0,15 %)": 0.0015, "OKX (a mercado 0,10 %)": 0.001, "OKX (límite 0,08 %)": 0.0008 };
export const SLIP = 0.0005, SLOTS = 4, CORTE = 7 / 12;

// ── velas ──────────────────────────────────────────────────────────────────────────────────────────────
export function agrupa(c5, min) { if (min === 5) return c5; const ms = min * 60e3, out = []; let cur = null;
  for (const [t, o, h, l, c, v] of c5) { const k = Math.floor(t / ms) * ms; if (!cur || cur[0] !== k) { if (cur) out.push(cur); cur = [k, o, h, l, c, v]; } else { cur[2] = Math.max(cur[2], h); cur[3] = Math.min(cur[3], l); cur[4] = c; cur[5] += v; } }
  if (cur) out.push(cur); return out; }
const ema = (x, n) => { const k = 2 / (n + 1), o = new Float64Array(x.length); let e = x[0]; for (let i = 0; i < x.length; i++) { e = i ? e + k * (x[i] - e) : x[i]; o[i] = e; } return o; };
const sma = (x, n) => { const o = new Float64Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; o[i] = i >= n - 1 ? s / n : NaN; } return o; };
const sd = (x, n, m) => { const o = new Float64Array(x.length); for (let i = n - 1; i < x.length; i++) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += (x[j] - m[i]) ** 2; o[i] = Math.sqrt(s / n); } return o; };
const rsi = (x, n) => { const o = new Float64Array(x.length), a = 1 / n; let g = 0, l = 0; for (let i = 1; i < x.length; i++) { const d = x[i] - x[i - 1]; g += a * (Math.max(d, 0) - g); l += a * (Math.max(-d, 0) - l); o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; };
const maxPrev = (x, n) => { const o = new Float64Array(x.length).fill(NaN); for (let i = n; i < x.length; i++) { let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, x[j]); o[i] = m; } return o; };
export function prepara(c) { const C = Float64Array.from(c, (x) => x[4]), H = Float64Array.from(c, (x) => x[2]), V = Float64Array.from(c, (x) => x[5]);
  const m20 = sma(C, 20); return { c, T: c.map((x) => x[0]), O: Float64Array.from(c, (x) => x[1]), H, L: Float64Array.from(c, (x) => x[3]), C, V, e200: ema(C, 200), e9: ema(C, 9), e21: ema(C, 21), e50: ema(C, 50), s5: sma(C, 5), m20, sd20: sd(C, 20, m20), r2: rsi(C, 2), r14: rsi(C, 14), v20: sma(V, 20), cache: {} }; }
const hiN = (d, n) => d.cache["h" + n] || (d.cache["h" + n] = maxPrev(d.H, n));

// ── simulación de una cripto: entra en la apertura de la vela siguiente a la señal; sale por objetivo, stop, tiempo o señal ─────────
// devuelve operaciones [t de entrada, t de salida, rentabilidad bruta]
export function opera(d, entra, X) { const out = [], n = d.C.length; let i = 210;
  while (i < n - 2) { if (!entra(d, i)) { i++; continue; } const j0 = i + 1, px = d.O[j0]; let j = j0, sal = null;
    for (; j < n && j <= j0 + X.max; j++) { if (X.sl && d.L[j] <= px * (1 - X.sl)) { sal = Math.min(d.O[j], px * (1 - X.sl)); break; } if (X.tp && d.H[j] >= px * (1 + X.tp)) { sal = Math.max(d.O[j], px * (1 + X.tp)); break; }
      if (X.sale && j > j0 && X.sale(d, j)) { sal = d.C[j]; break; } }
    if (sal == null) { j = Math.min(j, n - 1); sal = d.C[j]; } out.push([d.T[j0], d.T[j] + 1, sal / px - 1]); i = j + 1; }
  return out; }

// ── cartera: todas las criptos a la vez, como mucho 4 operaciones abiertas, cada una con 1/4 del dinero ───────────────────────
export function cartera(trades, fee, desde, hasta) { const ts = trades.filter((x) => x[0] >= desde && x[0] < hasta).sort((a, b) => a[0] - b[0]);
  let eq = 1, pico = 1, dd = 0, n = 0, gan = 0, gb = 0, pb = 0; const abiertas = [];
  for (const [t0, t1, g] of ts) { for (let k = abiertas.length - 1; k >= 0; k--) if (abiertas[k].t1 <= t0) { eq += abiertas[k].pnl; abiertas.splice(k, 1); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
    if (abiertas.length >= SLOTS) continue; const net = (1 + g) * (1 - fee) ** 2 * (1 - SLIP) ** 2 - 1, tam = eq / SLOTS, pnl = tam * net; abiertas.push({ t1, pnl }); n++; if (net > 0) { gan++; gb += pnl; } else pb -= pnl; }
  for (const a of abiertas) eq += a.pnl; pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico);
  const dias = Math.max(1, (hasta - desde) / 864e5); return { ret: Math.round((eq - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, n, opsDia: Math.round((n / dias) * 10) / 10, aciertos: n ? Math.round((gan / n) * 100) : 0, pf: pb > 0 ? Math.round((gb / pb) * 100) / 100 : gb > 0 ? 99 : 0 }; }
export const aprueba = (r) => r.opsDia >= 3 && r.ret > 0 && r.pf >= 1.15 && r.dd < 30;

// ── las estrategias (cada familia con su rejilla de parámetros) ─────────────────────────────────────────────────────────
export function familias() { const F = [];
  const salidas = [{ tp: 0.01, sl: 0.01, max: 24 }, { tp: 0.02, sl: 0.01, max: 48 }, { tp: 0.03, sl: 0.015, max: 96 }, { tp: 0.006, sl: 0.006, max: 12 }, { tp: 0.04, sl: 0.02, max: 144 }];
  for (const bar of [5, 15, 60]) {
    // A · ruptura con volumen (scalping de arranques)
    for (const N of [12, 24, 48]) for (const kv of [1, 2, 3]) for (const X of salidas) F.push({ fam: "ruptura con volumen", bar, p: { N, kv, ...X, max: X.max }, entra: (d, i) => d.C[i] > hiN(d, N)[i] && d.V[i] > kv * d.v20[i], X });
    // B · rebote de caída corta con tendencia (RSI 2)
    for (const r of [5, 10, 20]) for (const filtro of [true, false]) for (const X of [...salidas, { tp: 0, sl: 0.02, max: 24, sale: (d, j) => d.C[j] > d.s5[j] }]) F.push({ fam: "rebote RSI(2)", bar, p: { r, filtro, ...X, sale: !!X.sale }, entra: (d, i) => d.r2[i] < r && (!filtro || d.C[i] > d.e200[i]), X });
    // C · Bollinger: compra en la banda baja, vende en la media
    for (const k of [2, 2.5, 3]) for (const filtro of [true, false]) F.push({ fam: "Bollinger banda baja", bar, p: { k, filtro }, entra: (d, i) => d.C[i] < d.m20[i] - k * d.sd20[i] && (!filtro || d.C[i] > d.e200[i]), X: { tp: 0, sl: 0.03, max: 48, sale: (d, j) => d.C[j] >= d.m20[j] } });
    // D · cruces de medias rápidas
    for (const [a, b] of [["e9", "e21"], ["e21", "e50"], ["e9", "e50"]]) F.push({ fam: "cruce de medias", bar, p: { a, b }, entra: (d, i) => d[a][i] > d[b][i] && d[a][i - 1] <= d[b][i - 1], X: { tp: 0, sl: 0.03, max: 288, sale: (d, j) => d[a][j] < d[b][j] } });
    // E · caída brusca de una vela → rebote
    for (const x of [0.015, 0.025, 0.04]) for (const X of [{ tp: x / 2, sl: x, max: 12 }, { tp: x, sl: x, max: 24 }, { tp: x / 3, sl: x / 2, max: 6 }]) F.push({ fam: "rebote de vela roja grande", bar, p: { x, ...X }, entra: (d, i) => d.C[i] / d.O[i] - 1 < -x, X });
    // F · compresión de volatilidad y ruptura
    for (const N of [48, 96]) F.push({ fam: "compresión y ruptura", bar, p: { N }, entra: (d, i) => { if (i < N + 20) return false; const w = d.sd20[i] / d.m20[i]; let mn = Infinity; for (let j = i - N; j < i; j++) mn = Math.min(mn, d.sd20[j] / d.m20[j]); return w <= mn * 1.05 && d.C[i] > d.m20[i] + d.sd20[i]; }, X: { tp: 0.03, sl: 0.01, max: 96 } });
    // G · RSI(14) sobrevendido con giro
    for (const r of [25, 30]) F.push({ fam: "RSI(14) giro", bar, p: { r }, entra: (d, i) => d.r14[i - 1] < r && d.r14[i] >= r, X: { tp: 0.02, sl: 0.015, max: 48, sale: (d, j) => d.r14[j] > 60 } });
    // H · momento: 3 velas verdes seguidas con volumen (persecución)
    for (const kv of [1.5, 2.5]) F.push({ fam: "3 velas verdes con volumen", bar, p: { kv }, entra: (d, i) => d.C[i] > d.O[i] && d.C[i - 1] > d.O[i - 1] && d.C[i - 2] > d.O[i - 2] && d.V[i] > kv * d.v20[i], X: { tp: 0.015, sl: 0.01, max: 24 } });
  }
  // I · hora del día (inventada / estacionalidad): compra a la hora h (UTC) y vende n horas después
  for (let h = 0; h < 24; h++) for (const n of [1, 2, 4, 8]) F.push({ fam: "hora del día", bar: 60, p: { h, n }, entra: (d, i) => new Date(d.T[i] + 3600e3).getUTCHours() === h, X: { tp: 0, sl: 0, max: n - 1 } });
  return F; }

// ── familias de cartera (comparan criptos entre sí) ───────────────────────────────────────────────────────────────────
export function cruzadas(D, bar) { const out = [], ms = Object.keys(D), btc = D["BTC-EUR"];
  const tsAll = [...new Set(ms.flatMap((m) => D[m].T))].sort((a, b) => a - b), idx = Object.fromEntries(ms.map((m) => [m, new Map(D[m].T.map((t, i) => [t, i]))]));
  const ret = (m, t, L) => { const i = idx[m].get(t); if (i == null || i < L) return null; return D[m].C[i] / D[m].C[i - L] - 1; };
  const gen = (nombre, p, pick, H) => { const tr = []; for (let k = 210; k < tsAll.length - H - 1; k += H) { const t = tsAll[k], sel = pick(t); for (const m of sel) { const i = idx[m].get(t); if (i == null || i + 1 + H >= D[m].C.length) continue; tr.push([D[m].T[i + 1], D[m].T[i + H] + 1, D[m].C[i + H] / D[m].O[i + 1] - 1]); } } out.push({ fam: nombre, bar, p, tr }); };
  for (const L of [1, 4, 12, 48]) for (const H of [1, 4, 12]) for (const top of [1, 2]) {
    gen("las que más suben (momento)", { L, H, top }, (t) => ms.map((m) => [m, ret(m, t, L)]).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]).slice(0, top).map((x) => x[0]), H);
    gen("las que más bajan (rebote)", { L, H, top }, (t) => ms.map((m) => [m, ret(m, t, L)]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1]).slice(0, top).map((x) => x[0]), H); }
  // BTC tira y las demás aún no se han movido (retraso)
  if (btc) for (const x of [0.005, 0.01, 0.02]) for (const H of [1, 3, 6]) gen("BTC tira y las rezagadas siguen", { x, H }, (t) => { const rb = ret("BTC-EUR", t, 1); if (rb == null || rb < x) return []; return ms.filter((m) => m !== "BTC-EUR").map((m) => [m, ret(m, t, 1)]).filter((y) => y[1] != null && y[1] < rb / 3).sort((a, b) => a[1] - b[1]).slice(0, 2).map((y) => y[0]); }, H);
  return out; }

// v314 · RONDA 2: alrededor de las pistas de la ronda 1 (momento entre criptos y BTC tira) con filtros, y 400 reglas INVENTADAS al azar
export function ronda2(D, bar, rnd) { const out = [], ms = Object.keys(D), btc = D["BTC-EUR"];
  const tsAll = [...new Set(ms.flatMap((m) => D[m].T))].sort((a, b) => a - b), idx = Object.fromEntries(ms.map((m) => [m, new Map(D[m].T.map((t, i) => [t, i]))]));
  const ret = (m, t, L) => { const i = idx[m].get(t); if (i == null || i < L) return null; return D[m].C[i] / D[m].C[i - L] - 1; };
  const btcUp = (t) => { const i = btc && idx["BTC-EUR"].get(t); return i != null && btc.C[i] > btc.e50[i]; };
  const gen = (nombre, p, pick, H) => { const tr = []; for (let k = 210; k < tsAll.length - H - 1; k += H) { const t = tsAll[k], sel = pick(t); for (const m of sel) { const i = idx[m].get(t); if (i == null || i + 1 + H >= D[m].C.length) continue; tr.push([D[m].T[i + 1], D[m].T[i + H] + 1, D[m].C[i + H] / D[m].O[i + 1] - 1]); } } out.push({ fam: nombre, bar, p, tr }); };
  for (const L of [6, 12, 24, 48]) for (const H of [2, 4, 6, 12, 24]) for (const top of [1, 2, 3]) for (const filtro of [false, true]) for (const min of [0, 0.02])
    gen("momento entre criptos (afinado)", { L, H, top, filtro, min }, (t) => (filtro && !btcUp(t) ? [] : ms.map((m) => [m, ret(m, t, L)]).filter((x) => x[1] != null && x[1] > min).sort((a, b) => b[1] - a[1]).slice(0, top).map((x) => x[0])), H);
  return out; }
export function inventadas(rnd, n = 400) { const pick = (a) => a[Math.floor(rnd() * a.length)], out = [];
  const conds = [() => { const r = pick([3, 5, 10, 20]); return [`RSI2<${r}`, (d, i) => d.r2[i] < r]; }, () => { const r = pick([70, 80, 90]); return [`RSI2>${r}`, (d, i) => d.r2[i] > r]; },
    () => ["sobre EMA200", (d, i) => d.C[i] > d.e200[i]], () => ["bajo EMA200", (d, i) => d.C[i] < d.e200[i]], () => { const k = pick([1.5, 2, 3]); return [`vol>${k}x`, (d, i) => d.V[i] > k * d.v20[i]]; },
    () => { const x = pick([0.005, 0.01, 0.02]); return [`vela -${x * 100}%`, (d, i) => d.C[i] / d.O[i] - 1 < -x]; }, () => { const x = pick([0.005, 0.01, 0.02]); return [`vela +${x * 100}%`, (d, i) => d.C[i] / d.O[i] - 1 > x]; },
    () => ["EMA9>EMA21", (d, i) => d.e9[i] > d.e21[i]], () => ["EMA21>EMA50", (d, i) => d.e21[i] > d.e50[i]], () => { const k = pick([1.5, 2]); return [`bajo banda ${k}`, (d, i) => d.C[i] < d.m20[i] - k * d.sd20[i]]; },
    () => { const N = pick([12, 24, 48, 96]); return [`máx ${N}`, (d, i) => d.C[i] > hiN(d, N)[i]]; }, () => { const h = pick([0, 4, 8, 12, 16, 20]); return [`hora ${h}-${h + 4}`, (d, i) => { const x = new Date(d.T[i]).getUTCHours(); return x >= h && x < h + 4; }]; }];
  for (let k = 0; k < n; k++) { const nc = 2 + Math.floor(rnd() * 2), cs = Array.from({ length: nc }, () => pick(conds)()), bar = pick([5, 15, 60]);
    const X = { tp: pick([0, 0.005, 0.01, 0.02, 0.04]), sl: pick([0.005, 0.01, 0.02, 0.04]), max: pick([3, 6, 12, 24, 48]) };
    out.push({ fam: "inventada", bar, p: { regla: cs.map((c) => c[0]).join(" y "), ...X }, entra: (d, i) => cs.every((c) => c[1](d, i)), X }); }
  return out; }
// azar: mismas operaciones por día y misma duración, entradas aleatorias (para saber cuántas «aprobarían» solo por suerte)
function azar(D, bar, rnd, perDay, H) { const tr = []; for (const d of Object.values(D)) { const n = d.C.length, p = perDay / (Object.keys(D).length * (1440 / bar)); for (let i = 210; i < n - H - 2; i++) if (rnd() < p) tr.push([d.T[i + 1], d.T[i + H] + 1, d.C[i + H] / d.O[i + 1] - 1]); } return tr; }

export function caza(raw, log = console.log) {
  const mer = Object.keys(raw.m).filter((m) => raw.m[m] && raw.m[m].length > 50000); if (mer.length < 5) throw new Error("pocas criptos con un año de velas");
  const t0 = Math.max(...mer.map((m) => raw.m[m][0][0])), t1 = Math.min(...mer.map((m) => raw.m[m][raw.m[m].length - 1][0])), corte = t0 + (t1 - t0) * CORTE;
  log(`🔎 Caza: ${mer.length} criptos · ${Math.round((t1 - t0) / 864e5)} días · entreno hasta ${new Date(corte).toISOString().slice(0, 10)}, prueba después`);
  const POR = {}; for (const bar of [5, 15, 60]) { POR[bar] = {}; for (const m of mer) POR[bar][m] = prepara(agrupa(raw.m[m].filter((x) => x[0] >= t0 && x[0] <= t1), bar)); }
  const res = []; let nVar = 0;
  const evalua = (fam, bar, p, tr) => { nVar++; for (const [fn, fee] of Object.entries(FEES)) { const a = cartera(tr, fee, t0, corte), b = cartera(tr, fee, corte, t1 + 1); res.push({ fam, bar, p, fee: fn, a, b, okA: aprueba(a), okB: aprueba(b) }); } };
  for (const F of familias()) { const tr = []; for (const m of mer) tr.push(...opera(POR[F.bar][m], F.entra, F.X)); evalua(F.fam, F.bar, F.p, tr); }
  for (const bar of [15, 60]) for (const F of cruzadas(POR[bar], bar)) evalua(F.fam, bar, F.p, F.tr);
  let s2 = 99; const rnd2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
  for (const bar of [15, 60]) for (const F of ronda2(POR[bar], bar, rnd2)) evalua(F.fam, bar, F.p, F.tr);
  for (const F of inventadas(rnd2)) { const tr = []; for (const m of mer) tr.push(...opera(POR[F.bar][m], F.entra, F.X)); evalua(F.fam, F.bar, F.p, tr); }
  // azar (control)
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); const ctl = [];
  for (let k = 0; k < 200; k++) { const bar = [5, 15, 60][k % 3], H = [3, 12, 24][k % 3], tr = azar(POR[bar], bar, rnd, 8, H); for (const [fn, fee] of Object.entries(FEES)) { const a = cartera(tr, fee, t0, corte), b = cartera(tr, fee, corte, t1 + 1); ctl.push({ fee: fn, okA: aprueba(a), okB: aprueba(b) }); } }
  return { t0, t1, corte, mercados: mer, nVar, res, ctl };
}

export function resumen(R) { const out = { t: new Date().toISOString(), v: 314, dias: Math.round((R.t1 - R.t0) / 864e5), mercados: R.mercados.length, variantes: R.nVar, porFee: {} };
  for (const fn of Object.keys(FEES)) { const r = R.res.filter((x) => x.fee === fn), okA = r.filter((x) => x.okA), okAB = okA.filter((x) => x.okB), c = R.ctl.filter((x) => x.fee === fn);
    const mejores = okAB.sort((x, y) => y.b.ret - x.b.ret).slice(0, 8).map((x) => ({ fam: x.fam, bar: x.bar, p: x.p, entreno: x.a, prueba: x.b }));
    const casi = r.filter((x) => x.a.ret > 0 && x.b.ret > 0 && x.a.opsDia >= 1 && x.b.opsDia >= 1).sort((x, y) => Math.min(y.a.ret, y.b.ret) - Math.min(x.a.ret, x.b.ret)).slice(0, 6).map((x) => ({ fam: x.fam, bar: x.bar, p: x.p, entreno: x.a, prueba: x.b }));
    const topA = r.slice().sort((x, y) => y.a.ret - x.a.ret).slice(0, 5).map((x) => ({ fam: x.fam, bar: x.bar, p: x.p, entreno: x.a, prueba: x.b }));
    const fams = {}; for (const x of r) { const f = (fams[x.fam] = fams[x.fam] || { n: 0, okA: 0, okAB: 0, mejorA: -1e9 }); f.n++; if (x.okA) f.okA++; if (x.okA && x.okB) f.okAB++; f.mejorA = Math.max(f.mejorA, x.a.ret); }
    out.porFee[fn] = { probadas: r.length, apruebanEntreno: okA.length, apruebanAmbos: okAB.length, azarAmbos: c.filter((x) => x.okA && x.okB).length + "/" + c.length, mejores, casi, topEntreno: topA, familias: fams }; }
  return out; }

const P = (o) => Object.entries(o).filter(([, v]) => v !== false && v !== 0).map(([k, v]) => `${k}=${v}`).join(" ");
if (import.meta.url === `file://${process.argv[1]}`) (async () => {
  const FILE = (process.env.LARGO_DIR || "/tmp/largo") + "/raw.json"; if (!existsSync(FILE)) throw new Error("sin el año de velas (caché del examen largo)");
  const raw = JSON.parse(readFileSync(FILE, "utf8")), t = Date.now(), R = caza(raw), S = resumen(R);
  console.log(`🔎 ${S.variantes} estrategias distintas × 4 comisiones = ${R.res.length} pruebas en ${Math.round((Date.now() - t) / 1000)} s`);
  for (const [fn, x] of Object.entries(S.porFee)) {
    console.log(`\n💶 ${fn}: aprueban el entreno ${x.apruebanEntreno} · aprueban ENTRENO Y PRUEBA ${x.apruebanAmbos} · con entradas al azar aprobarían ${x.azarAmbos}`);
    for (const m of x.mejores) console.log(`   ✅ ${m.fam} (${m.bar} min) ${P(m.p)} · entreno ${m.entreno.ret} % (${m.entreno.opsDia}/día, PF ${m.entreno.pf}, caída ${m.entreno.dd} %) · prueba ${m.prueba.ret} % (${m.prueba.opsDia}/día, PF ${m.prueba.pf}, caída ${m.prueba.dd} %)`);
    for (const m of x.casi) console.log(`   ~ gana en los dos con ≥ 1/día: ${m.fam} (${m.bar} min) ${P(m.p)} · entreno ${m.entreno.ret} % (${m.entreno.opsDia}/día, PF ${m.entreno.pf}, caída ${m.entreno.dd} %) · prueba ${m.prueba.ret} % (${m.prueba.opsDia}/día, PF ${m.prueba.pf}, caída ${m.prueba.dd} %)`);
    for (const m of x.topEntreno) console.log(`   · mejor en entreno: ${m.fam} (${m.bar} min) ${P(m.p)} · entreno ${m.entreno.ret} % (${m.entreno.opsDia}/día) → prueba ${m.prueba.ret} % (${m.prueba.opsDia}/día)`);
    console.log("   por familia (aprueban entreno / ambos de las probadas · mejor entreno): " + Object.entries(x.familias).map(([f, y]) => `${f} ${y.okA}/${y.okAB} de ${y.n} (${Math.round(y.mejorA)} %)`).join(" · "));
  }
  const B = await import("./bitvavo.mjs"); B.publicar("caza.json", S, "caza"); await new Promise((r) => setTimeout(r, 3000));
})().catch((e) => { console.log("Caza: " + e.message); process.exit(1); });
