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
const { HL, H, mundo, conecta, abiertas, aperturas, silencio, otraHora } = await import("./hl-mundo.mjs");
const { encrypt } = await import("../runner/real-cfg.mjs");


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
test("v467/v476 · posición SIN estado: su stop se respeta si protege; si no protege, el bot AÑADE el suyo (−25 %) y NO cancela el que no es suyo", async () => {
  for (const [trig, queda] of [[108, true], [140, false], [95, false]]) {
    const W = mundo({ sinEstado: true, pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig }] }); conecta(W); await silencio(() => HL.ronda());
    const s = W.stops.filter((z) => z.coin === "BTC").map((z) => +z.triggerPx).sort((a, b) => a - b);
    if (queda) assert.deepEqual(s, [trig], "el suyo protege: no se toca ni se añade nada");
    else { assert.ok(s.includes(trig), `stop a ${trig}: no es del bot, sigue ahí`); assert.ok(s.some((x) => Math.abs(x - 125) < 0.5), "y el bot añade el de emergencia −25 %"); assert.ok(W.avisos.some((t) => /no ha puesto el bot/.test(t)), "avisa"); }
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

// ---------- v469 ----------
test("v469 · una orden condicional de tipo DESCONOCIDO no se cancela nunca (ni con posición ni sin ella): se avisa una vez", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }, { c: "BTC", side: "B", sz: 0.1, trig: 105, tipo: "Trailing Stop" }, { c: "SOL", side: "B", sz: 1, trig: 4, tipo: "Algo Nuevo" }] }); conecta(W); await silencio(() => HL.ronda());
  assert.ok(W.stops.some((z) => z.orderType === "Trailing Stop") && W.stops.some((z) => z.orderType === "Algo Nuevo"), "no se tocan");
  assert.equal(W.avisos.filter((t) => /tipo que el bot no conoce/.test(t)).length, 1);
  await otraHora(W); assert.equal(W.avisos.filter((t) => /tipo que el bot no conoce/.test(t)).length, 1, "no repite el aviso cada hora");
});
test("v469 · limpieza de marcas del freno: TODAS (más de 100, por páginas) y comprobada; si no se puede borrar, aviso una vez", async () => {
  const W = mundo({}); conecta(W); const t0 = Date.UTC(2026, 0, 1); for (let i = 0; i < 150; i++) W.refs.add("refs/tags/hl-freno-" + new Date(t0 + i * 60e3).toISOString().replace(/\D/g, "").slice(0, 14));
  assert.equal(await HL.limpiaMarcasFreno(Date.now()), true); assert.equal([...W.refs].filter((r) => r.includes("hl-freno-")).length, 0, "las 150 borradas");
  W.refs.add("refs/tags/hl-freno-20260101000000"); W.borrarFalla = true; assert.equal(await HL.limpiaMarcasFreno(Date.now()), false, "no se pudo: lo dice");
  const W2 = mundo({ borrarFalla: true, ctl: { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1, t: new Date().toISOString() } }); W2.refs.add("refs/tags/hl-freno-20260101000000"); conecta(W2); await silencio(() => HL.ronda());
  assert.equal(W2.avisos.filter((t) => /marcas viejas del freno/.test(t)).length, 1); await otraHora(W2); assert.equal(W2.avisos.filter((t) => /marcas viejas del freno/.test(t)).length, 1, "una sola vez");
});

