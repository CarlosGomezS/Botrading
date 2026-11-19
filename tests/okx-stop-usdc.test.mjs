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

// ---------- v1.0 · auditoría (Gemini): OKX ----------
test("G-2.2 · un stop cuya respuesta se pierde se busca hasta 4 veces; si no aparece es un ERROR (no «no disponible»)", async () => {
  let gets = 0; const api = async (met, ruta) => { if (met === "POST" && ruta === "/api/v5/trade/order-algo") { const e = new Error("fetch failed"); throw e; } if (met === "GET" && ruta.startsWith("/api/v5/trade/order-algo?algoClOrdId")) { gets++; return []; } return []; };
  await assert.rejects(() => OK.adaptador(api, I, {}).ponStop("AAA-EUR", 1, 5), /sin confirmar/); assert.equal(gets, 4);
  let n = 0; const api2 = async (met, ruta) => { if (met === "POST" && ruta === "/api/v5/trade/order-algo") throw new Error("fetch failed"); if (met === "GET" && ruta.startsWith("/api/v5/trade/order-algo?algoClOrdId")) return ++n >= 3 ? [{ algoId: "A9" }] : []; return []; };
  assert.equal(await OK.adaptador(api2, I, {}).ponStop("AAA-EUR", 1, 5), "A9", "si aparece a la 3.ª, vale");
});

test("G-2.2 · quitaStopsBot quita solo los stops del bot (los suyos empiezan por «st») de esa cripto", async () => {
  const cancel = []; const api = async (met, ruta, body) => { if (ruta.startsWith("/api/v5/trade/orders-algo-pending")) { assert.match(ruta, /instId=AAA-EUR/); return [{ algoId: "1", algoClOrdId: "stabc" }, { algoId: "2", algoClOrdId: "mio" }, { algoId: "3" }]; } if (ruta === "/api/v5/trade/cancel-algos") cancel.push(body[0].algoId); return []; };
  assert.equal(await OK.adaptador(api, I, {}).quitaStopsBot("AAA-EUR"), 1); assert.deepEqual(cancel, ["1"]);
});

test("G-2.2 · el saldo de una cripto para VENDER es lo disponible (no lo retenido por una orden)", async () => {
  const api = async (met, ruta) => (ruta.startsWith("/api/v5/account/balance?ccy=AAA") ? [{ details: [{ ccy: "AAA", availBal: "0", cashBal: "10" }] }] : []);
  assert.equal(await OK.adaptador(api, I, {}).saldo("AAA"), 0);
});

test("G-2.1 · si el 2.º paso de una compra por USDC queda con resultado DESCONOCIDO, no se vende el USDC al momento: el error lleva su identificador y lo gastado", async () => {
  const env = []; let n = 0;
  const api = async (met, ruta, body) => { env.push({ met, ruta, body });
    if (met === "POST" && ruta === "/api/v5/trade/order") { n++; if (n === 2) throw new Error("fetch failed"); return [{}]; }
    if (met === "GET" && ruta.startsWith("/api/v5/trade/order?")) { if (/BBB-USDC/.test(ruta)) return [{ state: "live", accFillSz: "0" }]; return [{ state: "filled", accFillSz: "21", avgPx: "0.95", fee: "0", feeCcy: "USDC" }]; }
    return []; };
  const e = await OK.adaptador(api, I, { "USDC-EUR": { bid: 0.95 } }).comprar("BBB-EUR", 20).then(() => null, (x) => x);
  assert.ok(e, "falla"); assert.ok(e.clOrdId && e.instId === "BBB-USDC", "lleva su identificador para comprobarla luego"); assert.ok(e.costeEur > 19 && e.usdcDud > 20);
  assert.equal(env.filter((x) => x.met === "POST" && x.ruta === "/api/v5/trade/order" && x.body.instId === "USDC-EUR" && x.body.side === "sell").length, 0, "no vende USDC a ciegas");
});

test("G3-3 · el historial de OKX devuelve solo las criptos pedidas (antes, todas)", async () => {
  const ops = await OK.adaptador(api0().api, I, {}).operaciones(["BBB"]);
  assert.deepEqual([...new Set(ops.map((o) => o.sym))], ["BBB"]);
  assert.equal(new Set((await OK.adaptador(api0().api, I, {}).operaciones()).map((o) => o.sym)).size, 2, "sin lista, todas (como antes)");
});
