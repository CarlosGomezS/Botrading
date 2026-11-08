// v304 · 🐢 TORTUGAS (Richard Dennis, 1983): compra cuando una cripto cierra por encima de su MÁXIMO de 20 días (ruptura), con tamaño según su
// volatilidad (N = rango medio de 20 días) para arriesgar lo mismo en cada una. Sale con el MÍNIMO de 10 días o con un stop de 2N (como mucho −8 %).
// Regla de la casa: si toca salir por señal pero la venta NO cubre las comisiones, espera (hasta 7 días) a que las cubra; el stop SIEMPRE se respeta.
// Se aplica a las ~20 criptos más líquidas de CADA exchange con sus propias velas diarias y sus propias comisiones, y se examina con 2 años.
import { BASE as OKX_API } from "./okx.mjs";

const BV = "https://api.bitvavo.com/v2";
export const T_ENTRA = 20, T_SALE = 10, T_N = 20, T_RIESGO = 0.015, T_MAXPOS = 4, T_STOPMAX = 0.08, T_ESPERA_D = 7;
export const FEES = { bitvavo: 0.0025, okx: 0.001 };   // comisión por orden (a mercado) de cada exchange
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function J(u, tries = 3) { for (let i = 0; ; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (i >= tries - 1) throw e; await sleep(800 * (i + 1)); } } }

// velas diarias [t,o,h,l,c,v] de antigua a reciente (sin la de hoy, que aún no ha cerrado)
export async function diarias(ex, m, dias = 800, par = null, k = 1) {
  const hoy = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  let out = [];
  if (ex === "bitvavo") { let fin = Date.now(); for (let p = 0; p < 3 && out.length < dias; p++) { const d = await J(`${BV}/${m}/candles?interval=1d&limit=1000&end=${fin}`); if (!Array.isArray(d) || !d.length) break; const v = d.map((x) => [+x[0], +x[1], +x[2], +x[3], +x[4], +x[5]]); out = v.concat(out); fin = Math.min(...v.map((x) => x[0])) - 1; } }
  else { const inst = par || m; let after = ""; for (let p = 0; p < 10 && out.length < dias; p++) { const j = await J(`${OKX_API}/api/v5/market/history-candles?instId=${inst}&bar=1Dutc&limit=100${after ? "&after=" + after : ""}`); const d = (j && j.data) || []; if (!d.length) break; const v = d.map((x) => [+x[0], +x[1] * k, +x[2] * k, +x[3] * k, +x[4] * k, +x[5]]); out = out.concat(v); after = Math.min(...v.map((x) => x[0])); await sleep(120); } }
  const mp = new Map(out.map((x) => [x[0], x])); return [...mp.values()].filter((x) => x[0] < hoy && x[4] > 0).sort((a, b) => a[0] - b[0]).slice(-dias);
}
const atr = (d, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += Math.max(d[j][2] - d[j][3], Math.abs(d[j][2] - d[j - 1][4]), Math.abs(d[j][3] - d[j - 1][4])); return s / n; };
// señal del último día cerrado
export function senal(d) { const i = d.length - 1; if (i < T_ENTRA + 2) return null; let hi = -Infinity, lo = Infinity; for (let j = i - T_ENTRA; j < i; j++) hi = Math.max(hi, d[j][2]); for (let j = i - T_SALE; j < i; j++) lo = Math.min(lo, d[j][3]);
  const N = atr(d, i, T_N), c = d[i][4]; return { t: d[i][0], c, N, hi20: hi, lo10: lo, entra: c > hi, sale: c < lo }; }

// 🧪 SIMULACIÓN DE CARTERA con las reglas EXACTAS del real: dinero compartido, como mucho 4 a la vez, tamaño por volatilidad (10-25 %),
// comisión del exchange y medio spread en cada orden, salida por mínimo de 10 días solo si cubre comisiones (si no, espera ≤ 7 días), stop 2N (≤ −8 %).
export function simula(series, fee, spread = 0.002) {
  const dias = [...new Set(Object.values(series).flatMap((d) => d.map((x) => x[0])))].sort((a, b) => a - b), idx = {};
  for (const [m, d] of Object.entries(series)) { idx[m] = new Map(d.map((x, i) => [x[0], i])); }
  let cash = 1, pos = {}, pico = 1, dd = 0, n = 0, gan = 0, gb = 0, pb = 0; const curva = [], cst = fee + spread / 2;
  const valor = (t) => cash + Object.entries(pos).reduce((s, [m, p]) => { const i = idx[m].get(t); return s + p.q * (i != null ? series[m][i][4] : p.ult); }, 0);
  for (const t of dias) {
    for (const [m, p] of Object.entries(pos)) { const i = idx[m].get(t); if (i == null) continue; const d = series[m], x = d[i]; p.ult = x[4];
      let lo = Infinity; for (let j = Math.max(0, i - T_SALE); j < i; j++) lo = Math.min(lo, d[j][3]);
      let px = null; if (x[3] <= p.stop) px = Math.min(x[1], p.stop); else if (x[4] < lo) { const neto = (x[4] * (1 - cst)) / p.px - 1; if (neto > 0 || t - p.t0 > T_ESPERA_D * 86400e3) px = x[4]; }
      if (px != null) { const got = p.q * px * (1 - cst); cash += got; const r = got / p.coste - 1; if (r > 0) { gan++; gb += got - p.coste; } else pb += p.coste - got; delete pos[m]; } }
    const V = valor(t);
    for (const [m, d] of Object.entries(series)) { if (pos[m] || Object.keys(pos).length >= T_MAXPOS) continue; const i = idx[m].get(t); if (i == null || i < T_ENTRA + 2) continue; const s = senal(d.slice(0, i + 1)); if (!s || !s.entra || !(s.N > 0)) continue;
      const stopD = Math.min(2 * s.N, s.c * T_STOPMAX); let eur = Math.min(Math.max((T_RIESGO * V) / (stopD / s.c), 0.10 * V), 0.25 * V); eur = Math.min(eur, cash); if (eur < 0.05 * V) continue;
      const px = s.c * (1 + spread / 2); cash -= eur; pos[m] = { q: (eur * (1 - fee)) / px, px, coste: eur, stop: s.c - stopD, t0: t, ult: s.c }; n++; }
    const V2 = valor(t); pico = Math.max(pico, V2); dd = Math.max(dd, 1 - V2 / pico); curva.push([t, V2]); }
  const fin = curva.length ? curva[curva.length - 1][1] : 1, q = [0, 1, 2, 3].map((j) => { const a = Math.floor((curva.length * j) / 4), b = Math.floor((curva.length * (j + 1)) / 4) - 1; return curva.length ? Math.round((curva[b][1] / (j ? curva[a - 1][1] : 1) - 1) * 10000) / 100 : 0; });
  return { ret: Math.round((fin - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, n, aciertos: n ? Math.round((gan / n) * 100) : 0, pf: pb > 0 ? Math.round((gb / pb) * 100) / 100 : gb > 0 ? 99 : 0, semestres: q, curva };
}
export function veredicto(r) { const ok = r.n >= 30 && r.ret > 0 && r.pf >= 1.2 && r.dd < 35 && r.semestres.filter((x) => x > 0).length >= 2;
  return { ok, motivo: ok ? "aprueba 2 años" : r.n < 30 ? "pocas operaciones" : r.ret <= 0 ? "en 2 años pierde" : r.pf < 1.2 ? "gana poco por cada euro perdido" : r.dd >= 35 ? "cae demasiado" : "pierde en 3 de 4 semestres" }; }
