# Plano de Producao Higgsfield v2 — Video imersivo Sonare (do zero)

Data: 2026-08-07. Status: **aguardando aprovacao do usuario (Gate A). Nenhuma geracao foi executada.**

Complementa `docs/higgsfield-plan.md`, `docs/equipment-scene-reference.md` e `docs/claude-higgsfield-one-prompt.md`. Em conflito, este documento prevalece para a producao v2.

## 1. Decisoes aprovadas pelo usuario

| Tema | Decisao |
| --- | --- |
| Narrativa | Exterior amplo com vista → aproximacao/entrada → home theater com luzes acendendo → projecao da cidade no telao → close S110 na parede direita → area gourmet → cortinas abrem → vista/skyline |
| Luzes | Fora + dentro: janelas ganham brilho na aproximacao externa; iluminacao arquitetural completa a ativacao dentro |
| Projetor | Liga durante a cena, como climax da sequencia de luzes (telao revela a cidade no fim da Cena 2) |
| Corredor | Removido. Living → close S110 direto (push-in) |
| Encerramento | Cortinas abrem → vista/skyline segurada. Logo Sonare e CTA continuam em HTML (`ClosingMoment.tsx`), nunca dentro do video |
| Modelo video | Seedance 2.0, preset General, 8s, 16:9, 4K, bitrate High, audio OFF, `Use free gens` ON, **gerar somente com custo exibido = 0** |
| Modelo stills | `nano_banana_pro` com `resolution: 4k` (confirmado no CLI: ate 14 image_references, 16:9). Decisao reafirmada em 2026-08-07 apos comparacao com Seedream 5.0 Lite — o Lite nao expoe resolucao 4K e e mais fraco em aderencia multi-referencia; permitido apenas como rascunho de direcao para M1/M5, nunca como master. Os 6 masters saem todos do mesmo modelo para evitar drift de render nas juncoes |

## 2. Regras globais (invariantes de toda a producao)

- **Destino de tudo que for gerado:** `media-comparison/higgsfield/new-renders/` (stills em `stills/`, videos em `video/`). Nada entra em `public/` antes da aprovacao visual final.
- Nunca sobrescrever `public/media/web` sem backup e aprovacao.
- Caixas frontais: **B&W 800 Series Diamond de piso em madeira** (autoridade: `bw-wood-floorstanding-style-reference.png`). Nunca 805/bookshelf/pedestal.
- Central: forma da `bw-center-black-form-reference.png`, acabamento amadeirado coordenado, **pedestal dedicado obrigatorio** (nunca flutuando).
- Projetor: **SIM2 UltraNero 4** (`sim2-ultranero4-projector-reference.png`) — chassi preto baixo, lente deslocada, linha vermelha. Nunca o Nero 4 antigo, nunca inventar lettering. `stm2-logo-unverified-reference.png` esta proibido.
- Display S110: `piero-display-interface-reference.png`, instalado **na parede direita**, nunca sobre mesa.
- Remote One: sobre suporte discreto na mesa de centro (corpo cinza, tela superior, botoes pretos); da referencia de embalagem usar apenas o produto.
- Nenhum texto, logotipo ou interface inventada dentro das imagens. Logo Sonare so em HTML.
- Parede do telao lisa: sem movel, rack, nicho, prateleira, receiver, cabos.
- Estetica: arquitetura brasileira contemporanea premium, noturna, luz quente controlada. Proibido neon/cyberpunk/holograma/LED azul/mansao americana/dourado em excesso.
- Camera: lenta, estabilizada (gimbal/dolly), um unico movimento continuo por cena, sem cortes. 35mm ambientes, 50mm closes.
- Direitos: referencias orientam geracao, mas **nada e publicavel** ate confirmacao formal (SKU B&W 804/802 D4 e direitos de uso seguem pendentes — bloqueiam publicacao, nao bloqueiam producao/aprovacao interna).

### Negative prompt global (anexar em toda geracao)

