# Animation Plan

> **Estado 04/08/2026:** os 5 vídeos finais foram entregues e integrados.
> A implementação concluída (dois atos com scrub + interlúdio S110, modos
> mobile/reduced-motion e pipeline de otimização) está documentada em
> `docs/implementation.md`. O plano abaixo permanece como histórico de direção.

## Principio central
- Estrategia e conteudo antes do efeito visual.
- Cada movimento deve ajudar o visitante a entender a experiencia Sonare.
- Animacoes devem ser premium, lentas, previsiveis e performaticas.
- Movimento deve combinar com a identidade: preciso, silencioso, arquitetonico e sem excesso de brilho.
- Para Higgsfield, seguir `docs/higgsfield-plan.md` e o documento especifico de cada cena.

## Sequencia oficial de cenas
1. **Cena 1 - Fachada para living:** partir de `Sonare-Fachada.png`, abrir a porta-janela de vidro existente, entrar na casa e terminar em `Sonare-Living.png`.
2. **Cena 2 - Living para corredor:** partir de `Sonare-Living.png`, deslocar a camera para a direita, passar pelo sofa e pela parede lisa e terminar em `Sonare-Corredor.png`.
3. **Cena 3 - Corredor para S110:** partir de `Sonare-Corredor.png`, aproximar do display e terminar em close frontal contendo somente o S110 e a parede lisa, usando `sonare-display-s110.png` como autoridade do produto e da interface.
4. **Cena 4 - S110 para area gourmet:** sair do close do display, revelar a futura area gourmet, fechar as cortinas, escurecer progressivamente o ambiente e encerrar com o nome/logotipo oficial da Sonare.

## Masters atuais
| Quadro | Arquivo | Continuidade |
| --- | --- | --- |
| Fachada | `public/media/Sonare-Fachada.png` | Abertura externa; living e cidade projetada aparecem atraves do vidro. |
| Living | `public/media/Sonare-Living.png` | Destino da Cena 1 e origem da Cena 2; cidade completa em 16:9 no telao. |
| Corredor | `public/media/Sonare-Corredor.png` | Destino da Cena 2 e origem da Cena 3; porcao direita correspondente da mesma projecao; mesa sem controle. |
| Close S110 | `public/media/sonare-display-s110.png` | Autoridade visual do display, interface e parede lisa para o fim da Cena 3 e inicio da Cena 4. |
| Area gourmet | Pendente | Sera produzida pelo cliente antes de fechar a Cena 4. |

## Continuidade obrigatoria
- O ultimo quadro de cada cena deve corresponder ao primeiro quadro da cena seguinte.
- Fachada, living e corredor mostram a mesma cidade projetada, sem troca, espelhamento, flicker ou mudanca de crop incoerente.
- O Remote One aparece no living, mas nao no corredor. Na Cena 2 ele deve apenas sair do enquadramento conforme a camera se move; nunca deformar ou desaparecer enquanto estiver visivel.
- O S110 fica na parede lisa ao fundo, depois do sofa direito. Nao instalar o display na parede lisa vazia em primeiro plano.
- A Cena 3 termina mais fechada que o still contextual: somente S110 e parede lisa no quadro final.
- A Cena 4 permanece bloqueada ate a aprovacao da imagem master da area gourmet.

## Documentos por cena
- Cena 1: `docs/scene-1-higgsfield.md`.
- Cena 2: `docs/scene-2-higgsfield.md`.
- Cena 3: `docs/scene-3-higgsfield.md`.
- Cena 4: `docs/scene-4-higgsfield.md`.

## Estrategia modular
- Nao produzir um unico video continuo para todas as acoes.
- Gerar cada cena como trecho independente e substituivel.
- Documentar quadro inicial/final, camera, lente, crop, seed/referencias e estado de cada elemento.
- Ao corrigir uma acao, regenerar somente a cena afetada.
- Para composicao e restricoes dos equipamentos, seguir `docs/equipment-scene-reference.md`.

## Estilo de camera
- Cinematografico arquitetonico premium.
- Movimentos: slow dolly-in, lateral tracking, push-in suave e reveal por parede/porta.
- Lentes sugeridas no prompt: 35mm para ambientes e 50mm para detalhes.
- Iluminacao: noturna elegante, luz indireta quente, contraste alto e sombras preservadas.
- Sensacao: arquitetura brasileira contemporanea, alto padrao, conforto silencioso e tecnologia integrada.

## Integracao no site
- A sequencia sera guiada por scroll com trechos de video e transicoes discretas.
- Evitar pin excessivamente longo e garantir retorno suave no scroll reverso.
- Manter CTA acessivel e como HTML, nao embutido no video.
- O logo final deve usar `public/brand/sonare-logo.svg`; nao pedir para IA inventar lettering.
- Mobile pode usar posters, cortes menores ou estados estaticos.
- Em `prefers-reduced-motion`, apresentar os masters como sequencia estatica com todo o conteudo e conversao disponiveis.

## Regras tecnicas futuras
- Nao controlar a mesma propriedade com GSAP e Motion ao mesmo tempo.
- Nao carregar todos os videos no primeiro acesso.
- Usar poster, preload cuidadoso e lazy loading abaixo da dobra.
- Definir biblioteca apenas apos confirmar stack.
- Animacoes de logo devem ser discretas, sem distorcer o simbolo.

## Pendencias
- Produzir e aprovar a imagem 16:9 da area gourmet e o estado inicial das cortinas.
- Confirmar se o logo final sera aplicado no video, na edicao ou como camada do site.
- Receber materiais oficiais e autorizacoes pendentes listados em `docs/pending-inputs.md`.
- Definir quais trechos finais serao video, imagem, CSS/canvas ou composicao web depois de aprovar as geracoes.