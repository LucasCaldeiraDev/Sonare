# Prompts — conjunto retrato (9:16, Seedance 2.5, 720p)

Gerado para acompanhar `docs/portrait-mobile-spec.md`. Ordem de execução:
6 imagens de fronteira primeiro, depois os 5 vídeos entre elas.

## Referência real em vez de still gerado — LEIA ANTES DE COMEÇAR

Os 6 quadros de fronteira já foram extraídos DIRETO dos arquivos que o site
serve hoje (aprovados, no ar) — não são reconstrução por texto. Estão em
`media-comparison/higgsfield/portrait/reference-frames/`:

| arquivo | é o quê |
|---|---|
| `still-1-abertura.png` | frame 0 da jornada |
| `still-2-limiar.png` | último quadro da cena 01 = fronteira com a 02 |
| `still-3-cinema-ativo.png` | último quadro da cena 02 = fronteira com a 03 |
| `still-4-close-s110.png` | último quadro da cena 03 = fronteira com a 04 |
| `still-5-gourmet-fechado.png` | último quadro da cena 04 = fronteira com a 05 |
| `still-6-skyline.png` | último quadro da cena 05, fim da jornada |

**Use estes como referência de conteúdo/arquitetura ao gerar cada still em
9:16** (anexe como imagem de referência, não como start/end frame — eles
ainda estão em 16:9). Os prompts de still abaixo dizem o que recompor para
vertical; a imagem real diz como a casa, o equipamento e a luz realmente são.
Isso elimina qualquer risco de eu ter descrito um detalhe errado da casa.

**Para os vídeos:** os 5 arquivos completos que o site serve — mesma pasta,
`public/media/web/scene-0N-4k-bt709-tv-gop6.mp4` (N = 01 a 05) — já estão na
ordem de reprodução certa, prontos para anexar como referência de cada cena
correspondente. **Cuidado se for pegar arquivo em outra pasta:**
`media-comparison/source-archive/v3-masters/` guarda os masters em ordem de
ARQUIVO, não de reprodução — lá, o que toca como cena 03 é o arquivo `004`, e
o que toca como cena 04 é o arquivo `003` (verificado por PSNR, documentado em
`src/content/timeline.ts`). Usando os arquivos de `public/media/web/` esse
risco não existe — é exatamente por isso que a extração acima veio de lá.

Regra de enquadramento que se aplica a TODAS as cenas abaixo, incluída em cada
prompt: numa tela de celular real (0,461 de proporção, não os 0,5625 de 9:16)
`object-fit: cover` ainda corta ~9% de cada lado. Mantenha o assunto principal
dentro dos 82% centrais do quadro.

Ordem: já em ordem NARRATIVA (fachada → entrada → living/cinema → S110 →
gourmet → skyline). O conjunto atual do desktop tem uma inversão de arquivos
por causa de como foi gerado originalmente — não precisa reproduzir isso aqui;
gere direto na ordem 1→5.

Antes de gerar: conferir 9:16, 720p, áudio desligado, Unlimited mode ligado,
custo exibido 0. Depois de cada take: conferir 24fps e a contagem de frames
antes de aceitar.

Salvar tudo em `media-comparison/higgsfield/portrait/` (stills em `stills/`,
vídeos em `video/`) — fora de `public/`, para eu processar antes de publicar.

---

## Imagens de fronteira (gerar primeiro, nesta ordem)

### Still 1 — abertura (primeiro quadro da cena 01)

```text
Vertical 9:16 night photograph, ultra-realistic architectural photography.
A premium contemporary Brazilian hillside residence seen from its curving
stone entry path, two storeys, dark stone and wood-slat cladding, flat
overhanging roofline. The composition is vertical and frames the full height
of the building — foreground path and landscape lighting at the bottom third,
the building filling the middle, night sky with the distant city skyline
glow at the top third. Path bollards and garden lighting are on. Ground-floor
glass is bare, empty, pitch-dark — no curtains, no light behind it, only
faint reflections of the exterior lights. One bedroom window in the stone
volume is warmly lit. Upper-floor curtains are fully closed with a faint warm
glow behind them. No people, no text, no logos.
```

### Still 2 — limiar (fim da cena 01 / início da cena 02)

