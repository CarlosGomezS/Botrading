process.env.SOLO_TORT = "0";   // v313 · estas pruebas son del copiado de métodos (el real ahora solo sigue a las Tortugas; ver tortugas-solo.test.mjs)
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
    if (ex.falloBalance && u.pathname === "/v2/balance") return R(500, { errorCode: 999, error: "saldo no disponible (prueba)" });
    if (ex.falloQuita && u.pathname === "/v2/order" && o.method === "DELETE") return R(500, { errorCode: 999, error: "error interno (prueba)" });
    if (ex.dudosaCompra && u.pathname === "/v2/order" && o.method === "POST" && JSON.parse(o.body).side === "buy" && JSON.parse(o.body).orderType === "market") { ex.intentos = (ex.intentos || 0) + 1; return R(504, { errorCode: 999, error: "tiempo agotado (prueba)" }); }
    if (u.pathname === "/v2/markets") return R(200, { market: u.searchParams.get("market"), minOrderInQuoteAsset: "5" });
    if (u.pathname === "/v2/balance") { const all = [{ symbol: "EUR", available: String(ex.eur), inOrder: "0" }, ...Object.entries(ex.bal).filter(([, q]) => q > 1e-12).map(([m, q]) => ({ symbol: m.replace("-EUR", ""), available: String(q), inOrder: "0" }))]; const sy = u.searchParams.get("symbol"); return R(200, sy ? all.filter((x) => x.symbol === sy) : all); }
    if (u.pathname === "/v2/assets") return R(200, { symbol: u.searchParams.get("symbol"), decimals: 4 });
    if (u.pathname === "/v2/order" && o.method === "POST") {
      const b = JSON.parse(o.body); assert.equal(typeof b.operatorId, "number"); if (b.orderType === "stopLoss" && ex.stopSinId) { ex.stopSinId--; return R(200, {}); } if (b.orderType === "stopLoss" && ex.falloStop) { ex.falloStop--; return R(400, { errorCode: 205, error: "stop rechazado (prueba)" }); } if (b.orderType === "market" && b.side === "sell" && ex.falloVenta && ex.falloVenta.has(b.market)) return R(400, { errorCode: 216, error: "venta rechazada (prueba)" }); if (b.orderType === "stopLoss") { ex.stops = ex.stops || {}; const id = "S" + Object.keys(ex.stops).length; ex.stops[id] = b; return R(200, { orderId: id }); }
      assert.equal(b.orderType, "market"); assert.ok(b.clientOrderId, "cada orden lleva su identificador"); if (ex.timeout) { ex.timeout--; ex.orders.push(b); ex.porId = ex.porId || {}; const p0 = ex.px[b.market], quote0 = +b.amountQuote / 1.0025, q0 = quote0 / p0; ex.bal[b.market] = (ex.bal[b.market] || 0) + q0; ex.porId[b.clientOrderId] = { filledAmount: String(q0), filledAmountQuote: String(quote0), feePaid: String(quote0 * 0.0025), feeCurrency: "EUR", status: "filled" }; return R(504, { errorCode: 999, error: "tiempo agotado" }); }
      ex.orders.push(b); const p = ex.px[b.market];
      if (b.side === "buy") { const quote = +b.amountQuote / 1.0025, q = quote / p; ex.bal[b.market] = (ex.bal[b.market] || 0) + q; return R(200, { filledAmount: String(q), filledAmountQuote: String(quote), feePaid: String(quote * 0.0025), feeCurrency: "EUR" }); }
      if (b.side === "sell" && ex.saldoReal && +b.amount > (ex.bal[b.market] || 0) + 1e-9) return R(400, { errorCode: 216, error: "insufficient balance (prueba)" });
      const q = +b.amount; assert.ok(String(b.amount).split(".")[1] === undefined || String(b.amount).split(".")[1].length <= 4, "respeta los decimales"); ex.bal[b.market] -= q; const quote = q * p; return R(200, { filledAmount: String(q), filledAmountQuote: String(quote), feePaid: String(quote * 0.0025), feeCurrency: "EUR" });
    }
    if (u.pathname === "/v2/trades") return R(200, (ex.trades || []).filter((x) => x.market === u.searchParams.get("market")));
    if (u.pathname === "/v2/order" && o.method === "DELETE") { const id = u.searchParams.get("orderId"); if (ex.stops) delete ex.stops[id]; return R(200, { orderId: id }); }
    if (u.pathname === "/v2/ordersOpen") return R(200, ex.abiertas || []);
    if (u.pathname === "/v2/order" && o.method === "GET" && u.searchParams.get("orderId")) { if (ex.falloEstado) return R(500, { errorCode: 999, error: "error interno (prueba)" }); const st = ex.stops && ex.stops[u.searchParams.get("orderId")]; return st ? R(200, { status: "awaitingTrigger", amount: st.amount, amountRemaining: st.amount, ...(ex.sinDatosStop ? {} : { side: st.side, triggerAmount: st.triggerAmount, triggerPrice: st.triggerAmount }) }) : R(404, { errorCode: 240, error: "no existe" }); }
    if (u.pathname === "/v2/order" && o.method === "GET" && ex.ordenViva) return R(200, { status: "new", filledAmount: "0" });
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

test("Real: firma bien, copia una compra nueva en la misma proporción y vende cuando vende el método", async () => {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS, msgs } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  assert.equal(RS.cash, 50); assert.ok(msgs[0].includes("empieza"));
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };   // el método mete el 60 % de 100 €
  ({ RS, msgs } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.equal(ex.orders.length, 1); assert.equal(ex.orders[0].amountQuote, "12.50", "v286: como mucho 25 % de 50 € por compra"); assert.ok(RS.pos["AAA-EUR"]); assert.ok(Math.abs(RS.cash - 37.5) < 1e-9);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(2), deps));
  assert.equal(ex.orders.length, 1, "no compra dos veces lo mismo");
  // venta parcial del método (vende la mitad) → aquí también
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": { ...sp, q: 5, cob: 10.5 } }) }, { copia: "mix" }, tk((ex.px["AAA-EUR"] = 2.1, ex.px)), T(3), deps));
  assert.equal(ex.orders[1].side, "sell"); assert.ok(Math.abs(+ex.orders[1].amount - RS.pos["AAA-EUR"].q) < 0.01, "vende ~50 % (v286: con 12,50 € el 80 % dejaría menos del mínimo)"); assert.ok(RS.pos["AAA-EUR"].tp);
  // el método cierra → vende el resto, con ganancia
  ({ RS, msgs } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix" }, tk(ex.px), T(4), deps));
  assert.equal(Object.keys(RS.pos).length, 0); assert.equal(RS.closed.length, 1); assert.ok(RS.closed[0].pnl > 0, JSON.stringify(RS.closed[0])); assert.ok(msgs.some((x) => x.includes("VENTA REAL") && x.includes("AAA")));
  assert.ok(RS.cash > 50 && RS.cash < 52, "ganancia con comisiones reales: " + RS.cash);
});

