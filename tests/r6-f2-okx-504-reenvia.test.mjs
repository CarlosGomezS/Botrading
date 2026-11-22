// FALLO 2 · OKX: un HTTP 5xx SIN cuerpo JSON (502/504 de la pasarela) se toma por «rechazo explícito de OKX» (e.code = e.status = 504),
// así que sinDuplicar()/comprar() dan la orden por NO hecha y mandan otra. Si la primera sí se ejecutó, se vende dos veces (USDC tuyo).
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as OK from "../runner/okx.mjs";

function okx(px, { fallaPost = () => false, usdcTuyo = 0 } = {}) {
  const ex = { px, ejecutadas: [], ords: {}, bal: { USDC: usdcTuyo } };
  ex.I = { BBB: { USDC: { instId: "BBB-USDC", lot: 2, min: 1 } }, USDC: { EUR: { instId: "USDC-EUR", lot: 2, min: 1 } } };
  ex.fx = async (url, o) => {
    const u = new URL(url), ruta = u.pathname + u.search, R = (j) => ({ ok: true, status: 200, json: async () => j });
    assert.equal(createHmac("sha256", "SEC").update(o.headers["OK-ACCESS-TIMESTAMP"] + o.method + ruta + (o.body || "")).digest("base64"), o.headers["OK-ACCESS-SIGN"]);
    if (u.pathname === "/api/v5/trade/order" && o.method === "POST") {
      const b = JSON.parse(o.body), [base, quote] = b.instId.split("-"), p = ex.px[b.instId];
      let fill, fee; if (b.side === "buy") { fill = +b.sz / p; fee = fill * 0.002; } else { fill = +b.sz; fee = fill * p * 0.002; }
      if (b.side === "sell" && (ex.bal[base] || 0) + 1e-9 < fill) return R({ code: "1", data: [{ sCode: "51008", sMsg: "Insufficient balance" }] });
      if (b.side === "buy") { ex.bal[base] = (ex.bal[base] || 0) + fill - fee; if (quote !== "EUR") ex.bal[quote] -= +b.sz; } else { ex.bal[base] -= fill; if (quote !== "EUR") ex.bal[quote] = (ex.bal[quote] || 0) + fill * p - fee; }
      ex.ejecutadas.push({ instId: b.instId, side: b.side, sz: b.sz });
      ex.ords[b.clOrdId] = { state: "filled", accFillSz: String(fill), avgPx: String(p), fee: String(-fee), feeCcy: b.side === "buy" ? base : quote };
      if (fallaPost(b)) return { ok: false, status: 504, json: async () => { throw new SyntaxError("Unexpected token <"); } };   // ejecutada, pero llega un 504 HTML
      return R({ code: "0", data: [{ ordId: "x", sCode: "0" }] });
    }
    if (u.pathname === "/api/v5/trade/order" && o.method === "GET") { const d = ex.ords[u.searchParams.get("clOrdId")]; return d ? R({ code: "0", data: [d] }) : R({ code: "51603", msg: "Order does not exist", data: [] }); }
    return R({ code: "0", data: [] });
  };
  ex.api = OK.cliente("KEY", "SEC", "FRASE", ex.fx);
  return ex;
}

test("R6 · OKX · venta por USDC: un 504 en la venta del USDC (que sí se hizo) NO debe provocar una segunda venta de USDC", async () => {
  let primera = true;
  const ex = okx({ "BBB-USDC": 4, "USDC-EUR": 0.9 }, { usdcTuyo: 50, fallaPost: (b) => b.instId === "USDC-EUR" && b.side === "sell" && primera && !(primera = false) });
  ex.bal.BBB = 5;
  const X = OK.adaptador(ex.api, ex.I, { "USDC-EUR": { bid: 0.9 } });
  const r = await X.vender("BBB-EUR", 5).catch((e) => ({ err: e.message }));
  const vUsdc = ex.ejecutadas.filter((o) => o.instId === "USDC-EUR" && o.side === "sell");
  console.log("ventas de USDC ejecutadas:", JSON.stringify(vUsdc), "· USDC que te queda:", ex.bal.USDC.toFixed(2), "(tenías 50 tuyos) · resultado:", JSON.stringify(r));
  assert.equal(vUsdc.length, 1, "la venta de USDC se ha ejecutado DOS veces (la segunda, con tu USDC)");
});

test("R6 · OKX · compra por USDC: un 504 en la compra de la cripto (que sí se hizo) NO debe deshacer el USDC", async () => {
  let primera = true;
  const ex = okx({ "BBB-USDC": 4, "USDC-EUR": 0.9 }, { usdcTuyo: 50, fallaPost: (b) => b.instId === "BBB-USDC" && b.side === "buy" && primera && !(primera = false) });
  const X = OK.adaptador(ex.api, ex.I, { "USDC-EUR": { bid: 0.9 } });
  const r = await X.comprar("BBB-EUR", 18).catch((e) => ({ err: e.message }));
  const vUsdc = ex.ejecutadas.filter((o) => o.instId === "USDC-EUR" && o.side === "sell");
  console.log("órdenes:", JSON.stringify(ex.ejecutadas), "· BBB:", (ex.bal.BBB || 0).toFixed(3), "· USDC:", ex.bal.USDC.toFixed(2), "· resultado:", JSON.stringify(r));
  assert.equal(vUsdc.length, 0, "la cripto SÍ se compró y, aun así, ha vendido USDC (tuyo) para «deshacer» la compra");
});