```text
Vertical 9:16 night photograph, ultra-realistic architectural photography.
Eye-level frontal view of the same residence's entrance: a wide wood pivot
door standing open, revealing a dark living room glimpsed beyond a sliding
glass panel. Vertical composition uses the height of the door and the
double-height ceiling to fill the frame — entry threshold and landscaping at
the bottom, the open doorway as the vertical spine of the image, ceiling and
roofline visible at the top. Warm architectural light spills from just inside.
No people, no text, no logos.
```

### Still 3 — cinema ativo (fim da cena 02 / início da cena 03)

```text
Vertical 9:16 night photograph, ultra-realistic architectural photography.
Inside a premium home cinema, framed to use height: a tall dark stone wall
fills the frame with a retractable projection screen glowing with a night
city skyline image, centered. One Bowers & Wilkins 800 Series Diamond
floorstanding tower speaker in Satin Walnut with a silver turbine head is
clearly readable in the foreground to one side of frame, its full height
from floor to head visible; the matching second tower and the walnut center
speaker on its pedestal are visible at the frame's edge, partially into the
crop. A ceiling-mounted black SIM2 UltraNero 4 projector is visible at the
top of frame, its lens aimed down at the screen, a faint beam visible. Low
modular sofa and wood coffee table with a gray handheld remote in the
foreground. Warm cove lighting and low wall washers. No people, no text, no
invented logos.
```

### Still 4 — close S110 (fim da cena 03 / início da cena 04)

```text
Vertical 9:16 night photograph, ultra-realistic architectural photography.
Close-up, natural slight angle, of a flush-mounted Piero S110 wall display
on warm wood paneling, centered in the vertical frame with generous wood
paneling above and below it. The interface glows softly: clock, weather
card, a row of smart-home icons. Interface crisp, legible, not inventing
extra text. Shallow depth of field, wood grain soft at the edges. No people.
```

### Still 5 — gourmet, cortinas fechadas (fim da cena 04 / início da cena 05)

```text
Vertical 9:16 night photograph, ultra-realistic architectural photography.
A grand premium gourmet area framed vertically: full-height wood cabinetry
with under-cabinet LED strips on one side filling the frame's height, a dark
stone kitchen island with waterfall edge and stools in the lower half, black
pendant lights with gold interiors hanging into the upper half of frame. The
far wall, filling the background, is floor-to-ceiling closed linen curtains
softly lit by ceiling cove light. Concrete ceiling detail visible at the very
top. No people, no text, no logos.
```

### Still 6 — skyline (último quadro da cena 05)

```text
Vertical 9:16 night photograph, ultra-realistic architectural photography.
The same gourmet area, now close to a floor-to-ceiling glass wall with the
linen curtains fully open, gathered in soft folds at the vertical edges of
frame. Beyond the glass, a breathtaking night city skyline fills the
composition — towers, water, reflections — framed by the gathered curtains
like a vertical proscenium. Interior light levels low, the skyline is the
brightest element. No people, no text, no logos.
```

---

## Vídeos (gerar depois, cada um entre duas imagens consecutivas)

### Cena 01 — fachada → entrada · 8s

start_frame: Still 1 · end_frame: Still 2

```text
THE MOST IMPORTANT RULE OF THIS SHOT: the ground-floor glass of the house is
bare, empty, pitch-dark glass from the first frame to the last frame. NO
curtains behind the ground-floor glass at any moment, no light behind it —
only faint realistic reflections of the exterior lights. The one lit bedroom
window in the stone volume stays lit exactly as in both reference images.
Upper-floor curtains stay fully closed for the entire shot.

Vertical 9:16 frame. A slow, continuous cinematic night dolly-in toward the
residence along its curving stone entry path, composed to use the full
height of the frame: landscape and path lighting low in frame, the building
rising through the middle and upper frame as the camera advances. The camera
travels only the distance between the supplied start and end frames and
decelerates smoothly to a full stop at the end frame's exact framing — the
open entrance, never closer, never cropping the upper floor.

Light choreography: first half of the shot, the house sleeps as in the start
frame. Second half, the entry vestibule light turns on and the door begins
to reveal the interior, landing exactly on the end frame's state.

Stabilized gimbal, constant gentle speed, 35mm equivalent, no cuts, no
shake, no zoom bursts. Keep the building and entrance centered within the
middle 80% of the frame width — nothing essential touching the left or right
edge. No people, no text, no logos.
```

### Cena 02 — entrada → living → home theater · 10s

start_frame: Still 2 · end_frame: Still 3