```text
no people, no text, no captions, no subtitles, no watermark, no invented logos, no brand lettering, no neon, no cyberpunk, no holograms, no blue LED strips, no TV cabinet, no media console, no rack, no shelves, no niches, no visible cables, no generic electronics, no extra speakers, no bookshelf speakers, no speaker stands, no camera shake, no cuts, no whip pan, no drone shot, no fisheye, no oversaturated colors, no American mansion, no excessive gold, no marble palace, no showroom look
```

## 3. Mapa de continuidade — 6 quadros masters, 5 cenas

```
M1 exterior amplo ─S1→ M2 fachada/porta ─S2→ M3 home theater ativo ─S3→ M4 close S110 ─S4→ M5 gourmet cortinas fechadas ─S5→ M6 vista/skyline aberta
```

- O quadro final de cada cena **e o mesmo arquivo** usado como quadro inicial da seguinte.
- Cada still novo e gerado por image-to-image a partir do anterior aprovado + referencias de equipamento, mudando somente o previsto.
- A cidade projetada no telao (M3) e a mesma cidade da vista final (M6) — fecha o arco narrativo.
- Total: 5 cenas × 8s = **40s** de jornada (site atual: 29s; o scroll runway se ajusta em `timeline.ts`).

## 4. Fase A — Stills masters (Nano Banana Pro 4K, 16:9)

Aprovacao um a um, na ordem, antes de qualquer video. Poucas variacoes com diferencas controladas; escolher 1 e seguir.

### M1 — `sonare-v2-m1-exterior-wide.png`
- **Objetivo:** abertura da jornada; casa alto padrao vista de longe com bela vista. Recebe o HeroOverlay do site → preservar espaco negativo no ceu (terco superior) e nao poluir o centro-esquerda.
- **Enquadramento:** wide levemente elevado, eixo de aproximacao ate a entrada visivel; 35mm.
- **Transformavel na S1:** somente posicao da camera + luzes da casa despertando.

```text
Photorealistic elevated wide establishing shot at night of a premium contemporary Brazilian hillside residence seen from a moderate distance, horizontal architectural volumes of natural wood, stone and floor-to-ceiling glass, cantilevered roof planes, discreet landscape lighting along the entry path, a breathtaking view of distant city lights on the horizon below a clear dark sky, most windows still dark with the first warm interior lights just beginning to glow, calm and silent atmosphere, architectural photography style, 35mm lens, eye slightly above ground level aligned with the entry axis, high dynamic range with preserved shadows, natural materials, black silver and restrained gold Sonare mood, exact 16:9 composition with quiet negative space in the upper third of the sky, no people, no text.
```

### M2 — `sonare-v2-m2-facade-threshold.png`
- **Objetivo:** fim da S1 / inicio da S2; camera junto a fachada, porta-janela de vidro **fechada**, interior do home theater visivel em penumbra.
- **Base:** image-to-image de M1 (mesma casa, materiais, paisagem, noite).
- **Transformavel na S2:** porta abre, camera cruza, luzes internas ativam, telao revela cidade.

```text
Same residence, same night, same materials and lighting direction as the approved wide master. Camera now close to the main facade at eye level on the entry axis, 35mm, facing a large closed sliding glass door-window framed in dark metal. The facade and landscape lights are now warmly awake. Through the glass, a dim sophisticated home cinema living room is faintly visible in penumbra: silhouettes of two floorstanding speakers and a smooth front wall, no details yet. Reflections on the glass are subtle and realistic. Exact 16:9, architecture, perspective and proportions consistent with the previous frame, no people, no text, no invented logos.
```

### M3 — `sonare-v2-m3-home-theater-active.png`
- **Objetivo:** master da cena de cinema ativo — o quadro mais importante. Fim da S2 / inicio da S3.
- **Referencias anexas:** `bw-wood-floorstanding` (autoridade torres), `bw-center-black-form` (forma da central), `sim2-ultranero4` (projetor), `piero-display-interface` (S110 pequeno na parede direita), `handheld-control-on-support` (somente o produto, na mesa).
- **Composicao critica:** parede do telao a frente/esquerda; **parede direita lisa recuando em profundidade com o S110 instalado, pequeno mas legivel** — e o alvo do push-in da S3.

