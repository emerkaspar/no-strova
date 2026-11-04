import { diasEntre, somarDias } from './forma.js';
import { inicioDaSemana } from './semana.js';
import { dataIsoValida } from './usuarios.js';

/**
 * Peso e metas de peso: pesagens, média móvel de 7 dias, tendência, meta ("chegar a X kg em tal data") e resumo
 * semanal. Funções puras, sem Firebase e sem DOM.
 */
export const LIMITES_PESO = Object.freeze({ min: 20, max: 400 });
/** Perda semanal acima de 1% do peso é agressiva: o app avisa (não impede). */
export const PERDA_MAXIMA_SEMANAL_PCT = 1;
/** Meta que leve a IMC abaixo de 18,5 é recusada (precisa da altura cadastrada). */
export const IMC_MINIMO = 18.5;
/** A meta "está no ritmo" se o peso projetado na data fica a até 0,5 kg do alvo. */
export const TOLERANCIA_META_PESO_KG = 0.5;

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const arredondar1 = (v) => Math.round(v * 10) / 10;

/** IMC (kg/m²) com uma casa; null sem peso ou altura. */
export function calcularImc(pesoKg, alturaCm) {
  if (!(pesoKg > 0) || !(alturaCm > 0)) return null;
  return arredondar1(pesoKg / (alturaCm / 100) ** 2);
}

/** Faixa de IMC considerada normal (OMS): de 18,5 a 24,9. */
export const IMC_FAIXA_NORMAL = Object.freeze({ min: IMC_MINIMO, max: 24.9 });

/** Faixa de peso (kg) que dá IMC normal para a altura; null sem altura. Os extremos são arredondados a 0,1 para dentro da faixa. */
export function faixaDePesoSaudavel(alturaCm) {
  if (!(alturaCm > 0)) return null;
  const m2 = (alturaCm / 100) ** 2;
  return { minKg: Math.ceil(IMC_FAIXA_NORMAL.min * m2 * 10) / 10, maxKg: Math.floor(IMC_FAIXA_NORMAL.max * m2 * 10) / 10 };
}

/** Classificação do IMC (faixas da OMS para adultos). */
export function classificarImc(imc) {
  if (!Number.isFinite(imc)) return null;
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidade';
}

/**
 * Valida uma pesagem. Uma pesagem por dia: gravar de novo na mesma data substitui a anterior.
 * @returns {{ valido: boolean, erros: string[], valores: { data: string, pesoKg: number }|null }}
 */
export function validarPesagem(entrada, hoje) {
  const erros = [];
  const peso = numero(entrada?.pesoKg);
  const { min, max } = LIMITES_PESO;
  if (peso === null || peso < min || peso > max) erros.push(`Informe o peso em kg, de ${min} a ${max}.`);
  const data = entrada?.data;
  if (!dataIsoValida(data)) erros.push('Informe a data da pesagem.');
  else if (data > hoje) erros.push('A data da pesagem não pode estar no futuro.');
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { data, pesoKg: arredondar1(peso) } };
}

const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

/** Média das pesagens dos 7 dias que terminam em `data` (inclusive); null se não houver nenhuma. */
export function mediaMovel7(pesagens, data) {
  const de = somarDias(data, -6);
  const janela = pesagens.filter((p) => p.data >= de && p.data <= data && Number.isFinite(p.pesoKg));
  if (janela.length === 0) return null;
  return janela.reduce((s, p) => s + p.pesoKg, 0) / janela.length;
}

/**
 * Série diária de média móvel de 7 dias, do dia da primeira pesagem até `ate` (dias sem pesagem usam as dos 7 dias
 * anteriores; antes da primeira pesagem não há série).
 * @returns {Array<{ data: string, mediaKg: number }>}
 */
export function serieDeMediaMovel(pesagens, ate) {
  const lista = [...pesagens].filter((p) => p.data <= ate).sort(porData);
  if (lista.length === 0) return [];
  const serie = [];
  for (let d = lista[0].data; d <= ate; d = somarDias(d, 1)) {
    const m = mediaMovel7(lista, d);
    if (m !== null) serie.push({ data: d, mediaKg: m });
  }
  return serie;
}

/**
 * Indicadores: peso atual (última pesagem), média de 7 dias, tendência semanal (média de hoje menos a de 7 dias
 * atrás, em kg/semana) e variação em 30 dias (peso atual menos a última pesagem de 30 dias atrás ou antes).
 */