test("Real: no persigue el precio, no copia compras viejas, respeta el mínimo y el tope por orden", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1, "C-EUR": 1, "D-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const pos = { "A-EUR": { sym: "A", px: 0.95, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(1).toISOString() },   // ya subió > 1,5 %
    "B-EUR": { sym: "B", px: 1, cost0: 20, cost: 20, q: 1, q0: 1, t0: T(-30).toISOString() },                      // compra vieja
    "C-EUR": { sym: "C", px: 1, cost0: 5, cost: 5, q: 1, q0: 1, t0: T(1).toISOString() },                          // 5 % de 50 € = 2,5 € < mínimo → compra el mínimo
    "D-EUR": { sym: "D", px: 1, cost0: 90, cost: 90, q: 1, q0: 1, t0: T(1).toISOString() } };                      // 90 % → tope de 30 €
  ({ RS } = await RL.vuelta(RS, { mix: fuente(pos) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  // v255 · lo que queda bajo el mínimo se compra al mínimo (5,10 €) si no pasa del 25 % de la cuenta
  assert.deepEqual(ex.orders.map((o) => o.market), ["C-EUR", "D-EUR"]); assert.equal(ex.orders[0].amountQuote, "5.10"); // v285 · tope del 60 % invertido: 50 € × 60 % − 5,10 € ya invertidos ≈ 24,9 € (antes 30 €)
  assert.ok(Math.abs(+ex.orders[1].amountQuote - 12.5) < 0.1, ex.orders[1].amountQuote);   // v286 · tope del 25 % por compra
});

test("Real: cambiar de método NO vende lo abierto (sigue con su método); /parar vende todo y no compra; el freno general para solo", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const sp = { sym: "A", px: 1, cost0: 40, cost: 40, q: 1, q0: 1, t0: T(1).toISOString() };
  let { RS } = await RL.vuelta(null, { mix: fuente(), eq: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }), eq: fuente() }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.ok(RS.pos["A-EUR"]);
  let o = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }), eq: fuente() }, { copia: "eq" }, tk(ex.px), T(2), deps); RS = o.RS;
  assert.equal(Object.keys(RS.pos).length, 1, "v261: al cambiar NO vende"); assert.equal(RS.copia, "eq"); assert.equal(RS.pos["A-EUR"].src, "mix");
  o = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }), eq: fuente() }, { copia: "eq" }, tk(ex.px), T(2.5), deps); RS = o.RS; assert.equal(Object.keys(RS.pos).length, 1, "sigue mientras su método la tenga");
  // parar
  const sp2 = { ...sp, t0: T(3).toISOString() };
  o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp2 }) }, { copia: "eq" }, tk(ex.px), T(3), deps); RS = o.RS; assert.ok(RS.pos["A-EUR"]);
  const n = ex.orders.length; o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp2 }) }, { copia: "eq", parado: true }, tk(ex.px), T(4), deps); RS = o.RS;
  assert.equal(Object.keys(RS.pos).length, 0); assert.equal(RS.estado, "parado"); assert.equal(ex.orders.length, n + 1);
  // freno: compra dos (25 % cada una, v286) y los precios se hunden un 90 %
  const sp3 = { ...sp, t0: T(5).toISOString() }, sp4 = { ...sp3, sym: "B" }; ex.px["B-EUR"] = 1;
  o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp3, "B-EUR": sp4 }) }, { copia: "eq" }, tk(ex.px), T(5), deps); RS = o.RS; assert.ok(RS.pos["A-EUR"] && RS.pos["B-EUR"]);
  ex.px["A-EUR"] = 0.1; ex.px["B-EUR"] = 0.1; o = await RL.vuelta(RS, { eq: fuente({ "A-EUR": sp3, "B-EUR": sp4 }) }, { copia: "eq" }, tk(ex.px), T(6), deps);
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
    assert.equal(pub.enc, 1); assert.ok(!/"cash"|A-EUR|"pos"/.test(txt), "nada legible en público"); assert.deepEqual(Object.keys(pub.meta).sort(), ["copia", "estado", "ex", "t"]);
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
  assert.equal(ex.orders[0].amountQuote, "25.00");   // v286 · como mucho el 25 % por compra
  // si en la cuenta hay menos de 10 €, no empieza
  const o2 = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 50 }, tk(ex.px), T(0), { ...deps, saldoEur: async () => 4 });
  assert.ok(o2.sinEmpezar); assert.equal(o2.RS, null);
});

test("Real: freno diario del 10 % (descansa hasta mañana y vuelve solo) y aviso para retomar tras el freno grande", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const D = (h) => new Date(Date.UTC(2026, 10, 4, h)), sp = (h) => ({ sym: "A", px: 1, cost0: 60, cost: 60, q: 1, q0: 1, t0: D(h).toISOString() });
  let o = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), D(8), deps);
  o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp(9) }) }, { copia: "mix" }, tk(ex.px), D(9), deps); assert.ok(o.RS.pos["A-EUR"]);
  ex.px["A-EUR"] = 0.5;   // v286 · 12,50 € invertidos (25 %) caen a la mitad → el total cae ~12,5 % (más que el 10 % diario, menos que el 25 % grande)
  o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp(9) }) }, { copia: "mix" }, tk(ex.px), D(10), deps);
  assert.equal(o.RS.estado, "pausa"); assert.equal(Object.keys(o.RS.pos).length, 0); assert.ok(o.msgs.some((x) => x.includes("descansa hasta mañana")));
  const n = ex.orders.length; o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp(11) }) }, { copia: "mix" }, tk(ex.px), D(11), deps);
  assert.equal(ex.orders.length, n, "hoy no compra");
  o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": { ...sp(0), t0: new Date(Date.UTC(2026, 10, 5, 9)).toISOString() } }) }, { copia: "mix" }, tk(ex.px), new Date(Date.UTC(2026, 10, 5, 9)), deps);
  assert.ok(o.msgs.some((x) => x.includes("nuevo día"))); assert.ok(o.RS.pos["A-EUR"], "mañana vuelve a comprar");
  // aviso para retomar: tras el freno grande, cuando el ficticio se recupera, hay regla ganadora y pasan 2 días
  const RS = { ...o.RS, paradaAt: new Date(Date.UTC(2026, 10, 5, 10)).toISOString() }, ok = (t) => ({ pc: 1.5, t1: new Date(Date.UTC(2026, 10, 6, t)).toISOString() });
  let src = { pos: {}, lastEq: 100, prueba: false, closed: [ok(1), ok(2), ok(3), ok(4), ok(5)] };
  let o2 = await RL.vuelta(RS, { mix: src }, { copia: "mix", parado: true }, tk(ex.px), new Date(Date.UTC(2026, 10, 6, 12)), deps);
  assert.ok(!o2.RS.retomar.ok, "aún no han pasado 2 días"); assert.ok(!o2.msgs.some((x) => x.includes("condiciones para retomar")));
  o2 = await RL.vuelta(o2.RS, { mix: src }, { copia: "mix", parado: true }, tk(ex.px), new Date(Date.UTC(2026, 10, 7, 12)), deps);
  assert.ok(o2.RS.retomar.ok); assert.ok(o2.msgs.some((x) => x.includes("condiciones para retomar")));
  o2 = await RL.vuelta(o2.RS, { mix: src }, { copia: "mix", parado: true }, tk(ex.px), new Date(Date.UTC(2026, 10, 7, 13)), deps);
  assert.ok(!o2.msgs.some((x) => x.includes("condiciones para retomar")), "como mucho un aviso al día");
});

