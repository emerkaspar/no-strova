/**
 * "Trajeto de Treino": um percurso com nome que o usuário cria e escolhe nas atividades, para comparar esforços
 * entre atividades do mesmo trajeto (ver evolucaoTrajeto.js e trechoDoTrajeto.js). Cada trajeto vale para um esporte e a
 * atividade tem no máximo um. Funções puras.
 */
export const LIMITES_TRAJETO = Object.freeze({ nomeMax: 60, porUsuario: 50 });

/** Chave de comparação do nome: sem acento, caixa baixa e espaços únicos ("Volta da Lagoa" = "volta  da lagoa"). */
export function chaveDoTrajeto(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Valida o nome de um trajeto novo.
 * @returns {{ valido: boolean, erros: string[], valores: { nome: string, chave: string }|null }}
 */
export function validarNomeDoTrajeto(entrada) {
  if (typeof entrada !== 'string') return { valido: false, erros: ['Informe o nome do trajeto.'], valores: null };
  const nome = entrada.replace(/\s+/g, ' ').trim();
  if (nome === '') return { valido: false, erros: ['Informe o nome do trajeto.'], valores: null };
  if (nome.length > LIMITES_TRAJETO.nomeMax) {
    return { valido: false, erros: [`O nome do trajeto pode ter no máximo ${LIMITES_TRAJETO.nomeMax} caracteres.`], valores: null };
  }
  return { valido: true, erros: [], valores: { nome, chave: chaveDoTrajeto(nome) } };
}
