import type { Geometry } from "./coverGeometry";

/**
 * Minimal WebGL2 video surface for the fidelity audit.
 *
 * No bloom, no tone mapping, no contrast curve, no colour grading: the shader's
 * only job is to resample. The three qualities exist to answer one question —
 * how much of the softness is the *filter* rather than the source:
 *
 *   linear  — plain bilinear. At a 2.02x downscale this reads only 2x2 of the
 *             ~4 source pixels that land in each output pixel, which is exactly
 *             the failure mode Canvas 2D has by default.
 *   mipmap  — trilinear. Proper area averaging, but box-filtered, so slightly
 *             soft against a Lanczos reference.
 *   lanczos — Lanczos-2 with a scale-aware kernel, sampled off mip level 1 so
 *             the remaining ratio is ~1x and 4x4 taps are sufficient. This is
 *             the one meant to match ffmpeg's Lanczos output.
 */
export type GLQuality = "linear" | "mipmap" | "lanczos";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Two triangles covering clip space; UV is derived, not attributed, so there
  // is no interpolation error at the edges.
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2 u_texSize;     // full texture size in texels
uniform vec4 u_srcRect;     // sx, sy, sw, sh in texels
uniform vec2 u_ratio;       // source texels consumed per destination pixel
uniform int  u_quality;     // 0 linear, 1 mipmap, 2 lanczos
uniform float u_flipY;      // 1.0 when the source needs vertical flip
uniform float u_sharpen;    // unsharp amount, 0 = off
uniform float u_sharpClamp; // ceiling on the correction, in luma units

float lanczos(float x, float a) {
  if (x < 1e-5) return 1.0;
  if (x >= a) return 0.0;
  float px = 3.14159265358979 * x;
  return (a * sin(px) * sin(px / a)) / (px * px);
}

/**
 * Post-scale unsharp mask.
 *
 * Deliberately conservative, because sharpening is the easiest way to make a
 * picture look worse while measuring "sharper":
 *   - the low-pass is one DESTINATION pixel wide, so it can only restore what
 *     the downscale just removed, not invent structure at other frequencies;
 *   - the correction is computed on luma and applied uniformly to RGB, so it
 *     cannot pull colour fringes onto edges;
 *   - the correction is clamped, which is what actually stops halos: an edge
 *     with a huge local delta gets the same limited push as a subtle one.
 */
