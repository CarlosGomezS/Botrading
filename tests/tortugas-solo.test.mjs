import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as RL from "../runner/bitvavo-real.mjs";

// Bitvavo falso: comprueba la firma de cada petición y ejecuta órdenes de mercado al precio que le digamos (comisión 0,25 % en EUR)
function exchange(px, opts = {}) {
  const ex = { px, orders: [], eur: opts.eur ?? 1000, bal: {}, fallo: null };
  ex.fx = async (url, o) => {
    const u = new URL(url), ruta = u.pathname + u.search, ts = o.headers["Bitvavo-Access-Timestamp"];
    const ok = createHmac("sha256", "SECRETO").update(ts + o.method + ruta + (o.body || "")).digest("hex") === o.headers["Bitvavo-Access-Signature"];
    const R = (st, j) => ({ ok: st < 400, status: st, json: async () => j });
    if (!ok || o.headers["Bitvavo-Access-Key"] !== "CLAVE") return R(403, { errorCode: 105, error: "firma" });
    if (ex.fallo) return R(ex.fallo.status, ex.fallo.j);
    if (u.pathname === "/v2/markets") return R(200, { market: u.searchParams.get("market"), minOrderInQuoteAsset: "5" });
    if (u.pathname === "/v2/balance") { const all = [{ symbol: "EUR", available: String(ex.eur), inOrder: "0" }, ...Object.entries(ex.bal).filter(([, q]) => q > 1e-12).map(([m, q]) => ({ symbol: m.replace("-EUR", ""), available: String(q), inOrder: "0" }))]; const sy = u.searchParams.get("symbol"); return R(200, sy ? all.filter((x) => x.symbol === sy) : all); }
    if (u.pathname === "/v2/assets") return R(200, { symbol: u.searchParams.get("symbol"), decimals: 4 });
    if (u.pathname === "/v2/order" && o.method === "POST") {
      const b = JSON.parse(o.body); assert.equal(typeof b.operatorId, "number"); if (b.orderType === "stopLoss") { ex.stops = ex.stops || {}; const id = "S" + Object.keys(ex.stops).length; ex.stops[id] = b; return R(200, { orderId: id }); }
      assert.equal(b.orderType, "market"); assert.ok(b.clientOrderId, "cada orden lleva su identificador"); if (ex.timeout) { ex.timeout--; ex.orders.push(b); ex.porId = ex.porId || {}; const p0 = ex.px[b.market], quote0 = +b.amountQuote / 1.0025, q0 = quote0 / p0; ex.bal[b.market] = (ex.bal[b.market] || 0) + q0; ex.porId[b.clientOrderId] = { filledAmount: String(q0), filledAmountQuote: String(quote0), feePaid: String(quote0 * 0.0025), feeCurrency: "EUR", status: "filled" }; return R(504, { errorCode: 999, error: "tiempo agotado" }); }
      ex.orders.push(b); const p = ex.px[b.market];
      if (b.side === "buy") { const quote = +b.amountQuote / 1.0025, q = quote / p; ex.bal[b.market] = (ex.bal[b.market] || 0) + q; return R(200, { filledAmount: String(q), filledAmountQuote: String(quote), feePaid: String(quote * 0.0025), feeCurrency: "EUR" }); }
      const q = +b.amount; assert.ok(String(b.amount).split(".")[1] === undefined || String(b.amount).split(".")[1].length <= 4, "respeta los decimales"); ex.bal[b.market] -= q; const quote = q * p; return R(200, { filledAmount: String(q), filledAmountQuote: String(quote), feePaid: String(quote * 0.0025), feeCurrency: "EUR" });
    }
    if (u.pathname === "/v2/trades") return R(200, (ex.trades || []).filter((x) => x.market === u.searchParams.get("market")));
    if (u.pathname === "/v2/order" && o.method === "DELETE") { const id = u.searchParams.get("orderId"); if (ex.stops) delete ex.stops[id]; return R(200, { orderId: id }); }
    if (u.pathname === "/v2/order" && o.method === "GET") { const x = ex.porId && ex.porId[u.searchParams.get("clientOrderId")]; return x ? R(200, x) : R(404, { errorCode: 240, error: "no existe" }); }
    return R(404, { errorCode: 999 });
  };
  ex.api = RL.cliente("CLAVE", "SECRETO", ex.fx);
  ex.mercado = async (m) => { const [mk] = [await ex.api("GET", "/markets?market=" + m)], as = await ex.api("GET", "/assets?symbol=" + m.split("-")[0]); return { min: +mk.minOrderInQuoteAsset, dec: +as.decimals }; };
  return ex;
}
const tk = (px) => Object.fromEntries(Object.entries(px).map(([m, p]) => [m, { bid: p * 0.999, ask: p * 1.001 }]));
const fuente = (pos = {}, eq = 100) => ({ pos, lastEq: eq });
const T = (min) => new Date(Date.UTC(2026, 10, 4, 12, min));

import * as TT from "../runner/tortugas.mjs";

