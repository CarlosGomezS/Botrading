process.env.SOLO_TORT = "0";   // v313 · estas pruebas son del copiado de métodos (el real ahora solo sigue a las Tortugas; ver tortugas-solo.test.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as OK from "../runner/okx.mjs";
import * as RL from "../runner/bitvavo-real.mjs";

// OKX falso: comprueba dominio europeo, firma y frase de paso; ejecuta órdenes de mercado (comisión 0,2 %: en la cripto al comprar, en la moneda de cotización al vender)
function okx(px) {
  const ex = { px, orders: [], eur: 500, ords: {}, n: 0 };
  ex.I = { AAA: { EUR: { instId: "AAA-EUR", lot: 4, min: 0.1 } }, BBB: { USDC: { instId: "BBB-USDC", lot: 2, min: 1 } }, USDC: { EUR: { instId: "USDC-EUR", lot: 2, min: 1 } } };
  ex.fx = async (url, o) => {
    const u = new URL(url), ruta = u.pathname + u.search, R = (j) => ({ ok: true, status: 200, json: async () => j });
    assert.equal(u.host, "eea.okx.com", "dominio europeo");
    const ok = createHmac("sha256", "SEC").update(o.headers["OK-ACCESS-TIMESTAMP"] + o.method + ruta + (o.body || "")).digest("base64") === o.headers["OK-ACCESS-SIGN"];
    if (!ok || o.headers["OK-ACCESS-PASSPHRASE"] !== "FRASE") return R({ code: "50113", msg: "Invalid Sign", data: [] });
    ex.bal = ex.bal || {};
    if (u.pathname === "/api/v5/account/balance") return R({ code: "0", data: [{ details: [{ ccy: "EUR", availBal: String(ex.eur) }, ...Object.entries(ex.bal).filter(([, q]) => q > 1e-12).map(([c, q]) => ({ ccy: c, availBal: String(q), cashBal: String(q) }))] }] });
    if (u.pathname === "/api/v5/trade/order" && o.method === "POST") {
      const b = JSON.parse(o.body); ex.orders.push(b); const [base, quote] = b.instId.split("-"), p = ex.px[b.instId], id = "o" + ++ex.n; let fill, fee, feeCcy;
      assert.equal(b.tdMode, "cash"); assert.equal(b.ordType, "market");
      if (b.side === "buy") { assert.equal(b.tgtCcy, "quote_ccy"); fill = +b.sz / p; fee = fill * 0.002; feeCcy = base; } else { assert.equal(b.tgtCcy, "base_ccy"); fill = +b.sz; fee = fill * p * 0.002; feeCcy = quote; }
      ex.bal = ex.bal || {}; if (b.side === "buy") { ex.bal[base] = (ex.bal[base] || 0) + fill - (feeCcy === base ? fee : 0); if (quote !== "EUR") ex.bal[quote] = (ex.bal[quote] || 0) - +b.sz; } else { ex.bal[base] = (ex.bal[base] || 0) - fill; if (quote !== "EUR") ex.bal[quote] = (ex.bal[quote] || 0) + fill * p - fee; }
      ex.ords[id] = { ordId: id, state: "filled", accFillSz: String(fill), avgPx: String(p), fee: String(-fee), feeCcy }; assert.ok(b.clOrdId, "v291: cada orden lleva su identificador"); ex.ords[b.clOrdId] = ex.ords[id]; return R({ code: "0", data: [{ ordId: id, sCode: "0" }] });
    }
    if (u.pathname === "/api/v5/trade/order" && o.method === "GET") return R({ code: "0", data: [ex.ords[u.searchParams.get("ordId") || u.searchParams.get("clOrdId")]] });
    return R({ code: "50000", msg: "?", data: [] });
  };
  ex.api = OK.cliente("KEY", "SEC", "FRASE", ex.fx);
  return ex;
}
const tk = (m, p) => ({ [m]: { bid: p * 0.999, ask: p * 1.001 } });

test("OKX: firma con frase de paso en eea.okx.com, compra en euros y vende con las comisiones reales", async () => {
  const ex = okx({ "AAA-EUR": 2 }), X = OK.adaptador(ex.api, ex.I, tk("AAA-EUR", 2));
  assert.ok(X.tiene("AAA-EUR")); assert.ok(X.tiene("BBB-EUR"), "por USDC"); assert.ok(!X.tiene("ZZZ-EUR"));
  const c = await X.comprar("AAA-EUR", 20); assert.equal(ex.orders[0].sz, "20.00"); assert.ok(Math.abs(c.q - 9.98) < 1e-9, "comisión en la cripto"); assert.ok(Math.abs(c.coste - 20) < 1e-9);
  const v = await X.vender("AAA-EUR", c.q); assert.equal(ex.orders[1].sz, "9.9800"); assert.ok(Math.abs(v.got - 9.98 * 2 * 0.998) < 1e-9);
  assert.equal(await X.saldoEur(), 500);
});

