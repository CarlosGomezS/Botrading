// v1.0 · 🌐 el laboratorio de Hyperliquid examina TODAS las criptos operables (no solo las 24 con más volumen), con caché de datos y a ritmo
// (cada prueba falla con el código anterior, que no tenía universo, caché ni ritmo)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_TOKEN = "";
const CH = await import("../runner/caza-hl.mjs");
const H = 3600e3;

test("🌐 universo: todas las no deslistadas con volumen ≥ mínimo (antes solo 24), hasta N_MAX y con BTC la primera", () => {
  const n = 150, meta = { universe: Array.from({ length: n }, (_, i) => ({ name: i === 120 ? "BTC" : "C" + i, isDelisted: i === 3 })) };
  const ctxs = Array.from({ length: n }, (_, i) => ({ dayNtlVlm: i === 120 ? 1 : i < 110 ? 1e9 - i : 1e5 }));   // BTC con poco volumen a propósito
  const U = CH.universo(meta, ctxs);
  assert.equal(U[0], "BTC"); assert.ok(!U.includes("C3"), "deslistada fuera"); assert.ok(!U.includes("C115"), "sin volumen suficiente fuera");
  assert.ok(U.length > 24, "más de 24"); assert.ok(U.length <= CH.N_MAX);
  const U2 = CH.universo({ universe: [{ name: "BTC" }, { name: "ETH" }, { name: "X" }] }, [{ dayNtlVlm: 5e9 }, { dayNtlVlm: 3e9 }, { dayNtlVlm: CH.VOL_MIN - 1 }]);
  assert.deepEqual(U2, ["BTC", "ETH"]);
});

test("🚦 ritmo: el peso de cada petición sigue las reglas de Hyperliquid (20 + 1 por cada 20 datos de financiación / 60 velas)", () => {
  const ahora = 1e12;
  assert.equal(CH.pesoDe({ type: "metaAndAssetCtxs" }), 20);
  assert.equal(CH.pesoDe({ type: "fundingHistory", startTime: ahora - 3 * H }, ahora), 21, "pocas horas: barato");
  assert.equal(CH.pesoDe({ type: "fundingHistory", startTime: 0 }, ahora), 45, "como mucho 500 datos por página");
  assert.equal(CH.pesoDe({ type: "candleSnapshot", req: { startTime: ahora - 4000 * H, endTime: ahora } }), 20 + Math.ceil(4000 / 60));
  assert.ok(CH.PESO_MIN < 1200, "deja margen al resto del bot");
});

test("💾 caché: lo que se guarda se recupera igual (hora a hora), sin perder huecos ni inventar datos", () => {
  const ini = 1000 * H, k = new Map([[ini + 2 * H, [10, 1, 11, 9, 10]], [ini + 5 * H, [12, 2, 13, 11, 12]]]), f = new Map([[ini + 2 * H, 0.0001], [ini + 3 * H, -0.0002]]);
  const e = CH.aCache("okx", k, f, ini, ini + 10 * H); assert.equal(e.t0, ini + 2 * H, "empieza en el primer dato"); assert.equal(e.k[1], 0, "el hueco sigue siendo hueco");
  const z = CH.desdeCache(e); assert.deepEqual([...z.k.entries()], [...k.entries()]); assert.deepEqual([...z.f.entries()], [...f.entries()]);
  assert.equal(CH.cacheValida({ v: 1, c: { A: { s: "rara", t0: 1, k: [], f: [] }, B: e } }).c.A, undefined, "entrada rara: fuera");
  assert.equal(CH.cacheValida({ v: 2, c: {} }), null);
});

// ---------- datos(): con caché solo se pide lo nuevo; las nuevas, como mucho NUEVAS_MAX por ronda ----------
function mundoDatos({ cache, coins }) {
  const fin = Math.floor(Date.now() / H) * H, ini = fin - 540 * 864e5, pide = [];
  const fetch = async (url, o) => {
    if (String(url).includes("raw.githubusercontent.com")) { if (!cache) return { ok: false, status: 404 }; const b = gzipSync(Buffer.from(JSON.stringify(cache))); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; }
    if (String(url).includes("okx.com")) { pide.push({ okx: String(url) }); return { ok: true, status: 200, json: async () => ({ data: [] }) }; }
    const b = JSON.parse(o.body); pide.push(b);
    if (b.type === "metaAndAssetCtxs") return { ok: true, status: 200, json: async () => [{ universe: coins.map((c) => ({ name: c })) }, coins.map(() => ({ dayNtlVlm: 1e9 }))] };
    return { ok: true, status: 200, json: async () => [] };
  };
  return { fin, ini, pide, fetch };
}
const llena = (s, ini, fin) => { const k = new Map(), f = new Map(); for (let t = ini; t < fin; t += H) { k.set(t, [100, 1, 101, 99, 100]); f.set(t, 0.00001); } return CH.aCache(s, k, f, ini, fin); };

