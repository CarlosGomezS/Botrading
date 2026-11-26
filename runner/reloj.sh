#!/usr/bin/env bash
# v1.0 · ⏰ RELOJ: lo lanza cron-job.org cada 5 min (flujo reloj.yml). Decide qué toca según la hora. Solo mira fechas y estados.
R="repos/${GITHUB_REPOSITORY}"
M=$((10#$(date -u +%M)))
vivo() { for s in in_progress queued pending waiting requested; do n=$(gh api "$R/actions/workflows/$1/runs?status=$s&per_page=1" -q .total_count 2>/dev/null || echo 0); [ "${n:-0}" -gt 0 ] && return 0; done; return 1; }
lanza() { if vivo "$1"; then echo "$1 ya está en marcha."; else gh api -X POST "$R/actions/workflows/$1/dispatches" -f ref=main >/dev/null && echo "Lanzado: $1"; fi; }
# 1) bot de cripto (Bitvavo, OKX y la ronda de la hora de Hyperliquid): cada 15 min
if [ $((M % 15)) -lt 5 ]; then lanza meme.yml; fi
# 2) vigilante: cada hora (lanza los laboratorios y lo que lleve demasiado sin hacerse)
if [ "$M" -lt 5 ]; then timeout 120 bash runner/vigia.sh || true; fi
exit 0
