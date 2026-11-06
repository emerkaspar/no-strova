import { sugerirVinculos, treinoNaoRealizado } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarNumero } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { vinculosIgnorados } from './state.js';

const descricao = (t) => (t.nomeTreino ? `${t.nomeTreino} · ${t.duracaoMin}min` : `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.duracaoMin}min · ${t.zona}`);

/**
 * Faixa de pendências do topo do Plano: sugestões de vínculo com a atividade feita e treinos que ficaram para trás.
 * Devolve `null` (nada a mostrar) quando não há pendência.
 * @param {{
 *   treinos: any[], atividades: any[], hoje: string,
 *   aoVincular: (treinoId: string, atividadeId: string) => Promise<void>,
 *   aoPular: (treinoId: string) => Promise<void>,
 *   aoReagendar: (treinoId: string, data: string) => Promise<void>,
 *   aoIgnorar: () => void
 * }} p
 */
export function criarFaixaPendencias({ treinos, atividades, hoje, aoVincular, aoPular, aoReagendar, aoIgnorar }) {
  const porId = new Map(atividades.map((a) => [a.id, a]));
  const treinoPorId = new Map(treinos.map((t) => [t.id, t]));

  const sugestoes = sugerirVinculos(treinos, atividades).filter((s) => !vinculosIgnorados.has(`${s.treinoId}:${s.atividadeId}`));
  const comSugestao = new Set(sugestoes.map((s) => s.treinoId));
  const atrasados = treinos.filter((t) => treinoNaoRealizado(t, hoje) && !comSugestao.has(t.id));

  const secoes = [];

  if (sugestoes.length > 0) {
    secoes.push(
      h(
        'div',
        { class: 'acomp-secao' },
        h('h3', null, 'Parece que você fez'),
        h(
          'ul',
          { class: 'acomp-lista' },
          ...sugestoes.map((s) => {
            const t = treinoPorId.get(s.treinoId);
            const a = porId.get(s.atividadeId);
            const vincular = h('button', { class: 'btn', type: 'button' }, 'Vincular');
            vincular.addEventListener('click', async () => {
              vincular.disabled = true;
              try {
                await aoVincular(t.id, a.id);
              } catch {
                vincular.disabled = false;
              }
            });
            return h(
              'li',
              { class: 'acomp-item' },
              h(
                'div',
                null,
                h('strong', null, `${formatarData(t.data)} · ${descricao(t)}`),
                h('p', { class: 'texto-secundario' }, `Atividade do mesmo dia: ${ROTULO_ESPORTE[a.esporte] ?? a.esporte}${a.distanciaM ? ` ${formatarDistancia(a.distanciaM)}` : ''}, HRSS ${a.hrss === null || a.hrss === undefined ? '—' : formatarNumero(a.hrss, 1)}.`),
              ),
              h(
                'div',
                { class: 'acoes' },
                vincular,
                h(
                  'button',
                  {
                    class: 'btn btn-secundario',
                    type: 'button',
                    onClick: () => {
                      vinculosIgnorados.add(`${s.treinoId}:${s.atividadeId}`);
                      aoIgnorar();
                    },
                  },
                  'Não foi esse',
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  if (atrasados.length > 0) {
    secoes.push(
      h(
        'div',
        { class: 'acomp-secao' },
        h('h3', null, 'Não realizados'),
        h(
          'ul',
          { class: 'acomp-lista' },
          ...atrasados.map((t) => {
            const reagendar = h('button', { class: 'btn', type: 'button' }, 'Reagendar para hoje');
            const pular = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Pular');
            for (const [botao, acao] of [[reagendar, () => aoReagendar(t.id, hoje)], [pular, () => aoPular(t.id)]]) {
              botao.addEventListener('click', async () => {
                botao.disabled = true;
                try {
                  await acao();
                } catch {
                  botao.disabled = false;
                }
              });
            }
            return h(
              'li',
              { class: 'acomp-item' },
              h('div', null, h('strong', null, `${formatarData(t.data)} · ${descricao(t)}`), h('p', { class: 'texto-secundario' }, 'Passou sem ser feito e não entra mais na projeção.')),
              h('div', { class: 'acoes' }, reagendar, pular),
            );
          }),
        ),
      ),
    );
  }

  // sem pendência, a faixa não aparece
  if (secoes.length === 0) return null;
  return h('section', { class: 'card plano-pendencias', id: 'plano-pendencias', 'aria-label': 'Pendências do plano' }, h('div', null, ...secoes));
}
