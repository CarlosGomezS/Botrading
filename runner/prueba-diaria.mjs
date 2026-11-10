// Prueba única de 3 sistemas «para operar todos los días» (solo datos, no opera):
//  A) escáner de monedas en juego (top 3 del día por subida + volumen) y compra en el retroceso a la EMA 20 de 15m
//  B) ruptura del rango de apertura de Nueva York (primera vela de 15m) con compra en el retesteo; cierre a las 21:30 de Madrid
//  C) rejilla intradía en canal lateral (3 compras límite en el tercio bajo, venta +2 % cada una)
// FASE=descarga: baja 12 meses de velas de 15m de las N monedas con más volumen (en trozos). FASE=sim: junta y simula.
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIAS = 365, FIN = Date.now(), INI = FIN - DIAS * 864e5, M15 = 15 * 60e3, N = +(process.env.TOPN || 60);
const FEES = { bitvavo: { mk: 0.0020, tk: 0.0025 }, okx: { mk: 0.0008, tk: 0.0010 } }, SLIP = 0.0005;
async function getJ(u) { for (let t = 0; t < 6; t++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch {} await wait(1500 * (t + 1)); } return null; }
async function top(ex) {
  if (ex === "bitvavo") { const j = await getJ("https://api.bitvavo.com/v2/ticker/24h"); return (j || []).filter((m) => /-EUR$/.test(m.market) && +m.volumeQuote > 0).sort((a, b) => b.volumeQuote - a.volumeQuote).slice(0, N).map((m) => m.market.split("-")[0]); }
  const j = await getJ("https://www.okx.com/api/v5/market/tickers?instType=SPOT"); return ((j && j.data) || []).filter((m) => /-USDT$/.test(m.instId)).sort((a, b) => b.volCcy24h - a.volCcy24h).slice(0, N).map((m) => m.instId.split("-")[0]); }
async function velas(ex, c) { const m = new Map();
  if (ex === "bitvavo") { let end = FIN; while (end > INI) { const start = Math.max(INI, end - 1440 * M15); const j = await getJ(`https://api.bitvavo.com/v2/${c}-EUR/candles?interval=15m&limit=1440&start=${start}&end=${end}`); if (!Array.isArray(j) || !j.length) break; for (const k of j) m.set(+k[0], k.slice(0, 6).map(Number)); end = start; await wait(150); } }
  else { let after = FIN; while (after > INI) { const j = await getJ(`https://www.okx.com/api/v5/market/history-candles?instId=${c}-USDT&bar=15m&limit=100&after=${after}`); const d = j && j.data; if (!Array.isArray(d) || !d.length) break; for (const k of d) m.set(+k[0], k.slice(0, 6).map(Number)); after = Math.min(...d.map((k) => +k[0])); await wait(110); } }
  return [...m.values()].filter((k) => k[0] >= INI).sort((a, b) => a[0] - b[0]); }

if (process.env.FASE === "descarga") {
  const ex = process.env.EX, SH = +process.env.SHARD, NSH = +process.env.NSH, L = (await top(ex)).filter((c, i) => i % NSH === SH), o = {};
  for (const c of L) { const v = await velas(ex, c); if (v.length > 5000) o[c] = v; console.log(ex, c, v.length); }
  mkdirSync("out", { recursive: true }); writeFileSync(`out/v-${ex}-${SH}.json.gz`, gzipSync(JSON.stringify(o))); process.exit(0); }

// ---------- simulación ----------
const ema = (a, n) => { const k = 2 / (n + 1), o = []; let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[i]; o.push(e); } return o; };
const hNY = (t) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(t)); return (+p.find((x) => x.type === "hour").value % 24) * 60 + +p.find((x) => x.type === "minute").value; };
const hMad = (t) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(t)); return (+p.find((x) => x.type === "hour").value % 24) * 60 + +p.find((x) => x.type === "minute").value; };
const dia = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
// cartera: cada operación usa una fracción fija del dinero; se aplica al cerrar (orden por hora de cierre)
function cartera(T, frac) { T.sort((a, b) => a.tc - b.tc); let eq = 1, pk = 1, dd = 0; const dias = new Set(); for (const x of T) { eq *= 1 + frac * x.r; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); dias.add(dia(x.t)); }
  return { n: T.length, gan: T.length ? T.filter((x) => x.r > 0).length / T.length : 0, ret: eq - 1, dd, dias: dias.size, med: T.length ? T.reduce((s, x) => s + x.r, 0) / T.length : 0 }; }
