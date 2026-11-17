/**
 * Treino e corpo ao longo do tempo: carga de treino (HRSS), peso, sono e passos agrupados por semana ou por mês, para um
 * gráfico que continue legível com anos de histórico. Regras puras, sem Firebase nem DOM.
 */

import { somarDias } from './forma.js';
import { inicioDaSemana } from './semana.js';

/** Até quantos dias de período o gráfico mostra um ponto por dia; acima disso, por semana. */
export const LIMITE_DIAS_POR_DIA = 90;
/** Até quantos dias de período o gráfico agrupa por semana; acima disso, por mês. */
export const LIMITE_DIAS_POR_SEMANA = 200;
/** Menos que isso fica solitário no gráfico: o recorte volta para trás até ter pelo menos este número de grupos. */
const MINIMO_DE_GRUPOS = 4;

const media = (valores) => (valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length);
const primeiroDoMes = (data) => `${data.slice(0, 7)}-01`;
/** Primeiro dia do mês seguinte (o mês do ISO é 1 a 12, e o do Date.UTC é base 0: passar `m` já aponta para o seguinte). */
const proximoMes = (inicio) => {
  const [a, m] = inicio.split('-').map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
};
const diasEntreIso = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/** 'dia' (até 90 dias), 'semana' (até 200) ou 'mes' para um período em dias (null = todo o histórico, decidido pelo tamanho dele). */
export function granularidadeDoPeriodo(dias, diasDoHistorico = 0) {
  const total = dias ?? diasDoHistorico;
  if (total <= LIMITE_DIAS_POR_DIA) return 'dia';
  return total <= LIMITE_DIAS_POR_SEMANA ? 'semana' : 'mes';
}

/**
 * Agrupa por dia, semana (segunda a domingo) ou mês, do mais antigo ao mais recente, até hoje (o último grupo pode estar em
 * andamento: `parcial`). Médias só dos dias com registro; a carga é a soma do HRSS do grupo. O período começa no primeiro
 * registro (sem grupos vazios à esquerda), com um mínimo de 4 grupos.
 * @param {{ pesagens?: Array<{ data: string, pesoKg: number }>, bemEstar?: Array<{ data: string, passos: number|null, sonoSegundos: number|null }>, estresse?: Array<{ data: string, estresse: number }> }} dados
 * @param {string} hoje yyyy-mm-dd
 * @param {{ dias?: number|null }} [opcoes] `dias` do período (null = tudo)
 * @returns {{ granularidade: 'dia'|'semana'|'mes', grupos: Array<{ inicio: string, fim: string, parcial: boolean, pesoMedioKg: number|null, sonoMedioS: number|null, passosMedio: number|null, cargaHrss: number }> }}
 */
export function agruparTreinoECorpo({ pesagens = [], bemEstar = [], estresse = [] } = {}, hoje, { dias = null } = {}) {
  const datas = [...pesagens, ...bemEstar, ...estresse].map((x) => x.data).filter((d) => typeof d === 'string' && d <= hoje);
  if (datas.length === 0) return { granularidade: granularidadeDoPeriodo(dias), grupos: [] };
  const menor = datas.reduce((a, b) => (a < b ? a : b));

  const desdeDoPeriodo = dias === null ? menor : somarDias(hoje, -(dias - 1));
  const desde = desdeDoPeriodo < menor ? menor : desdeDoPeriodo; // sem grupos vazios à esquerda
  const granularidade = granularidadeDoPeriodo(dias, diasEntreIso(menor, hoje) + 1);
  const chave = (d) => (granularidade === 'dia' ? d : granularidade === 'semana' ? inicioDaSemana(d) : primeiroDoMes(d));
  const seguinte = (c) => (granularidade === 'dia' ? somarDias(c, 1) : granularidade === 'semana' ? somarDias(c, 7) : proximoMes(c));
  const anterior = (c) => (granularidade === 'dia' ? somarDias(c, -1) : granularidade === 'semana' ? somarDias(c, -7) : primeiroDoMes(somarDias(c, -1)));

  let primeiro = chave(desde);
  let quantos = 0;
  for (let c = primeiro; c <= hoje; c = seguinte(c)) quantos += 1;
  while (quantos < MINIMO_DE_GRUPOS) {
    primeiro = anterior(primeiro);
    quantos += 1;
  }

  const grupos = new Map();
  for (let c = primeiro; c <= hoje; c = seguinte(c)) {
    const fimDoGrupo = somarDias(seguinte(c), -1);
    grupos.set(c, { inicio: c, fim: fimDoGrupo > hoje ? hoje : fimDoGrupo, parcial: fimDoGrupo > hoje, pesos: [], sonos: [], passos: [], carga: 0 });
  }
  const noGrupo = (d) => (typeof d === 'string' && d >= primeiro && d <= hoje ? grupos.get(chave(d)) : undefined);
  for (const p of pesagens) if (Number.isFinite(p.pesoKg)) noGrupo(p.data)?.pesos.push(p.pesoKg);
  for (const b of bemEstar) {
    const g = noGrupo(b.data);
    if (!g) continue;
    if (b.sonoSegundos > 0) g.sonos.push(b.sonoSegundos);
    if (b.passos > 0) g.passos.push(b.passos);
  }
  for (const e of estresse) {
    const g = noGrupo(e.data);
    if (g && Number.isFinite(e.estresse)) g.carga += e.estresse;
  }

  return {
    granularidade,
    grupos: [...grupos.values()].map((g) => ({
      inicio: g.inicio,
      fim: g.fim,
      parcial: g.parcial,
      pesoMedioKg: media(g.pesos),
      sonoMedioS: media(g.sonos),
      passosMedio: media(g.passos),
      cargaHrss: g.carga,
    })),
  };
}
