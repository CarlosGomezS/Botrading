// Dice qué secretos están puestos en el repositorio (nunca su valor)
for (const n of (process.env.NOMBRES || "").split(" ").filter(Boolean)) console.log("secreto", n.padEnd(16), process.env[n] ? "✔ puesto" : "· vacío");
