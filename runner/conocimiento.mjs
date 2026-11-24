// v382 · 📚 CONOCIMIENTO DEL PROYECTO para el asistente IA de la app.
// Junta en un solo texto (conocimiento.md) cómo está hecho TODO el proyecto: la explicación general (escrita a mano, abajo),
// cada tarea automática de GitHub con su horario, cada proceso del bot con su explicación (los comentarios de cabecera
// de cada archivo) y los parámetros clave. Se publica en la rama «conocimiento» (pública: no lleva claves ni importes).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
const ROOT = process.cwd(), env = (k) => (process.env[k] || "").trim();
const out = [];
const P = (s = "") => out.push(s);
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const ver = (html.match(/Compilación (\d+)/) || [])[1] || "?";
P(`# CriptoBot · conocimiento completo del proyecto (compilación #${ver}, generado ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`);
P();
P(`## Qué es
App personal (web publicada en GitHub Pages, envuelta en un APK para Android) que invierte sola con dinero real y prueba métodos con dinero ficticio. Todo el trabajo lo hacen procesos automáticos en la nube (GitHub Actions); el móvil solo MUESTRA lo que dejan publicado. Todo en castellano.

## Pestañas
- 💶 Real: las cuentas de cripto con dinero real (Bitvavo y OKX con el método de las Tortugas; Hyperliquid con el n.º 1 de su laboratorio): lo que vale, comprado, ventas, gráfica.
- 📋 Informes: Parte del día, Gráficas, Errores, Real (cripto), Laboratorios de cripto y Por día; descargas en TXT/JSON/CSV.
- ⚙️ Ajustes: ☁️ ajustes protegidos con clave (claves de exchanges, Gemini…), cripto (riesgo, dinero real) y Hyperliquid.
- Botón 🤖 (abajo a la derecha): este asistente. Botón 🔒 (arriba a la derecha): cerrar sesión.
- (Desde el 24/11/2026 la app se llama CriptoBot: ya NO tiene Trading 212 ni laboratorios de ETF, Acciones o Mixtos.)

## Seguridad
- Entrada con una clave (y la huella del móvil si lo admite, WebAuthn). La sesión se cierra sola tras 30 min sin usar la app.
- Los datos de dinero real se publican CIFRADOS (AES-GCM con PBKDF2, clave REAL_VIEW_PASS); el repositorio es público pero sin la clave no se puede leer nada de dinero.
- Las claves de brókers solo están en GitHub Secrets; nunca con permiso de retirar. Los registros públicos nunca llevan importes ni claves.

## Cripto real (Bitvavo y OKX) · runner/bitvavo.mjs + bitvavo-real.mjs + tortugas.mjs
- Solo las 🐢 Tortugas: compra una cripto cuando cierra por encima de su máximo de N días y la vende al caer por debajo de su mínimo de M días; stop de emergencia guardado en el propio exchange (STOP_EMERG); no compra si el hueco de precio es grande.
- Vigila TODAS las criptos de cada exchange con algo de volumen. Bot cada minuto (meme.yml).
- Niveles de riesgo (bajo, medio, máximo, automático = el que más gana), cada uno aprende sus reglas (🧬 examen largo cada 3 h con 2 años de velas diarias).
- Podio cripto: por lo ganado en 2 años; a igual ganancia, menos caída; para entrar no puede perder en más del 40 % de 24 tramos al azar ni ir mal en los últimos 6 meses (veto: perder >10 % o más que tener bitcoin).
- Frenos: freno total si el saldo cae un %, freno diario, dinero máximo que usa, criptos que no debe tocar.
- Telegram: 🟢 COMPRA REAL / 🔴 VENTA REAL con importe, precio, motivo, stop y euros libres; frenos; stops de emergencia; aviso a las 25 operaciones cerradas para revisar si gana como en la prueba.

## Laboratorio de cripto de muchas operaciones (Hyperliquid, SOLO DATOS) · runner/caza-lab.mjs
- Busca métodos de ≥4 operaciones al día con comisiones (0,045 %) + deslizamiento (0,05 %) + financiación reales, velas de 1 h, ~20 criptos, 18 meses.
- Aprende solo: memoria de combinaciones probadas, pesos por familia, mutaciones de las que se acercan, ideas leídas de arXiv/Alpha Architect/Quantpedia, y recetas del ayudante IA (como mucho el 15 % de cada ronda).
- Examen: ganar en la historia completa hasta hoy, en los últimos 6 meses y en ≥60 % de 16 tramos al azar; PF ≥1,15; caída <30 %.
- Hasta ahora no aprueba ninguno. Si alguno aprueba, avisa por Telegram y NO mete dinero sin preguntar (plan: 50 € con freno de −25 €).

## Ayudante IA del laboratorio (Gemini, gratis) · runner/ia-lab.mjs (cada 6 h)
- Propone recetas de cripto (formato cerrado, comprobado) y genes de ETF; lleva un cuaderno de lecciones que reescribe con los resultados. Solo propone: no cambia el examen, la memoria ni el dinero.

## Datos y ramas de GitHub
- main: el código. data: estado del laboratorio y la ficticia (state.json completo y vista.json ligera para el móvil). real / bitvavo-real / okx-real: dinero real CIFRADO. bitvavo: estado de cripto (cifrado). examen-largo, caza-lab, ia-lab: laboratorios (públicos, sin dinero). terminal-*: diarios del terminal (cifrados). conocimiento: este texto.

## Pruebas realizadas y conclusiones
- Hyperliquid muchas operaciones: miles de combinaciones (clásicas, profesionales e IA): ninguna gana de forma fiable con costes reales.
- Memecoins de Bitvavo (2 años, 29 monedas, ~7.800 combinaciones, también variantes de la IA y sin freno): ninguna aprueba; todas acaban perdiendo la mitad.
- Expectativa realista de la cartera de ETF: alrededor de un 7-10 % al año a largo plazo con caídas de −20/−30 % algunos años (la prueba histórica marca ~13 % pero infla por haber probado miles de métodos).
`);
// tareas automáticas
P("## Tareas automáticas (GitHub Actions) y su horario (UTC)");
for (const f of readdirSync(path.join(ROOT, ".github/workflows")).filter((x) => x.endsWith(".yml")).sort()) {
  const t = readFileSync(path.join(ROOT, ".github/workflows", f), "utf8"), name = (t.match(/^name:\s*(.+)$/m) || [])[1] || f, crons = [...t.matchAll(/cron:\s*"([^"]+)"/g)].map((m) => m[1]);
  const c1 = (t.match(/^#\s*(.+)$/m) || [])[1] || "";
  P(`- ${f}: ${name.replace(/^["']|["']$/g, "")}${crons.length ? ` · horario: ${crons.join(" | ")}` : " · a mano o lanzada por otra"}${c1 ? ` · ${c1.slice(0, 200)}` : ""}`);
}
P();
// procesos
P("## Procesos del bot (carpeta runner/) y lo que explica cada uno");
for (const f of readdirSync(path.join(ROOT, "runner")).filter((x) => x.endsWith(".mjs")).sort()) {
  const L = readFileSync(path.join(ROOT, "runner", f), "utf8").split("\n"), com = [];
  for (const l of L.slice(0, 30)) { const m = l.match(/^\s*\/\/\s?(.*)$/); if (m) com.push(m[1].trim()); else if (com.length && !/^import|^\s*$/.test(l)) break; }
  if (!com.length) { const m = L.slice(0, 5).join(" ").match(/\/\/\s?(.{20,400})/); if (m) com.push(m[1]); }
  P(`- ${f}: ${com.join(" ").replace(/\s+/g, " ").slice(0, 700) || "(sin explicación en cabecera)"}`);
}
P();
// parámetros clave
P("## Parámetros clave del código");
const grab = (file, re, lab) => { try { const t = readFileSync(path.join(ROOT, file), "utf8"), m = t.match(re); if (m) P(`- ${lab}: ${m[0].slice(0, 400)}`); } catch (e) {} };
grab("runner/bitvavo-real.mjs", /const (STOP_EMERG|FRENO)[^;]*;/, "Frenos de cripto real");
grab("runner/tortugas.mjs", /const UNI_VOL[^;]*;/, "Universo de criptos vigiladas");
grab("runner/caza-lab.mjs", /const CAZA_N[^;]*;|CAZA_N[^,;]*/, "Tamaño de cada ronda del laboratorio de cripto");
P();
P("## Ayuda que ve el usuario en la app");
{ const i = html.indexOf('<section class="tab" id="t-ayuda">'), j = html.indexOf("</section>", i); const t = html.slice(i, j).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " "); P(t.slice(0, 30000)); }
const txt = out.join("\n");
console.log(`conocimiento.md: ${(txt.length / 1000).toFixed(0)} KB`);
const dir = path.join(process.env.RUNNER_TEMP || "/tmp", "conocimiento-pub"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "conocimiento.md"), txt);
if (env("GITHUB_TOKEN") && env("GITHUB_REPOSITORY")) {
  const sh = (c) => execSync(c, { stdio: "pipe", encoding: "utf8" });
  sh(`cd ${dir} && git init -q && git checkout -q -b conocimiento && git add conocimiento.md && git -c user.name=bot -c user.email=bot@users.noreply.github.com commit -qm "Conocimiento del proyecto #${ver}" && git push -qf https://x-access-token:${env("GITHUB_TOKEN")}@github.com/${env("GITHUB_REPOSITORY")}.git conocimiento`);
  console.log("publicado en la rama conocimiento");
} else writeFileSync(path.join(ROOT, "conocimiento.md"), txt);
