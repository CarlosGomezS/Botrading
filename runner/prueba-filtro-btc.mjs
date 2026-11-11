// Prueba única: las reglas de Tortugas que están ahora en el podio, CON y SIN el filtro de bitcoin, con datos reales de 2 años de cada exchange.
import * as B from "./bitvavo.mjs";
const TT = await import("./tortugas.mjs"), OK = await import("./okx.mjs");
const el = await (await fetch(`https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/examen-largo/examen-largo.json?t=${Date.now()}`)).json(), UV = await B.universo();
const P1 = (x) => (x == null ? "—" : (x >= 0 ? "+" : "") + Number(x).toFixed(1) + " %");
for (const ex of ["bitvavo", "okx"]) {
  let lista = [];
  if (ex === "bitvavo") lista = TT.universo(UV.tick).map(([m]) => ({ m }));
  else { const PO = await OK.preciosOkx(await OK.instrumentos()); lista = TT.universo(PO.tickEx).map(([m, x]) => ({ m, par: x.par, k: x.k })); }
  const series = {}; for (const { m, par, k } of lista) { try { const d = await TT.diarias(ex, m, 800, par, k || 1); if (d.length >= 200) series[m] = d; } catch (e) {} }
  console.log(`\n===== ${ex.toUpperCase()} · ${Object.keys(series).length} criptos · comisión ${(TT.FEES[ex] * 100).toFixed(2)} % =====`);
  const perf = ((el.tortugas || {})[ex] || {}).perfiles || {};
  for (const rk of ["bajo", "medio", "alto"]) { const r = perf[rk]; if (!r || !r.P) continue;
    for (const [nom, P] of [["CON filtro BTC", r.P], ["SIN filtro BTC", { ...r.P, filtro: 0 }]]) {
      const s = TT.simula(series, TT.FEES[ex], undefined, P), sem = s.semestres || [];
      console.log(`riesgo ${rk.padEnd(5)} · ${nom} · 2 años ${P1(s.ret)} · peor caída −${s.dd} % · ${s.n} operaciones · aciertos ${s.aciertos} % · gana ${s.pf} € por € perdido${sem.length ? " · semestres " + sem.map(P1).join(" / ") : ""}`); } } }
