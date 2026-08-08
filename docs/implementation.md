# Implementação — Experiência Imersiva Sonare

Registro da implementação concluída em 04/08/2026. Este documento é a fonte de
verdade do que está construído; os demais docs de planejamento permanecem como
histórico de direção.

## Conceito narrativo: a travessia pelo S110 em um único arquivo

A jornada tem **3 entradas** em `scenes.ts` e dois capítulos com pin:

1. **Aproximação** (`#experiencia`): fachada noturna → living/home cinema.
2. **Jornada** (`#jornada`): um único master contínuo com a aproximação do
   S110, o close, a **travessia através da interface**, a revelação da área
   gourmet, as cortinas e o skyline noturno de encerramento.
3. Só **depois** disso vem o spotlight editorial do S110 (`#s110`) e as seções
   comerciais.

O ponto central: a passagem do close do display para a área gourmet acontece
**dentro do mesmo arquivo de vídeo** — sem interlúdio editorial, sem corte de
seção, sem crossfade entre elementos diferentes. O display é literalmente um
portal, e nada interrompe essa travessia.

### O master unificado

`public/media/scene-03-04-05-master.mp4` — 18,125 s, 435 frames, 3876×2136,
H.264 24 fps.

As cenas 4 e 5 já eram 3876×2136, mas a cena 3 era 3856×2148 (AR 1,79516 vs
1,81461), então `concat -c copy` puro não era possível. Normalizei **apenas a
cena 3**: crop centrado de 24 linhas (12/12) para 3856×2124 e upscale de 0,57%
para 3876×2136, encodada a CRF 15 com profile/level/pix_fmt/timebase idênticos.
Erro anamórfico residual: 0,046% (sub-pixel no frame inteiro). As cenas 4 e 5
entraram por `-c copy`, **bit a bit originais** — 13,08 s dos 18,12 s intocados.
PTS contínuos nas junções internas (5,041667 s e 10,083333 s), sem frame perdido.

## Três modos de apresentação

| Condição | Tratamento | Componente |
| --- | --- | --- |
| Ponteiro fino + viewport ≥ 900px | Pin + scroll-scrub: o scroll controla o tempo do vídeo | `ScrollNarrative` |
| Touch / viewport estreito | Autoplay-in-view por cena (muted, playsinline, sem pin) | `AutoplayNarrative` |
| `prefers-reduced-motion` | Sequência estática de posters + copy em fluxo normal, zero `<video>` | `StaticNarrative` |

`NarrativeChapter` escolhe o modo via `useViewportProfile` (width + pointer,
re-avaliado em resize e mudanças de media query) e `usePrefersReducedMotion`.

## Motor de scrub — por que seeks não servem

O scrub original escrevia `video.currentTime` a cada tick da timeline e, quando
um seek estava em voo, enfileirava o novo alvo para disparar no `seeked`. Isso
cria uma **cadeia contínua de seeks encostados**, e o teto de atualização passa
a ser `1 / latência_do_seek`. Medido:

| Métrica (baseline, 4K) | Valor |
| --- | --- |
| Seeks efetivos por segundo | 3,6–4,7 |
| Latência média do seek | 199–269 ms (máx 430) |
| Frames apresentados (rVFC) | 2,7–4,7 fps |
| Long tasks | **0** |
| Frames descartados | **0** |

Com a thread principal ociosa e nada descartado, o gargalo era exclusivamente a
latência de seek. Um benchmark isolado confirmou que **nenhum ajuste de encode
resolve por seeks**: mesmo o derivado 1920w só chega a 9,6 fps por esse caminho.

### A solução: tocar, não buscar

`src/lib/scrubEngine.ts` inverte o mecanismo:

- o scroll **só grava um `targetTime`** — nunca escreve `currentTime`;
- um **único laço rAF** (na ticker do GSAP, então a página tem exatamente um)
  aproxima o playhead do alvo;
