import test from "node:test";
import assert from "node:assert/strict";
import * as REJ from "../runner/rejilla.mjs";
import * as FIN from "../runner/financiacion.mjs";

// velas de 5 min sintéticas: precio = f(i)
const velas = (n, f) => Array.from({ length: n }, (_, i) => { const p = f(i), q = f(i + 1); return [i * 300e3, p, Math.max(p, q) * 1.001, Math.min(p, q) * 0.999, q, 100]; });
const lado = (i) => 100 * (1 + 0.015 * Math.sin(i / 50) + 0.004 * Math.sin(i * 1.7));   // sube y baja sin rumbo
const baja = (i) => 100 * Math.exp(-0.0008 * i);                    // cae sin parar

test("Rejilla: distingue «de lado» de «tendencia» y gana de lado pero no en caída", () => {
  const L = REJ.lateral(velas(400, lado)); assert.ok(L.ok, "de lado: " + JSON.stringify(L));
  const T = REJ.lateral(velas(400, baja)); assert.ok(!T.ok); assert.ok(T.tendencia, "cae: " + JSON.stringify(T));
  const a = REJ.probar(velas(3000, lado), 0.012, 0.001); assert.ok(a.n >= 1 && a.pc > 0, "de lado gana: " + JSON.stringify(a));
  const b = REJ.probar(velas(3000, baja), 0.012, 0.001); assert.ok(b.pc <= 0.0001, "cayendo no monta o no gana: " + JSON.stringify(b));
  const A = REJ.aprender({ m: { "X-EUR": { c: velas(4000, lado), sp: 0.001 }, "Y-EUR": { c: velas(4000, baja), sp: 0.001 } } });
  assert.ok(A["X-EUR"].ok); assert.ok(!A["Y-EUR"] || !A["Y-EUR"].ok);
});

test("Rejilla en vivo: monta, vende escalones al oscilar, no pierde dinero por el camino y se apaga si rompe por abajo", () => {
  let R = REJ.vuelta(null, {}, {}, new Date(0)); R.apr = { "X-EUR": { paso: 0.01, a: { pc: 3 }, b: { pc: 2 }, ok: true } };
  const LAT = { "X-EUR": { ok: true, er: 0.05, rango: 0.06, m240: 0, tendencia: false } };
  const tk = (p) => ({ "X-EUR": { bid: p * 0.9995, ask: p * 1.0005, sp: 0.001 } });
  R = REJ.vuelta(R, tk(100), LAT, new Date(60e3)); assert.equal(Object.keys(R.g).length, 1); assert.ok(R.lastEq > 99 && R.lastEq <= 100);
  let t = 120e3; for (let k = 0; k < 6; k++) for (const p of [98.5, 97.5, 99, 101.5, 102.5, 100]) R = REJ.vuelta(R, tk(p), LAT, new Date((t += 60e3)));
  assert.ok(R.st.ventas >= 6, "vende escalones: " + R.st.ventas); assert.ok(R.lastEq > 100.5, "gana oscilando: " + R.lastEq);
  R = REJ.vuelta(R, tk(85), LAT, new Date((t += 60e3))); assert.equal(Object.keys(R.g).length, 0, "rompe por abajo → cierra"); assert.equal(R.closed[0].m, "X-EUR");
  assert.ok(Math.abs(R.cash - R.lastEq) < 0.01);
});

