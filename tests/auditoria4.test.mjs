// v1.0 · auditoría 4 (Gemini) · cada prueba falla con el código anterior
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ramaNoExiste } from "../runner/real.mjs";
import { rawSeguro } from "../runner/ia-lab.mjs";
import { memesCtl } from "../runner/telegram.mjs";
import { caidaHoraria, escalaK } from "../runner/caza-hl.mjs";
import { fuerzaRuptura } from "../runner/tortugas.mjs";
import { azarSemana, nCriptos } from "../runner/examen-largo.mjs";
const lee = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const puedePisar = (() => { const m = readFileSync(new URL("../runner/runner.mjs", import.meta.url), "utf8").match(/export function puedePisar\(base, remoto, cuidado\) \{[^\n]*?\}\n/); if (!m) return () => true; return new Function("return " + m[0].replace("export ", ""))(); })();   // runner.mjs necesita Playwright: se toma la función del código
const hay = (f) => existsSync(new URL("../" + f, import.meta.url));

test("G6-C1 · solo se empieza de cero si la rama NO existe; un fallo de red no borra la cartera", () => {
  assert.equal(ramaNoExiste("fatal: couldn't find remote ref real"), true);
  assert.equal(ramaNoExiste("fatal: unable to access: Could not resolve host: github.com"), false);
  assert.equal(ramaNoExiste(""), false);
});

test("G6-C2/C6 · el laboratorio no pisa la rama data si ha cambiado mientras trabajaba", () => {
  assert.equal(puedePisar("a1", "a1", true), true);
  assert.equal(puedePisar("a1", "b2", true), false);
  assert.equal(puedePisar(null, "b2", true), false);
  assert.equal(puedePisar("a1", "b2", false), true);
  assert.match(lee(".github/workflows/laboratorio.yml"), /DATA_NO_PISAR: "1"/);
});

test("G6-C2 · leer las recetas: 404 = no hay (vale); 200 = se leen", async () => {
  const r404 = await rawSeguro("data", "x.json", async () => ({ status: 404, ok: false }));
  assert.deepEqual(r404, { ok: true, j: null });
  const r200 = await rawSeguro("data", "x.json", async () => ({ status: 200, ok: true, json: async () => ({ a: 1 }) }));
  assert.deepEqual(r200, { ok: true, j: { a: 1 } });
  assert.match(lee("runner/ia-lab.mjs"), /if \(!prev0\.ok\) throw new Error/);
});

test("G6-C3 · /parar no falla si no existe el bot de memes (rama meme-ctl 404)", async () => {
  const llamadas = [];
  const ok = await memesCtl({ paused: true }, async (u, o) => { llamadas.push(u); return { status: 404, ok: false }; });
  assert.equal(ok, true); assert.equal(llamadas.length, 1);
});

test("G6-M3 · las etiquetas tg-lock de más de un día se borran", () => {
  assert.match(lee("runner/telegram.mjs"), /matching-refs\/tags\/tg-lock-/);
});

test("G6-I5 · la caída hora a hora NO mira más allá del final del tramo (el examen oculto queda tapado)", () => {
  const C = Float64Array.from({ length: 300 }, (_, i) => (i < 100 ? 100 : 40)), M = { X: { C, F: new Float64Array(300) } };
  const dd = caidaHoraria([[90, "X", 1, 250]], M, 0, 100, 1);
  assert.ok(dd < 0.05, `no puede ver el desplome de después del corte: ${dd}`);
  assert.ok(caidaHoraria([[90, "X", 1, 250]], M, 0, 300, 1) > 0.5, "con el tramo largo, sí lo ve");
});

test("G6-I5 · el laboratorio decide la caída de antes del examen con datos de antes del examen", () => {
  assert.match(lee("runner/caza-lab.mjs"), /if \(ais\.ret > 0 && ais\.opsDia >= minOpsB\(g\)\) ais\.dd = /);
});