- **para frente e perto**: o vídeo *toca*, com `playbackRate` proporcional à
  distância (`delta / 0.35`, limitado a 0,25–3×). Playback é acelerado por
  hardware e roda a 24 fps reais; a taxa cedendo a 1 conforme o vão fecha é o
  que dá a inércia cinematográfica;
- **para trás ou salto > 1,5 s**: aí sim um seek — quantizado a 1/24 s, **no
  máximo um em voo**, e mirando onde o alvo *estará* ao término (predição por
  velocidade suavizada), para o frame não chegar já obsoleto;
- alvos antigos nunca se acumulam: o mais recente simplesmente substitui o anterior;
- `requestVideoFrameCallback` confirma frames efetivamente apresentados.

Resultado medido (mesmo harness, comparação direta):

| Gesto | Baseline | Motor novo | + GOP 6/CRF 17 |
| --- | --- | --- | --- |
| lento para frente | 3,6 fps | 28 | **30,1 fps, 0 seeks** |
| rápido para frente | 4,0 | 4,3 | 8,7–16,5 |
| lento de volta | 4,7 | 3,6 | 10,5 |
| rápido de volta | 4,7 | 4,3 | 14,4 |
| troca de direção | 4,0 | 9,0 | 16,9 |
| parar na travessia | 2,7 | 15,3 | 16,0 |

Latência de seek caiu de ~250 ms para **60–110 ms**, e os frames descartados
foram a zero.

### GOP: 6 vs 8 vs 12 (CRF 17, 4K)

| GOP | Latência média | Tamanho (cena 1) |
| --- | --- | --- |
| **6** | **209 ms** | 53,6 MB |
| 8 | 220 ms | 52,0 MB |
| 12 | 244 ms | 49,5 MB |
| 12 @ CRF 15 (anterior) | 274 ms | 67,5 MB |

GOP 6 custa apenas 8 % a mais que GOP 12 e é o mais rápido, então os tiers de
scrub usam **GOP 6, CRF 17, CFR 24 fps, faststart, BT.709 full range**. O 4K
total caiu de 227 MB para **179 MB** — mais leve *e* mais rápido que antes.

### Fallback adaptativo (último recurso, guiado por medição)

O motor mede a própria saúde (`isStruggling()`: ≥6 seeks concluídos com média
> 120 ms). Só então monta um companion 1920w — o arquivo **não é sequer
requisitado** em máquinas capazes. Durante o movimento o motor dirige o
companion; assim que o scroll assenta (160 ms), o 4K recebe o mesmo timestamp e
volta a ser o visível. Ambos os `<video>` têm `key` estável: sem isso o React
reconciliaria por posição e recriaria o elemento principal ao montar o proxy,
recarregando o 4K.

### Sincronia verificada

Vídeo contra o tempo real da timeline, em 10 posições incluindo reversão:
**desvio médio de 0,017 s e máximo de 0,042 s** — menos de um frame a 24 fps —
com 3840 px em todas elas.

> Nota de harness: `scrollTo` programático em laço rAF **disputa com o pin** do
> ScrollTrigger, que restaura a posição a cada frame; o scroll real avança bem
> menos do que o pretendido. Medições de sincronia usam posições discretas com
> assentamento. As tabelas de fps acima continuam comparáveis entre si porque
> baseline e versões novas passaram pelo mesmo harness.

## Mecânica do scrub (desktop)

- GSAP ScrollTrigger com `pin` + `scrub: 0.8`; a timeline é autorada em
  segundos de footage (dummy tween fixa a duração total).
- Ritmo: `SCROLL_VH_PER_SECOND = 62` (~10 telas para o Ato I, ~8 para o Ato II).
- Vídeo, crossfades e rail de progresso seguem o tempo SUAVIZADO da timeline
  (callback `onUpdate` da própria timeline), mantendo frames e blends em sincronia.
- Seeks assíncronos: alvo mais novo fica em fila enquanto `video.seeking`;
  o evento `seeked` descarrega a fila — o frame converge sempre para o scroll.
