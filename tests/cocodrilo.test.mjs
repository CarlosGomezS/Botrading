// v1.0 · 🐊 método del cocodrilo (Buffett) en el laboratorio de acciones: se carga el código REAL de index.html
// (cada prueba falla con el código anterior, que no tenía este estilo)
import test from "node:test";
import assert from "node:assert/strict";
import { crea, cierre } from "./etf-lab-carga.mjs";

const FUERA = ["S", "BTX", "STR", "window", "labM", "MX", "$", "CFG"];
const ctx = crea(cierre(["labNorm", "labName", "labKey", "labTgt", "labCocoSig", "labCatG", "labNbrs", "labSyms", "LABSEED", "LABV"], FUERA), {
  S: {}, BTX: {}, STR: {}, window: {}, MX: () => null, $: () => ({}), CFG: {},
  rtSk: (b, i, n, sk) => (i - sk >= n && b[i - sk - n] ? b[i - sk].c / b[i - sk - n].c - 1 : null),
  rotV: () => ({ w: {}, why: {}, bull: true }), upS: () => true, vol63: () => 0.1, labRegOff: () => false, labCatK: () => "etf",
});
const X = ctx.__X;
const serie = (precios) => precios.map((c, k) => ({ c, d: "d" + k }));
const plano = (n, v = 100) => Array.from({ length: n }, () => v);

test("🐊 señal: cae un 35 % o más desde su máximo de 5 años (y no antes de tener 1 año de historia)", () => {
  const b = serie([...plano(400, 100), ...plano(50, 60)]);   // −40 %
  const z = X.labCocoSig(b, 0.35);
  assert.equal(z[400] - z[0], 0, "sin caída, ninguna señal");
  assert.equal(z[450] - z[400], 50, "cada sesión a −40 % es señal");
  assert.equal(X.labCocoSig(b, 0.5)[450], 0, "con un 50 % exigido, no");
  const corto = X.labCocoSig(serie([...plano(100, 100), ...plano(50, 50)]), 0.35);
  assert.equal(corto[150], 0, "con menos de 1 año de historia no hay señal");
});

test("🐊 señal: el máximo es el de los 5 años ANTERIORES (un máximo de hace 6 años ya no cuenta)", () => {
  const b = serie([...plano(10, 200), ...plano(1400, 120)]);   // el 200 queda a más de 1260 sesiones
  const z = X.labCocoSig(b, 0.35);
  assert.ok(z[300] > 0, "al principio sí: 120 está un 40 % por debajo de 200");
  assert.equal(z[1410] - z[1300], 0, "pasados 5 años, el máximo es 120: ya no hay caída");
});

test("🐊 sin mirar el futuro: cambiar los precios de después no cambia ninguna señal de antes", () => {
  const base = [...plano(300, 100), ...plano(30, 62), ...plano(100, 90)];
  const a = X.labCocoSig(serie(base), 0.35), b = X.labCocoSig(serie([...base.slice(0, 320), ...plano(110, 10)]), 0.35);
  for (let j = 0; j <= 320; j++) assert.equal(a[j], b[j], "sesión " + j);
});

const D = (precios, i) => ({ b: serie(precios), i: i ?? precios.length - 1 });
test("🐊 cartera: guarda la que cayó (5 años) y el resto va al S&P 500", () => {
  const g = X.labNorm({ u: "accb", z: "coco", cd: 0.35, ch: 5, t: 4, p: "q" });
  const T = X.labTgt(g), cae = [...plano(400, 100), ...plano(30, 55), ...plano(200, 95)], sube = plano(630, 100);
  const datos = { MSFT: D(cae), IBM: D(sube), KO: D(sube), SPY: D(sube) };
  const t = T({ D: datos });
  assert.equal(t.w.MSFT, 0.25, "una de 4 plazas, aunque ya haya rebotado");
  assert.equal(t.w.SPY, 0.75); assert.equal(t.w.IBM, undefined); assert.equal(t.w.KO, undefined);
  const t1 = X.labTgt(X.labNorm({ ...g, t: 1 }))({ D: datos });
  assert.equal(t1.w.MSFT, 1, "con 1 plaza, todo en el cocodrilo"); assert.equal(t1.w.SPY, undefined);
  const nada = T({ D: { IBM: D(sube), KO: D(sube), SPY: D(sube) } });
  assert.deepEqual(Object.keys(nada.w), ["SPY"]); assert.equal(nada.w.SPY, 1, "sin cocodrilos, todo en el S&P 500");
});

