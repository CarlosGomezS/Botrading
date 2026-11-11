// v366 · 🤖 AYUDANTE IA DEL LABORATORIO (Google Gemini, plan gratuito)
// Cada 3 h (v409) lee lo que ha aprendido cada laboratorio y le pide a la IA IDEAS NUEVAS:
//   · cripto: «recetas» en un formato cerrado (indicadores + comparaciones + umbrales), ver ia-receta.mjs
//   · ETF/acciones: «genes» del laboratorio con los valores permitidos de siempre
// Todo se comprueba aquí y otra vez en el laboratorio; lo que no cumple el formato se descarta. La IA NO cambia el examen, la memoria,
// los pesos ni el código: sus ideas son unas candidatas más (como mucho ~15 % de cada ronda) y tienen que aprobar como todas.
// Sin clave (secreto GEMINI_KEY) o si la IA falla, no pasa nada: los laboratorios siguen exactamente igual.
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { validaReceta, INDICADORES, OPS, SALIDAS, STOPS, describe } from "./ia-receta.mjs";
const env = (k) => (process.env[k] || "").trim(), REPO = env("GITHUB_REPOSITORY") || "CarlosGomezS/Botrading", TOKEN = env("GITHUB_TOKEN"), KEY = env("GEMINI_KEY");
const RAMA = "ia-lab", sh = (c) => execSync(c, { stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 28 });
const raw = async (rama, f) => { try { const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${rama}/${f}?t=${Date.now()}`, { signal: AbortSignal.timeout(60000) }); if (r.ok) return await r.json(); } catch (e) {} return null; };
const log = (...a) => console.log("🤖 IA ·", ...a);

// ---------- Gemini ----------
async function modelos() {
  if (env("GEMINI_MODEL")) return [env("GEMINI_MODEL")];
  try { const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": KEY }, signal: AbortSignal.timeout(20000) }); const j = await r.json();
    const ms = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, "")).filter((n) => /gemini/i.test(n) && /flash|pro/i.test(n) && !/image|tts|audio|live|embed|vision|thinking-exp|computer|robotics|nano|banana/i.test(n));
    const ver = (n) => +((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0), lite = (n) => (/lite/.test(n) ? 1 : 0), pre = (n) => (/preview|exp/.test(n) ? 1 : 0);
    const pro = (n) => (/pro/.test(n) ? 0 : 1);   /* v409 · primero el modelo más listo («pro»); si el plan gratis no lo deja, el «flash» */
    ms.sort((a, b) => pro(a) - pro(b) || lite(a) - lite(b) || ver(b) - ver(a) || pre(a) - pre(b)); if (ms.length) return [...ms.filter((n) => /pro/.test(n)).slice(0, 2), ...ms.filter((n) => !/pro/.test(n)).slice(0, 4)];
  } catch (e) {}
  return ["gemini-2.5-flash", "gemini-2.0-flash"];
}
const T0 = Date.now(), QUEDA = () => 16 * 60e3 - (Date.now() - T0);   // como mucho ~11 min en total: siempre da tiempo a guardar
async function geminiSolo(prompt, MS) {
  let ultimo = "";
  for (const m of MS) for (let t = 0; t < 2; t++) { if (QUEDA() < 90e3) throw new Error("sin tiempo · " + ultimo);
    try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, signal: AbortSignal.timeout(Math.max(30000, Math.min(150000, QUEDA() - 60000))),
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 1.0 } }) });
      if (r.status === 429 || r.status >= 500) { ultimo = m + " HTTP " + r.status; log(`${m}: ocupado (HTTP ${r.status}), reintento`); await new Promise((z) => setTimeout(z, 8000)); continue; }
      if (!r.ok) { ultimo = m + " HTTP " + r.status; log(`${m}: no disponible con esta clave (HTTP ${r.status}), pruebo otro`); break; }
      const j = await r.json(), txt = (((j.candidates || [])[0] || {}).content || {}).parts?.map((p) => p.text || "").join("") || "";
      return { modelo: m, json: JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim()) };
    } catch (e) { ultimo = m + " " + String(e.message).slice(0, 60); }
  }
  throw new Error(ultimo || "sin respuesta");
}

// ---------- cripto ----------
async function cripto(MS, prev) {
  const cl = await raw("caza-lab", "caza-lab.json"); const { FILTROS } = await import("./caza-hl2.mjs"), FN = Object.keys(FILTROS);
  const resIA = (cl && cl.ia) || {}, mias = (prev && prev.recetas) || [];
  const fb = mias.map((r) => ({ r, s: resIA[r.id] })).filter((x) => x.s && x.s.n);
  const mejores = fb.slice().sort((a, b) => (b.s.nota || 0) - (a.s.nota || 0)).slice(0, 8), peores = fb.slice().sort((a, b) => (a.s.nota || 0) - (b.s.nota || 0)).slice(0, 5);
  const P = `Eres un investigador cuantitativo. Diseña estrategias NUEVAS de trading intradía para futuros perpetuos de criptomonedas en Hyperliquid (velas de 1 hora, 20 criptos líquidas, 18 meses de datos).
Costes reales por operación: 0,045 % de comisión + 0,05 % de deslizamiento, más la financiación horaria. Se pueden abrir largos y cortos. Objetivo: 4-10 operaciones al día en total y ganar DE FORMA ROBUSTA.
El examen es muy duro: tiene que ganar en la historia completa hasta hoy, en los últimos 6 meses y en al menos el 60 % de 16 tramos al azar; factor de beneficio ≥ 1,15; caída < 30 %.
Hasta ahora casi nada aprueba: las señales clásicas solas (RSI, Bollinger, Donchian, cruces, MACD, VWAP, volumen, sesiones, Supertrend, arbitraje contra BTC, financiación) pierden con estos costes. Hace falta creatividad: combinar contexto (régimen, BTC, financiación, volatilidad, hora) con el disparo, evitar operar en ruido, buscar asimetrías.

Familias con más peso aprendido (más alto = se ha acercado más): ${JSON.stringify((cl && cl.pesosVista) || {})}
Las que más se han acercado: ${JSON.stringify(((cl && cl.mejoresCasi) || []).slice(0, 5).map((x) => ({ n: x.n, historia: x.a && +(x.a.ret * 100).toFixed(1), ult6m: x.b && +(x.b.ret * 100).toFixed(1), tramos_ok: x.t && x.t.g })))}
Ideas recientes leídas (títulos): ${JSON.stringify(((cl && cl.ideas) || []).slice(0, 15).map((x) => x.tit))}
${mejores.length ? `TUS recetas anteriores que MEJOR fueron (mejóralas o combínalas): ${JSON.stringify(mejores.map((x) => ({ nombre: x.r.nombre, regla: describe(x.r), resultado: x.s })))}` : ""}
${peores.length ? `TUS recetas anteriores que PEOR fueron (no repitas esa idea): ${JSON.stringify(peores.map((x) => ({ nombre: x.r.nombre, regla: describe(x.r), resultado: x.s })))}` : ""}

TU CUADERNO DE LECCIONES (lo que has aprendido en rondas anteriores; respétalo): ${JSON.stringify((prev && prev.lecciones) || [])}
TU MEMORIA LARGA (lecciones de todas tus rondas anteriores, de la más reciente a la más antigua; úsala para no repetir errores y para construir sobre lo que ya funcionó): ${JSON.stringify(((globalThis.__MEM || {}).cripto || []).slice(0, 80).map((x) => x.l))}

FORMATO OBLIGATORIO. Responde SOLO un JSON: {"lecciones":[hasta 20 lecciones breves en castellano: tu cuaderno ACTUALIZADO con lo que confirman los resultados de arriba; conserva las que sigan valiendo, corrige las que los datos desmientan y añade las nuevas], "recetas":[ ... 15 recetas ... ]}. Cada receta:
{"nombre": "corto, en castellano", "idea": "por qué debería funcionar (1 frase, castellano)", "largo": [condiciones], "corto": [condiciones], "salida_h": una de ${JSON.stringify(SALIDAS)}, "stop": uno de ${JSON.stringify(STOPS)}, "filtro": uno de ${JSON.stringify(FN)}}
"largo" = condiciones que TODAS deben cumplirse para comprar (0 a 4); "corto" = para vender en corto (0 a 4). Al menos una de las dos con condiciones.
Condición: {"a": EXPR, "op": uno de ${JSON.stringify(OPS)}, "b": EXPR o número, "x": multiplicador opcional de b entre 0.5 y 2}
EXPR: {"ind": nombre, "n": entero 2-500 si lo pide, "k": 0.5-5 si lo pide}. Indicadores: ${JSON.stringify(INDICADORES)}. Parámetros: ema/sma/rsi/atr_pct/maximo/minimo/ret/vol_rel/zscore/financiacion/btc_ret/rel_btc llevan n; bb_sup/bb_inf llevan n y k; precio y hora no llevan nada.
Ejemplo: {"nombre":"Ruptura con BTC a favor","idea":"…","largo":[{"a":{"ind":"precio"},"op":">","b":{"ind":"maximo","n":48}},{"a":{"ind":"btc_ret","n":24},"op":">","b":0}],"corto":[],"salida_h":8,"stop":0.03,"filtro":"sin filtro"}
Que las 15 sean MUY distintas entre sí y distintas de lo ya probado.`;
  const { modelo, json } = await gemini(P, MS);
  const nuevas = ((json && json.recetas) || []).map((r) => validaReceta(r, FN)).filter(Boolean);
  const todas = [...nuevas.map((r) => ({ ...r, t: new Date().toISOString(), modelo })), ...mias].filter((r, i, A) => A.findIndex((z) => z.id === r.id) === i).slice(0, 150);
  log(`cripto: la IA (${modelo}) propone ${((json && json.recetas) || []).length} recetas · válidas ${nuevas.length}`); for (const r of nuevas.slice(0, 15)) log(`  · ${r.nombre}: ${describe(r)}`);
  const lec = Array.isArray(json && json.lecciones) ? json.lecciones.map((x) => String(x).replace(/[<>`]/g, "").slice(0, 220)).filter(Boolean).slice(0, 20) : null;
  if (lec && lec.length) { log("cripto · cuaderno de lecciones:"); for (const x of lec) log("  📓 " + x); }
  return { recetas: todas, nuevas: nuevas.length, modelo, lecciones: lec && lec.length ? lec : (prev && prev.lecciones) || [] };
}

