# Handoff — otimização de vídeo e scroll

Estado em 6 de agosto de 2026. Escrito para ser lido por quem retoma o trabalho
sem ter acompanhado as sessões anteriores.

**Nada foi promovido para produção.** As mídias novas vivem fora de `public/` e
só são servidas atrás de flags de desenvolvimento. Produção continua entregando
o conjunto 4K a 24 fps.

---

## 1. Diagnóstico corrigido

Três conclusões anteriores estavam erradas e foram substituídas por medição. Elas
estão registradas aqui porque cada uma custou uma rodada inteira e nenhuma deve
ser refeita.

### 1.1 Os gaps de 233–250 ms eram da bancada, não do produto

O site usa `scroll-behavior: smooth` (`src/styles.css:55`, para links âncora).
Uma bancada que dirige o scroll por `window.scrollTo` dentro de um laço de
`requestAnimationFrame` reinicia a animação de rolagem suave antes de ela
terminar, e a página satura em ~200 px/s. Medido:

| gesto pedido | px comandados | px percorridos | velocidade real |
| --- | --- | --- | --- |
| 0,25× | 1033 | 1033 | 0,248× |
| 0,5× | 2063 | 2063 | 0,496× |
| 1,0× | 4154 | **798** | **0,192×** |
| 2,0× | 4188 | **390** | **0,187×** |

O controlador lia a velocidade baixa corretamente e comandava `playbackRate`
proporcionalmente baixo. Tudo consistente, tudo medindo o harness.

**Toda bancada de cadência deve aplicar `page.addStyleTag({content:
"html,body{scroll-behavior:auto !important}"})`.** A exceção deliberada é
`wheel-bench.mjs`, que dispara eventos de roda reais — esses não passam pelo
caminho do scroll suave.

### 1.2 A política v2 (piso de taxa + coleira) foi reprovada

Tentativa de garantir suavidade em scroll lento impondo velocidade visual
mínima. Ganha a 1,0× (52 ciclos pausa/play viram 2, p95 66,7 → 50,3 ms) e
**perde feio** a 0,25× e 0,50×: 72 frames únicos viram 15, com congelamento de
4,6 s. Causa estrutural: o ramo de overshoot da v1 pausa **e faz seek** quando o
playhead passa do alvo em movimento, o que a torna imune a chegar num gesto já
deslocada. A v2 se recusa a fazer seek em movimento, então qualquer avanço
herdado é descontado pela coleira na velocidade do próprio scroll.

**O resync agressivo da v1 não é defeito, é o mecanismo de recuperação.** Custa
~16 ms de p95 e vale o preço. v2 continua na árvore atrás de `?policy=v2`,
documentada com os números que a reprovaram.

### 1.3 O descarte de frames é limite de apresentação, não de decode

Reportei "saturação de decode" ao ver o descarte subir de 1,2% (24 fps) para
28,1% (48 fps) no mesmo gesto. A comparação controlada entre resoluções refuta:

| demanda (fps solicitados) | 4K48 | 1440p48 | 1080p48 | 4K24 |
| --- | --- | --- | --- | --- |
| 48 | 0,9% | 0% | 0,9% | — |
| 72 | 18,1% | 17,5% | 18,1% | 17,5% |
| 96 | 38,3% | 38,3% | 38,7% | 0,9% |
| 144 | 58,1% | 58,4% | 58,4% | 17,5% |

Idêntico em todas as resoluções, e um arquivo de 24 fps a 3× descarta os mesmos
17,5% que um de 48 fps a 1,5× — ambos pedem 72. **Uma tela não mostra mais
frames do que atualiza**; o excedente é decodificado e descartado, roubando o
orçamento de quem seria exibido.

O que a resolução realmente melhora é **latência de seek**.

---

## 2. Comparação de resolução (cena 05)

Medida em `<video>` isolado, fora do controlador, para não misturar a política
de taxa com a capacidade da mídia.

| candidato | resolução | MB | 1º frame | seek p50 | **seek p95** | máx |
| --- | --- | --- | --- | --- | --- | --- |
| 4K48 GOP12 | 3876×2136 | 32,5 | 198 ms | 33,3 | **116,7** | 121 |
| **1440p48 GOP12** | 2560×1410 | **17,3** | 188 ms | 16,7 | **39,5** | 67 |
| 1440p48 GOP6 | 2560×1410 | 21,0 | 207 ms | 16,7 | **32,7** | 50 |
| 1080p48 GOP12 | 1920×1058 | 11,1 | **67 ms** | 16,7 | 50,0 | 67 |
| 1080p48 GOP6 | 1920×1058 | 13,7 | **49 ms** | 16,7 | 33,4 | 96 |
| 4K24 GOP6 (produção) | 3876×2136 | 25,3 | 156 ms | 33,3 | 105,1 | 150 |

