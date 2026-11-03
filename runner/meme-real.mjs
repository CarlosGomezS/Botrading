// v175 · 💶 MEMES CON DINERO REAL (Solana). Copia, con TU cartera del bot, las compras y ventas del terminal de Solana
// (las reglas que haya aprendido la bola). Solo arranca cuando:
//   1) hay clave de la cartera (secreto MEME_SOL_KEY, solo para esto, con ~100 €), y
//   2) el sistema ha demostrado que gana (30+ operaciones, factor de beneficio > 1,3 y ganancia media > 0) Y TÚ lo apruebas en Telegram.
// FRENOS que nunca se saltan: cada compra ≤ 8 % y ≤ 15 €; si la cuenta cae al 60 % de lo inicial se vende todo y se para;
// si en un día pierde un 20 %, se pausa hasta el día siguiente; /parar en Telegram (o el botón de la app) lo detiene al momento.
// Privacidad: el estado va CIFRADO (REAL_VIEW_PASS) en la rama «meme-real»; la orden de parar/aprobar va en la rama «meme-ctl» (sin importes).
// Los registros de GitHub son públicos: aquí no se escribe ni la dirección de la cartera ni ningún importe.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { encrypt, openAny } from "./real-cfg.mjs";

const env = (k) => (process.env[k] || "").trim();
const REPO = env("GITHUB_REPOSITORY"), TOKEN = env("GITHUB_TOKEN"), JUP = "https://lite-api.jup.ag", SOL = "So11111111111111111111111111111111111111112";
// v177 · PLAZO que ha pedido el usuario: el martes 10-nov-2026 (9:00 en España) se le propone empezar con dinero real con las mejores reglas que haya, hayan superado o no la prueba (él decide en Telegram)
export const PLAZO = "2026-11-10T08:00:00Z";
export const LIM = { size: 0.08, maxOrdenEur: 15, minOrdenEur: 2, suelo: 0.6, perdidaDia: 0.2, slippageBps: 300, maxPrioLamports: 300000, n: 30, pf: 1.3 };
const r2 = (x) => Math.round(x * 100) / 100;
const madridD = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);

// ---------- ¿ha demostrado que gana? (sobre las operaciones cerradas del terminal con costes reales) ----------
export function prueba(S) {
  const cl = (S && S.closed) || [], n = cl.length, w = cl.filter((x) => x.pnl > 0).reduce((t, x) => t + x.pnl, 0), l = -cl.filter((x) => x.pnl <= 0).reduce((t, x) => t + x.pnl, 0);
  const pf = l > 0 ? w / l : w > 0 ? 99 : 0, exp = n ? (w - l) / n : 0;
  // v176 · o bien el terminal lo ha demostrado en vivo, o bien usa reglas adoptadas que ganan en 60+ casos ya vividos (muestras) Y lo confirman en vivo (10+ operaciones con ganancia media positiva)
  const gp = S && S.genomeId && S.genomePrueba, bt = gp && gp.bt, okBt = !!(bt && bt.n >= 60 && bt.pf > LIM.pf && bt.med > 0 && gp.n >= 10 && gp.med > 0);
  return { n, pf: r2(pf), exp: r2(exp), okVivo: n >= LIM.n && pf > LIM.pf && exp > 0, okBt, bt: bt || null, ok: (n >= LIM.n && pf > LIM.pf && exp > 0) || okBt };
}
// ---------- decisiones (sin red: se pueden probar) ----------
// qué hacer para copiar al terminal: comprar lo que el terminal acaba de comprar, vender lo que ha cerrado, vender parte si él vendió parte
export function plan(S, RS, nowIso) {
  const out = [];
  for (const [a, p] of Object.entries(S.pos || {})) if (!RS.pos[a] && p.t0 === nowIso) out.push({ tipo: "compra", a, sym: p.sym });
  for (const [a, rp] of Object.entries(RS.pos)) {
    const p = (S.pos || {})[a];
    if (!p) out.push({ tipo: "venta", a, sym: rp.sym, frac: 1 });
    else if (p.tp1 && !rp.tp1 && p.gotPart) out.push({ tipo: "venta", a, sym: rp.sym, frac: Math.min(0.95, 1 - p.q / (p.q + (p.gotPart / Math.max(1e-12, p.last || p.px)))), parcial: true });
  }
  return out;
}
export function frenos(RS, eqEur, now) {
  const d = madridD(now);
  if (!RS.dia || RS.dia.d !== d) RS.dia = { d, eq0: eqEur };
  if (RS.start && eqEur < RS.start * LIM.suelo) return { parar: true, motivo: `la cuenta ha caído al ${Math.round(eqEur / RS.start * 100)} % de lo inicial (el suelo es el ${LIM.suelo * 100} %)` };
  if (RS.dia.eq0 && eqEur < RS.dia.eq0 * (1 - LIM.perdidaDia)) return { pausaDia: true, motivo: `hoy ya pierde más de un ${LIM.perdidaDia * 100} %: pausa hasta mañana` };
  return {};
}
export function tamOrden(eqEur, solEur) { return Math.max(0, Math.min(eqEur * LIM.size, LIM.maxOrdenEur, solEur * 0.95)); }

