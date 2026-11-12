import { lerAvatar, PERSONAGEM_PADRAO, PERSONAGENS } from '@no-strova/domain';
import { urlDaFoto } from '../application/conta.js';
import { h } from './dom.js';
import { desenhoDoPersonagem } from './personagens.js';

/**
 * Preenche `el` com o avatar do perfil: foto ou personagem (o padrão é o Dick Vigarista).
 * A foto vem por URL assinada; enquanto carrega (ou se falhar) fica o personagem do perfil.
 * @param {HTMLElement} el
 * @param {{ uid?: string|null, perfil?: any, email?: string|null }} dados
 */
export function preencherAvatar(el, { uid, perfil, email }) {
  const base = (perfil?.nome || email || '?').trim();
  const inicial = base.charAt(0).toUpperCase();
  const avatar = lerAvatar(perfil?.avatar);
  const chave = `${avatar.tipo}:${avatar.id ?? ''}:${perfil?.avatarEm ?? ''}:${inicial}`;
  if (el.dataset.avatar === chave) return;
  el.dataset.avatar = chave;

  const p = PERSONAGENS.find((x) => x.id === (avatar.id ?? PERSONAGEM_PADRAO));
  el.replaceChildren(desenhoDoPersonagem(p.id, p.fundo) ?? inicial);
  if (avatar.tipo === 'foto' && uid) {
    urlDaFoto(uid, perfil?.avatarEm).then((url) => {
      if (!url || el.dataset.avatar !== chave) return;
      el.replaceChildren(h('img', { src: url, alt: '', draggable: false }));
    });
  }
}

/** Círculo de avatar pronto para usar: `{ el, atualizar(sessao) }`. */
export function avatarDe(classe) {
  const el = h('span', { class: `avatar-img ${classe ?? ''}`.trim() });
  return { el, atualizar: (sessao) => preencherAvatar(el, { uid: sessao.uid, perfil: sessao.perfil, email: sessao.email }) };
}