export function resumoDePeso(pesagens, hoje) {
  const lista = pesagens.filter((p) => p.data <= hoje && Number.isFinite(p.pesoKg)).sort(porData);
  const atual = lista.length > 0 ? lista[lista.length - 1] : null;
  if (!atual) return { atual: null, media7: null, semanalKg: null, variacao30Kg: null };
  const media7 = mediaMovel7(lista, hoje);
  const antes = mediaMovel7(lista, somarDias(hoje, -7));
  const base30 = [...lista].reverse().find((p) => p.data <= somarDias(hoje, -30));
  return {
    atual,
    media7,
    semanalKg: media7 !== null && antes !== null ? media7 - antes : null,
    variacao30Kg: base30 ? atual.pesoKg - base30.pesoKg : null,
  };
}

/**
 * Valida a meta de peso. O IMC da meta abaixo de 18,5 é recusado (com altura cadastrada); perda acima de 1% do peso
 * por semana gera só um aviso.
 * @param {{ pesoAlvoKg: unknown, dataAlvo: unknown }} entrada
 * @param {{ pesoAtualKg?: number|null, alturaCm?: number|null }} contexto
 * @returns {{ valido: boolean, erros: string[], avisos: string[], valores: { pesoAlvoKg: number, dataAlvo: string }|null }}
 */
export function validarMetaPeso(entrada, { pesoAtualKg = null, alturaCm = null } = {}, hoje) {
  const erros = [];
  const avisos = [];
  const alvo = numero(entrada?.pesoAlvoKg);
  const { min, max } = LIMITES_PESO;
  if (alvo === null || alvo < min || alvo > max) erros.push(`Informe o peso desejado em kg, de ${min} a ${max}.`);
  const data = entrada?.dataAlvo;
  if (!dataIsoValida(data)) erros.push('Informe a data da meta.');
  else if (data <= hoje) erros.push('A data da meta deve ser depois de hoje.');
  else if (diasEntre(hoje, data) > 730) erros.push('A data da meta deve ficar nos próximos 2 anos.');
  if (erros.length === 0) {
    const imc = calcularImc(alvo, alturaCm);
    if (imc !== null && imc < IMC_MINIMO) {
      const faixa = faixaDePesoSaudavel(alturaCm);
      erros.push(`Com a sua altura, ${arredondar1(alvo)} kg dá IMC ${String(imc).replace(".", ",")}, abaixo de 18,5. O menor peso aceito para ${alturaCm} cm é ${faixa.minKg} kg.`);
    }
    if (pesoAtualKg > 0 && alvo < pesoAtualKg) {
      const semanas = diasEntre(hoje, data) / 7;
      const pctPorSemana = ((pesoAtualKg - alvo) / pesoAtualKg / semanas) * 100;
      if (pctPorSemana > PERDA_MAXIMA_SEMANAL_PCT) avisos.push(`Perder ${arredondar1(pesoAtualKg - alvo)} kg até essa data é perder cerca de ${arredondar1(pctPorSemana)}% do peso por semana, acima de ${PERDA_MAXIMA_SEMANAL_PCT}%. Considere uma data mais distante.`);
    }
  }
  if (erros.length > 0) return { valido: false, erros, avisos, valores: null };
  return { valido: true, erros, avisos, valores: { pesoAlvoKg: arredondar1(alvo), dataAlvo: data } };
}

/**
 * Progresso até o alvo, de 0 a 1: do peso de quando a meta foi criada até o alvo (vale para perder e para ganhar).
 * Null sem o peso inicial ou quando o alvo é igual ao inicial.
 */
export function progressoDaMetaPeso({ pesoInicialKg, pesoAtualKg, pesoAlvoKg }) {
  if (![pesoInicialKg, pesoAtualKg, pesoAlvoKg].every(Number.isFinite) || pesoInicialKg === pesoAlvoKg) return null;
  const fracao = (pesoInicialKg - pesoAtualKg) / (pesoInicialKg - pesoAlvoKg);
  return Math.min(1, Math.max(0, fracao));
}

/**
 * Avalia a meta com a tendência atual:
 *  - `sem-dados`: sem pesagem recente ou sem tendência;
 *  - `atingida`: o peso atual já está a até 0,3 kg do alvo;
 *  - `no-ritmo`: mantendo a tendência, o peso na data fica a até 0,5 kg do alvo;
 *  - `atrasada`: a tendência não leva ao alvo a tempo (ou vai no sentido contrário);
 *  - `adiantada`: a tendência passa do alvo antes da data.
 * `ritmoNecessarioKg` e `ritmoAtualKg` são kg por semana (negativo = perder).
 */
