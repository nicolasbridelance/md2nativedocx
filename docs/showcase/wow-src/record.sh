#!/usr/bin/env bash
# Record one shot of the "wow" video: the window of the given Office app only (not the desktop),
# mouse cursor included, after a 5-second countdown. Raw takes go to raw/ (gitignored).
# Usage: bash record.sh <shot-name> <word|powerpoint> [seconds]
#   e.g. bash record.sh B-formes word 15
set -euo pipefail
cd "$(dirname "$0")"
shot=${1:?shot name}; app=${2:?word or powerpoint}; secs=${3:-15}
case $app in word) proc=WINWORD ;; powerpoint) proc=POWERPNT ;; *) echo "app: word|powerpoint"; exit 1 ;; esac
title=$(powershell -NoProfile -Command "(Get-Process $proc -ErrorAction SilentlyContinue | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle" | tr -d '\r')
[ -n "$title" ] || { echo "No open $app window found."; exit 1; }
mkdir -p raw
echo "Window: $title"
for i in 5 4 3 2 1; do echo "  recording in $i... (switch to $app now)"; sleep 1; done
echo "  REC ${secs}s"
ffmpeg -loglevel error -y -f gdigrab -framerate 30 -draw_mouse 1 -t "$secs" -i "title=$title" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p "raw/$shot.mp4"
echo "Saved raw/$shot.mp4"
