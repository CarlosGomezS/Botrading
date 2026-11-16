// v1.0 · 🧬 podio de ideas distintas (una de cada idea; las variantes, en segundo plano)
import test from "node:test";
import assert from "node:assert/strict";
import { podioDiverso, ideaDe, resumenIdeas } from "../runner/caza-lab.mjs";

const m = (k, n, nota) => ({ k, n: n + " · sin filtro · cada operación dura 168 h · stop −5 %", nota });
const A = "Sesión (hora UTC), a favor {\"h\":0} + confirma Arbitraje contra BTC {\"z\":2}", A2 = "Sesión (hora UTC), a favor {\"h\":14} + confirma Arbitraje contra BTC {\"z\":1}";
const B = "Sesión (hora UTC), a favor {\"h\":14} + confirma Pico de volumen {\"m\":3}", C = "🤖 IA «London Overlap Volatility Squeeze»";

test("Hyperliquid · la idea de fondo no depende de los números", () => {
  assert.equal(ideaDe(m("1", A, 1)), ideaDe(m("2", A2, 1))); assert.notEqual(ideaDe(m("1", A, 1)), ideaDe(m("3", B, 1)));
});

test("Hyperliquid · en el podio, una de cada idea; el n.º 1 siempre es el mejor de todos", () => {
  const L = [m("a1", A, 0.40), m("a2", A2, 0.20), m("a3", A, 0.19), m("b", B, 0.18), m("c", C, 0.16)];
  const P = podioDiverso(L, 3);
  assert.deepEqual(P.map((x) => x.k), ["a1", "b", "c"], "las variantes de A se quedan detrás"); assert.equal(P[0].k, L[0].k);
  assert.ok(!P.some((x) => x.variante));
});

test("Hyperliquid · una variante solo entra si es MUY superior (≥ 50 % y ≥ 0,05 más) a la mejor idea distinta, y nunca más de 2 iguales", () => {
  const P = podioDiverso([m("a1", A, 0.40), m("a2", A2, 0.33), m("a3", A, 0.32), m("b", B, 0.15), m("c", C, 0.10)], 3);
  assert.deepEqual(P.map((x) => x.k), ["a1", "a2", "b"], "0,33 ≥ 0,15 + 50 % → entra como variante; la tercera de A no"); assert.equal(P[1].variante, 1);
  const P2 = podioDiverso([m("a1", A, 0.40), m("a2", A2, 0.20), m("b", B, 0.18), m("c", C, 0.16)], 3);
  assert.deepEqual(P2.map((x) => x.k), ["a1", "b", "c"], "0,20 no es muy superior a 0,18 ni a 0,16: entran las ideas distintas");
  const P3 = podioDiverso([m("a1", A, 0.40), m("a2", A2, 0.20), m("b", B, 0.18)], 3);
  assert.deepEqual(P3.map((x) => x.k), ["a1", "b"], "sin más ideas distintas, la variante no entra (no es «muy superior» a nada)");
});

test("Hyperliquid · si no hay ideas distintas, el podio se queda corto antes que llenarse de copias", () => {
  assert.deepEqual(podioDiverso([m("a1", A, 0.4), m("a2", A2, 0.3), m("a3", A, 0.29)], 3).map((x) => x.k), ["a1"]);
  assert.deepEqual(podioDiverso([], 3), []);
  assert.deepEqual(resumenIdeas([m("a1", A, 0.4), m("a2", A2, 0.3), m("b", B, 0.1)]).distintas, 2);
});

// ---------- ETF (el código vive en index.html: se extrae y se prueba tal cual) ----------
import { readFileSync } from "node:fs";
import vm from "node:vm";
const H = readFileSync(new URL("../index.html", import.meta.url), "utf8"), trozo = (ini) => { const i = H.indexOf(ini); assert.ok(i >= 0, ini); let d = 0, j = H.indexOf("{", i); for (; j < H.length; j++) { if (H[j] === "{") d++; else if (H[j] === "}" && --d === 0) break; } return H.slice(i, j + 1); };
const etf = (genes) => { const ctx = { window: {}, MX: (k) => (genes[k] ? { lab: genes[k] } : null), STR: {} }; vm.createContext(ctx);
  vm.runInContext(`const labKof=x=>x.h?x.h.k:x.lv.k;${trozo("function ideaLab(k)")}${trozo("function diversoLab(L,kOf,scOf,n)")};this.ideaLab=ideaLab;this.diversoLab=diversoLab;`, ctx); return ctx; };
const G = { g1: { u: "grw", r: "GLD", m: 100 }, g2: { u: "grw", r: "GLD", m: 240 }, b1: { bl: [{ u: "grw", r: "GLD" }, { u: "grw", r: "GLD", k: 240 }] }, g3: { u: "sec", r: "TLT" }, bm: { bl: [{ u: "grw", r: "GLD" }, { u: "sec", r: "TLT" }] } };
const e = (k, sc) => ({ h: { k }, sc });

test("ETF · misma idea = mismo universo y refugio (también las mezclas de versiones de esa idea); cada método clásico es su propia idea", () => {
  const C = etf(G);
  assert.equal(C.ideaLab("g1"), C.ideaLab("g2")); assert.equal(C.ideaLab("b1"), C.ideaLab("g1"), "mezcla de dos versiones de la misma idea");
  assert.notEqual(C.ideaLab("g3"), C.ideaLab("g1")); assert.match(C.ideaLab("bm"), /^mez:/); assert.equal(C.ideaLab("sect"), "fijo:sect");
});

test("ETF · el escaparate pone una de cada idea; el n.º 1 no cambia y el resto sigue detrás en su orden", () => {
  const C = etf(G), L = [e("g1", 0.1386), e("b1", 0.1369), e("g2", 0.1351), e("sect", 0.12), e("g3", 0.11), e("trq", 0.10)];
  const R = Array.from(C.diversoLab(L, (x) => x.h.k, (x) => x.sc, 3), (x) => x.h.k);
  assert.deepEqual(R, ["g1", "sect", "g3", "b1", "g2", "trq"]); assert.equal(R.length, L.length, "no se pierde ninguno");
  const R2 = Array.from(C.diversoLab([e("g1", 0.30), e("g2", 0.25), e("sect", 0.12), e("g3", 0.11)], (x) => x.h.k, (x) => x.sc, 3), (x) => x.h.k);
  assert.deepEqual(R2, ["g1", "g2", "sect", "g3"], "0,25 ≥ 0,12 + 50 % y + 2 puntos: variante muy superior"); assert.ok(C.window.__labVar.has("g2"));
});