// ---------- ETF / acciones ----------
function valoresETF() {
  const s = readFileSync(path.join(process.cwd(), "index.html"), "utf8"), ex = (re) => (s.match(re) || [])[1];
  const LABUtxt = ex(/const LABU=(\{[\s\S]*?\});\s*\n/) || "", ukeys = [...LABUtxt.matchAll(/(?:^\{|,|\*\/)\s*([a-z0-9]+):\{n:"([^"]+)"/g)].map((m) => [m[1], m[2]]);
  const LB = JSON.parse(ex(/const LABLB=(\[\[[^;]*?\]\]),/) || "[]"), Vtxt = ex(/const LABV=(\{[^;]*?\});/) || "{}", PN = ex(/const LABPN=(\{[^;]*?\});/) || "{}";
  const V = Function("LABU", "LABLB", "return " + Vtxt)(Object.fromEntries(ukeys.map(([k]) => [k, 1])), LB), N = Function("return " + PN)();
  return { V, N, U: Object.fromEntries(ukeys), LB };
}
async function etf(MS, prev) {
  const VV = valoresETF(); if (!VV.V.u || !VV.V.u.length) throw new Error("no se pudieron leer los valores del laboratorio");
  let top = [], res = [];
  try { const st = await raw("data", "state.json"), S = JSON.parse(st.ls.pb19), L = S.lab || {}, an = S.labAn || {}, TV = (S.btm && S.btm.tr && S.btm.tr.v) || {};
    const ks = (L.top3 || []).map((x) => x.k).concat(Object.keys(L.pop || {})).filter((k, i, A) => A.indexOf(k) === i);
    top = ks.map((k) => ({ k, g: (L.pop[k] || L.pend[k] || {}).g, an: an[k], t: TV[k] })).filter((x) => x.g).slice(0, 12).map((x) => ({ gen: x.g, rentab_anual: x.an != null ? +(x.an * 100).toFixed(1) : null, tramos: x.t ? { gana_al_sp500: x.t.g, tipico: x.t.mA, ult18m: x.t.rec } : null }));
    res = Object.values(L.iaRes || {}).map((x) => ({ gen: x.g, rentab_anual: x.an != null ? +(x.an * 100).toFixed(1) : null, aprobo: x.ok, por_que_no: x.por || undefined }));
  } catch (e) { log("ETF: no se pudo leer el estado del laboratorio (" + String(e.message).slice(0, 60) + ")"); }
  const P = `Eres un gestor cuantitativo. Diseña estrategias NUEVAS de rotación mensual/trimestral de ETF para una cartera real en Trading 212 (Europa), usando SOLO las piezas de este laboratorio.
Examen: 300 tramos al azar de 3 a 7 años desde el año 2000 (la mitad acaban hoy); tiene que ganarle al S&P 500 en ≥ 60 % de los tramos, no ir mal en los últimos 18 meses, y se ordena por la rentabilidad típica en esos tramos (empate: menos caída).
Piezas del «gen» (qué significa cada una): ${JSON.stringify(VV.N)}
Valores permitidos (USA SOLO ESTOS): ${JSON.stringify(VV.V)}
Grupos de ETF (u): ${JSON.stringify(VV.U)}
Plazos de fuerza (l = índice): ${JSON.stringify(VV.LB.map((x, i) => [i, x.join("/") + " días"]))}
Los mejores del laboratorio ahora mismo: ${JSON.stringify(top)}
${res.length ? `RESULTADOS de tus ideas anteriores en el examen (aprende de ellos): ${JSON.stringify(res.slice(-25))}` : ""}
${prev && prev.genes && prev.genes.length ? `Tus propuestas anteriores (no las repitas): ${JSON.stringify(prev.genes.slice(0, 16).map((x) => x.g))}` : ""}
TU CUADERNO DE LECCIONES (de rondas anteriores; respétalo): ${JSON.stringify((prev && prev.lecciones) || [])}
TU MEMORIA LARGA (lecciones de todas tus rondas anteriores, de la más reciente a la más antigua; úsala para no repetir errores y para construir sobre lo que ya funcionó): ${JSON.stringify(((globalThis.__MEM || {}).etf || []).slice(0, 80).map((x) => x.l))}
Responde SOLO un JSON: {"lecciones":[hasta 20 lecciones breves en castellano: tu cuaderno ACTUALIZADO según lo que muestran los mejores métodos y tus propuestas anteriores], "genes":[{"g": {pieza: valor, ...}, "idea": "por qué (1 frase, castellano)"} ... 10 genes ...]}. Cada g debe traer las piezas u, l, s, t, f, i, a, r, p (y las demás si quieres). Que sean muy distintos entre sí: grupos de ETF, estilos (z), regímenes (rg) y refugios distintos.`;
  const { modelo, json } = await gemini(P, MS);
  const ok = (g) => { if (!g || typeof g !== "object") return null; const o = {}; for (const [k, v] of Object.entries(g)) { if (!VV.V[k]) return null; if (!VV.V[k].some((z) => z === v)) return null; o[k] = v; } for (const k of ["u", "l", "t"]) if (o[k] == null) return null; return o; };
  const nuevos = ((json && json.genes) || []).map((x) => ({ g: ok(x && x.g), idea: String((x && x.idea) || "").replace(/[<>`]/g, "").slice(0, 200) })).filter((x) => x.g);
  const todos = [...nuevos.map((x) => ({ ...x, t: new Date().toISOString(), modelo })), ...((prev && prev.genes) || [])].filter((x, i, A) => A.findIndex((z) => JSON.stringify(z.g) === JSON.stringify(x.g)) === i).slice(0, 80);
  log(`ETF: la IA (${modelo}) propone ${((json && json.genes) || []).length} genes · válidos ${nuevos.length}`); for (const x of nuevos) log(`  · ${JSON.stringify(x.g)} — ${x.idea}`);
  const lec = Array.isArray(json && json.lecciones) ? json.lecciones.map((x) => String(x).replace(/[<>`]/g, "").slice(0, 220)).filter(Boolean).slice(0, 20) : null;
  if (lec && lec.length) { log("ETF · cuaderno de lecciones:"); for (const x of lec) log("  📓 " + x); }
  return { genes: todos, nuevos: nuevos.length, modelo, lecciones: lec && lec.length ? lec : (prev && prev.lecciones) || [] };
}

// v414 · 🔁 si Gemini no deja (clave sin cuota, pide pago, caída…), la misma pregunta va a Groq u OpenRouter (gratis), si hay clave
const GROQ = env("GROQ_KEY"), OR = env("OPENROUTER_KEY");
async function compat(url, key, modelos, prompt, extra = {}) { let ultimo = "";
  for (const m of modelos) { if (QUEDA() < 90e3) break;
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, ...extra }, signal: AbortSignal.timeout(Math.max(30000, Math.min(120000, QUEDA() - 60000))),
        body: JSON.stringify({ model: m, messages: [{ role: "system", content: "Responde SOLO con un objeto JSON válido, sin texto alrededor." }, { role: "user", content: prompt }], temperature: 0.9, response_format: { type: "json_object" } }) });
      if (!r.ok) { ultimo = m + " HTTP " + r.status; log(`${m}: no responde (HTTP ${r.status}), pruebo otro`); continue; }
      const j = await r.json(), txt = ((((j.choices || [])[0] || {}).message || {}).content || "").replace(/^```(json)?|```$/g, "").trim(); return { modelo: m, json: JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) };
    } catch (e) { ultimo = m + " " + String(e.message).slice(0, 60); } }
  throw new Error(ultimo || "sin respuesta"); }
