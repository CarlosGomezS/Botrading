// v1.0 · auditoría (Gemini) · Trading 212
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { precioEnDivisa, esNuestra } from "../runner/real.mjs";
const SRC = readFileSync(new URL("../runner/real.mjs", import.meta.url), "utf8"), WF = (f) => readFileSync(new URL("../.github/workflows/" + f, import.meta.url), "utf8");

test("G-3.1 · libras y peniques: «GBP» ya no se toma por peniques (antes: orden 100 veces mayor)", () => {
  assert.equal(precioEnDivisa(50, "GBP", "GBX"), 5000, "50 £ = 5.000 peniques"); assert.equal(precioEnDivisa(5000, "GBp", "GBX"), 5000);
  assert.equal(precioEnDivisa(5000, "GBp", "GBP"), 50); assert.equal(precioEnDivisa(50, "GBP", "GBP"), 50);
  assert.equal(precioEnDivisa(50, undefined, "GBX"), null, "en Londres, sin saber la divisa no se compra"); assert.equal(precioEnDivisa(50, "USD", "GBX"), null);
  assert.equal(precioEnDivisa(10, undefined, "EUR"), 10, "lo demás, como siempre"); assert.equal(precioEnDivisa(10, "USD", "EUR"), null); assert.equal(precioEnDivisa(0, "EUR", "EUR"), null);
  assert.ok(!/\/GBp\/i/.test(SRC), "ya no queda la comprobación con /i");
});

test("G-3.3 · una venta del historial que viene en positivo con «side: SELL» se reconoce como venta", () => {
  const t0 = Date.now() - 1000, c = new Date().toISOString();
  assert.equal(esNuestra({ quantity: 5, side: "SELL", createdAt: c }, -5, t0), true); assert.equal(esNuestra({ quantity: 5, side: "BUY", createdAt: c }, -5, t0), false);
  assert.equal(esNuestra({ quantity: -5, createdAt: c }, -5, t0), true, "sin «side», como siempre");
});

test("G-3.3 · primero se aclaran las órdenes pendientes y después se calcula el capital", () => {
  const i = SRC.indexOf("if (habiaLibro) await aclaraPend();"), j = SRC.indexOf("ensureLedger(R, A, positions, m, notasL);", i);
  assert.ok(i > 0 && j > i, "aclaraPend va antes que ensureLedger cuando ya hay libro");
});

test("G-3.2 · el cuadre del efectivo ya no se apropia de participaciones (podían ser tuyas)", () => {
  assert.ok(!/se le apuntan por/.test(SRC) && !/lt\.q = \+\(lt\.q \+ qAd\)/.test(SRC));
  assert.match(SRC, /L\.retPend = r2\(\(\+L\.retPend \|\| 0\) \+ resto\)/, "lo que sobra se trata como dinero que has movido tú");
});

test("G-3.3 · los dos flujos que escriben la cartera real comparten candado (nunca a la vez)", () => {
  assert.match(WF("real.yml"), /^concurrency:\s*\n\s*group: cartera-real\s*\n\s*cancel-in-progress: false/m);
  assert.match(WF("real-pulso.yml"), /concurrency:\s*\n\s*group: cartera-real\s*\n\s*cancel-in-progress: false/m);
});
