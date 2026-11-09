// v366 · 🤖 RECETAS DE LA IA PARA EL LABORATORIO DE CRIPTO
// La IA (Gemini) NO escribe código ni toca nada: solo propone «recetas» en un formato cerrado (indicadores, comparaciones y
// umbrales con límites). Aquí se comprueban una a una; lo que no cumpla el formato se descarta. Luego el laboratorio las examina
// con las mismas reglas que a todas (tramos al azar, hasta hoy, comisiones reales). La IA no puede cambiar el examen ni la memoria.
const IND = {
  precio: [], ema: ["n"], sma: ["n"], rsi: ["n"], atr_pct: ["n"], bb_sup: ["n", "k"], bb_inf: ["n", "k"], maximo: ["n"], minimo: ["n"],
  ret: ["n"], vol_rel: ["n"], zscore: ["n"], financiacion: ["n"], btc_ret: ["n"], rel_btc: ["n"], hora: [],
};
export const INDICADORES = {
  precio: "precio de cierre de la vela de 1 h", ema: "media exponencial de n horas", sma: "media simple de n horas", rsi: "RSI de n horas (0-100)",
  atr_pct: "rango medio verdadero de n horas, en tanto por uno del precio (0,01 = 1 %)", bb_sup: "banda de Bollinger superior (n horas, k desviaciones)",
  bb_inf: "banda de Bollinger inferior (n horas, k desviaciones)", maximo: "máximo de las n horas ANTERIORES (sin la actual)", minimo: "mínimo de las n horas ANTERIORES",
  ret: "rentabilidad de las últimas n horas en tanto por uno (0,02 = +2 %)", vol_rel: "volumen de esta hora dividido por el volumen medio de las n anteriores",
  zscore: "desviación del precio respecto a su media de n horas, en desviaciones típicas", financiacion: "financiación media por hora de las últimas n horas (tanto por uno, p. ej. 0,0001)",
  btc_ret: "rentabilidad de BTC en las últimas n horas (tanto por uno)", rel_btc: "rentabilidad de esta cripto menos la de BTC en n horas (tanto por uno)", hora: "hora UTC (0-23)",
};
export const OPS = [">", "<", "cruza_arriba", "cruza_abajo"];
export const SALIDAS = [1, 2, 4, 8, 16, 24], STOPS = [0, 0.02, 0.03, 0.05];
const num = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
const vExpr = (e) => { if (!e || typeof e !== "object" || !IND[e.ind]) return null; const o = { ind: e.ind };
  for (const p of IND[e.ind]) { if (p === "n") { const n = Math.round(+e.n); if (!num(n, 2, 500)) return null; o.n = n; } if (p === "k") { const k = +e.k; if (!num(k, 0.5, 5)) return null; o.k = +k.toFixed(2); } } return o; };
const vCond = (c) => { if (!c || typeof c !== "object" || !OPS.includes(c.op)) return null; const a = vExpr(c.a); if (!a) return null;
  let b; if (typeof c.b === "number") { if (!num(c.b, -1e6, 1e6)) return null; b = c.b; } else { b = vExpr(c.b); if (!b) return null; }
  const x = c.x == null ? 1 : +c.x; if (!num(x, 0.5, 2)) return null; return { a, op: c.op, b, ...(x !== 1 ? { x: +x.toFixed(4) } : {}) }; };