// v444 · 🧠 CONSEJO DE IAs: la misma pregunta va A LA VEZ a todas las IA gratuitas que tengan clave (Gemini, Groq, OpenRouter, NVIDIA y Mistral)
// y se juntan sus ideas (sin repetidas). Varias IA distintas proponen más y mejor que una sola; el examen del laboratorio decide igual que siempre.
const NV = env("NVIDIA_KEY"), MI = env("MISTRAL_KEY");
const LISTAS = ["recetas", "genes", "reglas"];
async function consejo(prompt, MS) {
  const OR_H = { "HTTP-Referer": "https://github.com/" + REPO, "X-Title": "Bot Trading" }, tareas = [];
  if (KEY && !globalThis.__GEMINI_KO) tareas.push(geminiSolo(prompt, MS).catch((e) => { if (/HTTP (401|402|403)/.test(String(e.message))) globalThis.__GEMINI_KO = 1; throw e; }));
  if (GROQ) tareas.push(compat("https://api.groq.com/openai/v1/chat/completions", GROQ, ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b"], prompt));
  if (OR) tareas.push(compat("https://openrouter.ai/api/v1/chat/completions", OR, ["deepseek/deepseek-chat-v3.1:free", "qwen/qwen3-235b-a22b:free", "openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free"], prompt, OR_H));
  if (NV) tareas.push(compat("https://integrate.api.nvidia.com/v1/chat/completions", NV, ["deepseek-ai/deepseek-v3.1", "qwen/qwen3-235b-a22b", "meta/llama-3.1-405b-instruct", "nvidia/llama-3.1-nemotron-ultra-253b-v1"], prompt));
  if (MI) tareas.push(compat("https://api.mistral.ai/v1/chat/completions", MI, ["mistral-large-latest", "mistral-medium-latest", "magistral-medium-latest"], prompt));
  if (!tareas.length) throw new Error("sin clave de IA (GEMINI_KEY, GROQ_KEY, OPENROUTER_KEY, NVIDIA_KEY o MISTRAL_KEY)");
  const R = (await Promise.allSettled(tareas)).filter((x) => x.status === "fulfilled" && x.value && x.value.json).map((x) => x.value);
  if (!R.length) { const e = (await Promise.allSettled(tareas)).find((x) => x.status === "rejected"); throw (e && e.reason) || new Error("ninguna IA respondió"); }
  const json = {}; for (const L of LISTAS) { const xs = R.flatMap((r) => (Array.isArray(r.json[L]) ? r.json[L].map((x) => (x && typeof x === "object" ? { ...x, _ia: r.modelo } : x)) : [])); if (xs.length) json[L] = xs.filter((x, i, A) => A.findIndex((z) => JSON.stringify({ ...z, _ia: 0, idea: 0, nombre: 0 }) === JSON.stringify({ ...x, _ia: 0, idea: 0, nombre: 0 })) === i); }
  const lec = []; for (const r of R) for (const x of (Array.isArray(r.json.lecciones) ? r.json.lecciones : [])) { const t = String(x); if (!lec.some((y) => y.slice(0, 60) === t.slice(0, 60))) lec.push(t); } if (lec.length) json.lecciones = lec.slice(0, 20);
  const modelo = R.length > 1 ? "consejo de " + R.length + " IA: " + R.map((r) => r.modelo).join(" + ") : R[0].modelo;
  log(`🧠 Consejo de IAs: respondieron ${R.length} de ${tareas.length} (${R.map((r) => r.modelo).join(", ")})`); return { modelo, json };
}
async function gemini(prompt, MS) { try { return await consejo(prompt, MS); } catch (e0) { if (/sin clave/.test(String(e0.message))) throw e0; } let err = null;
  if (KEY && !globalThis.__GEMINI_KO) { try { return await geminiSolo(prompt, MS); } catch (e) { err = e; if (/HTTP (401|402|403)/.test(String(e.message))) { globalThis.__GEMINI_KO = 1; log("Gemini no deja usar esta clave: paso a los otros proveedores gratis"); } } }
  if (GROQ) try { return await compat("https://api.groq.com/openai/v1/chat/completions", GROQ, ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "moonshotai/kimi-k2-instruct"], prompt); } catch (e) { err = e; }
  if (OR) try { return await compat("https://openrouter.ai/api/v1/chat/completions", OR, ["deepseek/deepseek-chat-v3.1:free", "qwen/qwen3-235b-a22b:free", "meta-llama/llama-3.3-70b-instruct:free", "openai/gpt-oss-120b:free"], prompt, { "HTTP-Referer": "https://github.com/" + REPO, "X-Title": "Bot Trading" }); } catch (e) { err = e; }
  throw err || new Error("sin clave de IA (GEMINI_KEY, GROQ_KEY u OPENROUTER_KEY)"); }

// ---------- v413 · 🐢 TORTUGAS (cripto diario, Bitvavo y OKX): la IA propone reglas nuevas con las piezas del motor ----------
async function buscaWeb(MS) { if (!KEY || globalThis.__GEMINI_KO) return "";   // la IA busca en internet estrategias diarias de cripto actuales (Google Search); si no se puede, se sigue sin ello
  for (const m of MS.slice(0, 3)) { if (QUEDA() < 240e3) return "";
    try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Busca en internet (fuentes de 2024-2026: estudios, backtests publicados, traders cuantitativos) qué estrategias de trading DIARIO de criptomonedas en spot (solo compras, sin apalancamiento, 1-4 semanas por operación) están funcionando mejor ahora: rupturas tipo Tortugas/Donchian, momentum, filtros de volumen, RSI, compresión de volatilidad, filtros de tendencia de BTC, salidas, etc. Resume en castellano, en 12 puntos concretos con números (días, umbrales) y qué dicen los datos. Sin relleno." }] }], tools: [{ google_search: {} }] }) });
      if (!r.ok) continue; const j = await r.json(), t = (((j.candidates || [])[0] || {}).content || {}).parts?.map((x) => x.text || "").join("") || "";
      if (t.length > 200) { log(`🌐 búsqueda en internet hecha con ${m} (${t.length} caracteres)`); return t.slice(0, 6000); } } catch (e) {} }
  log("🌐 no se pudo buscar en internet esta vez (se sigue igual)"); return ""; }
