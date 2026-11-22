// v1.0 · 📈 la cuenta real puede llevar hasta 1/3 en el mejor método de Acciones o Mixtos (acompañante del ETF)
// (cada prueba falla con el código anterior, que no tenía nada de esto)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crea, cierre } from "./etf-lab-carga.mjs";
process.env.GITHUB_REPOSITORY = "yo/repo"; process.env.GITHUB_TOKEN = "t";
const RM = await import("../runner/real.mjs");
const { candidatoAM, decideAM, amPeso, objetivoReal, objetivoDe, AM_PESO } = RM;

const DIA = 864e5, T0 = Date.parse("2026-12-01T10:00:00Z");
const libro = (w) => ({ tgt: { d: "2026-11-30", w, why: {} } });
const S0 = (am = {}) => ({
  lab: {
    etfLiga: [{ k: "e1", an: 0.10, dias: 40 }, { k: "e2", an: 0.12, dias: 5 }],
    accLiga: [{ k: "a1", an: 0.15, dias: 20 }, { k: "a2", an: 0.18, dias: 30 }, ...(am.extra || [])],
  },
  books: { e1: libro({ SPY: 1 }), a1: libro({ KO: 0.5, MSFT: 0.5 }), a2: libro({ PG: 1 }), ...(am.books || {}) },
});
const MAP = { SPY: { t: "SPY_EQ" }, KO: { t: "KO_US" }, MSFT: { t: "MSFT_US" }, PG: { t: "PG_US" } };

test("📈 candidato: ≥15 días aprobado y ≥2 puntos al año más que el MEJOR ETF (aunque sea de otro), con cartera calculada", () => {
  const c = candidatoAM(S0(), MAP);
  assert.equal(c.k, "a1", "el primero de la lista que cumple (0,15 ≥ 0,12 + 0,02)"); assert.equal(c.anE, 0.12); assert.equal(c.needAcc, false);
  const S = S0(); S.lab.accLiga[0].dias = 14; assert.equal(candidatoAM(S, MAP).k, "a2", "con 14 días no vale");
  const S2 = S0(); S2.lab.accLiga = [{ k: "a1", an: 0.139, dias: 20 }]; assert.equal(candidatoAM(S2, MAP), null, "1,9 puntos más no bastan");
  const S3 = S0(); delete S3.books.a1; assert.equal(candidatoAM(S3, MAP).k, "a2", "sin cartera calculada no se puede seguir");
  const S4 = S0(); delete S4.lab.etfLiga; assert.equal(candidatoAM(S4, MAP), null, "sin la liga de ETF no se compara: no se decide");
  assert.equal(candidatoAM(S0(), { ...MAP, KO: { t: null, why: "acciones desactivadas en los ajustes" } }).needAcc, true);
});

test("📈 entra en 3 tramos: 1/9, 2/9 y 1/3 del dinero", () => {
  const R = { am: { k: "a1", desde: new Date(T0).toISOString() } };
  assert.ok(Math.abs(amPeso(R, T0) - AM_PESO / 3) < 1e-9);
  assert.ok(Math.abs(amPeso(R, T0 + 31 * DIA) - (2 * AM_PESO) / 3) < 1e-9);
  assert.ok(Math.abs(amPeso(R, T0 + 65 * DIA) - AM_PESO) < 1e-9);
  assert.ok(Math.abs(amPeso(R, T0 + 400 * DIA) - 1 / 3) < 1e-9, "nunca más de 1/3");
  assert.equal(amPeso({}, T0), 0);
});

test("📈 la cartera objetivo: el ETF con (1 − p) y el de acciones con p; sin acompañante, EXACTAMENTE como antes", () => {
  const S = S0(), A = { metodo: "e1" };
  const sin = objetivoReal(S, A, {}, T0), antes = objetivoDe(S, ["e1"]);
  assert.deepEqual(sin, antes, "sin R.am no cambia nada");
  const con = objetivoReal(S, A, { am: { k: "a1", desde: new Date(T0 - 70 * DIA).toISOString() } }, T0);
  assert.ok(Math.abs(con.tgt.w.SPY - 2 / 3) < 1e-9); assert.ok(Math.abs(con.tgt.w.KO - 1 / 6) < 1e-9); assert.ok(Math.abs(con.tgt.w.MSFT - 1 / 6) < 1e-9);
  assert.match(con.tgt.sig, /\|p/, "si cambia el peso del tramo, cambia la firma (se reajusta)");
  const sinLibro = objetivoReal({ ...S, books: { e1: S.books.e1 } }, A, { am: { k: "a1", desde: new Date(T0).toISOString() } }, T0);
  assert.deepEqual(sinLibro, antes, "si el de acciones aún no tiene cartera, no bloquea al ETF");
});

