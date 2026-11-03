import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { EMULADORES, REGIAO_FUNCTIONS, USAR_EMULADORES } from './constants.js';
import { app } from './firebase.js';

const functions = getFunctions(app, REGIAO_FUNCTIONS);
if (USAR_EMULADORES) connectFunctionsEmulator(functions, EMULADORES.functions.host, EMULADORES.functions.port);

const ERROS_GENERICOS = new Set(['functions/internal', 'functions/unavailable', 'functions/unknown']);

function callable(nome) {
  const chamar = httpsCallable(functions, nome);
  return async (dados = {}) => {
    try {
      const resposta = await chamar(dados);
      return resposta.data;
    } catch (err) {
      if (ERROS_GENERICOS.has(err?.code)) {
        throw new Error('Não foi possível falar com o servidor. Tente novamente em instantes.');
      }
      const erro = new Error(err?.message || 'Não foi possível concluir a operação.');
      erro.codigo = err?.details?.codigo ?? null;
      throw erro;
    }
  };
}

export const ensureUserProfile = callable('ensureUserProfile');
export const listarPendentes = callable('listarPendentes');
export const aprovarUsuario = callable('aprovarUsuario');
export const bloquearUsuario = callable('bloquearUsuario');
export const processarArquivoAtividade = callable('processarArquivoAtividade');
export const criarAtividadeManual = callable('criarAtividadeManual');
export const excluirAtividade = callable('excluirAtividade');
export const obterUrlArquivo = callable('obterUrlArquivo');
export const recalcularHistorico = callable('recalcularHistorico');
