// Recoge lo que pulsas en Telegram (botones «Aprobar» / «Rechazar» de la cartera real) y lanza el flujo real.yml.
// Lo ejecuta telegram.yml cada ~5 minutos. No necesita instalar nada (solo fetch de Node).
// Seguridad: solo se obedece a TU chat (TELEGRAM_CHAT). Los registros de GitHub son públicos: aquí no se escribe ningún dato.
const env = (k) => (process.env[k] || "").trim();
const TOK = env("TELEGRAM_TOKEN"), CHAT = env("TELEGRAM_CHAT"), GH = env("GITHUB_TOKEN"), REPO = env("GITHUB_REPOSITORY");
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

async function dispatch(accion, plan) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/real.yml/dispatches`, {
    method: "POST", headers: { Authorization: "Bearer " + GH, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { accion, plan } }),
  });
  return r.status === 204;
}

export function parseUpdates(ups, chat) {
  // devuelve la última orden válida de TU chat y los mensajes a contestar
  let act = null, last = 0; const replies = [], answers = [];
  for (const u of ups || []) {
    last = Math.max(last, u.update_id || 0);
    if (u.callback_query) {
      const q = u.callback_query, cid = String((q.message && q.message.chat && q.message.chat.id) || (q.from && q.from.id) || "");
      if (!chat || cid !== chat) { answers.push([q.id, "No autorizado."]); continue; }
      const m = String(q.data || "").match(/^(ap|re|mc|mr):([A-Za-z0-9_-]{1,40})$/);
      if (!m) { answers.push([q.id, "Botón no válido."]); continue; }
      act = { accion: { ap: "aprobar", re: "rechazar", mc: "metodo-si", mr: "metodo-no" }[m[1]], plan: m[2], msg: q.message ? { chat: cid, id: q.message.message_id } : null };
      answers.push([q.id, { ap: "✅ Recibido: lo apruebo en unos minutos", re: "❌ Recibido: lo rechazo", mc: "✅ Recibido: cambio el método en unos minutos", mr: "❌ Recibido: sigues con tu método" }[m[1]]]);
    } else if (u.message && u.message.chat) {
      const cid = String(u.message.chat.id), t = String(u.message.text || "").trim();
      if (!chat) replies.push([cid, `Hola 👋 Tu número de chat es:\n\n${cid}\n\nCópialo en la web: 💶 Real → Ajustes de la cartera real → Claves → «Telegram: tu número de chat» (TELEGRAM_CHAT) y guarda. A partir de entonces te avisaré aquí de todo lo que haga la cartera real.`]);
      else if (/^\/(id|chat|numero|número)\b/i.test(t)) replies.push([cid, `Tu número de chat es:\n\n${cid}\n\nCópialo en la web: ⚙️ Ajustes → «📤 Telegram en este dispositivo».`]);
      else if (cid === chat && /^\/(start|ayuda|help)/i.test(t)) replies.push([cid, "Estoy conectado ✔\n\nTe aviso aquí de todo lo que hace tu cartera real. Cuando proponga órdenes, verás los botones «✅ Aprobar» y «❌ Rechazar»: se procesan en 5-15 minutos y te contesto con el resultado."]);
    }
  }
  return { act, last, replies, answers };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  (async () => {
    if (!TOK) { console.log("Telegram sin configurar (falta TELEGRAM_TOKEN): no hago nada."); return; }
    const ups = await api("getUpdates", { timeout: 0, allowed_updates: ["message", "callback_query"] });
    if (!ups.length) { console.log("Sin novedades en Telegram."); return; }
    const { act, last, replies, answers } = parseUpdates(ups, CHAT);
    await api("getUpdates", { offset: last + 1, timeout: 0 }).catch(() => {});   // marca como leídos
    for (const [id, text] of answers) await api("answerCallbackQuery", { callback_query_id: id, text }).catch(() => {});
    for (const [cid, text] of replies) await say(cid, text);
    if (act) {
      if (act.msg) await api("editMessageReplyMarkup", { chat_id: act.msg.chat, message_id: act.msg.id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      const ok = await dispatch(act.accion, act.plan);
      await say(CHAT, ok ? ({ aprobar: "⏳ Aprobación recibida. En 1-3 minutos te digo qué se ha ejecutado (si la bolsa está cerrada, quedará aprobada para la próxima apertura).", "metodo-si": "⏳ Cambio de método recibido. En 1-3 minutos te lo confirmo." }[act.accion] || "⏳ Recibido. En 1-3 minutos te confirmo.") : "✖ No pude lanzar la cartera real en GitHub. Hazlo desde la web (💶 Real).");
      console.log("Botón de Telegram procesado: " + act.accion + (ok ? " (lanzado)" : " (no se pudo lanzar)"));
    } else console.log("Mensajes de Telegram procesados: " + ups.length);
  })().catch((e) => { console.log("Error con Telegram: " + String(e.message).slice(0, 120)); process.exit(1); });
}
