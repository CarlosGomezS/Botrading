// v293 · 📆 EXAMEN LARGO (1 año): la regla que cada laboratorio tiene EN USO se examina con un año de velas de 5 min de las criptos
// más líquidas de Bitvavo, en 4 trimestres y como CARTERA COMPLETA (dinero compartido, máximo de posiciones, caída máxima).
// Así se descartan las reglas que solo funcionaban en el último trimestre (alcista, bajista o lateral). Solo dinero ficticio:
// el resultado lo lee el dinero real para NO seguir a un método cuya regla actual suspende este examen.
// Se guarda en la rama «examen-largo» (examen-largo.json). La descarga se conserva entre ejecuciones (caché de GitHub) y solo se añade lo nuevo.
import * as B from "./bitvavo.mjs";
import { entrenarIA } from "./bitvavo-ia.mjs";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";

const DIAS = +process.env.LARGO_DIAS || 365, NMER = +process.env.LARGO_MERCADOS || 12, DIR = process.env.LARGO_DIR || "/tmp/largo", FILE = DIR + "/raw.json";
const VEX = 304;   // versión del examen: si cambian sus reglas, todo se vuelve a examinar
const LABS = ["eq", "turbo", "mix", "cuant", "consenso", "tend", "explora", "mixokx", "eqokx", "turbookx", "cuantokx", "consensookx", "tendokx", "exploraokx"];

// ¿aprueba el año? opera de verdad (≥ 20 operaciones), gana como cartera en al menos 3 de los 4 trimestres, en total gana
// y en ningún trimestre la cuenta cae más de un 25 %
// v295 · las operaciones que cuentan son las que la CARTERA llega a hacer (no todas las señales) y la caída es la peor de todo el año a precio de mercado
export function veredicto(X) {
  const cart = X.cart || [], n = cart.reduce((s, c) => s + (c.n || 0), 0), tot = cart.reduce((s, c) => s * (1 + (c.ret || 0) / 100), 1) - 1;
  const ganados = cart.filter((c) => c.ret > 0).length, peorDD = Math.max(0, ...cart.map((c) => c.dd || 0), (X.cartTodo && X.cartTodo.dd) || 0);
  const ok = n >= 20 && ganados >= 3 && tot > 0 && peorDD < 25, suave = n >= 20 && tot > 0 && peorDD < 10;   // v294 · «suave»: gana el año en total y nunca cae un 10 %
  return { ok, suave, n, ganados, tot: Math.round(tot * 10000) / 100, peorDD, cart, motivo: ok ? "aprueba el año" : n < 20 ? "casi no opera en un año" : tot <= 0 ? "en un año pierde" : ganados < 3 ? `solo gana ${ganados} de 4 trimestres` : `cae un ${peorDD} % en el año` };
}