vec3 unsharp(vec3 col, vec2 texel, float lod) {
  if (u_sharpen <= 0.0) return col;
  vec2 step = u_ratio;
  vec3 blur = (
      textureLod(u_tex, (texel + vec2(-step.x, 0.0)) / u_texSize, lod).rgb
    + textureLod(u_tex, (texel + vec2( step.x, 0.0)) / u_texSize, lod).rgb
    + textureLod(u_tex, (texel + vec2(0.0, -step.y)) / u_texSize, lod).rgb
    + textureLod(u_tex, (texel + vec2(0.0,  step.y)) / u_texSize, lod).rgb
  ) * 0.25;
  vec3 d = col - blur;
  float dl = dot(d, vec3(0.2126, 0.7152, 0.0722));
  dl = clamp(dl, -u_sharpClamp, u_sharpClamp);
  return clamp(col + u_sharpen * dl, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  if (u_flipY > 0.5) uv.y = 1.0 - uv.y;

  // Destination UV -> absolute texel coordinate inside the crop rectangle.
  vec2 texel = u_srcRect.xy + uv * u_srcRect.zw;
  float ratioLod = max(0.0, log2(max(u_ratio.x, u_ratio.y)));

  if (u_quality == 0) {
    vec3 col = texture(u_tex, texel / u_texSize).rgb;
    outColor = vec4(unsharp(col, texel, 0.0), 1.0);
    return;
  }

  if (u_quality == 1) {
    // Let the hardware pick the mip chain; explicit LOD keeps it deterministic
    // instead of depending on screen-space derivatives at the quad edges.
    vec3 col = textureLod(u_tex, texel / u_texSize, ratioLod).rgb;
    outColor = vec4(unsharp(col, texel, ratioLod), 1.0);
    return;
  }

  // Lanczos-2 evaluated on mip level "base", chosen so the residual downscale
  // is <= ~1.4x. That keeps a 4x4 kernel mathematically adequate instead of
  // needing the 9x9 the full-resolution ratio would demand.
  float base = floor(ratioLod);
  float mipScale = exp2(base);
  vec2 mipSize = u_texSize / mipScale;
  vec2 mipTexel = texel / mipScale;

  vec2 residual = max(u_ratio / mipScale, vec2(1.0));
  vec2 support = 2.0 * residual;

  vec2 center = mipTexel - 0.5;
  vec2 base0 = floor(center - support + 0.5);
  int taps = int(ceil(support.x)) * 2;
  taps = min(max(taps, 4), 8);

  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int j = 0; j < 8; j++) {
    if (j >= taps) break;
    float sy = base0.y + float(j);
    float wy = lanczos(abs((sy + 0.5 - mipTexel.y) / residual.y), 2.0);
    if (abs(wy) < 1e-6) continue;
    for (int i = 0; i < 8; i++) {
      if (i >= taps) break;
      float sx = base0.x + float(i);
      float wx = lanczos(abs((sx + 0.5 - mipTexel.x) / residual.x), 2.0);
      if (abs(wx) < 1e-6) continue;
      float w = wx * wy;
      vec2 c = (vec2(sx, sy) + 0.5) / mipSize;
      acc += textureLod(u_tex, c, base).rgb * w;
      wsum += w;
    }
  }
  vec3 col = wsum > 0.0 ? clamp(acc / wsum, 0.0, 1.0) : vec3(0.0);
  outColor = vec4(unsharp(col, texel, base), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

export type GLSurface = {
  draw: (
    video: HTMLVideoElement | HTMLImageElement,
    geo: Geometry,
    quality: GLQuality,
    sharpen?: number,
  ) => boolean;
  resize: (w: number, h: number) => void;
  info: () => string;
  /**
   * Milliseconds the GPU actually spent on the draws that have completed.
   * Real hardware timing from EXT_disjoint_timer_query_webgl2, not a CPU-side
   * estimate — null when the extension is unavailable. Results arrive a few
   * frames late by design, so this is a rolling list, not a per-call value.
   */
  gpuTimings: () => number[] | null;
  destroy: () => void;
};

export function createGLSurface(canvas: HTMLCanvasElement): GLSurface | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
    desynchronized: false,
  });
  if (!gl) return null;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

  const u = {
    texSize: gl.getUniformLocation(prog, "u_texSize"),
    srcRect: gl.getUniformLocation(prog, "u_srcRect"),
    ratio: gl.getUniformLocation(prog, "u_ratio"),
    quality: gl.getUniformLocation(prog, "u_quality"),
    flipY: gl.getUniformLocation(prog, "u_flipY"),
    sharpen: gl.getUniformLocation(prog, "u_sharpen"),
    sharpClamp: gl.getUniformLocation(prog, "u_sharpClamp"),
  };

  let texW = 0;
  let texH = 0;
  let lastQuality: GLQuality | null = null;

  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";

  // Real GPU timing. Only one query can be in flight at a time, and results are
  // not ready on the frame they were issued — hence the pending list.
  type TimerExt = {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  };
  const timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
  const gpuMs: number[] = [];
  let pendingQuery: WebGLQuery | null = null;

  const collectGpu = () => {
    if (!timerExt || !pendingQuery) return;
    const available = gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT_AVAILABLE);
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
    if (available) {
      if (!disjoint) gpuMs.push(gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(pendingQuery);
      pendingQuery = null;
    }
  };

  return {
    resize(w: number, h: number) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    draw(source, geo, quality, sharpen = 0) {
      const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      if (!sw || !sh || !geo.sw || !geo.sh) return false;

      collectGpu();
      if (timerExt && !pendingQuery) {
        pendingQuery = gl.createQuery();
        if (pendingQuery) gl.beginQuery(timerExt.TIME_ELAPSED_EXT, pendingQuery);
      }
      const timing = timerExt && pendingQuery;

      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (sw !== texW || sh !== texH) {
        texW = sw;
        texH = sh;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }

      const needsMips = quality !== "linear";
      if (needsMips) gl.generateMipmap(gl.TEXTURE_2D);

      if (quality !== lastQuality) {
        lastQuality = quality;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          needsMips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
        );
      }

      gl.uniform2f(u.texSize, texW, texH);
      gl.uniform4f(u.srcRect, geo.sx, geo.sy, geo.sw, geo.sh);
      gl.uniform2f(u.ratio, geo.ratioX, geo.ratioY);
      gl.uniform1i(u.quality, quality === "linear" ? 0 : quality === "mipmap" ? 1 : 2);
      gl.uniform1f(u.sharpen, sharpen);
      // ~6% of the range. Past this a correction stops reading as detail and
      // starts reading as an outline drawn around the edge.
      gl.uniform1f(u.sharpClamp, 0.06);
      // texImage2D from a video/image already lands top-down in GL's bottom-up
      // space, so the shader flips instead of paying an upload-time flip.
      gl.uniform1f(u.flipY, 1);

      // Letterbox for "contain": clear once, then draw only into the dest rect.
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0.5, 0.5, 0.5, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(
        Math.round(geo.dx),
        Math.round(canvas.height - geo.dy - geo.dh),
        Math.round(geo.dw),
        Math.round(geo.dh),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (timing && timerExt) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
      return true;
    },

    info: () => renderer,

    gpuTimings: () => (timerExt ? gpuMs.slice() : null),

    destroy() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}