Qualidade no backing real do canvas (1920×1058, DPR 1), contra 4K reduzido ao
mesmo destino:

| candidato | PSNR | SSIM |
| --- | --- | --- |
| 1440p48 | **46,78 dB** | **0,9913** |
| 1080p48 | 46,06 dB | 0,9902 |

Calibração: o reencode GOP-6 já em produção mediu 46–52 dB / SSIM 0,991–0,996 e
foi aceito como visualmente equivalente. 1440p está dentro dessa faixa.

Confirmação no controlador real (`fast-bench.mjs`), 4K48 → 1440p48:

| gesto | únicos | fps | p95 | máx | descartados | seek p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 2× | 142 → **153** | 45,8 → 49,3 | 47,7 → **33,5** | 117 → **50** | 5,5% → **1,4%** | 54,3 → **16,8** |
| 4× | 65 → **98** | 34,0 → 51,5 | 76,3 → **33,4** | 134 → **50** | 12,4% → **2,4%** | 66,8 → **16,8** |
| 10× | 23 → **59** | 19,1 → 49,1 | 133,5 → **33,4** | 137 → **83** | 17,9% → **2,0%** | 133,4 → **16,8** |
| 20× | 32 → **51** | 22,7 → 36,4 | 133,3 → **83,4** | 173 → **100** | 16,1% → **2,6%** | 216,8 → **66,6** |

Peso dos conjuntos completos (10 arquivos, normais e reversos):

| conjunto | MB |
| --- | --- |
| 24 fps 4K (produção atual) | 216 |
| 48 fps 4K | 282 |
| **48 fps 1440p** | **144** |
| 48 fps 1080p | 93 |

---

## 3. Decisão: 1440p48 GOP 12

**Vencedor: 1440p48 GOP 12.** Corta o seek p95 de 116,7 para 39,5 ms
(16,8 ms no controlador real), é visualmente equivalente no tamanho de
exibição, e o conjunto completo pesa 144 MB — **33% menos que os 216 MB que
estão em produção hoje**, entregando o dobro da cadência.

**GOP 6 rejeitado.** Melhora o seek p95 em 6,8 ms (39,5 → 32,7) e custa 21% de
peso. Com 1440p a latência já caiu para 16,8 ms no controlador real, abaixo de
um frame de tela a 60 Hz. Os 6,8 ms teóricos são imperceptíveis e o peso extra
sairia de um orçamento de carregamento que ainda não foi medido. Se a Fase 8
mostrar folga de rede e as fronteiras continuarem problemáticas, reabrir.

---

## 4. Medição do refresh (orçamento de apresentação)

Substituiu `DECODE_BUDGET_FPS = 72`, cujo nome culpava o decodificador. Em
`src/components/CanvasNarrative.tsx`:

- mediana de 24 amostras de intervalo de `requestAnimationFrame`;
- mediana e não média, porque os primeiros frames após o load são longos e
  arrastariam uma média para valores sem sentido;
- clamp entre 50 e 240 Hz, porque uma aba em segundo plano reporta o intervalo
  da suspensão, não o do painel;
- fallback 60 Hz;
- teto de taxa: `clamp(refreshHz / MEDIA_FPS, 1, 3)`.

Nunca abaixo de 1× (a história precisa poder avançar em tempo real num painel
cujo refresh fique sob a taxa da mídia) nem acima de 3× (além disso a imagem
para de ler como movimento e passa a ler como salto — o motivo original da
constante).

Preservado: recovery seek com `RECOVERY_GAP = 0,5 s` e `RECOVERY_MIN_MS = 150`.
O sweep de 0,25 / 0,35 / 0,50 / 0,75 **não foi feito**.

---

## 5. Matriz responsiva

Em `src/content/timeline.ts`, `pickMediaVariant()`. Calculada dos pixels que o
canvas realmente desenha, não do DPR:

```
ponteiro grosso, ou deviceMemory <= 4, ou innerWidth < 900  -> 1080p48
backing > 2560 px de largura                                -> 4K48
caso contrário                                              -> 1440p48
```