test("Real v243: cada cuenta se enciende o apaga por separado (ninguna, una o las dos) y al apagarla vende lo abierto", async () => {
  assert.deepEqual(Object.fromEntries(Object.entries(RL.cuentas({ ex: "okx", copia: "mix", capital: 50 })).map(([k, v]) => [k, v.on])), { bitvavo: false, okx: true }, "lo antiguo se respeta");
  const C2 = RL.cuentas({ copia: "mix", capital: 50, cuentas: { bitvavo: { on: true, capital: 80, copia: "turbo" }, okx: { on: true } } });
  assert.ok(C2.bitvavo.on && C2.okx.on); assert.equal(C2.bitvavo.capital, 80); assert.equal(C2.bitvavo.copia, "turbo"); assert.equal(C2.okx.copia, "mix"); assert.equal(C2.okx.capital, 50);
  const S = { pos: {}, lastEq: 100, sub: { mix: { pos: {}, lastEq: 100 }, turbo: { pos: {}, lastEq: 100 } } }, store = {}, io = { leer: async (f, r) => store[r + "/" + f] || null, publicar: (f, o, r) => { store[r + "/" + f] = JSON.parse(JSON.stringify(o)); }, tg: async () => {} };
  Object.assign(process.env, { BITVAVO_KEY: "CLAVE", BITVAVO_SECRET: "SECRETO", REAL_VIEW_PASS: "pw-de-prueba-123" });
  const ex = exchange({ "A-EUR": 1 }), f0 = globalThis.fetch; globalThis.fetch = ex.fx;
  try {
    store["bitvavo-ctl/ctl.json"] = { copia: "mix", parado: false, cuentas: { bitvavo: { on: false }, okx: { on: false } } };
    S.sub.mix.pos = { "A-EUR": { sym: "A", px: 1, cost0: 20, cost: 20, q: 1, q0: 1, t0: new Date(Date.now() + 120000).toISOString() } };   // v469 · margen amplio: con 2 s fallaba en máquinas lentas
    await RL.paso(S, tk(ex.px), new Date(), io); assert.equal(ex.orders.length, 0, "ninguna encendida: no opera"); assert.equal(S.real.estado, "apagado");
    store["bitvavo-ctl/ctl.json"].cuentas.bitvavo.on = true; delete S.conex;
    await RL.paso(S, tk(ex.px), new Date(), io); assert.equal(ex.orders.length, 1, "encendida: copia la compra"); assert.equal(S.real.cuentas.bitvavo.estado, "activo");
    store["bitvavo-ctl/ctl.json"].cuentas.bitvavo.on = false; delete S.conex;
    await RL.paso(S, tk(ex.px), new Date(), io); assert.equal(ex.orders.length, 2, "apagada: vende lo abierto"); assert.equal(ex.orders[1].side, "sell"); assert.equal(S.real.cuentas.bitvavo.estado, "apagada");
  } finally { globalThis.fetch = f0; for (const k of ["BITVAVO_KEY", "BITVAVO_SECRET", "REAL_VIEW_PASS"]) delete process.env[k]; }
});

test("Real v247: ⭐ muy ganadora y 🤖 automático (elige la más fuerte, no cambia con algo abierto)", () => {
  const T = (med, n, pf) => ({ med, n, pf }), fuente = (s, ok, x) => ({ prueba: !ok, genomeId: "g", lab: { pop: [{ id: "g", s, ok, a: x, b: x, c: x }] } });
  const F = { eq: fuente(4.9, true, T(1, 60, 1.6)), turbo: fuente(1, false, T(0.5, 20, 1.1)), mix: fuente(2, true, T(0.4, 40, 1.2)), mixokx: fuente(3.5, true, T(1.2, 25, 1.5)) };
  assert.ok(RL.esMuy(RL.reglaEnUso(F.eq))); assert.ok(!RL.esMuy(RL.reglaEnUso(F.mixokx)), "pocas operaciones: no es ⭐"); assert.equal(RL.reglaEnUso(F.turbo), null, "sin 🏆 no cuenta");
  assert.equal(RL.autoElige(F, "mix", false).copia, "eq", "se va a la ⭐");
  assert.equal(RL.autoElige(F, "mix", true).copia, "eq", "v258: con algo abierto, si aparece una ⭐⭐ cambia ya");
  assert.equal(RL.autoElige({ ...F, eq: fuente(9, true, T(0.5, 60, 1.6)) }, "mix", true).copia, "mix", "con algo abierto y sin ⭐⭐ nueva, espera");
  assert.equal(RL.autoElige({ ...F, eq: fuente(4.9, false, T(1, 60, 1.6)) }, "mix", false).copia, "mix", "v290: +1 no es MUCHO mejor → se queda");
  assert.equal(RL.autoElige({ eq: fuente(1, false, T(1, 1, 1)) }, "mixokx", false).copia, "mixokx", "si nadie gana, no cambia");
});

