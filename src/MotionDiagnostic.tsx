import { CanvasNarrative } from "./components/CanvasNarrative";

/**
 * Isolated route for judging motion only: the canvas, the global timeline and
 * the technical HUD. No overlays, no hero, no closing, no commercial sections.
 */
export function MotionDiagnostic() {
  return (
    <main className="bg-sonare-black">
      <div className="px-6 py-10 text-sonare-silver">
        <h1 className="mb-2 font-grandis text-2xl text-sonare-white">/motion-diagnostic</h1>
        <p className="max-w-2xl text-sm leading-relaxed">
          Cinco masters originais (001–005) numa timeline global de 701 frames. Role para
          baixo e para cima, devagar e rápido, e observe o HUD. Nenhum overlay, proxy ou
          poster está ativo aqui.
        </p>
      </div>
      <CanvasNarrative id="diag" settle={1} debug />
      <div className="px-6 py-24 text-sonare-silver">fim da jornada — role de volta</div>
    </main>
  );
}
