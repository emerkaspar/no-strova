# Seção 9 — Domínio da nova aplicação

(Substitui o placeholder da seção 9 do documento de stack.)

## Visão

App web de planejamento e análise de treino para quem pedala e corre, com foco em ciclismo. Inspirado no Elevate (https://github.com/thomaschampagne/elevate, licença MPL-2.0), usado só como **referência de cálculo**: não é fork, o código é reescrito na nossa stack. Cópia local do Elevate para consulta fica **fora** do monorepo (ex.: `../elevate-ref`).

Diferenciais em relação ao Elevate:
1. **Projeção no gráfico:** o usuário planeja treinos futuros e o gráfico de Condicionamento/Fadiga/Forma continua nos dias seguintes.
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
- **Condicionamento** = média móvel exponencial do estresse diário (42 dias). **Fadiga** = idem (7 dias). **Forma** = Condicionamento − Fadiga **do dia anterior** (a Forma de hoje usa os valores de ontem, como no Elevate e na convenção do TrainingPeaks). Faixas de Forma (Transição, Descansado, Neutra, Ótima, Sobrecarga) como no Elevate; ver "Condicionamento, Fadiga e Forma (Fase 3)".
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
- **Curva única** de Condicionamento/Fadiga/Forma na v1 (sem filtro por esporte).
- **Condicionamento inicial = 0.** EMA como no Elevate: `ema = ema + (estresse − ema) × (1 − e^(−1/N))`, com N = 42 (Condicionamento) e N = 7 (Fadiga).
- **Faixas de Forma**: ver "Condicionamento, Fadiga e Forma (Fase 3)" (corrigidas na Fase 3 conforme o guia do Elevate).
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
| `treinosPlanejados/{id}` | `data`, `esporte`, `duracaoMin` (inteiro, 5–1440), `zona` (Z1–Z5), `estresseEstimado` (referência gravada ao salvar), `estresseManual?` (sobrescreve a estimativa), `observacoes` (até 500), `status` (`planejado`/`realizado`/`pulado`), `atividadeId?`, `criadoEm`, e, nos treinos intervalados, `passos?` (os blocos), `nomeTreino?` e `modeloId?` | Dono (as regras validam todos os campos) |
| `treinosModelos/{id}` | `nome` (3–60), `esporte` (`ciclismo`/`corrida`), `foco`, `nivel`, `descricao?` (até 500), `passos` (1–30), `criadoEm` | Dono (as regras validam; o catálogo do sistema fica no código) |
| `metasForma/{id}` | `formaAlvo` (−60 a 60), `dataAlvo`, `ativa`, `criadoEm` | Dono (as regras validam; uma ativa por vez) |
| `calibracoes/{uid}` | `chaves`: mapa `{esporte}_{zona}` → `{ n, mediana, amostras: [{ id, data, v }] }` (HRSS por hora das atividades com FC real), `atualizadoEm` | Somente trigger/callable (o dono lê) |
| `preferencias/{uid}` | `calibracaoAtiva?` (booleano; sem documento, vale a calibração) e `nivelTreinos?` (`iniciante`/`intermediario`/`avancado`) | Dono (as regras só aceitam esses campos; o app grava mesclando) |
| `metasCondicionamento/{id}` | `condicionamentoAlvo` (1–250), `condicionamentoInicial?` (o Condicionamento de quando a meta foi criada; informativo), `dataAlvo`, `ativa`, `criadoEm` | Dono (as regras validam; uma ativa por vez) |
| `pesagens/{id}` | `data`, `pesoKg` (20–400), `criadoEm`. **Uma por dia**: o id é `uid_yyyymmdd`, então regravar a data substitui | Dono (as regras validam campos e faixa) |
| `metasPeso/{id}` | `pesoAlvoKg` (20–400), `pesoInicialKg?` (o peso de quando a meta foi criada, base do progresso), `dataAlvo`, `status` (`ativa`/`anterior`), `criadoEm` | Dono (as regras validam; uma ativa por vez) |
| `iaRascunhos/{id}` | `tipo` (`treino`/`peso`), `entradaResumo`, `saida`, `status` (`pendente`/`aceito`/`descartado`), `criadoEm` | Somente callable |
| `iaUso/{uid_yyyymmdd}` | `chamadas` | Admin SDK |
| `vinculosTreinador/{id}` | `treinadorId`, `atletaId`, `status` | Previsto no modelo; sem UI nem regras na v1 |

Como o HRSS do Elevate usa só a FC média e o tempo em movimento, a atividade guarda `fcMedia`, `tempoMovimentoS` e `zona`; isso basta para recalcular o HRSS com qualquer configuração sem reler o arquivo (não há `fcHistograma`). O doc `configsAtleta` tem id `{uid}_{yyyymmdd da vigência}`, então salvar a mesma data substitui a configuração.

## Condicionamento, Fadiga e Forma (Fase 3)

Implementado em `packages/domain/src/forma.js`, replicando o Elevate (`fitness.service.ts` e o guia do Fitness Trend):

- **Estresse do dia** = soma do HRSS das atividades do dia (`estresseDiario`). Dia sem treino vale 0.
- `Condicionamento(d) = Condicionamento(d−1) + (estresse(d) − Condicionamento(d−1)) × (1 − e^(−1/42))`; Fadiga igual, com 7 no lugar de 42.
- **Forma(d) = Condicionamento(d−1) − Fadiga(d−1).** A série começa **um dia antes da primeira atividade**, com Condicionamento, Fadiga e Forma em 0 (Condicionamento inicial = 0), e segue até hoje, com decaimento nos dias sem treino.
- **Faixas de Forma** (guia do Elevate; limite inferior exclusivo):

| Faixa | Forma | Significado |
|---|---|---|
| Transição | > +25 | Pausa longa (doença, lesão, fim de temporada): Condicionamento em queda |
| Descansado | +5 a +25 | Em forma e descansado: pronto para prova ou dias fortes |
| Neutra | −10 a +5 | Semana de descanso ou recuperação |
| Ótima | −30 a −10 | Zona ideal para construir Condicionamento |
| Sobrecarga | < −30 | Sobrecarga: descanse |

- **Agregação:** o trigger `onAtividadeWrite` recalcula o documento do dia (`estresseDiario/{uid}_{yyyymmdd}`: `estresse`, `kcal`, `qtdAtividades`) a cada criação, exclusão ou recálculo de atividade. Recalcular o dia inteiro a partir das atividades torna as retentativas do trigger inofensivas. Sem atividades no dia, o documento é removido.
- **Atividades anteriores ao trigger:** a tela de Forma pede `reconstruirEstresseDiario` uma vez por sessão quando não há nenhum dia agregado. A callable regrava todos os dias do usuário e remove os que não têm mais atividade.
- **Tela** (`#/forma`): indicadores de hoje (Condicionamento, Fadiga, Forma com a faixa e sua descrição, carga de 7 dias), gráfico em SVG sem biblioteca com as três linhas, as faixas de Forma ao fundo, barras opcionais de estresse diário e tooltip por dia, e legenda das faixas. Períodos: 30 dias, 90 dias (padrão), 6 meses, 1 ano e tudo.

## Cálculo do HRSS (Fase 2)

Replica o Elevate (`appcore/modules/shared/sync/compute/activity-computer.ts`), em `packages/domain/src/hrss.js`:

- `HRR% = max((FCmédia − FCrepouso) / (FCmáx − FCrepouso), 0) × 100`, arredondado a 3 casas.
- `TRIMP = (tempoMovimento/60) × HRR × 0,64 × e^(k × HRR)` (HRR em fração; k = 1,92 masculino, 1,67 feminino).
- `TRIMP@LTHR = 60 × HRRlthr × 0,64 × e^(k × HRRlthr)` e `HRSS = TRIMP / TRIMP@LTHR × 100`. Uma hora na FC do limiar vale 100.
- **FC média** = média simples das leituras válidas (30–250 bpm) do arquivo, como no Elevate.
- **Tempo em movimento** = soma dos intervalos com velocidade acima de 4 km/h (ciclismo), 1,5 km/h (corrida) ou 0,3 km/h (outro). Sem velocidade no arquivo, deriva da distância ou das coordenadas (GPX); sem nada disso vale a duração.
- **Sem FC:** a zona informada vira FC média presumida (zonas de Friel, % do LTHR, limitada à FC máxima): Z1 75%, Z2 85%, Z3 92%, Z4 97%, Z5 103%.
- **Prioridade:** HRSS informado pelo usuário > FC média > zona. O HRSS informado nunca é alterado pelo recálculo.
- **Vigência:** vale a configuração de maior `vigenteDesde` menor ou igual à data da atividade. Atividade **anterior à primeira vigência** fica sem configuração: HRSS `null` e alerta `semConfigFc` (decisão mantida; não há retroação automática da configuração mais antiga). Para evitar surpresa, o formulário sugere como início da primeira vigência a data da atividade mais antiga, avisa antes de salvar uma vigência que deixa atividades descobertas, a lista de Atividades mostra um aviso, e `recalcularHistorico` devolve `semConfig` (quantas continuam descobertas).
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
- `calibracao/`: callable `reconstruirCalibracao` e o serviço que o gatilho `onAtividadeWrite` (e `recalcularHistorico`) usa para manter `calibracoes/{uid}`. O teste de LTHR não tem Function: roda no cliente.
- `ia/`: `sugerirTreinos`, `sugerirMetaPeso`, `decidirRascunho`.
- `exportacao/` (Fase 7): `exportarMeusDados`, `excluirMinhaConta`.

## Código compartilhado
`packages/domain` (`@no-strova/domain`) é um workspace npm usado pelo web e pelas Functions. O bundle das Functions embute o pacote com esbuild.

---

# Plano de treino e projeção (Fase 4)

Implementado em `packages/domain/src/planejamento.js` e `calendario.js` (regras puras, testadas), `modules/plano/` (tela) e `infrastructure/planoRepo.js`. Não há Cloud Functions nesta fase: o cliente grava, e as regras do Firestore validam os campos.

## Treino planejado
- **Campos:** data, esporte, duração (minutos inteiros, 5 a 1440), **zona predominante Z1–Z5**, estresse informado (opcional, sobrescreve a estimativa), observações (até 500) e `status`: `planejado` → `realizado` (vinculado a uma atividade) ou `pulado`.
- **Estresse do treino** (`estresseDoTreino`): o informado pelo usuário; senão a **estimativa pela zona e duração** (mesma conversão do HRSS sem FC: zona de Friel → FC média presumida → HRSS) **com a configuração vigente na data do treino, recalculada a cada leitura** (acompanha mudanças de LTHR); senão o valor gravado ao salvar; senão 0. Sem configuração de FC, a estimativa fica vazia e a tela avisa.
- **Treino planejado em data passada** é aceito (registrar o que já aconteceu), mas, se continua "planejado", aparece como **"não realizado"** e deixa de contar na projeção; o usuário **reagenda para hoje** ou **pula**.

## Projeção
- **Regras do estresse por dia** (`estressesParaProjecao`): dias passados usam só o **realizado**; **hoje** usa o **maior** entre realizado e planejado; dias futuros usam o **planejado**. Só treinos com status `planejado` contam (o vinculado já está no realizado; o pulado não existe).
- **Horizonte** (`horizonteDaProjecao`): até o último treino planejado ou a data da meta **mais 14 dias**, com teto de **90 dias** a partir de hoje (uma meta mais distante estende a série até ela, para poder ser avaliada). Sem plano nem meta, termina hoje. O Início mostra só os próximos 14 dias.
- A série reaproveita o cálculo do Condicionamento/Fadiga/Forma (Forma de um dia = Condicionamento − Fadiga do dia anterior); o passado não muda com o plano. Cada dia ganha `projetado`.

## Meta de Condicionamento (a meta principal)
- **Por quê:** o Condicionamento (a média móvel de 42 dias do estresse) é a medida direta de evolução: sobe com treino consistente e cai com pausas longas. A Forma serve para chegar descansado a um dia específico. Por isso a meta **principal** do plano é de Condicionamento; a de Forma é **opcional e complementar** (as duas podem estar ativas ao mesmo tempo, cada uma avaliada separadamente).
- "**Chegar com Condicionamento X na data Y**": X de 1 a 250, Y entre hoje e 365 dias. **Uma meta ativa por vez**; ao definir outra, a anterior é desativada (as anteriores ficam listadas). O **progresso** é o Condicionamento de hoje dividido pelo alvo (3,1 de 30,0 = 10%, limitado a 0–100%); o `condicionamentoInicial` guardado ao criar a meta não entra mais na conta. Regras em `packages/domain/src/metaCondicionamento.js`.
- **Avaliação** (`avaliarMetaCondicionamento`): compara o Condicionamento projetado do dia da meta com o alvo. **Chega lá** se a diferença é de até **±3 pontos** (`TOLERANCIA_META_CONDICIONAMENTO`); **Fica abaixo** (falta carga: planejar mais treino); **Fica acima** (dá para treinar um pouco menos).
- **Ritmo:** de hoje até a data, o app calcula os pontos de Condicionamento **por semana** que o alvo exige (`ritmoNecessario`) e os que o plano atual entrega (`ritmoDoPlano`). Acima de **7 pontos por semana** (`RITMO_MAXIMO_SEMANAL`) a meta é marcada como **agressiva**: o app **avisa, mas não impede** (subir rápido demais é difícil de sustentar e leva a Forma à sobrecarga). Os valores 3, 7 e ±3 são padrões sugeridos.
- **Horizonte da projeção:** uma meta de Condicionamento mais distante também estende a série até ela (`horizonteDaProjecao`).
- **Onde aparece:** no **Plano**, o cartão "Meta de Condicionamento" (resultado, ritmo, aviso, progresso e anteriores), vem **antes** da meta de Forma; no **gráfico do Plano**, faixa de tolerância (±3), linha do alvo, losango e rótulo no painel de Condicionamento e fadiga (na cor do Condicionamento), e o tooltip diz "faltam X"; no **Início**, o mini-cartão "Meta de Condicionamento" sob o destaque (do valor de hoje ao alvo, progresso e o que o plano atual entrega; sem meta, convida a definir no Plano).

## Meta de forma (opcional)
- "**Chegar com Forma X na data Y**": X de −60 a +60, Y entre hoje e 365 dias. **Uma meta ativa por vez**; ao definir outra, a anterior é desativada (as anteriores ficam listadas, só leitura). A troca é um lote do Firestore (tudo ou nada).
- **Avaliação** (`avaliarMeta`): compara a Forma projetada do dia da meta com o alvo. **Chega lá** se a diferença é de até **±3 pontos**; **Fica abaixo** (Forma menor que o alvo: falta descanso, reduzir a carga nos dias antes); **Fica acima** (Forma maior: dá para treinar um pouco mais). A tolerância de 3 pontos é um padrão sugerido (`TOLERANCIA_META`).

## Vínculo planejado × realizado
- O app **sugere** o vínculo quando há um treino "planejado" e uma atividade do **mesmo dia e esporte** (sem repetir atividade); o usuário **confirma** ("Vincular") ou diz "Não foi esse" (o treino passa a "Não realizados"). Vincular grava `status: realizado` e `atividadeId` no treino; a atividade (só escrita pelo servidor) não muda.
- **Comparativo:** para treinos vinculados, tabela com estresse planejado × realizado, diferença e duração planejada → realizada.

## Calibração da estimativa e teste de LTHR

**Problema:** a estimativa de HRSS de um treino planejado trata o treino como uma zona só, na FC média presumida da zona. O TRIMP é convexo, então treino variado (intervalado) tende a render mais HRSS do que a fórmula diz, e um LTHR errado desloca tudo.

### Calibração com o histórico (automática)
- **Amostra:** cada atividade com **HRSS calculado pela FC real** (`hrssOrigem = fc`, nunca o estimado pela zona nem o informado), com **20 minutos ou mais** de movimento, sem alerta de HRSS anormal. A zona vem da FC média: a zona cuja FC presumida (fração do LTHR da configuração vigente na data) está mais perto; razão FC/LTHR fora de 0,60–1,12 não conta. `v` = HRSS por hora. Regras em `packages/domain/src/calibracao.js`.
- **Chave:** `{esporte}_{zona}` (ex.: `ciclismo_Z2`). Guarda as **30 amostras mais recentes** de cada chave e a **mediana**.
- **Estimativa calibrada:** com **3 amostras ou mais**, HRSS/h = `peso × mediana + (1 − peso) × fórmula`, com `peso = n / (n + 5)` (3 → 38%, 5 → 50%, 10 → 67%, 30 → 86%). Com menos, vale só a fórmula. Esporte ou zona sem amostras: fórmula. O estresse **informado** continua mandando. A duração escala linearmente.
- **Onde se aplica:** `estimarEstresseTreino` / `estresseDoTreino` (e, por eles, a projeção, o calendário, o editor, o Início e "Planejado × realizado"). O editor mostra "calibrada com as suas N atividades parecidas (pela fórmula seria ~X)".
- **Como se mantém (custo mínimo):** o gatilho `onAtividadeWrite` (o mesmo do `estresseDiario`) lê **1 documento** (`calibracoes/{uid}`) e grava **1**, em transação, só quando a amostra da atividade mudou (criar, editar, recalcular, excluir); remove pela id e acrescenta, então é idempotente. **Recalcular histórico** e a callable `reconstruirCalibracao` refazem o resumo do zero (também chamada uma vez por sessão se o documento não existir, para atividades anteriores). O cliente lê 1 documento por abertura.
- **Decisões (padrões escolhidos; ajustáveis em `calibracao.js`):** mínimo de 3 amostras; `K = 5`; 20 min de duração mínima; 30 amostras por chave; calibração **ligada por padrão**, com opção de desligar em Configuração (`preferencias/{uid}.calibracaoAtiva`).
- **Limite conhecido:** a zona de uma atividade vem da FC média, que esconde intervalados; por isso os treinos vinculados (planejado × realizado) são a melhor fonte quando o plano e a execução coincidem. Um "tipo de treino" no plano melhoraria isso (fora do escopo).

### Teste de LTHR (protocolo de 30 minutos, Joe Friel)
- **Protocolo** (mostrado em Configuração): trecho plano e constante, sozinho; 15–20 min de aquecimento; **30 min no maior ritmo sustentável**; volta suave; importar a atividade com FC.
- **Análise** (`analisarTesteLthr`, no cliente, sobre a série de FC já guardada em `atividades/{id}/series/fc`; **nenhuma Function nova**): acha a **melhor janela de 30 minutos** (maior FC média, com cobertura de amostras de 85% ou mais; pausas longas não contam) e devolve o **LTHR = FC média dos últimos 20 min** dessa janela, a FC média dos 30 min e a **FC máxima observada**. Menos de 30 min de FC: erro.
- **Avisos:** LTHR abaixo de 80% da FC máxima (esforço provavelmente não máximo) e diferença de 12 bpm ou mais para o LTHR atual.
- **Aplicar:** o usuário confirma e o app cria uma **nova vigência** (`configAposTeste`) na **data da atividade**, copiando a configuração vigente nessa data e trocando o LTHR (e, se marcado e maior, a FC máxima). Depois, **Recalcular histórico** aplica às atividades já importadas. Sem configuração cadastrada, não cria.
- **Se pedala e corre:** a configuração tem um só LTHR; o teste deve ser feito no esporte principal (na corrida o LTHR costuma ser alguns bpm maior).

## Treinos intervalados (`#/treinos`)

Biblioteca de treinos estruturados para **ciclismo e corrida**, com muita variedade, sugestões ao longo do tempo e treinos próprios. Regras puras em `packages/domain` (`treinosEstruturados.js`, `catalogoTreinos.js`, `sugestaoTreinos.js`, `exportarTreino.js`); tela em `modules/treinos/`. **Não há Function nova**: o cliente grava, e as regras validam.

### Treino estruturado
- **Passos:** lista de até 30 passos. **Bloco** (`aquecimento`, `principal`, `recuperacao` ou `desaquecimento`, com duração e zona Z1–Z5) ou **série** (N repetições de um esforço, com a recuperação **entre** as repetições, não depois da última). Duração de cada etapa de 10 s a 4 h; treino de 5 min a 24 h; pelo menos um esforço principal. Esforços muito curtos (menos de ~2 min) têm uma **descrição do esforço** (ex.: "máximo"), porque a FC reage devagar a eles.
- **HRSS estimado:** a **soma do HRSS de cada bloco**, na FC presumida da zona dele (`estimarEstresseEstruturado`), em vez de tratar o treino inteiro numa zona só: o TRIMP pesa muito mais os minutos em FC alta, então é mais preciso para intervalados. A calibração do histórico (por zona predominante) **não** se aplica a treinos estruturados. Sem configuração de FC, não há estimativa. Em esforços de menos de ~2 min a FC não acompanha o esforço, então a estimativa por zona tende a superestimar.
- **Zona predominante:** a zona com mais tempo no trabalho principal (empate: a mais alta). A duração do treino planejado é a soma dos passos (arredondada para cima em minutos).
- **Faixa de FC de cada zona** (em fração do LTHR, faixas de Friel): Z1 60–80%, Z2 80–89%, Z3 89–94,5%, Z4 94,5–100%, Z5 100–110% (topo limitado à FC máxima). Aparece no detalhe do treino e vai no arquivo exportado.

### Catálogo (no código, sem custo de leitura)
- **9 focos**: VO2máx, limiar, tempo, over-under, pirâmide, fartlek, sprints, progressivo e subidas; **3 níveis** (iniciante, intermediário, avançado); cada modelo existe para os dois esportes (id `{base}-{esporte}`), mais "Tiros de 1 min" só para corrida. São mais de 60 treinos, cada um com um **nome único e divertido** (ex.: "Oi, Coração!", "Gangorra do Sofrimento", "Escadaria pro Inferno"), que fica mais debochado conforme o treino aperta e é o mesmo na tela, no plano e no relógio, a **especificação técnica** (ex.: "5 × 4 min no VO2") e uma descrição de como executar. Um teste garante que todo modelo é válido, que os nomes não se repetem e que há variedade em cada esporte e nível.

### Sugestão por regras (sem IA)
`sugerirTreinos` indica treinos para os **próximos 7 dias** (a partir de amanhã), em dias **sem treino** planejado ou realizado, do **nível** (escolhido pelo usuário) e do esporte:
- **No máximo 2 treinos intensos por semana** (foco de intensidade alta, ou zona predominante Z4/Z5 nos treinos já no plano) e **48 h entre eles**, contando os que já estão no plano e os dos 2 dias anteriores; **no máximo 1 moderado** (tempo, fartlek, progressivo), sem colar num intenso.
- **Forma:** abaixo de −20, no máximo 1 intenso; abaixo de −30 (sobrecarga), **nenhum**, com aviso.
- **Rotação de foco:** ganha o foco que está há mais tempo sem ser treinado (nunca treinado vale 60 dias); um foco já escolhido na mesma rodada perde pontos; um sorteio estável pela semente desempata (mesma semente, mesmas sugestões). **Não repete o mesmo modelo nas últimas 6 semanas** e respeita os recusados com "Trocar". Os treinos próprios do mesmo nível e esporte entram no sorteio.
- **"Montar minha semana" (com aprovação):** a aba Sugestões lista as sugestões (data, perfil, resumo e motivo), cada uma com caixa de seleção, **Ver** e **Trocar**; "Adicionar N ao plano" grava os selecionados de uma vez (lote tudo ou nada), depois de confirmar; "Sugerir outras" refaz o sorteio. **Nada entra no plano sem a ação do usuário.**
- Padrões escolhidos (em `REGRAS_SUGESTAO`): 7 dias, 2 intensos, 48 h, Forma −20/−30, 42 dias sem repetir.

### Tela
- **Controles:** esporte (ciclismo/corrida) e **nível** (o usuário escolhe; fica em `preferencias.nivelTreinos`, padrão intermediário). **Abas:** Sugestões, Biblioteca (filtro por foco) e Meus treinos.
- **Cartão do treino:** nome divertido (o mesmo na tela, no plano e no relógio), especificação técnica (ex.: 5 × 3 min no VO2), foco, **perfil em miniatura** (uma barra por bloco, largura = tempo, altura e cor = zona), duração, zona e HRSS estimado. **Detalhe:** números, passo a passo com a faixa de FC, **Adicionar ao plano** numa data, **Exportar para o relógio** e Editar/Excluir (próprios) ou **Duplicar e editar** (catálogo).
- **Construtor:** nome, esporte, foco, nível, descrição e passos (blocos e séries; duração digitada como "30s", "3", "2:30" ou "1h"; subir, descer e remover), com **prévia ao vivo** do perfil, da duração e do HRSS. Valida com `validarTreinoEstruturado` ao salvar (e ao ler: documentos inválidos são ignorados). Os modelos próprios ficam em `treinosModelos`.
- **Escolher da biblioteca no editor do Plano:** o formulário de treino tem o campo **"Treino da biblioteca"** (lista do **esporte** escolhido, com "Treino livre" no topo, "Meus treinos" e o catálogo agrupado por foco, cada opção com nome, nível e duração). Escolher um treino mostra o perfil e os passos, **trava a duração, a zona e o esporte** (vêm dos passos) e estima o HRSS pelos blocos; voltar para "Treino livre" destrava tudo. Ao editar um treino estruturado, a lista mostra o atual e deixa trocar por outro. Trocar o esporte (sem treino escolhido) refaz a lista.
- **No plano:** "Adicionar ao plano" cria um **treino planejado com cópia dos passos**, nome e modelo de origem (mudar ou apagar o modelo depois não altera o plano). O calendário mostra o nome ("5 × 3 min no VO2 · 47min"), e o editor mostra a estrutura (perfil e passos), trava a duração e a zona (vêm dos passos) e estima pelos blocos. "Duplicar para a próxima semana" leva a estrutura.

### Exportação para o relógio (.fit)
- `gerarFitDoTreino` gera, no navegador, um **arquivo de treino FIT** (mensagens `file_id` do tipo workout, `workout` e `workout_step`): um passo **por tempo** para cada bloco (as séries são expandidas, então a duração bate com a do app), com **alvo de FC** em bpm da zona (da configuração do atleta; sem configuração, alvo aberto), intensidade (aquecimento, ativo, recuperação, desaquecimento) e nome do passo. Até 99 passos. O CRC e a estrutura são testados com um decodificador próprio; **não foi testado em um aparelho real**: se o aparelho recusar o arquivo, é um ponto a ajustar. Copie para a pasta de treinos do aparelho (Garmin: `NewFiles`) ou importe no Garmin Connect.
- Fora do escopo desta entrega: arquivos .zwo/.erg (são por potência, e o app trabalha com FC) e a comparação do tempo em cada zona entre o planejado e a atividade feita.

## Tela do Plano (`#/plano`)
- **Calendário** em **semana** (7 colunas) ou **mês** (6 semanas, com contagem por dia em telas pequenas), navegação ‹ › e "Hoje". Cada dia mostra as atividades realizadas (chips cheios) e os treinos planejados (tracejados), com o total do dia. "+" cria treino no dia; clicar no treino edita.
- **Arrastar e soltar** o treino planejado para outro dia muda só a data (a projeção atualiza na hora). O editor também troca a data (alternativa por teclado e para toque, onde o arrastar do navegador não funciona).
- **Editor:** data, esporte, duração, zona, estresse informado, observações, com a **estimativa ao vivo**; ações: salvar, cancelar, **duplicar para a próxima semana**, marcar como pulado (ou voltar para planejado / desvincular) e excluir (com confirmação).
- Cartões: **Projeção do plano** (o **mesmo componente do gráfico do Início**, `criarGraficoPrincipal`, em **modo plano**; ver "Gráfico principal do Início"), **Meta de Condicionamento** (principal), **Meta de forma** (opcional) e **Acompanhamento** (sugestões de vínculo, não realizados e planejado × realizado).
- **Regras do Firestore:** `treinosPlanejados` e `metasForma` validam tipos, intervalos e campos permitidos (sem campos extras) e o dono; nenhuma decisão do servidor depende desses documentos nesta fase. A fase 6 (IA) deve revalidar o que ler.

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

## Layout (todas as telas logadas)

Referência: mockup do Início enviado em 03/11/2026. Implementado em `apps/web/src/styles/layout.css`, `modules/shell/` e `modules/inicio/`.

**Cabeçalho (em uma única linha em qualquer largura a partir de 768 px)**
- À esquerda: logo (68 px; quadrado preto com "NO" e "STROVA"), a data por extenso em pt-BR (`America/Sao_Paulo`, em cinza, 13 px) e, abaixo, a saudação em Anton caixa alta, 24 px (`Bom dia` 5h–11h59, `Boa tarde` 12h–17h59, `Boa noite` 18h–4h59, com o primeiro nome). A saudação é deliberadamente leve; o logo é o elemento de maior peso.
- À direita: menu em pílula (**Início, Atividades, Plano, Treinos, Peso, Configuração**; **Aprovações** só para admin) com o item ativo preenchido de laranja (texto preto no escuro, branco no claro; ver "Botão primário"), o botão laranja **Importar arquivo** e o avatar com a inicial, que abre um menu com **Tema claro/escuro** e **Sair** (fecha com Esc ou clique fora).
- **Importar arquivo** leva a `#/atividades` com o painel de importação aberto (se a lista já está aberta, abre o painel na hora).
- **Largura:** o bloco da saudação é o que cede espaço (reticências). De 1000 a 1179 px a data sai e o rótulo vira "Importar"; de 768 a 999 px a saudação também sai e o menu fica mais compacto. Medido com as fontes do projeto: em 1205 px com admin (6 itens) sobram ~250 px para a data (237 px).
- **Abaixo de 768 px** o menu em pílula some e vira uma **barra de abas fixa no rodapé** com ícones de traço (início, atividades, plano, treinos, peso, configuração e, para admin, aprovações) e rótulos pequenos; o item ativo fica laranja. O cabeçalho mantém logo, saudação reduzida, "Importar" e avatar.
- A tela **Forma** (`#/forma`) não tem item de menu: abre pelo "Ver gráfico completo" do Início e mantém Início ativo. **Plano** (`#/plano`) está pronto (Fase 4); **Peso** (`#/peso`) está pronto (Fase 5).

**Cartões:** raio de 20 px (era 12 px no `CLAUDE.md`, atualizado), borda de 1 px, padding de 28 px; conteúdo com largura máxima de 1200 px.

**Início, nesta ordem**
1. **Forma hoje** (bloco de destaque, "o cara" da tela): mostra **sempre a Forma** em número gigante **com uma casa decimal** (a parte inteira em Anton gigante e a decimal menor ao lado; ex.: "+0,2", "−19,4"; hífen no lugar do sinal de menos, porque a Anton não tem o "−"). A casa decimal existe para um valor como 0,2 não aparecer como um "0" que desanima; "Forma amanhã" usa o mesmo formato, **muda de cor conforme a zona** e traz poucos dados menores. Regra em `application/inicio.js` (`destaqueDoInicio`).
   - **Estrutura:** rótulo "Forma hoje" + chip da zona com um ícone "i" (topo); número grande (o maior elemento do bloco); quatro dados menores em 2×2; botão **Planejar treino** (`#/plano`). A frase da zona (`resumo` em `FAIXAS_FORMA`) **não fica mais no bloco**: vive no hint.
   - **Hint das zonas** (`modules/inicio/dicaZonas.js`): abre ao passar o mouse no **chip** ou no **número**, ao focar o chip pelo teclado e ao clicar/tocar (o clique fixa o cartão; Esc ou um toque fora fecha). Mostra "Zonas de Forma", "A Forma é o Condicionamento menos a Fadiga de ontem…" e as cinco zonas (da transição à sobrecarga) com cor, intervalo e significado (`descricao`). A **zona atual** fica destacada com "Você está aqui · +0,2" e a frase de incentivo (`resumo`). **Posição:** ao **lado** do bloco (sobre o gráfico), para não cobrir o número nem os dados; em coluna única (celular) abre logo **abaixo** do bloco. **Destaque visual:** fundo elevado (`--elevado`: `#262626` no escuro, branco no claro), borda de 2 px na **cor da zona atual**, sombra forte e uma **seta** apontando para o bloco, para não se confundir com o cartão do gráfico por baixo. O cartão não captura o mouse (`pointer-events: none`) e tem `role="tooltip"` ligado ao chip por `aria-describedby`.
   - **Dados menores:** **Condicionamento** (com a variação em 7 dias: "▲ 1,2 em 7 dias", "▼ 0,4 em 7 dias" ou "estável em 7 dias"), **Fadiga** ("média de 7 dias"), **Forma amanhã** (Condicionamento − Fadiga de hoje, o efeito do treino de hoje, com a zona de amanhã) e **Último treino** ("Hoje", "Ontem" ou "Há N dias", com o HRSS daquele dia).
   - **Cor por zona** (texto preto no escuro e branco no claro; contrastes: escuro 6,1 a 13,4:1, claro 5,0 a 7,7:1):

| Zona (Forma) | Escuro | Claro |
|---|---|---|
| Ótima (−30 a −10) | `#FF5200` (laranja da marca, como no mockup) | `#C93C00` |
| Neutra (−10 a +5) | `#D4D4D4` (cinza claro) | `#52525B` |
| Descansado (+5 a +25) | `#4ADE80` (verde) | `#15803D` |
| Transição (> +25) | `#7DD3FC` (azul) | `#0369A1` |
| Sobrecarga (< −30) | `#F87171` (vermelho) | `#B91C1C` |

   A cor nunca é o único sinal: o chip traz o nome da zona. Para trocar uma cor, basta mudar `--hero-bg` da classe `.hero-zona-<id>` em `layout.css`.
   - **Sem dados:** "Vamos começar" (botão **Importar arquivo**) ou, se há atividades mas nenhuma com HRSS, "Falta a FC" (botão **Configurar FC**).
   - **Decisão (03/11/2026):** a Forma continua sendo **Condicionamento − Fadiga de ontem** (regra do Elevate e do TrainingPeaks); o mockup mostra o mesmo dia (49 − 68 = −19). Por isso o bloco traz "Forma amanhã", que mostra o efeito do treino de hoje. Uma versão intermediária trocava o número por chamadas ("Bora pedalar", "Treino feito") quando a Forma estava perto de zero; foi descartada: o usuário quer sempre dados importantes no bloco, com a cor da zona dando o tom. Mudar para "mesmo dia" exige alterar `calcularSerieForma`, o gráfico, as faixas e a futura meta de forma da Fase 4.
2. **Condicionamento, fadiga e forma** (gráfico principal, `modules/inicio/graficoPrincipal.js`): cartão de largura total **abaixo** do par "Forma hoje" + "Semana atual" (os dois ficam lado a lado no alto; o hint das zonas abre ao lado do bloco, por isso o gráfico não divide a linha com ele). Especificação completa em "Gráfico principal do Início", abaixo.
3. **Semana atual**: segunda a domingo; por dia, uma barra de **estresse realizado** (cheia), **planejado** (tracejada, sem dados até a Fase 4) ou **descanso** (barra mínima); abaixo, "SEG 2" (hoje: "· HOJE", em laranja), o título (ex.: "Ciclismo 17,1 km"; "N atividades" se houver várias; "Descanso"; "Livre" em dia futuro sem plano) e o valor ("62 · feito" ou "~48 · plano" ou "—"). Altura proporcional ao maior valor da semana. Título: "Semana de 2 a 8 de novembro" (ou com os dois meses). Resumo: "Realizada até hoje: N" e, com plano, "Carga total prevista: M · realizada até hoje: N".
   - **Abaixo das barras** (`modules/inicio/semanaExtras.js`; regras puras em `packages/domain/src/semana.js`): (a) **resumo da semana** com quatro números (tempo, distância, atividades e carga/HRSS) e a variação (▲/▼) sobre o **mesmo trecho da semana passada** (segunda até o mesmo dia da semana); (b) **progresso da carga** ("112 de 210 (53%)", barra e "Faltam 98 para fechar o plano"; sem treino planejado, só o aviso); Na **coluna da esquerda, sob o "Forma hoje"**, dois mini-cartões (`blocoMinis`): (c) **Próximo treino** (o planejado mais cedo de hoje em diante, com esporte, zona, duração, dia e carga estimada; sem botão, porque "Planejar treino" já está no destaque) e (d) **Sequência**: semanas seguidas com treino (a semana atual conta se já houve treino; sem treino nesta semana a sequência segue viva com as anteriores) e o recorde. Os títulos dos dias quebram em até duas linhas em vez de serem cortados.
4. Linha com três cartões: **Últimas atividades** (tabela real, cinco mais recentes: data, esporte, duração, distância, FC média, HRSS), **Peso** e **Sugestão** (borda e título laranja).


### Gráfico principal do Início

**Nomes na interface (só o texto exibido muda; os ids internos `fitness`, `freshness`, `neutral`, `optimal`, `overload` continuam no código):** Fitness → **Condicionamento**; Fatigue → **Fadiga**; Form → **Forma**; zonas **Transição** (> +25), **Descansado** (+5 a +25, antes "Freshness"), **Neutra** (−10 a +5), **Ótima** (−30 a −10), **Sobrecarga** (< −30). Outros termos: "Estresse do dia", "Plano", "Projeção", "Hoje", "Realizado", "Planejado". Os rótulos das zonas vêm de `FAIXAS_FORMA` (`packages/domain/src/forma.js`).

**Regras de cálculo (inalteradas):** Forma de um dia = Condicionamento − Fadiga do dia anterior; o passado usa o realizado, hoje usa o maior entre planejado e realizado, o futuro usa o plano (`montarProjecao`, com até 28 dias de plano no Início).

**Layout:** gráfico à esquerda (~70%) e coluna lateral à direita; abaixo de 900 px a coluna vai para baixo do gráfico. Os painéis compartilham o mesmo eixo X (calendário), com divisória tracejada em **Hoje** e fundo levemente mais claro nos dias futuros. O seletor de período fica no topo: **6 sem** (28 dias realizados + até 14 de plano), **10 sem** (padrão: 42 + 28), **6 meses** (154 + 28) e **1 ano** (337 + 28); o plano mostrado vai até onde houver treinos planejados. A escolha é lembrada enquanto a página estiver aberta.

**Painéis (SVG, sem biblioteca):**
1. **Condicionamento e fadiga:** escala 0–100 (cresce de 25 em 25 se a fadiga passar de 100), com grade horizontal. Condicionamento: linha laranja `#FF5200` de 4 px com área em gradiente (28% → 0%) sob o trecho realizado. Fadiga: linha `#E5E5E5` de 2,5 px. Passado contínuo; futuro (plano) tracejado.
2. **Forma:** barras diárias a partir do zero, **coloridas pela zona do dia**; passado em barra cheia, futuro só com contorno tracejado. Linhas tracejadas sutis em +5, −10 e −30. Escala −40 a +30 (valores fora dela ficam no limite).
3. **Peso e meta:** linha amarela `#FACC15` (peso realizado, contínua) e a meta tracejada até a data-alvo; escala ajustada ao intervalo do usuário. **Sem peso cadastrado**, o painel mostra "Sem registros de peso. Cadastrar peso" (link para `#/peso`). Os dados de peso entram na Fase 5; o componente já aceita `pesos` e `metaPeso`.

| Zona | Escuro | Claro |
|---|---|---|
| Transição | `#60A5FA` | `#2563EB` |
| Descansado | `#2DD4BF` | `#0F9488` |
| Neutra | `#A3A3A3` | `#737373` |
| Ótima | `#4ADE80` | `#16A34A` |
| Sobrecarga | `#F87171` | `#DC2626` |

(São as cores do **gráfico**, em `--cg-zona-*`; o bloco "Forma hoje" mantém as suas, na tabela acima.)

**Hover/toque (área toda do gráfico):** ao passar o mouse sobre um dia aparece uma linha vertical atravessando os três painéis, um ponto em cada série e um tooltip com: **Realizado / Hoje / Planejado** + data ("qua, 28 out"), Condicionamento, Fadiga, Forma + nome da zona e **Peso** (ou **Meta** nos dias futuros, quando há meta). O tooltip vira para a esquerda depois de ~65% da largura. No celular, o toque faz o mesmo e a seleção fica até o próximo toque. O hover também destaca a barra do dia. O dia selecionado por padrão é **Hoje**: ao tirar o mouse, a coluna lateral volta a ele.

**Coluna lateral:**
- **Card do dia selecionado:** status + data, **Forma** em número grande (Anton, 56 px, com sinal) com o chip da zona na cor da zona e, abaixo, o treino do dia (o que foi feito, o que está planejado ou "Descanso"; "Treino realizado" quando só há estresse registrado, sem atividade carregada).
- **Régua de zonas:** barra vertical com os cinco segmentos nas cores das zonas, rótulos dos limites (+25, +5, −10, −30) e um marcador branco na Forma do dia selecionado (escala −40 a +40).
- **Legenda:** Condicionamento, Fadiga, Peso e "Plano e meta" (tracejado).

**Estilo:** fundo do cartão `--surface` (`#161616`), borda `--border` (`#2A2A2A`), raio 16 px, títulos em Anton maiúsculo, números com fonte tabular; no tema claro valem os equivalentes (variáveis `--cg-*` em `layout.css`). A tela **Forma** (`#/forma`) e o gráfico do **Plano** continuam com o gráfico anterior (`utils/graficoForma.js`), já com os nomes traduzidos.

**Estados vazios:** blocos sem dados mostram uma frase curta ("Disponível quando houver atividades com HRSS calculado", "Disponível quando houver registro de peso", "Disponível quando houver plano de treino"). **Decisão de interpretação:** o mockup mostra todos os blocos preenchidos; como a Fase 3 já existe, **Forma hoje**, o gráfico, a semana e as últimas atividades usam **dados reais** e só caem no estado vazio quando não há atividades com HRSS. Peso e Sugestão ficam vazios até as fases 5 e 6.

**Botão primário e itens laranja:** vale a regra de contraste já registrada (texto `--primary-contrast`: preto no escuro, branco no claro). Isso vale também para o bloco "Forma hoje", a pílula ativa e o botão "Importar arquivo".

## Logo, favicon e PWA
- Logo no cabeçalho (44 px, leva ao Início) e nas telas de acesso (login, cadastro, concluir cadastro, aguardando aprovação, bloqueado).
- O logo é a arte "NAO STROVA" (barras brancas, texto branco e laranja) em `assets/logo.png` (1024×1024); o favicon é um recorte quadrado em volta dela.
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

## Fase 3 — Gráfico de Condicionamento/Fadiga/Forma (passado)

Implemente em `domain/` o cálculo diário de Condicionamento (42 d), Fadiga (7 d) e Forma, com testes unitários. Crie a tela do gráfico com períodos selecionáveis, tooltip por dia e faixas de Forma, no estilo do Elevate.

## Fase 4 — Plano de treino e projeção (implementada)

Implemente `treinosPlanejados` com calendário semanal/mensal, criação/edição/arrastar entre dias e vínculo com a atividade realizada. Estenda o gráfico: dias futuros projetados com base no plano, em linha tracejada. Adicione a meta de forma por data.

## Peso e metas de peso (Fase 5, implementada)

Regras puras em `packages/domain/src/peso.js`; tela em `modules/peso/`; dados em `infrastructure/pesoRepo.js` (sem Function: as regras do Firestore validam).
- **Pesagem:** peso de 20 a 400 kg (vírgula aceita, arredonda a 0,1), data não futura, **uma por dia** (regravar substitui). Excluir pela tabela do histórico.
- **Indicadores:** peso atual (última pesagem), **média móvel de 7 dias** (média das pesagens dos 7 dias que terminam no dia), **tendência semanal** (média de hoje menos a de 7 dias atrás, em kg/semana), variação em 30 dias e IMC (altura da configuração vigente).
- **Meta de peso:** "chegar a X kg na data Y" (data de amanhã a 2 anos). Uma ativa por vez; a anterior vira `anterior`. Guarda o peso de hoje (`pesoInicialKg`) para o **progresso** (do peso inicial ao alvo, vale para perder e para ganhar). **Recusa** alvo que leve a **IMC abaixo de 18,5** (com altura cadastrada) e **avisa** (sem impedir) perda acima de **1% do peso por semana**.
- **Avaliação** (`avaliarMetaPeso`) pela tendência: **Atingida** (a até 0,3 kg do alvo), **No ritmo** (o peso projetado na data fica a até 0,5 kg do alvo), **Atrasada** (a tendência não leva ao alvo a tempo), **Adiantada** (passa do alvo antes da data) e **sem dados** (precisa de pesagens em duas semanas). Mostra o ritmo necessário em kg por semana.
- **Tela:** registrar peso, cinco indicadores, gráfico (pesagens, média móvel e meta tracejada; 30 dias, 90 dias, 6 meses ou tudo), cartão da meta, tabela **peso e treino por semana** (peso médio, carga HRSS e gasto dos treinos das últimas 8 semanas) e histórico. No **Início**, o painel de peso do gráfico principal e o cartão "Peso" passam a ter dados.
- **Fora desta etapa:** a sugestão de meta de peso com IA é da Fase 6.

## Fase 5 — Peso e metas

Implemente pesagens, tendência (média móvel 7 d), metas de peso e a sobreposição opcional de peso no gráfico. Mostre peso/estresse semanal e gasto calórico dos treinos.

## IA com Gemini (Fase 6, implementada)

Regras puras em `packages/domain/src/ia.js`; Functions em `apps/functions/src/modules/ia/`; telas em `modules/plano/sugestaoIa.js` e `modules/peso/sugestaoPesoIa.js`.
- **Infra:** Genkit com `@genkit-ai/google-genai`, modelo em `MODELO_GEMINI` (`ia.modelo.ts`, hoje `gemini-flash-lite-latest`, o mais barato e o que costuma ter cota gratuita), chave no **Secret Manager** (`GEMINI_API_KEY`, `defineSecret`). Região `southamerica-east1`. Saída estruturada (schema zod) validada.
- **Callables:** `sugerirTreinos`, `sugerirMetaPeso`, `decidirRascunho` e `iaChamadasRestantes`. A IA **nunca grava no plano nem na meta**: o servidor grava só o rascunho em `iaRascunhos` (status `pendente`); o app grava o plano/meta pelos caminhos de sempre (validação e regras) e depois chama `decidirRascunho` (`aceito`/`descartado`).
- **Cota:** 5 chamadas por usuário por dia, treinos e peso somados (`iaUso/{uid_yyyymmdd}`, transação). Falha do serviço **devolve** a chamada.
- **Privacidade:** a entrada da IA é um JSON de métricas resumidas (Condicionamento, Fadiga, Forma, carga semanal, meta, peso, treino médio); nunca arquivos brutos, nome, e-mail nem dados de outros usuários. A observação livre do usuário vai como dado, não como instrução.
- **Sugestão de treinos:** entrada = semanas (1–4), **dias da semana escolhidos** (1–7, de segunda a domingo), **dia do longão** (opcional, um dos escolhidos), horas por semana (1–25), esporte e observação (até 300). A IA escolhe **só do catálogo** (id, data, motivo). O código (`validarSugestaoDeTreinos`) **descarta** o que violar: modelo fora do catálogo, data fora do período ou já ocupada, mais dias ou horas que o pedido, mais de 2 treinos intensos por semana, menos de 48 h entre intensos e **aumento de carga acima de 10% por semana** (o treino que passaria disso é **trocado por um mais leve**, mantendo o dia escolhido; dias escolhidos que a IA deixou vazios são completados com treino leve; o longão recebe o treino mais longo da semana) sobre a base (média das semanas com treino nas últimas 8, com piso de 100 de HRSS por semana). Cada descarte vira um aviso. Aceitar cria `treinosPlanejados` (com a cópia dos passos).
- **Plano de peso:** os **números são calculados no código** (`planejarMetaDePeso`) e a IA só **explica** (e dá 3 dicas). Gasto = Mifflin-St Jeor × 1,2 + treino médio; ritmo limitado a **1% do peso por semana** e a **déficit de 20%** do gasto total (se o pedido passa disso, o ritmo cai e a **data é empurrada**); aviso acima de 0,5% por semana; ganho até 0,5% por semana; **recusa IMC abaixo de 18,5**. O treino sugerido converte 40% do déficit em horas, km e kcal pelo seu histórico; o resto é alimentação. Se a IA falhar, o plano sai com texto padrão e a chamada é devolvida.
- **Aviso fixo:** "Sugestão gerada por IA: revise antes de aceitar. Não substitui orientação de médico, nutricionista ou treinador."
- **Preparar o ambiente (uma vez por projeto Firebase):** `firebase functions:secrets:set GEMINI_API_KEY --project homolog` (e `production`), com a chave do Google AI Studio; o projeto precisa do plano Blaze. Depois publique as Functions.

## Fase 6 — IA com Gemini

Configure Genkit com Gemini em callables e a chave em Secret Manager. Implemente (a) sugestão de treinos para as próximas semanas e (b) sugestão de meta de peso (ritmo, tempo, distância, calorias), ambas com saída estruturada validada, como rascunho que o usuário aceita ou descarta, aplicando os limites de segurança do `docs/dominio.md` no código. Limite de chamadas por usuário/dia.

## Fase 7 — Acabamento

Ajuda do produto, push opcional, exportação de dados do usuário e vínculo treinador–atleta (somente se decidirmos fazer agora).

- **Modo plano do gráfico** (`modo: 'plano'`): (a) seletor voltado ao futuro, **2 sem** (7 dias de passado + até 14 de plano), **4 sem** (14 + 28), **8 sem** (padrão: 21 + 56) e **12 sem** (28 + até 90), porque o Plano projeta até 90 dias; (b) **sem o painel de peso**; (c) no lugar da faixa de ícones de atividade (e do painel de peso), um **painel "Estresse do dia"** abaixo da Forma, com barras cheias no realizado e tracejadas no planejado (escala de 0 ao maior estresse da janela); (d) a **meta de forma** marcada no painel de Forma: faixa de tolerância (±3), linha do alvo desde hoje, losango na data e o rótulo "Meta +10,0 · sex, 20 nov", e o tooltip diz, nos dias até a meta, "faltam X", "X acima" ou "dentro da meta"; (e) **clicar num dia** abre o editor naquela data (novo treino) ou o treino planejado que já existe nesse dia. Sem treinos planejados o subtítulo convida a planejar.
