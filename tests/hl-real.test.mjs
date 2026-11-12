// v460 · 🧪 PRUEBAS DEL BOT REAL DE HYPERLIQUID contra un Hyperliquid y un GitHub DE MENTIRA (sin dinero, sin red).
// Cada prueba comprueba un comportamiento SEGURO: qué órdenes llegan al exchange, con qué tamaño y lado, y qué queda abierto.
import test from "node:test";
import assert from "node:assert/strict";
process.env.GITHUB_TOKEN = "tok-de-prueba";
process.env.GITHUB_REPOSITORY = "prueba/repo";
process.env.GITHUB_SHA = "a".repeat(40);
process.env.REAL_VIEW_PASS = "clave-de-prueba";
process.env.HL_AGENT_KEY = "1".repeat(64);
process.env.HL_WALLET = "0x" + "b".repeat(40);
const HL = await import("../runner/hl-real.mjs");
const { encrypt } = await import("../runner/real-cfg.mjs");
const H = 3600e3;

// ---------- el mundo de mentira ----------
function mundo(o = {}) {
  const W = { eq: o.eq ?? 100, neto: o.neto ?? 100, px: { BTC: 100, ETH: 10, SOL: 5, ...(o.px || {}) }, pos: {}, stops: [], oid: 1, fills: [], ordenes: [], refs: new Set(), guardado: null, avisos: [],
    ctl: o.ctl === undefined ? { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1 } : o.ctl, ctlFallo: o.ctlFallo || null, refsFallo: !!o.refsFallo,
    falloStop: o.falloStop || 0, ledgerFallo: !!o.ledgerFallo, falloCierre: new Set(o.falloCierre || []), parcial: o.parcial || 0, timeoutAbrir: !!o.timeoutAbrir, quiere: o.quiere || [] };
  for (const p of o.pos || []) { W.pos[p.c] = { szi: p.szi, entryPx: p.px ?? W.px[p.c] }; W.fills.push({ coin: p.c, dir: p.szi > 0 ? "Open Long" : "Open Short", time: Date.now() - (p.edadH ?? 1) * H, px: p.px ?? W.px[p.c], sz: Math.abs(p.szi) }); }
  for (const s of o.stops || []) W.stops.push({ coin: s.c, oid: W.oid++, side: s.side, sz: String(s.sz), origSz: String(s.sz), triggerPx: String(s.trig), isTrigger: true, orderType: "Stop Market" });
  const coins = Object.keys(W.px), j = (x, st = 200) => ({ ok: st < 400, status: st, json: async () => x, text: async () => JSON.stringify(x) });
  W.fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : null;
    if (u.includes("raw.githubusercontent.com") && u.includes("/hl-ctl/")) { if (W.ctlFallo === "red") throw new Error("fetch failed"); if (W.ctlFallo) return j({}, W.ctlFallo); return W.ctl ? j(W.ctl) : j({}, 404); }
    if (u.includes("raw.githubusercontent.com") && u.includes("/hl-real/")) return W.guardado ? j(W.guardado) : j({}, 404);
    if (u.includes("/contents/hl-real.json")) return W.guardado ? j({ t: W.guardado.t }) : j({}, 404);
    if (u.endsWith("/git/refs") && init.method === "POST") { if (W.refsFallo) return j({}, 500); if (W.refs.has(body.ref)) return j({ message: "Reference already exists" }, 422); W.refs.add(body.ref); return j({ ref: body.ref }, 201); }
    if (u.includes("/git/matching-refs/")) return j([]);
    if (u.endsWith("/info")) {
      const pos = () => Object.entries(W.pos).filter(([, p]) => p.szi !== 0).map(([c, p]) => ({ position: { coin: c, szi: String(p.szi), entryPx: String(p.entryPx), unrealizedPnl: String((W.px[c] - p.entryPx) * p.szi), positionValue: String(Math.abs(p.szi) * W.px[c]) } }));
      switch (body.type) {
        case "meta": return j({ universe: coins.map((c) => ({ name: c, szDecimals: 3 })) });
        case "clearinghouseState": return j({ marginSummary: { accountValue: String(W.eq) }, assetPositions: pos() });
        case "allMids": return j(Object.fromEntries(coins.map((c) => [c, String(W.px[c])])));
        case "userNonFundingLedgerUpdates": if (W.ledgerFallo) return j({}, 500); return j([{ delta: { type: "deposit", usdc: String(W.neto) } }]);
        case "userFills": return j(W.fills);
        case "extraAgents": return j([{ address: "0x" + "c".repeat(40), validUntil: Date.now() + 100 * 864e5 }]);
        case "frontendOpenOrders": return j(W.stops);
        default: return j([]);
      }
    }
    if (u.endsWith("/exchange")) {
      const a = body.action;
      if (a.type === "cancel") { for (const x of a.cancels) W.stops = W.stops.filter((s) => s.oid !== x.o); return j({ status: "ok", response: { type: "cancel", data: { statuses: a.cancels.map(() => "success") } } }); }
      const o2 = a.orders[0], c = coins[o2.a], sz = +o2.s, compra = o2.b;
      W.ordenes.push({ c, compra, sz, reduce: !!o2.r, stop: !!o2.t.trigger, trig: o2.t.trigger ? +o2.t.trigger.triggerPx : null, px: +o2.p });
      if (o2.t.trigger) { if (W.falloStop > 0) { W.falloStop--; return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "rechazada (prueba)" }] } } }); }
        W.stops.push({ coin: c, oid: W.oid++, side: compra ? "B" : "A", sz: String(sz), origSz: String(sz), triggerPx: o2.t.trigger.triggerPx, isTrigger: true, orderType: "Stop Market" }); return j({ status: "ok", response: { type: "order", data: { statuses: ["waitingForTrigger"] } } }); }
      if (o2.r) { if (W.falloCierre.has(c)) return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "sin liquidez (prueba)" }] } } });
        const p = W.pos[c]; if (!p || !p.szi) return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "nada que reducir" }] } } });
        const q = Math.min(sz, Math.abs(p.szi)); p.szi = p.szi > 0 ? p.szi - q : p.szi + q; if (Math.abs(p.szi) < 1e-9) delete W.pos[c]; W.fills.push({ coin: c, dir: "Close", time: Date.now(), px: W.px[c], sz: q, closedPnl: "0", fee: "0" });
        return j({ status: "ok", response: { type: "order", data: { statuses: [{ filled: { totalSz: String(q), avgPx: String(W.px[c]) } }] } } }); }
      if (W.timeoutAbrir) { const p = W.pos[c] || (W.pos[c] = { szi: 0, entryPx: W.px[c] }); p.szi += compra ? sz : -sz; throw new Error("The operation was aborted due to timeout"); }   // la orden SÍ entra, pero la respuesta se pierde
      const q = W.parcial ? +(sz * W.parcial).toFixed(3) : sz, p = W.pos[c] || (W.pos[c] = { szi: 0, entryPx: W.px[c] }); p.szi += compra ? q : -q; p.entryPx = W.px[c];
      W.fills.push({ coin: c, dir: compra ? "Open Long" : "Open Short", time: Date.now(), px: W.px[c], sz: q });
      return j({ status: "ok", response: { type: "order", data: { statuses: [{ filled: { totalSz: String(q), avgPx: String(W.px[c]) } }] } } });
    }
    throw new Error("URL no esperada en la prueba: " + u);
  };
  return W;
}
function conecta(W) {
  Object.assign(HL.deps, { fetch: W.fetch, firma: async () => ({ r: "0x1", s: "0x2", v: 27 }), direccion: async () => "0x" + "c".repeat(40), espera: async () => {},
    aviso: async (t) => { W.avisos.push(t); }, guardar: async (estado) => { W.guardado = { enc: 1, t: new Date().toISOString(), ...(await encrypt(JSON.stringify(estado), process.env.REAL_VIEW_PASS)) }; },
    metodo: async () => ({ x: { g: { h: 168, sl: 0.08 }, n: "método de prueba", k: "m1" }, IA: [], U: Object.keys(W.px) }), senales: async () => ({ quiere: W.quiere }) });
}
const abiertas = (W) => Object.entries(W.pos).filter(([, p]) => p.szi).map(([c, p]) => ({ c, szi: +p.szi.toFixed(6) }));
const aperturas = (W) => W.ordenes.filter((o) => !o.reduce && !o.stop);
const silencio = async (f) => { const l = console.log; console.log = () => {}; try { return await f(); } finally { console.log = l; } };

