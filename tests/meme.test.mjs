// v159 · pruebas del terminal de memes (solo dinero ficticio)
import test from "node:test";
// azar con semilla: las pruebas dan siempre lo mismo (p. ej. el 5 % de órdenes fallidas no cae al azar en una prueba)
{ let z = 12345; Math.random = () => { z = (z * 16807) % 2147483647; const r = z / 2147483647; return r < 0.06 ? 0.06 + r : r; }; }
import assert from "node:assert/strict";
import { freshLab, pasoVar, evolucionar, fitness, mutar, aleatorio, gkey, POP, RANGOS, ensanchar, aplicarRangos } from "../runner/meme-lab.mjs";
import { gpInfo, CHAINS, ESTILOS, conGenoma, VIDEO, jupInfo } from "../runner/meme.mjs";
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

test("Base y BNB: GoPlus detecta trampas, impuestos, liquidez bloqueada, poseedores y creador", () => {
  const ok = { is_honeypot: "0", is_mintable: "0", hidden_owner: "0", can_take_back_ownership: "0", owner_change_balance: "0", transfer_pausable: "0", cannot_sell_all: "0", slippage_modifiable: "0", buy_tax: "0", sell_tax: "0", is_open_source: "1",
    lp_holders: [{ address: "0x000000000000000000000000000000000000dead", percent: "0.95", is_locked: 0 }, { address: "0xabc", percent: "0.05", is_locked: 0 }],
    holders: [{ address: "0xpool", percent: "0.4", is_contract: "1" }, ...Array.from({ length: 12 }, (_, i) => ({ address: "0xh" + i, percent: "0.015", is_contract: "0" }))], creator_percent: "0.01", holder_count: "2500" };
  const i = gpInfo(ok); assert.equal(i.mintOk, true); assert.ok(Math.abs(i.lp - 95) < 1e-9); assert.ok(Math.abs(i.top10 - 15) < 1e-9, "sin contar la piscina"); assert.ok(Math.abs(i.dev - 1) < 1e-9); assert.equal(i.holders, 2500);
  assert.equal(gpInfo({ ...ok, is_honeypot: "1" }).mintOk, false, "trampa que no deja vender"); assert.equal(gpInfo({ ...ok, is_honeypot: "1" }).rugged, true);
  assert.equal(gpInfo({ ...ok, sell_tax: "0.10" }).mintOk, false, "impuesto al vender"); assert.equal(gpInfo({ ...ok, is_mintable: "1", owner_address: "0xbbb" }).mintOk, false);
  assert.ok(reglas(par("x"), i).bundle, "sin dato de bloque en estas redes: no elimina");
  assert.deepEqual(Object.keys(CHAINS), ["solana", "base", "bsc"]);
});

test("estilos nuevos: grandes en tendencia, rebote tras caída y explosión de volumen", () => {
  assert.deepEqual(Object.keys(ESTILOS), ["video", "grandes", "rebote", "volumen", "volatil"]);
  const big = { ...par("big", { mc: 3e8, liq: 2e6, v1: 5e5, ch1: 4 }), pairCreatedAt: T0 - 30 * 86400e3, priceChange: { m5: 1, h1: 4, h6: 12, h24: 30 }, volume: { h1: 5e5, h24: 4e6 } };
  assert.equal(explorador(big, T0), "vieja", "el método del vídeo no mira monedas de un mes");
  assert.equal(conGenoma({ ...VIDEO, estilo: "grandes" }, () => explorador(big, T0)), null, "el estilo «grandes» sí");
  const infoBig = { ...okInfo, top10: 45, lp: 10 };
  assert.ok(conGenoma({ ...VIDEO, estilo: "grandes" }, () => Object.values(reglas(big, infoBig)).every(Boolean)), "en las grandes no se exige LP bloqueada ni top 10 ≤ 25 %");
  const dip = { ...par("dip", { mc: 5e6, ch1: 3 }), pairCreatedAt: T0 - 3 * 86400e3, priceChange: { m5: 2, h1: 3, h6: -35, h24: -40 } };
  assert.ok(conGenoma({ ...VIDEO, estilo: "rebote" }, () => reglas(dip, okInfo).pump), "rebote: exige haber caído");
  assert.ok(!conGenoma({ ...VIDEO, estilo: "rebote" }, () => reglas(big, okInfo).pump), "rebote: no compra lo que sube");
  const S = freshState(), an = conGenoma({ ...VIDEO, estilo: "rebote" }, () => analista(S, "dip", dip, okInfo, null, T0));
  assert.ok(an.sig.mom > 40, "la caída con recuperación puntúa en impulso");
  const Lb = freshLab(new Date(T0)); assert.ok(["grandes", "rebote", "volumen"].every((e) => Lb.pop.some((v) => v.g.estilo === e)), "la población inicial prueba todos los estilos");
});

