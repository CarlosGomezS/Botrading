#!/usr/bin/env bash
# v137 · VIGILANTE: GitHub no garantiza los horarios programados (a veces se salta disparos durante horas).
# Las cadenas que se relanzan solas (laboratorio y valor en directo) llaman a este script en cada vuelta y,
# si algo importante no se ha hecho a su hora, lo lanzan ellas. Solo mira fechas y estados; nunca importes.
# Uso: bash runner/vigia.sh   (necesita GH_TOKEN y GITHUB_REPOSITORY)
R="repos/${GITHUB_REPOSITORY}"
madrid_date=$(TZ=Europe/Madrid date +%F); madrid_min=$((10#$(TZ=Europe/Madrid date +%H) * 60 + 10#$(TZ=Europe/Madrid date +%M))); dow=$(TZ=Europe/Madrid date +%u)
busy() { local wf=$1; for s in in_progress queued pending waiting requested; do n=$(gh api "$R/actions/workflows/$wf/runs?status=$s&per_page=1" -q .total_count 2>/dev/null || echo 0); [ "${n:-0}" -gt 0 ] && return 0; done; return 1; }

# v1.0 · 🪙 CriptoBot: sin Trading 212 ni laboratorio de ETF (antes: puntos 1-4: revisión de la cartera real, precios de la noche, laboratorio y valor en directo)

# 5) v420 · exámenes y ayudante IA: GitHub a veces se salta sus horarios; si llevan demasiado sin hacerse, se lanzan aquí
for par in "examen-largo.yml:1560" "ia-lab.yml:420" "caza-lab.yml:420"; do   # v1.0 · 🪶 límites acordes a los horarios nuevos (1 al día / cada 6 h) wf=${par%%:*}; lim=${par##*:}
  t=$(gh api "$R/actions/workflows/$wf/runs?per_page=1" --jq '.workflow_runs[0].created_at' 2>/dev/null || echo "")
  if [ -n "$t" ]; then age=$(( ( $(date +%s) - $(date -d "$t" +%s) ) / 60 )); echo "$wf · última hace $age min"
    if [ "$age" -ge "$lim" ] && ! busy "$wf"; then gh api -X POST "$R/actions/workflows/$wf/dispatches" -f ref=main >/dev/null 2>&1 && echo "⚠️ $wf llevaba $age min sin hacerse: lanzado."; fi; fi
done

# 6) v441 · el bot de cripto de cada minuto (Bitvavo, OKX y la ronda de Hyperliquid): si lleva > 6 min sin publicar y no hay tramo vivo, se relanza
t=$(gh api "$R/contents/bitvavo.json?ref=bitvavo" -H "Accept: application/vnd.github.raw" 2>/dev/null | python3 -c "import json,sys;j=json.load(sys.stdin);print((j.get('meta') or {}).get('t') or j.get('t') or '')" 2>/dev/null || echo "")
if [ -n "$t" ]; then age=$(( ( $(date +%s) - $(date -d "$t" +%s) ) / 60 )); echo "Cripto · última vuelta hace $age min"
  if [ "$age" -ge 40 ] && ! busy meme.yml; then   # v1.0 · 🪶 ahora va cada 15 min
    gh api -X POST "$R/actions/workflows/meme.yml/dispatches" -f ref=main >/dev/null && echo "⚠️ El bot de cripto estaba parado: relanzado."; fi; fi
# 7) v441 · 💧 Hyperliquid: si su última ronda tiene más de 70 min (y está configurado), se lanza una ahora
t=$(gh api "$R/contents/hl-real.json?ref=hl-real" -H "Accept: application/vnd.github.raw" 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('t') or '')" 2>/dev/null || echo "")
if [ -n "$t" ]; then age=$(( ( $(date +%s) - $(date -d "$t" +%s) ) / 60 )); echo "Hyperliquid · última ronda hace $age min"
  if [ "$age" -ge 70 ] && ! busy hl-real.yml; then gh api -X POST "$R/actions/workflows/hl-real.yml/dispatches" -f ref=main -f "inputs[accion]=ronda" >/dev/null && echo "⚠️ Hyperliquid llevaba $age min sin ronda: lanzada."; fi; fi

# 8) v451 · GitHub apaga los horarios de un repositorio público tras 60 días sin actividad: si alguno está apagado por eso, se vuelve a encender
for id in $(gh api "$R/actions/workflows" -q '.workflows[]|select(.state=="disabled_inactivity")|.id' 2>/dev/null); do gh api -X PUT "$R/actions/workflows/$id/enable" >/dev/null 2>&1 && echo "⚠️ Un flujo estaba apagado por inactividad: encendido de nuevo."; done

# 9) v451 · 🚨 arranques fallidos (GitHub no llegó a empezar un flujo): aviso por Telegram (solo desde el bot de cada minuto, para no repetir)
if [ "${AVISA_ARRANQUES:-0}" = "1" ] && [ -n "$TELEGRAM_TOKEN" ] && [ -n "$TELEGRAM_CHAT" ]; then
  desde=$(date -u -d '-11 min' +%FT%TZ)
  for x in $(gh api "$R/actions/runs?per_page=50&created=>$desde" -q '.workflow_runs[]|select(.conclusion=="startup_failure")|(.name|gsub(" ";"·"))' 2>/dev/null | sort -u); do
    curl -s -m 20 -o /dev/null --data-urlencode "chat_id=$TELEGRAM_CHAT" --data-urlencode "text=🚨 CriptoBot: GitHub no ha podido arrancar «${x//·/ }». Suele ser un fallo momentáneo de GitHub: el vigilante lo relanza solo." "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" || true; done
fi

exit 0
