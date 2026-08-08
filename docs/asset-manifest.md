# Asset Manifest

> **Estado 04/08/2026:** os 5 vídeos-mestre estão em `public/media/` e os
> derivados web (desktop/mobile/posters/LQIP) em `public/media/web/`. Os assets
> de marca selecionados (lockups recortados dos PNGs oficiais + símbolo para
> favicon) estão em `public/brand/`. Ver `docs/implementation.md` e
> `public/brand/README.md`.

## Fonte oficial
- Pasta local da identidade: `C:\Users\Caldeira\OneDrive\Documentos\Sonare\Identidade Visual`.
- Guia consolidado: `docs/brand-guidelines.md`.
- Plano Higgsfield: `docs/higgsfield-plan.md`.
- Referencias da cena de equipamentos: `docs/equipment-scene-reference.md`.
- A pasta contem logotipos, fontes, paleta, patterns, redes sociais, papelaria, imagens, aplicacoes e wallpapers.
- O cliente adicionara novas imagens reais e imagens oficiais dos produtos nesta mesma pasta.

## Regras gerais
- Nao gerar imagens ou videos sem storyboard/prompt aprovado.
- Nao usar Higgsfield sem validar primeiro stills/posters das cenas principais.
- Nao criar produtos visualmente parecidos com modelos reais.
- Produtos, marcas e interfaces reais exigem material oficial, autorizado ou fornecido.
- Validar direitos de uso antes de publicacao.
- Selecionar e otimizar assets antes de mover para `public/brand`.
- Nao copiar a identidade visual inteira para o repositorio.

## Assets de marca Sonare
| Asset | Tipo | Origem | Status | Observacoes |
| --- | --- | --- | --- | --- |
| Logo 1 | PNG/SVG equivalente | `01- LOGOTIPO` | Disponivel | Usar em fundos claros. |
| Logo 2 | SVG | `01- LOGOTIPO\VETOR\SONARE_LOGOTIPO_VETOR_SVG.svg` | Selecionado para web | Copiado para `public/brand/sonare-logo.svg`; usa as cores oficiais silver/gold, adequado a fundos escuros. |
| Tipografia Grandis Extended | TTF | `02- TIPOGRAFIA\Grandis Extended` | Selecionado parcialmente | Pesos Regular, Medium e Bold copiados para `src/assets/fonts` e carregados via `@font-face`; demais pesos (Thin, Light, Black, italicos) permanecem fora do bundle ate haver uso real. |
| Paleta de cores | PNG/SVG | `03- PALETA DE CORES` e SVG do logo | Confirmada | `#000000`, `#141414`, `#FFFFFF`, `#CBCBCB`, `#CF9F52`. |
| Patterns | PNG | `04- PATTERN` | Disponivel | 8 arquivos; usar com opacidade baixa e recorte amplo. |
| Imagens institucionais | JPG | `12- IMAGENS` | Disponivel | 8 imagens de alta resolucao; gerar WebP/AVIF e tamanhos responsivos. |
| Aplicacoes de marca | PNG | `13- APLICAÇÕES` | Disponivel | 18 imagens 1920x1080; usar como referencia visual e mockups pontuais. |
| Wallpapers | PNG | `14- TELA COMPUTADOR` | Disponivel | 3 imagens 1920x1080; usar como referencia ou detalhe. |
| Produtos oficiais | Imagem/video | `docs/references/equipment` e materiais futuros | Referencias recebidas; publicacao pendente | Oito referencias fornecidas em 30/07/2026. Algumas possuem marca d'agua, modelo incerto ou logo divergente; consultar `docs/equipment-scene-reference.md`. |
| Papelaria e materiais auxiliares | PDF/PNG/DOCX/AI/CDR | `06` a `11` | Disponivel | Referencia de consistencia visual, nao asset primario da landing. |

