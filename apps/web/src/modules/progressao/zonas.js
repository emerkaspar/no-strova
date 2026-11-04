import { distribuicaoPorZona, leituraDaDistribuicao, ROTULOS_DAS_ZONAS } from '@no-strova/domain';
import { completarAtividades } from '../../application/completarAtividades.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDuracao, formatarNumero } from '../../utils/formatters.js';

/** Escolhas do cartão, mantidas quando a tela de Progressão é redesenhada. */
const estadoZonas = { semanas: 12, esporte: '' };
const SEMANAS = Object.freeze([4, 8, 12, 26]);
const ESPORTES = Object.freeze([
  { id: '', rotulo: 'Todos' },
  { id: 'corrida', rotulo: 'Corrida' },
  { id: 'ciclismo', rotulo: 'Ciclismo' },
]);
const NOMES_DAS_FAIXAS = Object.freeze({ leve: 'Leve (Z1–Z2)', moderado: 'Moderado (Z3)', intenso: 'Intenso (Z4–Z5)' });

/** O cálculo do histórico roda sozinho uma vez por abertura do app; o botão serve para tentar de novo. */
let calculoAutomaticoIniciado = false;

const pct = (fracao) => `${formatarNumero(fracao * 100, 0)}%`;
const horas = (s) => (s >= 3600 ? `${formatarNumero(s / 3600, 1)} h` : `${Math.round(s / 60)} min`);

/**
 * Cartão "Tempo por zona": o tempo em Z1 a Z5 nas últimas semanas (uma coluna por semana), a divisão em leve, moderado e
 * intenso e uma leitura no espírito da regra 80/20. Só entram atividades importadas com FC; as antigas são completadas pelo
 * servidor (botão, ou sozinho uma vez por abertura do app).
 * @param {{ atividades: any[], hoje: string }} p
 */
export function criarCartaoZonas({ atividades, hoje }) {
  const raiz = h('section', { class: 'card zs-cartao', id: 'tempo-por-zona' });

  function chips(opcoes, atual, aoEscolher, rotulo) {
    return h(
      'div',
      { class: 'ia-dias', role: 'group', 'aria-label': rotulo },
      ...opcoes.map((o) =>
        h('button', { type: 'button', class: `ativ-chip${o.id === atual ? ' ativo' : ''}`, 'aria-pressed': String(o.id === atual), onClick: () => aoEscolher(o.id) }, o.rotulo),
      ),
    );
  }

  function avisoDePendentes(n) {
    const estado = h('span', { class: 'texto-secundario' });
    const botao = h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button' }, `Calcular o tempo por zona (${n} atividade${n === 1 ? '' : 's'})`);
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      estado.textContent = ' Calculando…';
      try {
        await completarAtividades((feitas) => {
          estado.textContent = ` Calculando… ${feitas} de ${n}`;
        });
        estado.textContent = ' Pronto.';
      } catch (err) {
        estado.textContent = ` ${err.message || 'Não foi possível calcular agora.'}`;
        botao.disabled = false;
      }
    });
    if (!calculoAutomaticoIniciado) {
      calculoAutomaticoIniciado = true;
      setTimeout(() => botao.click(), 0);
    }
    return h('p', { class: 'zs-pendentes' }, botao, estado);
  }

  function desenhar() {
    const d = distribuicaoPorZona(atividades, { hoje, semanas: estadoZonas.semanas, esporte: estadoZonas.esporte || null });
    const maior = Math.max(...d.semanas.map((s) => s.total), 1);
    const leitura = leituraDaDistribuicao(d.tres);

    const colunas = d.semanas.map((s) =>
      h(
        'div',
        { class: 'zs-semana', title: `Semana de ${formatarData(s.inicio).slice(0, 5)}: ${s.total > 0 ? ROTULOS_DAS_ZONAS.map((z, k) => `${z} ${formatarDuracao(s.segundos[k])}`).join(' · ') : 'sem treino com FC'}` },
        h(
          'div',
          { class: 'zs-pilha', role: 'img', 'aria-label': `Semana de ${formatarData(s.inicio).slice(0, 5)}: ${s.total > 0 ? horas(s.total) : 'sem treino'}` },
          ...[0, 1, 2, 3, 4].map((k) => (s.segundos[k] > 0 ? h('span', { class: `zs-seg zs-z${k + 1}`, style: `height:${(s.segundos[k] / maior) * 100}%` }) : null)),
        ),
        h('small', { class: 'zs-rotulo' }, formatarData(s.inicio).slice(0, 5)),
        h('small', { class: 'zs-total' }, s.total > 0 ? horas(s.total) : '—'),
      ),
    );

    // replaceChildren() escreve "null" na tela se receber null: os itens opcionais saem pelo filter
    raiz.replaceChildren(...[
      h('h2', null, 'Tempo por zona'),
      h('p', { class: 'texto-secundario' }, 'Quanto do seu treino fica em cada zona de FC, por semana. A regra 80/20 sugere cerca de 80% leve (Z1–Z2) e 20% moderado a intenso.'),
      h(
        'div',
        { class: 'zs-controles' },
        chips(SEMANAS.map((n) => ({ id: n, rotulo: `${n} sem` })), estadoZonas.semanas, (n) => {
          estadoZonas.semanas = n;
          desenhar();
        }, 'Semanas mostradas'),
        chips(ESPORTES, estadoZonas.esporte, (id) => {
          estadoZonas.esporte = id;
          desenhar();
        }, 'Esporte'),
      ),
      d.atividadesSemDados > 0 ? avisoDePendentes(d.atividadesSemDados) : null,
      d.totalS === 0
        ? h('p', { class: 'vazio-curto', role: 'status' }, 'Sem tempo por zona neste período. Só contam as atividades importadas de arquivo com frequência cardíaca e configuração de FC.')
        : h(
            'div',
            null,
            h('div', { class: 'zs-semanas', role: 'list' }, ...colunas),
            h(
              'div',
              { class: 'zs-legenda' },
              ...ROTULOS_DAS_ZONAS.map((z, k) => h('span', { class: 'zs-legenda-item' }, h('i', { class: `zs-z${k + 1}` }), `${z} · ${horas(d.segundos[k])} · ${pct(d.fracoes[k])}`)),
            ),
            h(
              'div',
              { class: 'zs-tres' },
              ...['leve', 'moderado', 'intenso'].map((f) => h('div', { class: `zs-faixa zs-faixa-${f}` }, h('strong', null, pct(d.tres[f])), h('span', { class: 'texto-secundario' }, NOMES_DAS_FAIXAS[f]))),
            ),
            leitura ? h('p', { class: `zs-leitura zs-leitura-${leitura.id}`, role: 'status' }, h('strong', null, `${leitura.rotulo}. `), leitura.texto) : null,
            h('p', { class: 'texto-secundario zs-nota' }, `Baseado em ${d.atividadesComDados} atividade${d.atividadesComDados === 1 ? '' : 's'} com FC nas últimas ${estadoZonas.semanas} semanas. As faixas seguem o seu LTHR.`),
          ),
    ].filter(Boolean));
  }

  desenhar();
  return raiz;
}
