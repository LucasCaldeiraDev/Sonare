#!/usr/bin/env bash
# The portrait mobile set: 1:2 centre crop of the 4K masters at 720x1440.
#
# WHY A CROP AND NOT A DOWNSCALE. A phone shows the journey full-bleed in
# portrait, so object-fit:cover takes a tall slice out of 16:9 footage and
# throws the rest away. Measured on 375x812 at DPR 2 (backing 750x1624) with
# the 1080p set production served here before: cover scales the picture by
# 1.50x and only 499 of its 1920 columns are ever on screen. Three quarters of
# every downloaded pixel was decoded and discarded, and what remained was
# enlarged. Cropping to 1:2 at the source instead means every column shipped is
# a column shown, and the same phone now enlarges by 1.17x.
#
# 1:2 rather than 9:16 or 9:19.5. Phones run from 0.56 (iPhone SE) to 0.45
# (most modern handsets), and the URL bar makes the live viewport wider than
# the spec sheet. 0.50 is the middle of that range: no common phone enlarges
# this by more than about 1.2x, and none crops away more than a sliver.
#
# CENTRE, WITH NO PER-SCENE OFFSET AND NO PAN. Verified against contact sheets
# of all five scenes: every shot is centre-weighted and every camera move ends
# with its subject in the middle of frame — the entrance in 01, the screen and
# the towers in 02, the S110 in 03 and 04, the skyline between the curtains in
# 05. A fixed window is therefore the honest crop, and it keeps the mapping
# from source to output trivial.
#
# SOURCE ORDER IS NOT PLAYBACK ORDER. v3-masters/ keeps the delivered
# numbering, in which 003 and 004 are swapped with respect to continuity.
# Verified here, not assumed: frame 0 of the served scene-03 measures 40.1 dB
# against master 04 and 12.1 dB against master 03. The map below is that
# measurement, so `scene-03` out is master 04 in.
#
# CRF 21 AND GOP 6. Both are the house numbers, arrived at the house way.
# Measured against a lossless encode of the identical crop and scale, so the
# figure is the encoder's alone: SSIM 0,9889 at 5,19 MB for scene 01, against
# 0,9902 for the 1080p tier already accepted as visually equivalent. CRF 22
# gives 0,9877 at 4,56 MB and 23 gives 0,9862 at 4,00 MB — both leave the band.
# GOP 6 is kept even though 12 would save 15%: the short GOP is the whole
# reason scrolling up does not feel stuck, and that reasoning does not change
# because the file got smaller.
#
# NO REVERSE COMPANIONS, DELIBERATELY. Desktop pays for a second set so that
# scrolling up streams forward through reversed footage instead of seeking.
# At 720x1440 a seek decodes at most six frames of a file an eighth the size,
# so the reverse set would double the bytes to buy back something the mobile
# decoder no longer struggles with.
#
#   bash make-mobile.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."

FF="node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="ffmpeg"
M="media-comparison/source-archive/v3-masters"
OUT="public/media/web"

CROP="crop=1080:2160:1380:0,scale=720:1440:flags=lanczos"

# playback:master — 03 and 04 cross, see the header.
for pair in "01:01" "02:02" "03:04" "04:03" "05:05"; do
  play="${pair%%:*}"
  master="${pair##*:}"
  src="$M/scene-$master-3840x2160-bytedance-aigc.mp4"
  dst="$OUT/scene-$play-mobile-bt709-tv-gop6.mp4"

  "$FF" -hide_banner -v error -y -i "$src" \
    -map 0:v -an \
    -vf "$CROP" \
    -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p \
    -profile:v high -level:v 4.0 \
    -x264-params "keyint=6:min-keyint=6:scenecut=0:open-gop=0:bframes=0:ref=3" \
    -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -fps_mode passthrough \
    -movflags +faststart \
    "$dst"

  echo "  scene-$play (master $master)  $(stat -c%s "$dst" | awk '{printf "%.2f MB", $1/1048576}')"
done

# The opening frame, so the hero never shows black while scene 01 arrives.
# Taken from the derivative the visitor actually plays, not from the master, so
# the poster and the first video frame are the same image.
"$FF" -hide_banner -v error -y -i "$OUT/scene-01-mobile-bt709-tv-gop6.mp4" \
  -frames:v 1 -update 1 "$OUT/scene-01-poster-mobile.png"
"$FF" -hide_banner -v error -y -i "$OUT/scene-01-poster-mobile.png" \
  -c:v libwebp -quality 82 "$OUT/scene-01-poster-mobile.webp"
rm -f "$OUT/scene-01-poster-mobile.png"
echo "  poster        $(stat -c%s "$OUT/scene-01-poster-mobile.webp" | awk '{printf "%.0f KB", $1/1024}')"
