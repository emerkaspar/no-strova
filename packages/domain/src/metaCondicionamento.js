import { diasEntre } from './forma.js';
import { dataIsoValida } from './usuarios.js';

/**
 * Meta de Condicionamento: "chegar com Condicionamento X na data Y". É a meta principal do plano (o Condicionamento
 * é a média móvel de 42 dias do estresse e sobe com treino consistente); a meta de Forma é complementar.
 * Funções puras, sem Firebase e sem DOM.
 */
export const LIMITES_META_CONDICIONAMENTO = Object.freeze({ min: 1, max: 250 });
/** O plano "chega lá" se o Condicionamento projetado fica a até 3 pontos do alvo. */
export const TOLERANCIA_META_CONDICIONAMENTO = 3;
/** Aumento sustentável: acima de 7 pontos de Condicionamento por semana, o app avisa que a meta é agressiva. */
export const RITMO_MAXIMO_SEMANAL = 7;

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Valida o formulário da meta de Condicionamento.
 * @param {{ condicionamentoAlvo: unknown, dataAlvo: unknown }} entrada
 * @param {string} hoje yyyy-mm-dd
 * @returns {{ valido: boolean, erros: string[], valores: { condicionamentoAlvo: number, dataAlvo: string }|null }}
 */
export function validarMetaCondicionamento(entrada, hoje) {
  const erros = [];
  const alvo = numero(entrada?.condicionamentoAlvo);
  const { min, max } = LIMITES_META_CONDICIONAMENTO;
  if (alvo === null || alvo < min || alvo > max) erros.push(`Informe o Condicionamento desejado, de ${min} a ${max}.`);
  const data = entrada?.dataAlvo;
  if (!dataIsoValida(data)) erros.push('Informe a data da meta.');
  else if (data < hoje) erros.push('A data da meta não pode estar no passado.');
  else if (diasEntre(hoje, data) > 365) erros.push('A data da meta deve ficar nos próximos 365 dias.');
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { condicionamentoAlvo: Math.round(alvo * 10) / 10, dataAlvo: data } };
}

/**
 * Compara o Condicionamento do dia da meta (projetado, se a data é futura) com o alvo e calcula o ritmo.
 *  - `atinge`: dentro de ±3 pontos; `abaixo`: o plano entrega menos que o alvo (falta carga); `acima`: entrega mais;
 *  - `sem-dados`: a série não cobre a data da meta;
 *  - `ritmoNecessario` / `ritmoDoPlano`: pontos de Condicionamento por semana, de hoje até a data da meta, para
 *    chegar ao alvo e o que o plano atual entrega; `agressiva`: o ritmo necessário passa de 7 por semana.
 * @param {Array<{ data: string, fitness: number }>} serie com hoje e a projeção
 * @param {{ condicionamentoAlvo: number, dataAlvo: string }|null|undefined} meta
 * @param {string} hoje
 */
export function avaliarMetaCondicionamento(serie, meta, hoje) {
  if (!meta) return null;
  const dias = diasEntre(hoje, meta.dataAlvo);
  const base = { condicionamentoAlvo: meta.condicionamentoAlvo, dataAlvo: meta.dataAlvo, dias };
  const dia = serie.find((d) => d.data === meta.dataAlvo);
  const atual = serie.find((d) => d.data === hoje)?.fitness ?? null;
  if (!dia) return { ...base, estado: 'sem-dados', condicionamentoAtual: atual, condicionamentoProjetado: null, diferenca: null, ritmoNecessario: null, ritmoDoPlano: null, agressiva: false };

  const diferenca = dia.fitness - meta.condicionamentoAlvo;
  const estado = Math.abs(diferenca) <= TOLERANCIA_META_CONDICIONAMENTO ? 'atinge' : diferenca < 0 ? 'abaixo' : 'acima';
  const semanas = dias / 7;
  const temRitmo = semanas > 0 && atual !== null;
  const ritmoNecessario = temRitmo ? (meta.condicionamentoAlvo - atual) / semanas : null;
  return {
    ...base,
    estado,
    condicionamentoAtual: atual,
    condicionamentoProjetado: dia.fitness,
    diferenca,
    ritmoNecessario,
    ritmoDoPlano: temRitmo ? (dia.fitness - atual) / semanas : null,
    agressiva: ritmoNecessario !== null && ritmoNecessario > RITMO_MAXIMO_SEMANAL,
  };
}

/**
 * Progresso até o alvo, de 0 a 1: o Condicionamento de hoje dividido pelo alvo (ex.: 3,1 de 30,0 = 10%). Null quando
 * não dá para medir (valor ausente ou alvo sem sentido).
 */
export function progressoDaMetaCondicionamento({ condicionamentoAtual, condicionamentoAlvo }) {
  if (![condicionamentoAtual, condicionamentoAlvo].every(Number.isFinite) || condicionamentoAlvo <= 0) return null;
  return Math.min(1, Math.max(0, condicionamentoAtual / condicionamentoAlvo));
}
