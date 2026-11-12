/**
 * Feedback subjetivo da atividade ("Como foi?"): sensação, esforço percebido (RPE), etiquetas e notas.
 * Funções puras: validação do que o usuário envia e resumo recente, usado pela IA e pela sugestão de treinos.
 */
import { dataIsoValida } from './usuarios.js';

/**
 * Escala de sensação, vista como a "bateria" que sobrou depois do treino: 1 = cheia, 5 = vazia.
 * O `id` é o nome do ícone em utils/icones.js. O `efeito` diz ao usuário o que isso muda no plano
 * (espelha `fatorDeCargaPorFeedback`: só reduz a carga, nunca aumenta).
 */
export const SENSACOES = Object.freeze([
  Object.freeze({ valor: 1, id: 'sensacaoBateria1', rotulo: 'Sobrando', dica: 'Terminei com energia de sobra', efeito: 'O plano segue como está.' }),
  Object.freeze({ valor: 2, id: 'sensacaoBateria2', rotulo: 'Bem', dica: 'Fluiu bem', efeito: 'O plano segue como está.' }),
  Object.freeze({ valor: 3, id: 'sensacaoBateria3', rotulo: 'No ponto', dica: 'Esforço na medida', efeito: 'O plano segue como está.' }),
  Object.freeze({ valor: 4, id: 'sensacaoBateria4', rotulo: 'Puxado', dica: 'Custou mais do que o normal', efeito: 'Se repetir, o plano alivia a carga dos próximos treinos.' }),
  Object.freeze({ valor: 5, id: 'sensacaoBateria5', rotulo: 'Esgotado', dica: 'Mal consegui terminar', efeito: 'Se repetir, o plano alivia a carga e dá mais descanso.' }),
]);

export const ETIQUETAS = Object.freeze([
  Object.freeze({ id: 'calor', rotulo: 'Calor' }),
  Object.freeze({ id: 'frio', rotulo: 'Frio' }),
  Object.freeze({ id: 'sono-ruim', rotulo: 'Sono ruim' }),
  Object.freeze({ id: 'perna-pesada', rotulo: 'Perna pesada' }),
  Object.freeze({ id: 'cansaco', rotulo: 'Cansaço' }),
  Object.freeze({ id: 'dor', rotulo: 'Dor' }),
  Object.freeze({ id: 'em-grupo', rotulo: 'Em grupo' }),
  Object.freeze({ id: 'ritmo-livre', rotulo: 'Ritmo livre' }),
]);

export const ETIQUETAS_VALIDAS = Object.freeze(ETIQUETAS.map((e) => e.id));

export const LIMITES_FEEDBACK = Object.freeze({ notas: 500, dor: 40 });

/** Sensação a partir da qual o treino conta como "difícil" para a IA. */
const SENSACAO_DIFICIL = 4;
/** Janela (dias) do resumo recente enviado à IA. */
export const JANELA_FEEDBACK_DIAS = 14;

function inteiroEntre(valor, minimo, maximo) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isInteger(n) && n >= minimo && n <= maximo ? n : null;
}