test("G6-M5 · con menos de 20 operaciones la nota no cambia los pesos de la familia", () => {
  assert.match(lee("runner/caza-lab.mjs"), /if \(r\.is && r\.is\.n >= 20\) \(famStat\[f\]/);
});

test("G6-I5 · kPEPE/kBONK/kSHIB de OKX se escalan a 1000 monedas y no se mezclan fuentes", () => {
  assert.equal(escalaK("kPEPE"), 1000); assert.equal(escalaK("kBONK"), 1000); assert.equal(escalaK("BTC"), 1); assert.equal(escalaK("KAITO"), 1);
  assert.match(lee("runner/caza-hl.mjs"), /if \(k\.size < 24 \* 300\) k\.clear\(\);/);
});

test("G6-I5 · las Tortugas simuladas eligen como el bot real: la ruptura más fuerte primero", () => {
  assert.ok(fuerzaRuptura({ c: 110, hi20: 100 }) > fuerzaRuptura({ c: 101, hi20: 100 }));
  assert.equal(fuerzaRuptura(null), 0);
  assert.match(lee("runner/tortugas.mjs"), /cands\.sort\(\(x, y\) => fuerzaRuptura\(y\[1\]\) - fuerzaRuptura\(x\[1\]\)\)/);
});

test("G6-I5 · el examen largo usa tramos con semilla semanal (antes, un sorteo nuevo cada vez)", () => {
  const a = azarSemana(100), b = azarSemana(100), c = azarSemana(101);
  const xa = [a(), a(), a()], xb = [b(), b(), b()], xc = [c(), c(), c()];
  assert.deepEqual(xa, xb); assert.notDeepEqual(xa, xc);
  assert.doesNotMatch(lee("runner/examen-largo.mjs"), /90 \+ Math\.random\(\) \* 275/);
});

test("G6-M6 · el podio de Tortugas cuenta bien las criptos (es un número)", () => {
  assert.equal(nCriptos({ criptos: 17 }), 17); assert.equal(nCriptos({ criptos: ["a", "b"] }), 2); assert.equal(nCriptos({}), 0);
});

test("G6-C4 · lo aportado «auto» baja igual que el límite cuando una retirada ya estaba cubierta", () => {
  assert.match(lee("runner/real.mjs"), /L\.auto = r2\(\(L\.auto \|\| 0\) \+ dd - cubierto\);/);
});

test("G6-C7 · el recorte del historial de Bitvavo/OKX se ejecuta de verdad (no está dentro de un comentario)", () => {
  assert.match(lee("runner/bitvavo-real.mjs"), /\n  if \(RS\.eq\.length > 3000\) RS\.eq = /);
});

test("G6-I3 · vender todo (freno) respeta lo que marcaste como tuyo", () => {
  assert.match(lee("runner/bitvavo-real.mjs"), /const vendeTodo = async \(por\) => \{ const mal = \[\]; for \(const m of Object\.keys\(RS\.pos\)\) \{ if \(\(ctl\.conservar \|\| \[\]\)\.includes/);
});

test("G6-C8 · restaurar solo vuelve a encender los laboratorios, nunca los bots de dinero real", () => {
  const y = lee(".github/workflows/restaurar.yml");
  const enc = y.split("\n").filter((l) => /for w in/.test(l) && /\[ "\$n" != "0" \]/.test(l));
  assert.ok(enc.length >= 1);
  for (const l of enc) assert.doesNotMatch(l, /real\.yml|real-pulso\.yml|hl-real\.yml/);
});

test("G6-M1 · el flujo real ya no instala paquetes sin fijar (nodemailer)", () => {
  assert.doesNotMatch(lee(".github/workflows/real.yml"), /nodemailer/);
});

test("G6-I5 · el cuaderno de lecciones de las Tortugas se reinicia una sola vez", () => {
  assert.match(lee("runner/ia-lab.mjs"), /if \(!prev\.limpioTort1\)/);
});

test("G6-C5/I4 · Hyperliquid lee el estado con la contraseña antigua y relee tus ajustes antes de abrir", { skip: !hay("runner/hl-real.mjs") }, () => {
  const s = lee("runner/hl-real.mjs");
  assert.match(s, /openAny\(j, \[pw, env\("REAL_VIEW_PASS_OLD"\)\]\)/);
  assert.match(s, /const quiere = SV\.quiere;\n.*\n\s*\{ const c2 = await leeCtl\(\)[^\n]*quiere\.splice\(0\)/);
  assert.match(lee(".github/workflows/hl-real.yml"), /REAL_VIEW_PASS_OLD/);
});
