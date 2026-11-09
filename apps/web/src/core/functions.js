import { getFunctions, httpsCallable } from 'firebase/functions';
import { REGIAO_FUNCTIONS } from './constants.js';
import { app } from './firebase.js';

const functions = getFunctions(app, REGIAO_FUNCTIONS);

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
export const listarUsuarios = callable('listarUsuarios');
export const criarUsuarioAdmin = callable('criarUsuarioAdmin');
export const atualizarUsuarioAdmin = callable('atualizarUsuarioAdmin');
export const excluirUsuarioAdmin = callable('excluirUsuarioAdmin');
export const processarArquivoAtividade = callable('processarArquivoAtividade');
export const criarAtividadeManual = callable('criarAtividadeManual');
export const excluirAtividade = callable('excluirAtividade');
export const renomearAtividade = callable('renomearAtividade');
export const salvarAtividade = callable('salvarAtividade');
export const excluirTrajeto = callable('excluirTrajeto');
export const definirRotaDoTrajeto = callable('definirRotaDoTrajeto');
export const ajustarTrechoDaAtividade = callable('ajustarTrechoDaAtividade');
export const obterUrlArquivo = callable('obterUrlArquivo');
export const recalcularHistorico = callable('recalcularHistorico');
export const reconstruirEstresseDiario = callable('reconstruirEstresseDiario');
export const reconstruirCalibracao = callable('reconstruirCalibracao');
export const sugerirTreinos = callable('sugerirTreinos');
export const sugerirPlanoAnual = callable('sugerirPlanoAnual');
export const sugerirTreinoUnico = callable('sugerirTreinoUnico');
export const sugerirTreinoDoTrajeto = callable('sugerirTreinoDoTrajeto');
export const calcularMelhoresEsforcos = callable('calcularMelhoresEsforcos');
export const marcarConquistasComoVistas = callable('marcarConquistasComoVistas');
export const marcarNotificacoesComoLidas = callable('marcarNotificacoesComoLidas');
export const marcarTodasNotificacoesComoLidas = callable('marcarTodasNotificacoesComoLidas');
export const decidirRascunho = callable('decidirRascunho');
export const iaChamadasRestantes = callable('iaChamadasRestantes');
export const garminSituacao = callable('garminSituacao');
export const garminConectar = callable('garminConectar');
export const garminDesconectar = callable('garminDesconectar');
export const garminSincronizar = callable('garminSincronizar');
export const intervalsSituacao = callable('intervalsSituacao');
export const intervalsConectar = callable('intervalsConectar');
export const intervalsDesconectar = callable('intervalsDesconectar');
export const intervalsEnviarTreinos = callable('intervalsEnviarTreinos');
export const intervalsSincronizarAtividades = callable('intervalsSincronizarAtividades');
export const intervalsLthr = callable('intervalsLthr');
export const intervalsAtualizarLthr = callable('intervalsAtualizarLthr');
