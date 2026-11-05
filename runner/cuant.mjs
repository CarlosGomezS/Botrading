// v251 · 📐 MÉTODO CUANTITATIVO (Simons · Dalio · Seykota/Dennis), tal y como lo pediste, adaptado a CONTADO (solo compras, sin futuros):
//  · Pilar A · reversión a la media: cierre a ≥ 2,2 desviaciones por debajo de su media de 20 (Bollinger), RSI(14) < 20, mecha de rechazo
//    (la sombra de abajo es ≥ 50 % de la vela) y volumen ≥ 1,6 × su media de 20. Stop 1,3 × ATR(14) por debajo de la mecha.
//    Vende el 70 % en el VWAP del día y el 30 % con stop móvil (1,5 × ATR bajo el máximo).
//  · Pilar B · caza de stops: la vela barre el mínimo de las 24 anteriores pero CIERRA dentro del rango (trampa). Stop 0,3 % por debajo
//    de la mecha. Objetivo: riesgo/beneficio 1:3.
//  · Pilar C · compresión de volatilidad: Bollinger(20, 2) dentro de Keltner(20, 1,5 × ATR) ≥ 8 velas, ruptura con volumen ≥ 2 × y compra en
//    el primer retroceso a la EMA(9). Stop: el punto medio de la vela de ruptura (o 1,5 × ATR si ese punto queda por encima).
//    Vende la mitad en 2R y el resto en 4R; tras 2R, sale si cierra por debajo de la EMA(9).
//  · Reglas de supervivencia: no entra si el primer objetivo no es ≥ 4,5 × las comisiones (0,40 % ida y vuelta → ≥ 1,8 %);
//    arriesga como mucho el 1,5 % del saldo por operación (el tamaño sale del stop); si cae un 8 % desde su máximo, no compra en 24 h.
export const RIESGO = 0.015, EV_X = 4.5, COSTE = 0.004, DD_MAX = 0.08, MAX_POS = 3, TOPE_POS = 0.5;

