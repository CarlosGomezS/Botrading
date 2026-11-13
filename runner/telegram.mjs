// Recoge lo que pulsas en Telegram (botones «Aprobar» / «Rechazar» de la cartera real) y lanza el flujo real.yml.
// Lo ejecuta telegram.yml cada ~5 minutos. No necesita instalar nada (solo fetch de Node).
// Seguridad: solo se obedece a TU chat (TELEGRAM_CHAT). Los registros de GitHub son públicos: aquí no se escribe ningún dato.
const env = (k) => (process.env[k] || "").trim();
const TOK = env("TELEGRAM_TOKEN"), CHAT = env("TELEGRAM_CHAT"), USER = env("TELEGRAM_USER"), GH = env("GITHUB_TOKEN"), REPO = env("GITHUB_REPOSITORY");
const api = async (m, body) => {
  let last;
  for (const w of [0, 3000, 8000]) {   // los fallos de red suelen ser momentáneos
    if (w) await new Promise((ok) => setTimeout(ok, w));
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOK}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(20000) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) return j.result;
      last = new Error(`Telegram ${m}: HTTP ${r.status}`); if (r.status < 500 && r.status !== 429) throw last;
    } catch (e) { last = e; if (/HTTP 4/.test(String(e.message)) && !/429/.test(String(e.message))) throw e; }
  }
  throw last;
};
const say = (chat, text) => api("sendMessage", { chat_id: chat, text, disable_web_page_preview: true }).catch(() => {});