test("venta parcial: a +tp vende una parte, el resto sigue, y el resultado final suma las dos", () => {
  const S = freshState(); S.genome = { ...VIDEO, tp: 0.3, tpFrac: 0.5, trailOn: 0.5 };
  paso(S, { a: par("a") }, new Date(T0), () => 1, { rc: { a: okInfo }, gt: { a: gtInfo(gtTr(300), T0) } });
  const q0 = S.pos.a.q, c0 = S.cash;
  paso(S, { a: par("a", { px: 1.35 }) }, new Date(T0 + 60e3), () => 1, {});
  assert.ok(Math.abs(S.pos.a.q - q0 / 2) < 1e-9, "vende la mitad"); assert.ok(S.cash > c0, "cobra la parte vendida"); assert.ok(S.log.some((x) => x.ev === "TP"));
  paso(S, { a: par("a", { px: 0.9 }) }, new Date(T0 + 120e3), () => 1, {});   // la otra mitad salta en el stop
  const c = S.closed[0]; assert.ok(/tras vender parte/.test(c.why)); assert.ok(c.pnl > -0.1 * c.cost, "la venta parcial compensa casi todo el stop");
  assert.ok(Math.abs(S.st.pnl - c.pnl) < 0.01, "la ganancia total cuadra");
});
test("Jupiter: actividad real, traders y poseedores", () => {
  const j = jupInfo({ id: "x", organicScore: 72.5, stats1h: { numTraders: 410, numOrganicBuyers: 180, holderChange: 4.2 } });
  assert.deepEqual(j, { org: 72.5, traders: 410, organicBuyers: 180, holderChg: 4.2 });
  const S = freshState(), an = analista(S, "a", par("a"), okInfo, null, T0, j); assert.equal(an.sig.ub, 60, "compradores reales de Jupiter"); assert.equal(an.sig.hg, 42);
});

test("sin techo: si las mejores se pegan al borde de un rango, el rango se ensancha (con límites de cordura)", () => {
  const L = { log: [] }, b0 = RANGOS.size[1], best = [{ g: { size: b0 } }, { g: { size: b0 } }, { g: { size: 0.05 } }];
  const n = ensanchar(L, best, new Date(T0)); assert.ok(n >= 1); assert.ok(RANGOS.size[1] > b0, "prueba compras más grandes"); assert.ok(RANGOS.size[1] <= 0.3, "pero nunca más del 30 %");
  assert.ok(L.log.some((x) => x.k === "amplia")); const saved = L.rangos.size.slice();
  RANGOS.size[1] = b0; aplicarRangos(L); assert.deepEqual(RANGOS.size.slice(0, 2), saved, "se recuerda entre vueltas");
  RANGOS.size[1] = b0;
});

