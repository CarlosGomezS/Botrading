// v1.0 · fuentes de ideas de internet para los laboratorios (solo lectura de resúmenes públicos)
import test from "node:test";
import assert from "node:assert/strict";
import { parsea, util, mezcla, leeFuentes, FUENTES } from "../runner/fuentes-ideas.mjs";

const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map(([t, d, l]) => `<item><title><![CDATA[${t}]]></title><link>${l}</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>${d}</p>]]></description></item>`).join("")}</channel></rss>`;
const atom = (items) => `<feed>${items.map(([t, d, l]) => `<entry><id>${l}</id><title>${t}</title><summary>${d}</summary><published>2026-11-15T09:00:00Z</published><link href="${l}"/></entry>`).join("")}</feed>`;

test("lee RSS y Atom: título, resumen sin etiquetas, enlace y fecha", () => {
  const a = parsea(rss([["Dual Momentum &amp; ETFs", "A <b>tactical</b> rotation", "https://x/1"]]), "Blog");
  assert.equal(a.length, 1); assert.equal(a[0].titulo, "Dual Momentum & ETFs"); assert.equal(a[0].resumen, "A tactical rotation"); assert.equal(a[0].link, "https://x/1"); assert.ok(a[0].fecha.startsWith("2026-11-16"));
  const b = parsea(atom([["Trend following in crypto", "Breakouts with ATR stops", "https://arxiv.org/abs/1"]]), "arXiv");
  assert.equal(b[0].link, "https://arxiv.org/abs/1"); assert.equal(b[0].resumen, "Breakouts with ATR stops");
});

test("se queda con lo que habla de estrategias y quita el ruido (agentes de IA, modelos de lenguaje…)", () => {
  const it = (titulo, resumen = "") => ({ titulo, resumen });
  assert.ok(util(it("Sector rotation with momentum")));
  assert.ok(util(it("A new paper", "We test time-series momentum across ETFs")), "vale si lo dice el resumen");
  assert.ok(!util(it("Who Should Be on the Panel? Task-Conditioned Persona Selection for LLM Trading Agents", "momentum portfolio")), "agentes de IA: fuera");
  assert.ok(!util(it("Framing effects on collusive behavior in a long-horizon LLM agent")));
  assert.ok(!util(it("Optimal tax policy for pensions", "welfare analysis")), "no habla de estrategias");
});

test("mezcla por turnos: una fuente con muchas no se come a las demás", () => {
  const its = [...Array.from({ length: 30 }, (_, i) => ({ fuente: "arXiv", titulo: "a" + i })), { fuente: "Allocate Smartly", titulo: "b" }, { fuente: "Quantpedia", titulo: "c" }];
  const m = mezcla(its, 6); assert.deepEqual(m.map((x) => x.fuente), ["arXiv", "Allocate Smartly", "Quantpedia", "arXiv", "arXiv", "arXiv"]);
});

test("lee todas las fuentes; una que falla o bloquea no para nada y queda apuntado por qué", async () => {
  const fx = async (u) => { if (/allocatesmartly/.test(u)) return { ok: false, status: 403, text: async () => "" }; if (/quantocracy/.test(u)) throw Object.assign(new Error("x"), { name: "TimeoutError" });
    return { ok: true, status: 200, text: async () => rss([["Momentum and trend in " + u.slice(8, 20), "ETF rotation", u + "#1"], ["LLM agents for trading", "momentum", u + "#2"]]) }; };
  const { items, porFuente } = await leeFuentes(fx);
  assert.equal(porFuente["Allocate Smartly"].error, "HTTP 403"); assert.equal(porFuente.Quantocracy.error, "TimeoutError");
  assert.equal(porFuente["Alpha Architect"].leidas, 2); assert.equal(porFuente["Alpha Architect"].utiles, 1, "el de agentes de IA no cuenta");
  assert.equal(items.length, FUENTES.length - 2, "una útil por cada fuente que respondió"); assert.ok(items.every((x) => !/LLM/.test(x.titulo)));
  assert.deepEqual(items.map((x) => x.fuente), FUENTES.map(([f]) => f).filter((f) => f !== "Allocate Smartly" && f !== "Quantocracy"), "orden estable");
});