function prep(D) { const o = {}; for (const [c, v] of Object.entries(D)) { const cl = v.map((k) => k[4]); o[c] = { v, cl, e20: ema(cl, 20), e50: ema(cl, 50), ix: new Map(v.map((k, i) => [k[0], i])) }; } return o; }

function A(P, fee) { // escáner: a las 08:30 y 14:00 de Madrid, top 3 por subida 24h con volumen 24h > 2x su media de 20 días
  const T = [], monedas = Object.keys(P), tiempos = [...new Set(Object.values(P).flatMap((p) => p.v.map((k) => k[0])))].sort((a, b) => a - b);
  const ocupado = {};
  for (const t of tiempos) { const hm = hMad(t); if (hm !== 510 && hm !== 840) continue;
    const cand = [];
    for (const c of monedas) { const p = P[c], i = p.ix.get(t); if (i == null || i < 96 * 21) continue;
      const ch = p.cl[i] / p.cl[i - 96] - 1; let v24 = 0; for (let k = i - 95; k <= i; k++) v24 += p.v[k][5] * p.v[k][4];
      let vm = 0; for (let k = i - 96 * 21 + 1; k <= i - 96; k++) vm += p.v[k][5] * p.v[k][4]; vm /= 20; if (vm > 0 && v24 > 2 * vm && ch > 0.06) cand.push({ c, ch, i }); }
    cand.sort((a, b) => b.ch - a.ch);
    for (const { c, i } of cand.slice(0, 3)) { if (ocupado[c] && ocupado[c] > t) continue; const p = P[c], v = p.v; let ent = null, j = i + 1, hi = 0;
      for (let k = Math.max(0, i - 40); k <= i; k++) hi = Math.max(hi, v[k][2]);
      for (; j < Math.min(v.length, i + 24); j++) { if (p.e20[j - 1] > p.e50[j - 1] && v[j][3] <= p.e20[j - 1] && v[j][1] > p.e20[j - 1]) { ent = p.e20[j - 1]; break; } hi = Math.max(hi, v[j][2]); }
      if (ent == null) continue; const tp = Math.max(hi, ent * 1.022); let out = null, mk = false, k = j + 1;
      for (; k < Math.min(v.length, j + 48); k++) { if (v[k][2] >= tp) { out = tp; mk = true; break; } if (p.cl[k] < p.e50[k] * 0.999 || p.cl[k] < ent * 0.985) { out = p.cl[k] * (1 - SLIP); break; } }
      if (out == null) { k = Math.min(v.length - 1, k); out = p.cl[k] * (1 - SLIP); }
      T.push({ c, t: v[j][0], tc: v[k][0], r: (out * (1 - (mk ? fee.mk : fee.tk))) / (ent * (1 + fee.mk)) - 1 }); ocupado[c] = v[k][0]; } }
  return T; }
