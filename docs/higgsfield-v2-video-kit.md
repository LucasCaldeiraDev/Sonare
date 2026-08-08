# Kit de Execucao — Fase B (videos Seedance 2.0)

Data: 2026-08-07. Fase A concluida: 6 masters aprovados pelo usuario (52 creditos).
Kit fisico em: `media-comparison/higgsfield/new-renders/video-kit/`

## Masters aprovados (cadeia de continuidade)

| Master | Arquivo | Job ID |
| --- | --- | --- |
| M1 exterior amplo | `stills/sonare-v2-m1-exterior-wide.png` | 7d3bf776-899e-4243-882d-cfc212e3b626 |
| M2 fachada/porta | `stills/sonare-v2-m2-facade-threshold.png` | dfdcee35-4c65-4e9f-b4ff-3c8c77a6d8c7 |
| M3 home theater ativo | `stills/sonare-v2-m3-home-theater-active.png` | 71d474a1-4512-4181-9e33-8aa87f8fea0a |
| M4 close S110 | `stills/sonare-v2-m4-s110-close.png` | f718b874-3b14-4c0c-8e48-3134b525ecbe |
| M5 gourmet cortinas fechadas | `stills/sonare-v2-m5-gourmet-curtains-closed.png` | 4aa982b3-2cd7-41f1-97d3-e925f245e375 |
| M6 skyline aberto (camera avancada) | `stills/sonare-v2-m6-skyline-open.png` | 108a77af-0a23-4b8d-b56f-1447660933fa |
| Extra: M6-t1 wide (estado intermediario S5) | `stills/sonare-v2-m6-skyline-open-t1-wide.png` | 4be0bca6-5489-40f7-b028-462e3281327b |

Decisoes de producao registradas na Fase A:
- Parede do telao em pedra natural escura (aprovada; substitui o conceito "parede lisa rebocada").
- M4 em angulo 3/4 natural (geometria de chegada do push-in da S3).
- M6 com camera avancada entre ilha e mesa (decisao do usuario para dar profundidade a S5).
- Cortinas fechadas no andar superior em M1 e M2 (decisao do usuario; menos entropia + eco narrativo).
- Andar superior: brilho suave no M1 -> mais aceso no M2 (arco de "despertar" da S1).

## Configuracao FIXA de todas as cenas na UI

| Campo | Valor |
| --- | --- |
| Modelo | Seedance 2.0 |
| Preset | General |
| Duracao | 8s |
| Aspect ratio | 16:9 |
| Resolucao | 4K |
| Bitrate | High |
| Audio | DESLIGADO |
| Use free gens | LIGADO |
| Custo exibido | **0 — se nao for 0, NAO gerar e avisar** |

## Passo a passo por cena (na UI do Higgsfield)

Para cada cena N (01..05), na pasta `video-kit/scene-0N/`:

1. Abrir Seedance 2.0 na UI, conferir a configuracao fixa acima.
2. Enviar `scene-0N-start-frame.png` como **start frame**.
3. Enviar `scene-0N-end-frame.png` como **end frame**.
4. Colar o conteudo de `prompt.txt` no campo de prompt.
5. Referencias adicionais opcionais (se a UI aceitar imagens extras):
   - Cena 02: `extra-references/s2-bw-towers-reference.png` (autoridade das torres B&W durante o acender das luzes).
   - Cena 03: `extra-references/s3-s110-interface-reference.png` (estabilidade da interface no close).
   - Cena 05: `extra-references/s5-mid-state-curtains-open-wide.png` (estado intermediario: cortinas abertas com camera ainda recuada).
6. Confirmar custo 0 e gerar.
7. Baixar o resultado como `sonare-v2-scene-0N.mp4` e salvar em `media-comparison/higgsfield/new-renders/video/`.

Ordem recomendada: 01 -> 02 -> 03 -> 04 -> 05. A cena 02 e a mais dificil (porta + luzes + telao); se falhar 2x, existe plano B documentado no plano de producao (projecao ja fracamente visivel desde o inicio, apenas ganhando brilho).

## QA de cada take (antes de aceitar)

- [ ] Movimento unico continuo, sem cortes, sem tremido, velocidade constante
- [ ] Primeiro frame ~= start frame enviado; ultimo frame ~= end frame enviado
- [ ] Nenhum objeto surge/some/deforma no meio (atencao: torres B&W, central no pedestal, projetor, S110, ilha, cadeiras)
- [ ] Texto do S110 nao "reescreve" durante a cena 03
- [ ] Luzes acendem na ordem prevista (S1: fachada/cortinas; S2: sanca -> wall washers -> telao nos ~2s finais)
- [ ] Cortinas da cena 05 abrem do centro para fora, sem rasgar/atravessar moveis
- [ ] Sem pessoas, texto, logos inventados ou cabos

Um take reprovado = regenerar so aquela cena (free gens, custo 0). Nao aceitar take com defeito "porque foi de graca".

## Depois dos 5 takes aprovados (Fase C — eu executo)

1. QA tecnico: duracao real, fps real, contagem de frames, juncoes M(n)/M(n+1), freezes.
2. Derivados ffmpeg: remux BT.709 tv + GOP-6 + reverses + poster AVIF (pipeline em `media-comparison/scene01-fidelity/tools/`).
   - Pendencia de ambiente: **ffmpeg nao esta no PATH desta maquina** — instalar ou apontar o binario antes da Fase C.
3. Medicao do frame 0 da nova cena 01 (nitidez/settle) para decidir o novo `INTRO_OFFSET_FRAMES`.
4. Master unico opcional por concat (derivado, nunca fonte).
5. Fase D: re-timing de `src/content/timeline.ts` (segmentos, `SEGMENT_START_FRAME`, overlays), stills publicos com backup, `npm run build`, teste no Vite. Assets antigos intactos ate aprovacao visual final.
