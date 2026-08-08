# Brand Assets

Use this folder only for selected web-ready Sonare assets.

Source material lives outside the repo at:
C:\Users\Caldeira\OneDrive\Documentos\Sonare\Identidade Visual

Confirmed brand direction:
- Logo 1 is for light backgrounds;
- Logo 2 is for dark backgrounds;
- colors: black `#000000`, ink `#141414`, white `#FFFFFF`, silver `#CBCBCB`, gold `#CF9F52`;
- typography: Grandis Extended for brand moments and headings, readable system font for body copy;
- patterns: use only optimized selected files from `04- PATTERN`, with subtle opacity;
- imagery: select from `12- IMAGENS` and new official images added by the client, then export responsive AVIF/WebP/JPG versions.

Rules:
- do not copy the full identity package into the app;
- keep originals outside the public bundle;
- Grandis Extended is approved by the client for website use because it was delivered by the agency in the identity package;
- document every selected production asset here when added;
- products, third-party logos and Piero UI require official, authorized or client-provided material.

## Selected production assets
- `sonare-logo-dark.png` (800w): official Logo 2 lockup (gold symbol + white wordmark) cropped from `01- LOGOTIPO\PNG\SONARE_LOGOTIPO_PNG_02.png` (alpha bbox 1570x430 at x175,y325 of the 1920x1080 export). Used in navbar, narrative closing and footer — all dark surfaces.
- `sonare-logo-light.png` (800w): official Logo 1 lockup (gold symbol + black wordmark) from `SONARE_LOGOTIPO_PNG_01.png`, same crop. Reserved for future light surfaces; not currently rendered.
- `sonare-mark-192.png` / `sonare-mark-64.png`: square crop of the gold symbol alone, used as favicon and apple-touch-icon (gold reads on both light and dark browser chrome).
- `src/assets/fonts/GrandisExtended-{Regular,Medium,Bold}.ttf`: only the three weights currently used in the UI, loaded via `@font-face` in `src/styles.css` with `font-display: swap`. Not yet converted to WOFF2 (no conversion tooling available in this environment); revisit for a file-size optimization pass.
- The previous `sonare-logo.svg` was the full identity board (background plate, palette bars, multiple lockups) and was removed from the public bundle; the vector master remains in the identity folder.
- Additional imagery from `12- IMAGENS` is still pending selection.