// ---------- v470 · marcas del freno: solo vale una lectura COMPLETA ----------
const marcas = (W, n, t0 = Date.UTC(2025, 0, 1)) => { for (let i = 0; i < n; i++) W.refs.add("refs/tags/hl-freno-" + new Date(t0 + i * 60e3).toISOString().replace(/\D/g, "").slice(0, 14)); return Math.floor((t0 + (n - 1) * 60e3) / 1000) * 1000; };
test("v470 · marcas en varias páginas (250: páginas de 100, 100 y 50): se leen todas y la más reciente, que está en la ÚLTIMA página, cuenta", async () => {
  const W = mundo({}); conecta(W); const ult = marcas(W, 250); const r = await HL.marcasFreno(); assert.equal(r.ok, true); assert.equal(r.t, ult); assert.deepEqual(W.paginas, [1, 2, 3]);
});
test("v470 · más de 2.000 marcas (2.150): se leen todas; con 5.000 justas (límite de páginas sin poder demostrar el final) = FALLO", async () => {
  const W = mundo({}); conecta(W); const ult = marcas(W, 2150); const r = await HL.marcasFreno(); assert.equal(r.ok, true); assert.equal(r.t, ult); assert.equal(W.paginas.length, 22);
  const W2 = mundo({}); conecta(W2); marcas(W2, HL.MARCAS_MAX_PAG * 100); assert.equal((await HL.marcasFreno()).ok, false, "llega al límite sin terminar: no se da por buena");
});
test("v470 · página repetida, error HTTP o de red en una página intermedia: la lectura es un FALLO (nunca una lista a medias como buena)", async () => {
  for (const o of [{ pagRepetida: 1 }, { pagFallo: 2 }, { pagRed: 2 }]) { const W = mundo(o); conecta(W); marcas(W, 150); const r = await HL.marcasFreno(); assert.equal(r.ok, false, JSON.stringify(o)); assert.equal(await HL.limpiaMarcasFreno(Date.now()), false, "tampoco se da por hecha la limpieza: " + JSON.stringify(o)); }
});
test("v470 · si la lectura de marcas es dudosa (página repetida), esa hora NO se abre nada", async () => {
  const W = mundo({ pagRepetida: 1, quiere: [{ c: "BTC", dir: 1 }] }); conecta(W); marcas(W, 150); W.ctl = { ...W.ctl, t: new Date().toISOString() }; await silencio(() => HL.ronda()); assert.equal(aperturas(W).length, 0, "freno rearmado, pero la lectura de marcas no es fiable");
  const W2 = mundo({ quiere: [{ c: "BTC", dir: 1 }] }); conecta(W2); marcas(W2, 150); W2.ctl = { ...W2.ctl, t: new Date().toISOString() }; await silencio(() => HL.ronda()); assert.equal(aperturas(W2).length, 1, "control: con lectura completa y freno rearmado, sí abre");
});

// ---------- v475 · H-03: integridad de los datos en vivo ----------
test("v475 · H-03: datos en vivo con huecos (velas o financiación), sin la última vela o con pocas velas → esa cripto no da señal", () => {
  const T = Array.from({ length: 1200 }, (_, i) => i * H), ok = () => ({ k: new Map(T.map((t) => [t, [100, 1, 101, 99]])), f: new Map(T.map((t) => [t, 0.0001])) });
  assert.deepEqual(HL.integridadViva(T, ok()), { ok: true });
  const a = ok(); a.k.delete(T.at(-1)); assert.equal(HL.integridadViva(T, a).ok, false, "falta la última vela");
  const b = ok(); for (let i = 500; i < 530; i++) b.k.delete(T[i]); assert.equal(HL.integridadViva(T, b).ok, false, "30 h seguidas sin velas");
  const b2 = ok(); for (let i = 500; i < 520; i++) b2.k.delete(T[i]); assert.equal(HL.integridadViva(T, b2).ok, true, "20 h sí se toleran (como en el laboratorio)");
  const c = ok(); for (let i = 0; i < 300; i++) c.f.delete(T[i]); assert.equal(HL.integridadViva(T, c).ok, false, "sin financiación al principio");
  const e = ok(); for (let i = 1170; i < 1200; i++) e.f.delete(T[i]); assert.equal(HL.integridadViva(T, e).ok, false, "financiación sin datos recientes");
  const f = ok(); for (let i = 0; i < 1200; i += 4) f.k.delete(T[i]); assert.equal(HL.integridadViva(T, f).ok, false, "con un 25 % de velas faltando");
  assert.equal(HL.integridadViva(T, null).ok, false);
});

