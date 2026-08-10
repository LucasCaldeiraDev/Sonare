import { useCallback, useEffect, useRef, useState } from "react";
import { Blinds, Lightbulb } from "lucide-react";
import { suiteAlt, suiteClips, suiteStill, type SuiteState } from "../content/copy";
import { useIsNearViewport } from "../hooks/useIsNearViewport";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * The visitor operating the house: two controls over a master suite that
 * answers them.
 *
 * The mechanism is the journey's, at a smaller scale — every change of state
 * is a short clip that plays once and stops on the frame that IS the
 * destination still, so the handover from video back to image has nothing to
 * give itself away. What differs is the direction of authority: the film is
 * driven by the scroll, this is driven by a click.
 *
 * Three rules keep it honest under abuse:
 *
 *   queued, not ignored  a click during a transition is remembered and run
 *                        afterwards, so the buttons never disagree with the
 *                        picture. Dropping it would be simpler and would
 *                        desynchronise state from what is on screen.
 *   never stuck          a clip that errors, stalls or never fires `ended`
 *                        resolves through a watchdog into the destination
 *                        still. The section degrades to a crossfade rather
 *                        than freezing mid-transition.
 *   nothing eager        clips load only once the section approaches the
 *                        viewport, and only the two reachable from the
 *                        current state — never all six.
 */

const CURTAIN_MS = 8100;
const LIGHT_MS = 5100;
/** Longest a transition may run before the watchdog resolves it anyway. */
const WATCHDOG_MS = 11000;
/** Crossfade used where no clip exists (lights, curtains already open). */
const FADE_MS = 900;

const keyOf = (curtains: boolean, lights: boolean): SuiteState =>
  `${curtains ? "aberta" : "fechada"}-${lights ? "on" : "off"}` as SuiteState;

const parse = (s: SuiteState) => ({
  curtains: s.startsWith("aberta"),
  lights: s.endsWith("on"),
});

