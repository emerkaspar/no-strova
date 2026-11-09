import { diasEntre } from './forma.js';

/**
 * Notificações do app: catálogo de tipos, preferências, ids determinísticos, limiares de lembrete e textos.
 * Funções puras, sem Firebase e sem DOM. Quem grava é só o servidor (Admin SDK); aqui ficam as regras do que avisar.
 */

export const GRUPOS_NOTIFICACAO = Object.freeze({
  treino: 'Treinos',
  corpo: 'Corpo',
  desempenho: 'Desempenho',
  metas: 'Metas e provas',
  integracoes: 'Integrações',
  conta: 'Conta',
});

/** Catálogo: `padrao` diz se o tipo nasce ligado; `soAdmin` restringe o tipo ao papel admin. */
export const TIPOS_NOTIFICACAO = Object.freeze({
  treinoHoje: { grupo: 'treino', rotulo: 'Treino de hoje por fazer', padrao: true },
  treinoOntem: { grupo: 'treino', rotulo: 'Treino de ontem não realizado', padrao: true },
  comoFoi: { grupo: 'treino', rotulo: '"Como foi?" pendente', padrao: true },
  conflitoTreinos: { grupo: 'treino', rotulo: 'Conflito de treinos no mesmo dia', padrao: true },
  pesar: { grupo: 'corpo', rotulo: 'Hora de se pesar', padrao: true },
  medidas: { grupo: 'corpo', rotulo: 'Refazer as medidas do corpo', padrao: true },
  testeLthr: { grupo: 'desempenho', rotulo: 'Refazer o teste de LTHR', padrao: true },
  provaChegando: { grupo: 'metas', rotulo: 'Prova chegando', padrao: true },
  prazoMeta: { grupo: 'metas', rotulo: 'Prazo de meta', padrao: true },
  conquista: { grupo: 'metas', rotulo: 'Conquista atingida', padrao: true },
  recorde: { grupo: 'metas', rotulo: 'Recorde pessoal', padrao: true },
  garminExpirando: { grupo: 'integracoes', rotulo: 'Chave do Garmin expirando', padrao: true },
  envioFalhou: { grupo: 'integracoes', rotulo: 'Falha no envio de treinos', padrao: true },
  contaAprovada: { grupo: 'conta', rotulo: 'Conta aprovada', padrao: true },
  aguardandoAprovacao: { grupo: 'conta', rotulo: 'Usuário aguardando aprovação', padrao: true, soAdmin: true },
  rascunhoIa: { grupo: 'conta', rotulo: 'Rascunho da IA pendente', padrao: true },
});

export const PADROES_NOTIFICACAO = Object.freeze({
  intervaloPesoDias: 14,
  intervaloMedidasDias: 60,
  intervaloLthrSemanas: 12,
});

/** Limites aceitos para os intervalos editáveis. */
export const LIMITES_INTERVALO = Object.freeze({
  intervaloPesoDias: { min: 1, max: 90 },
  intervaloMedidasDias: { min: 7, max: 365 },
  intervaloLthrSemanas: { min: 2, max: 52 },
});

/** Marcos (dias antes) em que a prova e a expiração da chave do Garmin avisam. */
export const MARCOS_PROVA_DIAS = Object.freeze([30, 14, 7, 1]);
export const MARCOS_GARMIN_DIAS = Object.freeze([7, 1]);
/** Meta de peso/condicionamento avisa a 14 e a 3 dias da data-alvo. */
export const MARCOS_META_DIAS = Object.freeze([14, 3]);

/** Horas (São Paulo) dos dois avisos do treino do dia. */
export const HORA_TREINO_MANHA = 7;
export const HORA_TREINO_TARDE = 18;

/**
 * Normaliza as preferências de notificação vindas do documento (ou de um formulário): tipos desligados são os que vêm
 * `false`; intervalos inválidos voltam ao padrão.
 * @returns {{ tipos: Record<string, boolean>, intervaloPesoDias: number, intervaloMedidasDias: number, intervaloLthrSemanas: number }}
 */
export function normalizarPreferenciasNotificacao(entrada) {
  const origem = entrada && typeof entrada === 'object' ? entrada : {};
  const tiposIn = origem.tipos && typeof origem.tipos === 'object' ? origem.tipos : {};
  const tipos = {};
  for (const [tipo, def] of Object.entries(TIPOS_NOTIFICACAO)) tipos[tipo] = typeof tiposIn[tipo] === 'boolean' ? tiposIn[tipo] : def.padrao;
  const saida = { tipos };
  for (const [campo, { min, max }] of Object.entries(LIMITES_INTERVALO)) {
    const n = Number(origem[campo]);
    saida[campo] = Number.isInteger(n) && n >= min && n <= max ? n : PADROES_NOTIFICACAO[campo];
  }
  return saida;
}

