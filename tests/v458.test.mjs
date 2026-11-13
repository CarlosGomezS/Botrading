// v458 · pruebas de las reglas nuevas del 12/11/2026: liquidez mínima de las Tortugas, deslizamiento por cripto, espera aprendida,
// freno diario simulado, comparación real frente a prueba (Bitvavo/OKX y Trading 212) y cartera real de Trading 212 solo con el podio de ETF.
import test from "node:test";
import assert from "node:assert/strict";
import * as TT from "../runner/tortugas.mjs";
import { desvioTort, FRENO } from "../runner/bitvavo-real.mjs";
import { primero, desvio } from "../runner/real.mjs";

const D = 864e5;
const serie = (f, n = 400) => { const a = []; let p = 100; for (let i = 0; i < n; i++) { const o = p; p *= 1 + f(i); a.push([i * D, o, Math.max(o, p) * 1.005, Math.min(o, p) * 0.995, p, 1e6]); } return a; };
const mercado = () => ({ "BTC-EUR": serie(() => 0.004), "X-EUR": serie((i) => (Math.floor(i / 30) % 2 ? -0.01 : 0.02)) });

test("liquidez: solo se entra con ≥ 50.000 €/día; las de menos se siguen vigilando", () => {
  const tick = { "A-EUR": { vq: 60000, sp: 0.002 }, "B-EUR": { vq: 5000, sp: 0.002 }, "C-EUR": { vq: 500, sp: 0.002 } };
  assert.deepEqual(TT.universo(tick).map(([m]) => m).sort(), ["A-EUR", "B-EUR"]);
  assert.deepEqual(TT.universo(tick, undefined, TT.UNI_ENTRA).map(([m]) => m), ["A-EUR"]);
  assert.equal(TT.UNI_ENTRA, 50000);
});

test("deslizamiento por cripto: una diferencia compra-venta mayor gana menos; con costes dobles, menos aún", () => {
  const s = mercado(), base = TT.simula(s, 0.0025, 0.002, null).ret;
  TT.fijaSpreads(s, { "BTC-EUR": { sp: 0.0005 }, "X-EUR": { sp: 0.02 } });
  const real = TT.simula(s, 0.0025, 0.002, null).ret, doble = TT.simula(s, 0.0025, 0.004, null).ret;
  assert.ok(real < base, `con su diferencia real (${real}) debería ganar menos que con el 0,2 % fijo (${base})`);
  assert.ok(doble < real);
});

test("suelo del 0,15 %: una diferencia minúscula no abarata la prueba por debajo del suelo", () => {
  const a = mercado(), b = mercado();
  TT.fijaSpreads(a, { "BTC-EUR": { sp: 0.0001 }, "X-EUR": { sp: 0.0001 } });
  TT.fijaSpreads(b, { "BTC-EUR": { sp: TT.SP_MIN }, "X-EUR": { sp: TT.SP_MIN } });
  assert.equal(TT.simula(a, 0.0025, 0.002, null).ret, TT.simula(b, 0.0025, 0.002, null).ret);
});

test("espera y freno diario son genes/opciones que la simulación entiende", () => {
  assert.equal(TT.conP({}).espera, 7);
  const s = mercado();
  for (const P of [{ espera: 0 }, { espera: 7 }, { frenoDia: 1 }]) { const r = TT.simula(s, 0.0025, 0.002, P); assert.ok(Number.isFinite(r.ret)); assert.ok(r.frenos >= 0); }
});

test("freno general de Bitvavo/OKX al 35 %", () => { assert.equal(FRENO, 0.35); });

test("real frente a prueba (Tortugas): los ingresos no cuentan como ganancia", () => {
  const now = Date.now(), eq = [], cv = [];
  for (let i = 40; i >= 0; i--) { const t = now - i * D; eq.push([new Date(t).toISOString(), 100 * (1 + 0.001 * (40 - i)), 100]); cv.push([t, 1 + 0.001 * (40 - i)]); }
  for (let j = 35; j < eq.length; j++) { eq[j][1] += 50; eq[j][2] = 150; }   // ingreso de 50 € el día 35
  const d = desvioTort(eq, cv, now);
  assert.equal(d.dias, 30);
  assert.ok(Math.abs(d.real - d.sim) < 1.5, `real ${d.real} y prueba ${d.sim} deberían ir casi igual`);
});

