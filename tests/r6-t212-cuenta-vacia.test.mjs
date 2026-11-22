// FALLO: un /equity/account/summary vacío (200 sin cuerpo) se toma como «efectivo libre = 0»: el «cuadre del efectivo»
// da por retirado TODO el efectivo del bot (capital rebajado para siempre, y retPend inflado que luego tapa una retirada real).
import test from "node:test";
import assert from "node:assert/strict";
import { world } from "./r6/t212-mundo.mjs";

test("R6 · Trading 212 · resumen de cuenta vacío no debe dar por retirado el efectivo del bot", { timeout: 900000 }, async () => {
  const W = await world();
  try {
    W.K.txs.push({ ref: "d1", type: "DEPOSIT", amount: 120, at: "2026-10-20T08:00:00Z" });
    W.setCfg({ limite: 100, modo: "pausa" });          // en pausa: no compra, el bot conserva sus 100 € en efectivo
    const d1 = await W.step("normal", "2026-10-22T08:20:00Z");
    assert.equal(d1.code, 0, d1.so); const cash1 = d1.R.ledger.cash, cap1 = d1.R.ledger.cap;
    W.override["/equity/account/summary"] = { n: 1, status: 200, body: "" };
    const d2 = await W.step("foto", "2026-10-22T16:50:00Z");
    console.log("antes → efectivo del bot:", cash1, "capital:", cap1, "· después → efectivo:", d2.R.ledger.cash, "capital:", d2.R.ledger.cap, "retPend:", d2.R.ledger.retPend);
    assert.equal(d2.R.ledger.cap, cap1, "el capital del bot no debe bajar por una respuesta vacía");
  } finally { await W.close(); }
});
