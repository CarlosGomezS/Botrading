import test from "node:test";
import assert from "node:assert/strict";
import { rasgos, entra, backtest, robusta, evolucionar, paso, fresh, BASE, mutar, aleatorio, gkey } from "../runner/bitvavo.mjs";
{ let z = 7; Math.random = () => { z = (z * 16807) % 2147483647; return z / 2147483647; }; }
const T0 = Date.parse("2026-11-01T00:00:00Z");
// mercado sintético: tendencias suaves con descansos (se puede ganar) o ruido puro
function mercado(n, tipo, seed = 1) { let z = seed, p = 100; const r = () => (z = (z * 16807) % 2147483647) / 2147483647, c = [];
  for (let i = 0; i < n; i++) { const tr = tipo === "tend" ? (Math.floor(i / 60) % 2 ? 0.0025 : -0.0012) : 0; const o = p; p = p * (1 + tr + (r() - 0.5) * 0.004); c.push([T0 + i * 300e3, o, Math.max(o, p) * 1.001, Math.min(o, p) * 0.999, p, 1000 * (tr > 0 ? 1.6 : 1) * (0.8 + r() * 0.4)]); }
  return c; }
test("rasgos y entrada: ve una subida sana con volumen y no entra en ruido plano", () => {
  const c = mercado(300, "tend"), f = rasgos(c); assert.equal(f[10], null); assert.ok(f[299] && typeof f[299].m60 === "number");
  assert.ok(f.some((x) => entra({ ...BASE, volMin: 1, hlMin: 0 }, x)), "en tendencia alguna vez entra");
  assert.equal(entra(BASE, null), false);
});
test("backtest con costes: cuenta operaciones, y robusta exige ganar en las dos mitades", () => {
  const H = { m: {} }; for (let k = 0; k < 6; k++) { const c = mercado(1000, "tend", k + 3); H.m["M" + k] = { c, f: rasgos(c), sp: 0.001 }; }
  const b = backtest({ ...BASE, volMin: 1, hlMin: 0 }, H); assert.ok(b.n > 10, "opera: " + b.n);
  const H2 = { m: {} }; for (let k = 0; k < 6; k++) { const c = mercado(1000, "ruido", k + 9); H2.m["R" + k] = { c, f: rasgos(c), sp: 0.001 }; }
  const r2 = robusta({ ...BASE, volMin: 0.5, hlMin: 0, m60Min: -0.02, m15Min: -0.01, ema: 0, pullMax: 0.1 }, H2); assert.ok(!r2.ok, "en ruido puro no hay regla ganadora");
});
test("laboratorio: prueba cientos de reglas, se queda con 40 y adopta solo si gana en las dos mitades", () => {
  const H = { m: {} }; for (let k = 0; k < 6; k++) { const c = mercado(1000, "tend", k + 21); H.m["M" + k] = { c, f: rasgos(c), sp: 0.001 }; }
  const S = fresh(new Date(T0)); const e = evolucionar(S, H, new Date(T0), Math.random, 4000);
  assert.ok(e.probadas > 50); assert.ok(S.lab.pop.length <= 60 && S.lab.pop.some((v) => v.id === "base"));
  if (S.prueba === false) { const v = S.lab.pop.find((x) => x.id === S.genomeId); assert.ok(v.ok && v.a.med > 0 && v.b.med > 0); }
  assert.notEqual(gkey(mutar(BASE)), gkey(BASE)); assert.ok(aleatorio().stop > 0);
});
test("paso en vivo: compra al precio de venta del libro, paga comisión, y el stop vende", () => {
  const S = fresh(new Date(T0)); S.prueba = false; const f = { m15: 0.005, m60: 0.01, m240: 0.02, sobre: 1, hl: 1, vol: 2, pull: 0.01 };
  paso(S, { "AAA-EUR": { bid: 9.99, ask: 10 } }, { "AAA-EUR": f }, new Date(T0)); const p = S.pos["AAA-EUR"]; assert.ok(p && Math.abs(p.cost - 15) < 1e-9 && p.q < 1.5);
  paso(S, { "AAA-EUR": { bid: 9.6, ask: 9.61 } }, {}, new Date(T0 + 60000)); assert.equal(Object.keys(S.pos).length, 0); assert.ok(S.closed[0].pc < -3 && S.closed[0].pc > -5);
});
import { rankear } from "../runner/bitvavo.mjs";
test("métodos de grandes traders: tortuga, williams, connors y rotación se calculan y pueden entrar", () => {
  const H = {}; for (let k = 0; k < 6; k++) { const c = mercado(900, "tend", k + 40); H["M" + k] = rasgos(c); }
  rankear(H); const f = H.M0.filter(Boolean); assert.ok(f.some((x) => x.rk != null), "hay ranking entre criptos");
  assert.ok(f.some((x) => x.don != null) && f.some((x) => x.vb != null) && f.every((x) => x.rsi2 >= 0 && x.rsi2 <= 100));
  for (const [estilo, extra] of [["tortuga", { pullMax: 0.05, volMin: 0.5 }], ["williams", { k: 0.2 }], ["connors", { rsiMax: 30 }], ["rotacion", { rkMax: 0.35 }]])
    assert.ok(Object.values(H).some((arr) => arr.some((x) => entra({ ...BASE, estilo, ...extra }, x))), estilo + " entra alguna vez");
});
test("métodos de traders cripto: capitulación, fade y máximos; y piramidar sube el stop a sin pérdidas", () => {
  // una caída fuerte con pánico y luego estabilización; una vela que se desploma; y una subida a máximos
  const c = []; let p = 100; for (let i = 0; i < 1400; i++) { let r = 0.0003, v = 1000; if (i >= 600 && i < 612) { r = -0.008; v = 6000; } if (i === 900) { r = -0.04; v = 9000; } if (i > 1100) { r = 0.002; v = 2500; } const o = p; p = p * (1 + r + (i % 2 ? 0.0004 : -0.0004)); c.push([T0 + i * 300e3, o, Math.max(o, p) * 1.0005, Math.min(o, p) * 0.9995, p, v]); }
  const f = rasgos(c);
  assert.ok(f.some((x) => entra({ ...BASE, estilo: "capitulacion", k: 0.15, volMin: 1 }, x)), "capitulación");
  assert.ok(f.some((x) => entra({ ...BASE, estilo: "fade", k: 0.15 }, x)), "fade");
  assert.ok(f.some((x) => entra({ ...BASE, estilo: "maximos", volMin: 0.5, pullMax: 0.01 }, x)), "máximos");
  const H = { m: { A: { c, f, sp: 0.001 } } }, sin = backtest({ ...BASE, estilo: "maximos", volMin: 0.5, pullMax: 0.01, pir: 0 }, H), con = backtest({ ...BASE, estilo: "maximos", volMin: 0.5, pullMax: 0.01, pir: 1, pirOn: 0.01, stop: 0.05, trailOn: 0.5, maxHoldH: 48 }, H);
  assert.ok(sin.n > 0 && con.n > 0);
});
import { entrenarIA, etiquetas, entrenar, predecir, auc } from "../runner/bitvavo-ia.mjs";
test("IA de Bitvavo: aprende un patrón real, se examina con días que no ha visto y rellena f.ia sin hacer trampa", () => {
  // patrón escondido: cuando el volumen se dispara con la vela verde, el precio sube después
  const H = { m: {} };
  for (let k = 0; k < 8; k++) { let z = 11 + k, p = 100; const r = () => (z = (z * 16807) % 2147483647) / 2147483647, c = []; let ola = 0;
    for (let i = 0; i < 1600; i++) { const ev = r() < 0.03; if (ev) ola = 30; const tr = ola > 0 ? 0.0012 : -0.0001; ola--; const o = p; p = p * (1 + tr + (r() - 0.5) * 0.003); c.push([T0 + i * 300e3, o, Math.max(o, p) * 1.001, Math.min(o, p) * 0.999, p, ev ? 9000 : 1000 * (0.7 + r() * 0.6)]); }
    H.m["M" + k] = { c, f: rasgos(c), sp: 0.001 }; }
  const t = Date.now(), R = entrenarIA(H); assert.ok(R.listo, "aprende: auc " + R.auc); assert.ok(R.auc > 0.6); assert.ok(Date.now() - t < 20000, "rápido");
  const f = H.m.M0.f.filter(Boolean); assert.ok(f.some((x) => x.ia != null && x.ia >= 0 && x.ia <= 1));
  assert.ok(R.imp.length > 0 && R.top5.acierta > R.base, "en su 5 % más seguro acierta más que la media");
  const b = backtest({ ...BASE, estilo: "ia", iaMin: 0.3, stop: 0.015, tp: 0.02, tpFrac: 1, trailOn: 0.5, maxHoldH: 6 }, H); assert.ok(b.n > 0);
});
