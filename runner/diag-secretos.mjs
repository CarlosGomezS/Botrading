// Dice qué secretos están puestos en el repositorio (nunca su valor)
for (const n of (process.env.NOMBRES || "").split(" ").filter(Boolean)) console.log("secreto", n.padEnd(16), process.env[n] ? "✔ puesto" : "· vacío");
// Gemini: forma de la clave y si Google la acepta (solo el código HTTP)
{ const g0 = process.env.GEMINI_KEY || "", g = g0.trim(); if (g) { const raro = [...g].filter((c) => !/[A-Za-z0-9_-]/.test(c));
  console.log(`GEMINI_KEY: ${g.length} caracteres${g !== g0 ? " (tenía espacios al principio o al final)" : ""}${raro.length ? " · " + raro.length + " carácter(es) raros" : " · solo letras, números, - y _"}`);
  try { const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=5", { headers: { "x-goog-api-key": g.replace(/\s+/g, "") }, signal: AbortSignal.timeout(20000) }); console.log("GEMINI_KEY → Google responde HTTP " + r.status); } catch (e) { console.log("GEMINI_KEY → sin respuesta"); } } }
// Groq y OpenRouter: ¿aceptan la clave? (solo el código HTTP)
for (const [n, u] of [["GROQ_KEY", "https://api.groq.com/openai/v1/models"], ["OPENROUTER_KEY", "https://openrouter.ai/api/v1/key"]]) { const k = (process.env[n] || "").replace(/\s+/g, ""); if (!k) continue;
  try { const r = await fetch(u, { headers: { Authorization: "Bearer " + k }, signal: AbortSignal.timeout(20000) }); console.log(`${n} → responde HTTP ${r.status}`); } catch (e) { console.log(`${n} → sin respuesta`); } }
// Gemini: ¿deja GENERAR (no solo listar)? un mensaje mínimo
{ const g = (process.env.GEMINI_KEY || "").replace(/\s+/g, ""); if (g) for (const m of ["gemini-3.5-flash", "gemini-2.5-flash"]) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": g }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "di ok" }] }] }), signal: AbortSignal.timeout(30000) }); console.log(`GEMINI_KEY · generar con ${m} → HTTP ${r.status}`); if (r.ok) break; } catch (e) { console.log(`GEMINI_KEY · ${m} → sin respuesta`); } } }
