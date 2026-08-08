#!/usr/bin/env bash
# BT.709 tv/limited candidates for all five scenes.
#
# Same operation as the `full` pass, one value different: color_range=tv. That
# makes explicit the interpretation every player already applies to the untagged
# masters — which is the look the client approved — instead of leaving it to a
# browser default.
#
# `-c copy` only. The `full` remuxes and the masters are left in place.
set -euo pipefail
cd "$(dirname "$0")/../../.."

ARCHIVE="media-comparison/source-archive/masters"
OUT="public/media/web"
mkdir -p "$OUT"

remux() {
  ffmpeg -hide_banner -v error -y -i "$ARCHIVE/$1" \
    -map 0:v -c copy \
    -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -movflags +faststart \
    "$OUT/$2"
  echo "  $1  ->  $2"
}

remux "001-Sonare-Cena 01 completa.mp4" scene-01-4k-bt709-tv.mp4
remux "002-Sonare-Cena 02.mp4"          scene-02-4k-bt709-tv.mp4
remux "003-Sonare-Cena-03.mp4"          scene-03-4k-bt709-tv.mp4
remux "004-Sonare-Cena-04.mp4"          scene-04-4k-bt709-tv.mp4
remux "005-Sonare-Cena-05.mp4"          scene-05-4k-bt709-tv.mp4

echo "done"
