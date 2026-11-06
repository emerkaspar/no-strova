import {
  cargaBaseSemanal,
  configVigenteEm,
  estimarEstresseEstruturado,
  estimarEstresseTreino,
  FASES,
  gerarPlanoAnual,
  gerarRascunhoDoPlano,
  provaDoPlano,
  somarDias,
  validarProva,
  validarTreinoPlanejado,
} from '@no-strova/domain';
import { decidirRascunho, sugerirPlanoAnual } from '../core/functions.js';
import { atualizarProva, criarProva } from '../infrastructure/provasRepo.js';
import { criarTreinosEmLote } from '../infrastructure/planoRepo.js';
import { salvarMetaDeForma } from './plano.js';

/** Valida e grava uma prova (nova ou editada). Lança Error em português. Retorna o id. */
export async function salvarProva({ uid, id, entrada, hoje }) {
  const r = validarProva(entrada, hoje);
  if (!r.valido) throw new Error(r.erros.join(' '));
  if (id) {
    await atualizarProva(id, r.valores);
    return id;
  }
  return criarProva(uid, r.valores);
}

/**
 * Plano anual até a prova: semanas, fases e carga-alvo, partindo da carga média recente do atleta.
 * @param {{ hoje: string, prova: any, dias: Array<{ data: string, estresse: number }> }} p `dias`: estresse diário realizado
 */
export function montarPlanoAnual({ hoje, prova, dias }) {
  return gerarPlanoAnual({ hoje, prova, dias, cargaBase: cargaBaseSemanal(dias, hoje) });
}

/**
 * Rascunho de treinos das próximas semanas do plano. Nada é gravado: o usuário revisa e aceita (ver aceitarRascunho).
 * `preferencias`: dias de treino, longão e nível escolhidos no perfil de treino.
 */
export function montarRascunho({ plano, prova, hoje, treinos, configs, calibracao, proprios, preferencias }) {
  const esporte = prova.esporte === 'outro' ? preferencias?.esportePrincipal : prova.esporte;
  return gerarRascunhoDoPlano({
    plano,
    prova,
    hoje,
    esporte: esporte === 'ciclismo' || esporte === 'corrida' ? esporte : 'outro',
    nivel: preferencias?.nivelTreinos ?? 'intermediario',
    configEm: (data) => configVigenteEm(configs, data),
    treinos,
    configs,
    calibracao,
    proprios,
    diasTreino: preferencias?.diasTreino ?? null,
    diaLongao: preferencias?.diaLongao ?? null,
  });
}

/** Grava os treinos aceitos do rascunho de uma vez (tudo ou nada). `itens`: os itens do rascunho. Lança Error em português. */
export function aceitarRascunho({ uid, itens, configs, calibracao = null }) {
  return criarTreinosEmLote(
    uid,
    itens.map((item) => {
      const r = validarTreinoPlanejado(item.entrada);
      if (!r.valido) throw new Error(r.erros.join(' '));
      const config = configVigenteEm(configs, r.valores.data);
      const estimado = r.valores.passos
        ? estimarEstresseEstruturado({ passos: r.valores.passos, config })
        : estimarEstresseTreino({ zona: r.valores.zona, duracaoMin: r.valores.duracaoMin, config, esporte: r.valores.esporte, calibracao });
      return { valores: r.valores, estimado };
    }),
  );
}

/**
 * Pede à IA o rascunho do plano anual (próximas 4 semanas). O servidor confere as regras e devolve `{ rascunhoId, restantes,
 * saida: { resumo, itens, avisos, porSemana, aviso } }`, com os itens no mesmo formato do rascunho por regras. Nada é gravado
 * no plano. Lança Error em português.
 */
export function pedirRascunhoAnualDaIa({ provaId, observacao }) {
  return sugerirPlanoAnual({ provaId, observacao: observacao || undefined });
}

/** Aceita o rascunho da IA: grava os treinos escolhidos pelo caminho de sempre (validação e regras) e só então marca como aceito. */
export async function aceitarRascunhoDaIa({ uid, rascunhoId, itens, configs, calibracao = null }) {
  await aceitarRascunho({ uid, itens, configs, calibracao });
  await decidirRascunho({ rascunhoId, decisao: 'aceito' });
}

export function descartarRascunhoDaIa(rascunhoId) {
  return decidirRascunho({ rascunhoId, decisao: 'descartado' });
}

/** Define a meta de Forma (a existente) com a Forma-alvo e a data da prova. Lança Error em português. */
export function definirMetaDeFormaDaProva({ uid, prova, hoje, metasAtivas }) {
  return salvarMetaDeForma({ uid, entrada: { formaAlvo: prova.formaAlvo, dataAlvo: prova.data }, hoje, metasAtivas });
}

/**
 * Meta de carga da semana que começa em `inicioDaSemana`, vinda do plano anual da prova mais próxima (ou null se a semana não
 * está no plano). Retorna { cargaAlvo, fase, detalhe }.
 */
export function metaDaSemanaDoPlanoAnual({ provas, dias, hoje, inicioDaSemana }) {
  try {
    const prova = provaDoPlano(provas, hoje);
    if (!prova) return null;
    const fim = somarDias(inicioDaSemana, 6);
    const s = montarPlanoAnual({ hoje, prova, dias }).semanas.find((x) => x.inicio <= fim && x.fim >= inicioDaSemana);
    if (!s) return null;
    const extras = [s.recuperacao ? 'recuperação' : null, s.semanaDaProva ? 'semana do evento' : null].filter(Boolean);
    return { cargaAlvo: s.cargaAlvo, fase: FASES[s.fase]?.rotulo ?? s.fase, detalhe: extras.join(' · ') };
  } catch {
    return null;
  }
}
