// ============================================================================================
// v1.0 · 📈 LECTURA DEL MERCADO PARA LA IA (números y gráficas) · laboratorio de cripto (Hyperliquid)
// La IA «estudia» las gráficas de dos formas y propone recetas a partir de ellas (ia-lab.mjs):
//   · en NÚMEROS: tendencia, volatilidad, si las rupturas siguen o se dan la vuelta, horas y días buenos, relación con BTC…
//   · en IMAGEN: una gráfica PNG por cripto (diario de 1 año con sus medias + 4 h de los últimos 2 meses), para un modelo que «ve»
// 🔒 IMPORTANTE: solo con datos ANTERIORES a los 90 días que el laboratorio reserva para el examen oculto (igual que todo lo
//   que ve la IA desde v467). Si la IA viera esos 90 días, propondría recetas hechas a medida del examen y aprobarían por trampa.
// Solo lee precios públicos de Hyperliquid: no usa claves, no toca dinero ni decide nada.
// ============================================================================================
import { deflateSync } from "node:zlib";

export const DIA = 864e5, MARGEN_OCULTO = 91 * DIA;   // 90 días ocultos del laboratorio + 1 de margen
export const corte = (ahora = Date.now()) => ahora - MARGEN_OCULTO;

// ---------- precios (velas públicas de Hyperliquid) ----------
export async function velas(coin, interval, desde, hasta, fx = (...a) => globalThis.fetch(...a)) {
  const r = await fx("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime: Math.floor(desde), endTime: Math.floor(hasta) } }) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  // 🔒 se filtra aquí también: aunque la API devolviera velas posteriores al corte, no pasan
  const dur = { "1h": 36e5, "4h": 144e5, "1d": DIA }[interval] || 0;
  return (Array.isArray(j) ? j : []).map((x) => ({ t: +x.t, T: +x.T || +x.t + dur, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v })).filter((x) => x.T <= hasta && Number.isFinite(x.c) && x.c > 0).sort((a, b) => a.t - b.t);   // la vela tiene que haber CERRADO antes del corte
}

// ---------- números ----------
const ema = (a, n) => { const k = 2 / (n + 1), o = []; let e = a[0]; for (const x of a) { e = x * k + e * (1 - k); o.push(e); } return o; };
const med = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = med(a); return Math.sqrt(med(a.map((x) => (x - m) ** 2))); };
const pct = (x) => +(x * 100).toFixed(2);
const rets = (c) => c.slice(1).map((x, i) => x / c[i] - 1);
function corr(a, b) { const n = Math.min(a.length, b.length); if (n < 10) return null; const A = a.slice(-n), B = b.slice(-n), ma = med(A), mb = med(B); let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (A[i] - ma) * (B[i] - mb); sa += (A[i] - ma) ** 2; sb += (B[i] - mb) ** 2; } return sa && sb ? +(s / Math.sqrt(sa * sb)).toFixed(2) : null; }
function rsi(c, n = 14) { const o = new Array(c.length).fill(null); let g = 0, p = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; if (i <= n) { g += Math.max(d, 0); p += Math.max(-d, 0); if (i === n) { g /= n; p /= n; o[i] = 100 - 100 / (1 + g / (p || 1e-12)); } continue; } g = (g * (n - 1) + Math.max(d, 0)) / n; p = (p * (n - 1) + Math.max(-d, 0)) / n; o[i] = 100 - 100 / (1 + g / (p || 1e-12)); } return o; }

