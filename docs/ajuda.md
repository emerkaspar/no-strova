# Ajuda do No Strova

## Criar conta e acessar

1. Na tela inicial, escolha **Criar conta** e informe nome, e-mail e senha (mínimo de 8 caracteres). A data de nascimento é opcional e serve para estimar o gasto calórico.
2. Marque o aceite do tratamento dos seus dados de saúde (frequência cardíaca, peso e treinos). Somente você tem acesso a eles; nem o administrador lê o seu peso.
3. Depois de criar a conta, o acesso fica em **Aguardando aprovação** até um administrador liberar. A tela atualiza sozinha quando isso acontece.
4. Se a sua conta for bloqueada, a tela mostra **Acesso bloqueado**; fale com o administrador.

Se você criou a conta mas não terminou o cadastro, o app pede para **concluir o cadastro** (nome e aceite) no próximo acesso.

## Tema

O botão **Tema claro/escuro** no topo alterna a aparência. Sem escolha, o app segue o tema do seu aparelho.

## Configuração do atleta (comece por aqui)

Em **Configuração**, cadastre a **FC máxima**, a **FC de repouso**, o **LTHR** (a maior FC média que você sustenta por cerca de 1 hora), o **sexo** (define uma constante do cálculo), o **peso** e a **altura**. Sem isso o app não calcula o HRSS.

- Cada conjunto vale **a partir de uma data**. Cada atividade é calculada com a configuração vigente no dia dela, então você pode registrar mudanças (peso, FC máxima, LTHR) sem distorcer o histórico.
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
- **Sem configuração de FC vigente nesta data:** cadastre a configuração e use *Recalcular histórico*.
- **HRSS por hora muito alto (acima de 225):** confira os dados, pode ser erro do sensor.
- **FC máxima acima da configurada:** revise a sua FC máxima.

### Detalhe, download e exclusão
Clique na data de uma atividade para ver os indicadores e o gráfico de frequência cardíaca (passe o mouse para ver cada ponto). Dali você pode **baixar o arquivo original** e **excluir** a atividade (o arquivo também é apagado).

## Para administradores

A aba **Aprovações** lista quem concluiu o cadastro e aguarda liberação. É possível buscar por nome ou e-mail, ordenar clicando no título da coluna, **Aprovar** ou **Bloquear** (com confirmação).