test("🐊 cartera: pasados los años de guarda, se vende y vuelve al S&P 500", () => {
  const precios = [...plano(400, 100), ...plano(20, 55), ...plano(1300, 70)], sube = plano(1720, 100);
  const T = X.labTgt(X.labNorm({ u: "accb", z: "coco", cd: 0.35, ch: 3, t: 1, p: "q" }));
  const dentro = T({ D: { MSFT: D(precios, 600), SPY: D(sube, 600) } });
  assert.equal(dentro.w.MSFT, 1);
  const fuera = T({ D: { MSFT: D(precios, 420 + 3 * 252 + 5), SPY: D(sube, 420 + 3 * 252 + 5) } });
  assert.equal(fuera.w.MSFT, undefined, "3 años después de la última señal ya no se guarda"); assert.equal(fuera.w.SPY, 1);
});

test("🐊 solo acciones sueltas: nunca un grupo de ETF (así nunca llega a la cartera real, que solo sigue ETF)", () => {
  const g = X.labNorm({ u: "sec", z: "coco", cd: 0.4, ch: 5, t: 2, l: 3, f: 1, r: "GLD", ab: 1 });
  assert.equal(g.u, "accb"); assert.equal(X.labCatG(g), "acc");
  assert.equal(g.r, ""); assert.equal(g.f, 0); assert.equal(g.ab, undefined);
  assert.equal(X.labKey(X.labNorm({ ...g, l: 7 })), X.labKey(g), "el plazo no cuenta en el cocodrilo");
  assert.ok(X.labSyms(g).includes("SPY"), "carga el S&P 500, donde espera el dinero");
  assert.match(X.labName(g), /Cocodrilo \(Buffett\).*35|Cocodrilo \(Buffett\).*40 %/);
});

test("🐊 el laboratorio lo examina en la próxima ronda (semillas) y sus vecinos son otra caída y otro reparto", () => {
  const sem = X.LABSEED.filter((g) => g.z === "coco");
  assert.ok(sem.some((g) => g.u === "accb" && g.cd === 0.35 && g.ch === 5), "el que se probó a mano (35 %, 5 años)");
  assert.ok(X.LABV.z.includes("coco"));
  const [a, b] = X.labNbrs(X.labNorm({ u: "accb", z: "coco", cd: 0.35, ch: 5, t: 1 }));
  assert.equal(a.cd, 0.4); assert.equal(b.t, 2);
  assert.notEqual(X.labKey(a), X.labKey(X.labNorm({ u: "accb", z: "coco", cd: 0.35, ch: 5, t: 1 })));
});

// ---------- v1.0 · 📦 los laboratorios de Acciones y Mixtos no tenían datos de sus acciones ----------
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const Y = crea(cierre(["labUniSyms", "labS", "LABU"], FUERA), { S: { lab: {} }, BTX: {}, STR: {}, window: {}, MX: () => null, $: () => ({}), CFG: {} });

test("📦 la prueba histórica descarga SIEMPRE las acciones de los grupos del laboratorio (antes, 0 acciones: todos en efectivo)", () => {
  const u = Y.__X.labUniSyms(), acc = Object.values(Y.__X.LABU).filter((x) => x.cat).flatMap((x) => x.U);
  for (const s of acc) assert.ok(u.includes(s), "falta " + s);
  const bts = [...html.matchAll(/BT=\[\.\.\.new Set\(\[([^\]]*)\]\)\]/g)].map((m) => m[1]);
  assert.equal(bts.length, 2, "las dos listas de descarga");
  for (const b of bts) assert.match(b, /\.\.\.labUniSyms\(\)/);
});

test("📦 una sola vez se olvida lo aprendido de Acciones y Mixtos sin datos (el buscador ya no los desprecia)", () => {
  const ctx = Y; ctx.S.lab = { st: { u: { accb: [395, 148], grw: [10, 8], mixb: [400, 150] } }, hist: [[["accb", 0], 0.375], [["grw", 0], 0.9], [["mixt", 0], 0.4]], near: [{ g: { u: "accd" } }, { g: { u: "sec" } }], nearIS: 469, v: 2 };
  const L = ctx.__X.labS();
  assert.deepEqual(L.hist.map((h) => h[0][0]), ["grw"]);
  assert.deepEqual(Object.keys(L.st.u), ["grw"]);
  assert.deepEqual(L.near.map((x) => x.g.u), ["sec"]);
  L.hist.push([["accb", 0], 0.8]); ctx.__X.labS();
  assert.equal(L.hist.length, 2, "solo una vez: lo nuevo (ya con datos) se conserva");
});