// resumen de una cripto: `dia` = velas diarias (≥ 60), `h4` = velas de 4 h (≥ 60), `btcDia` opcional para la relación con BTC
export function resumen(dia, h4, btcDia = null) {
  if (!Array.isArray(dia) || dia.length < 60 || !Array.isArray(h4) || h4.length < 60) return null;
  const c = dia.map((x) => x.c), u = c[c.length - 1], r = rets(c), e50 = ema(c, 50), e200 = ema(c, Math.min(200, c.length));
  const ret = (d) => (c.length > d ? pct(u / c[c.length - 1 - d] - 1) : null);
  const vol = (a) => +(sd(a) * Math.sqrt(365) * 100).toFixed(1);
  const vol30 = vol(r.slice(-30)), volAno = vol(r.slice(-365));
  let pico = 0, dd = 0; for (const x of c.slice(-90)) { pico = Math.max(pico, x); dd = Math.min(dd, x / pico - 1); }
  // ¿las subidas siguen (momentum) o se dan la vuelta (rebote)? correlación de un tramo de 4 h con el siguiente
  const c4 = h4.map((x) => x.c), r4 = rets(c4), auto = corr(r4.slice(0, -1), r4.slice(1));
  // rupturas: tras cerrar por encima del máximo de 20 velas de 4 h, ¿cuánto hace de media en las 6 siguientes? (y al revés con el mínimo)
  const sig = (dir) => { const o = []; for (let i = 20; i + 6 < c4.length; i++) { const v = c4.slice(i - 20, i); if (dir > 0 ? c4[i] > Math.max(...v) : c4[i] < Math.min(...v)) o.push(dir * (c4[i + 6] / c4[i] - 1)); } return o; };
  const rupS = sig(1), rupB = sig(-1);
  // RSI de 4 h por debajo de 30: ¿rebota en las 6 siguientes?
  const R = rsi(c4), reb = []; for (let i = 15; i + 6 < c4.length; i++) if (R[i] != null && R[i] < 30) reb.push(c4[i + 6] / c4[i] - 1);
  // franja horaria (UTC, velas de 4 h) y día de la semana: rentabilidad media
  const franjas = {}; for (let i = 1; i < h4.length; i++) { const k = String(new Date(h4[i].t).getUTCHours()).padStart(2, "0") + "h"; (franjas[k] = franjas[k] || []).push(c4[i] / c4[i - 1] - 1); }
  const dias = {}, NOM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]; for (let i = 1; i < dia.length; i++) { const k = NOM[new Date(dia[i].t).getUTCDay()]; (dias[k] = dias[k] || []).push(c[i] / c[i - 1] - 1); }
  const vols = dia.map((x) => x.v * x.c), volRel = med(vols.slice(-7)) / (med(vols.slice(-90)) || 1);
  return {
    precio: +u.toPrecision(6), ret_7d: ret(7), ret_30d: ret(30), ret_90d: ret(90), ret_180d: ret(180),
    tendencia: u > e50[e50.length - 1] && e50[e50.length - 1] > e200[e200.length - 1] ? "alcista" : u < e50[e50.length - 1] && e50[e50.length - 1] < e200[e200.length - 1] ? "bajista" : "lateral",
    sobre_media_50d_pct: pct(u / e50[e50.length - 1] - 1), sobre_media_200d_pct: pct(u / e200[e200.length - 1] - 1),
    volatilidad_30d_anual_pct: vol30, volatilidad_1a_anual_pct: volAno, volatilidad_relativa: volAno ? +(vol30 / volAno).toFixed(2) : null,
    peor_caida_90d_pct: pct(dd), volumen_7d_vs_90d: +volRel.toFixed(2),
    autocorrelacion_4h: auto, comportamiento: auto == null ? null : auto > 0.05 ? "las subidas tienden a seguir (momentum)" : auto < -0.05 ? "tiende a darse la vuelta (rebote)" : "sin tendencia clara entre tramos",
    rupturas_al_alza: { veces: rupS.length, media_24h_pct: rupS.length ? pct(med(rupS)) : null, aciertos_pct: rupS.length ? pct(rupS.filter((x) => x > 0).length / rupS.length) : null },
    rupturas_a_la_baja: { veces: rupB.length, media_24h_pct: rupB.length ? pct(med(rupB)) : null, aciertos_pct: rupB.length ? pct(rupB.filter((x) => x > 0).length / rupB.length) : null },
    rsi4h_bajo_30_rebote: { veces: reb.length, media_24h_pct: reb.length ? pct(med(reb)) : null },
    franja_utc_media_pct: Object.fromEntries(Object.entries(franjas).sort().map(([k, v]) => [k, +(med(v) * 100).toFixed(3)])),
    dia_semana_media_pct: Object.fromEntries(Object.entries(dias).map(([k, v]) => [k, +(med(v) * 100).toFixed(3)])),
    correlacion_btc_90d: btcDia ? corr(rets(btcDia.map((x) => x.c)).slice(-90), r.slice(-90)) : null,
  };
}

