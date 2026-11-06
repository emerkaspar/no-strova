import { FASES, formatarTempoDaProva, PRIORIDADES_PROVA, provaDoPlano, provasFuturas } from '@no-strova/domain';
import { definirMetaDeFormaDaProva, montarPlanoAnual, montarRascunho } from '../../application/provas.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { formatarData, formatarForma, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { linkDosDiasDeTreino } from './diasDeTreino.js';
import { desenharRascunhoAnual } from './rascunhoAnual.js';

/**
 * Cartão "Preparação para o evento": resumo de uma linha da prova principal, semanas, fases e carga-alvo até a prova (tabela recolhida,
 * com a semana atual em destaque) e o rascunho de treinos das próximas semanas por regras. O rascunho com IA fica no painel
 * de IA do calendário. É criado uma vez por tela (guarda a prova escolhida e o rascunho aberto) e redesenhado por `atualizar`.
 * @param {{ uid: string, hoje: string, aoAceitar?: () => void }} p
 */
export function criarCartaoPlanoAnual({ uid, hoje, aoAceitar = () => {} }) {
  let ctx = null; // { provas, dias, treinos, configs, calibracao, modelos, preferencias, metasForma }
  let provaId = null;
  let rascunho = null; // { itens, avisos, porSemana, marcados:Set }
  let tabelaAberta = false;
  const mensagem = areaMensagem();
  const corpo = h('div');

  function provaEscolhida() {
    const futuras = provasFuturas(ctx.provas, hoje);
    return futuras.find((p) => p.id === provaId) ?? provaDoPlano(ctx.provas, hoje);
  }

  function estatistica(rotulo, valor, sub) {
    return h('div', { class: 'anual-estat' }, h('span', { class: 'texto-secundario' }, rotulo), h('strong', null, valor), sub ? h('small', { class: 'texto-secundario' }, sub) : null);
  }

  function tabelaDeSemanas(plano) {
    const maior = Math.max(...plano.semanas.map((s) => Math.max(s.cargaAlvo, s.realizado)), 1);
    return h(
      'div',
      { class: 'tabela-wrap anual-semanas' },
      h(
        'table',
        { class: 'tabela tabela-compacta' },
        h('thead', null, h('tr', null, ...['Semana', 'Fase', 'Meta de carga', 'Realizado'].map((t) => h('th', { scope: 'col' }, t)))),
        h(
          'tbody',
          null,
          ...plano.semanas.map((s) =>
            h(
              'tr',
              { class: s.atual ? 'anual-atual' : null },
              h('td', null, `${formatarData(s.inicio).slice(0, 5)} a ${formatarData(s.fim).slice(0, 5)}`, s.atual ? h('small', { class: 'texto-secundario' }, ' · esta semana') : null, s.semanaDaProva ? h('small', { class: 'texto-secundario' }, ' · evento') : null),
              h('td', null, h('span', { class: `anual-fase anual-fase-${s.fase}`, title: FASES[s.fase].descricao }, FASES[s.fase].rotulo), s.recuperacao ? h('small', { class: 'texto-secundario' }, ' · recuperação') : null),
              h(
                'td',
                null,
                h('div', { class: 'anual-barra', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round((s.cargaAlvo / maior) * 100)}%` })),
                formatarNumero(s.cargaAlvo, 0),
              ),
              h('td', null, s.inicio > hoje ? h('span', { class: 'texto-secundario', title: 'Semana ainda não começou' }, '—') : formatarNumero(s.realizado, 0)),
            ),
          ),
        ),
      ),
    );
  }

  /** Evento principal: identidade (prioridade, nome e data) à esquerda e os indicadores à direita. */
  function resumoDaProva(prova, plano) {
    const r = plano.resumo;
    const indicador = (rotulo, valor, sub) => h('div', { class: 'anual-ind' }, h('dt', null, rotulo), h('dd', null, valor, sub ? h('small', null, ` ${sub}`) : null));
    const indicadores = [
      r ? indicador('Faltam', `${formatarNumero(r.semanasTotal, 0)} semana${r.semanasTotal === 1 ? '' : 's'}`, `${formatarNumero(r.diasAteProva, 0)} dias`) : null,
      r && r.formaNaProva !== null ? indicador('Forma prevista', formatarForma(r.formaNaProva, 1), r.formaAlvo === null ? null : `alvo ${formatarForma(r.formaAlvo, 1)}`) : null,
      prova.metaTempoS ? indicador('Meta de tempo', formatarTempoDaProva(prova.metaTempoS)) : null,
    ].filter(Boolean);
    return h(
      'div',
      { class: 'anual-evento' },
      h(
        'div',
        { class: 'anual-evento-id' },
        h('span', { class: `prova-prioridade prova-${prova.prioridade}`, title: PRIORIDADES_PROVA[prova.prioridade]?.rotulo }, prova.prioridade),
        h('div', null, h('strong', { class: 'anual-evento-nome' }, prova.nome), h('span', { class: 'texto-secundario' }, formatarData(prova.data))),
      ),
      indicadores.length > 0 ? h('dl', { class: 'anual-indicadores' }, ...indicadores) : null,
    );
  }

  function desenhar() {
    if (!ctx) return;
    const futuras = provasFuturas(ctx.provas, hoje);
    if (futuras.length === 0) {
      corpo.replaceChildren(h('p', { class: 'texto-secundario' }, 'Cadastre um evento (de preferência com prioridade A) para ver a preparação: as fases, a carga de cada semana e a Forma prevista no dia do evento.'));
      return;
    }
    const prova = provaEscolhida();
    const plano = montarPlanoAnual({ hoje, prova, dias: ctx.dias });
    const r = plano.resumo;

    const seletorProva =
      futuras.length > 1
        ? seletor({
            id: 'anual-prova',
            rotulo: 'Evento da preparação',
            opcoes: futuras.map((p) => ({ valor: p.id, rotulo: `${p.prioridade} · ${p.nome} · ${formatarData(p.data)}` })),
            valor: prova.id,
          })
        : null;
    seletorProva?.addEventListener('change', () => {
      provaId = seletorProva.value;
      rascunho = null;
      mensagem.limpar();
      desenhar();
    });

    // treinos que o usuário já tem planejados nas semanas que o rascunho cobre (as 4 próximas, como no gerador)
    const semanasDoRascunho = plano.semanas.filter((s) => s.fim > hoje).slice(0, 4);
    const fimDaJanela = semanasDoRascunho.at(-1)?.fim ?? hoje;
    const jaPlanejados = ctx.treinos.filter((t) => t.status === 'planejado' && t.data > hoje && t.data <= fimDaJanela).length;

    const botaoRascunho = h('button', { class: 'btn', type: 'button', disabled: !r }, jaPlanejados > 0 ? 'Completar as próximas 4 semanas' : 'Montar treinos das próximas 4 semanas');
    botaoRascunho.addEventListener('click', () => {
      mensagem.limpar();
      const resultado = montarRascunho({
        plano, prova, hoje, treinos: ctx.treinos, configs: ctx.configs, calibracao: ctx.calibracao, proprios: ctx.modelos, preferencias: ctx.preferencias,
      });
      rascunho = { ...resultado, marcados: new Set(resultado.itens.map((_, i) => i)) };
      desenhar();
    });

    const botaoMeta = Number.isFinite(prova.formaAlvo)
      ? h('button', { class: 'btn btn-secundario', type: 'button' }, 'Usar a Forma-alvo como meta de Forma')
      : null;
    botaoMeta?.addEventListener('click', () =>
      executarComBotao(botaoMeta, mensagem, async () => {
        await definirMetaDeFormaDaProva({ uid, prova, hoje, metasAtivas: ctx.metasForma.filter((m) => m.ativa) });
        mensagem.mostrar(`Meta de Forma definida: ${formatarForma(prova.formaAlvo, 1)} em ${formatarData(prova.data)}.`, 'ok');
      }),
    );

    const detalhes =
      plano.semanas.length > 0
        ? h(
            'details',
            { class: 'anual-detalhes', open: tabelaAberta, onToggle: (e) => (tabelaAberta = e.target.open) },
            h('summary', null, h('span', { class: 'anual-detalhes-titulo' }, 'Meta de carga por semana'), h('span', { class: 'anual-detalhes-sub' }, `${plano.semanas.length} semanas${r ? ` · de ${formatarNumero(r.cargaBase, 0)} a ${formatarNumero(r.cargaPico, 0)} de carga` : ''}`)),
            h('p', { class: 'texto-secundario anual-nota' }, 'A carga é o HRSS da semana. O plano sobe devagar (no máximo 8% por semana), tem uma semana de recuperação a cada quatro e o pico não passa de 1,8 vez a sua base. A Forma prevista espalha a carga igualmente pelos dias.'),
            r
              ? h(
                  'div',
                  { class: 'anual-resumo' },
                  estatistica('Carga por semana', `${formatarNumero(r.cargaBase, 0)} → ${formatarNumero(r.cargaPico, 0)}`, 'da base ao pico'),
                  estatistica('Polimento', `${r.semanasDePolimento} semana${r.semanasDePolimento === 1 ? '' : 's'}`, 'contando a do evento'),
                  estatistica('Condicionamento previsto', r.condicionamentoNaProva === null ? '—' : formatarNumero(r.condicionamentoNaProva, 1), 'no dia do evento'),
                  estatistica('Forma prevista', r.formaNaProva === null ? '—' : formatarForma(r.formaNaProva, 1), r.formaAlvo === null ? 'no dia do evento' : `alvo ${formatarForma(r.formaAlvo, 1)}`),
                )
              : null,
            tabelaDeSemanas(plano),
          )
        : null;

    // replaceChildren() escreve "null" na tela se receber null: os itens opcionais saem pelo filter
    corpo.replaceChildren(...[
      seletorProva ? h('div', { class: 'campo anual-seletor' }, h('label', { for: 'anual-prova' }, 'Evento'), seletorProva) : null,
      resumoDaProva(prova, plano),
      plano.avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...plano.avisos.map((a) => h('li', null, a))) : null,
      detalhes,
      h(
        'div',
        { class: 'anual-montar' },
        h(
          'div',
          { class: 'anual-montar-texto' },
          h('h3', null, 'Montar treinos'),
          h('p', { class: 'texto-secundario' }, 'Cria uma proposta de treinos para as próximas 4 semanas, nos seus ', linkDosDiasDeTreino(), ' (configurados no Perfil de treino). Você revisa e escolhe o que entra: nada vai para o calendário sem a sua confirmação.'),
          jaPlanejados > 0
            ? h('p', { class: 'anual-aviso' }, icone('info', 16), `Você já tem ${jaPlanejados} treino${jaPlanejados === 1 ? ' planejado' : 's planejados'} nessas semanas. O rascunho só completa a carga que falta e não mexe neles.`)
            : null,
        ),
        h('div', { class: 'anual-montar-acoes' }, botaoRascunho, botaoMeta),
      ),
      mensagem.el,
      rascunho
        ? desenharRascunhoAnual({
            rascunho,
            prova,
            uid,
            obterContexto: () => ({ configs: ctx.configs, calibracao: ctx.calibracao }),
            aoDescartar: () => {
              rascunho = null;
              desenhar();
            },
            aoAceitar: (n) => {
              rascunho = null;
              desenhar();
              mensagem.mostrar(`${n} treino${n === 1 ? '' : 's'} adicionado${n === 1 ? '' : 's'} ao plano.`, 'ok');
              aoAceitar();
            },
          })
        : null,
    ].filter(Boolean));
  }

  const el = h(
    'section',
    { class: 'card', id: 'plano-anual' },
    h('h2', null, 'Preparação para o evento'),
    h('p', { class: 'texto-secundario anual-intro' }, 'A meta de carga de cada semana até o seu evento principal. Depois, transforme essa meta em treinos no calendário.'),
    corpo,
  );
  desenhar();

  return {
    el,
    atualizar(novo) {
      ctx = novo;
      desenhar();
    },
  };
}
