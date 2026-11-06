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
import { icone } from '../../utils/icones.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

/** Id do treino sendo arrastado (HTML5 drag and drop). */
let arrastandoId = null;

/** Menu do "+" aberto no momento (só um por vez); fecha ao clicar fora ou apertar Esc. */
let menuNovoAberto = null;
function fecharMenuNovo() {
  if (!menuNovoAberto) return;
  menuNovoAberto.classList.remove('aberto');
  menuNovoAberto.querySelector('.cal-novo')?.setAttribute('aria-expanded', 'false');
  menuNovoAberto = null;
}
document.addEventListener('click', (e) => {
  if (menuNovoAberto && !menuNovoAberto.contains(e.target)) fecharMenuNovo();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharMenuNovo();
});

const ROTULO_ESTADO = { feito: 'feito', pulado: 'pulado', atrasado: 'não realizado', planejado: 'plano' };

function estadoDoTreino(t, hoje) {
  if (t.status === 'realizado') return 'feito';
  if (t.status === 'pulado') return 'pulado';
  return treinoNaoRealizado(t, hoje) ? 'atrasado' : 'planejado';
}

/** Passos para o perfil do chip: os do treino estruturado ou, no treino livre, um bloco único na zona e duração. */
function passosDoChip(t) {
  if (t.passos?.length) return t.passos;
  const duracaoS = Math.max(60, Math.round((Number(t.duracaoMin) || 1) * 60));
  return [{ tipo: 'bloco', papel: 'principal', zona: t.zona ?? 'Z2', duracaoS, descricao: null }];
}