test("Real v253: «copiar ya lo abierto» compra lo que el método ya tenía (una sola vez por petición)", async () => {
  const ex = exchange({ "A-EUR": 1.2, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let o = await RL.vuelta(null, { eq: fuente() }, { copia: "eq" }, tk(ex.px), T(5), deps);
  const viejo = { sym: "A", px: 1, cost0: 30, cost: 30, q: 30, q0: 30, t0: T(0).toISOString() };
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": viejo }) }, { copia: "eq" }, tk(ex.px), T(6), deps); assert.equal(ex.orders.length, 0, "sin pedirlo, lo antiguo no se copia");
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": viejo }) }, { copia: "eq", adoptarAt: "x1" }, tk(ex.px), T(7), deps); assert.equal(ex.orders.length, 1); assert.ok(o.RS.pos["A-EUR"]);
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": viejo }) }, { copia: "eq", adoptarAt: "x1" }, tk(ex.px), T(8), deps); assert.equal(ex.orders.length, 1, "no repite");
  for (const k of Object.keys(ex.px)) ex.px[k] *= 1.05;   // v304 · vende cuando el método vende y la venta cubre comisiones
  o = await RL.vuelta(o.RS, { eq: fuente({}) }, { copia: "eq", adoptarAt: "x1" }, tk(ex.px), T(9), deps); assert.equal(ex.orders[1].side, "sell", "y vende cuando el método vende");
});

test("Real v255: si la parte proporcional queda bajo el mínimo del exchange, compra el mínimo (sin pasar del 25 % de la cuenta)", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let o = await RL.vuelta(null, { eq: fuente() }, { copia: "eq", capital: 50 }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 6, cost: 6, q: 6, q0: 6, t0: T(1).toISOString() };   // el método compra 6 € de 100 → tocarían 3 € de 50
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": sp }) }, { copia: "eq", capital: 50 }, tk(ex.px), T(1), deps);
  assert.equal(ex.orders.length, 1); assert.equal(ex.orders[0].amountQuote, "5.10");
  const o2 = await RL.vuelta(null, { eq: fuente() }, { copia: "eq", capital: 15 }, tk(ex.px), T(0), deps), sp2 = { ...sp, t0: T(2).toISOString() };
  await RL.vuelta(o2.RS, { eq: fuente({ "A-EUR": sp2 }) }, { copia: "eq", capital: 15 }, tk(ex.px), T(2), deps); assert.equal(ex.orders.length, 1, "con 15 €, 5,10 € pasaría del 25 %: no compra");
});

test("Real v256: 🪞 espejo: compra siempre lo que el método tenga abierto (aunque sea antiguo), cada posición una vez", async () => {
  const ex = exchange({ "A-EUR": 1.3, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let o = await RL.vuelta(null, { eq: fuente() }, { copia: "eq", espejo: true }, tk(ex.px), T(5), deps);
  const viejo = { sym: "A", px: 1, cost0: 30, cost: 30, q: 30, q0: 30, t0: T(0).toISOString() };
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": viejo }) }, { copia: "eq", espejo: true }, tk(ex.px), T(6), deps); assert.equal(ex.orders.length, 1, "compra la antigua aunque ya subió");
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": viejo }) }, { copia: "eq", espejo: true }, tk(ex.px), T(7), deps); assert.equal(ex.orders.length, 1, "no la repite");
  const nueva = { sym: "B", px: 1, cost0: 30, cost: 30, q: 30, q0: 30, t0: T(1).toISOString() };
  o = await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": viejo, "B-EUR": nueva }) }, { copia: "eq", espejo: true }, tk(ex.px), T(30), deps); assert.equal(ex.orders.length, 2, "y la que llegue después también, aunque sea tarde");
});

test("Real v259: un ⭐⭐ solo cuenta si lleva ≥ 60 min siéndolo (el automático no salta de un método a otro)", () => {
  const T2 = (med, n, pf) => ({ med, n, pf }), fuente = (s, ok, x) => ({ prueba: !ok, genomeId: "g", lab: { pop: [{ id: "g", s, ok, a: x, b: x, c: x }] } });
  const F = { eq: fuente(4, true, T2(0.5, 60, 1.6)), mixokx: fuente(2.5, true, T2(1, 40, 2)) }, S = {}, t0 = new Date(Date.UTC(2026, 10, 5, 10));
  RL.marcaMuy(S, F, t0); assert.equal(RL.autoElige(F, "eq", true, S.muyDesde, t0).copia, "eq", "recién llegado a ⭐⭐: aún no cambia");
  const t1 = new Date(t0.getTime() + 61 * 60000); RL.marcaMuy(S, F, t1); assert.equal(RL.autoElige(F, "eq", true, S.muyDesde, t1).copia, "mixokx", "tras 1 h siendo ⭐⭐, cambia");
  RL.marcaMuy(S, { ...F, mixokx: fuente(2.5, true, T2(0.3, 40, 2)) }, t1); assert.ok(!S.muyDesde.mixokx, "si deja de serlo, se reinicia la cuenta");
});

test("Real v260: 💱 convertir a euros: vende TODO el saldo de esa cripto una sola vez y luego empieza con euros", async () => {
  const S = { pos: {}, lastEq: 100, sub: {} }, store = {}, msgs = [], io = { leer: async (f, r) => store[r + "/" + f] || null, publicar: (f, o, r) => { store[r + "/" + f] = JSON.parse(JSON.stringify(o)); }, tg: async (m) => { msgs.push(m); } };
  Object.assign(process.env, { BITVAVO_KEY: "CLAVE", BITVAVO_SECRET: "SECRETO", REAL_VIEW_PASS: "pw-de-prueba-123" });
  const ex = exchange({ "BTC-EUR": 60000 }, { eur: 0 }), f0 = globalThis.fetch; let btc = 0.002;
  globalThis.fetch = async (u, o) => { const x = new URL(u); if (x.pathname === "/v2/balance" && x.searchParams.get("symbol") === "BTC") return { ok: true, status: 200, json: async () => [{ symbol: "BTC", available: String(btc) }] };
    const r = await ex.fx(u, o); if (x.pathname === "/v2/order" && o.method === "POST") { ex.eur += 0.002 * 60000 * 0.9975; btc = 0; } return r; };
  try {
    store["bitvavo-ctl/ctl.json"] = { copia: "eq", cuentas: { bitvavo: { on: true, copia: "eq", capital: 50, convertir: { sym: "BTC", at: "c1" } }, okx: { on: false } } };
    await RL.paso(S, tk(ex.px), new Date(), io);
    assert.equal(ex.orders.length, 1); assert.equal(ex.orders[0].side, "sell"); assert.equal(ex.orders[0].market, "BTC-EUR");
    assert.ok(msgs.some((m) => /vendido tu BTC/.test(m))); assert.equal(store["bitvavo-ctl/ctl.json"].cuentas.bitvavo.convertir.hecho, "c1");
    delete S.conex; await RL.paso(S, tk(ex.px), new Date(), io); assert.equal(ex.orders.length, 1, "no lo repite");
  } finally { globalThis.fetch = f0; for (const k of ["BITVAVO_KEY", "BITVAVO_SECRET", "REAL_VIEW_PASS"]) delete process.env[k]; }
});

test("Real v266: cada exchange elige solo entre sus métodos y no cambia más de una vez cada 24 h (v289) (salvo que el actual pierda la 🏆)", () => {
  const T2 = (med, n, pf) => ({ med, n, pf }), f = (s, ok, x) => ({ prueba: !ok, genomeId: "g", lab: { pop: [{ id: "g", s, ok, a: x, b: x, c: x }] } });
  const F = { eq: f(9, true, T2(1, 60, 2)), mixokx: f(2, true, T2(0.5, 40, 1.3)), eqokx: f(4, true, T2(0.5, 40, 1.3)) }, now = new Date(Date.UTC(2026, 10, 6, 12));
  assert.equal(RL.autoElige(F, "eq", false, null, now, RL.FAMILIA.okx).copia, "eqokx", "OKX no elige Equilibrado (todas las criptos): elige el suyo");
  assert.equal(RL.autoElige(F, "mixokx", false, null, now, RL.FAMILIA.okx, new Date(now - 3600e3).toISOString()).copia, "mixokx", "lleva 1 h: espera");
  assert.equal(RL.autoElige(F, "mixokx", false, null, now, RL.FAMILIA.okx, new Date(now - 25 * 3600e3).toISOString()).copia, "eqokx", "lleva 25 h: cambia");
  assert.equal(RL.autoElige({ ...F, mixokx: f(2, false, T2(0.5, 40, 1.3)) }, "mixokx", false, null, now, RL.FAMILIA.okx, new Date(now - 600e3).toISOString()).copia, "eqokx", "si pierde la 🏆, cambia aunque lleve poco");
});

test("Real v267: lo que un método compra en 🧪 práctica (sin 🏆) nunca se copia con dinero real", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let o = await RL.vuelta(null, { eq: fuente() }, { copia: "eq", espejo: true }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 30, cost: 30, q: 30, q0: 30, t0: T(1).toISOString(), practica: 1 };
  await RL.vuelta(o.RS, { eq: fuente({ "A-EUR": sp }) }, { copia: "eq", espejo: true }, tk(ex.px), T(1), deps); assert.equal(ex.orders.length, 0);
});

test("Real v269: en automático copia a la vez a todos los ganadores de su exchange, repartiendo el dinero", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let o = await RL.vuelta(null, { eqokx: fuente(), mixokx: fuente() }, { copia: "eqokx", extra: ["mixokx"], capital: 100 }, tk(ex.px), T(0), deps);
  const a = { sym: "A", px: 1, cost0: 40, cost: 40, q: 40, q0: 40, t0: T(1).toISOString() }, b = { ...a, sym: "B" };
  o = await RL.vuelta(o.RS, { eqokx: fuente({ "A-EUR": a }), mixokx: fuente({ "B-EUR": b }) }, { copia: "eqokx", extra: ["mixokx"], capital: 100 }, tk(ex.px), T(1), deps);
  assert.equal(ex.orders.length, 2, "compra lo de los dos"); assert.equal(o.RS.pos["B-EUR"].src, "mixokx");
  assert.ok(+ex.orders[0].amountQuote <= 25.01, "v286: cada uno con su tamaño, como mucho 25 %");
  ex.px["B-EUR"] = 1.05; o = await RL.vuelta(o.RS, { eqokx: fuente({ "A-EUR": a }), mixokx: fuente({}) }, { copia: "eqokx", extra: ["mixokx"], capital: 100 }, tk(ex.px), T(2), deps);
  assert.ok(!o.RS.pos["B-EUR"], "vende cuando su método vende (con ganancia neta)");
});

test("Real v278: 🔍 cuadra con la cuenta real: incorpora lo que hay sin apuntar, corrige cantidades y guarda la foto exacta", async () => {
  const ex = exchange({ "Z-EUR": 2, "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  ex.bal["Z-EUR"] = 5;   // 10 € de Z en la cuenta que el bot no tenía apuntados
  let o = await RL.vuelta(null, { eq: fuente() }, { copia: "eq" }, tk(ex.px), T(0), deps);
  assert.ok(o.RS.pos["Z-EUR"] && o.RS.pos["Z-EUR"].huerfana, "la incorpora");
  assert.equal(o.RS.cuenta.activos[0].sym, "Z"); assert.ok(Math.abs(o.RS.cuenta.total - (1000 + 5 * ex.px["Z-EUR"] * 0.999)) < 0.05, "foto exacta");
  ex.px["Z-EUR"] = 1.8; o = await RL.vuelta(o.RS, { eq: fuente() }, { copia: "eq" }, tk(ex.px), T(1), deps);
  assert.ok(!o.RS.pos["Z-EUR"], "stop −6 % de lo incorporado"); assert.equal(ex.orders.at(-1).side, "sell");
});

test("Real v282: 📒 el libro casa compras y ventas del historial real del exchange (FIFO, comisiones incluidas)", async () => {
  const { libro } = await import("../runner/bitvavo-real.mjs");
  const L = libro([
    { t: 1000, sym: "RAY", side: "buy", q: 10, eur: 10, fee: 0.02 },
    { t: 2000, sym: "RAY", side: "sell", q: 10, eur: 11, fee: 0.02 },
    { t: 3000, sym: "UNI", side: "buy", q: 2, eur: 20, fee: 0.05 },
    { t: 4000, sym: "UNI", side: "sell", q: 1, eur: 9, fee: 0.02 },
  ]);
  assert.equal(L.cerradas.length, 2);
  const ray = L.cerradas.find((c) => c.sym === "RAY"); assert.equal(ray.pnl, 0.96); assert.equal(ray.cost, 10.02);
  const uni = L.cerradas.find((c) => c.sym === "UNI"); assert.ok(Math.abs(uni.cost - 10.025) < 0.01); assert.ok(Math.abs(uni.pnl + 1.045) < 0.01);
  assert.equal(L.abiertas.UNI.q, 1); assert.ok(Math.abs(L.abiertas.UNI.cost - 10.025) < 0.01); assert.ok(!L.abiertas.RAY);
});

test("Real v285: cada compra es al menos el 10 % de la cuenta y nunca pasa del 60 % invertido", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 200 }, tk(ex.px), T(0), deps);
  const pos = { "A-EUR": { sym: "A", px: 1, cost0: 1, cost: 1, q: 1, q0: 1, t0: T(1).toISOString() } };   // el método mete solo el 1 %
  ({ RS } = await RL.vuelta(RS, { mix: fuente(pos) }, { copia: "mix", capital: 200 }, tk(ex.px), T(1), deps));
  const v = +ex.orders[0].amountQuote; assert.ok(v >= RS.start * 0.099, `compra ${v} con cuenta de ${RS.start}`);
});

