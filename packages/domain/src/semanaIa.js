import { NIVEIS } from './treinosEstruturados.js';
import { diaDaSemana, NOMES_DIA } from './semana.js';

/**
 * Semana de treinos gerada automaticamente pela IA (domingo às 20h, America/Sao_Paulo), para quem liga
 * `preferencias.planoIaAutomatico`. Regras puras: o servidor monta o contexto e grava; o app só mostra.
 */

/** Dia da semana (0 = segunda … 6 = domingo) e hora em que a rotina roda. */
export const DIA_DA_SEMANA_IA = 6;
export const HORA_SEMANA_IA = 20;

const NIVEL_EM_TEXTO = (nivel) => (NIVEIS[nivel] ?? NIVEIS.intermediario).toLowerCase();

const dataBr = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const diaCurto = (iso) => NOMES_DIA[diaDaSemana(iso)].slice(0, 3);

/** "ter, quin e sáb" → lista de dias em português ("terça, quinta e sábado"). */
export function listaEmPortugues(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * O que foi levado em consideração na escolha dos treinos, em frases curtas (vai para o push, para a central e para a tela).
 * Só fala do que existe: sem feedback ou sem histórico, a frase correspondente não aparece.
 * @param {{
 *   nivel: string,
 *   estado?: { condicionamento: number, fadiga: number, forma: number }|null,
 *   cargaBase?: number,
 *   feedback?: { registros: number, sensacaoMedia: number|null, rpeMedio: number|null, dorRecorrente: boolean, treinosDificeis: number }|null,
 *   diasDeTreino?: number[], diaLongao?: number|null, horasPorSemana?: number,
 *   ocupados?: string[], avisos?: string[]
 * }} ctx
 * @returns {string[]}
 */
export function consideracoesDaSemana(ctx) {
  const saida = [];
  saida.push(`Seu nível: ${NIVEL_EM_TEXTO(ctx.nivel)}.`);
  const dias = (ctx.diasDeTreino ?? []).map((d) => NOMES_DIA[d]).filter(Boolean);
  if (dias.length > 0) {
    const longao = ctx.diaLongao === null || ctx.diaLongao === undefined ? '' : `, com o longão de ${NOMES_DIA[ctx.diaLongao]}`;
    const horas = ctx.horasPorSemana ? ` e até ${ctx.horasPorSemana} h por semana` : '';
    saida.push(`Seus dias de treino (${listaEmPortugues(dias)})${longao}${horas}.`);
  }
  if (ctx.estado) {
    const forma = ctx.estado.forma;
    const leitura = forma <= -10 ? 'cansado (Forma negativa)' : forma >= 5 ? 'descansado (Forma positiva)' : 'em equilíbrio entre carga e descanso';
    saida.push(`Sua condição hoje: ${leitura}, com Condicionamento ${Math.round(ctx.estado.condicionamento)}.`);
  }
  if (ctx.cargaBase && ctx.cargaBase > 0) saida.push(`Sua carga das últimas semanas: cerca de ${Math.round(ctx.cargaBase)} de HRSS por semana, subindo no máximo 10%.`);
  const f = ctx.feedback;
  if (f && f.registros > 0) {
    if (f.dorRecorrente) saida.push('Você relatou dor em mais de um treino recente, então a semana ficou mais leve.');
    else if (f.sensacaoMedia !== null && f.sensacaoMedia >= 3.5) saida.push('Seus últimos treinos foram pesados para você (Como foi?), então a carga foi reduzida.');
    else if (f.sensacaoMedia !== null) saida.push('Você tem se sentido bem nos últimos treinos (Como foi?), então a progressão seguiu normal.');
  }
  if ((ctx.ocupados ?? []).length > 0) saida.push(`Dias que você já tinha planejado foram mantidos (${ctx.ocupados.length}).`);
  return saida;
}

/**
 * Título e texto do push da semana. `itens`: `{ data, nome, duracaoMin }`, em qualquer ordem.
 * Cabe num push: os treinos (um por dia) e os dois primeiros motivos da escolha.
 * @returns {{ titulo: string, mensagem: string }}
 */
export function textoDoAvisoDaSemana({ itens, consideracoes }) {
  const ordenados = [...itens].sort((a, b) => (a.data < b.data ? -1 : 1));
  const n = ordenados.length;
  const titulo = n === 1 ? 'Sua semana de treino: 1 treino montado pela IA' : `Sua semana de treino: ${n} treinos montados pela IA`;
  const lista = ordenados.map((i) => `${diaCurto(i.data)} ${dataBr(i.data)}: ${i.nome}`).join(' · ');
  const porque = (consideracoes ?? []).slice(1, 3).join(' ');
  return { titulo, mensagem: `${lista}.${porque ? ` ${porque}` : ''}`.slice(0, 480) };
}
