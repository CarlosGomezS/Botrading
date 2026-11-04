// v224 · 🪜 REJILLA INTELIGENTE (SOLO DINERO FICTICIO, con sus propios 100 €)
// Una rejilla deja órdenes de compra escalonadas por debajo del precio y de venta por encima: cada vez que el precio baja un escalón
// compra un trocito y cuando vuelve a subir ese escalón lo vende. Gana mucho cuando el precio va «de lado» (sube y baja sin rumbo) y
// pierde cuando el precio se va en una dirección. Por eso aquí es «inteligente»:
//  · 🔍 solo monta rejillas en criptos que AHORA van de lado (medido con la «eficiencia» de Kaufman: cuánto avanza el precio frente a
//    todo lo que se mueve; si avanza poco y se mueve mucho, va de lado) y con un rango diario que dé para ganar más que las comisiones
//  · 🧠 aprende sola: cada 15 min reprueba con los últimos 14 días qué separación entre escalones habría ganado en cada cripto, y solo
//    usa criptos y escalones que hayan ganado en las DOS mitades de esos días (la misma regla estricta que el resto)
//  · 🛑 se apaga sola si el precio rompe la rejilla por abajo, si empieza una tendencia o tras 72 h (y la vuelve a montar centrada)
// Las órdenes de la rejilla son órdenes limitadas: en Bitvavo pagan 0,15 % (las de mercado, 0,25 %).
export const MAKER = 0.0015, TAKER = 0.0025, START = 100, NIV = 8, MAXG = 3, PASOS = [0.008, 0.012, 0.016, 0.022, 0.03], VIDA_H = 72;
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4;
// v225 · tres submodos, cada uno con sus 100 € y su propio aprendizaje
export const PERF = {
  eq: { nombre: "⚖️ Equilibrada", pasos: PASOS, niv: NIV, maxg: MAXG, vida: VIDA_H, rmax: 0.12, m240: 0.02, txt: "escalones del 0,8 al 3 %, hasta 3 rejillas" },
  turbo: { nombre: "⚡ Turbo", pasos: [0.004, 0.005, 0.006, 0.008], niv: 12, maxg: 4, vida: 48, rmax: 0.08, m240: 0.015, txt: "escalones muy cortos (0,4–0,8 %): muchas más ventas, menos ganancia en cada una" },
  ancha: { nombre: "🌊 Ancha", pasos: [0.025, 0.035, 0.05], niv: 8, maxg: 3, vida: 168, rmax: 0.25, m240: 0.04, txt: "escalones grandes (2,5–5 %) para criptos muy movidas: pocas ventas pero gordas" } };
export const okP = (L, P = PERF.eq) => !!L && L.er < 0.12 && L.rango >= 0.025 && L.rango <= P.rmax && Math.abs(L.m240) < P.m240;

// ¿va de lado? c = velas de 5 min [[t,o,h,l,c,v],…]; mira las últimas 24 h (288 velas)
export function lateral(c, i = c.length - 1, P = PERF.eq) {
  if (i < 288) return null; let mov = 0, hi = -Infinity, lo = Infinity;
  for (let j = i - 287; j <= i; j++) { mov += Math.abs(c[j][4] - c[j - 1][4]); hi = Math.max(hi, c[j][2]); lo = Math.min(lo, c[j][3]); }
  const net = Math.abs(c[i][4] - c[i - 288][4]), er = mov > 0 ? net / mov : 1, rango = (hi - lo) / ((hi + lo) / 2), m240 = c[i][4] / c[i - 48][4] - 1;
  return { er: r4(er), rango: r4(rango), m240: r4(m240), ok: er < 0.12 && rango >= 0.025 && rango <= P.rmax && Math.abs(m240) < P.m240, tendencia: er > 0.3 && Math.abs(m240) > 0.03 };
}
// rejilla nueva centrada en el precio p: NIV escalones (la mitad por encima, ya comprados; la mitad por debajo, esperando a comprar)
export function nueva(p, paso, presupuesto, niv = NIV) {
  const u = presupuesto / niv, lv = [];
  for (let k = -niv / 2; k < niv / 2; k++) lv.push({ p: p * (1 + paso) ** k, q: 0, c: 0 });
  return { paso, u, lv, base: p };
}
// mueve la rejilla con un precio mínimo (lo) y máximo (hi) del intervalo; devuelve el efectivo que entra/sale y las ventas hechas
export function mover(G, lo, hi, fee = MAKER) {
  let caja = 0, ventas = 0, ganado = 0, fees = 0;
  for (const l of G.lv) {
    if (l.q > 0 && hi >= l.p * (1 + G.paso)) { const bruto = l.q * l.p * (1 + G.paso), got = bruto * (1 - fee); caja += got; fees += bruto * fee; ganado += got - l.c; ventas++; l.q = 0; l.c = 0; }
    else if (l.q === 0 && lo <= l.p) { l.q = G.u * (1 - fee) / l.p; l.c = G.u; caja -= G.u; fees += G.u * fee; }
  }
  return { caja, ventas, ganado, fees };
}
const rotaAbajo = (G, px) => px < G.lv[0].p * (1 - G.paso);
const todoVendido = (G) => G.lv.every((l) => l.q === 0);

