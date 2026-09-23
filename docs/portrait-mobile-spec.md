# Conjunto retrato para celular — o sistema como foi construído

Quatro cenas, geradas nativamente em 9:16 a 720×1280, 24 fps. Este documento
descreve o que **está no ar**, não um plano. Onde uma decisão contraria o que
parecia óbvio, o motivo está registrado — quase todos foram medidos, e vários
custaram gerações desperdiçadas até a medição aparecer.

Isto **não substitui** os masters 16:9. O desktop continua servindo as cinco
cenas aprovadas; este é um conjunto companheiro, servido só para celular em
retrato. Em `src/content/timeline.ts` os dois convivem: `SEGMENTS` é o desktop,
`MOBILE_SEGMENTS` é este, e `Journey.tsx` escolhe.

## Por que retrato nativo, e não recorte

Uma tela de celular em retrato tem proporção ~0,46; material 16:9 é 1,78. Para
preencher a altura, `object-fit: cover` amplia até a altura bater e descarta a
largura excedente — **74% do quadro fica fora da tela, sempre**. Medido em
430×932: dos 1920 px de largura do arquivo 1080p, 499 aparecem.

A versão anterior deste conjunto recortava 1:2 na fonte. Isso resolvia o
desperdício de banda — todo pixel enviado era um pixel mostrado — mas não podia
mudar o que aqueles pixels continham: o celular via uma fatia estreita de um
plano composto para tela larga. A única correção é enquadrar vertical desde a
geração.

## As quatro cenas

| cena | conteúdo | frames | segundos |
|---|---|---|---|
| 01 | fachada → entrada → living/home theater | 241 | 10,042 |
| 02 | living → display S110 | 125 | 5,208 |
| 03 | S110 → área gourmet | 193 | 8,042 |
| 04 | gourmet → cortinas abrem → skyline | 193 | 8,042 |

Total: 752 quadros, 31,333 s. Conjunto servido: 11,4 MB.

**Quatro, não cinco, e os cortes não são os do desktop.** A cena 01 carrega
fachada + entrada + living num clipe só; o desktop gasta duas cenas nisso. O
motivo é mecânico, não editorial — está na seção seguinte.

## A porta: o que custou dez gerações

A entrada foi o único trecho que o modelo de vídeo errava de forma sistemática.
Dez tentativas pedindo que a porta pivotante de madeira abrisse produziram, toda
vez, uma câmera espremendo por uma fresta.

**Porta de dobradiça é ponto fraco conhecido desses modelos** — rotação de corpo
rígido, na mesma família de mãos e texto. Nenhum ajuste de prompt corrigiu.

O que funciona: **a porta nunca anima**. Ela fica fechada e a câmera entra pelo
painel de vidro deslizante ao lado, que é movimento linear — o que o modelo faz
bem. E manter aproximação e entrada **num único take** removeu a passagem de
bastão que reintroduzia o problema a cada divisão.

Registrado porque é a informação mais cara deste conjunto: se uma cena precisar
ser regerada, não peça a porta abrindo.

## As emendas, e a régua certa para julgá-las

PSNR bruto engana. O que importa é a emenda **comparada ao passo que a cena de
entrada dá entre seus próprios frames consecutivos** — um salto incomoda na
proporção do movimento que tem para se esconder atrás.

| emenda | salto | passo próprio | desvio | tratamento |
|---|---|---|---|---|
| 01 → 02 | 34,0 dB | 26,0 dB | −8,0 | corte seco |
| 02 → 03 | 29,5 dB | 30,9 dB | +1,1 | corte seco |
| 03 → 04 | 33,8 dB | 56,1 dB | +22 | dissolve de 10 frames |

Enquadramentos sem relação ficam em 10–13 dB neste projeto, então as três são
junções reais.

A 01 → 02 é *melhor* que o movimento ao redor: a cena 02 abre num push-in e a
junção é mais limpa que um frame desse push.

A **03 → 04 é a pior**, apesar do número absoluto bom. A cena 04 abre
praticamente congelada (56,1 dB entre frames próprios), e contra imagem parada
qualquer degrau aparece. Não é deslocamento: busca de translação em ±12 px nos
dois eixos acha o ótimo em dx=0, dy=0. Não há o que alinhar, só o que suavizar —
daí o dissolve.

## O buraco no caminho da câmera, e os quatro frames sintéticos

A cena 02 termina cerca de **cinco frames antes** de onde a cena 03 começa.
Medido, não inferido: calibrado contra o próprio deslocamento da cena 02 no fim
dela (~31,5 dB por frame), a junção de 25,5 dB caía entre quatro frames desse
percurso (26,1 dB) e seis (24,6 dB).

