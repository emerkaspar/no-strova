import { NOMES_DIA } from './semana.js';

/**
 * Guia de alimentação (reeducação alimentar). A IA só sugere; tudo o que ela devolve passa por aqui antes de ser mostrado.
 * Funções puras, sem Firebase e sem DOM.
 */

export const AVISO_ALIMENTACAO = 'Sugestão gerada por IA, em linhas gerais. Não substitui orientação de médico ou nutricionista.';

export const OBJETIVOS_ALIMENTARES = Object.freeze({ emagrecer: 'Emagrecer', manter: 'Manter o peso', ganhar: 'Ganhar massa' });

export const BLOCOS_ALIMENTARES = Object.freeze({
  levar: 'Lanche para levar',
  padaria: 'Lanche na padaria',
  casa: 'Receita para fazer em casa',
});

export const TIPOS_DE_SABOR = Object.freeze(['salgado', 'doce']);

export const EQUIPAMENTOS = Object.freeze(['torradeira', 'geladeira', 'fogao', 'forno', 'nenhum']);

export const LIMITES_ALIMENTACAO = Object.freeze({
  restricoesMax: 20,
  restricaoMax: 40,
  contextoMax: 600,
  refeicoesMin: 3,
  refeicoesMax: 6,
  itensDia: 6,
  itensSemana: 21,
  ingredientesMax: 15,
  passosMax: 8,
});

/** Contexto inicial do perfil (editável na tela). */
export const CONTEXTO_ALIMENTAR_PADRAO =
  'Trabalho em escritório, com torradeira e geladeira. Há uma padaria perto do trabalho. Em casa gosto de cozinhar e sei cozinhar, mas preciso das receitas. ' +
  'Gosto de todas as frutas, mas quero variar. Alternar salgado e doce.';

export const PERFIL_ALIMENTAR_PADRAO = Object.freeze({
  objetivo: 'manter',
  usarMetaDePeso: true,
  restricoes: Object.freeze([]),
  contexto: CONTEXTO_ALIMENTAR_PADRAO,
  refeicoesPorDia: 5,
});

const colapsar = (s) => s.trim().replace(/\s+/g, ' ');
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function inteiro(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

/**
 * Valida o perfil alimentar. `restricoes` aceita lista ou texto separado por vírgula ou quebra de linha.
 * @returns {{ valido: boolean, erros: string[], valores: { objetivo: string, usarMetaDePeso: boolean, restricoes: string[], contexto: string, refeicoesPorDia: number }|null }}
 */
export function validarPerfilAlimentar(entrada) {
  const L = LIMITES_ALIMENTACAO;
  const erros = [];
  const objetivo = entrada?.objetivo ?? PERFIL_ALIMENTAR_PADRAO.objetivo;
  if (!Object.hasOwn(OBJETIVOS_ALIMENTARES, objetivo)) erros.push('Escolha um objetivo: emagrecer, manter ou ganhar massa.');
  const usarMetaDePeso = entrada?.usarMetaDePeso === undefined ? PERFIL_ALIMENTAR_PADRAO.usarMetaDePeso : entrada.usarMetaDePeso;
  if (typeof usarMetaDePeso !== 'boolean') erros.push('Informe se o objetivo deve seguir a meta de peso.');

  const bruto = Array.isArray(entrada?.restricoes) ? entrada.restricoes : typeof entrada?.restricoes === 'string' ? entrada.restricoes.split(/[,\n;]/) : [];
  const restricoes = [...new Set(bruto.filter((r) => typeof r === 'string').map(colapsar).filter(Boolean))];
  if (restricoes.length > L.restricoesMax) erros.push(`Informe no máximo ${L.restricoesMax} restrições.`);
  if (restricoes.some((r) => r.length > L.restricaoMax)) erros.push(`Cada restrição pode ter até ${L.restricaoMax} caracteres.`);

  const contexto = typeof entrada?.contexto === 'string' ? colapsar(entrada.contexto) : PERFIL_ALIMENTAR_PADRAO.contexto;
  if (contexto.length > L.contextoMax) erros.push(`O contexto pode ter até ${L.contextoMax} caracteres.`);

  const refeicoes = entrada?.refeicoesPorDia === undefined ? PERFIL_ALIMENTAR_PADRAO.refeicoesPorDia : inteiro(entrada.refeicoesPorDia);
  if (refeicoes === null || refeicoes < L.refeicoesMin || refeicoes > L.refeicoesMax) erros.push(`Informe de ${L.refeicoesMin} a ${L.refeicoesMax} refeições por dia.`);

  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { objetivo, usarMetaDePeso, restricoes, contexto, refeicoesPorDia: refeicoes } };
}