async function tortugas(MS, prev) {
  const TT = await import("./tortugas.mjs"), GEN = TT.GENES, el = await raw("examen-largo", "examen-largo.json");
  const est = {}; for (const [ex, t] of Object.entries((el && el.tortugas) || {})) for (const [rk, r] of Object.entries((t && t.perfiles) || {})) if (r && r.P) (est[ex] = est[ex] || {})[rk] = { regla: r.P, aprueba: r.ok, gana_2_anos: r.ret, peor_caida: r.dd, operaciones: r.n, semestres: r.semestres, tramos: r.tramos ? { no_pierde_en: r.tramos.g, ult6m: r.tramos.rec, btc6m: r.tramos.btcRec } : null, mejores_madres: (r.pob || []).slice(0, 3) };
  const web = await buscaWeb(MS);
  const P = `Eres un gestor cuantitativo experto en cripto. Diseña REGLAS NUEVAS para un bot de «Tortugas» que opera en spot (solo compras) en Bitvavo (comisión 0,25 %) y OKX (0,10 %), con velas DIARIAS de todas las criptos líquidas.
Cómo funciona: compra una cripto cuando su cierre supera el máximo de «ent» días y la vende cuando cierra bajo el mínimo de «sale» días; stop «kN» veces la volatilidad (ATR 20) con tope «stopMax»; como mucho «maxPos» a la vez; «filtro»: solo compra si BTC está sobre su media de «mFil» días; «atrMax»: evita las que se mueven más de ese % al día; «tp»/«tpFrac»: recoge ganancias; filtros de entrada nuevos: «vol» (volumen de hoy ≥ vol × media de 20 días), «rsiMax» (no compra si RSI14 > rsiMax), «comp» (solo tras calma: volatilidad 10 días < comp × la de 60), «momD» (solo si sube en momD días), «cazar» (no compra si subió más de cazar en 5 días). 0 = apagado.
Valores permitidos (USA SOLO ESTOS): ${JSON.stringify(GEN)}
Riesgos: «bajo» (maxPos ≥ 4, caída máx. 30 %), «medio» (maxPos ≥ 2, caída máx. 50 %), «alto» (maxPos ≥ 1, caída máx. 70 %). Siempre sale < ent.
Examen: 2 años; se elige con el 1.er año y tiene que ganar en el 2.º (que no vio), con las criptos del otro exchange y en los últimos 4 meses; luego 24 tramos al azar (la mitad acaban hoy) y no ir peor que BTC en 6 meses.
Estado actual por exchange y riesgo: ${JSON.stringify(est)}
${web ? `LO QUE HAS ENCONTRADO EN INTERNET AHORA (úsalo con criterio): ${web}` : ""}
${prev && prev.reglas && prev.reglas.length ? `Tus propuestas anteriores (no las repitas): ${JSON.stringify(prev.reglas.slice(0, 20).map((x) => x.P))}` : ""}
TU CUADERNO DE LECCIONES: ${JSON.stringify((prev && prev.lecciones) || [])}
TU MEMORIA LARGA: ${JSON.stringify(((globalThis.__MEM || {}).tort || []).slice(0, 80).map((x) => x.l))}
Responde SOLO un JSON: {"lecciones":[hasta 20 lecciones breves en castellano], "reglas":[{"P":{pieza: valor...}, "ex":"bitvavo"|"okx"|"ambos", "riesgo":"bajo"|"medio"|"alto", "idea":"por qué (1 frase)"} ... 24 reglas muy distintas entre sí, repartidas entre exchanges y riesgos ...]}`;
  const { modelo, json } = await gemini(P, MS);
  const ok = (x) => { const P0 = x && x.P; if (!P0 || typeof P0 !== "object") return null; const o = {}; for (const [k, v] of Object.entries(P0)) { if (!GEN[k] || !GEN[k].some((z) => z === v)) return null; o[k] = v; } const rk = ["bajo", "medio", "alto"].includes(x.riesgo) ? x.riesgo : "medio", c = TT.conP({ ...o, riesgo: rk }); if (!(c.sale < c.ent) || c.maxPos < TT.perfil(rk).maxPosMin) return null; return { P: c, ex: ["bitvavo", "okx", "ambos"].includes(x.ex) ? x.ex : "ambos", riesgo: rk, idea: String(x.idea || "").replace(/[<>`]/g, "").slice(0, 200) }; };
  const nuevas = ((json && json.reglas) || []).map(ok).filter(Boolean), reglas = [...nuevas.map((x) => ({ ...x, t: new Date().toISOString(), modelo })), ...((prev && prev.reglas) || [])].filter((x, i, A) => A.findIndex((z) => JSON.stringify(z.P) === JSON.stringify(x.P)) === i).slice(0, 60);
  log(`Tortugas: la IA (${modelo}) propone ${((json && json.reglas) || []).length} reglas · válidas ${nuevas.length}`); for (const x of nuevas.slice(0, 8)) log(`  · ${x.ex}/${x.riesgo}: ${TT.describe(x.P)} — ${x.idea}`);
  const lec = Array.isArray(json && json.lecciones) ? json.lecciones.map((x) => String(x).replace(/[<>`]/g, "").slice(0, 220)).filter(Boolean).slice(0, 20) : null;
  if (lec && lec.length) { log("Tortugas · cuaderno de lecciones:"); for (const x of lec) log("  📓 " + x); }
  return { reglas, nuevas: nuevas.length, modelo, web: !!web, lecciones: lec && lec.length ? lec : (prev && prev.lecciones) || [] }; }

async function main() {
  const prev = (await raw(RAMA, "ia-lab.json")) || {}, out = { v: 1, t: new Date().toISOString(), estado: "ok", cripto: prev.cripto || null, etf: prev.etf || null, tort: prev.tort || null, hist: prev.hist || [] };
  /* v409 · 🧠 MEMORIA LARGA: todas las lecciones que ha escrito alguna vez (sin repetir, con fecha), aunque luego las quite del cuaderno corto */
  const MEM = { cripto: [], etf: [], tort: [], ...(prev.memoria || {}) }; MEM.tort = MEM.tort || []; globalThis.__MEM = MEM;
  const guarda = (k, L) => { const ya = new Set(MEM[k].map((x) => x.l)); for (const l of L || []) if (l && !ya.has(l)) { MEM[k].unshift({ t: out.t, l }); ya.add(l); } MEM[k] = MEM[k].slice(0, 500); };
  guarda("cripto", prev.cripto && prev.cripto.lecciones); guarda("etf", prev.etf && prev.etf.lecciones); guarda("tort", prev.tort && prev.tort.lecciones);
  if (!KEY && !GROQ && !OR) { out.estado = "sin clave"; log("no hay clave GEMINI_KEY en los secretos de GitHub: los laboratorios siguen igual, sin ayudante"); }
  else { const MS0 = KEY ? await modelos() : [], bueno = prev.modeloOk, MS = bueno ? [bueno, ...MS0.filter((m) => m !== bueno)] : MS0;   // primero el que respondió la última vez
    log("modelos disponibles:", MS.join(", ")); const h = { t: out.t };
    try { out.cripto = await cripto(MS, prev.cripto); h.cripto = out.cripto.nuevas; } catch (e) { h.errC = String(e.message).slice(0, 80); log("cripto: la IA no respondió (" + h.errC + "); el laboratorio sigue igual"); }
    try { out.tort = await tortugas(MS, prev.tort); h.tort = out.tort.nuevas; } catch (e) { h.errT = String(e.message).slice(0, 80); log("Tortugas: la IA no respondió (" + h.errT + "); el examen sigue igual"); }
    try { out.etf = await etf(MS, prev.etf); h.etf = out.etf.nuevos; } catch (e) { h.errE = String(e.message).slice(0, 80); log("ETF: la IA no respondió (" + h.errE + "); el laboratorio sigue igual"); }
    out.modeloOk = (h.tort != null && out.tort && out.tort.modelo) || (h.cripto != null && out.cripto && out.cripto.modelo) || (h.etf != null && out.etf && out.etf.modelo) || prev.modeloOk || null;
    if (h.errC && h.errE) out.estado = "error"; out.hist = [h, ...out.hist].slice(0, 200); }
  try { guarda("cripto", out.cripto && out.cripto.lecciones); guarda("etf", out.etf && out.etf.lecciones); guarda("tort", out.tort && out.tort.lecciones); out.memoria = MEM; log(`memoria larga: ${MEM.cripto.length} lecciones de cripto · ${MEM.tort.length} de Tortugas · ${MEM.etf.length} de ETF`); } catch (e) {}
  // publicar en la rama ia-lab (pública: solo ideas, nada de dinero ni claves)
  const dir = path.join(process.env.RUNNER_TEMP || "/tmp", "ia-lab-pub"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "ia-lab.json"), JSON.stringify(out));
  if (!TOKEN) { log("sin GITHUB_TOKEN: no se publica"); return; }
  const url = `https://x-access-token:${TOKEN}@github.com/${REPO}.git`;
  sh(`cd ${dir} && git init -q && git checkout -q -b ${RAMA} && git add ia-lab.json && git -c user.name=bot -c user.email=bot@users.noreply.github.com commit -qm "Ayudante IA del laboratorio" && git push -qf ${url} ${RAMA}`);
  log("ideas guardadas");
}
main().catch((e) => { console.log("🤖 IA · error:", String(e.message).slice(0, 120)); process.exit(0); });
