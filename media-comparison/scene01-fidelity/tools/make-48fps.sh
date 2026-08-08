#!/usr/bin/env bash
# Motion-interpolated 48 fps derivatives of the five scenes, forward and reverse.
#
# Two things this script exists to get right, both of which the pilot got wrong
# or left open.
#
# TRUNCATION. minterpolate cannot synthesise past the last source frame, so a
# 193-frame 24 fps input yields 383 frames at 48 instead of 386 — 62,5 ms short.
# Left alone, each scene ends early by a different amount and the timeline drifts
# scene by scene. Fixed by cloning the tail with tpad and cutting to exactly 2N
# frames, which is deterministic and preserves the final picture.
#
# THE REVERSE OFF-BY-ONE. The reverse file must satisfy the controller's mapping
#
#     reverseFrame = frameCount - 1 - forwardFrame
#
# exactly at every ORIGINAL frame, or the two representations show different
# moments and a direction change jumps. Reversing the interpolated forward file
# would guarantee that, but -vf reverse buffers the whole clip: 386 frames of
# 3876x2136 is 4,8 GB, and this machine has 5,1 GB free. So the reverse is
# interpolated from the existing 24 fps reverse instead — which lands one frame
# off, always in the same direction:
#
#     normal48[2k]  = normal24[k]
#     reverse48'[2m] = reverse24[m] = normal24[N-1-m]
#     so normal24[k] sits at reverse48' index 2N-2-2k, while the mapping wants
#     it at 2N-1-2k.
#
# One cloned frame prepended fixes it for every k at once, and the controller
# keeps its clean formula. The duplicate lands at reverse index 0, which maps to
# a synthesised position at the very end of the shot — nothing reads it.
#
# Everything else follows the pilot: same filter, CRF 18, GOP 12 (250 ms at
# 48 fps, matching GOP 6 at 24), BT.709 tv, yuv420p, no audio, faststart.
#
#   bash make-48fps.sh [outdir]           all ten
#   bash make-48fps.sh [outdir] 02        one scene, both directions
set -euo pipefail

SRC_DIR="public/media/web"
OUT_DIR="${1:-media-comparison/interp/out}"
ONLY="${2:-}"
FPS_IN=24
FPS_OUT=48

mkdir -p "$OUT_DIR"

encode() {
  # $1 input  $2 output  $3 exact output frame count  $4 "pre" to prepend a frame
  local in="$1" out="$2" want="$3" pre="${4:-}"
  # The tail is padded on the INPUT, at 24 fps, and this is the whole trick.
  #
  # minterpolate has nothing to interpolate toward after the final source frame,
  # so it stops about two frames early. Cloning the OUTPUT tail to make up the
  # count looks right in a frame counter and is wrong: it repeats an earlier
  # picture in the slots where the last real frames belong. Measured on scene 02
  # that put frame 0 of the forward file 20,8 dB away from where the reverse
  # mapping said it should be, while the middle of the clip sat at 46 dB.
  #
  # Giving the filter one extra cloned source frame instead means the last real
  # frame is a proper endpoint: output[2N-2] is the true final picture and
  # output[2N-1] interpolates between it and its own clone, which is itself.
  local chain="tpad=stop_mode=clone:stop_duration=$(awk "BEGIN{printf \"%.9f\", 1/${FPS_IN}}")"
  chain="${chain},minterpolate=fps=${FPS_OUT}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir"
  # Prepend AFTER interpolation, so the shift applies to output frames.
  if [ "$pre" = "pre" ]; then
    chain="${chain},tpad=start_mode=clone:start_duration=$(awk "BEGIN{printf \"%.9f\", 1/${FPS_OUT}}")"
  fi
  # Belt and braces: a short clone so -frames:v always has enough to cut from.
  chain="${chain},tpad=stop_mode=clone:stop_duration=0.5,setpts=N/${FPS_OUT}/TB"
  ffmpeg -hide_banner -loglevel error -y -i "$in" \
    -vf "$chain" -frames:v "$want" -r "$FPS_OUT" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high \
    -x264-params "keyint=12:min-keyint=12:scenecut=0:open-gop=0:bframes=0" \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -movflags +faststart -an "$out"
}

for scene in 01 02 03 04 05; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$scene" ] && continue

  fwd_in="${SRC_DIR}/scene-${scene}-4k-bt709-tv-gop6.mp4"
  rev_in="${SRC_DIR}/scene-${scene}-4k-bt709-tv-gop6-reverse.mp4"
  fwd_out="${OUT_DIR}/scene-${scene}-4k-bt709-tv-48fps.mp4"
  rev_out="${OUT_DIR}/scene-${scene}-4k-bt709-tv-48fps-reverse.mp4"

  n=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$fwd_in")
  nrev=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$rev_in")
  if [ "$n" != "$nrev" ]; then
    echo "cena ${scene}: normal tem ${n} frames e reversa tem ${nrev} — abortando" >&2
    exit 1
  fi
  want=$((n * FPS_OUT / FPS_IN))

  echo "cena ${scene}: ${n} frames a ${FPS_IN} fps -> ${want} a ${FPS_OUT} fps"
  t0=$(date +%s)
  encode "$fwd_in" "$fwd_out" "$want"
  echo "  normal  $(( $(date +%s) - t0 ))s"
  t1=$(date +%s)
  encode "$rev_in" "$rev_out" "$want" pre
  echo "  reversa $(( $(date +%s) - t1 ))s"
done

echo
echo "=== conferencia ==="
for f in "$OUT_DIR"/*.mp4; do
  n=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$f")
  d=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$f")
  r=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$f")
  sz=$(stat -c %s "$f")
  printf "%-46s %4s frames  %10s s  %6s  %6.1f MB\n" "$(basename "$f")" "$n" "$d" "$r" "$(awk "BEGIN{print $sz/1048576}")"
done
