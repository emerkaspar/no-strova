import { registerSW } from 'virtual:pwa-register';
import { aoMudarSessao, iniciarSessao } from './application/sessao.js';
import { render as renderAuth } from './modules/auth/auth.view.js';
import { render as renderCompletar } from './modules/auth/completar.view.js';
import { renderBloqueado, renderCarregando, renderErro, renderPendente } from './modules/auth/status.view.js';
import { render as renderShell } from './modules/shell/shell.view.js';
import '@fontsource/anton/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/onboarding.css';
import { aplicarTemaSalvo } from './utils/tema.js';

aplicarTemaSalvo();
registerSW({ immediate: true });

const TELAS = {
  carregando: renderCarregando,
  anonimo: renderAuth,
  completar: renderCompletar,
  pendente: renderPendente,
  bloqueado: renderBloqueado,
  erro: renderErro,
  ativo: renderShell,
};

const raiz = document.getElementById('app');
let chaveAtual = null;
let destruirTela = null;

// Só redesenha quando a tela muda, para não apagar o que o usuário está digitando.
aoMudarSessao((sessao) => {
  const chave = `${sessao.acesso}:${sessao.uid ?? ''}:${sessao.admin}`;
  if (chave === chaveAtual) return;
  chaveAtual = chave;
  destruirTela?.();
  destruirTela = TELAS[sessao.acesso](raiz, sessao);
});

iniciarSessao();