`backing = innerWidth × min(devicePixelRatio, 2)`, o mesmo cap `MAX_DPR` que o
canvas usa. 1440p só é escolhido enquanto ainda está sendo **reduzido**; acima
de 2560 px de backing passaria a ser ampliado, e é aí que 4K justifica o custo.

Um celular com DPR 3 cai em 1080p pelo ponteiro grosso, nunca em 4K.

Override para A/B: `?mediaVariant=4k|1440p|1080p`.

---

## 6. Arquivos alterados

**Código de produção**

- `src/content/timeline.ts` — camada de conversão lógico/físico
  (`MEDIA_FPS`, `MEDIA_SCALE`, `MEDIA_EPS`, `logicalFrameToMediaFrame`,
  `mediaFrameToLogicalFrame`, `mediaFrameCount`, `logicalTimeToMediaTime`),
  flag `?temporalMedia=48`, `pickMediaVariant()` e `MEDIA_VARIANT`.
- `src/components/CanvasNarrative.tsx` — controlador em frames físicos na
  fronteira certa; orçamento de apresentação medido; recovery seek; política v2
  atrás de `?policy=v2`; telemetria `__cnTick`, `__cnPlayback`, `__cnSeek`,
  `__cnVisible`, `__cnHandover`; HUD com frame lógico e físico.

**Ferramentas** (`media-comparison/scene01-fidelity/tools/`)

Novas: `make-48fps.sh`, `verify-48-mapping.mjs`, `interp-qa.mjs`,
`interp-contact.mjs`, `decode-bench.mjs`, `fast-bench.mjs`, `slow-bench.mjs`,
`velocity-probe.mjs`, `pause-bench.mjs`, `wheel-bench.mjs`, `native-floor.mjs`,
`factorial-bench.mjs`.
Estendidas: `final-qa.mjs` (aceita query e valida a família de resolução),
`cadence-bench.mjs`.

**Documentação**: `docs/implementation.md` ganhou a seção de mídia interpolada e
a armadilha do `scroll-behavior`.

---

## 7. Mídias geradas

Todas em `media-comparison/interp/out/`, **fora de `public/`**. O dev server
expõe a raiz do projeto, então as flags funcionam em desenvolvimento e nada
disso entra num build.

- `scene-0X-4k-bt709-tv-48fps{,-reverse}.mp4` — 282 MB
- `scene-0X-1440p-48fps{,-reverse}.mp4` — 144 MB ← **candidato vencedor**
- `scene-0X-1080p-48fps{,-reverse}.mp4` — 93 MB
- `media-comparison/interp/cand/` — candidatos GOP 6 da cena 05, só comparação

Todos: 48/1 CFR, yuv420p, High@5.2, BT.709 tv, faststart, sem áudio, GOP 12,
duração idêntica ao original ao microssegundo, frames exatamente 2× o original.

**Duas armadilhas resolvidas na geração, documentadas em
`make-48fps.sh`:** o truncamento de cauda do `minterpolate` (resolvido padeando
a **entrada**, não a saída) e o deslocamento de um frame nas reversas (resolvido
prependando um frame clonado, para o controlador manter
`reverseFrame = frameCount - 1 - forwardFrame` intacto).

Verificação: `verify-48-mapping.mjs` compara os três deslocamentos possíveis; o
correto ganha por ~21 dB nas cinco cenas, mínimo 43,8 dB em todos os originais.

---

## 8. Comandos

Gerar o conjunto 48 fps 4K (base para tudo, ~46 s de CPU por segundo de vídeo):

```bash
bash media-comparison/scene01-fidelity/tools/make-48fps.sh media-comparison/interp/out
```

Derivar 1440p e 1080p (escala do 48 fps existente, ~10 s por arquivo):

```bash
ffmpeg -i media-comparison/interp/out/scene-05-4k-bt709-tv-48fps.mp4 -vf "scale=2560:-2:flags=lanczos" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -x264-params "keyint=12:min-keyint=12:scenecut=0:open-gop=0:bframes=0" -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart -an media-comparison/interp/out/scene-05-1440p-48fps.mp4
```

Validar mapeamento normal/reverso:

```bash
node media-comparison/scene01-fidelity/tools/verify-48-mapping.mjs media-comparison/interp/out/scene-05-1440p-48fps.mp4 media-comparison/interp/out/scene-05-1440p-48fps-reverse.mp4
```

Bancadas (o dev server escolhe uma porta livre; ajuste a URL):