- Crossfade de 0.4s (domínio do footage) na fronteira entre cenas adjacentes;
  como os frames de fronteira coincidem, o blend apenas mascara jitter de encode.
- Camadas fora da janela ativa ficam `visibility: hidden` (economia de composição).
- Endurecimento contra abas em background: `ScrollTrigger.refresh()` síncrono no
  mount + retry em 250ms + refresh global em `visibilitychange` (lib/gsap.ts).

## Colorimetria — a maior causa de perda visual (corrigida)

Os masters vieram **sem nenhuma metadata de cor**. Medindo o sinal:

- histograma de luma **contínuo a partir de 0**, sem pico em 16 e sem lacuna abaixo;
- mínimo global 3, máximo global 250.

Ou seja: o conteúdo é **full range (0–255)**, não limited (16–235). Sem tag, o
Chrome assume limited e expande 16–235 → 0–255, o que **corta tudo abaixo de 16
para preto** e estoura acima de 235. Medido no navegador, comparando o mesmo
frame:

| | pixels em preto puro | luma mínima | luma média |
| --- | --- | --- | --- |
| Antes (sem tag → tratado como limited) | **1,34 %** | 0 | 49,3 |
| Depois (full range explícito) | **0 %** | 1 | 58,7 |

A imagem inteira estava ~16 % mais escura e 1,34 % dela literalmente esmagada.

Correção aplicada a **todos** os encodes e stills:

- filtro com `in_range=full:out_range=full` (os níveis passam sem conversão);
- tags de contêiner `-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range pc`;
- VUI no bitstream via `-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=on`.

Verificado no bitstream (`trace_headers`): `video_full_range_flag = 1`,
`colour_primaries = 1`, `transfer_characteristics = 1`, `matrix_coefficients = 1`.
Verificado no Chrome: pixels renderizados batem com o decode do ffmpeg dentro de
±1 (arredondamento de chroma upsampling).

> Nota: a conversão **não** foi automática. O range foi medido no master antes de
> decidir; tagear como limited teria esmagado as sombras, e converter full→limited
> teria lavado os pretos.

## Pipeline de vídeo (ffmpeg 9)

Masters intocados em `public/media/`. Derivados em `public/media/web/`:

| Saída | Parâmetros | Racional |
| --- | --- | --- |
| `*-desktop4k.mp4` | **3840w**, H.264 high, **CRF 15**, `-tune film`, GOP 12, faststart, BT.709 full range | Tier UHD; sem sharpen e sem denoise, preserva textura de parede, folhagem, pedra e skyline |
| `*-desktop.mp4` | 1920w, H.264 high, CRF 18, GOP 12, faststart | Tier HD |
| `*-mobile.mp4` | 960w, H.264 main, CRF 24, GOP 48 | Playback linear leve |
| `*-poster-{desktop,mobile}.webp` | primeiro frame, q88/q82, decodificado em full range | Poster imediato; o do hero é o LCP (preload no index.html) |
| `*-lqip.webp` | 32w, inline base64 em `scenes.ts` | Placeholder instantâneo antes do poster |
| `scene-03-04-05-endframe-*.webp` | último frame do master unificado | Fundo do encerramento nos modos autoplay/estático |

GOP 12 nos dois tiers de desktop mantém o custo de seek baixo em ambas as
direções do scrub, inclusive em 4K.

**Peso e a alavanca de CRF.** O 4K a CRF 15 é caro:

| Arquivo | Duração | Tamanho | Bitrate |
| --- | --- | --- | --- |
| `scene-01-desktop4k.mp4` | 7,04 s | 67,5 MB | 80,5 Mbps |
| `scene-02-desktop4k.mp4` | 4,04 s | 29,0 MB | 60,3 Mbps |
| `scene-03-04-05-desktop4k.mp4` | 18,12 s | 130,2 MB | 60,2 Mbps |
| **subtotal 4K** | | **227 MB** | |
| subtotal 1920 | | 39 MB | |
| subtotal mobile | | 4,8 MB | |

