// v1.0 · revisión independiente R6-5 · tarda 1-3 minutos
// Hyperliquid · el laboratorio REAL (runner/caza-lab.mjs → lab()) con precios de PURO AZAR (paseo aleatorio sin tendencia, financiación 0):
// ningún método tiene ventaja real, así que no debería aprobar NINGUNO (y menos aún pasar la cuarentena y llegar al dinero real).
// Fase 1: el reloj va 22 días atrás y se hacen 3 rondas (= 9 h del laboratorio real). Fase 2: el reloj vuelve a hoy (22 días más de datos
// de azar) y una ronda más calcula la cuarentena con el código real.
import test from "node:test";
import assert from "node:assert/strict";
process.env.LAB_INICIAR = "1"; delete process.env.GITHUB_TOKEN; delete process.env.TELEGRAM_TOKEN; delete process.env.CAZA_N;
const RealDate = Date; let OFF = 0;
class FDate extends RealDate { constructor(...a) { a.length ? super(...a) : super(RealDate.now() + OFF); } static now() { return RealDate.now() + OFF; } }
globalThis.Date = FDate;
const { mundo } = await import("./r6/hl-azar.mjs");
const LAB = await import("../runner/caza-lab.mjs");

test("R6-5 · con precios de PURO AZAR el laboratorio de Hyperliquid no aprueba nada ni manda nada a real", { timeout: 1800000 }, async () => {
  const W = mundo(+process.env.SEMILLA || 7); globalThis.fetch = W.fetch; LAB.deps.fetch = W.fetch; LAB.deps.espera = async () => {};
  const _st = globalThis.setTimeout; globalThis.setTimeout = (f, ms, ...a) => _st(f, Math.min(ms || 0, 5), ...a);
  const ronda = async () => { const l = console.log; console.log = () => {}; try { const out = await LAB.lab(() => {}); W.st.lab = JSON.parse(JSON.stringify(out)); W.st.vistas = out.__vistas; return out; } finally { console.log = l; } };
  OFF = -22 * 864e5; let out; for (let k = 0; k < 3; k++) out = await ronda();
  const ap1 = out.aprobadas.length;
  OFF = 0; out = await ronda();
  const ap = out.aprobadas, listos = ap.filter((x) => x.cuar && x.cuar.ok === true);
  { const hs = {}; for (const x of ap) hs[x.g.h] = (hs[x.g.h] || 0) + 1; console.log("duración (h) de los aprobados hoy: " + JSON.stringify(hs) + " · operaciones/día antes del examen: " + ap.map((x) => x.is.opsDia.toFixed(2)).join(" ")); }
  console.log(`aprobados hace 22 días: ${ap1} · siguen aprobados hoy: ${ap.length} · pasan la cuarentena (listos para dinero real): ${listos.length}`);
  for (const x of out.podio) console.log(`  podio: ${x.n.slice(0, 120)} · antes del examen ${(x.is.ret * 100).toFixed(0)} % · examen oculto ${(x.o.ret * 100).toFixed(1)} % · cuarentena ${x.cuar ? `${x.cuar.dias} d, ${x.cuar.n} op, ${(x.cuar.ret * 100).toFixed(1)} %, ok=${x.cuar.ok}` : "—"}`);
  for (const x of listos.slice(0, 5)) console.log(`  LISTO PARA REAL: ${x.n.slice(0, 120)} · cuarentena ${x.cuar.n} op, ${(x.cuar.ret * 100).toFixed(1)} %, PF ${x.cuar.pf}`);
  assert.equal(ap1, 0, `con datos de azar aprueban ${ap1} métodos`);
  assert.equal(listos.length, 0, `con datos de azar ${listos.length} métodos pasan la cuarentena y podrían llevar dinero real`);
});