// v175 · orden de Memes con dinero real: se guarda en la rama «meme-ctl» (ctl.json, sin importes)
async function memesCtl(o) {
  const u = `https://api.github.com/repos/${REPO}/contents/ctl.json`, H = { Authorization: "Bearer " + GH, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  const r = await fetch(u + "?ref=meme-ctl", { headers: H }); const cur = r.ok ? await r.json() : null; let c = { aprobado: null, parado: false };
  try { if (cur && cur.content) c = JSON.parse(Buffer.from(cur.content, "base64").toString("utf8")); } catch (e) {}
  if (o.accion === "aprobar") { c.aprobado = o.id; c.parado = false; } else if (o.accion === "no") c.rechazado = o.id; else if (o.accion === "parar") { c.parado = true; c.motivo = "lo has parado tú"; } else if (o.accion === "seguir") { c.parado = false; c.motivo = null; }
  c.t = new Date().toISOString();
  const w = await fetch(u, { method: "PUT", headers: H, body: JSON.stringify({ message: "memes: orden desde Telegram", content: Buffer.from(JSON.stringify(c)).toString("base64"), branch: "meme-ctl", ...(cur && cur.sha ? { sha: cur.sha } : {}) }) });
  return w.ok;
}
// v233 · /parar y /seguir también paran o reanudan Bitvavo con dinero real (rama «bitvavo-ctl», sin importes)
async function bvCtl(o) {
  if (o.accion !== "parar" && o.accion !== "seguir") return true;
  const u = `https://api.github.com/repos/${REPO}/contents/ctl.json`, H = { Authorization: "Bearer " + GH, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  const r = await fetch(u + "?ref=bitvavo-ctl", { headers: H }); const cur = r.ok ? await r.json() : null; let c = { copia: "mix", parado: false };
  try { if (cur && cur.content) c = JSON.parse(Buffer.from(cur.content, "base64").toString("utf8")); } catch (e) {}
  if (o.accion === "parar") { c.parado = true; c.motivo = "lo has parado tú"; } else { c.parado = false; c.motivo = null; for (const k of Object.values(c.cuentas || {})) if (k) { k.parado = false; k.motivo = null; } }   // v243: /seguir reanuda también la cuenta parada por el freno
  c.t = new Date().toISOString();
  const w = await fetch(u, { method: "PUT", headers: H, body: JSON.stringify({ message: "bitvavo: orden desde Telegram", content: Buffer.from(JSON.stringify(c)).toString("base64"), branch: "bitvavo-ctl", ...(cur && cur.sha ? { sha: cur.sha } : {}) }) });
  return w.ok;
}
async function dispatch(accion, plan) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/real.yml/dispatches`, {
    method: "POST", headers: { Authorization: "Bearer " + GH, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { accion, plan } }),
  });
  return r.status === 204;
}

// v479 · 🔐 solo obedece a TU usuario: el botón tiene que venir de tu chat Y pulsarlo tu cuenta de Telegram (TELEGRAM_USER; en un chat privado
//   tu número de chat ES tu usuario, así que no hace falta configurarlo). En un grupo sin TELEGRAM_USER no se obedece a nadie.
export const autorizado = (fromId, chat, user = "") => { const f = String(fromId || ""); if (!f) return false; if (user) return f === String(user); return Number(chat) > 0 && f === String(chat); };
// v479 · 📬 devuelve TODAS las órdenes en el orden en que se pulsaron (items), no solo la última; act/memes (la última) se mantienen por compatibilidad
export function parseUpdates(ups, chat, user = "") {
  let act = null, last = 0, memes = null; const replies = [], answers = [], items = [];
  for (const u of [...(ups || [])].sort((a, b) => (a.update_id || 0) - (b.update_id || 0))) {
    last = Math.max(last, u.update_id || 0);
    if (u.callback_query) {
      const q = u.callback_query, cid = String((q.message && q.message.chat && q.message.chat.id) || (q.from && q.from.id) || "");
      if (!chat || cid !== chat || !autorizado(q.from && q.from.id, chat, user)) { answers.push([q.id, "No autorizado."]); continue; }
      const mm = String(q.data || "").match(/^(ma|mx):([A-Za-z0-9_-]{1,40})$/);   // v175 · memes con dinero real: aprobar / todavía no
      if (mm) { memes = { accion: mm[1] === "ma" ? "aprobar" : "no", id: mm[2], msg: q.message ? { chat: cid, id: q.message.message_id } : null }; items.push({ id: u.update_id, memes, clave: q.data }); answers.push([q.id, mm[1] === "ma" ? "✅ Recibido: empiezo con dinero real" : "Vale, sigue en ficticio"]); continue; }
      const m = String(q.data || "").match(/^(ap|re|mc|mr|lb):([A-Za-z0-9_-]{1,40})$/);   // v478 · lb = «la he revisado: liberar» una orden de Trading 212 sin aclarar
      if (!m) { answers.push([q.id, "Botón no válido."]); continue; }
      act = { accion: { ap: "aprobar", re: "rechazar", mc: "metodo-si", mr: "metodo-no", lb: "liberar" }[m[1]], plan: m[2], msg: q.message ? { chat: cid, id: q.message.message_id } : null }; items.push({ id: u.update_id, act, clave: q.data });
      answers.push([q.id, { ap: "✅ Recibido: lo apruebo en unos minutos", re: "❌ Recibido: lo rechazo", mc: "✅ Recibido: cambio el método en unos minutos", mr: "❌ Recibido: sigues con tu método", lb: "🔓 Recibido: la libero en unos minutos" }[m[1]]]);
    } else if (u.message && u.message.chat) {
      const cid = String(u.message.chat.id), t = String(u.message.text || "").trim();
      if (!chat) replies.push([cid, `Hola 👋 Tu número de chat es:\n\n${cid}\n\nCópialo en la web: 💶 Real → Ajustes de la cartera real → Claves → «Telegram: tu número de chat» (TELEGRAM_CHAT) y guarda. A partir de entonces te avisaré aquí de todo lo que haga la cartera real.`]);
      else if (/^\/(id|chat|numero|número)\b/i.test(t)) replies.push([cid, `Tu número de chat es:\n\n${cid}\n\nCópialo en la web: ⚙️ Ajustes → «📤 Telegram en este dispositivo».`]);
      else if (cid === chat && /^\/(parar|stop|seguir|reanudar)\b/i.test(t) && !autorizado(u.message.from && u.message.from.id, chat, user)) replies.push([cid, "No autorizado."]);
      else if (cid === chat && /^\/(parar|stop)\b/i.test(t)) { memes = { accion: "parar" }; items.push({ id: u.update_id, memes, clave: "parar:" + u.update_id }); }
      else if (cid === chat && /^\/(seguir|reanudar)\b/i.test(t)) { memes = { accion: "seguir" }; items.push({ id: u.update_id, memes, clave: "seguir:" + u.update_id }); }
      else if (cid === chat && /^\/(start|ayuda|help)/i.test(t)) replies.push([cid, "Estoy conectado ✔\n\nTe aviso aquí de todo lo que hace tu cartera real. Cuando proponga órdenes, verás los botones «✅ Aprobar» y «❌ Rechazar»: se procesan en 5-15 minutos y te contesto con el resultado."]);
    }
  }
  return { act, last, replies, answers, memes, items };
}

export async function procesa(ups, { api, say, dispatch, memesCtl, bvCtl, CHAT, USER }) {
  // v479 · 📬 cada pulsación se procesa EN ORDEN y se marca como leída justo después (si el proceso se corta, las que faltan se procesan en la siguiente
  //   vuelta: no se pierde ninguna). Una pulsación repetida (mismo botón dos veces) se ejecuta una sola vez. Si GitHub falla al lanzar una, se para ahí
  //   y se reintenta en la siguiente vuelta (las acciones de la cartera real son idempotentes: repetir una ya hecha no hace nada).
  const { last, replies, answers, items } = parseUpdates(ups, CHAT, USER);
  for (const [id, text] of answers) await api("answerCallbackQuery", { callback_query_id: id, text }).catch(() => {});
  for (const [cid, text] of replies) await say(cid, text);
  const hechas = new Set(); let corte = null;
  for (const it of items) {
    if (hechas.has(it.clave)) { await api("getUpdates", { offset: it.id + 1, timeout: 0 }).catch(() => {}); continue; }
    if (it.memes) { const memes = it.memes;
      if (memes.msg) await api("editMessageReplyMarkup", { chat_id: memes.msg.chat, message_id: memes.msg.id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      const ok0 = await memesCtl(memes).catch(() => false), okBv = await bvCtl(memes).catch(() => false), ok = ok0 || okBv;
      if (!ok) { corte = it; await say(CHAT, "✖ No pude guardar la orden de Cripto en GitHub. Lo reintento en unos minutos."); break; }
      await say(CHAT, { aprobar: "💶 Hecho: Cripto empieza a copiar al terminal con tu cartera del bot en la próxima vuelta (1-2 min).", no: "Vale: Cripto sigue en ficticio. Te volveré a preguntar si sigue ganando.", parar: "🛑 Cripto real PARADO: en la próxima vuelta vende lo que tenga abierto y no compra más. Para volver: /seguir", seguir: "▶️ Cripto real reanudado." }[memes.accion]);
      console.log("Orden de Memes procesada"); }
    if (it.act) { const act = it.act;
      if (act.msg) await api("editMessageReplyMarkup", { chat_id: act.msg.chat, message_id: act.msg.id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      const ok = await dispatch(act.accion, act.plan);
      if (!ok) { corte = it; await say(CHAT, "✖ No pude lanzar la cartera real en GitHub. Hazlo desde la web (💶 Real).".replace(/\.?$/, ". Lo reintento en unos minutos.")); console.log("Botón de Telegram: no se pudo lanzar (se reintenta)"); break; }
      await say(CHAT, ({ aprobar: "⏳ Aprobación recibida. En 1-3 minutos te digo qué se ha ejecutado (si la bolsa está cerrada, quedará aprobada para la próxima apertura).", "metodo-si": "⏳ Cambio de método recibido. En 1-3 minutos te lo confirmo." }[act.accion] || "⏳ Recibido. En 1-3 minutos te confirmo."));
      console.log("Botón de Telegram procesado: " + act.accion + " (lanzado)"); }
    hechas.add(it.clave); await api("getUpdates", { offset: it.id + 1, timeout: 0 }).catch(() => {});   // marcada como hecha
  }
  if (!corte) await api("getUpdates", { offset: last + 1, timeout: 0 }).catch(() => {});   // el resto (mensajes sin orden) también como leídos
  if (!items.length) console.log("Mensajes de Telegram procesados: " + ups.length);
  return { items: items.length };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  (async () => {
    if (!TOK) { console.log("Telegram sin configurar (falta TELEGRAM_TOKEN): no hago nada."); return; }
    const ups = await api("getUpdates", { timeout: 0, allowed_updates: ["message", "callback_query"] });
    if (!ups.length) { console.log("Sin novedades en Telegram."); return; }
    await procesa(ups, { api, say, dispatch, memesCtl, bvCtl, CHAT, USER });
  })().catch((e) => { console.log("Error con Telegram: " + String(e.message).slice(0, 120)); process.exit(1); });
}
