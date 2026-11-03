# Ajuda do No Strova

## Criar conta e acessar

1. Na tela inicial, escolha **Criar conta** e informe nome, e-mail e senha (mínimo de 8 caracteres). A data de nascimento é opcional e serve para estimar o gasto calórico.
2. Marque o aceite do tratamento dos seus dados de saúde (frequência cardíaca, peso e treinos). Somente você tem acesso a eles; nem o administrador lê o seu peso.
3. Depois de criar a conta, o acesso fica em **Aguardando aprovação** até um administrador liberar. A tela atualiza sozinha quando isso acontece.
4. Se a sua conta for bloqueada, a tela mostra **Acesso bloqueado**; fale com o administrador.

Se você criou a conta mas não terminou o cadastro, o app pede para **concluir o cadastro** (nome e aceite) no próximo acesso.

## Navegação

- **Cabeçalho (todas as telas):** o logo (leva ao Início), a data por extenso, a saudação ("Bom dia", "Boa tarde" ou "Boa noite") e, à direita, o menu **Início, Atividades, Plano, Peso e Configuração** (**Aprovações** só aparece para administradores), o botão laranja **Importar arquivo** e o círculo com a sua inicial, que abre o menu da conta (tema e **Sair**). Em telas pequenas o menu vira uma **barra de abas no rodapé**.
- **Importar arquivo:** abre a tela de Atividades já com o painel de importação aberto.
- **Plano** é onde você planeja os treinos (veja abaixo). **Peso** ainda está em construção e mostra só um aviso.

## Início

- **Forma hoje (bloco colorido):** o número grande é a sua Forma de hoje (Fitness menos Fadiga **de ontem**, por isso um treino feito hoje só pesa amanhã). A **cor do bloco muda com a zona**: laranja na zona ótima, verde na fresca, cinza na neutra, azul na de transição e vermelho na de sobrecarga. Passe o mouse (ou toque) no **nome da zona** ou no **número** para ver uma explicação das cinco zonas, com a sua destacada e uma frase de incentivo; o cartão abre ao lado do bloco. Quatro dados menores completam: **Fitness** (com a variação em 7 dias), **Fadiga**, **Forma amanhã** (já com o treino de hoje) e **Último treino**. O botão **Planejar treino** leva ao Plano.
- **Carga e fadiga:** Fitness e Fadiga dos últimos dias, com a marca "Hoje". Com treinos planejados, os próximos 14 dias aparecem tracejados (a projeção do plano).
- **Semana atual:** de segunda a domingo, uma coluna por dia com o estresse (HRSS) realizado (barra cheia). Dias sem treino mostram uma barrinha mínima. Os treinos planejados aparecem em barra tracejada, com o estresse estimado ("~48 · plano").
- **Últimas atividades:** as cinco mais recentes, com data, esporte, duração, distância, FC média e HRSS.
- **Peso e Sugestão:** mostram "disponível quando houver…" até as telas de peso e de plano existirem.

## Tema

O app abre no **tema escuro**. Para alternar, clique no **círculo com a sua inicial** (canto superior direito) e escolha **Tema claro** ou **Tema escuro**; o app lembra a sua escolha neste aparelho.

## Configuração do atleta (comece por aqui)

Em **Configuração**, cadastre a **FC máxima**, a **FC de repouso**, o **LTHR** (a maior FC média que você sustenta por cerca de 1 hora), o **sexo** (define uma constante do cálculo), o **peso** e a **altura**. Sem isso o app não calcula o HRSS.

- Cada conjunto vale **a partir de uma data**. **Atenção:** atividades anteriores à data da sua configuração mais antiga ficam **sem HRSS**, porque não há configuração vigente nelas. Na primeira configuração, use uma data **anterior à sua atividade mais antiga** (o app já sugere essa data e avisa antes de salvar uma vigência que deixaria atividades descobertas). Cada atividade é calculada com a configuração vigente no dia dela, então você pode registrar mudanças (peso, FC máxima, LTHR) sem distorcer o histórico.
- Em **Seus dados** você edita o nome e a data de nascimento. A data de nascimento é usada para estimar as calorias.
- Ao mudar a configuração, use **Recalcular histórico** (com confirmação) para aplicar às atividades já registradas. O estresse que você digitou manualmente nunca é alterado.

## Atividades

### Importar arquivo
Em **Atividades → Importar arquivo**, escolha arquivos **.fit, .gpx ou .tcx** de até 15 MB (pode selecionar vários). O app lê data, duração, distância, subida, FC e calorias, e calcula o **HRSS**.

- O esporte é detectado pelo arquivo; você pode escolher outro antes de enviar.
- Se o mesmo arquivo (ou uma atividade com o mesmo início e duração) já foi importado, o app avisa e não duplica.
- Se o arquivo **não tem frequência cardíaca**, o app pede a **zona predominante** do treino (Z1 a Z5) e estima o estresse por ela.
- Limite de 30 atividades por dia.