test("Financiación: entra solo si compensa, el precio le da igual y cobra cada hora", async () => {
  const ahora = 10 * 86400e3, hist = (r) => Array.from({ length: 72 }, (_, i) => ({ coin: "X", fundingRate: String(r), time: ahora - i * 3600e3 }));
  let mark = 2, fr = { AAA: 0.0001, BBB: 0.000002 };   // AAA paga ~88 % al año; BBB ~1,8 % al año
  const uni = ["AAA", "BBB", ...Array.from({ length: 20 }, (_, i) => "Z" + i)];
  const fx = async (u, o) => { const b = JSON.parse(o.body); return { ok: true, json: async () => (b.type === "metaAndAssetCtxs" ? [{ universe: uni.map((name) => ({ name })) }, uni.map((n) => ({ funding: String(fr[n] || 0), markPx: String(n === "AAA" ? mark : 1), dayNtlVlm: "5e7", openInterest: "1e6" }))] : hist(fr[b.coin] || 0)) }; };
  const tick = (p) => ({ "AAA-EUR": { bid: p * 0.9 * 0.9995, ask: p * 0.9 * 1.0005, sp: 0.001, vq: 1e6 }, "BBB-EUR": { bid: 0.9, ask: 0.9, sp: 0.001, vq: 1e6 } });
  let D = await FIN.datos(null, tick(2), new Date(ahora), fx), F = FIN.vuelta(null, D, tick(2), 0.9, new Date(ahora));
  assert.deepEqual(Object.keys(F.pos), ["AAA"], "solo la que paga de verdad"); const e0 = F.lastEq; assert.ok(e0 > 99.5 && e0 < 100);
  mark = 3; D = await FIN.datos(D, tick(3), new Date(ahora + 60e3), fx); F = FIN.vuelta(F, D, tick(3), 0.9, new Date(ahora + 60e3));   // +50 % de precio
  assert.ok(Math.abs(F.lastEq - e0) < 0.2, "neutral al precio: " + F.lastEq + " vs " + e0);
  mark = 2; for (let h = 1; h <= 48; h++) { D = await FIN.datos(D, tick(2), new Date(ahora + h * 3600e3), fx); F = FIN.vuelta(F, D, tick(2), 0.9, new Date(ahora + h * 3600e3)); }
  assert.ok(F.st.cobrado > 0.05, "cobra: " + F.st.cobrado); assert.ok(F.lastEq > e0 + 0.04, F.lastEq + " vs " + e0);
  fr.AAA = -0.0002; D.frAt = 0; for (let h = 49; h <= 60; h++) { D = await FIN.datos(D, tick(2), new Date(ahora + h * 3600e3), fx); F = FIN.vuelta(F, D, tick(2), 0.9, new Date(ahora + h * 3600e3)); }
  // turbo ×3: con el mismo dinero, más tamaño (más financiación) y sale antes si el precio se dispara
  const T = FIN.vuelta(null, D, tick(2), 0.9, new Date(ahora + 61 * 3600e3), FIN.PERF.turbo); void T;
  // con el historial «de 3 días» todo negativo (simulado) sale
  assert.equal(Object.keys(F.pos).length, 0, "sale cuando la financiación se gira"); assert.equal(F.closed.length, 1);
});

test("Financiación turbo ×3: el mismo dinero mueve más tamaño y sale si el precio sube un 20 %", async () => {
  const ahora = 10 * 86400e3, uni = ["AAA", ...Array.from({ length: 20 }, (_, i) => "Z" + i)]; let mark = 2;
  const fx = async (u, o) => { const b = JSON.parse(o.body); return { ok: true, json: async () => (b.type === "metaAndAssetCtxs" ? [{ universe: uni.map((name) => ({ name })) }, uni.map((n) => ({ funding: n === "AAA" ? "0.0001" : "0", markPx: String(n === "AAA" ? mark : 1), dayNtlVlm: "5e7" }))] : Array.from({ length: 72 }, (_, i) => ({ fundingRate: b.coin === "AAA" ? "0.0001" : "0", time: ahora - i * 3600e3 }))) }; };
  const tick = (p) => ({ "AAA-EUR": { bid: p * 0.9, ask: p * 0.9, sp: 0.001, vq: 1e6 } });
  let D = await FIN.datos(null, tick(2), new Date(ahora), fx);
  const C = FIN.vuelta(null, D, tick(2), 0.9, new Date(ahora)), T = FIN.vuelta(null, D, tick(2), 0.9, new Date(ahora), FIN.PERF.turbo);
  assert.ok(T.pos.AAA.qs > C.pos.AAA.qs * 1.3, "turbo lleva más tamaño");
  mark = 2.5; D = await FIN.datos(D, tick(2.5), new Date(ahora + 60e3), fx);
  const T2 = FIN.vuelta(T, D, tick(2.5), 0.9, new Date(ahora + 60e3), FIN.PERF.turbo), C2 = FIN.vuelta(C, D, tick(2.5), 0.9, new Date(ahora + 60e3));
  assert.equal(Object.keys(T2.pos).length, 0, "turbo sale al +25 %"); assert.equal(Object.keys(C2.pos).length, 1, "el conservador aguanta");
  assert.ok(T2.lastEq > 99, "sin perder dinero por la subida: " + T2.lastEq);
});

