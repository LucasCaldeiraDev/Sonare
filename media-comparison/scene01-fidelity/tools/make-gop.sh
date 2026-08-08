#!/usr/bin/env bash
# Short-GOP derivatives.
#
# The masters carry a single keyframe each, so every backward seek decodes from
# frame 0 — measured at ~700 ms p95. Regular keyframes cap that cost at the
# distance to the nearest one.
#
# Deliberately NO -vf of any kind. Input and output are both yuv420p tagged
# bt709/tv, so the chain stays decode-YUV -> encode-YUV: swscale never runs and
# there is no RGB round trip, which is the only way a re-encode can leave the
# range and the colour untouched. Anything that forced a conversion here would
# re-clip the content and bake today's rendering into the file.
#
#   bash make-gop.sh <input.mp4> <gop> <output.mp4> [crf]
set -euo pipefail
cd "$(dirname "$0")/../../.."

IN="$1"; GOP="$2"; OUT="$3"; CRF="${4:-16}"

ffmpeg -hide_banner -v error -y -i "$IN" \
  -map 0:v -an \
  -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p \
  -profile:v high -level:v 5.1 \
  -x264-params "keyint=${GOP}:min-keyint=${GOP}:scenecut=0:open-gop=0:bframes=0:ref=3" \
  -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -fps_mode passthrough \
  -movflags +faststart \
  "$OUT"

echo "  $(basename "$OUT")  $(stat -c%s "$OUT") bytes  (GOP ${GOP}, crf ${CRF})"