// ---------- red: Jupiter y Solana ----------
async function J(u, opt = {}) { const r = await fetch(u, { ...opt, headers: { "Content-Type": "application/json", Accept: "application/json", ...(opt.headers || {}) }, signal: AbortSignal.timeout(20000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} if (!r.ok) throw new Error(`HTTP ${r.status} ${String((j && (j.error || j.message)) || t).slice(0, 120)}`); return j; }
async function cartera() {
  const key = env("MEME_SOL_KEY"); if (!key) return null;
  const { Connection, Keypair, VersionedTransaction, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
  const bs58 = (await import("bs58")).default;
  let kp; try { kp = key.trim().startsWith("[") ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key))) : Keypair.fromSecretKey(bs58.decode(key.trim())); } catch (e) { throw new Error("la clave MEME_SOL_KEY no es válida (pega la clave privada que exporta Phantom)"); }
  const conn = new Connection(env("MEME_RPC") || "https://api.mainnet-beta.solana.com", "confirmed");
  const solBal = async () => (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  const tokBal = async (mint) => { const r = await conn.getParsedTokenAccountsByOwner(kp.publicKey, { mint: new PublicKey(mint) }); let raw = 0n, dec = 0; for (const x of r.value) { const ta = x.account.data.parsed.info.tokenAmount; raw += BigInt(ta.amount); dec = ta.decimals; } return { raw, dec }; };
  const swap = async (inputMint, outputMint, amountRaw) => {
    const q = await J(`${JUP}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${LIM.slippageBps}&restrictIntermediateTokens=true`);
    const s = await J(`${JUP}/swap/v1/swap`, { method: "POST", body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, dynamicSlippage: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: LIM.maxPrioLamports, priorityLevel: "high" } } }) });
    const tx = VersionedTransaction.deserialize(Buffer.from(s.swapTransaction, "base64")); tx.sign([kp]);
    const bh = await conn.getLatestBlockhash("confirmed"), sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
    const c = await conn.confirmTransaction({ signature: sig, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: s.lastValidBlockHeight || bh.lastValidBlockHeight }, "confirmed");
    if (c.value && c.value.err) throw new Error("la operación no se completó en Solana (" + JSON.stringify(c.value.err).slice(0, 60) + ")");
    return { sig, out: q.outAmount };
  };
  return { kp, conn, solBal, tokBal, swap, LAMPORTS_PER_SOL };
}