test("real frente a prueba (Trading 212): ventana de 30 días desde el cambio de método", () => {
  const days = [], bd = []; const hoy = "2026-11-12";
  for (let i = 40; i >= 0; i--) { const d = new Date(Date.parse(hoy) - i * D).toISOString().slice(0, 10); days.push({ d, be: 100 * (1 + 0.002 * (40 - i)), bc: 100, bf: 0 }); bd.push({ d, eq: 500 * (1 + 0.004 * (40 - i)) }); }
  const R = { days, metDesde: "2026-11-01", ledger: { desde: "2026-01-01" } }, S = { books: { m1: { days: bd } } };
  const x = desvio(R, S, "m1", hoy);
  assert.equal(x.d0, "2026-11-01");
  assert.ok(x.sim > x.real);
});

test("Trading 212 sigue solo ETF probados (v471: 30 días seguidos aprobados) aunque el n.º 1 general sea de acciones", () => {
  const S = { lab: { top3: [{ k: "acc1", sc: 0.3 }], top3etf: [{ k: "etf1", sc: 0.1 }], etfLiga: [{ k: "etf1", sc: 0.1, dias: 40 }] }, books: { acc1: { tgt: { w: { AAPL: 1 } } }, etf1: { tgt: { w: { SPY: 1 } } } } };
  const r = primero(S, null);
  assert.equal(r && r.k, "etf1");
  const S2 = { lab: { top3: [{ k: "acc1", sc: 0.3 }] }, books: S.books };   // v471 · sin la lista de días (web antigua): NO se cambia nada (antes seguía el general)
  assert.equal(primero(S2, null), null);
});

// ---------- v459 · ejecución: solo se apunta lo que el broker confirma; stops de Hyperliquid correctos ----------
import { estadoOrden } from "../runner/real.mjs";
test("Trading 212: estado de la orden según lo confirmado", () => {
  assert.equal(estadoOrden("FILLED", 3), "ejecutada");
  assert.equal(estadoOrden("FILLED", 0), "pendiente");        // sin cantidad: no se da por hecha, se reconcilia después
  assert.equal(estadoOrden("FILLED?", 3), "pendiente");       // aún no está en el historial
  assert.equal(estadoOrden("CANCELLED", 1.2), "parcial");     // cancelada tras ejecutar una parte: se apunta lo ejecutado
  assert.equal(estadoOrden("CANCELLED", 0), "rechazada");
  assert.equal(estadoOrden("REJECTED", undefined), "rechazada");
  assert.equal(estadoOrden("NEW", 0), "pendiente");
});
test("Hyperliquid: la orden de stop cierra en el lado contrario, a la distancia del método, por toda la cantidad y solo reduce", async () => {
  let ordenStop; try { ({ ordenStop } = await import("../runner/hl-real.mjs")); } catch (e) { return; }   // la copia sin Hyperliquid no tiene este archivo
  const largo = ordenStop(3, 1, 100, 2.5, 2, 0.08), corto = ordenStop(3, -1, 100, 2.5, 2, 0.08);
  assert.equal(largo.b, false); assert.equal(corto.b, true);              // largo → vende; corto → compra
  assert.equal(largo.r, true); assert.equal(+largo.s, 2.5);               // solo reduce, por toda la posición
  assert.equal(+largo.t.trigger.triggerPx, 92); assert.equal(+corto.t.trigger.triggerPx, 108);
});

// ---------- v465 · Trading 212: al recuperar una orden cuya respuesta se perdió, no confundirla con una tuya ----------
import { esNuestra } from "../runner/real.mjs";
test("Trading 212: solo se reconoce como del bot una orden del mismo lado, la misma cantidad y creada tras el envío", () => {
  const t0 = Date.parse("2026-11-12T10:00:00Z");
  assert.equal(esNuestra({ quantity: 2.5, createdAt: "2026-11-12T10:00:02Z" }, 2.5, t0), true);
  assert.equal(esNuestra({ quantity: -2.5, createdAt: "2026-11-12T10:00:02Z" }, 2.5, t0), false, "lado contrario (una venta tuya)");
  assert.equal(esNuestra({ quantity: 1, createdAt: "2026-11-12T10:00:02Z" }, 2.5, t0), false, "otra cantidad");
  assert.equal(esNuestra({ quantity: 2.5, createdAt: "2026-11-12T09:30:00Z" }, 2.5, t0), false, "creada antes (tuya)");
});

