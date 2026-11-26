import { condicaoDoClima, iconeDoClima, rankingDasAtividades, velocidadeMediaMs } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal } from '../../utils/modal.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

const COR_DO_PODIO = Object.freeze({ 1: 'var(--medalha-ouro)', 2: 'var(--medalha-prata)', 3: 'var(--medalha-bronze)' });
const NOME_DO_PODIO = Object.freeze({ 1: '1º lugar', 2: '2º lugar', 3: '3º lugar' });

const positivo = (v) => Number.isFinite(v) && v > 0;

/** Velocidade (km/h) ou ritmo (min/km, na corrida) médios da atividade; "—" sem distância. */
function velocidadeTexto(a) {
  const v = velocidadeMediaMs(a);
  if (!v) return '—';
  if (a.esporte === 'corrida') {
    const s = Math.round(1000 / v);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
  }
  return `${formatarNumero(v * 3.6, 1)} km/h`;
}

/** Ícone do clima predominante da atividade; o tooltip traz a condição e a temperatura. */
function celulaDeClima(a) {
  if (!Number.isFinite(a.climaCodigo)) return '—';
  const condicao = condicaoDoClima(a.climaCodigo) ?? 'Clima';
  const temperatura = Number.isFinite(a.temperaturaMediaC) ? ` · ${formatarNumero(a.temperaturaMediaC, 1)} °C` : '';
  return h('span', { class: 'rk-clima', title: `${condicao}${temperatura}`, role: 'img', 'aria-label': `${condicao}${temperatura}` }, icone(iconeDoClima(a.climaCodigo), 20));
}

/** Posição: troféu (ouro, prata e bronze) para os três primeiros e número para os demais. */
function celulaDePosicao(posicao) {
  if (posicao > 3) return h('span', { class: 'rk-pos' }, `${posicao}º`);
  return h('span', { class: 'rk-pos rk-pos-podio', style: `--podio:${COR_DO_PODIO[posicao]}`, title: NOME_DO_PODIO[posicao], role: 'img', 'aria-label': NOME_DO_PODIO[posicao] }, icone('esporte', 20));
}

/**
 * Colunas da tabela. `destaque` marca a coluna do valor que define o recorde (campo do ranking). As colunas de potência e
 * de clima só aparecem quando alguma atividade da lista tem o dado.
 */
const COLUNAS = [
  { id: 'data', rotulo: 'Data', campos: [], celula: (a) => formatarData(a.data) },
  { id: 'distancia', rotulo: 'Distância', campos: ['distanciaM'], celula: (a) => (positivo(a.distanciaM) ? formatarDistancia(a.distanciaM) : '—') },
  { id: 'tempo', rotulo: 'Tempo', campos: ['duracaoS'], celula: (a) => (positivo(a.duracaoS) ? formatarDuracao(a.duracaoS) : '—') },
  { id: 'velocidade', rotulo: 'Vel. média', campos: [], celula: velocidadeTexto },
  { id: 'fcMedia', rotulo: 'FC média', campos: [], celula: (a) => (positivo(a.fcMedia) ? `${formatarNumero(a.fcMedia, 0)} bpm` : '—') },
  { id: 'fcMax', rotulo: 'FC máx.', campos: ['fcMax'], celula: (a) => (positivo(a.fcMax) ? `${formatarNumero(a.fcMax, 0)} bpm` : '—') },
  { id: 'clima', rotulo: 'Clima', campos: ['temperaturaMediaC', 'ventoKmh'], celula: celulaDeClima, ocultaSem: (a) => !Number.isFinite(a.climaCodigo) },
  { id: 'elevacao', rotulo: 'Elevação', campos: ['altimetriaM'], celula: (a) => (positivo(a.altimetriaM) ? `${formatarNumero(a.altimetriaM, 0)} m` : '—') },
  { id: 'hrss', rotulo: 'HRSS', campos: ['hrss'], celula: (a) => (positivo(a.hrss) ? formatarNumero(a.hrss, 1) : '—') },
  { id: 'potencia', rotulo: 'Potência média', campos: ['potenciaMediaW', 'potenciaMax20minW'], celula: (a) => (positivo(a.potenciaMediaW) ? `${formatarNumero(a.potenciaMediaW, 0)} W` : '—'), ocultaSem: (a) => !positivo(a.potenciaMediaW) },
];