test("Real v289: stop −6 % obligatorio desde el precio de compra y sin polvo (completa hasta el mínimo y vende todo)", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 40 }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 3, cost: 3, q: 3, q0: 3, t0: T(1).toISOString() };   // el método mete poco → real compra el 10 % ≈ 5,10 € (el mínimo)
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 40 }, tk(ex.px), T(1), deps));
  assert.ok(RS.pos["A-EUR"]); const n0 = ex.orders.length;
  ex.px["A-EUR"] = 0.9;   // −10 %: el método NO vende, pero el stop real sí; vale < 5 € → compra lo justo y vende todo
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 40 }, tk(ex.px), T(2), deps));
  assert.ok(!RS.pos["A-EUR"], "vendida por el stop real"); const nuevas = ex.orders.slice(n0);
  assert.equal(nuevas[0].side, "buy", "primero completa hasta el mínimo"); assert.equal(nuevas[nuevas.length - 1].side, "sell");
  assert.ok(RS.log.some((x) => /stop −6 % desde tu precio de compra/.test(x.txt)));
});

test("Real v291: 🔐 si la respuesta de una compra se pierde, pregunta por ESA orden (no compra dos veces) y 🛡️ deja un stop de emergencia en el exchange", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 15, cost: 15, q: 15, q0: 15, t0: T(1).toISOString() }; ex.timeout = 1;
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 100 }, tk(ex.px), T(1), deps));
  assert.equal(ex.orders.filter((o) => o.side === "buy").length, 1, "una sola compra"); assert.ok(RS.pos["A-EUR"], "la compra hecha queda apuntada");
  assert.ok(RS.pos["A-EUR"].stopId && ex.stops[RS.pos["A-EUR"].stopId], "stop de emergencia puesto"); const st = ex.stops[RS.pos["A-EUR"].stopId]; assert.ok(Math.abs(+st.triggerAmount - RS.pos["A-EUR"].px * 0.9) < 1e-3);
  ex.px["A-EUR"] = 1.05; ({ RS } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix", capital: 100 }, tk(ex.px), T(2), deps));   // el método vende (con ganancia) → quita el stop y vende
  assert.ok(!RS.pos["A-EUR"]); assert.equal(Object.keys(ex.stops).length, 0, "stop quitado antes de vender");
});

