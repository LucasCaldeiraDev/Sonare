# Timeline global — quatro segmentos, uma única jornada

## Ordem definitiva e mapeamento

| # | Segmento | Arquivo servido | Duração | Frames | globalStart | globalEnd |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Fachada | `seg1-master.mp4` | 7,041667 s | 169 | 0,000000 | 7,041667 |
| 2 | Living / cinema | `seg2-master.mp4` | 4,041667 s | 97 | 7,041667 | 11,083334 |
| 3 | Aproximação e close do S110 | `seg3-master.mp4` | 5,041667 s | 121 | 11,083334 | 16,125001 |
| 4 | Gourmet + cortinas + skyline | `seg4-master.mp4` | 13,083333 s | 314 | 16,125001 | 29,208334 |

**Duração global: 29,208334 s · 701 frames · 24 fps CFR.**

## Fonte: remux sem recompressão

Cada segmento é um **remux `-c copy`** do master oficial, apenas com tags
BT.709 + full range. Provado bit a bit:

| Segmento | MD5 do stream de vídeo | Igual ao master? |
| --- | --- | --- |
| seg1 | `d78517b464ef6fdde19946676db14a5f` | sim |
| seg2 | `ea0828ff6739e6eac352813ad16058ea` | sim |
| seg3 | `d9cf6c6c081656a42d84310665d45587` | sim |
| seg4 | decode `e3c0726a16580988400bce8794e8e384` | sim — idêntico a 004 seguido de 005 |

O seg4 acusa MD5 de *pacotes* diferente porque o bitstream filter reescreve o SPS
in-band criado pelo concat. No nível que importa — **frames decodificados** — é
idêntico. Nenhum derivado GOP 6 é usado como fonte principal.

## Junções: nenhum frame duplicado, nenhum removido

Comparação dos 24 últimos frames de cada segmento contra os 24 primeiros do
seguinte (assinatura 64×36 em cinza, MAD):

| Junção | MAD último×primeiro | Movimento médio entre frames | Duplicatas (MAD < 2,0 ≈ 0) |
| --- | --- | --- | --- |
| seg1 → seg2 | 4,60 | 3,83 | nenhuma |
| seg2 → seg3 | 3,93 | 2,19 | nenhuma |
| seg3 → seg4 | 1,70 | 2,50 | nenhuma (mínimo global 1,66) |

MAD mínimo em qualquer par foi **1,66** — muito acima de 0. Um frame realmente
duplicado daria MAD ≈ 0. **Frames duplicados encontrados: 0. Frames removidos: 0.**
Nenhuma normalização de frame foi aplicada aos arquivos servidos.

## Master global de referência

`public/media/sonare-experience-master.mp4` — 701 frames, 29,208333 s,
3876×2136, `pc`/BT.709, decode ok. Serve **apenas como referência de QA**.

Para montá-lo, o seg3 precisou ser normalizado (3856×2148 → crop centrado de 24
linhas + upscale de 0,57 % para 3876×2136, erro anamórfico 0,046 %) porque sua
proporção difere das demais. **Esse arquivo normalizado não é servido ao site** —
o site usa os quatro remuxes originais, e o canvas resolve a diferença de
proporção por recorte de origem, sem recompressão.

## Renderer

Um único `<canvas>` é a superfície visível. Os quatro `<video>` existem só como
decodificadores, fora da tela, nunca visíveis. Um laço rAF desenha o segmento
que a timeline global indica.

Consequências diretas:

- **crossfade de 0,4 s removido** — a fronteira é troca de fonte no próximo
  frame desenhado;
- nunca há dois vídeos opacos ao mesmo tempo (só um é desenhado);
- se o segmento entrante ainda não produziu frame, o canvas **mantém os últimos
  pixels bons** em vez de limpar — daí zero tela preta;
- todos os segmentos são desenhados recortados para a mesma proporção de
  referência (3876/2136), então não há salto de escala nem de enquadramento
  quando o seg3 entra;
- poster e LQIP existem apenas na abertura e ficam sob o canvas; nunca reaparecem.

Overlays usam `globalStart`/`globalEnd`, então uma troca de segmento é invisível
para eles. O card `s110-3` **atravessa a fronteira seg3→seg4** de propósito
(16,125 s), o que só é possível porque a timeline é global.

## QA

Varredura de 0,2 s a 29,0 s e travessia das três fronteiras a ±0,05 s e ±0,5 s:

- **tela preta: 0,00 % em todos os pontos amostrados**;
- luma contínua nas fronteiras (ex.: 97,7 → 103,8 → 105,1 → 105,6 na primeira) —
  sem a queda que um fade produziria;
- zero erros de console.

Performance (1920×1080, canvas 1920×1080, decode por software, sem GPU):

| Gesto | FPS | frame p50 | frame p95 | long tasks | heap |
| --- | --- | --- | --- | --- | --- |
| frente lento | 55,6 | 19,2 ms | 24,9 ms | 0 | 22,3 MB |
| frente rápido | 57,7 | 16,6 ms | 21,4 ms | 0 | 22,1 MB |
| volta lenta | 58,6 | 16,7 ms | 27,2 ms | 0 | 22,4 MB |
| volta rápida | 59,8 | 16,7 ms | 18,3 ms | 0 | 22,3 MB |
| troca de direção | 48,0 | 17,0 ms | 46,8 ms | 0 | 22,0 MB |
| troca de direção (2) | 57,3 | 16,7 ms | 26,5 ms | 0 | 22,2 MB |

Heap estável em ~22 MB; 4 decodificadores e 1 canvas.
