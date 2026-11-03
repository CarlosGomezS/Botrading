import test from "node:test";
import assert from "node:assert/strict";
import { simbolos, fresh, comprar, vigilar, aprendido } from "../runner/noticias.mjs";
test("noticias: saca el símbolo del anuncio, compra en ficticio, vende por tiempo o stop y aprende qué fuente funciona", () => {
  assert.deepEqual(simbolos("Binance Will List Foo Protocol (FOO) and Bar (BAR2)"), ["FOO", "BAR2"]); assert.deepEqual(simbolos("블러(BLUR) 거래지원 종료 (USDT)"), ["BLUR"]);
  const S = fresh(new Date("2026-11-04T10:00:00Z")), t0 = new Date("2026-11-04T10:00:00Z");
  assert.ok(comprar(S, "FOO-EUR", "FOO", "binance", 1, t0, 15)); assert.equal(S.pos["FOO-EUR"].cost, 20);
  vigilar(S, "FOO-EUR", 1.05, new Date(+t0 + 5 * 60000)); assert.ok(S.pos["FOO-EUR"], "aún dentro");
  vigilar(S, "FOO-EUR", 1.06, new Date(+t0 + 16 * 60000)); assert.equal(S.closed[0].why, "tiempo cumplido"); assert.ok(S.closed[0].pnl > 0);
  comprar(S, "BAR-EUR", "BAR", "okx", 1, t0, 60); vigilar(S, "BAR-EUR", 0.9, new Date(+t0 + 60000)); assert.match(S.closed[0].why, /stop/);
  for (let i = 0; i < 5; i++) S.ev.push({ f: "upbit", r: { 1: 0.08, 5: 0.12, 15: 0.03, 30: -0.02, 60: -0.05 } }, { f: "kucoin", r: { 1: -0.01, 5: -0.03, 15: -0.04, 30: -0.06, 60: -0.08 } });
  const A = aprendido(S); assert.equal(A.upbit.mejorMin, 5); assert.equal(A.upbit.opera, true); assert.equal(A.kucoin.opera, false, "deja de operar lo que pierde");
});