// ---------- v476 · H-08: el bot solo cancela SUS stops ----------
test("v476 · H-08: un stop TUYO en una cripto sin posición del bot NO se cancela (se avisa una vez); uno que dejó el bot, sí", async () => {
  const W = mundo({ stops: [{ c: "BTC", side: "A", sz: 0.1, trig: 90 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(W.stops.filter((z) => z.coin === "BTC").length, 1, "tu stop sigue"); assert.equal(W.avisos.filter((t) => /no ha puesto el bot/.test(t)).length, 1);
  await otraHora(W); assert.equal(W.stops.filter((z) => z.coin === "BTC").length, 1); assert.equal(W.avisos.filter((t) => /no ha puesto el bot/.test(t)).length, 1, "no repite el aviso");
  // uno que SÍ es del bot: su posición se cierra (p. ej. por tiempo) y el stop queda huérfano → la ronda siguiente lo cancela
  const W2 = mundo({ pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] }); conecta(W2); await silencio(() => HL.ronda());
  assert.equal(W2.stops.filter((z) => z.coin === "BTC").length, 1, "stop del bot apuntado");
  W2.pos = []; await otraHora(W2); assert.equal(W2.stops.filter((z) => z.coin === "BTC").length, 0, "huérfano del bot: cancelado");
  assert.ok(!W2.avisos.some((t) => /no ha puesto el bot/.test(t)), "sin falsos avisos");
});

// ---------- v476 · deslizamiento real apuntado ----------
test("v476 · se apunta el deslizamiento REAL de cada orden (positivo = peor que el precio medio), solo porcentajes", async () => {
  assert.equal(HL.deslizamiento(true, 100, 100.1), 0.1); assert.equal(HL.deslizamiento(false, 100, 99.9), 0.1); assert.equal(HL.deslizamiento(true, 100, 99.95), -0.05); assert.equal(HL.deslizamiento(true, 0, 1), null);
  const W = mundo({ quiere: [{ c: "ETH", dir: 1 }] }); W.slipFill = 0.001; conecta(W); await silencio(() => HL.ronda());
  const S = JSON.parse(await (await import("../runner/real-cfg.mjs")).decrypt(W.guardado, process.env.REAL_VIEW_PASS));
  assert.equal(aperturas(W).length, 1); assert.ok(Array.isArray(S.slip) && S.slip.length === 1); assert.equal(S.slip[0].x, "abre"); assert.ok(Math.abs(S.slip[0].d - 0.1) < 1e-6, "0,1 % peor");
  assert.deepEqual(Object.keys(S.slip[0]).sort(), ["d", "t", "x"], "sin importes ni criptos");
});

// ---------- v477 · auditoría v476 ----------
const estadoDe = async (W) => JSON.parse(await (await import("../runner/real-cfg.mjs")).decrypt(W.guardado, process.env.REAL_VIEW_PASS));

test("v477 · H-01: dos stops TUYOS en una cripto que gestiona el bot: ninguno se cancela ni se apunta como del bot", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }, { c: "BTC", side: "B", sz: 0.1, trig: 108 }] });
  W.estadoIni.misStops = [];   // el bot ya lleva la cuenta de sus stops (v476+) y estos dos no son suyos
  conecta(W); await silencio(() => HL.ronda());
  assert.equal(W.stops.filter((z) => z.coin === "BTC").length, 2, "los dos siguen");
  assert.ok(!W.ordenes.some((o) => o.stop), "la posición ya está protegida: no pone otro");
  assert.deepEqual((await estadoDe(W)).misStops, [], "no se apropia de ninguno");
});

test("v477 · H-01: el stop que pone el bot al abrir SÍ queda apuntado como suyo (y al cerrar la posición se cancela)", async () => {
  const W = mundo({ quiere: [{ c: "ETH", dir: 1 }] }); conecta(W); await silencio(() => HL.ronda());
  const S = await estadoDe(W); assert.equal(W.stops.length, 1); assert.deepEqual(S.misStops, [W.stops[0].oid]);
  W.pos = {}; W.quiere = []; await otraHora(W); assert.equal(W.stops.length, 0, "huérfano del bot: cancelado");
});

