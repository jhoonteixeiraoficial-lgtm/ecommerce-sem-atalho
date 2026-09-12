# Assertive Progressive Photo Pipeline Design

## Objetivo

Fazer toda análise nova por link, descrição ou foto própria entregar uma galeria progressiva de seis imagens novas e publicáveis, produzidas pelo Gemini a partir de referências visuais do produto exato. Se uma dependência externa esgotar todas as retentativas, o resultado deve ser um erro explícito e retomável, nunca uma preview silenciosamente vazia.

A primeira imagem deve ser sempre uma capa quadrada com fundo branco puro. As demais devem mostrar detalhes e contextos de uso úteis. Fotos externas podem orientar a geração, mas nunca podem entrar diretamente na galeria nem resultar em cópias exatas ou imagens duplicadas.

## Escopo

Este trabalho altera somente aquisição, geração, persistência, revisão e apresentação de fotos do Assertive. Não altera autenticação, conexão Mercado Livre, geração de texto, preço, categoria, logística ou o ato de publicar.

Anúncios já publicados são imutáveis. Rascunhos existentes preservam suas fotos e podem iniciar jobs apenas para posições ainda ausentes.

## Decisões Confirmadas

- A galeria alvo contém seis fotos.
- A entrega é progressiva: o editor abre com slots e cada foto aparece quando fica pronta.
- Uma referência de concorrente exato tem prioridade mesmo quando o usuário enviou foto própria.
- A foto própria continua disponível como comprovação visual adicional e fallback.
- A busca começa no Mercado Livre e pode ampliar para fabricante, varejistas e outros marketplaces.
- Nenhuma foto externa bruta entra em `assertive_listings.photos` ou `assertive_listing_images`.
- Toda foto da galeria é uma saída nova do Gemini ou uma imagem própria autorizada adicionada manualmente pelo usuário.
- Toda saída Gemini exige confirmação visual antes da publicação.

## Evidência da Falha Atual

Os testes reais de 2026-09-12 mostraram três falhas distintas:

- A análise `00545f44-5c9e-4442-99c0-85fd59aa18ed` identificou uma furadeira com confiança `0.95`, recebeu 11 fotos da URL e encontrou dois produtos exatos. Mesmo assim, `identityReady` ficou falso porque depende de fatos qualificados para copy. A etapa de imagem terminou em cerca de 150 ms, não criou nenhuma operação Gemini e salvou uma galeria vazia com `identity_required`.
- A análise `81a9c00c-5886-4fd1-8046-272b12036fe6` encontrou quatro concorrentes para o jogo de panelas, mas nenhum passou pela regra rígida de fonte factual. Como a mesma regra controla referências visuais, nenhuma foto foi oferecida à geração.
- A análise por foto `b8edeae6-88f3-4e3b-a435-b550ac2916bf` iniciou várias gerações longas dentro da requisição síncrona. A execução ultrapassou o orçamento da função, deixou operações em `RUNNING` e a análise em `generating`.

Portanto, a causa não é simplesmente falta de fotos. O fluxo atual mistura qualificação de fatos com identidade visual e tenta gerar a galeria inteira em uma única requisição.

## Invariantes

1. Busca de referência e qualificação factual são decisões separadas.
2. Uma referência visual nunca pode alimentar atributos ou afirmações sem passar pela regra factual existente.
3. Uma análise em andamento nunca é representada como galeria vazia: ela possui slots com estado explícito.
4. Nenhuma referência com direitos `REFERENCE_ONLY` pode ser anexada ao anúncio.
5. Cada posição da galeria é idempotente, retomável e atualizada de forma atômica.
6. Uma falha em uma posição não apaga imagens válidas das outras posições.
7. A posição zero só aceita imagem aprovada pelo verificador de fundo branco.
8. Uma saída igual ou muito semelhante à referência, ou duplicada de outra saída, é rejeitada e regenerada.

## Arquitetura

O fluxo será dividido em quatro unidades:

1. `Visual Reference Acquisition`: localiza, valida, baixa e registra referências privadas do produto exato.
2. `Photo Job Orchestrator`: cria e reivindica jobs duráveis para busca e para cada uma das seis posições.
3. `Reference-Guided Gemini Generation`: gera uma posição por requisição curta usando múltiplas referências.
4. `Progressive Gallery`: exibe estados, aciona no máximo dois workers do navegador, retoma jobs e atualiza cada slot.

`runGeneration` continuará gerando e persistindo os dados comerciais, mas não aguardará seis imagens. Ele cria o rascunho, o plano de seis fotos e os jobs, então devolve o `listing_id`. O editor assume a execução progressiva dos jobs.

Se o usuário fechar a página, nenhuma informação é perdida. Ao reabrir, o editor reivindica os jobs pendentes ou recupera locks vencidos e continua do ponto em que parou.

## Aquisição de Referências

### Ordem de busca

1. Concorrentes classificados como produto exato, ordenados por qualidade visual e força do anúncio.
2. Fotos do item ou produto de catálogo da URL informada.
3. Outros produtos e ofertas exatos do catálogo Mercado Livre.
4. Novas buscas Mercado Livre por GTIN, MPN, marca+modelo, título completo e variações normalizadas.
5. Busca web fundamentada por fabricante, lojas e outros marketplaces.

A busca externa usa apenas páginas HTTPS públicas. Metadados `og:image`, `twitter:image` e imagens de JSON-LD podem virar candidatos, mas cada URL de imagem ainda passa pelo fetch seguro já usado pelo pipeline.

### Identidade visual

Será criado um avaliador específico de referência visual. Ele não substitui `evaluateMatch` e não torna o candidato uma fonte factual.

Uma referência pode ser aceita quando não houver conflito de variante e uma destas condições for satisfeita:

- o item ou catálogo é o próprio snapshot oficial da URL;
- GTIN idêntico;
- MPN e marca idênticos;
- marca e modelo idênticos;
- nome/modelo e atributos visuais alcançam confiança suficiente em uma checagem multimodal.

Cor, quantidade, voltagem, capacidade, kit e componentes visíveis são conflitos eliminatórios quando confirmados no produto do usuário.

O caso real com snapshot oficial, confiança alta e 11 fotos não dependerá mais de `buildCopyBrief().facts` para habilitar imagens.

### Qualidade e diversidade das referências

Cada candidato baixado será normalizado para inspeção e receberá:

- dimensões e resolução útil;
- presença de marca-d'água, texto promocional ou montagem;
- visão completa ou detalhe;
- confiança de identidade;
- hash criptográfico e hash perceptual;
- origem e URL de proveniência.

Fotos idênticas ou quase idênticas são agrupadas. O conjunto final prioriza até oito referências distintas e oferece até três referências complementares para cada job Gemini.

### Persistência e direitos

Referências continuam em bucket privado, como `SOURCE_REFERENCE`, com `rights_status = REFERENCE_ONLY`. `ImageOrigin` passa a distinguir `ML_OWN_ITEM`, `ML_CATALOG`, `COMPETITOR` e `WEB_REFERENCE`.

O registro guarda proveniência, score de identidade, score de qualidade, hash perceptual e tipo da fonte. Segredos, payloads completos de provedor e conteúdo HTML não são persistidos.

## Modelo de Jobs

Uma migration cria `assertive_image_jobs`, separada de `assertive_image_operations`.

`assertive_image_jobs` representa trabalho durável e contém:

- `id`, `user_id`, `analysis_id` e `listing_id`;
- `kind`: `REFERENCE_SEARCH` ou `GENERATE_SLOT`;
- `position`: `0..5` para jobs de imagem;
- `role` e `shot` factual da posição;
- `status`: `QUEUED`, `RUNNING`, `RETRYABLE`, `REVIEW`, `SUCCEEDED`, `FAILED` ou `DISMISSED`;
- `reference_asset_ids` e `output_asset_id`;
- `attempt_count`, `max_attempts`, `next_attempt_at`;
- `lock_token`, `locked_at`, `error_code` e `error_message` limitado;
- timestamps.