/** O tipo está ligado para este usuário? Tipo desconhecido nunca está. */
export function tipoLigado(preferencias, tipo) {
  if (!TIPOS_NOTIFICACAO[tipo]) return false;
  return normalizarPreferenciasNotificacao(preferencias).tipos[tipo];
}

/**
 * Id determinístico `<uid>_<tipo>_<referencia>`: o mesmo evento nunca vira duas notificações, nem em retentativa do
 * trigger nem se o job agendado rodar de novo. A referência é sanitizada para caber em id de documento.
 */
export function idNotificacao(uid, tipo, referencia) {
  const ref = String(referencia ?? 'unico').replace(/[^A-Za-z0-9-]/g, '-').slice(0, 80) || 'unico';
  return `${uid}_${tipo}_${ref}`;
}

/**
 * Lembrete periódico (pesar, medidas, LTHR): vence quando passou `intervaloDias` desde o último registro. O `ciclo`
 * (0 no primeiro vencimento, 1 depois de mais um intervalo…) entra na referência, então o aviso volta a cada intervalo
 * enquanto o usuário não registra, sem repetir todo dia. Sem nenhum registro, avisa uma vez (`ciclo` 0).
 * @param {{ ultimaData: string|null, hoje: string, intervaloDias: number }} p
 * @returns {{ diasDesde: number|null, ciclo: number, referencia: string } | null}
 */
export function lembretePeriodicoVencido({ ultimaData, hoje, intervaloDias }) {
  if (!ultimaData) return { diasDesde: null, ciclo: 0, referencia: 'nunca' };
  const diasDesde = diasEntre(ultimaData, hoje);
  if (diasDesde < intervaloDias) return null;
  const ciclo = Math.floor(diasDesde / intervaloDias) - 1;
  return { diasDesde, ciclo, referencia: `${ultimaData}-c${ciclo}` };
}

/** Faltam exatamente `dias` para a data? Se for marco, devolve o marco; senão `null`. */
export function marcoAtingido(dataAlvo, hoje, marcos) {
  const falta = diasEntre(hoje, dataAlvo);
  return marcos.includes(falta) ? falta : null;
}

function plural(n, singular, pluralTxt) {
  return n === 1 ? singular : pluralTxt;
}