// ---------- v465 · laboratorio de Hyperliquid: caída hora a hora y stops realistas ----------
import { cartera, caidaHoraria, STOP_SLIP } from "../runner/caza-hl.mjs";
const serieHL = (f, n = 300) => { const C = new Float64Array(n), Hi = new Float64Array(n), Lo = new Float64Array(n), F = new Float64Array(n); for (let i = 0; i < n; i++) { C[i] = f(i); Hi[i] = C[i] * 1.001; Lo[i] = C[i] * 0.999; } return { C, Hi, Lo, F, V: new Float64Array(n) }; };
test("Hyperliquid (prueba): una operación que pierde con stop cuenta su caída (antes salía 0 %)", () => {
  const M = { X: serieHL((i) => (i < 10 ? 100 : i < 30 ? 100 - 2.75 * (i - 10) : i < 40 ? 45 + 0.5 * (i - 30) : 50)) }, ops = [[5, "X", 1, 60]];
  const r = cartera(ops, M, 0, 200, 1, 0.1); assert.ok(r.dd > 0.1, "caída " + r.dd); assert.ok(r.ret <= -0.1 - STOP_SLIP - 0.0019 + 1e-9 && r.ret > -0.12, "vende peor que el stop (v466: deslizamiento según la vela): " + r.ret);
});
test("Hyperliquid (prueba): una posición que cae un 30 % y se recupera SÍ cuenta como caída (valoración hora a hora)", () => {
  const M = { X: serieHL((i) => (i < 10 ? 100 : i < 20 ? 100 - 3 * (i - 10) : i < 30 ? 70 + 3 * (i - 20) : 100)) }, ops = [[5, "X", 1, 60]];
  assert.ok(cartera(ops, M, 0, 200, 1, 0).dd < 0.01, "al cerrar casi no pierde"); assert.ok(caidaHoraria(ops, M, 0, 200, 1, 0) > 0.29, "pero por el camino cayó un 30 %");
});

