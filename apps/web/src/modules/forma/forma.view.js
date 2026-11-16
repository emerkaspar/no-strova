import { ESPORTE_PADRAO_DE_DESEMPENHO, FAIXAS_FORMA, faixaDaForma, MOTIVOS_DE_EXCLUSAO } from '@no-strova/domain';
import { ANOS_DE_HISTORICO_EF, cargaRecente, montarSerie, montarSerieComEficiencia, PERIODOS, pedirReconstrucaoSeVazio, recortarPeriodo } from '../../application/forma.js';
import { observarAtividadesParaProgressao } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { paginaTopo } from '../../utils/paginaTopo.js';
import { formatarNumero, hojeIso } from '../../utils/formatters.js';
import { graficoForma } from '../../utils/graficoForma.js';
import { estadoForma } from './state.js';

const ESPORTES_EF = Object.freeze([
  { id: 'corrida', rotulo: 'Corrida' },
  { id: 'ciclismo', rotulo: 'Ciclismo' },
  { id: '', rotulo: 'Sem EF' },
]);

/** "+3,2%" / "−1,0%" para a variação do EF entre as duas janelas. */
function textoDeVariacao(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), 1)}%`;
}

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
  let atividades = [];
  let carregou = false;
  let carregouAtividades = false;
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

  // esporte da linha de EF: o escolhido, ou (sem escolha) o ciclismo
  const esporteDoEf = () => (estadoForma.eficiencia === null ? ESPORTE_PADRAO_DE_DESEMPENHO : estadoForma.eficiencia);

  const botoesEf = ESPORTES_EF.map((e) =>
    h('button', { class: 'btn btn-secundario', type: 'button', 'data-esporte': e.id, onClick: () => {
      estadoForma.eficiencia = e.id;
      desenhar();
    } }, e.rotulo),
  );
  const atualizarBotoesEf = () => botoesEf.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.esporte === esporteDoEf())));

  function notaDoEf(ef, esporte) {
    const fora = Object.entries(ef.excluidas).filter(([, n]) => n > 0);
    const nome = esporte === 'corrida' ? 'corrida' : 'pedal';
    return h(
      'p',
      { class: 'texto-secundario' },
      `Eficiência aeróbica (EF): metros por minuto para cada batimento, média dos últimos 28 dias, ponderada pelo tempo. Sobe quando você anda mais rápido com a mesma FC. Conta ${ef.treinos} treino${ef.treinos === 1 ? '' : 's'} de ${nome} comparáve${ef.treinos === 1 ? 'l' : 'is'} (leves, sem tiros, de 20 min e 3 km ou mais, em terreno pouco ondulado).`,
      fora.length ? ` Ficaram de fora: ${fora.map(([m, n]) => `${n} (${(MOTIVOS_DE_EXCLUSAO[m] ?? m).toLowerCase()})`).join('; ')}.` : '',
      ' ',
      h('a', { href: '#/progressao/desempenho' }, 'Ver o painel de Desempenho'),
    );
  }

  function legenda(comEf) {
    return h(
      'div',
      { class: 'legenda' },
      h(
        'ul',
        { class: 'legenda-series' },
        h('li', null, h('span', { class: 'amostra amostra-fitness' }), ' Condicionamento (média de 42 dias)'),
        h('li', null, h('span', { class: 'amostra amostra-fadiga' }), ' Fadiga (média de 7 dias)'),
        h('li', null, h('span', { class: 'amostra amostra-forma' }), ' Forma (Condicionamento − Fadiga do dia anterior)'),
        comEf ? h('li', null, h('span', { class: 'amostra amostra-eficiencia' }), ' Eficiência aeróbica, EF (eixo da direita)') : null,
      ),
      h('h3', null, 'Faixas de Forma'),
      h(
        'ul',
        { class: 'legenda-faixas' },
        ...FAIXAS_FORMA.map((f) =>
          h('li', null, h('span', { class: `amostra amostra-faixa faixa-${f.id}` }), h('strong', null, ` ${f.rotulo} (${f.intervalo}): `), f.descricao),
        ),
      ),
    );
  }

  function desenhar() {
    if (!carregou) {
      conteudo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
      return;
    }
    const base = montarSerie(dias, hojeIso());
    if (base.length === 0) {
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

    const esporteEf = esporteDoEf();
    const ef = esporteEf && carregouAtividades ? montarSerieComEficiencia(base, atividades, esporteEf, hojeIso()) : null;
    const completa = ef ? ef.serie : base;
    atualizarBotoesEf();

    const hoje = completa[completa.length - 1];
    const faixa = faixaDaForma(hoje.forma);
    const visivel = recortarPeriodo(completa, estadoForma.periodo);
    const efHoje = ef?.resumo?.eficiencia;
    const variacaoEf = efHoje ? textoDeVariacao(efHoje.variacaoPct) : null;

    conteudo.replaceChildren(
      h(
        'div',
        { class: 'grid indicadores' },
        indicador('Condicionamento hoje', formatarNumero(hoje.fitness, 1), 'média de 42 dias'),
        indicador('Fadiga hoje', formatarNumero(hoje.fadiga, 1), 'média de 7 dias'),
        indicador('Forma hoje', formatarNumero(hoje.forma, 1), FAIXAS_FORMA.find((f) => f.id === faixa.id).rotulo, 'forma'),
        indicador('Carga em 7 dias', formatarNumero(cargaRecente(completa, 7), 0), 'soma do HRSS'),
        ef
          ? indicador('Eficiência (EF) · 28 dias', efHoje?.recente ? formatarNumero(efHoje.recente, 2) : '—', variacaoEf ? `${variacaoEf} contra os 28 dias anteriores` : 'sem treino comparável para comparar')
          : null,
      ),
      h('p', { class: 'mensagem' }, h('strong', null, `${faixa.rotulo}: `), faixa.descricao),
      graficoForma(visivel, { barras: estadoForma.barras, eficiencia: Boolean(ef) }),
      legenda(Boolean(ef)),
      // replaceChildren escreve "null" na tela se receber null: o item opcional entra só quando existe
      ...(ef ? [notaDoEf(ef, esporteEf)] : []),
    );
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'pilha' },
      paginaTopo({ icone: 'medidor', titulo: 'Forma', subtitulo: 'Condicionamento, Fadiga e Forma calculados a partir do HRSS das suas atividades, no método do Elevate.' }),
      h(
        'section',
        { class: 'card' },
        h(
          'div',
          { class: 'linha-botoes', role: 'group', 'aria-label': 'Período' },
          ...botoesPeriodo,
          h('label', { class: 'opcao', for: 'forma-barras' }, barras, ' Mostrar estresse diário'),
        ),
        h('div', { class: 'linha-botoes', role: 'group', 'aria-label': 'Esporte da eficiência aeróbica' }, h('span', { class: 'prog-rotulo' }, 'Eficiência (EF):'), ...botoesEf),
        mensagem.el,
        conteudo,
      ),
    ),
  );
  desenhar();

  const desde = `${Number(hojeIso().slice(0, 4)) - ANOS_DE_HISTORICO_EF}-01-01`;
  cancelar.push(
    observarAtividadesParaProgressao(
      sessao.uid,
      desde,
      (lista) => {
        if (!ativa) return;
        atividades = lista;
        carregouAtividades = true;
        desenhar();
      },
      () => {
        // sem as atividades o gráfico segue sem a linha de EF
        carregouAtividades = false;
      },
    ),
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        if (!ativa) return;
        dias = lista;
        carregou = true;
        desenhar();
        pedirReconstrucaoSeVazio(lista);
      },
      () => mensagem.mostrar('Não foi possível carregar os dados do gráfico.'),
    ),
  );

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
