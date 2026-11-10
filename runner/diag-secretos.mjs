// Dice qué secretos están puestos en el repositorio (nunca su valor)
for (const n of (process.env.NOMBRES || "").split(" ").filter(Boolean)) console.log("secreto", n.padEnd(16), process.env[n] ? "✔ puesto" : "· vacío");
// Gemini: forma de la clave y si Google la acepta (solo el código HTTP)
{ const g0 = process.env.GEMINI_KEY || "", g = g0.trim(); if (g) { const raro = [...g].filter((c) => !/[A-Za-z0-9_-]/.test(c));
  console.log(`GEMINI_KEY: ${g.length} caracteres${g !== g0 ? " (tenía espacios al principio o al final)" : ""}${raro.length ? " · " + raro.length + " carácter(es) raros" : " · solo letras, números, - y _"}`);
  try { const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=5", { headers: { "x-goog-api-key": g.replace(/\s+/g, "") }, signal: AbortSignal.timeout(20000) }); console.log("GEMINI_KEY → Google responde HTTP " + r.status); } catch (e) { console.log("GEMINI_KEY → sin respuesta"); } } }