Medi VMAF da cena 1 contra o master para saber se CRF 15 se justifica:

| Encode | VMAF médio | Mínimo | Tamanho |
| --- | --- | --- | --- |
| CRF 15 (atual) | 80,20 | 63,30 | 67,5 MB |
| CRF 17 | 79,66 | 63,11 | 49,5 MB (−27 %) |
| CRF 19 | 78,97 | 62,81 | 36,1 MB (−47 %) |

A diferença entre CRF 15 e 17 é de **0,54 ponto VMAF** — bem abaixo do limiar
perceptível (~6 pontos). Ou seja: CRF 17 cortaria mais de um quarto do peso
sem diferença visível. Mantive CRF 15 porque foi o pedido explícito e a imagem
é o principal ativo comercial, mas **essa é a alavanca óbvia** se o peso
incomodar — é uma linha em `encode-final.sh`, sem tocar em mais nada.

(Os valores absolutos de VMAF ficam na casa dos 80 porque a referência é o
master 3876 px reescalado para 3840; o que importa aqui é a comparação relativa.)

### Seleção de tier (um arquivo por cena, decidido antes do download)

`src/lib/videoTier.ts` resolve o tier **antes** de o `<video>` existir, e o
`SceneVideo` congela essa escolha no mount (`useState` com inicializador) — trocar
`src` em voo descartaria buffer e causaria download duplo.

| Condição | Tier | Arquivo |
| --- | --- | --- |
| touch / viewport < 900px | `mobile` | 960w |
| desktop com largura CSS < 1440px | `hd` | 1920w |
| desktop, ponteiro fino, largura CSS **≥ 1440px** | `uhd` | **3840w** |
| qualquer viewport com largura física ≥ 2560px | `uhd` | **3840w** |
| `saveData` ou conexão 2G/3G | `hd` (teto) | 1920w |

A regra de 1440 px CSS serve 4K a um monitor 1080p comum em DPR 1 de propósito:
deixar o navegador reduzir 3840 → 1920 é **supersampling**, e preserva bem mais
detalhe do que um arquivo nativo de 1920.

### Preload

- só a cena em exibição carrega integralmente (`preload="auto"`);
- a seguinte fica em `metadata` até o viewer passar de **65 %** da cena atual;
- capítulos abaixo da dobra nem montam os `<video>`;
- o LQIP some assim que o vídeo está pronto, e a ordem de camadas é fixa por
  z-index (LQIP `z-0` → poster `z-[1]` → vídeo `z-[2]`).

## Legibilidade sem escurecer a cena

O scrim global anterior (38 % da altura, preto a 70 %) escurecia a residência
inteira o tempo todo. Foi removido. No lugar:

- cada card **narrativo** carrega sua própria máscara radial, confinada ao seu
  canto (~52 % da largura), com pico de 44 % de opacidade e feather até
  transparente antes do meio do quadro;
- os chips de **equipamento** já têm painel próprio com blur, e não adicionam
  máscara nenhuma sobre a cena;
- como a máscara vive dentro do card, **trechos sem texto não têm gradiente algum**;
- no mobile, onde o texto ocupa a largura toda, há um gradiente inferior — mas
  ele só aparece quando existe conteúdo sendo lido.

## Overlays de equipamento sincronizados ao vídeo

Legendas temporizadas vivem em `scenes.ts` (`SceneOverlay[]` por cena) com
`start`, `end`, `title`, `description`, `position`, `align`, `equipment` e
`kind`. Renderizadas em HTML/CSS por `OverlayCard` — nunca gravadas no arquivo
de vídeo, portanto nítidas em qualquer resolução, inclusive 4K.

Duas vozes: `narrative` (bloco editorial no terço inferior) e `equipment`
(chip discreto com borda e blur, ancorado a um canto, nomeando o equipamento
visível). Nenhum modelo ou especificação foi inventado — os textos citam apenas
o que já está confirmado no briefing e visível em cena.

Como cada modo os conduz:

