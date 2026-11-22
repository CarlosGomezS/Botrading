// FALLO: una respuesta vacía (HTTP 200 sin cuerpo) del historial de ingresos se toma como «has retirado todo lo ingresado».
// El bot pone su capital a 0 y VENDE TODO; al día siguiente, con la respuesta buena, «recupera» como ingreso TODO lo que
// tienes ingresado en Trading 212 y pasa a invertir también TU dinero (muy por encima del límite que pusiste).
import test from "node:test";
import assert from "node:assert/strict";
import { world } from "./r6/t212-mundo.mjs";

test("R6 · Trading 212 · historial de ingresos vacío (200 sin cuerpo) no debe vaciar el bot ni darle después todo tu dinero", { timeout: 900000 }, async () => {
  const W = await world();
  try {
    W.K.txs.push({ ref: "d1", type: "DEPOSIT", amount: 1000, at: "2026-10-20T08:00:00Z" });
    const d1 = await W.step("normal", "2026-10-22T08:20:00Z");
    assert.equal(d1.code, 0, d1.so);
    assert.equal(d1.R.ledger.cap, 100, "día 1: el bot trabaja con 100 €");
    assert.equal(Object.keys(d1.R.ledger.lots).length, 3);

    W.override["/equity/history/transactions"] = { n: 1, status: 200, body: "" };
    const n0 = W.posts().length;
    const d2 = await W.step("normal", "2026-10-23T08:20:00Z");
    const ventas = W.posts().slice(n0).filter((c) => JSON.parse(c.body).quantity < 0).length;
    console.log("día 2 → capital del bot:", d2.R.ledger.cap, "· ventas enviadas:", ventas, "· participaciones del bot:", Object.keys(d2.R.ledger.lots).length);

    const d3 = await W.step("normal", "2026-10-26T08:20:00Z");
    const inv3 = Object.values(d3.R.ledger.lots).reduce((s, l) => s + l.cost, 0);
    console.log("día 3 → capital del bot:", d3.R.ledger.cap, "· límite:", d3.R.ledger.limite, "· invertido por el bot:", inv3.toFixed(2));

    assert.equal(ventas, 0, "una respuesta vacía NO debe provocar ventas");
    assert.ok(d3.R.ledger.cap <= 100.5, `el bot no debe pasar a trabajar con tu dinero: capital ${d3.R.ledger.cap} (límite puesto: 100)`);
  } finally { await W.close(); }
});
