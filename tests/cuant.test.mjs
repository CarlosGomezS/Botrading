// v251 · método cuantitativo (Simons · Dalio · Tortugas): pilares, filtro de coste, riesgo del 1,5 % y salidas
import test from "node:test";
import assert from "node:assert/strict";
import * as CU from "../runner/cuant.mjs";
import * as B from "../runner/bitvavo.mjs";

const base = (n, p0 = 100, t0 = Date.UTC(2026, 9, 1)) => Array.from({ length: n }, (_, i) => { const p = p0 * (1 + Math.sin(i / 7) * 0.002); return [t0 + i * 300e3, p, p * 1.001, p * 0.999, p, 100]; });

test("pilar B · caza de stops: barre el mínimo de 24 velas y cierra dentro → compra con stop 0,3 % bajo la mecha y objetivo 1:3", () => {
  const c = base(200); const i = 150, lo24 = Math.min(...c.slice(i - 24, i).map((x) => x[3])), p = c[i - 1][4];
  c[i] = [c[i][0], p, p * 1.001, lo24 * 0.97, p * 0.999, 300];   // mecha que barre un 3 % y cierra dentro
  const F = B.rasgos(c), f = F[i]; assert.ok(f.lo < f.lo24 && f.cl > f.lo24);
  const P = CU.plan(f, f.cl); assert.equal(P.pilar, "B"); assert.ok(Math.abs(P.sl - f.lo * 0.997) < 1e-9);
  assert.ok(Math.abs((P.tp1 - f.cl) - 3 * (f.cl - P.sl)) < 1e-9, "1:3");
});
test("filtro de coste: si el objetivo no paga 4,5 × las comisiones (1,8 %), no entra", () => {
  const f = { atr: 0.1, cz: 0, rsi14: 50, mechaL: 0, vr20: 1, lo: 99.9, lo24: 99.95, cl: 100, sqzPull: 0 };   // barrido mínimo: objetivo +0,6 %
  assert.equal(CU.plan(f, 100), null);
});
test("riesgo: arriesga como mucho el 1,5 % del saldo (el tamaño sale de la distancia al stop) y nunca más de la mitad del saldo", () => {
  const P = { sl: 98 }; assert.ok(Math.abs(CU.tamano(100, 100, 100, P) - 50) < 1e-9, "stop 2 % → 75 €, pero tope 50 €");
  const P2 = { sl: 95 }; const a = CU.tamano(100, 100, 100, P2); assert.ok(Math.abs(a * 0.05 - 1.5) < 1e-9, "stop 5 % → 30 € (pierde 1,5 €)");
});
test("salidas: stop primero; pilar C vende la mitad en 2R, el resto en 4R o si cierra bajo la EMA(9)", () => {
  const p = { plan: { pilar: "C", sl: 98, tp1: 104, f1: 0.5, tp2: 108, trail: "ema9", atr: 1 }, peak: 100 };
  assert.equal(CU.salida(p, 105, 97, 99, null).por, "stop del pilar C");
  const x = CU.salida(p, 104.5, 100, 104, null); assert.equal(x.sale, 0.5); p.tp = 1;
  assert.equal(CU.salida(p, 103, 101, 101, { ema9: 102 }).por, "cierra bajo la EMA(9)");
  assert.equal(CU.salida(p, 108.5, 103, 108, { ema9: 102 }).por, "objetivo 4R");
});
test("backtest y bot: el método opera con su plan (en el bot, aunque el laboratorio aún no le dé la 🏆)", () => {
  const c = base(400); for (const i of [150, 250, 350]) { const lo24 = Math.min(...c.slice(i - 24, i).map((x) => x[3])), p = c[i - 1][4]; c[i] = [c[i][0], p, p * 1.001, lo24 * 0.97, p * 0.999, 300]; for (let j = i + 1; j < i + 30; j++) { const q = p * (1 + (j - i) * 0.006); c[j] = [c[j][0], q, q * 1.002, q * 0.998, q, 100]; } }
  const H = { m: { "A-EUR": { c, f: B.rasgos(c), sp: 0.001 } } }, r = B.backtest(B.PERF.cuant.base, H); assert.ok(r.n >= 2, "opera: " + r.n); assert.ok(r.med > 0);
  const S = B.fresh(new Date()); S.genome = { ...B.PERF.cuant.base }; S.prueba = true; const i = 150, f = H.m["A-EUR"].f[i];
  B.paso(S, { "A-EUR": { bid: f.cl, ask: f.cl * 1.0005 } }, { "A-EUR": f }, new Date(c[i][0])); const p = S.pos["A-EUR"];
  assert.ok(p && p.plan && p.plan.pilar === "B", "compra con plan"); assert.ok(p.cost * (1 - p.plan.sl / p.px) <= 1.5 + 1e-6, "arriesga ≤ 1,5 €");
});
