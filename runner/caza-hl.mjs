// v358 · 🧪 CAZA EN HYPERLIQUID (solo con datos, nunca toca dinero): busca un método de MUCHAS operaciones al día que gane con los costes reales
// de Hyperliquid. Novedad frente a las cazas anteriores: en Hyperliquid se puede ir CORTO (ganar cuando baja), así que cada familia prueba
// las dos direcciones, y se cobra/paga la FINANCIACIÓN de cada hora con la tasa real de cada cripto.
// Costes: 0,045 % de comisión a mercado + 0,05 % de deslizamiento en cada orden (entrar y salir) + financiación por hora.
// Validación: se elige con el 60 % más antiguo de los datos (entreno) y solo vale si también gana en el 40 % más reciente (prueba), con
// ≥ 3 operaciones al día, factor de beneficio ≥ 1,15, caída < 30 % y si sus vecinos (parámetros parecidos) también ganan.
const INFO = "https://api.hyperliquid.xyz/info";
export const COST_EXP = 0.00095;
const COST = 0.00045 + 0.0005, H = 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// v1.0 · 🚦 RITMO: Hyperliquid deja 1.200 de «peso» por minuto y por IP (fundingHistory pesa 20 + 1 por cada 20 datos; candleSnapshot 20 + 1 por cada 60).
//   Con 100 criptos hay que ir a ritmo: se lleva la cuenta del último minuto y se espera antes de pasarse (se deja margen para el resto del bot).
export const PESO_MIN = 900;
export function pesoDe(b, ahora = Date.now()) { const n = (a, z, max) => Math.max(1, Math.min(max, Math.ceil(((+z || ahora) - (+a || 0)) / H)));
  if (b && b.type === "fundingHistory") return 20 + Math.ceil(n(b.startTime, b.endTime, 500) / 20);
  if (b && b.type === "candleSnapshot") return 20 + Math.ceil(n(b.req && b.req.startTime, b.req && b.req.endTime, 5000) / 60);
  return 20; }
