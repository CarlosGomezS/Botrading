// v245 · 90 días de datos compartidos, examen en 3 tramos, termómetro del mercado y cruce de reglas entre laboratorios.
// v227 · 🚀 LABORATORIO CRIPTO DEDICADO (SOLO DINERO FICTICIO). Un proceso por submodo de «IA y laboratorio» (eq, turbo, mix) que
// trabaja SIN PARAR durante ~50 min por tramo (y luego se encadena):
//  · 30 días de velas de 5 min de los 40 mercados más líquidos de Bitvavo (se refrescan cada 30 min)
//  · la IA de predicción se reentrena con esos 30 días (validación cruzada: nunca se examina con lo que ha visto)
//  · generación tras generación, prueba reglas nuevas con los costes reales y exige ganar en las DOS mitades (15 días cada una)
//  · lee las operaciones reales de su cuenta para vetar reglas que pierden en vivo aunque en el pasado ganaran
// El bot de cada minuto recoge cada 3 min lo que este laboratorio ha demostrado (rama bitvavo-lab-<submodo>).
import * as B from "./bitvavo.mjs";
import { entrenarIA } from "./bitvavo-ia.mjs";
import * as REJ from "./rejilla.mjs";

const k = process.argv[2] || "eq", MIN = +process.argv[3] || 50, PAG = +process.env.LAB_PAG || 26, P = B.PERF[k];   // v245 · 26 páginas de 1.000 velas de 5 min ≈ 90 días
import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
const CACHE = (process.env.LAB_CACHE || "/tmp") + "/bv-raw.json", OTROS = ["eq", "turbo", "mix", "tend", "mixokx", "eqokx", "turbookx", "tendokx", "explora", "exploraokx"].filter((x) => x !== k);   // (el cuantitativo es fijo: ni presta ni recibe reglas)
const RAMA = "bitvavo-lab-" + k, FILE = "lab-" + k + ".json", sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!P) { console.log("Laboratorio: submodo desconocido " + k); process.exit(0); }

