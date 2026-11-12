/**
 * Avatar do usuário. Guardado em users/{uid}.avatar como texto:
 *  - 'foto'                 → a foto enviada pelo usuário (Storage: avatares/{uid}/foto.jpg);
 *  - 'personagem:<id>'      → um dos personagens padrão abaixo;
 *  - ausente/null/inválido  → o personagem padrão (Dick Vigarista).
 */

export const AVATAR_FOTO = 'foto';
const PREFIXO_PERSONAGEM = 'personagem:';

/** Personagens padrão (corrida maluca). `fundo` é a cor do círculo atrás do desenho. */
export const PERSONAGENS = Object.freeze([
  { id: 'dick-vigarista', nome: 'Dick Vigarista', fundo: '#5b2a86' },
  { id: 'muttley', nome: 'Muttley', fundo: '#c9a227' },
  { id: 'penelope-charmosa', nome: 'Penélope Charmosa', fundo: '#ff7ab6' },
  { id: 'irmaos-rocha', nome: 'Irmãos Rocha', fundo: '#6b6b6b' },
  { id: 'professor-aereo', nome: 'Professor Aéreo', fundo: '#2f80ed' },
  { id: 'peter-perfeito', nome: 'Peter Perfeito', fundo: '#e53935' },
  { id: 'sargento-bombarda', nome: 'Sargento Bombarda', fundo: '#4c6b3c' },
  { id: 'quadrilha-da-morte', nome: 'Quadrilha da Morte', fundo: '#2b2b2b' },
  { id: 'barao-vermelho', nome: 'Barão Vermelho', fundo: '#b71c1c' },
  { id: 'rufus-lenhador', nome: 'Rufus Lenhador', fundo: '#2e7d32' },
  { id: 'dupla-sinistra', nome: 'Dupla Sinistra', fundo: '#7b3fb3' },
  { id: 'luke-e-blubber', nome: 'Luke e Blubber', fundo: '#00897b' },
]);

/** Personagem de quem ainda não escolheu avatar. */
export const PERSONAGEM_PADRAO = 'dick-vigarista';

const IDS = new Set(PERSONAGENS.map((p) => p.id));

/** Valor de `avatar` para um personagem. */
export function avatarDoPersonagem(id) {
  return `${PREFIXO_PERSONAGEM}${id}`;
}

/**
 * Interpreta o valor guardado em `avatar`.
 * @param {unknown} valor
 * @returns {{ tipo: 'foto' } | { tipo: 'personagem', id: string }}
 */
export function lerAvatar(valor) {
  if (valor === AVATAR_FOTO) return { tipo: 'foto' };
  if (typeof valor === 'string' && valor.startsWith(PREFIXO_PERSONAGEM)) {
    const id = valor.slice(PREFIXO_PERSONAGEM.length);
    if (IDS.has(id)) return { tipo: 'personagem', id };
  }
  return { tipo: 'personagem', id: PERSONAGEM_PADRAO };
}

/** O valor é aceito para gravar (foto, personagem do catálogo ou null para voltar à inicial)? */
export function avatarValido(valor) {
  return valor === null || valor === AVATAR_FOTO || (typeof valor === 'string' && valor.startsWith(PREFIXO_PERSONAGEM) && IDS.has(valor.slice(PREFIXO_PERSONAGEM.length)));
}
