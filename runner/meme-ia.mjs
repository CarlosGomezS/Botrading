// v181 · 🧠 IA de los memes: un modelo que aprende SOLO, con todos los casos ya vividos (en directo y de historia),
// qué rasgos tenía una moneda en el momento de entrar cuando luego subió (+20 % antes de caer un 10 %, en 6 h).
// Es una regresión logística (pequeña, rápida y que no se inventa nada): se reentrena en cada generación de la bola,
// se valida con los casos MÁS RECIENTES que no ha visto (para no engañarse) y solo se usa si de verdad acierta más que el azar.
// Su opinión entra en la nota del analista como una 7.ª señal («ia»), con un peso que la bola también aprende.
export const SUBE = 0.2, CAE = 0.1, HORAS_IA = 6, MIN_CASOS = 150, AUC_MIN = 0.56;
const lg = (x) => Math.log10(Math.max(1, +x || 0));
const clip = (x, a, b) => Math.max(a, Math.min(b, +x || 0));
export const NOMBRES_IA = ["impulso 1 h", "impulso 5 min", "impulso 6 h", "impulso 24 h", "volumen (log)", "pico de volumen", "compras/ventas", "liquidez/tamaño", "tamaño (log)", "edad (log)", "top 10", "creador", "insiders", "actividad real"];
// rasgos de una moneda en el momento de decidir (todos de 0 a ~1 para que el modelo sea estable)
export function rasgos(q, info, t0, jup) {
  const pc = q.priceChange || {}, v1 = +(q.volume && q.volume.h1) || 0, v24 = +(q.volume && q.volume.h24) || 0, liq = +(q.liquidity && q.liquidity.usd) || 0, mc = +(q.marketCap || q.fdv) || 1;
  const tx = (q.txns && q.txns.h1) || {}, b = +tx.buys || 0, s = +tx.sells || 0, ageH = Math.max(0.1, (t0 - (+q.pairCreatedAt || t0)) / 3600e3);
  return [clip(pc.h1, -50, 200) / 100, clip(pc.m5, -20, 50) / 25, clip(pc.h6, -80, 400) / 200, clip(pc.h24, -90, 1000) / 500, lg(v1) / 7, clip(v24 > 0 ? v1 / (v24 / 24) : 1, 0, 10) / 5,
    (b + 1) / (b + s + 2), clip(liq / mc, 0, 0.5) * 4, lg(mc) / 9, Math.log10(1 + ageH) / 3, info ? clip(info.top10, 0, 100) / 100 : 0.3, info ? clip(info.dev, 0, 50) / 50 : 0.1,
    info ? clip(info.bundle, 0, 100) / 100 : 0.1, jup && jup.org != null ? clip(jup.org, 0, 100) / 100 : 0.5];
}
// ¿fue buena entrada? 1 si tocó +20 % antes de caer un 10 % (en 6 h); 0 si no
export function etiqueta(p) {
  for (let i = 1; i < p.length; i++) { const [min, rel, hi = rel, lo = rel] = p[i]; if (min / 60 > HORAS_IA) break; if (rel === 0 || lo <= 1 - CAE) return 0; if (hi >= 1 + SUBE) return 1; }
  return 0;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
export function predecir(m, x) { if (!m || !m.w) return null; let z = m.b; for (let i = 0; i < x.length; i++) z += m.w[i] * x[i]; return sig(z); }
function ajustar(X, Y, W, it = 300, lr = 0.5, l2 = 0.002) {
  const d = X[0].length, w = new Array(d).fill(0); let b = 0; const Ws = W.reduce((a, c) => a + c, 0) || 1;
  const pos = Y.reduce((a, y, i) => a + y * W[i], 0) / Ws; b = Math.log(Math.max(1e-3, pos) / Math.max(1e-3, 1 - pos));
  for (let k = 0; k < it; k++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < X.length; i++) { let z = b; for (let j = 0; j < d; j++) z += w[j] * X[i][j]; const e = (sig(z) - Y[i]) * W[i]; gb += e; for (let j = 0; j < d; j++) gw[j] += e * X[i][j]; }
    b -= lr * gb / Ws; for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / Ws + l2 * w[j]);
  }
  return { w, b };
}
// AUC: probabilidad de que el modelo ponga por delante una moneda buena frente a una mala (0,5 = azar)
export function auc(ps, ys) {
  const o = ps.map((p, i) => [p, ys[i]]).sort((a, b) => a[0] - b[0]); let r = 0, np = 0, nn = 0;
  o.forEach(([, y], i) => { if (y) { r += i + 1; np++; } else nn++; });
  return np && nn ? (r - np * (np + 1) / 2) / (np * nn) : 0.5;
}
// entrena con todos los casos (vividos ×1, historia ×0,5); valida con el 30 % más reciente sin haberlo visto
export function entrenar(M, now = new Date()) {
  const casos = [...(M.hechas || []).map((s) => [s, 1]), ...(M.hist || []).map((s) => [s, 0.5]), ...(M.lecc || []).map((s) => [s, 2])].filter(([s]) => s.q && s.p && s.p.length > 2).sort((a, b) => a[0].t0 - b[0].t0);
  if (casos.length < MIN_CASOS) return { n: casos.length, listo: false, t: now.toISOString() };
  const X = casos.map(([s]) => rasgos(s.q, s.info, s.t0, s.jup)), Y = casos.map(([s]) => etiqueta(s.p)), W = casos.map(([, w]) => w);
  const cut = Math.floor(casos.length * 0.7), m0 = ajustar(X.slice(0, cut), Y.slice(0, cut), W.slice(0, cut));
  const va = auc(X.slice(cut).map((x) => predecir(m0, x)), Y.slice(cut)), m = ajustar(X, Y, W), base = Y.reduce((a, y) => a + y, 0) / Y.length;
  const imp = m.w.map((w, i) => [NOMBRES_IA[i], Math.round(w * 100) / 100]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
  return { ...m, n: casos.length, auc: Math.round(va * 1000) / 1000, base: Math.round(base * 1000) / 1000, listo: va >= AUC_MIN, imp, t: now.toISOString() };
}