test("OKX: una cripto sin par en euros pasa por USDC a la ida y a la vuelta", async () => {
  const ex = okx({ "USDC-EUR": 0.9, "BBB-USDC": 4 }), X = OK.adaptador(ex.api, ex.I, tk("BBB-EUR", 3.6));
  const c = await X.comprar("BBB-EUR", 18); assert.deepEqual(ex.orders.map((o) => o.instId), ["USDC-EUR", "BBB-USDC"]);
  assert.ok(c.q > 4.9 && c.q < 5, "≈ 18 € / 0,9 = 20 USDC → 5 BBB, menos comisiones: " + c.q);
  const v = await X.vender("BBB-EUR", c.q); assert.deepEqual(ex.orders.slice(2).map((o) => [o.instId, o.side]), [["BBB-USDC", "sell"], ["USDC-EUR", "sell"]]);
  assert.ok(v.got > 17.7 && v.got < 18, "vuelve casi todo (4 comisiones del 0,2 %): " + v.got);
});

test("OKX: clave o frase de paso mal → error de clave (no se reintenta)", async () => {
  const ex = okx({ "AAA-EUR": 2 }), mala = OK.cliente("KEY", "SEC", "OTRA", ex.fx);
  await assert.rejects(OK.adaptador(mala, ex.I, {}).saldoEur(), (e) => OK.errClave(e));
});

test("Real con OKX: copia al método, salta las criptos que no están en OKX y opera las que sí", async () => {
  const ex = okx({ "AAA-EUR": 2 }), tick = { ...tk("AAA-EUR", 2), ...tk("ZZZ-EUR", 1) }, X = OK.adaptador(ex.api, ex.I, tick), T = (m) => new Date(Date.UTC(2026, 10, 4, 12, m));
  let o = await RL.vuelta(null, { mix: { pos: {}, lastEq: 100 } }, { copia: "mix" }, tick, T(0), { ex: X });
  assert.ok(o.msgs[0].includes("OKX REAL empieza")); assert.equal(o.RS.fee, 0.002);
  const pos = { "AAA-EUR": { sym: "AAA", px: 2.002, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(1).toISOString() }, "ZZZ-EUR": { sym: "ZZZ", px: 1, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(1).toISOString() } };
  o = await RL.vuelta(o.RS, { mix: { pos, lastEq: 100 } }, { copia: "mix" }, tick, T(1), { ex: X });
  assert.deepEqual(Object.keys(o.RS.pos), ["AAA-EUR"]); assert.equal(o.RS.saltadas, 1); assert.ok(o.RS.log.some((l) => l.txt.includes("no está en OKX")));
  ex.px = ex.px || {}; const sube = { ...tick, ...tk("AAA-EUR", 2.2) }; if (ex.setPx) ex.setPx("AAA-EUR", 2.2); else if (ex.px) ex.px["AAA-EUR"] = 2.2;   // v304 · el método vende y la venta cubre comisiones
  o = await RL.vuelta(o.RS, { mix: { pos: {}, lastEq: 100 } }, { copia: "mix" }, sube, T(2), { ex: X });
  assert.equal(Object.keys(o.RS.pos).length, 0); assert.equal(o.RS.closed.length, 1);
});

test("OKX v287: precios y velas DE OKX en euros (también criptos que no están en Bitvavo; USDC se pasa a euros)", async () => {
  const OK = await import("../runner/okx.mjs");
  const I = { ABC: { EUR: { instId: "ABC-EUR", lot: 4, min: 1 } }, XYZ: { USDC: { instId: "XYZ-USDC", lot: 4, min: 1 } }, USDC: { EUR: { instId: "USDC-EUR", lot: 2, min: 1 } } };
  const now = Date.now() - (Date.now() % 300e3), vel = (n, t1) => Array.from({ length: n }, (_, i) => [String(t1 - i * 300e3), "2", "2.1", "1.9", "2", "100", "0", "0", "1"]);
  const fx = async (u) => ({ json: async () => {
    if (u.includes("/market/tickers")) return { code: "0", data: [{ instId: "ABC-EUR", bidPx: "1", askPx: "1.002", last: "1", volCcy24h: "1000000", open24h: "1" }, { instId: "XYZ-USDC", bidPx: "2", askPx: "2.002", last: "2", volCcy24h: "500000", open24h: "1.9" }, { instId: "USDC-EUR", bidPx: "0.9", askPx: "0.9", last: "0.9" }] };
    if (u.includes("history-candles")) { const a = +u.match(/after=(\d+)/)[1]; return { code: "0", data: vel(100, a - 300e3) }; }
    if (u.includes("/market/candles")) return { code: "0", data: vel(+u.match(/limit=(\d+)/)[1], now) };
    return { code: "0", data: [] }; } });
  const { tick } = await OK.preciosOkx(I, fx);
  assert.ok(tick["ABC-EUR"] && tick["XYZ-EUR"]); assert.ok(Math.abs(tick["XYZ-EUR"].bid - 1.8) < 1e-9, "USDC × 0,9"); assert.equal(tick["XYZ-EUR"].par, "XYZ-USDC");
  const cache = {}; const c = await OK.velasOkx("XYZ-USDC", 0.9, cache, fx);
  assert.equal(c.length, 600); assert.ok(c[0][0] < c[599][0], "de antigua a reciente"); assert.ok(Math.abs(c[0][4] - 1.8) < 1e-9);
  const c2 = await OK.velasOkx("XYZ-USDC", 0.9, cache, fx); assert.equal(c2.length, 600, "la segunda vez solo añade lo nuevo (sin duplicar)");
});