// backtest de la rejilla en una cripto (velas de 5 min) con un paso; resultado en % del presupuesto, por mitades
export function probar(c, paso, sp = 0.001, desde = 0, hasta = Infinity, P = PERF.eq) {
  let G = null, caja = 0, t0 = 0, n = 0, res = 0; const out = [];
  const cerrar = (px) => { let v = caja; for (const l of G.lv) v += l.q * px * (1 - sp / 2) * (1 - TAKER); out.push(v); G = null; caja = 0; };
  for (let i = 289; i < c.length; i++) {
    const t = c[i][0]; if (t < desde || t >= hasta) { if (G && t >= hasta) cerrar(c[i][4]); continue; }
    if (G) {
      const r = mover(G, c[i][3], c[i][2]); caja += r.caja;
      if (rotaAbajo(G, c[i][4]) || (todoVendido(G) && c[i][4] > G.lv[G.lv.length - 1].p) || (t - t0) / 3600e3 >= P.vida || (i % 12 === 0 && (lateral(c, i, P) || {}).tendencia)) cerrar(c[i][4]);
      continue;
    }
    if (i % 12 === 0) { const L = lateral(c, i, P); if (L && L.ok && L.rango >= paso * 3) {
      const px = c[i][4] * (1 + sp / 2); G = nueva(c[i][4], paso, 1, P.niv); t0 = t; n++;
      // compra al momento los escalones de arriba (orden de mercado)
      for (const l of G.lv) if (l.p >= c[i][4] * 0.9999) { l.q = G.u * (1 - TAKER) / px; l.c = G.u; caja -= G.u; }
    } }
  }
  if (G) cerrar(c[c.length - 1][4]);
  const tot = out.reduce((s, x) => s + x, 0); return { n, pc: r2(tot * 100), med: n ? r4(tot / n * 100) : 0 };
}
// aprende: para cada cripto, el paso que más gana con la condición de ganar en las dos mitades de los días
export function aprender(H, P = PERF.eq) {
  const A = {};
  for (const [m, x] of Object.entries(H.m || {})) {
    const c = x.c; if (c.length < 600) continue; const corte = c[Math.floor(c.length / 2)][0]; let best = null;
    for (const paso of P.pasos) {
      const a = probar(c, paso, x.sp, 0, corte, P), b = probar(c, paso, x.sp, corte, Infinity, P), s = Math.min(a.pc, b.pc);
      if (!best || s > best.s) best = { paso, a, b, s };
    }
    if (best) A[m] = { paso: best.paso, a: best.a, b: best.b, ok: best.a.n >= 2 && best.b.n >= 2 && best.a.pc > 0 && best.b.pc > 0 };
  }
  return A;
}

export function fresh(now = new Date()) {
  return { v: 1, start: START, cash: START, g: {}, closed: [], log: [], eq: [], cool: {}, st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0, ventas: 0 }, since: now.toISOString(), apr: {}, aprAt: null };
}
const Lg = (R, now, ev, sym, txt) => { R.log.unshift({ t: now.toISOString(), ev, sym, txt }); R.log = R.log.slice(0, 200); };
const valorG = (G, bid) => G.caja + G.lv.reduce((s, l) => s + l.q * bid * (1 - TAKER), 0);
export function equity(R, tick) { let e = R.cash; for (const [m, G] of Object.entries(R.g)) e += valorG(G, (tick[m] && tick[m].bid) || G.last || G.base); return e; }