function dataBr(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function quando(dias) {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

/**
 * Monta o conteúdo de uma notificação a partir do tipo e do contexto do evento. Devolve `null` para tipo desconhecido.
 * `rota` é o hash de destino ao tocar na notificação.
 * @returns {{ tipo: string, grupo: string, titulo: string, mensagem: string, rota: string, referencia: string } | null}
 */
export function montarNotificacao(tipo, ctx = {}) {
  const def = TIPOS_NOTIFICACAO[tipo];
  if (!def) return null;
  const base = { tipo, grupo: def.grupo };
  switch (tipo) {
    case 'treinoHoje': {
      const n = ctx.quantidade ?? 1;
      const tarde = ctx.periodo === 'tarde';
      return {
        ...base,
        titulo: tarde ? 'Seu treino de hoje ainda está pendente' : n === 1 ? 'Você tem treino hoje' : `Você tem ${n} treinos hoje`,
        mensagem: tarde ? 'Ainda dá tempo: nenhuma atividade foi importada hoje.' : ctx.resumo || 'Confira o plano do dia.',
        rota: '#/inicio',
        referencia: `${ctx.data}-${tarde ? 'tarde' : 'manha'}`,
      };
    }
    case 'treinoOntem':
      return {
        ...base,
        titulo: 'Treino de ontem sem registro',
        mensagem: 'Foi feito ou pulado? Atualize o status para manter o plano em dia.',
        rota: '#/plano',
        referencia: ctx.data,
      };
    case 'comoFoi':
      return {
        ...base,
        titulo: 'Como foi o treino?',
        mensagem: `Registre o feedback da atividade de ${dataBr(ctx.data)}.`,
        rota: `#/atividades/${ctx.atividadeId}`,
        referencia: ctx.atividadeId,
      };
    case 'conflitoTreinos':
      return {
        ...base,
        titulo: 'Treinos conflitantes no mesmo dia',
        mensagem: `Há ${ctx.quantidade} treinos planejados para ${dataBr(ctx.data)}. Revise o plano.`,
        rota: '#/plano',
        referencia: ctx.data,
      };
    case 'pesar':
      return {
        ...base,
        titulo: 'Hora de se pesar',
        mensagem: ctx.diasDesde == null ? 'Você ainda não registrou nenhuma pesagem.' : `Sua última pesagem foi há ${ctx.diasDesde} ${plural(ctx.diasDesde, 'dia', 'dias')}.`,
        rota: '#/peso',
        referencia: ctx.referencia,
      };
    case 'medidas':
      return {
        ...base,
        titulo: 'Hora de refazer as medidas',
        mensagem: ctx.diasDesde == null ? 'Você ainda não registrou medidas do corpo.' : `Suas últimas medidas foram há ${ctx.diasDesde} ${plural(ctx.diasDesde, 'dia', 'dias')}.`,
        rota: '#/peso',
        referencia: ctx.referencia,
      };
    case 'testeLthr':
      return {
        ...base,
        titulo: 'Hora de refazer o teste de LTHR',
        mensagem:
          ctx.diasDesde == null
            ? 'Nenhum teste de LTHR registrado ainda. Ele calibra suas zonas de frequência cardíaca.'
            : `Seu último teste foi há ${Math.round(ctx.diasDesde / 7)} semanas. Refazer mantém as zonas calibradas.`,
        rota: '#/configuracao',
        referencia: ctx.referencia,
      };
    case 'provaChegando':
      return {
        ...base,
        titulo: `${ctx.nome} ${ctx.dias === 0 ? 'é hoje' : `é ${quando(ctx.dias)}`}`,
        mensagem: `Prova de ${dataBr(ctx.data)}${ctx.local ? ` em ${ctx.local}` : ''}.`,
        rota: '#/plano/provas',
        referencia: `${ctx.provaId}-${ctx.dias}`,
      };
    case 'prazoMeta':
      return {
        ...base,
        titulo: `Prazo da meta ${quando(ctx.dias)}`,
        mensagem: `${ctx.rotuloMeta} vence em ${dataBr(ctx.dataAlvo)}.`,
        rota: '#/progressao',
        referencia: `${ctx.metaId}-${ctx.dias}`,
      };
    case 'conquista':
      return {
        ...base,
        titulo: 'Objetivo concluído!',
        mensagem: ctx.descricao || 'Você atingiu uma meta. Veja sua nova conquista.',
        rota: '#/progressao',
        referencia: ctx.conquistaId,
      };
    case 'recorde':
      return {
        ...base,
        titulo: 'Novo recorde pessoal',
        mensagem: ctx.descricao || 'Você bateu um recorde nesta atividade.',
        rota: `#/atividades/${ctx.atividadeId}`,
        referencia: `${ctx.atividadeId}-${ctx.chave ?? 'rec'}`,
      };
    case 'garminExpirando':
      return {
        ...base,
        titulo: ctx.dias <= 0 ? 'A chave do Garmin expirou' : `A chave do Garmin expira ${quando(ctx.dias)}`,
        mensagem: 'Gere uma nova chave e reconecte para continuar sincronizando.',
        rota: '#/configuracao',
        referencia: `${ctx.expiraEm}-${ctx.dias}`,
      };
    case 'envioFalhou':
      return {
        ...base,
        titulo: 'Falha no envio de treinos',
        mensagem: `${ctx.falhas} ${plural(ctx.falhas, 'treino não foi enviado', 'treinos não foram enviados')} ao Garmin. Tente de novo.`,
        rota: '#/plano',
        referencia: ctx.referencia,
      };
    case 'contaAprovada':
      return {
        ...base,
        titulo: 'Sua conta foi aprovada',
        mensagem: 'Bem-vindo! Você já pode usar o No Strova.',
        rota: '#/inicio',
        referencia: 'aprovada',
      };
    case 'aguardandoAprovacao':
      return {
        ...base,
        titulo: 'Novo usuário aguardando aprovação',
        mensagem: `${ctx.nome || 'Um usuário'} pediu acesso.`,
        rota: '#/admin',
        referencia: ctx.novoUid,
      };
    case 'rascunhoIa':
      return {
        ...base,
        titulo: 'Rascunho da IA aguardando decisão',
        mensagem: 'Há uma sugestão de treinos para aprovar ou descartar.',
        rota: '#/plano',
        referencia: ctx.rascunhoId,
      };
    default:
      return null;
  }
}
