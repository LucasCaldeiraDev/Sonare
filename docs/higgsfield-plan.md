# Higgsfield Plan

## Objetivo
- Criar assets de video/imagem para uma landing page premium da Sonare sem inflar custo, peso ou complexidade de edicao.
- A sequencia deve apoiar o site, nao substituir conteudo HTML, formulario e CTA.
- Para a cena de audio/cinema, consultar obrigatoriamente `docs/equipment-scene-reference.md` e as imagens em `docs/references/equipment`.

## Storyboard confirmado pelo briefing
1. Fachada externa noturna de residencia contemporanea brasileira de alto padrao.
2. Aproximacao e entrada progressiva no living.
3. Iluminacao arquitetural ativando cenas suaves.
4. Audio residencial high-end com duas caixas Bowers & Wilkins 800 Series Diamond de piso em Satin Walnut, caixa central coordenada com pedestal e parede frontal lisa.
5. Home theater com telao retratil descendo, sem movel ou rack sob a tela.
6. Projetor SIM2 UltraNero 4 instalado no teto iniciando a experiencia audiovisual.
7. Controle Piero real sobre suporte na mesa de centro e display Piero instalado na parede direita em cena propria.
8. CTA final: Agendar uma Visita Tecnica.

## Modelos escolhidos
- Modelo de imagem escolhido: Nano Banana Pro 4K para stills e imagens-base.
- Modelo promocional disponivel: Seedance 2.0, preset General.
- Configuracao atual: 8s, 16:9, 4K, bitrate High, audio desligado e `Use free gens` ativado.
- Confirmar custo `0` antes de gerar. Nao recomendar outro modelo ou modo durante esta rodada promocional.

## Estrategia de menor custo com qualidade premium
- Produzir poucos takes mestres muito bons em vez de muitos clipes medianos.
- Priorizar 5 cenas principais na primeira rodada: fachada, living/luzes, audio, cinema/projetor, Piero/CTA.
- Dividir em 7 ou 8 momentos no site usando cortes, fades, mascaras, crop, zoom sutil e composicao web.
- Gerar primeiro stills/posters de cada cena para aprovar direcao antes de gastar em video.
- Fazer videos curtos com movimento simples e controlado; cenas muito complexas tendem a custar mais iteracoes.
- Reaproveitar o mesmo ambiente com mudancas de luz e enquadramento para manter continuidade visual.
- As referencias de equipamentos fornecidas pelo cliente podem orientar composicao e acabamento, mas nao substituem assets oficiais/autorizados para publicacao.
- Nunca pedir para a IA inventar logotipo, lettering, interface, modelo ou quantidade de drivers de um produto real.

## Producao modular por cenas
- A experiencia sera produzida em quatro cenas independentes, substituiveis e conectadas por quadros de continuidade.
- Cada cena deve ter quadro inicial, quadro final, camera, lente, crop, seed/referencias e estado dos equipamentos documentados.
- Alteracoes em uma cena nao devem exigir a regeneracao da sequencia completa.
- O ultimo quadro aprovado de uma cena deve corresponder ao primeiro quadro da seguinte.
- Sequencia oficial: Fachada > Living > Corredor > close S110 > area gourmet > cortinas fechando > ambiente escuro > logo Sonare.
- A Cena 4 permanece pendente da imagem master da area gourmet.
## Stills masters atuais
| Cena | Arquivo | Uso |
| --- | --- | --- |
| Fachada | `public/media/Sonare-Fachada.png` | Inicio da Cena 1; mostra o living e a cidade projetada atraves do vidro. |
| Living/cinema | `public/media/Sonare-Living.png` | Fim da Cena 1 e inicio da Cena 2; telao com cidade completa em 16:9. |
| Corredor/Piero | `public/media/Sonare-Corredor.png` | Fim da Cena 2 e inicio da Cena 3; telao parcial com a mesma cidade, mesa sem controle e S110 ao fundo. |
| Close S110 | `public/media/sonare-display-s110.png` | Autoridade do produto e interface para o fim da Cena 3 e inicio da Cena 4. |
| Area gourmet | Pendente | Destino da Cena 4; imagem ainda sera produzida pelo cliente. |