```text
Single continuous cinematic camera move at night, no cuts, vertical 9:16
frame: starting at eye level at the open wood pivot door, the camera glides
forward through the doorway into the dark living room, then turns gently and
settles into a fixed eye-level frontal frame of the home cinema wall, framed
tall — the dark stone wall and the screen fill the frame's height, one B&W
tower speaker fully readable in the foreground with the second tower and the
center speaker visible at the frame's edges.

As the camera enters, warm architectural lighting activates progressively —
ceiling cove first, then low wall washers — gradually revealing the home
cinema: the two Bowers & Wilkins 800 Series Diamond floorstanding towers in
Satin Walnut with silver turbine heads, the matching walnut center speaker on
its pedestal, a low modular sofa, a wood coffee table with a gray handheld
remote. Around two-thirds into the shot, hold the ceiling-mounted black SIM2
UltraNero 4 projector clearly in the upper part of frame as it comes into
view, lens aimed at the screen. In the final two seconds the retractable
screen glows to life with a night city skyline image and a subtle beam
appears from the projector.

Slow stabilized dolly, constant speed, 35mm equivalent. Architecture,
furniture and equipment positions never change; only the door, camera
position, lighting and screen state change. Keep the screen and both towers
within the middle 80% of frame width throughout the second half of the shot.
No people, no text, no invented logos.
```

### Cena 03 — home theater → S110 · 8s

start_frame: Still 3 · end_frame: Still 4

```text
Slow continuous push-in inside the active home cinema at night, no cuts,
vertical 9:16 frame: starting from the frontal frame with the glowing city
projection on screen and both B&W towers readable, the camera glides forward
and to the side, past the sofa, toward the warm wood-paneled wall, the
composition narrowing from the wide cinema view to a close-up of the
flush-mounted Piero S110 wall display seen at a natural slight angle, its
interface softly glowing — clock, weather card, a row of smart-home icons —
surrounded by clean wood paneling filling the frame's height. Depth of field
gently narrows onto the display in the final third of the shot; the
projection glow and room lighting remain visible but soften out of focus
behind it. The interface stays stable and legible throughout, never
morphing or rewriting its text.

Stabilized, constant gentle speed, 35mm equivalent. Keep the S110 panel
centered within the middle 80% of frame width for the last three seconds.
No people, no cuts, no invented text.
```

### Cena 04 — S110 → gourmet · 8s

start_frame: Still 4 · end_frame: Still 5

```text
Single continuous cinematic camera move at night, no cuts, vertical 9:16
frame: pulling back smoothly from the close-up of the wall-mounted S110
display, the camera glides through an elegant passage of the same
residence — wood paneling, dark stone, concrete ceiling with warm cove
light — and settles into a fixed eye-level frontal frame of the gourmet
area, composed tall: full-height wood cabinetry with under-cabinet light
strips filling one side of frame from top to bottom, the dark stone island
with waterfall edge and stools in the lower half, black pendant lights with
gold interiors hanging into the upper half. Around four seconds in, hold the
cabinetry's LED strips and the cove lighting clearly in frame as the camera
settles — this is the shot's equipment beat.

Constant slow stabilized speed, 35mm equivalent, coherent architecture and
materials throughout, warm cinematic lighting. Keep the island and
cabinetry within the middle 80% of frame width. No people, no text, no
logos, no cuts.
```

### Cena 05 — gourmet → cortinas → skyline · 8s

start_frame: Still 5 · end_frame: Still 6

```text
Slow continuous cinematic dolly-in at night through the gourmet area, no
cuts, vertical 9:16 frame: starting from the frontal frame with the
full-height closed linen curtains filling the background, the camera
advances steadily toward the glass wall while the curtains open smoothly
and symmetrically from the center outward, gathering into soft vertical
folds at the edges of frame — beginning in roughly the first second of the
shot and continuing through the middle of it — revealing a floor-to-ceiling
glass wall with a breathtaking night city skyline: towers, water and
reflections, framed vertically by the gathered curtains like a proscenium.
Interior lights dim gently as the view takes over. The camera settles close
to the glass, immersed in the panorama, and holds the final contemplative
frame for the last second.

Stabilized, constant gentle speed, 35mm equivalent. Architecture, furniture
and materials identical; only curtains, camera position and light level
change. Keep the skyline centered within the middle 80% of frame width in
the final frame. No people, no text, no logos.
```
