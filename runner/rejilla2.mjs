// v308 · 🔁 REJILLA RÁPIDA (como los bots de rejilla de Binance/OKX): MUCHAS operaciones al día, cada venta con GANANCIA NETA (comisiones incluidas).
// Por cripto líquida: compra un lote cuando el precio baja un escalón desde la última compra (o desde el último máximo si no tiene lotes)
// y vende ESE lote cuando sube un escalón por encima de su precio de compra (escalón > 2 comisiones + spread → siempre gana al vender).
// Freno: no compra si la cripto cae > 6 % en 24 h (desplome) o está por debajo de su media de ~2 días (tendencia bajista).
// Stop por lote: −12 % (para no quedarse atrapado meses). Como mucho 4 lotes por cripto y un tope de dinero total.
export const R_LOTE = 0.04, R_MAXLOTES = 4, R_STOP = 0.12, R_TOPE = 0.4;
export const pasoDe = (fee, sp = 0.001) => Math.max(0.006, 2 * fee + sp + 0.003);   // escalón: comisiones de ida y vuelta + spread + 0,3 % de ganancia mínima

// señal de un minuto/vela para una cripto (estado g = { lotes:[{px,q,coste}], ref })
export function decide(g, px, ema, ch24, paso) {
  const acc = [];
  for (const l of g.lotes) { if (px >= l.px * (1 + paso)) acc.push({ tipo: "vende", lote: l, motivo: "escalón" }); else if (px <= l.px * (1 - R_STOP)) acc.push({ tipo: "vende", lote: l, motivo: "stop" }); }
  const libre = g.lotes.length - acc.length < R_MAXLOTES, ult = g.lotes.length ? Math.min(...g.lotes.map((l) => l.px)) : g.ref || px;
  if (libre && px <= ult * (1 - paso) && ch24 > -0.06 && px >= ema * 0.995) acc.push({ tipo: "compra" });
  if (!g.lotes.length) g.ref = Math.max(g.ref || px, px);   // sin lotes, la referencia sigue al precio hacia arriba
  return acc;
}
// 🧪 simulación con velas de 5 min de varias criptos y dinero compartido (comisión a mercado + medio spread por orden)
export function simula(series, fee, spread = 0.001) {
  const paso = pasoDe(fee, spread), cst = fee + spread / 2; let cash = 1, n = 0, gan = 0, per = 0, pico = 1, dd = 0; const G = {}, T0 = [], curva = [];
  const ts = [...new Set(Object.values(series).flatMap((c) => c.map((x) => x[0])))].sort((a, b) => a - b), idx = {};
  for (const [m, c] of Object.entries(series)) { idx[m] = new Map(c.map((x, i) => [x[0], i])); G[m] = { lotes: [], ref: null, ema: c[0][4] }; }
  const k = 2 / (576 + 1);   // media de ~2 días en velas de 5 min
  for (const t of ts) {
    let inv = 0; for (const [m, g] of Object.entries(G)) { const i = idx[m].get(t); if (i == null) { inv += g.lotes.reduce((s, l) => s + l.q * (g.ult || l.px), 0); continue; } const c = series[m], px = c[i][4]; g.ult = px; g.ema = g.ema + k * (px - g.ema);
      const ch = i >= 288 ? px / c[i - 288][4] - 1 : 0;
      for (const a of decide(g, px, g.ema, ch, paso)) {
        if (a.tipo === "vende") { const got = a.lote.q * px * (1 - cst); cash += got; if (got > a.lote.coste) gan++; else per++; g.lotes = g.lotes.filter((l) => l !== a.lote); n++; }
        else { const V = cash + Object.values(G).reduce((s, h) => s + h.lotes.reduce((s2, l) => s2 + l.q * (h.ult || l.px), 0), 0), invT = V - cash, eur = R_LOTE * V; if (invT + eur > R_TOPE * V || cash < eur) continue; cash -= eur; g.lotes.push({ px, q: (eur * (1 - cst)) / px, coste: eur }); g.ref = px; n++; } }
      inv += g.lotes.reduce((s, l) => s + l.q * px, 0); }
    const V = cash + inv; pico = Math.max(pico, V); dd = Math.max(dd, 1 - V / pico); if (T0.length === 0 || t - T0[T0.length - 1] >= 86400e3) { T0.push(t); curva.push([t, V]); } }
  const fin = cash + Object.values(G).reduce((s, h) => s + h.lotes.reduce((s2, l) => s2 + l.q * (h.ult || l.px), 0), 0), dias = Math.max(1, (ts[ts.length - 1] - ts[0]) / 86400e3);
  const q = [0, 1, 2, 3].map((j) => { const a = Math.floor((curva.length * j) / 4), b = Math.floor((curva.length * (j + 1)) / 4) - 1; return curva.length > 4 ? Math.round((curva[b][1] / (j ? curva[a - 1][1] : 1) - 1) * 10000) / 100 : 0; });
  return { ret: Math.round((fin - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, ops: n, opsDia: Math.round((n / dias) * 10) / 10, ventasGanadoras: gan + per ? Math.round((gan / (gan + per)) * 100) : 0, paso: Math.round(paso * 1000) / 10, trimestres: q };
}
export function veredicto(r) { const ok = r.ret > 0 && r.dd < 30 && r.opsDia >= 2 && r.trimestres.filter((x) => x > 0).length >= 3;
  return { ok, motivo: ok ? "aprueba el año" : r.ret <= 0 ? "en un año pierde" : r.dd >= 30 ? "cae demasiado" : r.opsDia < 2 ? "pocas operaciones" : "pierde en 2 o más trimestres" }; }
