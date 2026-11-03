import {
  estresseDoTreino,
  gradeDoMes,
  inicioDaSemana,
  NOMES_DIA,
  ROTULOS_DIA,
  somarDias,
  treinoNaoRealizado,
} from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarNumero } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

/** Id do treino sendo arrastado (HTML5 drag and drop). */
let arrastandoId = null;

const ROTULO_ESTADO = { feito: 'feito', pulado: 'pulado', atrasado: 'não realizado', planejado: 'plano' };

function estadoDoTreino(t, hoje) {
  if (t.status === 'realizado') return 'feito';
  if (t.status === 'pulado') return 'pulado';
  return treinoNaoRealizado(t, hoje) ? 'atrasado' : 'planejado';
}

function chipTreino(t, { hoje, configs, calibracao, aoEditar }) {
  const estado = estadoDoTreino(t, hoje);
  const titulo = `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.duracaoMin}min · ${t.zona}`;
  const botao = h(
    'button',
    {
      type: 'button',
      class: `chip-treino chip-${estado}`,
      draggable: t.status === 'planejado',
      'data-id': t.id,
      title: t.observacoes ? `${titulo}\n${t.observacoes}` : titulo,
      onClick: () => aoEditar(t),
    },
    h('span', { class: 'chip-titulo' }, titulo),
    h('span', { class: 'chip-sub' }, `~${formatarNumero(estresseDoTreino(t, configs, calibracao), 0)} · ${ROTULO_ESTADO[estado]}`),
  );
  if (t.status === 'planejado') {
    botao.addEventListener('dragstart', (e) => {
      arrastandoId = t.id;
      botao.classList.add('arrastando');
      try {
        e.dataTransfer.setData('text/plain', t.id); // o Firefox só inicia o arrasto com dados
        e.dataTransfer.effectAllowed = 'move';
      } catch {
        // ambientes sem dataTransfer (testes): o id fica na variável do módulo
      }
    });
    botao.addEventListener('dragend', () => {
      arrastandoId = null;
      botao.classList.remove('arrastando');
      document.querySelectorAll('.cal-alvo').forEach((el) => el.classList.remove('cal-alvo'));
    });
  }
  return botao;
}

function chipAtividade(a) {
  const partes = [ROTULO_ESPORTE[a.esporte] ?? a.esporte];
  if (a.distanciaM) partes.push(formatarDistancia(a.distanciaM));
  return h(
    'a',
    { class: 'chip-atividade', href: `#/atividades/${a.id}`, title: 'Atividade realizada' },
    h('span', { class: 'chip-titulo' }, partes.join(' ')),
    h('span', { class: 'chip-sub' }, `${a.hrss === null || a.hrss === undefined ? '—' : formatarNumero(a.hrss, 0)} · realizado`),
  );
}

/**
 * Calendário do plano (semana ou mês). Treinos "planejados" podem ser arrastados para outro dia.
 * @param {{
 *   visao: 'semana'|'mes', ancora: string, hoje: string, configs: any[],
 *   porDia: Map<string, { treinos: any[], atividades: any[] }>,
 *   aoEditar: (treino: any) => void, aoNovo: (data: string) => void, aoMover: (id: string, data: string) => void
 * }} p
 */
export function desenharCalendario({ visao, ancora, hoje, configs, calibracao = null, porDia, aoEditar, aoNovo, aoMover }) {
  function celula(data, indice, { doMes = true, compacta = false } = {}) {
    const dia = porDia.get(data) ?? { treinos: [], atividades: [] };
    const treinos = [...dia.treinos].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const planejado = treinos.filter((t) => t.status === 'planejado' && data >= hoje).reduce((s, t) => s + estresseDoTreino(t, configs, calibracao), 0);
    const realizado = dia.atividades.reduce((s, a) => s + (Number.isFinite(a.hrss) ? a.hrss : 0), 0);
    const itens = [...dia.atividades.map(chipAtividade), ...treinos.map((t) => chipTreino(t, { hoje, configs, calibracao, aoEditar }))];
    const limite = compacta ? 3 : Infinity;
    const visiveis = itens.slice(0, limite);
    const numero = Number(data.slice(8));

    const el = h(
      'div',
      {
        class: `cal-dia${data === hoje ? ' cal-hoje' : ''}${doMes ? '' : ' cal-fora'}${compacta ? ' cal-compacta' : ''}`,
        'data-data': data,
        role: 'group',
        'aria-label': `${NOMES_DIA[indice]}, ${formatarData(data)}${data === hoje ? ' (hoje)' : ''}`,
      },
      h(
        'div',
        { class: 'cal-topo' },
        h('span', { class: 'cal-rotulo' }, compacta ? String(numero) : `${ROTULOS_DIA[indice]} ${numero}`),
        itens.length > 0 && compacta ? h('span', { class: 'cal-contagem', 'aria-hidden': 'true' }, String(itens.length)) : null,
        h('button', { type: 'button', class: 'cal-novo', 'aria-label': `Novo treino em ${formatarData(data)}`, onClick: () => aoNovo(data) }, '+'),
      ),
      h('div', { class: 'cal-itens' }, ...visiveis, itens.length > limite ? h('span', { class: 'cal-mais' }, `+${itens.length - limite}`) : null),
      !compacta && (planejado > 0 || realizado > 0)
        ? h(
            'p',
            { class: 'cal-total' },
            realizado > 0 ? `Realizado ${formatarNumero(realizado, 0)}` : null,
            realizado > 0 && planejado > 0 ? ' · ' : null,
            planejado > 0 ? `Plano ~${formatarNumero(planejado, 0)}` : null,
          )
        : null,
    );

    el.addEventListener('dragover', (e) => {
      if (!arrastandoId) return;
      e.preventDefault();
      el.classList.add('cal-alvo');
    });
    el.addEventListener('dragleave', () => el.classList.remove('cal-alvo'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('cal-alvo');
      let id = arrastandoId;
      if (!id) {
        try {
          id = e.dataTransfer?.getData('text/plain');
        } catch {
          id = null;
        }
      }
      arrastandoId = null;
      if (id) aoMover(id, data);
    });
    return el;
  }

  if (visao === 'mes') {
    const grade = gradeDoMes(ancora);
    return h(
      'div',
      { class: 'cal cal-mes', role: 'grid', 'aria-label': 'Calendário do mês' },
      h('div', { class: 'cal-cabecalho', 'aria-hidden': 'true' }, ...ROTULOS_DIA.map((r) => h('span', null, r))),
      ...grade.map((semana) => h('div', { class: 'cal-semana-linha', role: 'row' }, ...semana.map((d, i) => celula(d.data, i, { doMes: d.doMes, compacta: true })))),
    );
  }

  const inicio = inicioDaSemana(ancora);
  return h(
    'div',
    { class: 'cal cal-semana', role: 'group', 'aria-label': 'Calendário da semana' },
    ...Array.from({ length: 7 }, (_, i) => celula(somarDias(inicio, i), i)),
  );
}
