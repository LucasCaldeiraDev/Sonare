import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite does not read PORT on its own; honouring it lets more than one agent or
// terminal run this dev server side by side. Dev-only — `vite build` is unaffected.
const envPort = Number(
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PORT,
);

/**
 * The diagnostic routes are client-side only, so the server has to hand them
 * index.html instead of 404ing on a path with no file behind it.
 *
 * @types/node is not a dependency here, so Connect's request is not structurally
 * typed with `url`. Narrowed locally rather than pulling in the whole node type
 * surface for one property.
 */
function diagnosticRewrite(req: unknown, _res: unknown, next: () => void) {
  const r = req as { url?: string };
  if (
    r.url &&
    (r.url.startsWith("/motion-diagnostic") ||
      r.url.startsWith("/quality-diagnostic") ||
      r.url.startsWith("/framing-lab"))
  ) {
    r.url = "/index.html";
  }
  next();
}

export default defineConfig({
  // `host: true` binds the dev server to every interface instead of localhost
  // only, which is what makes http://<ip-da-rede>:<porta> reachable from a
  // phone on the same wifi. Testing this page on a real handset is not
  // optional — the address bar, the autoplay policy and the decoder all behave
  // differently there, and none of it is visible in device emulation.
  server: {
    host: true,
    ...(Number.isFinite(envPort) && envPort > 0 ? { port: envPort } : {}),
  },
  plugins: [
    react(),
    {
      name: "diagnostic-history-fallback",
      configureServer(server) {
        server.middlewares.use(diagnosticRewrite);
      },
      // `vite preview` serves the built bundle and needs the same rewrite,
      // otherwise /quality-diagnostic 404s everywhere except the dev server.
      configurePreviewServer(server) {
        server.middlewares.use(diagnosticRewrite);
      },
    },
  ],
});
