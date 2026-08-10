import { useEffect, useRef, useState } from "react";

/**
 * Dev-only bench for choosing the mobile framing. Open /framing-lab.
 *
 * The question it exists to answer cannot be settled from a still or from
 * arithmetic, because the two things in tension are felt rather than measured:
 * how much of the room you can see, against how much of the screen the film
 * owns. This shows the same footage at the same instant in each candidate, on
 * the actual device, with a scrubber so the whole shot can be walked through —
 * a framing that reads well at one moment can be ruined by the camera arriving
 * somewhere else two seconds later, which is exactly what happened to the
 * glass-door mullion in scene 02.
 *
 * WHY THE NUMBERS ARE WHAT THEY ARE. With the picture filling a portrait
 * screen, the visible horizontal field is decided by the screen's aspect ratio
 * alone — cropping the file wider changes nothing, because object-fit: cover
 * always fills the height and discards the surplus. So "zoom out" is not a
 * setting; the only way to see more of the room is for the picture to stop
 * filling the height. Each option below is a different answer to how much of
 * the screen to give back in exchange for how much more of the scene.
 *
 * The test media is served from media-comparison/ rather than public/, the same
 * way the ?media=original and ?temporalMedia=48 flags are: the dev server
 * exposes the project root, so this resolves while developing and none of it
 * can reach a build.
 */

type Option = {
  id: string;
  label: string;
  /** Share of the 3840px master that is visible on a 430px-wide phone. */
  field: string;
  src: (scene: string) => string;
  /** Tailwind sizing for the video box, expressed the way the real layout would. */
  box: string;
  note: string;
};

const OPTIONS: Option[] = [
  {
    id: "full",
    label: "Tela cheia 1:2",
    field: "28%",
    src: (s) => `/media/web/scene-${s}-mobile-bt709-tv-gop6.mp4`,
    box: "h-[100svh] w-full",
    note: "O que está no ar. A imagem toma a tela inteira; em compensação você vê uma fresta da sala, e num momento ruim o montante da porta parte o quadro no meio.",
  },
  {
    id: "45",
    label: "Faixa 4:5",
    field: "45%",
    src: (s) => `/media-comparison/framing/scene-${s}-4x5.mp4`,
    box: "aspect-[4/5] w-full",
    note: "Some com a fresta: a sala volta a ler como sala e o equipamento aparece inteiro. A imagem deixa de ocupar cerca de 40% da altura, que passaria a carregar as legendas.",
  },
  {
    id: "169",
    label: "Faixa 16:9",
    field: "100%",
    src: (s) => `/media/web/scene-${s}-1080p-bt709-tv-gop6.mp4`,
    box: "aspect-video w-full",
    note: "O quadro exatamente como foi gerado, nada recortado. É também o mais leve de todos. Em troca, a imagem fica pequena no celular e o efeito de imersão praticamente acaba.",
  },
];

const SCENES = [
  { id: "02", label: "Cena 02 — living / home theater" },
  { id: "03", label: "Cena 03 — parede de madeira até o S110" },
];

export function FramingLab() {
  const [option, setOption] = useState(OPTIONS[0]);
  const [scene, setScene] = useState(SCENES[0]);
  const [progress, setProgress] = useState(0.45);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Every option is scrubbed to the SAME instant, so switching between them
  // compares framings rather than moments.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const apply = () => {
      if (v.duration) v.currentTime = v.duration * progress;
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener("loadedmetadata", apply, { once: true });
  }, [progress, option, scene]);

  return (
    <div className="min-h-[100svh] bg-sonare-black text-sonare-white">
      <div className="mx-auto max-w-2xl px-4 py-5">
        <p className="m-0 mb-1 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-sonare-gold">
          Laboratório de enquadramento · só em dev
        </p>
        <h1 className="m-0 mb-4 font-grandis text-lg font-medium">
          Quanto da sala, contra quanto da tela
        </h1>

        <div className="mb-3 flex gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOption(o)}
              className={`flex-1 rounded-md border px-3 py-2.5 text-left transition-colors ${
                option.id === o.id
                  ? "border-sonare-gold/60 bg-sonare-gold/10"
                  : "border-white/15 bg-white/[0.03]"
              }`}
            >
              <span className="block text-[0.8rem] font-bold">{o.label}</span>
              <span className="block font-mono text-[0.62rem] text-sonare-silver/60">
                vê {o.field} do quadro
              </span>
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          {SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScene(s)}
              className={`flex-1 rounded-md border px-3 py-2 text-[0.72rem] transition-colors ${
                scene.id === s.id ? "border-white/45 bg-white/10" : "border-white/12"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* The box is sized exactly as the real layout would size it, so what is
          being judged is the framing and not a preview of it. */}
      <div className="relative w-full overflow-hidden bg-black">
        <div className={`relative mx-auto overflow-hidden bg-black ${option.box}`}>
          <video
            key={`${option.id}-${scene.id}`}
            ref={videoRef}
            src={option.src(scene.id)}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5">
        <label className="mb-4 block">
          <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.16em] text-sonare-silver/60">
            Percorrer a cena — {Math.round(progress * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-sonare-gold"
          />
        </label>

        <p className="m-0 rounded-md border border-white/12 bg-white/[0.03] p-3.5 text-[0.82rem] leading-relaxed text-sonare-silver">
          {option.note}
        </p>
      </div>
    </div>
  );
}
