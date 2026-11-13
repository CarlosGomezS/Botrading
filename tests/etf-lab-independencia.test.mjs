// v469 · PRUEBA DE INDEPENDENCIA del laboratorio de ETF respecto al EXAMEN OCULTO (los últimos ~2 años, «fuera de muestra», OOS).
// Se ejecuta el código REAL del laboratorio (labTrial = búsqueda, labJudge = examen y aprendizaje, sacados de index.html) varias rondas seguidas,
// con los MISMOS datos anteriores al examen (IS), la misma semilla y el mismo estado inicial, cambiando SOLO los resultados del examen oculto:
// muy positivos, muy negativos, nulos, ausentes y al azar. Todo lo que decide la búsqueda tiene que salir IDÉNTICO:
// candidatos y mutaciones generadas, madres (L.near), mezclas y familias, lo aprendido (L.st, L.hist, L.ai), lo ya probado (L.tried)
// y las notas IS de cada candidato. Lo único que PUEDE cambiar es la evaluación final: aprobados (L.pend / L.pop / L.arch) y su prueba de
// estabilidad (las variantes vecinas, que se examinan APARTE). La prueba también comprueba que los escenarios cambian de verdad esa evaluación
// (si no, no demostraría nada).
import test from "node:test";
import assert from "node:assert/strict";
import { crea, cierre } from "./etf-lab-carga.mjs";

// piezas del laboratorio que se cargan de index.html (las dependencias se descubren solas: si falta una, el error dice cuál)
const FUERA = ["S", "BTX", "STR", "window", "labM", "MX", "$", "CFG"], PIEZAS = cierre(["labTrial", "labJudge", "labExam", "labS"], FUERA);
let PZ = null;
function cargar() { if (PZ) return { c: crea(PZ, entorno()), piezas: PZ }; const piezas = [...PIEZAS];
  for (let z = 0; z < 120; z++) { try { for (const esc of ["muy_positivo", "muy_negativo", "nulo", "ausente", "al_azar"]) { const c = crea(piezas, entorno()); c.S.lab = {}; for (let r = 1; r <= 4; r++) ronda(c, r, esc); } PZ = piezas; return { c: crea(piezas, entorno()), piezas }; }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/); if (!m || piezas.includes(m[1])) throw e; piezas.push(m[1]); } }
  throw new Error("no se han podido cargar las piezas del laboratorio"); }
// lo que NO es del laboratorio: la página, el navegador y el motor de pruebas históricas
function entorno() { return { S: {}, BTX: {}, STR: {}, window: { __IALAB: null }, labM: () => ({ lab: 1 }), MX: () => null, $: () => ({}), CFG: { slip: 0.0015 } }; }