```text
Photorealistic premium contemporary Brazilian home cinema living room at night, fully active. Fixed eye-level architectural camera slightly left of the room axis, 35mm, exact 16:9 continuity master frame. The front cinema wall is perfectly smooth and minimalist with no furniture, no cabinet, no shelves, no niches. A large 16:9 retractable projection screen is lowered and glowing with a cinematic night city skyline projection. Exactly two Bowers & Wilkins 800 Series Diamond floorstanding speakers in Satin Walnut stand symmetrically at the far left and far right of the screen, following the supplied wood floorstanding reference for silhouette, separated turbine head, exposed drivers and metal details; never bookshelf speakers. One coordinated wood-finish center speaker sits below the screen on its own dedicated low pedestal. A SIM2 UltraNero 4 projector is ceiling-mounted and aligned with the screen, matching the supplied reference: low black rectangular chassis, offset large lens, red diagonal top line, restrained front branding, subtle light beam. Warm architectural lighting fully active: indirect cove light, low wall washers, controlled contrast with preserved shadows. Between camera and screen, a refined low center table holds the supplied gray Piero handheld remote resting upright on a discreet support. The smooth right-side wall recedes into the room's depth, and flush-mounted on it, small but clearly legible, is the supplied Piero S110 wall display with its real interface glowing softly. Comfortable modular sofa in neutral fabric, wood, stone and brushed metal materials, black silver and restrained gold accents. No people, no text overlays, no invented logos, no cables, no extra equipment.
```

### M4 — `sonare-v2-m4-s110-close.png`
- **Objetivo:** fim da S3 / inicio da S4; autoridade do produto. Somente produto + parede.
- **Referencia anexa:** `piero-display-interface-reference.png` (layout, proporcoes e identidade **exatos**).
- **Fallback ja previsto:** se a IA nao preservar a interface, gerar o display com tela escura e compor a interface real em pos (mascara/camada) — regra de `product-accuracy`.

```text
Photorealistic close-up of the supplied Piero S110 wall display flush-mounted on a smooth warmly lit architectural wall, 50mm lens, shallow depth of field, eye level, exact 16:9. The display fills the frame with comfortable margins of clean wall around it: black glass front, slim bezel, softly glowing real interface exactly as the supplied reference — clock, weather panel and the bottom row of smart home function icons — with correct layout and proportions, no invented elements, no redesigned UI. Warm indirect light grazes the wall surface revealing subtle texture. Nothing else in frame: no furniture, no cables, no reflections of people, no text besides the authentic interface.
```

### M5 — `sonare-v2-m5-gourmet-curtains-closed.png`
- **Objetivo:** fim da S4 / inicio da S5; area gourmet premium com cortinas fechadas dominando o fundo.
- **Base:** image-to-image mantendo paleta/materiais de M3 (mesma residencia).

```text
Photorealistic premium contemporary Brazilian gourmet area at night in the same residence, continuous material palette: noble wood cabinetry, stone island counter, brushed black metal, warm pendant lights over the counter, discreet architectural cove lighting active. Fixed eye-level camera, 35mm, exact 16:9, frontal composition facing the far wall: a full-height floor-to-ceiling glass wall completely covered by elegant closed curtains in a warm neutral linen tone, softly lit, clearly the dominant element of the background. Foreground edges show the island and cabinetry framing the view naturally. Refined, silent, high-end residential atmosphere. No people, no text, no invented logos, no clutter, no small appliances.
```

### M6 — `sonare-v2-m6-skyline-open.png`
- **Objetivo:** quadro final da jornada; cortinas abertas, vista panoramica. Recebe `ClosingOverlay` (logo + tagline + CTA) → **centro-inferior calmo e escuro o bastante para texto branco**.
- **Base:** image-to-image de M5 — mesma camera, mesma sala; muda somente cortina + vista + nivel de luz interna.

```text
Exactly the same gourmet area, camera position, lens and framing as the approved curtains-closed master. The curtains are now fully open, gathered elegantly at both sides, revealing a panoramic floor-to-ceiling glass wall with a breathtaking night city skyline — the same city seen in the cinema projection — with realistic bokeh-free depth, distant lights and a dark sky. Interior architectural lighting is slightly dimmed so the view dominates, warm reflections controlled on the glass. Calm, contemplative, premium. Keep the lower center of the frame visually quiet and dark enough for white overlay text. Architecture, furniture, materials and proportions identical to the previous frame; only curtains, view and light level changed. No people, no text, no logos.
```