test("con tus ajustes leídos: abre lo que dice el método, cada posición con su stop −8 % en el lado contrario y por toda la cantidad", async () => {
  const W = mundo({ quiere: [{ c: "BTC", dir: -1 }, { c: "ETH", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.deepEqual(abiertas(W).map((x) => [x.c, Math.sign(x.szi)]), [["BTC", -1], ["ETH", 1]]);
  for (const x of abiertas(W)) { const s = W.stops.filter((z) => z.coin === x.c); assert.equal(s.length, 1); assert.equal(+s[0].sz, Math.abs(x.szi)); assert.equal(s[0].side, x.szi > 0 ? "A" : "B");
    const e = W.px[x.c], want = x.szi > 0 ? e * 0.92 : e * 1.08; assert.ok(Math.abs(+s[0].triggerPx / want - 1) < 0.001, `${x.c}: stop ${s[0].triggerPx} (esperado ${want})`); }
  const tot = abiertas(W).reduce((a, x) => a + Math.abs(x.szi) * W.px[x.c], 0); assert.ok(tot <= W.eq, "nunca más que el saldo (sin apalancamiento)");
});

test("si NO se pueden leer tus ajustes (error del servidor): no abre nada y avisa", async () => {
  const W = mundo({ ctlFallo: 500, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 0); assert.ok(W.avisos.some((t) => /no abro operaciones nuevas/.test(t)));
});

test("si falla la red al leer los ajustes: no abre nada", async () => {
  const W = mundo({ ctlFallo: "red", quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0);
});

test("sin ajustes guardados y sin estado anterior: se queda en pausa (no abre)", async () => {
  const W = mundo({ ctl: null, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0);
});

test("ajustes ilegibles NUNCA se sobrescriben: guardar un cambio sin poder leer los actuales falla sin escribir", async () => {
  const W = mundo({ ctlFallo: 500 }); conecta(W); process.env.CAMBIO = JSON.stringify({ uso: 50 });
  await assert.rejects(() => silencio(() => HL.guardaAjustes())); delete process.env.CAMBIO;
});

test("dos rondas a la vez en la misma hora: solo UNA opera (candado atómico), no se duplican las posiciones", async () => {
  const W = mundo({ quiere: [{ c: "BTC", dir: 1 }, { c: "ETH", dir: -1 }] }); conecta(W);
  await silencio(() => Promise.all([HL.ronda(), HL.ronda()]));
  assert.equal(aperturas(W).length, 2, "dos aperturas (una por cripto), no cuatro"); assert.equal(W.refs.size, 1);
});

test("si no se puede comprobar el candado: no abre nada, pero sí cierra lo que ha cumplido su tiempo", async () => {
  const W = mundo({ refsFallo: true, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: -0.1, edadH: 200 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 0); assert.deepEqual(abiertas(W), []);
});

test("si el stop se rechaza al abrir: lo reintenta y, si sigue fallando, cierra la posición al momento y no la deja sin protección", async () => {
  const W = mundo({ falloStop: 5, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.deepEqual(abiertas(W), [], "no queda nada abierto sin stop");
});

test("si el stop falla solo una vez: el reintento lo pone y la posición sigue abierta con su stop", async () => {
  const W = mundo({ falloStop: 1, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(abiertas(W).length, 1); assert.equal(W.stops.filter((s) => s.coin === "BTC").length, 1);
});

test("ejecución parcial al abrir: el stop cubre exactamente lo que se ejecutó", async () => {
  const W = mundo({ parcial: 0.5, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  const p = abiertas(W)[0], s = W.stops.find((z) => z.coin === "BTC"); assert.equal(+s.sz, Math.abs(p.szi));
});

test("stop con cantidad incorrecta (cubre solo la mitad): lo detecta y lo sustituye por uno de toda la posición", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.2 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  const s = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s.length, 1); assert.equal(+s[0].sz, 0.2);
});

test("stop en el lado equivocado: lo sustituye", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.2 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  const s = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s.length, 1); assert.equal(s[0].side, "B");
});

test("PARADO: si falla el cierre de una, sigue con las demás, comprueba lo que queda y lo dice", async () => {
  const W = mundo({ ctl: { estado: "parado", uso: 100, plazas: 5, freno: 0.35, puesto: 1 }, falloCierre: ["BTC"], pos: [{ c: "BTC", szi: 0.1 }, { c: "ETH", szi: 1 }, { c: "SOL", szi: -2 }] }); conecta(W);
  await silencio(() => HL.ronda());
  assert.deepEqual(abiertas(W).map((x) => x.c), ["BTC"], "ETH y SOL cerradas aunque BTC fallase");
  assert.ok(W.avisos.some((t) => /NO se ha cerrado del todo/.test(t))); assert.ok(!W.avisos.some((t) => /He cerrado todo \(comprobado/.test(t)));
});

test("FRENO: con todo cerrado de verdad lo confirma; no abre nada", async () => {
  const W = mundo({ eq: 60, neto: 100, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: 0.1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.deepEqual(abiertas(W), []); assert.equal(aperturas(W).length, 0); assert.ok(W.avisos.some((t) => /comprobado en Hyperliquid/.test(t)));
});

test("respuesta perdida al abrir (la orden sí entra): no se manda otra esa hora y la siguiente ronda la encuentra y le pone su stop", async () => {
  const W = mundo({ timeoutAbrir: true, quiere: [{ c: "BTC", dir: 1 }, { c: "ETH", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 1, "tras un resultado dudoso no se sigue abriendo");
  assert.equal(W.stops.filter((s) => s.coin === "BTC").length, 1, "la revisión de stops protege la posición que sí entró");
});

test("tras un reinicio: cada posición conserva SU duración aunque el método cambie (la de 168 h no se cierra a las 30 h)", async () => {
  const W = mundo({ quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  W.fills.forEach((f) => (f.time -= 30 * H));   // pasan 30 horas
  HL.deps.metodo = async () => ({ x: { g: { h: 24, sl: 0.05 }, n: "otro método", k: "m2" }, IA: [], U: Object.keys(W.px) }); W.quiere = []; W.guardado.t = new Date(Date.now() - 2 * H).toISOString(); W.refs.clear();
  await silencio(() => HL.ronda());
  assert.equal(abiertas(W).length, 1, "sigue abierta: su método dice 168 h");
});

// ---------- v461 ----------
test("stop INCORRECTO y la sustitución también falla: cierra la posición, lo comprueba y quita el stop malo", async () => {
  const W = mundo({ falloStop: 5, pos: [{ c: "BTC", szi: -0.2 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.deepEqual(abiertas(W), [], "cerrada"); assert.equal(W.stops.filter((z) => z.coin === "BTC").length, 0, "sin stops huérfanos");
});
test("ajustes INCOMPLETOS (falta el freno) o fuera de rango: no se rellenan con los de fábrica, no abre nada", async () => {
  for (const ctl of [{ estado: "on", uso: 100, plazas: 5, puesto: 1 }, { estado: "on", uso: 100, plazas: 5, freno: 0.9, puesto: 1 }, { estado: "on", uso: 999, plazas: 5, freno: 0.35, puesto: 1 }]) {
    const W = mundo({ ctl, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0, JSON.stringify(ctl)); }
  assert.equal(HL.ctlCompleto({ estado: "on", uso: 100, plazas: 0, freno: 0.5, puesto: 1 }), true);
});
test("si no se puede leer el historial de ingresos (lo necesita el freno): no abre nada", async () => {
  const W = mundo({ ledgerFallo: true, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0);
});
test("tope de exposición con posiciones previas grandes: nunca se pasa del saldo", async () => {
  const W = mundo({ eq: 100, px: { BTC: 100, ETH: 10, SOL: 5 }, pos: [{ c: "BTC", szi: 0.7, px: 100 }], stops: [{ c: "BTC", side: "A", sz: 0.7, trig: 92 }], quiere: [{ c: "ETH", dir: 1 }, { c: "SOL", dir: -1 }] }); conecta(W);
  await silencio(() => HL.ronda());
  const expo = abiertas(W).reduce((a, x) => a + Math.abs(x.szi) * W.px[x.c], 0); assert.ok(expo <= 100 + 1e-9, "exposición " + expo);
});