Três takes da cena 03 foram gerados tentando fechar, e o terceiro foi
condicionado no **último frame real da cena 02**, não numa still sintética. Não
mudou nada: 25,49 dB contra 25,53 do take anterior. Os dois takes concordam
**entre si** a 39,97 dB — abrem no mesmo lugar — enquanto ambos ficam a ~25,5 dB
de onde a cena 02 termina, com o mesmo deslocamento de ~10 px.

> **A imagem de condicionamento não decide onde este modelo abre um plano.**
> Um quarto take não teria fechado.

Cortar também não resolve, na direção oposta: varrendo a cauda da cena 02, o
encaixe **sobe monotonicamente até o último frame** e ainda está subindo lá. A
cena 02 já termina no melhor ponto que tem; ela simplesmente para antes.

Então os frames que faltavam foram **sintetizados**: interpolação com
compensação de movimento entre o último frame real da cena 02 e o primeiro da
cena 03, quatro frames anexados à cena 02. O descasamento é translação quase
pura sobre parede plana — o caso em que fluxo óptico é mais confiável — e o
resultado se sustenta: a junção passou a 29,5 dB contra os passos de fechamento
da própria cena (31,5 / 30,4 / 30,9 dB).

**Esta é a única footage sintética do filme.** Está isolada em
`scene-02-portrait-master-bridged.mp4`; o master entregue de 121 frames continua
ao lado, intocado. Voltar ao corte seco de 25,5 dB é trocar uma linha em
`make-mobile.sh`.

## Regras que continuam valendo

**Cadência.** 24 fps CFR. O projeto inteiro conta em quadros lógicos de 24 fps.
Se um take vier a 25 ou 30, avise — dá para tratar, mas mexe em
`MEDIA_FPS`/`MEDIA_SCALE`.

**Margem lateral.** 9:16 é 0,5625; um iPhone 14 Pro Max em retrato é 0,461.
Mesmo com material retrato o `cover` ainda corta ~18% da largura (9% de cada
lado). Nada essencial encostado na borda. Para comparação: de 74% descartados
para 18%.

**Equipamentos nos momentos certos.** As legendas apontam para equipamento que
está em quadro naquele instante; se o equipamento aparecer noutro momento, a
legenda descreve algo que não está na tela. As janelas mobile vivem em
`globalStartMobile`/`globalEndMobile` (`timeline.ts`), separadas das do desktop
justamente porque as durações e os cortes divergem.

## Nomes de arquivo e cache

`public/_headers` serve `/media/web/*` como `immutable`, um ano. A convenção é
que **a receita faz parte do nome**, então mudar footage significa mudar o nome.
Reencodar com o mesmo nome serve o arquivo velho por até um ano.

O conjunto se chama `scene-0N-portrait-720x1280-bt709-tv-gop6.mp4` e o pôster
`scene-01-poster-portrait.webp` — nomes que descrevem a receita atual. Os
antigos `scene-0N-mobile-bt709-tv-gop6.mp4` prometiam o recorte 1:2 a 720×1440 e
foram removidos.

## Pipeline

`media-comparison/scene01-fidelity/tools/make-mobile.sh` — masters em
`media-comparison/higgsfield/portrait/masters/`, saída em `public/media/web/`.
Receita da casa: x264 slow, CRF 21, keyint 6, closed GOP, BT.709 tv, faststart.
Sem companheiros reversos: a 720×1280 com keyframe a cada seis frames, um seek
para trás decodifica no máximo seis frames de um arquivo pequeno.

## O que ficou obsoleto

- `scene-0N-mobile-bt709-tv-gop6.mp4` — os recortes 1:2, removidos;
- `media-comparison/framing/` e os modos `?frame=45` / `?frame=169` — existiam
  para decidir quanta altura devolver em troca de quanto cenário, pergunta que o
  material vertical respondeu;
- a rota `/framing-lab` e `src/FramingLab.tsx`;
- o passo de `crop` em `make-mobile.sh`.

## O que permanece

Toda a infraestrutura: o scrub pinado, o governador de toque, o handover entre
cenas, o `lvh`/`svh`, a ordem de remedição dos ScrollTriggers. Nada disso depende
do enquadramento do material. Ver `src/components/MobileNarrative.tsx` para o
governador e `src/lib/scrubEngine.ts` para a direção de taxa.

## iOS: os três estados em que "as cenas não carregam"