## 5. Fase B — Videos (Seedance 2.0, 8s cada)

Config fixa de todas: preset **General**, **8s**, **16:9**, **4K**, bitrate **High**, audio **desligado**, `Use free gens` **ON**, custo exibido **0** (senao, nao gerar). Start frame + end frame sempre anexados.

### S1 — `sonare-v2-scene-01.mp4` (M1 → M2)
- **Movimento:** slow dolly-in unico pelo eixo de entrada.
- **Transformavel:** posicao da camera; luzes da casa acendendo gradualmente (janelas ganham brilho quente).
- **Imutavel:** arquitetura, paisagem, vista, clima, materiais, altura de camera.

```text
Slow continuous cinematic dolly-in at night, approaching a premium contemporary Brazilian hillside residence along its entry axis, starting from the elevated wide view and ending close to the main facade facing the large closed sliding glass door. As the camera approaches, the house gradually wakes up: warm interior lights come on progressively behind the windows and the facade lighting gently brightens. Stabilized gimbal movement, constant gentle speed, 35mm, no cuts, no shake. Architecture, landscape, distant city view and materials remain identical; only camera position and lighting activation change. No people, no text.
```

### S2 — `sonare-v2-scene-02.mp4` (M2 → M3) — cena de maior risco
- **Movimento:** dolly-in continuo cruzando a porta de vidro que desliza aberta, revelando o home theater.
- **Transformaveis (em ordem):** porta abre → camera entra → iluminacao arquitetural ativa em progressao (sanca/indireta primeiro) → nos ~2s finais o telao acende revelando a cidade (climax; feixe sutil do projetor).
- **Imutavel:** arquitetura, moveis, posicao dos equipamentos, altura de camera.
- **Estrategia de retry:** se o Seedance nao segurar tantas transformacoes, plano B = projecao ja fracamente visivel desde o inicio, apenas ganhando brilho no final (reduz uma transformacao sem mudar a narrativa).

```text
Single continuous cinematic camera move at night, no cuts: the large sliding glass door opens smoothly and the camera glides forward through it into a premium Brazilian home cinema living room, settling into a fixed eye-level frontal frame of the cinema wall. As the camera enters, warm architectural lighting activates progressively — indirect cove light first, then low wall washers — revealing two Bowers & Wilkins 800 Series Diamond walnut floorstanding speakers, a wood center speaker on its dedicated pedestal and a ceiling-mounted SIM2 UltraNero 4 projector. In the final two seconds the retractable projection screen comes alive, revealing a cinematic night city skyline as the projector beam subtly appears. Slow stabilized dolly, constant speed, 35mm. Architecture, furniture and equipment positions never change; only door, camera position, lighting and screen state change. No people, no text, no invented logos.
```

### S3 — `sonare-v2-scene-03.mp4` (M3 → M4)
- **Movimento:** push-in diagonal lento do quadro amplo ate o close do S110 na parede direita. So camera; ambiente estatico (projecao segue viva no fora de quadro/reflexos sutis).

```text
Slow continuous diagonal push-in inside the active home cinema at night, no cuts: starting from the wide frontal frame with the glowing city projection, the camera glides forward and to the right, past the sofa, toward the smooth right-side wall, ending in a tight 50mm-feel close-up of the flush-mounted Piero S110 wall display with its real interface softly glowing, centered with clean wall around it. Depth of field gently narrows onto the display. Lighting, projection glow and every object remain unchanged; only the camera moves. Stabilized, constant gentle speed. No people, no text, no invented UI elements.
```

### S4 — `sonare-v2-scene-04.mp4` (M4 → M5)
- **Movimento:** recuo + deslize lateral continuo saindo do close, atravessando a passagem e assentando no quadro frontal do gourmet (cortinas fechadas).
- **Risco:** o trajeto entre os dois ambientes e arquitetura "inventada" pelo modelo — aprovar com atencao a coerencia de materiais/pé-direito.

