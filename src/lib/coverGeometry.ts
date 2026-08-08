/**
 * One definition of "where the picture goes", shared by every renderer in the
 * fidelity audit so that A/B/C/D differ ONLY in how they resample — never in
 * what they frame.
 *
 * `cover` reproduces CSS `object-fit: cover; object-position: center` exactly,
 * which is also what CanvasNarrative already does at draw time. Keeping the two
 * in one place is what makes the comparison honest: an off-by-one crop reads as
 * a sharpness difference when it is really a geometry difference.
 */
export type Fit = "cover" | "contain" | "none";

export type Geometry = {
  /** Source rectangle, in the media's own pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rectangle, in destination-surface pixels. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** How many source pixels collapse into one destination pixel, per axis. */
  ratioX: number;
  ratioY: number;
};

export function computeGeometry(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
  fit: Fit,
): Geometry {
  if (!vw || !vh || !cw || !ch) {
    return { sx: 0, sy: 0, sw: 0, sh: 0, dx: 0, dy: 0, dw: 0, dh: 0, ratioX: 1, ratioY: 1 };
  }

  if (fit === "cover") {
    const targetAr = cw / ch;
    let sw = vw;
    let sh = vw / targetAr;
    if (sh > vh) {
      sh = vh;
      sw = vh * targetAr;
    }
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    return { sx, sy, sw, sh, dx: 0, dy: 0, dw: cw, dh: ch, ratioX: sw / cw, ratioY: sh / ch };
  }

  if (fit === "contain") {
    const scale = Math.min(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    return {
      sx: 0,
      sy: 0,
      sw: vw,
      sh: vh,
      dx: (cw - dw) / 2,
      dy: (ch - dh) / 2,
      dw,
      dh,
      ratioX: vw / dw,
      ratioY: vh / dh,
    };
  }

  // "none": one media pixel to one destination pixel, centred, cropped if larger.
  const sw = Math.min(vw, cw);
  const sh = Math.min(vh, ch);
  return {
    sx: (vw - sw) / 2,
    sy: (vh - sh) / 2,
    sw,
    sh,
    dx: (cw - sw) / 2,
    dy: (ch - sh) / 2,
    dw: sw,
    dh: sh,
    ratioX: 1,
    ratioY: 1,
  };
}
