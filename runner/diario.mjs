// v357 · 🖥️ Guarda (cifrado) en su propia rama lo que un proceso ha apuntado con diario-captura.mjs, para la pestaña Terminal de la app.
// Uso: node runner/diario.mjs <rama>   (lee DIARIO_LOG). Guarda los últimos 7 días (hasta 12.000 líneas). Si no puede leer o descifrar lo que
// ya hay, NO lo pisa. Nunca escribe en los registros públicos el contenido del diario, solo cuántas líneas ha guardado.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { encrypt, openAny } from "./real-cfg.mjs";
const env = (k) => (process.env[k] || "").trim();
const RAMA = process.argv[2], F = env("DIARIO_LOG"), PW = env("REAL_VIEW_PASS"), TOKEN = env("GITHUB_TOKEN"), REPO = env("GITHUB_REPOSITORY");
const sh = (c) => execSync(c, { stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 28 });
export function mezcla(L, nuevas, ahora, dias = 7, max = 12000) {
  const out = Array.isArray(L) ? L.slice() : [];
  for (const [t, x] of nuevas) { let hit = null; for (let k = out.length - 1; k >= Math.max(0, out.length - 60); k--) if (out[k][1] === x && new Date(out[k][0]).toDateString() === new Date(t).toDateString()) { hit = out[k]; break; } if (hit) { hit[0] = Math.max(hit[0], t); hit[2] = (hit[2] || 1) + 1; } else out.push([t, x, 1]); }
  out.sort((a, b) => a[0] - b[0]); return out.filter((l) => l[0] >= ahora - dias * 864e5).slice(-max);
}
async function main() {
  if (!/^terminal-[a-z-]+$/.test(RAMA || "")) { console.log("Diario: rama no válida"); return; }
  if (!F || !existsSync(F)) { console.log("Diario: nada que guardar"); return; }
  const nuevas = readFileSync(F, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter((x) => Array.isArray(x) && x[0] > 0 && x[1]);
  if (!nuevas.length) { console.log("Diario: nada que guardar"); return; }
  if (!PW || !TOKEN || !REPO) { console.log("Diario: sin clave o sin repositorio (no se guarda nada)"); return; }
  let L = [];
  for (let i = 0; i < 3; i++) {
    let txt = null;
    try { sh(`git fetch -q --depth 1 https://x-access-token:${TOKEN}@github.com/${REPO}.git ${RAMA}`); txt = sh("git show FETCH_HEAD:terminal.json"); } catch (e) { if (!/couldn't find remote ref|not found/i.test(String(e.message))) { if (i === 2) { console.log("Diario: no pude leer el que hay; no lo piso"); return; } await new Promise((r) => setTimeout(r, 4000)); continue; } }
    if (txt) { const j = JSON.parse(txt), o = await openAny(j, [PW, env("REAL_VIEW_PASS_OLD")]); if (o.error) { console.log("Diario: no pude descifrar el que hay; no lo piso"); return; } L = (o.j && o.j.l) || []; }
    break;
  }
  const l = mezcla(L, nuevas, Date.now());
  const out = JSON.stringify({ enc: 1, v: 1, ...(await encrypt(JSON.stringify({ v: 1, l }), PW)), meta: { t: new Date().toISOString(), n: l.length } });
  const pub = path.join(process.cwd(), ".pubdiario"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "terminal.json"), out);
  const g = (c) => sh(`git -C "${pub}" ${c}`);
  g(`init -q -b ${RAMA}`); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add terminal.json"); g(`commit -q -m "diario ${new Date().toISOString()}"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git ${RAMA}`); console.log(`Diario: ${nuevas.length} líneas nuevas guardadas (cifradas) en ${RAMA}`); return; } catch (e) { await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  console.log("Diario: no pude guardarlo esta vez");
}
if (process.argv[1] && process.argv[1].endsWith("diario.mjs")) main().catch((e) => console.log("Diario: " + String(e.message).split("\n")[0].replace(/x-access-token:[^@]+@/g, "").slice(0, 120)));
