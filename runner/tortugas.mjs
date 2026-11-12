// v304 · 🐢 TORTUGAS (Richard Dennis, 1983): compra cuando una cripto cierra por encima de su MÁXIMO de 20 días (ruptura), con tamaño según su
// volatilidad (N = rango medio de 20 días) para arriesgar lo mismo en cada una. Sale con el MÍNIMO de 10 días o con un stop de 2N (como mucho −8 %).
// Regla de la casa: si toca salir por señal pero la venta NO cubre las comisiones, espera (hasta 7 días) a que las cubra; el stop SIEMPRE se respeta.
// Se aplica a las ~20 criptos más líquidas de CADA exchange con sus propias velas diarias y sus propias comisiones, y se examina con 2 años.
import { BASE as OKX_API } from "./okx.mjs";

const BV = "https://api.bitvavo.com/v2";
export const T_ENTRA = 20, T_SALE = 10, T_N = 20, T_RIESGO = 0.015, T_MAXPOS = 4, T_STOPMAX = 0.08, T_ESPERA_D = 7;
export const FEES = { bitvavo: 0.0025, okx: 0.001 };
// v320 · 🌍 TODAS las criptos que se pueden operar con un mínimo de liquidez (volumen de 24 h ≥ 50.000 € y diferencia compra/venta < 0,8 %), hasta 150
export const UNI_VOL = 1000, UNI_SP = 0.015, UNI_MAX = 2000, UNI_ENTRA = 50000, SP_MIN = 0.0015;   // v456 · 💧 solo se ENTRA en criptos con ≥ 50.000 €/día (las de menos se siguen vigilando para poder salir de lo ya comprado); deslizamiento por cripto con suelo del 0,15 %   // v352 · 🌍 TODAS las criptos del exchange con algo de mercado (≥1.000 €/día y diferencia compra-venta ≤1,5 %, la misma que se exige al comprar)
export const universo = (tick, extra = () => true, minVol = UNI_VOL) => Object.entries(tick).filter(([m, x]) => x && x.vq >= minVol && x.sp < UNI_SP && !/^(USDC|EURC|USDT|EUROC|DAI|PYUSD)-/.test(m) && m !== "USDC-EUR" && extra(m, x)).sort((a, b) => b[1].vq - a[1].vq).slice(0, UNI_MAX);
// v313 · 🧠 las Tortugas APRENDEN: estos son sus «genes». El examen largo prueba muchas combinaciones con el 1.er año y solo cambia si la nueva
// gana TAMBIÉN en el 2.º año (que no ha visto) a la que está en uso. Así mejora sola sin «ajustarse» al pasado.
export const P0 = { ent: T_ENTRA, sale: T_SALE, kN: 2, stopMax: T_STOPMAX, filtro: false, maxPos: T_MAXPOS, mFil: 50, atrMax: 0, tp: 0, tpFrac: 1, vol: 0, rsiMax: 0, comp: 0, momD: 0, cazar: 0, espera: T_ESPERA_D };   // v456 · espera: días que aguanta una salida que no cubre comisiones (0 = sale ya; se aprende)   // v413 · + filtros de entrada nuevos (volumen, RSI, compresión, tendencia larga, no perseguir)   // v323 · + recoger ganancias (tp: +5/10/20 %, toda o la mitad)   // v317 · + media del filtro de BTC y tope de volatilidad
export const conP = (P) => ({ ...P0, ...(P || {}) });
// v318 · 🎚️ PERFILES DE RIESGO: cada uno evoluciona sus PROPIAS reglas. «alto» = máximo riesgo: pocas criptos a la vez y casi todo el dinero
// en cada una; busca la que más gana aunque caiga mucho por el camino (hasta un 70 %).
export const PERFILES = {
  bajo: { nombre: "🟢 Bajo", r: 0.01, tMax: 0.15, ddMax: 30, peso: 1.0, maxPosMin: 4 },
  medio: { nombre: "🟡 Medio", r: 0.015, tMax: 0.25, ddMax: 50, peso: 0.5, maxPosMin: 2 },
  alto: { nombre: "🔴 Máximo", r: 0.25, tMax: 1, ddMax: 70, peso: 0.15, maxPosMin: 1 } };
