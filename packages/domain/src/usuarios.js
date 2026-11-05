/**
 * Regras de usuário e acesso. Funções puras: sem Firebase, sem DOM.
 */

export const PAPEIS = Object.freeze({
  ADMIN: 'admin',
  ATLETA: 'atleta',
  TREINADOR: 'treinador',
});

/** Papéis que o admin pode atribuir pela tela de usuários (admin só é concedido por script). */
export const PAPEIS_ATRIBUIVEIS = Object.freeze([PAPEIS.ATLETA, PAPEIS.TREINADOR]);

/** Funcionalidades que o admin libera ou retira por usuário (`users/{uid}.recursos`). */
export const RECURSOS = Object.freeze({
  IA: 'ia',
  GARMIN: 'garmin',
  STRAVA: 'strava',
});

export const ROTULOS_RECURSOS = Object.freeze({
  [RECURSOS.IA]: 'Sugestões com IA',
  [RECURSOS.GARMIN]: 'Sincronização com o Garmin',
  [RECURSOS.STRAVA]: 'Sincronização com o Strava',
});

/** Texto de apoio de cada recurso, mostrado no modal de funcionalidades. Para um recurso novo: RECURSOS, rótulo, descrição e padrão. */
export const DESCRICOES_RECURSOS = Object.freeze({
  [RECURSOS.IA]: 'Sugestão de treinos feita pelo Gemini, sujeita ao limite diário.',
  [RECURSOS.GARMIN]: 'Traz as atividades direto do Garmin Connect, sem exportar arquivos.',
  [RECURSOS.STRAVA]: 'Traz as atividades direto do Strava (o usuário escolhe Garmin ou Strava, nunca os dois).',
});

/** Padrão de um usuário novo (ou sem o campo `recursos`): IA ligada, Garmin e Strava desligados. */
export const RECURSOS_PADRAO = Object.freeze({
  [RECURSOS.IA]: true,
  [RECURSOS.GARMIN]: false,
  [RECURSOS.STRAVA]: false,
});

/**
 * Recursos liberados do usuário: o valor gravado em `recursos`, ou o padrão quando falta.
 * @param {{ recursos?: Record<string, unknown> }|null|undefined} perfil
 * @returns {Record<string, boolean>}
 */
export function recursosDoUsuario(perfil) {
  const gravados = perfil?.recursos && typeof perfil.recursos === 'object' ? perfil.recursos : {};
  /** @type {Record<string, boolean>} */
  const resultado = {};
  for (const chave of Object.values(RECURSOS)) {
    resultado[chave] = typeof gravados[chave] === 'boolean' ? gravados[chave] : RECURSOS_PADRAO[chave];
  }
  return resultado;
}

/** @param {Perfil|null|undefined} perfil @param {string} recurso um valor de RECURSOS */
export function temRecurso(perfil, recurso) {
  return recursosDoUsuario(perfil)[recurso] === true;
}

/**
 * Valida os recursos enviados pelo admin: só chaves conhecidas, valores booleanos. Devolve o objeto completo.
 * @param {unknown} entrada
 * @returns {{ valido: boolean, erro: string|null, valores: Record<string, boolean>|null }}
 */
export function validarRecursos(entrada) {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return { valido: false, erro: 'Recursos inválidos.', valores: null };
  }
  const conhecidas = Object.values(RECURSOS);
  const bruto = /** @type {Record<string, unknown>} */ (entrada);
  if (Object.keys(bruto).some((k) => !conhecidas.includes(k)) || conhecidas.some((k) => typeof bruto[k] !== 'boolean')) {
    return { valido: false, erro: 'Recursos inválidos.', valores: null };
  }
  return { valido: true, erro: null, valores: Object.fromEntries(conhecidas.map((k) => [k, /** @type {boolean} */ (bruto[k])])) };
}

/** Versão do texto de aceite LGPD (dados de saúde) vigente. Mudar o texto exige subir a versão. */
export const VERSAO_ACEITE_LGPD = '1';

