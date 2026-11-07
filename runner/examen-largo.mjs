// v293 · 📆 EXAMEN LARGO (1 año): la regla que cada laboratorio tiene EN USO se examina con un año de velas de 5 min de las criptos
// más líquidas de Bitvavo, en 4 trimestres y como CARTERA COMPLETA (dinero compartido, máximo de posiciones, caída máxima).
// Así se descartan las reglas que solo funcionaban en el último trimestre (alcista, bajista o lateral). Solo dinero ficticio:
// el resultado lo lee el dinero real para NO seguir a un método cuya regla actual suspende este examen.
// Se guarda en la rama «examen-largo» (examen-largo.json). La descarga se conserva entre ejecuciones (caché de GitHub) y solo se añade lo nuevo.
import * as B from "./bitvavo.mjs";
import { entrenarIA } from "./bitvavo-ia.mjs";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";

const DIAS = +process.env.LARGO_DIAS || 365, NMER = +process.env.LARGO_MERCADOS || 12, DIR = process.env.LARGO_DIR || "/tmp/largo", FILE = DIR + "/raw.json";
const LABS = ["eq", "turbo", "mix", "cuant", "consenso", "tend", "explora", "mixokx", "eqokx", "turbookx", "cuantokx", "consensookx", "tendokx", "exploraokx"];

// ¿aprueba el año? opera de verdad (≥ 20 operaciones), gana como cartera en al menos 3 de los 4 trimestres, en total gana
// y en ningún trimestre la cuenta cae más de un 25 %
export function veredicto(X) {
  const cart = X.cart || [], n = X.reduce((s, x) => s + (x.n || 0), 0), tot = cart.reduce((s, c) => s * (1 + (c.ret || 0) / 100), 1) - 1;
  const ganados = cart.filter((c) => c.ret > 0).length, peorDD = Math.max(0, ...cart.map((c) => c.dd || 0));
  const ok = n >= 20 && ganados >= 3 && tot > 0 && peorDD < 25, suave = n >= 20 && tot > 0 && peorDD < 10;   // v294 · «suave»: gana el año en total y nunca cae un 10 %
  return { ok, suave, n, ganados, tot: Math.round(tot * 10000) / 100, peorDD, cart, motivo: ok ? "aprueba el año" : n < 20 ? "casi no opera en un año" : tot <= 0 ? "en un año pierde" : ganados < 3 ? `solo gana ${ganados} de 4 trimestres` : `cae un ${peorDD} % en un trimestre` };
}