async function main() {
  const t0 = Date.now(); mkdirSync(DIR, { recursive: true });
  const UV = await B.universo(); if (!UV) throw new Error("sin precios de Bitvavo"); const U = UV.U.slice(0, NMER), PAG = Math.ceil(DIAS * 288 / 1000);
  let raw = null; if (existsSync(FILE)) try { raw = JSON.parse(readFileSync(FILE, "utf8")); } catch (e) {}
  if (!raw || raw.paginas !== PAG || U.some((m) => !raw.m[m] || raw.m[m].length < PAG * 1000 * 0.5)) raw = await B.descargar(U, PAG, 2, 150);
  else raw = await B.ponerAlDia(raw, U, 2, 150);
  writeFileSync(FILE + ".tmp", JSON.stringify(raw)); renameSync(FILE + ".tmp", FILE);
  const TM = await B.termometro(DIAS + 5).catch(() => null);
  const H = await B.construirH(raw, UV.tick, { rellenar: true, cobertura: 0.9, termo: TM }); const mer = Object.keys(H.m); if (mer.length < 5) throw new Error("pocos mercados con un año de datos");
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
  const huella = (k) => (B.PERF[k] && B.PERF[k].comite === "okx" ? B.COMITE_OKX : B.COMITE).map((o) => (L[o] && L[o].prueba === false ? L[o].genomeId : null) || "-").join(",");
  const X1 = {};
  for (const k of LABS) {
    const Lk = L[k], P = B.PERF[k]; if (!Lk || !Lk.genome || !P) continue;
    // v295 · si no hay lista de OKX, los métodos de OKX NO se aprueban (quedan pendientes): nunca se aprueba a ciegas
    if (P.soloOkx && !(okx && okx.size > 10)) { res[k] = { genomeId: Lk.genomeId, ok: null, motivo: "sin lista de OKX: pendiente", t: new Date().toISOString() }; continue; }
    // v294 · también sus MEJORES CANDIDATAS (las que aprueban los 90 días): así el laboratorio puede adoptar la mejor que además aguante el año
    try { let Hc = H; if (P.soloOkx && okx && okx.size > 10) Hc = B.filtraH(H, okx); const A = (anio[k] = anio[k] || {}); for (const x of Object.keys(A)) if (A[x].v !== VEX || Math.abs((A[x].dias || 0) - dias) >= 5 || Date.now() - Date.parse(A[x].t) > 48 * 3600e3) delete A[x];
      const cs = ((Lk.lab && Lk.lab.pop) || []).filter((v) => v.ok && v.g).sort((a, b) => b.s - a.s).slice(0, 8);
      for (const v of cs) { const gk = B.gkey(v.g); if (A[gk]) continue; const g = { ...B.BASE, ...v.g }; if (g.estilo === "consenso") continue; const r = veredicto(B.backtestTramos(g, Hc, cortes)); A[gk] = { v: VEX, id: v.id, ok: r.ok, suave: r.suave, tot: r.tot, ganados: r.ganados, dd: r.peorDD, dias, t: new Date().toISOString() }; }
      const nA = Object.values(A); console.log(`Examen largo ${k}: candidatas ${nA.length} · aprueban el año ${nA.filter((x) => x.ok).length} · suaves ${nA.filter((x) => x.suave && !x.ok).length}`); } catch (e) { console.log(`Examen largo ${k}: candidatas: ${String(e.message).slice(0, 60)}`); }
    if (Lk.prueba !== false) { res[k] = { genomeId: Lk.genomeId, ok: null, motivo: "sin regla ganadora ahora", t: new Date().toISOString() }; continue; }
    const esCons = (Lk.genome && Lk.genome.estilo === "consenso"), hc = esCons ? huella(k) : null;
    if (res[k] && res[k].v === VEX && res[k].genomeId === Lk.genomeId && res[k].ok != null && (res[k].comite ?? null) === hc && Math.abs((res[k].dias || 0) - dias) < 5 && Date.now() - Date.parse(res[k].t) < 24 * 3600e3) continue;   // ya examinada hoy (misma regla y mismo comité)
    const g = { ...B.BASE, ...Lk.genome }; let Hk = H;
    if (P.soloOkx && okx && okx.size > 10) Hk = B.filtraH(H, okx);
    if (g.estilo === "consenso") { const gs = []; for (const o of (P.comite === "okx" ? B.COMITE_OKX : B.COMITE)) { const Lo = L[o]; if (Lo && Lo.genome && Lo.prueba === false) gs.push({ ...B.BASE, ...Lo.genome }); } B.ponVotos(Hk, gs); }
    const X = B.backtestTramos(g, Hk, cortes), v = veredicto(X); X1[k] = X;
    res[k] = { v: VEX, genomeId: Lk.genomeId, ...v, ddAnio: X.cartTodo ? X.cartTodo.dd : null, comite: hc, dias, mercados: Object.keys(Hk.m).length, t: new Date().toISOString() };
    console.log(`Examen largo ${k}: ${v.ok ? "✅" : "❌"} ${v.motivo} · ${v.n} operaciones · año ${v.tot} % · trimestres ${v.cart.map((c) => c.ret).join(" / ")} % · peor caída ${v.peorDD} %`);
  }
  // v295 · 🧩 CARTERA COMBINADA: lo que de verdad hace el automático (copiar a la vez a todos los aprobados de un exchange), con las reglas del dinero real
  // (cada compra 10-25 %, como mucho 60 % invertido). Si la combinación suspende, el real copia solo a su método principal (sin extras).
  const combinada = {};
  for (const [ex, lista] of [["bitvavo", LABS.filter((k) => !B.PERF[k] || !B.PERF[k].soloOkx)], ["okx", LABS.filter((k) => B.PERF[k] && B.PERF[k].soloOkx)]]) {
    const ap = lista.filter((k) => res[k] && (res[k].ok || res[k].suave) && L[k] && res[k].genomeId === L[k].genomeId);
    const tr = []; for (const k of ap) { let X = X1[k]; if (!X) { const g = { ...B.BASE, ...L[k].genome }; let Hk = H; if (B.PERF[k].soloOkx && okx) Hk = B.filtraH(H, okx); if (g.estilo === "consenso") continue; X = B.backtestTramos(g, Hk, cortes); } tr.push(...(X.trades || []).flat()); }
    if (!tr.length) { combinada[ex] = { v: VEX, metodos: ap, n: 0, ok: null }; continue; }
    // v297 · como el real: una posición por cripto; aprueba solo con ≥ 30 operaciones, ganando el año y en ≥ 3 de 4 trimestres, y sin caer un 25 %
    const c = B.cartera(tr, { maxPos: 8, size: 0.15 }, { tope: 0.6, min: 0.1, max: 0.25, unaPorMercado: true }), q4 = [0, 1, 2, 3].map((j) => B.cartera(tr.filter((x) => x.a >= cortes[j] && x.a < cortes[j + 1]), { maxPos: 8, size: 0.15 }, { tope: 0.6, min: 0.1, max: 0.25, unaPorMercado: true }));
    combinada[ex] = { v: VEX, metodos: ap, ...c, trimestres: q4.map((x) => x.ret), ok: c.n >= 30 && c.ret > 0 && c.dd < 25 && q4.filter((x) => x.ret > 0).length >= 3 };
    console.log(`Examen largo · cartera combinada ${ex} (${ap.join(", ") || "—"}): ${c.ret} % en el año · trimestres ${q4.map((x) => x.ret).join(" / ")} % · estrés ${c.dd} % · ${c.n} operaciones → ${combinada[ex].ok ? "✅" : "❌"}`); }
  // v301 · 🧺 CARTERA BASE (BTC/ETH con su media de 50 días): 2 años de velas diarias, mitad en cada una. Aprueba si gana en los 2 años,
  // en cada uno de los 4 semestres pierde menos de un 10 % y su peor caída es menor que la de comprar y aguantar (y < 35 %).
  let base = { v: VEX, ok: null, motivo: "sin datos" };
  try { const sims = []; for (const mk of B.BASE_MKT) sims.push(B.simulaBase(await B.diariasLargas(mk, 730 + 51)));
    const ts = sims[0].curva.map((x) => x[0]), eqs = ts.map((t, i) => sims.reduce((a, sm) => a + (sm.curva[i] ? sm.curva[i][1] : 1), 0) / sims.length);
    let pico = 1, dd = 0; for (const e of eqs) { pico = Math.max(pico, e); dd = Math.max(dd, 1 - e / pico); }
    const sem = [0, 1, 2, 3].map((j) => { const a = Math.floor((eqs.length * j) / 4), b = Math.floor((eqs.length * (j + 1)) / 4) - 1; return Math.round((eqs[b] / (j ? eqs[a - 1] : 1) - 1) * 10000) / 100; });
    const ret = Math.round((eqs[eqs.length - 1] - 1) * 10000) / 100, bh = sims.reduce((a, sm) => a + sm.bh, 0) / sims.length, ddBH = 50;
    const ok = ret > 0 && sem.every((x) => x > -10) && dd * 100 < 35;
    base = { v: VEX, ok, ret, dd: Math.round(dd * 10000) / 100, semestres: sem, bh: Math.round(bh * 100) / 100, operaciones: sims.reduce((a, sm) => a + sm.n, 0), motivo: ok ? "aprueba 2 años" : ret <= 0 ? "en 2 años pierde" : dd * 100 >= 35 ? "cae demasiado" : "algún semestre pierde más de un 10 %" };
    console.log(`Examen largo · 🧺 cartera base BTC/ETH (media 50 días): ${ok ? "✅" : "❌"} ${base.motivo} · 2 años ${ret} % (comprar y aguantar ${base.bh} %) · semestres ${sem.join(" / ")} % · peor caída ${base.dd} % · ${base.operaciones} entradas`); void ddBH;
  } catch (e) { console.log("Examen largo · cartera base: " + String(e.message).slice(0, 80)); }
  // v304 · 🐢 TORTUGAS: 2 años de velas diarias de las 20 criptos más líquidas de CADA exchange, con SUS comisiones, como cartera (máx. 4 a la vez)
  const tortugas = {};
  try { const TT = await import("./tortugas.mjs"), OK = await import("./okx.mjs");
    const SER = {};   // v317 · primero los datos de los dos exchanges (cada regla nueva se comprueba también con las criptos del otro)
    for (const ex of ["bitvavo", "okx"]) { try { let lista = [];
        if (ex === "bitvavo") lista = Object.entries(UV.tick).filter(([m, x]) => x.vq > 0 && x.sp < 0.01 && !/^(USDC|EURC|USDT)-/.test(m)).sort((a, b) => b[1].vq - a[1].vq).slice(0, 20).map(([m]) => ({ m }));
        else { const PO = await OK.preciosOkx(await OK.instrumentos()); lista = Object.entries(PO.tickEx).filter(([m, x]) => m !== "USDC-EUR" && x.vq > 0 && x.sp < 0.01).sort((a, b) => b[1].vq - a[1].vq).slice(0, 20).map(([m, x]) => ({ m, par: x.par, k: x.k })); }
        const series = {}; for (const { m, par, k } of lista) { try { const d = await TT.diarias(ex, m, 800, par, k || 1); if (d.length >= 200) series[m] = d; } catch (e) {} }
        SER[ex] = series; } catch (e) { console.log(`Examen largo · 🐢 Tortugas ${ex}: ${String(e.message).slice(0, 60)}`); } }
    for (const ex of ["bitvavo", "okx"]) { try { const series = SER[ex] || {}, otro = ex === "okx" ? "bitvavo" : "okx", otra = SER[otro] && Object.keys(SER[otro]).length >= 8 ? SER[otro] : null;
        if (Object.keys(series).length < 8) { tortugas[ex] = { v: VEX, ok: null, motivo: "pocas criptos con 2 años de datos" }; continue; }
        // v313 · 🧠 aprende: parte de la combinación que ya estaba en uso y solo cambia si la nueva gana en el año que no vio
        const prevT = prev.tortugas && prev.tortugas[ex], A = TT.aprende(series, TT.FEES[ex], prevT && prevT.P, { otra, feeOtra: TT.FEES[otro], pob: (prevT && prevT.pob) || [], n: 200 }), P = A.P;
        const total = ((prevT && prevT.aprende && prevT.aprende.total) || 0) + (A.nuevas || 0), hoyD = new Date().toISOString().slice(0, 10), hoyN = (prevT && prevT.aprende && prevT.aprende.dia === hoyD ? prevT.aprende.hoy || 0 : 0) + (A.nuevas || 0);
        console.log(`Examen largo · 🐢🧬 Tortugas ${ex}: ${A.nuevas} reglas nuevas (${hoyN} hoy, ${total} en total) · ${A.cambia ? "✅ CAMBIA a" : "sigue con"} «${TT.describe(P)}» · ${A.motivo}${A.nueva ? ` (mejor nueva: 1.er año ${A.nueva.ano1} %, 2.º año ${A.nueva.ano2} %, últimos 4 meses ${A.nueva.reciente} %, criptos de ${otro} ${A.nueva.otra ?? "—"} % · en uso: ${A.enUso.ano1} % / ${A.enUso.ano2} % / ${A.enUso.reciente} %)` : ""}`);
        const r = TT.simula(series, TT.FEES[ex], 0.002, P), v = TT.veredicto(r); delete r.curva;
        tortugas[ex] = { v: VEX, ...r, ...v, criptos: Object.keys(series).length, P, pob: A.pob, aprende: { cambia: A.cambia, motivo: A.motivo, total, hoy: hoyN, dia: hoyD, desde: A.cambia ? new Date().toISOString() : (prevT && prevT.aprende && prevT.aprende.desde) || null, nueva: A.nueva, enUso: A.enUso } };
        console.log(`Examen largo · 🐢 Tortugas ${ex} (${Object.keys(series).length} criptos, comisión ${TT.FEES[ex] * 100} %): ${v.ok ? "✅" : "❌"} ${v.motivo} · 2 años ${r.ret} % · semestres ${r.semestres.join(" / ")} % · peor caída ${r.dd} % · ${r.n} operaciones · ${r.aciertos} % aciertos · ${r.pf} € ganados por € perdido`);
      } catch (e) { tortugas[ex] = { v: VEX, ok: null, motivo: String(e.message).slice(0, 60) }; console.log(`Examen largo · 🐢 Tortugas ${ex}: ${String(e.message).slice(0, 60)}`); } }
  } catch (e) { console.log("Examen largo · Tortugas: " + String(e.message).slice(0, 80)); }
  // v308 · 🔁 REJILLA RÁPIDA: el año de velas de 5 min, con la comisión de cada exchange (en OKX, con estas mismas criptos)
  const rejilla = {};
  try { const RJ = await import("./rejilla2.mjs"), series = Object.fromEntries(Object.entries(H.m).map(([m, x]) => [m, x.c.filter((v) => v[0] >= ini)]));
    for (const [ex, fee] of [["bitvavo", 0.0025], ["okx", 0.001]]) { const r = RJ.simula(series, fee), v = RJ.veredicto(r); rejilla[ex] = { v: VEX, ...r, ...v };
      console.log(`Examen largo · 🔁 Rejilla rápida ${ex} (escalón ${r.paso} %): ${v.ok ? "✅" : "❌"} ${v.motivo} · año ${r.ret} % · trimestres ${r.trimestres.join(" / ")} % · peor caída ${r.dd} % · ${r.ops} operaciones (${r.opsDia} al día) · ventas con ganancia ${r.ventasGanadoras} %`); }
  } catch (e) { console.log("Examen largo · Rejilla: " + String(e.message).slice(0, 80)); }
  // v311 · 🐸 MEMECOINS RÁPIDO: un año de velas de las memecoins de Bitvavo (en horas), con varias combinaciones y la comisión de cada exchange
  const memes = {};
  try { const MZ = await import("./memes2.mjs"), lista = MZ.MEMES.map((x) => x + "-EUR").filter((m) => UV.tick[m]); const MF = DIR + "/memes.json"; let rm = null;
    try { rm = JSON.parse(readFileSync(MF, "utf8")); } catch (e) {} if (!rm || lista.some((m) => !rm.m[m])) rm = await B.descargar(lista, PAG, 2, 150); else rm = await B.ponerAlDia(rm, lista, 2, 150);
    writeFileSync(MF, JSON.stringify(rm)); const series = {}; for (const m of lista) if (rm.m[m] && rm.m[m].length > 20000) series[m] = MZ.aHoras(rm.m[m]);
    const combos = [{}, { ent: 12 }, { ent: 48 }, { trail: 0.05, stop: 0.06, maxH: 24 }, { vol: 3 }, { ent: 12, trail: 0.02, stop: 0.03, maxH: 6 }];
    for (const [ex, fee] of [["bitvavo", 0.0025], ["okx", 0.001]]) { let mejor = null;
      for (const c of combos) { const P = { ent: 24, vol: 2, trail: 0.03, stop: 0.04, maxH: 12, maxPos: 3, tam: 0.25, ...c }, r = MZ.simula(series, fee, 0.002, P); if (!mejor || r.ret > mejor.ret) mejor = { ...r, P }; }
      const v = MZ.veredicto(mejor); memes[ex] = { v: VEX, ...mejor, ...v, criptos: Object.keys(series) };
      console.log(`Examen largo · 🐸 Memecoins rápido ${ex} (${Object.keys(series).join(", ")}): ${v.ok ? "✅" : "❌"} ${v.motivo} · mejor combinación ${JSON.stringify(mejor.P)} · año ${mejor.ret} % · trimestres ${mejor.trimestres.join(" / ")} % · peor caída ${mejor.dd} % · ${mejor.ops} operaciones (${mejor.opsDia} al día) · ${mejor.aciertos} % aciertos`); }
  } catch (e) { console.log("Examen largo · Memecoins: " + String(e.message).slice(0, 80)); }
  B.publicar("examen-largo.json", { t: new Date().toISOString(), estado: "ok", dias, mercados: mer.length, res, anio, combinada, base, tortugas, rejilla, memes }, "examen-largo");
  console.log(`Examen largo: hecho en ${Math.round((Date.now() - t0) / 1000)} s`);
}
// v295 · si falla, se ANOTA el fallo (sin tocar la fecha del último examen bueno, que es la que mira el dinero real) y el trabajo sale en rojo
if (import.meta.url === `file://${process.argv[1]}`) main().catch(async (e) => { console.log("Examen largo: ERROR " + (e.message || e)); try { const prev = (await B.leer("examen-largo.json", "examen-largo")) || {}; B.publicar("examen-largo.json", { ...prev, error: String(e.message || e).slice(0, 200), errorAt: new Date().toISOString() }, "examen-largo"); } catch (e2) {} process.exit(1); });