```bash
node media-comparison/scene01-fidelity/tools/fast-bench.mjs http://localhost:5173 --modes 48fps,1440p
```

```bash
node media-comparison/scene01-fidelity/tools/slow-bench.mjs http://localhost:5173 --modes v1,48fps
```

```bash
node media-comparison/scene01-fidelity/tools/decode-bench.mjs http://localhost:5173 --reps 1
```

QA (variante e fallback):

```bash
node media-comparison/scene01-fidelity/tools/final-qa.mjs http://localhost:5173 "?temporalMedia=48&mediaVariant=1440p"
```

Inspeção manual:

```bash
start "http://localhost:5173/?temporalMedia=48&mediaVariant=1440p&debug=1"
```

Playwright não está nas dependências do projeto. Resolvido por `NODE_PATH`
apontando para um `node_modules` de scratchpad. Numa sessão nova, instale
localmente (fora do `package.json`) ou aponte `NODE_PATH` de novo.

---

## 9. Estado do workspace

Modificados e **não** commitados por mim:

```
 M media-comparison/interp/fast.json
 M media-comparison/scene01-fidelity/tools/fast-bench.mjs
 M media-comparison/scene01-fidelity/tools/final-qa.mjs
 M src/components/CanvasNarrative.tsx
 M src/content/timeline.ts
```

Branch `feature/immersive-landing-page`. Existe um commit `ccbc767 "Update
resolution and frames of video"` feito pelo usuário, não por mim. **Eu não
executei commit nem push em nenhum momento.**

Validação no estado atual: `tsc -b` exit 0 · build limpo (358 kB, gzip 122 kB) ·
QA 9/9 em 1440p, 9/9 em 1080p, 9/9 no fallback de 24 fps · zero erros de console
· zero respostas 4xx · **0 ocorrências no bundle** de 26 identificadores
dev-only (`temporalMedia`, `mediaVariant`, `1440p`, `1080p`, `48fps`,
`interp/out`, `MEDIA_FPS`, `MEDIA_VARIANT`, `pickMediaVariant`, `__cnSeek`,
`__cnVisible`, `__cnPlayback`, `__cnTick`, `__cnHandover`, `policy=v2`,
`rateMin`, `fixedRate`, `standby=off`, `surface=native`, `reverseMode`,
`media=original`, `handover=off`, `playhead`, `lagFrames`, `refreshHz`,
`rateMax`).

---

## 10. Fase 7 — PRIORIDADE MÁXIMA: travamento assimétrico na fronteira 01→02

Identificado **manualmente**, não pela bancada. Nenhuma métrica automatizada o
capturou até agora, o que por si só é informação: ou os gestos sintéticos não o
reproduzem, ou a métrica de cadência não o enxerga.

**Sintoma.** Retenção curta e perceptível ao descer, no final da cena 01, na
transição para a cena 02. No sentido inverso (02→01, subindo) não é percebido.
Dentro das cenas, em scroll lento e médio, a suavidade está boa. Portanto é
específico do handover descendente, não da interpolação.

**Não considerar a Fase 7 concluída até reproduzir, medir e corrigir essa
assimetria.**

### 10.0 Medição feita — o sintoma NÃO foi reproduzido

`boundary-ab.mjs` dirige uma travessia por vez e mede `heldMs`: quanto tempo o
último quadro da cena que sai fica na tela antes do primeiro da que entra.
Executado nas quatro fronteiras, nos dois sentidos, em três velocidades, com
página quente e **fria**, e com rampa linear e **eventos de roda reais**.

Retenção na travessia 01→02, página fria, roda real:

| velocidade | desce | sobe | diferença |
| --- | --- | --- | --- |
| lento | 34,9 ms | 17,1 ms | +17,8 |
| médio | 18,1 ms | 34,5 ms | −16,4 |
| rápido | 17,1 ms | 17,3 ms | −0,2 |

Nada acima de 52 ms, e o sinal da diferença alterna — é ruído de um frame, não
penalidade sistemática ao descer. Os gaps de 229–263 ms existem, mas ficam todos
entre +2000 e +3900 ms **depois** da travessia, no assentamento.

A primeira versão do bench rodava tudo numa sessão e reportava antecipação de
aquecimento de 15 a 250 **segundos** — media uma cena 02 residente há minutos.
Corrigido com contexto novo por medição; mesmo assim, limpo.

**Conclusão parcial: a troca em si está correta.** O que resta é ou um modo de
entrada que a bancada não reproduz, ou uma percepção de conteúdo. Ver 10.6.