const usado = [];
async function ritmo(w) { for (;;) { const t = Date.now(); while (usado.length && t - usado[0][0] > 60e3) usado.shift(); const s = usado.reduce((a, x) => a + x[1], 0); if (s + w <= PESO_MIN || !usado.length) { usado.push([t, w]); return; } const t1 = Date.now(); await deps.espera(Math.max(200, 60e3 - (t - usado[0][0]) + 50)); if (Date.now() - t1 < 100) { usado.length = 0; } } }   /* si la espera no espera (pruebas), no se queda dando vueltas */
async function post(body) { await ritmo(pesoDe(body)); for (let i = 0; i < 5; i++) { try { const r = await deps.fetch(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); if (r.status === 429) { await deps.espera(5000 * (i + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (i === 4) throw e; await deps.espera(3000 * (i + 1)); } } }

export const escalaK = (c) => /^k[A-Z]/.test(String(c || "")) ? 1000 : 1;   // v1.0 · G6-I5 · en Hyperliquid «kPEPE» = 1000 PEPE
// v1.0 · 🌐 UNIVERSO COMPLETO (decisión del usuario, 23/11/2026): antes solo las 24 criptos con más volumen (16 tras los controles). Ahora TODAS las de
//   Hyperliquid que el bot puede operar: no deslistadas y con volumen suficiente para que nuestra orden no mueva el precio (≥ VOL_MIN al día),
//   hasta N_MAX. Siguen haciendo falta ≥ 80 % de los 540 días y sin huecos (una cripto nueva entra sola cuando tiene historia).
export const VOL_MIN = 2e6, N_MAX = 100;
export function universo(meta, ctxs) {
  const T = ((meta && meta.universe) || []).map((u, i) => ({ c: u && u.name, v: +((ctxs || [])[i] || {}).dayNtlVlm || 0, d: !!(u && u.isDelisted) })).filter((x) => x.c && !x.d);
  const U = T.filter((x) => x.v >= VOL_MIN && x.c !== "BTC").sort((a, b) => b.v - a.v).map((x) => x.c).slice(0, N_MAX - 1);
  if (T.some((x) => x.c === "BTC")) U.unshift("BTC");   // BTC es la referencia de muchas señales: siempre dentro y la primera
  return U;
}
// v1.0 · 💾 CACHÉ DE DATOS (rama pública hl-datos: solo precios y financiación de mercado, nada tuyo). Descargar 540 días de 100 criptos cada 3 h
//   no cabe en el límite de Hyperliquid (1.200 de peso por minuto): se guarda lo descargado y en cada ronda solo se pide lo nuevo (y las últimas
//   REFRESCO_H horas otra vez, por si la última vela cambió). Las criptos que aún no están en la caché se descargan enteras, como mucho NUEVAS_MAX
//   por ronda (BTC siempre); el resto entra en las rondas siguientes. La fuente de cada cripto (OKX o Hyperliquid) no cambia nunca: no se mezclan.
export const CACHE_RAMA = "hl-datos", CACHE_ARCH = "hl-datos.json.gz", NUEVAS_MAX = 20, REFRESCO_H = 48;
export function cacheValida(j) { if (!j || typeof j !== "object" || j.v !== 1 || !j.c || typeof j.c !== "object") return null;
  const c = {}; for (const [k, e] of Object.entries(j.c)) { if (!e || !["okx", "hl"].includes(e.s) || !Number.isFinite(+e.t0) || !Array.isArray(e.k) || !Array.isArray(e.f)) continue; c[k] = e; } return { v: 1, c }; }
export function desdeCache(e) { const k = new Map(), f = new Map();
  e.k.forEach((x, i) => { if (Array.isArray(x) && x.length >= 5 && +x[0] > 0) k.set(+e.t0 + i * H, x.slice(0, 5).map(Number)); });
  e.f.forEach((x, i) => { if (x != null && Number.isFinite(+x)) f.set(+e.t0 + i * H, +x); }); return { k, f }; }
const P8 = (x) => (Number.isFinite(x) ? +(+x).toPrecision(9) : 0);
export function aCache(s, k, f, ini, fin) { const t0 = ini, n = Math.max(0, Math.round((fin - ini) / H)), K = new Array(n).fill(0), Fz = new Array(n).fill(null);
  for (const [t, x] of k) { const i = Math.round((t - t0) / H); if (i >= 0 && i < n && x && x[0] > 0) K[i] = x.slice(0, 5).map(P8); }
  for (const [t, r] of f) { const i = Math.round((t - t0) / H); if (i >= 0 && i < n && Number.isFinite(r)) Fz[i] = r; }
  let a = 0; while (a < n && !K[a] && Fz[a] == null) a++; return { s, t0: t0 + a * H, k: K.slice(a), f: Fz.slice(a) }; }
export const deps = { fetch: (...a) => globalThis.fetch(...a), espera: (ms) => sleep(ms), repo: () => process.env.GITHUB_REPOSITORY || "CarlosGomezS/Botrading" };
export async function leeCache(log = () => {}) { try { const r = await deps.fetch(`https://raw.githubusercontent.com/${deps.repo()}/${CACHE_RAMA}/${CACHE_ARCH}?t=${Date.now()}`, { signal: AbortSignal.timeout(60000) });
    if (r.status === 404) return { v: 1, c: {} }; if (!r.ok) throw new Error("HTTP " + r.status); const { gunzipSync } = await import("node:zlib");
    const j = cacheValida(JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8"))); if (!j) throw new Error("caché con formato raro"); return j; }
  catch (e) { log(`  Caché de datos no disponible (${String(e.message).slice(0, 60)}): esta ronda descarga desde cero (con el límite de criptos nuevas)`); return { v: 1, c: {} }; } }
const instOkx = (c) => (c === "kPEPE" ? "PEPE" : c === "kBONK" ? "BONK" : c === "kSHIB" ? "SHIB" : c) + "-USDT-SWAP";
async function velasOkx(c, desde, k) { let after = "", esp429 = 0; for (let p = 0; p < 200; p++) { const r = await deps.fetch(`https://www.okx.com/api/v5/market/history-candles?instId=${instOkx(c)}&bar=1H&limit=100${after ? "&after=" + after : ""}`, { signal: AbortSignal.timeout(20000) }); if (r.status === 429) { if (++esp429 > 20) break; await deps.espera(3000); p--; continue; }   /* v1.0 · G5-1.5 · como mucho 20 esperas (antes, sin fin) */ const j = await r.json(), d = (j && j.data) || []; if (!d.length) break; const xk = escalaK(c); for (const y of d) k.set(+y[0], [+y[4] * xk, (+y[6] || 0) / xk, +y[2] * xk, +y[3] * xk, +y[1] * xk]);   /* v1.0 · G6-I5 · kPEPE/kBONK/kSHIB son 1000 monedas: precio ×1000 y volumen ÷1000 (antes, precios 1000 veces más bajos que en Hyperliquid) */   /* v1.0 · G5-1.5 · volumen en MONEDAS (volCcy), igual que el de Hyperliquid (antes, en dólares) */ after = Math.min(...d.map((y) => +y[0])); if (after < desde) break; await deps.espera(110); } }
async function velasHl(c, desde, fin, k) { for (let t = desde; t < fin; t += 4000 * H) { const r = await post({ type: "candleSnapshot", req: { coin: c, interval: "1h", startTime: t, endTime: Math.min(fin, t + 4000 * H) } }); for (const x of r || []) k.set(+x.t, [+x.c, +x.v || 0, +x.h, +x.l, +x.o]); await deps.espera(250); } }
async function financiacion(c, desde, fin, f) { let t = desde; for (let g = 0; g < 40 && t < fin; g++) { const r = await post({ type: "fundingHistory", coin: c, startTime: t }); if (!r || !r.length) break; for (const x of r) f.set(Math.floor(+x.time / H) * H, +x.fundingRate); const last = +r[r.length - 1].time; if (last <= t) break; t = last + 1; await deps.espera(250); } }
export async function datos(log) {
  const [meta, ctxs] = await post({ type: "metaAndAssetCtxs" });
  const U0 = universo(meta, ctxs), fin = Math.floor(Date.now() / H) * H, ini = fin - 540 * 864e5, D = {}, CA = await leeCache(log), nueva = { v: 1, t: new Date(fin).toISOString(), c: {} };
  const U = []; let nuevas = 0, esperan = 0;
  for (const c of U0) {
    const e = CA.c[c]; let k, f, s;
    if (e) {   // ya en la caché: solo lo nuevo (y las últimas REFRESCO_H horas otra vez)
      ({ k, f } = desdeCache(e)); s = e.s; for (const t of [...k.keys()]) if (t < ini) k.delete(t); for (const t of [...f.keys()]) if (t < ini) f.delete(t);
      const ultK = k.size ? Math.max(...k.keys()) : ini, ultF = f.size ? Math.max(...f.keys()) : ini, dk = Math.max(ini, ultK - REFRESCO_H * H), df = Math.max(ini, ultF - REFRESCO_H * H);
      try { if (s === "okx") await velasOkx(c, dk, k); else await velasHl(c, dk, fin, k); await financiacion(c, df, fin, f); } catch (er) { nueva.c[c] = e; log(`  ${c}: no se ha podido actualizar (${String(er.message).slice(0, 40)}), fuera esta ronda`); continue; }
    } else {
      if (c !== "BTC" && nuevas >= NUEVAS_MAX) { esperan++; continue; } nuevas++;
      // v360 · Hyperliquid solo da las últimas 5.000 velas (~208 días): la historia larga de precios sale de OKX (mismo contrato perpetuo
      // contra USDT, precios casi idénticos) y la financiación, de Hyperliquid. Si OKX no la tiene, se usan las velas de Hyperliquid.
      k = new Map(); f = new Map(); s = "okx";
      try { await velasOkx(c, ini, k); } catch (er) {}
      if (k.size < 24 * 300) k.clear();   // v1.0 · G6-I5 · si OKX no da bastante, se usa SOLO Hyperliquid (no se mezclan las dos fuentes)
      try { if (k.size < 24 * 300) { s = "hl"; await velasHl(c, ini, fin, k); } await financiacion(c, ini, fin, f); } catch (er) { log(`  ${c}: no se ha podido descargar (${String(er.message).slice(0, 40)}), fuera esta ronda`); continue; }
    }
    for (const t of [...k.keys()]) if (t >= fin) k.delete(t);   // la vela de la hora en curso aún no ha cerrado
    D[c] = { k, f }; U.push(c); nueva.c[c] = aCache(s, k, f, ini, fin); log(`  ${c}: ${k.size} velas de 1 h · ${f.size} horas de financiación`);
  }
  for (const [c, e] of Object.entries(CA.c)) if (!nueva.c[c] && Date.now() - (+e.t0 + e.k.length * H) < 30 * 864e5) nueva.c[c] = e;   // las que hoy no entran (poco volumen) se guardan 30 días por si vuelven
  if (esperan) log(`  ${esperan} criptos más esperan su turno para descargarse (como mucho ${NUEVAS_MAX} nuevas por ronda)`);
  if (!D.BTC) throw new Error("BTC no tiene datos: paro el examen");
  const T = []; for (let t = ini; t < fin; t += H) T.push(t);
  // v467 · BTC también pasa los controles: es la referencia de muchas señales, así que si NO tiene datos fiables se PARA el examen entero
  validaBTC(T, D);
  for (const c of [...U]) if (D[c].k.size < T.length * 0.8) { U.splice(U.indexOf(c), 1); log(`  ${c}: sin historia suficiente, fuera`); }
  // v466 · 🕳️ HUECOS: dentro del periodo que se examina (desde la hora EVAL0) no puede faltar más de HUECO_MAX (24) h seguidas de velas ni de financiación,
  //   ni puede empezar sin financiación conocida. Si falta, la cripto queda FUERA (no se rellena con precios planos ni con financiación inventada).
  for (const c of [...U]) { const q = huecos(T, D[c]); if (q.velas > HUECO_MAX || q.fund > HUECO_MAX || q.sinFund) { U.splice(U.indexOf(c), 1); log(`  ${c}: datos con huecos (${q.sinFund ? "sin financiación al principio" : `${Math.max(q.velas, q.fund)} h seguidas sin datos`}), fuera`); } }
  const out = {}; for (const c of U) { const C = new Float64Array(T.length), F = new Float64Array(T.length), V = new Float64Array(T.length), Hi = new Float64Array(T.length), Lo = new Float64Array(T.length), O = new Float64Array(T.length); let last = NaN, lastF = 0; T.forEach((t, i) => { const x = D[c].k.get(t); if (x && x[0] > 0) { O[i] = x[4] > 0 ? x[4] : last; last = x[0]; V[i] = x[1]; Hi[i] = x[2]; Lo[i] = x[3]; } else { Hi[i] = Lo[i] = O[i] = last; } C[i] = last; const f = D[c].f.get(t); if (f != null && Number.isFinite(f)) lastF = f; F[i] = lastF; }); out[c] = { C, F, V, Hi, Lo, O }; }   // v467 · O = apertura REAL de cada vela   // v465 · huecos cortos (≤ 24 h): la última financiación conocida; nunca un dato del futuro
  return { T, M: out, U, cache: nueva };
}

// Simulación de cartera: plazas iguales; cada operación [i0, coin, dir, i1] ocupa una plaza de i0 a i1 (horas). Se paga comisión+deslizamiento al
// entrar y al salir, y cada hora la financiación (dir=+1 comprado paga si la tasa es positiva; dir=-1 corto la cobra).
// v465 · al saltar un stop a mercado se vende PEOR que el precio del stop: 0,3 % de deslizamiento (antes 0,1 %)
export const STOP_SLIP = 0.003;
export const EVAL0 = 220, HUECO_MAX = 24;
export function validaBTC(T, D) { if (!D.BTC || D.BTC.k.size < T.length * 0.8) throw new Error("BTC no tiene historia suficiente: paro el examen");
  const q = huecos(T, D.BTC); if (q.velas > HUECO_MAX || q.fund > HUECO_MAX || q.sinFund) throw new Error("BTC tiene huecos en los datos: paro el examen"); }
// v466 · cuenta, dentro del periodo examinado, el mayor hueco seguido de velas y de financiación, y si la financiación empieza tarde
export function huecos(T, d) { let hv = 0, hf = 0, mv = 0, mf = 0, vistoF = false, sinFund = false; for (let i = 0; i < T.length; i++) { const t = T[i], x = d.k.get(t), f = d.f.get(t);
    if (f != null && Number.isFinite(f)) { vistoF = true; hf = 0; } else hf++;
    if (x && x[0] > 0) hv = 0; else hv++;
    if (i >= EVAL0) { if (!vistoF) sinFund = true; mv = Math.max(mv, hv); mf = Math.max(mf, hf); } }
  return { velas: mv, fund: mf, sinFund }; }
// v466 · 🧨 SALIDA POR STOP REALISTA: si la hora ya EMPIEZA pasada del stop (hueco), se sale al precio de apertura, no al del stop; y el deslizamiento
//   es al menos un 0,3 % y crece con lo que la vela atraviesa el stop (una cuarta parte del recorrido). Nunca mejor que el stop ni peor que el extremo de la vela.
//   Devuelve la rentabilidad de la operación (sin costes ni financiación) o null si el stop no salta en esa hora.
export function salidaStop(d, i, p0, dir, sl) { const stopPx = dir > 0 ? p0 * (1 - sl) : p0 * (1 + sl), ext = dir > 0 ? d.Lo[i] : d.Hi[i];
  if (!(ext > 0) || (dir > 0 ? ext > stopPx : ext < stopPx)) return null;
  const ab = d.O && d.O[i] > 0 ? d.O[i] : d.C[i - 1] > 0 ? d.C[i - 1] : stopPx,   // v467 · apertura REAL de la vela (si falta, el cierre anterior)
    base = dir > 0 ? Math.min(stopPx, ab) : Math.max(stopPx, ab), slip = Math.max(STOP_SLIP, 0.25 * Math.abs(ext - base) / base);
  let px = dir > 0 ? base * (1 - slip) : base * (1 + slip); px = dir > 0 ? Math.max(px, ext) : Math.min(px, ext);
  return Math.min(dir * (px / p0 - 1), -sl - STOP_SLIP); }   // nunca mejor que la regla anterior (stop − 0,3 %)
// v465 · 📉 CAÍDA MÁXIMA HORA A HORA: la cuenta se valora cada hora con las posiciones abiertas a precio de mercado (más financiación y comisión de
//   entrada), no solo al cerrar operaciones. Así una posición que cae un 30 % y se recupera SÍ cuenta como caída. Mismas reglas que cartera().
export function caidaHoraria(ops, M, i0, i1, plazas, sl = 0, cm = 1) {
  const ev = ops.filter((o) => o[0] >= i0 && o[0] < i1).sort((a, b) => a[0] - b[0]); let k = 0, eq = 1, pico = 1, dd = 0; const ab = [];
  const fin = Math.min(i1, ...[...new Set(ev.map((o) => o[1]))].map((c) => M[c].C.length - 1)), finOps = ev.reduce((a, o) => Math.max(a, o[3]), i1);
  for (let h = i0; h <= Math.min(fin, finOps, i1 - 1); h++) {   // v1.0 · G6-I5 · nunca mira más allá de i1 (antes, una posición abierta antes del corte seguía mirando los días del examen oculto)
    for (let j = ab.length - 1; j >= 0; j--) { const a = ab[j], d = M[a.c];
      if (!a.cerr && h > a.i) { a.fund += a.dir * (d.F[h - 1] || 0); let r = null;
        if (sl > 0) r = salidaStop(d, h, a.p0, a.dir, sl);
        if (r == null && h >= a.f) r = a.dir * (d.C[h] / a.p0 - 1);
        if (r != null) { r -= a.fund + 2 * COST * cm; eq += (r * a.e) / plazas; a.cerr = 1; } }
      if (h >= a.f) ab.splice(j, 1); }   // como en cartera(): una posición cerrada por stop ocupa su plaza hasta su hora de fin
    while (k < ev.length && ev[k][0] <= h) { const o = ev[k++]; if (o[0] !== h) continue; const d = M[o[1]], p0 = d.C[o[0]]; if (!(p0 > 0)) continue; if (ab.length < plazas && !ab.some((a) => a.c === o[1])) ab.push({ c: o[1], dir: o[2], i: o[0], f: Math.min(o[3], i1 - 1, d.C.length - 1), p0, e: eq, fund: 0 }); }
    let v = eq; for (const a of ab) { if (a.cerr) continue; const d = M[a.c]; v += ((a.dir * (d.C[h] / a.p0 - 1) - a.fund - COST * cm) * a.e) / plazas; }
    pico = Math.max(pico, v); dd = Math.max(dd, 1 - v / pico); }
  return dd;
}
export const PF_MAX = 5;
export function cartera(ops, M, i0, i1, plazas, sl = 0, cm = 1) {   /* v453 · cm: multiplicador de costes (2 = comisiones y deslizamiento al doble) */
  const ev = ops.filter((o) => o[0] >= i0 && o[0] < i1).sort((a, b) => a[0] - b[0]);
  let eq = 1, pico = 1, dd = 0, n = 0, gan = 0, per = 0, libres = plazas; const abiertas = [], rs = [];
  const cierra = (o) => { const d = M[o[1]], p0 = d.C[o[0]]; let fin = Math.min(o[3], i1 - 1, d.C.length - 1), r = null;   /* v1.0 · G5-1.3 · nunca más allá del final del tramo (antes, una abierta antes del corte veía hasta 7 días del examen oculto) */ if (!(p0 > 0)) return 0; if (sl > 0) for (let i = o[0] + 1; i <= fin; i++) { const z = salidaStop(d, i, p0, o[2], sl); if (z != null) { r = z; fin = i; break; } } if (r == null) { const p1 = d.C[fin]; if (!(p1 > 0)) return 0; r = o[2] * (p1 / p0 - 1); } for (let i = o[0]; i < fin && i < d.F.length; i++) r -= o[2] * d.F[i]; return r - 2 * COST * cm; };
  for (const o of ev) {
    for (let j = abiertas.length - 1; j >= 0; j--) if (abiertas[j][3] <= o[0]) { const r = cierra(abiertas[j]); rs.push(r); eq += r / plazas * eq0(abiertas[j]); r > 0 ? (gan += r) : (per -= r); n++; abiertas.splice(j, 1); libres++; pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
    if (libres > 0 && !abiertas.some((a) => a[1] === o[1])) { o.eqIn = eq; abiertas.push(o); libres--; }
  }
  for (const a of abiertas) { const r = cierra(a); rs.push(r); eq += r / plazas * eq0(a); r > 0 ? (gan += r) : (per -= r); n++; pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }   // v465 · también al liquidar lo que queda
  function eq0(o) { return o.eqIn || 1; }
  const dias = (i1 - i0) / 24, mu = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0, sd = rs.length > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mu) ** 2, 0) / (rs.length - 1)) : 0;
  /* v453 · Sharpe anual aproximado por operaciones (rentabilidad media / variabilidad, escalado a las operaciones de un año) */
  return { ret: eq - 1, dd, n, t: rs.length > 1 && sd > 0 ? +((mu / sd) * Math.sqrt(rs.length)).toFixed(3) : 0,   /* v1.0 · R6-5 · t de las operaciones: cuánto se aleja su media de 0 frente a lo que da el azar */ opsDia: n / dias, pf: per > 0 ? Math.min(PF_MAX, gan / per) : gan > 0 ? PF_MAX : 0,   /* v1.0 · G5-1.3 · con tope: 2 operaciones con una pérdida mínima no pueden sacar una nota disparatada */ sh: sd > 0 && dias > 0 ? +((mu / sd) * Math.sqrt((n * 365) / dias)).toFixed(2) : 0 };
}

const ret = (C, i, L) => C[i - L] > 0 ? C[i] / C[i - L] - 1 : null;
const media = (C, i, n) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += C[k]; return s / n; };
// FAMILIAS (todas generan operaciones a partir de datos CERRADOS en la hora i; entran al cierre de i)
function familias() {
  const F = [];
  // 1) momento en las dos direcciones: cada hora, la que más se ha movido en L horas; a favor si el régimen de BTC acompaña; mantiene Hh
  for (const L of [6, 12, 24]) for (const Hh of [3, 6, 12]) for (const min of [0.02, 0.04, 0.06]) for (const lado of ["ambos", "largo", "corto"]) for (const fil of [0, 1])
    F.push({ fam: "momento", p: { L, Hh, min, lado, fil }, gen: ({ T, M, U }) => { const o = [], B = M.BTC.C; for (let i = 220; i < T.length - 1; i++) { const up = B[i] > media(B, i, 50); let best = null; for (const c of U) { const r = ret(M[c].C, i, L); if (r == null) continue; if (!best || Math.abs(r) > Math.abs(best.r)) best = { c, r }; } if (!best || Math.abs(best.r) < min) continue; const dir = best.r > 0 ? 1 : -1; if (lado === "largo" && dir < 0 || lado === "corto" && dir > 0) continue; if (fil && (dir > 0) !== up) continue; const f8 = M[best.c].F.slice(i - 8, i).reduce((a, b) => a + b, 0) / 8; if (dir > 0 && f8 > 0.00005 || dir < 0 && f8 < -0.00005) continue; o.push([i, best.c, dir, i + Hh]); } return o; } });
  // 2) vuelta a la media: va CONTRA el movimiento más fuerte de L horas (las subidas/caídas exageradas se corrigen); mantiene Hh
  for (const L of [3, 6, 12, 24]) for (const Hh of [2, 4, 8]) for (const min of [0.03, 0.05, 0.08]) for (const fil of [0, 1])
    F.push({ fam: "vuelta", p: { L, Hh, min, fil }, gen: ({ T, M, U }) => { const o = [], B = M.BTC.C; for (let i = 220; i < T.length - 1; i++) { const up = B[i] > media(B, i, 200); let best = null; for (const c of U) { const r = ret(M[c].C, i, L); if (r == null) continue; if (!best || Math.abs(r) > Math.abs(best.r)) best = { c, r }; } if (!best || Math.abs(best.r) < min) continue; const dir = best.r > 0 ? -1 : 1; if (fil && (dir > 0) !== up) continue; o.push([i, best.c, dir, i + Hh]); } return o; } });
  // 3) ruptura de canal en cada cripto, en las dos direcciones (máximo/mínimo de N horas), sale a las Hh horas
  for (const N of [24, 48, 96]) for (const Hh of [6, 12, 24]) for (const fil of [0, 1])
    F.push({ fam: "ruptura", p: { N, Hh, fil }, gen: ({ T, M, U }) => { const o = [], B = M.BTC.C; for (const c of U) { const C = M[c].C; let ult = -1e9; for (let i = 220; i < T.length - 1; i++) { if (i - ult < Hh) continue; let hi = -1e18, lo = 1e18; for (let k = i - N; k < i; k++) { hi = Math.max(hi, C[k]); lo = Math.min(lo, C[k]); } let dir = C[i] > hi ? 1 : C[i] < lo ? -1 : 0; if (!dir) continue; if (fil && (dir > 0) !== (B[i] > media(B, i, 200))) continue; o.push([i, c, dir, i + Hh]); ult = i; } } return o; } });
  // 4) largo-corto neutral: cada R horas compra las k que más suben en L horas y vende en corto las k que más bajan (o al revés: «contra»)
  for (const L of [6, 24, 72]) for (const R of [4, 8, 24]) for (const k of [2, 3]) for (const sen of ["a favor", "contra"])
    F.push({ fam: "neutral", p: { L, R, k, sen }, plazas: 2 * k, gen: ({ T, M, U }) => { const o = []; for (let i = 220; i < T.length - 1; i += R) { const r = U.map((c) => ({ c, r: ret(M[c].C, i, L) })).filter((x) => x.r != null).sort((a, b) => b.r - a.r); if (r.length < 2 * k) continue; const s = sen === "a favor" ? 1 : -1; for (const x of r.slice(0, k)) o.push([i, x.c, s, i + R]); for (const x of r.slice(-k)) o.push([i, x.c, -s, i + R]); } return o; } });
  // 5) cobrar la financiación: cada 8 h, corto en las k con la tasa más alta (los alcistas pagan) y largo en las k con la más negativa
  for (const k of [1, 2, 3]) for (const R of [8, 24]) for (const umbral of [0.00002, 0.00005, 0.0001])
    F.push({ fam: "financiación", p: { k, R, umbral }, plazas: 2 * k, gen: ({ T, M, U }) => { const o = []; for (let i = 220; i < T.length - 1; i += R) { const f = U.map((c) => ({ c, f: M[c].F.slice(i - 8, i).reduce((a, b) => a + b, 0) / 8 })).sort((a, b) => b.f - a.f); for (const x of f.slice(0, k)) if (x.f > umbral) o.push([i, x.c, -1, i + R]); for (const x of f.slice(-k)) if (x.f < -umbral) o.push([i, x.c, 1, i + R]); } return o; } });
  return F;
}

export async function caza(log = console.log) {
  log("Descargando velas de 1 h y financiación de Hyperliquid (últimos 540 días)…");
  const D = await datos(log), n = D.T.length, corte = Math.floor(n * 0.6), F = familias(), R = [];
  log(`Datos: ${D.U.length} criptos · ${Math.round(n / 24)} días · entreno hasta el ${new Date(D.T[corte]).toISOString().slice(0, 10)} · ${F.length} variantes`);
  for (const f of F) { let ops; try { ops = f.gen(D); } catch (e) { continue; } const pl = f.plazas || 4; const a = cartera(ops, D.M, 220, corte, pl), b = cartera(ops, D.M, corte, n - 1, pl), t = cartera(ops, D.M, 220, n - 1, pl); a.dd = Math.max(a.dd, caidaHoraria(ops, D.M, 220, corte, pl)); b.dd = Math.max(b.dd, caidaHoraria(ops, D.M, corte, n - 1, pl));   /* v466 · misma caída (hora a hora) que el laboratorio avanzado */ R.push({ fam: f.fam, p: f.p, a, b, t, okA: a.opsDia >= 3 && a.ret > 0 && a.pf >= 1.15 && a.dd < 0.3, okB: b.ret > 0 && b.pf >= 1.1 && b.dd < 0.3 }); }
  // vecinos: misma familia, parámetros que difieren en uno solo → también deben ganar en la prueba
  const k = (x) => JSON.stringify(x.p), vec = (x) => R.filter((y) => y.fam === x.fam && y !== x && Object.keys(x.p).filter((q) => x.p[q] !== y.p[q]).length === 1);
  for (const x of R) { const v = vec(x); x.vecOk = v.length ? v.filter((y) => y.b.ret > 0).length / v.length : 0; }
  const ok = R.filter((x) => x.okA && x.okB && x.vecOk >= 0.6).sort((a, b) => b.b.ret - a.b.ret);
  const P = (x) => (x * 100).toFixed(1) + " %", fila = (x) => `${x.fam} ${k(x)} · entreno ${P(x.a.ret)} (${x.a.opsDia.toFixed(1)} op/día, PF ${x.a.pf.toFixed(2)}, caída ${P(x.a.dd)}) · prueba ${P(x.b.ret)} (PF ${x.b.pf.toFixed(2)}, caída ${P(x.b.dd)}) · vecinos ${Math.round(x.vecOk * 100)} %`;
  log(`\nAPROBADAS (entreno + prueba + vecinos): ${ok.length} de ${R.length}`); ok.slice(0, 12).forEach((x) => log("  ✅ " + fila(x)));
  for (const fam of [...new Set(R.map((x) => x.fam))]) { const m = R.filter((x) => x.fam === fam && x.a.opsDia >= 3).sort((a, b) => b.a.ret - a.a.ret)[0]; if (m) log(`  mejor de «${fam}» en entreno: ${fila(m)}`); }
  return { ok, R };
}
if (process.argv[1] && process.argv[1].endsWith("caza-hl.mjs")) caza().catch((e) => { console.log("Error: " + e.message); process.exit(1); });
