import { describe, expect, it } from 'vitest';
import { AVATAR_FOTO, avatarDoPersonagem, avatarValido, lerAvatar, PERSONAGENS } from './avatares.js';

describe('avatares', () => {
  it('tem personagens com id único e cor de fundo', () => {
    const ids = PERSONAGENS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PERSONAGENS.every((p) => /^#[0-9a-f]{6}$/i.test(p.fundo) && p.nome)).toBe(true);
    expect(ids.every((id) => /^[a-z-]{2,30}$/.test(id))).toBe(true);
  });

  it('lê foto, personagem e cai no Dick Vigarista no resto', () => {
    expect(lerAvatar(AVATAR_FOTO)).toEqual({ tipo: 'foto' });
    expect(lerAvatar(avatarDoPersonagem('muttley'))).toEqual({ tipo: 'personagem', id: 'muttley' });
    expect(lerAvatar('personagem:inexistente')).toEqual({ tipo: 'personagem', id: 'dick-vigarista' });
    expect(lerAvatar(null)).toEqual({ tipo: 'personagem', id: 'dick-vigarista' });
    expect(lerAvatar(42)).toEqual({ tipo: 'personagem', id: 'dick-vigarista' });
  });

  it('valida o que pode ser gravado', () => {
    expect(avatarValido(null)).toBe(true);
    expect(avatarValido('foto')).toBe(true);
    expect(avatarValido('personagem:muttley')).toBe(true);
    expect(avatarValido('personagem:x')).toBe(false);
    expect(avatarValido('http://malicioso')).toBe(false);
    expect(avatarValido(undefined)).toBe(false);
  });
});
