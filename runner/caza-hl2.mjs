// v359 · 🧪 GRAN CAZA EN HYPERLIQUID (solo datos): las señales clásicas que usan los traders profesionales, combinadas de todas las formas
// razonables (señal × filtro × tiempo de salida × stop), en las dos direcciones, con comisión + deslizamiento + financiación reales.
// Señales: RSI (Connors), Bandas de Bollinger (rebote y ruptura), canales de Donchian (Turtles), cruces de medias y MACD, desviación del
// precio medio por volumen (VWAP), ruptura de volatilidad (Larry Williams), picos de volumen, efecto de la hora del día (sesiones),
// Supertrend, arbitraje estadístico contra BTC y financiación extrema.
// Validación igual de dura que la caza anterior: entreno (60 % antiguo) + prueba (40 % reciente) + vecinos + mitades de la prueba.
import { datos, cartera } from "./caza-hl.mjs";
const ema = (C, n) => { const o = new Float64Array(C.length), k = 2 / (n + 1); let e = C[0]; for (let i = 0; i < C.length; i++) { e = Number.isFinite(C[i]) ? e + k * (C[i] - e) : e; o[i] = e; } return o; };
const sma = (C, n) => { const o = new Float64Array(C.length); let s = 0; for (let i = 0; i < C.length; i++) { s += C[i] || 0; if (i >= n) s -= C[i - n] || 0; o[i] = i >= n - 1 ? s / n : NaN; } return o; };
const sd = (C, n, m) => { const o = new Float64Array(C.length); for (let i = n - 1; i < C.length; i++) { let s = 0; for (let k = i - n + 1; k <= i; k++) s += (C[k] - m[i]) ** 2; o[i] = Math.sqrt(s / n); } return o; };
const rsi = (C, n) => { const o = new Float64Array(C.length).fill(50); let g = 0, l = 0; for (let i = 1; i < C.length; i++) { const d = C[i] - C[i - 1] || 0, up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; };
const atr = (d, n) => { const tr = new Float64Array(d.C.length); for (let i = 1; i < d.C.length; i++) tr[i] = Math.max(d.Hi[i] - d.Lo[i], Math.abs(d.Hi[i] - d.C[i - 1]), Math.abs(d.Lo[i] - d.C[i - 1])) / d.C[i]; return sma(tr, n); };

// cada señal devuelve, para una cripto, un Int8Array con +1 (comprar), −1 (corto) o 0 en cada hora
function senales(D) {
  const S = [], add = (fam, p, fn) => S.push({ fam, p, fn });
  for (const n of [2, 7, 14]) for (const [lo, hi] of [[10, 90], [20, 80], [30, 70]]) add("RSI rebote", { n, lo, hi }, (d) => { const r = rsi(d.C, n); return Int8Array.from(r, (x) => (x < lo ? 1 : x > hi ? -1 : 0)); });
  for (const n of [20, 50]) for (const k of [2, 2.5, 3]) { add("Bollinger rebote", { n, k }, (d) => { const m = sma(d.C, n), s = sd(d.C, n, m); return Int8Array.from(d.C, (c, i) => (c < m[i] - k * s[i] ? 1 : c > m[i] + k * s[i] ? -1 : 0)); }); add("Bollinger ruptura", { n, k }, (d) => { const m = sma(d.C, n), s = sd(d.C, n, m); return Int8Array.from(d.C, (c, i) => (c > m[i] + k * s[i] ? 1 : c < m[i] - k * s[i] ? -1 : 0)); }); }
  for (const N of [12, 24, 48, 96]) add("Donchian ruptura", { N }, (d) => { const o = new Int8Array(d.C.length); for (let i = N; i < d.C.length; i++) { let hi = -1e18, lo = 1e18; for (let k = i - N; k < i; k++) { if (d.Hi[k] > hi) hi = d.Hi[k]; if (d.Lo[k] < lo) lo = d.Lo[k]; } o[i] = d.C[i] > hi ? 1 : d.C[i] < lo ? -1 : 0; } return o; });
  for (const [f, s2] of [[9, 21], [20, 50], [50, 200]]) add("Cruce de medias", { f, s: s2 }, (d) => { const a = ema(d.C, f), b = ema(d.C, s2); return Int8Array.from(d.C, (c, i) => (i && a[i] > b[i] && a[i - 1] <= b[i - 1] ? 1 : i && a[i] < b[i] && a[i - 1] >= b[i - 1] ? -1 : 0)); });
  for (const [f, s2, g] of [[12, 26, 9], [5, 35, 5]]) add("MACD", { f, s: s2, g }, (d) => { const a = ema(d.C, f), b = ema(d.C, s2), m = Float64Array.from(a, (x, i) => x - b[i]), sg = ema(m, g); return Int8Array.from(d.C, (c, i) => (i && m[i] > sg[i] && m[i - 1] <= sg[i - 1] ? 1 : i && m[i] < sg[i] && m[i - 1] >= sg[i - 1] ? -1 : 0)); });
  for (const n of [24, 72]) for (const k of [1.5, 2, 3]) add("VWAP rebote", { n, k }, (d) => { const o = new Int8Array(d.C.length); for (let i = n; i < d.C.length; i++) { let pv = 0, v = 0; for (let j = i - n + 1; j <= i; j++) { pv += d.C[j] * d.V[j]; v += d.V[j]; } if (!v) continue; const w = pv / v; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (d.C[j] - w) ** 2; s = Math.sqrt(s / n); o[i] = d.C[i] < w - k * s ? 1 : d.C[i] > w + k * s ? -1 : 0; } return o; });
  for (const k of [1.5, 2, 3]) for (const sen of [1, -1]) add(sen > 0 ? "Ruptura de volatilidad" : "Volatilidad, contra", { k }, (d) => { const a = atr(d, 24); return Int8Array.from(d.C, (c, i) => { if (!i || !(a[i - 1] > 0)) return 0; const r = c / d.C[i - 1] - 1; return Math.abs(r) > k * a[i - 1] ? sen * Math.sign(r) : 0; }); });
  for (const m of [3, 5]) for (const sen of [1, -1]) add(sen > 0 ? "Pico de volumen" : "Pico de volumen, contra", { m }, (d) => { const av = sma(d.V, 48); return Int8Array.from(d.C, (c, i) => (i && av[i - 1] > 0 && d.V[i] > m * av[i - 1] ? sen * Math.sign(c - d.C[i - 1]) : 0)); });
  for (const h of [0, 7, 13, 14, 20]) for (const sen of [1, -1]) add(sen > 0 ? "Sesión (hora UTC), a favor" : "Sesión (hora UTC), contra", { h }, (d, T) => Int8Array.from(d.C, (c, i) => (i >= 4 && new Date(T[i]).getUTCHours() === h ? sen * Math.sign(c - d.C[i - 4]) : 0)));
  for (const [n, k] of [[10, 2], [10, 3]]) add("Supertrend", { n, k }, (d) => { const a = atr(d, n), o = new Int8Array(d.C.length); let dir = 1, up = 0, dn = 1e18; for (let i = n; i < d.C.length; i++) { const m = (d.Hi[i] + d.Lo[i]) / 2, b = k * a[i] * d.C[i]; const u = m + b, l = m - b; up = d.C[i - 1] > up ? Math.max(l, up) : l; dn = d.C[i - 1] < dn ? Math.min(u, dn) : u; const nd = d.C[i] > dn ? 1 : d.C[i] < up ? -1 : dir; if (nd !== dir) o[i] = nd; dir = nd; } return o; });
  for (const z of [2, 3]) add("Arbitraje contra BTC", { z }, (d, T, B) => { const o = new Int8Array(d.C.length), R = new Float64Array(d.C.length); for (let i = 24; i < d.C.length; i++) R[i] = Math.log(d.C[i] / d.C[i - 24]) - Math.log(B.C[i] / B.C[i - 24]); const m = sma(R, 240), s = sd(R, 240, m); for (let i = 264; i < d.C.length; i++) if (s[i] > 0) { const q = (R[i] - m[i]) / s[i]; o[i] = q > z ? -1 : q < -z ? 1 : 0; } return o; });
  for (const t of [0.00005, 0.0001, 0.0002]) add("Financiación extrema, contra", { t }, (d) => { const o = new Int8Array(d.C.length); for (let i = 8; i < d.C.length; i++) { let f = 0; for (let k = i - 8; k < i; k++) f += d.F[k]; f /= 8; o[i] = f > t ? -1 : f < -t ? 1 : 0; } return o; });
  return S;
}
const FILTROS = { "sin filtro": () => true, "a favor de BTC (media 200 h)": (dir, i, X) => (dir > 0) === X.btcUp[i], "a favor de la propia cripto (media 100 h)": (dir, i, X, c) => (dir > 0) === X.up[c][i], "solo con poca volatilidad": (dir, i, X, c) => X.vol[c][i] <= X.volMed[c], "solo con mucha volatilidad": (dir, i, X, c) => X.vol[c][i] > X.volMed[c] };

export async function caza2(log = console.log) {
  log("Descargando velas de 1 h, volumen y financiación de Hyperliquid (últimos 540 días)…");
  const D = await datos(() => {}), { T, M, U } = D, n = T.length, corte = Math.floor(n * 0.6), mitad = Math.floor((corte + n) / 2);
  const X = { btcUp: (() => { const e = ema(M.BTC.C, 200); return Uint8Array.from(M.BTC.C, (c, i) => (c > e[i] ? 1 : 0)); })(), up: {}, vol: {}, volMed: {} };
  for (const c of U) { const e = ema(M[c].C, 100); X.up[c] = Uint8Array.from(M[c].C, (x, i) => (x > e[i] ? 1 : 0)); X.vol[c] = atr(M[c], 24); const s = [...X.vol[c].slice(250, corte)].filter(Number.isFinite).sort((a, b) => a - b); X.volMed[c] = s[Math.floor(s.length / 2)]; }
  const S = senales(D); log(`Datos: ${U.length} criptos · ${Math.round(n / 24)} días · ${S.length} señales × ${Object.keys(FILTROS).length} filtros × 4 salidas × 2 stops = ${S.length * Object.keys(FILTROS).length * 8} combinaciones`);
  const R = [];
  for (const s of S) {
    const SIG = {}; for (const c of U) { try { SIG[c] = s.fn(M[c], T, M.BTC); } catch (e) { SIG[c] = new Int8Array(n); } }
    for (const [fn, f] of Object.entries(FILTROS)) for (const Hh of [2, 4, 8, 16]) {
      const ops = []; for (const c of U) { const g = SIG[c]; let lib = 0; for (let i = 260; i < n - 1; i++) { if (i < lib || !g[i]) continue; if (!f(g[i], i, X, c)) continue; ops.push([i, c, g[i], i + Hh]); lib = i + Hh; } }
      for (const sl of [0, 0.03]) { const a = cartera(ops, M, 260, corte, 5, sl), b = cartera(ops, M, corte, n - 1, 5, sl), b1 = cartera(ops, M, corte, mitad, 5, sl), b2 = cartera(ops, M, mitad, n - 1, 5, sl);
        R.push({ fam: s.fam, p: { ...s.p, filtro: fn, salida: Hh + " h", stop: sl ? "−3 %" : "no" }, a, b, b1, b2, okA: a.opsDia >= 3 && a.ret > 0 && a.pf >= 1.15 && a.dd < 0.3, okB: b.ret > 0 && b.pf >= 1.1 && b.dd < 0.3 && b1.ret > 0 && b2.ret > 0 }); }
    }
  }
  const vec = (x) => R.filter((y) => y.fam === x.fam && y !== x && Object.keys(x.p).filter((q) => x.p[q] !== y.p[q]).length === 1);
  for (const x of R) if (x.okA && x.okB) { const v = vec(x); x.vecOk = v.length ? v.filter((y) => y.b.ret > 0).length / v.length : 0; }
  const ok = R.filter((x) => x.okA && x.okB && x.vecOk >= 0.6).sort((a, b) => b.b.ret - a.b.ret);
  const P = (x) => (x * 100).toFixed(1) + " %", fila = (x) => `${x.fam} ${JSON.stringify(x.p)} · entreno ${P(x.a.ret)} (${x.a.opsDia.toFixed(1)} op/día, PF ${x.a.pf.toFixed(2)}, caída ${P(x.a.dd)}) · prueba ${P(x.b.ret)} [${P(x.b1.ret)} | ${P(x.b2.ret)}] (${x.b.opsDia.toFixed(1)} op/día, PF ${x.b.pf.toFixed(2)}, caída ${P(x.b.dd)})${x.vecOk != null ? " · vecinos " + Math.round(x.vecOk * 100) + " %" : ""}`;
  log(`\nAPROBADAS (≥3 op/día, ganan en entreno y en las dos mitades de la prueba, y sus vecinos también): ${ok.length} de ${R.length}`); ok.slice(0, 15).forEach((x) => log("  ✅ " + fila(x)));
  const casi = R.filter((x) => x.okA && !(x.okB && x.vecOk >= 0.6) && x.b.ret > 0).sort((a, b) => b.b.ret - a.b.ret).slice(0, 8); log(`\nCasi (ganan en entreno y en la prueba, pero fallan una mitad o sus vecinos): ${casi.length}`); casi.forEach((x) => log("  🟡 " + fila(x)));
  for (const fam of [...new Set(R.map((x) => x.fam))]) { const m = R.filter((x) => x.fam === fam && x.a.opsDia >= 3).sort((a, b) => b.b.ret - a.b.ret)[0]; if (m) log(`  · mejor de «${fam}» en la prueba: ${fila(m)}`); }
  return { ok, R };
}
if (process.argv[1] && process.argv[1].endsWith("caza-hl2.mjs")) caza2().catch((e) => { console.log("Error: " + e.message); process.exit(1); });
