// v159 · pruebas del terminal de memes (solo dinero ficticio)
import test from "node:test";
import assert from "node:assert/strict";
import { freshLab, pasoVar, evolucionar, fitness, mutar, aleatorio, gkey, POP } from "../runner/meme-lab.mjs";
import { freshState, paso, pasoIdeal, rapido, reglas, rcInfo, gtInfo, analista, explorador, bestPairs, R } from "../runner/meme.mjs";

const T0 = Date.parse("2026-11-03T10:00:00Z");
const par = (a, o = {}) => ({ chainId: "solana", url: "https://dexscreener.com/solana/" + a, pairAddress: "pool_" + a, baseToken: { address: a, symbol: "$" + a.toUpperCase(), name: a },
  priceUsd: String(o.px ?? 1), pairCreatedAt: T0 - (o.ageMin ?? 600) * 60000, marketCap: o.mc ?? 2e6, liquidity: { usd: o.liq ?? 200e3 },
  volume: { h1: o.v1 ?? 400e3 }, priceChange: { h1: o.ch1 ?? 30, m5: o.ch5 ?? 6 }, txns: { h1: { buys: o.b ?? 600, sells: o.s ?? 300 } } });
// informe de RugCheck con la forma real (camelCase)
const rcRep = (o = {}) => ({ mintAuthority: o.mint ?? null, freezeAuthority: null, token: { supply: 1e9, mintAuthority: o.mint ?? null, freezeAuthority: null }, creatorBalance: (o.dev ?? 1) * 1e7,
  topHolders: [{ address: "pool", owner: "ammOwner", pct: 40 }, ...Array.from({ length: 12 }, (_, i) => ({ address: "h" + i, owner: "o" + i, pct: o.hp ?? 1.5 }))],
  markets: [{ pubkey: "pool", liquidityAAccount: { owner: "ammOwner" }, lp: { lpLockedPct: o.lp ?? 100, quoteUSD: 1e5, baseUSD: 1e5 } }], knownAccounts: { ammOwner: { type: "AMM" } },
  risks: o.risks || [], insiderNetworks: [{ currentHolding: (o.bundle ?? 2) * 1e7 }], totalHolders: o.holders ?? 3000, rugged: !!o.rugged, graphInsidersDetected: 3 });
const okInfo = rcInfo(rcRep());
const gtTr = (n, from = "w") => Array.from({ length: n }, (_, i) => ({ attributes: { kind: i % 3 ? "buy" : "sell", tx_from_address: from + i, block_timestamp: new Date(T0 - 60000).toISOString() } }));

test("RugCheck: autoridades, LP, top 10 sin la piscina, creador, bloque y rug", () => {
  assert.equal(okInfo.mintOk, true); assert.equal(okInfo.lp, 100); assert.ok(Math.abs(okInfo.top10 - 15) < 1e-9, "excluye la piscina (40 %)");
  assert.ok(Math.abs(okInfo.dev - 1) < 1e-9); assert.ok(Math.abs(okInfo.bundle - 2) < 1e-9);
  assert.equal(rcInfo(rcRep({ mint: "X" })).mintOk, false);
  assert.equal(rcInfo(rcRep({ risks: [{ name: "Creator history of rugged tokens" }] })).devRug, true);
});

test("las 8 reglas, cada una por separado", () => {
  const all = (p, i) => Object.values(reglas(p, i)).every(Boolean);
  assert.ok(all(par("ok"), okInfo));
  const f = (p, i) => Object.entries(reglas(p, i)).filter(([, v]) => v === false).map(([k]) => k);
  assert.deepEqual(f(par("x"), rcInfo(rcRep({ mint: "X" }))), ["mint"]);
  assert.deepEqual(f(par("x"), rcInfo(rcRep({ lp: 20 }))), ["lp"]);
  assert.deepEqual(f(par("x", { liq: 10e3 }), okInfo), ["liq"]);
  assert.deepEqual(f(par("x", { v1: 10e3 }), okInfo), ["vol"]);
  assert.deepEqual(f(par("x"), rcInfo(rcRep({ hp: 4 }))), ["top10"]);
  assert.deepEqual(f(par("x"), rcInfo(rcRep({ dev: 8 }))), ["dev"]);
  assert.deepEqual(f(par("x"), rcInfo(rcRep({ bundle: 15 }))), ["bundle"]);
  assert.deepEqual(f(par("x", { ch1: 120 }), okInfo), ["pump"]);
  assert.equal(reglas(par("x"), null).mint, null, "sin RugCheck: falta el dato");
  assert.equal(explorador(par("x", { ageMin: 10 }), T0), "joven");
});

