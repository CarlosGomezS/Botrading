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
    falloStop: o.falloStop || 0, stopIncompleto: o.stopIncompleto || 0, fillsRoto: !!o.fillsRoto, estadoRoto: !!o.estadoRoto, guardarFalla: !!o.guardarFalla, ledgerFallo: !!o.ledgerFallo, rompeTrasCierre: !!o.rompeTrasCierre, cancelFalla: o.cancelFalla || 0, marcasFallo: !!o.marcasFallo, ordenesFallo: !!o.ordenesFallo, lab: o.lab || null, falloCierre: new Set(o.falloCierre || []), parcial: o.parcial || 0, timeoutAbrir: !!o.timeoutAbrir, quiere: o.quiere || [] };
  for (const p of o.pos || []) { W.pos[p.c] = { szi: p.szi, entryPx: p.px ?? W.px[p.c] }; W.fills.push({ coin: p.c, dir: p.szi > 0 ? "Open Long" : "Open Short", time: Date.now() - (p.edadH ?? 1) * H, px: p.px ?? W.px[p.c], sz: Math.abs(p.szi) }); }
  for (const s of o.stops || []) W.stops.push({ coin: s.c, oid: W.oid++, ...(s.side ? { side: s.side } : {}), sz: String(s.sz), origSz: String(s.sz), triggerPx: String(s.trig), isTrigger: !s.limite, orderType: s.limite ? "Limit" : s.tipo || "Stop Market", reduceOnly: s.noReduce ? false : true });
  // v466 · con posiciones de partida, el bot ya tenía su estado (salvo que la prueba diga lo contrario)
  if ((o.pos || []).length && !o.sinEstado) W.estadoIni = { pm: Object.fromEntries(o.pos.map((p) => [p.c, { h: 168, sl: 0.08, k: "m1" }])) };
  const coins = Object.keys(W.px), j = (x, st = 200) => ({ ok: st < 400, status: st, json: async () => x, text: async () => JSON.stringify(x) });
  W.fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : null;
    if (u.includes("raw.githubusercontent.com") && u.includes("/hl-ctl/")) { if (W.ctlFallo === "red") throw new Error("fetch failed"); if (W.ctlFallo) return j({}, W.ctlFallo); return W.ctl ? j(W.ctl) : j({}, 404); }
    if (u.includes("raw.githubusercontent.com") && u.includes("/hl-real/")) { if (W.estadoRoto) return j({}, 500); if (!W.guardado && W.estadoIni) W.guardado = { enc: 1, t: new Date(Date.now() - 2 * H).toISOString(), ...(await encrypt(JSON.stringify(W.estadoIni), process.env.REAL_VIEW_PASS)) }; return W.guardado ? j(W.guardado) : j({}, 404); }
    if (u.includes("/caza-lab/caza-lab.json")) return W.lab ? j(W.lab) : j({}, 404);
    if (u.includes("/ia-lab/ia-lab.json")) return j({});
    if (u.includes("/contents/hl-real.json")) return W.guardado ? j({ t: W.guardado.t }) : j({}, 404);
    if (u.endsWith("/git/refs") && init.method === "POST") { if (W.refsFallo) return j({}, 500); if (W.refs.has(body.ref)) return j({ message: "Reference already exists" }, 422); W.refs.add(body.ref); return j({ ref: body.ref }, 201); }
    if (u.includes("/git/matching-refs/")) { if (W.marcasFallo && u.includes("hl-freno")) return j({}, 500); const pre = "refs/" + u.split("/git/matching-refs/")[1]; return j([...W.refs].filter((r) => r.startsWith(pre)).map((ref) => ({ ref }))); }
    if (u.includes("/git/ref/tags/")) return W.refs.has("refs/" + u.slice(u.indexOf("/git/ref/") + 9)) ? j({}) : j({}, 404);
    if (init.method === "DELETE" && u.includes("/git/refs/")) { W.refs.delete(u.slice(u.indexOf("refs/"))); return j({}, 204); }
    if (u.endsWith("/info")) {
      const pos = () => Object.entries(W.pos).filter(([, p]) => p.szi !== 0).map(([c, p]) => ({ position: { coin: c, szi: String(p.szi), entryPx: String(p.entryPx), unrealizedPnl: String((W.px[c] - p.entryPx) * p.szi), positionValue: String(Math.abs(p.szi) * W.px[c]) } }));
      switch (body.type) {
        case "meta": return j({ universe: coins.map((c) => ({ name: c, szDecimals: 3 })) });
        case "clearinghouseState": if (W.chRoto) return j({}, 500); return j({ marginSummary: { accountValue: String(W.eq) }, assetPositions: pos() });
        case "allMids": return j(Object.fromEntries(coins.map((c) => [c, String(W.px[c])])));
        case "userNonFundingLedgerUpdates": if (W.ledgerFallo) return j({}, 500); return j([{ delta: { type: "deposit", usdc: String(W.neto) } }]);
        case "userFills": if (W.fillsRoto) return j({}, 500); return j(W.fills);
        case "extraAgents": return j([{ address: "0x" + "c".repeat(40), validUntil: Date.now() + 100 * 864e5 }]);
        case "frontendOpenOrders": if (W.ordenesFallo) return j({}, 500); return j(W.stops);
        default: return j([]);
      }
    }
    if (u.endsWith("/exchange")) {
      const a = body.action;
      if (a.type === "cancel") { if (W.cancelFalla > 0) { W.cancelFalla--; return j({ status: "ok", response: { type: "cancel", data: { statuses: a.cancels.map(() => "success") } } }); }   // dice «success» pero no cancela
        for (const x of a.cancels) W.stops = W.stops.filter((s) => s.oid !== x.o); return j({ status: "ok", response: { type: "cancel", data: { statuses: a.cancels.map(() => "success") } } }); }
      const o2 = a.orders[0], c = coins[o2.a], sz = +o2.s, compra = o2.b;
      W.ordenes.push({ c, compra, sz, reduce: !!o2.r, stop: !!o2.t.trigger, trig: o2.t.trigger ? +o2.t.trigger.triggerPx : null, px: +o2.p });
      if (o2.t.trigger && W.stopIncompleto > 0) { W.stopIncompleto--; return j({ status: "ok", response: { type: "order" } }); }
      if (o2.t.trigger) { if (W.falloStop > 0) { W.falloStop--; return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "rechazada (prueba)" }] } } }); }
        W.stops.push({ coin: c, oid: W.oid++, side: compra ? "B" : "A", sz: String(sz), origSz: String(sz), triggerPx: o2.t.trigger.triggerPx, isTrigger: true, orderType: "Stop Market", reduceOnly: !!o2.r }); return j({ status: "ok", response: { type: "order", data: { statuses: ["waitingForTrigger"] } } }); }
      if (o2.r) { if (W.falloCierre.has(c)) return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "sin liquidez (prueba)" }] } } });
        const p = W.pos[c]; if (!p || !p.szi) return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "nada que reducir" }] } } });
        if (W.rompeTrasCierre) W.chRoto = true; const q = Math.min(sz, Math.abs(p.szi)); p.szi = p.szi > 0 ? p.szi - q : p.szi + q; if (Math.abs(p.szi) < 1e-9) delete W.pos[c]; W.fills.push({ coin: c, dir: "Close", time: Date.now(), px: W.px[c], sz: q, closedPnl: "0", fee: "0" });
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
    aviso: async (t) => { W.avisos.push(t); }, guardar: async (estado) => { if (W.guardarFalla) return false; W.guardado = { enc: 1, t: new Date().toISOString(), ...(await encrypt(JSON.stringify(estado), process.env.REAL_VIEW_PASS)) }; },
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

