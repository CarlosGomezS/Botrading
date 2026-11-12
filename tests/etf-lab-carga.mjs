// Carga el código REAL del laboratorio de ETF desde index.html (sin copiarlo) en un entorno aislado de Node, para probarlo.
// Solo se sustituye lo que no es del laboratorio (la página, el navegador y el motor que hace las pruebas históricas).
import { readFileSync } from "node:fs";
import vm from "node:vm";
const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const JS = [...HTML.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/json|text\/plain)")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
const TOP = /\n(?=(?:async\s+)?function\s|const\s|let\s|var\s|class\s|\/\*|\/\/|[A-Za-z_$][\w$]*\s*\(|try\s*\{|if\s*\(|\(|window\.|document\.|\$\()/g;
// devuelve la sentencia de nivel superior que declara «name» (función, const o let; también dentro de listas «const a=…,b=…»)
export function declaracion(name) {
  const res = [new RegExp(`(^|\\n)(async\\s+)?function\\s+${name}\\s*\\(`), new RegExp(`(^|\\n)(const|let|var)\\s+([^\\n]*?[,\\s])?${name}\\s*=`)];
  for (const re of res) { const m = re.exec(JS); if (!m) continue; const ini = m.index + (m[1] ? 1 : 0); TOP.lastIndex = ini + 1; const n = TOP.exec(JS); return { ini, txt: JS.slice(ini, n ? n.index : JS.length) }; }
  return null;
}
// todos los nombres declarados en el nivel superior de la página (funciones y constantes)
const DECL = new Set([...JS.matchAll(/(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).concat([...JS.matchAll(/(?:^|\n)(?:const|let|var)\s+([^\n]*)/g)].flatMap((m) => [...m[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g)].map((z) => z[1]))));
// cierre de dependencias: las piezas pedidas y todo lo que usan (salvo lo que se sustituye desde fuera)
const DEL_LAB = /^(lab[A-Z]\w*|LAB[A-Z0-9_]*|SECU\w*|btmVerd|annual\w*|dayN|dayS|T0|P|tramosTxt|esc)$/;   // solo piezas del laboratorio (no la interfaz)
export function cierre(nombres, fuera = []) { const out = new Set(nombres), cola = [...nombres], F = new Set(fuera);
  while (cola.length) { const n = cola.pop(), d = declaracion(n); if (!d) continue; for (const m of d.txt.matchAll(/[A-Za-z_$][\w$]*/g)) { const t = m[0]; if (DEL_LAB.test(t) && DECL.has(t) && !out.has(t) && !F.has(t)) { out.add(t); cola.push(t); } } }
  return [...out]; }
export function crea(nombres, extra = {}) {
  const ctx = vm.createContext({ console, ...extra }), por = new Map();
  for (const n of nombres) { const d = declaracion(n); if (!d) throw new Error("no encuentro en index.html: " + n); por.set(d.ini, d.txt); }
  // en el MISMO orden que en index.html (las constantes dependen unas de otras); todo en un solo script y se exporta lo necesario
  const trozos = [...por.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  vm.runInContext(trozos.join("\n") + `\n;globalThis.__X={${nombres.join(",")}};`, ctx);
  ctx.__Math = vm.runInContext("Math", ctx);   // para fijar la semilla del azar del laboratorio
  return ctx;
}
