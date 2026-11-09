import { intervalsSincronizarAtividades, intervalsSituacao } from '../../core/functions.js';
import { areaMensagem, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { criarCampoDaChave, criarGuiaConector } from '../plano/conexaoIntervals.js';
import { PERIODOS, plural, resumoSincronizacao, semNovidades } from './garmin.js';
import { secaoRecolhivel } from './secaoRecolhivel.js';

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
      criarGuiaConector(),
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

  /** A chave foi recusada: a sincronização automática parou até o usuário reconectar com uma chave válida. */
  function desenharChaveRecusada(s) {
    corpo.replaceChildren(
      h('p', { class: 'mensagem mensagem-erro', role: 'alert' }, `O intervals.icu recusou a chave${s.atleta ? ` de ${s.atleta}` : ''}. A sincronização automática está parada.`),
      h('p', { class: 'texto-secundario' }, 'No intervals.icu, em Settings → Developer Settings, gere a API Key de novo e cole abaixo para reconectar.'),
      criarCampoDaChave({
        mensagem,
        idCampo: 'int-ativ-chave',
        aoConectado: async () => {
          desenhar(await intervalsSituacao());
          mensagem.mostrar('intervals.icu reconectado. A sincronização automática voltou.', 'ok');
        },
      }),
    );
  }

  function textoDaRodadaAutomatica(auto) {
    const r = auto.resultado;
    const partes = [plural(r.importadas ?? 0, 'atividade importada', 'atividades importadas')];
    if (r.semFc > 0) partes.push(`${r.semFc} sem frequência cardíaca`);
    if (r.falhas > 0) partes.push(`${plural(r.falhas, 'falha', 'falhas')}`);
    return ` Última rodada automática em ${formatarData(auto.em.slice(0, 10))}: ${partes.join(', ')}.`;
  }

  function desenharConectado(s) {
    if (s.status === 'chaveInvalida') {
      desenharChaveRecusada(s);
      return;
    }
    const status = h(
      'p',
      { class: 'texto-secundario' },
      `Conectado${s.atleta ? ` como ${s.atleta}` : ''}. A sincronização é automática: roda todo dia de manhã e traz o que chegou ao intervals.icu.`,
      s.ultimaSincronizacao ? ` Última sincronização em ${formatarData(s.ultimaSincronizacao.slice(0, 10))}.` : ' Ainda não sincronizou.',
      s.ultimaAutomatica ? textoDaRodadaAutomatica(s.ultimaAutomatica) : '',
    );
    const opcoes = s.ultimaSincronizacao ? [{ valor: '', rotulo: 'Só o que é novo desde a última vez' }, ...PERIODOS] : PERIODOS;
    const periodo = selecao({ id: 'int-ativ-periodo', rotulo: 'Período', valor: s.ultimaSincronizacao ? '' : '30', opcoes });
    const progresso = h('p', { class: 'texto-secundario', role: 'status' });
    const botao = h('button', { class: 'btn', type: 'button' }, 'Forçar atualização agora');
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
    titulo: 'intervals.icu · conector de atividades',
    corpo: [
      h(
        'p',
        { class: 'texto-secundario' },
        'O intervals.icu é o conector oficial do No Strova: tudo que chega a ele (aparelhos IGPSPORT, Garmin, Wahoo, Coros, Zwift e outros) vem para cá sozinho, todo dia, e você pode forçar uma atualização quando quiser. Atividades do Strava não são entregues pelo intervals.icu.',
      ),
      mensagem.el,
      corpo,
    ],
  });
  return { raiz };
}
