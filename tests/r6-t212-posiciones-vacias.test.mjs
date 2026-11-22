// FALLO: una respuesta vacía (200 sin cuerpo) de /equity/positions se toma como «ya no hay posiciones»:
// syncLots borra TODAS las participaciones del bot (pasan a ser «tuyas» para siempre) y la cuenta del bot queda corrompida.
import test from "node:test";
import assert from "node:assert/strict";
import { world } from "./r6/t212-mundo.mjs";

test("R6 · Trading 212 · posiciones vacías por un fallo puntual no deben borrar las participaciones del bot", { timeout: 900000 }, async () => {
  const W = await world();
  try {
    W.K.txs.push({ ref: "d1", type: "DEPOSIT", amount: 120, at: "2026-10-20T08:00:00Z" });
    const d1 = await W.step("normal", "2026-10-22T08:20:00Z");
    assert.equal(d1.code, 0, d1.so); assert.equal(Object.keys(d1.R.ledger.lots).length, 3);
    // día 2: positions responde 200 sin cuerpo una vez
    W.override["/equity/positions"] = { n: 1, status: 200, body: "" };
    const d2 = await W.step("normal", "2026-10-23T08:20:00Z");
    console.log("día 2 → participaciones del bot:", Object.keys(d2.R.ledger.lots).length, "· pausa:", JSON.stringify(d2.R.paused));
    // día 3: todo normal
    const d3 = await W.step("normal", "2026-10-26T08:20:00Z");
    const enCuenta = Object.keys(W.A.pos).length;
    console.log("día 3 → participaciones del bot:", Object.keys(d3.R.ledger.lots).length, "· posiciones reales en la cuenta:", enCuenta, "· pausa:", JSON.stringify(d3.R.paused));
    assert.equal(Object.keys(d3.R.ledger.lots).length, 3, "las participaciones del bot deben seguir siendo suyas");
  } finally { await W.close(); }
});