// ---------- v466 ----------
test("v466 · Trading 212: sin fecha, creada 30 s o 59 s antes, o con un 0,09 % más de cantidad → NO es del bot", () => {
  const t0 = Date.parse("2026-11-12T10:00:00Z"), at = (s) => new Date(t0 + s * 1000).toISOString();
  assert.equal(esNuestra({ quantity: 2.5 }, 2.5, t0), false, "sin fecha");
  assert.equal(esNuestra({ quantity: 2.5, createdAt: at(-30) }, 2.5, t0), false, "30 s antes");
  assert.equal(esNuestra({ quantity: 2.5, createdAt: at(-59) }, 2.5, t0), false, "59 s antes");
  assert.equal(esNuestra({ quantity: 2.5 * 1.0009, createdAt: at(1) }, 2.5, t0), false, "0,09 % más");
  assert.equal(esNuestra({ quantity: 2.5, createdAt: at(-2) }, 2.5, t0), true, "2 s antes (desfase de reloj)");
  assert.equal(esNuestra({ quantity: 2.5, createdAt: at(3) }, 2.5, t0), true, "la nuestra");
  assert.equal(esNuestra(null, 2.5, t0), false);
});
import { salidaStop, huecos, EVAL0 } from "../runner/caza-hl.mjs";
test("v466 · stop con HUECO: si la hora ya empieza pasada del stop, se sale al precio de apertura (peor), no al del stop", () => {
  const d = { C: [100, 85, 84], Lo: [99, 80, 83], Hi: [101, 90, 86] }; const r = salidaStop(d, 2, 100, 1, 0.08);   // abre ~85 (cierre anterior), stop en 92
  assert.ok(r < -0.15 && r >= -0.17, "sale cerca de 85 (no de 92) y nunca por debajo del mínimo 83: " + r);
  const d2 = { C: [100, 95, 90], Lo: [99, 94, 80], Hi: [101, 96, 95] }; const r2 = salidaStop(d2, 2, 100, 1, 0.08);   // mecha hasta 80 atravesando el stop 92
  assert.ok(r2 < -0.08 - STOP_SLIP && r2 >= -0.2, "deslizamiento mayor cuanto más atraviesa la mecha: " + r2);
  assert.equal(salidaStop({ C: [100, 95, 94], Lo: [99, 94, 93], Hi: [101, 96, 95] }, 2, 100, 1, 0.08), null, "no toca el stop");
  const rc = salidaStop({ C: [100, 115, 116], Lo: [99, 114, 115], Hi: [101, 116, 125] }, 2, 100, -1, 0.08); assert.ok(rc < -0.15, "corto con hueco al alza: " + rc);
});
test("v466 · dos posiciones que caen a la vez un 30 %: la caída hora a hora refleja las dos", () => {
  const baja = (i) => (i < 10 ? 100 : i < 20 ? 100 - 3 * (i - 10) : i < 30 ? 70 + 3 * (i - 20) : 100);
  const M = { X: serieHL(baja), Y: serieHL(baja) }, ops = [[5, "X", 1, 60], [5, "Y", 1, 60]];
  assert.ok(caidaHoraria(ops, M, 0, 200, 2, 0) > 0.29, "las dos a la vez = 30 % de la cuenta");
  assert.ok(caidaHoraria([[5, "X", 1, 60]], M, 0, 200, 2, 0) < 0.16, "una sola en media cuenta = 15 %");
});
test("v466 · huecos: financiación que empieza tarde o más de 24 h seguidas sin velas se detectan", () => {
  const T = Array.from({ length: 400 }, (_, i) => i), k = new Map(T.map((t) => [t, [100, 1, 101, 99]])), f = new Map(T.map((t) => [t, 0.0001]));
  assert.deepEqual(huecos(T, { k, f }), { velas: 0, fund: 0, sinFund: false });
  const f2 = new Map(T.filter((t) => t > EVAL0 + 10).map((t) => [t, 0.0001])); assert.equal(huecos(T, { k, f: f2 }).sinFund, true);
  const k2 = new Map(k); for (let t = 300; t < 330; t++) k2.delete(t); assert.equal(huecos(T, { k: k2, f }).velas, 30);
});
import * as LAB from "../runner/caza-lab.mjs";
test("v466 · los tramos al azar NUNCA entran en los 90 días ocultos", () => {
  for (let z = 0; z < 50; z++) { const corte = 5000 + Math.floor(Math.random() * 8000); for (const [a, b] of LAB.tramosAlAzar(corte)) { assert.ok(b <= corte, `tramo hasta ${b} pasa del corte ${corte}`); assert.ok(a >= 260 && a < b); } }
});
test("v466 · memoria del laboratorio: si no se puede leer o está dañada, se PARA (nunca sigue vacía)", async () => {
  const r = (st, buf) => async () => ({ ok: st < 400, status: st, arrayBuffer: async () => buf, json: async () => buf });
  LAB.deps.espera = async () => {};
  LAB.deps.fetch = r(500); await assert.rejects(LAB.memoriaVistas(false), /No puedo leer/); await assert.rejects(LAB.memoria(), /No puedo leer/);
  LAB.deps.fetch = async () => { throw new Error("fetch failed"); }; await assert.rejects(LAB.memoriaVistas(false)); await assert.rejects(LAB.memoria());
  LAB.deps.fetch = r(404); await assert.rejects(LAB.memoriaVistas(false), /desaparecido/); assert.equal((await LAB.memoriaVistas(true)).length, (1 << 24) / 8, "primera vez: vacía es correcto");
  await assert.rejects(LAB.memoria(), /desaparecido/, "v467 · un 404 de la memoria principal PARA el laboratorio");
  process.env.LAB_INICIAR = "1"; assert.equal(await LAB.memoria(), null, "solo empezando de cero A PROPÓSITO"); delete process.env.LAB_INICIAR;
  LAB.deps.fetch = r(200, new ArrayBuffer(10)); await assert.rejects(LAB.memoriaVistas(false), /dañada/);
  LAB.deps.fetch = r(200, { algo: 1 }); await assert.rejects(LAB.memoria(), /dañada/);
});

