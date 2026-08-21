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

## Não verificado

O comportamento **rodando** — governador, scrub, dissolve, handover — foi medido
e simulado, nunca exercitado com toque real: o painel de navegador do ambiente
de desenvolvimento reporta a aba como `hidden` e rAF fica em zero. Testar em
aparelho, com atenção a: rolagem para cima (caminho de seek, o mais caro), a
emenda 03 → 04, e `?governor=0.7` se pular frames.
