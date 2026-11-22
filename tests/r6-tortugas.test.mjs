// v1.0 · revisión independiente R6-12
// Tortugas · aprende(): solo se revisan las 5 mejores del 1.er año, y esas 5 vuelven cada día como madres (pob = 20 mejores del 1.er año).
// Si suspenden (p. ej. «pierde con las criptos del otro exchange»), vuelven a ser las 5 primeras al día siguiente y tapan a todas las nuevas:
// el aprendizaje se queda atascado examinando siempre la misma regla.
import test from "node:test";
import assert from "node:assert/strict";
import * as TT from "../runner/tortugas.mjs";
const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const gauss = (r) => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function mercado(seed, nC = 16, dias = 800, pre = "") { const r = rng(seed), out = {}, t0 = Date.UTC(2024, 0, 1);
  for (let c = 0; c < nC; c++) { const m = (c === 0 ? "BTC" : pre + "C" + c) + "-EUR"; let p = 100; const d = [];
    for (let i = 0; i < dias; i++) { const o = p; p = Math.max(0.01, p * Math.exp(0.04 * gauss(r))); const hi = Math.max(o, p) * (1 + Math.abs(0.015 * gauss(r))), lo = Math.min(o, p) * (1 - Math.abs(0.015 * gauss(r))); d.push([t0 + i * 864e5, o, hi, lo, p, 1e6]); }
    out[m] = d; } return out; }
test("R6-12 · Tortugas · cada examen debería revisar candidatas NUEVAS, no la misma regla suspendida una y otra vez", () => {
  const series = mercado(11), otra = mercado(22, 16, 800, "X"); let actual = null, pob = [], susp = []; const r = rng(5), vistas = [];
  for (let k = 0; k < 8; k++) { const A = TT.aprende(series, TT.FEES.bitvavo, actual, { otra, feeOtra: TT.FEES.okx, pob, n: 80, rnd: r, susp }); vistas.push(JSON.stringify(A.nueva && A.nueva.P) + " → " + A.motivo); actual = A.P; pob = A.pob; susp = A.susp; }
  const distintas = new Set(vistas).size; console.log(vistas[0].slice(-80), "· distintas en 8 exámenes:", distintas);
  assert.ok(distintas > 1, `en 8 exámenes (640 reglas nuevas) la «mejor nueva» es siempre la MISMA regla, que suspende siempre por lo mismo`);
});
