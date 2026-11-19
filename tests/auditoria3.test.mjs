// v1.0 · auditoría 3 (Gemini) · laboratorio de Hyperliquid y bitvavo.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { cartera, PF_MAX } from "../runner/caza-hl.mjs";
import { medianaMovil, medEn, FILTROS } from "../runner/caza-hl2.mjs";
import { tramosAlAzar, azarFijo, semanaDe, iaEnUso, PESO_MAX } from "../runner/caza-lab.mjs";
const BV = readFileSync(new URL("../runner/bitvavo.mjs", import.meta.url), "utf8"), CL = readFileSync(new URL("../runner/caza-lab.mjs", import.meta.url), "utf8");

test("G5-1.3 · una operación abierta antes del final del tramo NO ve precios de después (el examen oculto queda tapado)", () => {
  const C = Array.from({ length: 300 }, (_, i) => (i < 100 ? 100 : 200)), M = { X: { C, H: C, L: C, F: new Float64Array(300) } };
  const r = cartera([[90, "X", 1, 250]], M, 0, 100, 1);   // se abre en la hora 90; el tramo acaba en la 100; después el precio se duplica
  assert.ok(r.ret < 0.01, `no puede ganar con el futuro: ${r.ret}`);
  const r2 = cartera([[90, "X", 1, 250]], M, 0, 300, 1); assert.ok(r2.ret > 0.5, "con el tramo largo, sí");
});

test("G5-1.3 · el factor de beneficio tiene tope (una pérdida diminuta no da una nota disparatada) y los pesos de familia también", () => {
  const C = [100, 110, 100, 99.99], M = { X: { C, H: C, L: C, F: new Float64Array(4) } };
  const r = cartera([[0, "X", 1, 1], [2, "X", 1, 3]], M, 0, 4, 1); assert.ok(r.pf <= PF_MAX); assert.equal(PF_MAX, 5); assert.equal(PESO_MAX, 5);
  assert.match(CL, /Math\.min\(PESO_MAX, \(mem\.pesos\[f\] \|\| 1\) \* 0\.7/);
});

test("G5-1.4 · los tramos son los MISMOS durante toda la semana (antes, nuevos cada 3 h) y cambian de una semana a otra", () => {
  const a = tramosAlAzar(8000), b = tramosAlAzar(8000); assert.deepEqual(a, b);
  const s = semanaDe(); assert.notDeepEqual(tramosAlAzar(8000, azarFijo(s)), tramosAlAzar(8000, azarFijo(s + 1)));
  for (const [i0, i1] of a) assert.ok(i0 >= 260 && i1 <= 8000 && i1 > i0, "nunca dentro del examen oculto");
});

test("G5-1.1 · si hay métodos de la IA en la memoria y no se leen sus recetas, la ronda se para (no los borra)", () => {
  assert.equal(iaEnUso({ aprobadas: [{ g: { ia: "r1" } }] }), true); assert.equal(iaEnUso({ podio: [{ g: { a: 3, iab: "r2" } }] }), true);
  assert.equal(iaEnUso({ aprobadas: [{ g: { a: 3 } }] }), false); assert.equal(iaEnUso(null), false);
  assert.match(CL, /if \(!iaLeida && iaEnUso\(M0\)\) throw new Error/);
});

test("G5-1.5 · la volatilidad «normal» solo mira hacia ATRÁS (cambiar el futuro no cambia el pasado) y la usan igual laboratorio y real", () => {
  const v = Array.from({ length: 3000 }, (_, i) => 1 + (i % 7) / 10), v2 = v.slice(); for (let i = 2000; i < 3000; i++) v2[i] = 50;
  const a = medianaMovil(v), b = medianaMovil(v2); for (let i = 0; i <= 2000; i++) assert.ok(Object.is(a[i], b[i]), "hora " + i);
  assert.ok(b[2999] > a[2999], "más adelante sí cambia"); assert.equal(medEn(a, 100), a[100]); assert.equal(medEn(7, 3), 7, "compatible con un número");
  const X = { vol: { c: [0, 0, 9] }, volMed: { c: [1, 1, 1] } }; assert.equal(FILTROS["solo con mucha volatilidad"](1, 2, X, "c"), true);
  for (const f of ["caza-lab.mjs", "hl-real.mjs", "caza-hl2.mjs"]) { const u = new URL("../runner/" + f, import.meta.url); if (!existsSync(u)) continue; assert.match(readFileSync(u, "utf8"), /X\.volMed\[c\] = medianaMovil\(X\.vol\[c\]\)/, f); }   // (la copia sin Hyperliquid real no tiene hl-real.mjs)
});

test("G5-1.5 · el laboratorio lee el volumen de OKX en monedas (como Hyperliquid) y no reintenta sin fin si OKX dice «demasiadas peticiones»", () => {
  const H = readFileSync(new URL("../runner/caza-hl.mjs", import.meta.url), "utf8");
  assert.match(H, /k\.set\(\+y\[0\], \[\+y\[4\] \* xk, \(\+y\[6\] \|\| 0\) \/ xk/);   /* G6-I5 · ahora además escala kPEPE/kBONK/kSHIB */ assert.match(H, /if \(\+\+esp429 > 20\) break;/);
});

test("G5-2 · bitvavo.mjs: las señales de las Tortugas van al principio (tras el dinero real), un fallo general sale en rojo y sin contraseña no se publica el terminal", () => {
  const i = BV.indexOf("await RL.paso("), j = BV.indexOf("S.tortJob = S.tortJob || {}"), k = BV.indexOf("Señales ahora (OKX:");
  assert.ok(i > 0 && i < j && j < k, "dinero real → Tortugas → laboratorios ficticios");
  assert.match(BV, /main\(\)\.catch\(\(e\) => \{ console\.log\("Bitvavo: " \+ \(e\.message \|\| e\)\); process\.exit\(1\); \}\)/);
  assert.match(BV, /const \{ real, conex, consola, termPend, \.\.\.pub \} = S;/);
});