test("v477 · H-07: una posición que el bot no tiene apuntada (p. ej. abierta a mano) NO se adopta: ni stop, ni cierre por tiempo; ocupa plaza y se avisa una vez", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1, edadH: 500 }], quiere: [{ c: "ETH", dir: 1 }], ctl: { estado: "on", uso: 100, plazas: 1, freno: 0.35, puesto: 1 }, eq: 30, neto: 30 });
  W.estadoIni = { pm: {}, misStops: [] };   // el bot tiene su estado, pero BTC no es suya
  conecta(W); await silencio(() => HL.ronda());
  assert.ok(!W.ordenes.some((o) => o.c === "BTC"), "ni stop ni cierre en BTC: " + JSON.stringify(W.ordenes));
  assert.equal(aperturas(W).length, 0, "BTC ocupa la única plaza: no abre ETH");
  assert.equal(W.avisos.filter((t) => /no ha abierto/.test(t)).length, 2, "aviso de la posición y de que está sin stop");
  await otraHora(W); assert.ok(!W.ordenes.some((o) => o.c === "BTC")); assert.equal(W.avisos.filter((t) => /no ha abierto/.test(t)).length, 2, "no repite avisos");
  // si vuelves a guardar los ajustes después del aviso, la da por suya (y le pone su stop)
  W.ctl = { ...W.ctl, t: new Date(Date.now() + 60e3).toISOString() }; await otraHora(W);
  assert.ok(W.ordenes.some((o) => o.c === "BTC"), "ahora sí la gestiona");
});

test("v477 · H-07: si la ronda anterior se cortó al abrir, la posición abierta en esa ronda SÍ es del bot (y su stop también)", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: -0.1, edadH: 1 }], stops: [{ c: "BTC", side: "B", sz: 0.1, trig: 108 }] });
  W.estadoIni = { pm: {}, misStops: [], preApertura: 1, t: new Date(Date.now() - 1.5 * H).toISOString() };
  conecta(W); await silencio(() => HL.ronda());
  assert.ok(!W.avisos.some((t) => /no ha abierto/.test(t)), "es suya: sin aviso"); const S = await estadoDe(W);
  assert.ok(S.pm.BTC, "adoptada"); assert.deepEqual(S.misStops, [W.stops[0].oid], "y su stop, apuntado");
});

test("v477 · H-06: un cierre que solo se ejecuta EN PARTE no cuenta como cerrado (no libera plaza ni dinero) y se avisa", async () => {
  const W = mundo({ pos: [{ c: "BTC", szi: 0.2, edadH: 200 }], stops: [{ c: "BTC", side: "A", sz: 0.2, trig: 92 }], quiere: [{ c: "ETH", dir: 1 }], ctl: { estado: "on", uso: 100, plazas: 1, freno: 0.35, puesto: 1 }, eq: 30, neto: 30 });
  W.estadoIni.misStops = [1]; W.cierreParcial = 0.4; conecta(W); await silencio(() => HL.ronda());
  assert.ok(Math.abs(W.pos.BTC.szi - 0.12) < 1e-9, "queda el 60 %"); const S = await estadoDe(W);
  assert.ok(!S.ops.some((o) => o.x === "cierra"), "no se apunta como cerrada"); assert.equal(aperturas(W).length, 0, "la plaza sigue ocupada");
  assert.ok(W.avisos.some((t) => /solo se ha cerrado una parte \(40 %\)/.test(t)));
  W.cierreParcial = 0; await otraHora(W); assert.ok(!W.pos.BTC, "en la ronda siguiente termina de cerrarla");
});

test("v477 · H-10: se apunta cuánto se movió el precio desde el cierre de la vela de la señal hasta la compra", async () => {
  const W = mundo({ quiere: [{ c: "ETH", dir: 1, px0: 9.9 }] }); conecta(W); await silencio(() => HL.ronda());
  const S = await estadoDe(W), s = S.slip.find((x) => x.x === "señal"); assert.ok(s, JSON.stringify(S.slip)); assert.ok(Math.abs(s.d - (10 / 9.9 - 1) * 100) < 1e-3, "≈ 1,01 % peor");
});
