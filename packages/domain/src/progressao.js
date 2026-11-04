/**
 * Progressão: o acumulado (ou o valor) de uma métrica dia a dia dentro de um período (ano, mês ou semana), comparado com
 * os períodos anteriores do mesmo tipo e com uma meta. Funções puras, sem Firebase e sem DOM.
 */
import { somarDias } from './forma.js';

/** Métricas que podem ter progressão e meta. `acumulado`: soma ao longo do período; senão é o valor do dia (Condicionamento). */
export const TIPOS_DE_PROGRESSAO = Object.freeze({
  distancia: { rotulo: 'Distância', unidade: 'km', acumulado: true, casas: 0 },
  tempo: { rotulo: 'Tempo em movimento', unidade: 'h', acumulado: true, casas: 1 },
  elevacao: { rotulo: 'Elevação positiva acumulada', unidade: 'm', acumulado: true, casas: 0 },
  condicionamento: { rotulo: 'Condicionamento', unidade: '', acumulado: false, casas: 1 },
});
export const TIPOS_VALIDOS_DE_PROGRESSAO = Object.freeze(Object.keys(TIPOS_DE_PROGRESSAO));

/** Tipos de período. Cada um compara com os períodos anteriores do mesmo tipo (anos, meses ou semanas). */
export const PERIODOS_DE_PROGRESSAO = Object.freeze({
  ano: { rotulo: 'Ano', plural: 'anos', anteriores: 'Anos anteriores' },
  mes: { rotulo: 'Mês', plural: 'meses', anteriores: 'Meses anteriores' },
  semana: { rotulo: 'Semana', plural: 'semanas', anteriores: 'Semanas anteriores' },
});
export const PERIODOS_VALIDOS = Object.freeze(Object.keys(PERIODOS_DE_PROGRESSAO));
export const ESPORTES_DA_PROGRESSAO = Object.freeze(['ciclismo', 'corrida', 'outro']);
export const LIMITE_META = 1e7;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const numeroDoDia = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86400000);
};
const ehBissexto = (ano) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const dois = (n) => String(n).padStart(2, '0');

/** Segunda-feira da semana de uma data. */
export function segundaDaSemana(iso) {
  const dia = new Date(numeroDoDia(iso) * 86400000).getUTCDay(); // 0 = domingo
  return somarDias(iso, -((dia + 6) % 7));
}

/**
 * Período do tipo `tipo` que contém a data `referencia`.
 * @returns {{ tipo: string, id: string, inicio: string, fim: string, dias: number, rotulo: string }}
 */
export function periodoDe(tipo, referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  if (tipo === 'ano') {
    const dias = ehBissexto(ano) ? 366 : 365;
    return { tipo, id: `${ano}`, inicio: `${ano}-01-01`, fim: `${ano}-12-31`, dias, rotulo: `${ano}` };
  }
  if (tipo === 'mes') {
    const dias = ultimoDiaDoMes(ano, mes);
    return { tipo, id: `${ano}-${dois(mes)}`, inicio: `${ano}-${dois(mes)}-01`, fim: `${ano}-${dois(mes)}-${dois(dias)}`, dias, rotulo: `${MESES_CURTOS[mes - 1]}/${ano}` };
  }
  const inicio = segundaDaSemana(referencia);
  const fim = somarDias(inicio, 6);
  const [, mi, di] = inicio.split('-');
  return { tipo: 'semana', id: inicio, inicio, fim, dias: 7, rotulo: `Semana de ${di}/${mi}` };
}

/** Os `n` períodos imediatamente anteriores a `periodo`, do mais recente para o mais antigo. */
export function periodosAnteriores(periodo, n) {
  const lista = [];
  let atual = periodo;
  for (let i = 0; i < n; i++) {
    atual = periodoDe(periodo.tipo, somarDias(atual.inicio, -1));
    lista.push(atual);
  }
  return lista;
}

/** Posição (1 = primeiro dia) de uma data dentro do período. */
export const diaDoPeriodo = (periodo, iso) => numeroDoDia(iso) - numeroDoDia(periodo.inicio) + 1;
export const dataDoDiaDoPeriodo = (periodo, n) => somarDias(periodo.inicio, n - 1);

/** Último dia contado do período: hoje, se ele está em andamento; o último dia, se já terminou; 0 se ainda não começou. */
export function diaDeCorte(periodo, hoje) {
  if (hoje < periodo.inicio) return 0;
  if (hoje > periodo.fim) return periodo.dias;
  return diaDoPeriodo(periodo, hoje);
}

/** Metas de semana e de mês são recorrentes: valem para todas as semanas (ou meses) a partir de `inicio`, até `ate` ou até o usuário trocar o valor. */
export const ehRecorrente = (meta) => meta.periodo === 'semana' || meta.periodo === 'mes';