test("GeckoTerminal: compradores únicos de la última hora", () => {
  const g = gtInfo(gtTr(30), T0); assert.equal(g.ub, 20); assert.equal(g.b, 20); assert.equal(g.s, 10);
});

test("analista: 6 señales y nota media; carteras listas neutras mientras aprende", () => {
  const S = freshState(), an = analista(S, "a", par("a"), okInfo, gtInfo(gtTr(300), T0), T0);
  assert.deepEqual(Object.keys(an.sig).sort(), ["bs", "hg", "lm", "mom", "sw", "ub"]); assert.equal(an.sig.sw, 50); assert.ok(an.learning);
  assert.equal(an.sc, Math.round(Object.values(an.sig).reduce((x, y) => x + y) / 6));
});

test("pipeline completo: filtra, puntúa, entra, stop, móvil, rug, fallidas y aprende carteras listas", () => {
  const S = freshState(), never = () => 1, gt = { gt: { a: gtInfo(gtTr(300), T0), b: gtInfo(gtTr(300, "z"), T0), c: gtInfo(gtTr(300, "y"), T0) } };
  const rc = { a: okInfo, b: okInfo, c: okInfo, d: rcInfo(rcRep({ mint: "X" })) };
  paso(S, { a: par("a"), b: par("b"), c: par("c"), d: par("d"), e: par("e") }, new Date(T0), never, { rc, ...gt });
  assert.equal(S.st.killed, 1); assert.equal(S.rk.mint, 1, "cuenta qué regla mató");
  assert.ok(!S.seen.e.k && !S.pos.e, "sin RugCheck espera, no se descarta"); assert.equal(S.st.seen, 5, "vistas = las que pasan el explorador");
  assert.equal(Object.keys(S.pos).length, 3); assert.ok(Math.abs(S.pos.a.cost - R.start * 0.08) < 1e-9, "8 % del capital");
  assert.ok(S.log.some((x) => x.ev === "PASS") && S.log.some((x) => x.ev === "SCORE") && S.log.some((x) => x.ev === "ENTER") && S.log.some((x) => x.ev === "KILL"));
  paso(S, { a: par("a", { px: 0.9 }), b: par("b", { px: 1.6 }), e: par("e") }, new Date(T0 + 3e5), never, { rc: { e: okInfo } });
  assert.ok(!S.pos.a && !S.pos.c && S.pos.b && S.pos.b.trailing); assert.equal(S.st.rugs, 1); assert.equal(S.st.stops, 1);
  assert.ok(Object.keys(S.smart).length > 0, "los compradores de b (subió un 60 %) pasan a carteras listas");
  paso(S, { b: par("b", { px: 1.3 }), e: par("e") }, new Date(T0 + 6e5), never, {});
  assert.ok(!S.pos.b); assert.match(S.closed[0].why, /móvil/); assert.ok(S.closed[0].h.length >= 2, "guarda la gráfica de la operación");
  assert.equal(S.st.wins + S.st.losses, 3); assert.ok(S.st.worst < 0 && S.st.best > 0);
  const F = freshState(); paso(F, { a: par("a") }, new Date(T0), () => 0, { rc: { a: okInfo }, gt: { a: gtInfo(gtTr(300), T0) } });
  assert.equal(F.st.failed, 1); assert.equal(F.st.trades, 0); assert.ok(F.cash < R.start);
});

test("bestPairs: el par con más liquidez y solo de Solana", () => {
  const m = bestPairs([par("a", { liq: 50e3 }), par("a", { liq: 90e3 }), { ...par("b"), chainId: "eth" }]);
  assert.deepEqual(Object.keys(m), ["a"]); assert.equal(m.a.liquidity.usd, 90e3);
});

