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
    if (u.pathname === "/v2/balance") return R(200, [{ symbol: "EUR", available: String(ex.eur), inOrder: "0" }]);
    if (u.pathname === "/v2/assets") return R(200, { symbol: u.searchParams.get("symbol"), decimals: 4 });
    if (u.pathname === "/v2/order" && o.method === "POST") {
      const b = JSON.parse(o.body); assert.equal(typeof b.operatorId, "number"); assert.equal(b.orderType, "market"); ex.orders.push(b); const p = ex.px[b.market];
      if (b.side === "buy") { const quote = +b.amountQuote / 1.0025, q = quote / p; ex.bal[b.market] = (ex.bal[b.market] || 0) + q; return R(200, { filledAmount: String(q), filledAmountQuote: String(quote), feePaid: String(quote * 0.0025), feeCurrency: "EUR" }); }
      const q = +b.amount; assert.ok(String(b.amount).split(".")[1] === undefined || String(b.amount).split(".")[1].length <= 4, "respeta los decimales"); ex.bal[b.market] -= q; const quote = q * p; return R(200, { filledAmount: String(q), filledAmountQuote: String(quote), feePaid: String(quote * 0.0025), feeCurrency: "EUR" });
    }
    return R(404, { errorCode: 999 });
  };
  ex.api = RL.cliente("CLAVE", "SECRETO", ex.fx);
  ex.mercado = async (m) => { const [mk] = [await ex.api("GET", "/markets?market=" + m)], as = await ex.api("GET", "/assets?symbol=" + m.split("-")[0]); return { min: +mk.minOrderInQuoteAsset, dec: +as.decimals }; };
  return ex;
}
const tk = (px) => Object.fromEntries(Object.entries(px).map(([m, p]) => [m, { bid: p * 0.999, ask: p * 1.001 }]));
const fuente = (pos = {}, eq = 100) => ({ pos, lastEq: eq });
const T = (min) => new Date(Date.UTC(2026, 10, 4, 12, min));

test("Real: firma bien, copia una compra nueva en la misma proporción y vende cuando vende el método", async () => {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS, msgs } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  assert.equal(RS.cash, 50); assert.ok(msgs[0].includes("empieza"));
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };   // el método mete el 60 % de 100 €
  ({ RS, msgs } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.equal(ex.orders.length, 1); assert.equal(ex.orders[0].amountQuote, "30.00", "60 % de 50 € = 30 € (el tope)"); assert.ok(RS.pos["AAA-EUR"]); assert.ok(Math.abs(RS.cash - 20) < 1e-9);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(2), deps));
  assert.equal(ex.orders.length, 1, "no compra dos veces lo mismo");
  // venta parcial del método (vende el 80 %) → aquí también
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": { ...sp, q: 2, cob: 17 } }) }, { copia: "mix" }, tk((ex.px["AAA-EUR"] = 2.1, ex.px)), T(3), deps));
  assert.equal(ex.orders[1].side, "sell"); assert.ok(Math.abs(+ex.orders[1].amount - RS.pos["AAA-EUR"].q * 4) < 0.01, "vende ~80 %"); assert.ok(RS.pos["AAA-EUR"].tp);
  // el método cierra → vende el resto, con ganancia
  ({ RS, msgs } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix" }, tk(ex.px), T(4), deps));
  assert.equal(Object.keys(RS.pos).length, 0); assert.equal(RS.closed.length, 1); assert.ok(RS.closed[0].pnl > 0, JSON.stringify(RS.closed[0])); assert.ok(msgs.some((x) => x.includes("vende AAA")));
  assert.ok(RS.cash > 50 && RS.cash < 52, "ganancia con comisiones reales: " + RS.cash);
});