```text
Single continuous cinematic camera move at night, no cuts: pulling back smoothly from the close-up of the Piero S110 wall display, the camera glides laterally through an elegant open passage of the same residence — noble wood, stone and warm indirect architectural light — and settles into a fixed eye-level 35mm frontal frame of the premium gourmet area: stone island, wood cabinetry, warm pendant lights, and a full-height glass wall completely covered by elegant closed linen curtains dominating the background. Constant slow stabilized speed, coherent architecture and materials throughout, ceiling height and lighting direction consistent. No people, no text, no logos.
```

### S5 — `sonare-v2-scene-05.mp4` (M5 → M6)
- **Movimento:** push-in lento em direcao as cortinas; cortinas abrem do centro para os lados; vista revelada; camera assenta e **segura o quadro final** (~1s) para o overlay de marca do site.

```text
Slow continuous cinematic push-in at night toward the full-height curtains of the premium gourmet area, no cuts: as the camera gently approaches, the elegant linen curtains open smoothly from the center outward, revealing a panoramic floor-to-ceiling night city skyline — the same city seen in the cinema projection. Interior lights dim slightly so the view dominates. The camera settles and holds a calm contemplative final frame of the open view for the last second. Stabilized, constant gentle speed, 35mm. Architecture, furniture and materials identical; only curtains, camera position and light level change. No people, no text, no logos.
```

## 6. Fase C — Pos-producao (derivados, nunca fonte)

1. QA por take: duracao, contagem de frames (esperado 8s ~192f @24fps — confirmar fps real entregue), juncoes M(n) x M(n+1), freezes perceptiveis, deformacao de produto.
2. Master unico opcional por concat ffmpeg (derivado): 16:9 preservado, H.264 High, yuv420p, BT.709 **tv/limited** com tag explicita, faststart, sem audio.
3. Derivados por cena para o site (pipeline ja existente em `media-comparison/scene01-fidelity/tools/`): remux tv → GOP-6 (`make-gop.sh`) → reverse → poster AVIF da cena 1 → validacao (`verify-scenes.mjs`, junctions, interp-qa).
4. Checar frame 0 da nova cena 01 (nitidez/settle) — decidir novo `INTRO_OFFSET_FRAMES` por medicao, como feito no v1.

Nomenclatura final (apos aprovacao, espelhando o padrao atual): `scene-0X-4k-bt709-tv-gop6.mp4` + `-reverse.mp4` + `scene-01-poster-desktop.avif`.

## 7. Fase D — Integracao no site

- Atualizar `src/content/timeline.ts`: 5 novos segmentos (durations/frames/mediaFrames reais medidos), `SEGMENT_START_FRAME`, `GLOBAL_DURATION`, offset da intro, e **re-timing de todos os overlays** para os novos momentos (SIM2 agora aparece na S2, nao mais na S1; S110 na S3; cortinas na S5).
- Manter: fallback mobile, `prefers-reduced-motion` (stills), variantes de media, `ClosingOverlay` sobre o frame final segurado.
- Atualizar stills de `public/media/stills/` a partir dos novos masters aprovados (backup dos atuais antes).
- `npm run build` + teste local no Vite (scroll forward/backward, juncoes, cards).
- Assets antigos permanecem intactos ate aprovacao visual final do usuario.

## 8. Checklist de validacao (gate por asset, antes de gastar geracao seguinte)

- [ ] Still inicial aprovado pelo usuario
- [ ] Still final aprovado lado a lado: arquitetura, camera, lente, proporcoes, quantidade de objetos e materiais identicos; somente a transformacao prevista mudou
- [ ] Produtos fieis as referencias (torres de piso, central com pedestal, UltraNero 4, S110 na parede, Remote One na mesa)
- [ ] Nenhum texto/logotipo/interface inventado
- [ ] Video: movimento unico continuo, sem cortes/tremido, inicio e fim batendo com os stills
- [ ] Custo exibido era 0 na geracao
- [ ] Arquivo salvo em `media-comparison/higgsfield/new-renders/` com nome padronizado