// ---------- imagen (PNG hecho a mano: sin librerías ni nada que instalar) ----------
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function trozo(tipo, datos) { const L = Buffer.alloc(4); L.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo, "ascii"), datos]), C = Buffer.alloc(4); C.writeUInt32BE(crc32(td)); return Buffer.concat([L, td, C]); }
export function lienzo(w, h, fondo = [255, 255, 255]) {
  const px = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) px.set(fondo, i * 3);
  const punto = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; px.set(col, (y * w + x) * 3); };
  const linea = (x0, y0, x1, y1, col, grueso = 1) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; for (let a = 0; a < grueso; a++) for (let b = 0; b < grueso; b++) punto(x + a, y + b, col); } };
  const caja = (x0, y0, x1, y1, col) => { for (let y = Math.max(0, Math.round(y0)); y < Math.min(h, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x++) px.set(col, (y * w + x) * 3); };
  const png = () => { const fila = w * 3 + 1, raw = Buffer.alloc(fila * h); for (let y = 0; y < h; y++) { raw[y * fila] = 0; px.copy(raw, y * fila + 1, y * w * 3, (y + 1) * w * 3); }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ih), trozo("IDAT", deflateSync(raw)), trozo("IEND", Buffer.alloc(0))]); };
  return { w, h, punto, linea, caja, png };
}
// panel de precio (línea) con medias y volumen debajo, dentro del rectángulo (x, y, ancho, alto)
function panel(L, velasP, x, y, an, al, medias = []) {
  const c = velasP.map((v) => v.c), vs = velasP.map((v) => v.v * v.c), n = c.length; if (n < 2) return;
  const series = [c, ...medias.map(([m]) => ema(c, Math.min(m, n)))], lo = Math.min(...series.flat()), hi = Math.max(...series.flat()), altP = al * 0.78, altV = al * 0.18;
  const X = (i) => x + (i * (an - 1)) / (n - 1), Y = (v) => y + altP - ((v - lo) / (hi - lo || 1)) * altP;
  for (let k = 1; k < 4; k++) L.linea(x, y + (altP * k) / 4, x + an, y + (altP * k) / 4, [232, 232, 232]);   // rejilla
  const vmax = Math.max(...vs) || 1; for (let i = 0; i < n; i++) { const hV = (vs[i] / vmax) * altV, sube = i === 0 || c[i] >= c[i - 1]; L.caja(X(i) - an / n / 2, y + al - hV, X(i) + an / n / 2, y + al, sube ? [150, 205, 160] : [230, 160, 160]); }
  medias.forEach(([, col], k) => { const s = series[k + 1]; for (let i = 1; i < n; i++) L.linea(X(i - 1), Y(s[i - 1]), X(i), Y(s[i]), col); });
  for (let i = 1; i < n; i++) L.linea(X(i - 1), Y(c[i - 1]), X(i), Y(c[i]), [20, 40, 90], 2);
  L.linea(x, y + al, x + an, y + al, [120, 120, 120]); L.linea(x, y, x, y + al, [120, 120, 120]);
}
// gráfica de una cripto: arriba 1 año diario (precio azul oscuro, media 50 naranja, media 200 morada); abajo 4 h de los últimos ~2 meses
export function grafica(dia, h4) {
  const L = lienzo(960, 640); panel(L, dia.slice(-365), 30, 20, 910, 360, [[50, [240, 140, 20]], [200, [140, 70, 190]]]); panel(L, h4.slice(-360), 30, 420, 910, 200, [[20, [240, 140, 20]]]); return L.png();
}

// ---------- todo junto ----------
export async function lectura(coins, { fx, ahora = Date.now(), conImagen = 4 } = {}) {
  const hasta = corte(ahora), out = { hasta: new Date(hasta).toISOString(), criptos: {}, imagenes: [] }; let btc = null;
  const lista = ["BTC", ...coins.filter((c) => c !== "BTC")].slice(0, 10);
  for (const coin of lista) { try {
      const dia = await velas(coin, "1d", hasta - 420 * DIA, hasta, fx), h4 = await velas(coin, "4h", hasta - 90 * DIA, hasta, fx);
      if (coin === "BTC") btc = dia; const R = resumen(dia, h4, coin === "BTC" ? null : btc); if (!R) continue; out.criptos[coin] = R;
      if (out.imagenes.length < conImagen) out.imagenes.push({ coin, png: grafica(dia, h4) });
    } catch (e) {} }
  return out;
}
