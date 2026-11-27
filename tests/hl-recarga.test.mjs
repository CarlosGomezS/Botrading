// v1.0 · 💧 RECARGA de Hyperliquid (27/11/2026): el dinero libre se mete en las posiciones del bot que han quedado pequeñas
import test from "node:test";
test.afterEach(() => { process.exitCode = 0; });
import assert from "node:assert/strict";
process.env.GITHUB_TOKEN = "tok-de-prueba"; process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_SHA = "a".repeat(40);
process.env.REAL_VIEW_PASS = "clave-de-prueba"; process.env.HL_AGENT_KEY = "1".repeat(64); process.env.HL_WALLET = "0x" + "b".repeat(40);
const { HL, mundo, conecta, silencio } = await import("./hl-mundo.mjs");
const priv = []; HL.deps.privado = (t) => priv.push(t);
const compras = (W, c) => W.ordenes.filter((o) => o.c === c && !o.stop && !o.reduce);

test("con dinero libre, una posición pequeña del bot se recarga hasta su parte y su stop cubre el tamaño nuevo", async () => {
  const W = mundo({ eq: 200, neto: 200, pos: [{ c: "BTC", szi: 0.2, edadH: 2 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }] }); conecta(W);
  await silencio(() => HL.ronda());
  const add = compras(W, "BTC"); assert.equal(add.length, 1, "una orden de recarga"); assert.ok(add[0].compra, "mismo sentido (largo)");
  assert.ok(W.pos.BTC.szi > 0.35 && W.pos.BTC.szi < 0.41, "queda cerca de su parte: " + W.pos.BTC.szi);
  const st = W.stops.filter((s) => s.coin === "BTC"); assert.equal(st.length, 1); assert.ok(Math.abs(+st[0].sz - W.pos.BTC.szi) < 1e-6, "el stop cubre toda la posición");
  assert.ok(priv.some((t) => /BTC: es pequeña/.test(t)));
});
test("no recarga si va perdiendo más de la mitad del camino a su stop", async () => {
  const W = mundo({ eq: 200, neto: 200, px: { BTC: 95 }, pos: [{ c: "BTC", szi: 0.2, px: 100, edadH: 2 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }] }); conecta(W);
  await silencio(() => HL.ronda());
  assert.equal(compras(W, "BTC").length, 0);
});
test("no recarga si le queda poco tiempo", async () => {
  const W = mundo({ eq: 200, neto: 200, pos: [{ c: "BTC", szi: 0.2, edadH: 150 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }] }); conecta(W);
  await silencio(() => HL.ronda());
  assert.equal(compras(W, "BTC").length, 0);
});
test("con la recarga apagada en ajustes, no recarga; y si la posición ya tiene su parte, tampoco", async () => {
  const W = mundo({ eq: 200, neto: 200, ctl: { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1, recarga: false }, pos: [{ c: "BTC", szi: 0.2, edadH: 2 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }] }); conecta(W);
  await silencio(() => HL.ronda()); assert.equal(compras(W, "BTC").length, 0);
  const W2 = mundo({ eq: 200, neto: 200, pos: [{ c: "BTC", szi: 0.4, edadH: 2 }], stops: [{ c: "BTC", side: "A", sz: 0.4, trig: 92 }] }); conecta(W2);
  await silencio(() => HL.ronda()); assert.equal(compras(W2, "BTC").length, 0);
});
test("si no puede guardar el estado antes, no recarga", async () => {
  const W = mundo({ eq: 200, neto: 200, guardarFalla: true, pos: [{ c: "BTC", szi: 0.2, edadH: 2 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }] }); conecta(W);
  await silencio(() => HL.ronda()); assert.equal(compras(W, "BTC").length, 0);
});
test("ajuste recarga: sí por defecto; solo sí/no", () => {
  assert.equal(HL.validaCtl({}).recarga, true); assert.equal(HL.validaCtl({ recarga: false }).recarga, false); assert.equal(HL.validaCtl({ recarga: "no" }).recarga, true);
});
