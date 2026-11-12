// Prueba (una vez) del MOMENTUM MULTICRIPTO que proponía otra IA: cada semana (o cada 3 días) compra las N criptos más fuertes
// (rendimiento de 7 y 30 días ajustado por volatilidad), a partes iguales, con o sin filtro de BTC sobre su media. Spot, solo compras.
// 2 años de velas diarias de Bitvavo y OKX, con SUS comisiones + deslizamiento. Se compara con las Tortugas del podio y con tener BTC.
import * as B from "./bitvavo.mjs";
import * as TT from "./tortugas.mjs";
import * as OK from "./okx.mjs";
const DD = 86400e3, SLIP = 0.002, P = (x) => (x >= 0 ? "+" : "") + x.toFixed(1) + " %";
function sma(a, i, n) { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; }
function prueba(S, fee, o) {
  const ms = Object.keys(S), T = [...new Set(ms.flatMap((m) => S[m].map((x) => x[0])))].sort((a, b) => a - b), idx = {}; for (const m of ms) idx[m] = new Map(S[m].map((x, i) => [x[0], i]));
  const btc = S["BTC-EUR"]; let eq = 1, pico = 1, dd = 0, hold = {}, n = 0, cur = [];
  const px = (m, t) => { const i = idx[m].get(t); return i == null ? null : S[m][i][4]; };
  for (let d = 60; d < T.length; d++) { const t = T[d];
    // valoración diaria
    if (Object.keys(hold).length) { let tot = hold.__cash || 0; for (const [m, h] of Object.entries(hold)) { if (m === "__cash") continue; const p = px(m, t); if (p) h.p = p; tot += h.q * h.p; } eq = tot; }
    pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); cur.push([t, eq]);
    if ((d - 60) % o.cada) continue;
    // señal
    let fil = true; if (o.filtro && btc) { const ib = idx["BTC-EUR"].get(t); const c = btc.map((x) => x[4]); fil = ib != null && ib >= o.mFil && c[ib] > sma(c, ib, o.mFil); }
    const cand = []; if (fil) for (const m of ms) { const i = idx[m].get(t); if (i == null || i < 31) continue; const c = S[m]; const r7 = c[i][4] / c[i - 7][4] - 1, r30 = c[i][4] / c[i - 30][4] - 1; let s2 = 0; for (let k = i - 29; k <= i; k++) { const r = c[k][4] / c[k - 1][4] - 1; s2 += r * r; } const vol = Math.sqrt(s2 / 30) || 1; if (r30 <= 0 && o.soloPos) continue; cand.push([m, (0.4 * r7 + 0.6 * r30) / vol]); }
    const top = cand.sort((a, b) => b[1] - a[1]).slice(0, o.N).map((x) => x[0]);
    // rebalanceo: vende lo que no está en el top, compra lo nuevo (a partes iguales)
    const keep = new Set(top); let c0 = hold.__cash || (Object.keys(hold).length ? 0 : eq);
    for (const [m, h] of Object.entries(hold)) { if (m === "__cash" || keep.has(m)) continue; c0 += h.q * h.p * (1 - fee - SLIP / 2); delete hold[m]; n++; }
    const nuevos = top.filter((m) => !hold[m]); if (nuevos.length) { const objetivo = (c0 + Object.entries(hold).filter(([k]) => k !== "__cash").reduce((a, [, h]) => a + h.q * h.p, 0)) / Math.max(1, top.length);
      for (const m of nuevos) { const p = px(m, t); if (!p) continue; const eur = Math.min(c0, objetivo); if (eur <= 0) break; hold[m] = { q: (eur * (1 - fee)) / (p * (1 + SLIP / 2)), p }; c0 -= eur; n++; } }
    hold.__cash = c0; }
  const sem = [0, 1, 2, 3].map((j) => { const a = Math.floor((cur.length * j) / 4), b = Math.floor((cur.length * (j + 1)) / 4) - 1; return (cur[b][1] / (j ? cur[a - 1][1] : 1) - 1) * 100; });
  return { ret: (eq - 1) * 100, dd: dd * 100, n, sem, r6: (cur[cur.length - 1][1] / cur[Math.max(0, cur.length - 183)][1] - 1) * 100 };
}
const UV = await B.universo(); const SER = {};
for (const ex of ["bitvavo", "okx"]) { let lista = []; if (ex === "bitvavo") lista = TT.universo(UV.tick).map(([m]) => ({ m })); else { const PO = await OK.preciosOkx(await OK.instrumentos()); lista = TT.universo(PO.tickEx).map(([m, x]) => ({ m, par: x.par, k: x.k })); }
  const s = {}; for (const { m, par, k } of lista) { try { const d = await TT.diarias(ex, m, 800, par, k || 1); if (d.length >= 400) s[m] = d.slice(-730); } catch (e) {} } SER[ex] = s; console.log(`${ex}: ${Object.keys(s).length} criptos con 2 años`); }
for (const ex of ["bitvavo", "okx"]) { const S = SER[ex], fee = TT.FEES[ex]; if (!S["BTC-EUR"]) continue; const b = S["BTC-EUR"]; console.log(`\n=== ${ex} (comisión ${fee * 100} %) · tener BTC 2 años: ${P((b[b.length - 1][4] / b[0][4] - 1) * 100)}`);
  for (const N of [3, 5]) for (const cada of [7, 3]) for (const [filtro, mFil] of [[false, 0], [true, 50], [true, 100], [true, 200]]) for (const soloPos of [true]) {
    const r = prueba(S, fee, { N, cada, filtro, mFil, soloPos }), r2 = prueba(S, fee * 2, { N, cada, filtro, mFil, soloPos });
    console.log(`top ${N} · cada ${cada} días · ${filtro ? "BTC sobre su media de " + mFil : "sin filtro"}: 2 años ${P(r.ret)} · caída ${r.dd.toFixed(0)} % · últimos 6 meses ${P(r.r6)} · semestres ${r.sem.map(P).join(" / ")} · ${r.n} órdenes · con costes dobles ${P(r2.ret)}`); } }
