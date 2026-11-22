// «Restaurar una copia» con que=datos (opción por defecto) devuelve también las ramas de CONTROL del dinero real
// (bitvavo-ctl, hl-ctl…) a su estado antiguo: un /parar posterior a la copia se deshace y los bots vuelven a operar con dinero real.
import test from "node:test"; import assert from "node:assert/strict";
import { execSync } from "node:child_process"; import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import path from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const yml = readFileSync(path.join(ROOT, ".github/workflows/restaurar.yml"), "utf8");
const paso = yml.split("- name: Restaurar\n")[1].split("run: |\n")[1].split("\n      - name:")[0].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
const E = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const sh = (c, cwd) => execSync(c, { cwd, stdio: "pipe", env: E }).toString();
test("R6-2 · restaurar «datos» no debe deshacer un /parar del dinero real", () => {
  const base = mkdtempSync(path.join(tmpdir(), "rest-")), origin = path.join(base, "origin.git"), w = path.join(base, "w");
  sh(`git init -q --bare -b main "${origin}" && git clone -q "${origin}" "${w}"`, base);
  sh(`git checkout -q -b main && echo app > index.html && git add -A && git commit -qm main && git push -q origin main`, w);
  const rama = (b, obj) => sh(`git checkout -q --orphan ${b} && git rm -rqf . ; echo '${JSON.stringify(obj)}' > ctl.json && git add ctl.json && git commit -qm ${b} && git push -qf origin HEAD:${b} && git checkout -q main`, w);
  rama("bitvavo-ctl", { parado: false, cuentas: { bitvavo: { on: true, parado: false } } });
  rama("hl-ctl", { estado: "on" });
  sh(`git fetch -q origin`, w);
  for (const b of ["main", "bitvavo-ctl", "hl-ctl"]) sh(`git tag -f copia/2026-11-01/${b} refs/remotes/origin/${b}`, w);   // como copia.yml
  sh(`git push -qf origin "refs/tags/copia/2026-11-01/*:refs/tags/copia/2026-11-01/*"`, w);
  // después de la copia, el dueño pulsa /parar
  sh(`git checkout -q -B x origin/bitvavo-ctl && echo '{"parado":true,"motivo":"lo has parado tú"}' > ctl.json && git commit -qam parar && git push -q origin HEAD:bitvavo-ctl && git checkout -q main`, w);
  sh(`git checkout -q -B y origin/hl-ctl && echo '{"estado":"parado"}' > ctl.json && git commit -qam parar && git push -q origin HEAD:hl-ctl && git checkout -q main`, w);
  const s = path.join(base, "paso.sh"); writeFileSync(s, paso);   // paso literal del flujo, entradas por defecto
  console.log(execSync(`bash "${s}"`, { cwd: w, env: { ...E, IN_FECHA: "2026-11-01", IN_QUE: "datos", IN_RAMAS: "" } }).toString().trim());
  sh(`git fetch -q origin`, w);
  const bv = JSON.parse(sh(`git show origin/bitvavo-ctl:ctl.json`, w)), hl = JSON.parse(sh(`git show origin/hl-ctl:ctl.json`, w));
  assert.equal(bv.parado, true, "Bitvavo/OKX con dinero real vuelve a estar ACTIVO tras restaurar: " + JSON.stringify(bv));
  assert.equal(hl.estado, "parado", "Hyperliquid vuelve a estar ACTIVO tras restaurar: " + JSON.stringify(hl));
});
test("R6-2 · al terminar, restaurar relanza meme.yml, que es el bot de DINERO REAL de Bitvavo/OKX/Hyperliquid", () => {
  const fin = yml.split("Volver a encender el bot y los laboratorios")[1], relanza = /for w in ([^;]*); do n=\$\(gh api/.exec(fin)[1];
  const meme = readFileSync(path.join(ROOT, ".github/workflows/meme.yml"), "utf8");
  assert.ok(!(relanza.includes("meme.yml") && /BITVAVO_SECRET|OKX_SECRET|HL_AGENT_KEY/.test(meme)), "relanza meme.yml (bot con claves de dinero real) pese a decir que no relanza los bots reales");
});