| Modo | Fonte do tempo | Quem anima |
| --- | --- | --- |
| Scrub (desktop) | tempo suavizado da timeline GSAP | GSAP (`fromTo`/`to` em opacity/y) |
| Autoplay (mobile) | `timeupdate` do próprio `<video>` | CSS (classes de transição) |
| Reduced motion | — | Sem animação: viram texto permanente na seção |

GSAP e CSS nunca controlam o mesmo elemento: `OverlayCard` só aplica classes de
transição quando recebe a prop `visible` (modo autoplay); no scrub ele nasce sem
transição alguma e o GSAP é o dono exclusivo de opacity/transform.

No mobile, o handler de `timeupdate` consulta um `inViewRef` antes de recalcular:
`video.pause()` emite um `timeupdate` final que, sem essa guarda, restauraria
justamente as legendas que acabaram de ser limpas.

Ainda no mobile, a saída é uma transição CSS de 500 ms, então o card precisa ser
**avisado meio segundo antes** (`t <= end - 0.5`, `OVERLAY_FADE_LEAD`). Sem essa
antecipação duas regras quebravam: as legendas do S110 continuavam na tela
depois do início da travessia, e etapas contíguas (uma terminando exatamente
onde a outra começa) ficavam sobrepostas enquanto uma saía e a outra entrava.

### Micro-pausa entre etapas — decisão consciente

No scrub, o fade-in dura 0,55 s a partir de `start` e o fade-out termina em
`end`. Como as janelas de etapas são contíguas, existe uma passagem de ~0,5 s
em que a etapa que sai já está abaixo de 50 % e a que entra ainda não chegou
lá. **Isso é intencional**: lê-se como um card se atualizando, e é o que garante
que nunca haja dois cards competindo. Não tratar como bug em rodadas futuras.

### Cronometragem por visibilidade real

As janelas não foram estimadas por cena: cada clipe foi amostrado a cada 0,25 s
e os frames foram observados um a um para achar o instante em que cada
equipamento fica **inequivocamente identificável** e o instante em que sai de
quadro. Achados que mudaram o resultado:

- **Projetor (fachada):** fica bissectado pelo montante da porta até 3,0 s e só
  a 3,25 s aparece corpo + lente + haste sem obstrução — permanecendo até o
  último frame. O card antigo do projetor estava na cena 2, onde o projetor sai
  de quadro em 0,62 s; por isso aparecia "tarde demais".
- **B&W (living):** a torre frontal direita está em quadro o clipe **inteiro**
  (0 → 4,04 s) e a central até 2,85 s. O card antigo durava 2,2 s.
- **S110 (jornada):** identificável a partir de 1,8 s; a travessia começa em
  7,09 s. Daí a janela 1,6 → 7,05 s, encerrando antes da passagem.
- **Espaço negativo:** o canto superior esquerdo da fachada só é seguro até
  3,25 s, então o card do projetor foi para a direita.

| Cena | Overlay | Intervalo | Tipo | Posição | Ancorado em |
| --- | --- | --- | --- | --- | --- |
| fachada | Projeção cinematográfica (SIM2) | 3,50–7,00 s | equipment | top-right | projetor visível 3,25–7,04 |
| living | Referência em áudio high-end (B&W) | 0,10–2,30 s | equipment | bottom-right | torres + central 0–2,85 |
| living | Engenharia a serviço do som (B&W) | 2,30–4,04 s | equipment | bottom-right | torre direita até 4,04 |
| jornada | Um único ponto de controle | 1,60–3,50 s | narrative | bottom-left | S110 identificável 1,8 |
| jornada | Tecnologia que desaparece… | 3,50–5,40 s | narrative | bottom-left | interface legível 2,95+ |
| jornada | Um toque muda o ambiente | 5,40–7,05 s | narrative | bottom-left | close, antes da travessia |
| — | *(travessia 7,09–8,19 s: nenhum card)* | | | | |
| jornada | Iluminação arquitetural | 8,70–11,40 s | equipment | bottom-right | sanca/fitas/spots 7,64+ |
| jornada | Cortinas automatizadas | 11,70–14,80 s | equipment | bottom-right | cortinas abrindo 11,28–15,18 |
| — | *(14,80–18,125 s: skyline limpo, depois o encerramento de marca)* | | | | |

