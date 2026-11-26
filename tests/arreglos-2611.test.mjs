// v1.0 · arreglos del 26/11/2026: informe con errores, Tortugas sin velas, avisos falsos de «-98 %» y reloj fiable
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { desvioTort } from "../runner/bitvavo-real.mjs";

const H = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const now = Date.parse("2026-11-26T12:00:00Z"), d = (n) => new Date(now - n * 864e5).toISOString();

test("desvío: un traspaso sin apuntar (salto enorme) no cuenta como pérdida", () => {
  const eq = [[d(25), 300, 300], [d(20), 302, 300], [d(15), 5, 300], [d(10), 5.1, 300], [d(1), 5.1, 300]];
  const cv = [[now - 26 * 864e5, 100], [now, 100]];
  const r = desvioTort(eq, cv, now);
  assert.ok(r.real > -5, "no debe dar -98 %: " + r.real);
});
test("desvío: las pérdidas normales sí se cuentan", () => {
  const eq = [[d(25), 100, 100], [d(20), 95, 100], [d(10), 90, 100], [d(1), 88, 100]];
  const r = desvioTort(eq, [[now - 26 * 864e5, 100], [now, 100]], now);
  assert.ok(r.real < -10);
});
test("app: sin «claude is not defined» ni nulos de #bg/#hq", () => {
  assert.match(H, /if\(typeof claude==="undefined"\)throw 0/);
  assert.match(H, /if\(\$\("#bg"\)\)\$\("#bg"\)\.checked=false/);
  assert.match(H, /if\(\$\("#hq"\)\)\$\("#hq"\)\.addEventListener/);
});
test("informe: Hyperliquid con su total de probadas (no «null») y en dólares", () => {
  assert.match(H, /out\.hl=\{n:C\.cl\.totalVistas\|\|C\.cl\.n\|\|0,/);
  assert.match(H, /x\.ex==="hyperliquid"&&x\.valor!=null\?"\$"/);
});
test("Tortugas: el flujo da tiempo para leer todas las velas en una vuelta", () => {
  const B = readFileSync(new URL("../runner/bitvavo.mjs", import.meta.url), "utf8"), Y = readFileSync(new URL("../.github/workflows/meme.yml", import.meta.url), "utf8");
  assert.match(B, /TORT_SEG_S \* 1e3/); assert.match(B, /Date\.now\(\) - tTort > TORT_TOPE_S \* 1e3/);
  assert.match(Y, /TORT_SEG=50 TORT_TOPE=110 timeout 200 node runner\/bitvavo\.mjs/);
});
test("reloj: flujo y guion presentes", () => {
  assert.ok(existsSync(new URL("../.github/workflows/reloj.yml", import.meta.url)));
  const R = readFileSync(new URL("../runner/reloj.sh", import.meta.url), "utf8");
  assert.match(R, /lanza meme\.yml/); assert.match(R, /vigia\.sh/);
});
test("errores: al cambiar de versión se olvidan los de la anterior (no salen 24 h errores ya arreglados)", () => {
  assert.match(H, /L=L\.filter\(function\(x\)\{return x&&x\.vb===VB\}\)/);
  assert.match(H, /lu:lu,vb:VB\}\)/);
});
