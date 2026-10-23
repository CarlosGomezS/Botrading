// PRUEBAS DEL MOTOR DE LA CARTERA REAL (runner/real.mjs) · node --test tests/
// 1) Unitarias: ajustes, cifrado, festivos, mapeo de ETFs, plan, contabilidad del bot, rentabilidad.
// 2) Escenarios completos contra un Trading 212 SIMULADO (tests/mock-t212.mjs), día a día, comprobando cada importe.
// Nunca se conecta a Trading 212 de verdad: el motor solo acepta otra dirección si REAL_TEST=1 y es 127.0.0.1.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMock, PX0 } from "./mock-t212.mjs";
import { validate, encrypt, decrypt, openAny, DEF } from "../runner/real-cfg.mjs";
import { makePlan, resolveMap, ensureLedger, syncLots, applyFill, botEquity, twr, xetraHoliday, euOpen, madrid } from "../runner/real.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), RUNNER = path.join(HERE, "..", "runner");
const near = (a, b, tol = 0.02, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} esperaba ${b} ± ${tol} y salió ${a}`);

// ============================== UNITARIAS ==============================
test("ajustes: valores por defecto seguros", () => {
  assert.equal(DEF.on, 0, "sale desactivada"); assert.equal(DEF.modo, "confirmar", "pide confirmación"); assert.equal(DEF.aceptoReal, 0);
  assert.equal(DEF.discreto, 1, "avisos al móvil sin importes"); assert.equal(DEF.reajuste, "revision"); assert.equal(DEF.metodo, "sect");
});
test("ajustes: rangos, valores raros y claves desconocidas se rechazan (sin mostrar el valor)", () => {
  assert.ok(validate({ limite: 2 }).error); assert.ok(validate({ limite: 1e9 }).error); assert.ok(validate({ maxPerdida: 1 }).error);
  assert.ok(validate({ modo: "loco" }).error); assert.ok(validate({ on: 7 }).error); assert.ok(validate({ hack: 1 }).error);
  assert.ok(validate({ minOrden: 200, limite: 100 }).error, "orden mínima > dinero del bot");
  assert.ok(validate({ mapa: { "xlk!": "A" } }).error); assert.ok(validate({ mapa: { XLK: "A B C" } }).error);
  const e = validate({ limite: 123456789 }).error; assert.ok(!/123456789/.test(e), "el error no repite el valor (los registros son públicos)");
  const ok = validate({ limite: 150, modo: "auto", mapa: { XLC: "-" }, discreto: 0, savedAt: "x" }); assert.ok(ok.cfg); assert.equal(ok.cfg.limite, 150); assert.equal(ok.cfg.mapa.XLC, "-");
});
test("cifrado: ida y vuelta, 600.000 iteraciones y compatibilidad con lo cifrado antes", async () => {
  const o = await encrypt("hola ñ €", "Contraseña-Larga-123"); assert.equal(o.it, 600000);
  assert.equal(await decrypt(o, "Contraseña-Larga-123"), "hola ñ €");
  await assert.rejects(decrypt(o, "otra"), "con otra contraseña no se descifra");
  const old = { ...o }; delete old.it;   // formato antiguo (250 000): debe fallar con el valor por defecto antiguo → se comprueba que se respeta «it»
  await assert.rejects(decrypt(old, "Contraseña-Larga-123"));
  const o2 = await encrypt(JSON.stringify({ a: 1 }), "Contraseña-Larga-123"), r = await openAny({ enc: 1, ...o2 }, ["mala", "Contraseña-Larga-123"]);
  assert.deepEqual(r.j, { a: 1 }, "prueba la contraseña actual y, si falla, la anterior"); assert.ok((await openAny({ enc: 1, ...o2 }, ["mala"])).error);
});
test("festivos de la bolsa de Fráncfort y horario", () => {
  for (const d of ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31", "2027-03-26", "2027-03-29"]) assert.ok(xetraHoliday(d), d + " es festivo");
  for (const d of ["2026-10-22", "2026-04-02", "2026-04-07", "2026-12-23", "2026-06-01"]) assert.ok(!xetraHoliday(d), d + " no es festivo");
  assert.ok(euOpen({ wk: true, date: "2026-10-22", min: 10 * 60 })); assert.ok(!euOpen({ wk: true, date: "2026-10-22", min: 9 * 60 }));
  assert.ok(!euOpen({ wk: true, date: "2026-10-22", min: 17 * 60 + 30 })); assert.ok(!euOpen({ wk: true, date: "2026-12-24", min: 10 * 60 })); assert.ok(!euOpen({ wk: false, date: "2026-10-24", min: 600 }));
  const m = madrid(new Date("2026-07-01T08:00:00Z")); assert.equal(m.min, 10 * 60, "verano: UTC+2"); assert.equal(madrid(new Date("2026-12-01T08:00:00Z")).min, 9 * 60, "invierno: UTC+1");
});
test("mapeo a ETFs europeos: encuentra los 10 sectores y nunca uno apalancado", async () => {
  const { INST } = await import("./mock-t212.mjs");
  const M = resolveMap(INST, ["XLK", "XLV", "XLE", "XLF", "XLY", "XLP", "XLI", "XLU", "XLB", "XLC", "QQQ", "SMH", "IWM", "SPY"], { mapa: {}, divisa: "eur", acciones: 0 });
  for (const s of ["XLK", "XLV", "XLE", "XLF", "XLY", "XLP", "XLI", "XLU", "XLB", "XLC", "QQQ", "SMH", "IWM", "SPY"]) assert.ok(M[s].t, s + " tiene equivalente");
  assert.equal(M.XLK.t, "QDVEd_EQ"); assert.equal(M.QQQ.t, "SXRVd_EQ", "nunca el ×3"); assert.equal(M.XLC.t, "SXLCd_EQ");
  const M2 = resolveMap(INST, ["XLK"], { mapa: { XLK: "-" }, divisa: "eur", acciones: 0 }); assert.equal(M2.XLK.t, null, "desactivado a mano");
  const M3 = resolveMap(INST, ["XLK"], { mapa: { XLK: "NOEXISTE_EQ" }, divisa: "eur", acciones: 0 }); assert.equal(M3.XLK.t, null);
});
// fabrica una posición con el formato de la API
const pos = (t, q, px, avg = px) => ({ instrument: { ticker: t, name: t, currency: "EUR" }, quantity: q, quantityAvailableForTrading: q, averagePricePaid: avg, currentPrice: px, walletImpact: { currentValue: q * px, totalCost: q * avg } });
const MAP = { XLK: { sym: "XLK", t: "QDVEd_EQ", name: "tech" }, XLE: { sym: "XLE", t: "SXLEd_EQ", name: "energy" }, XLF: { sym: "XLF", t: "SXLFd_EQ", name: "fin" }, XLI: { sym: "XLI", t: "SXLId_EQ", name: "ind" } };
const bot = (w, d = "2026-10-01", last = "2026-10-21") => ({ S: { main: "sect", lastDate: last, books: { sect: { tgt: { d, w, why: {}, bull: true }, days: [] } } } });
const A0 = { ...DEF, on: 1, aceptoReal: 1, limite: 100, minOrden: 10 };
const freshR = () => ({ days: [], orders: [], reports: [], botTickers: [], ledger: null, flows: {} });
const NOW = new Date("2026-10-22T08:20:00Z"), M0 = madrid(NOW);
test("plan: primer día con 100 € → 3 compras de ~32,67 €; tu posición propia del mismo ETF no se toca", () => {
  const R = freshR(), ps = [pos("QDVEd_EQ", 0.5, 31.2)], n = []; ensureLedger(R, A0, ps, M0, n); syncLots(R, ps, M0, n);
  const acc = { cash: { availableToTrade: 104.4 } };
  const { plan } = makePlan({ A: A0, R, bot: bot({ XLK: 1 / 3, XLE: 1 / 3, XLF: 1 / 3 }), account: acc, positions: ps, pending: [], map: MAP, now: NOW });
  assert.equal(plan.orders.length, 3); assert.ok(plan.orders.every((o) => o.side === "COMPRA"));
  near(plan.orders.reduce((t, o) => t + o.eur, 0), 98, 0.05, "invierte el 98% (2% de reserva)");
  assert.ok(plan.notas.some((x) => /Posiciones tuyas/.test(x)));
});
test("plan: si el método saca un ETF, vende SOLO las participaciones del bot, nunca las tuyas", () => {
  const R = freshR(), n = []; R.ledger = { cap: 100, cash: 3, lots: { QDVEd_EQ: { q: 1, cost: 31.2 }, SXLEd_EQ: { q: 1.1, cost: 31.2 }, SXLFd_EQ: { q: 0.67, cost: 32.3 } }, real: 0, hist: [], limite: 100 };
  const ps = [pos("QDVEd_EQ", 1.5, 31.2), pos("SXLEd_EQ", 1.1, 28.4), pos("SXLFd_EQ", 0.67, 48.2)];
  const { plan } = makePlan({ A: A0, R, bot: bot({ XLE: 1 / 3, XLF: 1 / 3, XLI: 1 / 3 }, "2026-11-02"), account: { cash: { availableToTrade: 20 } }, positions: ps, pending: [], map: MAP, now: NOW });
  const v = plan.orders.find((o) => o.t === "QDVEd_EQ"); assert.ok(v && v.side === "VENTA"); near(v.qty, 1, 1e-9, "vende 1 (del bot), no 1,5");
});
test("plan: datos del simulador viejos → no opera", () => {
  const R = freshR(); ensureLedger(R, A0, [], M0, []);
  const r = makePlan({ A: A0, R, bot: bot({ XLK: 1 }, "2026-10-01", "2026-10-10"), account: { cash: { availableToTrade: 100 } }, positions: [], pending: [], map: MAP, now: NOW });
  assert.ok(r.block && /datos del bot/.test(r.block));
});
test("plan: pesos que suman más del 100% se reducen; nunca invierte más de lo que tiene", () => {
  const R = freshR(); ensureLedger(R, A0, [], M0, []);
  const { plan } = makePlan({ A: A0, R, bot: bot({ XLK: 0.8, XLE: 0.8 }), account: { cash: { availableToTrade: 500 } }, positions: [], pending: [], map: MAP, now: NOW });
  assert.ok(plan.orders.reduce((t, o) => t + o.eur, 0) <= 98.01); assert.ok(plan.notas.some((x) => /sumaban/.test(x)));
});
test("plan: el bot no usa tu dinero extra de la cuenta (solo su capital)", () => {
  const R = freshR(); ensureLedger(R, A0, [], M0, []);
  const { plan } = makePlan({ A: A0, R, bot: bot({ XLK: 1 }), account: { cash: { availableToTrade: 5000 } }, positions: [], pending: [], map: MAP, now: NOW });
  near(plan.orders[0].eur, 98, 0.01);
});
test("plan: modo «igual que la simulación» no reajusta por movimientos de precio; «desvío» sí", () => {
  const R = freshR(); R.ledger = { cap: 100, cash: 2, lots: { QDVEd_EQ: { q: 1, cost: 49 }, SXLEd_EQ: { q: 1.7, cost: 49 } }, real: 0, hist: [], limite: 100 }; R.applied = { metodo: "sect", tgtD: "2026-10-01" };
  const ps = [pos("QDVEd_EQ", 1, 70, 49), pos("SXLEd_EQ", 1.7, 28.8)];
  const a = makePlan({ A: A0, R, bot: bot({ XLK: 0.5, XLE: 0.5 }), account: { cash: { availableToTrade: 2 } }, positions: ps, pending: [], map: MAP, now: NOW }).plan;
  assert.equal(a.orders.length, 0);
  const b = makePlan({ A: { ...A0, reajuste: "desvio" }, R, bot: bot({ XLK: 0.5, XLE: 0.5 }), account: { cash: { availableToTrade: 2 } }, positions: ps, pending: [], map: MAP, now: NOW }).plan;
  assert.ok(b.orders.some((o) => o.side === "VENTA" && o.t === "QDVEd_EQ"));
});
test("plan: un ETF con orden pendiente en Trading 212 no se toca", () => {
  const R = freshR(); R.ledger = { cap: 100, cash: 2, lots: { QDVEd_EQ: { q: 1, cost: 31 } }, real: 0, hist: [], limite: 100 };
  const { plan } = makePlan({ A: A0, R, bot: bot({ XLE: 1 }, "2026-11-02"), account: { cash: { availableToTrade: 2 } }, positions: [pos("QDVEd_EQ", 1, 31)], pending: [{ ticker: "QDVEd_EQ" }], map: MAP, now: NOW });
  assert.ok(!plan.orders.some((o) => o.t === "QDVEd_EQ"));
});
test("contabilidad: compra y venta → coste, ganancia realizada y efectivo exactos", () => {
  const R = freshR(); R.ledger = { cap: 100, cash: 100, lots: {}, real: 0, hist: [], limite: 100 };
  applyFill(R, "COMPRA", "X", 2, 50); assert.equal(R.ledger.cash, 50); assert.equal(R.ledger.lots.X.cost, 50);
  const r = applyFill(R, "VENTA", "X", 1, 30); assert.equal(r.coste, 25); assert.equal(r.pnl, 5); assert.equal(R.ledger.cash, 80); assert.equal(R.ledger.real, 5);
  applyFill(R, "VENTA", "X", 1, 20); assert.equal(R.ledger.lots.X, undefined); assert.equal(R.ledger.real, 0);
});
test("contabilidad: subir/bajar el capital es aportación/retirada (no ganancia); venta tuya a mano se descuenta", () => {
  const R = freshR(), n = []; ensureLedger(R, A0, [], M0, n); assert.equal(R.ledger.cap, 100);
  ensureLedger(R, { ...A0, limite: 150 }, [], M0, n); assert.equal(R.ledger.cap, 150); assert.equal(R.ledger.cash, 150); assert.equal(R.flows[M0.date], 150);
  // el bot ha perdido: vale 80 (capital 100). Si pones 50 → le quitas 30 (no 50); capital 70; vale 50
  const R2 = freshR(); ensureLedger(R2, A0, [], M0, []); R2.ledger.cash = 0; R2.ledger.lots.X = { q: 2, cost: 100 };
  ensureLedger(R2, { ...A0, limite: 50 }, [pos("X", 2, 40)], M0, []); assert.equal(R2.ledger.cap, 70); assert.equal(R2.ledger.cash, -30);
  near(botEquity(R2, [pos("X", 2, 40)], 1000).eq, 50, 0.001, "el bot pasa a valer exactamente 50");
  R.ledger.lots.X = { q: 2, cost: 60 }; syncLots(R, [pos("X", 1.5, 30)], M0, n); assert.equal(R.ledger.lots.X.q, 1.5); assert.equal(R.ledger.cap, 135, "15 € retirados (0,5 × 30)");
});
test("contabilidad: desdoblamiento 1:2 detectado (no se confunde con una venta)", () => {
  const R = freshR(), n = []; R.ledger = { cap: 100, cash: 0, lots: { X: { q: 2, cost: 100 } }, real: 0, hist: [], limite: 100 }; R.seen = { X: { q: 2, avg: 50 } };
  syncLots(R, [pos("X", 4, 25, 25)], M0, n); assert.equal(R.ledger.lots.X.q, 4); assert.equal(R.ledger.lots.X.cost, 100); assert.equal(R.ledger.cap, 100);
});
test("rentabilidad del bot: lo que aportas no cuenta como ganancia", () => {
  const T = twr([{ d: "a", be: 100, bc: 100, bf: 100 }, { d: "b", be: 110, bc: 100, bf: 0 }, { d: "c", be: 160, bc: 150, bf: 50 }, { d: "d", be: 176, bc: 150, bf: 0 }]);
  near((T[3].i - 1) * 100, 21, 0.001, "+10% y luego +10% = +21%");
});

// ============================== ESCENARIOS COMPLETOS ==============================
const PW = "Prueba-Larga-2026!";
async function world() {
  const mk = await startMock(), dir = mkdtempSync(path.join(tmpdir(), "real-")), root = path.join(dir, "root"), run = path.join(root, "runner");
  mkdirSync(run, { recursive: true }); for (const f of ["real.mjs", "real-cfg.mjs"]) copyFileSync(path.join(RUNNER, f), path.join(run, f));
  let cfg = { ...DEF, on: 1, modo: "auto", limite: 100, minOrden: 10, maxPerdida: 20, acciones: 0, aceptoReal: 1 };
  const setCfg = (o) => { cfg = { ...cfg, ...o }; writeFileSync(path.join(root, "real-ajustes.json"), JSON.stringify(cfg)); }; setCfg({});
  let tgt = { d: "2026-10-01", w: { XLK: 1 / 3, XLE: 1 / 3, XLF: 1 / 3 }, bull: true };
  const setTgt = (d, syms, bull = true) => { tgt = { d, w: Object.fromEntries(syms.map((x) => [x, 1 / syms.length])), why: {}, bull }; };
  async function step(accion, now, extra = {}) {
    const S = { savedAt: 1, main: "sect", lastDate: new Date(Date.parse(now) - 864e5).toISOString().slice(0, 10), books: { sect: { cash: 0, pos: {}, trades: [], days: [{ d: "2026-10-01", eq: 500 }], tgt } } };
    writeFileSync(path.join(dir, "state.json"), JSON.stringify({ ls: { pb19: JSON.stringify(S) }, idb: {} }));
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, REAL_TEST: "1", REAL_NOW: now, T212_KEY: "k", T212_SECRET: "s", T212_BASE: `http://127.0.0.1:${mk.port}/api/v0`, YH_BASE: `http://127.0.0.1:${mk.port}`, STOOQ_BASE: `http://127.0.0.1:${mk.port}`,
      LOCAL_DATA: path.join(dir, "state.json"), REAL_VIEW_PASS: PW, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: "", GITHUB_TOKEN: "", ...extra };
    if (existsSync(path.join(run, "real.json"))) env.LOCAL_REAL = path.join(run, "real.json");
    const out = await new Promise((ok) => execFile(process.execPath, ["real.mjs", accion], { cwd: run, env, timeout: 600000 }, (e, so, se) => ok({ code: e ? e.code || 1 : 0, so: String(so) + String(se) })));
    const R = existsSync(path.join(run, "real.json")) ? (await openAny(JSON.parse(readFileSync(path.join(run, "real.json"), "utf8")), [PW, extra.REAL_VIEW_PASS || ""])).j : null;
    return { ...out, R, rep: R && R.reports[0] };
  }
  return { mk, dir, step, setCfg, setTgt, close: () => mk.close() };
}
const lotQ = (R, t) => (R.ledger.lots[t] ? R.ledger.lots[t].q : 0);