No iPhone o relato foi que as cenas não carregavam — a rolagem funcionava, o
quadro não. Não era codec: os quatro arquivos são H.264 High 4.0, yuv420p,
`faststart`, tudo que o iOS exige. Era o motor de scrub esperando um estado que
o WebKit móvel não entrega sozinho. O motor só agia com `readyState >= 2` (um
frame decodificado), assumindo que `preload="auto"` chega lá por conta própria.
No iOS o WebKit decide três coisas por cima da página, e cada uma parava o
filme num estado diferente:

| estado | quando o iOS faz isso | quem resolve |
|---|---|---|
| `HAVE_METADATA` (rs1): arquivo conhecido, nada decodificado | `preload` rebaixado para `metadata` quando o Safari decidiu não pré-carregar (rede celular, tipicamente) | o motor faz um seek para o frame-alvo — o seek é o pedido que o WebKit responde preparando o pipeline que se recusou a preparar para o `preload` |
| `HAVE_NOTHING` + `NETWORK_IDLE` (rs0/ns1): nem metadata | `preload` recusado de vez | `warm` chama `engine.prime()`: `play()` com `pause()` enfileirado atrás — `play()` é a única chamada que faz esse WebKit buscar |
| `play()` recusado (`NotAllowedError`) | Modo de Baixo Consumo | o motor avança por seek e tenta `play()` de novo a cada 2 s; a recusa cai junto com o modo, ou no primeiro toque real |

Mais dois guardas: um watchdog solta seeks que nunca voltam (`load()` no meio
de um seek, ou um seek engolido — 3 s), e `warm` recarrega uma faixa que
reporta `error`, porque o iOS descarrega faixas ocultas sob pressão de memória.
A razão de cada número está nos comentários de `src/lib/scrubEngine.ts` e
`src/components/MobileNarrative.tsx`.

**Como ler o aparelho.** Abrir a build com `?diag=1`. Por faixa: `rs` é o
readyState, `ns` o networkState, `pre` o preload efetivo, `buf` quantos segundos
já chegaram além do playhead, `rej` quantas vezes `play()` foi recusado, `pr`
quantos primes foram feitos, `to` quantos seeks o watchdog abandonou, `ERRO<n>`
o código de erro do elemento. Uma faixa parada em `rs1` com `buf-` e `sk`
subindo é a rede; parada em `rs0 ns1` com `pr` subindo é o iOS recusando buscar
mesmo com `play()`; `rej` alto sem `ERRO` é só o Modo de Baixo Consumo, e o
filme deve andar por seek.

**A hospedagem precisa responder `206 Partial Content` a `Range`.** O iOS não
toca vídeo sem isso. Netlify (dona do `_headers`) responde; conferir na URL
final com `curl -sI -H "Range: bytes=0-1023" <url do mp4>`.

## iOS: "demora para carregar" — as cópias locais

Com as cenas entrando, o relato seguinte foi lentidão. O caminho lento no
iPhone não é o decode (720×1280 GOP 6 é pouco para o telefone): é que **cada
seek em trecho ainda não baixado vira uma requisição HTTP Range nova do
AVFoundation**, que tem pilha de rede própria, não compartilha nada com o cache
da página e custa algumas centenas de milissegundos por ida e volta em rede
celular. O motor faz seek a cada passo para trás, a cada arremesso e a cada
frame em Modo de Baixo Consumo — numa parte boa da visita, o seek *é* o filme.
E a fronteira de cena pagava duas vezes: a próxima faixa só começava a baixar
3 s de história antes do corte (uns 2 s de relógio para 2 MB), e o handover
segurava o quadro de saída até esses bytes chegarem.

A resposta: **as quatro cenas são baixadas inteiras (`fetch`), em ordem, e
cada `<video>` é apontado para um `blob:` da cópia** assim que ela chega. Até
lá o elemento **não tem `src` nenhum**. Depois disso um seek é leitura de
memória. A política de preload do iOS continua valendo para o *elemento* (ele
pode ficar em `HAVE_METADATA` até um seek pedir o frame — o motor cuida), mas a
resposta vem da memória.