/**
 * Objetivo que vale hoje: com `usarMetaDePeso`, a meta de peso ativa decide (perder = emagrecer, ganhar = ganhar); sem meta
 * ou sem a opção, vale o objetivo escolhido.
 * @param {{ objetivo: string, usarMetaDePeso?: boolean }} perfil
 * @param {boolean|null} perderPeso true se a meta pede perder, false se pede ganhar, null sem meta
 */
export function objetivoEfetivo(perfil, perderPeso) {
  if (perfil?.usarMetaDePeso !== false && perderPeso !== null && perderPeso !== undefined) return perderPeso ? 'emagrecer' : 'ganhar';
  return Object.hasOwn(OBJETIVOS_ALIMENTARES, perfil?.objetivo) ? perfil.objetivo : 'manter';
}

const ORIENTACAO_DO_DIA = Object.freeze({
  descanso: { rotulo: 'Dia de descanso', orientacao: 'Sem treino: refeições leves e completas, com proteína e fibras; sem precisar de carboidrato extra.' },
  recuperacao: { rotulo: 'Dia de recuperação', orientacao: 'Treino forte recente ou corpo cansado: priorize proteína, carboidrato de boa qualidade e hidratação para recuperar.' },
  leve: { rotulo: 'Treino leve', orientacao: 'Treino curto ou leve: alimentação equilibrada, sem exagerar na energia extra.' },
  moderado: { rotulo: 'Treino moderado', orientacao: 'Treino de bom volume: inclua carboidrato antes do treino e proteína depois.' },
  pesado: { rotulo: 'Treino forte', orientacao: 'Treino longo ou intenso: mais carboidrato antes e depois, proteína na recuperação e muita água.' },
});

/** Rótulo e orientação de um tipo de dia (para mostrar a sugestão salva), ou null se o tipo for desconhecido. */
export function orientacaoDoTipoDeDia(tipo) {
  return Object.hasOwn(ORIENTACAO_DO_DIA, tipo) ? ORIENTACAO_DO_DIA[tipo] : null;
}

/**
 * Classifica o dia para orientar a comida, pelos treinos de hoje e pelo estado do corpo.
 * @param {{ treinosHoje?: Array<{ duracaoMin?: number|null, zona?: string|null }>, estresseOntem?: number|null, forma?: number|null, sonoMediaHoras?: number|null }} p
 * @returns {{ tipo: 'descanso'|'recuperacao'|'leve'|'moderado'|'pesado', rotulo: string, orientacao: string, motivo: string }}
 */
export function tipoDeDia({ treinosHoje = [], estresseOntem = null, forma = null, sonoMediaHoras = null } = {}) {
  const minutos = treinosHoje.reduce((s, t) => s + (Number(t?.duracaoMin) > 0 ? Number(t.duracaoMin) : 0), 0);
  const intenso = treinosHoje.some((t) => ['Z4', 'Z5'].includes(String(t?.zona)));
  const cansado = (forma !== null && forma < -15) || (estresseOntem !== null && estresseOntem >= 100);
  const dormiuPouco = sonoMediaHoras !== null && sonoMediaHoras < 6.5;
  let tipo;
  if (minutos === 0) tipo = cansado ? 'recuperacao' : 'descanso';
  else if (minutos >= 90 || (intenso && minutos >= 45)) tipo = 'pesado';
  else if (minutos >= 45) tipo = 'moderado';
  else tipo = 'leve';
  const partes = [];
  if (minutos > 0) partes.push(`${Math.round(minutos)} min de treino previstos${intenso ? ', com parte intensa' : ''}`);
  if (cansado) partes.push('corpo cansado pelos últimos treinos');
  if (dormiuPouco) partes.push('sono curto na semana');
  return { tipo, ...ORIENTACAO_DO_DIA[tipo], motivo: partes.join('; ') };
}

const FRUTAS = new Set(
  ['banana', 'maca', 'pera', 'laranja', 'mexerica', 'tangerina', 'uva', 'morango', 'melancia', 'melao', 'mamao', 'abacaxi', 'manga', 'kiwi', 'goiaba', 'ameixa', 'caqui', 'pessego', 'cereja', 'limao', 'abacate', 'acerola', 'caju', 'figo', 'framboesa', 'mirtilo', 'fruta', 'frutas'].map(normalizar),
);

/** true se o item é "só fruta": todos os ingredientes são frutas. */
function soFruta(item) {
  return item.ingredientes.length > 0 && item.ingredientes.every((i) => normalizar(i).split(/[^a-z]+/).some((p) => FRUTAS.has(p)));
}

const PROMESSA = /\b(cura|curar|milagr\w*|detox|queima[- ]?gordura|emagre[cç]\w* (em|de) \d+|jejum de \d+)\b/i;

function textoCurto(v, max) {
  return typeof v === 'string' ? colapsar(v).slice(0, max) : '';
}

