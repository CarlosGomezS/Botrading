// v1.0 · 🧬 podio de ideas distintas (una de cada idea; las variantes, en segundo plano)
import test from "node:test";
import assert from "node:assert/strict";
import { podioDiverso, ideaDe, resumenIdeas } from "../runner/caza-lab.mjs";

const m = (k, n, nota) => ({ k, n: n + " · sin filtro · cada operación dura 168 h · stop −5 %", nota });
const A = "Sesión (hora UTC), a favor {\"h\":0} + confirma Arbitraje contra BTC {\"z\":2}", A2 = "Sesión (hora UTC), a favor {\"h\":14} + confirma Arbitraje contra BTC {\"z\":1}";
const B = "Sesión (hora UTC), a favor {\"h\":14} + confirma Pico de volumen {\"m\":3}", C = "🤖 IA «London Overlap Volatility Squeeze»";

test("Hyperliquid · la idea de fondo no depende de los números", () => {
  assert.equal(ideaDe(m("1", A, 1)), ideaDe(m("2", A2, 1))); assert.notEqual(ideaDe(m("1", A, 1)), ideaDe(m("3", B, 1)));
});

test("Hyperliquid · en el podio, una de cada idea; el n.º 1 siempre es el mejor de todos", () => {
  const L = [m("a1", A, 0.40), m("a2", A2, 0.20), m("a3", A, 0.19), m("b", B, 0.18), m("c", C, 0.16)];
  const P = podioDiverso(L, 3);
  assert.deepEqual(P.map((x) => x.k), ["a1", "b", "c"], "las variantes de A se quedan detrás"); assert.equal(P[0].k, L[0].k);
  assert.ok(!P.some((x) => x.variante));
});

test("Hyperliquid · una variante solo entra si es MUY superior (≥ 50 % y ≥ 0,05 más) a la mejor idea distinta, y nunca más de 2 iguales", () => {
  const P = podioDiverso([m("a1", A, 0.40), m("a2", A2, 0.33), m("a3", A, 0.32), m("b", B, 0.15), m("c", C, 0.10)], 3);
  assert.deepEqual(P.map((x) => x.k), ["a1", "a2", "b"], "0,33 ≥ 0,15 + 50 % → entra como variante; la tercera de A no"); assert.equal(P[1].variante, 1);
  const P2 = podioDiverso([m("a1", A, 0.40), m("a2", A2, 0.20), m("b", B, 0.18), m("c", C, 0.16)], 3);
  assert.deepEqual(P2.map((x) => x.k), ["a1", "b", "c"], "0,20 no es muy superior a 0,18 ni a 0,16: entran las ideas distintas");
  const P3 = podioDiverso([m("a1", A, 0.40), m("a2", A2, 0.20), m("b", B, 0.18)], 3);
  assert.deepEqual(P3.map((x) => x.k), ["a1", "b"], "sin más ideas distintas, la variante no entra (no es «muy superior» a nada)");
});

test("Hyperliquid · si no hay ideas distintas, el podio se queda corto antes que llenarse de copias", () => {
  assert.deepEqual(podioDiverso([m("a1", A, 0.4), m("a2", A2, 0.3), m("a3", A, 0.29)], 3).map((x) => x.k), ["a1"]);
  assert.deepEqual(podioDiverso([], 3), []);
  assert.deepEqual(resumenIdeas([m("a1", A, 0.4), m("a2", A2, 0.3), m("b", B, 0.1)]).distintas, 2);
});