test("Submodos de IA: cada laboratorio respeta sus propios límites", async () => {
  const B = await import("../runner/bitvavo.mjs"); let x = 7; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    const t = B.aleatorio(rnd, B.PERF.turbo), m = B.mutar(t, rnd, B.PERF.turbo), ia = B.mutar(B.aleatorio(rnd, B.PERF.mix), rnd, B.PERF.mix);
    for (const g of [t, m]) { assert.ok(g.maxHoldH <= 3 && g.maxPos === 8 && g.size >= 0.12, JSON.stringify(g)); }
    assert.ok(["ia", "copia"].includes(ia.estilo) && ia.iaMin >= 0.3, JSON.stringify(ia));
  }
  assert.equal(B.PERF.mix.base.estilo, "ia"); assert.equal(B.PERF.eq.base.estilo, "tendencia");
});

test("Financiación aprende: elige umbrales que ganan en las dos mitades y se para si nada habría ganado", () => {
  const n = 336, buena = Array.from({ length: n }, (_, i) => 0.0001 * (1 + 0.3 * Math.sin(i / 10))), mala = Array.from({ length: n }, (_, i) => (i % 96 < 80 ? 0.00008 : -0.0006));
  const A = FIN.aprender({ AAA: buena, BBB: buena.map((x) => x * 0.8) }, () => 0.001, "cons");
  assert.ok(A.ok && A.a.tot > 0 && A.b.tot > 0, JSON.stringify(A)); assert.ok(!A.pausa);
  const M = FIN.aprender({ CCC: mala, DDD: mala }, () => 0.001, "turbo");
  assert.ok(!M.ok, JSON.stringify(M));
  // si aprendió que nada gana, no abre aunque ahora pague
  const F = FIN.fresh(new Date(0)); F.apr = { ...M, pausa: true }; const D = { ctx: Object.fromEntries(["AAA", ...Array.from({ length: 20 }, (_, i) => "Z" + i)].map((c) => [c, { f: 0.0002, mark: 1, vol: 1e8 }])), cand: ["AAA"], fr: { AAA: { a3: 0.0002, a1: 0.0002, pos: 1, n: 72 } } };
  const G = FIN.vuelta(F, D, { "AAA-EUR": { bid: 0.9, ask: 0.9, sp: 0.001, vq: 1e6 } }, 0.9, new Date(3600e3), FIN.PERF.turbo);
  assert.equal(Object.keys(G.pos).length, 0);
});

test("Rejilla en vivo: también vende con los picos de dentro de las velas, una sola vez por vela", () => {
  let R = REJ.vuelta(null, {}, {}, new Date(0)); R.apr = { "X-EUR": { paso: 0.01, a: { pc: 3 }, b: { pc: 2 }, ok: true } };
  const LAT = { "X-EUR": { ok: true, er: 0.05, rango: 0.06, m240: 0, tendencia: false } }, tk = (p) => ({ "X-EUR": { bid: p * 0.9995, ask: p * 1.0005, sp: 0.001 } });
  R = REJ.vuelta(R, tk(100), LAT, new Date(0)); const t0 = Date.parse(R.g["X-EUR"].t0);
  const V = { "X-EUR": [[t0 + 300e3, 100, 101.2, 99.9, 100, 1], [t0 + 600e3, 100, 100.1, 98.8, 100, 1]] };   // pico arriba (vende) y pico abajo (compra)
  R = REJ.vuelta(R, tk(100), LAT, new Date(t0 + 900e3), undefined, V);
  assert.equal(R.st.ventas, 1, "vende con el pico"); const n = R.g["X-EUR"].lv.filter((l) => l.q > 0).length;
  R = REJ.vuelta(R, tk(100), LAT, new Date(t0 + 960e3), undefined, V);
  assert.equal(R.st.ventas, 1, "no repite la misma vela"); assert.equal(R.g["X-EUR"].lv.filter((l) => l.q > 0).length, n);
});