function B(P, fee) { const T = []; for (const c of Object.keys(P)) { const p = P[c], v = p.v;
  for (let i = 20; i < v.length - 1; i++) { if (hNY(v[i][0]) !== 570) continue; const bh = v[i][2], bl = v[i][3], w = bh - bl; if (!(w > 0)) continue;
    let va = 0; for (let k = i - 20; k < i; k++) va += v[k][5]; va /= 20; let j = i + 1, rot = -1;
    for (; j < Math.min(v.length, i + 12); j++) { if (v[j][4] > bh && v[j][5] > va) { rot = j; break; } if (v[j][4] < bl) break; } if (rot < 0) continue;
    let ent = null; for (j = rot + 1; j < Math.min(v.length, rot + 9); j++) if (v[j][3] <= bh) { ent = bh; break; } if (ent == null) continue;
    const tp = Math.max(ent + 2 * w, ent * 1.02), sl = bl; let out = null, mk = false, k = j + 1;
    for (; k < v.length; k++) { if (v[k][3] <= sl) { out = Math.min(sl, v[k][1]) * (1 - SLIP); break; } if (v[k][2] >= tp) { out = tp; mk = true; break; } if (hMad(v[k][0]) >= 1290) { out = v[k][4] * (1 - SLIP); break; } }
    if (out == null) continue; T.push({ c, t: v[j][0], tc: v[k][0], r: (out * (1 - (mk ? fee.mk : fee.tk))) / (ent * (1 + fee.mk)) - 1 }); i = k; } }
  return T; }
function C(P, fee) { const T = []; for (const c of Object.keys(P)) { const p = P[c], v = p.v;
  for (let i = 96; i < v.length - 96; i += 96) { // cada día: canal de las últimas 24 h
    let hi = 0, lo = Infinity, atr = 0; for (let k = i - 96; k < i; k++) { hi = Math.max(hi, v[k][2]); lo = Math.min(lo, v[k][3]); atr += (v[k][2] - v[k][3]) / v[k][4]; } atr /= 96;
    const anch = hi / lo - 1; if (anch < 0.04 || anch > 0.06 || atr < 0.008) continue;
    const niv = [0.1, 0.2, 0.3].map((f) => lo + f * (hi - lo)), abierto = niv.map(() => null);
    for (let k = i; k < i + 96; k++) { if (v[k][4] < lo * 0.98) { for (let q = 0; q < 3; q++) if (abierto[q] != null) { T.push({ c, t: v[k][0], tc: v[k][0], r: (v[k][4] * (1 - SLIP) * (1 - fee.tk)) / (abierto[q] * (1 + fee.mk)) - 1 }); abierto[q] = null; } break; }
      for (let q = 0; q < 3; q++) { if (abierto[q] == null) { if (v[k][3] <= niv[q]) abierto[q] = niv[q]; } else if (v[k][2] >= abierto[q] * 1.02) { T.push({ c, t: v[k][0], tc: v[k][0], r: (1.02 * (1 - fee.mk)) / (1 + fee.mk) - 1 }); abierto[q] = null; } } }
    for (let q = 0; q < 3; q++) if (abierto[q] != null) { const k = i + 95; T.push({ c, t: v[k][0], tc: v[k][0], r: (v[k][4] * (1 - SLIP) * (1 - fee.tk)) / (abierto[q] * (1 + fee.mk)) - 1 }); } } }
  return T; }

const P1 = (x) => (x * 100).toFixed(1) + "%";
for (const ex of ["bitvavo", "okx"]) { const D = {};
  for (const f of readdirSync("res", { recursive: true })) if (String(f).includes(`v-${ex}-`) && String(f).endsWith(".gz")) Object.assign(D, JSON.parse(gunzipSync(readFileSync("res/" + f))));
  const P = prep(D), fee = FEES[ex], mitad = FIN - 182 * 864e5; console.log(`\n===== ${ex}: ${Object.keys(P).length} monedas (las de más volumen) =====`);
  for (const [nom, f, frac] of [["A · escáner + EMA20", A, 1 / 3], ["B · apertura NY (ORB)", B, 1 / 5], ["C · rejilla lateral", C, 1 / 9]]) { const T = f(P, fee), a = cartera(T.slice(), frac), b = cartera(T.filter((x) => x.t >= mitad), frac);
    console.log(`${nom.padEnd(24)} ops ${a.n} en ${a.dias} días · acierto ${P1(a.gan)} · media por op ${P1(a.med)} · CARTERA 12m ${P1(a.ret)} (caída ${P1(a.dd)}) · últimos 6m ${P1(b.ret)}`); } }