### Registrar manualmente
Em **Atividades → Registrar manualmente**, informe esporte, data, duração e, no mínimo, **uma** destas: FC média, zona predominante ou HRSS. Distância, subida e calorias são opcionais.

### O que é o HRSS
É a carga do treino com base na frequência cardíaca, no método do Elevate: uma hora na FC do seu limiar (LTHR) vale 100 pontos. Em cada atividade o app mostra de onde veio o valor: **calculado pela FC média**, **estimado pela zona** ou **informado por você**.

### Calorias
Usa as calorias do arquivo quando existem. Sem elas, o app **estima** pela FC, peso, idade e sexo (fórmula de Keytel) e marca como **estimadas**; isso exige data de nascimento e configuração cadastradas.

### Avisos na atividade
- **Sem configuração de FC vigente nesta data:** em Configuração, ajuste o "Vigente desde" da configuração mais antiga para uma data anterior à atividade e use *Recalcular histórico*. A lista de Atividades mostra um aviso quando isso acontece, e o recálculo informa quantas ainda ficaram sem HRSS.
- **HRSS por hora muito alto (acima de 225):** confira os dados, pode ser erro do sensor.
- **FC máxima acima da configurada:** revise a sua FC máxima.

### Detalhe, download e exclusão
Clique na data de uma atividade para ver os indicadores e o gráfico de frequência cardíaca (passe o mouse para ver cada ponto). Dali você pode **baixar o arquivo original** e **excluir** a atividade (o arquivo também é apagado).

## Forma (Fitness, Fadiga e Forma)

A tela **Forma** (abra pelo link **Ver gráfico completo** do Início) mostra como o seu treino se acumula, a partir do HRSS das atividades:

- **Fitness:** a carga acumulada nos últimos ~42 dias. Sobe com treino consistente.
- **Fadiga:** a carga dos últimos ~7 dias. Sobe rápido com treino duro e cai rápido com descanso.
- **Forma:** Fitness menos Fadiga **do dia anterior**. Valores negativos indicam que você está treinando forte; positivos, que está descansado.

A faixa em que a Forma está aparece em destaque: **Transição** (acima de +25, pausa longa), **Freshness** (+5 a +25, pronto para competir), **Neutral** (−10 a +5, recuperação), **Optimal** (−30 a −10, bom para construir Fitness) e **Overload** (abaixo de −30, descanse).

Escolha o período (30 dias, 90 dias, 6 meses, 1 ano ou tudo) e passe o mouse no gráfico para ver cada dia. A opção **Mostrar estresse diário** liga e desliga as barras de HRSS. Os dias sem treino contam como estresse zero. O gráfico só aparece depois que há atividades com HRSS calculado.

## Plano de treino

Em **Plano** você organiza os treinos que ainda vai fazer e vê, na hora, como eles mexem no Fitness, na Fadiga e na Forma.

- **Criar um treino:** clique em **Novo treino** (ou no **+** de um dia), escolha a data, o esporte, a **duração** e a **zona predominante** (Z1 a Z5). O app **estima o estresse** (HRSS) pela zona e pela duração; se você já sabe o valor, informe em "Estresse informado". Para a estimativa funcionar, cadastre a configuração de FC em Configuração.
- **Mudar de dia:** arraste o treino para outro dia do calendário. No celular, abra o treino e troque a data.
- **Semana ou mês:** use os botões no topo; ‹ e › navegam e **Hoje** volta ao período atual.
- **Duplicar:** no treino, **Duplicar para a próxima semana**. Você também pode **marcar como pulado** ou **excluir**.
- **Projeção:** o gráfico segue nos dias futuros em linha tracejada. Os dias passados usam só o que você realmente fez; **hoje** usa o maior entre o planejado e o feito; os dias futuros usam o planejado.
- **Meta de forma:** informe "chegar com Forma X na data Y". O app mostra se o plano atual **chega lá** (até 3 pontos de diferença), **fica abaixo** (falta descanso: alivie a carga antes da data) ou **fica acima** (dá para treinar mais). Só há uma meta ativa por vez.
- **Treino que passou sem ser feito:** aparece em "Não realizados" e deixa de contar na projeção; **reagende para hoje** ou **pule**.
- **Vincular ao que você fez:** se há uma atividade do mesmo dia e esporte, o app sugere o vínculo; confirme em **Vincular**. Os treinos vinculados entram no comparativo **planejado × realizado**.

## Para administradores

A aba **Aprovações** lista quem concluiu o cadastro e aguarda liberação. É possível buscar por nome ou e-mail, ordenar clicando no título da coluna, **Aprovar** ou **Bloquear** (com confirmação).
