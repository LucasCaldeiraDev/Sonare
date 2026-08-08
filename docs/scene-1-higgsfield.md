# Cena 1 - Fachada e entrada no living

## Objetivo
Refazer a primeira cena como um unico walkthrough arquitetonico continuo, usando somente os novos masters aprovados. A porta correta e a porta-janela/painel de vidro existente na fachada; ela deve abrir antes da camera atravessar. O video anterior nao deve ser anexado nem usado como base visual.

## Referencias a anexar
1. `public/media/Sonare-Fachada.png` como primeira referencia e autoridade da fachada, caminho, paisagismo e esquadria de vidro.
2. `public/media/Sonare-Living.png` como segunda referencia e autoridade do destino final, arquitetura interna, telao, caixas, central, projetor e composicao interna.

Os dois masters mostram a mesma projecao noturna da cidade no telao. Essa imagem deve permanecer ativa e coerente durante toda a aproximacao, sem trocar, piscar, reiniciar ou se transformar em outra imagem.

Nao anexar `Sonare-Corredor.png`, `sonare-display-s110.png` nem nenhum video nesta geracao. Esses arquivos pertencem as cenas seguintes e podem confundir a continuidade da entrada.

## Configuracao obrigatoria
- Modelo: Seedance 2.0.
- Preset: General.
- Duracao: 8s.
- Formato: 16:9.
- Resolucao: 4K.
- Bitrate: High.
- Audio: desligado.
- `Use free gens`: ligado.
- Custo mostrado no botao Generate: `0`. Nao gerar se aparecer outro valor.

## Ritmo do take
| Tempo | Acao |
| --- | --- |
| 0-2s | Fachada noturna calma; dolly-in muito leve pelo caminho existente. |
| 2-5s | Aproximacao controlada; a porta-janela de vidro existente desliza lateralmente dentro da propria esquadria preta e abre por completo. |
| 5-6.5s | A camera atravessa somente depois que o vao estiver aberto, sem passar pelo vidro. |
| 6.5-8s | Entrada no living e assentamento suave na composicao do master `Sonare-Living.png`. |

## Prompt unico
Colar o prompt positivo e a lista `Avoid` juntos no mesmo campo do Higgsfield.

```text
Create one original, single continuous 8-second cinematic architectural walkthrough using only the two attached Sonare project stills. Reference image 1 is the required opening composition and the authority for the nighttime facade, landscaping, pathway, black frames and existing floor-to-ceiling glass entrance. Reference image 2 is the required destination and the authority for the connected living room, screen wall, furniture, two matching wood floorstanding speakers, center speaker on its pedestal and ceiling-mounted projector oriented toward the screen. Both images show the same residence, the same connected living room and the same nighttime city image projected on the screen.

From 0 to 2 seconds, begin with a calm wide nighttime facade and a very slow stabilized dolly-in along the existing pathway. From 2 to 5 seconds, approach the existing floor-to-ceiling glass door/window panel; this glass panel must visibly slide sideways within its existing black frame until the entrance is fully open. From 5 to 6.5 seconds, move naturally through the already-open glass entrance without touching or passing through glass. From 6.5 to 8 seconds, continue inside and gently settle into the frontal living-room composition represented by reference image 2. Keep motion slow, deliberate, evenly distributed and physically plausible. Preserve the supplied architecture, room geometry, materials, warm nighttime lighting, furniture and equipment placement. Preserve the exact projected city image, its centered 16:9 crop, brightness and screen placement throughout the shot. Photorealistic premium Brazilian residence, stabilized gimbal or slider movement, 35mm lens, moderate depth of field, refined luxury real-estate cinematography, native 4K detail, no audio.

Avoid: wooden door, conventional hinged door, invented doorway, closed glass during camera passage, camera passing through glass or walls, teleportation, cuts, jump cuts, crossfades, montage, morphing, architecture changes, changed pathway, changed black frames, extra corridor, changed room proportions, mismatched tower speakers, additional furniture, altered projector orientation, projector lens facing the camera, changed city image, blank screen, gray screen, projection flicker, mirrored skyline, stretched projection, extra equipment, people, silhouettes, text, subtitles, watermarks, logos, abrupt acceleration, fast camera movement, drone movement, handheld shake, fisheye distortion, digital zoom, motion-blur artifacts, warped walls, duplicated objects, neon lighting, blue LED strips, cyberpunk style, daytime lighting, overexposure, cartoon rendering and oversaturated colors.
```

## Criterios de aprovacao
- Comeca fiel a `Sonare-Fachada.png`.
- A abertura e de vidro e pertence a esquadria existente.
- O vidro abre visivelmente antes da passagem da camera.
- Nenhuma porta de madeira ou nova abertura e criada.
- O movimento permanece lento e estabilizado durante os 8 segundos.
- Termina dentro do living, coerente com `Sonare-Living.png`.
- A mesma cidade permanece projetada no telao do inicio ao fim.
- As duas torres permanecem iguais.
- O projetor permanece orientado para o telao, sem lente voltada para a camera.
- Nao ha cortes, morphing, pessoas, textos ou objetos extras.