test("como el vídeo: mismas decisiones sin costes; y la vigilancia rápida hace saltar el stop", () => {
  const S = freshState(), ext = { rc: { a: okInfo }, gt: { a: gtInfo(gtTr(300), T0) } };
  paso(S, { a: par("a") }, new Date(T0), () => 1, ext); pasoIdeal(S, { a: par("a") }, new Date(T0), ext);
  assert.ok(S.pos.a && S.ideal.pos.a, "las dos entran"); assert.equal(S.ideal.st.fees, 0); assert.ok(S.st.fees > 0);
  assert.ok(S.ideal.lastEq > S.lastEq, "sin costes siempre va por delante");
  rapido(S, { a: par("a", { px: 0.9 }) }, new Date(T0 + 20000));
  assert.ok(!S.pos.a && !S.ideal.pos.a, "el stop salta en la vuelta rápida en las dos");
  assert.ok(S.ideal.closed[0].pnl > S.closed[0].pnl, "sin costes pierde menos");
  assert.equal(S.ideal.smart, undefined, "no duplica las carteras listas al guardar");
});

test("con poco capital: los costes fijos de Solana pesan en cada compra", () => {
  const S = freshState(), ext = { rc: { a: okInfo }, gt: { a: gtInfo(gtTr(300), T0) } };
  paso(S, { a: par("a") }, new Date(T0), () => 1, ext); pasoIdeal(S, { a: par("a") }, new Date(T0), ext);
  const c = S.pos.a.cost - S.pos.a.q * 1;   // lo que se va al entrar
  assert.ok(c >= R.fixFee, "incluye el coste fijo"); assert.ok(c / S.pos.a.cost > 0.02, "más de un 2 % de una compra pequeña");
  assert.equal(S.ideal.pos.a.q, R.start * 0.08, "la cuenta «como el vídeo» no paga nada");
});

test("laboratorio de memes: población, cada variante opera con sus reglas, selección y adopción", () => {
  const T = new Date(T0), Lb = freshLab(T); assert.equal(Lb.pop.length, POP); assert.equal(Lb.pop[0].id, "v0");
  assert.equal(new Set(Lb.pop.map((v) => gkey(v.g))).size, POP, "todas distintas");
  const ext = { rc: { a: okInfo }, gt: { a: gtInfo(gtTr(300), T0) }, full: true };
  pasoVar(Lb.pop[0], { a: par("a") }, T, ext, {}, {}, () => 1); assert.ok(Lb.pop[0].pos.a, "la del vídeo entra como el terminal");
  const S = freshState();
  // simular: v1 gana mucho con 40 operaciones; v2..v5 pierden; el resto no opera en 49 h
  const fake = (v, n, pc) => { v.n = n; v.s1 = n * pc; v.s2 = n * (pc * pc + 0.0001); v.w = pc > 0 ? n : 0; v.lastEq = R.start * (1 + pc * n / 10); };
  fake(Lb.pop[1], 40, 0.05); for (let i = 2; i < 6; i++) fake(Lb.pop[i], 12, -0.04); for (let i = 6; i < POP; i++) Lb.pop[i].born = new Date(T0 - 50 * 3600e3).toISOString();
  Lb.lastGen = new Date(T0 - 4 * 3600e3).toISOString();
  const r = evolucionar(Lb, S, T, () => 0.3);
  assert.ok(r && r.out > 0, "archiva algunas"); assert.equal(Lb.pop.length, POP, "repone hasta la población completa"); assert.ok(Lb.arch.length === r.out);
  assert.ok(Lb.pop.some((v) => v.id === "v0"), "la del vídeo nunca sale"); assert.ok(Lb.pop.some((v) => v.id === "v1"), "la mejor sigue");
  assert.equal(S.genomeId, "v1", "el terminal adopta la que demuestra ser mejor"); assert.ok(fitness(Lb.pop.find((v) => v.id === "v1")) > 2);
  assert.ok(Lb.log.some((x) => x.k === "adopta") && Lb.log.some((x) => x.k === "nace"));
  // y el terminal usa ahora esas reglas
  const g = aleatorio(() => 0.99); S.genome = { ...g, minScore: 99 }; paso(S, { a: par("a") }, new Date(T0 + 60e3), () => 1, ext);
  assert.ok(!S.pos.a, "con nota mínima 99 no entra: usa el genoma adoptado");
});
