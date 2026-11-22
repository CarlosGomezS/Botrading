// FALLO 3 · en la revisión de stops (cada 30 min, DENTRO del cuadre) puede venderse una posición (si no se puede reponer su stop).
// Ese dinero entra en RS.cash, pero el cuadre compara con la foto del saldo (B.EUR) leída ANTES de la venta → lo toma por «dinero que has sacado tú»
// y lo quita de la caja del bot (y baja la base del freno).
import test from "node:test";
import assert from "node:assert/strict";
import * as RL from "../runner/bitvavo-real.mjs";
import { fakeEx, tk, T } from "./r6/falso.mjs";

test("R6 · una venta hecha en la revisión de stops no debe contarse como retirada tuya", async () => {
  delete process.env.SOLO_TORT;
  const { S, X } = fakeEx({ "A-EUR": 1 }, { eur: 100 });
  const fuentes = { mix: { pos: {}, lastEq: 100 } };
  const sen = { t: Date.now(), P: { maxPos: 4, riesgo: "medio" }, sen: { "A-EUR": { t: 1, c: 1, N: 0.03, hi20: 0.98, lo10: 0.9, entra: true, sale: false } } };
  let { RS } = await RL.vuelta(null, fuentes, { copia: "mix", capital: 100 }, tk(S.px), T(0), { ex: X });
  ({ RS } = await RL.vuelta(RS, fuentes, { copia: "mix", capital: 100, tort: sen }, tk(S.px), T(1), { ex: X }));
  assert.ok(RS.pos["A-EUR"] && RS.pos["A-EUR"].stopId, "comprada y con stop");
  // el stop desaparece en el exchange y ya no se puede volver a poner → el bot la vende (correcto) en la revisión
  S.stops = {}; X.ponStop = async () => { throw Object.assign(new Error("Bitvavo 400 · código 217"), { status: 400, code: 217 }); };
  const start0 = RS.start;
  ({ RS } = await RL.vuelta(RS, fuentes, { copia: "mix", capital: 100, tort: { ...sen, sen: {} } }, tk(S.px), T(45), { ex: X }));
  console.log("vendida:", !RS.pos["A-EUR"], "· EUR reales:", S.eur.toFixed(2), "· caja del bot:", RS.cash.toFixed(2), "· start:", start0, "→", RS.start, "· log:", RS.log.filter((l) => /sacado/.test(l.txt)).map((l) => l.txt).join(" | "));
  assert.ok(!RS.pos["A-EUR"], "se ha vendido");
  assert.ok(Math.abs(RS.cash - S.eur) < 0.05, `la caja del bot (${RS.cash.toFixed(2)}) debería ser lo que hay de verdad (${S.eur.toFixed(2)})`);
  assert.ok(RS.start > start0 - 0.5, "la base del freno no debe bajar por una venta del propio bot");
});
