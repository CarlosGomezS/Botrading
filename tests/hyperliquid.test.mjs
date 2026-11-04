import test from "node:test";
import assert from "node:assert/strict";
import { elegir, senal, anotar, enMomento, moneda, actualizar } from "../runner/hyperliquid.mjs";
test("Hyperliquid: elige a los mejores (sin creadores de mercado), saca la señal por cripto y la guarda para aprender", async () => {
  const fila = (a, av, mes, total, vlm) => ({ ethAddress: a, accountValue: String(av), windowPerformances: [["month", { pnl: String(mes), vlm: String(vlm) }], ["allTime", { pnl: String(total) }]] });
  const top = elegir([fila("a", 2e6, 5e5, 1e6, 1e7), fila("b", 2e6, 9e5, 1e6, 1e10), fila("c", 1e5, 9e5, 1e6, 1e6), fila("d", 3e6, -1, 1e6, 1e6), fila("e", 1e6, 2e5, -5, 1e6)]);
  assert.deepEqual(top.map((x) => x.a), ["a"], "solo el bueno: b es creador de mercado, c es pequeña, d pierde este mes, e pierde en total");
  const s = senal([[{ coin: "BTC", szi: "2", positionValue: "300" }, { coin: "kPEPE", szi: "-5", positionValue: "100" }], [{ coin: "BTC", szi: "-1", positionValue: "100" }]]);
  assert.equal(s.BTC.s, 0.5); assert.equal(s.BTC.nl, 1); assert.equal(s.PEPE.s, -1); assert.equal(moneda("kBONK"), "BONK");
  const h = anotar(anotar({}, s, 1000), { BTC: { s: 0.8 } }, 601000); assert.equal(enMomento(h.BTC, 700000), 0.8); assert.equal(enMomento(h.BTC, 500000), 0.5); assert.equal(enMomento(h.BTC, 10), null);
  const fx = async (u, o) => ({ json: async () => (u.includes("leaderboard") ? { leaderboardRows: Array.from({ length: 12 }, (_, i) => fila("x" + i, 1e6, 1e5 + i, 1e5, 1e6)) } : { assetPositions: [{ position: { coin: "ETH", szi: "1", positionValue: "50" } }] }) });
  const HL = await actualizar({}, 1e9, fx); assert.equal(HL.top.length, 12); assert.equal(HL.snap.ETH.s, 1);
});

test("Hyperliquid: el cambio de los mejores se mide en 1 h (como en las pruebas), no entre dos lecturas seguidas", async () => {
  const { actualizar, hace } = await import("../runner/hyperliquid.mjs");
  let lado = 1; const fila = (a) => ({ ethAddress: a, accountValue: "1000000", windowPerformances: [["month", { pnl: "100000", vlm: "1000000" }], ["allTime", { pnl: "100000" }]] });
  const fx = async (u) => ({ json: async () => (u.includes("leaderboard") ? { leaderboardRows: Array.from({ length: 12 }, (_, i) => fila("x" + i)) } : { assetPositions: [{ position: { coin: "ETH", szi: String(lado), positionValue: "50" } }] }) });
  let HL = {}; for (let m = 0; m <= 66; m += 3) { lado = m < 30 ? -1 : 1; HL = await actualizar(HL, m * 60000, fx); }
  assert.equal(HL.snap.ETH.s, 1); assert.equal(HL.prev.ETH.s, -1, "hace 1 h estaban cortos"); assert.equal(hace(HL, 66 * 60000, 3600e3).ETH.s, -1);
  assert.equal(hace({ ring: [] }, 1e9, 3600e3), null); assert.ok(HL.ring.length <= 35);
});