test("Real v295: 🧾 si el exchange vende fuera del bot (stop de emergencia), se apunta el dinero que entró y el resultado", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 15, cost: 15, q: 15, q0: 15, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 100 }, tk(ex.px), T(1), deps));
  const q = RS.pos["A-EUR"].q, cash0 = RS.cash; ex.bal["A-EUR"] = 0; ex.eur += q * 0.9 * 0.9975;   // el exchange vende a 0,90
  ex.trades = [{ timestamp: Date.parse(T(2)), market: "A-EUR", side: "sell", amount: String(q), price: "0.9", fee: String(q * 0.9 * 0.0025), feeCurrency: "EUR" }];
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 100 }, tk(ex.px), T(3), deps));
  assert.ok(!RS.pos["A-EUR"]); assert.ok(Math.abs(RS.cash - (cash0 + q * 0.9 * 0.9975)) < 0.01, `caja ${RS.cash}`); assert.ok(RS.closed[0].pnl < 0); assert.equal(RS.start, 100, "no lo toma como un ingreso tuyo");
});
test("Real v295: 📆 estados del examen de un año (aprobada / pendiente / suspendida) y comité de Consenso", () => {
  const now = new Date(), t = now.toISOString(), F = { eq: { genomeId: "g1", prueba: false }, mix: { genomeId: "g2", prueba: false }, consenso: { genomeId: "c1" } };
  const v = RL.VEX_REAL, EL = { t, res: { eq: { v, genomeId: "g1", ok: false, suave: true, t }, mix: { v, genomeId: "gX", ok: true, t }, consenso: { v, genomeId: "c1", ok: true, t, comite: "g1,-,g2,-" } } };
  assert.equal(RL.estadoExamen(EL, "eq", F, now), "aprobada"); assert.equal(RL.estadoExamen(EL, "mix", F, now), "pendiente", "otra regla");
  assert.equal(RL.estadoExamen({ ...EL, res: { eq: { v, genomeId: "g1", ok: false, suave: false, t } } }, "eq", F, now), "suspendida");
  assert.equal(RL.estadoExamen({ ...EL, res: { eq: { v: 1, genomeId: "g1", ok: true, t } } }, "eq", F, now), "pendiente", "examen con reglas antiguas");
  assert.equal(RL.estadoExamen(EL, "consenso", F, now), "aprobada"); assert.equal(RL.estadoExamen(EL, "consenso", { ...F, mix: { genomeId: "g9", prueba: false } }, now), "pendiente", "cambió el comité");
  assert.equal(RL.estadoExamen({ ...EL, t: new Date(Date.now() - 13 * 3600e3).toISOString() }, "eq", F, now), "pendiente", "examen viejo");
});
test("Real v295: sin método aprobado no compra (pero sí vende) y el mínimo no salta el tope del 60 %", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100, noCompra: true }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 15, cost: 15, q: 15, q0: 15, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 100, noCompra: true }, tk(ex.px), T(1), deps));
  assert.equal(ex.orders.length, 0); assert.ok(!RS.pos["A-EUR"]);
});

test("Real v297: 🔒 las criptos que marcas como tuyas no se compran, no se venden y el bot deja de gestionarlas", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  const sp = { sym: "A", px: 1, cost0: 15, cost: 15, q: 15, q0: 15, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp }) }, { copia: "mix", capital: 100, conservar: ["A"] }, tk(ex.px), T(1), deps));
  assert.equal(ex.orders.filter((o) => o.side === "buy").length, 0, "no la compra");
  const sp2 = { ...sp, t0: T(2).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp2 }) }, { copia: "mix", capital: 100 }, tk(ex.px), T(2), deps)); assert.ok(RS.pos["A-EUR"]);
  const n = ex.orders.length; ex.px["A-EUR"] = 0.5;   // cae un 50 %: con «conservar» NO se vende
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp2 }) }, { copia: "mix", capital: 100, conservar: ["A"] }, tk(ex.px), T(3), deps));
  assert.equal(ex.orders.slice(n).filter((o) => o.side === "sell").length, 0, "no la vende"); assert.ok(!RS.pos["A-EUR"], "deja de gestionarla");
});

test("Real v301: 🧺 cartera base: compra BTC/ETH con tendencia (35 %), no cuenta para el 60 % de los métodos y vende al girarse", async () => {
  const ex = exchange({ "BTC-EUR": 1, "ETH-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado };
  const base = (up) => ({ t: Date.now(), m: { "BTC-EUR": { up }, "ETH-EUR": { up } } });
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100, base: base(true) }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, base: base(true) }, tk(ex.px), T(1), deps));
  assert.ok(RS.pos["BTC-EUR"] && RS.pos["BTC-EUR"].src === "base" && RS.pos["ETH-EUR"]); const inv = RS.pos["BTC-EUR"].cost + RS.pos["ETH-EUR"].cost; assert.ok(Math.abs(inv - 35) < 1, "35 %: " + inv);
  const n = ex.orders.length; ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, base: base(true) }, tk(ex.px), T(2), deps)); assert.equal(ex.orders.length, n, "no recompra cada minuto");
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, base: base(false) }, tk(ex.px), T(3), deps)); assert.ok(!RS.pos["BTC-EUR"] && !RS.pos["ETH-EUR"], "tendencia girada: vende");
});

test("Real v304: 🐢 Tortugas: compra al romper el máximo de 20 días, respeta su stop y sale por señal solo con ganancia neta", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado }, sen = (o) => ({ t: Date.now(), sen: { "A-EUR": { t: 1, c: 1, N: 0.03, hi20: 0.98, lo10: 0.9, entra: true, sale: false, ...o } } });
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, tort: sen({}) }, tk(ex.px), T(1), deps));
  const p = RS.pos["A-EUR"]; assert.ok(p && p.src === "tortuga"); assert.ok(Math.abs(p.stop / p.px - 0.94) < 0.005, "stop 2N = −6 %"); assert.ok(p.cost >= 9.9 && p.cost <= 25.1, "tamaño 10-25 %: " + p.cost);
  const n = ex.orders.length; ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, tort: sen({ entra: false, sale: true }) }, tk(ex.px), T(2), deps));
  assert.ok(RS.pos["A-EUR"], "señal de salida sin cubrir comisiones: espera"); assert.equal(ex.orders.length, n);
  ex.px["A-EUR"] = 1.05; ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, tort: sen({ entra: false, sale: true }) }, tk(ex.px), T(3), deps));
  assert.ok(!RS.pos["A-EUR"], "con ganancia neta, sale");
});

test("Real v306: 🐋 copia a los profesionales: compra el 10 % cuando están comprando fuerte y sale cuando dejan de estarlo (con ganancia neta)", async () => {
  const ex = exchange({ "A-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado }, W = (o) => ({ t: Date.now(), m: { "A-EUR": { s: 0.8, nl: 6, ns: 1, d: 0.1, entra: true, sale: false, ...o } } });
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix", capital: 100 }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, ballenas: W({}) }, tk(ex.px), T(1), deps));
  assert.ok(RS.pos["A-EUR"] && RS.pos["A-EUR"].src === "ballena" && Math.abs(RS.pos["A-EUR"].cost - 10) < 0.2);
  ex.px["A-EUR"] = 1.05; ({ RS } = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix", capital: 100, ballenas: W({ entra: false, sale: true, s: 0.1 }) }, tk(ex.px), T(2), deps));
  assert.ok(!RS.pos["A-EUR"]);
});

// ---------- v460 · vender todo con fallos y renovar el stop sin dejar la posición desprotegida ----------
test("Real v460: /parar con una venta que falla: vende las demás, avisa de lo que queda y lo reintenta en la vuelta siguiente", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  const sp = { sym: "A", px: 1, cost0: 30, cost: 30, q: 1, q0: 1, t0: T(1).toISOString() }, sb = { ...sp, sym: "B" };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix" }, tk(ex.px), T(1), deps)); assert.ok(RS.pos["A-EUR"] && RS.pos["B-EUR"]);
  ex.falloVenta = new Set(["A-EUR"]);
  let o = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix", parado: true }, tk(ex.px), T(2), deps);
  assert.deepEqual(Object.keys(o.RS.pos), ["A-EUR"], "B vendida aunque A fallase"); assert.equal(o.RS.pendienteVenta, 1); assert.ok(o.msgs.some((x) => /quedan 1 sin vender/.test(x)));
  ex.falloVenta = null; o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix", parado: true }, tk(ex.px), T(3), deps);
  assert.equal(Object.keys(o.RS.pos).length, 0, "en la vuelta siguiente vende lo que quedaba"); assert.ok(!o.RS.pendienteVenta);
});

async function conStop(falloStop, sinId = 0) {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps)); assert.ok(RS.pos["AAA-EUR"].stopId, "stop puesto al comprar");
  ex.falloStop = falloStop; ex.stopSinId = sinId; ex.px["AAA-EUR"] = 2.1;   // el método vende la mitad → hay que RENOVAR el stop por la cantidad que queda
  const o = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": { ...sp, q: 5, cob: 10.5 } }) }, { copia: "mix" }, tk(ex.px), T(3), deps);
  return { ex, o };
}
test("Real v460: si el stop nuevo falla al renovarlo, vuelve a poner el anterior (la posición nunca se queda sin stop)", async () => {
  const { ex, o } = await conStop(2); const p = o.RS.pos["AAA-EUR"];
  assert.ok(p, "la posición sigue"); assert.equal(p.stopEst, "ok"); assert.ok(ex.stops[p.stopId], "hay un stop activo en el exchange");
});
test("Real v460: si fallan el stop nuevo Y el anterior, vende la posición (no la deja sin protección)", async () => {
  const { o } = await conStop(3); assert.ok(!o.RS.pos["AAA-EUR"], "vendida");
});