Nunca há dois cards narrativos simultâneos, e as etapas de um mesmo card
(B&W 1→2, S110 1→2→3) são estritamente sequenciais.

## Marca

- `public/brand/sonare-logo-dark.png` (800w) — lockup oficial recortado do
  `SONARE_LOGOTIPO_PNG_02` (Logo 2, fundos escuros): navbar, encerramento, footer.
- `public/brand/sonare-logo-light.png` — Logo 1 recortado, reservado para
  superfícies claras futuras.
- `public/brand/sonare-mark-{64,192}.png` — símbolo dourado quadrado: favicon
  e apple-touch-icon.
- O SVG anterior (`sonare-logo.svg`) era a prancheta completa da identidade e
  foi removido do bundle público.
- Token `--color-sonare-gold-deep: #8a6a2a` — rampa escurecida do dourado para
  textos pequenos sobre branco (contraste AA); o dourado oficial `#CF9F52`
  permanece o acento sobre fundos escuros.

## Conversão

- Formulário (Nome, WhatsApp, E-mail, Cidade, Tipo de Projeto, Mensagem) monta
  mensagem pré-preenchida e abre `wa.me/5547996697354` — sem backend.
- Canais diretos: WhatsApp, e-mail, Instagram, horário.
- CTA "Agendar uma Visita Técnica" presente: navbar, hero, encerramento do
  Ato II e seção de contato.

## SEO / a11y

- `index.html`: title, description, canonical (confirmar domínio), Open Graph
  com poster da cena 1, JSON-LD LocalBusiness, preload do poster LCP por media
  query, favicons.
- Todo conteúdo comercial em HTML; vídeos são `aria-hidden` (decorativos, a
  narrativa existe em texto); skip-link; foco visível; navegação por teclado;
  formulário com labels e `aria-live` no feedback.

## QA executado (04/08/2026)

- `npm run build` limpo (tsc + vite).
- **Tier de vídeo medido em quatro classes de dispositivo** (Playwright, lendo
  `video.currentSrc`, `videoWidth/Height`, `clientWidth/Height` e a lista de
  requisições `.mp4`):

  | Contexto | Arquivo | videoWidth × videoHeight | CSS | Tiers duplicados |
  | --- | --- | --- | --- | --- |
  | **1920×1080 @1x** | `*-desktop4k.mp4` | **3840 × 2116** | 1920×1080 | nenhum |
  | 1440×900 @1x | `*-desktop4k.mp4` | 3840 × 2116 | 1440×900 | nenhum |
  | 1280×800 @1x | `*-desktop.mp4` | 1920 × 1058 | 1280×800 | nenhum |
  | 390×844 @3x touch | `*-mobile.mp4` | 960 × 530 | 390×844 | nenhum |

  O capítulo da jornada também foi medido: `scene-03-04-05-desktop4k.mp4`,
  3840 × 2116, com o scrub percorrendo 0 → 18,12 s.

- **Overlays validados no scrub**, um card por amostra e nenhuma sobreposição:

  | Momento | Cards visíveis |
  | --- | --- |
  | fachada t=3,9 / 5,6 | `fachada-projecao` |
  | living t=0,6 / 2,8 | `living-bw-1` / `living-bw-2` |
  | jornada t=2,6 / 4,4 / 6,4 | `s110-1` / `s110-2` / `s110-3` |
  | jornada t=7,7 (**travessia**) | *(nenhum)* |
  | jornada t=9,9 / 13,0 | `gourmet-iluminacao` / `gourmet-cortinas` |
  | jornada t=16,5 (skyline) | *(nenhum)* |

