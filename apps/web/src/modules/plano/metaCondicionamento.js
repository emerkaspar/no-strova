import { RITMO_MAXIMO_SEMANAL, progressoDaMetaCondicionamento } from '@no-strova/domain';
import { salvarMetaDeCondicionamento } from '../../application/plano.js';
import { excluirMetaCondicionamento } from '../../infrastructure/planoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const ROTULO_ESTADO = Object.freeze({ atinge: 'Chega lá', abaixo: 'Fica abaixo', acima: 'Fica acima' });

const comSinal = (valor, casas = 1) => `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${formatarNumero(Math.abs(valor), casas)}`;

/** Frase que explica o resultado da meta de Condicionamento e o que fazer. */
export function textoDaAvaliacaoCondicionamento(a) {
  const data = formatarData(a.dataAlvo);
  if (a.estado === 'sem-dados') return `Ainda não dá para projetar o Condicionamento em ${data}: registre atividades e planeje treinos até lá.`;
  const projetado = formatarNumero(a.condicionamentoProjetado, 1);
  const alvo = formatarNumero(a.condicionamentoAlvo, 1);
  const pontos = formatarNumero(Math.abs(a.diferenca), 1);
  if (a.estado === 'atinge') return `Com o plano atual você chega em ${data} com Condicionamento ${projetado}, dentro da meta (${alvo}).`;
  if (a.estado === 'abaixo') return `Com o plano atual você chega em ${data} com Condicionamento ${projetado}, ${pontos} pontos abaixo da meta (${alvo}). Falta carga: planeje mais treino (volume ou intensidade) até essa data.`;
  return `Com o plano atual você chega em ${data} com Condicionamento ${projetado}, ${pontos} pontos acima da meta (${alvo}). Dá para treinar um pouco menos e ainda chegar lá.`;
}

/** Linha do ritmo (pontos de Condicionamento por semana): o necessário e o que o plano entrega. */
export function textoDoRitmo(a) {
  if (a.ritmoNecessario === null || a.ritmoDoPlano === null) return null;
  return `Ritmo necessário: ${comSinal(a.ritmoNecessario)} por semana · o seu plano entrega ${comSinal(a.ritmoDoPlano)} por semana.`;
}

/**
 * Cartão da meta principal do plano, a meta de Condicionamento: formulário, resultado, ritmo, progresso e metas anteriores.
 * @param {{
 *   uid: string, hoje: string, metaAtiva: any|null, metasAnteriores: any[], avaliacao: any|null,
 *   condicionamentoAtual: number|null
 * }} p
 */
export function criarCartaoMetaCondicionamento({ uid, hoje, metaAtiva, metasAnteriores, avaliacao, condicionamentoAtual }) {
  const alvo = campo({
    id: 'metacond-alvo',
    rotulo: 'Condicionamento desejado',
    inputmode: 'decimal',
    value: metaAtiva?.condicionamentoAlvo ?? '',
    dica: `${condicionamentoAtual === null ? '' : `Hoje: ${formatarNumero(condicionamentoAtual, 1)}. `}Subir até ${RITMO_MAXIMO_SEMANAL} pontos por semana é um ritmo sustentável.`,
  });
  const dataAlvo = campo({ id: 'metacond-data', rotulo: 'Na data', tipo: 'date', value: metaAtiva?.dataAlvo ?? '', min: hoje });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, metaAtiva ? 'Trocar a meta' : 'Definir meta');

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, () =>
          salvarMetaDeCondicionamento({
            uid,
            hoje,
            entrada: { condicionamentoAlvo: alvo.input.value, dataAlvo: dataAlvo.input.value },
            metasAtivas: metaAtiva ? [metaAtiva] : [],
            condicionamentoAtual,
          }),
        );
      },
    },
    h('div', { class: 'grid' }, alvo.raiz, dataAlvo.raiz),
    mensagem.el,
    h(
      'div',
      { class: 'linha-botoes' },
      botao,
      metaAtiva
        ? h(
            'button',
            {
              class: 'btn btn-secundario',
              type: 'button',
              onClick: async () => {
                if (!confirm('Remover a meta de Condicionamento?')) return;
                try {
                  await excluirMetaCondicionamento(metaAtiva.id);
                } catch {
                  mensagem.mostrar('Não foi possível remover a meta.');
                }
              },
            },
            'Remover meta',
          )
        : null,
    ),
  );

  const progresso = metaAtiva
    ? progressoDaMetaCondicionamento({ condicionamentoAtual, condicionamentoAlvo: metaAtiva.condicionamentoAlvo })
    : null;
  const pct = progresso === null ? null : Math.round(progresso * 100);
  const ritmo = avaliacao ? textoDoRitmo(avaliacao) : null;

  const resultado = !metaAtiva
    ? h('p', { class: 'texto-secundario' }, 'A meta principal do plano: defina “chegar com Condicionamento X na data Y” e o app mostra se o plano atual chega lá e em que ritmo. O Condicionamento (a média de 42 dias do seu estresse) sobe com treino consistente.')
    : h(
        'div',
        { class: `meta-resultado meta-${avaliacao?.estado ?? 'sem-dados'}`, role: 'status' },
        avaliacao && avaliacao.estado !== 'sem-dados' ? h('span', { class: 'chip-estado' }, ROTULO_ESTADO[avaliacao.estado]) : null,
        h('p', null, avaliacao ? textoDaAvaliacaoCondicionamento(avaliacao) : ''),
        ritmo ? h('p', { class: 'meta-ritmo' }, ritmo) : null,
        avaliacao?.agressiva
          ? h(
              'p',
              { class: 'mensagem mensagem-aviso meta-agressiva' },
              `Ritmo agressivo: subir mais de ${RITMO_MAXIMO_SEMANAL} pontos de Condicionamento por semana é difícil de sustentar e leva a Forma para a sobrecarga. Considere uma data mais distante ou um alvo menor.`,
            )
          : null,
        pct === null
          ? null
          : h(
              'div',
              { class: 'meta-progresso' },
              h('p', { class: 'texto-secundario' }, `Progresso: ${pct}% do alvo (${formatarNumero(condicionamentoAtual, 1)} de ${formatarNumero(metaAtiva.condicionamentoAlvo, 1)}).`),
              h('div', { class: 'semana-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso da meta de Condicionamento' }, h('span', { style: `width:${pct}%` })),
            ),
        avaliacao && avaliacao.dias >= 0 ? h('p', { class: 'texto-secundario' }, avaliacao.dias === 0 ? 'A meta é hoje.' : `Faltam ${avaliacao.dias} dia${avaliacao.dias === 1 ? '' : 's'}.`) : null,
      );

  const anteriores = metasAnteriores.length
    ? h(
        'details',
        { class: 'meta-anteriores' },
        h('summary', null, `Metas anteriores (${metasAnteriores.length})`),
        h('ul', null, ...metasAnteriores.map((m) => h('li', null, `Condicionamento ${formatarNumero(m.condicionamentoAlvo, 1)} em ${formatarData(m.dataAlvo)}`))),
      )
    : null;

  return h('section', { class: 'card', id: 'meta-condicionamento' }, h('h2', null, 'Meta de Condicionamento'), resultado, form, anteriores);
}