// ---------- estado (cifrado) y control (sin importes) ----------
async function leer(rama, f) { if (!REPO || !TOKEN) return null; const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=${rama}`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } }); if (r.status === 404) return null; if (!r.ok) throw new Error("no pude leer " + f); return await r.json(); }
function guardar(rama, f, txt) {
  if (!REPO || !TOKEN) { writeFileSync(f, txt); return; }
  const pub = path.join(process.cwd(), ".pub-" + rama); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, f), txt);
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g(`init -q -b ${rama}`); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add -A"); g(`commit -q -m "${rama} ${new Date().toISOString()}"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${rama}`); return; } catch (e) { if (i === 3) throw new Error("no pude guardar " + f); } }
}
export const leerCtl = async () => { const c = await leer("meme-ctl", "ctl.json"); if (c) return c; const d = { aprobado: null, parado: false }; try { guardar("meme-ctl", "ctl.json", JSON.stringify(d)); } catch (e) {} return d; };
export const guardarCtl = (c) => guardar("meme-ctl", "ctl.json", JSON.stringify({ ...c, t: new Date().toISOString() }));
async function leerRS() { const pw = [env("REAL_VIEW_PASS"), env("REAL_VIEW_PASS_OLD")]; const j = await leer("meme-real", "meme-real.json"); if (!j) return null; const r = await openAny(j, pw); if (r.error) throw new Error("no puedo descifrar meme-real.json"); return r.j; }
async function guardarRS(RS) { const pw = env("REAL_VIEW_PASS"); if (!pw) throw new Error("sin REAL_VIEW_PASS no se guarda nada (privacidad)"); RS.savedAt = Date.now(); const enc = await encrypt(JSON.stringify(RS), pw); guardar("meme-real", "meme-real.json", JSON.stringify({ enc: 1, v: 1, ...enc, meta: { estado: RS.estado || "apagado", t: new Date().toISOString(), lib: RS.listo ? RS.listo.lib : null, jup: RS.listo ? RS.listo.jup : null } })); }
async function tg(text, botones) {
  const tok = env("TELEGRAM_TOKEN"), chat = env("TELEGRAM_CHAT"); if (!tok || !chat) return;
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true, ...(botones ? { reply_markup: { inline_keyboard: [botones] } } : {}) }) }).catch(() => {});
}
const fresh = () => ({ v: 1, estado: "apagado", start: null, pos: {}, trades: [], log: [], dia: null });
const L = (RS, now, txt) => { RS.log.unshift({ t: now.toISOString(), txt }); RS.log = RS.log.slice(0, 300); };

// ---------- una vuelta (la llama meme.mjs en Solana después de decidir) ----------
export async function pasoReal(S, by, now, eurUsd) {
  let RS = null; try { RS = (await leerRS()) || fresh(); } catch (e) { console.log("Memes real: " + e.message); return; }
  const ctl = await leerCtl().catch(() => ({ aprobado: null, parado: false })), P = prueba(S), tieneClave = !!env("MEME_SOL_KEY");
  const antes = JSON.stringify([RS.estado, RS.pos, RS.trades.length]);
  RS.prueba = P; RS.clave = tieneClave;
  // 1) ¿proponer arrancar?
  const plazo = now.getTime() >= Date.parse(PLAZO);
  if (!ctl.aprobado && !P.ok && plazo && tieneClave && (!RS.propuestoPlazo || now.getTime() - Date.parse(RS.propuestoPlazo) > 24 * 3600e3)) {
    RS.propuestoPlazo = now.toISOString(); const id = "p" + Date.now().toString(36), gp = S.genomePrueba || {}, bt = gp.bt;
    await tg(`🗓️ Ha llegado tu plazo para Cripto con dinero real.\n\nDatos honestos de hoy (con costes reales):\n• Terminal en vivo: ${P.n} operaciones · factor de beneficio ${P.pf} · ${P.exp >= 0 ? "+" : ""}${P.exp} € de media por operación\n${S.genomeId ? `• Usa las reglas aprendidas de ${S.genomeId}${bt ? `: en ${bt.n} casos vividos, factor ${bt.pf} y ${bt.med} % por operación` : ""}\n` : "• Aún usa las reglas del vídeo\n"}\nTODAVÍA NO ha superado la prueba (30 operaciones, factor > ${LIM.pf} y ganancia media positiva). ¿Empiezo igualmente con tu cartera del bot? Frenos: cada compra ≤ 8 % y ≤ ${LIM.maxOrdenEur} €, se para sola si cae al ${LIM.suelo * 100} %, pausa si un día pierde un ${LIM.perdidaDia * 100} %. /parar cuando quieras.`,
      [{ text: "✅ Empezar igualmente", callback_data: "ma:" + id }, { text: "❌ Esperar a que lo demuestre", callback_data: "mx:" + id }]);
    L(RS, now, "plazo cumplido: propuesta para empezar igualmente enviada a Telegram");
  }
  if (!ctl.aprobado && P.ok && tieneClave && RS.propuesto !== P.n - (P.n % 10)) {
    RS.propuesto = P.n - (P.n % 10); const id = "m" + Date.now().toString(36);
    await tg(`🪙 Cripto (Solana) ya ha demostrado que gana con costes reales:\n${P.okVivo ? `• ${P.n} operaciones en vivo\n• factor de beneficio ${P.pf} (más de ${LIM.pf})\n• ganancia media por operación positiva` : `• sus reglas ganan en ${P.bt.n} casos ya vividos (factor ${P.bt.pf}, ${P.bt.med} % de media por operación, con costes)\n• y lo confirman en vivo`}\n\n¿Empiezo a copiarlo con tu cartera del bot (≈100 €)? Frenos: cada compra ≤ 8 % y ≤ ${LIM.maxOrdenEur} €, se para solo si la cuenta cae al ${LIM.suelo * 100} %, pausa si un día pierde un ${LIM.perdidaDia * 100} %. Puedes pararlo cuando quieras con /parar.`,
      [{ text: "✅ Empezar con dinero real", callback_data: "ma:" + id }, { text: "❌ Todavía no", callback_data: "mx:" + id }]);
    L(RS, now, `propuesta enviada a Telegram (${P.n} operaciones, factor ${P.pf})`);
  }
  // comprobación de que todo está listo para operar (cada 6 h, sin tocar dinero): librerías de Solana y respuesta de Jupiter
  if (!RS.listo || Date.now() - Date.parse(RS.listo.t) > 6 * 3600e3) {
    const L2 = { t: now.toISOString() };
    try { await import("@solana/web3.js"); await import("bs58"); L2.lib = true; } catch (e) { L2.lib = false; }
    try { const q = await J(`${JUP}/swap/v1/quote?inputMint=${SOL}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&slippageBps=50`); L2.jup = !!(q && q.outAmount); } catch (e) { L2.jup = false; L2.jupErr = String(e.message).slice(0, 80); }
    if (tieneClave) { try { const W = await cartera(); L2.cartera = true; L2.sol = r2(await W.solBal()); } catch (e) { L2.cartera = false; L2.carteraErr = String(e.message).slice(0, 80); } }
    RS.listo = L2;
  }
  RS.estado = !tieneClave ? "sin clave" : ctl.parado ? "parado" : !ctl.aprobado ? (P.ok || plazo ? "esperando tu aprobación" : "aprendiendo (aún no ha demostrado que gana)") : "activo"; RS.plazo = PLAZO;
  if (RS.estado !== "activo" && !Object.keys(RS.pos).length) { if (JSON.stringify([RS.estado, RS.pos, RS.trades.length]) !== antes || !RS.savedAt || Date.now() - RS.savedAt > 10 * 60000) await guardarRS(RS).catch(() => {}); return RS; }
  // 2) activo (o parado con algo abierto): valorar la cuenta
  let W; try { W = await cartera(); } catch (e) { L(RS, now, "✖ " + e.message); await guardarRS(RS).catch(() => {}); return RS; }
  const solUsd = +((by[SOL] && by[SOL].priceUsd) || S.solUsd || 0) || 0; if (!(solUsd > 0) || !(eurUsd > 0)) { console.log("Memes real: sin precio de SOL o del euro: espero."); return RS; }
  const solEur = solUsd / eurUsd, sol = await W.solBal();
  let eqEur = sol * solEur; for (const [a, rp] of Object.entries(RS.pos)) { const q = by[a]; if (q && +q.priceUsd > 0) eqEur += rp.ui * (+q.priceUsd) / eurUsd; }
  if (!RS.start) { RS.start = r2(eqEur); L(RS, now, `empieza con ${r2(eqEur)} €`); await tg(`💶 Cripto con dinero real ACTIVADO. Empieza con ${r2(eqEur)} €.`); }
  RS.eq = r2(eqEur); RS.eqHist = (RS.eqHist || []).concat([[now.toISOString(), r2(eqEur)]]).slice(-2000);
  // 3) frenos
  const fr = frenos(RS, eqEur, now), ventaTodo = ctl.parado || fr.parar;
  const ops = ventaTodo ? Object.entries(RS.pos).map(([a, rp]) => ({ tipo: "venta", a, sym: rp.sym, frac: 1 })) : plan(S, RS, now.toISOString()).filter((o) => !(fr.pausaDia && o.tipo === "compra"));
  if (fr.parar && !ctl.parado) { await guardarCtl({ ...ctl, parado: true, motivo: fr.motivo }).catch(() => {}); await tg("🛑 Cripto real PARADO: " + fr.motivo + ". He vendido todo. Para volver a empezar: /seguir"); L(RS, now, "🛑 " + fr.motivo); }
  if (fr.pausaDia && !RS.pausaAvisada) { RS.pausaAvisada = madridD(now); await tg("⏸️ Cripto real: " + fr.motivo); }
  // 4) ejecutar
  for (const o of ops) {
    try {
      if (o.tipo === "compra") {
        const eur = tamOrden(eqEur, (sol - 0.02) * solEur); if (eur < LIM.minOrdenEur) { L(RS, now, `no compro ${o.sym}: no queda SOL suficiente`); continue; }
        const lam = Math.floor(eur / solEur * W.LAMPORTS_PER_SOL), r = await W.swap(SOL, o.a, lam), b = await W.tokBal(o.a);
        const ui = Number(b.raw) / 10 ** b.dec; RS.pos[o.a] = { sym: o.sym, ui, dec: b.dec, cost: r2(eur), t0: now.toISOString() };
        RS.trades.unshift({ t: now.toISOString(), lado: "compra", sym: o.sym, eur: r2(eur), sig: r.sig }); L(RS, now, `🟢 compra ${o.sym} · ${r2(eur)} €`);
        await tg(`🟢 Cripto real: compro ${o.sym} por ${r2(eur)} €`);
      } else {
        const b = await W.tokBal(o.a); if (b.raw <= 0n) { delete RS.pos[o.a]; continue; }
        const raw = o.frac >= 1 ? b.raw : BigInt(Math.floor(Number(b.raw) * o.frac)); if (raw <= 0n) continue;
        const r = await W.swap(o.a, SOL, raw.toString()), eur = Number(r.out) / W.LAMPORTS_PER_SOL * solEur, rp = RS.pos[o.a], costPart = rp.cost * (o.frac >= 1 ? 1 : o.frac);
        const pnl = r2(eur - costPart); RS.trades.unshift({ t: now.toISOString(), lado: o.parcial ? "venta parcial" : "venta", sym: o.sym, eur: r2(eur), pnl, sig: r.sig });
        if (o.frac >= 1) delete RS.pos[o.a]; else { rp.cost = r2(rp.cost - costPart); rp.ui = Number(b.raw - raw) / 10 ** b.dec; rp.tp1 = 1; }
        L(RS, now, `${pnl >= 0 ? "✅" : "🔻"} ${o.parcial ? "vende parte de" : "vende"} ${o.sym} · ${pnl >= 0 ? "+" : ""}${pnl} €`);
        await tg(`${pnl >= 0 ? "✅" : "🔻"} Cripto real: ${o.parcial ? "vendo parte de" : "vendo"} ${o.sym} · ${pnl >= 0 ? "+" : ""}${pnl} €`);
      }
    } catch (e) { L(RS, now, `✖ ${o.tipo} ${o.sym}: ${String(e.message || e).slice(0, 100)}`); RS.fallos = (RS.fallos || 0) + 1; }
  }
  RS.trades = RS.trades.slice(0, 2000);
  await guardarRS(RS).catch((e) => console.log("Memes real: " + e.message));
  console.log(`Memes real: ${RS.estado} · ${ops.length} operaciones en esta vuelta`);
  return RS;
}
