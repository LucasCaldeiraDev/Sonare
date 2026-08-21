# Prompts — conjunto retrato (9:16, Seedance 2.5, 720p)

Os prompts que **produziram o conjunto no ar**, com o que se aprendeu tentando.
Acompanha `docs/portrait-mobile-spec.md`.

Antes de gerar: conferir 9:16, 720p, áudio desligado, Unlimited ligado, custo
exibido 0. Depois de cada take: conferir 24 fps e a contagem de frames antes de
aceitar.

Salvar em `media-comparison/higgsfield/portrait/masters/` como
`scene-0N-portrait-master.mp4` — fora de `public/`, para o pipeline processar.

---

## Leia isto antes de escrever qualquer prompt

Três coisas foram aprendidas caro. Ignorá-las custa gerações.

**1. Porta de dobradiça não abre.** Dez takes pedindo a porta pivotante de
madeira abrir produziram, toda vez, uma câmera espremendo por uma fresta.
Rotação de corpo rígido é ponto fraco conhecido desses modelos. A solução não é
um prompt melhor: é a porta **nunca animar**. Ela fica fechada e a câmera entra
pelo painel de vidro deslizante ao lado — movimento linear, que o modelo faz
bem.

**2. A imagem de referência não decide onde o plano abre.** Dois takes da cena
03, condicionados em imagens completamente diferentes — uma still sintética e o
último frame real da cena anterior — abriram a 39,97 dB **um do outro**, ou seja
no mesmo lugar, e ambos a ~25,5 dB de onde a cena anterior termina. Não adianta
regerar esperando que a âncora mude o ponto de partida. Se as duas pontas não se
encontram, o conserto é no pipeline (ver a ponte interpolada na spec), não em
mais um take.

**3. Dividir uma passagem difícil piora.** A entrada só ficou certa quando
aproximação e travessia foram para **um take só**. Cada divisão reintroduzia a
passagem de bastão que quebrava.

---

## Cena 01 — fachada → entrada → living · 10 s

Três imagens de referência, em ordem narrativa: fachada, limiar (porta fechada
com o vidro aberto), living compactado.

```text
NON-NEGOTIABLE RULE, STATED FIRST: the wood pivot door — the vertical wood slab
door with the long metal bar handle, on the left of the entrance — is CLOSED and
100% STATIC for the entire ten seconds. It does not rotate, swing, twitch, or
change angle by even one degree. It is not the entry point.

THE ENTRY POINT is the full-height, full-width frameless glass sliding wall
immediately to its RIGHT. It spans roughly two adult shoulder-spans: wide enough
to walk through without turning sideways. It slides open horizontally along a
top-and-bottom track, panels stacking back cleanly — it does NOT lift, rotate or
fold. When open there is unobstructed open air across that entire width, floor to
lintel, with visible depth into the room beyond. At no point may the opening
appear as a narrow vertical seam, a cracked single pane, or a gap less than the
full glass wall — if it looks like a sliver at any single frame, that frame is
wrong.

VERTICAL 9:16 FRAME. Single continuous cinematic night camera move, no cuts, no
jump cuts, no whip pans, constant gimbal-stabilised motion with gentle ease-in
and ease-out. 35mm equivalent, moderate depth of field — wide enough that open
space is visible on both sides of the glass opening once it is in frame.

BEAT 1 — 0 to ~3.5 s (reference image 1, facade): camera starts at that exact
framing — full building height, curving stone entry path and landscape bollard
lighting in the foreground, upper-floor curtains closed and glowing warmly,
ground-floor glass dark and bare. Slow steady dolly-in along the path's curve.
The wood door reads closed and static from the very first frame.

BEAT 2 — ~3.5 to ~7 s (reference image 2, threshold): the camera arrives close
to the entrance, squared frontally on the glass wall specifically — not angled
toward the wood door. Hold that alignment for a beat. The glass slides fully
open here, retracting within roughly one second of screen time, revealing the
complete width of the opening BEFORE any further camera advance. Do not advance
while the glass is still mid-motion. Once fully open, the camera resumes forward
and enters through the geometric centre of the opening, with visibly equal clear
space to its left and right.

BEAT 3 — ~7 to 10 s (reference image 3, living): the camera continues past the
threshold into the living room / home theatre and turns smoothly into a fixed
eye-level frontal composition on the cinema wall, framed tall so the full room
reads without cropping: ceiling-mounted projector and the glowing screen (night
skyline projection) in the upper portion, both Bowers & Wilkins floorstanding
towers plus the walnut centre speaker fully visible flanking the screen with no
part cut off, low modular sofa and wood coffee table anchoring the lower portion.
This final held frame must match reference image 3 in composition.

LIGHT CONTINUITY: warm light glows from the entry vestibule and through the
curtains from frame 1; as the glass opens it spills further onto the threshold;
cove lighting and wall washers inside are already warm and steady, becoming
visible as the camera enters, settling into image 3's exact state by the final
frame. No flicker, no light source appearing or disappearing.

HARD NEGATIVES — none of these at any frame: the wood door opening, rotating or
moving; the camera passing through anything narrower than the full glass opening;
a sliver, crack or gap impression at the threshold; any jump cut; any change to
materials, furniture, speaker positions or screen content beyond what is
described; people; text or invented logos.

Keep the subject — building, then the glass opening, then the screen and both
towers — within the middle 80% of frame width throughout.
```