- Os quatro masters existentes estao aprovados como direcao visual para as proximas geracoes.
- Fachada, living e corredor compartilham a mesma projecao noturna da cidade.
- Manter pendente a confirmacao formal de direitos antes da publicacao no site.
## Duracao recomendada
- Decisao atual: nao fazer um unico hero longo de 20 segundos.
- Cada cena deve permanecer independente e seguir a configuracao registrada no respectivo documento.
- A Cena 1 conecta fachada e living.
- A Cena 2 conecta living e corredor.
- A Cena 3 conecta corredor e close do S110.
- A Cena 4 conecta o S110 a area gourmet e ao encerramento de marca.
- O total visivel no site sera decidido depois da aprovacao dos takes; cortes, mascaras e scroll nao alteram a ordem narrativa.
## Cena 1 confirmada
- `Sonare-Fachada.png` > `Sonare-Living.png`.
- Porta-janela de vidro abre antes da passagem da camera.
- Documento completo: `docs/scene-1-higgsfield.md`.

## Cena 2 confirmada
- `Sonare-Living.png` > `Sonare-Corredor.png`.
- Tracking lento para a direita, passando pelo sofa e pela parede lisa vazia.
- Documento completo: `docs/scene-2-higgsfield.md`.

## Cena 3 confirmada
- `Sonare-Corredor.png` > `sonare-display-s110.png`.
- Push-in lento ate um quadro final contendo somente S110 e parede lisa.
- Documento completo: `docs/scene-3-higgsfield.md`.

## Cena 4 planejada
- `sonare-display-s110.png` > imagem futura da area gourmet > cortinas fechando > ambiente escuro > logo Sonare.
- Nao gerar antes de receber e aprovar a imagem da area gourmet.
- Documento de preparacao: `docs/scene-4-higgsfield.md`.
## Ritmo sugerido da narrativa final
- Comecar com escala arquitetonica ampla e aproximar gradualmente a experiencia.
- Cena 1: exterior para interior.
- Cena 2: living frontal para circulacao lateral.
- Cena 3: ambiente para produto.
- Cena 4: produto para area gourmet, fechamento das cortinas, escurecimento e marca.
- Nao tentar executar as quatro cenas em uma unica geracao.
- O CTA permanece em HTML no site; o video termina somente com a marca.
## Estilo de camera recomendado
- Cinematografico arquitetonico premium.
- Camera lenta, estavel, como gimbal/slider/dolly.
- Movimentos: slow dolly-in, lateral tracking, push-in suave, reveal por parede/porta, rack focus sutil.
- Lentes sugeridas no prompt: 35mm para ambiente, 50mm para detalhes, profundidade de campo moderada.
- Iluminacao: noturna elegante, luz arquitetural quente e controlada, contraste alto mas com sombras preservadas.
- Materiais: madeira nobre, pedra, vidro, metal escovado, tecido acustico, superficies discretas.
- Sensacao: arquitetura brasileira contemporanea, alto padrao, conforto silencioso, tecnologia integrada.

## Evitar nos prompts
- Estetica gamer, neon, cyberpunk, hologramas, excesso de LEDs azuis, casa futurista exagerada.
- Mansao americana generica, decoracao ostentativa, excesso de dourado, marble palace ou visual de showroom falso.
- Camera muito rapida, drone interno, cortes bruscos, zoom digital evidente.
- Pessoas em destaque nesta fase; se aparecerem, devem ser secundarias e elegantes.
- Logos de terceiros e produtos reais sem material oficial.
- Movel de TV, rack, nichos, prateleiras, receiver exposto, cabos aparentes ou equipamentos genericos na parede do telao.
- Inventar caixas B&W, acabamento inexistente, interface Piero, logotipo SIM2 ou usar a referencia `STM2 Multimedia` como se fosse SIM2.
- Usar o prompt arquitetonico generico sozinho para uma cena de produto; sempre anexar as referencias e o layout aprovado.
- Usar B&W 805, caixas bookshelf, caixas compactas sobre pedestal ou frontais diferentes da referencia amadeirada de piso.
- Deixar a caixa central flutuando/sem suporte; o pedestal dedicado e obrigatorio.
- Colocar o display Piero sobre a mesa ou na parede lisa vazia em primeiro plano. O S110 fica na parede lisa ao fundo, depois do sofa direito.
- Usar o SIM2 Nero 4 antigo ou um projetor generico quando a referencia obrigatoria e o SIM2 UltraNero 4.