// ---------- v467 ----------
test("v467 · stop con hueco en la PRIMERA vela que lo atraviesa: se sale desde la apertura REAL (85), no desde el cierre anterior (100)", () => {
  const d = { C: [100, 100, 84], O: [100, 100, 85], Lo: [99, 99, 80], Hi: [101, 101, 86] }; const r = salidaStop(d, 2, 100, 1, 0.08);
  assert.ok(r < -0.15 && r >= -0.2, "≈ −16 %: " + r);
  const sinO = salidaStop({ C: [100, 100, 84], Lo: [99, 99, 80], Hi: [101, 101, 86] }, 2, 100, 1, 0.08); assert.ok(sinO > r, "sin la apertura real se habría quedado corto: " + sinO);
});
import { validaBTC } from "../runner/caza-hl.mjs";
test("v467 · BTC con huecos o sin historia: el examen se PARA", () => {
  const T = Array.from({ length: 400 }, (_, i) => i), k = new Map(T.map((t) => [t, [100, 1, 101, 99, 100]])), f = new Map(T.map((t) => [t, 0.0001]));
  assert.doesNotThrow(() => validaBTC(T, { BTC: { k, f } }));
  const k2 = new Map(k); for (let t = 300; t < 330; t++) k2.delete(t); assert.throws(() => validaBTC(T, { BTC: { k: k2, f } }), /huecos/);
  assert.throws(() => validaBTC(T, {}), /historia/); assert.throws(() => validaBTC(T, { BTC: { k: new Map([...k].slice(0, 100)), f } }), /historia/);
});
import { soloIS } from "../runner/ia-lab.mjs";
test("v467 · a la IA solo le llegan datos anteriores al examen: nunca «aprobada» ni nada del examen oculto", () => {
  const z = soloIS({ n: 3, nota: 1.2, casi: 1, aprobada: 1, mejor: { antes_del_examen: 12.5, pf: 1.3 }, o: { ret: 0.4 }, c2: { ret: 0.1 }, b: { ret: 0.2 } });
  assert.deepEqual(Object.keys(z).sort(), ["antes_del_examen", "casi", "n", "nota", "pf"]); assert.ok(!("aprobada" in z));
});

// ---------- v468 ----------
import { soloISetf } from "../runner/ia-lab.mjs";
test("v468 · IA de ETF: de sus ideas solo ve lo de ANTES de los 2 años ocultos (nada de «aprobó», rentabilidad completa ni motivo del examen)", () => {
  const z = soloISetf({ g: { u: "x" }, an: 0.2, ok: true, por: "pierde contra el SPY en el examen oculto", ais: 0.15, okis: true, d: "2026-11-12" });
  assert.deepEqual(Object.keys(z).sort(), ["gana_al_sp500_antes_del_examen", "gen", "rentab_antes_del_examen"]); assert.equal(z.rentab_antes_del_examen, 15);
});

// ---------- v471 · 30 días seguidos aprobado antes de ir a la cartera real de Trading 212 ----------
import { sinProbados, DIAS_PROBADO } from "../runner/real.mjs";
test("v471 · Trading 212 solo sigue ETF con 30 días seguidos aprobados: el mejor de los probados, no el n.º 1 si es nuevo", () => {
  const books = { nuevo: { tgt: { w: { QQQ: 1 } } }, prob: { tgt: { w: { SPY: 1 } } }, act: { tgt: { w: { IEF: 1 } } } };
  const S = (liga) => ({ lab: { etfLiga: liga }, books });
  assert.equal(DIAS_PROBADO, 30);
  // el n.º 1 lleva 9 días: no va; el 2.º lleva 45 y saca más de 1 punto al actual → cambia al 2.º
  assert.equal(primero(S([{ k: "nuevo", sc: 0.30, dias: 9 }, { k: "prob", sc: 0.20, dias: 45 }, { k: "act", sc: 0.10, dias: 100 }]), "act").k, "prob");
  // con 29 días todavía no; con 30 sí
  assert.equal(primero(S([{ k: "nuevo", sc: 0.30, dias: 29 }, { k: "act", sc: 0.10, dias: 100 }]), "act"), null);
  assert.equal(primero(S([{ k: "nuevo", sc: 0.30, dias: 30 }, { k: "act", sc: 0.10, dias: 100 }]), "act").k, "nuevo");
  // el actual (exento, aunque lleve pocos días) se mantiene si el probado no le saca 1 punto
  assert.equal(primero(S([{ k: "prob", sc: 0.105, dias: 60 }, { k: "act", sc: 0.10, dias: 2 }]), "act"), null);
  // el actual es el mejor de los probados: se queda
  assert.equal(primero(S([{ k: "nuevo", sc: 0.5, dias: 3 }, { k: "act", sc: 0.4, dias: 31 }, { k: "prob", sc: 0.1, dias: 50 }]), "act"), null);
});
test("v471 · si el actual deja de aprobar: cambia al mejor probado (sin margen); si no hay ninguno probado, se mantiene y se avisa", () => {
  const books = { nuevo: { tgt: { w: { QQQ: 1 } } }, prob: { tgt: { w: { SPY: 1 } } }, act: { tgt: { w: { IEF: 1 } } } };
  const S1 = { lab: { etfLiga: [{ k: "prob", sc: 0.101, dias: 31 }] }, books };   // el actual ya no está entre los aprobados
  assert.equal(primero(S1, "act").k, "prob", "sin margen: el actual ha suspendido"); assert.equal(sinProbados(S1, "act"), false);
  const S2 = { lab: { etfLiga: [{ k: "nuevo", sc: 0.9, dias: 5 }] }, books };
  assert.equal(primero(S2, "act"), null, "ninguno probado: se mantiene el actual"); assert.equal(sinProbados(S2, "act"), true, "y se avisa");
  assert.equal(sinProbados({ lab: { etfLiga: [{ k: "act", sc: 0.1, dias: 1 }] } }, "act"), false, "si el actual aprueba, no hay aviso");
});