function cerrarG(R, m, now, bid, why) {
  const G = R.g[m], v = valorG(G, bid), pnl = v - G.pres; R.cash += v; R.st.pnl += pnl; if (pnl >= 0) R.st.wins++; else R.st.losses++;
  R.closed.unshift({ m, sym: m.replace("-EUR", ""), t0: G.t0, t1: now.toISOString(), cost: r2(G.pres), got: r2(v), pnl: r2(pnl), pc: r2((v / G.pres - 1) * 100), ventas: G.ventas, paso: G.paso, why }); R.closed = R.closed.slice(0, 300);
  R.cool[m] = now.getTime(); delete R.g[m];
  Lg(R, now, pnl >= 0 ? "WIN" : "LOSS", m.replace("-EUR", ""), `${pnl >= 0 ? "+" : ""}${r2(pnl)} € · ${G.ventas} ventas con ganancia · ${why}`);
}
// una vuelta (cada minuto). LAT: { mercado: lateral(...) } con velas cerradas
export function vuelta(R, tick, LAT, now = new Date(), P = PERF.eq, V = {}) {
  if (!R || R.v !== 1) { R = fresh(now); Lg(R, now, "INFO", "", `🪜 empieza la rejilla ${P.nombre} con 100 € ficticios: ${P.txt}`); }
  const t = now.getTime();
  // rejillas abiertas: se mueven con el precio de ahora (y el mínimo/máximo visto desde la vuelta anterior)
  for (const [m, G] of Object.entries(R.g)) {
    const tk = tick[m]; if (!tk) continue;
    // v231 · las órdenes limitadas de una rejilla también se ejecutan con los picos de dentro de cada vela (no solo con el precio de cada minuto):
    // se repasan las velas de 5 min cerradas desde la última vez (mínimo y máximo), en orden, y después el precio de ahora
    const r = { caja: 0, ventas: 0, ganado: 0, fees: 0 }, suma = (x) => { for (const k of Object.keys(r)) r[k] += x[k]; };
    G.vt = G.vt || Date.parse(G.t0) + 300e3;
    for (const c of V[m] || []) if (c[0] >= G.vt) { suma(mover(G, c[3], c[2])); G.vt = c[0] + 300e3; }
    suma(mover(G, tk.ask, tk.bid)); G.caja += r.caja; G.lastAsk = tk.ask; G.lastBid = tk.bid; G.last = tk.bid; R.st.fees += r.fees;
    if (r.ventas) { G.ventas += r.ventas; G.ganado += r.ganado; R.st.ventas += r.ventas; R.st.trades += r.ventas; R.vlog = [{ sym: m.replace("-EUR", ""), t: now.toISOString(), n: r.ventas, g: Math.round(r.ganado * 100) / 100, paso: G.paso }, ...(R.vlog || [])].slice(0, 200); Lg(R, now, "TP", m.replace("-EUR", ""), `vende ${r.ventas} escalón${r.ventas > 1 ? "es" : ""} (+${r2(G.paso * 100)} % cada uno) · +${r2(r.ganado)} €`); }
    const L = LAT[m];
    if (rotaAbajo(G, tk.bid)) cerrarG(R, m, now, tk.bid, "el precio ha roto la rejilla por abajo (empieza a caer): vende todo y espera");
    else if (todoVendido(G) && tk.bid > G.lv[G.lv.length - 1].p) cerrarG(R, m, now, tk.bid, "el precio ha salido por arriba con todo vendido: cobra y la vuelve a centrar");
    else if (L && L.tendencia) cerrarG(R, m, now, tk.bid, "ha empezado una tendencia: la rejilla ya no conviene");
    else if ((t - Date.parse(G.t0)) / 3600e3 >= P.vida) cerrarG(R, m, now, tk.bid, `${P.vida} h abierta: se cierra y se vuelve a centrar`);
  }
  // rejillas nuevas: criptos que van de lado ahora y cuyo paso aprendido ganó en las dos mitades
  const eq = equity(R, tick);
  const cand = Object.entries(LAT).filter(([m, L]) => okP(L, P) && !R.g[m] && tick[m] && R.apr[m] && R.apr[m].ok && L.rango >= R.apr[m].paso * 3 && !(R.cool[m] && t - R.cool[m] < 2 * 3600e3))
    .sort((a, b) => Math.min(R.apr[b[0]].a.pc, R.apr[b[0]].b.pc) - Math.min(R.apr[a[0]].a.pc, R.apr[a[0]].b.pc));
  for (const [m, L] of cand) {
    if (Object.keys(R.g).length >= P.maxg) break;
    const pres = Math.min(R.cash, eq / P.maxg); if (pres < 10) break; const tk = tick[m], paso = R.apr[m].paso;
    const G = Object.assign(nueva((tk.bid + tk.ask) / 2, paso, pres, P.niv), { t0: now.toISOString(), pres, caja: 0, ventas: 0, ganado: 0, lastAsk: tk.ask, lastBid: tk.bid, last: tk.bid });
    for (const l of G.lv) if (l.p >= G.base * 0.9999) { l.q = G.u * (1 - TAKER) / tk.ask; l.c = G.u; G.caja -= G.u; R.st.fees += G.u * TAKER; }
    G.caja += pres; R.cash -= pres; R.g[m] = G; R.st.trades++;
    Lg(R, now, "ENTER", m.replace("-EUR", ""), `rejilla de ${r2(pres)} €: ${P.niv} escalones cada ${r2(paso * 100)} % · va de lado (rango 24 h ${r2(L.rango * 100)} %, eficiencia ${r2(L.er)})`);
  }
  const e2 = equity(R, tick); R.eq.push([now.toISOString(), r2(e2)]); if (R.eq.length > 3000) R.eq = R.eq.filter((_, i) => i % 2 === 0 || i > R.eq.length - 500);
  R.lastEq = r2(e2); R.last = now.toISOString();
  R.vig = Object.entries(LAT).filter(([, L]) => L).map(([m, L]) => ({ sym: m.replace("-EUR", ""), m, er: L.er, rango: r2(L.rango * 100), lado: okP(L, P), apr: R.apr[m] ? { paso: r2(R.apr[m].paso * 100), a: R.apr[m].a.pc, b: R.apr[m].b.pc, ok: R.apr[m].ok } : null, dentro: !!R.g[m] }))
    .sort((a, b) => (b.dentro - a.dentro) || ((b.apr && b.apr.ok) - (a.apr && a.apr.ok)) || a.er - b.er).slice(0, 12);
  return R;
}
