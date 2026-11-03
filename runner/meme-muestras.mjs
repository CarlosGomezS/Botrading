// v176 · 📼 MUESTRAS: la bola aprende CONSTANTEMENTE aunque sus variantes no hayan comprado.
// Cada moneda candidata se guarda tal como estaba (datos de DexScreener, seguridad, Jupiter y GeckoTerminal) y se sigue su precio
// cada 10 min (con su máximo y su mínimo de cada tramo) durante 24 h. Con eso, CUALQUIER variante (también las recién nacidas) se puede probar al momento sobre cientos de casos
// reales ya vividos: entra si sus reglas y su nota la dejan, y sale con su stop, su venta parcial, su stop móvil y su tiempo máximo,
// pagando los mismos costes. Es una prueba sobre el pasado reciente; la prueba en vivo (ficticia) sigue mandando para el dinero real.
import { R, VIDEO, conGenoma, explorador, reglas, analista, RULES, NOMEME } from "./meme.mjs";

export const MAXSEG = 400, HORAS = 24, PASO_MIN = 10, MAXHECHAS = 700;
const r2 = (x) => Math.round(x * 100) / 100;
export function freshM() { return { v: 1, abiertas: {}, hechas: [] }; }
// foto mínima de la moneda (lo que necesitan explorador, reglas y analista)
export function foto(q) {
  return { priceUsd: q.priceUsd, pairCreatedAt: q.pairCreatedAt, marketCap: q.marketCap, fdv: q.fdv, liquidity: { usd: +(q.liquidity && q.liquidity.usd) || 0 },
    volume: { h1: +(q.volume && q.volume.h1) || 0, h24: +(q.volume && q.volume.h24) || 0 }, priceChange: { ...(q.priceChange || {}) }, txns: { h1: { ...((q.txns && q.txns.h1) || {}) } }, baseToken: { symbol: q.baseToken && q.baseToken.symbol } };
}
// añade candidatas nuevas y sigue el precio de las que ya se siguen
export function registrar(M, pre, by, ext, now) {
  const t = now.getTime();
  for (const [a, q] of pre) {
    if (M.abiertas[a] || NOMEME.has(a) || Object.keys(M.abiertas).length >= MAXSEG) continue;
    if (M.vistas && M.vistas[a] && t - M.vistas[a] < HORAS * 3600e3) continue;   // la misma moneda, como mucho una vez al día
    const info = (ext.rc || {})[a]; if (!info) continue;
    const g = (ext.gt || {})[a];
    M.abiertas[a] = { t0: t, px0: +q.priceUsd, q: foto(q), info, gt: g ? { ub: g.ub, us: g.us, b: g.b, s: g.s, buyers: [] } : null, jup: ((ext.jup || {})[a]) || null, p: [[0, 1]] };
    M.vistas = M.vistas || {}; M.vistas[a] = t;
  }
  for (const [a, m] of Object.entries(M.abiertas)) {
    const q = by[a], min = Math.round((t - m.t0) / 60000), last = m.p[m.p.length - 1];
    if (!q) { m.miss = (m.miss || 0) + 1; if (m.miss >= 60) { m.p.push([min, 0]); m.fin = "desaparecida"; } } else m.miss = 0;
    if (q && +q.priceUsd > 0) {
      const liq = +(q.liquidity && q.liquidity.usd) || 0, rel = +q.priceUsd / m.px0;
      // cada minuto se anotan el máximo y el mínimo; cada 5 min se guarda un punto [minuto, precio, máximo, mínimo] (relativos a la entrada)
      m.hi = Math.max(m.hi ?? rel, rel); m.lo = Math.min(m.lo ?? rel, rel);
      if (liq < R.rugLiq) { m.p.push([min, 0]); m.fin = "rug"; }
      else if (min - last[0] >= PASO_MIN) { m.p.push([min, +rel.toFixed(4), +m.hi.toFixed(4), +m.lo.toFixed(4)]); m.hi = m.lo = null; }
    }
    if (m.fin || t - m.t0 >= HORAS * 3600e3) { M.hechas.unshift({ a, t0: m.t0, q: m.q, info: m.info, gt: m.gt, jup: m.jup, p: m.p, fin: m.fin || "24h" }); delete M.abiertas[a]; }
  }
  M.hechas = M.hechas.slice(0, MAXHECHAS);
  for (const [a, tv] of Object.entries(M.vistas || {})) if (t - tv > 2 * HORAS * 3600e3) delete M.vistas[a];
}
// simula una operación de una variante sobre una muestra; devuelve el % final (con costes) o null si no habría entrado
export function simular(g, s, S0 = { smart: {}, hold: {} }) {
  return conGenoma(g, () => {
    const G = { ...VIDEO, ...g }, t0 = s.t0;
    if (explorador(s.q, t0)) return null;
    const rr = reglas(s.q, s.info); if (!s.info || s.info.rugged || RULES.some(([k]) => rr[k] !== true)) return null;
    if (G.orgMin > 0 && s.jup && s.jup.org != null && s.jup.org < G.orgMin) return null;
    const an = analista(S0, "x", s.q, s.info, s.gt, t0, s.jup); if (an.sc < G.minScore) return null;
    const amt = R.start * G.size, liq = +s.q.liquidity.usd || 1, sl = Math.min(R.slipMax, R.slipMin + amt / liq);
    const ent = (1 + sl) / (1 - R.fee) + R.fixFee / amt;   // lo que cuesta entrar, por unidad de precio
    const sale = (rel) => rel <= 0 ? 0 : rel * (1 - Math.min(R.slipMax, R.slipMin + amt * rel / liq)) * (1 - R.fee) - R.fixFee / amt;
    let q = 1, cobrado = 0, peak = 1, tr = false, tp1 = false, prev = 1;
    // al saltar un stop dentro de un tramo se vende al nivel del stop; si el tramo ya empezó por debajo (hueco), al precio de ese momento
    const nivel = (lv, rel) => (prev >= lv ? lv : Math.min(rel, prev));
    for (let i = 1; i < s.p.length; i++) {
      const [min, rel, hi = rel, lo = rel] = s.p[i];
      if (rel === 0) return r2((cobrado + 0) / ent - 1);   // rug: se pierde lo que quedaba
      peak = Math.max(peak, hi);
      if (!tr && peak >= 1 + G.trailOn) tr = true;
      if (G.tpFrac > 0 && !tp1 && hi >= 1 + G.tp) { cobrado += q * G.tpFrac * sale(1 + G.tp); q *= 1 - G.tpFrac; tp1 = true; }
      if (lo <= 1 - G.stop) return r2((cobrado + q * sale(nivel(1 - G.stop, rel))) / ent - 1);
      if (tr && lo <= peak * (1 - G.trail)) return r2((cobrado + q * sale(nivel(peak * (1 - G.trail), rel))) / ent - 1);
      if (min / 60 >= G.maxHoldH) return r2((cobrado + q * sale(rel)) / ent - 1);
      prev = rel;
    }
    const last = s.p[s.p.length - 1][1]; return r2((cobrado + q * sale(last)) / ent - 1);
  });
}
// prueba una variante sobre todas las muestras completas: nº de operaciones, % de acierto, media, factor de beneficio y su «t»
export function backtest(g, M) {
  const rs = []; for (const s of M.hechas || []) { const r = simular(g, s); if (r != null) rs.push(r); }
  const n = rs.length; if (!n) return { n: 0 };
  const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(Math.max(1e-9, rs.reduce((a, b) => a + (b - m) ** 2, 0) / n)), w = rs.filter((x) => x > 0), l = rs.filter((x) => x <= 0);
  const gw = w.reduce((a, b) => a + b, 0), gl = -l.reduce((a, b) => a + b, 0);
  return { n, win: r2(w.length / n * 100), med: r2(m * 100), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, t: r2(m / (sd / Math.sqrt(n))) };
}
