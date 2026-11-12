// v432 · 💧 HYPERLIQUID CON DINERO REAL. Sigue al método n.º 1 del podio del laboratorio de cripto de muchas operaciones (caza-lab.json).
// Se ejecuta al empezar cada hora (las velas son de 1 h, igual que en el laboratorio):
//  1) cierra las posiciones que ya han cumplido su tiempo (p. ej. 16 h);
//  2) mira la señal del método en la vela que acaba de cerrar, para cada cripto del laboratorio, y abre en las plazas libres.
// Seguridad:
//  · usa una «clave de agente» (API wallet) de Hyperliquid: puede operar pero NO puede retirar dinero;
//  · nunca usa más dinero del que hay en la cuenta (sin apalancamiento: entre todas las posiciones, como mucho el saldo);
//  · freno: si la cuenta cae por debajo de la mitad de lo ingresado, cierra todo y no abre más;
//  · los registros son públicos: nunca escriben importes, criptos ni direcciones (eso va por Telegram y al estado cifrado).
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { senales, FILTROS, ema, atr } from "./caza-hl2.mjs";
const env = (k) => (process.env[k] || "").trim(), REPO = env("GITHUB_REPOSITORY") || "CarlosGomezS/Botrading", TOKEN = env("GITHUB_TOKEN");
const INFO = "https://api.hyperliquid.xyz/info", EXCH = "https://api.hyperliquid.xyz/exchange", H = 3600e3, VELAS = 1200, MIN_ORDEN = 11, SLIP = 0.02, SLIP_ABRE = 0.005;   // v459 · al ABRIR solo se acepta un 0,5 % peor que el precio (si se ha disparado, no entra); al CERRAR, 2 % para asegurar el cierre
const RAMA = "hl-real", ARCH = "hl-real.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
async function info(body) { for (let i = 0; i < 5; i++) { try { const r = await fetch(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }); if (r.status === 429) { await sleep(3000 * (i + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (i === 4) throw e; await sleep(2000 * (i + 1)); } } }

// ---------- firma de órdenes (igual que el SDK oficial de Python: msgpack + keccak + EIP-712 «Agent») ----------
let ETH = null, MP = null;
async function libs() { if (!ETH) { ETH = await import("ethers"); MP = await import("@msgpack/msgpack"); } }
export async function firma(accion, nonce, pk) {
  await libs(); const { keccak256, Wallet, getBytes } = ETH;
  const m = MP.encode(accion), b = new Uint8Array(m.length + 9); b.set(m, 0); new DataView(b.buffer).setBigUint64(m.length, BigInt(nonce)); b[m.length + 8] = 0;
  const w = new Wallet(pk), sig = await w.signTypedData({ chainId: 1337, name: "Exchange", verifyingContract: "0x0000000000000000000000000000000000000000", version: "1" }, { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] }, { source: "a", connectionId: keccak256(b) });
  const s = ETH.Signature.from(sig); return { r: s.r, s: s.s, v: s.v };
}
async function exchange(accion, pk) { const nonce = Date.now(), signature = await firma(accion, nonce, pk);
  const r = await fetch(EXCH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: accion, nonce, signature, vaultAddress: null }), signal: AbortSignal.timeout(20000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { http: r.status, j, t }; }
// precio y tamaño en el formato que acepta Hyperliquid (perpetuos: 5 cifras significativas y como mucho 6 − szDecimals decimales)
export const aTexto = (x) => { let s = Number(x).toFixed(8); if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s === "-0" ? "0" : s; };
export const precioOk = (px, szd) => +(+Number(px).toPrecision(5)).toFixed(Math.max(0, 6 - szd));
export const tamOk = (sz, szd) => Math.floor(sz * 10 ** szd + 1e-9) / 10 ** szd;
function orden(a, compra, px, sz, reduce) { return { a, b: compra, p: aTexto(px), s: aTexto(sz), r: !!reduce, t: { limit: { tif: "Ioc" } } }; }
// v441 · 🛡️ STOP DE EMERGENCIA guardado en Hyperliquid (funciona aunque el bot esté caído): orden de cierre a mercado si el precio va un 25 % en contra
export const STOP_EMERG = 0.25;
export function ordenStop(a, lado, entrada, sz, szd, dist = STOP_EMERG) { const tp = entrada * (lado > 0 ? 1 - dist : 1 + dist), lim = tp * (lado > 0 ? 0.9 : 1.1);
  return { a, b: lado < 0, p: aTexto(precioOk(lim, szd)), s: aTexto(sz), r: true, t: { trigger: { isMarket: true, triggerPx: aTexto(precioOk(tp, szd)), tpsl: "sl" } } }; }
async function ponStop(a, lado, entrada, sz, szd, pk, dist = STOP_EMERG) { const res = await exchange({ type: "order", orders: [ordenStop(a, lado, entrada, sz, szd, dist)], grouping: "na" }, pk);
  const st = res.j && res.j.response && res.j.response.data && res.j.response.data.statuses && res.j.response.data.statuses[0]; return !!(st && (st.resting || st.filled || st === "waitingForTrigger" || st.waitingForTrigger)) || (res.j && res.j.status === "ok" && !(st && st.error)); }
async function mandar(o, pk) { const res = await exchange({ type: "order", orders: [o], grouping: "na" }, pk);
  const st = res.j && res.j.status === "ok" && res.j.response && res.j.response.data && res.j.response.data.statuses && res.j.response.data.statuses[0];
  if (st && st.filled) return { ok: true, px: +st.filled.avgPx, sz: +st.filled.totalSz };
  return { ok: false, err: st && st.error ? String(st.error).slice(0, 120) : res.j && res.j.response ? String(res.j.response).slice(0, 120) : "HTTP " + res.http + " " + String(res.t).slice(0, 100) }; }

// ---------- datos en directo: las mismas series que usa el laboratorio (velas de 1 h + financiación) ----------
async function serie(c, fin) {
  const ini = fin - VELAS * H, k = new Map(), f = new Map();
  const v = await info({ type: "candleSnapshot", req: { coin: c, interval: "1h", startTime: ini, endTime: fin - 1 } }); for (const x of v || []) if (+x.t < fin) k.set(+x.t, [+x.c, +x.v || 0, +x.h, +x.l]);
  let t = fin - 500 * H; for (let g = 0; g < 3 && t < fin; g++) { const r = await info({ type: "fundingHistory", coin: c, startTime: t }); if (!r || !r.length) break; for (const x of r) f.set(Math.floor(+x.time / H) * H, +x.fundingRate); const last = +r[r.length - 1].time; if (last <= t) break; t = last + 1; }
  return { k, f };
}
async function datosVivos(U) {
  const fin = Math.floor(Date.now() / H) * H, T = []; for (let t = fin - VELAS * H; t < fin; t += H) T.push(t);
  const M = {}; for (const c of U) { let d; try { d = await serie(c, fin); } catch (e) { continue; } if (d.k.size < VELAS * 0.8) continue;
    const C = new Float64Array(T.length), F = new Float64Array(T.length), V = new Float64Array(T.length), Hi = new Float64Array(T.length), Lo = new Float64Array(T.length); let last = NaN;
    T.forEach((t, i) => { const x = d.k.get(t); if (x && x[0] > 0) { last = x[0]; V[i] = x[1]; Hi[i] = x[2]; Lo[i] = x[3]; } else { Hi[i] = Lo[i] = last; } C[i] = last; F[i] = d.f.get(t) || 0; });
    M[c] = { C, F, V, Hi, Lo, ultima: d.k.has(fin - H) }; await sleep(120); }
  return { T, M, U: U.filter((c) => M[c]), fin };
}

// ---------- el método del podio ----------
// v435 · ⚙️ AJUSTES (rama hl-ctl, públicos: solo porcentajes y opciones, nunca importes)
export const CTL0 = { estado: "on", uso: 100, plazas: 0, freno: 0.5, puesto: 1 };
export function validaCtl(c, prev = CTL0) { const o = { ...CTL0, ...(prev || {}) }; c = c || {};
  if (["on", "pausa", "parado"].includes(c.estado)) o.estado = c.estado; if ([25, 50, 75, 100].includes(+c.uso)) o.uso = +c.uso;
  if ([0, 1, 2, 3, 4, 5].includes(+c.plazas)) o.plazas = +c.plazas; if ([0.25, 0.35, 0.5].includes(+c.freno)) o.freno = +c.freno; if ([1, 2, 3].includes(+c.puesto)) o.puesto = +c.puesto; return o; }
async function leeCtl() { try { const r = await fetch(`https://raw.githubusercontent.com/${REPO}/hl-ctl/ctl.json?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) }); if (r.ok) return validaCtl({}, await r.json()); } catch (e) {} return { ...CTL0 }; }
export async function guardaAjustes() { let c = {}; try { c = JSON.parse(env("CAMBIO") || "{}"); } catch (e) { log("Ajuste no válido."); return; }
  const o = { ...validaCtl(c, await leeCtl()), t: new Date().toISOString() }; if (!TOKEN) { log(JSON.stringify(o)); return; }
  const sh = (x) => execSync(x, { stdio: "pipe", encoding: "utf8" }), pub = path.join(process.cwd(), ".pubhlctl"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "ctl.json"), JSON.stringify(o));
  const g = (x) => sh(`git -C "${pub}" ${x}`); g("init -q -b hl-ctl"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add ctl.json"); g(`commit -q -m "ajustes hyperliquid"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git hl-ctl`); log(`Ajustes guardados: ${o.estado} · usa ${o.uso} % · posiciones ${o.plazas || "auto"} · freno −${o.freno * 100} % · método n.º ${o.puesto}`); return; } catch (e) { await sleep(3000); } } }
async function metodo(puesto = 1) {
  const get = async (rama, arch) => { const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${rama}/${arch}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  // v456 · 🧊 solo métodos que han pasado la CUARENTENA de 21 días en ficticio (o el que ya estaba en uso, exento); en el orden del podio
  const L = await get("caza-lab", "caza-lab.json"), lista = ((L.aprobadas && L.aprobadas.length ? L.aprobadas : L.podio) || []).filter((z) => !z.cuar || z.cuar.ok || z.cuar.exento), x = lista[puesto - 1] || lista[0]; if (!x) return null;
  let IA = []; try { const RX = await import("./ia-receta.mjs"), j = await get("ia-lab", "ia-lab.json"), FNk = Object.keys(FILTROS); IA = ((j && j.cripto && j.cripto.recetas) || []).map((r) => RX.validaReceta(r, FNk)).filter(Boolean); x.RX = RX; } catch (e) {}
  return { x, IA, U: L.criptos || [] };
}
// construye la señal de una pieza (a o b) del método: receta de la IA por su id, o señal clásica por su posición en la lista (se comprueba con el nombre)
function pieza(S0, IA, RX, idx, iaId) {
  if (iaId) { const r = IA.find((z) => z.id === iaId); return r ? { fn: RX.senalReceta(r), nom: `🤖 IA «${r.nombre}»` } : null; }
  const s = S0[idx]; return s ? { fn: s.fn, nom: `${s.fam} ${JSON.stringify(s.p)}` } : null;
}

// v456 · estado anterior (cifrado) para recordar el método de cada posición abierta
async function leeAnterior() { try { const pw = env("REAL_VIEW_PASS"); if (!pw) return null; const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${RAMA}/${ARCH}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return null;
  const j = await r.json(), { decrypt } = await import("./real-cfg.mjs"), t = await decrypt(j, pw); return typeof t === "string" ? JSON.parse(t) : t; } catch (e) { return null; } }
// ---------- estado cifrado (para verlo en la app) ----------
async function guarda(estado) {
  const pw = env("REAL_VIEW_PASS"); if (!TOKEN || !pw) return; const { encrypt } = await import("./real-cfg.mjs");
  const out = { enc: 1, t: new Date().toISOString(), ...(await encrypt(JSON.stringify(estado), pw)) };
  const sh = (c) => execSync(c, { stdio: "pipe", encoding: "utf8" }), pub = path.join(process.cwd(), ".pubhlreal"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, ARCH), JSON.stringify(out));
  const g = (c) => sh(`git -C "${pub}" ${c}`); g(`init -q -b ${RAMA}`); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add " + ARCH); g(`commit -q -m "hyperliquid ${out.t}"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git ${RAMA}`); return; } catch (e) { await sleep(3000); } }
}
async function aviso(txt) { try { const AV = await import("./avisos.mjs"); await AV.tg(txt); } catch (e) {} }
const D2 = (x) => (Math.round(x * 100) / 100).toFixed(2).replace(".", ",");

export async function ronda() {
  // v441 · una sola ronda por hora aunque la lancen dos sitios (el bot de cada minuto y el horario de respaldo); a mano (FORZAR=1) siempre
  if (env("FORZAR") !== "1") { try { const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${ARCH}?ref=${RAMA}`, { headers: { Accept: "application/vnd.github.raw+json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}) }, signal: AbortSignal.timeout(15000) });
    if (r.ok) { const j = await r.json(), h0 = Math.floor(Date.now() / H) * H; if (j && j.t && Date.parse(j.t) >= h0) { log("Hyperliquid real: la ronda de esta hora ya está hecha."); return; } } } catch (e) {} }
  const pk = env("HL_AGENT_KEY"), yo = env("HL_WALLET").toLowerCase();
  if (!pk || !/^0x[0-9a-f]{40}$/.test(yo)) { log("Hyperliquid real: faltan las claves (HL_AGENT_KEY y HL_WALLET). No opero."); return; }
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(pk)) { log("Hyperliquid real: la clave de agente no tiene el formato correcto (64 caracteres hexadecimales). No opero."); return; }
  const PK = pk.startsWith("0x") ? pk : "0x" + pk;
  await libs(); if (new ETH.Wallet(PK).address.toLowerCase() === yo) { log("⚠️ Has puesto la clave privada de tu cartera principal, no la de un agente. Por seguridad no opero: crea una clave de agente en app.hyperliquid.xyz/API."); await aviso("⚠️ Hyperliquid: la clave que has puesto es la de tu cartera principal (puede retirar dinero). Bórrala de Ajustes y crea una clave de agente en app.hyperliquid.xyz/API."); return; }
  const meta = await info({ type: "meta" }), idx = new Map(meta.universe.map((u, i) => [u.name, { a: i, szd: u.szDecimals }]));
  const st = await info({ type: "clearinghouseState", user: yo }), eq = +st.marginSummary.accountValue || 0, mids = await info({ type: "allMids" });
  const pos = (st.assetPositions || []).map((x) => x.position).filter((p) => +p.szi !== 0);
  const led = await info({ type: "userNonFundingLedgerUpdates", user: yo, startTime: 0 }).catch(() => []);
  let neto = 0; for (const u of led || []) { const d = u.delta || {}; if (d.type === "deposit") neto += +d.usdc || 0; else if (d.type === "withdraw") neto -= +d.usdc || 0; }
  const fills = await info({ type: "userFills", user: yo }).catch(() => []);
  const abierta = (c) => { const f = (fills || []).filter((z) => z.coin === c && /^Open/.test(z.dir)).sort((a, b) => b.time - a.time)[0]; return f ? +f.time : null; };
  const CTL = await leeCtl(), M0 = await metodo(CTL.puesto); const h = M0 && M0.x && M0.x.g ? M0.x.g.h : 16;
  // v456 · cada posición recuerda SU método (duración y stop): si el método cambia, las abiertas siguen con sus reglas. Las que no lo tienen
  //   apuntado (abiertas antes de esta versión) son del método en uso.
  const prev = await leeAnterior(), pm = (prev && prev.pm) || {};
  for (const p of pos) if (!pm[p.coin]) pm[p.coin] = { h, sl: M0 && M0.x && M0.x.g ? M0.x.g.sl || 0 : 0, k: M0 && M0.x ? M0.x.k : null };
  for (const c of Object.keys(pm)) if (!pos.some((p) => p.coin === c)) delete pm[c];
  // v451 · 🔑 CADUCIDAD DE LA CLAVE DEL BOT: Hyperliquid dice hasta cuándo vale el agente; 30 días antes, aviso diario (a las 10 de la mañana)
  let agenteHasta = null; try { const ag = await info({ type: "extraAgents", user: yo }), mia = new ETH.Wallet(PK).address.toLowerCase(), a = (ag || []).find((x) => String(x.address).toLowerCase() === mia);
    if (a && a.validUntil) { agenteHasta = +a.validUntil; const dias = Math.floor((agenteHasta - Date.now()) / 864e5), hMad = +new Date().toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false });
      if (dias <= 30 && hMad === 10) await aviso(`🔑 Hyperliquid: la clave del bot ${dias <= 0 ? "CADUCA HOY" : `caduca en ${dias} día${dias === 1 ? "" : "s"}`} (${new Date(agenteHasta).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}).\nCrea otra: en Rabby abre app.hyperliquid.xyz/API → nombre «botrading» → Generate → Authorize API Wallet → firma. Copia la Private Key nueva y pégala en la app (⚙️ Ajustes → ☁️ Ajustes → 🪙 Claves → HL_AGENT_KEY). Al usar el mismo nombre, la vieja deja de valer sola.`); }
    else if (ag && !a) { log("⚠️ La clave del bot no aparece entre los agentes autorizados de tu cuenta."); if (new Date().getUTCMinutes() < 10) await aviso("🔑 Hyperliquid: la clave del bot ya no está autorizada en tu cuenta (caducada o borrada). El bot no puede operar: crea otra en app.hyperliquid.xyz/API y pégala en la app (HL_AGENT_KEY)."); } } catch (e) {}
  const hechos = [], estado = { agenteHasta, w: yo, ctl: CTL, t: new Date().toISOString(), eq, neto, metodo: M0 && M0.x ? M0.x.n : null, ops: [], pm };
  log(`Hyperliquid real: ${pos.length} posiciones abiertas · ${CTL.estado === "on" ? "activo" : CTL.estado === "pausa" ? "en pausa (no abre nuevas)" : "parado (cierra todo)"} · método ${M0 && M0.x ? "n.º " + CTL.puesto + " del podio" : "no disponible"}`);

  // 1) freno: la cuenta ha caído por debajo de la mitad de lo ingresado → cerrar todo y no abrir
  const freno = neto > 0 && eq < neto * (1 - CTL.freno), parar = CTL.estado === "parado";
  // 2) cerrar las que ya han cumplido su tiempo (con 10 min de margen) o todas si salta el freno
  for (const p of pos) { const c = p.coin, t0 = abierta(c), edad = t0 ? Date.now() - t0 : Infinity, I = idx.get(c); if (!I) continue;
    const hP = (pm[c] && pm[c].h) || h; if (!freno && !parar && edad < hP * H - 10 * 60e3) continue; const lado = +p.szi > 0, mid = +mids[c];
    const r = await mandar(orden(I.a, !lado, precioOk(mid * (lado ? 1 - SLIP : 1 + SLIP), I.szd), Math.abs(+p.szi), true), PK);
    if (r.ok) { const pnl = (+p.unrealizedPnl || 0); hechos.push(`${pnl >= 0 ? "🟢" : "🔴"} Cierra ${lado ? "largo" : "corto"} en ${c} tras ${Math.round(edad / H)} h · ${pnl >= 0 ? "+" : ""}${D2(pnl)} $ aprox.`); estado.ops.push({ t: Date.now(), c, x: "cierra", lado: lado ? 1 : -1, pnl }); }
    else hechos.push(`⚠️ No he podido cerrar ${c}: ${r.err}`); }
  if (parar) { log("Hyperliquid real: parado desde los ajustes. No abro nada."); if (hechos.length) await aviso("🛑 Hyperliquid: lo has parado desde la app. He cerrado todo.\n\n" + hechos.join("\n")); estado.parado = 1; await guarda(estado); return; }
  if (freno) { log("Hyperliquid real: freno activado (la cuenta ha caído más de lo permitido respecto a lo ingresado). No abro nada."); if (hechos.length) await aviso("🛑 Hyperliquid: la cuenta ha caído más de un " + CTL.freno * 100 + " % respecto a lo que ingresaste. He cerrado todo y no abriré más hasta que lo revises.\n\n" + hechos.join("\n")); estado.freno = 1; await guarda(estado); return; }

  // 3) abrir en las plazas libres según la señal de la última vela cerrada
  if (CTL.estado === "pausa") log("En pausa: no abro posiciones nuevas.");
  if (CTL.estado === "on" && M0 && M0.x && M0.x.g) {
    const g = M0.x.g, D = await datosVivos(M0.U.filter((c) => idx.has(c)));
    if (!D.M.BTC) { log("Sin datos de BTC; no abro nada esta hora."); }
    else { const S0 = senales(D), A = pieza(S0, M0.IA, M0.x.RX, g.a, g.ia), B = g.b != null ? pieza(S0, M0.IA, M0.x.RX, g.b, g.iab) : null;
      const nomEsperado = `${A && A.nom}${B ? " + confirma " + B.nom : ""}`;
      if (!A || (g.b != null && !B) || !String(M0.x.n).startsWith(nomEsperado)) { log("El método del podio no coincide con las señales de este programa; no abro nada (aviso enviado)."); await aviso("⚠️ Hyperliquid: no reconozco el método n.º 1 del podio; esta hora no abro nada."); }
      else {
        const n = D.T.length, i = n - 1, X = { btcUp: null, up: {}, vol: {}, volMed: {} }; { const e = ema(D.M.BTC.C, 200); X.btcUp = Uint8Array.from(D.M.BTC.C, (c, k) => (c > e[k] ? 1 : 0)); for (const c of D.U) { const e2 = ema(D.M[c].C, 100); X.up[c] = Uint8Array.from(D.M[c].C, (x, k) => (x > e2[k] ? 1 : 0)); X.vol[c] = atr(D.M[c], 24); const s = [...X.vol[c]].filter(Number.isFinite).sort((p, q) => p - q); X.volMed[c] = s[Math.floor(s.length / 2)]; } }
        const filtro = FILTROS[g.f] || FILTROS["sin filtro"], quiere = [];
        for (const c of D.U) { if (!D.M[c].ultima) continue; let a, b = null; try { a = A.fn(D.M[c], D.T, D.M.BTC); if (B) b = B.fn(D.M[c], D.T, D.M.BTC); } catch (e) { continue; }
          const dir = a[i]; if (!dir) continue; if (b) { let ok = false; for (let k = 0; k < 6 && !ok; k++) if (b[i - k] === dir) ok = true; if (!ok) continue; } if (!filtro(dir, i, X, c)) continue; quiere.push({ c, dir }); }
        // plazas: como en el laboratorio, hasta 5 a partes iguales; con poco saldo, menos plazas (cada orden necesita ≥ 11 $). Sin apalancamiento.
        const uso = eq * CTL.uso / 100, plazas = Math.max(0, Math.min(CTL.plazas || 5, Math.floor(uso / MIN_ORDEN))), libres = plazas - pos.filter((p) => !estado.ops.some((o) => o.c === p.coin && o.x === "cierra")).length;
        estado.plazas = plazas; estado.senales = quiere.length;
        log(`Señales esta hora: ${quiere.length} · plazas ${plazas} · libres ${Math.max(0, libres)}`);
        let usadas = 0; for (const q of quiere) { if (usadas >= libres) break; if (pos.some((p) => p.coin === q.c) && !estado.ops.some((o) => o.c === q.c && o.x === "cierra")) continue;
          const I = idx.get(q.c), mid = +mids[q.c]; if (!(mid > 0)) continue; const notional = Math.min(uso / plazas, eq) * 0.98, sz = tamOk(notional / mid, I.szd); if (sz * mid < 10.2) continue;
          const r = await mandar(orden(I.a, q.dir > 0, precioOk(mid * (q.dir > 0 ? 1 + SLIP_ABRE : 1 - SLIP_ABRE), I.szd), sz, false), PK);
          if (r.ok) pm[q.c] = { h: g.h, sl: g.sl || 0, k: M0.x.k };
          // v459 · 🛡️ una posición NUNCA se queda sin su stop: si no se puede poner, se reintenta al momento y, si vuelve a fallar, se cierra ya
          if (r.ok) { const dS = g.sl > 0 ? g.sl : STOP_EMERG; let okS = false; for (let z = 0; z < 2 && !okS; z++) { try { okS = await ponStop(I.a, q.dir, r.px, r.sz, I.szd, PK, dS); } catch (e) { okS = false; } if (!okS) await sleep(2500); }
            if (!okS) { const mid2 = +((await info({ type: "allMids" }).catch(() => ({})))[q.c]) || r.px, rc = await mandar(orden(I.a, q.dir < 0, precioOk(mid2 * (q.dir < 0 ? 1 + SLIP : 1 - SLIP), I.szd), r.sz, true), PK);
              delete pm[q.c]; hechos.push(`🚨 ${q.c}: no he podido ponerle el stop después de abrir, así que la ${rc.ok ? "he cerrado al momento" : "he intentado cerrar (NO se ha podido: revísala en Hyperliquid)"}`);
              if (!rc.ok) await aviso(`🚨 Hyperliquid: ${q.c} está abierta SIN stop y no he podido cerrarla. Ciérrala a mano en app.hyperliquid.xyz.`); if (rc.ok) { estado.ops.push({ t: Date.now(), c: q.c, x: "cierra", lado: q.dir, pnl: 0, sinStop: 1 }); continue; } } }
          if (r.ok) { usadas++; hechos.push(`${q.dir > 0 ? "📈 Abre LARGO" : "📉 Abre CORTO"} en ${q.c} · ${D2(r.sz * r.px)} $ a ${r.px} · cierra en ${g.h} h`); estado.ops.push({ t: Date.now(), c: q.c, x: "abre", lado: q.dir, px: r.px, v: r.sz * r.px }); }
          else hechos.push(`⚠️ No he podido abrir ${q.c}: ${r.err}`); }
      } }
  }
  // v441 · 🛡️ revisión de stops: cada posición abierta debe tener su stop de emergencia; las órdenes que ya no tengan posición se cancelan
  try { const stx = await info({ type: "clearinghouseState", user: yo }), ab = (stx.assetPositions || []).map((x) => x.position).filter((p) => +p.szi !== 0), oo = (await info({ type: "frontendOpenOrders", user: yo })) || [];
    const canc = oo.filter((o) => !ab.some((p) => p.coin === o.coin) && idx.has(o.coin)).map((o) => ({ a: idx.get(o.coin).a, o: o.oid }));
    if (canc.length) await exchange({ type: "cancel", cancels: canc }, PK);
    // v456 · el stop de cada posición va donde dice SU método (p. ej. −8 %), igual que en la prueba; si el método no tiene stop, el de emergencia (−25 %)
    for (const p of ab) { const I = idx.get(p.coin); if (!I) continue; const lado = +p.szi > 0 ? 1 : -1, ent = +p.entryPx, dist = pm[p.coin] && pm[p.coin].sl > 0 ? pm[p.coin].sl : STOP_EMERG, want = ent * (lado > 0 ? 1 - dist : 1 + dist);
      // v459 · el stop tiene que estar bien en TODO: precio, lado (vende si es largo, compra si es corto) y cantidad (cubre toda la posición)
      const sts = oo.filter((o) => o.coin === p.coin && (o.isTrigger || /stop/i.test(o.orderType || ""))), tam = Math.abs(+p.szi), ladoOk = (o) => (o.side ? (lado > 0 ? o.side === "A" : o.side === "B") : true), tamOk2 = (o) => { const z = +(o.sz ?? o.origSz); return !(z > 0) || z >= tam * 0.999; };
      const bien = sts.some((o) => +o.triggerPx > 0 && Math.abs(+o.triggerPx / want - 1) < 0.006 && ladoOk(o) && tamOk2(o));
      if (bien) continue;
      if (await ponStop(I.a, lado, ent, Math.abs(+p.szi), I.szd, PK, dist)) { if (sts.length) await exchange({ type: "cancel", cancels: sts.map((o) => ({ a: I.a, o: o.oid })) }, PK); log(sts.length ? "Stop de una posición movido a lo que dice su método." : "Stop puesto en una posición que no lo tenía."); } } } catch (e) { log("Revisión de stops: " + String(e.message).slice(0, 60)); }
  const st2 = await info({ type: "clearinghouseState", user: yo }).catch(() => null); if (st2) { estado.eq = +st2.marginSummary.accountValue || eq; estado.pos = (st2.assetPositions || []).map((x) => x.position).filter((p) => +p.szi !== 0).map((p) => ({ c: p.coin, lado: +p.szi > 0 ? 1 : -1, v: +p.positionValue, pnl: +p.unrealizedPnl, entrada: +p.entryPx, desde: abierta(p.coin) })); }
  try { const f2 = await info({ type: "userFills", user: yo }); const cie = {}, ab0 = {}; for (const z of (f2 || []).slice().sort((a, b) => a.time - b.time)) { if (/^Open/.test(z.dir)) { if (!(z.coin in ab0) || ab0["_c" + z.coin]) ab0[z.coin] = +z.time; delete ab0["_c" + z.coin]; continue; } if (!/^Close/.test(z.dir)) continue; ab0["_c" + z.coin] = 1; const k = z.coin + "|" + Math.floor(z.time / 60000); const o = cie[k] || (cie[k] = { t: +z.time, t0: ab0[z.coin] || null, c: z.coin, lado: /Long/.test(z.dir) ? 1 : -1, pnl: 0, v: 0 }); o.pnl += (+z.closedPnl || 0) - (+z.fee || 0); o.v += (+z.sz || 0) * (+z.px || 0); }
    estado.cierres = Object.values(cie).sort((a, b) => b.t - a.t).slice(0, 80); estado.ganado = estado.cierres.reduce((a, x) => a + x.pnl, 0); } catch (e) {}
  estado.h = h; estado.plazas = estado.plazas != null ? estado.plazas : Math.max(0, Math.min(CTL.plazas || 5, Math.floor(eq * CTL.uso / 100 / MIN_ORDEN)));
  log(`Hyperliquid real: ${hechos.length} movimientos esta hora.`);
  if (hechos.length) await aviso("💧 Hyperliquid (dinero real)\n" + hechos.join("\n") + `\n\nCuenta: ${D2(estado.eq)} $ · ingresado ${D2(neto)} $`);
  await guarda(estado);
}