export function avaliarMetaPeso(meta, pesagens, hoje) {
  if (!meta) return null;
  const dias = diasEntre(hoje, meta.dataAlvo);
  const { atual, media7, semanalKg } = resumoDePeso(pesagens, hoje);
  const base = { pesoAlvoKg: meta.pesoAlvoKg, dataAlvo: meta.dataAlvo, dias, pesoAtualKg: atual?.pesoKg ?? null };
  const vazio = { ...base, estado: 'sem-dados', pesoProjetadoKg: null, diferencaKg: null, ritmoNecessarioKg: null, ritmoAtualKg: null, agressiva: false };
  if (!atual || media7 === null) return vazio;
  if (Math.abs(atual.pesoKg - meta.pesoAlvoKg) <= 0.3) return { ...vazio, estado: 'atingida', pesoProjetadoKg: atual.pesoKg, diferencaKg: atual.pesoKg - meta.pesoAlvoKg, ritmoNecessarioKg: 0, ritmoAtualKg: semanalKg };
  const semanas = dias / 7;
  if (semanas <= 0 || semanalKg === null) return { ...vazio, ritmoNecessarioKg: semanas > 0 ? (meta.pesoAlvoKg - atual.pesoKg) / semanas : null };
  const projetado = media7 + semanalKg * semanas;
  const diferenca = projetado - meta.pesoAlvoKg;
  const perder = meta.pesoAlvoKg < atual.pesoKg;
  let estado = 'no-ritmo';
  if (Math.abs(diferenca) > TOLERANCIA_META_PESO_KG) estado = (perder ? diferenca > 0 : diferenca < 0) ? 'atrasada' : 'adiantada';
  const ritmoNecessarioKg = (meta.pesoAlvoKg - atual.pesoKg) / semanas;
  return {
    ...base,
    estado,
    pesoProjetadoKg: projetado,
    diferencaKg: diferenca,
    ritmoNecessarioKg,
    ritmoAtualKg: semanalKg,
    agressiva: ritmoNecessarioKg < 0 && (-ritmoNecessarioKg / atual.pesoKg) * 100 > PERDA_MAXIMA_SEMANAL_PCT,
  };
}

/**
 * Peso e treino por semana (segunda a domingo), da mais recente para a mais antiga: peso médio, carga (HRSS) e
 * calorias dos treinos. Semanas sem nenhum dado entram vazias, para a tabela não "pular" semanas.
 * @param {{ pesagens: any[], dias: Array<{ data: string, estresse: number }>, atividades: any[] }} dados
 */
export function resumoSemanalDePeso({ pesagens = [], dias = [], atividades = [] }, hoje, semanas = 8) {
  const linhas = [];
  for (let i = 0; i < semanas; i++) {
    const inicio = somarDias(inicioDaSemana(hoje), -7 * i);
    const fim = somarDias(inicio, 6);
    const dessa = (x) => x.data >= inicio && x.data <= fim;
    const pesos = pesagens.filter((p) => dessa(p) && Number.isFinite(p.pesoKg));
    const kcal = atividades.filter(dessa).reduce((s, a) => s + (Number.isFinite(a.calorias) ? a.calorias : 0), 0);
    linhas.push({
      inicio,
      fim,
      pesoMedioKg: pesos.length > 0 ? pesos.reduce((s, p) => s + p.pesoKg, 0) / pesos.length : null,
      cargaHrss: dias.filter(dessa).reduce((s, d) => s + (Number.isFinite(d.estresse) ? d.estresse : 0), 0),
      kcalTreino: kcal,
    });
  }
  return linhas;
}

/**
 * Onde o peso está em relação à faixa saudável: `dentro`, `acima` ou `abaixo`, a diferença para o limite mais próximo
 * (kg, 0 dentro da faixa) e a gravidade: `ok` (dentro), `atencao` (fora, mas perto: IMC de 17 a 30) ou `alerta`
 * (IMC abaixo de 17 ou de 30 em diante). Null sem peso ou sem faixa.
 */
export function situacaoNaFaixa(pesoKg, faixa, imc) {
  if (!Number.isFinite(pesoKg) || !faixa) return null;
  if (pesoKg < faixa.minKg) return { estado: 'abaixo', diferencaKg: faixa.minKg - pesoKg, gravidade: Number.isFinite(imc) && imc < 17 ? 'alerta' : 'atencao' };
  if (pesoKg > faixa.maxKg) return { estado: 'acima', diferencaKg: pesoKg - faixa.maxKg, gravidade: Number.isFinite(imc) && imc >= 30 ? 'alerta' : 'atencao' };
  return { estado: 'dentro', diferencaKg: 0, gravidade: 'ok' };
}