Índices únicos impedem mais de um job de busca por anúncio e mais de um job por posição. RLS permite ao usuário ler apenas seus jobs; criação, claim e conclusão ocorrem no servidor.

Uma RPC atômica reivindica um job elegível e também recupera `RUNNING` cujo lock venceu. `assertive_image_operations` permanece como ledger de cada tentativa concreta de Gemini, fidelidade ou normalização.

Todo resultado Gemini aprovado para preview entra inicialmente em `REVIEW`, mesmo quando o gate automático retorna `ACCEPT`. O veredito automático fica na metadata do asset. A confirmação humana muda o job para `SUCCEEDED`; conflito estrutural muda para `RETRYABLE` ou `FAILED` sem anexar a saída.

## Plano de Seis Fotos

O plano padrão é adaptado somente quando a categoria e as referências comprovam algo melhor:

1. `MAIN`: produto inteiro, centralizado, 1:1, fundo branco puro e sombra de contato discreta.
2. `DETAIL`: primeiro detalhe funcional ou de acabamento visível.
3. `DETAIL`: segundo detalhe ou ângulo comprovado por outra referência.
4. `LIFESTYLE`: produto em um ambiente coerente com sua função.
5. `LIFESTYLE`: outro contexto de uso, sem sugerir acessórios inclusos.
6. `INFORMATIONAL` ou `PACKAGING`: visão técnica, dimensões ou embalagem somente quando sustentadas; caso contrário, detalhe complementar.

O plano nunca exige lado, porta, acessório, embalagem ou medida ausente das referências.

## Geração Gemini

Cada requisição processa somente um slot. Ela fornece ao Gemini:

- até três imagens de referência do produto exato;
- identidade confirmada e fatos permitidos;
- objetivo exclusivo daquele slot;
- instrução de criar composição nova;
- proibição de copiar fundo, cenário, marca-d'água, texto promocional ou composição da fonte;
- proibição de alterar produto, modelo, variante, cor, quantidade e componentes.

A capa e as fotos secundárias usam prompts distintos. A capa exige `#FFFFFF`; fotos de contexto permitem apenas elementos ambientais claramente separados do produto.

Cada slot possui no máximo três tentativas duráveis. Uma tentativa pode trocar a referência, o enquadramento e o modelo configurado. Erros transitórios `429`, `503`, timeout e resposta sem imagem tornam o job `RETRYABLE` com backoff. Erros de configuração ficam `FAILED` com orientação explícita.

O limite e o timeout são por slot, não pela galeria inteira. Isso remove a dependência do limite de 300 segundos da rota de análise.

## Gates de Qualidade

### Fidelidade

Troca de produto, geometria, variante, cor, quantidade, marca, rótulo, porta, controle, peça ou acessório continua sendo rejeição obrigatória.

Quando todos os checks estruturais passam, mas o provedor retorna score baixo, resposta malformada ou indisponibilidade do gate, a imagem pode aparecer como `REVIEW`. Ela não desaparece e não pode ser publicada até confirmação explícita.

Uma imagem com conflito estrutural nunca aparece como opção publicável.

### Capa branca

Um verificador local mede bordas e área de fundo após normalização. A posição zero exige:

- formato quadrado;
- fundo predominantemente próximo de `#FFFFFF`;
- ausência de borda, selo, preço e texto promocional;
- produto contido e centralizado, sem corte relevante.

Falha nesse gate regenera a capa com outro prompt ou referência.

### Não duplicação

O pipeline compara hash criptográfico, hash perceptual e uma checagem visual de composição:

- saída igual ou quase igual a qualquer referência é rejeitada;
- saída semelhante demais a outra foto já aceita no anúncio é rejeitada;
- o mesmo asset nunca ocupa duas posições;
- referências duplicadas não gastam novas chamadas Gemini.

O objetivo é preservar o produto, não a fotografia original.

## Atualização Atômica da Galeria

