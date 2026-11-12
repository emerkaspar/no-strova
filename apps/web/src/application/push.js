import { apagarTokenDoPush, obterTokenDoPush, pedirPermissaoDoPush, permissaoDoPush, pushSuportado } from '../core/push.js';
import { registrarDispositivoPush, removerDispositivoPush } from '../core/functions.js';

const chaveLocal = (uid) => `push-ativo:${uid}`;

function lerMarca(uid) {
  try {
    return localStorage.getItem(chaveLocal(uid)) === '1';
  } catch {
    return false;
  }
}

function gravarMarca(uid, ativo) {
  try {
    if (ativo) localStorage.setItem(chaveLocal(uid), '1');
    else localStorage.removeItem(chaveLocal(uid));
  } catch {
    // sem localStorage (janela privada): o push funciona, só não lembramos o estado entre visitas
  }
}

/**
 * Situação do push neste aparelho: `suportado`, `permissao` ('granted' | 'denied' | 'default' | 'unsupported') e `ativo`
 * (permitido E registrado no servidor por este navegador).
 */
export async function situacaoDoPush(uid) {
  const suportado = await pushSuportado();
  const permissao = suportado ? permissaoDoPush() : 'unsupported';
  return { suportado, permissao, ativo: suportado && permissao === 'granted' && lerMarca(uid) };
}

/** Pede permissão, obtém o token e registra o aparelho no servidor. Lança Error com mensagem em português. */
export async function ativarPush(uid) {
  if (!(await pushSuportado())) throw new Error('Este navegador não suporta notificações push.');
  const permissao = permissaoDoPush() === 'granted' ? 'granted' : await pedirPermissaoDoPush();
  if (permissao !== 'granted') {
    throw new Error('A permissão de notificações foi negada. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo.');
  }
  const token = await obterTokenDoPush();
  if (!token) throw new Error('Não foi possível obter o token de notificação. Tente de novo.');
  await registrarDispositivoPush({ token, plataforma: /android/i.test(navigator.userAgent) ? 'android' : 'web' });
  gravarMarca(uid, true);
}

/** Remove o aparelho do servidor e invalida o token. */
export async function desativarPush(uid) {
  try {
    const token = await obterTokenDoPush();
    if (token) await removerDispositivoPush({ token });
    await apagarTokenDoPush();
  } finally {
    gravarMarca(uid, false);
  }
}
