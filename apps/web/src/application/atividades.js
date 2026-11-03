import { criarAtividadeManual, processarArquivoAtividade } from '../core/functions.js';
import { TAMANHO_MAXIMO_ARQUIVO_BYTES } from '../core/constants.js';
import { enviarArquivoAtividade } from '../core/storage.js';

export const EXTENSOES_ACEITAS = ['fit', 'gpx', 'tcx'];

export function extensaoDoArquivo(nome) {
  const extensao = /\.([A-Za-z0-9]+)$/.exec(nome)?.[1]?.toLowerCase();
  return EXTENSOES_ACEITAS.includes(extensao) ? extensao : null;
}

/** Identificador de 32 caracteres [a-f0-9], aceito pelas regras do Storage e pelas Functions. */
function gerarId() {
  return crypto.randomUUID().replaceAll('-', '');
}

/**
 * Importa um arquivo: envia ao Storage e pede o processamento. Se o arquivo não tiver FC, o erro
 * volta com `codigo === 'sem-fc'` e `atividadeId`, e `reprocessar` completa com a zona sem novo envio.
 * @returns {Promise<{ atividadeId: string, hrss: number|null, alertas: string[] }>}
 */
export async function importarArquivo({ uid, arquivo, esporte, aoProgresso }) {
  const extensao = extensaoDoArquivo(arquivo.name);
  if (!extensao) throw new Error('Formato não aceito. Use arquivos .fit, .gpx ou .tcx.');
  if (arquivo.size === 0) throw new Error('O arquivo está vazio.');
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) throw new Error('O arquivo passa do limite de 15 MB.');

  const atividadeId = gerarId();
  await enviarArquivoAtividade(uid, atividadeId, extensao, arquivo, aoProgresso);
  return reprocessar({ atividadeId, extensao, esporte });
}

/** Pede (de novo) o processamento de um arquivo que já está no Storage. */
export async function reprocessar({ atividadeId, extensao, esporte, zona }) {
  try {
    return await processarArquivoAtividade({ atividadeId, extensao, esporte: esporte || undefined, zona: zona || undefined });
  } catch (err) {
    err.atividadeId = atividadeId;
    err.extensao = extensao;
    throw err;
  }
}

export function registrarAtividadeManual(dados) {
  return criarAtividadeManual(dados);
}