## 9. Pendencias e riscos

| Item | Tipo | Tratamento |
| --- | --- | --- |
| SKU B&W (804 D4 vs 802 D4) + direitos de publicacao de todas as marcas | Pendencia externa | Nao bloqueia producao/aprovacao interna; **bloqueia publicacao** no site |
| Fidelidade da interface S110 no M4/S3 | Risco alto | Fallback: display com tela escura + composicao da interface real em pos |
| S2 com 3 transformacoes (porta, luz, telao) | Risco medio | Plano B documentado (projecao ja fracamente visivel) |
| Trajeto S4 entre ambientes e inventado | Risco medio | Aprovacao cuidadosa do take; regenerar so a S4 se falhar |
| Janela promocional free gens | Operacional | Conferir custo 0 antes de cada envio; parar se cobrar |
| Fps/resolucao real entregue pelo Seedance | Operacional | Medir no primeiro take e propagar para timeline/ffmpeg |

## 10. Validacao do passo 0 (executada em 2026-08-07)

- CLI autenticado: workspace `Private` (724e5cbc), conta lukiiinhascaldeira96.lc@gmail.com — **plano free, 0.28 creditos**.
- Conta Higgsfield conectada via MCP (workspace privado d841d743): **plano Plus, 503.75 creditos**.
- **Custos reais medidos via `higgsfield generate cost` (canario executado antes de qualquer geracao — nada foi gasto):**

| Geracao | Custo | Total no plano |
| --- | --- | --- |
| Still `nano_banana_pro` 4K | 4 cr | 6 masters = 24 cr (+ retries) |
| Still `nano_banana_pro` 2K | 2 cr | — |
| Still `nano_banana_flash` (NB2) | 1.5 cr | opcao rascunho |
| Still `seedream_v5_lite` high | 1 cr | opcao rascunho |
| Video `seedance_2_0` 4K 8s (high ou standard) | **176 cr** | 5 cenas = **880 cr** |
| Video `seedance_2_0` 1080p 8s high | 72 cr | 5 cenas = 360 cr |

- **Conclusao:** producao 4K completa por creditos (~904 cr minimo, sem retry) **nao cabe** nem na conta Plus (503.75). A rota dos videos 4K a custo 0 e a janela promocional `Use free gens` na UI do Higgsfield (exatamente como o v1 foi produzido e como docs/claude-higgsfield-one-prompt.md assume). Estrategia hibrida proposta: stills via conta Plus (24-40 cr), videos pela UI com free gens usando o kit pronto (prompt + start/end frames por cena); se a promo nao estiver ativa, decidir entre 1080p por creditos (360 cr) ou top-up.
- Precos medidos na tabela da conta free via CLI; conferir se a tabela da Plus diverge no primeiro envio.
- Parametros do `seedance_2_0` confirmados via `higgsfield model get seedance_2_0 --json`:

| Parametro | Valor da producao | Observacao |
| --- | --- | --- |
| `resolution` | `4k` | Default e 720p — passar explicito. Exige `mode: std` |
| `duration` | `8` | Default e 5 — passar explicito |
| `bitrate_mode` | `high` | |
| `aspect_ratio` | `16:9` | |
| `generate_audio` | `false` | **Default e true — obrigatorio desligar** |
| `start_image` / `end_image` | M(n) / M(n+1) | Suportados nativamente — e a espinha da continuidade |
| `image_references` | refs de equipamento por cena | Ate 9 imagens no total contando start/end |
| `genre` | `auto` | |

## 11. Ordem de execucao e gates

```
0. [FEITO] higgsfield account status + workspace set + model get seedance_2_0 --json
1. GATE A — usuario aprova este plano
2. Fase A: M1 → M6 em sequencia (aprovacao por still; image-to-image encadeado + referencias)
3. GATE B — usuario aprova os 6 masters
4. Fase B: S1 → S5 (start/end frame; aprovacao por take; retry pontual)
5. Fase C: QA + derivados ffmpeg (+ master unico opcional)
6. GATE C — aprovacao visual final
7. Fase D: integracao, build, teste local. Assets antigos so saem depois do OK visual do usuario
```
