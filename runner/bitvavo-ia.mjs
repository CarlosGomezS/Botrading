// v219 · 🧠 IA DE BITVAVO: un modelo de «boosting» (cientos de pequeñas reglas sí/no que se corrigen unas a otras, la misma familia
// que usan los equipos ganadores de concursos de predicción con datos de tabla) que aprende de ~80.000 momentos reales de 40 criptos
// qué rasgos había cuando el precio subió un +2 % antes de caer un −1,5 % en las 6 horas siguientes.
// Honesto por construcción: para probar reglas, cada mitad de los días se puntúa con un modelo entrenado SOLO con la otra mitad
// (validación cruzada), así que la bola nunca se examina con datos que la IA ya ha visto. En vivo usa el modelo entrenado con todo.
export const SUBE = 0.02, CAE = 0.015, VELAS = 72, RONDAS = 120, LR = 0.1, BINS = 16;
export const NOMBRES = ["impulso 15 min", "impulso 1 h", "impulso 4 h", "sobre su media", "mínimos crecientes", "volumen", "corrección desde máximo", "rompe máximo 24 h",
  "rompe máximo 20 h", "ruptura de Williams", "RSI(2)", "sobre media larga", "fuerza frente a las demás", "última vela", "volumen última vela", "pico de volumen", "deja de caer", "máximo de 3,5 días", "hora (seno)", "hora (coseno)", "👑 posición de los mejores traders", "👑 cambio de los mejores (1 h)", "🌡️ mercado a favor (bitcoin)", "🌡️ miedo/codicia", "🌡️ financiación de BTC"];
