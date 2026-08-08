# Cena 2 - Living para o corredor

## Objetivo
Criar um unico take continuo dentro da mesma residencia, partindo do master frontal do living e conduzindo a camera para a direita ate a composicao lateral do corredor. A cena deve conectar diretamente o fim da Cena 1 ao inicio da Cena 3.

## Referencias a anexar
1. `public/media/Sonare-Living.png` como quadro inicial e autoridade da arquitetura frontal, telao, projecao da cidade, equipamentos, sofas, mesa e parede lisa em primeiro plano.
2. `public/media/Sonare-Corredor.png` como quadro final e autoridade do enquadramento lateral, corredor, S110 ao fundo, parede lisa, caixa de piso e porcao direita do mesmo telao.

Nao anexar `Sonare-Fachada.png`, `sonare-display-s110.png` nem videos anteriores nesta geracao.

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
| 0-1.5s | Comecar exatamente na composicao frontal de `Sonare-Living.png`. |
| 1.5-4s | Iniciar tracking lateral muito lento para a direita, mantendo altura e lente. |
| 4-6.5s | Passar naturalmente pelo sofa direito e pela parede lisa vazia em primeiro plano. |
| 6.5-8s | Assentar na composicao lateral de `Sonare-Corredor.png`, preparando a aproximacao do S110. |

## Regras de continuidade
- A projecao da cidade e a mesma nas duas referencias. O quadro completo do living deve virar naturalmente a porcao direita visivel no corredor.
- O Remote One existente na mesa do living pode apenas sair do enquadramento conforme a camera se desloca. Ele nao pode deformar, desaparecer enquanto ainda estiver visivel nem ser recriado no corredor.
- O S110 permanece fixo na parede ao fundo e ganha presenca somente conforme a camera chega ao corredor.
- A parede lisa em primeiro plano permanece vazia; nao instalar o S110 nela.

## Prompt unico
Colar o prompt e a lista `Avoid` juntos no mesmo campo.

```text
Create one original, seamless, single continuous 8-second architectural camera move using only the two attached Sonare project stills.

Reference image 1 is the exact required opening frame and the authority for the frontal living room, projected nighttime city image, projector, screen, speakers, sofas, coffee table and smooth right-side foreground wall. Reference image 2 is the exact required destination and the authority for the lateral corridor composition, the right-hand portion of the same projected city image, the floorstanding speaker, smooth walls, black structural frames, wood door and S110 installed on the deeper wall.

Begin exactly in reference image 1. Perform a very slow, smooth stabilized lateral tracking move to the right at constant eye level. Pass naturally beyond the right sofa and around the empty smooth foreground wall. Finish by settling into the lateral corridor composition represented by reference image 2. Preserve the exact architecture, camera height, materials, lighting, furniture and equipment throughout.

The projected city image must remain one continuous static projection. As the camera moves right, the complete 16:9 image visible in the living must naturally become the matching right-hand portion visible on the cropped screen in the corridor reference. Do not change, restart, mirror, stretch or replace the projection.

The physical Remote One on the living table is not the subject. It may leave the frame naturally because of the camera movement, but it must not morph, move, duplicate or disappear while visible. Do not create a remote in the corridor. Keep the S110 fixed on the deeper smooth wall. Photorealistic premium Brazilian residence, warm controlled architectural lighting, stabilized gimbal or slider movement, slow deliberate pacing, 35mm lens, native 4K detail, no audio.

Avoid: cuts, jump cuts, crossfades, montage, teleportation, spatial morphing, changed architecture, changed wall geometry, S110 on the foreground wall, duplicated S110, moving S110, changed city image, projection flicker, blank screen, mirrored skyline, malformed remote, duplicated remote, remote appearing in the corridor, changed speakers, additional furniture, people, hands, silhouettes, sudden acceleration, fast camera movement, handheld shake, drone movement, fisheye distortion, digital zoom, excessive motion blur, warped walls, neon lighting, blue LED strips, daylight, logos, subtitles and watermarks.
```

## Criterios de aprovacao
- Comeca exatamente em `Sonare-Living.png`.
- Termina coerente com `Sonare-Corredor.png`.
- O movimento para a direita e lento, continuo e fisicamente plausivel.
- A projecao da cidade permanece identica e espacialmente coerente.
- O Remote One apenas sai do enquadramento; nao se transforma nem reaparece.
- O S110 continua instalado somente na parede ao fundo.
- Nao ha cortes, morphing, pessoas ou objetos inventados.