test("Real: no persigue el precio, no copia compras viejas, respeta el mínimo y el tope por orden", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1, "C-EUR": 1, "D-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const pos = { "A-EUR": { sym: "A", px: 0.95, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(1).toISOString() },   // ya subió > 1,5 %
    "B-EUR": { sym: "B", px: 1, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(-30).toISOString() },                      // compra vieja
    "C-EUR": { sym: "C", px: 1, cost0: 5, cost: 5, q: 1, q0: 1, t0: T(1).toISOString() },                          // 5 % de 50 € = 2,5 € < mínimo
    "D-EUR": { sym: "D", px: 1, cost0: 90, cost: 90, q: 1, q0: 1, t0: T(1).toISOString() } };                      // 90 % → tope de 30 €
  ({ RS } = await RL.vuelta(RS, { mix: fuente(pos) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.deepEqual(ex.orders.map((o) => o.market), ["D-EUR"]); assert.equal(ex.orders[0].amountQuote, "30.00");
});

test("Real: cambiar de método vende lo abierto; /parar vende todo y no compra; el freno del −25 % para solo", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const sp = { sym: "A", px: 1, cost0: 40, cost: 40, q: 1, q0: 1, t0: T(1).toISOString() };
  let { RS } = await RL.vuelta(null, { mix: fuente(), eq: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }), eq: fuente() }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.ok(RS.pos["A-EUR"]);
  let o = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }), eq: fuente() }, { copia: "eq" }, tk(ex.px), T(2), deps); RS = o.RS;
  assert.equal(Object.keys(RS.pos).length, 0, "vende al cambiar"); assert.equal(RS.copia, "eq");
  // parar
  const sp2 = { ...sp, t0: T(3).toISOString() };
  o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp2 }) }, { copia: "eq" }, tk(ex.px), T(3), deps); RS = o.RS; assert.ok(RS.pos["A-EUR"]);
  const n = ex.orders.length; o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp2 }) }, { copia: "eq", parado: true }, tk(ex.px), T(4), deps); RS = o.RS;
  assert.equal(Object.keys(RS.pos).length, 0); assert.equal(RS.estado, "parado"); assert.equal(ex.orders.length, n + 1);
  // freno: compra y el precio se hunde un 60 %
  const sp3 = { ...sp, t0: T(5).toISOString() };
  o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp3 }) }, { copia: "eq" }, tk(ex.px), T(5), deps); RS = o.RS; assert.ok(RS.pos["A-EUR"]);
  ex.px["A-EUR"] = 0.1; o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp3 }) }, { copia: "eq" }, tk(ex.px), T(6), deps);
  assert.ok(o.ctl.parado && o.ctlCambia, "se para solo"); assert.equal(Object.keys(o.RS.pos).length, 0); assert.ok(o.msgs.some((x) => x.includes("PARADO")));
});

test("Real: con una clave mala no opera y avisa una vez", async () => {
  const ex = exchange({ "A-EUR": 1 }), mala = RL.cliente("CLAVE", "OTRO", ex.fx);
  const sp = { sym: "A", px: 1, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(1).toISOString() };
  let o = await RL.vuelta(null, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), { api: mala, mercado: ex.mercado });
  assert.equal(o.RS.estado, "clave"); assert.equal(ex.orders.length, 0); assert.ok(o.msgs.some((x) => x.includes("clave no funciona")));
  o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": { ...sp, t0: T(2).toISOString() } }) }, { copia: "mix" }, tk(ex.px), T(2), { api: mala, mercado: ex.mercado });
  assert.ok(!o.msgs.some((x) => x.includes("clave no funciona")), "no repite el aviso");
});

test("Real: si tras vender una parte quedaría menos del mínimo, lo vende todo", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const sp = { sym: "A", px: 1, cost0: 20, cost: 20, q: 10, q0: 10, t0: T(1).toISOString() };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": { ...sp, q: 2, cob: 9 } }) }, { copia: "mix" }, tk(ex.px), T(2), deps));
  assert.equal(Object.keys(RS.pos).length, 0); assert.ok(Math.abs(ex.bal["A-EUR"]) < 1e-3, "no deja nada sin vender: " + ex.bal["A-EUR"]);
});

