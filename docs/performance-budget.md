# Performance Budget

> **Estado 04/08/2026:** pipeline executado — derivados 1920w/CRF22/GOP12
> (desktop, scrub) e 960w/CRF26 (mobile), posters WebP com preload do LCP,
> LQIP inline, lazy-mount de vídeos abaixo da dobra e fallback estático para
> reduced motion. Medições e racional em `docs/implementation.md`.

## Objetivo
- Preservar impacto visual sem comprometer carregamento, responsividade e conversao.
- Higgsfield deve ser usado de forma seletiva: poucos assets excelentes, bem comprimidos e com fallback.

## Metas iniciais
- LCP: ate 2.5s em conexao boa.
- CLS: ate 0.1.
- INP: ate 200ms.
- JavaScript inicial: manter o minimo necessario para a primeira dobra.
- Hero: usar poster otimizado e carregar video pesado de forma progressiva.

## Midia
- Nao carregar todos os videos no primeiro acesso.
- Usar formatos otimizados para web.
- Criar versoes desktop e mobile quando necessario.
- Usar posters para videos.
- Lazy loading abaixo da dobra.
- Imagens originais em `12- IMAGENS` sao grandes; nunca servir JPG original diretamente no hero.
- Gerar AVIF/WebP e tamanhos responsivos antes de publicar.
- Patterns de `04- PATTERN` tambem devem ser otimizados e usados com parcimonia.
- Para a rodada promocional, gerar a Cena 1 com Seedance 2.0 General em 8s, 16:9, 4K e bitrate High; depois otimizar e aparar o take aprovado para entrega web.
- Se o custo/peso subir, reduzir a quantidade de videos e manter stills premium com animacao web sutil.

## Fontes
- Grandis Extended aprovada pelo cliente para uso no site, por ter sido entregue pela agencia no pacote de identidade visual.
- Carregar apenas pesos usados.
- Definir fallback tipografico.
- Recomendo iniciar com Regular, Medium e Bold; adicionar Black apenas se houver uso real em titulos.
- Usar `font-display: swap` ou estrategia equivalente.

## Animacao
- Respeitar prefers-reduced-motion.
- Evitar pin longo no mobile.
- Garantir fallback estatico.
- Medir custo de GSAP, Motion ou qualquer biblioteca antes da implementacao.

## SEO e acessibilidade
- Conteudo essencial em HTML.
- Titulos e secoes rastreaveis.
- Alt text para imagens relevantes.
- Contraste legivel sobre midia escura.
- Testar contraste do dourado `#CF9F52` sobre `#141414` e usar branco/prata para texto longo.

## Pendencias
- Confirmar stack final.
- Medir build apos implementacao.
- Validar desktop, tablet e mobile.
- Definir pipeline de otimizacao dos assets selecionados.

## Pendencias de otimizacao
- Assim que as imagens forem enviadas, gerar versoes responsivas e comprimidas antes de integrar.
- Nenhum JPG original pesado deve ser usado diretamente em producao.
- Registrar assets selecionados em `public/brand/README.md`.