test("OKX v288: el historial propio de OKX se guarda, se completa hacia atrás y sale en euros para el laboratorio", async () => {
  const OK = await import("../runner/okx.mjs"), fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "okxh-")), "hist.json"), I = { ABC: { EUR: { instId: "ABC-EUR" } }, XYZ: { USDC: { instId: "XYZ-USDC" } }, USDC: { EUR: { instId: "USDC-EUR" } } };
  const now = Date.now() - (Date.now() % 300e3), lim = now - 5 * 86400e3, vel = (n, t1) => Array.from({ length: n }, (_, i) => t1 - i * 300e3).filter((t) => t >= lim).map((t) => [String(t), "2", "2.1", "1.9", "2", "100", "0", "0", "1"]);
  const fx = async (u) => ({ json: async () => {
    if (u.includes("/market/tickers")) return { code: "0", data: [{ instId: "ABC-EUR", bidPx: "1", askPx: "1.002", last: "1", volCcy24h: "1e6", open24h: "1" }, { instId: "XYZ-USDC", bidPx: "2", askPx: "2.002", last: "2", volCcy24h: "5e5", open24h: "2" }, { instId: "USDC-EUR", bidPx: "0.9", askPx: "0.9", last: "0.9" }] };
    if (u.includes("history-candles")) return { code: "0", data: vel(100, +u.match(/after=(\d+)/)[1] - 300e3) };
    if (u.includes("/market/candles")) return { code: "0", data: vel(300, now) };
    return { code: "0", data: [] }; } });
  const st = await OK.mantenerHistoria(file, I, { dias: 90, hasta: Date.now() + 3000, ritmo: 0, fx, margen: 0 });
  assert.ok(st.m["XYZ-EUR"].c.length > 5 * 288 - 5, "completa hacia atrás todo lo que hay: " + st.m["XYZ-EUR"].c.length); assert.ok(fs.existsSync(file));
  const { tick, ue } = await OK.preciosOkx(I, fx), raw = OK.rawDeHistoria(JSON.parse(fs.readFileSync(file, "utf8")), { tick, ue });
  assert.ok(raw.m["XYZ-EUR"] && Math.abs(raw.m["XYZ-EUR"][0][4] - 1.8) < 1e-9, "USDC → euros"); assert.ok(raw.paginas > 1.3 && raw.paginas < 1.5);
});

test("OKX v298: orden que se queda a medias → se cancela lo que falta y se apunta EXACTAMENTE lo ejecutado", async () => {
  const OK = await import("../runner/okx.mjs"); let estado = "partially_filled"; const llamadas = [];
  const api = async (met, ruta, cuerpo) => { llamadas.push(met + " " + ruta.split("?")[0]);
    if (ruta.startsWith("/api/v5/trade/order") && met === "POST") return [{ ordId: "1", sCode: "0" }];
    if (ruta.startsWith("/api/v5/trade/cancel-order")) { estado = "canceled"; return [{}]; }
    if (ruta.startsWith("/api/v5/trade/order") && met === "GET") return [{ state: estado, accFillSz: "2", avgPx: "1", fee: "-0.004", feeCcy: "EUR" }];
    return []; };
  const I = { ABC: { EUR: { instId: "ABC-EUR", lot: 4, min: 0.1 } } }, X = OK.adaptador(api, I, { "ABC-EUR": { bid: 1, ask: 1 } });
  const r = await X.comprar("ABC-EUR", 5); assert.equal(r.q, 2, "solo lo ejecutado"); assert.ok(llamadas.includes("POST /api/v5/trade/cancel-order"), "cancela lo que falta");
});

test("OKX v460: si la respuesta de la orden se pierde por TIEMPO DE ESPERA (la orden sí entra), pregunta por su clOrdId y la apunta: nunca la da por rechazada ni manda otra", async () => {
  const ex = okx({ "AAA-EUR": 2 }), fx0 = ex.fx; let cortes = 1;
  ex.fx = async (url, o) => { const r = await fx0(url, o); if (o.method === "POST" && new URL(url).pathname === "/api/v5/trade/order" && cortes > 0) { cortes--; const e = new DOMException("The operation was aborted due to timeout", "TimeoutError"); throw e; } return r; };
  ex.api = OK.cliente("KEY", "SEC", "FRASE", ex.fx);
  const X = OK.adaptador(ex.api, ex.I, tk("AAA-EUR", 2)), c = await X.comprar("AAA-EUR", 20);
  assert.equal(ex.orders.length, 1, "una sola orden"); assert.ok(Math.abs(c.q - 9.98) < 1e-9, "apunta lo que de verdad se compró");
});