async function main() {
  const t0 = Date.now(); mkdirSync(DIR, { recursive: true });
  const UV = await B.universo(); if (!UV) throw new Error("sin precios de Bitvavo"); const U = UV.U.slice(0, NMER), PAG = Math.ceil(DIAS * 288 / 1000);
  let raw = null; if (existsSync(FILE)) try { raw = JSON.parse(readFileSync(FILE, "utf8")); } catch (e) {}
  if (!raw || raw.paginas !== PAG || U.some((m) => !raw.m[m] || raw.m[m].length < PAG * 1000 * 0.5)) raw = await B.descargar(U, PAG, 2, 150);
  else raw = await B.ponerAlDia(raw, U, 2, 150);
  writeFileSync(FILE + ".tmp", JSON.stringify(raw)); renameSync(FILE + ".tmp", FILE);
  const TM = await B.termometro(DIAS + 5).catch(() => null);
  const H = await B.construirH(raw, UV.tick, { rellenar: true, cobertura: 0.7, termo: TM }); const mer = Object.keys(H.m); if (mer.length < 5) throw new Error("pocos mercados con un año de datos");
  try { entrenarIA(H); } catch (e) { console.log("Examen largo: IA: " + e.message); }   // predicciones sin futuro (por trozos de tiempo)
  // el periodo común: se quitan las criptos que empiezan tarde (recién listadas) o acaban antes, en vez de recortar el año entero por una sola
  const fin0 = Math.max(...Object.values(H.m).map((m) => m.c[m.c.length - 1][0])), objetivo = fin0 - (DIAS - 3) * 86400e3;
  for (const [m, x] of Object.entries(H.m)) { const a0 = x.c[48][0], b0 = x.c[x.c.length - 1][0]; if (a0 > objetivo || b0 < fin0 - 86400e3) { console.log(`Examen largo: fuera ${m} (${Math.round((b0 - a0) / 86400e3)} días)`); delete H.m[m]; } }
  if (Object.keys(H.m).length < 5) throw new Error("pocos mercados con un año completo");
  const ini = Math.max(...Object.values(H.m).map((m) => m.c[48][0])), fin = Math.min(...Object.values(H.m).map((m) => m.c[m.c.length - 1][0])) + 1;
  const cortes = [0, 1, 2, 3, 4].map((j) => ini + ((fin - ini) * j) / 4);
  const dias = Math.round((fin - ini) / 86400e3); console.log(`Examen largo: ${mer.length} mercados · ${dias} días · ${Math.round((Date.now() - t0) / 1000)} s de datos`);
  const L = {}; for (const k of LABS) try { L[k] = await B.leer(`lab-${k}.json`, `bitvavo-lab-${k}`); } catch (e) {}
  const okx = await import("./okx.mjs").then((OK) => OK.instrumentos()).then(B.okxSet).catch(() => null);
  const prev = (await B.leer("examen-largo.json", "examen-largo").catch(() => null)) || {}, res = { ...(prev.res || {}) };
  const anio = { ...(prev.anio || {}) };
  for (const k of LABS) {
    const Lk = L[k], P = B.PERF[k]; if (!Lk || !Lk.genome || !P) continue;
    // v294 · también sus MEJORES CANDIDATAS (las que aprueban los 90 días): así el laboratorio puede adoptar la mejor que además aguante el año
    try { let Hc = H; if (P.soloOkx && okx && okx.size > 10) Hc = B.filtraH(H, okx); const A = (anio[k] = anio[k] || {}); for (const x of Object.keys(A)) if (Math.abs((A[x].dias || 0) - dias) >= 5 || Date.now() - Date.parse(A[x].t) > 48 * 3600e3) delete A[x];
      const cs = ((Lk.lab && Lk.lab.pop) || []).filter((v) => v.ok && v.g).sort((a, b) => b.s - a.s).slice(0, 8);
      for (const v of cs) { const gk = B.gkey(v.g); if (A[gk]) continue; const g = { ...B.BASE, ...v.g }; if (g.estilo === "consenso") continue; const r = veredicto(B.backtestTramos(g, Hc, cortes)); A[gk] = { id: v.id, ok: r.ok, suave: r.suave, tot: r.tot, ganados: r.ganados, dd: r.peorDD, dias, t: new Date().toISOString() }; }
      const nA = Object.values(A); console.log(`Examen largo ${k}: candidatas ${nA.length} · aprueban el año ${nA.filter((x) => x.ok).length} · suaves ${nA.filter((x) => x.suave && !x.ok).length}`); } catch (e) { console.log(`Examen largo ${k}: candidatas: ${String(e.message).slice(0, 60)}`); }
    if (Lk.prueba !== false) { res[k] = { genomeId: Lk.genomeId, ok: null, motivo: "sin regla ganadora ahora", t: new Date().toISOString() }; continue; }
    if (res[k] && res[k].genomeId === Lk.genomeId && res[k].ok != null && Math.abs((res[k].dias || 0) - dias) < 5 && Date.now() - Date.parse(res[k].t) < 24 * 3600e3) continue;   // ya examinada hoy
    const g = { ...B.BASE, ...Lk.genome }; let Hk = H;
    if (P.soloOkx && okx && okx.size > 10) Hk = B.filtraH(H, okx);
    if (g.estilo === "consenso") { const gs = []; for (const o of (P.comite === "okx" ? B.COMITE_OKX : B.COMITE)) { const Lo = L[o]; if (Lo && Lo.genome && Lo.prueba === false) gs.push({ ...B.BASE, ...Lo.genome }); } B.ponVotos(Hk, gs); }
    const X = B.backtestTramos(g, Hk, cortes), v = veredicto(X);
    res[k] = { genomeId: Lk.genomeId, ...v, dias, mercados: Object.keys(Hk.m).length, t: new Date().toISOString() };
    console.log(`Examen largo ${k}: ${v.ok ? "✅" : "❌"} ${v.motivo} · ${v.n} operaciones · año ${v.tot} % · trimestres ${v.cart.map((c) => c.ret).join(" / ")} % · peor caída ${v.peorDD} %`);
  }
  B.publicar("examen-largo.json", { t: new Date().toISOString(), dias, mercados: mer.length, res, anio }, "examen-largo");
  console.log(`Examen largo: hecho en ${Math.round((Date.now() - t0) / 1000)} s`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Examen largo: " + (e.message || e)); process.exit(0); });
