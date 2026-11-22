// v1.0 · R6-3 · revisión independiente: si el proceso muere DESPUÉS de una compra y ANTES de guardar, la vuelta siguiente
// no vuelve a comprar ni deja la primera compra como «ajena» (Bitvavo/OKX guardan ANTES de comprar)
import test from "node:test";
import assert from "node:assert/strict";
import * as RL from "../runner/bitvavo-real.mjs";
import { fakeEx, tk, T, clon } from "./r6/falso.mjs";

test("R6-3 · compra hecha + estado final sin guardar → no vuelve a comprar y adopta la compra como del bot", async () => {
  delete process.env.SOLO_TORT;
  const { S, X } = fakeEx({ "A-EUR": 1 }, { eur: 100 });
  const fuentes = { mix: { pos: {}, lastEq: 100 } };
  const sen = { t: Date.now(), P: { maxPos: 4, riesgo: "medio" }, sen: { "A-EUR": { t: 1, c: 1, N: 0.03, hi20: 0.98, lo10: 0.9, entra: true, sale: false } } };
  let guardado = clon((await RL.vuelta(null, fuentes, { copia: "mix", capital: 100 }, tk(S.px), T(0), { ex: X })).RS);
  let n = 0; const guardaAntes = async (rs) => { n++; guardado = clon(rs); };   // lo único que llega a GitHub
  await RL.vuelta(clon(guardado), fuentes, { copia: "mix", capital: 100, tort: sen }, tk(S.px), T(1), { ex: X, guardaAntes });   // compra… y muere sin el guardado final
  assert.equal(S.compras.length, 1, "la vuelta 1 compra A"); assert.equal(n, 1, "guardó ANTES de comprar");
  for (let i = 2; i < 6; i++) await RL.vuelta(clon(guardado), fuentes, { copia: "mix", capital: 100, tort: sen }, tk(S.px), T(i), { ex: X, guardaAntes }).then((o) => { guardado = clon(o.RS); });
  assert.equal(S.compras.length, 1, "NO vuelve a comprar A");
  assert.ok(!(guardado.ajenas && guardado.ajenas.A), "la compra del bot no queda como «ajena»");
  assert.ok(guardado.pos["A-EUR"] && guardado.pos["A-EUR"].q > 0, "la compra queda como posición del bot");
});

test("R6-3 · si no se puede guardar antes, la compra NO se manda", async () => {
  delete process.env.SOLO_TORT;
  const { S, X } = fakeEx({ "A-EUR": 1 }, { eur: 100 });
  const fuentes = { mix: { pos: {}, lastEq: 100 } };
  const sen = { t: Date.now(), P: { maxPos: 4, riesgo: "medio" }, sen: { "A-EUR": { t: 1, c: 1, N: 0.03, hi20: 0.98, lo10: 0.9, entra: true, sale: false } } };
  const g0 = clon((await RL.vuelta(null, fuentes, { copia: "mix", capital: 100 }, tk(S.px), T(0), { ex: X })).RS);
  const o = await RL.vuelta(clon(g0), fuentes, { copia: "mix", capital: 100, tort: sen }, tk(S.px), T(1), { ex: X, guardaAntes: async () => { throw new Error("GitHub caído"); } });
  assert.equal(S.compras.length, 0, "no se manda la compra");
  assert.ok(!(o.RS.dudosas && o.RS.dudosas["A-EUR"]), "y no queda bloqueada");
});
