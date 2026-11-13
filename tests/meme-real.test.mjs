// v175 · pruebas de las decisiones de Memes con dinero real (sin red ni cartera)
import test from "node:test";
import assert from "node:assert/strict";
import { prueba, plan, frenos, tamOrden, LIM } from "../runner/meme-real.mjs";
import { parseUpdates } from "../runner/telegram.mjs";

test("solo se propone dinero real cuando el terminal ha demostrado que gana", () => {
  const cl = (n, w, l) => ({ closed: [...Array(w).fill({ pnl: 2 }), ...Array(l).fill({ pnl: -1 })].slice(0, n) });
  assert.equal(prueba(cl(29, 20, 9)).ok, false, "menos de 30 operaciones");
  assert.equal(prueba(cl(30, 12, 18)).ok, true, "30 operaciones, factor 1,33 y ganancia media positiva: sí");
  assert.equal(prueba({ closed: [...Array(11).fill({ pnl: 2 }), ...Array(19).fill({ pnl: -1 })] }).ok, false, "factor 1,16: no");
  assert.equal(prueba({ closed: [...Array(15).fill({ pnl: 1 }), ...Array(15).fill({ pnl: -1 })] }).ok, false, "factor 1: no");
  const p = prueba({ closed: [...Array(18).fill({ pnl: 2 }), ...Array(12).fill({ pnl: -1 })] }); assert.equal(p.ok, true); assert.equal(p.pf, 3);
});
test("copia al terminal: compra lo que acaba de comprar, vende lo que cerró y vende parte si él vendió parte", () => {
  const now = "2026-11-03T12:00:00.000Z";
  const S = { pos: { a: { t0: now, sym: "A", q: 10 }, b: { t0: "2026-11-03T11:00:00.000Z", sym: "B", q: 10 }, c: { t0: "x", sym: "C", q: 5, tp1: 1, gotPart: 5, last: 1, px: 1 } } };
  const RS = { pos: { b: { sym: "B" }, c: { sym: "C" }, d: { sym: "D" } } };
  const o = plan(S, RS, now);
  assert.deepEqual(o.filter((x) => x.tipo === "compra").map((x) => x.a), ["a"], "solo lo recién comprado (no lo antiguo que no tenía)");
  assert.ok(o.some((x) => x.tipo === "venta" && x.a === "d" && x.frac === 1), "lo que el terminal ya cerró se vende entero");
  const pc = o.find((x) => x.a === "c"); assert.ok(pc && pc.parcial && Math.abs(pc.frac - 0.5) < 1e-9, "vende la misma parte que el terminal");
});
test("frenos: suelo del 60 % y pausa si un día pierde un 20 %", () => {
  const RS = { start: 100 }, t = new Date("2026-11-03T10:00:00Z");
  assert.deepEqual(frenos(RS, 95, t), {}); assert.ok(frenos(RS, 59, t).parar);
  const R2 = { start: 100 }; frenos(R2, 90, t); assert.ok(frenos(R2, 71, t).pausaDia, "de 90 a 71 en el mismo día");
});
test("tamaño de cada orden: ≤ 8 % y ≤ 15 €, y nunca más SOL del que hay", () => {
  assert.equal(tamOrden(100, 100), 8); assert.equal(tamOrden(1000, 1000), LIM.maxOrdenEur); assert.equal(tamOrden(100, 5), 4.75);
});
test("Telegram: botones de Memes y /parar /seguir, solo desde tu chat", () => {
  const cb = (data, chat = "7") => ({ update_id: 1, callback_query: { id: "q", data, message: { chat: { id: +chat }, message_id: 3 } } });
  assert.equal(parseUpdates([cb("ma:m123")], "7").memes.accion, "aprobar");
  assert.equal(parseUpdates([cb("mx:m123")], "7").memes.accion, "no");
  assert.equal(parseUpdates([cb("ma:m123", "9")], "7").memes, null, "otro chat no manda");
  assert.equal(parseUpdates([{ update_id: 2, message: { chat: { id: 7 }, text: "/parar" } }], "7").memes.accion, "parar");
  assert.equal(parseUpdates([{ update_id: 2, message: { chat: { id: 7 }, text: "/seguir" } }], "7").memes.accion, "seguir");
});
test("también vale si las reglas adoptadas ganan en 60+ casos vividos y lo confirman en vivo", () => {
  const base = { closed: [], genomeId: "v7" };
  assert.equal(prueba({ ...base, genomePrueba: { bt: { n: 80, pf: 1.6, med: 2.1 }, n: 12, med: 1.5 } }).ok, true);
  assert.equal(prueba({ ...base, genomePrueba: { bt: { n: 80, pf: 1.6, med: 2.1 }, n: 4, med: 1.5 } }).ok, false, "falta confirmarlo en vivo");
  assert.equal(prueba({ ...base, genomePrueba: { bt: { n: 80, pf: 1.1, med: 0.4 }, n: 12, med: 1.5 } }).ok, false, "factor insuficiente");
});

// v476 · 🔌 interruptor explícito
import { activo, pasoReal } from "../runner/meme-real.mjs";
test("v476 · el bot de memes con dinero real NO arranca sin activarlo a propósito (MEME_REAL_ACTIVO=1)", async () => {
  const v0 = process.env.MEME_REAL_ACTIVO; delete process.env.MEME_REAL_ACTIVO;
  try { assert.equal(activo({}), false); assert.equal(await pasoReal({}, {}, new Date(), 1.08), null, "no hace nada (ni lee su estado)");
    assert.equal(activo({ realAbierto: true }), true, "si ya tuviera algo abierto con dinero real, lo sigue gestionando");
    process.env.MEME_REAL_ACTIVO = "1"; assert.equal(activo({}), true); }
  finally { if (v0 == null) delete process.env.MEME_REAL_ACTIVO; else process.env.MEME_REAL_ACTIVO = v0; }
});
test("v478 · Telegram: el botón «la he revisado: liberar» lanza la acción «liberar» con el identificador de ESA orden; desde otro chat, no", () => {
  const cb = (data, chat = "7") => ({ update_id: 1, callback_query: { id: "q", data, message: { chat: { id: +chat }, message_id: 3 } } });
  const r = parseUpdates([cb("lb:dabc123")], "7"); assert.equal(r.act.accion, "liberar"); assert.equal(r.act.plan, "dabc123");
  assert.equal(parseUpdates([cb("lb:dabc123", "9")], "7").act, null);
});