- **Ordem 01, 02, 03, 04, sem streaming no meio-tempo.** A primeira versão
  disto mantinha a cena 01 em streaming pela rede enquanto a cópia dela vinha
  por último, e só trocava uma faixa com o olho fora dela (trocar o `src` zera
  o elemento). No aparelho isso produziu exatamente o relato que devia
  resolver: a cena 01 era a que o visitante estava olhando, logo era a única
  que nunca recebia a cópia — ficava no caminho de seek pela rede durante toda
  a primeira passada e só funcionava depois de rolar tudo e voltar. Então: sem
  `src` de rede. A 01 é baixada primeiro, o pôster segura o quadro de abertura
  enquanto ela chega e a barra dourada sob o hero mostra o quanto já veio. Num
  link bom é um ou dois segundos que o visitante gasta lendo a manchete; num
  ruim é uma espera honesta em vez de um quadro que engasga. Cada arquivo
  também é baixado exatamente uma vez.
- **A barra.** Uma linha de 2 px na base do hero, preenchida com o progresso da
  cena que o filme está esperando (a 01 no início; a próxima, se o visitante
  chegar à fronteira antes dela). Some sozinha quando não há espera.
- **Fallbacks.** Um `fetch` que falha aponta a faixa para o arquivo de rede e o
  filme segue como antes. Um pipeline que recusa `blob:` (`ERRO4`) manda todas
  as faixas para a rede, uma vez — o filme nunca fica pior por ter tentado. O
  WebKit do Playwright no Windows (Media Foundation) faz exatamente isso; o iOS
  não. Sob Data Saver nada é baixado e as faixas fazem streaming desde o início.
- **Custo:** 11,4 MB, só no caminho do celular, uma vez (o CDN serve
  `immutable`). O desktop move várias vezes isso para o mesmo filme.

No `?diag=1` a linha `download` mostra a porcentagem por cena, `L` quando a
faixa já está na cópia local e `N` quando caiu para a rede; `local recusado`
aparece se o fallback geral disparou.

## iOS: o governador de volta

O relato seguinte foi que o iPhone rolava sem limite de velocidade, diferente
do Android. Era verdade e era de propósito: o governador estava desligado no
iOS por um comentário que atribuía ao WebKit a recusa de `scrollTo` com o dedo
na tela — numa rodada anterior a página simplesmente não se movia ao arrastar.

O diagnóstico estava errado, e a prova é o próprio `normalizeScroll` do GSAP,
que faz exatamente o que o governador faz (Observer com `preventDefault`,
scroll escrito por JS) e funciona no iOS. A diferença são três linhas que ele
escreve ao ativar e o governador nunca escreveu: `touch-action: pan-x
pinch-zoom` em `html` e `body`, `scroll-behavior: auto`, e scroll nunca em
exatamente 0 (bug do iOS em `TouchEvent.clientY`). Sem o `touch-action`, o
compositor decide **no início do gesto**, a partir do CSS, que a rolagem
vertical é dele; o `preventDefault` chega tarde demais e cada `scrollTo` é
sobrescrito por uma rolagem nativa que não anda porque o `touchmove` foi
cancelado. As duas metades falham juntas — o que foi visto.

`claim`/`release` em `MobileNarrative.tsx` espelham essas linhas enquanto o
filme está pinado. `allowClicks` no Observer redespacha o toque que o
`preventDefault` engoliria, para os links do hero continuarem clicáveis. E se
algum dia a página voltar a não se mover sob o dedo, `drive` percebe escritas
de scroll que não pousam por meio segundo e desliga o governador sozinho —
`gov auto-off` no `?diag=1`. `?governor=off` agora funciona também na build
publicada, para comparar no aparelho.

**Uma faixa, não um teto.** O desktop mede a roda com um teto (o orçamento) e
um piso (uma dentada da roda avança no mínimo três frames). O governador de
toque tem os dois, e no celular eles são propositalmente **próximos**:
enquanto o visitante pede movimento, o filme avança a uma taxa de história
entre `GOVERNOR_MIN_RATE` (1,25x) e `GOVERNOR_MAX_RATE` (1,6x), qualquer que
seja a velocidade do dedo. Um arrasto lento não anda frame a frame; um
arremesso não dispara. O dedo decide por quanto tempo o filme anda (enche o
backlog, até 1,5 s de história); a faixa decide a que velocidade — a posição
dentro dela é proporcional ao quanto o backlog está cheio, então um arremesso
sai no topo e assenta para o piso, o que lê como inércia. É o que foi pedido
do aparelho, e é também o que o decodificador quer: uma `playbackRate` que
quase não muda é a única coisa que o AVPlayer apresenta sem tropeço.

Os números são cadência, não gosto: 24 fps num painel de 60 Hz tremem na
maioria das taxas (1x é o clássico 2:3), e num de 120 Hz também. 1,25x é 30 fps
— exatamente dois refreshes por frame a 60 Hz e quatro a 120 —, a única taxa
acima do tempo real que os dois painéis apresentam por igual; por isso é o
piso, onde um scroll deliberado passa o tempo. `?gmin=1.25&gmax=1.6` sobrepõe
os dois na build publicada, para ajustar por sensação no aparelho; a segunda
linha do `?diag=1` mostra a faixa em vigor, o backlog em segundos de história e
a taxa de liberação do momento.