// ---------- v462 ----------
test("cierre aceptado pero NO se puede comprobar: no se da por cerrada, no se quita el stop (aunque sea imperfecto) y avisa", async () => {
  const W = mundo({ falloStop: 5, rompeTrasCierre: true, pos: [{ c: "BTC", szi: -0.2 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W);
  await silencio(() => HL.ronda());
  assert.equal(W.stops.filter((z) => z.coin === "BTC").length, 1, "el stop sigue puesto"); assert.ok(W.avisos.some((t) => /no he podido comprobarlo|puede seguir abierta/.test(t)));
});
test("al abrir: stop imposible y cierre sin poder comprobarlo → no sigue abriendo esa hora y avisa", async () => {
  const W = mundo({ falloStop: 5, rompeTrasCierre: true, quiere: [{ c: "BTC", dir: 1 }, { c: "ETH", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 1, "solo la primera"); assert.ok(W.avisos.some((t) => /puede estar abierta SIN stop/.test(t)));
});

// ---------- v465 ----------
test("si falla el historial de operaciones: NO cierra por tiempo una posición (no se inventa su antigüedad) y no abre nada", async () => {
  const W = mundo({ fillsRoto: true, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: -0.1, edadH: 2 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.deepEqual(abiertas(W).map((x) => x.c), ["BTC"], "sigue abierta"); assert.equal(aperturas(W).length, 0);
});
test("la hora de apertura queda guardada: aunque luego falle el historial, la posición se cierra a su hora (ni antes ni nunca)", async () => {
  const W = mundo({ quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  const reabre = async (hAtras) => { W.fills = []; W.fillsRoto = true; W.quiere = []; W.refs.clear(); W.guardado.t = new Date(Date.now() - 2 * H).toISOString(); const st = await (await import("../runner/real-cfg.mjs")).decrypt(W.guardado, process.env.REAL_VIEW_PASS); const S = JSON.parse(st); S.pm.BTC.t0 = Date.now() - hAtras * H; W.guardado = { enc: 1, t: W.guardado.t, ...(await encrypt(JSON.stringify(S), process.env.REAL_VIEW_PASS)) }; await silencio(() => HL.ronda()); };
  await reabre(30); assert.equal(abiertas(W).length, 1, "a las 30 h sigue (su método dice 168 h)");
  await reabre(170); assert.equal(abiertas(W).length, 0, "a las 170 h se cierra, sin necesitar el historial");
});
test("respuesta del stop INCOMPLETA (sin estado): no cuenta como puesto → no queda abierta sin stop", async () => {
  const W = mundo({ stopIncompleto: 5, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.deepEqual(abiertas(W), []);
});
test("stop SIN campo de lado: no se da por verificado y se sustituye por uno completo", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.2 }], stops: [{ c: "BTC", sz: 0.2, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  const s2 = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s2.length, 1); assert.equal(s2[0].side, "B");
});
test("estado guardado ILEGIBLE (existe pero no se puede leer): no abre nada, no cierra por tiempo y avisa", async () => {
  const W = mundo({ estadoRoto: true, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: -0.1, edadH: 500 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 0); assert.equal(abiertas(W).length, 1); assert.ok(W.avisos.some((t) => /estado guardado/.test(t)));
});
test("si no se puede GUARDAR el estado antes de abrir: no abre nada y avisa", async () => {
  const W = mundo({ guardarFalla: true, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0); assert.ok(W.avisos.some((t) => /no he podido guardar/.test(t)));
});
test("FRENO ENCLAVADO: si la cuenta se recupera sigue echado; solo se rearma al volver a guardar tus ajustes", async () => {
  const W = mundo({ eq: 60, neto: 100, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: 0.1 }], ctl: { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1, t: new Date(Date.now() - 864e5).toISOString() } }); conecta(W);
  await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0);
  const otra = async () => { W.refs.clear(); W.guardado.t = new Date(Date.now() - 2 * H).toISOString(); await silencio(() => HL.ronda()); };
  W.eq = 100; await otra(); assert.equal(aperturas(W).length, 0, "recuperada, pero el freno sigue echado");
  W.ctl = { ...W.ctl, t: new Date().toISOString() }; await otra(); assert.equal(aperturas(W).length, 1, "rearmado al guardar los ajustes");
});

// ---------- v466 ----------
const otraHora = async (W) => { for (const r of [...W.refs]) if (r.includes("hl-lock-")) W.refs.delete(r); if (W.guardado) W.guardado.t = new Date(Date.now() - 2 * H).toISOString(); await silencio(() => HL.ronda()); };
test("v466 · FRENO aunque falle el guardado: queda marcado aparte y sigue echado en la ronda siguiente aunque la cuenta se recupere", async () => {
  const W = mundo({ eq: 60, neto: 100, guardarFalla: true, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: 0.1 }], ctl: { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1, t: new Date(Date.now() - 864e5).toISOString() } }); conecta(W);
  await silencio(() => HL.ronda()); assert.ok([...W.refs].some((r) => r.includes("hl-freno-")), "marca del freno puesta"); assert.ok(W.avisos.some((t) => /una de sus dos copias/.test(t)), "avisa de que el estado no se guardó");
  W.eq = 100; W.guardarFalla = false; await otraHora(W); assert.equal(aperturas(W).length, 0, "el estado guardado NO tiene el freno, pero la marca lo mantiene");
  W.ctl = { ...W.ctl, t: new Date(Date.now() + 2000).toISOString() }; await otraHora(W); assert.equal(aperturas(W).length, 1, "rearmado al volver a guardar los ajustes");
});
test("v466 · FRENO sin poder guardarlo por ninguna vía: aviso urgente de poner en pausa", async () => {
  const W = mundo({ eq: 60, neto: 100, guardarFalla: true, refsFallo: true, pos: [{ c: "BTC", szi: 0.1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.ok(W.avisos.some((t) => /PAUSA/.test(t))); assert.equal(aperturas(W).length, 0);
});
test("v466 · si no se puede leer la marca del freno: no abre nada", async () => {
  const W = mundo({ marcasFallo: true, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0);
});
test("v466 · ESTADO DESAPARECIDO con posiciones: no las adopta, no abre, no cierra por tiempo, no mueve su stop; al guardar ajustes, las gestiona", async () => {
  const W = mundo({ sinEstado: true, quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: -0.1, edadH: 500 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }], ctl: { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1, t: new Date(Date.now() - 864e5).toISOString() } }); conecta(W);
  await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 0); assert.equal(abiertas(W).length, 1, "no la cierra por tiempo"); assert.deepEqual(W.stops.map((s) => +s.triggerPx), [108], "su stop sigue igual");
  assert.ok(W.avisos.some((t) => /no tiene su estado guardado/.test(t)));
  await otraHora(W); assert.equal(aperturas(W).length, 0, "sigue bloqueado en la ronda siguiente"); assert.equal(abiertas(W).length, 1);
  W.ctl = { ...W.ctl, t: new Date(Date.now() + 2000).toISOString() }; await otraHora(W); assert.ok(!abiertas(W).some((x) => x.c === "BTC"), "revisado: ya la gestiona (cerrada por tiempo)");
});
test("v466 · lo ingresado neto no es positivo: no abre y avisa", async () => {
  const W = mundo({ neto: 0, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0); assert.ok(W.avisos.some((t) => /no es positivo/.test(t)));
});
test("v466 · un stop que NO es «solo cerrar» (reduceOnly) no vale: se pone uno bueno y el viejo se cancela", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108, noReduce: true }] }); conecta(W); await silencio(() => HL.ronda());
  const s = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s.length, 1); assert.equal(s[0].reduceOnly, true);
});
test("v466 · si la cancelación del stop viejo dice «ok» pero no se cancela: lo detecta, reintenta y avisa de stop duplicado", async () => {
  const W = mundo({ cancelFalla: 3, pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 130 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.ok(W.avisos.some((t) => /duplicado/.test(t)));
  const W2 = mundo({ cancelFalla: 1, pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 130 }] }); conecta(W2); await silencio(() => HL.ronda());
  assert.equal(W2.stops.filter((z) => z.coin === "BTC").length, 1, "el reintento lo cancela"); assert.ok(!W2.avisos.some((t) => /duplicado/.test(t)));
});

// ---------- v467 ----------
test("v467 · un stop BUENO junto a uno MALO (no «solo cerrar», lado contrario): el malo se cancela y se comprueba; queda solo el bueno", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }, { c: "BTC", side: "A", sz: 0.1, trig: 108, noReduce: true }] }); conecta(W); await silencio(() => HL.ronda());
  const s = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s.length, 1); assert.equal(s[0].side, "B"); assert.equal(s[0].reduceOnly, true); assert.equal(+s[0].triggerPx, 108, "el bueno no se toca");
});
test("v467 · un stop que no es «Stop Market» (p. ej. stop-limit) no vale: se sustituye", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108, tipo: "Stop Limit" }] }); conecta(W); await silencio(() => HL.ronda());
  const s = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s.length, 1); assert.equal(s[0].orderType, "Stop Market");
});
test("v467 · posición SIN estado: su stop solo se respeta si protege de verdad (lado bueno y como mucho −25 %)", async () => {
  for (const [trig, queda] of [[108, true], [140, false], [95, false]]) {
    const W = mundo({ sinEstado: true, pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig }] }); conecta(W); await silencio(() => HL.ronda());
    const s = W.stops.filter((z) => z.coin === "BTC"); assert.equal(s.length, 1, "trig " + trig); assert.equal(+s[0].triggerPx === trig, queda, `stop a ${trig}: ${queda ? "se respeta" : "se sustituye"} (quedó ${s[0].triggerPx})`);
    if (!queda) assert.ok(Math.abs(+s[0].triggerPx - 125) < 0.5, "el de emergencia −25 %");
  }
});
test("v467 · si no se pueden consultar las órdenes: aviso explícito de que los stops NO se han revisado", async () => {
  const W = mundo({ ordenesFallo: true, pos: [{ c: "BTC", szi: -0.1 }] }); conecta(W); await silencio(() => HL.ronda()); assert.ok(W.avisos.some((t) => /NO he podido revisar los stops/.test(t)));
});
test("v467 · FRENO sin nada abierto: también avisa (una vez)", async () => {
  const W = mundo({ eq: 60, neto: 100 }); conecta(W); await silencio(() => HL.ronda()); assert.equal(W.avisos.filter((t) => /ha caído más de/.test(t)).length, 1);
  await otraHora(W); assert.equal(W.avisos.filter((t) => /ha caído más de/.test(t)).length, 1, "no repite el aviso cada hora");
});
test("v467 · CUARENTENA estricta: sin datos de cuarentena, vacía o no superada → no se usa; superada o exenta → sí; nunca el podio antiguo", async () => {
  assert.equal(HL.cuarentenaOk({ k: 1 }), false); assert.equal(HL.cuarentenaOk({ cuar: {} }), false); assert.equal(HL.cuarentenaOk({ cuar: { ok: false } }), false);
  assert.equal(HL.cuarentenaOk({ cuar: { ok: "true" } }), false); assert.equal(HL.cuarentenaOk({ cuar: { ok: true } }), true); assert.equal(HL.cuarentenaOk({ cuar: { exento: true } }), true);
  const met = { k: "m1", n: "x", g: { a: 0, b: null, f: "nada", h: 24, sl: 0.08 } };
  for (const [lab, abre] of [[{ aprobadas: [met], criptos: ["BTC"] }, 0], [{ aprobadas: [], podio: [met], criptos: ["BTC"] }, 0], [{ aprobadas: [{ ...met, cuar: { ok: false } }] }, 0], [{ aprobadas: [{ ...met, cuar: { ok: true } }], criptos: ["BTC"] }, 1]]) {
    const W = mundo({ lab, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); HL.deps.metodo = null; await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, abre, JSON.stringify(lab).slice(0, 80));
  }
});
test("v467 · guardar ajustes con un cambio no válido: termina con ERROR (no como guardado)", async () => {
  process.env.CAMBIO = "{no es json"; await assert.rejects(silencio(() => HL.guardaAjustes())); delete process.env.CAMBIO;
});