test("ESCENARIOS: un año de uso con dinero real (simulado) de principio a fin", { timeout: 1200000 }, async (t) => {
  const W = await world(), K = W.mk.K, Acc = W.mk.A;
  K.txs.push({ ref: "d1", type: "DEPOSIT", amount: 120, at: "2026-10-21T08:00:00Z" }); K.mine.QDVEd_EQ = 0.5;
  try {
    await t.test("0 · sin contraseña de la cartera no consulta ni guarda nada", async () => {
      const r = await W.step("probar", "2026-10-22T08:00:00Z", { REAL_VIEW_PASS: "" });
      assert.equal(r.code, 1); assert.equal(r.R, null, "no se ha guardado ningún archivo");
      assert.ok(!W.mk.calls.some((c) => c.p.startsWith("/api/v0/equity")), "no ha llamado a Trading 212");
    });
    await t.test("1 · primer día: 3 compras; tus 0,5 QDVE aparte; registro público sin datos", async () => {
      const r = await W.step("normal", "2026-10-22T08:20:00Z");
      assert.equal(r.code, 0, r.so); assert.match(r.rep.titulo, /^3 órdenes ejecutadas/);
      assert.equal(r.R.ledger.cap, 100); assert.equal(Object.keys(r.R.ledger.lots).length, 3);
      near(Acc.pos.QDVEd_EQ.q - lotQ(r.R, "QDVEd_EQ"), 0.5, 1e-6, "tus 0,5");
      near(r.R.ledger.cash + Object.values(r.R.ledger.lots).reduce((s, l) => s + l.cost, 0), 100, 0.01, "capital = efectivo + coste");
      assert.ok(!/€|_EQ|QDVE|SXL/.test(r.so), "el registro (público en GitHub) no lleva importes ni tickers:\n" + r.so);
      assert.equal(r.R.orders.filter((o) => o.estado === "ejecutada").length, 3);
    });
    await t.test("2 · rotación mensual: vende energía y financiero, compra industrial y servicios", async () => {
      W.setTgt("2026-11-02", ["XLK", "XLI", "XLU"]);
      const r = await W.step("normal", "2026-11-03T09:20:00Z");
      assert.match(r.rep.titulo, /^4 órdenes ejecutadas/); assert.deepEqual(Object.keys(r.R.ledger.lots).sort(), ["QDVEd_EQ", "SXLId_EQ", "SXLUd_EQ"]);
      near(Acc.pos.QDVEd_EQ.q - lotQ(r.R, "QDVEd_EQ"), 0.5, 1e-6);
    });
    await t.test("2b · compras tú en la app → aparece en el historial como «hecha por ti» y te avisa", async () => {
      Acc.hist.unshift({ order: { id: 9999, ticker: "SXLPd_EQ", status: "FILLED", filledQuantity: 1, createdAt: "2026-11-03T14:59:00Z" }, fill: { price: 40.3, filledAt: "2026-11-03T15:00:00Z", walletImpact: { netValue: -40.3 } } });
      const r = await W.step("normal", "2026-11-03T15:30:00Z");
      const m = r.R.orders.find((o) => String(o.id) === "9999"); assert.ok(m && m.modo === "manual" && m.side === "COMPRA" && m.eur === 40.3, JSON.stringify(m));
      assert.match(r.rep.md, /Has comprado tú en la app/);
      const r2 = await W.step("normal", "2026-11-03T16:00:00Z"); assert.equal(r2.R.orders.filter((o) => String(o.id) === "9999").length, 1, "no se apunta dos veces");
    });
    await t.test("3 · ingresas 200 € en Trading 212 (con «sumar ingresos» apagado): el bot no los usa y lo anota", async () => {
      W.setCfg({ sumarIngresos: 0 });
      K.txs.push({ ref: "d2", type: "DEPOSIT", amount: 200, at: "2026-11-03T12:00:00Z" });
      const n0 = W.mk.calls.filter((c) => c.m === "POST").length;
      const r = await W.step("normal", "2026-11-04T09:20:00Z");
      assert.equal(r.R.ledger.cap, 100); assert.equal(W.mk.calls.filter((c) => c.m === "POST").length, n0, "ninguna orden enviada"); assert.match(r.rep.titulo, /Sin cambios/);
      assert.equal(r.R.cuenta[0].eur, 200); assert.match(r.rep.md, /Has ingresado 200,00 €/);
    });
    await t.test("4 · subes el capital a 150 €: aportación de 50 €, compra con ellos", async () => {
      W.setCfg({ limite: 150 });
      const r = await W.step("normal", "2026-11-05T09:20:00Z");
      assert.equal(r.R.ledger.cap, 150); assert.match(r.rep.titulo, /órdenes? ejecutada/); assert.ok(r.R.ledger.cash < 6);
      const d = r.R.days[r.R.days.length - 1]; assert.equal(d.bf, 50, "flujo del día = +50");
    });
    await t.test("4b · con «sumar ingresos» encendido: ingresas 100 € → el bot pasa a 250 € y los invierte", async () => {
      W.setCfg({ sumarIngresos: 1 });
      K.txs.push({ ref: "d3", type: "DEPOSIT", amount: 100, at: "2026-11-05T12:00:00Z" });
      const n0 = W.mk.calls.filter((c) => c.m === "POST").length;
      const r = await W.step("normal", "2026-11-06T09:20:00Z");
      assert.equal(r.R.ledger.cap, 250); assert.equal(r.R.ledger.limite, 250); assert.equal(r.R.ledger.auto, 100);
      assert.ok(W.mk.calls.filter((c) => c.m === "POST").length > n0, "compra con el dinero nuevo:\n" + r.rep.md);
      assert.match(r.rep.md, /se suma al bot/); assert.equal(r.R.days[r.R.days.length - 1].bf, 100, "flujo del día = +100 (aportación, no ganancia)");
      const r2 = await W.step("normal", "2026-11-09T09:20:00Z"); assert.equal(r2.R.ledger.cap, 250, "al día siguiente no se vuelve a sumar ni se confunde con un cambio de ajuste");
    });
    await t.test("5 · propuesta con confirmación → apruebas de noche → se ejecuta sola por la mañana", async () => {
      W.setCfg({ modo: "confirmar" }); W.setTgt("2026-12-01", ["XLK", "XLV", "XLY"]);
      const a = await W.step("normal", "2026-12-01T18:00:00Z"); assert.ok(a.R.plan && a.R.plan.estado === "pendiente"); assert.equal(a.R.plan.orders.length, 4);
      const b = await W.step("aprobar", "2026-12-01T18:10:00Z", { PLAN_ID: a.R.plan.id }); assert.match(b.rep.titulo, /4 aplazadas/); assert.ok(b.R.approved);
      const b2 = await W.step("aprobar", "2026-12-01T18:12:00Z", { PLAN_ID: a.R.plan.id }); assert.match(b2.rep.titulo, /No hay esa propuesta/, "pulsar dos veces no duplica nada");
      const c = await W.step("normal", "2026-12-02T08:20:00Z"); assert.match(c.rep.titulo, /^4 órdenes ejecutadas/); assert.equal(c.R.approved, null);
      assert.deepEqual(Object.keys(c.R.ledger.lots).sort(), ["QDVEd_EQ", "SXLVd_EQ", "SXLYd_EQ"]);
    });
    await t.test("6 · festivo (24 de diciembre): no envía nada", async () => {
      W.setCfg({ modo: "auto" }); W.setTgt("2026-12-23", ["XLK", "XLB", "XLY"]);
      const r = await W.step("normal", "2026-12-24T09:20:00Z"); assert.match(r.rep.titulo, /aplazadas/); assert.match(r.rep.md, /festivo/);
    });
    await t.test("7 · Trading 212 deja una orden pendiente → la siguiente ejecución la apunta", async () => {
      K.pendingMode = true;
      const a = await W.step("normal", "2027-01-05T08:20:00Z"); assert.ok(a.R.pendBot.length >= 1); assert.match(a.rep.titulo, /pendientes en Trading 212/);
      K.pendingMode = false; K.fillPending = true;
      const b = await W.step("foto", "2027-01-05T16:50:00Z"); assert.equal(b.R.pendBot.length, 0); assert.match(b.rep.md, /se ejecutó/);
      const rec = b.R.orders.find((o) => o.id === a.R.pendBot[0].id); assert.equal(rec.estado, "ejecutada"); K.fillPending = false;
    });
    await t.test("8 · Trading 212 rechaza una orden → error y aviso", async () => {
      K.reject = ["SXLCd_EQ"]; W.setTgt("2027-02-01", ["XLK", "XLC", "XLY"]);
      const r = await W.step("normal", "2027-02-02T08:20:00Z"); assert.match(r.rep.titulo, /con error/); assert.ok(r.R.orders.some((o) => o.estado === "rechazada" && o.t === "SXLCd_EQ")); assert.equal(r.code, 1);
      K.reject = [];
    });
    await t.test("9 · vendes tú a mano 0,2 participaciones del bot → las descuenta; al día siguiente, sin aportaciones falsas", async () => {
      const before = (await W.step("foto", "2027-02-02T16:50:00Z")).R; const q0 = lotQ(before, "SXLYd_EQ"), cap0 = before.ledger.cap;
      K.sellByHand.SXLYd_EQ = 0.2;
      const r = await W.step("normal", "2027-02-03T08:20:00Z"); near(lotQ(r.R, "SXLYd_EQ"), q0 - 0.2, 1e-6); assert.ok(r.R.ledger.cap < cap0);
      const r2 = await W.step("normal", "2027-02-04T08:20:00Z"); assert.ok(!/aportación|retirada/.test(r2.rep.md.split("## Plan")[0]), "sin movimientos de capital");
    });
    await t.test("10 · desdoblamiento 1:2 de un ETF del bot → participaciones ×2, sin venta ni retirada", async () => {
      const b = (await W.step("foto", "2027-02-04T16:50:00Z")).R, q0 = lotQ(b, "QDVEd_EQ"), cap0 = b.ledger.cap;
      K.split.QDVEd_EQ = 2;
      const r = await W.step("foto", "2027-02-05T16:50:00Z"); near(lotQ(r.R, "QDVEd_EQ"), q0 * 2, 1e-6); assert.equal(r.R.ledger.cap, cap0);
      near(Acc.pos.QDVEd_EQ.q - lotQ(r.R, "QDVEd_EQ"), 1.0, 1e-6, "tus 0,5 también pasan a 1");
    });
    await t.test("11 · precio sospechoso (+50% sobre el último conocido) → compra bloqueada por seguridad", async () => {
      W.setTgt("2027-03-01", ["XLK", "XLE", "XLY"]); K.yahooMult.SXLEd_EQ = 1.5;
      const r = await W.step("normal", "2027-03-02T08:20:00Z"); assert.ok(r.R.orders.some((o) => o.t === "SXLEd_EQ" && /bloqueada por seguridad/.test(o.err)), r.rep.md);
      K.yahooMult.SXLEd_EQ = 1;
    });
    await t.test("12 · caída fuerte (−45%) → pausa automática; no opera hasta «Reanudar»", async () => {
      for (const k of Object.keys(K.px)) K.px[k] *= 0.55;
      const r = await W.step("normal", "2027-03-03T08:20:00Z"); assert.ok(r.R.paused, "en pausa"); assert.match(r.rep.md, /PAUSA|pausa/);
      W.setTgt("2027-03-04", ["XLV", "XLE", "XLY"]);
      const r2 = await W.step("normal", "2027-03-04T08:20:00Z"); assert.match(r2.rep.titulo, /En pausa/);
      const r3 = await W.step("reanudar", "2027-03-04T08:30:00Z"); assert.equal(r3.R.paused, null);
    });
    await t.test("13 · bajas el capital a 15 €: vende el sobrante (de la posición más cargada) y el capital queda en 15 €", async () => {
      W.setCfg({ limite: 15 });
      const before = (await W.step("foto", "2027-03-04T16:50:00Z")).R, inv0 = Object.entries(before.ledger.lots).reduce((s, [tk, l]) => s + l.q * K.px[tk], 0);
      const n0 = W.mk.calls.filter((c) => c.m === "POST").length;
      const r = await W.step("normal", "2027-03-05T08:20:00Z");
      assert.ok(!r.R.paused, "bajar el capital nunca provoca una pausa falsa"); near(r.R.days[r.R.days.length - 1].be, 15, 0.6, "el bot pasa a valer ~15 €");
      assert.ok(inv0 > 15 + 10, "la prueba necesita más de 25 € invertidos (hay " + inv0.toFixed(2) + ")");
      assert.ok(W.mk.calls.filter((c) => c.m === "POST").length > n0, "tenía " + inv0.toFixed(2) + " € invertidos: debe vender. Informe:\n" + r.rep.md);
      const inv = Object.entries(r.R.ledger.lots).reduce((s, [tk, l]) => s + l.q * K.px[tk], 0); assert.ok(inv <= 15 + 10, "lo invertido de más queda por debajo de la orden mínima: " + inv);
      assert.ok(Acc.pos.QDVEd_EQ.q - lotQ(r.R, "QDVEd_EQ") >= 1.0 - 1e-6, "tus participaciones siguen intactas");
    });
    await t.test("14 · se cierra el historial: todo cuadra (participaciones del bot ≤ las de la cuenta)", async () => {
      const r = await W.step("foto", "2027-03-05T16:50:00Z");
      for (const [tk, l] of Object.entries(r.R.ledger.lots)) assert.ok(l.q <= (Acc.pos[tk] ? Acc.pos[tk].q : 0) + 1e-6, tk);
      assert.ok(r.R.reports.length > 15); assert.ok(r.R.ledger.hist.length > 20);
      const ventas = r.R.ledger.hist.filter((x) => x.tipo === "venta"); assert.ok(ventas.every((x) => typeof x.pnl === "number" && typeof x.coste === "number"), "cada venta con coste y resultado");
    });
    await t.test("15 · Trading 212 caído → error claro, sin órdenes", async () => {
      K.down = true; const r = await W.step("normal", "2027-03-08T08:20:00Z"); assert.match(r.rep.titulo, /No pude conectar/); K.down = false;
    });
  } finally { await W.close(); }
});