const cl = (x, a, b) => (x == null || !Number.isFinite(+x) ? 0 : Math.max(a, Math.min(b, +x)));
export function vector(f) {
  if (!f) return null; const h = new Date(f.t || 0).getUTCHours() / 24 * 2 * Math.PI;
  return [cl(f.m15, -0.1, 0.1), cl(f.m60, -0.2, 0.2), cl(f.m240, -0.4, 0.4), f.sobre ? 1 : 0, cl(f.hl, 0, 1), cl(Math.log(Math.max(0.05, f.vol || 1)), -3, 3), cl(f.pull, 0, 0.5), cl(f.rompe, -0.3, 0.1),
    f.don == null ? -0.5 : cl(f.don, -0.3, 0.1), f.vb == null ? 0 : cl(f.vb, -3, 3), cl(f.rsi2, 0, 100) / 100, f.sobre200 ? 1 : 0, f.rk == null ? 0.5 : cl(f.rk, 0, 1), cl(f.c1, -0.1, 0.1), cl(Math.log(Math.max(0.05, f.v1 || 1)), -3, 4),
    cl(Math.log(Math.max(0.05, f.vmax || 1)), -3, 4), f.estab ? 1 : 0, f.maxW == null ? -0.5 : cl(f.maxW, -0.5, 0.1), Math.sin(h), Math.cos(h),
    f.smart == null ? 0 : cl(f.smart, -1, 1), f.smartD == null ? 0 : cl(f.smartD, -2, 2), f.reg == null ? 0.5 : f.reg,
    f.fg == null ? 0.5 : cl(f.fg, 0, 100) / 100, f.fund == null ? 0 : cl(f.fund * 1e4, -2, 4)];   // v245 · 🌡️ miedo/codicia y financiación de BTC
}
// etiqueta: ¿tocó +2 % antes de −1,5 % en las siguientes 6 h? (entrando en la apertura de la vela siguiente)
export function etiquetas(c) {
  const y = new Array(c.length).fill(null);
  for (let i = 0; i + 1 < c.length; i++) { const p = c[i + 1][1]; let r = null; for (let j = i + 1; j < Math.min(c.length, i + 1 + VELAS); j++) { if (c[j][3] <= p * (1 - CAE)) { r = 0; break; } if (c[j][2] >= p * (1 + SUBE)) { r = 1; break; } } y[i] = r == null ? (i + VELAS < c.length ? 0 : null) : r; }
  return y;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
export function predecir(M, x) { if (!M || !x) return null; let z = M.b; for (const [j, t, l, r] of M.s) z += x[j] <= t ? l : r; return sig(z); }
// boosting de tocones (stumps) con pérdida logística
export function entrenar(X, Y, rondas = RONDAS) {
  const n = X.length, d = X[0].length; if (n < 500) return null;
  const pos = Y.reduce((a, b) => a + b, 0) / n, b = Math.log(Math.max(1e-3, pos) / Math.max(1e-3, 1 - pos)), F = new Float64Array(n).fill(b), s = [];
  const cortes = []; for (let j = 0; j < d; j++) { const v = X.map((x) => x[j]).sort((a, c) => a - c), u = []; for (let k = 1; k < BINS; k++) u.push(v[Math.floor(k * n / BINS)]); cortes.push([...new Set(u)]); }
  const g = new Float64Array(n), h = new Float64Array(n), BI = cortes.map((cs, j) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) { const v = X[i][j]; let k = 0; while (k < cs.length && v > cs[k]) k++; a[i] = k; } return a; });
  for (let it = 0; it < rondas; it++) {
    let G = 0, Hs = 0; for (let i = 0; i < n; i++) { const p = sig(F[i]); g[i] = Y[i] - p; h[i] = Math.max(1e-6, p * (1 - p)); G += g[i]; Hs += h[i]; }
    let best = null;
    for (let j = 0; j < d; j++) {
      const cs = cortes[j]; if (!cs.length) continue; const gB = new Float64Array(cs.length + 1), hB = new Float64Array(cs.length + 1), bj = BI[j];
      for (let i = 0; i < n; i++) { gB[bj[i]] += g[i]; hB[bj[i]] += h[i]; }
      let gl = 0, hl = 0; for (let k = 0; k < cs.length; k++) { gl += gB[k]; hl += hB[k]; const gr = G - gl, hr = Hs - hl; if (hl < 20 || hr < 20) continue; const gan = gl * gl / hl + gr * gr / hr - G * G / Hs; if (!best || gan > best.gan) best = { gan, j, k, t: cs[k], l: gl / hl, r: gr / hr }; }
    }
    if (!best) break; const st = [best.j, best.t, best.l * LR, best.r * LR]; s.push(st);
    { const bj = BI[best.j]; for (let i = 0; i < n; i++) F[i] += bj[i] <= best.k ? st[2] : st[3]; }
  }
  const imp = new Array(d).fill(0); for (const [j, , l, r] of s) imp[j] += Math.abs(l - r);
  return { b, s, base: pos, imp };
}
export function auc(ps, ys) {
  const o = ps.map((p, i) => [p, ys[i]]).sort((a, b) => a[0] - b[0]); let r = 0, np = 0, nn = 0;
  o.forEach(([, y], i) => { if (y) { r += i + 1; np++; } else nn++; }); return np && nn ? (r - np * (np + 1) / 2) / (np * nn) : 0.5;
}
// entrena con H = { m: { mercado: { c, f } } } y rellena f.ia en cada vela con predicciones «limpias» (validación cruzada por mitades)
export function entrenarIA(H, rnd = Math.random) {
  const filas = []; let tMin = Infinity, tMax = 0;
  for (const m of Object.values(H.m || {})) { const y = etiquetas(m.c); m.f.forEach((f, i) => { if (!f || y[i] == null) return; const x = vector(f); filas.push({ f, x, y: y[i], t: m.c[i][0] }); tMin = Math.min(tMin, m.c[i][0]); tMax = Math.max(tMax, m.c[i][0]); }); }
  if (filas.length < 2000) return { listo: false, n: filas.length };
  const ts = filas.map((r) => r.t).sort((a, b) => a - b), corte = ts[Math.floor(ts.length / 2)];   /* v228 · mediana (no el punto medio): mitades equilibradas */ void tMin; void tMax;
  const A = filas.filter((r) => r.t < corte), B = filas.filter((r) => r.t >= corte);
  const sub = (rs, k) => (rs.length > k ? rs.filter(() => rnd() < k / rs.length) : rs);   // para que entrene rápido
  const tr = (rs) => { const s2 = sub(rs, 25000); return entrenar(s2.map((r) => r.x), s2.map((r) => r.y)); };
  const mA = tr(A), mB = tr(B); if (!mA || !mB) return { listo: false, n: filas.length };
  for (const r of B) r.f.ia = predecir(mA, r.x); for (const r of A) r.f.ia = predecir(mB, r.x);   // cada mitad, con el modelo de la otra
  const ps = filas.map((r) => r.f.ia), ys = filas.map((r) => r.y), a = auc(ps, ys), base = ys.reduce((s, v) => s + v, 0) / ys.length;
  const ord = filas.slice().sort((p, q) => q.f.ia - p.f.ia), top = ord.slice(0, Math.max(50, Math.floor(ord.length * 0.05))), umbral = top[top.length - 1].f.ia, prec = top.reduce((s, r) => s + r.y, 0) / top.length;
  const M = tr(filas), imp = M.imp.map((v, j) => [NOMBRES[j], v]).sort((p, q) => q[1] - p[1]).slice(0, 5).map((x) => x[0]);
  return { listo: a >= 0.55, n: filas.length, auc: Math.round(a * 1000) / 1000, base: Math.round(base * 1000) / 1000, top5: { umbral: Math.round(umbral * 1000) / 1000, acierta: Math.round(prec * 1000) / 1000 }, imp, modelo: M, t: new Date().toISOString() };
}