test("Real v313: 🐢 solo Tortugas: NO compra con el método, la base ni los profesionales; SÍ con las Tortugas (con la combinación aprendida)", async () => {
  delete process.env.SOLO_TORT;
  const ex = exchange({ "A-EUR": 1, "BTC-EUR": 1, "ETH-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const base = { t: Date.now(), m: { "BTC-EUR": { up: true }, "ETH-EUR": { up: true } } }, W = { t: Date.now(), m: { "ETH-EUR": { s: 0.9, nl: 6, ns: 1, d: 0.1, entra: true, sale: false } } };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, base, ballenas: W }, tk(ex.px), T(1), deps));
  assert.equal(Object.keys(RS.pos).length, 0, "nada fuera de las Tortugas: " + JSON.stringify(Object.keys(RS.pos)));
  const sen = { t: Date.now(), P: { ent: 30, sale: 20, kN: 3, stopMax: 0.12, filtro: true, maxPos: 4 }, sen: { "A-EUR": { t: 1, c: 1, N: 0.03, hi20: 0.98, lo10: 0.9, entra: true, sale: false }, "BTC-EUR": { t: 1, c: 1, N: 0.02, entra: false, sale: false, sobre50: false } } };
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, tort: sen }, tk(ex.px), T(2), deps));
  assert.ok(!RS.pos["A-EUR"], "filtro aprendido: con BTC a la baja no compra");
  sen.sen["BTC-EUR"].sobre50 = true; sen.t = Date.now() + 1; sen.sen["A-EUR"].t = 2;
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, tort: sen }, tk(ex.px), T(3), deps));
  const p = RS.pos["A-EUR"]; assert.ok(p && p.src === "tortuga", "con BTC al alza compra"); assert.ok(Math.abs(p.stop / p.px - 0.91) < 0.005, "stop 3N = −9 %: " + p.stop / p.px);
});

test("Tortugas v313: 🧠 aprende sin trampas: solo cambia si la nueva gana en el año que no vio", () => {
  const dia = 864e5, mk = (f) => { const out = []; let p = 100; for (let i = 0; i < 760; i++) { p = f(i, p); out.push([i * dia, p, p * 1.01, p * 0.99, p, 1]); } return out; };
  const series = { "A-EUR": mk((i, p) => p * (1 + 0.004 * Math.sin(i / 25) + 0.001)), "B-EUR": mk((i, p) => p * (1 + 0.005 * Math.sin(i / 40))), "BTC-EUR": mk((i, p) => p * (1 + 0.003 * Math.sin(i / 60) + 0.0005)) };
  let q = 3; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  const A = TT.aprende(series, 0.0025, null, { rnd, n: 120 }); assert.ok(A.P && A.P.ent > 0 && typeof A.cambia === "boolean" && A.motivo, JSON.stringify(A));
  assert.ok(A.nuevas >= 100 && A.pob.length >= 1, "evoluciona: " + A.nuevas + " · madres " + A.pob.length);
  const H = TT.hijas([A.P], 50, rnd); assert.ok(H.length === 50 && H.every((P) => P.sale < P.ent), "hijas válidas y distintas");
  const otraMala = { "A-EUR": mk((i, p) => p * (1 - 0.002)), "B-EUR": mk((i, p) => p * (1 - 0.0015)), "BTC-EUR": mk((i, p) => p * (1 - 0.001)) };
  const C = TT.aprende(series, 0.0025, null, { rnd, n: 120, otra: otraMala }); assert.ok(!C.cambia || C.nueva.otra > 0, "nunca cambia a una que pierde con las criptos del otro exchange");
  assert.ok(TT.genes().length >= 30); assert.match(TT.describe(A.P), /máximo de \d+ días/);
});

test("Tortugas v318: 🎚️ perfiles de riesgo: el máximo pone casi todo en cada compra y evoluciona sus propias reglas", () => {
  const P1 = { riesgo: "alto", maxPos: 1 }, P4 = { riesgo: "bajo", maxPos: 4 };
  assert.ok(Math.abs(TT.tamano(100, 0.08, P1) - 100) < 1e-9, "máximo con 1 a la vez: todo");
  assert.ok(TT.tamano(100, 0.08, P4) <= 15 + 1e-9, "bajo: como mucho 15 %");
  const dia = 864e5, mk = (f) => { const out = []; let p = 100; for (let i = 0; i < 760; i++) { p = f(i, p); out.push([i * dia, p, p * 1.01, p * 0.99, p, 1]); } return out; };
  const series = { "A-EUR": mk((i, p) => p * (1 + 0.004 * Math.sin(i / 25) + 0.001)), "BTC-EUR": mk((i, p) => p * (1 + 0.003 * Math.sin(i / 60) + 0.0005)) };
  let q = 5; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
  const A = TT.aprende(series, 0.001, null, { rnd, n: 80, riesgo: "alto" }); assert.equal(A.P.riesgo, "alto"); assert.ok(A.pob.every((P) => P.riesgo === "alto"));
  const B = TT.aprende(series, 0.001, null, { rnd, n: 80, riesgo: "bajo" }); assert.ok(B.pob.every((P) => P.maxPos >= 4), "bajo nunca concentra");
});

test("Real v318: 🎚️ riesgo máximo: compra con casi todo el dinero y el stop de emergencia queda por debajo del de su regla", async () => {
  delete process.env.SOLO_TORT;
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const sen = { t: Date.now(), P: { ent: 20, sale: 10, kN: 3, stopMax: 0.15, filtro: false, maxPos: 1, riesgo: "alto" }, sen: { "A-EUR": { t: 1, c: 1, N: 0.04, hi20: 0.98, lo10: 0.9, entra: true, sale: false } } };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, tort: sen }, tk(ex.px), T(1), deps));
  const p = RS.pos["A-EUR"]; assert.ok(p && p.cost > 90, "casi todo: " + (p && p.cost)); assert.ok(Math.abs(p.stop / p.px - 0.88) < 0.006, "stop 3N = −12 %");
});
