// v311 · 🐸 MEMECOINS RÁPIDO: cazar los arranques fuertes de las memecoins (muchas operaciones). Velas de 1 h hechas con las de 5 min.
// Entra cuando cierra por encima de su máximo de 24 h con volumen ≥ 2× su media; sale con stop móvil (3 % bajo el máximo alcanzado),
// stop −4 % o a las 12 h. Como mucho 3 a la vez, 25 % cada una. Comisión del exchange y medio spread en cada orden.
export const MEMES = ["PEPE", "BONK", "WIF", "FLOKI", "SHIB", "TRUMP", "DOGE", "PENGU", "FARTCOIN", "POPCAT", "BRETT", "MOG", "TURBO", "NEIRO"];
export function aHoras(c5) { const m = new Map(); for (const [t, o, h, l, c, v] of c5) { const k = Math.floor(t / 3600e3) * 3600e3, x = m.get(k); if (!x) m.set(k, [k, o, h, l, c, v]); else { x[2] = Math.max(x[2], h); x[3] = Math.min(x[3], l); x[4] = c; x[5] += v; } } return [...m.values()].sort((a, b) => a[0] - b[0]); }
export function simula(series, fee, spread = 0.002, P = { ent: 24, vol: 2, trail: 0.03, stop: 0.04, maxH: 12, maxPos: 3, tam: 0.25 }) {
  const cst = fee + spread / 2, ts = [...new Set(Object.values(series).flatMap((c) => c.map((x) => x[0])))].sort((a, b) => a - b), idx = {};
  for (const [m, c] of Object.entries(series)) idx[m] = new Map(c.map((x, i) => [x[0], i]));
  let cash = 1, pos = {}, n = 0, gan = 0, pico = 1, dd = 0; const curva = [];
  for (const t of ts) {
    for (const [m, p] of Object.entries(pos)) { const i = idx[m].get(t); if (i == null) continue; const x = series[m][i]; let out = null;
      if (x[3] <= p.px * (1 - P.stop)) out = Math.min(x[1], p.px * (1 - P.stop)); else if (p.peak >= p.px * 1.01 && x[3] <= p.peak * (1 - P.trail)) out = Math.min(x[1], p.peak * (1 - P.trail)); else if (t - p.t0 >= P.maxH * 3600e3) out = x[4];
      p.peak = Math.max(p.peak, x[2]); p.ult = x[4];
      if (out != null) { const got = p.q * out * (1 - cst); cash += got; if (got > p.coste) gan++; delete pos[m]; } }
    const V0 = cash + Object.values(pos).reduce((s, p) => s + p.q * p.ult, 0);
    for (const [m, c] of Object.entries(series)) { if (pos[m] || Object.keys(pos).length >= P.maxPos) continue; const i = idx[m].get(t); if (i == null || i < P.ent + 2) continue;
      let hi = -Infinity, vs = 0; for (let j = i - P.ent; j < i; j++) { hi = Math.max(hi, c[j][2]); vs += c[j][5]; } const x = c[i];
      if (x[4] > hi && x[5] >= (P.vol * vs) / P.ent) { const eur = Math.min(P.tam * V0, cash); if (eur < 0.05 * V0) continue; const px = x[4] * (1 + spread / 2); cash -= eur; pos[m] = { q: (eur * (1 - fee)) / px, px, coste: eur, peak: x[4], t0: t, ult: x[4] }; n++; } }
    const V = cash + Object.values(pos).reduce((s, p) => s + p.q * p.ult, 0); pico = Math.max(pico, V); dd = Math.max(dd, 1 - V / pico); curva.push([t, V]); }
  const fin = curva.length ? curva[curva.length - 1][1] : 1, dias = Math.max(1, (ts[ts.length - 1] - ts[0]) / 86400e3);
  const q = [0, 1, 2, 3].map((j) => { const a = Math.floor((curva.length * j) / 4), b = Math.floor((curva.length * (j + 1)) / 4) - 1; return curva.length > 4 ? Math.round((curva[b][1] / (j ? curva[a - 1][1] : 1) - 1) * 10000) / 100 : 0; });
  return { ret: Math.round((fin - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, ops: n, opsDia: Math.round((n / dias) * 10) / 10, aciertos: n ? Math.round((gan / n) * 100) : 0, trimestres: q };
}
export function veredicto(r) { const ok = r.ret > 0 && r.dd < 40 && r.opsDia >= 1 && r.trimestres.filter((x) => x > 0).length >= 3; return { ok, motivo: ok ? "aprueba el año" : r.ret <= 0 ? "en un año pierde" : r.dd >= 40 ? "cae demasiado" : r.opsDia < 1 ? "pocas operaciones" : "pierde en 2 o más trimestres" }; }
