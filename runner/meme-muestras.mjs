// v176 · 📼 MUESTRAS: la bola aprende CONSTANTEMENTE aunque sus variantes no hayan comprado.
// Cada moneda candidata se guarda tal como estaba (datos de DexScreener, seguridad, Jupiter y GeckoTerminal) y se sigue su precio
// cada 10 min (con su máximo y su mínimo de cada tramo) durante 24 h. Con eso, CUALQUIER variante (también las recién nacidas) se puede probar al momento sobre cientos de casos
// reales ya vividos: entra si sus reglas y su nota la dejan, y sale con su stop, su venta parcial, su stop móvil y su tiempo máximo,
// pagando los mismos costes. Es una prueba sobre el pasado reciente; la prueba en vivo (ficticia) sigue mandando para el dinero real.
import { ESC, R, VIDEO, conGenoma, explorador, reglas, analista, RULES, NOMEME } from "./meme.mjs";

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
    let q = 1, cobrado = 0, peak = 1, tr = false, tp1 = false, prev = 1, esc = 0;
    // al saltar un stop dentro de un tramo se vende al nivel del stop; si el tramo ya empezó por debajo (hueco), al precio de ese momento
    const nivel = (lv, rel) => (prev >= lv ? lv : Math.min(rel, prev));
    for (let i = 1; i < s.p.length; i++) {
      const [min, rel, hi = rel, lo = rel] = s.p[i];
      if (rel === 0) return r2((cobrado + 0) / ent - 1);   // rug: se pierde lo que quedaba
      peak = Math.max(peak, hi);
      if (!tr && peak >= 1 + G.trailOn) tr = true;
      if (G.tpFrac > 0 && !tp1 && hi >= 1 + G.tp) { cobrado += q * G.tpFrac * sale(1 + G.tp); q *= 1 - G.tpFrac; tp1 = true; }
      while (G.esc > 0 && esc < ESC.length && hi >= ESC[esc]) { cobrado += q * G.esc * sale(ESC[esc]); q *= 1 - G.esc; esc++; }
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
  const rs = [], ws = []; for (const s of M.hechas || []) { const r = simular(g, s); if (r != null) { rs.push(r); ws.push(1); } }
  let nh = 0; for (const s of M.hist || []) { const r = simular(g, s); if (r != null) { rs.push(r); ws.push(0.5); nh++; } }   // los de historia valen la mitad
  const n = rs.length; if (!n) return { n: 0 };
  const W = ws.reduce((a, b) => a + b, 0), m = rs.reduce((a, b, i) => a + b * ws[i], 0) / W, sd = Math.sqrt(Math.max(1e-9, rs.reduce((a, b, i) => a + ws[i] * (b - m) ** 2, 0) / W));
  let gw = 0, gl = 0, nw = 0; rs.forEach((x, i) => { if (x > 0) { gw += x * ws[i]; nw += ws[i]; } else gl -= x * ws[i]; });
  return { n, nh, win: r2(nw / W * 100), med: r2(m * 100), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, t: r2(m / (sd / Math.sqrt(W))) };
}

// ---------- v178 · 📚 CASOS DE HISTORIA: para acelerar muchísimo el aprendizaje ----------
// De cada moneda ya comprobada (con datos de seguridad) se descargan sus velas de 5 min de los últimos ~3 días (GeckoTerminal)
// y se crean casos «como si hubiéramos estado ahí» cada hora: con el precio, el impulso y el volumen de ESE momento y lo que pasó
// las 24 h siguientes (con máximos y mínimos de cada tramo). Límites honestos: la seguridad, la liquidez y la actividad de Jupiter
// son las de hoy (no las de entonces) y las compras/ventas se estiman con las velas; y solo se ven monedas que siguen vivas
// (las que murieron del todo ya no dan velas), así que estos casos son algo optimistas: por eso valen la mitad que los vividos en directo.
export const HIST_MAX = 2000, HIST_POR_MONEDA = 40;
export function casosHistoria(a, q, info, jup, velas) {
  const c = (velas || []).map((x) => ({ t: +x[0] * 1000, o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })).filter((x) => x.c > 0).sort((x, y) => x.t - y.t);
  if (c.length < 60 || !info) return [];
  const now = c[c.length - 1], liq = +(q.liquidity && q.liquidity.usd) || 0, mcNow = +(q.marketCap || q.fdv) || 0, out = [];
  const ch = (i, k) => (i - k >= 0 ? (c[i].c / c[i - k].c - 1) * 100 : (c[i].c / c[0].c - 1) * 100);
  for (let i = 12; i < c.length - 12 && out.length < HIST_POR_MONEDA; i += 12) {
    let v1 = 0, v24 = 0, b = 0, s = 0; for (let k = Math.max(0, i - 287); k <= i; k++) { v24 += c[k].v; if (k > i - 12) { v1 += c[k].v; if (c[k].c >= c[k].o) b += c[k].v; else s += c[k].v; } }
    const tx = Math.max(1, Math.round(v1 / 500)), bf = b + s > 0 ? b / (b + s) : 0.5;
    const foto = { priceUsd: String(c[i].c), pairCreatedAt: +q.pairCreatedAt || 0, marketCap: mcNow * c[i].c / now.c, fdv: null, liquidity: { usd: liq }, volume: { h1: v1, h24: v24 },
      priceChange: { m5: ch(i, 1), h1: ch(i, 12), h6: ch(i, 72), h24: ch(i, 288) }, txns: { h1: { buys: Math.round(tx * bf), sells: Math.round(tx * (1 - bf)) } }, baseToken: { symbol: q.baseToken && q.baseToken.symbol } };
    const p = [[0, 1]]; let hi = 0, lo = 1e9;
    for (let k = i + 1; k < c.length && c[k].t - c[i].t <= HORAS * 3600e3; k++) {
      hi = Math.max(hi, c[k].h / c[i].c); lo = Math.min(lo, c[k].l / c[i].c);
      if ((k - i) % 6 === 0 || k === c.length - 1) { p.push([Math.round((c[k].t - c[i].t) / 60000), +(c[k].c / c[i].c).toFixed(4), +hi.toFixed(4), +lo.toFixed(4)]); hi = 0; lo = 1e9; }
    }
    if (p.length < 3) continue;
    out.push({ a, t0: c[i].t, q: foto, info, gt: null, jup: jup ? { org: jup.org, traders: null, organicBuyers: null, holderChg: null } : null, p, fin: "historia", hist: 1 });
  }
  return out;
}
export function anadirHistoria(M, casos) {
  M.hist = (M.hist || []).filter((x) => !casos.length || x.a !== casos[0].a).concat(casos);
  if (M.hist.length > HIST_MAX) M.hist = M.hist.slice(M.hist.length - HIST_MAX);
  M.histHechas = M.histHechas || {}; if (casos.length) M.histHechas[casos[0].a] = Date.now();
}