Uma RPC `assertive_upsert_listing_image_slot` insere ou substitui somente a posição concluída, valida propriedade e elegibilidade do asset e recompõe `assertive_listings.photos` e `photo_metadata` em ordem.

Isso evita que dois jobs concorrentes sobrescrevam os resultados um do outro. Uma falha ou retentativa mantém todos os slots já aceitos.

Assets gerados com resultado automático `REVIEW` podem ser anexados à preview, mas a publicação continua bloqueada pelo conjunto `required_asset_ids` até confirmação do usuário. Assets `REFERENCE_ONLY` e `REJECT` nunca são anexados.

## Contratos HTTP

### `GET /api/assertive/listings/[id]/images/jobs`

Retorna a fotografia atual do pipeline:

- quantidade alvo e concluída;
- estado da busca de referências;
- origem e quantidade das referências, sem expor URLs privadas;
- seis slots com posição, papel, status, preview, tentativas e erro seguro;
- indicação de trabalho ainda executável.

### `POST /api/assertive/listings/[id]/images/jobs/run`

Garante idempotentemente que rascunhos antigos possuam o job de busca e os jobs das posições ausentes, então reivindica e executa no máximo um job elegível. Se a busca ainda não terminou, executa a busca; depois processa um slot. A resposta devolve o snapshot atualizado.

Chamadas concorrentes são limitadas e seguras por lock e idempotência.

### `POST /api/assertive/listings/[id]/images/jobs/[position]/retry`

Reabre somente o slot solicitado com novo nonce, preservando as outras imagens.

### Confirmação existente

`POST /api/assertive/listings/[id]/images/confirm` continua confirmando um asset anexado ao anúncio. Ele será estendido para atualizar o estado do slot sem permitir confirmação de referência, asset rejeitado ou asset de outro usuário.

## Experiência no Editor

A seção de fotos renderiza seis cards desde o primeiro carregamento:

- `Buscando referência`;
- `Na fila`;
- `Gerando com Gemini`;
- `Revisar`, quando a saída Gemini está visível mas ainda não foi confirmada;
- `Pronta`, somente depois da confirmação humana;
- `Tentar novamente`.

O editor mantém no máximo duas chamadas `run` simultâneas e atualiza o snapshot após cada resposta. Polling leve detecta conclusão concorrente e locks vencidos. Ao desmontar a tela, novas chamadas param; ao reabrir, o processamento é retomado.

Cada imagem pronta pode ser ampliada, baixada, removida, confirmada ou regenerada individualmente. Remover uma imagem marca o job como `DISMISSED` para impedir reaparecimento automático. Regenerar substitui apenas aquele slot.

O contador mostra `N de 6 prontas`. Avisos são associados ao slot correto, não condensados em uma mensagem longa. Uma busca sem sucesso mostra causa e ação de retentativa em todos os slots bloqueados, nunca apenas `0/12`.

Enquanto existirem jobs pendentes, a publicação fica bloqueada. Depois das seis imagens, somente revisões obrigatórias continuam bloqueando.

## Compatibilidade com Rascunhos Existentes

- Rascunhos com fotos mantêm a ordem e os assets atuais.
- Ao solicitar complemento ou regeneração, jobs são criados apenas para posições ausentes ou explicitamente substituídas.
- Rascunhos com `photos = []` podem iniciar o novo fluxo sem refazer texto, pesquisa, preço ou atributos.
- Operações antigas em `RUNNING` não são convertidas automaticamente em jobs; o bootstrap do rascunho cria jobs novos e registra a relação no evento de observabilidade.
- Anúncios publicados não aceitam bootstrap, retry ou alteração de galeria.

## Erros e Observabilidade

Eventos de estágio registram:

- consultas e fontes tentadas;
- candidatos encontrados, baixados, duplicados e aceitos;
- motivo de rejeição de identidade ou qualidade;
- job, slot, referência escolhida, tentativa, modelo e duração;
- resultado dos gates de fidelidade, fundo e duplicação;
- recuperação de lock e erro final estável.

Códigos principais:

- `REFERENCE_SEARCH_FAILED`;
- `REFERENCE_IDENTITY_CONFLICT`;
- `REFERENCE_DOWNLOAD_FAILED`;
- `IMAGE_PROVIDER_RATE_LIMITED`;
- `IMAGE_PROVIDER_UNAVAILABLE`;
- `IMAGE_GENERATION_TIMEOUT`;
- `IMAGE_FIDELITY_REJECTED`;
- `IMAGE_BACKGROUND_REJECTED`;
- `IMAGE_SOURCE_TOO_SIMILAR`;
- `IMAGE_GALLERY_DUPLICATE`;
- `IMAGE_STORAGE_FAILED`.

Logs e respostas não expõem tokens, chaves, bytes, URLs privadas ou payloads integrais do provedor.

## Segurança e Limites

- Todo download remoto valida HTTPS, DNS/IP público, redirects, MIME, tamanho e dimensões.
- HTML externo possui limite menor e nunca executa scripts.
- Referências ficam privadas e nunca recebem URL pública.
- A galeria aceita somente asset próprio ou saída Gemini com proveniência completa.
- Cada anúncio tem seis slots e no máximo três tentativas automáticas por slot.
- Requisições repetidas usam idempotência e não duplicam custo.
- No máximo dois jobs de geração ficam ativos por anúncio.

## Estratégia de Testes

A implementação seguirá TDD.

1. Reproduzir o caso da furadeira: snapshot oficial com 11 fotos e confiança alta deve criar seis jobs apesar de fatos de copy incompletos.
2. Provar que candidatos comparáveis não viram fatos, mas um candidato visualmente confirmado pode virar referência.
3. Testar ampliação ML e fallback web, extração segura de imagens e rejeição SSRF.
4. Testar ranking, download, hash perceptual e diversidade das referências.
5. Testar criação idempotente, claim atômico, backoff e retomada de lock vencido.
6. Testar uma requisição por slot, troca de referência e limite de tentativas.
7. Testar gate de capa branca, conflitos de fidelidade, estado `REVIEW` e deduplicação contra fonte e galeria.
8. Testar atualização concorrente de slots sem perda de fotos.
9. Testar contratos das rotas, autorização, anúncio publicado e erros seguros.
10. Testar a UI progressiva, retomada, retry individual, confirmação, remoção e bloqueio de publicação.
11. Executar suíte completa, typecheck, lint focado e build.
12. Executar um fluxo real por link, descrição e foto própria no Chrome, sem publicar, e limpar somente os registros de smoke identificados.

## Rollout e Rollback

A pipeline ficará atrás de `ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED`.

1. Aplicar migration e validar RPCs.
2. Publicar preview com a flag ativada apenas nesse ambiente.
3. Validar os três tipos de entrada e seis slots progressivos.
4. Promover o mesmo commit para produção e ativar a flag.
5. Em rollback, desativar a flag. Rascunhos, assets e jobs permanecem preservados; o código anterior continua lendo `listing.photos`.

## Critérios de Aceite

- Link com referências válidas nunca termina em `identity_required` por falta de fatos destinados apenas à copy.
- Link, descrição e foto própria criam um rascunho com seis slots visíveis.
- O editor não apresenta galeria vazia sem estado ou ação.
- A busca amplia fontes antes de declarar falha.
- A referência prioritária é de concorrente do produto exato quando disponível.
- Nenhuma referência externa bruta aparece em `listing.photos` ou é enviada ao Mercado Livre.
- A capa aprovada é quadrada, centralizada e possui fundo branco puro.
- As fotos secundárias incluem dois detalhes, duas ambientações e uma posição técnica segura.
- Nenhuma saída é cópia exata ou duplicata perceptual da fonte ou da própria galeria.
- Jobs sobrevivem a timeout, recarregamento e nova tentativa sem apagar resultados concluídos.
- Resultados inconclusivos aparecem para revisão; resultados com conflito físico são rejeitados.
- Todas as imagens Gemini precisam de confirmação antes de publicar.
- O fluxo real completa sem acionar a publicação Mercado Livre.