## Cena 02 — living → display S110 · 5 s

Start: último frame da cena 01. End: still do S110.

Push-in simples, sem porta e sem múltiplos beats — por isso 5 s bastam.

```text
Vertical 9:16 frame, single continuous cinematic night camera move, no cuts.

Starting from the frontal frame of the home cinema — glowing city-skyline
projection on screen, both Bowers & Wilkins towers and the centre speaker
readable, low sofa and coffee table in the foreground — the camera performs a
single smooth push-in and slight lateral glide to the right, past the edge of the
sofa, toward the warm wood-panelled wall beside the screen wall.

IMPORTANT FRAMING LIMIT: do not push in too close. Stop while the S110 display
occupies only about one quarter to one third of the frame's width — small and
clearly wall-mounted, not filling the frame. Generous wood panelling must remain
visible on all four sides of the display in the final frame. It should read as a
modest wall fixture inside a large panelled surface, not as a close-up product
shot.

The interface glows softly throughout its reveal — clock, weather card, a row of
smart-home icons — and stays completely stable and legible: it never morphs,
flickers, or rewrites its own text or icons.

Depth of field narrows gently onto the display as the camera approaches, the
room's ambient light and the projection glow softening out of focus behind it —
a natural rack focus, not an abrupt blur cut.

Stabilised gimbal, constant gentle speed with smooth ease-in at the very end,
35mm equivalent. Keep the S110 panel centred within the middle 80% of frame width
for the final two seconds.

HARD NEGATIVES: no jump cut, no camera shake, no zoom bursts, no people, no
invented or extra text on the display, no change to the panelling's material or
colour, no new furniture appearing.
```

> **Nota.** A primeira versão deste prompt não trazia o limite de enquadramento
> e o modelo empurrou até o display ocupar quase o quadro inteiro. O parágrafo
> `IMPORTANT FRAMING LIMIT` é o que corrige.

## Cena 03 — S110 → área gourmet · 8 s

Start: último frame da cena 02. End: still da gourmet.

```text
NON-NEGOTIABLE RULE, STATED FIRST: the very first frame must reproduce the
supplied start frame exactly — same camera position, distance, angle, framing of
the S110 panel, interface content and lighting. Do not open "near" it, do not
drift before starting, do not re-frame it tighter or wider. The camera begins at
rest in that position and only then starts to move.

Vertical 9:16 frame. Single continuous cinematic night camera move, no cuts,
constant gimbal-stabilised motion with gentle ease-in and ease-out. 35mm
equivalent. Approximately 8 seconds.

BEAT 1 — from rest, the camera pulls back smoothly away from the S110 panel,
revealing more of the warm wood-panelled wall. The panel stays legible and stable
as it recedes; its interface never morphs, flickers or rewrites itself.

BEAT 2 — the camera continues back and glides through an adjoining passage of the
same residence, along full-height wood cabinetry. Materials are continuous with
the wall it just left: same wood, dark stone accents, concrete ceiling with warm
cove lighting. Around four seconds in, hold the cabinetry's under-shelf LED
strips and the ceiling cove clearly in frame — this is the shot's equipment beat
and it must be legible, not rushed past.

BEAT 3 — the camera settles into a fixed eye-level frontal frame of the gourmet
area, composed tall: full-height wood cabinetry with its lit niche on one side,
the dark stone island with waterfall edge and bar stools in the lower half, black
pendant lights with gold interiors hanging into the upper half, and the
floor-to-ceiling closed linen curtains filling the background wall, softly lit by
the ceiling cove. The final frame must match the supplied end image exactly.

LIGHT CONTINUITY: the warm cove light and the panel's glow carry through from the
start frame; the gourmet area's LED strips and pendants are already warm and
steady by the time the camera settles. No flicker, no light source appearing or
disappearing.

HARD NEGATIVES: an opening frame that differs from the start frame; any jump cut;
camera shake or zoom bursts; the S110 interface changing its text or icons; room
geometry that does not plausibly connect the wood wall to the gourmet area;
people; text or invented logos.
```