- Mobile: 3 seções de cena + encerramento; cada uma carrega o tier 960w,
  autoplay ativo, overlay correto e **nenhum overlay obsoleto** de cena fora de
  tela; sem overflow horizontal (scrollWidth 390 = innerWidth).
- Reduced motion: 0 `<video>`, 0 pins, e os textos de SIM2, Bowers & Wilkins,
  S110 e cortinas presentes como conteúdo permanente.
- Formulário → URL do WhatsApp verificada.
- Zero erros de console em todos os contextos.

### Auditoria adversarial e defeitos corrigidos

Uma revisão cética independente conferiu cada afirmação contra número, código e
arquivos de mídia. Aprovou 6 das 8 exigências de imediato e encontrou **3
defeitos reais que o QA inicial não pegou** — todos fora do desktop:

1. **Vazamento na travessia (mobile).** As legendas do S110 continuavam visíveis
   até ~7,26 s, já dentro do cruzamento. Corrigido com `OVERLAY_FADE_LEAD`.
2. **Sobreposição de cards (mobile).** Etapas contíguas se sobrepunham por 500 ms.
   Mesma correção resolve.
3. **Legenda SIM2 perdida em reduced-motion.** `StaticNarrative` renderizava o
   hero *em vez do* bloco de overlays na cena de abertura; como o único overlay
   da fachada é o chip SIM2, ele sumia por completo do modo acessível.
   Corrigido: hero e bloco de texto passam a ser aditivos.

Reverificação após as correções (170 amostras a 10 Hz percorrendo a jornada
inteira no mobile):

| Métrica | Resultado |
| --- | --- |
| Máx. de cards com opacidade > 0,5 por amostra | **1** |
| Maior "segunda-maior" opacidade | **0,000** (zero sobreposição) |
| Cards presentes na travessia (7,05–8,6 s) | um único resíduo de **0,006** de opacidade em t=7,095 |
| Reduced motion: "Projeção cinematográfica" no DOM | **presente** |

O resíduo de 0,006 é a cauda final do fade — 0,6 % de opacidade, abaixo de
qualquer limiar perceptível e do próprio corte de 0,5 usado na auditoria.

Nota de harness: o site usa `scroll-behavior: smooth` (para os links âncora),
o que faz chamadas rápidas de `window.scrollTo` se interromperem em testes
automatizados — o scroll para antes do alvo. Os scripts de QA forçam
`scroll-behavior: auto` durante a medição. Usuários reais (roda/trackpad) não
são afetados.

**Isto não é um detalhe.** Uma bancada de cadência que dirige o scroll por
`window.scrollTo` dentro de um laço de `requestAnimationFrame` **sem** esse
override não mede o produto: cada chamada reinicia a animação de rolagem suave
antes de ela terminar, e a página satura em torno de 200 px/s. Medido na cena 05,
comandando 6,2 s de gesto:

| gesto pedido | px comandados | px percorridos | velocidade real |
| --- | --- | --- | --- |
| 0,25× | 1033 | 1033 | 0,248× |
| 0,5× | 2063 | 2063 | 0,496× |
| 1,0× | 4154 | **798** | **0,192×** |
| 2,0× | 4188 | **390** | **0,187×** |

Acima de ~0,5× o gesto simplesmente não acontece. O controlador então lê a
velocidade baixa corretamente, comanda `playbackRate` proporcionalmente baixo, e
a bancada registra intervalos longos entre frames — que são reais para aquela
rolagem, mas não descrevem nenhum uso real do site. Três rodadas de diagnóstico
de "judder" foram gastas perseguindo esse artefato antes de a discrepância entre
px comandados e `window.scrollY` ser medida.

Toda bancada de cadência em `media-comparison/scene01-fidelity/tools/` aplica o
override via `page.addStyleTag`. `wheel-bench.mjs` é a exceção deliberada: ele
dispara eventos de roda reais, que não passam pelo caminho do scroll suave.

## Mídia interpolada a 48 fps (experimento, `?temporalMedia=48`)