### 10.6 Achados de conteúdo (não são o bug reportado, mas importam)

`tail-motion.mjs` mede a diferença média entre quadros consecutivos, quadro a
quadro, na cauda e na cabeça de cada cena, contra a média da própria cena.

| cena | movimento médio | cauda (últimos 12) | leitura |
| --- | --- | --- | --- |
| 01 | 13,29 | 10,08 (−24%) | desacelera, **não congela** |
| 02 | 7,31 | 5,65 (−23%) | desacelera |
| 03 | 7,00 | 1,56 (**−78%**) | 125 ms de imagem parada |
| 04 | 11,13 | 0,80 (**−93%**) | 333 ms de imagem parada |
| 05 | 8,07 | 0,32 (**−96%**) | 500 ms de imagem parada |

**Cenas 03, 04 e 05 terminam praticamente congeladas na própria filmagem.** Se
algum dia aparecer queixa de travamento em 03→04 ou 04→05, a causa é essa e é
editorial, não do controlador.

A cena 01 não congela, mas desacelera de 11,58 para 7,25 nos últimos 12 quadros
— 37% em meio segundo — enquanto o scroll segue em velocidade constante.
**Hipótese aberta e não comprovada** para a assimetria relatada: a imagem
desacelera enquanto o gesto não, e subindo os mesmos quadros passam acelerando
para fora do corte, o que lê como intenção em vez de travada. Se for isso, está
na filmagem e "corrigir" seria mascarar.

**Teste que discrimina, e depende do usuário:** rolar devagar pelos frames
globais 154–165 (o meio segundo final da cena 01) e observar se a travada está
*antes* do corte, na desaceleração, ou *no* corte. Se for antes, é conteúdo.

O último quadro físico de cada arquivo 48 fps é um clone (movimento 0,01) — a
cauda do padding. Verificado que **nunca é solicitado**: o último lógico é 168,
que mapeia para o físico 336 de 338, e no reverso o clone prependado fica no
índice 0, enquanto o controlador pede o 1.

### 10.1 Hipóteses a investigar

1. Cena 02 preparada tarde demais no sentido descendente.
2. Preload da cena seguinte diferente do preload da anterior.
3. Primeiro frame da cena 02 baixado, decodificado e apresentado antes do
   handover?
4. Troca ocorrendo após `seeked` mas antes de `requestVideoFrameCallback`
   confirmar o quadro.
5. Último frame da cena 01 desenhado por mais tempo que o esperado.
6. Erro de limite inclusivo/exclusivo no último frame: `frameCount` vs
   `frameCount - 1`, duração da cena, frame lógico, frame físico, cálculo da
   próxima cena.
7. O padding de cauda usado na geração criando uma pequena cauda estática.
8. Último frame duplicado ou quase duplicado na normal que não existe da mesma
   forma na reversa.
9. Ordem diferente de troca de track / `src` / estado / canvas ao descer e subir.
10. Controlador reduzindo a velocidade perto do fim e ficando preso no último
    frame.
11. Recovery seek atuando perto da fronteira só no sentido descendente.
12. Callbacks atrasados da cena 01 sobrescrevendo o primeiro desenho da cena 02.
13. Cálculo antecipado do handover usando só a posição, sem velocidade e
    direção.
14. Cena 02 em `readyState` suficiente mas ainda sem frame apresentado.
15. Diferença de keyframe, timestamp, start time ou duração entre normal e
    reversa.

### 10.2 Instrumentar a fronteira

Registrar, para 01→02 e comparar com 02→01: instante em que a cena 02 começa a
carregar; metadata; seek inicial; `seeked`; primeiro `requestVideoFrameCallback`;
primeiro frame correto desenhado; último frame apresentado da cena 01 e por
quantos ms permanece; gap entre o último frame novo da cena 01 e o primeiro da
cena 02; frames lógico, físico, solicitado e apresentado; estado dos vídeos
ativo e standby; direção e velocidade; `readyState`; `waiting`/`stalled`; se
houve recuperação; se houve redraw repetido do último frame; se o handover foi
solicitado antes ou depois de cruzar a fronteira.

Tabela comparativa obrigatória: 01→02 lento / médio / rápido, e 02→01 lento /
médio / rápido.

### 10.3 Verificar as mídias

