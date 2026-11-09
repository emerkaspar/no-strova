import { parciaisDoTrecho, passagensDoTrajeto, perfilDaPassagem, perfilDoTrajeto, podioDoTrajeto, resumoDoTrajeto, rotaValida, segmentarTerreno } from '@no-strova/domain';
import { ajustarTrechoDaAtividade, definirRotaDoTrajeto, sugerirTreinoDoTrajeto } from '../core/functions.js';
import { lerSerieDetalhe } from '../infrastructure/atividadesRepo.js';
import { salvarModeloProprio } from './treinos.js';

/**
 * Evolução por trajeto: junta os trajetos e as atividades vinculadas e usa as regras de `@no-strova/domain`
 * (evolucaoTrajeto.js e trechoDoTrajeto.js). O trecho de cada atividade é detectado no servidor e já vem gravado nela.
 */

/**
 * Trajetos do esporte com suas passagens (da mais antiga para a mais nova), resumo e pódio. Trajetos sem passagem entram
 * com a lista vazia.
 * @returns {Array<{ trajeto: object, passagens: object[], resumo: object|null, podio: Map<string,string>, rota: object|null }>}
 */
export function montarTrajetos(trajetos, atividades, esporte) {
  return trajetos
    .filter((t) => t.esporte === esporte)
    .map((trajeto) => {
      const passagens = passagensDoTrajeto(atividades, trajeto.id);
      return {
        trajeto,
        passagens,
        resumo: resumoDoTrajeto(passagens),
        podio: podioDoTrajeto(passagens),
        rota: rotaValida(trajeto.rota) ? trajeto.rota : null,
      };
    });
}

const series = new Map(); // série detalhada por atividade: a tela redesenha a cada snapshot e não deve reler

/** Série detalhada da atividade (com cache da sessão), ou null. */
async function serieDaAtividade(id) {
  if (!series.has(id)) series.set(id, lerSerieDetalhe(id).catch(() => null));
  return series.get(id);
}

/**
 * Perfil (trecho do trajeto ou atividade inteira) e parciais por km de cada passagem, lidos sob demanda.
 * @returns {Promise<Map<string, { perfil: object|null, parciais: object[] }>>} sem série, `perfil` é null
 */
export async function carregarDetalhes(passagens) {
  const lidas = await Promise.all(passagens.map((p) => serieDaAtividade(p.id)));
  return new Map(
    passagens.map((p, k) => {
      const serie = lidas[k];
      const perfil = perfilDaPassagem(serie, p);
      return [p.id, { perfil, parciais: perfil ? parciaisDoTrecho(serie, perfil.i0, perfil.i1) : [] }];
    }),
  );
}

/**
 * Define a rota do trajeto a partir de uma atividade (inteira ou da faixa `iniKm`..`fimKm`) e refaz o trecho das
 * atividades do trajeto no servidor.
 * @returns {Promise<{ total: number, comTrecho: number, semGps: number, semCorrespondencia: number, preservadas: number }>}
 */
export async function definirRota({ trajetoId, atividadeId, iniKm = null, fimKm = null }) {
  const faixa = iniKm !== null && fimKm !== null ? { iniM: Math.round(iniKm * 1000), fimM: Math.round(fimKm * 1000) } : {};
  const r = await definirRotaDoTrajeto({ trajetoId, atividadeId, ...faixa });
  return { total: r.total, comTrecho: r.comTrecho, semGps: r.semGps, semCorrespondencia: r.semCorrespondencia, preservadas: r.preservadas };
}

/** Ajuste manual do trecho de uma atividade: `modo` 'auto' (pela rota), 'inteira' ou 'faixa' (com `iniKm` e `fimKm`). */
export async function ajustarTrecho({ atividadeId, modo, iniKm = null, fimKm = null }) {
  const faixa = modo === 'faixa' ? { iniM: Math.round(iniKm * 1000), fimM: Math.round(fimKm * 1000) } : {};
  return ajustarTrechoDaAtividade({ atividadeId, modo, ...faixa });
}

/**
 * Treino adaptado ao terreno do trajeto: o servidor lê a altimetria da rota de referência e devolve o treino sugerido
 * (pela IA, ou pelas regras da estratégia quando `usarIa` é false). Nada é gravado até `salvarTreinoDoTrajeto`.
 * Lança Error em português.
 */
export function gerarTreinoDoTrajeto({ trajetoId, foco, nivel, estrategia, observacao, usarIa }) {
  return sugerirTreinoDoTrajeto({ trajetoId, foco, nivel, estrategia, observacao: observacao || undefined, usarIa });
}

/** Salva o treino gerado em "Meus treinos", com a tag do trajeto. Retorna o id do modelo. */
export function salvarTreinoDoTrajeto({ uid, treino, trajeto }) {
  return salvarModeloProprio({ uid, entrada: { ...treino, trajetoId: trajeto.id, trajetoNome: trajeto.nome } });
}

/** Altimetria por trajeto, guardada na sessão (a tela redesenha o painel a cada mudança nos dados). */
const cacheDoTerreno = new Map();

/**
 * Terreno do trajeto (perfil de elevação e trechos de subida, plano e descida), lido da atividade de referência.
 * @returns {Promise<null | { perfil: { dM: number[], alt: number[] }, segmentos: object[], resumo: object, altMin: number, altMax: number }>}
 *   null sem rota de referência, sem altimetria ou sem pontos suficientes
 */
export function carregarTerrenoDoTrajeto(trajeto) {
  if (!trajeto?.rotaAtividadeId) return Promise.resolve(null);
  const chave = `${trajeto.id}|${trajeto.rotaAtividadeId}|${trajeto.rotaIniM ?? ''}|${trajeto.rotaFimM ?? ''}`;
  if (!cacheDoTerreno.has(chave)) {
    cacheDoTerreno.set(
      chave,
      lerSerieDetalhe(trajeto.rotaAtividadeId)
        .then((serie) => {
          if (!serie?.alt || !serie.dist) return null;
          const ultima = [...serie.dist].reverse().find((d) => typeof d === 'number' && Number.isFinite(d));
          const iniM = Number.isFinite(trajeto.rotaIniM) ? trajeto.rotaIniM : 0;
          const fimM = Number.isFinite(trajeto.rotaFimM) ? trajeto.rotaFimM : (ultima ?? 0) * 1000;
          const perfil = perfilDoTrajeto(serie, iniM, fimM);
          if (!perfil) return null;
          const { segmentos, resumo, perfil: amostrado } = segmentarTerreno(perfil);
          return { perfil: amostrado, segmentos, resumo, altMin: Math.min(...amostrado.alt), altMax: Math.max(...amostrado.alt) };
        })
        .catch(() => {
          cacheDoTerreno.delete(chave); // tenta de novo na próxima vez
          return null;
        }),
    );
  }
  return cacheDoTerreno.get(chave);
}
