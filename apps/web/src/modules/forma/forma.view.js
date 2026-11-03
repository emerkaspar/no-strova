import { FAIXAS_FORMA, faixaDaForma } from '@no-strova/domain';
import { cargaRecente, montarSerie, PERIODOS, recortarPeriodo } from '../../application/forma.js';
import { reconstruirEstresseDiario } from '../../core/functions.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarNumero, hojeIso } from '../../utils/formatters.js';
import { graficoForma } from '../../utils/graficoForma.js';
import { estadoForma } from './state.js';

const FAIXA_TEXTO = Object.freeze({
  transicao: '> +25',
  freshness: '+5 a +25',
  neutral: '−10 a +5',
  optimal: '−30 a −10',
  overload: '< −30',
});

function indicador(rotulo, valor, nota, destaque) {
  return h(
    'div',
    { class: 'indicador' },
    h('span', { class: 'indicador-rotulo' }, rotulo),
    h('strong', destaque ? { class: `valor-${destaque}` } : null, valor),
    nota ? h('small', { class: 'dica' }, nota) : null,
  );
}

export function render(raiz, sessao) {
  let dias = [];
  let carregou = false;
  let ativa = true;
  const cancelar = [];
  const mensagem = areaMensagem();
  const conteudo = h('div');

  const botoesPeriodo = PERIODOS.map((p) =>
    h(
      'button',
      {
        class: 'btn btn-secundario',
        type: 'button',
        'aria-pressed': String(p.id === estadoForma.periodo),
        onClick: () => {
          estadoForma.periodo = p.id;
          botoesPeriodo.forEach((b, i) => b.setAttribute('aria-pressed', String(PERIODOS[i].id === p.id)));
          desenhar();
        },
      },
      p.rotulo,
    ),
  );
  const barras = h('input', {
    id: 'forma-barras',
    type: 'checkbox',
    checked: estadoForma.barras,
    onChange: (e) => {
      estadoForma.barras = e.target.checked;
      desenhar();
    },
  });

  function legenda() {
    return h(
      'div',
      { class: 'legenda' },
      h(
        'ul',
        { class: 'legenda-series' },
        h('li', null, h('span', { class: 'amostra amostra-fitness' }), ' Fitness (média de 42 dias)'),
        h('li', null, h('span', { class: 'amostra amostra-fadiga' }), ' Fadiga (média de 7 dias)'),
        h('li', null, h('span', { class: 'amostra amostra-forma' }), ' Forma (Fitness − Fadiga do dia anterior)'),
      ),
      h('h3', null, 'Faixas de Forma'),
      h(
        'ul',
        { class: 'legenda-faixas' },
        ...FAIXAS_FORMA.map((f) =>
          h('li', null, h('span', { class: `amostra amostra-faixa faixa-${f.id}` }), h('strong', null, ` ${f.rotulo} (${FAIXA_TEXTO[f.id]}): `), f.descricao),
        ),
      ),
    );
  }

  function desenhar() {
    if (!carregou) {
      conteudo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
      return;
    }
    const completa = montarSerie(dias, hojeIso());
    if (completa.length === 0) {
      conteudo.replaceChildren(
        h(
          'p',
          { class: 'vazio' },
          dias.length === 0
            ? 'Ainda não há atividades. Importe seus treinos para ver o gráfico. '
            : 'Nenhuma atividade tem HRSS calculado. Cadastre a configuração de FC e recalcule o histórico. ',
          h('a', { href: dias.length === 0 ? '#/atividades' : '#/configuracao' }, dias.length === 0 ? 'Ir para Atividades' : 'Ir para Configuração'),
        ),
      );
      return;
    }

    const hoje = completa[completa.length - 1];
    const faixa = faixaDaForma(hoje.forma);
    const visivel = recortarPeriodo(completa, estadoForma.periodo);

    conteudo.replaceChildren(
      h(
        'div',
        { class: 'grid indicadores' },
        indicador('Fitness hoje', formatarNumero(hoje.fitness, 1), 'média de 42 dias'),
        indicador('Fadiga hoje', formatarNumero(hoje.fadiga, 1), 'média de 7 dias'),
        indicador('Forma hoje', formatarNumero(hoje.forma, 1), FAIXAS_FORMA.find((f) => f.id === faixa.id).rotulo, 'forma'),
        indicador('Carga em 7 dias', formatarNumero(cargaRecente(completa, 7), 0), 'soma do HRSS'),
      ),
      h('p', { class: 'mensagem' }, h('strong', null, `${faixa.rotulo}: `), faixa.descricao),
      graficoForma(visivel, { barras: estadoForma.barras }),
      legenda(),
    );
  }

  raiz.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h1', null, 'Forma'),
      h('p', { class: 'texto-secundario' }, 'Fitness, Fadiga e Forma calculados a partir do HRSS das suas atividades, no método do Elevate.'),
      h(
        'div',
        { class: 'linha-botoes', role: 'group', 'aria-label': 'Período' },
        ...botoesPeriodo,
        h('label', { class: 'opcao', for: 'forma-barras' }, barras, ' Mostrar estresse diário'),
      ),
      mensagem.el,
      conteudo,
    ),
  );
  desenhar();

  cancelar.push(
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        if (!ativa) return;
        dias = lista;
        carregou = true;
        desenhar();
        // Atividades anteriores à agregação automática: pede a reconstrução uma única vez por sessão.
        if (lista.length === 0 && !estadoForma.reconstruiu) {
          estadoForma.reconstruiu = true;
          reconstruirEstresseDiario().catch(() => {});
        }
      },
      () => mensagem.mostrar('Não foi possível carregar os dados do gráfico.'),
    ),
  );

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