// prueba de firma SIN dinero: manda una orden imposible (cantidad 0) firmada; Hyperliquid responde con la dirección que ha leído de la firma.
// Si coincide con la del agente, la firma es correcta.
export async function pruebaFirma() {
  await libs(); const pk = env("HL_AGENT_KEY") ? (env("HL_AGENT_KEY").startsWith("0x") ? env("HL_AGENT_KEY") : "0x" + env("HL_AGENT_KEY")) : ETH.Wallet.createRandom().privateKey, dir = new ETH.Wallet(pk).address.toLowerCase();
  const meta = await info({ type: "meta" }), a = meta.universe.findIndex((u) => u.name === "BTC"), mids = await info({ type: "allMids" });
  const res = await exchange({ type: "order", orders: [orden(a, true, precioOk(+mids.BTC * 0.5, meta.universe[a].szDecimals), 0.00001, false)], grouping: "na" }, pk);
  const txt = JSON.stringify(res.j || res.t), leida = (txt.match(/0x[0-9a-f]{40}/i) || [""])[0].toLowerCase();
  log(`Prueba de firma: HTTP ${res.http} · ${env("HL_AGENT_KEY") ? "clave del agente" : "clave inventada"} · ${leida ? (leida === dir ? "✅ Hyperliquid lee la firma correctamente" : "❌ la firma no cuadra") : "respuesta: " + txt.replace(/0x[0-9a-f]{40}/gi, "0x…").slice(0, 160)}`);
}
export async function revisaStops() { const yo = env("HL_WALLET").toLowerCase(); const st = await info({ type: "clearinghouseState", user: yo }), ab = (st.assetPositions || []).map((x) => x.position).filter((p) => +p.szi !== 0), oo = (await info({ type: "frontendOpenOrders", user: yo })) || [];
  const con = ab.filter((p) => oo.some((o) => o.coin === p.coin && (o.isTrigger || /stop/i.test(o.orderType || "")))).length; log(`Revisión: ${ab.length} posiciones abiertas · ${con} con stop · ${oo.length} órdenes en total`);
  // v458 · a qué distancia está cada stop (solo porcentajes, sin criptos ni importes)
  const dist = ab.map((p) => { const o = oo.find((z) => z.coin === p.coin && +z.triggerPx > 0); return o ? Math.round(Math.abs(+o.triggerPx / +p.entryPx - 1) * 1000) / 10 : null; }).filter((x) => x != null).sort((a, b) => a - b); log(`Distancia de los stops respecto a la entrada: ${dist.map((x) => "−" + x + " %").join(" · ") || "—"}`);
  try { await libs(); const pk = env("HL_AGENT_KEY"), mia = new ETH.Wallet(pk.startsWith("0x") ? pk : "0x" + pk).address.toLowerCase(), ag = await info({ type: "extraAgents", user: yo }), a = (ag || []).find((x) => String(x.address).toLowerCase() === mia); log(a ? `Clave del bot: válida ${Math.floor((+a.validUntil - Date.now()) / 864e5)} días más` : `Clave del bot: no aparece entre los agentes (${(ag || []).length} agentes)`); } catch (e) { log("Clave del bot: no se pudo consultar"); } }
if (process.argv[1] && process.argv[1].endsWith("hl-real.mjs")) (process.argv[2] === "firma" ? pruebaFirma() : process.argv[2] === "stops" ? revisaStops() : process.argv[2] === "ajustes" ? guardaAjustes() : ronda()).catch(async (e) => { const t = String(e.message).split("\n")[0].replace(/0x[0-9a-fA-F]{40,}/g, "0x…").slice(0, 160); console.log("Error: " + t); if (!["firma", "stops"].includes(process.argv[2])) await aviso("🚨 Hyperliquid: la ronda de esta hora ha fallado (" + t + "). Lo vuelve a intentar en la siguiente; tus posiciones siguen con su stop de emergencia."); process.exit(1); });