> **Nota.** A regra do primeiro frame **não funcionou** — ver o item 2 da seção
> de aprendizados. Três takes abriram no mesmo ponto, ~5 frames adiante de onde
> a cena 02 termina, independentemente da imagem de condicionamento. O buraco foi
> fechado por interpolação no pipeline, não por prompt. A regra fica aqui porque
> não faz mal, e porque saber que ela não basta é a informação útil.

## Cena 04 — gourmet → cortinas → skyline · 8 s

Start: último frame da cena 03. End: still do skyline.

```text
Vertical 9:16 frame, single continuous cinematic night camera move, no cuts.
Approximately 8 seconds.

Starting from the gourmet area exactly matching the start frame — full-height
wood cabinetry with LED strips, dark stone island with waterfall edge and stools,
black pendant lights, and the far wall filling the background with floor-to-
ceiling closed linen curtains softly lit by ceiling cove light — the camera
advances steadily toward that far glass wall in one continuous dolly-in.

As the camera advances, the linen curtains open smoothly and symmetrically from
the centre outward, each side gathering into soft vertical folds at the edges of
frame. The motion begins within roughly the first one to two seconds and
completes by around the halfway point — fluid continuous fabric motion, not a
sudden reveal.

Opening the curtains reveals a floor-to-ceiling glass wall with a breathtaking
night city skyline beyond: towers, water and reflections, framed vertically by
the gathered curtains like a proscenium. Interior light levels dim gently and
gradually as the skyline takes over as the dominant light source.

The camera continues its dolly-in and settles close to the glass, immersed in the
panorama, holding the last one to two seconds on that contemplative final frame —
matching the end image exactly: skyline centred and dominant, gathered curtains
framing it symmetrically. This is the final frame of the entire mobile film — end
here, no further movement.

Stabilised gimbal, constant gentle speed with smooth ease-in as it settles, 35mm
equivalent. Architecture, furniture and materials coherent throughout — only the
curtains, the camera position and the light level change. Keep the skyline centred
within the middle 80% of frame width in the final frame.

HARD NEGATIVES: no jump cut, no camera shake, no zoom bursts, no people, no text,
no logos, no change to the room's materials or furniture, no curtain motion that
looks like tearing, snapping or teleporting open — it must read as fabric sliding
open on a track.
```

---

## Stills 9:16

Em `media-comparison/higgsfield/portrait/stills-9x16/`. Geradas a partir dos
frames reais dos vídeos aprovados do desktop, com `nano_banana_pro` e a foto real
como referência — nunca reconstruídas por texto, para não inventar detalhe da
casa.

Onde a foto real já servia e só faltava proporção, o caminho foi **outpaint**, não
geração: ele preserva o quadro original pixel a pixel e só estende as bordas. Foi
assim na entrada (`9x16-2-entrada-outpaint.png`) e na imagem do S110 usada na
seção de zoom (`public/media/web/s110-zoom-portrait.webp`), onde o bitmap real da
interface do cliente não podia ser tocado.

## Se precisar regerar uma cena

1. Extraia o **último frame real** da cena anterior do master entregue, não uma
   still sintética — mesmo sabendo que isso não garante o ponto de abertura, é o
   melhor alvo disponível.
2. Gere e **meça as duas emendas antes de aceitar**: contra o último frame da
   anterior e contra o primeiro frame da seguinte.
3. Compare cada emenda com o **passo próprio** da cena de entrada (frame 0 contra
   frame 1). O desvio entre os dois é o que decide se dá para cortar seco.
4. Se a emenda de entrada não fechar, varra a cabeça do take procurando um ponto
   de corte melhor — e varra a cauda da cena anterior. Se o encaixe subir
   monotonicamente até o fim dela, não há corte que resolva: é buraco no percurso,
   e o conserto é a ponte interpolada.
