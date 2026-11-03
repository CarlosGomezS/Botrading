// v158 · pruebas del simulador de memes (solo dinero ficticio)
import test from "node:test";
import assert from "node:assert/strict";
import { freshState, paso, filtro, nota, bestPairs, R } from "../runner/meme.mjs";

const T0 = Date.parse("2026-11-03T10:00:00Z");
const par = (a, o = {}) => ({ chainId: "solana", url: "https://dexscreener.com/solana/" + a, baseToken: { address: a, symbol: "$" + a.toUpperCase(), name: a },
  priceUsd: String(o.px ?? 1), pairCreatedAt: T0 - (o.ageMin ?? 600) * 60000, marketCap: o.mc ?? 2e6, liquidity: { usd: o.liq ?? 200e3 },
  volume: { h1: o.v1 ?? 400e3 }, priceChange: { h1: o.ch1 ?? 30, m5: o.ch5 ?? 6 }, txns: { h1: { buys: o.b ?? 600, sells: o.s ?? 300 } } });

test("filtro: descarta lo que no cumple y deja pasar lo bueno", () => {
  assert.equal(filtro(par("ok"), T0), null);
  assert.match(filtro(par("x", { ageMin: 5 }), T0), /edad/);
  assert.match(filtro(par("x", { liq: 10e3 }), T0), /liquidez/);
  assert.match(filtro(par("x", { ch1: 150 }), T0), /80 %/);
  assert.match(filtro(par("x", { b: 100, s: 300 }), T0), /ventas/);
  assert.ok(nota(par("ok")) >= R.minScore, "la buena tiene nota alta");
});

test("bestPairs: se queda con el par de más liquidez y solo de Solana", () => {
  const m = bestPairs([par("a", { liq: 50e3 }), par("a", { liq: 90e3 }), { ...par("b"), chainId: "eth" }]);
  assert.deepEqual(Object.keys(m), ["a"]); assert.equal(m.a.liquidity.usd, 90e3);
});

test("entra con el 8 %, paga costes, y sale por stop, por stop móvil y por rug", () => {
  const S = freshState(), never = () => 1;
  paso(S, { a: par("a"), b: par("b"), c: par("c") }, new Date(T0), never);
  assert.equal(Object.keys(S.pos).length, 3); assert.equal(S.st.trades, 3);
  assert.ok(Math.abs(S.pos.a.cost - 40) < 1e-9, "8 % de 500"); assert.ok(S.st.fees > 0);
  const eq0 = S.lastEq; assert.ok(eq0 < 500, "los costes se notan nada más entrar");
  // a cae un 10 % → stop; b sube un 30 % (activa el móvil); c desaparece (rug)
  paso(S, { a: par("a", { px: 0.9 }), b: par("b", { px: 1.3 }) }, new Date(T0 + 3e5), never);
  assert.ok(!S.pos.a && !S.pos.c && S.pos.b && S.pos.b.trailing);
  assert.equal(S.st.rugs, 1); assert.equal(S.closed.find((x) => x.a === "c").got, 0, "rug: se pierde todo");
  paso(S, { b: par("b", { px: 1.05 }) }, new Date(T0 + 6e5), never);   // cae >15 % desde 1,3
  assert.ok(!S.pos.b); assert.match(S.closed[0].why, /móvil/); assert.ok(S.closed[0].pnl < 0.3 * 40, "gana menos que el 30 % por los costes");
  assert.equal(S.st.wins + S.st.losses, 3);
  const sum = S.cash; assert.ok(Math.abs(sum - S.lastEq) < 0.01, "sin nada abierto, saldo = efectivo");
});

test("órdenes fallidas: cuentan aparte y cuestan la propina", () => {
  const S = freshState(); paso(S, { a: par("a") }, new Date(T0), () => 0);
  assert.equal(S.st.failed, 1); assert.equal(S.st.trades, 0); assert.ok(S.cash < 500);
});

test("una moneda que aún no cumple se vuelve a mirar más tarde (y cuenta una vez)", () => {
  const S = freshState(); paso(S, { a: par("a", { ageMin: 10 }) }, new Date(T0), () => 1);
  assert.equal(S.st.killed, 1); assert.equal(Object.keys(S.pos).length, 0);
  paso(S, { a: { ...par("a"), pairCreatedAt: T0 - 600 * 60000 } }, new Date(T0 + 3e5), () => 1);
  assert.equal(S.st.seen, 1); assert.equal(Object.keys(S.pos).length, 1);
});