test("📈 decide: entra, se queda 90 días aunque haya otro mejor, y después cambia si le saca ≥1 punto", () => {
  const R = {};
  assert.equal(decideAM(R, S0(), MAP, T0).accion, "entra"); assert.equal(R.am.k, "a1");
  const S = S0(); S.lab.accLiga = [{ k: "a2", an: 0.18, dias: 30 }, { k: "a1", an: 0.15, dias: 21 }];
  assert.equal(decideAM(R, S, MAP, T0 + 30 * DIA).accion, "igual", "a los 30 días no cambia");
  const r = decideAM(R, S, MAP, T0 + 91 * DIA);
  assert.equal(r.accion, "cambia"); assert.equal(R.am.k, "a2"); assert.equal(R.am.desde, new Date(T0).toISOString(), "el tramo no vuelve a empezar");
});

test("📈 decide: si deja de aprobar, espera 3 días y después sale", () => {
  const R = { am: { k: "a1", n: "x", desde: new Date(T0).toISOString(), ts: new Date(T0).toISOString() } }, S = S0(); S.lab.accLiga = [];
  assert.equal(decideAM(R, S, MAP, T0 + 10 * DIA).accion, "espera"); assert.ok(R.am);
  assert.equal(decideAM(R, S, MAP, T0 + 12 * DIA).accion, "espera");
  assert.equal(decideAM(R, S, MAP, T0 + 14 * DIA).accion, "sale"); assert.equal(R.am, null);
  const R2 = { am: { k: "a1", n: "x", desde: new Date(T0).toISOString(), ts: new Date(T0).toISOString() } };
  decideAM(R2, S, MAP, T0 + 10 * DIA); assert.equal(decideAM(R2, S0(), MAP, T0 + 11 * DIA).accion, "igual", "si vuelve, sigue"); assert.equal(R2.am.fuera, undefined);
});

test("📈 decide: nunca activa solo las acciones desactivadas, ni en modo manual, ni sin la lista de instrumentos (avisa una vez)", () => {
  const R = {}, M2 = { ...MAP, KO: { t: null, why: "acciones desactivadas en los ajustes" }, PG: { t: null, why: "acciones desactivadas en los ajustes" } };
  assert.equal(decideAM(R, S0(), M2, T0).accion, "pide"); assert.equal(R.am, undefined);
  assert.equal(decideAM(R, S0(), M2, T0 + DIA).accion, "nada", "el aviso, una sola vez");
  const R3 = {}; assert.equal(decideAM(R3, S0(), MAP, T0, { manual: true }).accion, "manual"); assert.equal(R3.am, undefined);
  const R4 = {}; assert.equal(decideAM(R4, S0(), {}, T0).accion, "nada"); assert.equal(R4.am, undefined);
});

test("📈 el plan de la cuenta real usa la cartera con el acompañante", () => {
  const s = readFileSync(new URL("../runner/real.mjs", import.meta.url), "utf8");
  assert.match(s, /const S = bot\.S, OB = objetivoReal\(S, A, R, now\);/);
  assert.match(s, /const r = decideAM\(R, b\.S, R\.map, now, \{ manual: A\.metAuto === 0 \|\| A\.metAuto === false \}\)/);
});

// ---------- laboratorio: publica la liga de Acciones/Mixtos con sus días seguidos ----------
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const Z = crea(cierre(["labLiga"], []), {}).__X;
test("📈 laboratorio: liga con días seguidos aprobado y 3 días de gracia (la misma regla para ETF y para Acciones/Mixtos)", () => {
  const hace = (d) => new Date(Date.now() - d * DIA).toISOString(), fila = (k, sc = 0.1, an = 0.1) => ({ h: { k }, sc, an });
  const r = Z.labLiga([fila("a"), fila("b")], { a: hace(20), c: hace(40) }, { c: hace(1) });
  assert.deepEqual(r.liga.map((x) => [x.k, x.dias]), [["a", 20], ["b", 0]]);
  assert.ok(r.N.c, "«c» se conserva (fuera desde hace 1 día)"); assert.ok(r.F.c);
  const r2 = Z.labLiga([fila("a")], { c: hace(40) }, { c: hace(4) }); assert.equal(r2.N.c, undefined, "fuera más de 3 días: se pierde");
  assert.match(html, /L\.accLiga=r\.liga/); assert.match(html, /L\.etfLiga=r\.liga/);
  assert.match(html, /x=>x\.h&&labCatK\(x\.h\.k\)!=="etf"/);
});
