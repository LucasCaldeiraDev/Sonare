# Baseline de fidelidade — cenas 01–05

Estado aprovado e congelado da colorimetria. Qualquer trabalho futuro (vídeo
nativo, WebGL, sharpening, junções, suavidade) parte daqui e deve reproduzir
estes números.

**Atualizado:** 2026-08-05 — opção A: BT.709 **tv/limited** nas cinco cenas.
**Renderer em produção:** Canvas 2D (`CanvasNarrative`), mantido.

---

## 1. A decisão de range, e por que ela mudou

Os cinco masters Higgsfield saíram **sem nenhuma metadata de cor**: sem
`video_signal_type` na VUI do H.264 e sem box `colr` no container.

Isso significa que **todo player do mundo assume limited range** — VLC,
QuickTime, o preview do Higgsfield, o Chrome. Esse default é o visual que o
cliente revisou e aprovou.

Numa rodada anterior foi gerado um conjunto `pc/full`, com o argumento técnico
de que o luma codificado percorre 3..250 (isto é, o conteúdo usa a headroom).
O argumento é correto quanto ao dado, mas levava a um segundo erro: decodificar
assim entrega uma curva mais plana que ninguém tinha aprovado. Na tela, o
`full` aparece visivelmente opaco ao lado do master.

**A escolha vigente é `tv/limited`**, que torna explícito o default que já
existia em vez de mudá-lo. Verificado no Chrome: o remux `tv` e o master sem
tag renderizam **byte a byte iguais** (mesmo SHA-256 no frame capturado,
RMSE 0,000, PSNR ∞).

O preço, dito claramente: o limited ceifa cerca de **0,8% dos pixels**. É uma
decisão de *look*, tomada deliberadamente — não um defeito.

O conjunto `full` foi preservado em
`media-comparison/source-archive/remux-full/` para permitir a comparação a
qualquer momento.

---

## 2. Tabela final das cinco cenas

| | 01 | 02 | 03 | 04 | 05 |
|---|---|---|---|---|---|
| arquivo servido | `scene-01-4k-bt709-tv.mp4` | `scene-02-…-tv` | `scene-03-…-tv` | `scene-04-…-tv` | `scene-05-…-tv` |
| master de origem | `001-Sonare-Cena 01 completa.mp4` | `002-Sonare-Cena 02.mp4` | `003-Sonare-Cena-03.mp4` | `004-Sonare-Cena-04.mp4` | `005-Sonare-Cena-05.mp4` |
| resolução | 3876×2136 | 3876×2136 | **3856×2148** | 3876×2136 | 3876×2136 |
| duração (s) | 7,041667 | 4,041667 | 5,041667 | 5,041667 | 8,041667 |
| frames | 169 | 97 | 121 | 121 | 193 |
| FPS | 24/1 | 24/1 | 24/1 | 24/1 | 24/1 |
| codec | h264 Main@L5.1 | idem | idem | idem | idem |
| bitrate (bps) | 39.806.193 | 28.146.338 | 20.468.410 | 32.183.865 | 28.866.492 |
| **color_range** | **tv** | **tv** | **tv** | **tv** | **tv** |
| primaries | bt709 | bt709 | bt709 | bt709 | bt709 |
| transfer | bt709 | bt709 | bt709 | bt709 | bt709 |
| matrix | bt709 | bt709 | bt709 | bt709 | bt709 |
| tamanho master (B) | 35.039.741 | 14.221.335 | 12.901.055 | 20.284.294 | 29.018.925 |
| tamanho tv (B) | 35.039.568 | 14.221.162 | 12.900.882 | 20.284.121 | 29.018.752 |
| delta | −173 B | −173 B | −173 B | −173 B | −173 B |

---

## 3. Hashes — prova de que não houve reencode

Idênticos entre master, `tv` e `full`, em duas medições independentes.

| cena | MD5 do elementary stream | framemd5 (frames decodificados) |
|---|---|---|
| 01 | `f98db8eb5e9687724cfb989897f2001d` | `d1cfbb4c3d6b2d0065c8d5e87f8fb2f7` |
| 02 | `db33fef3206a60ec2251f10a6f8a729a` | `4fb95adb5116262fd5612042de616239` |
| 03 | `a6a9cfcafde02ff8fb6dc3c56285ce96` | `0e32c14b51c2163123dc33e232b30cef` |
| 04 | `198dda002056a5c4d9de33513931ca9f` | `4ab4a44ea92df126d48c5a44c6aa7308` |
| 05 | `7d13bf1021491306fe49534cf09ea00a` | `5ed3babcfe3f9b22391d2b65a1d0cd43` |

```bash
node media-comparison/scene01-fidelity/tools/verify-scenes.mjs   # full vs master
node media-comparison/scene01-fidelity/tools/tv-validation.mjs   # tv vs full vs master
node media-comparison/scene01-fidelity/tools/junctions.mjs       # luma nas quatro junções
```

---

## 4. currentSrc verificado no Chrome

```
seg 1  3876x2136  rs=4  /media/web/scene-01-4k-bt709-tv.mp4
seg 2  3876x2136  rs=4  /media/web/scene-02-4k-bt709-tv.mp4
seg 3  3856x2148  rs=4  /media/web/scene-03-4k-bt709-tv.mp4
seg 4  3876x2136  rs=4  /media/web/scene-04-4k-bt709-tv.mp4
seg 5  3876x2136  rs=4  /media/web/scene-05-4k-bt709-tv.mp4
```

