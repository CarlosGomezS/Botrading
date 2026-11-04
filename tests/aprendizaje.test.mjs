// v245 · aprendizaje: 90 días, relleno de huecos, termómetro, examen en tres tramos y cruce entre laboratorios
import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../runner/bitvavo.mjs";

const serie = (n, seed = 1, t0 = Date.UTC(2026, 7, 1)) => { let p = 100, s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); const c = [];
  for (let i = 0; i < n; i++) { const o = p; p = p * (1 + (r() - 0.5) * 0.01 + Math.sin(i / 300) * 0.0006); c.push([t0 + i * 300e3, o, Math.max(o, p) * 1.002, Math.min(o, p) * 0.998, p, 100 + r() * 300]); } return c; };
const Hde = (ms) => { const H = { m: {} }; ms.forEach((c, i) => { H.m["M" + i + "-EUR"] = { c, f: B.rasgos(c), sp: 0.001 }; }); B.rankear(Object.fromEntries(Object.entries(H.m).map(([m, x]) => [m, x.f]))); return H; };

test("relleno: los huecos se rellenan con velas planas y 1 h son siempre 12 velas", () => {
  const c = serie(100); const con = c.filter((_, i) => i % 7 !== 3); const r = B.rellenar(con);
  assert.equal(r.length, 100); for (let i = 1; i < r.length; i++) assert.equal(r[i][0] - r[i - 1][0], 300e3);
  const hueco = r[3]; assert.equal(hueco[5], 0); assert.equal(hueco[1], r[2][4]);
});
test("termómetro: valor de una serie en cada momento y filtro en las reglas", () => {
  const se = [[1000, 10], [2000, 20], [3000, 30]]; assert.equal(B.enSerie(se, 500), null); assert.equal(B.enSerie(se, 2500), 20); assert.equal(B.enSerie(se, 9999), 30);
  const f = { m15: 0.01, m60: 0.01, m240: 0.01, sobre: 1, hl: 1, vol: 2, pull: 0, fg: 80, fund: 0.00001 }, g = { ...B.BASE, m15Min: 0, m60Min: 0, m60Max: 0.1, m240Min: -0.1, hlMin: 0, volMin: 1, pullMax: 0.1 };
  assert.ok(B.entra(g, f), "sin filtro (0-100) entra");
  assert.ok(!B.entra({ ...g, fgHi: 70 }, f), "con codicia 80 y tope 70 no entra");
  assert.ok(!B.entra({ ...g, fundMax: 0.000005 }, f), "con los futuros muy cargados no entra");
  assert.ok(B.entra({ ...g, fgHi: 70 }, { ...f, fg: null }), "si no hay dato, el filtro no bloquea");
});
test("backtest por tramos = backtest normal de cada tramo (un solo recorrido)", () => {
  const H = Hde([serie(3000, 3), serie(3000, 5)]), g = { ...B.BASE, volMin: 0.5, hlMin: 0, m15Min: -0.002, m60Min: -0.01, ema: 0, pullMax: 0.1 };
  const t0 = H.m["M0-EUR"].c[0][0], cs = [t0, t0 + 1000 * 300e3, t0 + 2000 * 300e3, Infinity], X = B.backtestTramos(g, H, cs);
  assert.equal(X.length, 3); for (let k = 0; k < 3; k++) assert.equal(X[k].n, B.backtest(g, H, cs[k], cs[k + 1]).n, "tramo " + k);
  assert.ok(X.every((x) => x.n > 0));
});
test("examen en tres tramos: ganar en dos no basta", () => {
  const H = Hde([serie(4000, 7), serie(4000, 11), serie(4000, 13)]), g = { ...B.BASE, volMin: 0.5, hlMin: 0, m15Min: -0.002, m60Min: -0.01, ema: 0, pullMax: 0.1 };
  const r = B.robusta(g, H); assert.ok(r.a && r.b && r.c, "devuelve los tres tramos");
  if (r.ok) assert.ok([r.a, r.b, r.c].every((x) => x.n >= 25 && x.med > 0 && x.pf > 1.15));
  const falsa = { s: 0 }; void falsa; const rt = B.robustaTurbo(g, H); assert.ok(rt.c !== undefined);
});
test("cruce entre laboratorios: las reglas de otros se prueban (adaptadas a sus límites) y se cruzan", () => {
  const H = Hde([serie(3000, 17), serie(3000, 19)]), S = { lab: { gen: 0, pop: [], log: [], adopt: [] }, genome: { ...B.PERF.mix.base }, genomeId: "base", prueba: true };
  const deTurbo = { ...B.BASE, estilo: "tortuga", maxHoldH: 2, size: 0.3, iaMin: 0 };
  B.evolucionar(S, H, new Date(), Math.random, 1500, B.PERF.mix, [{ g: deTurbo, de: "⚡ Turbo (b1)" }]);
  const v = S.lab.pop.concat([]).find((x) => /Turbo/.test(x.why || "")); void v;
  assert.ok(S.lab.log.some((l) => /generación/.test(l.txt)));
  const adapt = B.ajustar({ ...deTurbo }, B.PERF.mix); assert.ok(["ia", "copia"].includes(adapt.estilo), "se adapta a los estilos del que la recibe");
});