## Assets narrativos previstos
| Asset | Tipo | Secao | Status | Observacoes |
| --- | --- | --- | --- | --- |
| Fachada noturna da residencia | Imagem/video | Hero | Master atual salvo; publicacao formal pendente | `public/media/Sonare-Fachada.png`, 16:9, e o quadro inicial da Cena 1. O living e a mesma cidade projetada aparecem atraves do vidro. Usar como autoridade da abertura e validar direitos antes da publicacao final. |
| Entrada progressiva no living | Video/scroll sequence | Hero narrativo | Cena 1 confirmada | `Sonare-Fachada.png` > `Sonare-Living.png`; porta-janela de vidro abre antes da passagem. Ver `docs/scene-1-higgsfield.md`. |
| Living/home theater ativo | Imagem/video | Hero narrativo/cinema | Master atual salvo; publicacao formal pendente | `public/media/Sonare-Living.png` e o fim da Cena 1 e inicio da Cena 2. Fixa camera, arquitetura, telao com cidade completa em 16:9, duas torres simetricas, central, projetor e Remote One na mesa. |
| Corredor e parede direita | Imagem/video | Continuidade/Piero | Master atual salvo; publicacao formal pendente | `public/media/Sonare-Corredor.png` e o fim da Cena 2 e inicio da Cena 3. Preserva corredor, parede lisa, S110 ao fundo e a porcao direita da mesma cidade projetada. A mesa nao possui controle. |
| Iluminacao arquitetural ativando | Video/animacao | Narrativa | Storyboard confirmado | Movimento sutil e progressivo. |
| Audio high-end | Produto real + ambiente | Narrativa audio | Regra visual confirmada; SKU a confirmar | Duas caixas B&W 800 Series Diamond de piso, fieis a referencia amadeirada; nunca 805/bookshelf. Central amadeirada coordenada sobre pedestal dedicado. |
| Telao descendo | Video/animacao | Narrativa cinema | Storyboard confirmado | Pode ser combinado com projetor para reduzir custo. |
| Projetor SIM2 UltraNero 4 iniciando | Produto real/video | Narrativa cinema | Nova referencia recebida; asset oficial pendente | Instalado no teto e alinhado ao telao; seguir gabinete preto, lente deslocada e detalhe vermelho da nova referencia. |
| Interface/display Piero S110 | UI/imagem/video | Parede direita/encerramento | Master atual salvo; publicacao formal pendente | `public/media/sonare-display-s110.png` e a autoridade do produto e da interface. A Cena 3 parte do corredor e termina em enquadramento ainda mais fechado, contendo somente S110 e parede lisa. Tambem sera o inicio da Cena 4. |
| Piero Remote One | Produto real/composicao | Mesa de centro do living | Modelo e posicao confirmados; publicacao formal pendente | O Remote One aparece sobre sua base no master `Sonare-Living.png`. Nao aparece em `Sonare-Corredor.png`; deve apenas sair do quadro durante a Cena 2. Nao confundir com o S110. |
| Logotipo SIM2 | Vetor/PNG | Projetor/marcas | Pendente de asset correto | A referencia enviada diz `STM2 Multimedia`; nao usar como SIM2. |
| Logotipos de marcas | Vetor/PNG | Marcas trabalhadas | Pendente de material | Nao alterar logotipos. |
| Cases de clientes | Foto/video/texto | Prova social | Futuro | Adicionar posteriormente. |

## Fallbacks
- Mobile pode usar poster, imagem estatica ou trechos curtos em vez de scroll-video pesado.
- Para reduced motion, apresentar sequencia como conteudo estatico com texto acessivel.
- Se nao houver foto final aprovada para uma cena, usar placeholder elegante baseado em marca e marcar como pendente.

| Area gourmet com cortinas | Imagem/video | Cena 4/encerramento | Pendente de master | O cliente produzira a imagem 16:9. A cena sai do close S110, revela a area gourmet, fecha as cortinas, escurece e termina com a marca Sonare. |

## Pendencias
- Confirmar se a referencia das caixas frontais corresponde a B&W 804 D4 ou 802 D4; a decisao 805 foi revogada.
- Confirmar modelo/acabamento da central e usar pedestal dedicado.
- Confirmar direitos de publicacao do Piero Remote One, da interface S110 e dos masters gerados.
- Receber logotipo oficial SIM2 e imagens publicaveis dos equipamentos.
- Selecionar assets de marca finais para web.
- Confirmar quais imagens de `12- IMAGENS` e novas imagens podem ser publicadas.

## Checklist de insumos faltantes
- Imagens reais/autorizadas dos ambientes.
- Imagens oficiais dos produtos reais.
- Interface Piero real/autorizada.
- Logotipos oficiais de terceiros, caso sejam exibidos.
- Confirmacao de uso publico para cada imagem adicionada.
- Ver `docs/pending-inputs.md` antes de mover qualquer asset para `public/brand`.