export function InteractiveSuite() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const near = useIsNearViewport(sectionRef, "40% 0px");
  const reducedMotion = usePrefersReducedMotion();

  const [state, setState] = useState<SuiteState>("fechada-off");
  const [clip, setClip] = useState<string | null>(null);
  const busyRef = useRef(false);
  const queueRef = useRef<("lights" | "curtains")[]>([]);
  const [busy, setBusy] = useState(false);

  const { curtains, lights } = parse(state);

  /** Runs one transition, then drains whatever was clicked during it. */
  const go = useCallback(
    (from: SuiteState, kind: "lights" | "curtains") => {
      const f = parse(from);
      const to = kind === "lights" ? keyOf(f.curtains, !f.lights) : keyOf(!f.curtains, f.lights);
      const src = suiteClips[`${from}>${to}`];

      busyRef.current = true;
      setBusy(true);

      const finish = () => {
        if (!busyRef.current) return;
        busyRef.current = false;
        setState(to);
        setClip(null);
        setBusy(false);
        const next = queueRef.current.shift();
        // A frame of breathing room so the still is painted before the next
        // clip covers it — otherwise a queued pair can flash the old state.
        if (next) requestAnimationFrame(() => go(to, next));
      };

      // No clip for this pair (lights with the curtains open), or motion is
      // switched off: cross-dissolve the stills instead.
      if (!src || reducedMotion) {
        window.setTimeout(finish, reducedMotion ? 0 : FADE_MS);
        return;
      }

      setClip(src);
      const guard = window.setTimeout(finish, WATCHDOG_MS);
      const v = videoRef.current;
      if (!v) {
        window.clearTimeout(guard);
        finish();
        return;
      }
      const done = () => {
        window.clearTimeout(guard);
        v.removeEventListener("ended", done);
        v.removeEventListener("error", done);
        finish();
      };
      v.addEventListener("ended", done);
      v.addEventListener("error", done);
      // The src is applied by React on the next render; play from the top once
      // the element has actually taken it.
      requestAnimationFrame(() => {
        try {
          v.currentTime = 0;
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => done());
        } catch {
          done();
        }
      });
    },
    [reducedMotion],
  );

  const toggle = (kind: "lights" | "curtains") => {
    if (busyRef.current) {
      // At most one pending click per control: a queue that grows without
      // bound would let someone spend a minute watching it drain.
      if (queueRef.current.length < 2) queueRef.current.push(kind);
      return;
    }
    go(state, kind);
  };

  // Warm only what the current state can reach.
  useEffect(() => {
    if (!near) return;
    const reachable = [
      suiteClips[`${state}>${keyOf(curtains, !lights)}`],
      suiteClips[`${state}>${keyOf(!curtains, lights)}`],
    ].filter(Boolean);
    const links = reachable.map((href) => {
      const l = document.createElement("link");
      l.rel = "prefetch";
      l.as = "video";
      l.href = href;
      document.head.appendChild(l);
      return l;
    });
    return () => links.forEach((l) => l.remove());
  }, [near, state, curtains, lights]);

  const Control = ({
    kind,
    on,
    Icon,
    label,
    onLabel,
    offLabel,
  }: {
    kind: "lights" | "curtains";
    on: boolean;
    Icon: typeof Lightbulb;
    label: string;
    onLabel: string;
    offLabel: string;
  }) => (
    <button
      type="button"
      onClick={() => toggle(kind)}
      aria-pressed={on}
      className={`group flex min-w-[9.5rem] flex-1 items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors duration-300 sm:flex-none ${
        on
          ? "border-sonare-gold/50 bg-sonare-gold/[0.08]"
          : "border-white/12 bg-sonare-black/50 hover:border-white/30"
      }`}
    >
      <Icon
        size={20}
        aria-hidden="true"
        className={`shrink-0 transition-colors duration-300 ${on ? "text-sonare-gold" : "text-sonare-silver/60"}`}
      />
      <span className="min-w-0">
        <span className="block font-mono text-[0.56rem] font-medium uppercase tracking-[0.18em] text-sonare-silver/50">
          {label}
        </span>
        <span
          className={`block text-[0.9rem] font-bold transition-colors duration-300 ${on ? "text-sonare-white" : "text-sonare-silver"}`}
        >
          {on ? onLabel : offLabel}
        </span>
      </span>
    </button>
  );

  return (
    <section
      ref={sectionRef}
      id="experimente"
      aria-labelledby="interativo-title"
      className="border-y border-white/10 bg-sonare-coal"
    >
      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:py-20">
        <div className="mb-8 max-w-2xl">
          <p className="m-0 mb-3 inline-flex items-center gap-2.5 font-mono text-[0.62rem] font-medium uppercase tracking-[0.2em] text-sonare-gold">
            <span aria-hidden="true" className="anchor-dot block h-2 w-2 rounded-full bg-sonare-gold" />
            Experimente
          </p>
          <h2
            id="interativo-title"
            className="m-0 mb-3 font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl"
          >
            Opere a casa daqui do site.
          </h2>
          <p className="m-0 text-base leading-relaxed text-sonare-silver">
            Uma suíte master respondendo ao seu toque. Acenda as luzes, abra as cortinas e veja o
            ambiente mudar — é assim que o S110 comanda cada cena.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-sonare-black">
          <div className="relative aspect-video w-full">
            {/* The resting state. Always present, so a transition has
                something correct underneath it at every moment. */}
            <img
              src={suiteStill(state)}
              alt={suiteAlt[state]}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            {/* The transition. Covers the still only while a clip is running,
                and stops on the frame the still is about to show. */}
            <video
              ref={videoRef}
              src={clip ?? undefined}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
              disablePictureInPicture
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
                clip ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            />
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/10 bg-sonare-coal p-4 sm:p-5">
            <Control
              kind="lights"
              on={lights}
              Icon={Lightbulb}
              label="Iluminação"
              onLabel="Acesa"
              offLabel="Apagada"
            />
            <Control
              kind="curtains"
              on={curtains}
              Icon={Blinds}
              label="Cortinas"
              onLabel="Abertas"
              offLabel="Fechadas"
            />
            <p
              aria-live="polite"
              className="flex min-h-[1rem] flex-1 items-center justify-end px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-sonare-silver/45"
            >
              {busy ? "Executando cena…" : "Cena aplicada"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
