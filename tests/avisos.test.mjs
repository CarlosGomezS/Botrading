import test from "node:test";
import assert from "node:assert/strict";
import { avisosCuenta, avisoReglas, rendimiento } from "../runner/avisos.mjs";
test("avisos: racha muy efectiva y gran operación, sin repetirse", () => {
  const now = new Date("2026-11-04T10:00:00Z"), A = {};
  const C = { st: {}, start: 100, lastEq: 112, closed: Array.from({ length: 20 }, (_, i) => ({ sym: "X" + i, pc: i % 4 === 0 ? -2 : 4, pnl: 0.4, t1: new Date(now - (i + 1) * 60000).toISOString(), why: "stop móvil" })) };
  C.closed[0].pc = 45; C.closed[0].pnl = 4.5;
  const m1 = avisosCuenta(A, "t", "⚡ Turbo", C, now, { med: 2, big: 30 }); assert.ok(m1.some((x) => /MUY efectivo/.test(x))); assert.ok(m1.some((x) => /\+45 %/.test(x)));
  const m2 = avisosCuenta(A, "t", "⚡ Turbo", C, new Date(+now + 60000), { med: 2, big: 30 }); assert.equal(m2.length, 0, "no repite");
  assert.equal(avisosCuenta({}, "t", "x", { ...C, lastEq: 99 }, now, { med: 2, big: 999 }).length, 0, "si el saldo no sube, no avisa");
  assert.ok(avisoReglas(A, "k", "hola", now)); assert.equal(avisoReglas(A, "k", "hola", now), null);
  assert.equal(rendimiento([{ pc: 1 }]), null);
});