/** A meta vale neste período? Recorrente: o período começa dentro da vigência. Anual: é exatamente o ano da meta. */
export function metaVale(meta, periodo) {
  if (meta.periodo !== periodo.tipo) return false;
  if (!ehRecorrente(meta)) return meta.inicio === periodo.inicio;
  return meta.inicio <= periodo.inicio && (!meta.ate || periodo.inicio <= meta.ate);
}

/**
 * Períodos (semanas, meses ou o ano) a que a meta se aplica até hoje, do mais antigo ao mais recente. A meta recorrente
 * conta o período em andamento; uma meta já encerrada (`ate`) para no último período dentro da vigência.
 */
export function instanciasDaMeta(meta, hoje, maximo = 400) {
  if (!ehRecorrente(meta)) return [periodoDe('ano', meta.inicio)];
  const lista = [];
  let p = periodoDe(meta.periodo, meta.inicio);
  const limite = meta.ate && meta.ate < hoje ? meta.ate : hoje;
  while (p.inicio <= limite && lista.length < maximo) {
    lista.push(p);
    p = periodoDe(meta.periodo, somarDias(p.fim, 1));
  }
  return lista;
}

/** Id da conquista de uma instância da meta: uma badge por semana, mês ou ano atingido. */
export const idDaConquista = (metaId, periodo) => `${metaId}_${periodo.id}`;

/** Valor que uma atividade soma para a métrica (km, horas, metros). Condicionamento não vem das atividades. */
export function valorDaAtividade(a, tipo) {
  if (tipo === 'distancia') return Number.isFinite(a.distanciaM) ? a.distanciaM / 1000 : 0;
  if (tipo === 'tempo') {
    const s = Number.isFinite(a.tempoMovimentoS) ? a.tempoMovimentoS : a.duracaoS;
    return Number.isFinite(s) ? s / 3600 : 0;
  }
  if (tipo === 'elevacao') return Number.isFinite(a.altimetriaM) ? a.altimetriaM : 0;
  return 0;
}

/**
 * Valores dia a dia de um período (posição 0 = primeiro dia). Dias depois do corte são null.
 * @param {object} p
 * @param {ReturnType<typeof periodoDe>} p.periodo
 * @param {string} p.tipo chave de TIPOS_DE_PROGRESSAO
 * @param {Array<{ data: string, esporte: string }>} p.atividades
 * @param {string[]} [p.esportes] vazio = todos
 * @param {Map<string, number>} [p.condicionamentoPorData] Condicionamento de cada dia, para o tipo "condicionamento"
 * @param {string} p.hoje
 * @returns {{ periodo: ReturnType<typeof periodoDe>, valores: Array<number|null> }}
 */
export function serieDoPeriodo({ periodo, tipo, atividades, esportes = [], condicionamentoPorData = new Map(), hoje }) {
  const corte = diaDeCorte(periodo, hoje);
  const valores = new Array(periodo.dias).fill(null);

  if (TIPOS_DE_PROGRESSAO[tipo]?.acumulado) {
    const porDia = new Array(periodo.dias).fill(0);
    const filtro = esportes.length > 0 ? new Set(esportes) : null;
    for (const a of atividades ?? []) {
      if (typeof a.data !== 'string' || a.data < periodo.inicio || a.data > periodo.fim) continue;
      if (filtro && !filtro.has(a.esporte)) continue;
      porDia[diaDoPeriodo(periodo, a.data) - 1] += valorDaAtividade(a, tipo);
    }
    let soma = 0;
    for (let i = 0; i < corte; i++) {
      soma += porDia[i];
      valores[i] = soma;
    }
  } else {
    // Condicionamento: antes da primeira atividade ele é 0; a série contínua vem de calcularSerieForma
    for (let i = 0; i < corte; i++) valores[i] = condicionamentoPorData.get(dataDoDiaDoPeriodo(periodo, i + 1)) ?? 0;
  }
  return { periodo, valores };
}

/** Valor "esperado" da meta no dia `n` do período: linha reta do ponto de partida (0, ou o Condicionamento do 1º dia) até o alvo. */
export function valorEsperadoDaMeta(meta, periodo, serie, n) {
  const inicio = TIPOS_DE_PROGRESSAO[meta.tipo]?.acumulado ? 0 : (serie?.valores?.[0] ?? 0);
  return inicio + ((meta.valorAlvo - inicio) * Math.min(n, periodo.dias)) / periodo.dias;
}

const valorNoDia = (serie, n) => (n >= 1 && serie ? (serie.valores[Math.min(n, serie.valores.length) - 1] ?? null) : null);

