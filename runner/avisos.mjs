// v202 · 🔔 AVISOS POR TELEGRAM cuando algo es MUY efectivo (solo dinero ficticio; nunca se escriben en los registros públicos)
//  · una cuenta va muy bien: sus últimas 20 operaciones ganan de media ≥ 1 % (memes ≥ 2 %), con factor de beneficio ≥ 1,5 y el saldo ≥ +5 %
//  · una operación sale muy bien: ≥ +30 % en memecoins, ≥ +5 % en Bitvavo
//  · la bola encuentra y adopta unas reglas ganadoras
// Sin repetirse: cada aviso, como mucho una vez cada 12 h (y como mucho 8 operaciones destacadas al día por cuenta).
const env = (k) => (process.env[k] || "").trim();
export async function tg(text) {
  const tok = env("TELEGRAM_TOKEN"), chat = env("TELEGRAM_CHAT"); let ok = false;
  // v380 · hasta 3 intentos: los avisos de compras y ventas tienen que llegar sí o sí
  if (tok && chat) for (let t = 0; t < 3 && !ok; t++) { try { const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10000) }); ok = r.ok; if (!ok && r.status === 429) await new Promise((z) => setTimeout(z, 3000 * (t + 1))); else if (!ok && r.status < 500) break; } catch (e) {} if (!ok) await new Promise((z) => setTimeout(z, 1500 * (t + 1))); }
  return ok;
}
const r2 = (x) => Math.round(x * 100) / 100;
export function rendimiento(closed, n = 20) {
  const c = (closed || []).slice(0, n); if (c.length < n) return null;
  const pcs = c.map((x) => +x.pc || 0), med = pcs.reduce((a, b) => a + b, 0) / pcs.length; let gw = 0, gl = 0; for (const x of pcs) { if (x > 0) gw += x; else gl -= x; }
  return { n: c.length, med: r2(med), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, win: Math.round(pcs.filter((x) => x > 0).length / pcs.length * 100) };
}
// decide qué avisos tocan; A = memoria de avisos (se guarda en el estado). Devuelve los textos (y los marca como enviados)
export function avisosCuenta(A, clave, nombre, C, now, umbrales) {
  const out = [], t = now.getTime(), U = { med: 1, big: 5, ...umbrales }; if (!C || !C.st) return out;
  A.k = A.k || {}; A.d = A.d || {};
  const dia = now.toISOString().slice(0, 10), puede = (k, h = 12) => !(A.k[k] && t - A.k[k] < h * 3600e3), marca = (k) => { A.k[k] = t; };
  // 1) la cuenta va muy bien
  const R = rendimiento(C.closed), eq = +C.lastEq || 0, st = +C.start || 100;
  if (R && R.med >= U.med && R.pf >= 1.5 && eq >= st * 1.05 && puede(clave + ":racha")) {
    marca(clave + ":racha");
    out.push(`🔥 ${nombre} está siendo MUY efectivo (dinero ficticio)\n• Últimas ${R.n} operaciones: ${R.med >= 0 ? "+" : ""}${R.med} % de media, ${R.win} % ganadoras, factor de beneficio ${R.pf}\n• Saldo: ${r2(eq)} € (empezó con ${r2(st)} €)\nÁbrelo en la app → Cripto.`);
  }
  // 2) operaciones muy buenas cerradas desde el último aviso
  const desde = A.t && A.t[clave] ? A.t[clave] : t - 5 * 60000; A.t = A.t || {};
  for (const x of (C.closed || []).filter((x) => Date.parse(x.t1) > desde && +x.pc >= U.big).slice(0, 3)) {
    const kd = clave + ":" + dia; if ((A.d[kd] || 0) >= 8) break; A.d[kd] = (A.d[kd] || 0) + 1;
    out.push(`💰 ${nombre}: gran operación con ${x.sym ? "$" + x.sym : "una cripto"} → ${+x.pc >= 0 ? "+" : ""}${r2(x.pc)} % (${x.pnl >= 0 ? "+" : ""}${r2(x.pnl)} €, dinero ficticio)\n${x.why || ""}`);
  }
  A.t[clave] = t;
  for (const k of Object.keys(A.d)) if (!k.endsWith(dia)) delete A.d[k];
  return out;
}
export function avisoReglas(A, clave, texto, now) {
  A.k = A.k || {}; const t = now.getTime(); if (A.k[clave] && t - A.k[clave] < 24 * 3600e3) return null; A.k[clave] = t; return texto;
}
