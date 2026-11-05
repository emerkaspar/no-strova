/**
 * Conexão com o Strava por OAuth 2.0. O app manda o usuário ao Strava, que volta para `<domínio do app>/?code=…&state=…`.
 * A volta é lida UMA vez, na carga da página (ao importar este módulo, antes de qualquer tela), e fica guardada até
 * a tela de Configuração consumi-la. O segredo do app nunca passa por aqui: quem troca o código por tokens é o servidor.
 */

const CHAVE_ESTADO = 'strava:estado';
const PREFIXO_ESTADO = 'strava-';
const ESCOPO = 'activity:read_all';
const ROTA_CONFIGURACAO = '#/configuracao';

const clientId = String(import.meta.env.VITE_STRAVA_CLIENT_ID ?? '').trim();

function guardarEstado(valor) {
  try {
    sessionStorage.setItem(CHAVE_ESTADO, valor);
  } catch {
    // sem sessionStorage a conexão ainda funciona, só não confere o `state`
  }
}

function lerEstadoGuardado() {
  try {
    const valor = sessionStorage.getItem(CHAVE_ESTADO);
    sessionStorage.removeItem(CHAVE_ESTADO);
    return valor;
  } catch {
    return null;
  }
}

/** Lê o retorno do Strava na URL e limpa a query. Devolve null quando a página não veio do Strava. */
function lerRetornoDaUrl() {
  const p = new URLSearchParams(window.location.search);
  const estado = p.get('state');
  if (!estado?.startsWith(PREFIXO_ESTADO) || !(p.has('code') || p.has('error'))) return null;

  const esperado = lerEstadoGuardado();
  const codigo = p.get('code');
  const escopo = p.get('scope') ?? '';
  const negado = p.has('error') || !codigo;
  window.history.replaceState(null, '', `${window.location.pathname}${ROTA_CONFIGURACAO}`);

  if (esperado !== null && esperado !== estado) {
    return { erro: 'A conexão com o Strava não pôde ser confirmada. Tente conectar de novo.' };
  }
  if (negado) return { erro: 'A conexão com o Strava foi cancelada. Para sincronizar, conecte de novo e permita o acesso.' };
  return { codigo, escopo };
}

let retornoPendente = lerRetornoDaUrl();

/** O retorno do Strava ainda não tratado (uma vez só), ou null. */
export function consumirRetornoStrava() {
  const retorno = retornoPendente;
  retornoPendente = null;
  return retorno;
}

export function stravaConfigurado() {
  return clientId.length > 0;
}

/** Leva o usuário à página de autorização do Strava. */
export function iniciarConexaoStrava() {
  if (!stravaConfigurado()) throw new Error('O Strava ainda não foi configurado neste ambiente. Fale com o administrador.');
  const estado = `${PREFIXO_ESTADO}${crypto.randomUUID()}`;
  guardarEstado(estado);
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: ESCOPO,
    state: estado,
  }).toString();
  window.location.assign(url.toString());
}