import { freshM, registrar, simular, backtest } from "../runner/meme-muestras.mjs";
test("muestras: se guardan las candidatas, se sigue su precio y cualquier variante se prueba al momento sobre ellas", () => {
  const M = freshM(), t = (m) => new Date(T0 + m * 60000), ext = { rc: { a: okInfo, b: okInfo }, gt: { a: gtInfo(gtTr(300), T0) } };
  registrar(M, [["a", par("a")], ["b", par("b")]], { a: par("a"), b: par("b") }, ext, t(0));
  assert.equal(Object.keys(M.abiertas).length, 2);
  // a sube un 40 % y luego cae; b se hunde (rug)
  const pxA = [1.05, 1.15, 1.3, 1.4, 1.2, 1.0, 0.95];
  for (let i = 1; i <= 7; i++) registrar(M, [], { a: par("a", { px: pxA[i - 1] }), b: par("b", { px: 1 - i * 0.02, liq: i >= 5 ? 1000 : 2e5 }) }, ext, t(i * 10));
  assert.equal(M.hechas.length, 1, "b terminó (rug)"); assert.equal(M.hechas[0].fin, "rug");
  for (let i = 8; i <= 150; i++) registrar(M, [], { a: par("a", { px: 0.95 }) }, ext, t(i * 10));
  assert.equal(M.hechas.length, 2, "a terminó a las 24 h"); assert.equal(Object.keys(M.abiertas).length, 0);
  const sa = M.hechas.find((x) => x.a === "a");
  const conMovil = simular({ ...VIDEO, trailOn: 0.12, trail: 0.15, stop: 0.06 }, sa), conParcial = simular({ ...VIDEO, tp: 0.3, tpFrac: 0.5, trailOn: 0.12, trail: 0.15 }, sa);
  assert.ok(conMovil > 0.05, "con stop móvil sale ganando tras la subida"); assert.ok(conParcial > 0, "la venta parcial también gana");
  assert.equal(simular({ ...VIDEO, minScore: 99 }, sa), null, "con nota mínima 99 no habría entrado");
  const sb = M.hechas.find((x) => x.a === "b"); assert.ok(simular({ ...VIDEO, stop: 0.2 }, sb) < 0, "en el rug pierde");
  const bt = backtest({ ...VIDEO }, M); assert.equal(bt.n, 2); assert.ok(bt.win === 50);
});
test("plazo del 10-nov: si nada ha superado la prueba, el terminal adopta las mejores reglas que haya", () => {
  const T = new Date("2026-11-10T06:00:00Z"), Lb = freshLab(new Date("2026-11-09T00:00:00Z")), S = freshState();
  Lb.pop[3].bt = { n: 40, t: 1.4, pf: 1.2, med: 0.8, win: 50 }; Lb.lastGen = new Date(T - 2 * 3600e3).toISOString();
  evolucionar(Lb, S, T, () => 0.3, null);
  assert.equal(S.genomeId, Lb.pop.find((v) => v.bt && v.bt.n === 40).id); assert.ok(Lb.log.some((x) => /plazo/.test(x.txt)));
  const S2 = freshState(), L2 = freshLab(new Date("2026-11-03T00:00:00Z")); L2.pop[3].bt = { n: 40, t: 1.4 }; L2.lastGen = new Date("2026-11-03T10:00:00Z").toISOString();
  evolucionar(L2, S2, new Date("2026-11-03T12:00:00Z"), () => 0.3, null); assert.equal(S2.genomeId, undefined, "antes del plazo no fuerza nada");
});
import { casosHistoria, anadirHistoria, HIST_POR_MONEDA } from "../runner/meme-muestras.mjs";
test("historia: con las velas de 5 min de una moneda se crean casos ya vividos que también sirven para el backtest", () => {
  const t0 = Math.floor(T0 / 1000) - 3 * 86400, velas = [];
  for (let i = 0; i < 864; i++) { const p = 1 + 0.3 * Math.sin(i / 40) + i / 2000; velas.push([t0 + i * 300, p * 0.99, p * 1.02, p * 0.98, p, 5000 + (i % 50) * 100]); }
  const casos = casosHistoria("h", par("h"), okInfo, { org: 80 }, velas);
  assert.ok(casos.length > 10 && casos.length <= HIST_POR_MONEDA, "salen casos: " + casos.length);
  const c = casos[0]; assert.equal(c.hist, 1); assert.equal(c.p[0][1], 1); assert.ok(c.p.length > 20, "sigue 24 h en tramos de 30 min");
  assert.ok(c.p.slice(1).every((x) => x[2] >= x[3]), "máximo ≥ mínimo en cada tramo");
  assert.deepEqual(casosHistoria("h", par("h"), okInfo, null, velas.slice(0, 30)), [], "con pocas velas no inventa nada");
  const M = freshM(); anadirHistoria(M, casos); anadirHistoria(M, casos); assert.equal(M.hist.length, casos.length, "no duplica la misma moneda");
  const bt = backtest({ ...VIDEO, minScore: 0 }, M); assert.equal(bt.n, bt.nh || 0, "todo viene de historia"); assert.ok(casos.every((x) => x.q.liquidity.usd > 0 && x.q.volume.h24 > 0), "cada caso trae su foto");
});
import { pasoTurbo, TURBO } from "../runner/meme.mjs";
test("turbo: opera monedas que el vídeo descarta (más pequeñas y con menos volumen) y sale antes", () => {
  const S = freshState(), now = new Date(T0), a = "tb", q = par(a, { mc: 120e3, liq: 25e3, v1: 20e3, ch1: 25, ageMin: 15 });
  const ext = { rc: { [a]: okInfo }, gt: {} };
  paso(S, { [a]: q }, now, () => 1, ext); assert.equal(Object.keys(S.pos).length, 0, "el vídeo no la compra");
  pasoTurbo(S, { [a]: q }, now, ext); assert.equal(Object.keys(S.turbo.pos).length, 1, "turbo sí"); assert.equal(S.turbo.st.trades, 1);
  rapido(S, { [a]: par(a, { mc: 120e3, liq: 25e3, v1: 20e3, px: 0.85 }) }, new Date(T0 + 60000));
  assert.equal(Object.keys(S.turbo.pos).length, 0, "con −15 % salta su stop del 10 %"); assert.ok(TURBO.maxHoldH < VIDEO.maxHoldH);
});
test("turbo aprende: «vt» vive en la bola y el Turbo adopta una variante muy activa que gane", () => {
  const T = new Date("2026-11-04T12:00:00Z"), Lb = freshLab(new Date("2026-11-03T12:00:00Z")), S = freshState();
  Lb.lastGen = new Date(T - 3600e3).toISOString(); evolucionar(Lb, S, T, () => 0.3, null);
  assert.ok(Lb.pop.some((v) => v.id === "vt"), "vt entra en la bola");
  const v = Lb.pop.find((x) => x.id !== "v0" && x.id !== "vt"); Object.assign(v, { n: 40, s1: 4, s2: 1, w: 26, born: new Date(T - 24 * 3600e3).toISOString(), lastEq: 115, peak: 115, dd: 0.03 });
  Lb.lastGen = new Date(T - 3600e3).toISOString(); evolucionar(Lb, S, new Date(T.getTime() + 60000), () => 0.3, null);
  if (v.fit >= 1) assert.equal(S.turboGenomeId, v.id); else assert.equal(S.turboGenomeId, undefined);
  assert.ok(Lb.pop.some((x) => x.id === "vt"), "vt no se archiva");
});
import { entrenar, etiqueta, predecir, rasgos } from "../runner/meme-ia.mjs";
test("IA: aprende sola qué rasgos tenían las que subieron y lo valida con casos que no ha visto", () => {
  assert.equal(etiqueta([[0, 1], [30, 1.1, 1.25, 0.97]]), 1); assert.equal(etiqueta([[0, 1], [30, 0.95, 1.05, 0.88], [60, 1.3, 1.3, 1.2]]), 0);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, M = { hechas: [], hist: [] };
  for (let i = 0; i < 400; i++) { const buena = rnd() < 0.3, q = par("c" + i, { liq: buena ? 6e5 : 6e4, mc: 2e6, ch1: rnd() * 40 }); q.volume.h24 = 2e6;
    M.hechas.push({ a: "c" + i, t0: T0 + i * 60000, q, info: okInfo, jup: null, p: [[0, 1], [30, buena ? 1.25 : 0.88, buena ? 1.3 : 1.02, buena ? 0.98 : 0.86], [60, 1, 1, 1]] }); }
  const m = entrenar(M, new Date(T0)); assert.ok(m.listo && m.auc > 0.9, "acierta: " + m.auc);
  const p1 = predecir(m, rasgos(par("x", { liq: 6e5, mc: 2e6 }), okInfo, T0, null)), p0 = predecir(m, rasgos(par("y", { liq: 6e4, mc: 2e6 }), okInfo, T0, null));
  assert.ok(p1 > p0, "da más probabilidad a la que se parece a las buenas");
  assert.equal(entrenar({ hechas: M.hechas.slice(0, 50) }).listo, false, "con pocos casos no opina");
});
test("escalera: si se dispara (×2, ×3) va vendiendo partes, y un desplome de golpe ya no se come casi toda la ganancia", () => {
  const S = freshState(), a = "es", q = par(a, { mc: 120e3, liq: 25e3, v1: 20e3, ch1: 25, ageMin: 15 }), ext = { rc: { [a]: okInfo }, gt: {} };
  pasoTurbo(S, { [a]: q }, new Date(T0), ext); assert.equal(Object.keys(S.turbo.pos).length, 1);
  const pxs = [1.3, 2.1, 3.2, 3.4, 0.6]; pxs.forEach((px, i) => rapido(S, { [a]: par(a, { mc: 120e3 * px, liq: 2e5, v1: 20e3, px }) }, new Date(T0 + (i + 1) * 20000)));
  const c = S.turbo.closed[0]; assert.ok(c, "cerrada tras el desplome"); assert.ok(c.pc > 30, "se queda con buena parte de la subida: " + c.pc);
  assert.ok(S.turbo.log.filter((x) => /×[23]/.test(x.txt)).length === 2, "vendió en ×2 y en ×3");
});
test("salida inteligente: vende al ver que la liquidez se va o que hay presión vendedora, antes del golpe", () => {
  const S = freshState(), a = "al", base = { mc: 120e3, liq: 25e3, v1: 20e3, ch1: 25, ageMin: 15 }, ext = { rc: { [a]: okInfo }, gt: {} };
  pasoTurbo(S, { [a]: par(a, base) }, new Date(T0), ext);
  rapido(S, { [a]: par(a, { ...base, px: 1.05, liq: 40e3 }) }, new Date(T0 + 20000));
  rapido(S, { [a]: par(a, { ...base, px: 1.04, liq: 26e3 }) }, new Date(T0 + 40000));
  assert.match(S.turbo.closed[0].why, /liquidez se va/);
  const S2 = freshState(), b = "pv"; pasoTurbo(S2, { [b]: par(b, base) }, new Date(T0), { rc: { [b]: okInfo }, gt: {} });
  const q = par(b, { ...base, px: 1.2 }); q.txns.m5 = { buys: 10, sells: 30 }; q.priceChange.m5 = -9;
  rapido(S2, { [b]: q }, new Date(T0 + 20000)); assert.match(S2.turbo.closed[0].why, /presión vendedora/);
  const S3 = freshState(); paso(S3, { [b]: par(b) }, new Date(T0), () => 1, { rc: { [b]: okInfo }, gt: {} }); const q3 = par(b, { px: 1.2 }); q3.txns.m5 = { buys: 10, sells: 30 }; q3.priceChange.m5 = -9;
  rapido(S3, { [b]: q3 }, new Date(T0 + 20000)); assert.equal(Object.keys(S3.pos).length, 1, "las reglas del vídeo no cambian");
});
import { grafico, anotarSeries } from "../runner/meme.mjs";
test("gráfico: prefiere una tendencia sana con un pequeño descanso, y castiga comprar en pleno desplome", () => {
  const sana = Array.from({ length: 40 }, (_, i) => 1 + i * 0.01 + (i % 5 === 4 ? -0.02 : 0)); sana.push(sana[sana.length - 1] * 0.95);
  const desplome = Array.from({ length: 40 }, (_, i) => (i < 30 ? 1 + i * 0.02 : 1.6 - (i - 29) * 0.06));
  const gs = grafico(sana), gd = grafico(desplome); assert.ok(gs.sc > 60, "sana: " + gs.sc); assert.ok(gd.sc < 30, "desplome: " + gd.sc); assert.equal(grafico([1, 2, 3]), null);
  const M = {}; for (let i = 0; i < 20; i++) anotarSeries(M, [["g", par("g", { px: 1 + i * 0.01 })]], new Date(T0 + i * 60000));
  assert.equal(M.serie.g.p.length, 20);
});
test("Base/BNB: la liquidez guardada en un contrato «locker» cuenta como bloqueada y «acuñable» sin dueño no descarta", () => {
  const r = { is_honeypot: "0", is_mintable: "1", hidden_owner: "0", can_take_back_ownership: "0", owner_change_balance: "0", transfer_pausable: "0", cannot_sell_all: "0", slippage_modifiable: "0", buy_tax: "0", sell_tax: "0", is_open_source: "1",
    owner_address: "", creator_address: "0xaaa", creator_percent: "0", lp_holders: [{ address: "0xlocker", is_contract: 1, is_locked: 0, percent: "0.99" }], holders: [] };
  const i = gpInfo(r); assert.equal(i.mintOk, true); assert.ok(i.lp >= 99);
  const i2 = gpInfo({ ...r, owner_address: "0xbbb", lp_holders: [{ address: "0xaaa", is_contract: 0, is_locked: 0, percent: "0.99" }] }); assert.equal(i2.mintOk, false, "con dueño y acuñable: fuera"); assert.ok(i2.lp < 1, "la LP en manos del creador no cuenta");
  assert.equal(gpInfo({ ...r, hidden_owner: "1" }).mintOk, false, "dueño oculto: fuera");
});
test("lecciones: cada operación cerrada se guarda con su foto de entrada y lo que pasó, y la moneda con pérdidas queda vetada 24 h", () => {
  const S = freshState(), a = "le", base = { mc: 120e3, liq: 25e3, v1: 20e3, ch1: 25, ageMin: 15 }, ext = { rc: { [a]: okInfo }, gt: {} };
  paso(S, { [a]: par(a) }, new Date(T0), () => 1, ext); assert.ok(S.pos[a].e0 && S.pos[a].e0.q.liquidity.usd > 0);
  rapido(S, { [a]: par(a, { px: 0.9 }) }, new Date(T0 + 120000));
  assert.equal(S.lecc.length, 1); const l = S.lecc[0]; assert.ok(l.res < 0 && l.p.length >= 2 && l.info);
  paso(S, { [a]: par(a) }, new Date(T0 + 30 * 3600e3), () => 1, ext); assert.equal(Object.keys(S.pos).length, 0, "vetada tras perder");
  const M = { hechas: [], hist: [], lecc: S.lecc }; assert.ok(backtest({ ...VIDEO, minScore: 0 }, M).n >= 0);
});
test("Base/BNB: liquidez repartida entre muchos proveedores cuenta según lo que puede retirar el mayor; WETH/WBNB no son memes", async () => {
  const base = { is_honeypot: "0", is_mintable: "0", hidden_owner: "0", can_take_back_ownership: "0", owner_change_balance: "0", transfer_pausable: "0", cannot_sell_all: "0", slippage_modifiable: "0", buy_tax: "0", sell_tax: "0", is_open_source: "1", creator_address: "0xcre", holders: [] };
  const rep = gpInfo({ ...base, lp_holders: [0.15, 0.12, 0.1, 0.1, 0.08, 0.45].map((p, i) => ({ address: "0xe" + i, is_contract: 0, is_locked: 0, percent: String(p / (i === 5 ? 9 : 1)) })) });
  assert.ok(rep.lp >= 80, "repartida: " + rep.lp);
  const una = gpInfo({ ...base, lp_holders: [{ address: "0xe1", is_contract: 0, percent: "0.9" }, { address: "0xe2", is_contract: 0, percent: "0.05" }, { address: "0xe3", is_contract: 0, percent: "0.05" }] }); assert.ok(una.lp <= 10, "una sola cartera manda");
  const { NOMEME } = await import("../runner/meme.mjs"); assert.ok(NOMEME.has("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c") && NOMEME.has("0x4200000000000000000000000000000000000006"));
});
import { pasoVolatil, VOLATIL, VOLATILES } from "../runner/meme.mjs";
test("volátiles: compra criptos grandes y líquidas en tendencia (no las recién nacidas) con costes bajos", () => {
  const S = freshState(), now = new Date(T0), v = "vo", m = "me", ext = { rc: { [v]: okInfo, [m]: okInfo }, gt: {} };
  const big = par(v, { mc: 2e9, liq: 8e6, v1: 3e6, ch1: 3, ch5: 1, ageMin: 400 * 1440 }); big.priceChange.h6 = 9; big.priceChange.h24 = 12; big.volume.h24 = 5e7;
  pasoVolatil(S, { [v]: big, [m]: par(m) }, now, ext);
  assert.deepEqual(Object.keys(S.volat.pos), [v], "solo la grande"); const p = S.volat.pos[v]; assert.ok(p.cost / p.q / +big.priceUsd < 1.01, "entra con menos de un 1 % de coste");
  rapido(S, { [v]: { ...big, priceUsd: "0.94" } }, new Date(T0 + 60000)); assert.equal(Object.keys(S.volat.pos).length, 0, "stop del 5 %"); assert.ok(S.volat.closed[0].pc > -8);
  assert.ok(VOLATILES.length >= 10 && VOLATIL.estilo === "volatil");
});
test("freno automático: si las últimas operaciones pierden, compra a la mitad y es más exigente; al volver a ganar, se quita", () => {
  const S = freshState(), a = "fr"; S.closed = Array.from({ length: 12 }, () => ({ pc: -8 }));
  paso(S, { [a]: par(a) }, new Date(T0), () => 1, { rc: { [a]: okInfo }, gt: {} }); assert.equal(S.prudente, true);
  if (S.pos[a]) assert.ok(S.pos[a].cost < 100 * VIDEO.size * 0.6, "compra a la mitad");
  S.closed = Array.from({ length: 12 }, () => ({ pc: 5 })); paso(S, {}, new Date(T0 + 60000), () => 1, {}); assert.equal(S.prudente, false);
});
test("Turbo se pausa si pierde claramente y no compra más (sigue vendiendo lo abierto)", () => {
  const S = freshState(), a = "tp", q = par(a, { mc: 120e3, liq: 25e3, v1: 20e3, ch1: 25, ageMin: 15 }), ext = { rc: { [a]: okInfo }, gt: {} };
  pasoTurbo(S, {}, new Date(T0), ext); S.turbo.closed = Array.from({ length: 20 }, () => ({ pc: -15 }));
  pasoTurbo(S, { [a]: q }, new Date(T0 + 60000), ext); assert.equal(S.turbo.pausado, true); assert.equal(Object.keys(S.turbo.pos).length, 0, "no compra");
  S.turboGenomeId = "v99"; S.turboGenome = { ...TURBO }; pasoTurbo(S, { [a]: q }, new Date(T0 + 120000), ext); assert.equal(S.turbo.pausado, false, "vuelve con reglas nuevas");
});
