import {
  avaliarMeta,
  configVigenteEm,
  estimarEstresseTreino,
  horizonteDaProjecao,
  serieComProjecao,
  somarDias,
  validarMetaForma,
  validarTreinoPlanejado,
} from '@no-strova/domain';
import { atualizarTreino, criarTreino, definirMeta } from '../infrastructure/planoRepo.js';

/** Treinos e atividades já carregados desde esta data (dias antes de hoje) aparecem no calendário. */
export const DIAS_DE_HISTORICO = 120;

export function dataInicialDoHistorico(hoje) {
  return somarDias(hoje, -DIAS_DE_HISTORICO);
}

/** Estimativa (HRSS) de um treino pela zona e duração, com a configuração vigente na data. `null` sem dados. */
export function estimativaDoFormulario({ zona, duracaoMin, data, configs }) {
  const duracao = Number(String(duracaoMin).replace(',', '.'));
  if (!zona || !Number.isFinite(duracao) || duracao <= 0 || !data) return null;
  return estimarEstresseTreino({ zona, duracaoMin: duracao, config: configVigenteEm(configs, data) });
}

/**
 * Valida e grava um treino planejado (novo ou editado). Lança Error com a mensagem em português.
 * @returns {Promise<string>} id do treino
 */
export async function salvarTreinoPlanejado({ uid, id, entrada, configs }) {
  const r = validarTreinoPlanejado(entrada);
  if (!r.valido) throw new Error(r.erros.join(' '));
  const estimado = estimarEstresseTreino({
    zona: r.valores.zona,
    duracaoMin: r.valores.duracaoMin,
    config: configVigenteEm(configs, r.valores.data),
  });
  if (id) {
    await atualizarTreino(id, r.valores, estimado);
    return id;
  }
  return criarTreino(uid, r.valores, estimado);
}

/** Valida e define a meta de forma (desativando a anterior). Lança Error com a mensagem em português. */
export async function salvarMetaDeForma({ uid, entrada, hoje, metasAtivas }) {
  const r = validarMetaForma(entrada, hoje);
  if (!r.valido) throw new Error(r.erros.join(' '));
  await definirMeta(uid, r.valores, metasAtivas);
}

/**
 * Projeção do plano: série de Fitness/Fadiga/Forma até o horizonte e a avaliação da meta.
 * @param {{ dias: Array<{data: string, estresse: number}>, treinos: any[], configs: any[], meta: any, hoje: string, limiteDias?: number }} entrada
 *   `limiteDias`: corta o horizonte a N dias depois de hoje (o Início usa 14).
 */
export function montarProjecao({ dias, treinos, configs, meta, hoje, limiteDias }) {
  let ate = horizonteDaProjecao({ treinos, meta, hoje });
  if (limiteDias && ate > somarDias(hoje, limiteDias)) ate = somarDias(hoje, limiteDias);
  const serie = serieComProjecao({ realizado: dias, treinos, configs, hoje, ate });
  return { serie, ate, avaliacao: avaliarMeta(serie, meta, hoje) };
}

/** Recorta a série para mostrar só os últimos `diasAntes` dias antes de hoje e toda a projeção. */
export function recortarJanela(serie, diasAntes) {
  const idxHoje = serie.findIndex((d) => d.projetado);
  const fimReal = idxHoje === -1 ? serie.length - 1 : idxHoje - 1;
  return serie.slice(Math.max(0, fimReal - diasAntes));
}

/** Agrupa treinos e atividades por dia, para o calendário. */
export function agruparPorDia(treinos, atividades) {
  const mapa = new Map();
  const dia = (data) => {
    if (!mapa.has(data)) mapa.set(data, { treinos: [], atividades: [] });
    return mapa.get(data);
  };
  for (const t of treinos) dia(t.data).treinos.push(t);
  for (const a of atividades) dia(a.data).atividades.push(a);
  return mapa;
}