A fonte é 24 fps e o playhead segue o scroll, então o número de frames NOVOS por
segundo de relógio é `velocidade × 24`: doze a meia velocidade, sete a um terço,
três num arrasto de leitura. Esse teto é aritmético — três rodadas de trabalho no
controlador confirmaram que não há como superá-lo do lado do player. Dobrar os
frames do arquivo é a única alavanca que resta sem dessincronizar imagem e gesto.

### Geração

```bash
bash media-comparison/scene01-fidelity/tools/make-48fps.sh media-comparison/interp/out
```

`minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`, x264 `preset slow`
CRF 18, GOP 12 (250 ms a 48 fps, o mesmo intervalo temporal do GOP 6 a 24),
BT.709 tv, yuv420p, sem áudio, faststart. Custo: **46 s de CPU por segundo de
vídeo 4K**.

Duas armadilhas, ambas encontradas por medição e corrigidas no script:

**Truncamento.** `minterpolate` não sintetiza além do último frame de origem e
para ~2 frames antes. Clonar a cauda da SAÍDA para completar a contagem parece
certo num contador de frames e está errado: repete uma imagem anterior nas
posições onde deveriam estar os últimos frames reais. Medido na cena 02, isso
deixou o frame 0 a 20,8 dB de onde o mapeamento reverso o esperava, enquanto o
miolo do clipe estava a 46 dB. A correção é padear a ENTRADA com um frame clonado
a 24 fps, dando ao filtro um ponto final legítimo.

**Deslocamento de um frame no reverso.** O ideal seria inverter o arquivo
interpolado, mas `-vf reverse` bufferiza o clipe inteiro: 386 frames de 3876×2136
são 4,8 GB e esta máquina tem 5,1 GB livres. Interpolar o reverso de 24 fps é
barato mas cai um frame fora, sempre na mesma direção:

```
normal48[2k]   = normal24[k]
reverse48'[2m] = reverse24[m] = normal24[N-1-m]
```

logo `normal24[k]` fica no índice `2N-2-2k` do reverso, enquanto o mapeamento do
controlador (`frameCount - 1 - frame`) o quer em `2N-1-2k`. Um frame clonado
prependado resolve para todo `k` de uma vez e o controlador mantém a fórmula
limpa. Verificado por `verify-48-mapping.mjs`, que compara os três deslocamentos
possíveis: o correto ganha por ~21 dB.

### Camada de conversão

A timeline continua inteiramente em frames lógicos de 24 fps — durações de cena,
tempos de overlay, `INTRO_OFFSET_FRAMES`, tolerâncias de handover. Só a mídia
muda de taxa. A fronteira entre as duas unidades vive em `src/content/timeline.ts`
e em nenhum outro lugar:

```ts
MEDIA_FPS · MEDIA_SCALE · MEDIA_EPS
logicalFrameToMediaFrame() · mediaFrameToLogicalFrame()
mediaFrameCount() · logicalTimeToMediaTime()
```

`mediaFrameToLogicalFrame` arredonda para baixo de propósito: um frame
sintetizado entre dois originais reporta o lógico que ainda não passou, que é a
resposta conservadora para o portão de handover.

Os arquivos são servidos de `media-comparison/interp/out/`, não de `public/`,
exatamente como `?media=original` — o dev server expõe a raiz do projeto, então a
flag funciona em desenvolvimento e os ~272 MB nunca entram num build. Promover
este conjunto para produção significa mover os arquivos para `public/media/web/`
e remover a flag; é uma decisão deliberadamente separada.

## Pendências que permanecem

- Confirmar domínio definitivo para canonical/OG (assumido `sonareava.com.br`).
- Direitos formais de publicação dos vídeos gerados e da interface Piero
  (`docs/pending-inputs.md` continua valendo).
- Grandis Extended: converter TTF→WOFF2 quando houver tooling (–~40% de peso).
- Destino estruturado dos leads (CRM/e-mail) se quiserem além do WhatsApp.
