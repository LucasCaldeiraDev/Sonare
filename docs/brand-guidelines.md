# Sonare Brand Guidelines

## Fonte da identidade
- Pasta oficial: `C:\Users\Caldeira\OneDrive\Documentos\Sonare\Identidade Visual`.
- Usar esta pasta como fonte primaria de marca antes de gerar ou buscar qualquer asset visual.
- Nao copiar o pacote inteiro para o app. Selecionar apenas assets web-ready e documentar a escolha.

## Tokens visuais
| Token | Hex | Uso recomendado |
| --- | --- | --- |
| `sonare-black` | `#000000` | Fundo premium, texto sobre superficies claras, versoes escuras da marca. |
| `sonare-ink` | `#141414` | Fundo principal do site, secoes imersivas e overlays. |
| `sonare-white` | `#FFFFFF` | Areas de respiro, texto sobre fundos escuros quando necessario. |
| `sonare-silver` | `#CBCBCB` | Texto secundario, linhas, superficies frias, detalhes discretos. |
| `sonare-gold` | `#CF9F52` | Acentos, CTAs secundarios, foco visual, detalhes premium. |

## Logotipo
- Regra definida pelo cliente: Logo 1 para fundos claros e Logo 2 para fundos escuros.
- Arquivos de referencia: `01- LOGOTIPO\PNG\SONARE_LOGOTIPO_PNG_01.png` e `01- LOGOTIPO\PNG\SONARE_LOGOTIPO_PNG_02.png`.
- Quando possivel, usar equivalentes vetoriais/SVG da mesma variacao em vez de raster.
- Em video ou imagem de fundo variavel, escolher a versao pelo contraste predominante do trecho. Se a cena alternar claro/escuro, usar overlay discreto ou trocar a versao no ponto de corte.
- Preservar proporcao, area de respiro e cores originais.
- Evitar efeitos, sombras, gradientes, contornos, distorcoes ou animacoes exageradas no logo.

## Tipografia
- Familia institucional: Grandis Extended.
- Arquivos disponiveis em `02- TIPOGRAFIA\Grandis Extended`.
- Pesos disponiveis: Thin, Light, Regular, Medium, Bold, Black e italicos.
- Uso recomendado: titulos, marca, numeros de destaque e microcopy premium curta.
- Para corpo de texto, usar Inter/system-ui ou equivalente legivel; Grandis Extended pode ficar cansativa em paragrafos longos.
- Uso aprovado pelo cliente: a fonte foi entregue pela agencia no pacote de identidade visual. Carregar apenas os pesos realmente usados e manter o comprovante/contrato da entrega arquivado.

## Paleta e proporcao
- Base escura: `#141414` e `#000000`.
- Neutros: `#FFFFFF` e `#CBCBCB`.
- Acento: `#CF9F52`.
- O dourado deve ser raro e intencional: botoes, linhas de foco, icones selecionados e detalhes de marca.
- Evitar interface dominada por dourado, bege ou marrom; a marca deve parecer sofisticada e tecnica, nao decorativa.

## Patterns
- Patterns disponiveis em `04- PATTERN`.
- Versoes grandes: `PATTERN_01.png` a `PATTERN_04.png` com 3710x2482.
- Versoes menores: `PATTERN_05.png` a `PATTERN_08.png` com 2684x1796.
- Usar com opacidade baixa, recorte amplo ou como detalhe de transicao.
- Nao usar pattern como textura carregada em todas as secoes.

## Imagens institucionais
- Fonte: `12- IMAGENS`.
- Oito imagens JPG de alta resolucao estao disponiveis, variando de 2816x5632 a 8000x5333.
- Novas imagens e produtos oficiais serao adicionados pelo cliente na mesma estrutura de identidade.
- Antes de usar no site, gerar versoes otimizadas para desktop/mobile e manter os originais fora do bundle publico.
- As imagens devem sustentar arquitetura premium, conforto, tecnologia discreta e experiencia residencial.

## Aplicacoes e wallpapers
- Aplicacoes de marca: `13- APLICAÇÕES`, arquivos 1920x1080.
- Wallpapers: `14- TELA COMPUTADOR`, arquivos 1920x1080.
- Usar como referencia de composicao, contraste e comportamento da marca em superficies reais.
- Nao tratar mockups institucionais como imagem principal do site sem intencao clara.

## Direcao de interface
- Layout premium, silencioso e arquitetonico.
- Bordas discretas, no maximo 8px em cards e paineis.
- Muito espaco negativo, hierarquia forte e poucos elementos competindo.
- Elementos interativos devem parecer precisos: foco visivel, estados claros, CTAs diretos.
- Evitar estetica gamer, excesso de glassmorphism, gradientes gratuitos e blocos decorativos sem funcao.

## Regra para IA visual
- Qualquer geracao de imagem ou video deve seguir a paleta `#141414`, `#CBCBCB`, `#CF9F52`, branco e preto.
- A residencia deve parecer brasileira, contemporanea e de alto padrao.
- A tecnologia deve estar integrada a arquitetura; nada de futurismo ostensivo.
- Produtos reais, marcas de terceiros e interfaces reais exigem material oficial, autorizado ou fornecido.


## Decisao sobre Grandis Extended
- O cliente confirmou que a fonte pode ser usada no site, pois foi paga/entregue pela agencia junto com a identidade visual.
- A fonte nao e mais bloqueio de implementacao.
- Para performance, usar somente os pesos necessarios: recomendado iniciar com Regular, Medium e Bold.
- Manter fallback legivel para carregamento e casos de falha.