/** Linhas do top 10 de um cartão de recorde, a partir das atividades já filtradas por período e esporte. */
export function rankingDoCartao(cartao, atividades) {
  if (!cartao?.ranking) return [];
  const { campo, menorVence, aceitaZero } = cartao.ranking;
  const lista = cartao.esporte ? atividades.filter((a) => a.esporte === cartao.esporte) : atividades;
  return rankingDasAtividades(lista, campo, { menorVence, aceitaZero, limite: 10 });
}

function tabela(cartao, linhas, aoAbrir) {
  const campo = cartao.ranking.campo;
  const colunas = COLUNAS.filter((c) => !c.ocultaSem || linhas.some((l) => !c.ocultaSem(l.atividade)));
  return h(
    'div',
    { class: 'rk-rolagem' },
    h(
      'table',
      { class: 'rk-tabela' },
      h('caption', { class: 'sr-only' }, `As ${linhas.length} melhores atividades em ${cartao.rotuloCompleto ?? cartao.rotulo}`),
      h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'rk-col-pos' }, '#'), ...colunas.map((c) => h('th', { scope: 'col', class: c.campos.includes(campo) ? 'rk-destaque' : null }, c.rotulo)))),
      h(
        'tbody',
        null,
        ...linhas.map((l) => {
          const a = l.atividade;
          const abrir = () => aoAbrir(a.id);
          return h(
            'tr',
            {
              class: `rk-linha${l.posicao <= 3 ? ' rk-linha-podio' : ''}`,
              style: l.posicao <= 3 ? `--podio:${COR_DO_PODIO[l.posicao]}` : null,
              tabindex: '0',
              title: 'Abrir a atividade',
              onClick: abrir,
              onKeydown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  abrir();
                }
              },
            },
            h('td', { class: 'rk-col-pos' }, celulaDePosicao(l.posicao)),
            ...colunas.map((c) => {
              const conteudo = c.id === 'data' ? h('span', { class: 'rk-data' }, icone(a.esporte === 'ciclismo' || a.esporte === 'corrida' ? a.esporte : 'outro', 16), c.celula(a)) : c.celula(a);
              return h('td', { class: c.campos.includes(campo) ? 'rk-destaque' : null }, conteudo);
            }),
          );
        }),
      ),
    ),
  );
}

/**
 * Abre o top 10 de um recorde: tabela com as melhores atividades, troféus nos três primeiros e os números de cada treino.
 * Clicar numa linha abre a atividade.
 *
 * @param {{ cartao: object, atividades: any[] }} opcoes `atividades` já filtradas pelo período e pelo esporte da tela
 */
export function abrirRankingDoRecorde({ cartao, atividades }) {
  const linhas = rankingDoCartao(cartao, atividades);
  const titulo = cartao.rotuloCompleto ?? cartao.rotulo;
  const esporteTexto = cartao.esporte ? ROTULO_ESPORTE[cartao.esporte] ?? cartao.esporte : null;
  return abrirModal({
    classe: 'modal-feedback modal-ranking',
    rotulo: `Top 10: ${titulo}`,
    fecharNoFundo: true,
    conteudo: (fechar) => {
      const abrirAtividade = (id) => {
        fechar(undefined);
        location.hash = `#/atividades/${id}`;
      };
      return h(
        'div',
        { class: 'fb rk', style: '--tom:var(--medalha-ouro)' },
        h(
          'header',
          { class: 'fb-topo' },
          h('span', { class: 'fb-esporte', 'aria-hidden': 'true' }, icone(cartao.icone ?? 'esporte', 26)),
          h(
            'div',
            { class: 'fb-topo-texto' },
            h('p', { class: 'fb-kicker' }, 'Top 10 do recorde'),
            h('h2', { class: 'fb-titulo' }, titulo),
            h('p', { class: 'fb-resumo' }, linhas.length > 0 ? `${linhas.length} ${linhas.length === 1 ? 'melhor atividade' : 'melhores atividades'}${esporteTexto ? ` · ${esporteTexto}` : ''}` : 'Sem atividades neste recorde.'),
          ),
          h('button', { type: 'button', class: 'fb-fechar', title: 'Fechar', 'aria-label': 'Fechar', onClick: () => fechar(undefined) }, icone('fechar', 20)),
        ),
        h('div', { class: 'fb-corpo rk-corpo' }, linhas.length > 0 ? tabela(cartao, linhas, abrirAtividade) : h('p', { class: 'texto-secundario' }, 'Nenhuma atividade tem esse dado no período escolhido.')),
        h('footer', { class: 'fb-rodape' }, h('span', { class: 'fb-rodape-espaco' }), h('button', { type: 'button', class: 'btn fb-salvar', onClick: () => fechar(undefined) }, 'Fechar')),
      );
    },
  });
}
