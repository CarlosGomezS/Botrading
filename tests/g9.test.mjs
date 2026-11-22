// v1.0 · G9 · auditoría de Gemini (proyecto completo, segunda vuelta)
process.env.GITHUB_TOKEN = "tok-de-prueba"; process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_SHA = "a".repeat(40);
process.env.REAL_VIEW_PASS = "clave-de-prueba"; process.env.HL_AGENT_KEY = "1".repeat(64); process.env.HL_WALLET = "0x" + "b".repeat(40);
import test from "node:test";
import assert from "node:assert/strict";
const { HL, mundo, conecta, silencio } = await import("./hl-mundo.mjs");
const { esNuestra } = await import("../runner/real.mjs");

test("G9-1 · Hyperliquid: tras un cierre parcial, el stop se rehace del tamaño de lo que queda abierto", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: 0.2, edadH: 200 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }], quiere: [] });
  W.cierreParcial = 0.5; conecta(W); await silencio(() => HL.ronda());
  const st = W.stops.filter((s) => s.coin === "BTC");
  assert.ok(W.pos.BTC && Math.abs(W.pos.BTC.szi) > 0, "queda una parte abierta");
  assert.equal(st.length, 1, "un solo stop");
  assert.equal(+st[0].sz, +Math.abs(W.pos.BTC.szi).toFixed(6), "del tamaño justo (antes se quedaba en 0,2)");
});

test("G9-2 · Trading 212: una orden apuntada antes de enviarla se reconoce aunque Trading 212 la ejecutara con menos decimales (1,9 → 1)", () => {
  const t = Date.now(), o = (q) => ({ side: "BUY", quantity: q, createdAt: new Date(t + 1000).toISOString() });
  assert.equal(esNuestra(o(1), 1.9, t, 0.1), true, "1,9 truncado a entero = 1");
  assert.equal(esNuestra(o(1.9), 1.9, t, 0.1), true);
  assert.equal(esNuestra(o(1.23), 1.2345, t, 0.1), true, "1,2345 con 2 decimales");
  assert.equal(esNuestra(o(0.7), 1.9, t, 0.1), false, "una cantidad cualquiera NO");
  assert.equal(esNuestra(o(1.5), 1.9, t, 0.1), false, "ni otra que no sea un truncado");
  assert.equal(esNuestra(o(1), 1.9, t, 0), false, "sin apunte previo (tol 0) se sigue exigiendo la cantidad exacta");
});
