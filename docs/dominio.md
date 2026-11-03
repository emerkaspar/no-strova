# Seção 9 — Domínio da nova aplicação

(Substitui o placeholder da seção 9 do documento de stack.)

## Visão

App web de planejamento e análise de treino para quem pedala e corre, com foco em ciclismo. Inspirado no Elevate (https://github.com/thomaschampagne/elevate, licença MPL-2.0), usado só como **referência de cálculo**: não é fork, o código é reescrito na nossa stack. Cópia local do Elevate para consulta fica **fora** do monorepo (ex.: `../elevate-ref`).

Diferenciais em relação ao Elevate:
1. **Projeção no gráfico:** o usuário planeja treinos futuros e o gráfico de Fitness/Fadiga/Forma continua nos dias seguintes.
2. **Controle de peso** integrado ao treino, com metas.
3. **Sugestões com Gemini** (treinos e metas de peso).

## Usuários e papéis

- Uso inicial: o dono e alguns amigos. Cada um vê somente os próprios dados.
- Papéis: `admin` (aprova usuários), `atleta`. Papel `treinador` **previsto no modelo, sem UI na v1** (futuro: vínculo treinador–atleta com leitura/escrita no plano do atleta).
- Fluxo de acesso conforme seção 4 do documento de stack (cadastro → `aprovado: false` → admin aprova).

## Atividades (v1: só upload de arquivos)

- Upload de .FIT, .GPX e .TCX para o Storage (`atividades/{userId}/{atividadeId}/original.<ext>`; ver "Upload no Storage" abaixo).
- Uma callable processa o arquivo: extrai data, duração, distância, altimetria, série de frequência cardíaca (FC) e calorias, se houver. Grava o resumo em `atividades/{id}`.
- Esportes: ciclismo, corrida (e "outro").
- Cadastro manual de atividade (sem arquivo) também permitido.
- Sem integração com Strava na v1.

## Cálculos (camada `domain/`, funções puras)

- **Somente frequência cardíaca.** Estresse da atividade = **HRSS**, replicando o método do Elevate (ler a referência para a fórmula exata, constantes e tratamento de zonas).
- Configurações do atleta **com data de vigência**: FC máxima, FC de repouso, LTHR (limiar), sexo (constante do TRIMP), peso e altura. O cálculo usa a configuração vigente na data da atividade; mudar a configuração permite recalcular o histórico.
- Estresse diário = soma das atividades do dia.
- **Fitness** = média móvel exponencial do estresse diário (42 dias). **Fadiga** = idem (7 dias). **Forma** = Fitness − Fadiga **do dia anterior** (a Forma de hoje usa os valores de ontem, como no Elevate e na convenção do TrainingPeaks). Faixas de Forma (Transição, Freshness, Neutral, Optimal, Overload) como no Elevate; ver "Fitness, Fadiga e Forma (Fase 3)".
- **Projeção:** para dias futuros, o estresse diário vem dos treinos planejados ainda não realizados. Dias passados usam só o realizado. O gráfico mostra o passado sólido e o futuro tracejado.
- Os cálculos rodam no cliente a partir dos estresses diários (resposta instantânea ao editar o plano) e as mesmas funções são reutilizadas nas Functions quando necessário.

## Plano de treino

- `treinosPlanejados`: data, esporte, duração, intensidade, estresse estimado (HRSS), observações e vínculo opcional com a atividade realizada.
- Visão de calendário (semana/mês) e arrastar treino para outro dia atualiza a projeção.
- Comparativo planejado × realizado.
- **Meta de forma:** o usuário define "chegar com Forma X na data Y" e o app mostra se o plano atual chega lá.

## Peso e metas

- `pesagens`: data e peso (manual). Tendência com média móvel (7 dias).
- Indicadores: peso atual, tendência semanal, e metas (`metas`: peso-alvo e data).
- Cruzar peso com carga de treino no gráfico (eixo secundário, opcional).
- Gasto calórico de treino: usar as calorias do arquivo quando existirem; senão estimar por FC, peso e duração (documentar a fórmula escolhida).
- **Sugestão de meta com Gemini:** dado peso atual, peso-alvo, data e carga de treino, sugere ritmo semanal, tempo, distância e calorias para fechar o déficit, distribuídos no plano.

## IA (Genkit + Gemini)

- Callables em `southamerica-east1`, chave via Secret Manager.
- Entrada: JSON estruturado com métricas resumidas (nunca arquivos brutos nem dados de outros usuários). Saída: schema validado (Genkit structured output).
- Sugestões de treino (próximas semanas, respeitando Forma-alvo e carga progressiva) e de meta de peso.
- **Sempre rascunho:** a IA nunca grava no plano diretamente; o usuário revisa e aceita.
- Limites de segurança aplicados **no código, não só no prompt**: perda de peso máxima de 1% do peso por semana (padrão sugerido: 0,5%), déficit máximo de ~20% do gasto diário total já contando o treino (no lugar de pisos fixos de kcal), sem metas que levem a IMC abaixo de 18,5, aumento semanal de carga de no máximo 10%. Aviso fixo de que não substitui orientação de médico/nutricionista/treinador.
- Limite de 5 chamadas de IA por usuário/dia.

## Privacidade (LGPD)

- Peso e FC são dados de saúde: leitura/escrita somente pelo dono. Nem o admin lê pesagens. O treinador (futuro) lê apenas via vínculo aceito pelo atleta.
- Dados de IA enviados ao Gemini: somente o necessário, sem nome nem e-mail.

## Regras gerais

- Unidades: km, m, kg, bpm, kcal; datas e números em pt-BR.
- Gráficos próprios em canvas/SVG, sem biblioteca pesada, a menos que justificado.

---

# Decisões de negócio (Fase 0 — fechadas)

## Cálculo e plano
- **Atividade sem FC:** com FC média, estima-se o HRSS por FC média + duração. Sem nenhuma FC, o usuário informa a zona/intensidade e o app estima. O estresse pode sempre ser sobrescrito pelo usuário.
- **Intensidade do treino planejado:** zona predominante Z1–Z5, com override manual do estresse estimado.
- **Passado, hoje e futuro na projeção:** passado usa só o realizado; hoje usa o maior entre planejado e realizado; futuro usa o planejado.
- **Vínculo planejado × realizado:** o app sugere (mesmo dia e esporte) e o usuário confirma. Treino vinculado não soma duas vezes.
- **Curva única** de Fitness/Fadiga/Forma na v1 (sem filtro por esporte).
- **Fitness inicial = 0.** EMA como no Elevate: `ema = ema + (estresse − ema) × (1 − e^(−1/N))`, com N = 42 (Fitness) e N = 7 (Fadiga).
- **Faixas de Forma**: ver "Fitness, Fadiga e Forma (Fase 3)" (corrigidas na Fase 3 conforme o guia do Elevate).
- **Calorias:** usa as do arquivo quando existirem; senão estima por Keytel (FC, peso, sexo e idade), sempre rotuladas como "estimadas". O perfil coleta `dataNascimento`.
- **Recalcular histórico** (após mudar a configuração do atleta): somente por botão com confirmação, nunca automático.
- **Duplicidade:** upload rejeitado com aviso se o hash do arquivo ou o par início + duração já existir.
- **Fuso:** `America/Sao_Paulo` para o corte de dias.

## Usuários e LGPD
- `users/{uid}` ganha `ativo` (admin pode bloquear/revogar). Acesso exige `aprovado == true` e `ativo == true`.
- Aceite explícito do tratamento de dados de saúde no cadastro, guardado em `aceiteLgpd: { versao, em }`. Exportação e exclusão de dados na Fase 7.

## Modelo de dados
Coleções na raiz, todas com `userId` (exceto `users`). Não há coleção pública na v1.

| Coleção | Campos principais | Escrita |
|---|---|---|
| `users/{uid}` | `nome`, `email`, `role` (`admin`/`atleta`/`treinador`), `aprovado`, `ativo`, `dataNascimento`, `aceiteLgpd`, `criadoEm` | Admin SDK; o dono edita só `nome` e `dataNascimento` |
| `configsAtleta/{id}` | `vigenteDesde`, `fcMax`, `fcRepouso`, `lthr`, `sexo`, `pesoKg`, `alturaCm` | Dono |
| `atividades/{id}` | `origem` (`arquivo`/`manual`), `esporte`, `inicio` (Timestamp), `data` (dia em São Paulo), `duracaoS`, `tempoMovimentoS`, `distanciaM`, `altimetriaM`, `fcMedia`, `fcMax`, `zona`, `calorias`, `caloriasOrigem` (`arquivo`/`informada`/`estimada`), `hrss`, `hrssOrigem` (`fc`/`zona`/`manual`), `configIdUsada`, `alertas[]`, `arquivoPath`, `extensao`, `hashArquivo`, `criadoEm` | Somente callable (HRSS é autoritativo) |
| `atividades/{id}/series/fc` | série de FC reduzida (1 ponto a cada 5 s) para o gráfico do detalhe | Admin SDK |
| `estresseDiario/{uid_yyyymmdd}` | `data`, `estresse`, `kcal`, `qtdAtividades` | Trigger sobre `atividades` |
| `treinosPlanejados/{id}` | `data`, `esporte`, `duracaoMin`, `intensidade` (Z1–Z5), `estresseEstimado`, `observacoes`, `status` (`planejado`/`realizado`/`pulado`), `atividadeId?` | Dono |
| `metasForma/{id}` | `formaAlvo`, `dataAlvo`, `ativa` | Dono |
| `pesagens/{id}` | `data`, `pesoKg` | Dono |
| `metasPeso/{id}` | `pesoAlvoKg`, `dataAlvo`, `status`, `criadoEm` | Dono |
| `iaRascunhos/{id}` | `tipo` (`treino`/`peso`), `entradaResumo`, `saida`, `status` (`pendente`/`aceito`/`descartado`), `criadoEm` | Somente callable |
| `iaUso/{uid_yyyymmdd}` | `chamadas` | Admin SDK |
| `vinculosTreinador/{id}` | `treinadorId`, `atletaId`, `status` | Previsto no modelo; sem UI nem regras na v1 |

Como o HRSS do Elevate usa só a FC média e o tempo em movimento, a atividade guarda `fcMedia`, `tempoMovimentoS` e `zona`; isso basta para recalcular o HRSS com qualquer configuração sem reler o arquivo (não há `fcHistograma`). O doc `configsAtleta` tem id `{uid}_{yyyymmdd da vigência}`, então salvar a mesma data substitui a configuração.

## Fitness, Fadiga e Forma (Fase 3)

Implementado em `packages/domain/src/forma.js`, replicando o Elevate (`fitness.service.ts` e o guia do Fitness Trend):

- **Estresse do dia** = soma do HRSS das atividades do dia (`estresseDiario`). Dia sem treino vale 0.
- `Fitness(d) = Fitness(d−1) + (estresse(d) − Fitness(d−1)) × (1 − e^(−1/42))`; Fadiga igual, com 7 no lugar de 42.
- **Forma(d) = Fitness(d−1) − Fadiga(d−1).** A série começa **um dia antes da primeira atividade**, com Fitness, Fadiga e Forma em 0 (Fitness inicial = 0), e segue até hoje, com decaimento nos dias sem treino.
- **Faixas de Forma** (guia do Elevate; limite inferior exclusivo):

| Faixa | Forma | Significado |
|---|---|---|
| Transição | > +25 | Pausa longa (doença, lesão, fim de temporada): Fitness em queda |
| Freshness | +5 a +25 | Em forma e descansado: pronto para prova ou dias fortes |
| Neutral | −10 a +5 | Semana de descanso ou recuperação |
| Optimal | −30 a −10 | Zona ideal para construir Fitness |
| Overload | < −30 | Sobrecarga: descanse |

- **Agregação:** o trigger `onAtividadeWrite` recalcula o documento do dia (`estresseDiario/{uid}_{yyyymmdd}`: `estresse`, `kcal`, `qtdAtividades`) a cada criação, exclusão ou recálculo de atividade. Recalcular o dia inteiro a partir das atividades torna as retentativas do trigger inofensivas. Sem atividades no dia, o documento é removido.
- **Atividades anteriores ao trigger:** a tela de Forma pede `reconstruirEstresseDiario` uma vez por sessão quando não há nenhum dia agregado. A callable regrava todos os dias do usuário e remove os que não têm mais atividade.
- **Tela** (`#/forma`): indicadores de hoje (Fitness, Fadiga, Forma com a faixa e sua descrição, carga de 7 dias), gráfico em SVG sem biblioteca com as três linhas, as faixas de Forma ao fundo, barras opcionais de estresse diário e tooltip por dia, e legenda das faixas. Períodos: 30 dias, 90 dias (padrão), 6 meses, 1 ano e tudo.

## Cálculo do HRSS (Fase 2)

Replica o Elevate (`appcore/modules/shared/sync/compute/activity-computer.ts`), em `packages/domain/src/hrss.js`:

- `HRR% = max((FCmédia − FCrepouso) / (FCmáx − FCrepouso), 0) × 100`, arredondado a 3 casas.
- `TRIMP = (tempoMovimento/60) × HRR × 0,64 × e^(k × HRR)` (HRR em fração; k = 1,92 masculino, 1,67 feminino).
- `TRIMP@LTHR = 60 × HRRlthr × 0,64 × e^(k × HRRlthr)` e `HRSS = TRIMP / TRIMP@LTHR × 100`. Uma hora na FC do limiar vale 100.
- **FC média** = média simples das leituras válidas (30–250 bpm) do arquivo, como no Elevate.
- **Tempo em movimento** = soma dos intervalos com velocidade acima de 4 km/h (ciclismo), 1,5 km/h (corrida) ou 0,3 km/h (outro). Sem velocidade no arquivo, deriva da distância ou das coordenadas (GPX); sem nada disso vale a duração.
- **Sem FC:** a zona informada vira FC média presumida (zonas de Friel, % do LTHR, limitada à FC máxima): Z1 75%, Z2 85%, Z3 92%, Z4 97%, Z5 103%.
- **Prioridade:** HRSS informado pelo usuário > FC média > zona. O HRSS informado nunca é alterado pelo recálculo.
- **Alertas** gravados em `alertas`: `semConfigFc` (sem configuração vigente na data; HRSS fica `null`), `semFc`, `hrssAnormal` (> 225 por hora, como o Elevate) e `fcAcimaDaMaxima`.
- **Subida acumulada** com histerese de 3 m para descartar ruído do altímetro. **Distância** vem do arquivo ou da soma entre coordenadas.
- **Calorias:** as do arquivo; senão as informadas; senão estimativa de Keytel (exige data de nascimento e configuração vigente), rotulada "estimadas".

### Importação e cadastro manual
- Importação: o cliente envia o arquivo ao Storage e chama `processarArquivoAtividade`. Arquivo inválido ou duplicado (mesmo hash, ou mesmo início + duração) é apagado do Storage. Arquivo sem FC **não** é apagado: a callable responde `sem-fc` e o cliente reenvia o pedido com a zona.
- Cota: até 30 atividades por usuário por dia (arquivo + manual).
- Cadastro manual exige FC média, zona ou HRSS; a data não pode estar no futuro.
- **Leitura dos arquivos** (Functions): `fit-file-parser` (FIT) e `fast-xml-parser` (GPX/TCX), ambos MIT. O esporte vem do arquivo e pode ser escolhido pelo usuário.
- **Arquivos órfãos** (upload feito, callable nunca chamada ou falhou): a função agendada `limparArquivosOrfaos` (todos os dias às 03:30, São Paulo) apaga do Storage os arquivos com mais de 24 h sem atividade do mesmo dono. O prazo preserva o arquivo de uma importação sem FC que aguarda a zona.
- `obterUrlArquivo` gera URL assinada (v4, 10 min). Exige que a conta de serviço das Functions tenha `roles/iam.serviceAccountTokenCreator` sobre si mesma; sem isso só o botão "Baixar arquivo original" falha.

**Índices compostos:** `atividades` (`userId`, `data` desc) e (`userId`, `esporte`, `data` desc); `estresseDiario` (`userId`, `data`); `treinosPlanejados` (`userId`, `data`) e (`userId`, `status`, `data`); `configsAtleta` (`userId`, `vigenteDesde` desc); `pesagens` (`userId`, `data`); `metasPeso` (`userId`, `status`); `iaRascunhos` (`userId`, `criadoEm` desc); `users` (`aprovado`, `criadoEm`).

## Papéis e permissões
- `admin`: aprova, bloqueia e gerencia usuários. Não tem acesso especial a dados de saúde; para treinar, é também um `atleta` com os próprios dados.
- `atleta`: lê e escreve somente os próprios dados.
- `treinador`: previsto, sem UI na v1; só leria dados de atletas com vínculo aceito.
- Pesagens: ninguém além do dono lê.

## Upload no Storage
Caminho: `atividades/{userId}/{atividadeId}/original.{fit|gpx|tcx}`. O `userId` no caminho permite validar o dono sem consultar o Firestore (desvio consciente do padrão `<entidade>/{id}`).

Regras do Storage (`firebase/storage.rules`, default deny):
- **create** só se: `request.auth.uid == userId`; usuário `aprovado` e `ativo` (via `firestore.get`); `resource == null` (nunca sobrescreve); nome do objeto casa com `original.(fit|gpx|tcx)` em minúsculas; tamanho entre 1 byte e 15 MB.
- O `contentType` não é barreira: navegadores enviam `application/octet-stream` para `.fit`. A barreira de tipo é a extensão fixa no caminho mais a validação de conteúdo na callable.
- **read**: negado; a entrega é só por URL assinada (`obterUrlArquivo`). **update/delete** pelo cliente: negados; exclusão só pelo Admin SDK.
- A callable `processarArquivoAtividade` confere que o `userId` do caminho é o do chamador, relê o tamanho, valida a assinatura (FIT: bytes 8–11 = `.FIT` e CRC; GPX/TCX: XML bem formado com a raiz esperada), calcula o hash para o dedupe e **apaga o objeto** se for inválido ou duplicado. Também aplica a cota diária de 30 atividades por usuário.
- Uma scheduled function remove objetos órfãos (sem atividade) após 24 h.

## Cloud Functions
- `auth/`: `bootstrapUserOnCreate` (trigger), `ensureUserProfile`, `aprovarUsuario`, `listarPendentes`, `bloquearUsuario`.
- `atividades/`: `processarArquivoAtividade`, `criarAtividadeManual`, `excluirAtividade`, `recalcularHistorico`, `obterUrlArquivo` e a agendada `limparArquivosOrfaos`.
- `estresse/` (Fase 3): trigger `onAtividadeWrite` (mantém `estresseDiario`) e a callable `reconstruirEstresseDiario`.
- `ia/`: `sugerirTreinos`, `sugerirMetaPeso`, `decidirRascunho`.
- `exportacao/` (Fase 7): `exportarMeusDados`, `excluirMinhaConta`.

## Código compartilhado
`packages/domain` (`@no-strova/domain`) é um workspace npm usado pelo web e pelas Functions. O bundle das Functions embute o pacote com esbuild.

---

# Identidade visual

Preto, branco e laranja (~#FF5200), a partir do logo em `apps/web/assets/logo.png`. Implementada em `apps/web/src/styles/base.css`.

## Tema
- **Escuro é o padrão**, independente da configuração do sistema; **claro é opção** (botão no cabeçalho, escolha guardada no aparelho). A cor da barra do navegador (`theme-color`) acompanha o tema.
- Variáveis CSS (nomes do `CLAUDE.md`, mais `--primary-hover`, `--primary-contrast`, `--danger`, `--success`):

| Variável | Escuro | Claro |
|---|---|---|
| `--bg-main` | `#0A0A0A` | `#F6F6F4` |
| `--surface` | `#161616` | `#FFFFFF` |
| `--surface-light` | `#1F1F1F` | `#EFEFEC` |
| `--border` | `#2A2A2A` | `#DEDEDA` |
| `--text-primary` | `#FFFFFF` | `#0A0A0A` |
| `--text-secondary` | `#A3A3A3` | `#5C5C5C` |
| `--primary` | `#FF5200` | `#C93C00` |
| `--primary-hover` | `#FF6A26` | `#A93300` |
| `--primary-contrast` (texto do botão primário) | `#0A0A0A` | `#FFFFFF` |
| `--danger` / `--success` | `#F87171` / `#4ADE80` | `#B91C1C` / `#15803D` |

- **Botão primário:** fundo laranja (`--primary`) e texto preto no tema escuro. **No tema claro o texto é branco**: preto sobre `#C93C00` tem contraste de 3,9:1, abaixo do mínimo de 4,5:1 (WCAG AA); branco dá 5,1:1. Para o texto preto também no claro, basta trocar `--primary-contrast` do tema claro para `#0A0A0A` (e aceitar o contraste menor).
- Contrastes (WCAG): escuro — texto 19,8:1, texto secundário 7,2:1 a 7,9:1, laranja sobre fundo/superfície 5,6:1 a 6,1:1, botão 6,1:1; claro — texto 18,3:1, texto secundário 6,2:1 a 6,7:1, laranja 4,7:1 a 5,1:1, botão 5,1:1.

## Tipografia
- **Anton** nos títulos (`h1`–`h3`), sempre em caixa alta, com espaçamento de letras de 0,03em. Fallback: Impact.
- **Inter** no corpo, com **números tabulares** (`font-variant-numeric: tabular-nums`) para alinhar colunas de dados. Pesos 400, 600 e 700.
- Fontes **self-hosted** pelos pacotes `@fontsource/anton` e `@fontsource/inter` (subconjunto latino, que cobre os acentos do português); nada é carregado de CDN. Licença OFL-1.1.

## Logo, favicon e PWA
- Logo no cabeçalho (44 px, leva ao Início) e nas telas de acesso (login, cadastro, concluir cadastro, aguardando aprovação, bloqueado).
- `npm run icones -w apps/web` gera, a partir de `assets/logo.png`: `favicon.ico`, `favicon-32.png` e `favicon-48.png` (recorte justo no texto, para ler em tamanho pequeno), ícones do PWA de 192 e 512 px, ícone "maskable" (logo a 70% do centro sobre preto, por causa do corte do Android) e `apple-touch-icon`.
- Manifesto do PWA com fundo e tema `#0A0A0A`.

# Prompts por fase (para o Claude Code)

Antes de tudo: salvar o documento de stack como `CLAUDE.md` na raiz do repositório e este arquivo como `docs/dominio.md`.

## Fase 0 — Proposta

Leia `CLAUDE.md` e `docs/dominio.md`. Cumpra o passo 8 do documento: confirme o entendimento e proponha modelo de dados (coleções, campos, índices), papéis/permissões, Cloud Functions e estrutura de módulos do frontend. Não gere código ainda. Pergunte o que for decisão de negócio.

## Fase 1 — Fundação

Gere o scaffolding do monorepo conforme o `CLAUDE.md`: configs do Firebase e Vite, scripts de homolog/produção, regras do Firestore/Storage e estrutura de pastas. Implemente cadastro, `bootstrapUserOnCreate`, `ensureUserProfile`, aprovação por admin e a tela de login. PWA básico com tema claro/escuro.

## Fase 2 — Configuração do atleta e atividades

Implemente as configurações do atleta com data de vigência (FC máx., FC repouso, LTHR, sexo, peso, altura). Implemente o upload de .FIT/.GPX/.TCX para o Storage e uma callable que processa o arquivo e grava o resumo da atividade. Calcule o HRSS em `domain/`, usando como referência o código do Elevate em `../elevate-ref` (somente leitura). Tela de lista de atividades e detalhe.

## Fase 3 — Gráfico de Fitness/Fadiga/Forma (passado)

Implemente em `domain/` o cálculo diário de Fitness (42 d), Fadiga (7 d) e Forma, com testes unitários. Crie a tela do gráfico com períodos selecionáveis, tooltip por dia e faixas de Forma, no estilo do Elevate.

## Fase 4 — Plano de treino e projeção

Implemente `treinosPlanejados` com calendário semanal/mensal, criação/edição/arrastar entre dias e vínculo com a atividade realizada. Estenda o gráfico: dias futuros projetados com base no plano, em linha tracejada. Adicione a meta de forma por data.

## Fase 5 — Peso e metas

Implemente pesagens, tendência (média móvel 7 d), metas de peso e a sobreposição opcional de peso no gráfico. Mostre peso/estresse semanal e gasto calórico dos treinos.

## Fase 6 — IA com Gemini

Configure Genkit com Gemini em callables e a chave em Secret Manager. Implemente (a) sugestão de treinos para as próximas semanas e (b) sugestão de meta de peso (ritmo, tempo, distância, calorias), ambas com saída estruturada validada, como rascunho que o usuário aceita ou descarta, aplicando os limites de segurança do `docs/dominio.md` no código. Limite de chamadas por usuário/dia.

## Fase 7 — Acabamento

Ajuda do produto, push opcional, exportação de dados do usuário e vínculo treinador–atleta (somente se decidirmos fazer agora).