// datos sintéticos deterministas por clave (hash) · IS: tramos 1 y 2 y la parte del 3.º anterior al examen · OOS: el resto
const hsh = (s, sal = 0) => { let h = 2166136261 ^ sal; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
const SEG = (ret, dd, n) => ({ ret, atax: ret * 0.85, dd, n, from: "2000-01-03" });
function datosIS(k) { const u = hsh(k, 1), bueno = u < 0.35, f = bueno ? 1 : 0.3;
  return { r0: SEG(0.8 * f + hsh(k, 2) * 0.6, -0.2 - hsh(k, 3) * 0.3, 20), r1: SEG(0.5 * f + hsh(k, 4) * 0.4, -0.15 - hsh(k, 5) * 0.2, 12), h: { r: 0.3 * f + hsh(k, 6) * 0.3, ra: (0.3 * f + hsh(k, 6) * 0.3) * 0.85, dd: -0.1 - hsh(k, 7) * 0.2, n: 8 } }; }
const SPY = { r0: SEG(0.6, -0.5, 0), r1: SEG(0.4, -0.3, 0), h: { r: 0.25, ra: 0.25 * 0.85, dd: -0.2, n: 0 } };
function oos(esc, k) {   // resultados del examen oculto según el escenario: tramo 3 completo, rentabilidad en los 2 años ocultos y costes dobles
  if (esc === "muy_positivo") return { s2: SEG(9, -0.01, 3), ht: 5, c2: 0 };
  if (esc === "muy_negativo") return { s2: SEG(-0.95, -0.97, 300), ht: -0.95, c2: -9 };
  if (esc === "nulo") return { s2: SEG(0, 0, 0), ht: 0, c2: 0 };
  if (esc === "ausente") return { s2: {}, ht: undefined, c2: undefined };
  if (esc.startsWith("azar_alto")) { const z = esc.endsWith("2") ? 77 : 99, a = hsh(k, z), b = hsh(k, z - 1); return { s2: SEG(1 + a * 8, -0.05 - b * 0.1, 10), ht: 2 + b * 5, c2: 0 }; }   // v475 · aprueban todos, con un examen distinto en cada método
  const a = hsh(k, 99), b = hsh(k, 98); return { s2: SEG(a * 4 - 1, -b, Math.round(a * 40)), ht: b * 3 - 1, c2: -a };   // «al azar»
}
function examen(esc) {   // el objeto que labJudge recibe (como S.btm), con datos que se generan al pedirlos
  const rows = {}, hv = {}, c2 = {}, borr = new Set();
  const fila = (k) => { if (k === "spy") return [SPY.r0, SPY.r1, { ...SEG(0.9, -0.3, 0), ...(esc === "muy_negativo" ? SEG(3, -0.1, 0) : {}) }]; const d = datosIS(k), o = oos(esc, k); return [d.r0, d.r1, o.s2]; };
  const H = (k) => { if (k === "spy") return { ...SPY.h, ht: esc === "muy_positivo" ? -0.5 : esc === "ausente" ? undefined : 0.2 }; const d = datosIS(k), o = oos(esc, k); return { ...d.h, ht: o.ht }; };
  const px = (gen, del) => new Proxy({}, { get: (_, k) => (typeof k !== "string" || del.has(k) ? undefined : gen(k)), has: (_, k) => !del.has(k), deleteProperty: (_, k) => { del.add(k); return true; } });
  return { rows: px(fila, borr), cuts: ["2000-01-03", "2009-01-02", "2017-01-03", "2026-11-02"], hold: { d: "2024-11-01", v: px(H, new Set()) }, c2: px((k) => { const o = oos(esc, k); return o.c2; }, new Set()), tr: null };
}
const semilla = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const RONDAS = 5, N = 60;
function ronda(c, r, esc, reg) {
  c.__Math.random = semilla(1000 + r);   // misma semilla en todos los escenarios
  const L = c.__X.labS(), T = c.__X.labTrial(N), b = examen(esc);
  const busq = T.filter((t) => !String(t.why || "").startsWith("vecino:")), vec = T.filter((t) => String(t.why || "").startsWith("vecino:"));
  const notasIS = busq.map((t) => { const e = c.__X.labExam(b, t.k); return [t.k, e.sc ?? null, e.anIS ?? null, e.okIS ?? null, e.beat ?? null]; });
  c.__X.labJudge(b, T);
  if (reg) { const j = (x) => JSON.parse(JSON.stringify(x ?? null));
    reg.push({ r, busqueda: busq.map((t) => [t.k, t.why, t.pr]), notasIS, madres: j(L.near.map((x) => [c.__X.labKey(x.g), x.sc, x.an])), aprendido: j(L.st), historial: j(L.hist), modelo: j(L.ai), probadas: j(L.tried),
      // evaluación final (PUEDE depender del examen): solo para comprobar que los escenarios la cambian
      eval: { pend: Object.keys(L.pend).length, pop: Object.keys(L.pop).length, vecinas: vec.length } }); }
}
function corre(esc) { const { c } = cargar(); c.S.lab = {}; const reg = []; for (let r = 1; r <= RONDAS; r++) ronda(c, r, esc, reg); return reg; }
const ESC = ["nulo", "muy_positivo", "muy_negativo", "ausente", "al_azar"];

test("ETF · la búsqueda NO depende del examen oculto: con OOS muy positivo, muy negativo, nulo, ausente o al azar, todas las decisiones de búsqueda son idénticas", () => {
  const R = Object.fromEntries(ESC.map((e) => [e, corre(e)])), base = R.nulo;
  assert.ok(base[0].busqueda.length >= N * 0.8, "la búsqueda genera candidatos");
  assert.ok(base.at(-1).madres.length > 0 && base.at(-1).historial.length > 100, "hay madres y aprendizaje que comparar");
  for (const e of ESC.slice(1)) for (let i = 0; i < RONDAS; i++) for (const campo of ["busqueda", "notasIS", "madres", "aprendido", "historial", "modelo", "probadas"])
    { const A = R[e][i][campo], B = base[i][campo]; if (JSON.stringify(A) !== JSON.stringify(B)) { let j = 0; if (Array.isArray(A)) while (j < Math.max(A.length, B.length) && JSON.stringify(A[j]) === JSON.stringify(B[j])) j++;
      assert.fail(`ronda ${i + 1}: «${campo}» cambia al pasar el examen oculto de «nulo» a «${e}» (la búsqueda estaría viendo el examen)` + (Array.isArray(A) ? ` · posición ${j}: ${JSON.stringify(B[j])?.slice(0, 160)} → ${JSON.stringify(A[j])?.slice(0, 160)}` : "")); } }
  // la prueba es sensible: el examen oculto SÍ cambia la evaluación final (aprobados), así que si se colara en la búsqueda, se notaría
  const ev = (e) => R[e].map((x) => x.eval.pend + x.eval.pop).reduce((a, b) => a + b, 0);
  assert.ok(ev("muy_positivo") > 0, "con examen muy positivo hay aprobados"); assert.equal(ev("muy_negativo"), 0, "con examen muy negativo no aprueba nada");
  assert.ok(R.muy_positivo.some((x) => x.eval.vecinas > 0), "y hay variantes vecinas (prueba de estabilidad) que se examinan aparte");
});
test("ETF · las notas que guían la búsqueda son SOLO de antes del examen (anIS/okIS no cambian con el OOS; la rentabilidad completa sí)", () => {
  const { c } = cargar(); const k = "g_prueba"; const a = c.__X.labExam(examen("muy_positivo"), k), b = c.__X.labExam(examen("muy_negativo"), k);
  assert.equal(a.sc, b.sc); assert.equal(a.anIS, b.anIS); assert.equal(a.okIS, b.okIS); assert.notEqual(a.an, b.an, "la rentabilidad completa (para informar) sí cambia");
});

// v475 · H-07: el ORDEN del podio de ETF (top5List, código real) no depende del examen oculto: con dos exámenes distintos en los que aprueban,
//   los métodos aprobados en ambos quedan en el MISMO orden relativo
test("ETF · H-07: el orden del podio no cambia al cambiar el examen oculto (solo puede cambiar quién aprueba)", () => {
  const P2 = cierre(["top5List", "labOrdenIS", "labHoldOk", "labExam"], FUERA.filter((x) => x !== "BTX" && x !== "STR")), keys = Array.from({ length: 150 }, (_, i) => "g_orden" + i);
  const orden = (esc) => { const c = crea(P2, { ...entorno(), BTX: Object.fromEntries(keys.map((k) => [k, { lab: 1 }])), STR: {} }); const b = examen(esc); c.S.btm = b;
    const all = keys.map((k) => ({ k, v: { c: "ok" }, r: b.rows[k], late: false })); return JSON.parse(JSON.stringify(c.__X.top5List(all, 200).T.map((x) => x.h.k))); };
  const A = orden("azar_alto"), B = orden("azar_alto2"), Cn = orden("al_azar");
  assert.ok(A.length >= 10 && B.length >= 10, `aprueban suficientes para comparar (${A.length}, ${B.length})`);
  const rel = (X, Y) => { const com = X.filter((k) => Y.includes(k)); return [com, Y.filter((k) => com.includes(k))]; };
  for (const [x, y, n] of [[A, B, "dos exámenes muy positivos distintos"], [A, Cn, "examen muy positivo frente a al azar"]]) { const [p, q] = rel(x, y); if (p.length >= 2) assert.equal(JSON.stringify(q), JSON.stringify(p), "mismo orden relativo: " + n); }
});
