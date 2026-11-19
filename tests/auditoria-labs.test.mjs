// v1.0 · auditoría 2 (Gemini) · laboratorios: comisiones, costes dobles, fuga del examen, recetas de la IA y laboratorio de ETF
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crea, declaracion } from "./etf-lab-carga.mjs";
import * as TT from "../runner/tortugas.mjs";
import { soloIStort, fusiona } from "../runner/ia-lab.mjs";
const EL = readFileSync(new URL("../runner/examen-largo.mjs", import.meta.url), "utf8"), IA = readFileSync(new URL("../runner/ia-lab.mjs", import.meta.url), "utf8");

test("G4-2.3 · OKX se examina con su comisión real (0,20 % por orden y el doble por USDC: 0,30 % de media), no con 0,10 %", () => {
  assert.ok(TT.FEES.okx >= 0.002, `OKX ${TT.FEES.okx}`); assert.equal(TT.FEES.bitvavo, 0.0025);
  assert.ok(!/\["okx", 0\.001\]/.test(EL), "la rejilla tampoco usa 0,10 %"); assert.ok(!/OKX \(0,10 %\)/.test(IA), "ni se lo dice así a la IA");
});

test("G4-2.3 · sin la prueba de costes dobles, una regla NO entra en el podio (antes entraba)", () => {
  assert.match(EL, /\(r\.c2 && r\.c2\.ret > 0\)/); assert.ok(!/!\(r\.c2 && r\.c2\.ret <= 0\)/.test(EL));
});

test("G4-2.3 · a la IA de las Tortugas solo se le cuenta el primer año (el examen queda oculto)", () => {
  const r = { P: { ent: 20 }, ok: true, ret: 190, dd: 20, n: 40, semestres: [10, 20, 30, 40], tramos: { g: 0.8, rec: 5 }, pob: [{ P: { ent: 15 }, s: 9 }] };
  const x = soloIStort(r); assert.deepEqual(x.semestres_1er_ano, [10, 20]); assert.deepEqual(x.mejores_madres, [{ ent: 15 }]);
  for (const k of ["aprueba", "gana_2_anos", "peor_caida", "operaciones", "tramos", "semestres"]) assert.ok(!(k in x), "no lleva " + k);
});

test("G4-2.3 · si no se ha podido leer el laboratorio, no se recorta NINGUNA receta de la IA (podría ser la que opera)", () => {
  const viejas = Array.from({ length: 250 }, (_, i) => ({ id: "r" + i }));
  assert.equal(fusiona([{ id: "n1" }], viejas, null).length, 251, "sin saber cuáles se usan, se guardan todas");
  assert.ok(fusiona([{ id: "n1" }], viejas, { aprobadas: [], casi: [], podio: [] }).length <= 200, "con el laboratorio leído, se recorta como siempre");
});

test("G4-2.2 · laboratorio de ETF: labInv ya no deja pasar un veredicto que no es «ok» (precedencia del «!»)", () => {
  const ctx = crea(["labInv"], { btmVerd: () => ({ c: "ok", ck: { gap: 1, beat: 3, n: 3, ddm: 0 } }), labHoldOk: () => true });
  const b = { hold: { v: { A: { ht: 1 }, spy: { ht: 0 } } } };
  assert.equal(ctx.__X.labInv(b, "A", { c: "no", ck: { gap: 1, beat: 3, n: 3, ddm: 0 } }), false);
  assert.equal(ctx.__X.labInv(b, "A", { c: "ok", ck: { gap: 1, beat: 3, n: 3, ddm: 0 } }), true);
});

test("G4-2.2 · una mezcla solo entra en la liga si sus dos madres ya son estables; y un método que cae fuera UNA ronda conserva sus días", () => {
  const J = declaracion("labJudge").txt, T = declaracion("labTop3Check").txt;
  assert.match(J, /g\.bl&&!g\.bl\.every\(p=>p&&\(p\.base\|\|L\.pop\[labKey\(p\)\]\)\)/);
  assert.match(T, /Date\.now\(\)-Date\.parse\(f\)<3\*864e5/); assert.match(T, /L\.aprobFuera=F/);
});
