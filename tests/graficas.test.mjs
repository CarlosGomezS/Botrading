// v1.0 · 📈 gráficas de Bitvavo, OKX e Hyperliquid: rangos, pantalla completa, ingresos que no cuentan como ganancia y historia larga
// (cada prueba falla con el código anterior)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.GITHUB_TOKEN = ""; process.env.GITHUB_REPOSITORY = "prueba/repo";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const g = (html.match(/<script id="graficas">([\s\S]*?)<\/script>/) || [])[1] || "";

test("📈 gráficas con rangos (día, semana, mes, 3 meses, año, todo), pantalla completa y en 💶 Real y 📋 Informes", () => {
  assert.ok(g, "existe el script de gráficas");
  for (const r of ['["1D","Día"', '["1S","Semana"', '["1M","Mes"', '["3M","3 meses"', '["1A","Año"', '["T","Todo"']) assert.ok(g.includes(r), r);
  assert.match(g, /function abreFull\(cfg\)/); assert.match(g, /cbg-full/);
  assert.match(html, /<div data-cbg="bv:\$\{ex\}"><\/div>/); assert.match(html, /<div data-cbg="hl"><\/div>/);
  assert.match(html, /h\+='<div data-cbg="bv:bitvavo"><\/div><div data-cbg="bv:okx"><\/div><div data-cbg="hl"><\/div>'/, "también en Informes → Gráficas");
});

test("📈 el cambio del rango NO cuenta como ganancia lo que ingresas o retiras", () => {
  const src = g.match(/function cambioEn\(serie,mov,from,to\)\{[^\n]*\}/)[0];
  const cambioEn = new Function(src + ";return cambioEn")();
  const serie = [[0, 100], [10, 110], [20, 210], [30, 220]];
  const c = cambioEn(serie, [[15, 100]], 0, 30);
  assert.equal(c.d, 20, "220 − 100 − 100 ingresados = 20 de ganancia"); assert.equal(c.pc, 20);
  assert.equal(cambioEn(serie, [], 10, 30).d, 110, "sin ingresos, la diferencia tal cual");
});

test("📈 Hyperliquid: la ganancia de cada periodo se encaja sobre la de «todo» (cada periodo de Hyperliquid empieza en su propio cero)", () => {
  assert.match(g, /const off=en\(W\[0\]\[0\]\)-W\[0\]\[1\];for\(const \[t,v\] of W\)pnl\.set\(t,v\+off\)/);
  assert.match(g, /type:"portfolio",user:w/);
});

test("📈 Bitvavo/OKX guardan historia larga: un punto cada 30 min los últimos 30 días y uno por día antes (antes, solo ~3 semanas)", async () => {
  const { compactaCurva } = await import("../runner/bitvavo-real.mjs");
  const ahora = Date.parse("2026-11-24T12:00:00Z"), cv = [];
  for (let t = ahora - 90 * 864e5; t <= ahora; t += 30 * 60e3) cv.push([t, 1]);
  const c = compactaCurva(cv, ahora);
  const viejos = c.filter((x) => x[0] < ahora - 30 * 864e5), recientes = c.filter((x) => x[0] >= ahora - 30 * 864e5);
  assert.equal(recientes.length, 30 * 48 + 1, "los últimos 30 días, enteros");
  assert.ok(viejos.length >= 59 && viejos.length <= 61, "antes, uno por día: " + viejos.length);
  assert.equal(c[0][0] < ahora - 89 * 864e5, true, "no se pierde el principio");
  assert.match(readFileSync(new URL("../runner/bitvavo-real.mjs", import.meta.url), "utf8"), /RS\.curva = compactaCurva\(RS\.curva, now\.getTime\(\)\)/);
});
