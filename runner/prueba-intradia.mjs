// Prueba rápida (una vez) de 3 métodos intradía de un texto: reversión a la media 15m, ruptura tras compresión 1H y VWAP de apertura de NY.
// Solo compras (spot), comisiones reales de cada exchange + deslizamiento, 12 meses de velas de 15 min. Solo datos: no opera.
import { writeFileSync, mkdirSync } from "node:fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIAS = 365, FIN = Date.now(), INI = FIN - DIAS * 864e5, M15 = 15 * 60e3;
const EXS = (process.env.EX || "bitvavo,okx").split(","), SH = +(process.env.SHARD || 0), NSH = +(process.env.NSH || 1);
const FEES = { bitvavo: { mk: 0.0020, tk: 0.0025 }, okx: { mk: 0.0008, tk: 0.0010 } }, SLIP = 0.0005;

async function getJ(u) { for (let t = 0; t < 6; t++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch {} await wait(1500 * (t + 1)); } return null; }
async function bitvavo(c) { const m = new Map(); let end = FIN;
  while (end > INI) { const start = Math.max(INI, end - 1440 * M15); const j = await getJ(`https://api.bitvavo.com/v2/${c}-EUR/candles?interval=15m&limit=1440&start=${start}&end=${end}`);
    if (!Array.isArray(j) || !j.length) break; for (const k of j) m.set(+k[0], [+k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]); end = start; await wait(150); }
  return [...m.values()].sort((a, b) => a[0] - b[0]); }
async function okx(c) { const m = new Map(); let after = FIN;
  while (after > INI) { const j = await getJ(`https://www.okx.com/api/v5/market/history-candles?instId=${c}-USDT&bar=15m&limit=100&after=${after}`);
    const d = j && j.data; if (!Array.isArray(d) || !d.length) break; for (const k of d) m.set(+k[0], [+k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]); after = Math.min(...d.map((k) => +k[0])); await wait(110); }
  return [...m.values()].filter((k) => k[0] >= INI).sort((a, b) => a[0] - b[0]); }

