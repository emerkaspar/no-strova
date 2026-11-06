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
- **Detalhe da atividade:** o título pode ser editado no próprio lugar (lápis ao lado do nome; em branco volta ao padrão). No mapa, a cor do trajeto segue por padrão a elevação, e pode seguir a velocidade (ritmo, na corrida) ou a FC, com legenda da escala (percentis 5–95 da atividade).
- **Lista de atividades:** linhas largas paginadas (10, 25, 50 ou 100 por página, com setas de página anterior/próxima; mudar filtro, busca ou ordem volta à página 1), uma por atividade (`lista.view.js`, estilos em `layout.css`). Cada linha é um card de duas camadas (sem cabeçalho de colunas): **camada 1** com a miniatura 64×48 (traçado ou, sem GPS, linha de elevação/FC; lida sob demanda quando a linha entra na tela, com o mesmo cache da prévia), a identificação (ícones do esporte e do calendário lado a lado com a data, título em uma linha com dica do texto inteiro, a faixa de badges e, ao fundo do bloco, a altimetria da atividade como marca d'água, que o título cobre quando é longo; lida da mesma série da miniatura), a **coluna da medalha** (60 px, reservada mesmo sem medalha) e o botão **Abrir**; a **origem** (Garmin, arquivo ou manual) é uma "orelha" no canto superior direito do card, e a Garmin é só um triângulo azul; **camada 2** com sete métricas de largura igual, cada uma com ícone e rótulo em texto: Distância, Duração, Vel. média (Ritmo na corrida), Elevação, FC média, Potência (com "est." quando estimada) e HRSS (com o aviso "sem HRSS"); "—" quando vazio. Por container query no próprio card: com 1320 px ou mais as duas camadas ficam na mesma linha (a identificação tem pelo menos 280 px); abaixo disso empilham, com métricas em 7 colunas (≥ 760 px), 4 (≥ 640 px) ou 3 (celular). A ordenação fica em um seletor "Ordenar por" e um botão de direção na barra. Todas as linhas têm o mesmo fundo; só a faixa lateral de 3 px marca o recorde (ouro, prata ou bronze). **Medalha:** o recorde não é badge, e sim um **emblema** circular de 44 px (anel de 2 px, fundo a 16% da cor, troféu no ouro e medalha na prata, no bronze e no "recente", com o nome em caixa alta embaixo e, com mais de um recorde, um marcador com a quantidade no canto); a cor da faixa lateral é a mesma. Ao passar o mouse abre o cartão de recordes. **Badges** (`badges.js`): config `BADGES` (ícone, rótulo, categoria, prioridade) em ordem de prioridade; são círculos de 20px com contorno e ícone; o vínculo (verde) e os do "Como foi?" são coloridos (sensação e esforço na cor da escala, marcas, teste de LTHR, trajeto e o convite "Como foi?" cada um com a sua) e só o "sem vínculo" fica cinza. Todos os ligados ao "Como foi?" (vínculo, sensação, esforço, marcas, teste de LTHR e trajeto) abrem o modal ao clicar. Os badges de uma atividade, por prioridade: recorde (troféu), **vínculo com treino do Plano** (sempre aparece: elo verde se vinculada, elo cinza cortado se não; o vínculo vem de `treinosPlanejados` com `status: realizado`, lido por `observarTreinosVinculados`), sensação (ou o convite "Como foi?"), **esforço percebido** (o número de 1 a 10, na cor da escala), **o que marcou o treino** (etiquetas, no tooltip), **teste de LTHR** e **trajeto de treino** (com o nome no tooltip); os últimos só aparecem quando preenchidos. A faixa tem uma linha só: até 5 aparecem; do sexto em diante, um chip "+N" abre um popover com todos. Badge novo: entrada em `BADGES` e retorno em `badgesDaAtividade`. Chips da barra: Todos, Ciclismo, Corrida (o mesmo filtro de esporte do topo) e **Com recorde** (`estadoAtividades.soRecordes`). Ao passar o mouse numa linha (só com mouse), aparece uma prévia com traçado do percurso, perfil de elevação (ou FC) e os números principais, posicionada ao lado da lista (ou abaixo da linha, sem espaço); ela lê `series/detalhe` sob demanda, uma vez por atividade.
- Sem integração com Strava na v1.
- **Sincronização com o Garmin Connect** (Personal API, só pelo botão): ver "Sincronização com o Garmin" abaixo.

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
| `users/{uid}` | `nome`, `email`, `role` (`admin`/`atleta`/`treinador`), `aprovado`, `ativo`, `recursos` (`{ ia, garmin }`: funcionalidades liberadas pelo admin; ausente = padrão IA ligada, Garmin desligado), `dataNascimento`, `aceiteLgpd`, `criadoEm` | Admin SDK; o dono edita só `nome` e `dataNascimento` |
| `configsAtleta/{id}` | `vigenteDesde`, `fcMax`, `fcRepouso`, `lthr`, `sexo`, `pesoKg`, `alturaCm` | Dono |
| `atividades/{id}` | `titulo?` (nome dado pelo usuário, até 80 caracteres; sem ele vale "Esporte · data"; gravado pelas callables `renomearAtividade` e `salvarAtividade`), `testeLthr?` (`true` quando o usuário marcou a atividade como teste de LTHR no "Como foi?"), `trajetoId?` (o trajeto de treino da atividade, em `trajetos/{id}`), `feedback?` (o "Como foi?": `sensacao` 1–5, `rpe?` 1–10, `etiquetas[]`, `dor?`, `notas?` até 500, `registradoEm`; só a callable `salvarAtividade` grava; ver "Como foi?" abaixo), `origem` (`arquivo`/`manual`), `esporte`, `inicio` (Timestamp), `data` (dia em São Paulo), `duracaoS`, `tempoMovimentoS`, `distanciaM`, `altimetriaM`, `melhor1kS`, `melhor5kS`, `melhor10kS`, `melhor20kS`, `melhor21kS`, `melhor40kS` (melhor tempo contínuo em 1, 5, 10, 20, 21,0975 e 40 km, calculado nas amostras do arquivo; nulo onde a atividade não chega à distância; `melhoresEsforcosEm` marca a versão do cálculo), `tempoZonasS` (5 números: segundos em Z1 a Z5, ou nulo sem FC ou sem configuração), `zonasEm` (versão do cálculo) e `zonasConfigId` (a configuração de FC usada nas zonas), `fcMedia`, `fcMax`, `zona`, `calorias`, `caloriasOrigem` (`arquivo`/`informada`/`estimada`), `hrss`, `hrssOrigem` (`fc`/`zona`/`manual`), `configIdUsada`, `alertas[]`, `arquivoPath`, `extensao`, `hashArquivo`, `criadoEm` | Somente callable (HRSS é autoritativo) |
| `trajetos/{id}` | trajeto de treino com nome, criado pelo usuário no "Como foi?": `userId`, `nome` (até 60 caracteres), `chave` (nome sem acento e em minúsculas, para não duplicar), `esporte`, `criadoEm`. Até 50 por usuário; cada trajeto vale para um esporte e a atividade tem no máximo um (`trajetoId`). Base da evolução por trajeto (ver "Evolução por trajeto"). Rota de referência, opcional: `rota` (`{ lat[], lon[], comprimentoM }`, até 400 pontos; listas separadas porque o Firestore não aceita lista de listas), `rotaAtividadeId`, `rotaIniM`/`rotaFimM?` (a faixa da atividade usada, em metros) e `rotaEm` | Callables `salvarAtividade` (cria o trajeto) e `definirRotaDoTrajeto` (a rota); o dono só lê |
| `metasProgressao/{id}` | meta de progressão: `userId`, `periodo` (`ano`, `mes`, `semana`), `inicio` (ano: 1º de janeiro; semana e mês: início da vigência, normalizado para a segunda-feira ou o dia 1º), `ate` (último dia da vigência, nulo = sem fim; só semana e mês), `tipo` (`distancia`, `tempo`, `elevacao`, `condicionamento`), `valorAlvo`, `esportes` (vazio = todos) | dono (validado pelas regras) |
| `conquistas/{metaId}_{períodoId}` | badge de um objetivo atingido: `userId`, `metaId`, `periodo`, `inicio` (1º dia da semana, mês ou ano atingido), `recorrente`, `metrica`, `valorAlvo`, `esportes`, `valorAtingido`, `atingidaEm`, `criadoEm`, `vista`, `notificadaEm` (nulo: base da futura notificação) | Admin SDK (dono só lê) |
| `atividades/{id}/series/fc` | série de FC reduzida (1 ponto a cada 5 s) para o gráfico do detalhe (formato antigo, mantido como reserva) | Admin SDK |
| `atividades/{id}/series/detalhe` | série reduzida (até 1500 pontos, passo ≥ 5 s) com `t`, `dist` (km), `alt` (m), `vel` (km/h), `fc`, `lat`, `lon` para o gráfico e o mapa do detalhe; `atividades.detalheEm` guarda a versão (`VERSAO_DO_DETALHE`) e a callable `calcularMelhoresEsforcos` gera a série das atividades antigas relendo o arquivo | Admin SDK |
| `estresseDiario/{uid_yyyymmdd}` | `data`, `estresse`, `kcal`, `qtdAtividades` | Trigger sobre `atividades` |
| `treinosPlanejados/{id}` | `data`, `esporte`, `duracaoMin` (inteiro, 5–1440), `zona` (Z1–Z5), `estresseEstimado` (referência gravada ao salvar), `estresseManual?` (sobrescreve a estimativa), `observacoes` (até 500), `status` (`planejado`/`realizado`/`pulado`), `atividadeId?`, `criadoEm`, e, nos treinos intervalados, `passos?` (os blocos), `nomeTreino?` e `modeloId?` | Dono (as regras validam todos os campos) |
| `treinosModelos/{id}` | `nome` (3–60), `esporte` (`ciclismo`/`corrida`), `foco`, `nivel`, `descricao?` (até 500), `passos` (1–30), `criadoEm` | Dono (as regras validam; o catálogo do sistema fica no código) |
| `metasForma/{id}` | `formaAlvo` (−60 a 60), `dataAlvo`, `ativa`, `criadoEm` | Dono (as regras validam; uma ativa por vez) |
| `calibracoes/{uid}` | `chaves`: mapa `{esporte}_{zona}` → `{ n, mediana, amostras: [{ id, data, v }] }` (HRSS por hora das atividades com FC real), `atualizadoEm` | Somente trigger/callable (o dono lê) |
| `preferencias/{uid}` | `calibracaoAtiva?` (booleano; sem documento, vale a calibração), `nivelTreinos?` (`iniciante`/`intermediario`/`avancado`), e, do wizard de perfil: `diasTreino?` (lista de 0 = segunda a 6 = domingo), `diaLongao?` (um desses dias ou `null`), `horasSemana?` (1 a 25), `esportePrincipal?` (`ciclismo`/`corrida`/`ambos`), `usoGarmin?` (`sim`/`nao`/`depois`: a escolha do passo Garmin do wizard) e `onboarding?` (`concluido`/`pulado`) | Dono (as regras só aceitam esses campos; o app grava mesclando) |
| `metasCondicionamento/{id}` | `condicionamentoAlvo` (1–250), `condicionamentoInicial?` (o Condicionamento de quando a meta foi criada; informativo), `dataAlvo`, `ativa`, `criadoEm` | Dono (as regras validam; uma ativa por vez) |
| `provas/{id}` | evento-alvo (o nome da coleção continua `provas`): `nome` (3–60), `data`, `esporte` (`ciclismo`/`corrida`/`outro`), `prioridade` (`A`/`B`/`C`), e, opcionais (nulos se vazios), `distanciaKm` (0,1–1000), `metaTempoS` (60 s a 48 h), `local` (até 80), `formaAlvo` (−60 a 60), `criadoEm` | Dono (as regras validam; testadas no emulador em `firebase/tests/`) |
| `pesagens/{id}` | `data`, `pesoKg` (20–400), `criadoEm`. **Uma por dia**: o id é `uid_yyyymmdd`, então regravar a data substitui | Dono (as regras validam campos e faixa) |
| `metasPeso/{id}` | `pesoAlvoKg` (20–400), `pesoInicialKg?` (o peso de quando a meta foi criada, base do progresso), `dataAlvo`, `status` (`ativa`/`anterior`), `criadoEm` | Dono (as regras validam; uma ativa por vez) |
| `iaRascunhos/{id}` | `tipo` (`treino`/`peso`), `entradaResumo`, `saida`, `status` (`pendente`/`aceito`/`descartado`), `criadoEm` | Somente callable |
| `iaUso/{uid_yyyymmdd}` | `chamadas` | Admin SDK |
| `vinculosTreinador/{id}` | `treinadorId`, `atletaId`, `status` | Previsto no modelo; sem UI nem regras na v1 |

Como o HRSS do Elevate usa só a FC média e o tempo em movimento, a atividade guarda `fcMedia`, `tempoMovimentoS` e `zona`; isso basta para recalcular o HRSS com qualquer configuração sem reler o arquivo (não há `fcHistograma`). O doc `configsAtleta` tem id `{uid}_{yyyymmdd da vigência}`, então salvar a mesma data substitui a configuração.

### "Como foi?" (feedback da atividade)

- **O que é:** registro subjetivo do treino, no campo `feedback` da própria atividade. Regras puras em `packages/domain/src/feedback.js` (`SENSACOES`, `ETIQUETAS`, `validarFeedback`, `resumirFeedbacks`, `fatorDeCargaPorFeedback`).
- **Sensação (obrigatória no registro):** escala de 5 níveis, 1 = Voando (foguete), 2 = Leve (balão), 3 = Normal (xícara de café), 4 = Pesado (tartaruga), 5 = Destruído (cocô). Opcionais: **esforço percebido** (RPE 1–10), **etiquetas** (`calor`, `frio`, `sono-ruim`, `perna-pesada`, `cansaco`, `dor`, `em-grupo`, `ritmo-livre`), **local da dor** (só com a etiqueta `dor`, até 40 caracteres) e **notas** (até 500).
- **Quem grava:** callable `salvarAtividade` (dono), que também troca `titulo`, `esporte`, `testeLthr` e `trajetoId` (no modal, o nome é um campo no cabeçalho e o esporte, uma lista ao lado do resumo). Dados medidos (duração, distância, FC) não são editáveis. Trocar o esporte **não** refaz HRSS nem tempo em movimento, que foram calculados na importação. `feedback: null` apaga o registro.
- **Teste de LTHR:** cartão em destaque, com chave liga/desliga. Só vale para atividade **de arquivo, com FC e de 30 minutos ou mais** (`avaliarTesteLthr`, o mesmo critério do cartão de Configuração); nas demais a chave fica desligada, com o motivo. Marcar grava `testeLthr: true` e, ao salvar, o próprio modal mostra o resultado da análise (`analisarAtividadeLthr` e `montarResultadoLthr`, módulo `configuracao/resultadoLthr.js`, compartilhado com Configuração): LTHR sugerido, FC da janela e da máxima, avisos e o botão **Criar nova vigência com este LTHR**, que pede confirmação antes de alterar o HRSS de tudo. Nada é criado sem esse clique. Em Configuração, as atividades marcadas aparecem primeiro na lista do teste (★).
- **Trajeto de treino:** o usuário escolhe um trajeto da lista (só os do esporte da atividade) ou cria um na hora ("+ Criar novo trajeto…"). Criar com um nome que já existe (sem acento nem caixa) reaproveita o trajeto. Trocar o esporte da atividade solta o trajeto que era de outro esporte. A evolução do usuário em cada trajeto fica em Treinos > Trajetos (ver "Evolução por trajeto"). Ao ligar a atividade a um trajeto **diferente do que já tinha**, o servidor detecta o trecho do trajeto nela (`trajetoTrecho`), na mesma gravação do `trajetoId`; sair do trajeto apaga o trecho. Para excluir, há a lixeira ao lado da lista no modal (callable `excluirTrajeto`, com confirmação): o trajeto sai e as atividades que o usavam ficam sem `trajetoId` nem `trajetoTrecho`. Ainda não há como renomear nem unir trajetos.
- **Quando o modal abre:** sozinho ao importar **um** arquivo, registrar uma atividade manual ou sincronizar o Garmin pelo botão da tela Atividades quando entra **exatamente uma** atividade nova (com "Pular por agora"; o servidor devolve `novasIds` em cada lote); com vários arquivos ou várias atividades novas não abre, e a atividade fica com o selo "Como foi?" na tabela. Na tabela, clicar na linha abre a atividade (detalhe) e o botão "Como foi?" ao lado do nome (ou o selo da sensação, quando já respondido) abre o modal de qualquer atividade; o detalhe tem um cartão "Como foi?" com o botão de editar.
- **Uso na IA:** `sugerirTreinos` e `sugerirPlanoAnual` leem o resumo dos últimos 14 dias (`resumirFeedbacks`: sensação média, esforço médio, último treino difícil, dor recorrente e locais, etiquetas frequentes; **sem as notas livres**) e o incluem no contexto, com uma regra para preferir treinos leves quando a sensação é ruim ou há dor recorrente. Em `sugerirTreinos`, o teto de carga semanal também cai por `fatorDeCargaPorFeedback` (0,75 com dor recorrente, 0,85 com sensação média ≥ 4, 0,92 com sensação ≥ 3,5 ou esforço ≥ 8; exige 2 registros ou mais). A sugestão sem IA (`sugestaoTreinos.js`) ainda não usa o feedback.

## Condicionamento, Fadiga e Forma (Fase 3)

Implementado em `packages/domain/src/forma.js`, replicando o Elevate (`fitness.service.ts` e o guia do Fitness Trend):

- **Estresse do dia** = soma do HRSS das atividades do dia (`estresseDiario`). Dia sem treino vale 0.
- `Condicionamento(d) = Condicionamento(d−1) + (estresse(d) − Condicionamento(d−1)) × (1 − e^(−1/42))`; Fadiga igual, com 7 no lugar de 42.
- **Forma(d) = Condicionamento(d−1) − Fadiga(d−1).** A série começa **um dia antes da primeira atividade**, com Condicionamento, Fadiga e Forma em 0 (Condicionamento inicial = 0), e segue até hoje, com decaimento nos dias sem treino.
- **Faixas de Forma** (guia do Elevate; limite inferior exclusivo):

| Faixa | Forma | Significado |
|---|---|---|
| Transição | > +25 | Pausa longa (doença, lesão, fim de temporada): Condicionamento em queda |
| Descansado | +5 a +25 | Em forma e descansado: pronto para um evento ou dias fortes |
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

### Sincronização com o Garmin
- Usa a **Garmin Connect Personal API** (gratuita, somente leitura, só os dados do dono da chave). O usuário cria a chave no Garmin Connect (validade de 30, 90, 180 dias ou 1 ano; ela é exibida uma única vez) e cola em **Configuração → Garmin Connect**. A Garmin diz no FAQ que essa API não é para aplicações comerciais com vários usuários; para abrir o app ao público, o caminho correto é o Garmin Connect Developer Program.
- Troca da chave por token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` (`Authorization: ApiKey <chave>`); o token (JWT em texto puro) vale até 24 h e não há refresh token. Listagem: `GET /activitylist-service/activities/search/activities` (`start`, `limit`, `startDate`, `endDate`). Arquivo: `GET /download-service/files/activity/{id}`, que devolve um ZIP com o .fit.
- **Chave guardada** em `users/{uid}/segredos/garmin` (`chaveCifrada`, `criadaEm`, `expiraEm`, `ultimaSincronizacao`). Nenhuma regra do Firestore libera essa subcoleção (negada por padrão); só o Admin SDK lê e escreve. A chave é cifrada com AES-256-GCM e o segredo de cifra é `GARMIN_CHAVE_CRIPTO` (Secret Manager). A data de expiração é informada pelo usuário, porque a API não a informa.
- **Callables** (`garmin/`): `garminSituacao`, `garminConectar` (valida a chave pedindo um token antes de guardar), `garminDesconectar` e `garminSincronizar`.
- **Sincronização:** só pelo botão. O usuário escolhe 30, 60, 90 ou 180 dias (máximo de 6 meses); da segunda vez em diante há também "só o que é novo desde a última vez". A callable processa **um lote de 10 atividades** e devolve `proximo` e `terminou`; o app repete a chamada e mostra o progresso. Cada atividade nova vira o arquivo `atividades/{uid}/garmin_{id}/original.fit` e passa por `processarArquivo`, o mesmo caminho do envio manual. O id `garmin_{id}` é determinístico: sincronizar de novo não duplica. Atividade igual a uma enviada à mão (mesmo início e duração) é contada como "já existia".
- Esporte que não é corrida nem ciclismo vira "outro" (`esporteDoArquivo`). Atividade sem FC não é importada (a sincronização não pergunta a zona): fica de fora e é contada no resumo.
- **Limites:** até 200 atividades por sincronização. As atividades do Garmin (campo `fonte: "garmin"`) não entram na cota de 30 por dia do envio manual.
- O formato do JSON da listagem não é documentado publicamente: o código lê `activityId` de cada item e registra um aviso no log se a lista vier com itens sem esse campo.

**Índices compostos:** `atividades` (`userId`, `data` desc), (`userId`, `esporte`, `data` desc) e (`userId`, `trajetoId`, para a evolução por trajeto); `estresseDiario` (`userId`, `data`); `treinosPlanejados` (`userId`, `data`) e (`userId`, `status`, `data`); `configsAtleta` (`userId`, `vigenteDesde` desc); `provas` (`userId`, `data`); `pesagens` (`userId`, `data`); `metasPeso` (`userId`, `status`); `iaRascunhos` (`userId`, `criadoEm` desc); `users` (`aprovado`, `criadoEm`).

## Papéis e permissões
- `admin`: aprova, bloqueia e gerencia usuários (CRUD na aba Usuários da Administração: callables `listarUsuarios`, `criarUsuarioAdmin`, `atualizarUsuarioAdmin`, `excluirUsuarioAdmin`; a exclusão apaga Auth, perfil, dados de negócio e arquivos) e libera ou retira funcionalidades por usuário (`users/{uid}.recursos`; `exigirRecurso` nas callables de IA e Garmin, e a UI esconde o que não está liberado). Não tem acesso especial a dados de saúde; para treinar, é também um `atleta` com os próprios dados.
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
- `atividades/`: `processarArquivoAtividade`, `calcularMelhoresEsforcos` (completa os melhores esforços, a série detalhada e o tempo por zona das atividades antigas), `criarAtividadeManual`, `excluirAtividade`, `recalcularHistorico`, `obterUrlArquivo`, `salvarAtividade`, `excluirTrajeto`, `definirRotaDoTrajeto` e `ajustarTrechoDaAtividade` (as duas últimas em `trajetos.functions.ts`) e a agendada `limparArquivosOrfaos`.
- `garmin/`: `garminSituacao`, `garminConectar`, `garminDesconectar`, `garminSincronizar`.
- `estresse/` (Fase 3): trigger `onAtividadeWrite` (mantém `estresseDiario`; **ignora gravações que só mudam `trajetoId`/`trajetoTrecho`**, para refazer o trecho de um trajeto não acordar o estresse, a calibração e os objetivos de cada atividade) e a callable `reconstruirEstresseDiario`.
- `calibracao/`: callable `reconstruirCalibracao` e o serviço que o gatilho `onAtividadeWrite` (e `recalcularHistorico`) usa para manter `calibracoes/{uid}`. O teste de LTHR não tem Function: roda no cliente.
- `ia/`: `sugerirTreinos`, `sugerirPlanoAnual` (rascunho da preparação com IA), `decidirRascunho`, `iaChamadasRestantes`.
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

## Medalhas de recorde, mais melhores esforços e tempo por zona (inspirado nas Peak Performances e na distribuição por zona do TrainingPeaks)

Regras puras em `packages/domain/src/esforcos.js`, `medalhas.js` e `zonasDaAtividade.js` (testadas); o servidor completa os dados em `atividades.service.ts`.

### Melhores esforços
- **Distâncias por esporte** (`ESFORCOS_POR_ESPORTE`): corrida = 1 km, 5 km, 10 km e meia maratona (21,0975 km); ciclismo = 5, 10, 20 e 40 km. Os tempos só se comparam dentro do mesmo esporte. A versão do cálculo (`VERSAO_DOS_ESFORCOS`) passou a **3** (a 2 acrescentou 1, 20, 21 e 40 km; a 3, a potência do ciclismo), então as atividades antigas são recalculadas relendo o arquivo (a lista de Atividades dispara isso sozinha uma vez por abertura do app, e há o botão "Calcular melhores esforços e zonas do histórico").

- **Organização na tela:** os recordes da lista de Atividades ficam num card só, com **abas** (`GRUPOS_DE_RECORDE`): Maiores marcas, Esforços, Potência, Clima e Carga (aba sem cartão não aparece; a última aba aberta fica lembrada no navegador). Cada cartão traz ícone, rótulo curto, valor, data (link da atividade) e, quando existir, ritmo/velocidade; o selo **Novo** marca recorde de atividade dos últimos 7 dias, e a aba ganha um ponto laranja. O botão de calcular melhores esforços e zonas é só um ícone no cabeçalho (o texto e a contagem ficam no tooltip). Até 5 cartões por fileira, com fileiras parelhas.

### Potência do ciclismo (medida ou estimada)
- Só para **ciclismo**. Regras puras em `potenciaEstimada.js` (`resumirPotencia`), calculadas junto dos melhores esforços, na importação e no recálculo do histórico.
- **Medida:** se o arquivo FIT traz `power` em pelo menos 50% das amostras, vale a medida (`potenciaOrigem: 'medida'`). **Estimada:** senão, modelo físico (`potenciaOrigem: 'estimada'`) com o peso da configuração vigente na data da atividade; sem peso, não calcula.
- **Modelo:** `P = (m·g·Crr·cosθ + m·g·senθ + ½·ρ·CdA·v² + m·a) · v / 0,975`, negativo vira 0. Massa = peso + bike (9 kg); Crr 0,005; CdA 0,32 m²; ρ 1,2 kg/m³; sem vento. Velocidade e altitude são suavizadas em 10 s; inclinação limitada a ±25% e velocidade acima de 72 km/h é descartada.
- **Gravado na atividade:** `potenciaMediaW`, `potenciaNormalizadaW` (média de 30 s elevada à 4ª), `potenciaMax5sW`/`1min`/`5min`/`20min`, `potenciaOrigem`.
- **Onde aparece:** no detalhe da atividade, na coluna "Potência" da lista (média, com "est." quando estimada) e nos recordes ("Maior potência média" e "Melhor 20 min de potência", `CAMPOS_DE_RECORDE`; os cartões só aparecem se alguma atividade do filtro tem potência, e medida e estimada concorrem juntas).
- **Precisão:** margem típica de 10 a 20% (sem vento, vácuo de pelotão e tipo de piso). Serve para tendência e comparação, não para FTP preciso.

### Temperatura e clima da atividade
- Regras puras em `clima.js`; a busca na rede fica em `clima.service.ts` (Functions), junto dos melhores esforços e da potência, na importação e no recálculo do histórico (`VERSAO_DOS_ESFORCOS` passou a **4**).
- **Temperatura:** a do **sensor** do arquivo FIT (`temperature`; média, mínima e máxima das leituras entre −30 e 60 °C) tem prioridade (`temperaturaOrigem: 'sensor'`); sem sensor vale a do serviço de clima (`'clima'`). O sensor de pulso costuma ler alto.
- **Clima:** do **Open-Meteo** (gratuito, sem chave), pelo ponto de partida e pelo horário. Média ponderada pelo tempo da atividade em cada hora: `sensacaoC`, `umidadePct`, `ventoKmh`, `chuvaMm` (soma proporcional) e `climaCodigo` (código WMO da hora em que passou mais tempo). Até 7 dias atrás usa a previsão com histórico recente; antes disso, o arquivo histórico.
- **Privacidade (LGPD):** só saem para o serviço a latitude e a longitude do ponto de partida **arredondadas a 2 casas (~1 km)** e o dia; nada que identifique o usuário.
- **Falha de rede ou atividade sem GPS:** a atividade é importada normalmente, sem clima (a busca tem limite de 3 s e não é refeita sozinha; para refazer, suba a versão do cálculo).
- **Gravado na atividade:** `temperaturaMediaC`, `temperaturaMinC`/`MaxC` (só do sensor), `temperaturaOrigem`, `sensacaoC`, `umidadePct`, `ventoKmh`, `chuvaMm`, `climaCodigo`.
- **Ícone da condição:** `iconeDoClima` escolhe o ícone pelo `climaCodigo` (sol, sol com nuvem, nublado, neblina, chuva, neve ou trovoada; sem código, sol). Ele aparece na métrica "Clima" da lista e no cartão de temperatura do detalhe; o nome da condição vai no tooltip da lista.
- **Onde aparece:** detalhe da atividade, métrica "Clima" (temperatura) do cartão na lista e os recordes "Atividade mais quente", "Atividade mais fria" e "Maior vento médio" (`recordesDeClima`; 0 °C e temperaturas negativas contam).

- **Pódio:** pela posição no ranking de cada métrica, de todo o histórico: **ouro** = a melhor atividade, **prata** = a segunda e **bronze** = a terceira. Métricas: maior distância, maior tempo, maior elevação, maior HRSS e os melhores esforços do esporte (de menor tempo).
- **Medalha recente (menor):** quando o histórico passa de **30, 60 ou 90 dias**, a melhor atividade de cada janela (últimos 30, 60 ou 90 dias, contando hoje) ganha uma medalha menor, no laranja da marca ("Melhor dos últimos 30 dias"). Só existe se há atividade mais antiga que a janela (senão seria igual ao pódio), se há **pelo menos duas** atividades com valor na janela e **só nas métricas em que a atividade não está no pódio**. Se a atividade vence mais de uma janela na mesma métrica, vale a mais longa. Na lista, é um selo pequeno sem tom na linha; só o pódio colore a linha inteira.
- Comparam só atividades do **mesmo esporte**. Uma atividade só ganha medalha se **supera pelo menos uma outra**: com duas atividades só há ouro, com três há ouro e prata, e com quatro ou mais as três medalhas (a primeira atividade não é "recorde" de nada). No empate de valor, a mais antiga fica na frente. Uma atividade pode ter várias medalhas (uma por métrica); a linha e o selo usam a mais alta do pódio.
- **Onde aparecem:** na lista de Atividades, a linha ganha a **faixa fina de 3 px** na borda esquerda e um fundo bem leve no tom da melhor medalha (ouro, prata ou bronze; a legenda fica acima da lista), e um **badge redondo** de medalha entra na faixa de badges, abaixo do título. Ao **passar o mouse** no selo (só com o mouse por cima; sem dica nativa do navegador). **Clicar em um recorde** do cartão abre o **ranking** dele (`podioDaMetrica`, no domain: as três melhores atividades, com link e a atual destacada); o cartão fica aberto enquanto o ponteiro está nele, e Esc ou um clique fora fecham abre um **cartão de recordes** com a medalha, quantos recordes pessoais a atividade tem e, para cada um, o valor (distância, tempo, subida, HRSS ou tempo e ritmo do esforço) e a medalha de cada um ("Ouro", "Prata", "Bronze" ou "Melhor dos últimos 30 dias"), sem legenda; ele **substitui a prévia do mapa** enquanto o ponteiro está no selo, e Esc ou um toque fora fecha (`modules/atividades/medalhaCartao.js`). No detalhe, uma etiqueta por recorde ("Maior distância · Ouro"). Calculadas no cliente sobre as atividades já carregadas (a lista guarda o que carregou; o detalhe aberto direto lê as atividades uma vez). Sem Function nem dado novo.

### Tempo por zona
- **Por atividade:** `tempoZonasS` = segundos em Z1 a Z5, a partir da série detalhada e das faixas de LTHR (as mesmas dos treinos) da configuração usada no HRSS (`zonasConfigId` = `configIdUsada`). Gravado ao processar o arquivo (envio manual e Garmin passam pelo mesmo caminho). Atividade **manual** ou sem FC não tem tempo por zona.
- **Atividades antigas e mudança de configuração:** a atividade fica "pendente" quando `zonasEm` não é a versão atual ou `zonasConfigId` difere de `configIdUsada`; a callable `calcularMelhoresEsforcos` completa o que faltar. Se só faltam as zonas (por exemplo, depois de **Recalcular histórico** com outro LTHR), usa a série `series/detalhe` já guardada, sem reler o arquivo.
- **Tela** (Progressão, cartão "Tempo por zona"): uma coluna por semana (4, 8, 12 ou 26 semanas; filtro de esporte) com o tempo em cada zona, a legenda com tempo e %, a divisão em **leve (Z1+Z2), moderado (Z3) e intenso (Z4+Z5)** e uma leitura no espírito da regra 80/20: *Polarizado* (≥ 75% leve, ≥ 10% intenso, ≤ 15% moderado), *Base leve* (≥ 80% leve, quase sem intenso), *Muito tempo no meio* (≥ 30% em Z3) ou *Misto*. Padrões sugeridos, ajustáveis em `leituraDaDistribuicao`.
- Atividades que ainda não têm o tempo por zona aparecem num aviso com o botão de calcular (roda sozinho uma vez por abertura do app).

## Eventos e preparação para o evento (inspirado no Annual Training Plan do TrainingPeaks)

Regras puras em `packages/domain/src/provas.js` e `planoAnual.js` (testadas); telas em `modules/plano/provas.js` e `planoAnual.js`, casos de uso em `application/provas.js` e dados em `infrastructure/provasRepo.js`. **Sem Function nova**: o cliente grava, e as regras validam. Os dois cartões (Eventos, depois Preparação para o evento) ficam no Plano, abaixo do gráfico da projeção; o botão **Novo evento**, na barra do calendário, rola até o formulário.

### Eventos
- Cada evento tem **prioridade A/B/C**: **A** é o objetivo da temporada, **B** é importante (polimento curto), **C** serve de treino. Campos opcionais: distância, **meta de tempo** (digitada como `h:mm:ss` ou `mm:ss`), local e **Forma-alvo**. A data vai de hoje a 2 anos; eventos passados somem da lista (não há histórico de eventos nesta versão).
- O evento que guia o plano é o **A mais próximo**; sem A, o B; sem B, o C (`provaDoPlano`). O usuário pode escolher outra no seletor do cartão.
- A Forma-alvo do evento pode virar a **meta de Forma** existente com um botão (`definirMetaDeFormaDaProva`, as mesmas regras e janela de 365 dias).

### Preparação para o evento (`gerarPlanoAnual`)
- **Semanas** de segunda a domingo, da semana de hoje até a semana do evento (no máximo **52**; se o evento está mais longe, cobre só as últimas 52, com aviso). Cada semana tem **fase**, **carga-alvo** (HRSS da semana), o **realizado** até hoje e marca a semana do evento.
- **Fases:** base, construção, pico e polimento. Antes do polimento, 20% das semanas são de pico, 40% de construção e o resto é base (com menos de 6 semanas não há pico; com menos de 3, nem construção).
- **Carga:** parte da **carga base** (`cargaBaseSemanal`: média das semanas com treino nas últimas 8, nunca abaixo do **piso do atleta**, `pisoDaCargaBase` em `packages/domain/src/ia.js`; sem histórico vale o piso, com aviso). O **piso** é o maior entre o do **nível** do perfil (iniciante 100, intermediário 160, avançado 220; sem nível vale intermediário) e **35 de HRSS por hora** das **horas por semana** do perfil, limitado a 400. Os valores ficam abaixo das referências comuns (~50 de TSS por hora; TrainingPeaks, faixas por nível e por horas), por prudência: o HRSS (por FC) tende a ser menor que o TSS e o piso é só o ponto de partida. O mesmo piso vale para a IA (sugestão de treinos, treino único e preparação para o evento), que usa as horas informadas no pedido ou, na falta delas, as do perfil. Sobe **8% por semana** (abaixo do limite de 10% do app), com **semana de recuperação** (70% da referência) a cada 4ª fora do pico, e o pico se mantém. O teto é **1,8 vez a base**.
- **Polimento** (contando a semana do evento): padrão A = 2 semanas, B e C = 1. Cada semana fica em fração da carga de pico: 1 semana = 50%; 2 semanas = 70% e 45%; 3 semanas = 80%, 60% e 40%. **Com Forma-alvo**, o app testa de 1 a 3 semanas e escolhe a que deixa a **Forma projetada** mais perto do alvo; se ainda ficar a mais de 5 pontos, avisa.
- **Projeção no evento** (`projetarNaProva`): espalha a carga de cada semana igualmente pelos dias futuros, mantém o realizado e calcula Condicionamento e Forma do dia do evento (a Forma usa o dia anterior, então o estresse do próprio evento não conta). É uma **estimativa**: o plano real, com os treinos de verdade, aparece no gráfico da projeção.
- Padrões escolhidos (em `REGRAS_PLANO_ANUAL`, ajustáveis): 52 semanas, 8%, 1,8×, ciclo de 4 semanas, 70%, proporções 20/40.

### Rascunho de treinos (`gerarRascunhoDoPlano`)
- Botão **"Montar rascunho das próximas 4 semanas"**: **nada é gravado** até o usuário marcar os treinos e confirmar **"Aceitar N treinos"** (lote tudo ou nada, como em "Montar minha semana"). Não passa pela IA nem usa cota: é por regras. Não entra em `iaRascunhos`.
- Usa os **dias de treino e o dia do longão** do perfil de treino (`preferencias`); sem eles, terça, quinta, sábado e domingo, com aviso. O **nível** vem de `preferencias.nivelTreinos` (padrão intermediário). Só existe para **ciclismo e corrida** (evento em "outro" usa o esporte principal do perfil) e exige configuração de FC.
- Só dias **a partir de amanhã**, sem treino planejado ou realizado, e nunca depois do evento. Na **semana do evento**, só uma **soltura** leve (Z1) na véspera, de 45 min no pedal e 30 na corrida.
- **Variedade (regra de ouro):** todo treino do rascunho é **estruturado** (aquecimento, blocos por zona, às vezes aceleradas ou ondas) e tem **nome próprio**; o mesmo treino não se repete enquanto houver outro, e o rascunho nunca traz dois dias seguidos com o mesmo nome.
  - **Qualidade:** até **duas sessões por semana**, uma **forte** (construção e pico: limiar, over-under, pirâmide, VO2máx, subidas, sprints) e uma **moderada** (tempo, progressivo, fartlek), de **focos diferentes**; na base, duas moderadas. Vêm do catálogo, do nível e do esporte; o foco usado há mais tempo vem primeiro, e nenhum modelo se repete em 6 semanas. A segunda sessão só entra com 4 ou mais dias livres e fora do nível iniciante; **semana de recuperação não tem qualidade**. No máximo 1 forte por semana, a 48 h de outro intenso e longe do longão.
  - **Rodagens leves e longões** vêm de um conjunto de treinos de base (`treinosDeBase.js`): rodagens (Sem Pressa, Passeio da Vovó, Soltando a Ferrugem, Pé de Chinelo, Pimenta nas Aceleradas, Maré Mansa, Escadinha do Bem, Fartlek Sem Compromisso) e longões (Raiz, Final Feliz, Montanha-Russa, Degraus), em **rodízio** (o usado há mais tempo volta primeiro). Em semana de recuperação, só as rodagens bem leves (e o Longão Raiz).
- **Longão = 2 horas ou mais**, nos dois esportes (`MINIMO_DO_LONGAO_MIN`; 5 h no máximo; pelo menos 1,4 vez a rodagem leve da semana). Se a carga da semana não comporta 2 h, **não há longão** e o dia vira uma rodagem comum (ou fica livre), com aviso. **Rodagem leve tem no mínimo 45 min no pedal e 30 na corrida** (`MINIMO_DA_RODAGEM_MIN`; pedal leve de 20 ou 30 minutos não existe) e no máximo 90, em múltiplos de 5; vale também para as rodagens de recuperação e para a soltura da véspera do evento.
- **Carga:** as durações seguem a meta da semana (o longão pesa 1,5 contra 1 de cada rodagem), mas **passar até 25% da meta é aceito** (`limiteSobreMeta`): o rascunho prefere variar a ficar exatamente na meta. Sem folga, ele **tira dias** (começando pelo fim da semana) em vez de encher a semana de sessões curtas, e avisa. A carga conta o que já foi feito e o que já está planejado na semana.
- Cada semana mostra "meta · rascunho · já no plano"; o rascunho pode ficar abaixo da meta quando faltam dias livres.

### Montar com IA (preparação)
- Fica no **painel único de IA** do calendário (botão **Sugerir com IA**), no horizonte **"Até o evento"** (o outro horizonte é "Próximas semanas", a sugestão de treinos por semanas); só para quem tem o recurso de IA liberado pelo administrador (a callable `sugerirPlanoAnual` confere de novo). Campo opcional **"Observação para a IA"** (até 300 caracteres, tratado como dado, não como instrução: "viajo na semana 2", "joelho sensível"). Usa **1 chamada** da cota diária de IA (a mesma das sugestões de treino) e mostra quantas restam.
- **A IA escolhe, o código confere.** O servidor monta o contexto (evento, estado atual, e para cada uma das próximas 4 semanas: fase, carga-alvo, o que já está feito ou planejado, dias livres e dia do longão) e o menu: o catálogo do esporte, até o nível do atleta e sem o teste de LTHR (com duração e estresse de cada treino), e os treinos de base (a IA escolhe a duração). A IA devolve, para cada dia livre, `{ data, origem, id, duracaoMin, motivo }` e um resumo. Tudo passa por `validarRascunhoAnualDaIa` (`packages/domain/src/iaPlanoAnual.js`), então as regras valem no código:
  - só os dias livres de treino do perfil, um treino por dia, e nada na semana do evento (o código acrescenta a **soltura da véspera**);
  - só ids que existem, do esporte e do nível do atleta; treino de base com a duração limitada (rodagem de 45 min no pedal e 30 na corrida; **longão de 2 h a 5 h**) e **longão só no dia de longão** do perfil;
  - semana de recuperação só com treino leve; polimento sem treino forte nem moderado; no máximo 2 fortes por semana, com 48 h entre eles (contando o que já está no plano);
  - a carga da semana fica no máximo **25% acima da meta**: o treino de base é encurtado até caber, e o que não cabe é descartado;
  - o mesmo treino do catálogo não se repete em menos de **14 dias** (contando o que já está no plano).
  Cada descarte ou ajuste vira um aviso em português; os dias livres que a IA deixou vazios também são avisados.
- O resultado volta **no mesmo formato do rascunho por regras** (`itens` com `entrada`, `semana` e `fase`, e `porSemana`): a revisão, as caixas de seleção e o **Aceitar N treinos** (lote tudo ou nada) são os mesmos, só com o resumo da IA e o aviso fixo de IA. **Nada entra no plano sem a confirmação.** O servidor grava o rascunho em `iaRascunhos` (`tipo: "plano-anual"`) e o app o marca como aceito ou descartado (`decidirRascunho`).
- Falha do serviço **devolve a chamada**; sem créditos no Gemini, avisa. O rascunho por regras continua disponível para quem não tem a IA.

## Vínculo planejado × realizado
- O app **sugere** o vínculo quando há um treino "planejado" e uma atividade do **mesmo dia e esporte** (sem repetir atividade); o usuário **confirma** ("Vincular") ou diz "Não foi esse" (o treino passa a "Não realizados"). Vincular grava `status: realizado` e `atividadeId` no treino; a atividade (só escrita pelo servidor) não muda.
- **Comparativo:** para treinos vinculados, tabela com estresse planejado × realizado, diferença e duração planejada → realizada.
- **Vínculo no modal "Como foi?":** `modules/atividades/treinoDoDia.js` (`criarSecaoTreinoDoDia`) lê os `treinosPlanejados` do dia da atividade (`userId` + `data`, `lerTreinosDoDia`) e o treino já vinculado (`lerTreinoDaAtividade`). Mostra os com `status: planejado` e sem `atividadeId` (mesmo esporte primeiro) com o botão "Foi este treino", que chama `vincularTreino` na hora (cliente, mesma gravação do Plano); com vínculo existente, mostra "Desvincular". Cada mudança dispara o evento `no-strova:vinculo-do-treino`, que o detalhe da atividade escuta para recarregar a comparação.
- **Comparação passo a passo (detalhe da atividade, seção "Planejado × Realizado"):** aparece quando a atividade está vinculada a um treino com `passos` e tem a série detalhada. O treino vinculado é achado por `treinosPlanejados` com `userId` e `atividadeId` (o vínculo só existe neste lado). Lógica pura em `packages/domain/src/comparacaoTreino.js` (`alinharPassos`, `avaliarPasso`, `compararPassos`, `resumirAderencia`); tela em `modules/atividades/comparacao.js`.
  - **Alinhamento:** se o `.fit` traz **uma volta por passo** (mesma quantidade de voltas e de blocos de `expandirPassos`), cada passo usa a sua volta (`origem: 'volta'`; é o caso do treino executado pelo relógio, enviado via intervals.icu). Senão, empilha as durações planejadas a partir do início da atividade (`origem: 'tempo'`), com **ajuste manual do início** (±5 s, ±30 s; só na tela, não é gravado). Passo que começa depois do fim da atividade ou que ela cobre em menos de 50% fica `nao-feito`.
  - **Passos curtos (menos de 1 min) não têm alvo de FC:** a FC leva de 30 a 60 s para reagir (e para cair), então um tiro de 30 s termina antes de ela chegar à faixa e a recuperação seguinte ainda mostra a FC do tiro. `DURACAO_MINIMA_ALVO_FC_S = 60` e `etapaTemAlvoDeFc` (`treinosEstruturados.js`): `expandirPassos` marca `alvoAberto` em todo passo com menos de 60 s (ou com `alvoAberto` explícito), derivado na leitura, então vale também para treinos já salvos. Isso tira a faixa de FC do texto do intervals.icu, do `.fit` (alvo aberto no relógio), do plano exportado, do detalhe do treino e do comparador. A **zona continua** no passo (HRSS estimado, tempo por zona, descrição); só o alvo de FC some. Todo esforço de menos de 1 min do catálogo tem `descricao` (a única orientação, coberto por teste). No comparador, o **esforço curto em Z4/Z5** recebe o veredito pelo **pico**: `pico-na-zona` se `fcPico` (maior FC do passo e dos 20 s seguintes, porque a FC reage com atraso) chegou ao mínimo da faixa da zona (`faixaDaZona`), senão `pico-abaixo`; a recuperação curta e os demais ficam `sem-alvo` ("Por esforço"). No gráfico a zona do tiro aparece só como contorno tracejado. A distância e a velocidade média de cada passo são calculadas no **instante exato** (interpolação da distância acumulada; velocidade = distância ÷ tempo), não pelas amostras vizinhas, que a 5 s são grosseiras para um tiro de 30 s. O resumo traz `tirosCurtos`, `tirosComPico`, `picosNaZona` e `consistencia` (velocidade/ritmo do começo ao fim da série: média dos 2 primeiros × 2 últimos tiros a partir de 4 tiros; primeiro × último com 2 ou 3).
  - **Veredito de cada passo** (só FC; o app não tem alvo de pace/potência): ignora a **carência** inicial (30 s ou 40% da duração, o menor) porque a FC demora a reagir; `dentro` se pelo menos 60% do tempo medido está na faixa de FC da zona (`faixaDeFcDaZona`, pela configuração de `configIdUsada`, ou a vigente na data) ou se a FC média cai na faixa; senão `abaixo`/`acima`. Passo com `alvoAberto` fica `sem-alvo` (só mostra os números); sem FC no trecho, `sem-dados`.
  - **Resumo:** "X de Y esforços dentro da zona" (só passos `principal` com alvo), FC média dos esforços e a variação de FC do primeiro ao último esforço (a partir de 3 esforços; ≥ 6 bpm é citada como deriva).
  - **Voltas:** `atividades/{id}/series/voltas` = `{ voltas: [{ iniS, fimS }] }` (segundos desde o primeiro ponto; só quando o `.fit` tem 2 ou mais voltas), escrita pelo servidor (`lerVoltas` no cliente). `VERSAO_DO_DETALHE` foi para **2** para que as atividades antigas releiam o arquivo e ganhem as voltas na primeira abertura do detalhe.

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
- **Passos:** lista de até 30 passos. Um passo pode ter **alvo de FC aberto** (`alvoAberto`), sem faixa de FC no relógio nem no detalhe (usado no teste de LTHR). **Bloco** (`aquecimento`, `principal`, `recuperacao` ou `desaquecimento`, com duração e zona Z1–Z5) ou **série** (N repetições de um esforço, com a recuperação **entre** as repetições, não depois da última). Duração de cada etapa de 10 s a 4 h; treino de 5 min a 24 h; pelo menos um esforço principal. Esforços muito curtos (menos de ~2 min) têm uma **descrição do esforço** (ex.: "máximo"), porque a FC reage devagar a eles.
- **HRSS estimado:** a **soma do HRSS de cada bloco**, na FC presumida da zona dele (`estimarEstresseEstruturado`), em vez de tratar o treino inteiro numa zona só: o TRIMP pesa muito mais os minutos em FC alta, então é mais preciso para intervalados. A calibração do histórico (por zona predominante) **não** se aplica a treinos estruturados. Sem configuração de FC, não há estimativa. Em esforços de menos de ~2 min a FC não acompanha o esforço, então a estimativa por zona tende a superestimar.
- **Zona predominante:** a zona com mais tempo no trabalho principal (empate: a mais alta). A duração do treino planejado é a soma dos passos (arredondada para cima em minutos).
- **Faixa de FC de cada zona** (em fração do LTHR, faixas de Friel): Z1 60–80%, Z2 80–89%, Z3 89–94,5%, Z4 94,5–100%, Z5 100–110% (topo limitado à FC máxima). Aparece no detalhe do treino e vai no arquivo exportado.

### Catálogo (no código, sem custo de leitura)
- **12 focos em 3 grupos** e **3 níveis** (iniciante, intermediário, avançado):
  - **Qualidade (9):** VO2máx, limiar, tempo, over-under, pirâmide, fartlek, sprints, progressivo e subidas.
  - **Leves (2), novos:** **recuperação** (zona 1; 45 a 75 min no pedal e 30 a 50 min na corrida) e **resistência** (zona 2: contínuos, com aceleradas, com ondas em zona 3, e os **longões** de 2 h ou mais, "Longão do Domingo" e "Longão com Gran Finale"). Pedal leve nunca fica abaixo de 45 min. As durações dependem do esporte: o catálogo aceita `passos` como função do esporte. Têm intensidade `baixa` e entram nas sugestões da semana.
  - **Teste de LTHR (1), novo:** "Hora da Verdade", o protocolo de 30 min de Joe Friel como treino exportável (aquecimento de 18 min, 10 + 20 min no maior ritmo sustentável, volta de 10 min), disponível nos três níveis. Os passos principais têm **alvo de FC aberto** (`alvoAberto`): o relógio não cobra uma faixa que o teste ainda vai descobrir. Só aparece na biblioteca: nunca é sugerido nem escolhido pela IA.
  - Hoje são **46 treinos no ciclismo e 47 na corrida** (antes 33 e 34; o teste de LTHR conta nos três níveis), cada um com um **nome único e divertido** (ex.: "Oi, Coração!", "Gangorra do Sofrimento", "Café com Leite"), que fica mais debochado conforme o treino aperta e é o mesmo na tela, no plano e no relógio, a **especificação técnica** e uma descrição de como executar. Os testes garantem passos válidos, nomes únicos por esporte e nível (e diferentes dos treinos de base da preparação), cobertura de recuperação e resistência em todos os níveis e as regras de aquecimento e de duração.

### Comparação com a biblioteca do TrainingPeaks (04/11/2026)
- A biblioteca de corrida do TrainingPeaks traz mais de 40 treinos estruturados em 6 categorias: **recuperação, resistência, tempo, limiar de lactato, VO2máx e capacidade anaeróbica**, com faixas de FC e esforço percebido; eles também incluem a biblioteca de Joe Friel (mais de 700 treinos). Não foi possível ler a lista de treinos deles, então a comparação é por categoria.
- O catálogo cobria tempo, limiar e VO2máx, mas **não tinha recuperação nem resistência** (só existiam nos treinos de base da preparação, sem escolha pelo usuário): agora tem. Ficam como lacunas conhecidas: **capacidade anaeróbica** de 30 a 90 s (hoje só sprints de 20 a 30 s), intervalos cruzeiro, treinos curtos de 30 min e buracos de nível (over-under sem iniciante, progressivo sem avançado). Treinos por potência (sweet spot, força em baixa cadência) e arquivos .zwo/.erg/.mrc ficam de fora: o app trabalha só com FC.

### Aquecimento e volta à calma (estudo de 04/11/2026)

**O que a literatura diz** (e o que não diz):
- Não há revisão sistemática que dê a duração ótima do aquecimento no pedal ou na corrida. O consenso dos treinadores fica em **10 a 15 minutos** para treinos com intervalos (10 para pedal fácil), com aquecimento maior só para provas curtas e intensas. Passar de 20 minutos tende a não ajudar (o efeito de "preparar o organismo" some) e gasta glicogênio.
- O que mais pesa é o **conteúdo**, não a duração: subida progressiva de intensidade e **aberturas**, 2 ou 3 esforços curtos (cerca de 20 s) no ritmo do primeiro esforço, que aceleram o consumo de oxigênio no começo do esforço seguinte (efeito de "priming"). A última abertura deve terminar uns 3 a 5 minutos antes do primeiro esforço.
- Na corrida, a recomendação é trote leve de 5 a 15 minutos, educativos (skipping e semelhantes) e **acelerações** (strides) de 10 a 20 s; quanto mais curto e intenso o treino, mais completo o aquecimento.
- **Volta à calma:** a revisão de Van Hooren e Peake (2018) concluiu que a volta à calma ativa é, em geral, ineficaz para reduzir dor muscular, acelerar a recuperação ou remover metabólitos, e que talvez ajude na transição cardiovascular e quando há outro esforço em 10 a 20 minutos. Não há duração ótima comprovada; 5 a 15 minutos é a prática comum. Alongamento estático longo antes do treino derruba a força e a potência.
- Limite do estudo: a maior parte são recomendações de treinadores e uma revisão narrativa; o número exato é uma decisão prática, não uma verdade provada.

**O que mudou no app:**
- Os treinos do catálogo tinham aquecimento de **15 min** (23 treinos), 12 ou 10 min, e volta à calma de **10 min**. Agora o aquecimento e a volta à calma são montados pelo **foco do treino** (`catalogoTreinos.js`):
  - **Moderados** (tempo, progressivo, fartlek): aquecimento de **10 min** (5 em Z1 e 5 em Z2) e volta à calma de **5 min**.
  - **Fortes** com limiar, over-under, pirâmide e subidas: 4 min em Z1, 3 em Z2 e **2 aberturas de 20 s em Z4** (70 s leves depois de cada uma e 2 min depois da última), cerca de **11 min**; volta à calma de **8 min**.
  - **VO2máx e sprints:** o mesmo, com **3 aberturas de 20 s em Z5**, cerca de **12 min**; volta à calma de 8 min.
  - As aberturas são blocos de aquecimento (não contam como esforço principal, e o tempo e o HRSS mudam pouco).
- **Treinos de base** da preparação (`treinosDeBase.js`): rodagens e longões já começam leves, então o aquecimento é de 5 a 8 min e a volta à calma de 5.
- O treino inicial do construtor segue o mesmo padrão (5 min em Z1 + 5 em Z2, volta de 8 min).
- Treinos já planejados guardam uma cópia dos passos e **não mudam**; só os novos usam o aquecimento enxuto. Pessoas com mais de 40 anos podem precisar de 2 a 3 minutos a mais (a recomendação dos treinadores); o app ainda não ajusta isso pela idade.
- **Fontes:** [guia de aquecimento e volta à calma no pedal (Roadman)](https://roadmancycling.com/blog/cycling-warm-up-cool-down-guide); [Van Hooren e Peake, 2018: precisamos de volta à calma?](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5999142/); [ciência do aquecimento (No Limits)](https://nolimitsendurance.com/the-science-of-the-warm-up/); [aquecimento antes do treino de corrida (Run Motion)](https://en.run-motion.com/how-to-warm-up-before-a-running-session-or-a-race/); [o que são strides (Coach the Run)](https://coachtherun.com/running-training/tips/what-are-running-strides/).

### Sugestão por regras (sem IA)
`sugerirTreinos` indica treinos para os **próximos 7 dias** (a partir de amanhã), em dias **sem treino** planejado ou realizado, do **nível** (escolhido pelo usuário) e do esporte:
- **No máximo 2 treinos intensos por semana** (foco de intensidade alta, ou zona predominante Z4/Z5 nos treinos já no plano) e **48 h entre eles**, contando os que já estão no plano e os dos 2 dias anteriores; **no máximo 1 moderado** (tempo, fartlek, progressivo), sem colar num intenso.
- **Forma:** abaixo de −20, no máximo 1 intenso; abaixo de −30 (sobrecarga), **nenhum**, com aviso.
- **Rotação de foco:** ganha o foco que está há mais tempo sem ser treinado (nunca treinado vale 60 dias); um foco já escolhido na mesma rodada perde pontos; um sorteio estável pela semente desempata (mesma semente, mesmas sugestões). **Não repete o mesmo modelo nas últimas 6 semanas** e respeita os recusados com "Trocar". Os treinos próprios do mesmo nível e esporte entram no sorteio.
- **Dias leves:** além dos treinos de qualidade, a semana ganha **um dia de recuperação** (no dia seguinte a um treino forte, já no plano ou sugerido) e **um de resistência** (a pelo menos 2 dias de qualquer treino forte, de preferência no fim de semana). Com a Forma em **sobrecarga** (abaixo de −30) só entra o giro de recuperação no primeiro dia livre, sem treino forte, moderado nem resistência. Treino leve pode repetir (há poucos por nível), mas prefere os não usados; os recusados com "Trocar" não voltam.
- **"Montar minha semana" (com aprovação):** a seção "Esta semana" lista as sugestões (data, perfil, resumo e motivo), cada uma com caixa de seleção, **Ver** e **Trocar**; "Adicionar N ao plano" grava os selecionados de uma vez (lote tudo ou nada), depois de confirmar; "Sugerir outras" refaz o sorteio. **Nada entra no plano sem a ação do usuário.**
- Padrões escolhidos (em `REGRAS_SUGESTAO`): 7 dias, 2 intensos, 48 h, Forma −20/−30, 42 dias sem repetir.

### Tela
- **Controles:** o **esporte** (ciclismo/corrida) fica na barra; o **nível** fica em cada bloco que o usa (Esta semana e Biblioteca), com a opção **Todos**. Cada bloco tem o seu nível na sessão (`nivelSemana`, `nivelBiblioteca`); sem escolha, vale `preferencias.nivelTreinos` (padrão intermediário). Escolher um nível específico em **Esta semana** o salva em `preferencias.nivelTreinos`; **Todos** nunca é salvo (as regras só aceitam os três níveis) e a Biblioteca não salva nada. "Todos" passa nível vazio às regras: `modelosDoCatalogo` e `sugerirTreinos` (que também inclui os treinos próprios de qualquer nível) tratam vazio como qualquer nível. **Página única, sem abas** (título "Treinos"): uma barra com o **Esporte** fica fixa no topo ao rolar (nas telas até 900 px ela rola com a página). Seções, nesta ordem: **Meus trajetos** (evolução, abaixo), **Esta semana** (sugestões), **Biblioteca** (filtro por foco no cabeçalho) e **Meus treinos** (botão "Criar treino" no cabeçalho). Cada seção é um cartão que se **recolhe e abre** pelo título; o app guarda no navegador (`localStorage`, `ns:treinos:recolhidas`) quais ficaram recolhidas, e na primeira visita tudo abre e a Biblioteca, a mais longa, passa a vir recolhida nas seguintes. O **esporte** vale para a página inteira; o **nível** (com Todos) é escolhido dentro de Esta semana e de Biblioteca; trajetos e treinos próprios não dependem dele. O detalhe e o construtor de treino abrem acima das seções. Não há índice de atalhos. Rolagens programadas (do detalhe da atividade e ao salvar um treino) usam `scrollIntoView`, não âncoras `#`, que quebrariam as rotas por hash.
- **Cartão do treino:** nome divertido (o mesmo na tela, no plano e no relógio), especificação técnica (ex.: 5 × 3 min no VO2), foco, **perfil em miniatura** (uma barra por bloco, largura = tempo, altura e cor = zona), duração, zona e HRSS estimado. **Detalhe:** números, passo a passo com a faixa de FC, **Adicionar ao plano** numa data, **Exportar para o relógio** e Editar/Excluir (próprios) ou **Duplicar e editar** (catálogo).
- **Construtor:** nome, esporte, foco, nível, descrição e passos (blocos e séries; duração digitada como "30s", "3", "2:30" ou "1h"; subir, descer e remover), com **prévia ao vivo** do perfil, da duração e do HRSS. Valida com `validarTreinoEstruturado` ao salvar (e ao ler: documentos inválidos são ignorados). Os modelos próprios ficam em `treinosModelos`.
- **Escolher da biblioteca no editor do Plano:** o formulário de treino tem o campo **"Treino da biblioteca"** (lista do **esporte** escolhido, com "Treino livre" no topo, "Meus treinos" e o catálogo agrupado por foco, cada opção com nome, nível e duração). Escolher um treino mostra o perfil e os passos, **trava a duração, a zona e o esporte** (vêm dos passos) e estima o HRSS pelos blocos; voltar para "Treino livre" destrava tudo. Ao editar um treino estruturado, a lista mostra o atual e deixa trocar por outro. Trocar o esporte (sem treino escolhido) refaz a lista.
- **No plano:** "Adicionar ao plano" cria um **treino planejado com cópia dos passos**, nome e modelo de origem (mudar ou apagar o modelo depois não altera o plano). O calendário mostra o nome ("5 × 3 min no VO2 · 47min"), e o editor mostra a estrutura (perfil e passos), trava a duração e a zona (vêm dos passos) e estima pelos blocos. "Duplicar para a próxima semana" leva a estrutura.

### Evolução por trajeto (seção "Meus trajetos", `#/treinos`)
O objetivo é ver como o usuário evolui em cada trajeto que escolheu. A seção **Meus trajetos** é a primeira da página. Segue o **esporte** da barra; o nível não se aplica. Cada trajeto do esporte é um **badge** (nome, nº de passagens, mini-tendência e a variação da velocidade desde o início); ao escolher um, o painel dele abre **logo abaixo dos badges** (e some junto se a seção for recolhida). Código: regras puras em `packages/domain` (`trechoDoTrajeto.js`, `evolucaoTrajeto.js`), `application/trajetos.js`, tela em `modules/treinos/trajetos/`. A seção tem os próprios listeners (`observarTrajetos`, `observarAtividadesComTrajeto`), criados uma vez com a página e reaproveitados a cada redesenho (as outras seções redesenham a cada mudança de dados, esta mantém o trajeto aberto, a seleção e a ordem). Como a página é única, essas leituras acontecem ao entrar em Treinos (uma consulta pequena, só das atividades com trajeto).

- **Passagem:** cada atividade ligada ao trajeto. Mede-se o **trecho do trajeto** quando ele foi detectado, e a **atividade inteira** quando não. HRSS, sensação e etiquetas são sempre da atividade inteira. Atividade sem distância e tempo não entra.
- **Trecho do trajeto (detecção automática por GPS):** uma atividade pode só passar pelo trajeto e seguir por outros caminhos. O trajeto tem uma **rota de referência** (uma atividade importada de arquivo, inteira ou só uma faixa de km, escolhida no cartão "Rota de referência"). `acharTrechoNaSerie` compara cada ponto com GPS da série detalhada com os **segmentos** da rota (tolerância de 40 m) e devolve a maior sequência na rota, no mesmo sentido, que cubra **ao menos 80%** da rota. Sentido contrário não casa; em circuito, o primeiro ponto pode ser descartado; a série tem no máximo 1500 pontos, então início e fim têm a precisão do espaço entre amostras (cerca de 100 m em 4 h de pedal).
- **Quando roda e o custo:** no servidor, **uma vez**, ao ligar a atividade a outro trajeto (na mesma gravação do `trajetoId`, com a série já lida) e ao definir ou trocar a rota (`definirRotaDoTrajeto`: lê a série de cada atividade do trajeto em lotes de 50 e só grava o que mudou). A tela nunca refaz a conta nem lê séries para a linha do tempo. A detecção em si leva alguns milissegundos por atividade (grade espacial; estimativa, não medida em produção).
- **`atividades/{id}.trajetoTrecho`:** `origem` (`auto`, `manual` ou `inteira`), `tIniS`/`tFimS` (segundos desde o início), `iniM`/`fimM` (metros na atividade), `cobertura` (0–1, só no automático), e o resumo do trecho: `duracaoS`, `tempoMovimentoS`, `distanciaM`, `altimetriaM`, `fcMedia`, `fcMax`, `tempoZonasS` (5 valores, pela configuração de FC do HRSS da atividade). `inteira` é a escolha do usuário de usar a atividade toda, sem os campos de medida. Atividade sem GPS, ou que não passa pela rota, **não tem** `trajetoTrecho` e vale inteira.
- **Ajuste à mão** (`ajustarTrechoDaAtividade`, botão "Ajustar trecho" na tabela): voltar ao **automático**, usar a **atividade inteira** ou marcar uma **faixa** (km inicial e final). Os ajustes `manual` e `inteira` **são mantidos** quando a rota é trocada.
- **Métricas** (`evolucaoTrajeto.js`): ritmo (corrida) ou velocidade (ciclismo); **eficiência aeróbica** = metros por minuto por batimento da FC média (maior é melhor, vale comparar em condições parecidas); FC média. Como o trajeto é por nome e a distância varia, compara-se por ritmo/velocidade e eficiência, não pelo tempo total, e o resumo avisa quando uma passagem destoa da distância usual (mais de 15% da mediana).
- **Painel:** resumo (passagens, melhor, início × recente — média das 3 primeiras contra as 3 últimas —, eficiência, constância, tendência por mês e distância usual); **rota de referência** (aberta enquanto não há rota, com aviso de que sem ela vale a atividade inteira); gráfico de **evolução** (ritmo/velocidade, eficiência ou FC) com linha de tendência, pódio (ouro, prata e bronze pela velocidade) e pontos tracejados para passagens com calor, frio, dor, sono ruim, perna pesada, cansaço, sensação pesada (4 ou 5) ou esforço percebido alto (8 ou mais), com filtro para ocultar calor e frio; **tabela** ordenável; e a **comparação** de duas passagens (marcadas na tabela ou clicando nos pontos): diferenças em métricas e zonas, e, lendo as séries só dessas duas, **parciais por km**, gráficos de ritmo/velocidade e FC **sobrepostos** por distância do trecho e **mapa** com a rota de referência.
- **Detalhe da atividade:** com trajeto (ciclismo ou corrida), mostra o link "Ver a evolução em …", que abre Treinos, rolando até "Meus trajetos" com o trajeto aberto (`prepararEvolucaoDoTrajeto`). Trajetos de esporte "outro" não aparecem na seção.
- **Leitura:** `observarAtividadesComTrajeto` lê só as atividades com `trajetoId` (até 3000), com o índice (`userId`, `trajetoId`). O índice novo exige `deploy:rules:*`.

### Exportação para o relógio (.fit)
- `gerarFitDoTreino` gera, no navegador, um **arquivo de treino FIT** (mensagens `file_id` do tipo workout, `workout` e `workout_step`): um passo **por tempo** para cada bloco (as séries são expandidas, então a duração bate com a do app), com **alvo de FC** em bpm da zona (da configuração do atleta; sem configuração, alvo aberto), intensidade (aquecimento, ativo, recuperação, desaquecimento) e nome do passo. Até 99 passos. O CRC e a estrutura são testados com um decodificador próprio; **não foi testado em um aparelho real**: se o aparelho recusar o arquivo, é um ponto a ajustar. Copie para a pasta de treinos do aparelho (Garmin: `NewFiles`) ou importe no Garmin Connect.
- **Botão no editor do Plano:** a janela de criar/editar treino tem **Salvar treino (.fit)**, que baixa o treino que está na tela. O treino livre vira um passo único na zona e duração do formulário.
- **Enviar treinos ao Garmin pelo intervals.icu (`intervals/`):** o login direto no Garmin pelo servidor foi tentado e **não funciona**: o Garmin responde 429 a logins vindos de IPs de nuvem (verificado no log em homolog). O caminho adotado é o intervals.icu, que tem integração oficial com o Garmin Connect ("Upload planned workouts", só a próxima semana) e API aberta. O usuário conecta o Garmin lá, gera a API Key e a cola no app; a chave fica cifrada (AES-256-GCM, segredo `GARMIN_CHAVE_CRIPTO`) em `users/{uid}/segredos/intervals`, sem regra (só Admin SDK). Exige o recurso `garmin`.
- **Callables:** `intervalsSituacao`, `intervalsConectar` (valida a chave com `GET /athlete/0` antes de guardar), `intervalsDesconectar` e `intervalsEnviarTreinos({ de, ate })` (até 62 dias e 60 treinos). O servidor lê os `treinosPlanejados` do dono, monta os passos com `montarPlanoParaExportar` e cria cada um como evento `WORKOUT` (`POST /athlete/0/events`, auth básica `API_KEY:<chave>`) com `start_date_local` `aaaa-mm-ddT00:00:00`, nome com o dia na frente (`06/11 Pedrada`), `type` Ride/Run e `external_id` `no-strova-{id}`.
- **LTHR no intervals.icu (conferência e atualização):** callables `intervalsLthr` (só leitura: `GET /athlete/0/sport-settings/{Ride|Run}`, campo `lthr`) e `intervalsAtualizarLthr` (`PUT …/sport-settings/{Ride|Run}?recalcHrZones=false`, corpo `{ lthr }`), ambas com o recurso Garmin e a chave guardada. A atualização só roda por clique do usuário, com confirmação, nos esportes cujo LTHR difere do No Strova; confere o valor devolvido pelo intervals.icu (se não confirmar, avisa) e **não recalcula as zonas** (`recalcHrZones=false`), para preservar as que o usuário ajustou lá. A chave de API precisa permitir gravar as configurações (403 vira "sem permissão"). Os nomes dos campos (`lthr`) vêm da documentação pública e de exemplos da comunidade; **confirmar na primeira execução real**. Ao salvar um LTHR novo (Configuração, teste de LTHR ou passo "Coração" do Perfil de treino), `conferirLthrNoIntervals` (`modules/configuracao/lthrIntervals.js`) compara o LTHR em vigor hoje com o do intervals.icu (mesmo que o valor salvo não tenha mudado) e oferece atualizá-lo com a mesma confirmação (só para quem tem o recurso Garmin e o intervals.icu conectado; falhas viram um aviso na mensagem de "salvo").
- **Texto dos passos (`textoDoTreinoIntervals`, domínio):** uma linha por passo, `- 10m 80-89% LTHR Aquecimento`. O alvo de FC vai em **% do LTHR** (as fronteiras das zonas, `faixaPercentualDaZona`), não em bpm, porque o texto do intervals.icu não aceita bpm absoluto; as faixas só batem com as do app se o **LTHR do intervals.icu for o mesmo** da configuração do atleta (a resposta do envio traz o LTHR para o app avisar). Passo de alvo aberto (teste de LTHR) sai sem alvo.
- **Sem duplicar:** `users/{uid}/intervalsEnvio/{treinoId}` guarda `eventoId` e `assinatura`. Treino igual é pulado; treino alterado atualiza o mesmo evento (`PUT`), ou cria de novo se o evento foi apagado no intervals.icu (404); a falha de um treino não impede os outros. Treino excluído no app não é apagado no intervals.icu.
- **Riscos conhecidos:** relatos de usuários indicam que treinos criados **pela API** do intervals.icu às vezes chegam ao Garmin só com a duração, sem o alvo; a sintaxe do texto (nome do passo depois do alvo, faixa em % LTHR) **ainda não foi validada de ponta a ponta** com o envio do app: é um ponto a conferir em homolog. Dependência de um serviço de terceiros.
- Fora do escopo desta entrega: arquivos .zwo/.erg (são por potência, e o app trabalha com FC) e a comparação do tempo em cada zona entre o planejado e a atividade feita.

## Perfil de treino (wizard)

Tela cheia em `modules/onboarding/` (`wizard.js` e `passos.js`), com regras puras em `packages/domain/src/onboarding.js` e a orquestração em `application/onboarding.js`. Reaproveita os validadores existentes (`validarDadosPerfil`, `validarConfigAtleta`, `validarPesagem`, `validarMetaPeso`) e os mesmos repositórios da Configuração e do Peso; nenhuma Function nova.
- **Quando abre:** `situacaoDoPerfilDeTreino({ preferencias, configs })` devolve `novo` (nunca viu o wizard e não tem configuração de FC: abre sozinho uma vez por carregamento), `pulado` (fechou sem concluir e ainda sem configuração: faixa "Completar perfil" no Início) ou `ok` (concluiu **ou já tem configuração**: quem já usava o app não é incomodado). O estado fica em `preferencias.onboarding` (`concluido`/`pulado`). Também abre pelo item **Perfil de treino** do menu da conta, já preenchido com o que está salvo.
- **Etapas e o que cada uma grava (ao continuar, então sair não perde o que já foi feito):** Você (`users/{uid}`: nome e nascimento) · Corpo (só em memória) · Coração (`configsAtleta`: a primeira vigência começa na atividade mais antiga, ou hoje; valores diferentes dos atuais viram nova vigência de hoje; e uma pesagem de hoje quando o peso mudou) · Nível (`preferencias`: `nivelTreinos`, `esportePrincipal`) · Semana (`preferencias`: `diasTreino`, `diaLongao`, `horasSemana`) · Meta de peso, opcional (`metasPeso`, mesma regra e avisos da tela Peso) · Pronto (`preferencias.onboarding = concluido`).
- **Passo Garmin** (`id: 'garmin'`, entre Semana e Meta; `USOS_DO_GARMIN` e `validarUsoGarmin` no domínio; `salvarPassoGarmin` grava `preferencias.usoGarmin`, e as regras do Firestore aceitam só `sim`/`nao`/`depois`). **Todos veem o passo**, mas a conexão (`intervalsConectar`) exige o recurso `garmin` liberado pelo administrador: sem ele, o passo mostra o aviso e o guia (`criarGuiaIntervals`) e a escolha fica salva; com ele, mostra o guia, o campo da chave (`criarCampoDaChave`, sem `<form>` aninhado: o wizard já é um formulário e o Enter só conecta) e, se já conectado, o status. Os componentes (`modules/plano/conexaoIntervals.js`) são os mesmos do painel "Enviar para o Garmin". O passo nunca trava o perfil: sem escolha vale "decido depois". **Lembrete** no Plano (`lembreteGarmin`, `plano.view.js`): só para quem tem o recurso, marcou `sim` ou `depois` e não conectou (consulta `intervalsSituacao`, falha na consulta = não incomoda); tem "Configurar agora" (abre o painel) e "Não uso" (grava `nao`).
- **Estimativas** (`estimarFcMax`, `estimarLthr`; padrões sugeridos): FC máxima de Tanaka, 208 − 0,7 × idade; LTHR = 90% da FC máxima (precisa ficar acima da FC de repouso). Aparecem como "estimado" e o texto aponta o teste de LTHR.
- **Rotina** (`validarRotina`): dias de 0 (segunda) a 6 (domingo), o longão é um dos dias (ou nenhum), de 1 a 25 horas por semana (o mesmo limite da sugestão com IA). A sugestão com IA do Plano abre pré-preenchida com isso.
- **Recalcular histórico** continua só por botão com confirmação; o wizard oferece o botão no resumo, nunca recalcula sozinho.

## Tela do Plano (`#/plano`)
- **Calendário** em **semana** (7 colunas) ou **mês** (6 semanas, com contagem por dia em telas pequenas), navegação ‹ › e "Hoje". Cada dia mostra as atividades realizadas (chips cheios) e os treinos planejados (tracejados), com o total do dia. "+" cria treino no dia; clicar no treino edita.
- **Arrastar e soltar** o treino planejado para outro dia muda só a data (a projeção atualiza na hora). O editor também troca a data (alternativa por teclado e para toque, onde o arrastar do navegador não funciona).
- **Excluir arrastando:** acima do calendário, na semana e no mês, há uma **lixeira**; arrastar um treino planejado até ela abre o modal de confirmação ("Excluir este treino?") e, ao confirmar, apaga o treino. A lixeira fica discreta e ganha destaque vermelho enquanto um treino é arrastado. Escolhida no lugar do clique direito porque é o mesmo gesto nas duas visões, fica visível e não depende do mouse (o clique direito não existe no celular nem no PWA instalado). Em aparelhos de toque a lixeira some (não há arrastar) e a exclusão é pelo botão **Excluir** do editor do treino, que vale para qualquer treino. Só treinos "planejados" são arrastáveis.
- **Excluir todos os treinos futuros (visão Mês):** botão abaixo do calendário, com a contagem dos treinos planejados **a partir de amanhã** (`treinosFuturos`: status "planejado" e data depois de hoje; o treino de hoje, os realizados e os pulados ficam). Passa por **dois modais**: o primeiro avisa quantos treinos serão afetados e lembra que dá para excluir um a um (lixeira ou botão Excluir do treino); o segundo é a última confirmação, em vermelho, com o botão "Excluir N treinos" e "Voltar". A contagem é refeita entre os dois, caso o plano mude. A exclusão vai em lotes de 400 (limite do Firestore: 500 por lote); cada lote é tudo ou nada.
- **Editor:** data, esporte, duração, zona, estresse informado, observações, com a **estimativa ao vivo**; ações: salvar, cancelar, **duplicar para a próxima semana**, marcar como pulado (ou voltar para planejado / desvincular) e excluir (com confirmação).
- **Página única, sem abas**, na ordem: (1) **faixa de pendências** (sugestões de vínculo e treinos não realizados; não renderiza nada sem pendência), (2) **Calendário** (largura total; o botão **Sugerir com IA** do cabeçalho abre o painel recolhível de IA, fechado por padrão), (3) **Projeção e metas** (grade de 2 colunas: o **mesmo componente do gráfico do Início**, `criarGraficoPrincipal`, em **modo plano**, à esquerda; à direita o card "Hoje", a régua de zonas e as metas, passadas por `lateralExtra`; abaixo de 900 px a coluna desce para depois do gráfico), (4) **Eventos e preparação para o evento** (lista compacta, resumo de uma linha do evento A mais próximo e a tabela de semanas recolhida; ver "Eventos e preparação para o evento"; o botão **Novo evento** do calendário abre o formulário). Barra de âncoras fixa (**Calendário · Projeção · Provas**) com destaque da seção visível (`IntersectionObserver`); as rotas antigas `#/plano/(projecao|calendario|provas|acompanhamento)` rolam até a seção. O comparativo planejado × realizado deixou de ser exibido.
- **Painel único de IA** (`criarPainelIa`, `modules/plano/sugestaoIa.js`): horizonte **Próximas semanas** (callable `sugerirTreinos`) ou **Até o evento** (callable `sugerirPlanoAnual`); as duas e o treino único do "+" (`sugerirTreinoUnico`) consomem a mesma cota diária (`iaUso`).
- **Regras do Firestore:** `treinosPlanejados` e `metasForma` validam tipos, intervalos e campos permitidos (sem campos extras) e o dono; nenhuma decisão do servidor depende desses documentos nesta fase. A fase 6 (IA) deve revalidar o que ler.

# Identidade visual

Preto, branco e laranja (~#FF5200), a partir do kit "NÃO STROVA" em `apps/web/public/` (`logo/`, `icons/`, `og/`). Implementada em `apps/web/src/styles/base.css`.

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

**Cabeçalho (um só, igual em todas as páginas, montado uma vez pelo shell; mesmo container do conteúdo: `--container-max` 1560 px e `--container-pad` 40 px em `base.css`, 16 px no celular)**
- **Grade de 2 linhas** (`grid-template-columns: auto auto minmax(0,1fr) auto auto`, card de raio 16 px e padding 18 × 28 px): logo (72 px; `logo/naostrova-logo-escuro-sem-slogan.png` no tema escuro e `-claro-sem-slogan.png` no claro; 56 px no celular) e a **faixa laranja** vertical de 3 × 64 px ocupam as duas linhas. Linha 1: data curta ("Sex, 6 nov 2026", 13 px, cinza) e saudação (21 px, Inter 700) | menu em pílula, à direita | ações. Linha 2: a **frase de brincadeira** (colunas 3 a 5, uma linha só, 13 px, itálico, cinza; a autoria, "— Beethoven", sem itálico e em cinza mais claro; trunca com reticências). Passar o mouse ou focar a frase (por teclado) abre a dica com a frase inteira e, abaixo, em fonte menor, "Disclaimer: {autor} nunca diria uma besteira dessas.". As frases ficam em `utils/frases.js` (`{ texto, autor }`, ~140 caracteres no máximo; sem políticos nem pessoas vivas). A frase é sorteada ao entrar no sistema ou atualizar a página e **só muda quando o usuário troca de página** (sem rotação por tempo), sem repetir a frase nem o autor anteriores, com fade de 300 ms (sem animação com `prefers-reduced-motion`).
- À direita: menu em pílula (**Início, Atividades, Plano, Progressão, Treinos, Peso** e **Configuração** (só o ícone de engrenagem, com dica e `aria-label`); **Administração** (abas Aprovações, Usuários e Sistema) só para admin) com o item ativo preenchido de laranja (texto preto no escuro, branco no claro; ver "Botão primário"), o botão laranja **Importar arquivo** e o avatar com a inicial, que abre um menu com **Tema claro/escuro** e **Sair** (fecha com Esc ou clique fora).
- **Importar arquivo** leva a `#/atividades` com o painel de importação aberto (se a lista já está aberta, abre o painel na hora).
- **Responsividade (container query no próprio cabeçalho):** abaixo de 900 px o menu vai para uma 3ª linha, na largura toda (a frase continua na 2ª); abaixo de 640 px o menu rola na horizontal. A engrenagem de Configuração é só ícone (com dica e `aria-label`) em todas as larguras. De 768 a 1439 px (janela) o rótulo "arquivo" sai e o botão vira "Importar".
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
   - **Clima agora no card Forma hoje** (`.hero-clima`, ao lado do número): selo com ícone, temperatura e condição e uma frase curta (`fraseDoClima` em `packages/domain/src/climaAgora.js`; chuva = "Vale o risco.", frio = "Só botar mais um casaquinho."). Dados: Open-Meteo (leitura atual) buscada direto do navegador em `infrastructure/climaAgoraRepo.js`, com o local da geolocalização do navegador arredondado a ~1 km (sem permissão, o último local que funcionou, guardado no aparelho) e cache de 20 min na sessão. Falha ou sem local: o selo não aparece. Não usa o ponto de partida das atividades (não é guardado no documento).
   - **Cartão "Dica do dia"** (terceiro mini-cartão sob a Forma, ao lado de Próximo treino e Sequência): uma dica sobre uma zona de FC, trocada a cada dia (`dicaDeZonaDoDia(hoje)` em `packages/domain/src/dicasDeZonas.js`, lista que alterna as zonas), com a faixa em bpm da zona pela configuração vigente (`faixaDeFcDaZona`); sem configuração, só o texto.
   - **Cartão "Descanso e recuperação"** (no lugar da dica, quando hoje não tem treino com status `planejado`; `descansoERecuperacao` em `packages/domain/src/descanso.js`): dias sem treino de segunda até hoje, dias seguidos sem treinar até hoje e dias seguidos treinando logo antes. "Treino" é um dia com estresse ou atividade, o mesmo critério da Sequência.
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

## Modal de confirmação
- Toda confirmação ao usuário (excluir, bloquear, recalcular, adicionar ao plano…) usa o modal do app, `confirmar()` em `apps/web/src/utils/modal.js` (estilo em `styles/modal.css`), **nunca** o `confirm()`/`alert()` do navegador.
- Tem **ícone** num círculo colorido, título em forma de pergunta curta, mensagem e dois botões. `tipo`: `perigo` (exclusão ou ação irreversível: vermelho, botão de confirmar cheio e foco inicial em "Cancelar"), `aviso` (laranja-amarelado, reversível) e `info` (laranja da marca, o padrão). O `icone` vem de `utils/icones.js`.
- Retorna uma promessa: `true` ao confirmar; `false` ao cancelar, tocar fora ou apertar Esc. Usa o `<dialog>` nativo (foco preso no modal e devolvido ao fechar, respeita o tema claro/escuro e a preferência de menos movimento).

## Logo, favicon e PWA
- Marca escrita **"NÃO STROVA"** (título, cabeçalho, login, manifesto). O nome do sistema nos ids, coleções e rotas não muda.
- Cabeçalho (leva ao Início, `alt="NÃO STROVA"`): logo `naostrova-logo-escuro-sem-slogan.png` ou `-claro-sem-slogan.png` conforme o tema. Ícone (`icons/naostrova-icone.svg`) nas telas de status (concluir cadastro, aguardando aprovação, bloqueado).
- Login/cadastro em duas colunas (apresentação com texto bem-humorado + cartão do formulário; empilha no mobile) e botão "Entrar com o Google" (Firebase Auth, `signInWithPopup`). Contas novas via Google seguem o mesmo fluxo: perfil inicial, tela "concluir cadastro" (aceite LGPD) e aprovação do admin.
- Login/cadastro usam o logo completo `logo/naostrova-logo-laranja.svg` (sobre o cartaz laranja). Há ainda as variantes `-claro` e `-escuro` (fundo transparente) e `-sem-slogan`.
- `<head>` (`apps/web/index.html`): `favicon.ico` (48×48), `icons/favicon.svg`, `apple-touch-icon`, manifesto, `theme-color` `#FF5200`, Open Graph e `twitter:card` `summary_large_image`. A URL absoluta do `og:image` usa a constante `URL_BASE_SITE` em `vite.config.js`.
- Manifesto do PWA em `public/site.webmanifest` (fundo `#0A0A0A`, tema `#FF5200`, ícones 192/512 e maskable em `/icons/`); o plugin PWA não gera outro. Os ícones vêm prontos do kit (não há mais script gerador).

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
- **IA no peso:** não há (foi removida; a IA só sugere treinos).

## Fase 5 — Peso e metas

Implemente pesagens, tendência (média móvel 7 d), metas de peso e a sobreposição opcional de peso no gráfico. Mostre peso/estresse semanal e gasto calórico dos treinos.

## IA com Gemini (Fase 6, implementada)

Regras puras em `packages/domain/src/ia.js`; Functions em `apps/functions/src/modules/ia/`; tela em `modules/plano/sugestaoIa.js`.
- **Infra:** Genkit com `@genkit-ai/google-genai`, modelo em `MODELO_GEMINI` (`ia.modelo.ts`, hoje `gemini-flash-lite-latest`, o mais barato e o que costuma ter cota gratuita), chave no **Secret Manager** (`GEMINI_API_KEY`, `defineSecret`). Região `southamerica-east1`. Saída estruturada (schema zod) validada.
- **Callables:** `sugerirTreinos`, `decidirRascunho` e `iaChamadasRestantes`. A IA **nunca grava no plano nem na meta**: o servidor grava só o rascunho em `iaRascunhos` (status `pendente`); o app grava o plano/meta pelos caminhos de sempre (validação e regras) e depois chama `decidirRascunho` (`aceito`/`descartado`).
- **Cota:** por padrão 5 chamadas por usuário por dia (`iaUso/{uid_yyyymmdd}`, transação). O **administrador define o limite** (1 a 500 ou sem limite) no cartão "Limite das sugestões de IA" da aba Sistema da página Administração, gravado em `configuracoes/ia` (regras: só admin escreve; as Functions leem com o Admin SDK). Falha do serviço **devolve** a chamada.
- **Privacidade:** a entrada da IA é um JSON de métricas resumidas (Condicionamento, Fadiga, Forma, carga semanal, meta, peso, treino médio); nunca arquivos brutos, nome, e-mail nem dados de outros usuários. A observação livre do usuário vai como dado, não como instrução.
- **Sugestão de treinos:** entrada = semanas (1–4), **dias da semana escolhidos** (1–7, de segunda a domingo), **dia do longão** (opcional, um dos escolhidos), horas por semana (1–25), esporte e observação (até 300). A IA escolhe **só do catálogo** (id, data, motivo). O código (`validarSugestaoDeTreinos`) **descarta** o que violar: modelo fora do catálogo, data fora do período ou já ocupada, mais dias ou horas que o pedido, mais de 2 treinos intensos por semana, menos de 48 h entre intensos e **aumento de carga acima de 10% por semana** (o treino que passaria disso é **trocado por um mais leve**, mantendo o dia escolhido; dias escolhidos que a IA deixou vazios são completados com treino leve; o longão recebe o treino mais longo da semana) sobre a base (média das semanas com treino nas últimas 8, com piso de 100 de HRSS por semana). Cada descarte vira um aviso. Aceitar cria `treinosPlanejados` (com a cópia dos passos).
- **Aviso fixo:** "Sugestão gerada por IA: revise antes de aceitar. Não substitui orientação de médico, nutricionista ou treinador."
- **Preparar o ambiente (uma vez por projeto Firebase):** `firebase functions:secrets:set GEMINI_API_KEY --project homolog` (e `production`), com a chave do Google AI Studio; o projeto precisa do plano Blaze. Depois publique as Functions.

## Fase 6 — IA com Gemini

Configure Genkit com Gemini em callables e a chave em Secret Manager. Implemente (a) sugestão de treinos para as próximas semanas e (b) sugestão de meta de peso (ritmo, tempo, distância, calorias), ambas com saída estruturada validada, como rascunho que o usuário aceita ou descarta, aplicando os limites de segurança do `docs/dominio.md` no código. Limite de chamadas por usuário/dia.

## Fase 7 — Acabamento

Ajuda do produto, push opcional, exportação de dados do usuário e vínculo treinador–atleta (somente se decidirmos fazer agora).

- **Modo plano do gráfico** (`modo: 'plano'`): (a) seletor voltado ao futuro, **2 sem** (7 dias de passado + até 14 de plano), **4 sem** (14 + 28), **8 sem** (padrão: 21 + 56) e **12 sem** (28 + até 90), porque o Plano projeta até 90 dias; (b) **sem o painel de peso**; (c) no lugar da faixa de ícones de atividade (e do painel de peso), um **painel "Estresse do dia"** abaixo da Forma, com barras cheias no realizado e tracejadas no planejado (escala de 0 ao maior estresse da janela); (d) a **meta de forma** marcada no painel de Forma: faixa de tolerância (±3), linha do alvo desde hoje, losango na data e o rótulo "Meta +10,0 · sex, 20 nov", e o tooltip diz, nos dias até a meta, "faltam X", "X acima" ou "dentro da meta"; (e) **clicar num dia** abre o editor naquela data (novo treino) ou o treino planejado que já existe nesse dia. Sem treinos planejados o subtítulo convida a planejar.

## Progressão (anual, mensal e semanal)
- Regras puras em `packages/domain/src/progressao.js`: `periodoDe`, `periodosAnteriores`, `serieDoPeriodo` (valores dia a dia; acumulado para distância km, tempo em movimento em horas e elevação em metros; Condicionamento vem da série de Forma), `compararProgressao` e `validarMetaDeProgressao`.
- **Metas recorrentes:** semana e mês valem para todos os períodos de `inicio` até `ate` (`instanciasDaMeta`, `metaVale`). Trocar o valor cria outra meta e fecha a anterior com `ate` = dia anterior ao período atual (ou a apaga, se começou neste mesmo período), então o histórico e as badges mantêm o alvo da época. A meta de ano vale só para o ano.
- **Badges:** `concederConquistasDoUsuario` (functions/modules/objetivos) roda no `onAtividadeWrite` (depois do estresse diário, de que o Condicionamento depende) e no `onMetaProgressaoWrite`; avalia cada instância com `avaliarObjetivo` (a mesma conta da tela) e cria `conquistas/{metaId}_{períodoId}` com `create`, então é idempotente. Um objetivo é atingido assim que o valor chega ao alvo em qualquer dia do período. `marcarConquistasComoVistas` (callable) tira o selo "Nova".
- A meta é uma reta do ponto de partida (0, ou o Condicionamento do 1º dia) até o alvo no último dia do período. Situação: atingida (valor ≥ alvo), adiantada (≥ 103% do esperado), no ritmo (≥ 97%) ou atrasada. A projeção do fim do período é o ritmo médio até agora (ano: a partir de 7 dias; mês e semana: a partir de 2).
- A tela carrega as atividades dos últimos 5 anos (até 3.000) e o estresse diário inteiro. As metas ficam em `metasProgressao`, gravadas pelo cliente e validadas em `firestore.rules`.