test("Real v461: si al renovar el stop el exchange responde SIN identificador (ni error), se trata como fallo: repone el anterior", async () => {
  const { ex, o } = await conStop(0, 1); const p = o.RS.pos["AAA-EUR"]; assert.ok(p); assert.equal(p.stopEst, "ok"); assert.ok(ex.stops[p.stopId]);
});
test("Real v461: sin identificador tanto el nuevo como el anterior: vende la posición", async () => {
  const { o } = await conStop(0, 5); assert.ok(!o.RS.pos["AAA-EUR"]);
});
test("Real v461: una orden de resultado desconocido bloquea ESE activo (no se manda otra) hasta el cuadre; los demás siguen", async () => {
  const DUD = {}; let n = 0; const X = RL.conDudosas({ comprar: async (m) => { n++; if (m === "A-EUR") throw new Error("OKX: orden sin estado final (se cuadrará con el saldo)"); return { q: 1 }; } }, DUD, T(0));
  await assert.rejects(() => X.comprar("A-EUR", 10)); assert.ok(DUD["A-EUR"], "queda apuntada");
  await assert.rejects(() => X.comprar("A-EUR", 10), /sin resultado confirmado/); assert.equal(n, 1, "la segunda NO llega al exchange");
  assert.deepEqual(await X.comprar("B-EUR", 10), { q: 1 }); assert.equal(n, 2);
  const DUD2 = {}; const Y = RL.conDudosas({ comprar: async () => { throw new Error("Bitvavo 400 · código 216 · saldo insuficiente"); } }, DUD2, T(0)); await assert.rejects(() => Y.comprar("C-EUR", 10)); assert.ok(!DUD2["C-EUR"], "un rechazo claro no bloquea");
});
test("Real v461: liquidar los métodos antiguos con una venta que falla: vende las demás y repite en la vuelta siguiente", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  const sp = { sym: "A", px: 1, cost0: 30, cost: 30, q: 1, q0: 1, t0: T(1).toISOString() }, sb = { ...sp, sym: "B" };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  ex.falloVenta = new Set(["A-EUR"]);
  let o = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix", liquidar: "x1" }, tk(ex.px), T(2), deps);
  assert.deepEqual(Object.keys(o.RS.pos), ["A-EUR"], "B vendida aunque A fallase");
  ex.falloVenta = null; o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix", liquidar: "x1" }, tk(ex.px), T(3), deps);
  assert.equal(Object.keys(o.RS.pos).length, 0, "en la vuelta siguiente vende lo que quedaba");
});

// ---------- v462 ----------
test("Real v462: liquidar cuando la venta termina SIN error pero SIN vender (no pudo quitar el stop): no la cuenta como vendida y lo reintenta", async () => {
  const ex = exchange({ "A-EUR": 1, "B-EUR": 1 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  const sp = { sym: "A", px: 1, cost0: 30, cost: 30, q: 1, q0: 1, t0: T(1).toISOString() }, sb = { ...sp, sym: "B" };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix" }, tk(ex.px), T(1), deps)); assert.ok(RS.pos["A-EUR"].stopId && RS.pos["B-EUR"].stopId);
  ex.falloQuita = true;
  let o = await RL.vuelta(RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix", liquidar: "x2" }, tk(ex.px), T(2), deps);
  assert.equal(Object.keys(o.RS.pos).length, 2, "no se ha vendido nada"); assert.ok(!o.RS.liqAt, "la liquidación queda pendiente"); assert.ok(o.msgs.some((x) => /vendidas 0/.test(x)), "no dice que las ha vendido");
  ex.falloQuita = false; o = await RL.vuelta(o.RS, { mix: fuente({ "A-EUR": sp, "B-EUR": sb }) }, { copia: "mix", liquidar: "x2" }, tk(ex.px), T(3), deps);
  assert.equal(Object.keys(o.RS.pos).length, 0, "en la vuelta siguiente sí");
});
test("Real v462: una compra de resultado desconocido bloquea esa cripto; el bloqueo NO caduca por tiempo: solo se levanta tras un cuadre con el saldo real", { timeout: 120000 }, async () => {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };
  ex.dudosaCompra = true; ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.ok(RS.dudosas && RS.dudosas["AAA-EUR"], "queda bloqueada"); const n0 = ex.intentos;
  ex.falloBalance = true; const lejos = new Date(T(1).getTime() + 5 * 3600e3);   // 5 h después, sin poder leer el saldo
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": { ...sp, t0: lejos.toISOString() } }) }, { copia: "mix" }, tk(ex.px), lejos, deps));
  assert.ok(RS.dudosas["AAA-EUR"], "sigue bloqueada: el tiempo no basta"); assert.equal(ex.intentos, n0, "no se ha mandado otra orden");
  ex.falloBalance = false; ex.dudosaCompra = false; const luego = new Date(lejos.getTime() + 60e3);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix" }, tk(ex.px), luego, deps));
  assert.ok(!RS.dudosas["AAA-EUR"], "cuadrada con el saldo real: se levanta");
});

// ---------- v463 ----------
test("Real v463: una orden dudosa que en el exchange sigue VIVA no se desbloquea aunque el saldo se lea bien", { timeout: 120000 }, async () => {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };
  ex.dudosaCompra = true; ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps));
  assert.ok(RS.dudosas["AAA-EUR"] && RS.dudosas["AAA-EUR"].id, "guarda el identificador de ESA orden");
  ex.dudosaCompra = false; ex.ordenViva = true; const luego = new Date(T(1).getTime() + 3 * 3600e3);
  ({ RS } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix" }, tk(ex.px), luego, deps)); assert.ok(RS.dudosas["AAA-EUR"], "sigue bloqueada: la orden no ha terminado");
  ex.ordenViva = false; ex.abiertas = [{ orderType: "market", market: "AAA-EUR" }]; ({ RS } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix" }, tk(ex.px), new Date(luego.getTime() + 60e3), deps));
  assert.ok(RS.dudosas["AAA-EUR"], "sigue bloqueada: hay una orden a mercado abierta en ese par");
  ex.abiertas = []; ({ RS } = await RL.vuelta(RS, { mix: fuente({}) }, { copia: "mix" }, tk(ex.px), new Date(luego.getTime() + 120e3), deps));
  assert.ok(!RS.dudosas["AAA-EUR"], "comprobada en el exchange y cuadrada: se levanta");
});
test("Real v463: si no se puede comprobar que el stop sigue activo, NO se da por bueno (queda «sin comprobar» y se reintenta; aviso a la 3.ª)", async () => {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps)); assert.equal(RS.pos["AAA-EUR"].stopEst, "ok");
  ex.falloEstado = true; let msgs = [];
  for (let i = 0; i < 3; i++) { const o = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), new Date(T(1).getTime() + (40 + i) * 60e3), deps); RS = o.RS; msgs = msgs.concat(o.msgs); assert.equal(RS.pos["AAA-EUR"].stopEst, "sin comprobar"); }
  assert.ok(msgs.some((x) => /no consigo comprobar que el stop/.test(x)));
  ex.falloEstado = false; const o = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), new Date(T(1).getTime() + 50 * 60e3), deps); assert.equal(o.RS.pos["AAA-EUR"].stopEst, "ok", "en cuanto se puede comprobar, vuelve a estar confirmado");
});