function textoLimpo(valor) {
  return typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Valida o feedback enviado pelo cliente.
 * @returns {{ valido: boolean, erros: string[], valores: { sensacao: number, rpe: number|null, etiquetas: string[], dor: string|null, notas: string|null }|null }}
 */
export function validarFeedback(entrada) {
  const erros = [];
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { valido: false, erros: ['Feedback inválido.'], valores: null };
  }

  const sensacao = inteiroEntre(entrada.sensacao, 1, SENSACOES.length);
  if (sensacao === null) erros.push('Escolha como foi a sensação.');

  let rpe = null;
  if (entrada.rpe !== undefined && entrada.rpe !== null && entrada.rpe !== '') {
    rpe = inteiroEntre(entrada.rpe, 1, 10);
    if (rpe === null) erros.push('O esforço percebido vai de 1 a 10.');
  }

  let etiquetas = [];
  if (entrada.etiquetas !== undefined && entrada.etiquetas !== null) {
    if (!Array.isArray(entrada.etiquetas) || entrada.etiquetas.some((e) => !ETIQUETAS_VALIDAS.includes(e))) {
      erros.push('Etiqueta inválida.');
    } else {
      etiquetas = ETIQUETAS_VALIDAS.filter((id) => entrada.etiquetas.includes(id));
    }
  }

  const dor = textoLimpo(entrada.dor);
  if (dor.length > LIMITES_FEEDBACK.dor) erros.push(`O local da dor pode ter no máximo ${LIMITES_FEEDBACK.dor} caracteres.`);
  const notas = textoLimpo(entrada.notas);
  if (notas.length > LIMITES_FEEDBACK.notas) erros.push(`As notas podem ter no máximo ${LIMITES_FEEDBACK.notas} caracteres.`);

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return {
    valido: true,
    erros,
    valores: {
      sensacao,
      rpe,
      etiquetas,
      // o local da dor só vale com a etiqueta "dor"
      dor: etiquetas.includes('dor') && dor !== '' ? dor : null,
      notas: notas === '' ? null : notas,
    },
  };
}

/**
 * Resumo do feedback recente, para o contexto da IA e para a sugestão sem IA.
 * @param {Array<{ data: string, feedback?: { sensacao: number, rpe?: number|null, etiquetas?: string[], dor?: string|null } }>} atividades
 * @param {string} hoje yyyy-mm-dd
 * @param {number} [janelaDias]
 * @returns {null | { registros: number, sensacaoMedia: number, rpeMedio: number|null, ultimoDificil: string|null, treinosDificeis: number, dorRecorrente: boolean, locaisDeDor: string[], etiquetasFrequentes: string[] }}
 */
export function resumirFeedbacks(atividades, hoje, janelaDias = JANELA_FEEDBACK_DIAS) {
  if (!Array.isArray(atividades) || !dataIsoValida(hoje)) return null;
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - janelaDias);
  const desde = limite.toISOString().slice(0, 10);

  const recentes = atividades
    .filter((a) => a?.feedback && Number.isInteger(a.feedback.sensacao) && dataIsoValida(a.data) && a.data >= desde && a.data <= hoje)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  if (recentes.length === 0) return null;

  const media = (valores) => (valores.length === 0 ? null : Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10);
  const dificeis = recentes.filter((a) => a.feedback.sensacao >= SENSACAO_DIFICIL);
  const comDor = recentes.filter((a) => a.feedback.etiquetas?.includes('dor'));

  const contagem = new Map();
  for (const a of recentes) for (const e of a.feedback.etiquetas ?? []) if (e !== 'dor') contagem.set(e, (contagem.get(e) ?? 0) + 1);

  return {
    registros: recentes.length,
    sensacaoMedia: media(recentes.map((a) => a.feedback.sensacao)),
    rpeMedio: media(recentes.map((a) => a.feedback.rpe).filter(Number.isInteger)),
    ultimoDificil: dificeis[0]?.data ?? null,
    treinosDificeis: dificeis.length,
    dorRecorrente: comDor.length >= 2,
    locaisDeDor: [...new Set(comDor.map((a) => a.feedback.dor).filter(Boolean))].slice(0, 5),
    etiquetasFrequentes: [...contagem.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id),
  };
}

/**
 * Ajuste de carga sugerido pelo feedback recente (fator sobre a carga prevista), ou null se não há motivo.
 * Dor repetida ou sensação média alta reduzem; sensação média muito boa não aumenta (o ganho segue a regra dos 10%).
 */
export function fatorDeCargaPorFeedback(resumo) {
  if (!resumo || resumo.registros < 2) return null;
  if (resumo.dorRecorrente) return 0.75;
  if (resumo.sensacaoMedia >= 4) return 0.85;
  if (resumo.sensacaoMedia >= 3.5 || (resumo.rpeMedio !== null && resumo.rpeMedio >= 8)) return 0.92;
  return null;
}