/**
 * Compara os períodos no mesmo ponto (o dia de corte do período de referência) e avalia a meta.
 * @param {object} p
 * @param {Array<{ periodo: ReturnType<typeof periodoDe>, valores: Array<number|null> }>} p.series séries dos períodos mostrados
 * @param {ReturnType<typeof periodoDe>} p.referencia período em foco (o atual, ou o da meta)
 * @param {string} p.hoje
 * @param {string} p.tipo
 * @param {{ periodo: string, inicio: string, ate?: string|null, tipo: string, valorAlvo: number }|null} [p.meta] só vale se valer no período de referência
 */
export function compararProgressao({ series, referencia, hoje, tipo, meta = null }) {
  const cfg = TIPOS_DE_PROGRESSAO[tipo];
  const corte = Math.max(1, diaDeCorte(referencia, hoje));
  const ordenadas = [...series].sort((a, b) => (a.periodo.inicio < b.periodo.inicio ? -1 : 1));
  const serieRef = ordenadas.find((s) => s.periodo.inicio === referencia.inicio);
  const valorRef = valorNoDia(serieRef, corte);
  const metaDoPeriodo = meta && metaVale(meta, referencia) ? meta : null;
  const esperadoHoje = metaDoPeriodo ? valorEsperadoDaMeta(metaDoPeriodo, referencia, serieRef, corte) : null;

  const linhas = ordenadas.map((s, i) => {
    const valor = valorNoDia(s, corte);
    const anterior = i > 0 ? valorNoDia(ordenadas[i - 1], corte) : null;
    return {
      periodo: s.periodo,
      valor,
      deltaAnterior: valor !== null && anterior !== null ? valor - anterior : null,
      deltaReferencia: s.periodo.inicio !== referencia.inicio && valor !== null && valorRef !== null ? valor - valorRef : null,
      deltaMeta: valor !== null && esperadoHoje !== null ? valor - esperadoHoje : null,
    };
  });

  // projeção do fim do período: ritmo médio até agora (só para métricas acumuladas; o ano exige pelo menos uma semana de dados)
  const minimo = referencia.tipo === 'ano' ? 7 : 2;
  const projecaoFim = cfg?.acumulado && valorRef !== null && corte >= minimo && corte < referencia.dias ? (valorRef / corte) * referencia.dias : null;

  let resumoMeta = null;
  if (metaDoPeriodo) {
    const faltam = valorRef === null ? null : Math.max(0, metaDoPeriodo.valorAlvo - valorRef);
    const diasRestantes = Math.max(0, referencia.dias - corte);
    let estado = 'sem-dados';
    if (valorRef !== null) {
      if (valorRef >= metaDoPeriodo.valorAlvo) estado = 'atingida';
      else if (valorRef >= esperadoHoje * 1.03) estado = 'adiantada';
      else if (valorRef >= esperadoHoje * 0.97) estado = 'no-ritmo';
      else estado = 'atrasada';
    }
    resumoMeta = {
      valorAlvo: metaDoPeriodo.valorAlvo,
      esperadoHoje,
      atual: valorRef,
      faltam,
      percentual: valorRef === null ? null : Math.min(100, (valorRef / metaDoPeriodo.valorAlvo) * 100),
      // quanto falta por dia, no ritmo necessário para fechar a meta
      ritmoNecessarioPorDia: cfg?.acumulado && faltam !== null && diasRestantes > 0 ? faltam / diasRestantes : null,
      diasRestantes,
      estado,
    };
  }
  return { linhas, corte, projecaoFim, meta: resumoMeta };
}

/**
 * Valida a meta digitada. `inicio` é uma data do período (é ajustada para o 1º do ano, o 1º do mês ou a segunda-feira).
 * @param {{ periodo?: unknown, inicio?: unknown, tipo?: unknown, valorAlvo?: unknown, esportes?: unknown }} entrada
 * @returns {{ valido: boolean, valores: null | { periodo: string, inicio: string, tipo: string, valorAlvo: number, esportes: string[] }, erros: string[] }}
 */
export function validarMetaDeProgressao(entrada) {
  const erros = [];
  if (!PERIODOS_VALIDOS.includes(entrada?.periodo)) erros.push('Escolha se a meta é do ano, do mês ou da semana.');
  const inicioInformado = typeof entrada?.inicio === 'string' && DATA.test(entrada.inicio) ? entrada.inicio : null;
  const anoInformado = inicioInformado ? Number(inicioInformado.slice(0, 4)) : 0;
  if (!inicioInformado || anoInformado < 2000 || anoInformado > 2100) erros.push('Informe um período válido.');
  if (!TIPOS_VALIDOS_DE_PROGRESSAO.includes(entrada?.tipo)) erros.push('Escolha o tipo da meta.');
  const texto = typeof entrada?.valorAlvo === 'string' ? entrada.valorAlvo.replaceAll('.', '').replace(',', '.') : entrada?.valorAlvo;
  const valorAlvo = Number(texto);
  if (!Number.isFinite(valorAlvo) || valorAlvo <= 0 || valorAlvo > LIMITE_META) erros.push('Informe um valor de meta maior que zero.');
  const esportes = Array.isArray(entrada?.esportes) ? [...new Set(entrada.esportes)] : [];
  if (esportes.some((e) => !ESPORTES_DA_PROGRESSAO.includes(e))) erros.push('Esporte inválido.');
  if (erros.length > 0) return { valido: false, valores: null, erros };
  const inicio = periodoDe(entrada.periodo, inicioInformado).inicio;
  return { valido: true, valores: { periodo: entrada.periodo, inicio, tipo: entrada.tipo, valorAlvo: Math.round(valorAlvo * 100) / 100, esportes }, erros };
}