// rasgos extra para este método (se añaden a los de cada vela de 5 min)
export function rasgosCuant(c, out) {
  const n = c.length; if (n < 60) return out;
  const cl = c.map((x) => x[4]), k9 = 2 / 10, k20 = 2 / 21; let e9 = cl[0], e20 = cl[0], atr = 0, ag = 0, al = 0, sq = 0, brk = null, usado = -1;
  let dia = -1, pv = 0, vv = 0;
  for (let i = 0; i < n; i++) {
    const [t, o, h, l, cc, v] = c[i];
    e9 = cc * k9 + e9 * (1 - k9); e20 = cc * k20 + e20 * (1 - k20);
    const tr = i ? Math.max(h - l, Math.abs(h - cl[i - 1]), Math.abs(l - cl[i - 1])) : h - l; atr = i < 14 ? (atr * i + tr) / (i + 1) : (atr * 13 + tr) / 14;
    if (i) { const d = cc - cl[i - 1]; ag = (ag * 13 + Math.max(0, d)) / 14; al = (al * 13 + Math.max(0, -d)) / 14; }
    const d0 = Math.floor(t / 86400e3); if (d0 !== dia) { dia = d0; pv = 0; vv = 0; } const tp = (h + l + cc) / 3; pv += tp * v; vv += v;
    if (i < 24) continue;
    let s = 0, s2 = 0, va = 0; for (let j = i - 19; j <= i; j++) { s += cl[j]; s2 += cl[j] * cl[j]; va += c[j][5]; } const ma = s / 20, sd = Math.sqrt(Math.max(0, s2 / 20 - ma * ma)); va /= 20;
    let lo24 = Infinity; for (let j = i - 24; j < i; j++) lo24 = Math.min(lo24, c[j][3]);
    const dentro = ma + 2 * sd < e20 + 1.5 * atr && ma - 2 * sd > e20 - 1.5 * atr;
    // ruptura tras ≥ 8 velas comprimidas, con volumen ≥ 2 ×
    if (!dentro && sq >= 8 && cc > ma + 2 * sd && v >= 2 * va) brk = { i, mid: (h + l) / 2 };
    sq = dentro ? sq + 1 : 0;
    const rng = h - l, f = out[i]; if (!f) continue;
    Object.assign(f, { cz: sd > 0 ? (cc - ma) / sd : 0, rsi14: al + ag > 0 ? 100 * ag / (ag + al) : 50, atr, vwap: vv > 0 ? pv / vv : cc, ema9: e9, vr20: va > 0 ? v / va : 0,
      mechaL: rng > 0 ? (Math.min(o, cc) - l) / rng : 0, lo: l, cl: cc, lo24, sqzPull: 0, brkMid: null });
    if (brk && i - brk.i >= 1 && i - brk.i <= 12 && usado !== brk.i && l <= e9 && cc >= e9) { f.sqzPull = 1; f.brkMid = brk.mid; usado = brk.i; }
    if (brk && i - brk.i > 12) brk = null;
  }
  return out;
}
// plan de la operación si alguno de los tres pilares da señal (precios absolutos, entrando a «px»)
export function plan(f, px, pil = "ABC") {
  if (!f || f.atr == null || !(px > 0)) return null; const ev = EV_X * COSTE; let P = null;
  if (pil.includes("A") && f.cz <= -2.2 && f.rsi14 < 20 && f.mechaL >= 0.5 && f.vr20 >= 1.6) { const sl = f.lo - 1.3 * f.atr; P = { pilar: "A", sl, tp1: f.vwap, f1: 0.7, tp2: null, trail: "atr", atr: f.atr }; }
  else if (pil.includes("B") && f.lo < f.lo24 && f.cl > f.lo24) { const sl = f.lo * (1 - 0.003); P = { pilar: "B", sl, tp1: px + 3 * (px - sl), f1: 1, tp2: null, trail: null, atr: f.atr }; }
  else if (pil.includes("C") && f.sqzPull) { let sl = f.brkMid != null && f.brkMid < px ? f.brkMid : px - 1.5 * f.atr; const r = px - sl; P = { pilar: "C", sl, tp1: px + 2 * r, f1: 0.5, tp2: px + 4 * r, trail: "ema9", atr: f.atr }; }
  if (!P || !(P.sl < px) || !(P.tp1 > px)) return null;
  if ((P.tp1 - px) / px < ev) return null;   // filtro de coste real: el objetivo tiene que pagar ≥ 4,5 × las comisiones
  return P;
}
export const NOMBRE_PILAR = { A: "reversión a la media", B: "caza de stops", C: "compresión y ruptura" };
// tamaño: arriesgar como mucho el 1,5 % del saldo si salta el stop (sin apalancamiento y con tope por posición)
export const tamano = (eq, cash, px, P) => Math.max(0, Math.min(cash, eq * TOPE_POS, (eq * RIESGO) / Math.max(1e-6, (px - P.sl) / px)));
// ¿hay que salir? (vela o precio actual). Devuelve { sale: fracción 0-1, px, por } o null
export function salida(p, h, l, cc, f) {
  const P = p.plan; if (l <= P.sl) return { sale: 1, px: P.sl, por: `stop del pilar ${P.pilar}` };
  if (!p.tp && h >= P.tp1) return { sale: P.f1, px: P.tp1, por: P.pilar === "A" ? "objetivo: vuelta al VWAP (70 %)" : P.pilar === "B" ? "objetivo 1:3" : "objetivo 2R (mitad)" };
  if (p.tp && P.tp2 && h >= P.tp2) return { sale: 1, px: P.tp2, por: "objetivo 4R" };
  if (p.tp && P.trail === "atr" && l <= p.peak - 1.5 * P.atr) return { sale: 1, px: p.peak - 1.5 * P.atr, por: "stop móvil (1,5 × ATR)" };
  if (p.tp && P.trail === "ema9" && f && f.ema9 && cc < f.ema9) return { sale: 1, px: cc, por: "cierra bajo la EMA(9)" };
  return null;
}
