#!/usr/bin/env bash
# Builds the geometry-matched references for the scene-01 fidelity audit.
#
# Input is the ALREADY correctly-decoded full-range PNG, not the mp4, so the
# resample happens in RGB and cannot reintroduce a range error. Crops are the
# exact rectangles computeGeometry() produces, rounded to a symmetric integer
# box so the reference and the renderers frame the same pixels.
set -euo pipefail

cd "$(dirname "$0")/../../.."
SRC="media-comparison/scene01-fidelity/ref/frame-000-fullrange.png"
# Deliberately OUTSIDE public/: Vite copies publicDir wholesale into dist, and
# these references are ~27 MB of pure diagnostic payload that must never ship.
# The dev server serves the project root, so /diagnostic-refs/* resolves in dev
# and 404s in production — which is the correct behaviour for a dev-only route.
OUT="diagnostic-refs"
mkdir -p "$OUT"

# The native reference: unscaled source of truth for mode A and 400% inspection.
cp "$SRC" "$OUT/frame-000-fullrange.png"

# cover: crop to the stage aspect, then Lanczos down to the stage size.
#   $1 stage w   $2 stage h   $3 crop w   $4 crop h   $5 crop x   $6 crop y
cover() {
  ffmpeg -hide_banner -v error -y -i "$SRC" \
    -vf "crop=$3:$4:$5:$6,scale=$1:$2:flags=lanczos+accurate_rnd:sws_dither=none" \
    "$OUT/frame-000-lanczos-cover-$1x$2.png"
  echo "  cover   $1x$2   from crop $3x$4 @ $5,$6"
}

# contain: whole frame fitted inside the stage, neutral grey letterbox.
contain() {
  ffmpeg -hide_banner -v error -y -i "$SRC" \
    -vf "scale=$1:$2:force_original_aspect_ratio=decrease:flags=lanczos+accurate_rnd:sws_dither=none,pad=$1:$2:-1:-1:color=0x808080" \
    "$OUT/frame-000-lanczos-contain-$1x$2.png"
  echo "  contain $1x$2"
}

# none: one source pixel to one stage pixel, centred. No resample at all.
nocrop() {
  local x=$(( (3876 - $1) / 2 ))
  local y=$(( (2136 - $2) / 2 ))
  ffmpeg -hide_banner -v error -y -i "$SRC" \
    -vf "crop=$1:$2:$x:$y" \
    "$OUT/frame-000-lanczos-none-$1x$2.png"
  echo "  none    $1x$2   1:1 crop @ $x,$y"
}

echo "building references from $SRC"

# 1920x1080  AR 1.7778 -> crop 3798x2136, 39px symmetric side trim
cover 1920 1080 3798 2136 39 0
contain 1920 1080
nocrop 1920 1080

# 1440x900   AR 1.6000 -> crop 3418x2136, 229px symmetric side trim
cover 1440 900 3418 2136 229 0
contain 1440 900
nocrop 1440 900

# 1920x1058  AR 1.8147 -> master aspect, no crop, pure downscale
cover 1920 1058 3876 2136 0 0

# 2400x1000  AR 2.4000 -> wider than master: crop 3876x1616, 260px top/bottom
cover 2400 1000 3876 1616 0 260

# 2560x1440  AR 1.7778 -> high-density / large desktop
cover 2560 1440 3798 2136 39 0

# 3840x2160  AR 1.7778 -> 1920x1080 at DPR 2. Note this is an UPSCALE of the
# 3798x2136 crop, not a downscale: a different regime from every other row.
cover 3840 2160 3798 2136 39 0

# ffmpeg stamps cICP/gAMA (BT.709 transfer) on everything it writes from a
# bt709-tagged frame. Chrome converts that to the display space and loses ~11
# luma in the shadows, so a tagged still could never match the video. Untagged
# reads as sRGB, which is where the decoded video lands.
echo "stripping colour chunks so the browser treats these as sRGB"
node media-comparison/scene01-fidelity/tools/strip-png-color.mjs "$OUT"/*.png

echo "done"
ls -la "$OUT"