// ---------- v475 · H-01 y H-04 ----------
async function conStopYVenta(o) {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps)); assert.ok(RS.pos["AAA-EUR"].stopId, "stop puesto al comprar");
  ex.px["AAA-EUR"] = 2.2; /* sube: venderla da ganancia (si no, el bot espera a cubrir comisiones y no vende) */ o(ex); let r = null; try { r = await RL.vuelta(RS, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(3), deps); } catch (e) { r = { err: e, RS }; }   // el método ya no la tiene → hay que venderla
  return { ex, o: r };
}
test("v475 · H-01: si la venta FALLA después de quitar el stop, el stop se vuelve a poner en ese mismo momento", async () => {
  const { ex, o } = await conStopYVenta((ex) => { ex.falloVenta = new Set(["AAA-EUR"]); }); const p = o.RS.pos["AAA-EUR"];
  assert.ok(o.RS.log.some((x) => /la venta falló; he vuelto a poner su stop/.test(x.txt)), "de verdad intentó venderla y falló"); assert.ok(p, "la posición sigue (no se pudo vender)"); assert.equal(p.stopEst, "ok"); assert.ok(p.stopId && ex.stops[p.stopId], "hay un stop ACTIVO en el exchange");
});
test("v475 · H-01: si falla la venta y tampoco se puede volver a poner el stop: aviso urgente, sin bucles", async () => {
  const { o } = await conStopYVenta((ex) => { ex.falloVenta = new Set(["AAA-EUR"]); ex.falloStop = 10; }); const p = o.RS.pos["AAA-EUR"];
  assert.ok(p); assert.equal(p.stopEst, "error"); assert.ok((o.msgs || []).some((x) => /SIN stop/.test(x)), "avisa");
});
test("v475 · H-04: si al vender solo queda en la cuenta un resto por debajo del mínimo, NO se borra: queda vigilado como polvo", async () => {
  const { ex, o } = await conStopYVenta((ex) => { ex.saldoReal = 1; ex.bal["AAA-EUR"] = 1; }); const p = o.RS.pos["AAA-EUR"];   // 1 unidad × 2 € = 2 €, menos que el mínimo de 5 €
  assert.ok(p, "sigue registrada"); assert.ok(p.polvo, "como polvo"); assert.ok(Math.abs(p.q - 1) < 1e-9, "con lo que hay de verdad");
  assert.notEqual(p.stopEst, "ok", "v476 · su stop se quitó: NUNCA puede decir «ok»"); assert.equal(p.stopEst, "resto"); assert.ok(!p.stopId, "sin stop apuntado");
});

// ---------- v478 · comprobación COMPLETA del stop en el exchange (lado y precio de disparo) ----------
test("v478 · Real: un stop activo con el PRECIO o el LADO equivocados se vuelve a poner bien (quitando el malo); sin poder ver esos datos, «sin comprobar»", async () => {
  const ex = exchange({ "AAA-EUR": 2 }), deps = { api: ex.api, mercado: ex.mercado, rapido: 1 };
  let { RS } = await RL.vuelta(null, { mix: fuente() }, { copia: "mix" }, tk(ex.px), T(0), deps);
  const sp = { sym: "AAA", q: 10, q0: 10, px: 2.002, cost: 60, cost0: 60, t0: T(1).toISOString() };
  ({ RS } = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), T(1), deps)); const id0 = RS.pos["AAA-EUR"].stopId, px0 = RS.pos["AAA-EUR"].stopPx; assert.equal(RS.pos["AAA-EUR"].stopEst, "ok");
  ex.stops[id0].triggerAmount = String(px0 * 0.7);   // alguien lo ha movido muy abajo
  let o = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), new Date(T(1).getTime() + 40 * 60e3), deps); RS = o.RS;
  const id1 = RS.pos["AAA-EUR"].stopId; assert.equal(Object.keys(ex.stops).length, 1, "el malo se quita (solo queda uno)"); assert.ok(Math.abs(+ex.stops[id1].triggerAmount / px0 - 1) < 0.01, "al precio correcto"); assert.equal(RS.pos["AAA-EUR"].stopEst, "ok");
  assert.ok(o.msgs.some((x) => /no tenía el precio o el lado correctos/.test(x)));
  ex.sinDatosStop = true; o = await RL.vuelta(RS, { mix: fuente({ "AAA-EUR": sp }) }, { copia: "mix" }, tk(ex.px), new Date(T(1).getTime() + 80 * 60e3), deps);
  assert.equal(o.RS.pos["AAA-EUR"].stopEst, "sin comprobar", "activo pero sin ver lado/precio: no se da por bueno");
});

test("v479 · Tortugas: en automático con dinero real NUNCA se elige el perfil «Máximo», aunque sea el n.º 1 del podio; «Bajo» y «Medio», sí", () => {
  const TE0 = { perfiles: { alto: { ok: true, ret: 3 }, medio: { ok: true, ret: 1 }, bajo: { ok: true, ret: 0.5 } } };
  const EL = { podio: [{ ex: "bitvavo", rk: "alto" }, { ex: "bitvavo", rk: "bajo" }, { ex: "okx", rk: "alto" }] };
  assert.equal(RL.riesgoAuto(EL, "bitvavo", TE0), "bajo", "el n.º 1 es «Máximo»: se salta y va al siguiente permitido");
  assert.equal(RL.riesgoAuto(EL, "okx", TE0), "medio", "en OKX solo hay «Máximo» en el podio: el mejor permitido que aprueba");
  assert.equal(RL.riesgoAuto({ podio: [] }, "okx", { perfiles: { alto: { ok: true, ret: 9 } } }), "medio", "si solo aprueba «Máximo», no se elige");
  assert.equal(RL.riesgoAuto({ podio: [{ ex: "okx", rk: "medio" }] }, "okx", TE0), "medio");
});