// ---------- v468 ----------
test("v468 · el bot SOLO toca stops: una orden límite tuya o una toma de beneficios no se cancelan nunca (ni con stop bueno, ni al sustituir uno malo, ni sin posición)", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1 }, { c: "ETH", szi: 1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }, { c: "BTC", side: "B", sz: 0.1, trig: 90, limite: true }, { c: "BTC", side: "B", sz: 0.1, trig: 92, tipo: "Take Profit Market" },
    { c: "ETH", side: "A", sz: 1, trig: 5, noReduce: true }, { c: "ETH", side: "A", sz: 1, trig: 12, limite: true }, { c: "SOL", side: "B", sz: 1, trig: 4, limite: true }] }); conecta(W); await silencio(() => HL.ronda());
  const tipos = (c) => W.stops.filter((z) => z.coin === c).map((z) => z.orderType).sort();
  assert.deepEqual(tipos("BTC"), ["Limit", "Stop Market", "Take Profit Market"], "BTC: stop bueno + límite + toma de beneficios intactos");
  assert.deepEqual(tipos("ETH"), ["Limit", "Stop Market"], "ETH: el stop malo se sustituye; la límite sigue");
  assert.ok(W.stops.find((z) => z.coin === "ETH" && z.orderType === "Stop Market").reduceOnly, "el nuevo es «solo cerrar»");
  assert.deepEqual(tipos("SOL"), ["Limit"], "SOL (sin posición): la límite no se toca");
});
test("v468 · al rearmar el freno se borran sus marcas viejas; un 422 solo cuenta si la marca existe", async () => {
  const W = mundo({ eq: 60, neto: 100, ctl: { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1, t: new Date(Date.now() - 864e5).toISOString() } }); conecta(W); await silencio(() => HL.ronda());
  assert.equal([...W.refs].filter((r) => r.includes("hl-freno-")).length, 1);
  W.eq = 100; W.ctl = { ...W.ctl, t: new Date(Date.now() + 2000).toISOString() }; await otraHora(W); assert.equal([...W.refs].filter((r) => r.includes("hl-freno-")).length, 0, "marcas limpiadas al rearmar");
  assert.equal(await HL.ponMarcaFreno(new Date().toISOString()), true); assert.equal(await HL.ponMarcaFreno(new Date().toISOString()), true, "ya existe (422) y se comprueba que está");
});
