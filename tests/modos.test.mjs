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
  const LAT = { "X-EUR": { ok: true, er: 0.05, rango: 0.06, tendencia: false } };
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
  let F = await FIN.vuelta(null, tick(2), 0.9, new Date(ahora), fx);
  assert.deepEqual(Object.keys(F.pos), ["AAA"], "solo la que paga de verdad"); const e0 = F.lastEq; assert.ok(e0 > 99.5 && e0 < 100);
  mark = 3; F = await FIN.vuelta(F, tick(3), 0.9, new Date(ahora + 60e3), fx);   // +50 % de precio
  assert.ok(Math.abs(F.lastEq - e0) < 0.2, "neutral al precio: " + F.lastEq + " vs " + e0);
  mark = 2; for (let h = 1; h <= 48; h++) F = await FIN.vuelta(F, tick(2), 0.9, new Date(ahora + h * 3600e3), fx);
  assert.ok(F.st.cobrado > 0.05, "cobra: " + F.st.cobrado); assert.ok(F.lastEq > e0 + 0.04, F.lastEq + " vs " + e0);
  fr.AAA = -0.0002; F.frAt = 0; for (let h = 49; h <= 60; h++) F = await FIN.vuelta(F, tick(2), 0.9, new Date(ahora + h * 3600e3), fx);
  // con el historial «de 3 días» todo negativo (simulado) sale
  assert.equal(Object.keys(F.pos).length, 0, "sale cuando la financiación se gira"); assert.equal(F.closed.length, 1);
});
