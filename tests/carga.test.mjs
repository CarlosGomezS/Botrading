// v1.0 · ⏳ carga común: esqueletos mientras llega cada dato y barra arriba mientras haya algo cargando
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crea, declaracion } from "./etf-lab-carga.mjs";
const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("carga · la barra de arriba se ve mientras haya ALGUNA carga y se oculta al acabar todas", () => {
  const b = { cl: new Set(), attr: {}, classList: { toggle(c, on) { on ? b.cl.add(c) : b.cl.delete(c); } }, setAttribute(k, v) { b.attr[k] = v; } };
  const { cargaIni, cargaFin } = crea(["CARGA", "cargaBar", "cargaIni", "cargaFin"], { document: { getElementById: () => b } }).__X;
  cargaIni("real"); assert.ok(b.cl.has("on")); cargaIni("cripto"); cargaFin("real"); assert.ok(b.cl.has("on"), "aún falta cripto");
  cargaFin("cripto"); assert.ok(!b.cl.has("on")); assert.equal(b.attr["aria-hidden"], "true");
});

test("carga · esqueletos: skel(n) da n líneas (entre 2 y 8) y SKN una cifra en espera", () => {
  const { skel, SKN } = crea(["skel", "SKN"]).__X;
  assert.equal((skel(4).match(/class="sk"/g) || []).length, 4); assert.equal((skel(99).match(/class="sk"/g) || []).length, 8);
  assert.match(skel(3), /aria-busy="true"/); assert.match(SKN(true), /class="sk big"/);
});

test("carga · ya no queda ningún «Cargando…» suelto: todo usa el esqueleto común", () => {
  assert.ok(!/>Cargando…</.test(HTML) && !/"Cargando…"/.test(HTML) && !/Cargando historial…/.test(HTML) && !/Cargando el examen/.test(HTML));
  assert.match(HTML, /<div id="cargabar"/);
  assert.match(declaracion("draw0").txt, /RL\.loading\|\|!RL\.at\?skel\(4\)/, "Real: esqueleto (no «Todavía no hay datos») antes de la primera lectura");
});

test("Hyperliquid · mientras llega el saldo en vivo, esqueleto; a los 5 s sin respuesta, la cifra guardada", () => {
  let t = 1000; const timers = [], MM = {}, llamadas = [];
  const ctx = crea(["HL_ESPERA", "hlEspera"], { MM, Date: { now: () => t }, setTimeout: (f, ms) => timers.push([f, ms]), cargaIni: (k) => llamadas.push("+" + k), cargaFin: (k) => llamadas.push("-" + k), hlVivo: () => llamadas.push("vivo"), $: () => null, memeCh: () => ["bitvavo"], memeDraw: () => {} });
  const { hlEspera } = ctx.__X, R = { w: "a", eq: 61.45 };
  assert.equal(hlEspera(R), true, "al principio: esperando"); assert.deepEqual(llamadas, ["+hl"]); assert.equal(timers.length, 2);
  timers.forEach(([f]) => f()); assert.ok(llamadas.includes("vivo") && llamadas.includes("-hl"), "pide el vivo y quita la barra al vencer el plazo");
  t = 3000; assert.equal(hlEspera(R), true); t = 6001; assert.equal(hlEspera(R), false, "pasados 5 s, la guardada");
  t = 2000; MM.hlV = { w: "a", eq: 115.82 }; assert.equal(hlEspera(R), false, "con el vivo ya no se espera");
  MM.hlV = { w: "b", eq: 1 }; assert.equal(hlEspera(R), true, "el vivo de otra cartera no cuenta");
  assert.equal(hlEspera(null), false);
});

test("Hyperliquid · el panel y la tarjeta de arriba pasan por hlEspera", () => {
  assert.match(declaracion("hlDraw").txt, /\$\{hlEspera\(R0\)\?`<div class="mt-big">\$\{SKN\(true\)\}/);
  assert.match(declaracion("bvExchanges").txt, /hlEspera\(\(MM\.hlX\|\|\{\}\)\.R\)\?SKN\(\)/);
  assert.match(declaracion("bvExchanges").txt, /ent\?\(MM\.bvAt\?"—":SKN\(\)\)/, "Bitvavo y OKX: esqueleto hasta la primera lectura");
});
