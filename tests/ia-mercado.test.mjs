// v1.0 · 📈 la IA estudia el mercado (números y gráficas) para proponer recetas al laboratorio de cripto
import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { resumen, grafica, lectura, corte, DIA } from "../runner/ia-mercado.mjs";
import { fusiona, porOrigen, LIM_RECETAS } from "../runner/ia-lab.mjs";

const serie = (n, paso, f, fin = Date.now() - 100 * DIA) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: fin - (n - i) * paso, c, o: c, h: c, l: c, v: 1000 }; });

test("los números: distingue una cripto que sigue tendencia de una que rebota", () => {
  const dia = serie(400, DIA, (i) => 100 * Math.exp(i * 0.003));
  let x = 100; const mom = serie(500, 4 * 36e5, (i) => (x *= 1 + 0.01 * Math.sign(Math.sin(i / 25)))), rev = serie(500, 4 * 36e5, (i) => 100 * (1 + 0.02 * (i % 2 ? 1 : -1)));
  const A = resumen(dia, mom), B = resumen(dia, rev);
  assert.equal(A.tendencia, "alcista"); assert.ok(A.autocorrelacion_4h > 0.05, "momentum"); assert.ok(B.autocorrelacion_4h < -0.05, "rebote");
  assert.match(A.comportamiento, /seguir/); assert.match(B.comportamiento, /vuelta/);
  assert.equal(resumen(dia.slice(0, 10), mom), null, "con pocos datos no se inventa nada");
});

test("la gráfica es un PNG válido de 960×640", () => {
  const png = grafica(serie(400, DIA, (i) => 100 + i), serie(400, 4 * 36e5, (i) => 50 + Math.sin(i / 9)));
  assert.equal(png.slice(1, 4).toString(), "PNG"); assert.equal(png.readUInt32BE(16), 960); assert.equal(png.readUInt32BE(20), 640);
  const i = png.indexOf("IDAT"), len = png.readUInt32BE(i - 4); assert.equal(inflateSync(png.slice(i + 4, i + 4 + len)).length, (960 * 3 + 1) * 640);
});

test("🔒 la IA NUNCA ve los 90 días que el laboratorio reserva para el examen: ni se piden ni se usan aunque la API los devuelva", async () => {
  const ahora = Date.UTC(2026, 10, 16), lim = corte(ahora), pedidos = [];
  const fx = async (u, o) => { const b = JSON.parse(o.body).req; pedidos.push(b); const paso = b.interval === "1d" ? DIA : 4 * 36e5;
    const out = []; for (let t = b.startTime; t < ahora; t += paso) out.push({ t, T: t + paso - 1, o: "1", h: "1", l: "1", c: String(100 + ((t / paso) % 7)), v: "5" });   // devuelve también velas hasta HOY
    return { ok: true, json: async () => out }; };
  const L = await lectura(["ETH", "SOL"], { fx, ahora });
  assert.ok(pedidos.length >= 4 && pedidos.every((p) => p.endTime <= lim), "no se piden datos del examen");
  assert.ok(Date.parse(L.hasta) <= lim); assert.deepEqual(Object.keys(L.criptos).sort(), ["BTC", "ETH", "SOL"]); assert.ok(L.imagenes.length >= 3);
  assert.ok(lim <= ahora - 90 * DIA, "al menos 90 días antes de hoy");
});

test("lista de recetas: las nuevas primero y las que el laboratorio ha aprobado o tiene «casi» nunca se caen (el bot real las necesita)", () => {
  const viejas = Array.from({ length: 300 }, (_, i) => ({ id: "ia_v" + i, via: i % 2 ? "datos" : undefined })), nuevas = [{ id: "ia_n1", via: "graficas" }, { id: "ia_v3" }];
  const cl = { aprobadas: [{ k: "x", g: { a: "ia_v299" } }], casi: [{ g: { b: "ia_v250" } }] };
  const L = fusiona(nuevas, viejas, cl);
  assert.equal(L.length, LIM_RECETAS); assert.equal(L[0].id, "ia_n1"); assert.equal(L.filter((r) => r.id === "ia_v3").length, 1, "sin repetidas");
  assert.ok(L.some((r) => r.id === "ia_v299") && L.some((r) => r.id === "ia_v250"), "las aprobadas y «casi» se quedan aunque sean viejas");
  const o = porOrigen([{ id: "ia_a", via: "graficas" }, { id: "ia_b" }, { id: "ia_c", via: "datos" }], { ia: { ia_a: { n: 100, casi: 1 }, ia_b: { n: 300 }, ia_c: { n: 50 } }, aprobadas: [{ g: { a: "ia_a" } }] });
  assert.deepEqual(o.graficas, { recetas: 1, probadas: 100, casi: 1, aprobadas: 1, aprueba_pct: 1 }); assert.equal(o.ia.probadas, 300); assert.equal(o.datos.aprobadas, 0);
});