// devuelve la receta limpia o null
export function validaReceta(r, filtros) {
  try { if (!r || typeof r !== "object") return null; const nombre = String(r.nombre || "").replace(/[<>`]/g, "").slice(0, 60).trim(), idea = String(r.idea || "").replace(/[<>`]/g, "").slice(0, 240).trim(); if (!nombre) return null;
    const L = Array.isArray(r.largo) ? r.largo.slice(0, 5).map(vCond) : [], C = Array.isArray(r.corto) ? r.corto.slice(0, 5).map(vCond) : [];
    if (L.some((x) => !x) || C.some((x) => !x) || (!L.length && !C.length) || L.length > 4 || C.length > 4) return null;
    const salida = SALIDAS.includes(+r.salida_h) ? +r.salida_h : 8, stop = STOPS.includes(+r.stop) ? +r.stop : 0.03, filtro = filtros && filtros.includes(r.filtro) ? r.filtro : "sin filtro";
    const limpia = { nombre, idea, largo: L, corto: C, salida_h: salida, stop, filtro };
    return { ...limpia, id: "ia_" + hash(JSON.stringify({ largo: L, corto: C })) };
  } catch (e) { return null; }
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
// ---------- cálculo ----------
const ema = (C, n) => { const o = new Float64Array(C.length), k = 2 / (n + 1); let e = C[0]; for (let i = 0; i < C.length; i++) { e = Number.isFinite(C[i]) ? e + k * (C[i] - e) : e; o[i] = e; } return o; };
const sma = (C, n) => { const o = new Float64Array(C.length); let s = 0; for (let i = 0; i < C.length; i++) { s += C[i] || 0; if (i >= n) s -= C[i - n] || 0; o[i] = i >= n - 1 ? s / n : NaN; } return o; };
const sdv = (C, n, m) => { const o = new Float64Array(C.length).fill(NaN); let s = 0, s2 = 0; for (let i = 0; i < C.length; i++) { const x = C[i] || 0; s += x; s2 += x * x; if (i >= n) { const y = C[i - n] || 0; s -= y; s2 -= y * y; } if (i >= n - 1) o[i] = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)); } return o; };
const rsi = (C, n) => { const o = new Float64Array(C.length).fill(50); let g = 0, l = 0; for (let i = 1; i < C.length; i++) { const d = C[i] - C[i - 1] || 0, up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; };
function serie(e, d, T, B) {
  const N = d.C.length, C = d.C, n = e.n;
  switch (e.ind) {
    case "precio": return C;
    case "ema": return ema(C, n);
    case "sma": return sma(C, n);
    case "rsi": return rsi(C, n);
    case "atr_pct": { const tr = new Float64Array(N); for (let i = 1; i < N; i++) tr[i] = Math.max(d.Hi[i] - d.Lo[i], Math.abs(d.Hi[i] - C[i - 1]), Math.abs(d.Lo[i] - C[i - 1])) / C[i]; return sma(tr, n); }
    case "bb_sup": case "bb_inf": { const m = sma(C, n), s = sdv(C, n, m), sg = e.ind === "bb_sup" ? 1 : -1; return Float64Array.from(m, (x, i) => x + sg * e.k * s[i]); }
    case "maximo": case "minimo": { const o = new Float64Array(N).fill(NaN), A = e.ind === "maximo" ? d.Hi : d.Lo, mx = e.ind === "maximo";
      for (let i = n; i < N; i++) { let v = mx ? -Infinity : Infinity; for (let k = i - n; k < i; k++) { const z = A[k]; if (mx ? z > v : z < v) v = z; } o[i] = v; } return o; }
    case "ret": return Float64Array.from(C, (c, i) => (i >= n && C[i - n] > 0 ? c / C[i - n] - 1 : NaN));
    case "vol_rel": { const m = sma(d.V, n); return Float64Array.from(d.V, (v, i) => (i && m[i - 1] > 0 ? v / m[i - 1] : NaN)); }
    case "zscore": { const m = sma(C, n), s = sdv(C, n, m); return Float64Array.from(C, (c, i) => (s[i] > 0 ? (c - m[i]) / s[i] : NaN)); }
    case "financiacion": { const F = d.F || new Float64Array(N), o = new Float64Array(N).fill(NaN); let s = 0; for (let i = 0; i < N; i++) { s += F[i] || 0; if (i >= n) s -= F[i - n] || 0; if (i >= n - 1) o[i] = s / n; } return o; }
    case "btc_ret": { const BC = B.C; return Float64Array.from(BC, (c, i) => (i >= n && BC[i - n] > 0 ? c / BC[i - n] - 1 : NaN)); }
    case "rel_btc": { const BC = B.C; return Float64Array.from(C, (c, i) => (i >= n && C[i - n] > 0 && BC[i - n] > 0 ? c / C[i - n] - BC[i] / BC[i - n] : NaN)); }
    case "hora": return Float64Array.from(T, (t) => new Date(t).getUTCHours());
  }
  return new Float64Array(N).fill(NaN);
}
function cumple(conds, d, T, B, cache) {
  const N = d.C.length, out = new Uint8Array(N).fill(conds.length ? 1 : 0); if (!conds.length) return out;
  const get = (e) => { const k = JSON.stringify(e); if (!cache.has(k)) cache.set(k, serie(e, d, T, B)); return cache.get(k); };
  for (const c of conds) { const A = get(c.a), Bv = typeof c.b === "number" ? null : get(c.b), x = c.x || 1, bv = (i) => (Bv ? Bv[i] : c.b) * x;
    for (let i = 1; i < N; i++) { if (!out[i]) continue; const a = A[i], b = bv(i); if (!Number.isFinite(a) || !Number.isFinite(b)) { out[i] = 0; continue; }
      let ok = false; if (c.op === ">") ok = a > b; else if (c.op === "<") ok = a < b; else { const a0 = A[i - 1], b0 = bv(i - 1); ok = Number.isFinite(a0) && Number.isFinite(b0) && (c.op === "cruza_arriba" ? a > b && a0 <= b0 : a < b && a0 >= b0); }
      if (!ok) out[i] = 0; }
    out[0] = 0; }
  return out;
}
// señal de la receta: +1 (largo), −1 (corto) o 0 en cada hora; si se cumplen las dos a la vez, no hace nada
export function senalReceta(r) {
  return (d, T, B) => { const cache = new Map(), L = cumple(r.largo, d, T, B, cache), C = cumple(r.corto, d, T, B, cache); return Int8Array.from(L, (l, i) => (l && !C[i] ? 1 : C[i] && !l ? -1 : 0)); };
}
export function describe(r) {
  const e = (x) => (typeof x === "number" ? String(x) : x.ind + (x.n ? `(${x.n}${x.k ? "," + x.k : ""})` : x.k ? `(${x.k})` : ""));
  const c = (z) => `${e(z.a)} ${z.op.replace("_", " ")} ${z.x && z.x !== 1 ? z.x + "×" : ""}${e(z.b)}`;
  return [r.largo.length ? "compra si " + r.largo.map(c).join(" y ") : "", r.corto.length ? "corto si " + r.corto.map(c).join(" y ") : ""].filter(Boolean).join("; ");
}
