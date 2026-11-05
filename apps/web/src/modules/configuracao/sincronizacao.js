import { garminSincronizar, stravaSincronizar } from '../../core/functions.js';
import { executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';

/** Parte comum da sincronização de atividades (Garmin e Strava): resumo, laço de lotes e o painel de quem já conectou. */

export const PERIODOS = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '60', rotulo: 'Últimos 60 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 6 meses' },
];

export function plural(n, singular, pluralTexto) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** Nada novo: nenhuma importada e nada que mereça aviso (sem FC ou falha). Os "já existiam" não interessam nesse caso. */
export function semNovidades(t) {
  return t.importadas === 0 && t.semFc === 0 && t.falhas === 0;
}

export function resumo(t, vazio = 'Nenhuma atividade foi encontrada no período.') {
  if (semNovidades(t)) return vazio;
  const partes = [];
  if (t.importadas > 0) {
    partes.push(plural(t.importadas, 'atividade importada', 'atividades importadas'));
    if (t.jaExistiam > 0) partes.push(`${t.jaExistiam} já existiam`);
  }
  if (t.semFc > 0) partes.push(`${plural(t.semFc, 'ficou de fora por não ter', 'ficaram de fora por não terem')} frequência cardíaca`);
  if (t.falhas > 0) partes.push(`${plural(t.falhas, 'não pôde ser lida', 'não puderam ser lidas')}`);
  return `${partes.join(' · ')}.${detalhesDosProblemas(t.problemas)}`;
}

const MAXIMO_DE_PROBLEMAS_LISTADOS = 5;

/** Quais atividades ficaram de fora e por quê ("Corrida em 04/11/2026: não tem frequência cardíaca"). */
function detalhesDosProblemas(problemas = []) {
  if (problemas.length === 0) return '';
  const lista = problemas.slice(0, MAXIMO_DE_PROBLEMAS_LISTADOS).map((p) => `${p.atividade}: ${p.motivo}`);
  const resto = problemas.length - lista.length;
  return ` Ficaram de fora → ${lista.join('; ')}${resto > 0 ? `; e mais ${resto}` : ''}.`;
}

/** Mensagem final de uma sincronização (resumo + aviso do limite por rodada). `vazio` é o texto de quando nada foi encontrado. */
export function resumoSincronizacao(total, limitado, vazio, limite = 200) {
  return `${resumo(total, vazio)}${limitado ? ` Foi atingido o limite de ${limite} atividades; sincronize de novo para continuar.` : ''}`;
}

const SINCRONIZADORES = { garmin: garminSincronizar, strava: stravaSincronizar };
/** Teto de atividades por sincronização em cada fonte (o do Strava é menor por causa do limite de consultas do app). */
export const LIMITE_POR_FONTE = { garmin: 200, strava: 100 };

/**
 * Sincroniza as atividades da fonte, rodada a rodada, até terminar. `dias` omitido traz só o que é novo desde a última vez.
 * `aoProgresso` recebe os totais parciais a cada rodada. Lança Error em português (o servidor valida a conexão).
 */
export async function sincronizarAtividades({ fonte, dias, aoProgresso }) {
  const sincronizar = SINCRONIZADORES[fonte];
  const total = { importadas: 0, jaExistiam: 0, semFc: 0, falhas: 0, problemas: [] };
  let inicio = 0;
  let limitado = false;
  for (;;) {
    aoProgresso?.(total);
    const r = await sincronizar({ dias, inicio });
    for (const k of ['importadas', 'jaExistiam', 'semFc', 'falhas']) total[k] += r[k];
    total.problemas.push(...(r.problemas ?? []));
    inicio = r.proximo;
    limitado = r.limitado;
    if (r.terminou) break;
  }
  return { total, limitado };
}

/**
 * Painel de quem já conectou: período, "Sincronizar agora" e "Desconectar". Devolve os nós para o corpo do cartão.
 * `aoSincronizado` e `aoDesconectar` deixam o cartão redesenhar. `situacao.ultimaSincronizacao` decide se há "só o novo".
 */
export function painelConectado({ fonte, nome, status, ultimaSincronizacao, mensagem, aoSincronizado, desconectar, aoDesconectar, avisoAoDesconectar }) {
  const opcoes = ultimaSincronizacao ? [{ valor: '', rotulo: 'Só o que é novo desde a última vez' }, ...PERIODOS] : PERIODOS;
  const periodo = selecao({ id: `${fonte}-periodo`, rotulo: 'Período', valor: ultimaSincronizacao ? '' : '30', opcoes });
  const progresso = h('p', { class: 'texto-secundario', role: 'status' });

  const botao = h('button', { class: 'btn', type: 'button' }, 'Sincronizar agora');
  botao.addEventListener('click', () => {
    executarComBotao(
      botao,
      mensagem,
      async () => {
        const dias = periodo.select.value === '' ? undefined : Number(periodo.select.value);
        const { total, limitado } = await sincronizarAtividades({
          fonte,
          dias,
          aoProgresso: (t) => {
            progresso.textContent = `Sincronizando… ${plural(t.importadas, 'atividade importada', 'atividades importadas')}`;
          },
        }).finally(() => {
          progresso.textContent = '';
        });
        mensagem.mostrar(resumoSincronizacao(total, limitado, undefined, LIMITE_POR_FONTE[fonte]), 'ok');
        await aoSincronizado();
      },
      'Sincronizando…',
    );
  });

  const botaoDesconectar = h('button', { class: 'btn btn-perigo', type: 'button' }, 'Desconectar');
  botaoDesconectar.addEventListener('click', () => {
    if (!confirm(`Desconectar o ${nome}? ${avisoAoDesconectar} As atividades já importadas continuam no app.`)) return;
    executarComBotao(botaoDesconectar, mensagem, async () => {
      await desconectar();
      mensagem.limpar();
      aoDesconectar();
    });
  });

  return [status, h('div', { class: 'grid' }, periodo.raiz), progresso, h('div', { class: 'linha-botoes' }, botao, botaoDesconectar)];
}