// ---------- v475 · H-02: Trading 212 responde 5xx al ENVIAR una orden ----------
import { placeMarket } from "../runner/real.mjs";
test("v475 · H-02: si Trading 212 responde 500 al enviar una compra, NO se repite: se busca la orden; si está, se da por hecha; si no, queda dudosa", { timeout: 60000 }, async () => {
  const fallo = (st) => { const e = new Error("Trading 212 respondió HTTP " + st); e.st = st; e.body = "error interno"; return e; };
  for (const st of [500, 502, 503]) {
    let posts = 0; const ahora = () => new Date(Date.now() - 1000).toISOString();
    const T1 = { call: async (m, p) => { if (m === "POST") { posts++; throw fallo(st); } if (p === "/equity/orders") return []; return { items: [{ order: { ticker: "SPY_US_EQ", quantity: 2.5, createdAt: new Date(Date.now()).toISOString(), status: "FILLED", filledQuantity: 2.5 } }] }; } };
    const r1 = await placeMarket(T1, "SPY_US_EQ", 2.5, false, [], 4); assert.equal(posts, 1, `HTTP ${st}: una sola orden enviada`); assert.equal(r1.ok, true); assert.equal(r1.dudosa, true, "encontrada y confirmada");
    let posts2 = 0; const T2 = { call: async (m, p) => { if (m === "POST") { posts2++; throw fallo(st); } if (p === "/equity/orders") return []; return { items: [] }; } };
    const r2 = await placeMarket(T2, "SPY_US_EQ", 2.5, false, [], 4); assert.equal(posts2, 1, `HTTP ${st}: no se reintenta`); assert.equal(r2.ok, false); assert.equal(r2.dudosa, true, "queda dudosa (no se repite)"); void ahora;
  }
});

// ---------- v475 · H-06: el orden del podio de Hyperliquid no mira el examen oculto ----------
test("v475 · H-06: la nota que ORDENA el podio de Hyperliquid sale solo de antes del examen (cambiar el examen o la historia completa no la cambia)", () => {
  const base = { is: { ret: 0.6, dd: 0.2 }, a: { ret: 0.9, dd: 0.25 }, o: { ret: 0.1 } }, corte = 13000;
  const n0 = LAB.calidadIS(base, corte);
  for (const o of [{ ret: 5 }, { ret: -0.9 }, { ret: 0 }, undefined]) for (const a of [{ ret: 9, dd: 0.01 }, { ret: -0.5, dd: 0.9 }, undefined])
    assert.equal(LAB.calidadIS({ ...base, o, a }, corte), n0, "el examen y la historia completa no cambian la nota");
  assert.ok(LAB.calidadIS({ is: { ret: 0.8, dd: 0.2 } }, corte) > n0, "más rentabilidad antes del examen → mejor nota");
  assert.ok(LAB.calidadIS({ is: { ret: 0.6, dd: 0.4 } }, corte) < n0, "más caída antes del examen → peor nota");
  assert.equal(LAB.calidadIS({ a: { ret: 9 } }, corte), -9, "sin datos de antes del examen: al final");
});