export const ESTADOS_ACESSO = Object.freeze({
  COMPLETAR: 'completar',
  PENDENTE: 'pendente',
  BLOQUEADO: 'bloqueado',
  ATIVO: 'ativo',
});

const IDADE_MINIMA = 10;
const IDADE_MAXIMA = 110;

/**
 * @typedef {object} Perfil
 * @property {string} [nome]
 * @property {string} [email]
 * @property {string} [role]
 * @property {boolean} [aprovado]
 * @property {boolean} [ativo]
 * @property {string|null} [dataNascimento]
 * @property {{ versao?: string }|null} [aceiteLgpd]
 * @property {{ ia?: boolean, garmin?: boolean, strava?: boolean }} [recursos] funcionalidades liberadas pelo admin (ver `recursosDoUsuario`)
 */

/**
 * Estado de acesso do usuário a partir do documento `users/{uid}`.
 * @param {Perfil|null|undefined} perfil
 * @returns {string} um valor de ESTADOS_ACESSO
 */
export function estadoDeAcesso(perfil) {
  if (!perfil) return ESTADOS_ACESSO.COMPLETAR;
  if (perfil.ativo !== true) return ESTADOS_ACESSO.BLOQUEADO;
  if (!perfil.aceiteLgpd?.versao) return ESTADOS_ACESSO.COMPLETAR;
  if (perfil.aprovado !== true) return ESTADOS_ACESSO.PENDENTE;
  return ESTADOS_ACESSO.ATIVO;
}

/** @param {Perfil|null|undefined} perfil */
export function usuarioPodeAcessar(perfil) {
  return estadoDeAcesso(perfil) === ESTADOS_ACESSO.ATIVO;
}

/**
 * Admin precisa estar aprovado e ativo (mesmo critério das regras do Firestore).
 * @param {Perfil|null|undefined} perfil
 */
export function ehAdmin(perfil) {
  return !!perfil && perfil.role === PAPEIS.ADMIN && perfil.aprovado === true && perfil.ativo === true;
}

/**
 * Valida uma data no formato yyyy-mm-dd (calendário real, sem 31/02).
 * @param {unknown} valor
 */
export function dataIsoValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/**
 * Idade completa em anos na data de referência.
 * @param {string} dataNascimento yyyy-mm-dd
 * @param {Date} [hoje]
 */
export function calcularIdade(dataNascimento, hoje = new Date()) {
  const [ano, mes, dia] = dataNascimento.split('-').map(Number);
  let idade = hoje.getUTCFullYear() - ano;
  const aindaNaoFezAniversario =
    hoje.getUTCMonth() + 1 < mes || (hoje.getUTCMonth() + 1 === mes && hoje.getUTCDate() < dia);
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

/**
 * Valida e normaliza os dados editáveis do perfil. A data de nascimento é opcional.
 * @param {{ nome?: unknown, dataNascimento?: unknown }} entrada
 * @param {Date} [hoje]
 * @returns {{ valido: boolean, erros: string[], valores: { nome: string, dataNascimento: string|null } }}
 */
export function validarDadosPerfil(entrada, hoje = new Date()) {
  const erros = [];
  const nome = typeof entrada?.nome === 'string' ? entrada.nome.trim().replace(/\s+/g, ' ') : '';
  if (nome.length < 2 || nome.length > 80) {
    erros.push('Informe o nome com 2 a 80 caracteres.');
  }

  let dataNascimento = null;
  const bruta = entrada?.dataNascimento;
  if (bruta !== undefined && bruta !== null && bruta !== '') {
    if (!dataIsoValida(bruta)) {
      erros.push('Data de nascimento inválida.');
    } else {
      const idade = calcularIdade(/** @type {string} */ (bruta), hoje);
      if (idade < IDADE_MINIMA || idade > IDADE_MAXIMA) {
        erros.push('Data de nascimento fora do intervalo aceito.');
      } else {
        dataNascimento = /** @type {string} */ (bruta);
      }
    }
  }

  return { valido: erros.length === 0, erros, valores: { nome, dataNascimento } };
}