const sma = (a, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };
const sd = (a, i, n, m) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += (a[k] - m) ** 2; return Math.sqrt(s / n); };
function rsi(cl, n = 14) { const r = Array(cl.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; r[i] = 100 - 100 / (1 + g / (l || 1e-12)); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; r[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return r; }
function aH(v) { const o = []; let cur = null; for (const k of v) { const h = Math.floor(k[0] / 36e5) * 36e5;
  if (!cur || cur[0] !== h) { if (cur) o.push(cur); cur = [h, k[1], k[2], k[3], k[4], k[5]]; } else { cur[2] = Math.max(cur[2], k[2]); cur[3] = Math.min(cur[3], k[3]); cur[4] = k[4]; cur[5] += k[5]; } }
  if (cur) o.push(cur); return o; }

// simulación genérica: señal(i) → {tipo:"mk"|"tk", px, tp, sl, tpMk, max} ; resuelve barra a barra (si toca SL y TP en la misma, cuenta SL)
function sim(v, senal, fee) { const T = []; let i = 0;
  while (i < v.length - 1) { const s = senal(i); if (!s) { i++; continue; }
    let j = s.desde ?? i + 1, ent = null;
    if (s.tipo === "lim") { for (; j < Math.min(v.length, i + 1 + (s.espera || 8)); j++) if (v[j][3] <= s.px) { ent = s.px; break; } if (ent == null) { i = j; continue; } }
    else ent = s.px * (1 + SLIP);
    const tp = ent * (1 + s.tpP), sl = ent * (1 - s.slP); let out = null, mk = false, k = j + (s.tipo === "lim" ? 1 : 0);
    for (; k < Math.min(v.length, j + s.max); k++) { const tpx = s.tpDin ? Math.max(s.tpDin(k), ent * 1.003) : tp;
      if (v[k][3] <= sl) { out = Math.min(sl, v[k][1]) * (1 - SLIP); break; } if (v[k][2] >= tpx) { out = Math.max(tpx, v[k][1]); mk = true; break; } }
    if (out == null) { k = Math.min(v.length - 1, k); out = v[k][4] * (1 - SLIP); }
    const fIn = s.tipo === "lim" ? fee.mk : fee.tk, fOut = mk ? fee.mk : fee.tk;
    T.push({ t: v[j][0], r: (out * (1 - fOut)) / (ent * (1 + fIn)) - 1 }); i = k + 1; }
  return T; }

function M1(v, fee) { const cl = v.map((k) => k[4]), R = rsi(cl);
  return sim(v, (i) => { const m = sma(cl, i, 20); if (m == null || R[i] == null) return null; const lo = m - 2.5 * sd(cl, i, 20, m);
    if (cl[i] < lo && R[i] < 25) return { tipo: "lim", px: cl[i] * 0.997, espera: 4, tpP: 0.022, slP: 0.011, max: 96, tpDin: (k) => sma(cl, k, 20) }; return null; }, fee); }
function M2(v15, fee) { const v = aH(v15), cl = v.map((k) => k[4]), vol = v.map((k) => k[5]), W = cl.map((c, i) => { const m = sma(cl, i, 20); return m == null ? null : (4 * sd(cl, i, 20, m)) / m; });
  return sim(v, (i) => { if (i < 140 || W[i - 1] == null) return null; let mn = Infinity; for (let k = i - 120; k < i - 1; k++) if (W[k] != null) mn = Math.min(mn, W[k]);
    let comp = false; for (let k = i - 8; k < i; k++) if (W[k] != null && W[k] <= mn * 1.1) comp = true; if (!comp) return null;
    let hh = -Infinity; for (let k = i - 12; k < i; k++) hh = Math.max(hh, v[k][2]); const va = sma(vol, i - 1, 20);
    const body = Math.abs(v[i][4] - v[i][1]) > 0.5 * (v[i][2] - v[i][3]);
    if (cl[i] > hh && vol[i] > 2.5 * va && body) return { tipo: "lim", px: hh, espera: 6, tpP: 0.035, slP: 0.014, max: 48 }; return null; }, fee); }
function M3(v, fee) { // VWAP anclado 00:00 UTC; barrido del mínimo previo entre 13:30-15:30 UTC y recuperación del VWAP; entrada límite en el retroceso al VWAP
  const vw = [], dlo = []; let d = -1, pv = 0, vv = 0, lo = Infinity, loPre = Infinity;
  for (let i = 0; i < v.length; i++) { const dd = Math.floor(v[i][0] / 864e5); if (dd !== d) { d = dd; pv = 0; vv = 0; lo = Infinity; loPre = Infinity; }
    const tp = (v[i][2] + v[i][3] + v[i][4]) / 3; pv += tp * v[i][5]; vv += v[i][5]; vw[i] = vv ? pv / vv : v[i][4];
    const hm = new Date(v[i][0]).getUTCHours() * 60 + new Date(v[i][0]).getUTCMinutes(); if (hm < 810) loPre = Math.min(loPre, v[i][3]); dlo[i] = loPre; }
  let barrido = -1;
  return sim(v, (i) => { const t = new Date(v[i][0]), hm = t.getUTCHours() * 60 + t.getUTCMinutes(); if (hm < 810 || hm > 930) { if (hm < 810) barrido = -1; return null; }
    if (v[i][3] < dlo[i]) barrido = i; if (barrido >= 0 && i > barrido && v[i][4] > vw[i] && v[i - 1][4] <= vw[i - 1]) { barrido = -1; return { tipo: "lim", px: vw[i], espera: 8, tpP: 0.025, slP: 0.012, max: 36 }; } return null; }, fee); }

const res = (T, desde) => { const X = T.filter((x) => x.t >= desde); let eq = 1, pk = 1, dd = 0; for (const x of X) { eq *= 1 + x.r; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); }
  return { n: X.length, gan: X.length ? X.filter((x) => x.r > 0).length / X.length : 0, ret: eq - 1, dd }; };
const out = []; const P = (x) => (x * 100).toFixed(1) + "%";
async function lista(ex) { if (ex === "bitvavo") { const j = await getJ("https://api.bitvavo.com/v2/markets"); return (j || []).filter((m) => m.quote === "EUR" && m.status === "trading").map((m) => m.base).sort(); }
  const j = await getJ("https://www.okx.com/api/v5/public/instruments?instType=SPOT"); return ((j && j.data) || []).filter((m) => m.quoteCcy === "USDT" && m.state === "live").map((m) => m.baseCcy).sort(); }
for (const ex of EXS) { const L = (await lista(ex)).filter((c, i) => i % NSH === SH); console.log(ex, "monedas en este trozo:", L.length); for (const c of L) {
  let v = []; try { v = ex === "bitvavo" ? await bitvavo(c) : await okx(c); } catch (e) {}
  if (v.length < 5000) continue;
  const bh = v.at(-1)[4] / v[0][4] - 1, mitad = FIN - 182 * 864e5;
  for (const [nom, f] of [["1-reversion15m", M1], ["2-ruptura1H", M2], ["3-vwapNY", M3]]) { const T = f(v, FEES[ex]), a = res(T, 0), b = res(T, mitad);
    const row = { ex, c, met: nom, n: a.n, gan: a.gan, ret: a.ret, dd: a.dd, ret6m: b.ret, n6m: b.n, bh };
    out.push(row); if (a.ret > 0) console.log(`${ex.padEnd(8)} ${c.padEnd(5)} ${nom.padEnd(15)} ops ${String(a.n).padStart(4)} acierto ${P(a.gan).padStart(6)} 12m ${P(a.ret).padStart(7)} caída ${P(a.dd).padStart(6)} | 6m ${P(b.ret).padStart(7)} (${b.n}) | comprar y mantener ${P(bh)}`); } } }
mkdirSync("out", { recursive: true }); writeFileSync(`out/res-${EXS.join("_")}-${SH}.json`, JSON.stringify(out));
