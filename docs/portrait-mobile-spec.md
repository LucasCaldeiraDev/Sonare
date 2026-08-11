# Conjunto retrato para celular — especificação de produção

Seedance 2.5, 720p, 9:16. Cinco cenas, geradas nativamente em retrato.

Isto **não substitui** os masters 16:9. O desktop continua servindo o conjunto
aprovado que já está no ar; este é um conjunto companheiro, servido apenas para
celular em retrato. No código os dois já convivem: cada cena em
`src/content/timeline.ts` tem `src` (paisagem) e `mobileSrc` (retrato), e
`Journey.tsx` decide qual caminho usar.

## Por que refazer, em uma linha

Uma tela de celular em retrato tem proporção ~0,46; o material é 1,78. Para
preencher a altura, `object-fit: cover` amplia até a altura bater e descarta a
largura excedente — **74% do quadro fica fora da tela, sempre**. Medido em
430×932: dos 1920 px de largura do arquivo 1080p, 499 aparecem. Isso não é
ajustável por código e não muda cortando o arquivo mais largo, porque o
excedente é exatamente o que o `cover` joga fora.

## O que precisa ser respeitado

### 1. Continuidade entre cenas — o requisito mais rígido

A jornada é um filme só. O último quadro de cada cena **é** o primeiro da
seguinte, e é isso que faz as emendas serem invisíveis. Medido no conjunto atual
(PSNR entre o último quadro de uma e o primeiro da próxima):

```
01 -> 02  26,5 dB      02 -> 04  36,8 dB      04 -> 03  28,7 dB      03 -> 05  22,5 dB
```

Enquadramentos sem relação ficam em 10-13 dB, então qualquer coisa acima de ~20
dB indica emenda real.

Na prática: gere **6 stills em retrato** (as fronteiras) e produza cada cena
entre dois stills consecutivos, que é exatamente como o conjunto atual foi
feito. Sem isso, cada corte vira um salto visível.

### 2. Cadência

24 fps CFR. O projeto inteiro conta em quadros lógicos de 24 fps — durações de
cena, janelas de legenda, o offset de abertura, as tolerâncias de handover. Se o
modelo entregar 25 ou 30 fps, avise: dá para tratar, mas mexe em
`MEDIA_FPS`/`MEDIA_SCALE` e não é algo para descobrir depois.

### 3. Durações

O ideal é bater os quadros do conjunto atual, porque as legendas estão
cronometradas contra eles:

| cena | conteúdo | quadros | segundos |
|---|---|---|---|
| 01 | fachada → entrada | 193 | 8,042 |
| 02 | entrada → living → home theater | 241 | 10,042 |
| 03 | home theater → display S110 | 193 | 8,042 |
| 04 | S110 → área gourmet | 193 | 8,042 |
| 05 | gourmet → cortinas abrem → skyline | 193 | 8,042 |

Total: 1013 quadros, 42,208 s.

Se as durações saírem diferentes, **não force nada na geração** — me passe os
números e eu re-cronometro. É uma mudança contida (`SEGMENTS` mais as janelas em
`AUTHORED_OVERLAYS`), não um retrabalho.

### 4. Os equipamentos precisam aparecer nos mesmos momentos

As legendas não são decorativas: cada uma aponta para um equipamento que está em
quadro naquele instante. Se o equipamento aparecer noutro momento, a legenda
descreve algo que não está na tela.

| momento (global) | o que precisa estar em quadro |
|---|---|
| 14,2 – 16,4 s | projetor SIM2, no teto do home theater |
| 15,3 – 17,4 s | torres Bowers & Wilkins 800 Series ladeando a tela |
| 17,4 – 19,5 s | as mesmas torres, com o Tweeter-on-Top legível |
| 22,7 – 26,1 s | o display S110 na parede ripada |
| 30,0 – 32,7 s | sanca, fitas de LED sob a marcenaria, spots embutidos |
| 35,0 – 38,8 s | cortinas abrindo, liberando o skyline |

### 5. Margem de segurança nas laterais

9:16 é 0,5625; um iPhone 14 Pro Max em retrato é 0,461. Mesmo com material
retrato, o `cover` ainda vai cortar cerca de **18% da largura** (9% de cada
lado). Componha o assunto fora dessa faixa — nada essencial encostado na borda.

Para comparação, é o que se ganha: de 74% do quadro descartado para 18%.

### 6. Entrega

Entregue os masters como saem do Seedance, sem tratar. O pipeline da casa faz o
resto:

- re-encode GOP-6 com a receita do projeto (x264 slow, CRF 21, keyint 6,
  BT.709 tv, faststart) — `media-comparison/scene01-fidelity/tools/make-mobile.sh`,
  removendo o passo de `crop` que existe hoje só para simular retrato;
- poster do primeiro quadro da cena 01;
- verificação de PSNR nas emendas antes de promover para `public/media/web/`.

Peso esperado: o conjunto 1:2 atual, recortado, dá 22,19 MB. Um conjunto 720×1280
nativo deve ficar na mesma ordem de grandeza.

## O que fica obsoleto quando isto entrar

- `public/media/web/scene-0X-mobile-bt709-tv-gop6.mp4` — os cinco recortes 1:2,
  substituídos;
- `media-comparison/framing/` — os testes 4:5 e 16:9, que existiam para decidir
  esta questão;
- o passo de `crop` em `make-mobile.sh`;
- a flag `?frame=` em `MobileNarrative.tsx` e a rota `/framing-lab`.

Tudo que é infraestrutura permanece: o scrub pinado, o governor de toque, o
handover entre cenas, o `lvh`/`svh`, a ordem de remedição dos ScrollTriggers.
Nada disso depende do enquadramento do material.