test("Real (completo): sin clave no hace nada; con clave guarda el estado CIFRADO y en público solo el estado", async () => {
  const S = { pos: {}, lastEq: 100, sub: { mix: { pos: {}, lastEq: 100 }, turbo: { pos: {}, lastEq: 100 } } }, store = {}, io = { leer: async (f, r) => store[r + "/" + f] || null, publicar: (f, o, r) => { store[r + "/" + f] = JSON.parse(JSON.stringify(o)); }, tg: async () => {} };
  for (const k of ["BITVAVO_KEY", "BITVAVO_SECRET", "REAL_VIEW_PASS"]) delete process.env[k];
  await RL.paso(S, {}, T(0), io); assert.equal(S.real.estado, "sin clave"); assert.equal(Object.keys(store).length, 0);
  Object.assign(process.env, { BITVAVO_KEY: "CLAVE", BITVAVO_SECRET: "SECRETO", REAL_VIEW_PASS: "pw-de-prueba-123" });
  const ex = exchange({ "A-EUR": 1 }), f0 = globalThis.fetch; globalThis.fetch = ex.fx;
  try {
    S.sub.mix.pos = { "A-EUR": { sym: "A", px: 1, cost0: 20, cost: 20, q: 1, q0: 1, t0: new Date().toISOString() } };
    await RL.paso(S, tk(ex.px), new Date(), io);
    const pub = store["bitvavo-real/real.json"], txt = JSON.stringify(pub);
    assert.equal(pub.enc, 1); assert.ok(!/"cash"|A-EUR|"pos"/.test(txt), "nada legible en público"); assert.deepEqual(Object.keys(pub.meta).sort(), ["copia", "estado", "t"]);
    assert.equal(store["bitvavo-ctl/ctl.json"].copia, "mix"); assert.equal(ex.orders.length, 1);
    const { openAny } = await import("../runner/real-cfg.mjs"), o = await openAny(pub, ["pw-de-prueba-123"]); assert.ok(o.j.pos["A-EUR"]);
  } finally { globalThis.fetch = f0; for (const k of ["BITVAVO_KEY", "BITVAVO_SECRET", "REAL_VIEW_PASS"]) delete process.env[k]; }
});

test("Real: el dinero a usar se elige, nunca pasa de lo que hay libre en Bitvavo, y se puede subir o bajar", async () => {
  const ex = exchange({ "A-EUR": 1 }); let hay = 80; const deps = { api: ex.api, mercado: ex.mercado, saldoEur: async () => hay };
  let o = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 150 }, tk(ex.px), T(0), deps);
  assert.equal(o.RS.start, 80, "pide 150 pero solo hay 80"); assert.ok(o.msgs[0].includes("solo hay"));
  hay = 300; o = await RL.vuelta(o.RS, { mix: fuente() }, { copia: "mix", capital: 150 }, tk(ex.px), T(1), deps);
  assert.equal(o.RS.capital, 150); assert.equal(o.RS.cash, 150, "al ingresar más, lo coge solo");
  o = await RL.vuelta(o.RS, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(2), deps);
  assert.equal(o.RS.capital, 100); assert.equal(o.RS.cash, 100);
  // con 100 €, una compra del 60 % ya puede ser de 60 € (el tope por orden crece con el dinero)
  const sp = { sym: "A", px: 1, cost0: 60, cost: 60, q: 1, q0: 1, t0: T(3).toISOString() };
  o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 100 }, tk(ex.px), T(3), deps);
  assert.equal(ex.orders[0].amountQuote, "60.00");
  // si en la cuenta hay menos de 10 €, no empieza
  const o2 = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 50 }, tk(ex.px), T(0), { ...deps, saldoEur: async () => 4 });
  assert.ok(o2.sinEmpezar); assert.equal(o2.RS, null);
});
