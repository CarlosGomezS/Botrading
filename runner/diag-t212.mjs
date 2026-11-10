// Diagnóstico de la conexión con Trading 212: SOLO imprime códigos HTTP y longitudes (nunca las claves ni datos de la cuenta)
const k0 = process.env.T212_KEY || "", s0 = process.env.T212_SECRET || "", k = k0.trim(), s = s0.trim();
console.log(`clave: ${k ? k.length + " caracteres" : "VACÍA"}${k !== k0 ? " (tenía espacios o saltos de línea)" : ""} · secreto: ${s ? s.length + " caracteres" : "VACÍO"}${s !== s0 ? " (tenía espacios o saltos de línea)" : ""}`);
const prueba = async (nom, base, auth) => { try { const r = await fetch(base + "/equity/account/info", { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(20000) }); console.log(`${nom.padEnd(44)} → HTTP ${r.status}`); return r.status; } catch (e) { console.log(`${nom.padEnd(44)} → sin respuesta`); return 0; } };
const B = (a, b) => "Basic " + Buffer.from(a + ":" + b).toString("base64");
for (const [env, base] of [["REAL (live)", "https://live.trading212.com/api/v0"], ["PRÁCTICA (demo)", "https://demo.trading212.com/api/v0"]]) {
  await prueba(`${env} · clave + secreto`, base, B(k, s));
  await prueba(`${env} · clave y secreto CAMBIADOS de sitio`, base, B(s, k));
  await prueba(`${env} · solo la clave (formato antiguo)`, base, k);
  await new Promise((r) => setTimeout(r, 1500)); }