test("💾 datos(): una cripto ya en la caché solo pide lo nuevo (desde 48 h antes de su último dato), no los 540 días", async () => {
  const W = mundoDatos({ coins: ["BTC"] }); const ult = W.fin - 3 * H;
  const cache = { v: 1, c: { BTC: llena("hl", W.ini, ult) } }; Object.assign(W, mundoDatos({ cache, coins: ["BTC"] })); CH.deps.fetch = W.fetch; CH.deps.espera = async () => {};
  const D = await CH.datos(() => {});
  assert.deepEqual(D.U, ["BTC"]);
  const v = W.pide.filter((b) => b.type === "candleSnapshot"), fh = W.pide.filter((b) => b.type === "fundingHistory");
  assert.equal(v.length, 1); assert.equal(v[0].req.startTime, ult - H - 48 * H, "solo lo último");
  assert.equal(fh.length, 1); assert.equal(fh[0].startTime, ult - H - 48 * H);
  assert.ok(D.cache.c.BTC, "y la caché nueva lo guarda");
});

test("💾 datos(): como mucho NUEVAS_MAX criptos nuevas por ronda (las demás, en las siguientes); BTC siempre", async () => {
  const coins = ["BTC", ...Array.from({ length: CH.NUEVAS_MAX + 7 }, (_, i) => "N" + i)];
  const W0 = mundoDatos({ coins }); const cache = { v: 1, c: { BTC: llena("hl", W0.ini, W0.fin) } }; const W = mundoDatos({ cache, coins }); CH.deps.fetch = W.fetch; CH.deps.espera = async () => {};
  const msgs = []; await CH.datos((m) => msgs.push(m));
  const nuevasPedidas = new Set(W.pide.filter((b) => b.type === "fundingHistory" && b.coin !== "BTC").map((b) => b.coin));
  assert.equal(nuevasPedidas.size, CH.NUEVAS_MAX); assert.ok(msgs.some((m) => /7 criptos más esperan su turno/.test(m)));
});

test("💾 datos(): si una cripto de la caché no se puede actualizar esta ronda, su caché NO se pierde", async () => {
  const coins = ["BTC", "ETH"]; const W0 = mundoDatos({ coins }); const eth = llena("okx", W0.ini, W0.fin - 2 * H);
  const W = mundoDatos({ cache: { v: 1, c: { BTC: llena("hl", W0.ini, W0.fin), ETH: eth } }, coins }); const f0 = W.fetch;
  CH.deps.fetch = async (u, o) => { if (String(u).includes("okx.com")) throw new Error("red"); return f0(u, o); }; CH.deps.espera = async () => {};
  const D = await CH.datos(() => {}); assert.ok(!D.U.includes("ETH")); assert.deepEqual(D.cache.c.ETH, eth);
});

test("⏱️ laboratorio: marca como probadas SOLO las combinaciones examinadas y para al agotar el tiempo (sin cortar la ronda a medias)", () => {
  const s = readFileSync(new URL("../runner/caza-lab.mjs", import.meta.url), "utf8");
  assert.match(s, /vistas = \{ has: \(k\) => !!vista\(VB, k\) \|\| enRonda\.has\(k\), add: \(k\) => enRonda\.add\(k\) \}/);
  assert.match(s, /if \(hechas >= 50 && Date\.now\(\) > LIMITE\) break; hechas\+\+; const r = evalua\(g\), k = hs\(clave\(g\)\), f = S\[g\.a\]\.fam; marca\(VB, k\);/);
  assert.match(s, /cand\.length = hechas;/); assert.match(s, /await guardaCache\(o\.__cache\)/);
});

// ---------- en vivo (dinero real): con la caché reciente solo se piden las últimas horas ----------
test("💧 en vivo: con caché reciente solo pide las últimas 3 h de cada cripto; sin caché (o vieja), la serie entera; BTC primero", async () => {
  process.env.GITHUB_TOKEN = "";
  const HL = await import("../runner/hl-real.mjs"); const fin = Math.floor(Date.now() / H) * H, ini = fin - 1200 * H;
  const fresca = llena("hl", ini, fin - H), vieja = llena("hl", ini - 200 * H, fin - 100 * H);
  const cache = { v: 1, c: { ETH: fresca, SOL: vieja } }, pide = [];
  HL.deps.espera = async () => {}; let guardada = null; HL.deps.guardaVivo = async (c) => { guardada = c; return true; };
  HL.deps.fetch = async (url, o) => { if (String(url).includes("raw.githubusercontent.com")) { const b = gzipSync(Buffer.from(JSON.stringify(cache))); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; }
    const b = JSON.parse(o.body); pide.push(b); return { ok: true, status: 200, json: async () => [] }; };
  await HL._datosVivos(["ETH", "SOL", "BTC"]);
  const v = pide.filter((b) => b.type === "candleSnapshot");
  assert.equal(v[0].req.coin, "BTC", "BTC el primero");
  assert.equal(v.find((b) => b.req.coin === "ETH").req.startTime, fin - 2 * H - 3 * H, "caché reciente: solo lo último");
  assert.equal(v.find((b) => b.req.coin === "SOL").req.startTime, ini, "caché de hace días: la serie entera");
  assert.equal(v.find((b) => b.req.coin === "BTC").req.startTime, ini, "sin caché: la serie entera");
  assert.ok(guardada && guardada.ETH, "se guarda para la próxima hora");
});

test("💧 en vivo: la ronda de Hyperliquid tiene tiempo para descargar ~100 criptos a ritmo", () => {
  assert.match(readFileSync(new URL("../.github/workflows/meme.yml", import.meta.url), "utf8"), /timeout 720 node runner\/hl-real\.mjs ronda/);
});