/**
 * Situação de um objetivo (meta) hoje. É a mesma conta no servidor (que concede a badge) e na tela (que mostra o status).
 * Um objetivo é atingido assim que o valor chega ao alvo em algum dia do período, e continua atingido depois.
 * @param {{ meta: { periodo: string, inicio: string, tipo: string, valorAlvo: number, esportes?: string[] }, periodo?: ReturnType<typeof periodoDe>,
 *   atividades: Array<{ data: string, esporte: string }>, condicionamentoPorData?: Map<string, number>, hoje: string }} p
 * @returns {{ periodo: ReturnType<typeof periodoDe>, estado: 'futuro'|'atingido'|'adiantado'|'no-ritmo'|'atrasado'|'nao-atingido',
 *   atual: number|null, percentual: number|null, faltam: number|null, esperadoHoje: number|null, diasRestantes: number,
 *   atingidaEm: string|null, valorAtingido: number|null }}
 */
export function avaliarObjetivo({ meta, periodo: instancia = null, atividades, condicionamentoPorData = new Map(), hoje }) {
  const periodo = instancia ?? periodoDe(meta.periodo, meta.inicio);
  const corte = diaDeCorte(periodo, hoje);
  const base = { periodo, atual: null, percentual: null, faltam: null, esperadoHoje: null, diasRestantes: periodo.dias, atingidaEm: null, valorAtingido: null };
  if (corte === 0) return { ...base, estado: 'futuro' };

  const serie = serieDoPeriodo({ periodo, tipo: meta.tipo, atividades, esportes: meta.esportes ?? [], condicionamentoPorData, hoje });
  const atual = serie.valores[corte - 1];
  const diasRestantes = Math.max(0, periodo.dias - corte);
  const percentual = Math.min(100, (atual / meta.valorAlvo) * 100);
  const i = serie.valores.findIndex((v) => Number.isFinite(v) && v >= meta.valorAlvo);
  if (i >= 0) {
    return { ...base, estado: 'atingido', atual, percentual: 100, faltam: 0, diasRestantes, atingidaEm: dataDoDiaDoPeriodo(periodo, i + 1), valorAtingido: serie.valores[i] };
  }
  const esperadoHoje = valorEsperadoDaMeta(meta, periodo, serie, corte);
  let estado = 'atrasado';
  if (hoje > periodo.fim) estado = 'nao-atingido';
  else if (atual >= esperadoHoje * 1.03) estado = 'adiantado';
  else if (atual >= esperadoHoje * 0.97) estado = 'no-ritmo';
  return { ...base, estado, atual, percentual, faltam: Math.max(0, meta.valorAlvo - atual), esperadoHoje, diasRestantes };
}

/**
 * Estado de uma meta hoje: a instância atual (ou a última, se a meta já foi encerrada) e o histórico das anteriores.
 * Nas metas recorrentes, "atingidas" conta quantos períodos já terminaram ou estão atingidos.
 * @returns {{ atual: ReturnType<typeof avaliarObjetivo>, instancias: number, atingidas: number, naoAtingidas: number, sequencia: number }}
 */
export function resumoDaMeta({ meta, atividades, condicionamentoPorData = new Map(), hoje }) {
  const periodos = instanciasDaMeta(meta, hoje);
  const avaliacoes = periodos.map((periodo) => avaliarObjetivo({ meta, periodo, atividades, condicionamentoPorData, hoje }));
  const atual = avaliacoes[avaliacoes.length - 1] ?? avaliarObjetivo({ meta, atividades, condicionamentoPorData, hoje });
  // sequência: períodos seguidos atingidos até agora (o período em andamento só conta se já foi atingido)
  let sequencia = 0;
  for (let i = avaliacoes.length - 1; i >= 0; i--) {
    if (avaliacoes[i].estado === 'atingido') sequencia += 1;
    else if (i === avaliacoes.length - 1 && avaliacoes[i].periodo.fim >= hoje) continue;
    else break;
  }
  return {
    atual,
    instancias: avaliacoes.length,
    atingidas: avaliacoes.filter((a) => a.estado === 'atingido').length,
    naoAtingidas: avaliacoes.filter((a) => a.estado === 'nao-atingido').length,
    sequencia,
  };
}
