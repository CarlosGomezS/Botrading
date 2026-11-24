// v1.0 · 📋 Informes en lugar de Terminal, recogedor de errores y sin textos largos (cada prueba falla con el código anterior)
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => { const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`)); return m ? m[1] : null; };

function recogedor() {
  const mem = {}, ev = {}, cola = [];
  const ctx = vm.createContext({
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
    addEventListener: (t, f) => { ev[t] = f; }, setTimeout: (f) => { cola.push(f); return cola.length; }, console: { error() {} }, Error,
  });
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInContext(script("errores"), ctx);
  return { ctx, mem, ev, corre: () => { while (cola.length) cola.shift()(); } };
}

test("⚠️ recogedor: apunta los errores sin repetirlos (×n), con dónde pasó, y los guarda en el móvil", () => {
  const { ctx, mem, corre } = recogedor();
  const e = new Error("algo falla"); e.stack = "Error: algo falla\n    at f (https://x.github.io/Botrading/index.html:4810:158)";
  ctx.__errC(e); ctx.__errC(e); ctx.__errC(new Error("otro"), "promesa");
  const L = ctx.__errLista();
  assert.equal(L.length, 2); assert.equal(L[1].msg, "algo falla"); assert.equal(L[1].n, 2); assert.equal(L[1].lu, "index.html:4810:158");
  assert.equal(L[0].src, "promesa");
  corre(); assert.equal(JSON.parse(mem.errlog1).length, 2, "guardado en este móvil");
  for (let i = 0; i < 400; i++) ctx.__errC(new Error("e" + i));
  assert.equal(ctx.__errLista().length, 300, "como mucho 300");
  ctx.__errBorra(); assert.equal(ctx.__errLista().length, 0);
});

test("⚠️ recogedor: también los errores sin capturar y las promesas rechazadas", () => {
  const { ctx, ev } = recogedor();
  ev.error({ error: new Error("sin capturar"), target: ctx });
  ev.unhandledrejection({ reason: new Error("promesa rota") });
  const m = ctx.__errLista().map((x) => x.src + ":" + x.msg);
  assert.ok(m.includes("sin capturar:sin capturar")); assert.ok(m.includes("promesa:promesa rota"));
});

test("⚠️ ningún «catch» se calla un error: todos lo apuntan (salvo dentro del propio recogedor)", () => {
  const fuera = html.replace(/<script id="errores">[\s\S]*?<\/script>/, "");
  assert.equal((fuera.match(/catch\((?:e|_|e2|err)?\)\{\}|catch\{\}/g) || []).length, 0);
  assert.equal((fuera.match(/\.catch\(\(\)=>\{\}\)|\.catch\(\(\)=>null\)/g) || []).length, 0);
  assert.ok(html.indexOf('<script id="errores">') < html.indexOf('<script id="almacen-seguro">'), "es lo primero que se carga");
});

test("📋 la pestaña Terminal ya no existe: Informes con General, Real, Cripto, Laboratorios, Errores y Por día, y descargas", () => {
  assert.equal(script("terminal-app"), null); assert.doesNotMatch(html, /b\.innerHTML="<span>🖥️<\/span>Terminal"/);
  const s = script("informes-app"); assert.ok(s);
  assert.match(s, /b\.dataset\.t="informes";b\.innerHTML="<span>📋<\/span>Informes"/);
  for (const k of ['"parte"', '"graf"', '"cripto"', '"lab"', '"err"', '"dia"']) assert.ok(s.includes("[" + k), "apartado " + k);
  for (const k of ['k==="txt"', 'k==="json"', 'k==="csv"', 'k==="errtxt"', 'k==="diatxt"']) assert.ok(s.includes(k), "descarga " + k);
  assert.doesNotMatch(html, /go\(\\'terminal\\'\)/);
  assert.match(html, /window\.__terminal=\{T,recoge,pinta\}/, "el asistente IA sigue leyendo el estado");
});

test("✂️ las explicaciones largas se ocultan (con interruptor en Ajustes), pero no los avisos", () => {
  const s = script("sin-textos-largos"); assert.ok(s);
  assert.match(s, /LIM=200/); assert.match(s, /⚠️\|❌\|🛑/); assert.match(s, /📖 Mostrar explicaciones largas/);
  assert.match(s, /#t-informes,#iaP/);
});

test("📰 Informes se abre con el PARTE DEL DÍA (frases de qué ha pasado, día a día) y tiene GRÁFICAS", () => {
  const s = script("informes-app");
  assert.match(s, /sec:LS\.get\("infSec2","parte"\)/, "se abre en el parte");
  assert.ok(s.includes('["parte","📰 Parte del día"]') && s.includes('["graf","📈 Gráficas"]'));
  for (const k of ["function parteDe(d)", "function vParte()", "function vGraf()", "function graf(tit,series"]) assert.ok(s.includes(k), k);
  assert.match(s, /data-ifp="-1"/, "se puede ir a días anteriores");
  for (const k of ["Valor de la cripto", "Errores por día"]) assert.ok(s.includes(k), "gráfica: " + k);
});
