import { StrictMode, Suspense, lazy, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const path = window.location.pathname;

/**
 * Diagnostic routes are development-only and must not cost the production
 * bundle anything.
 *
 * `import.meta.env.DEV` is substituted at build time, so in a production build
 * this whole branch is `if (false)` and Rollup drops it — along with the
 * dynamic imports inside it. That takes QualityDiagnostic, the WebGL shader in
 * videoGL and MotionDiagnostic out of the shipped graph entirely, rather than
 * merely splitting them into chunks nobody requests.
 *
 * In production /quality-diagnostic therefore renders the normal application.
 */
let Root: ComponentType = App;

if (import.meta.env.DEV) {
  if (path.startsWith("/motion-diagnostic")) {
    Root = lazy(() => import("./MotionDiagnostic").then((m) => ({ default: m.MotionDiagnostic })));
  } else if (path.startsWith("/quality-diagnostic")) {
    Root = lazy(() =>
      import("./components/QualityDiagnostic").then((m) => ({ default: m.QualityDiagnostic })),
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);