export const perfil = (k) => PERFILES[k] || PERFILES.medio;
export const tamano = (V, stopPct, P) => { const F = perfil(P && P.riesgo); return Math.min(Math.max((F.r * V) / stopPct, 0.10 * V), V / conP(P).maxPos, F.tMax * V); };   // comisión por orden (a mercado) de cada exchange
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
export function senal(d, P) { P = conP(P); const i = d.length - 1; if (i < Math.max(P.ent, T_N) + 2) return null; let hi = -Infinity, lo = Infinity; for (let j = i - P.ent; j < i; j++) hi = Math.max(hi, d[j][2]); for (let j = Math.max(0, i - P.sale); j < i; j++) lo = Math.min(lo, d[j][3]);
  let m50 = 0; const n50 = Math.min(50, i + 1); for (let j = i - n50 + 1; j <= i; j++) m50 += d[j][4]; m50 /= n50;
  let mF = 0; const nF = Math.min(P.mFil, i + 1); for (let j = i - nF + 1; j <= i; j++) mF += d[j][4]; mF /= nF;
  const N = atr(d, i, T_N), c = d[i][4]; return { t: d[i][0], c, N, hi20: hi, lo10: lo, entra: c > hi && filtrosOk(d, i, P), sale: c < lo, sobre50: c > m50, sobreF: c > mF }; }

// v320 · ⚡ cálculos por cripto guardados (para examinar 150 criptos × cientos de reglas en minutos): máximos, mínimos, medias y N
const CACHE = new WeakMap();
function pre(d) { let c = CACHE.get(d); if (c) return c; const n = d.length, tr = new Float64Array(n), N = new Float64Array(n).fill(NaN);
  for (let j = 1; j < n; j++) tr[j] = Math.max(d[j][2] - d[j][3], Math.abs(d[j][2] - d[j - 1][4]), Math.abs(d[j][3] - d[j - 1][4]));
  let s = 0; for (let i = 1; i < n; i++) { s += tr[i]; if (i - T_N >= 1) s -= tr[i - T_N]; if (i >= T_N) N[i] = s / T_N; }
  c = { N, hi: {}, lo: {}, me: {} }; CACHE.set(d, c); return c; }
