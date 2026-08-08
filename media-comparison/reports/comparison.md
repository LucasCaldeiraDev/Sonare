# Comparação — Masters oficiais Higgsfield × masters em uso

Gerado em 04/08/2026. Ferramenta: **ffprobe/ffmpeg 9.0-full_build (gyan.dev)**.

## Acesso

A página `https://higgsfield.ai/asset/bd1debe2-4f96-4b95-bf28-ca3c0abe5394` retornou
**"Access Restricted — This project is private"** no navegador embutido (sem a sessão do
usuário) e não há extensão do Chrome conectada. **Nenhuma tentativa de contornar
autenticação foi feita e nenhum cookie foi copiado.**

Os downloads vieram do **conector MCP do Higgsfield já autenticado na conta do usuário**
(workspace privado, plano plus), que expõe a `rawUrl` oficial de cada geração em
`d8j0ntlcm91z4.cloudfront.net`. São os arquivos oficiais — não preview, não thumbnail,
não recompressão, não captura de tela.

**Limitação declarada:** por esse caminho não é possível confirmar a composição da *pasta*
"Luxury House Transition". Os assets foram identificados por duração, conteúdo do prompt e,
definitivamente, por **hash contra os masters em uso**.

## Resultado

Os 5 masters usados pelo projeto são **bit a bit idênticos** aos downloads oficiais.

| Cena | Asset ID | Duração | Resolução | Frames | Bitrate | Tamanho | SHA-256 igual? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 fachada | `2bc8f51e…` | 7,041667 s | 3876×2136 | 169 | 39,81 Mbps | 35,04 MB / 33,42 MiB | **IDÊNTICO** |
| 02 living | `2e3f32ab…` | 4,041667 s | 3876×2136 | 97 | 28,15 Mbps | 14,22 MB / 13,56 MiB | **IDÊNTICO** |
| 03 display | `81137133…` | 5,041667 s | 3856×2148 | 121 | 20,47 Mbps | 12,90 MB / 12,30 MiB | **IDÊNTICO** |
| 04 gourmet | `11e2308a…` | 5,041667 s | 3876×2136 | 121 | 32,19 Mbps | 20,28 MB / 19,34 MiB | **IDÊNTICO** |
| 05 skyline | `527c3b10…` | 8,041667 s | 3876×2136 | 193 | 28,87 Mbps | 29,02 MB / 27,68 MiB | **IDÊNTICO** |

Todos: H.264 Main, yuv420p, 24/1 fps, **sem áudio**, e **sem metadata de cor**
(`color_range`, `primaries`, `transfer`, `colorspace` = unknown).

Um sexto arquivo foi baixado — `efbb3a2e…` (8 s, 32,04 MB) — uma **variante anterior da
cena 5 que não é usada** no site. Mantido para referência.

## Achado que explica a diferença de qualidade percebida

Os masters têm **um único keyframe para o clipe inteiro** (1 keyframe / 169 frames na
cena 1). O site nunca tocou o master: tocava um **re-encode** meu. Medido:

| | Bitrate | Tamanho | VMAF vs master |
| --- | --- | --- | --- |
| Master oficial | 39,8 Mbps | 33,4 MiB | — (referência) |
| Derivado do site (GOP 6, CRF 17) | 63,9 Mbps | 53,6 MiB | **79,65** (mín 63,05) |

Mesmo gastando **60 % mais bitrate**, o re-encode perde qualidade real — é perda de
geração, não falta de bits. Por isso o VLC (que toca o master) parece melhor.

**Correção verificada:** remux com `-c copy` + tags BT.709 full range produz stream de
vídeo **bit a bit idêntico** (MD5 confere), com colorimetria correta e **38 % menor**
que o re-encode.

## Recomendação de master definitivo por cena

Os arquivos já em `public/media/` **são** os oficiais — não há o que substituir. O que muda
é o tier 4K servido: deve ser **remux do master**, não re-encode.

## Não versionar no Git

`media-comparison/higgsfield-originals/`, `current-masters/`, `frames/` e qualquer
`*.mp4`/`*.png`/`*.jpg` dentro de `media-comparison/` já estão no `.gitignore`.
Somente `reports/*.json|csv|md` entram no versionamento.
