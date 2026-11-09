// v357 · 🖥️ DIARIO PARA EL TERMINAL: se carga ANTES que cualquier proceso del bot (NODE_OPTIONS=--import …) y apunta en un archivo LOCAL del
// propio ordenador de GitHub (DIARIO_LOG) cada línea que escribe el proceso y cada mensaje de Telegram que envía, con su hora exacta.
// Ese archivo NO se publica tal cual: diario.mjs lo cifra con REAL_VIEW_PASS y lo guarda en su rama. Los mensajes de Telegram nunca se
// escriben en los registros públicos de GitHub (solo en este archivo, que va cifrado).
import { appendFileSync } from "node:fs";
const F = process.env.DIARIO_LOG, SOLO_TG = process.env.DIARIO_SOLO_TG === "1";
const apunta = (txt) => { try { const t = String(txt).replace(/\s+/g, " ").trim(); if (t) appendFileSync(F, JSON.stringify([Date.now(), t.slice(0, 900)]) + "\n"); } catch (e) {} };
if (F) {
  if (!SOLO_TG) for (const k of ["log", "warn", "error", "info"]) { const o = console[k].bind(console); console[k] = (...a) => { try { apunta(a.map((x) => (typeof x === "string" ? x : x instanceof Error ? x.message : (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })())).join(" ")); } catch (e) {} return o(...a); }; }
  if (typeof globalThis.fetch === "function") { const of = globalThis.fetch; globalThis.fetch = (u, o) => { try { const s = String((u && u.url) || u); if (/api\.telegram\.org\/bot[^/]+\/sendMessage/.test(s) && o && o.body) { const b = JSON.parse(o.body); if (b && b.text) apunta("📤 Telegram: " + b.text); } } catch (e) {} return of(u, o); }; }
}
