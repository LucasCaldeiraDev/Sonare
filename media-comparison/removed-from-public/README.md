# Arquivos retirados de `public/` — 343 MB

Estes arquivos **não são carregados pelo site**. Foram movidos para cá com
`git mv`, então continuam versionados e nada se perdeu — só pararam de ser
publicados, porque o Vite publica apenas `public/`.

Efeito: `dist` caiu de **891 MB para 549 MB**.

A estrutura original foi preservada — `media/`, `media/mobile/`,
`media/button/` — então dá para saber de onde cada arquivo veio e devolver
qualquer um com um `git mv` invertido.

> **Nada aqui foi apagado.** Analise com calma e apague o que quiser depois.

---

## O QUE ESTÁ AQUI (fora do ar, apagável após sua análise)

### `media/` — 250,7 MB

Vídeos de origem e masters PNG das cenas.

| arquivo | tamanho | o que é |
|---|---|---|
| `001.mp4` … `005.mp4` | 139,0 MB | vídeos de origem antigos das cinco cenas |
| `Gourmet.png` | 27,0 MB | master da cena gourmet |
| `Skyline.png` | 25,7 MB | master da cena skyline |
| `Display-S110.png` | 17,9 MB | master do display |
| `s110-wall-4k.png` | 14,9 MB | **ver ressalva abaixo** |
| `Entrada.png` | 7,9 MB | master da entrada |
| `Living.png` | 7,0 MB | master do living |
| `start.png` | 6,0 MB | master da fachada |
| `s110.png` | 5,2 MB | still do S110 |

### `media/mobile/` — 48,8 MB

Stills de uma tentativa anterior de mobile, anterior ao conjunto 9:16 nativo:
`001-start.png`, `002-entrada.png`, `003-living.png`, `004-s110.png`,
`005-gourmet.png`, `006-skyline.png`, e um arquivo `Cena` sem extensão
(7,5 MB).

### `media/button/` — 42,9 MB · 38 arquivos

Pasta de trabalho dos estados do botão (`New/` e `New/_prontas-claude/`),
com PNGs e webps de variações.

---

## RESSALVAS — pense duas vezes antes de apagar estes dois grupos

**`s110-wall-4k.png` (14,9 MB).** É o master do composite do S110: a cena de
parede amadeirada gerada, com o bitmap real da interface do cliente colado em
escala nativa 1:1 no retângulo medido da tela. É dele que saem as duas
derivadas que o site serve — `s110-spotlight.webp` e `s110-zoom.webp` — e
também a versão 9:16 do mobile. Apagar não quebra nada hoje; mas se aquela
imagem precisar ser refeita, é daqui que ela sai. Ver o comentário em
`src/components/S110Section.tsx`.

**Os masters PNG das cenas** (`Gourmet`, `Skyline`, `Entrada`, `Living`,
`start`, `Display-S110` — 91,5 MB). São as imagens de origem da narrativa.
Mesma lógica: não são usados em runtime, mas são o material de origem.

Se você tem esses dois grupos guardados em backup fora do repositório, podem
ir embora sem dó. Se não tem, eles são a única cópia.

---

## O QUE FICOU EM `public/` — NÃO APAGUE

Tudo abaixo é carregado em produção. A conferência foi feita expandindo os
caminhos que o código monta por template, não só por busca literal — é por isso
que os arquivos de vídeo aparecem por tier, mesmo sem nenhum deles estar escrito
por extenso no código.

### `public/media/web/` — 547 MB · a jornada inteira

- `scene-0N-{4k,1440p,1080p}-bt709-tv-gop6.mp4` **e** `-reverse.mp4`
  — cinco cenas × três tiers × dois sentidos = **30 arquivos**.
  O tier é escolhido em runtime pelo tamanho do canvas (`MEDIA_VARIANT`), então
  **os três tiers são alcançáveis** e nenhum é descartável. Os companheiros
  `-reverse` são o que faz rolar para cima transmitir em vez de fazer seek.
- `scene-0N-portrait-720x1280-bt709-tv-gop6.mp4` — as **quatro** cenas do
  celular.
- `scene-01-poster-desktop.webp` (é também a `og:image`), `.avif`, e
  `scene-01-poster-portrait.webp`.
- `scene-01-4k-bt709-tv.mp4`.
- `s110-spotlight.webp`, `s110-zoom.webp`, `s110-zoom-portrait.webp`.
- `sol-start.webp`, `sol-entrada.webp`, `sol-living.webp`, `sol-gourmet.webp`,
  `sol-skyline.webp` — os cartões decorativos do zoom parallax.

### `public/media/stills/` — 624 KB

`fachada.webp`, `living.webp`, `s110.webp`, `gourmet.webp`, `skyline.webp` —
carregados por template (`/media/stills/${seg.id}.webp`) no modo de movimento
reduzido. **Não aparecem escritos no código**; um grep literal não acha quatro
dos cinco.

### `public/media/brands/` — 36 KB

Os oito logotipos exibidos: `bowers-wilkins`, `rotel`, `nad`, `jl-audio`,
`audioquest`, `piero`, `stormaudio`, `integra.svg`.

> Estes continuam com **direito de publicação pendente** em
> `docs/pending-inputs.md`. Questão de direitos, não de arquivo — não apague,
> mas confirme antes de publicar.

### `public/brand/` — 124 KB

`sonare-mark-64.png` e `sonare-mark-192.png` (favicon e ícone do
`manifest.json`), `sonare-logo-dark.png` (navbar).

Ficaram aqui de propósito, embora não sejam carregados: `sonare-logo-light.png`
(42 KB) e `README.md` (2,3 KB). São 44 KB e o logo claro é ativo de marca
legítimo — não valia o risco de mover.

### Raiz de `public/`

`manifest.json`, `robots.txt`, `sitemap.xml`, `_headers`.

---

## Como devolver um arquivo

```bash
git mv media-comparison/removed-from-public/media/Gourmet.png public/media/Gourmet.png
```