Canvas backing = CSS × DPR (1920×1080 @ DPR 1) nas cinco cenas.

---

## 5. Clipping por cena (arquivo tv, crop do site 1920×1080)

| cena | preto puro | luma ≤ 2 | estourado |
|---|---|---|---|
| 01 | 0,1652% | 3,7024% | 0,5008% |
| 02 | **2,8912%** | **7,7773%** | 0,4909% |
| 03 | 1,8194% | 2,5077% | 0,0022% |
| 04 | 1,7172% | 3,4679% | 0,2817% |
| 05 | 1,5739% | 4,8481% | 0,1488% |

Para referência, o conjunto `full` marca 0% em todas as colunas nas cinco cenas.
A cena 02 é a mais exposta: o conteúdo escuro projetado na tela do home cinema
é onde o limited mais custa detalhe.

### Regiões auditadas (full → tv)

| cena | região | full | tv |
|---|---|---|---|
| 01 | céu / estrelas | 30,54 | 15,42 |
| 01 | luz da fachada | 75,90 | 68,70 |
| 01 | luzes do caminho | 78,28 | 71,37 |
| 02 | tela de projeção | 54,49 | 43,63 |
| 02 | caixa B&W esquerda | 41,35 | 28,13 |
| 02 | caixa B&W direita | 150,30 | 154,92 |
| 03 | tela do S110 | 151,43 | 155,90 |
| 03 | ícones do S110 | 150,75 | 155,16 |
| 04 | sanca de luz | 113,72 | 112,43 |
| 04 | bancada | 106,83 | 104,57 |
| 05 | skyline | 74,28 | 67,32 |
| 05 | cortina | 48,11 | 37,26 |

Sombras descem, realces sobem — o comportamento esperado da expansão
limited→full. As cenas claras (03) ficam mais brilhantes; as escuras (01, 05)
ganham contraste.

---

## 6. Junções — mesma interpretação nas cinco

| junção | último frame | primeiro frame | Δ luma |
|---|---|---|---|
| 01 → 02 | 101,51 | 102,30 | +0,79 |
| 02 → 03 | 107,04 | 104,71 | −2,33 |
| 03 → 04 | 149,05 | 149,62 | +0,57 |
| 04 → 05 | 97,12 | 97,37 | +0,25 |

Os oito frames decodificam como limited (min 0, max 252–254). Nenhuma cena
ficou para trás na interpretação `full` — não há degrau de contraste em
nenhuma fronteira.

---

## 7. Poster da cena 01

`public/media/web/scene-01-poster-desktop.avif` — 852.339 B, AVIF 4:4:4 crf 6,
3876×2136, gerado **a partir do decode tv** do arquivo que vai ao ar.

Desenhado no próprio canvas pelo mesmo `drawImage` do vídeo. Handover medido:

| viewport | PSNR | acutância | Δ luma |
|---|---|---|---|
| 1920×1080 | 44,74 dB | −0,6% | −1,22 |
| 1440×900 | 42,04 dB | −15,0% | −1,19 |

O resíduo em 1440×900 é conhecido e não é do poster: o Chrome filtra fontes
`<img>` e `<video>` de forma diferente dentro do mesmo `drawImage`, e ali o
poster fica **menos** aliasado que o vídeo.

---

## 8. Bundle de produção

| | valor |
|---|---|
| `dist` total | **109 MB** |
| `dist/assets` | 700 KB |
| `dist/media` | 108 MB |
| bundle JS | 352,75 KB (gzip 119,42) |

Cinco maiores arquivos = os cinco remuxes `tv`. Um único chunk JS; as rotas de
diagnóstico são importadas dinamicamente sob `import.meta.env.DEV` e somem do
build de produção.

---

## 9. Arquivo-fonte (nada foi apagado)

| caminho | conteúdo |
|---|---|
| `media-comparison/source-archive/masters/` | 5 masters sem tag |
| `media-comparison/source-archive/stills/` | 7 PNGs grandes |
| `media-comparison/source-archive/remux-full/` | 5 remuxes `pc/full` |
| `media-comparison/current-masters/` | segunda cópia dos masters |
| `diagnostic-refs/` | referências do /quality-diagnostic |

Todos fora de `public/`, portanto fora do bundle. SHA-256 conferido antes e
depois de cada movimentação.

---

## 10. Próxima rodada (não iniciada)

Comparação em **movimento**, não só no frame zero:

- vídeo nativo · Canvas 2D · WebGL sem sharpen · WebGL com sharpen 0,25;
- medir halos, shimmer, frames apresentados, dropped frames, GPU e suavidade.

O shader com unsharp já está implementado em `src/lib/videoGL.ts` e exposto na
rota de diagnóstico (`D·SHARPEN`), mas **não** é usado em produção.

Medição de referência no frame 0, 1920×1080 (acutância por pixel de tela):

| variante | acutância |
|---|---|
| full + canvas | 5,995 |
| **tv + canvas (produção)** | **6,941** |
| tv + webgl sem sharpen | 6,686 |
| tv + webgl sharpen 0,25 | 7,403 |
| tv + webgl sharpen 0,80 | 9,142 |
| VLC a 1700 px (referência) | 7,476 |
