// v312 · 🎯 REBOTE DE LAS GRANDES (Larry Connors, RSI de 2 días): cuando una gran empresa en tendencia (por encima de su media de 200 días)
// cae fuerte 1-2 días (RSI(2) < 10), se compra al día siguiente; se vende cuando cierra por encima de su media de 5 días.
// Si no rebota: stop −8 % desde la compra o, como mucho, 10 días. Hasta 3 a la vez con el 20 % de la cartera de Trading 212.
// Costes de Trading 212: sin comisión; 0,15 % de cambio de divisa en cada compra y venta de acciones en dólares; + 0,05 % de spread.
// Uso: node rebotes.mjs examen   → examina 10 años y lo publica en la rama «examen-largo» (rebotes.json, rama propia: NO pisar «examen-largo»)
export const UNIVERSO = ["GOOGL", "MSFT", "AAPL", "NVDA", "AMZN", "META", "AVGO", "ADBE", "CRM", "AMD", "NFLX", "COST", "ORCL", "ASML.AS", "SAP.DE"];
export const P = { rsiMax: 10, ma: 200, salida: 5, stop: 0.08, maxD: 10, maxPos: 3 };
export const coste = (sym) => (/\.(AS|DE|PA|MI|MC)$/.test(sym) ? 0 : 0.0015) + 0.0005;   // por orden
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function diarias(sym, rango = "10y") {
  for (const host of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) for (let a = 0; a < 3; a++) {
    try { const r = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=${rango}&interval=1d&events=split`, { headers: { "User-Agent": "Mozilla/5.0 (bot-trading)" }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(), x = j.chart.result[0], q = x.indicators.quote[0], adj = (x.indicators.adjclose && x.indicators.adjclose[0].adjclose) || q.close;
      const out = []; for (let i = 0; i < x.timestamp.length; i++) { const c = q.close[i], k = c > 0 && adj[i] > 0 ? adj[i] / c : 1; if (c > 0 && q.open[i] > 0) out.push([x.timestamp[i] * 1000, q.open[i] * k, q.high[i] * k, q.low[i] * k, adj[i] || c]); } return out; }
    catch (e) { await sleep(1200 * (a + 1)); } }
  throw new Error("sin datos de " + sym);
}
export function rsi2(c, i) { let up = 0, dn = 0; const a = 1 / 2; let g = 0, l = 0; for (let j = Math.max(1, i - 30); j <= i; j++) { const d = c[j][4] - c[j - 1][4]; g = g + a * (Math.max(d, 0) - g); l = l + a * (Math.max(-d, 0) - l); } void up; void dn; return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
const sma = (c, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += c[j][4]; return s / n; };
// señal del último día cerrado
export function senal(c) { const i = c.length - 1; if (i < P.ma + 2) return null; const r = rsi2(c, i), m200 = sma(c, i, P.ma), m5 = sma(c, i, P.salida);
  return { t: c[i][0], c: c[i][4], rsi: Math.round(r * 10) / 10, sobre200: c[i][4] > m200, m5, entra: c[i][4] > m200 && r < P.rsiMax, sale: c[i][4] > m5 }; }
// 🧪 cartera de 10 años: entra a la apertura del día siguiente a la señal, sale a la apertura del día siguiente a la señal de salida (stop en el día)
export function simula(series) {
  const dias = [...new Set(Object.values(series).flatMap((c) => c.map((x) => Math.floor(x[0] / 864e5))))].sort((a, b) => a - b), idx = {};
  for (const [s, c] of Object.entries(series)) idx[s] = new Map(c.map((x, i) => [Math.floor(x[0] / 864e5), i]));
  let cash = 1, pos = {}, pend = { e: [], s: [] }, n = 0, gan = 0, gb = 0, pb = 0, pico = 1, dd = 0; const curva = [];
  for (const d of dias) {
    for (const s of pend.s) { const p = pos[s], i = idx[s].get(d); if (!p || i == null) continue; const px = series[s][i][1] * (1 - coste(s)); cash += p.q * px; const r = (p.q * px) / p.coste - 1; if (r > 0) { gan++; gb += p.q * px - p.coste; } else pb += p.coste - p.q * px; delete pos[s]; }
    const V0 = cash + Object.entries(pos).reduce((a, [s, p]) => a + p.q * p.ult, 0);
    for (const s of pend.e) { if (pos[s] || Object.keys(pos).length >= P.maxPos) continue; const i = idx[s].get(d); if (i == null) continue; const eur = Math.min(V0 / P.maxPos, cash); if (eur < V0 * 0.05) continue; const px = series[s][i][1] * (1 + coste(s)); cash -= eur; pos[s] = { q: eur / px, px, coste: eur, d0: d, ult: px }; n++; }
    pend = { e: [], s: [] };
    for (const [s, c] of Object.entries(series)) { const i = idx[s].get(d); if (i == null) continue; const x = c[i], p = pos[s];
      if (p) { p.ult = x[4]; if (x[3] <= p.px * (1 - P.stop)) { const px = Math.min(x[1], p.px * (1 - P.stop)) * (1 - coste(s)); cash += p.q * px; pb += Math.max(0, p.coste - p.q * px); if (p.q * px > p.coste) gan++; delete pos[s]; continue; }
        const sg = senal(c.slice(Math.max(0, i - 210), i + 1)); if ((sg && sg.sale) || d - p.d0 >= P.maxD * 1.4) pend.s.push(s); }
      else { const sg = senal(c.slice(Math.max(0, i - 210), i + 1)); if (sg && sg.entra) pend.e.push(s); } }
    pend.e.sort((a, b) => senal(series[a].slice(0, idx[a].get(d) + 1)).rsi - senal(series[b].slice(0, idx[b].get(d) + 1)).rsi);
    const V = cash + Object.values(pos).reduce((a, p) => a + p.q * p.ult, 0); pico = Math.max(pico, V); dd = Math.max(dd, 1 - V / pico); curva.push([d, V]); }
  const fin = curva.length ? curva[curva.length - 1][1] : 1, anos = Math.max(1, (dias[dias.length - 1] - dias[0]) / 365.25);
  return { ret: Math.round((fin - 1) * 10000) / 100, anual: Math.round((Math.pow(fin, 1 / anos) - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, n, porAno: Math.round((n / anos) * 10) / 10, aciertos: n ? Math.round((gan / n) * 100) : 0, pf: pb > 0 ? Math.round((gb / pb) * 100) / 100 : 99, anos: Math.round(anos * 10) / 10,
    porAnoRet: Object.entries(curva.reduce((o, [d, v]) => { const y = new Date(d * 864e5).getUTCFullYear(); (o[y] = o[y] || [v, v])[1] = v; return o; }, {})).map(([y, [a, b]]) => [y, Math.round((b / a - 1) * 1000) / 10]) };
}
export function veredicto(r) { const ok = r.anual > 3 && r.pf >= 1.3 && r.aciertos >= 60 && r.dd < 25 && r.porAno >= 12;
  return { ok, motivo: ok ? "aprueba 10 años" : r.anual <= 3 ? "gana poco al año" : r.pf < 1.3 ? "gana poco por cada € perdido" : r.aciertos < 60 ? "acierta poco" : r.dd >= 25 ? "cae demasiado" : "opera poco" }; }

async function examen() { const series = {}; for (const s of UNIVERSO) { try { series[s] = await diarias(s); } catch (e) { console.log("Rebotes: sin datos de " + s); } }
  // varias versiones razonables (sin buscar «la que mejor encaja»: se publican todas y solo vale si aprueba la principal o casi todas)
  const base = { ...P }, vars = [["principal", {}], ["RSI < 5", { rsiMax: 5 }], ["sin stop (máx. 10 días)", { stop: 0.5 }], ["RSI < 5 y sin stop", { rsiMax: 5, stop: 0.5 }], ["salida a 3 días", { salida: 3 }]], todas = [];
  for (const [nm, o] of vars) { Object.assign(P, base, o); const rr = simula(series), vv = veredicto(rr); todas.push({ nm, ...rr, ...vv }); console.log(`🎯 versión «${nm}»: ${vv.ok ? "✅" : "❌"} ${rr.anual} % al año · caída ${rr.dd} % · ${rr.porAno} op/año · ${rr.aciertos} % aciertos · PF ${rr.pf}`); }
  Object.assign(P, base); const r = simula(series), v = veredicto(r); r.versiones = todas.map(({ nm, anual, dd, porAno, aciertos, pf, ok }) => ({ nm, anual, dd, porAno, aciertos, pf, ok }));
  console.log(`🎯 Rebote de las grandes (${Object.keys(series).length} acciones, ${r.anos} años): ${v.ok ? "✅" : "❌"} ${v.motivo} · ${r.ret} % en total (${r.anual} % al año) · peor caída ${r.dd} % · ${r.n} operaciones (${r.porAno} al año) · ${r.aciertos} % aciertos · ${r.pf} € ganados por € perdido`);
  console.log("   por años: " + r.porAnoRet.map(([y, x]) => `${y} ${x} %`).join(" · "));
  const B = await import("./bitvavo.mjs"); B.publicar("rebotes.json", { t: new Date().toISOString(), v: 312, ...r, ...v, universo: Object.keys(series), P }, "examen-rebotes"); await sleep(3000); }
if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "examen") examen().catch((e) => { console.log("Rebotes: " + e.message); process.exit(1); });
