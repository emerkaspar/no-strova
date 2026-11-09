import { intervalsSincronizarAtividades, intervalsSituacao } from '../../core/functions.js';
import { areaMensagem, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { criarCampoDaChave } from '../plano/conexaoIntervals.js';
import { PERIODOS, plural, resumoSincronizacao, semNovidades } from './garmin.js';
import { secaoRecolhivel } from './secaoRecolhivel.js';

const LINK = (texto, href) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, texto);

/** Texto final: o resumo comum (importadas, sem FC, falhas) mais as atividades que o intervals.icu não consegue entregar. */
export function resumoDoIntervals(total, limitado) {
  const semArquivo = total.semArquivo ?? 0;
  if (semArquivo === 0) return resumoSincronizacao(total, limitado, 'Nenhuma atividade nova foi encontrada no período.');
  const aviso = `${plural(semArquivo, 'atividade ficou de fora por não ter', 'atividades ficaram de fora por não terem')} arquivo original no intervals.icu (as vindas do Strava não são entregues).`;
  const base = semNovidades(total) ? '' : `${resumoSincronizacao(total, limitado)} `;
  return `${base}${aviso}`;
}

/**
 * Sincroniza as atividades do intervals.icu, rodada a rodada, até terminar. `dias` omitido traz só o que é novo desde a última vez.
 * `aoProgresso` recebe os totais parciais a cada rodada.
 */
export async function sincronizarIntervals({ dias, aoProgresso } = {}) {
  const total = { importadas: 0, novasIds: [], jaExistiam: 0, semFc: 0, falhas: 0, semArquivo: 0, problemas: [] };
  let inicio = 0;
  let limitado = false;
  for (;;) {
    aoProgresso?.(total);
    const r = await intervalsSincronizarAtividades({ dias, inicio });
    for (const k of ['importadas', 'jaExistiam', 'semFc', 'falhas', 'semArquivo']) total[k] += r[k] ?? 0;
    total.novasIds.push(...(r.novasIds ?? []));
    total.problemas.push(...(r.problemas ?? []));
    inicio = r.proximo;
    limitado = r.limitado;
    if (r.terminou) break;
  }
  return { total, limitado };
}

/**
 * Cartão "intervals.icu · atividades": traz para o app os pedais que chegam ao intervals.icu, como os do aparelho IGPSPORT
 * (que tem integração oficial com o intervals.icu). A chave de API é a mesma usada no envio de treinos ao Garmin.
 */
export function criarCartaoIntervalsAtividades() {
  const corpo = h('div');
  const mensagem = areaMensagem();

  function desenharDesconectado() {
    corpo.replaceChildren(
      h(
        'ol',
        { class: 'texto-secundario' },
        h('li', null, 'Crie uma conta gratuita em ', LINK('intervals.icu', 'https://intervals.icu'), '.'),
        h('li', null, 'No app da IGPSPORT (celular), abra ', h('strong', null, 'Meu → Vincular com outros aplicativos'), ' e conecte o intervals.icu. Só os pedais feitos depois de vincular são enviados.'),
        h('li', null, 'No intervals.icu, em ', h('strong', null, 'Settings → Developer Settings'), ', gere e copie a ', h('strong', null, 'API Key'), '.'),
        h('li', null, 'Cole a chave abaixo. Ela fica guardada com criptografia.'),
      ),
      criarCampoDaChave({
        mensagem,
        idCampo: 'int-ativ-chave',
        aoConectado: async () => {
          desenhar(await intervalsSituacao());
          mensagem.mostrar('intervals.icu conectado. Escolha o período e sincronize.', 'ok');
        },
      }),
    );
  }

  function desenharConectado(s) {
    const status = h(
      'p',
      { class: 'texto-secundario' },
      `Conectado${s.atleta ? ` como ${s.atleta}` : ''}.`,
      s.ultimaSincronizacao ? ` Última sincronização em ${formatarData(s.ultimaSincronizacao.slice(0, 10))}.` : ' Ainda não sincronizou.',
    );
    const opcoes = s.ultimaSincronizacao ? [{ valor: '', rotulo: 'Só o que é novo desde a última vez' }, ...PERIODOS] : PERIODOS;
    const periodo = selecao({ id: 'int-ativ-periodo', rotulo: 'Período', valor: s.ultimaSincronizacao ? '' : '30', opcoes });
    const progresso = h('p', { class: 'texto-secundario', role: 'status' });
    const botao = h('button', { class: 'btn', type: 'button' }, 'Sincronizar agora');
    botao.addEventListener('click', () => {
      executarComBotao(
        botao,
        mensagem,
        async () => {
          const dias = periodo.select.value === '' ? undefined : Number(periodo.select.value);
          const { total, limitado } = await sincronizarIntervals({
            dias,
            aoProgresso: (t) => {
              progresso.textContent = `Sincronizando… ${plural(t.importadas, 'atividade importada', 'atividades importadas')}`;
            },
          }).finally(() => {
            progresso.textContent = '';
          });
          mensagem.mostrar(resumoDoIntervals(total, limitado), 'ok');
          desenhar(await intervalsSituacao());
        },
        'Sincronizando…',
      );
    });
    corpo.replaceChildren(status, h('div', { class: 'grid' }, periodo.raiz), progresso, h('div', { class: 'linha-botoes' }, botao));
  }

  function desenhar(s) {
    if (s.conectado) desenharConectado(s);
    else desenharDesconectado();
  }

  corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
  intervalsSituacao().then(desenhar, () => {
    corpo.replaceChildren();
    mensagem.mostrar('Não foi possível carregar o estado da conexão com o intervals.icu.');
  });

  const raiz = secaoRecolhivel({
    id: 'intervals-atividades',
    titulo: 'intervals.icu · atividades (IGPSPORT e outros)',
    corpo: [
      h(
        'p',
        { class: 'texto-secundario' },
        'Traga os pedais que chegam ao seu intervals.icu, como os gravados no aparelho IGPSPORT. A sincronização é feita só quando você clica no botão. Atividades do Strava não são entregues pelo intervals.icu.',
      ),
      mensagem.el,
      corpo,
    ],
  });
  return { raiz };
}
