import { avatarDoPersonagem, AVATAR_FOTO, validarDadosPerfil } from '@no-strova/domain';
import { obterUrlAvatar } from '../core/functions.js';
import { enviarFotoPerfil, removerFotoPerfil } from '../core/storage.js';
import { atualizarAvatar, atualizarDadosPessoais } from '../infrastructure/perfilRepo.js';
import { prepararFotoDePerfil } from '../utils/imagem.js';

/** URL assinada da foto (vale 1 h), guardada por `avatarEm`: só busca de novo quando a foto muda. */
const cache = { chave: null, url: null, promessa: null };

/** @returns {Promise<string|null>} */
export function urlDaFoto(uid, versao) {
  const chave = `${uid}:${versao ?? ''}`;
  if (cache.chave === chave && cache.url) return Promise.resolve(cache.url);
  if (cache.chave === chave && cache.promessa) return cache.promessa;
  cache.chave = chave;
  cache.url = null;
  cache.promessa = obterUrlAvatar()
    .then(({ url }) => {
      if (cache.chave === chave) cache.url = url ?? null;
      return url ?? null;
    })
    .catch(() => null)
    .finally(() => {
      if (cache.chave === chave) cache.promessa = null;
    });
  return cache.promessa;
}

export async function usarFoto(uid, arquivo) {
  const blob = await prepararFotoDePerfil(arquivo);
  await enviarFotoPerfil(uid, blob);
  await atualizarAvatar(uid, AVATAR_FOTO);
}

export async function usarPersonagem(uid, id) {
  await atualizarAvatar(uid, avatarDoPersonagem(id));
  await removerFotoPerfil(uid);
}

/** Remove a foto: apaga o arquivo e volta ao personagem padrão. */
export async function removerFoto(uid) {
  await atualizarAvatar(uid, null);
  await removerFotoPerfil(uid);
}

/** Salva nome e data de nascimento (mesma validação do cadastro). Devolve os valores normalizados. */
export async function salvarDadosPessoais(uid, { nome, dataNascimento }) {
  const dados = validarDadosPerfil({ nome, dataNascimento });
  if (!dados.valido) throw new Error(dados.erros.join(' '));
  await atualizarDadosPessoais(uid, dados.valores);
  return dados.valores;
}
