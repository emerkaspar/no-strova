import { ehAdmin, estadoDeAcesso, validarDadosPerfil } from '@no-strova/domain';
import * as authApi from '../core/auth.js';
import { SENHA_MINIMA } from '../core/constants.js';
import { ensureUserProfile } from '../core/functions.js';
import { observarPerfil } from '../infrastructure/perfilRepo.js';

/**
 * Estado da sessão. `acesso` é um destes valores:
 * 'carregando' | 'anonimo' | 'erro' | 'completar' | 'pendente' | 'bloqueado' | 'ativo'
 * (os quatro últimos de estados de acesso vêm de `estadoDeAcesso` do domain).
 */
let estado = { acesso: 'carregando', uid: null, email: null, perfil: null, admin: false, erro: null };
let ultimoPerfil = null;
let cadastroEmAndamento = false;
let cancelarPerfil = null;
const ouvintes = new Set();

function publicar(parcial) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((fn) => fn(estado));
}

function reavaliar() {
  if (!estado.uid || cadastroEmAndamento || estado.acesso === 'erro') return;
  publicar({
    acesso: estadoDeAcesso(ultimoPerfil),
    perfil: ultimoPerfil,
    admin: ehAdmin(ultimoPerfil),
  });
}

export function obterSessao() {
  return estado;
}

/** @returns {() => void} cancela a assinatura */
export function aoMudarSessao(fn) {
  ouvintes.add(fn);
  fn(estado);
  return () => ouvintes.delete(fn);
}

export function iniciarSessao() {
  authApi.observarSessao((usuario) => {
    cancelarPerfil?.();
    cancelarPerfil = null;
    ultimoPerfil = null;

    if (!usuario) {
      publicar({ acesso: 'anonimo', uid: null, email: null, perfil: null, admin: false, erro: null });
      return;
    }

    publicar({ acesso: 'carregando', uid: usuario.uid, email: usuario.email, perfil: null, admin: false, erro: null });
    cancelarPerfil = observarPerfil(
      usuario.uid,
      (perfil) => {
        ultimoPerfil = perfil;
        reavaliar();
      },
      () => publicar({ acesso: 'erro', erro: 'Não foi possível carregar o seu perfil. Tente entrar novamente.' }),
    );
  });
}

function traduzirErro(err) {
  return String(err?.code ?? '').startsWith('auth/') ? authApi.mensagemErroAuth(err) : err.message;
}

function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    throw new Error(`A senha deve ter ao menos ${SENHA_MINIMA} caracteres.`);
  }
}

export async function entrar(email, senha) {
  try {
    await authApi.entrar(email, senha);
  } catch (err) {
    throw new Error(traduzirErro(err));
  }
}

/** Cria a conta no Auth e completa o perfil (a aprovação do admin vem depois). */
export async function cadastrar({ nome, email, senha, dataNascimento, aceite }) {
  const dados = validarDadosPerfil({ nome, dataNascimento });
  if (!dados.valido) throw new Error(dados.erros.join(' '));
  validarSenha(senha);
  if (aceite !== true) {
    throw new Error('É necessário aceitar o tratamento de dados de saúde para criar a conta.');
  }

  cadastroEmAndamento = true;
  try {
    await authApi.criarConta(email, senha);
    await ensureUserProfile({ ...dados.valores, aceiteLgpd: true });
  } catch (err) {
    throw new Error(traduzirErro(err));
  } finally {
    cadastroEmAndamento = false;
    reavaliar();
  }
}

/** Para quem já tem conta, mas ainda não concluiu o perfil ou o aceite LGPD. */
export async function completarCadastro({ nome, dataNascimento, aceite }) {
  const dados = validarDadosPerfil({ nome, dataNascimento });
  if (!dados.valido) throw new Error(dados.erros.join(' '));
  if (aceite !== true) {
    throw new Error('É necessário aceitar o tratamento de dados de saúde para continuar.');
  }
  try {
    await ensureUserProfile({ ...dados.valores, aceiteLgpd: true });
  } catch (err) {
    throw new Error(traduzirErro(err));
  }
}

export function sair() {
  return authApi.sair();
}
