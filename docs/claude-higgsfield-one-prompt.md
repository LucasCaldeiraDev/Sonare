# Prompt unico para Claude - Higgsfield Sonare

Use este prompt para preparar o Claude antes de qualquer envio ao Higgsfield.

```text
Voce esta no projeto Sonare em:
C:\Users\lucascaldeira\Documents\Programacao\Projeto SaaS\Sonare

Objetivo: assumir a producao Higgsfield das cenas da experiencia imersiva Sonare e arquitetar a integracao no sistema. Primeiro leia os arquivos abaixo, nesta ordem, antes de executar qualquer comando, gerar video, alterar codigo ou enviar assets:

1. docs/higgsfield-plan.md
2. docs/equipment-scene-reference.md
3. docs/scene-1-higgsfield.md
4. docs/scene-2-higgsfield.md
5. docs/scene-3-higgsfield.md
6. docs/scene-4-higgsfield.md
7. docs/implementation.md
8. docs/handoff-video-scroll.md
9. src/content/timeline.ts

Depois de ler, faca um diagnostico curto respondendo:
- quais cenas ja tem prompt fechado;
- quais assets de referencia existem em public/media e docs/references/equipment;
- quais cenas estao bloqueadas por falta de master, direitos de uso ou confirmacao;
- como o video final unico deve ser produzido sem perder a modularidade.

Direcao obrigatoria:
- Use Higgsfield / Seedance 2.0 para geracao de video, preset General, 8s, 16:9, 4K, bitrate High, audio desligado, Use free gens ligado, e so gere quando o custo exibido for 0.
- As cenas 1, 2 e 3 ja tem prompts operacionais nos respectivos arquivos.
- A cena 4 esta bloqueada enquanto nao houver master 16:9 aprovado da area gourmet e decisao sobre logo final.
- Nao invente uma cena 5 se ela nao estiver documentada. No sistema atual, "cena 5" pode significar o segmento skyline/cortinas/encerramento de marca em src/content/timeline.ts e docs/implementation.md; confirme isso lendo os arquivos.
- O objetivo do usuario e ter um video final unico da cena 1 ate a 5, mas isso nao deve significar pedir ao Higgsfield para gerar tudo em uma unica tomada gigante. Gere/valide cenas modulares e depois monte um master final unico com ffmpeg ou com a arquitetura existente do site.
- Nunca sobrescreva os videos atuais em public/media/web sem backup e sem aprovacao.
- Nunca publique assets de terceiros, logos, interfaces ou imagens de equipamentos sem confirmar que sao autorizados.
- Nunca use a referencia STM2 como SIM2.
- Nunca troque as caixas de piso Bowers & Wilkins 800 Series Diamond por 805/bookshelf.
- Preserve a arquitetura aprovada: fachada > living > corredor > close S110 > area gourmet > cortinas/skyline > logo Sonare.
- O CTA fica no HTML do site, nao dentro do video.

Fluxo esperado:
1. Verificar se o CLI do Higgsfield esta instalado e autenticado:
   higgsfield account status
   Se nao estiver autenticado, pedir ao usuario para rodar higgsfield auth login.

2. Validar o modelo antes de enviar:
   higgsfield model get seedance_2_0 --json

3. Para cada cena, usar apenas as referencias indicadas no arquivo da cena:
   Cena 1:
   - public/media/Sonare-Fachada.png
   - public/media/Sonare-Living.png
   - prompt de docs/scene-1-higgsfield.md

   Cena 2:
   - public/media/Sonare-Living.png
   - public/media/Sonare-Corredor.png
   - prompt de docs/scene-2-higgsfield.md

   Cena 3:
   - public/media/Sonare-Corredor.png
   - public/media/sonare-display-s110.png
   - prompt de docs/scene-3-higgsfield.md

   Cena 4/5:
   - nao gerar ate existir master aprovado da area gourmet e definicao do encerramento.
   - ler docs/implementation.md para entender se cenas 4 e 5 ja existem como videos atuais e como elas entram no master.

4. Salvar qualquer resultado novo fora de public primeiro, por exemplo:
   media-comparison/higgsfield/new-renders/

5. Depois de gerar/baixar os videos aprovados, montar um master final unico apenas como derivado:
   - normalizar resolucao/aspect ratio quando necessario;
   - preservar 16:9;
   - manter H.264, yuv420p, BT.709, faststart, sem audio;
   - gerar tambem reversos se a arquitetura do scroll precisar;
   - validar duracao, frames, juncoes e ausencia de freezes perceptiveis.

6. Integrar no sistema somente depois de validar:
   - atualizar src/content/timeline.ts se a arquitetura continuar segmentada;
   - ou documentar uma alternativa com master unico se for melhor;
   - manter fallback mobile e prefers-reduced-motion;
   - rodar npm run build;
   - testar localmente no Vite;
   - nao remover os assets antigos ate o usuario aprovar visualmente os novos.

Entrega esperada antes de gerar:
- um plano de execucao com as cenas, inputs, comando Higgsfield proposto para cada uma, pendencias e riscos.
- nao iniciar geracao antes de o usuario aprovar esse plano, especialmente porque cena 4/5 depende de asset master da area gourmet.
```

