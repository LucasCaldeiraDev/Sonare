# Pending Inputs

## Objetivo
Este arquivo concentra as informacoes e materiais que ainda precisam ser enviados ou confirmados antes da versao final do site Sonare.

## Imagens e assets pendentes
- Imagens reais/autorizadas dos ambientes da Sonare ou clientes.
- Versoes oficiais, publicaveis e em alta resolucao dos produtos que aparecerao na narrativa visual.
- Confirmacao formal de direito de publicacao da interface/display Piero e do still gerado `public/media/sonare-display-s110.png`.
- Logotipos oficiais das marcas de terceiros, se forem exibidos no site.
- Confirmacao de quais imagens da pasta `12- IMAGENS` podem ser usadas publicamente.
- Confirmacao de quais novos arquivos adicionados pelo cliente podem ser publicados.

## Produtos com material oficial pendente
- Bowers & Wilkins.
- SIM2.
- Piero Networks / Piero Technology / Piero Sound / Piero Infinity Control.
- Rotel.
- NAD.
- Marantz.
- JL Audio.
- Audioquest.
- Moon by SIMAUDIO.
- Clearaudio.
- Russound.
- HDL Automation, quando relacionada a plataforma Piero.

## Referencias recebidas em 30/07/2026
- Referencias visuais de caixas Bowers & Wilkins com acabamento amadeirado.
- Referencia visual de caixa central preta; direcao obrigatoria e acabamento amadeirado coordenado, com pedestal dedicado.
- Nova referencia do projetor SIM2 UltraNero 4, que substitui o Nero 4 anterior.
- Referencia do display/interface Piero, com posicao obrigatoria na parede direita.
- Referencia do Piero Remote One sobre base/suporte; modelo confirmado, direitos e asset oficial publicavel ainda pendentes.
- Arquivo de logotipo `STM2 Multimedia`, que nao deve ser tratado como SIM2.
- Arquivos preservados em `docs/references/equipment`; inventario e restricoes em `docs/equipment-scene-reference.md`.

## Stills de producao atuais
Os quatro stills desta secao (`Sonare-Fachada.png`, `Sonare-Living.png`,
`Sonare-Corredor.png`, `sonare-display-s110.png`) nao existem mais em
`public/media/` — foram substituidos pelas cinco cenas de video (`scene-01`
a `scene-05` em `public/media/web/`) que carregam a jornada hoje. Confirmar
se os direitos de publicacao das cenas atuais ja foram equacionados.

## Confirmacoes prioritarias da cena de cinema
- Confirmar se as caixas de piso amadeiradas mostradas nas referencias sao B&W 804 D4 ou 802 D4. Nao usar 805/bookshelf.
- Confirmar o modelo e a disponibilidade do acabamento amadeirado da central; pedestal dedicado e obrigatorio.
- Confirmar direitos de uso e obter asset oficial publicavel do Piero Remote One.
- Fornecer o logotipo vetorial oficial da SIM2; a imagem `STM2 Multimedia` nao corresponde ao nome solicitado.
- Confirmar direitos de uso publico de cada referencia entregue.

## Decisoes pendentes de producao visual
- Produzir e aprovar a imagem 16:9 da area gourmet para completar a Cena 4.
- Quais cenas usarao imagem real, imagem gerada, video, CSS/canvas ou composicao web.
- Aprovar somente novos stills/posters que representem estados ainda nao cobertos pelos masters atuais.
- Definir os cortes finais e quais cenas aparecerao no hero desktop depois de aprovar os quatro takes.
- Qual fallback sera usado no mobile e em `prefers-reduced-motion`.

## Decisoes pendentes de marca
- Guardar comprovante/contrato da entrega da Grandis Extended pela agencia.
- Selecionar arquivos finais do Logo 1 e Logo 2 em SVG ou formato web-ready.
- Definir favicon e versoes reduzidas do logo.
- Escolher quais patterns entram no site, se algum entrar.

## Decisoes pendentes de conteudo
- Texto institucional final da Sonare.
- Confirmar se a credencial CREA aparecera no site e com qual redacao.
- Confirmar como mencionar Som Maior.
- Confirmar lista final de marcas trabalhadas.
- Confirmar se havera cases, depoimentos ou fotos de clientes nesta primeira versao.

## Decisoes pendentes de conversao
- Confirmar se o CTA principal sera WhatsApp direto, formulario ou ambos.
- Definir mensagem automatica do WhatsApp.
- Definir destino dos leads do formulario: e-mail, WhatsApp, banco de dados ou CRM.
- Confirmar politica de privacidade/consentimento se houver formulario.

## Problemas preexistentes detectados no encerramento da rodada de fidelidade (04/08/2026)

