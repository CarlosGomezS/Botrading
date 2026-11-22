// v1.0 · R7 · decisión del usuario: mientras ningún método pase la cuarentena, Hyperliquid sigue al n.º 1 del podio (provisional dinámico)
import test from "node:test";
import assert from "node:assert/strict";
import { eligeProvisional } from "../runner/caza-lab.mjs";
import { listaReal } from "../runner/hl-real.mjs";
const ap = (k, ok = false, idea = k) => ({ k, n: k, idea, g: { h: 24 }, cuar: { ok, dias: 3 } });

test("R7 · sin ninguno fuera de cuarentena, el provisional es el n.º 1 del podio y el bot real lo sigue", () => {
  const A = [ap("a"), ap("b"), ap("c")];
  assert.equal(eligeProvisional(A, null), "a");
  assert.deepEqual(listaReal(A).map((x) => x.k), ["a"], "Hyperliquid opera con el n.º 1");
});
test("R7 · se mantiene el provisional anterior mientras siga aprobado (no cambia cada ronda por el orden)", () => {
  const A = [ap("a"), ap("b")]; assert.equal(eligeProvisional(A, "b"), "b"); assert.deepEqual(listaReal(A).map((x) => x.k), ["b"]);
});
test("R7 · si el provisional deja de aprobar, pasa a serlo el n.º 1 actual (antes se quedaba sin método)", () => {
  const A = [ap("c"), ap("d")]; assert.equal(eligeProvisional(A, "xlxypc"), "c"); assert.deepEqual(listaReal(A).map((x) => x.k), ["c"]);
});
test("R7 · en cuanto uno pasa la cuarentena, se deja el provisional y se sigue a ese", () => {
  const A = [ap("a"), ap("b", true)]; assert.equal(eligeProvisional(A, "a"), null);
  assert.deepEqual(listaReal(A).map((x) => x.k), ["b"]); assert.ok(!A[0].cuar.exento && !A[0].cuar.provisional);
});
test("R7 · sin aprobados no hay provisional (no se opera)", () => {
  assert.equal(eligeProvisional([], "a"), null); assert.deepEqual(listaReal([]), []);
});
test("R7 · un exento antiguo sigue exento", () => {
  const A = [ap("a"), ap("q411nb")]; A[1].cuar.exento = true; eligeProvisional(A, null, ["q411nb"]); assert.equal(A[1].cuar.exento, true);
});
