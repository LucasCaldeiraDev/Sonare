#!/usr/bin/env bash
# Container-only remux of the remaining Higgsfield masters.
#
# Same operation validated on scene 01: `-c copy` plus the colour tags the
# masters never carried. No -vf, no scale, no crop, no CRF, no bitrate, no codec
# change, no fps change. The H.264 elementary stream is copied byte for byte —
# verify-scenes.sh proves it.
set -euo pipefail
cd "$(dirname "$0")/../../.."

OUT="public/media/web"
mkdir -p "$OUT"

remux() {
  local src="$1" dst="$2"
  ffmpeg -hide_banner -v error -y -i "$src" \
    -map 0:v -c copy \
    -color_range pc -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -movflags +faststart \
    "$OUT/$dst"
  echo "  $(basename "$src")  ->  $dst"
}

remux "public/media/002-Sonare-Cena 02.mp4"   scene-02-4k-bt709-full.mp4
remux "public/media/003-Sonare-Cena-03.mp4"   scene-03-4k-bt709-full.mp4
remux "public/media/004-Sonare-Cena-04.mp4"   scene-04-4k-bt709-full.mp4
remux "public/media/005-Sonare-Cena-05.mp4"   scene-05-4k-bt709-full.mp4

echo "done"