function chipTreino(t, { hoje, configs, calibracao, aoEditar }) {
  const estado = estadoDoTreino(t, hoje);
  const titulo = t.nomeTreino ? `${t.nomeTreino} · ${t.duracaoMin}min` : `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.duracaoMin}min · ${t.zona}`;
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
    h('span', { class: 'chip-perfil' }, perfilDoTreino(passosDoChip(t), { altura: 24 })),
    h('span', { class: 'chip-sub' }, `~${formatarNumero(estresseDoTreino(t, configs, calibracao), 0)} · ${ROTULO_ESTADO[estado]}`),
  );
  if (t.status === 'planejado') {
    botao.addEventListener('dragstart', (e) => {
      arrastandoId = t.id;
      botao.classList.add('arrastando');
      document.body.classList.add('cal-arrastando'); // destaca a lixeira enquanto o treino é arrastado
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
      document.body.classList.remove('cal-arrastando');
      document.querySelectorAll('.cal-alvo, .cal-lixeira-alvo').forEach((el) => el.classList.remove('cal-alvo', 'cal-lixeira-alvo'));
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
 * Calendário do plano (semana ou mês). Treinos "planejados" podem ser arrastados para outro dia ou para a lixeira (que pede
 * a confirmação da exclusão em `aoExcluir`).
 * @param {{
 *   visao: 'semana'|'mes', ancora: string, hoje: string, configs: any[],
 *   porDia: Map<string, { treinos: any[], atividades: any[] }>,
 *   aoEditar: (treino: any) => void, aoNovo: (data: string, modo: 'manual'|'ia') => void, comIa?: boolean, aoMover: (id: string, data: string) => void,
 *   aoExcluir: (id: string) => void
 * }} p
 */
export function desenharCalendario({ visao, ancora, hoje, configs, calibracao = null, porDia, metaDaSemana = () => null, comIa = false, aoEditar, aoNovo, aoMover, aoExcluir }) {
  /**
   * Coluna "Esforço planejado" de uma semana (segunda a domingo): soma do que já foi feito com os treinos previstos, comparada à
   * meta do plano anual (quando a semana está nele). Atingida a meta com o que foi feito, ganha o badge de conquista.
   * Sem nada para mostrar, explica o que aparece ali.
   */
  function colunaEsforco(inicioSemana, compacta = false) {
    let previsto = 0;
    let realizado = 0;
    let treinos = 0;
    for (let i = 0; i < 7; i++) {
      const data = somarDias(inicioSemana, i);
      const dia = porDia.get(data);
      // feito: HRSS das atividades já realizadas (inclui as vinculadas a treinos); previsto: treinos planejados de hoje em diante
      realizado += (dia?.atividades ?? []).reduce((s, a) => s + (Number.isFinite(a.hrss) ? a.hrss : 0), 0);
      if (data < hoje) continue;
      for (const t of dia?.treinos ?? []) {
        if (t.status !== 'planejado') continue;
        previsto += estresseDoTreino(t, configs, calibracao);
        treinos += 1;
      }
    }
    const total = realizado + previsto;
    const meta = metaDaSemana(inicioSemana);
    const atingiu = Boolean(meta) && meta.cargaAlvo > 0 && realizado >= meta.cargaAlvo;
    const vazio = !meta && treinos === 0 && realizado === 0;
    const el = h('div', {
      class: `cal-esforco${compacta ? ' cal-esforco-compacto' : ''}${vazio ? ' cal-esforco-vazio' : ''}`,
      role: 'group',
      'aria-label': `Esforço planejado da semana de ${formatarData(inicioSemana)}`,
    });
    if (vazio) {
      el.append(compacta ? h('span', { class: 'cal-esforco-traco', title: 'Sem esforço planejado nesta semana' }, '—') : h('p', null, 'Sem esforço previsto. Aqui aparecem o plano anual ou os treinos avulsos previstos da semana, somados ao que você já fez.'));
      return el;
    }
    if (atingiu) el.classList.add('cal-esforco-conquista');
    const pct = meta && meta.cargaAlvo > 0 ? Math.min(100, Math.round((total / meta.cargaAlvo) * 100)) : 0;
    const pctFeito = meta && meta.cargaAlvo > 0 ? Math.min(100, Math.round((realizado / meta.cargaAlvo) * 100)) : 0;
    const textoTreinos = treinos > 0 ? ` · ${treinos} ${treinos === 1 ? 'treino' : 'treinos'}` : '';

    // cabeçalho: total em destaque, a meta ao lado e o badge de conquista
    el.append(
      h(
        'div',
        { class: 'cal-esforco-topo' },
        h('span', { class: 'cal-esforco-total' }, formatarNumero(total, 0)),
        meta ? h('span', { class: 'cal-esforco-meta' }, `/ ${formatarNumero(meta.cargaAlvo, 0)}`) : null,
        atingiu ? h('span', { class: 'badge-conquista', title: 'Você atingiu a meta de carga desta semana' }, icone('medalha', 14), compacta ? null : 'Meta atingida') : null,
      ),
    );
    if (meta) {
      el.append(
        h(
          'div',
          { class: 'cal-esforco-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Total da semana em relação à meta' },
          h('span', { class: 'cal-esforco-barra-prevista', style: `width:${pct}%` }),
          h('span', { class: 'cal-esforco-barra-feita', style: `width:${pctFeito}%` }),
        ),
      );
    }
    el.append(
      h(
        'div',
        { class: 'cal-esforco-detalhe' },
        h('span', null, h('i', { class: 'cal-ponto cal-ponto-feito', 'aria-hidden': 'true' }), `Feito ${formatarNumero(realizado, 0)}`),
        h('span', null, h('i', { class: 'cal-ponto cal-ponto-previsto', 'aria-hidden': 'true' }), `Previsto ${formatarNumero(previsto, 0)}${compacta ? '' : textoTreinos}`),
      ),
    );
    if (meta && !compacta) el.append(h('span', { class: 'cal-esforco-fase' }, `${meta.fase}${meta.detalhe ? ` · ${meta.detalhe}` : ''}`));
    return el;
  }

  /** Idêntico para semana e mês: o treino arrastado até aqui é excluído (depois de confirmar). */
  function lixeira() {
    const el = h(
      'div',
      { class: 'cal-lixeira', 'aria-label': 'Lixeira: arraste um treino planejado até aqui para excluir' },
      icone('lixeira', 22),
      h('span', null, 'Arraste um treino aqui para excluir'),
    );
    el.addEventListener('dragover', (e) => {
      if (!arrastandoId) return;
      e.preventDefault();
      el.classList.add('cal-lixeira-alvo');
    });
    el.addEventListener('dragleave', () => el.classList.remove('cal-lixeira-alvo'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('cal-lixeira-alvo');
      let id = arrastandoId;
      if (!id) {
        try {
          id = e.dataTransfer?.getData('text/plain');
        } catch {
          id = null;
        }
      }
      arrastandoId = null;
      document.body.classList.remove('cal-arrastando');
      if (id) aoExcluir(id);
    });
    return el;
  }

  /** Botão "+" do dia: com IA liberada abre dois ícones (manual e IA); sem IA, vai direto para o formulário manual. */
  function botaoNovo(data) {
    const rotulo = formatarData(data);
    if (!comIa) return h('button', { type: 'button', class: 'cal-novo', 'aria-label': `Novo treino em ${rotulo}`, onClick: () => aoNovo(data, 'manual') }, '+');
    const escolher = (modo) => {
      fecharMenuNovo();
      aoNovo(data, modo);
    };
    const mais = h('button', { type: 'button', class: 'cal-novo', 'aria-label': `Novo treino em ${rotulo}`, 'aria-haspopup': 'true', 'aria-expanded': 'false' }, '+');
    const menu = h(
      'div',
      { class: 'cal-novo-menu', role: 'group', 'aria-label': 'Como criar o treino' },
      h('button', { type: 'button', class: 'cal-novo-opcao', title: 'Manual', 'aria-label': `Criar treino manualmente em ${rotulo}`, onClick: () => escolher('manual') }, icone('lapis', 16)),
      h('button', { type: 'button', class: 'cal-novo-opcao', title: 'Sugestão da IA', 'aria-label': `Pedir um treino à IA para ${rotulo}`, onClick: () => escolher('ia') }, icone('ia', 16)),
    );
    const wrap = h('div', { class: 'cal-novo-wrap' }, mais, menu);
    mais.addEventListener('click', () => {
      const abrir = menuNovoAberto !== wrap;
      fecharMenuNovo();
      if (abrir) {
        wrap.classList.add('aberto');
        mais.setAttribute('aria-expanded', 'true');
        menuNovoAberto = wrap;
      }
    });
    return wrap;
  }

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
        botaoNovo(data),
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
      { class: 'cal-bloco' },
      lixeira(),
      h(
        'div',
        { class: 'cal cal-mes', role: 'grid', 'aria-label': 'Calendário do mês' },
        h('div', { class: 'cal-cabecalho', 'aria-hidden': 'true' }, ...ROTULOS_DIA.map((r) => h('span', null, r)), h('span', { class: 'cal-cabecalho-esforco' }, 'ESFORÇO')),
        ...grade.map((semana) => h('div', { class: 'cal-semana-linha', role: 'row' }, ...semana.map((d, i) => celula(d.data, i, { doMes: d.doMes, compacta: true })), colunaEsforco(semana[0].data, true))),
      ),
    );
  }

  const inicio = inicioDaSemana(ancora);
  return h(
    'div',
    { class: 'cal-bloco' },
    lixeira(),
    h('div', { class: 'cal cal-semana', role: 'group', 'aria-label': 'Calendário da semana' }, ...Array.from({ length: 7 }, (_, i) => celula(somarDias(inicio, i), i)), h('div', { class: 'cal-esforco-coluna' }, h('span', { class: 'cal-esforco-titulo' }, 'ESFORÇO PLANEJADO'), colunaEsforco(inicio))),
  );
}