const hiDe = (d, k) => { const c = pre(d); if (c.hi[k]) return c.hi[k]; const o = new Float64Array(d.length).fill(-Infinity); for (let i = 1; i < d.length; i++) { let m = -Infinity; for (let j = Math.max(0, i - k); j < i; j++) m = Math.max(m, d[j][2]); o[i] = m; } return (c.hi[k] = o); };
const loDe = (d, k) => { const c = pre(d); if (c.lo[k]) return c.lo[k]; const o = new Float64Array(d.length).fill(Infinity); for (let i = 1; i < d.length; i++) { let m = Infinity; for (let j = Math.max(0, i - k); j < i; j++) m = Math.min(m, d[j][3]); o[i] = m; } return (c.lo[k] = o); };
const meDe = (d, k) => { const c = pre(d); if (c.me[k]) return c.me[k]; const o = new Float64Array(d.length); let s = 0; for (let i = 0; i < d.length; i++) { s += d[i][4]; if (i >= k) s -= d[i - k][4]; o[i] = s / Math.min(k, i + 1); } return (c.me[k] = o); };
// v413 · 🧪 FILTROS DE ENTRADA NUEVOS (los usan igual el examen y el bot real, porque van dentro de la señal):
//   vol    → la ruptura tiene que venir con volumen: el de hoy ≥ vol × la media de los 20 días anteriores
//   rsiMax → no compra si ya está demasiado estirada (RSI de 14 días por encima de rsiMax)
//   comp   → solo rupturas tras una calma: volatilidad de 10 días < comp × la de 60 días (el día antes)
//   momD   → solo si en los últimos momD días ha subido (tendencia larga a favor)
//   cazar  → no la persigue si en los últimos 5 días ya ha subido más de un cazar (p. ej. 0,3 = 30 %)
const vmDe = (d) => { const c = pre(d); if (c.vm) return c.vm; const o = new Float64Array(d.length).fill(NaN); let s = 0; for (let i = 0; i < d.length; i++) { if (i >= 1) { s += d[i - 1][5] || 0; if (i - 21 >= 0) s -= d[i - 21][5] || 0; } if (i >= 21) o[i] = s / 20; } return (c.vm = o); };
const rsiDe = (d) => { const c = pre(d); if (c.rsi) return c.rsi; const o = new Float64Array(d.length).fill(NaN); let g = 0, l = 0; for (let i = 1; i < d.length; i++) { const x = d[i][4] - d[i - 1][4], up = Math.max(x, 0), dn = Math.max(-x, 0); if (i <= 14) { g += up / 14; l += dn / 14; if (i === 14) o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * 13 + up) / 14; l = (l * 13 + dn) / 14; o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return (c.rsi = o); };
const avDe = (d, k) => { const c = pre(d); c.av = c.av || {}; if (c.av[k]) return c.av[k]; const o = new Float64Array(d.length).fill(NaN); let s = 0; for (let i = 1; i < d.length; i++) { const t = Math.abs(d[i][4] / d[i - 1][4] - 1); s += t; if (i - k >= 1) s -= Math.abs(d[i - k][4] / d[i - k - 1][4] - 1); if (i >= k) o[i] = s / k; } return (c.av[k] = o); };
export function filtrosOk(d, i, P) { P = conP(P);
  if (P.vol > 0) { const vm = vmDe(d)[i]; if (!(vm > 0) || !((d[i][5] || 0) >= P.vol * vm)) return false; }
  if (P.rsiMax > 0) { const r = rsiDe(d)[i]; if (!(r < P.rsiMax)) return false; }
  if (P.comp > 0) { if (i < 62) return false; const a = avDe(d, 10)[i - 1], b = avDe(d, 60)[i - 1]; if (!(b > 0) || !(a < P.comp * b)) return false; }
  if (P.momD > 0) { if (i < P.momD) return false; if (!(d[i][4] > d[i - P.momD][4])) return false; }
  if (P.cazar > 0) { if (i < 5) return false; if (d[i][4] / d[i - 5][4] - 1 > P.cazar) return false; }
  return true; }
// la misma señal que senal(), pero leyendo lo guardado (idéntica para i ≥ 20)
export function senalRapida(d, i, P) { if (i < Math.max(P.ent, T_N) + 2) return null; const c = d[i][4], N = pre(d).N[i]; return { c, N, entra: c > hiDe(d, P.ent)[i] && filtrosOk(d, i, P), sale: c < loDe(d, P.sale)[i], sobreF: c > meDe(d, P.mFil)[i] }; }

// 🧪 SIMULACIÓN DE CARTERA con las reglas EXACTAS del real: dinero compartido, como mucho 4 a la vez, tamaño por volatilidad (10-25 %),
// comisión del exchange y medio spread en cada orden, salida por mínimo de 10 días solo si cubre comisiones (si no, espera ≤ 7 días), stop 2N (≤ −8 %).
// v456 · diferencia compra-venta de HOY de cada cripto (la API no da la de hace 2 años): se asocia a cada juego de velas; con costes dobles se dobla
const SPREADS = new WeakMap();
export function fijaSpreads(series, tick) { const o = {}; for (const m of Object.keys(series)) { const x = tick && tick[m]; if (x && x.sp > 0) o[m] = x.sp; } SPREADS.set(series, o); return o; }
export function simula(series, fee, spread = 0.002, P = null, desde = 0, hasta = Infinity) { P = conP(P);
  const dias = [...new Set(Object.values(series).flatMap((d) => d.map((x) => x[0])))].filter((t) => t >= desde && t < hasta).sort((a, b) => a - b), idx = {}, BTC = series["BTC-EUR"];
  for (const [m, d] of Object.entries(series)) { idx[m] = new Map(d.map((x, i) => [x[0], i])); }
  let cash = 1, pos = {}, pico = 1, dd = 0, n = 0, gan = 0, gb = 0, pb = 0; const curva = [], SPm = SPREADS.get(series) || null, kSp = spread / 0.002, spd = (m) => (SPm ? Math.max(SP_MIN, SPm[m] ?? 0.002) * kSp : spread), cs = (m) => fee + spd(m) / 2;   // v456 · deslizamiento de CADA cripto (su diferencia compra-venta de hoy, mínimo 0,15 %)
  const valor = (t) => cash + Object.entries(pos).reduce((s, [m, p]) => { const i = idx[m].get(t); return s + p.q * (i != null ? series[m][i][4] : p.ult); }, 0);
  for (const t of dias) {
    for (const [m, p] of Object.entries(pos)) { const i = idx[m].get(t); if (i == null) continue; const d = series[m], x = d[i]; p.ult = x[4];
      const lo = loDe(d, P.sale)[i];
      if (P.tp > 0 && !p.tpHecho && x[2] >= p.px * (1 + P.tp) && !(x[3] <= p.stop)) { const pt = Math.max(x[1], p.px * (1 + P.tp)), fr = P.tpFrac >= 1 ? 1 : P.tpFrac, qv = p.q * fr, got = qv * pt * (1 - cs(m)), co = p.coste * fr;
        cash += got; if (fr >= 1) { if (got > co) { gan++; gb += got - co; } else pb += co - got; delete pos[m]; continue; } gb += Math.max(0, got - co); p.q -= qv; p.coste -= co; p.tpHecho = 1; }   /* v323 · 💰 recoge ganancias */
      let px = null; if (x[3] <= p.stop) px = Math.min(x[1], p.stop); else if (x[4] < lo) { const neto = (x[4] * (1 - cs(m))) / p.px - 1; if (neto > 0 || t - p.t0 > (P.espera ?? T_ESPERA_D) * 86400e3) px = x[4]; }
      if (px != null) { const got = p.q * px * (1 - cs(m)); cash += got; const r = got / p.coste - 1; if (r > 0) { gan++; gb += got - p.coste; } else pb += p.coste - got; delete pos[m]; } }
    const V = valor(t);
    for (const [m, d] of Object.entries(series)) { if (pos[m] || Object.keys(pos).length >= P.maxPos) continue; const i = idx[m].get(t); if (i == null || i < P.ent + 2) continue; const s = senalRapida(d, i, P);
      if (s && s.entra && P.filtro && BTC) { const ib = idx["BTC-EUR"].get(t); const sb = ib != null ? senalRapida(BTC, ib, P) : null; if (!sb || !sb.sobreF) continue; }
      if (s && s.entra && P.atrMax > 0 && s.N / s.c > P.atrMax) continue;   /* v317 · demasiado nerviosa */
      if (!s || !s.entra || !(s.N > 0)) continue;
      const stopD = Math.min(P.kN * s.N, s.c * P.stopMax); let eur = tamano(V, stopD / s.c, P); eur = Math.min(eur, cash); if (eur < 0.05 * V) continue;
      const px = s.c * (1 + spd(m) / 2); cash -= eur; pos[m] = { q: (eur * (1 - fee)) / px, px, coste: eur, stop: s.c - stopD, t0: t, ult: s.c }; n++; }
    const V2 = valor(t); pico = Math.max(pico, V2); dd = Math.max(dd, 1 - V2 / pico); curva.push([t, V2]); }
  const fin = curva.length ? curva[curva.length - 1][1] : 1, q = [0, 1, 2, 3].map((j) => { const a = Math.floor((curva.length * j) / 4), b = Math.floor((curva.length * (j + 1)) / 4) - 1; return curva.length ? Math.round((curva[b][1] / (j ? curva[a - 1][1] : 1) - 1) * 10000) / 100 : 0; });
  return { ret: Math.round((fin - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, n, aciertos: n ? Math.round((gan / n) * 100) : 0, pf: pb > 0 ? Math.round((gb / pb) * 100) / 100 : gb > 0 ? 99 : 0, semestres: q, curva };
}
// v322 · 🤝 COMITÉ DE MÉTODOS: varias reglas aprobadas votan cada día. Cada cripto que alguna quiere se compra UNA vez, con más dinero
// cuantas más reglas coinciden (1 voto → base; cada voto más → +extra; tope 60 %). Stop: el más ajustado de las que votaron.
// Sale cuando la MAYORÍA de las que votaron dan salida (con ganancia neta, o tras 7 días) o salta el stop.
export function senalP(series, idx, m, d, i, t, P, BTC) { if (i == null || i < P.ent + 2) return null; const s = senalRapida(d, i, P); if (!s) return null;
  if (s.entra && P.filtro && BTC) { const ib = idx["BTC-EUR"].get(t); const sb = ib != null ? senalRapida(BTC, ib, P) : null; if (!sb || !sb.sobreF) s.entra = false; }
  if (s.entra && P.atrMax > 0 && s.N / s.c > P.atrMax) s.entra = false; return s; }
export function simulaComite(series, fee, spread = 0.002, Ps = [], desde = 0, hasta = Infinity, O = {}) { const { maxPos = 6, base = 0.2, extra = 0.15, tope = 0.6 } = O; Ps = Ps.map(conP);
  const dias = [...new Set(Object.values(series).flatMap((d) => d.map((x) => x[0])))].filter((t) => t >= desde && t < hasta).sort((a, b) => a - b), idx = {}, BTC = series["BTC-EUR"];
  for (const [m, d] of Object.entries(series)) idx[m] = new Map(d.map((x, i) => [x[0], i]));
  let cash = 1, pos = {}, pico = 1, dd = 0, n = 0, gan = 0, gb = 0, pb = 0, votos = 0; const curva = [], cst = fee + spread / 2;
  const valor = (t) => cash + Object.entries(pos).reduce((s, [m, p]) => { const i = idx[m].get(t); return s + p.q * (i != null ? series[m][i][4] : p.ult); }, 0);
  for (const t of dias) {
    for (const [m, p] of Object.entries(pos)) { const i = idx[m].get(t); if (i == null) continue; const d = series[m], x = d[i]; p.ult = x[4];
      let px = null; if (x[3] <= p.stop) px = Math.min(x[1], p.stop); else { const salen = p.reglas.filter((k) => x[4] < loDe(d, Ps[k].sale)[i]).length; if (salen * 2 > p.reglas.length) { const neto = (x[4] * (1 - cst)) / p.px - 1; if (neto > 0 || t - p.t0 > T_ESPERA_D * 86400e3) px = x[4]; } }
      if (px != null) { const got = p.q * px * (1 - cst); cash += got; if (got > p.coste) { gan++; gb += got - p.coste; } else pb += p.coste - got; delete pos[m]; } }
    const V = valor(t), cand = [];
    for (const [m, d] of Object.entries(series)) { if (pos[m]) continue; const i = idx[m].get(t), reglas = [], stops = []; let s0 = null;
      for (let k = 0; k < Ps.length; k++) { const s = senalP(series, idx, m, d, i, t, Ps[k], BTC); if (s && s.entra && s.N > 0) { reglas.push(k); stops.push(Math.min(Ps[k].kN * s.N, s.c * Ps[k].stopMax)); s0 = s; } }
      if (reglas.length) cand.push({ m, reglas, s: s0, stopD: Math.min(...stops) }); }
    cand.sort((a, b) => b.reglas.length - a.reglas.length);
    for (const c of cand) { if (Object.keys(pos).length >= maxPos) break; let eur = Math.min(V * Math.min(tope, base + extra * (c.reglas.length - 1)), cash); if (eur < 0.05 * V) continue;
      const px = c.s.c * (1 + spread / 2); cash -= eur; pos[c.m] = { q: (eur * (1 - fee)) / px, px, coste: eur, stop: c.s.c - c.stopD, t0: t, ult: c.s.c, reglas: c.reglas }; n++; votos += c.reglas.length; }
    const V2 = valor(t); pico = Math.max(pico, V2); dd = Math.max(dd, 1 - V2 / pico); curva.push([t, V2]); }
  const fin = curva.length ? curva[curva.length - 1][1] : 1, q = [0, 1, 2, 3].map((j) => { const a = Math.floor((curva.length * j) / 4), b = Math.floor((curva.length * (j + 1)) / 4) - 1; return curva.length ? Math.round((curva[b][1] / (j ? curva[a - 1][1] : 1) - 1) * 10000) / 100 : 0; });
  return { ret: Math.round((fin - 1) * 10000) / 100, dd: Math.round(dd * 10000) / 100, n, aciertos: n ? Math.round((gan / n) * 100) : 0, pf: pb > 0 ? Math.round((gb / pb) * 100) / 100 : gb > 0 ? 99 : 0, semestres: q, votosMedios: n ? Math.round((votos / n) * 10) / 10 : 0 }; }

// v305 · tamaño completo, elegido por ti: se acepta una caída de hasta el 50 % por el camino (las Tortugas ganan con pocas operaciones grandes)
export const T_DDMAX = 50;
export function veredicto(r, ddMax = T_DDMAX) { const ok = r.n >= 30 && r.ret > 0 && r.pf >= 1.2 && r.dd < ddMax && r.semestres.filter((x) => x > 0).length >= 2;
  return { ok, motivo: ok ? "aprueba 2 años" : r.n < 30 ? "pocas operaciones" : r.ret <= 0 ? "en 2 años pierde" : r.pf < 1.2 ? "gana poco por cada euro perdido" : r.dd >= ddMax ? "cae demasiado" : "pierde en 3 de 4 semestres" }; }

// v313 · 🧠 APRENDIZAJE de las Tortugas (sin trampas): elige la mejor combinación SOLO con el 1.er año y la compara con la que está en uso en el 2.º año.
// Cambia solo si la nueva gana en el 2.º año por ≥ 3 puntos, no cae más y aprueba los 2 años completos. Si no, sigue la que había.
export function genes() { const out = []; for (const ent of [20, 30, 55]) for (const sale of [10, 20]) for (const kN of [2, 3]) for (const stopMax of [0.08, 0.12]) for (const filtro of [false, true]) if (sale < ent) out.push({ ent, sale, kN, stopMax, filtro, maxPos: T_MAXPOS }); return out; }
const nota = (r, peso = 0.5) => r.ret - peso * r.dd;
// v317 · 🧬 EVOLUCIÓN: en cada examen nacen ~200 reglas nuevas (hijas mutadas y cruzadas de las mejores guardadas + algunas al azar).
// Se eligen SOLO con el 1.er año. Para sustituir a la que está en uso, la mejor tiene que:
//  1) ganar en el 2.º año (que no vio) por ≥ 3 puntos a la que está en uso, sin caer más;
//  2) aprobar los 2 años completos;
//  3) no perder con las criptos del OTRO exchange (lección de la caza: si solo gana con un grupo de criptos, es suerte);
//  4) no ir peor que la que está en uso en los últimos 4 meses (mercado actual).
const GEN = { ent: [10, 15, 20, 25, 30, 40, 55, 70, 100], sale: [5, 7, 10, 15, 20, 30, 40], kN: [1.5, 2, 2.5, 3, 4], stopMax: [0.05, 0.06, 0.08, 0.1, 0.12, 0.15], filtro: [false, true], maxPos: [1, 2, 3, 4, 5, 6], mFil: [20, 50, 100, 200], atrMax: [0, 0.04, 0.06, 0.1], tp: [0, 0, 0.05, 0.1, 0.2], tpFrac: [0.5, 1], vol: [0, 0, 1.5, 2, 3], rsiMax: [0, 0, 70, 80, 90], comp: [0, 0, 0.7, 0.85], momD: [0, 0, 60, 120], cazar: [0, 0, 0.15, 0.3], espera: [0, 7] };
export const GENES = GEN;
const valido = (P) => P.sale < P.ent && P.maxPos >= perfil(P.riesgo).maxPosMin;
export function hijas(padres, n, rnd = Math.random, riesgo = "medio") { const pick = (a) => a[Math.floor(rnd() * a.length)], out = [], vistos = new Set(padres.map((p) => JSON.stringify(conP(p))));
  for (let k = 0; out.length < n && k < n * 20; k++) { let P; const u = rnd();
    if (u < 0.2 || !padres.length) P = Object.fromEntries(Object.entries(GEN).map(([g, v]) => [g, pick(v)]));   // al azar
    else if (u < 0.55 && padres.length > 1) { const a = conP(pick(padres)), b = conP(pick(padres)); P = Object.fromEntries(Object.keys(GEN).map((g) => [g, rnd() < 0.5 ? a[g] : b[g]])); }   // cruce
    else { P = { ...conP(pick(padres)) }; const m = 1 + Math.floor(rnd() * 2); for (let q = 0; q < m; q++) { const g = pick(Object.keys(GEN)), v = GEN[g], i = v.indexOf(P[g]); P[g] = i < 0 ? pick(v) : v[Math.max(0, Math.min(v.length - 1, i + (rnd() < 0.5 ? -1 : 1)))]; } }   // mutación
    P = conP({ ...P, riesgo }); const key = JSON.stringify(P); if (!valido(P) || vistos.has(key)) continue; vistos.add(key); out.push(P); }
  return out; }
export function aprende(series, fee, actual, opts = {}) {
  const { otra = null, feeOtra = fee, pob = [], n = 200, rnd = Math.random, riesgo = "medio" } = opts, F = perfil(riesgo);
  const ts = [...new Set(Object.values(series).flatMap((d) => d.map((x) => x[0])))].sort((a, b) => a - b), corte = ts[Math.floor(ts.length / 2)], reciente = ts[ts.length - 1] - 120 * 864e5;
  const inc = conP({ ...(actual || {}), riesgo }), incTr = simula(series, fee, 0.002, inc, 0, corte), incTe = simula(series, fee, 0.002, inc, corte), incRe = simula(series, fee, 0.002, inc, reciente);
  const padres = [inc, ...pob.map((q) => conP({ ...q, riesgo }))].filter(valido), nuevas = hijas(padres, n, rnd, riesgo);
  const todas = [...padres, ...nuevas].filter((P, i, a) => valido(P) && a.findIndex((q) => JSON.stringify(q) === JSON.stringify(P)) === i);
  const cands = todas.map((P) => ({ P, tr: simula(series, fee, 0.002, P, 0, corte) })).filter((x) => x.tr.n >= 10).sort((a, b) => nota(b.tr, F.peso) - nota(a.tr, F.peso));
  const nuevaPob = cands.length ? cands.slice(0, 20).map((x) => x.P) : [inc];   // las 20 mejores del 1.er año son las madres del próximo examen
  const base = { probadas: cands.length, nuevas: nuevas.length, pob: nuevaPob, enUso: { ano1: incTr.ret, ano2: incTe.ret, dd2: incTe.dd, reciente: incRe.ret } };
  // se revisan las 5 mejores del 1.er año, en orden: la primera que cumple todo, sustituye
  let motivo = "la que está en uso sigue siendo la mejor", mejorInfo = null;
  for (const c of cands.slice(0, 5)) { const igual = JSON.stringify(c.P) === JSON.stringify(inc); if (igual) { motivo = "la que está en uso sigue siendo la mejor"; break; }
    const te = simula(series, fee, 0.002, c.P, corte), full = simula(series, fee, 0.002, c.P), v = veredicto(full, F.ddMax), re = simula(series, fee, 0.002, c.P, reciente), ot = otra ? simula(otra, feeOtra, 0.002, c.P) : null;
    const info = { P: c.P, ano1: c.tr.ret, ano2: te.ret, dd2: te.dd, reciente: re.ret, otra: ot ? ot.ret : null }; if (!mejorInfo) mejorInfo = info;
    const fallo = !(te.ret >= incTe.ret + 3 && te.dd <= Math.max(incTe.dd, 10) + (riesgo === "alto" ? 15 : 5)) ? "no gana claramente en el año que no vio" : !v.ok ? "no aprueba los 2 años" : ot && !(ot.ret > 0) ? "pierde con las criptos del otro exchange" : !(re.ret >= incRe.ret - 2) ? "va peor en los últimos 4 meses" : null;
    if (!fallo) return { ...base, P: c.P, cambia: true, nueva: info, motivo: "la nueva gana en el año que no vio, aprueba los 2 años, también gana con las criptos del otro exchange y va bien en el mercado actual" };
    motivo = "la mejor nueva " + fallo; }
  return { ...base, P: inc, cambia: false, nueva: mejorInfo, motivo }; }
export const describe = (P) => { P = conP(P); return `entra con máximo de ${P.ent} días · sale con mínimo de ${P.sale} · stop ${P.kN}N (≤ −${Math.round(P.stopMax * 100)} %)${P.maxPos !== 4 ? ` · hasta ${P.maxPos} a la vez` : ""}${P.filtro ? ` · solo si BTC está sobre su media de ${P.mFil} días` : ""}${P.atrMax > 0 ? ` · evita las que se mueven más de un ${Math.round(P.atrMax * 100)} % al día` : ""}${P.tp > 0 ? ` · recoge ${P.tpFrac >= 1 ? "toda la" : "la mitad de la"} ganancia al +${Math.round(P.tp * 100)} %` : ""}${P.vol > 0 ? ` · solo con volumen ≥ ${P.vol}× lo normal` : ""}${P.rsiMax > 0 ? ` · no si está estirada (RSI > ${P.rsiMax})` : ""}${P.comp > 0 ? " · solo tras una calma (compresión)" : ""}${P.momD > 0 ? ` · solo si sube en ${P.momD} días` : ""}${P.cazar > 0 ? ` · no la persigue si subió > ${Math.round(P.cazar * 100)} % en 5 días` : ""}`; };
