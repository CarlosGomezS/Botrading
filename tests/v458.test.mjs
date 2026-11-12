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

test("Trading 212 sigue solo el podio de ETF (top3etf) aunque el n.º 1 general sea de acciones", () => {
  const S = { lab: { top3: [{ k: "acc1", sc: 0.3 }], top3etf: [{ k: "etf1", sc: 0.1 }] }, books: { acc1: { tgt: { w: { AAPL: 1 } } }, etf1: { tgt: { w: { SPY: 1 } } } } };
  const r = primero(S, null);
  assert.equal(r && r.k, "etf1");
  const S2 = { lab: { top3: [{ k: "acc1", sc: 0.3 }] }, books: S.books };   // sin top3etf (web antigua): como antes
  assert.equal(primero(S2, null).k, "acc1");
});
