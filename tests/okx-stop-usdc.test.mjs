// v1.0 · O-002 · stop de emergencia en OKX también para las criptos que van por USDC
import test from "node:test";
import assert from "node:assert/strict";
import * as OK from "../runner/okx.mjs";

const I = { AAA: { EUR: { instId: "AAA-EUR", lot: 4, min: 0.1, tick: 0.001, tdec: 3 } }, BBB: { USDC: { instId: "BBB-USDC", lot: 2, min: 1, tick: 0.0001, tdec: 4 } }, USDC: { EUR: { instId: "USDC-EUR", lot: 2, min: 1 } } };
function api0(algo = {}) { const env = []; const api = async (met, ruta, body) => { env.push({ met, ruta, body });
  if (met === "POST" && ruta === "/api/v5/trade/order-algo") return [{ algoId: "A1" }];
  if (met === "GET" && ruta.startsWith("/api/v5/trade/order-algo")) return [algo];
  if (met === "GET" && ruta.startsWith("/api/v5/market/tickers")) return [{ instId: "USDC-EUR", bidPx: "0.9" }, { instId: "BBB-USDC", bidPx: "2" }];
  if (met === "GET" && ruta.startsWith("/api/v5/trade/fills-history")) return [{ instId: "BBB-USDC", side: "sell", fillSz: "10", fillPx: "2", fee: "-0.04", feeCcy: "USDC", ts: "1", billId: "b1" }, { instId: "AAA-EUR", side: "sell", fillSz: "1", fillPx: "5", fee: "-0.01", feeCcy: "EUR", ts: "2", billId: "b2" }];
  return []; }; return { api, env }; }

test("OKX · una cripto que va por USDC lleva su stop en el par en USDC, con el precio pasado de euros a USDC", async () => {
  const { api, env } = api0(), X = OK.adaptador(api, I, { "USDC-EUR": { bid: 0.9, ask: 0.902 } });
  assert.equal(await X.ponStop("BBB-EUR", 10, 1.8), "A1");
  const b = env.find((e) => e.ruta === "/api/v5/trade/order-algo").body;
  assert.equal(b.instId, "BBB-USDC"); assert.equal(b.side, "sell"); assert.equal(b.ordType, "conditional"); assert.equal(b.sz, "10.00"); assert.equal(b.slTriggerPx, "2.0000", "1,80 € ÷ 0,9 = 2 USDC");
  assert.equal(await OK.adaptador(api0().api, I, {}).ponStop("BBB-EUR", 10, 1.8), null, "sin el cambio USDC-EUR no se pone (no se inventa el precio)");
  assert.equal(await OK.adaptador(api0().api, I, { "USDC-EUR": { bid: 7 } }).ponStop("BBB-EUR", 10, 1.8), null, "un cambio absurdo tampoco");
  const { api: a2, env: e2 } = api0(); await OK.adaptador(a2, I, {}).ponStop("AAA-EUR", 1, 5); assert.equal(e2.find((e) => e.ruta === "/api/v5/trade/order-algo").body.instId, "AAA-EUR", "las de euros, igual que siempre");
});

test("OKX · al comprobar el stop de una cripto por USDC, su precio se da en euros (para compararlo con el que puso el bot)", async () => {
  const X = OK.adaptador(api0({ state: "live", sz: "10", side: "sell", slTriggerPx: "2" }).api, I, { "USDC-EUR": { bid: 0.9 } });
  const e = await X.estadoStop("BBB-EUR", "A1"); assert.equal(e.activo, true); assert.ok(Math.abs(e.px - 1.8) < 1e-9);
  const e2 = await OK.adaptador(api0({ state: "live", sz: "1", side: "sell", slTriggerPx: "4.5" }).api, I, { "USDC-EUR": { bid: 0.9 } }).estadoStop("AAA-EUR", "A1"); assert.equal(e2.px, 4.5);
});

test("OKX · el historial dice cuánto USDC entró en las ventas por USDC", async () => {
  const ops = await OK.adaptador(api0().api, I, {}).operaciones();
  const b = ops.find((o) => o.sym === "BBB"), a = ops.find((o) => o.sym === "AAA");
  assert.ok(Math.abs(b.usdc - 19.96) < 1e-9); assert.equal(a.usdc, undefined);
});