Comparar os últimos 6 frames da cena 01 normal e os primeiros 6 da cena 02
normal; o mesmo nas reversas; detectar duplicatas e quase duplicatas; confirmar
timestamps e duração; gerar um contato visual da transição. **Determinar se a
pausa está gravada na mídia ou é criada pelo frontend.** `interp-contact.mjs`
já monta trípticos e serve de base.

### 10.4 A correção deve

Preparar a cena 02 antes de atingir o final da cena 01; antecipar conforme
velocidade e direção; confirmar o quadro com `requestVideoFrameCallback`; trocar
só quando esse quadro estiver pronto; não esperar cruzar a fronteira para
começar o seek; não mostrar canvas vazio; não prolongar artificialmente o último
frame da cena 01; não criar regressão; funcionar simetricamente; preservar o
mapeamento exato da timeline.

Se a próxima cena ainda não estiver pronta, manter o último quadro válido é
proteção — **registrar essa retenção como falha de handover, nunca como
solução.**

**Não mascarar** com easing, aumento de duração da cena ou congelamento
deliberado do último frame.

### 10.5 Critérios de aceite da fronteira

- 01→02 tão suave quanto 02→01;
- nenhum último frame retido por mais de ~50 ms em uso normal;
- gap p95 da fronteira preferencialmente abaixo de 50 ms;
- nenhum gap acima de 100 ms;
- nenhum flash ou canvas vazio;
- nenhuma diferença perceptível entre os sentidos;
- validado com 1440p48 GOP12;
- teste manual com roda/trackpad, além do benchmark.

Depois de corrigir 01→02, repetir a validação em 02→03, 03→04, 04→05 e todos os
retornos.

---

## 11. Fases 8 a 11, pendentes

**Fase 8 — carregamento.** Não medido, e é o maior risco em aberto. Tempo até a
primeira imagem em movimento com cache frio e quente, rede limitada, 20 Mbps e
móvel simulada. Confirmar `faststart` e HTTP Range na hospedagem. Priorizar a
cena 01, aquecer vizinhas progressivamente, nunca carregar a biblioteca inteira.
Cache longo com nomes versionados.

**Fase 9 — mobile.** Nunca testado em aparelho. Chrome Android e Safari iOS,
viewport pequeno, DPR alto, economia de energia, rede móvel, orientação,
retorno de aba em segundo plano. Não entregar 4K48 Level 5.2 indiscriminadamente.
Tratar `prefers-reduced-motion`.

**Fase 10 — promoção.** Só depois das Fases 7 a 9 e do teste manual. Mover os
dez arquivos 1440p48 para `public/media/web/`, atualizar caminhos, tornar 48 fps
padrão nos dispositivos aprovados, manter fallback, remover a dependência de
runtime de `media-comparison/`, confirmar as mídias no build.

**Fase 11 — polimento.** Ampliar o HUD com as métricas da secção 10.2 e permitir
exportar um resumo da sessão manual. Eliminar redraws redundantes: o canvas
redesenha ~300 vezes o que muda ~80 (instrumentado em `__cnVisible.redraws`,
nunca corrigido). Remover a política v2 morta se ela perder valor diagnóstico.
Sweep de `RECOVERY_GAP`.

Fora de escopo até que decode, carregamento e mobile estejam resolvidos: subir
para 60/72 fps, e RIFE — o problema atual não é a qualidade dos frames
interpolados.

---

## 12. Cuidados para a próxima sessão

1. **Notebooks touchscreen.** `pointer: coarse` isoladamente força 1080p e vai
   penalizar um laptop com tela sensível ao toque que teria folga para 1440p.
   Combinar com outro sinal (largura do backing, memória, ou `any-pointer:
   fine`) antes de decidir.
2. **Usar as duas dimensões do backing**, não só a largura. Um viewport alto e
   estreito, ou uma orientação retrato, calcula errado hoje.
3. **Não promover antes do teste manual com roda e trackpad.** Toda a medição
   até aqui é Chrome headless com scroll programático, e esse harness já
   escondeu um problema por três rodadas — e não capturou o travamento da
   fronteira 01→02, que só apareceu no uso real.
4. **Medir carregamento antes de definir preload.** Qualquer política de
   aquecimento decidida sem os números da Fase 8 é palpite.
5. **Manter o fallback conservador para mobile** até existir validação em
   aparelho real.

---

## 13. Confirmação

Nada foi promovido para `public/`. Nada foi commitado por mim. Nada foi enviado
para o remoto. Produção continua servindo o conjunto 4K a 24 fps, inalterada, e
o fallback foi verificado funcionando a cada rodada de QA.