## iOS: "gaps" de frames — o ciclo pausa/play

Com as cenas carregando, o relato seguinte foi de travamentos e saltos de
frames mesmo com tudo local. A causa está no motor, não na rede: em regime
estável a taxa do vídeo converge para a velocidade do scroll e o playhead fica
a um fio do alvo, cruzando-o o tempo todo — o alvo é contínuo, o playhead anda
em passos de frame. A regra "à frente do scroll → segura" não tinha zona morta,
então "à frente por qualquer quantia" era verdade numa fatia de cada período de
frame: cada uma dessas fatias dava `pause()`, e o tick seguinte dava `play()`.
No Chrome a retomada leva menos de um frame e o ciclo era invisível — por isso
sobreviveu. No iOS o AVPlayer retoma em um a três frames, toda vez. A rodada
anterior já tinha registrado o mesmo ciclo como colisões de `play()`/`pause()`
"quase a cada tick" no iPhone, sem ligar os pontos.

Agora (`LEAD_DEAD_ZONE_FRAMES` em `scrubEngine.ts`): dentro de um frame de
adiantamento o vídeo continua tocando, mais devagar — a fórmula de taxa já lê
um gap negativo como "desacelere" — e o alvo o alcança sem parar o pipeline.
Além disso a taxa só é reescrita quando muda mais de 0,04 (cada escrita
re-temporiza o pipeline no iOS), e uma pausa enfileirada atrás de um `play()`
pendente é descartada se o tick seguinte quer o vídeo andando.

No `?diag=1`, por faixa: `fps` são os frames realmente apresentados por segundo
(rVFC) e `pp` as chamadas de `play()` por segundo, ambos sobre o último
segundo; `pc` é o total de `play()`. Rolando a uma velocidade constante, `pp`
deve ficar em 0 ou 1 e `fps` perto de 24 × a taxa. `pp` alto com `fps` baixo é
o ciclo; `fps` baixo com `pp` baixo é o frame que não chega (seek ou decode).

**O arranque frio das cenas 02–04.** Com o ciclo resolvido, a cena 01 ficou
limpa e as outras não. A diferença é onde cada uma paga o primeiro `play()` de
um elemento recém-carregado: no iOS ele custa o preroll do AVPlayer, 100 a
300 ms, e todo `play()` seguinte retoma em cerca de um frame. A cena 01 paga
isso com o filme parado, onde ninguém vê; uma cena que entra no meio do scroll
pagava como um congelamento no primeiro quadro dela. Agora cada faixa é
pré-rolada assim que tem um quadro decodificável (`engine.preroll`: `play()` a
0,08x com `pause()` enfileirado — o quadro anda menos de meio frame antes da
pausa pousar, nada muda na tela) e de novo ao entrar na janela de 3 s antes da
fronteira, se a anterior tem mais de 10 s. Conta em `pr` no `?diag=1`.

## Verificação sem aparelho

O painel de navegador do ambiente de desenvolvimento não dispara
`requestAnimationFrame` — o ticker do GSAP não roda nele e o filme não pode ser
exercitado ali. `tools/mobile-scrub-test.mjs` roda a jornada em Chromium e
WebKit headless via Playwright (rAF a taxa cheia), rolando o pin inteiro e
voltando até a cena 02, com as três políticas do iOS acima emuladas do lado da
página como cenários (`lpm`, `metadata`, `idle`), mais `slow` (só Chromium: link
de 4 Mbit/s e 150 ms, para ver as cópias locais entrando durante a rolagem). Em
22/09/2026 os nove cenários passam: as quatro cenas entram em ordem, sem erros,
e a volta cai na cena 02. No WebKit do Playwright os `blob:` são recusados e o
que passa é o fallback para rede; as cópias locais em WebKit de verdade só se
veem no aparelho.

O que continua sem cobertura: toque real (o governador está desligado no iOS de
propósito), a emenda 03 → 04 vista a olho, e as políticas do iOS de verdade —
os cenários emulam o que o WebKit reporta, não o que o AVFoundation faz. Testar
em aparelho com `?diag=1`, com atenção a: rolagem para cima (caminho de seek, o
mais caro) e `rs`/`pr`/`to` das faixas 02–04 na primeira passagem.