## Prompt base para cenas arquitetonicas
```text
Premium Brazilian contemporary residence at night, architectural luxury, integrated home automation, warm indirect lighting, elegant living room, high-end audio and home theater atmosphere, cinematic architectural walkthrough, slow stabilized dolly movement, 35mm lens, natural materials, black silver and subtle gold Sonare brand mood, sophisticated minimalism, technology discreetly integrated into architecture, realistic, high-end interior design, no neon, no gamer style, no futuristic holograms, no excessive gold.
```

## Prompt base da cena modular de audio/cinema
Usar somente depois de confirmar os modelos exatos listados em `docs/equipment-scene-reference.md`. Para still, nao incluir comandos de movimento de camera.

```text
Photorealistic premium contemporary Brazilian living room at night, fixed eye-level architectural camera, 35mm lens, exact 16:9 composition designed as a continuity master frame. The front cinema wall is perfectly smooth, continuous and minimalist, with no TV cabinet, no media console, no shelves, no niches and no decorative wall panels. A centered retractable projection screen is integrated above the wall. Place exactly two Bowers & Wilkins 800 Series Diamond floorstanding speakers symmetrically at the far left and far right, using the supplied wood floorstanding reference as the visual authority for silhouette, separated upper head, driver arrangement, metal details and Satin Walnut finish. Never replace them with 805 bookshelf speakers or compact speakers on stands. Place one coordinated wood-finish center speaker aligned below the screen on its own dedicated visible low pedestal, never floating and never wall-mounted. A SIM2 UltraNero 4 projector is correctly ceiling-mounted and aligned with the screen, accurately following the supplied UltraNero 4 reference: low black rectangular chassis, offset large lens, red diagonal top line and restrained front branding. Do not invent or distort any logo; branded marks must come from supplied official references. Between the seating/camera and the screen, place a refined low central table with the supplied physical Piero remote control resting on its discreet charging base/support. Do not place the Piero display on the table. The real supplied Piero display is installed flush on the right-side wall in a separate final shot. No generic electronics, no extra speakers, no visible cables, no fake interfaces, no people, no text, no invented branding. Preserve negative space, realistic proportions, discreet technology, natural materials, black, silver and restrained Sonare gold accents. This is a modular scene: architecture, camera, furniture and product positions must remain identical in all later lighting, curtain, screen and projector states.
```

### Estado inicial do master
```text
Initial neutral state: projection screen fully retracted, projector off, architectural lights dimmed, curtains fully closed, smooth front wall visible. Preserve enough shadow detail for later lighting activation. Do not change any other element.
```

## Ordem pratica de producao
1. Usar os masters atuais em `public/media` como quadros inicial e final.
2. Gerar a Cena 1 conforme `docs/scene-1-higgsfield.md`.
3. Gerar a Cena 2 conforme `docs/scene-2-higgsfield.md`.
4. Gerar a Cena 3 conforme `docs/scene-3-higgsfield.md`.
5. Produzir e aprovar o master da area gourmet.
6. Completar e gerar a Cena 4 conforme `docs/scene-4-higgsfield.md`.
7. Exportar poster de cada video, selecionar os trechos aprovados e otimizar desktop/mobile.
8. Integrar no site com fallback para `prefers-reduced-motion`.
## Pendencias
- Confirmar se a referencia amadeirada corresponde a 804 D4 ou 802 D4, alem dos modelos exatos e direitos de uso.
- Receber assets oficiais em alta resolucao para publicacao.
- Confirmar se cada asset pode ser publicado.
- Produzir e aprovar a imagem 16:9 da area gourmet e definir onde o logo final sera composto.

## Bloqueios antes da producao final
- Nao gerar videos finais antes de aprovar stills/posters das cenas principais.
- Nao inserir produtos reais sem imagens oficiais/fornecidas.
- Nao recriar interface Piero por IA sem base real/autorizada.
- Aguardar imagens e autorizacoes listadas em `docs/pending-inputs.md`.