async function main() {
  const t0 = Date.now();
  await sleep(+process.env.LAB_SIN_ESPERA ? 0 : { eq: 0, turbo: 20e3, mix: 40e3, cuant: 60e3, consenso: 80e3, tend: 100e3, mixokx: 0, eqokx: 20e3, turbookx: 40e3, cuantokx: 60e3, consensookx: 80e3, tendokx: 100e3, explora: 120e3, exploraokx: 120e3, riesgo: 140e3, riesgookx: 140e3 }[k] || 0);
  let St = null; try { St = await B.leer(FILE, RAMA); } catch (e) {}
  if (!St || !St.lab) St = { lab: { gen: 0, lastGen: null, pop: [], log: [], adopt: [] }, genome: { ...P.base }, genomeId: "base", prueba: true };
  St.info = St.info || { reglas: 0 };
  let okxRaw = null, H = null, Hat = 0, ia = null, iaM = null, rej = null, vivoAt = 0, rondas = 0, raw = null, TM = null, fueraAt = 0, comiteAt = 0, comiteK = "";
  while (Date.now() - t0 < MIN * 60e3) {
    // v245 · datos: UNA descarga de 90 días compartida por los 4 laboratorios (la hace «eq», despacio para no pasarse del límite de Bitvavo);
    // luego cada uno solo pide lo nuevo cada 30 min. Se aceptan criptos con ≥ 70 % de las velas (los huecos se rellenan con velas planas).
    if (!H || Date.now() - Hat > 30 * 60e3) {
      try {
        const ti = Date.now(); let UV = null, U = [];
        if (P.soloOkx) {   // v288 · 🟦 los laboratorios de OKX aprenden con el historial DE OKX (todas sus criptos), no con el de Bitvavo
          const OK = await import("./okx.mjs"), FH = (process.env.LAB_CACHE || "/tmp") + "/okxh/hist.json", I = await OK.instrumentos();
          if (k === (process.env.LAB_BAJA || "mixokx") && !globalThis.__okxH) globalThis.__okxH = OK.mantenerHistoria(FH, I, { hasta: t0 + MIN * 60e3 - 90e3, log: (x) => console.log(x) }).catch((e) => console.log("OKX historial: " + String(e.message).slice(0, 60)));
          for (let w = 0; w < 90; w++) { if (existsSync(FH)) { try { const st0 = JSON.parse(readFileSync(FH, "utf8")); if (Object.values(st0.m || {}).filter((x) => x.c && x.c.length >= 600).length >= 10) break; } catch (e) {} } await sleep(10e3); }
          let rO = null; try { const st = JSON.parse(readFileSync(FH, "utf8")), PO = await OK.preciosOkx(I); rO = OK.rawDeHistoria(st, PO); rO.tick = PO.tick; } catch (e) {}
          // hasta tener ≥ 30 días de OKX, examina con los 90 días de Bitvavo (solo las criptos que están en OKX): examinar con pocos días engaña
          if (rO && rO.paginas >= 8.64 && Object.keys(rO.m).length >= 10) { okxRaw = rO; UV = { tick: rO.tick }; St.info.fuente = `OKX (${Math.round(rO.paginas * 1000 / 288)} días)`; }
          else { okxRaw = null; St.info.fuente = `Bitvavo (OKX lleva ${rO ? Math.round(rO.paginas * 1000 / 288) : 0} de 30 días)`; }
          St.info.okx = rO ? Object.keys(rO.tick).length : St.info.okx;
        }
        if (!okxRaw) { UV = await B.universo(); if (!UV) throw new Error("sin precios"); U = UV.U.slice(0, B.HIST_MKT); }
        if (okxRaw) {} else if (!raw) {
          const fresco = () => existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < 45 * 60e3;
          const BAJA = process.env.LAB_BAJA || "eq";   // v266 · en cada máquina descarga uno y los demás lo esperan
          if (k !== BAJA) for (let w = 0; w < 80 && !fresco(); w++) await sleep(10e3);   // espera a la descarga compartida (hasta ~13 min)
          if (fresco()) { try { raw = JSON.parse(readFileSync(CACHE, "utf8")); } catch (e) { raw = null; } }
          if (!raw || raw.paginas !== PAG) { raw = await B.descargar(U, PAG, 3, k === BAJA ? 120 : 600); if (k === BAJA) { writeFileSync(CACHE + ".tmp", JSON.stringify(raw)); renameSync(CACHE + ".tmp", CACHE); } }
          raw = await B.ponerAlDia(raw, U, 2, 150);
        } else raw = await B.ponerAlDia(raw, U, 2, 150);
        if (!TM || Date.now() - TM.t > 6 * 3600e3) { const T2 = await B.termometro(92); if (T2.fg || T2.fund) TM = T2; }
        const H2 = await B.construirH(okxRaw || raw, UV.tick, { rellenar: true, cobertura: 0.7, termo: TM });
        if (Object.keys(H2.m).length >= 10) {
          if (P.soloOkx && !okxRaw) { const OK = await import("./okx.mjs"), set = B.okxSet(await OK.instrumentos()); if (set.size < 10) throw new Error("sin lista de OKX"); const Hf = B.filtraH(H2, set); Object.keys(H2.m).forEach((m) => { if (!Hf.m[m]) delete H2.m[m]; }); }
          H = H2; Hat = Date.now();
          if (P.ests && P.ests[0] === "consenso") { comiteAt = 0; comiteK = ""; }   // votos con los datos nuevos
          const IA = P.fijoTotal ? { listo: false } : entrenarIA(H); iaM = IA.listo ? IA.modelo : null; delete IA.modelo; ia = { ...IA, dias: Math.round((okxRaw ? okxRaw.paginas : PAG) * 1000 * 300 / 86400) };
          /* v271 · rejilla quitada */
          const dias = Math.round(Math.max(...Object.values(H.m).map((x) => (x.c[x.c.length - 1][0] - x.c[0][0]) / 86400e3)));
          St.info.dias = dias; St.info.mercados = Object.keys(H.m).length; St.info.termo = { fg: !!(TM && TM.fg), fund: !!(TM && TM.fund) };
          console.log(`Laboratorio ${k}: ${St.info.fuente ? "datos de " + St.info.fuente + " · " : ""}${Object.keys(H.m).length} mercados · ${dias} días · IA ${ia.auc} · termómetro ${TM && TM.fg ? "miedo/codicia ✔" : "miedo/codicia ✖"} ${TM && TM.fund ? "financiación ✔" : "financiación ✖"} · ${Math.round((Date.now() - ti) / 1000)} s`);
        }
      } catch (e) { console.log(`Laboratorio ${k}: datos: ${String(e.message).slice(0, 80)}`); if (!H) { await sleep(60e3); continue; } }
    }
    // v257 · 🧬 consenso: cada 10 min lee las reglas en uso del comité y recalcula los votos de cada vela (si han cambiado, se reexamina todo)
    if (P.estiloConsenso !== false && P.ests && P.ests[0] === "consenso" && H && Date.now() - comiteAt > 10 * 60e3) { comiteAt = Date.now(); try { const gs = []; for (const o of (P.comite === "okx" ? B.COMITE_OKX : B.COMITE)) { const Lo = await B.leer(`lab-${o}.json`, `bitvavo-lab-${o}`); if (Lo && Lo.genome && Lo.prueba === false) gs.push({ ...B.BASE, ...Lo.genome }); }
      const kk = JSON.stringify(gs); if (gs.length && kk !== comiteK) { comiteK = kk; B.ponVotos(H, gs); St.info.comite = gs.length; console.log(`Laboratorio consenso: comité de ${gs.length} reglas`); } } catch (e) { console.log("Laboratorio consenso: comité: " + String(e.message).slice(0, 60)); } }
    if (P.ests && P.ests[0] === "consenso" && !comiteK) { await sleep(30e3); continue; }
    // v245 · 🧬 cada 10 min trae las mejores reglas de los otros laboratorios para probarlas y cruzarlas con las suyas
    let fuera = [];
    if (Date.now() - fueraAt > 10 * 60e3) { fueraAt = Date.now(); for (const o of OTROS) try { const Lo = await B.leer(`lab-${o}.json`, `bitvavo-lab-${o}`); if (!Lo || !Lo.lab) continue;
      for (const v of Lo.lab.pop.filter((v) => v.g && v.s > -99).sort((a, b) => (b.ok - a.ok) || b.s - a.s).slice(0, 6)) fuera.push({ g: v.g, de: B.PERF[o].nombre + " (" + v.id + ")" }); } catch (e) {} }
    // resultados reales de su cuenta (cada 5 min) para el veto en vivo
    if (Date.now() - vivoAt > 5 * 60e3) { try { const S0 = await B.leerEstado(); const C = k === "eq" ? S0 : S0 && S0.sub && S0.sub[k]; St.closed = (C && C.closed) || []; vivoAt = Date.now(); } catch (e) {} }
    // v251 · método fijo (el cuantitativo): no se cambia; solo se examina con los 90 días (tres tramos) cada vez que llegan datos nuevos
    if (P.fijoTotal) {
      if (St.examAt !== Hat) { St.examAt = Hat; const r = P.robusta(P.base, H), now = new Date(); St.lab.gen++; St.lab.lastGen = now.toISOString();
        St.lab.pop = [{ id: "cuant", g: { ...P.base }, born: now.toISOString(), why: "tu método (fijo)", s: r.s, ok: !!r.ok, a: r.a || null, b: r.b || null, c: r.c || null }];
        const era = St.prueba; St.genome = { ...P.base }; St.genomeId = "cuant"; St.prueba = !r.ok; St.info.ultimas = 1; St.info.reglas = (St.info.reglas || 0) + 1; St.info.t = now.toISOString();
        const tx = [r.a, r.b, r.c].map((x, i) => `tramo ${i + 1}: ${x && x.n ? `${x.med} % en ${x.n} ops` : "sin operaciones"}`).join(" · ");
        // v252 · cada pilar por separado (para ver qué parte del método funciona y cuál no)
        St.info.pilares = {}; for (const pl of ["A", "B", "C"]) { const q = P.robusta({ ...P.base, pil: pl }, H); St.info.pilares[pl] = { ok: !!q.ok, t: [q.a, q.b, q.c].map((x) => (x && x.n ? { n: x.n, med: x.med, win: x.win, pf: x.pf } : null)) }; }
        if (era !== St.prueba || !St.lab.log.length) { St.lab.log.unshift({ t: now.toISOString(), txt: (r.ok ? "🏆 tu método gana en los tres tramos de 90 días: " : "📐 examen de 90 días (aún no gana en los tres tramos; en ficticio sigue operando): ") + tx }); St.lab.log = St.lab.log.slice(0, 120); }
        B.publicar(FILE, { t: now.toISOString(), k, lab: St.lab, genome: St.genome, genomeId: St.genomeId, prueba: St.prueba, info: St.info }, RAMA);
        console.log(`Laboratorio ${k}: examen · ${tx} · ${r.ok ? "🏆" : "sin 🏆"}`); }
      else { B.publicar(FILE, { t: new Date().toISOString(), k, lab: St.lab, genome: St.genome, genomeId: St.genomeId, prueba: St.prueba, info: St.info }, RAMA); }
      rondas++; await sleep(60e3); continue;
    }
    // una generación (~1 min de búsqueda)
    const now = new Date(), e = B.evolucionar(St, H, now, Math.random, 55e3, P, fuera); rondas++; St.info.reglas = (St.info.reglas || 0) + e.probadas;
    St.info.ultimas = e.probadas; St.info.t = now.toISOString();
    for (const v of St.lab.pop) if (v.c && v.c.n == null) delete v.c;   // v246 · «c» ahora es el tercer tramo del examen (no se borra)
    const out = { t: now.toISOString(), k, lab: St.lab, genome: St.genome, genomeId: St.genomeId, prueba: St.prueba, info: St.info };
    if (k === "eq") Object.assign(out, { ia, iaM, rej });
    B.publicar(FILE, out, RAMA);
    const best = St.lab.pop.slice().sort((a, b) => b.s - a.s)[0];
    console.log(`Laboratorio ${k}: gen ${St.lab.gen} · ${e.probadas} reglas (${St.info.reglas} en total) · mejor ${best ? best.id + " " + best.s + (best.ok ? " 🏆" : "") : "—"} · ${St.prueba ? "sin ventaja" : "GANADORA " + St.genomeId}`);
  }
  delete St.closed;
  console.log(`Laboratorio ${k}: fin del tramo · ${rondas} generaciones`);
}
main().catch((e) => { console.log("Laboratorio: " + (e.message || e)); process.exit(0); });
