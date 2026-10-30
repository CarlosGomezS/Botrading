#!/usr/bin/env bash
# v137 · VIGILANTE: GitHub no garantiza los horarios programados (a veces se salta disparos durante horas).
# Las cadenas que se relanzan solas (laboratorio y valor en directo) llaman a este script en cada vuelta y,
# si algo importante no se ha hecho a su hora, lo lanzan ellas. Solo mira fechas y estados; nunca importes.
# Uso: bash runner/vigia.sh   (necesita GH_TOKEN y GITHUB_REPOSITORY)
R="repos/${GITHUB_REPOSITORY}"
madrid_date=$(TZ=Europe/Madrid date +%F); madrid_min=$((10#$(TZ=Europe/Madrid date +%H) * 60 + 10#$(TZ=Europe/Madrid date +%M))); dow=$(TZ=Europe/Madrid date +%u)
busy() { local wf=$1; for s in in_progress queued pending waiting requested; do n=$(gh api "$R/actions/workflows/$wf/runs?status=$s&per_page=1" -q .total_count 2>/dev/null || echo 0); [ "${n:-0}" -gt 0 ] && return 0; done; return 1; }

# 1) Revisión diaria de la cartera real: de lunes a viernes, con la bolsa europea abierta (9:10-17:10), si hoy aún no está hecha
if [ "$dow" -le 5 ] && [ "$madrid_min" -ge 550 ] && [ "$madrid_min" -le 1030 ]; then
  revD=$(gh api "$R/contents/real.json?ref=real" -H "Accept: application/vnd.github.raw" 2>/dev/null | python3 -c "import json,sys;print((json.load(sys.stdin).get('meta') or {}).get('revD') or '')" 2>/dev/null || echo "")
  echo "Cartera real · última revisión diaria: ${revD:-desconocida} · hoy: $madrid_date"
  if [ -n "$revD" ] && [ "$revD" != "$madrid_date" ]; then
    if busy real.yml; then echo "La cartera real ya está en marcha."; else gh api -X POST "$R/actions/workflows/real.yml/dispatches" -f ref=main -f "inputs[accion]=normal" >/dev/null && echo "⚠️ GitHub se saltó la revisión de hoy: lanzada ahora."; fi
  fi
fi

# 2) Actualización de precios de la noche: si a partir de las 6:00 (hora de España) de martes a sábado no hay ninguna completada desde la tarde anterior
if [ "$dow" -ge 2 ] && [ "$dow" -le 6 ] && [ "$madrid_min" -ge 360 ] && [ "$madrid_min" -le 1200 ]; then
  since=$(date -u -d "yesterday 20:00" +%Y-%m-%dT%H:%M:%SZ)
  ok=$(gh api "$R/actions/workflows/diario.yml/runs?status=success&created=%3E%3D$since&per_page=1" -q .total_count 2>/dev/null || echo 1)
  echo "Actualización de precios desde $since: ${ok} completada(s)"
  if [ "${ok:-1}" -eq 0 ]; then
    if busy diario.yml; then echo "La actualización ya está en marcha."; else gh api -X POST "$R/actions/workflows/diario.yml/dispatches" -f ref=main >/dev/null && echo "⚠️ GitHub se saltó la actualización de anoche: lanzada ahora."; fi
  fi
fi
exit 0
