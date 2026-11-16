// ============================================================================================
// v1.0 · 🌐 FUENTES DE IDEAS DE INTERNET (para los laboratorios: caza-lab.mjs e ia-lab.mjs)
// Solo LEE resúmenes públicos (RSS/Atom) de estudios y blogs de trading cuantitativo. No usa claves, no escribe nada
// y no decide nada: las ideas son candidatas que tienen que aprobar el examen del laboratorio como todas.
//   · más fuentes y mejor elegidas (las de rotación de ETF y seguimiento de tendencia encajan con la cartera real)
//   · se quita el ruido (estudios de «agentes de IA», modelos de lenguaje…) y se queda lo que habla de estrategias
//   · se mezclan las fuentes por turnos, para que una sola (arXiv) no lo llene todo
//   · se cuenta lo que llega de cada fuente, para ver cuáles responden de verdad
// ============================================================================================
export const FUENTES = [
  ["arXiv (finanzas cuantitativas)", "https://export.arxiv.org/api/query?search_query=cat:q-fin.TR+OR+cat:q-fin.PM+OR+cat:q-fin.ST&sortBy=submittedDate&sortOrder=descending&max_results=80"],
  ["Alpha Architect", "https://alphaarchitect.com/feed/"],
  ["Quantpedia", "https://quantpedia.com/feed/"],
  ["Allocate Smartly", "https://allocatesmartly.com/feed/"],          // rotación táctica de ETF (lo que hace la cartera real)
  ["Newfound Research", "https://blog.thinknewfound.com/feed/"],      // seguimiento de tendencia y gestión del riesgo
  ["Quantocracy", "https://quantocracy.com/feed/"],                   // reúne cada día lo mejor de muchos blogs cuantitativos
  ["CXO Advisory", "https://www.cxoadvisory.com/feed/"],
  ["Robot Wealth", "https://robotwealth.com/feed/"],
  ["QuantStart", "https://www.quantstart.com/articles/rss/"],
];
// de qué tiene que hablar para servir (en título o resumen)
export const RELEVANTE = /momentum|trend|time.?series|reversal|mean.?revers|volatil|breakout|rotation|sector|asset.?allocation|tactical|dual.?momentum|carry|funding|perpetual|factor|drawdown|stop.?loss|moving.?average|risk.?parity|risk.?management|\bETFs?\b|crypto|bitcoin|seasonal|anomal|liquidity|order.?flow|pairs|cointegrat|turtle|donchian|\bRSI\b|MACD|bollinger|regime|defensive|market.?timing|backtest|trading.?strateg|portfolio/i;
// lo que NO sirve aunque nombre alguna palabra de arriba (sobre todo en arXiv)
export const RUIDO = /\bLLMs?\b|large.?language|language.?model|\bagents?\b|agentic|chatbot|\bGPT\b|persona|collusi|prompt|reinforcement.?learning.?from.?human|sentiment.?of.?tweets|blockchain.?consensus|smart.?contract/i;

const limpia = (s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&#8217;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
// lee un RSS o Atom → [{ fuente, titulo, resumen, link, fecha }]
export function parsea(xml, fuente, max = 40) {
  const out = [];
  for (const m of [...String(xml || "").matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)].slice(0, max)) {
    const b = m[0], titulo = limpia((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
    const resumen = limpia((b.match(/<(description|summary|content:encoded|content)[^>]*>([\s\S]*?)<\/\1>/) || [])[2]);
    const link = limpia((b.match(/<link[^>]*href="([^"]+)"/) || b.match(/<link>([\s\S]*?)<\/link>/) || b.match(/<id>([\s\S]*?)<\/id>/) || [])[1]);
    const f = limpia((b.match(/<(pubDate|published|updated)>([\s\S]*?)<\/\1>/) || [])[2]);
    if (titulo) out.push({ fuente, titulo: titulo.slice(0, 200), resumen: resumen.slice(0, 600), link, fecha: Date.parse(f) ? new Date(f).toISOString() : null });
  }
  return out;
}
export const util = (it) => !!it && RELEVANTE.test(it.titulo + " " + it.resumen) && !RUIDO.test(it.titulo);
// por turnos: una de cada fuente, otra de cada fuente… (así arXiv no se lo come todo)
export function mezcla(items, n = 60) {
  const por = new Map(); for (const it of items) { if (!por.has(it.fuente)) por.set(it.fuente, []); por.get(it.fuente).push(it); }
  const out = [], colas = [...por.values()]; while (out.length < n && colas.some((c) => c.length)) for (const c of colas) if (c.length && out.length < n) out.push(c.shift());
  return out;
}
// lee todas las fuentes a la vez; una que falla no para nada. Devuelve las útiles mezcladas y cuántas llegaron de cada una
export async function leeFuentes(fetchFn = (...a) => globalThis.fetch(...a), { fuentes = FUENTES, max = 40, timeout = 15000, n = 60 } = {}) {
  const todas = [], porFuente = {};
  await Promise.all(fuentes.map(async ([f, u]) => { porFuente[f] = { leidas: 0, utiles: 0 };
    try { const r = await fetchFn(u, { signal: AbortSignal.timeout(timeout), headers: { "User-Agent": "Mozilla/5.0 (compatible; bot-trading-lab/1.0; lector RSS)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
      if (!r.ok) { porFuente[f].error = "HTTP " + r.status; return; }
      const it = parsea(await r.text(), f, max), ok = it.filter(util); porFuente[f].leidas = it.length; porFuente[f].utiles = ok.length; todas.push(...ok);
    } catch (e) { porFuente[f].error = String((e && e.name) || "error").slice(0, 40); } }));
  // orden estable (como en la lista) antes de mezclar, para que el resultado no dependa de quién respondió antes
  const orden = new Map(fuentes.map(([f], i) => [f, i])); todas.sort((a, b) => orden.get(a.fuente) - orden.get(b.fuente));
  return { items: mezcla(todas, n), porFuente };
}
