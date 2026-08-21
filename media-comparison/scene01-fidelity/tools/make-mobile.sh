#!/usr/bin/env bash
# The portrait mobile set: four natively-vertical masters at 720x1280.
#
# GENERATED IN 9:16, NOT CROPPED FROM 16:9 — and that replaces what this script
# used to do. The old version took a 1:2 centre crop of the landscape 4K
# masters, which shipped only columns a phone would show but could not change
# what those columns contained: at a real handset's 0.46 ratio, object-fit:
# cover still discarded about three quarters of a 16:9 frame, so the phone saw
# a narrow slice of a shot composed for a wide one. The only fix is footage
# framed vertically in the first place. See docs/portrait-mobile-spec.md.
#
# FOUR SCENES, NOT FIVE, and the joins are not where desktop's are. Scene 01
# carries facade -> entrance -> living in one clip; desktop spends two on that.
# The reason is mechanical rather than editorial: the entrance is the one beat
# a video model kept getting wrong, and splitting it across a cut made it worse
# every time. Hinged doors are a known weak spot for these models — ten takes
# asking the wood pivot door to swing open produced a camera squeezing through
# a sliver instead. What works is the door never animating at all: it stays
# shut and the camera enters through the sliding glass panel beside it, which
# is a linear motion the model handles. Keeping the approach and the entry in
# ONE take removed the hand-off that kept re-introducing the problem.
#
# EVERY SCENE IS NOW USED WHOLE — no head trims, and that is a change worth
# recording because it did not start that way. The first scene 03 take opened
# already closer on the S110 panel than scene 02 leaves off, so its frame 0 did
# not match (16.4 dB, i.e. unrelated framings); being a pull-back it passed
# through the right framing on its way out, and the set shipped for a while
# trimmed 27 frames off its head to land on it. That take is kept beside this
# one as scene-03-portrait-master-untrimmed.mp4. The regenerated take below
# starts on the matching framing by itself, so the trim is gone and the scene
# gets its full 8 s back.
#
# THE HOLE IN THE CAMERA PATH, and why scene 02 has four frames that were
# never generated.
#
# Scene 03 opens roughly five frames further along the camera path than scene
# 02 ends. That is measured, not inferred: calibrated against scene 02's own
# travel at its tail (~31.5 dB per frame), the 25.5 dB join sits between four
# frames of that travel (26.1 dB) and six (24.6 dB).
#
# Three separate takes of scene 03 were generated trying to close it, and the
# third was conditioned on scene 02's ACTUAL last frame rather than on a
# synthetic still. It changed nothing: 25.49 dB against the still-conditioned
# take's 25.53. The two takes agree with EACH OTHER at 39.97 dB — they open in
# the same place — while both sit ~25.5 dB from where scene 02 ends, with the
# same ~10 px offset. The conditioning image does not decide where this model
# opens a shot, so a fourth take would not have closed it either.
#
# Trimming cannot close it in the other direction: sweeping scene 02's tail,
# the match RISES monotonically to its very last frame and is still rising
# there. Scene 02 already ends at the best point it has; it simply stops short.
#
# So the four missing frames are synthesised instead — motion-compensated
# interpolation between scene 02's last real frame and scene 03's first,
# appended to scene 02. The mismatch is a near-pure ~10 px translation across
# a flat wood wall, which is the case optical flow handles best, and the
# result holds up: the join now measures 29.5 dB against the bridged scene's
# own closing steps of 31.5 / 30.4 / 30.9 dB. A seam within about a decibel of
# the camera's own per-frame travel is one more frame of that travel.
#
# BOUNDARIES, measured last-frame-to-first-frame:
#
#   01 -> 02  34.0 dB      02 -> 03  29.5 dB      03 -> 04  33.8 dB
#
# Unrelated framings sit at 10-13 dB throughout this project, so all three are
# genuine matches rather than coincidence.
#
# CRF 21 AND GOP 6 are unchanged and stay the house numbers, for the reasons
# the landscape set established: CRF 21 measured SSIM 0,9889 against a
# lossless encode of the same source, inside the band already accepted as
# visually equivalent, and GOP 6 is what keeps a backward seek cheap enough
# that scrolling up does not feel stuck.
#
# NO REVERSE COMPANIONS, DELIBERATELY. Desktop pays for a second set so that
# scrolling up streams forward through reversed footage instead of seeking. At
# 720x1280 with a keyframe every six frames, a seek decodes at most six frames
# of a small file, so the reverse set would double the bytes to buy back
# something the mobile decoder no longer struggles with.
#
#   bash make-mobile.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."

FF="node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="ffmpeg"
M="media-comparison/higgsfield/portrait/masters"
OUT="public/media/web"

encode() {
  local src="$1" dst="$2" trim="$3"
  local filter=()
  # Frame-accurate head trim: select by frame index and restamp, so the cut
  # lands on the measured frame rather than the nearest keyframe.
  [ "$trim" -gt 0 ] && filter=(-vf "select='gte(n\,$trim)',setpts=PTS-STARTPTS")

  "$FF" -hide_banner -v error -y -i "$src" \
    -map 0:v -an \
    "${filter[@]}" \
    -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p \
    -profile:v high -level:v 4.0 \
    -x264-params "keyint=6:min-keyint=6:scenecut=0:open-gop=0:bframes=0:ref=3" \
    -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -fps_mode passthrough \
    -movflags +faststart \
    "$dst"
}

# scene:master:head-trim-in-frames. The trim column is kept although every
# scene now reads 0: it is the lever a re-generated take needs when its opening
# framing lands past the previous scene's last frame, which has happened once
# already (see the header).
#
# Scene 02 runs from the BRIDGED master — 125 frames, not the delivered 121.
# See the "THE HOLE IN THE CAMERA PATH" note in the header for why.
for spec in \
  "01:scene-01-portrait-master:0" \
  "02:scene-02-portrait-master-bridged:0" \
  "03:scene-03-portrait-master:0" \
  "04:scene-04-portrait-master:0"
do
  IFS=: read -r play master trim <<< "$spec"
  dst="$OUT/scene-$play-portrait-720x1280-bt709-tv-gop6.mp4"
  encode "$M/$master.mp4" "$dst" "$trim"
  frames=$("${FF%ffmpeg*}ffprobe" -v error -select_streams v:0 \
    -show_entries stream=nb_frames -of default=nw=1:nk=1 "$dst" 2>/dev/null || echo "?")
  echo "  scene-$play  ${frames} frames  $(stat -c%s "$dst" | awk '{printf "%.2f MB", $1/1048576}')"
done

# The opening frame, so the hero never shows black while scene 01 arrives.
# Taken from the derivative the visitor actually plays, not from the master, so
# the poster and the first video frame are the same image.
"$FF" -hide_banner -v error -y -i "$OUT/scene-01-portrait-720x1280-bt709-tv-gop6.mp4" \
  -frames:v 1 -update 1 "$OUT/scene-01-poster-portrait.png"
"$FF" -hide_banner -v error -y -i "$OUT/scene-01-poster-portrait.png" \
  -c:v libwebp -quality 82 "$OUT/scene-01-poster-portrait.webp"
rm -f "$OUT/scene-01-poster-portrait.png"
echo "  poster        $(stat -c%s "$OUT/scene-01-poster-portrait.webp" | awk '{printf "%.0f KB", $1/1024}')"