function listaDeTextos(v, maxItens, maxTexto) {
  return Array.isArray(v) ? v.map((t) => textoCurto(t, maxTexto)).filter(Boolean).slice(0, maxItens) : [];
}

/**
 * Confere a saída da IA. Descarta itens inválidos, repetidos, que citam uma restrição ou que prometem efeito médico, e avisa
 * quando falta variedade (só salgado, só doce ou fruta demais).
 * @param {any} saida `{ resumo, itens: [{ bloco, dia?, nome, tipo, porQue, tempoMin, ingredientes, preparo, equipamento, vespera }] }`
 * @param {{ escopo: 'dia'|'semana', restricoes?: string[] }} contexto
 * @returns {{ valido: boolean, resumo: string, itens: any[], avisos: string[], aviso: string }}
 */
export function validarSugestaoAlimentar(saida, { escopo = 'dia', restricoes = [] } = {}) {
  const L = LIMITES_ALIMENTACAO;
  const avisos = [];
  const proibidos = restricoes.map(normalizar).filter((r) => r.length >= 3);
  const vistos = new Set();
  const itens = [];
  let descartadosPorRestricao = 0;
  const maximo = escopo === 'semana' ? L.itensSemana : L.itensDia;

  for (const bruto of Array.isArray(saida?.itens) ? saida.itens : []) {
    const nome = textoCurto(bruto?.nome, 80);
    const bloco = bruto?.bloco;
    const tipo = bruto?.tipo;
    if (nome.length < 2 || !Object.hasOwn(BLOCOS_ALIMENTARES, bloco) || !TIPOS_DE_SABOR.includes(tipo)) continue;
    const ingredientes = listaDeTextos(bruto?.ingredientes, L.ingredientesMax, 80);
    const preparo = listaDeTextos(bruto?.preparo, L.passosMax, 240);
    if (ingredientes.length === 0) continue;
    if (bloco !== 'padaria' && preparo.length === 0) continue; // receita sem modo de fazer não serve
    const dia = escopo === 'semana' ? (NOMES_DIA.find((n) => n === String(bruto?.dia ?? '').trim().toLowerCase()) ?? null) : null;
    if (escopo === 'semana' && !dia) continue;
    const chave = `${dia ?? ''}|${bloco}|${normalizar(nome)}`;
    if (vistos.has(chave)) continue;
    const texto = normalizar([nome, ...ingredientes].join(' '));
    if (proibidos.some((p) => texto.includes(p))) {
      descartadosPorRestricao += 1;
      continue;
    }
    const porQue = textoCurto(bruto?.porQue, 220);
    if (PROMESSA.test(`${nome} ${porQue} ${preparo.join(' ')}`)) continue;
    const tempo = Number(bruto?.tempoMin);
    const equipamento = [...new Set((Array.isArray(bruto?.equipamento) ? bruto.equipamento : []).filter((e) => EQUIPAMENTOS.includes(e)))];
    vistos.add(chave);
    itens.push({
      bloco,
      ...(dia ? { dia } : {}),
      nome,
      tipo,
      porQue,
      tempoMin: Number.isFinite(tempo) && tempo >= 0 ? Math.min(Math.round(tempo), 180) : null,
      ingredientes,
      preparo,
      equipamento: equipamento.length > 0 ? equipamento : ['nenhum'],
      vespera: bruto?.vespera === true,
    });
    if (itens.length >= maximo) break;
  }

  if (descartadosPorRestricao > 0) avisos.push(`${descartadosPorRestricao} sugestão(ões) com alimentos que você evita foram descartadas.`);
  if (itens.length >= 2) {
    if (!itens.some((i) => i.tipo === 'salgado')) avisos.push('Todas as sugestões vieram doces. Peça de novo para ter opções salgadas.');
    if (!itens.some((i) => i.tipo === 'doce')) avisos.push('Todas as sugestões vieram salgadas. Peça de novo para ter opções doces.');
    if (itens.filter(soFruta).length > itens.length / 3) avisos.push('Muitas sugestões são só fruta. Peça de novo para variar mais.');
  }
  return { valido: itens.length > 0, resumo: textoCurto(saida?.resumo, 600), itens, avisos, aviso: AVISO_ALIMENTACAO };
}

/** Nomes das sugestões anteriores, para a IA não repetir (sem duplicados, no máximo `max`). */
export function nomesParaEvitar(itens, max = 30) {
  return [...new Set((Array.isArray(itens) ? itens : []).map((i) => i?.nome).filter((n) => typeof n === 'string' && n))].slice(0, max);
}

/** Chave estável de uma receita favorita (por nome e bloco), para não duplicar. */
export function chaveDeReceita(item) {
  return `${item.bloco}_${normalizar(item.nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`;
}
