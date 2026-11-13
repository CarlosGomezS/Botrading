// v175 · pruebas de las decisiones de Memes con dinero real (sin red ni cartera)
import test from "node:test";
import assert from "node:assert/strict";
import { prueba, plan, frenos, tamOrden, LIM } from "../runner/meme-real.mjs";
import { parseUpdates, procesa, autorizado } from "../runner/telegram.mjs";

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
  const cb = (data, chat = "7") => ({ update_id: 1, callback_query: { id: "q", data, from: { id: +chat }, message: { chat: { id: +chat }, message_id: 3 } } });
  assert.equal(parseUpdates([cb("ma:m123")], "7").memes.accion, "aprobar");
  assert.equal(parseUpdates([cb("mx:m123")], "7").memes.accion, "no");
  assert.equal(parseUpdates([cb("ma:m123", "9")], "7").memes, null, "otro chat no manda");
  assert.equal(parseUpdates([{ update_id: 2, message: { chat: { id: 7 }, from: { id: 7 }, text: "/parar" } }], "7").memes.accion, "parar");
  assert.equal(parseUpdates([{ update_id: 2, message: { chat: { id: 7 }, from: { id: 7 }, text: "/seguir" } }], "7").memes.accion, "seguir");
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
  const cb = (data, chat = "7") => ({ update_id: 1, callback_query: { id: "q", data, from: { id: +chat }, message: { chat: { id: +chat }, message_id: 3 } } });
  const r = parseUpdates([cb("lb:dabc123")], "7"); assert.equal(r.act.accion, "liberar"); assert.equal(r.act.plan, "dabc123");
  assert.equal(parseUpdates([cb("lb:dabc123", "9")], "7").act, null);
});

// ---------- v479 · H-14 y H-15: Telegram ----------
const cbx = (id, data, { chat = 7, from = 7 } = {}) => ({ update_id: id, callback_query: { id: "q" + id, data, from: { id: from }, message: { chat: { id: chat }, message_id: id } } });
const falso = (fallaEn = new Set()) => { const F = { lanzadas: [], offsets: [], msgs: [], n: 0 };
  F.deps = { CHAT: "7", USER: "", say: async (c, t) => { F.msgs.push(t); }, api: async (m, b) => { if (m === "getUpdates") F.offsets.push(b.offset); return true; },
    dispatch: async (a, p) => { F.n++; if (fallaEn.has(F.n)) return false; F.lanzadas.push(a + ":" + p); return true; }, memesCtl: async () => true, bvCtl: async () => true };
  return F; };

test("v479 · H-14: varios botones pulsados seguidos se ejecutan TODOS y en orden; el mismo botón dos veces, una sola vez", async () => {
  const F = falso(); await procesa([cbx(12, "lb:b"), cbx(11, "lb:a"), cbx(13, "lb:a"), cbx(14, "ap:p1")], F.deps);
  assert.deepEqual(F.lanzadas, ["liberar:a", "liberar:b", "aprobar:p1"], "en el orden en que se pulsaron, sin repetir");
  assert.equal(Math.max(...F.offsets), 15, "todo marcado como leído");
});

test("v479 · H-14: si GitHub falla al lanzar una, se para ahí SIN marcarla como leída (se reintenta en la siguiente vuelta) y no se pierde ninguna", async () => {
  const F = falso(new Set([2])), ups = [cbx(21, "lb:a"), cbx(22, "lb:b"), cbx(23, "lb:c")]; await procesa(ups, F.deps);
  assert.deepEqual(F.lanzadas, ["liberar:a"]); assert.equal(Math.max(...F.offsets), 22, "solo la primera queda leída: la 22 y la 23 vuelven a llegar");
  const F2 = falso(); await procesa(ups.filter((u) => u.update_id >= 22), F2.deps); assert.deepEqual(F2.lanzadas, ["liberar:b", "liberar:c"]);
});

test("v479 · H-15: solo obedece a TU usuario: en un grupo, otro miembro no puede pulsar; con TELEGRAM_USER, solo esa persona", () => {
  assert.equal(parseUpdates([cbx(1, "lb:a", { chat: 7, from: 7 })], "7").items.length, 1, "chat privado: tú");
  assert.equal(parseUpdates([cbx(1, "lb:a", { chat: -100, from: 9 })], "-100").items.length, 0, "grupo sin TELEGRAM_USER: nadie");
  assert.equal(parseUpdates([cbx(1, "lb:a", { chat: -100, from: 9 })], "-100", "7").items.length, 0, "grupo: otro miembro, no");
  assert.equal(parseUpdates([cbx(1, "lb:a", { chat: -100, from: 7 })], "-100", "7").items.length, 1, "grupo: tú, sí");
  assert.equal(autorizado(undefined, "7"), false, "sin remitente, no");
  const msg = (t, from) => ({ update_id: 5, message: { chat: { id: -100 }, from: { id: from }, text: t } });
  assert.equal(parseUpdates([msg("/parar", 9)], "-100", "7").memes, null, "/parar de otro miembro: no"); assert.equal(parseUpdates([msg("/parar", 7)], "-100", "7").memes.accion, "parar");
});