Registrados, nao corrigidos naquela rodada: estavam fora do escopo dela e nao
tinham relacao com colorimetria. Os dois primeiros ja foram corrigidos em
rodadas posteriores (verificado em 18/08/2026) — mantidos aqui riscados
para historico:

- ~~`/media/web/s110-spotlight.webp` nao existe.`~~ **Resolvido**: o arquivo
  existe hoje em `public/media/web/s110-spotlight.webp` e e servido normalmente.
- ~~`og:image` aponta para arquivo inexistente.~~ **Resolvido**: hoje existem
  tanto `scene-01-poster-desktop.avif` (usado no `<link>` do poster) quanto
  `scene-01-poster-desktop.webp` (usado no `og:image`), lado a lado.
- **`docs/pending-inputs.md` cita stills que nao existem mais** em
  `public/media/`: `Sonare-Fachada.png`, `Sonare-Living.png`,
  `Sonare-Corredor.png`, `sonare-display-s110.png`. Conferir se foram
  renomeados ou removidos em rodadas anteriores e atualizar esta lista.
- **`media-comparison/current-masters/` duplica os cinco masters** (107 MB) que
  agora tambem estao em `media-comparison/source-archive/masters/`. SHA-256
  identicos. Manter as duas copias e uma decisao de backup, nao um defeito —
  mas se o espaco importar, uma pode sair.
- **`media-comparison/audit/` ocupa 239 MB** de PNGs de auditoria de rodadas
  anteriores. Fora do bundle (nao esta em `public/`), mas pesa no repositorio
  local.

## Pendencias abertas na rodada de movimento (05/08/2026)

Registradas, nao tratadas. A baseline BT.709 tv/limited esta congelada; nada
abaixo pode alterar color_range, renderer, filtros ou o Canvas 2D atual.

1. **Continuidade geometrica das quatro juncoes.** A colorimetria ja esta
   verificada nas quatro (delta de luma entre +0,25 e -2,33, todos os oito
   frames em limited). Falta verificar a continuidade *geometrica*: a cena 03 e
   3856x2148 contra 3876x2136 das outras quatro, e o crop atual iguala o campo
   horizontal aparando a altura excedente. Medir se o enquadramento realmente
   casa nas fronteiras 02-03 e 03-04, e se ha salto de escala ou de ponto de
   ancoragem perceptivel no corte.

2. **Suavidade e renderer.** Comparacao em movimento entre video nativo,
   Canvas 2D, WebGL sem sharpen e WebGL com sharpen 0,25. Medir halos, shimmer,
   frames apresentados, dropped frames, uso de GPU e a sensacao de suavidade no
   scrub. O shader com unsharp ja existe em `src/lib/videoGL.ts` e esta exposto
   no controle `D-SHARPEN` da rota /quality-diagnostic, mas nao e usado em
   producao e nao entra no bundle.

3. **Acutancia do poster em 1440x900.** No handover poster->video, 1920x1080
   fecha em -0,6% de acutancia (44,74 dB), mas 1440x900 marca -15,0%
   (42,04 dB). A causa esta identificada e nao e o poster: o Chrome filtra
   fontes `<img>` e `<video>` de forma diferente dentro da mesma chamada
   drawImage, e naquele fator de reducao o poster sai *menos* aliasado que o
   video. Nao e perda de detalhe, e diferenca de filtro. Reavaliar junto com a
   rodada de renderer, porque trocar o renderer muda esse caminho.

## Inspecao da Cena 02 em movimento (05/08/2026) — sem acao

Os 97 frames da cena 02 foram medidos nos dois conjuntos. Conclusao: o clipping
existe, e mensuravel, e nao destroi detalhe visivel. Registrado para historico:

- preto puro por frame no tv: min 1,283% / max 3,801% / media 2,849%;
- no full: 0,000% em todos os 97 frames;
- maior variacao entre frames consecutivos: 0,593 pp — nao ha pulsacao;
- pior frame: 72 (3,801% de preto, 0,210% estourado);
- o desvio padrao dentro das regioes escuras sobe no tv por fator 1,155-1,164,
  praticamente igual ao ganho de contraste 255/219 = 1,164. Ou seja, a gradacao
  nao foi achatada; onde o preto e maior (7-9% da regiao) o fator cai para
  ~1,155, uma perda de ~0,8%.

## Regra enquanto os insumos nao chegam
- Nao inventar produtos reais nem interfaces reais.
- Nao publicar imagem sem autorizacao clara.
- Usar placeholders elegantes e marcados como pendentes quando necessario.
- Priorizar estrutura, layout, narrativa e otimizacao enquanto assets finais nao forem enviados.

