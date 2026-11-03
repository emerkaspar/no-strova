// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { alternarTema, aplicarTemaSalvo, temaEfetivo } from './tema.js';

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#0a0a0a">';
  delete document.documentElement.dataset.tema;
  localStorage.clear();
});

const corDaBarra = () => document.querySelector('meta[name="theme-color"]').getAttribute('content');

describe('tema', () => {
  it('o padrão é o escuro, sem depender do tema do sistema', () => {
    aplicarTemaSalvo();
    expect(temaEfetivo()).toBe('escuro');
    expect(document.documentElement.dataset.tema).toBe('escuro');
    expect(corDaBarra()).toBe('#0a0a0a');
  });

  it('alterna para o claro, lembra a escolha e atualiza a cor da barra', () => {
    expect(alternarTema()).toBe('claro');
    expect(localStorage.getItem('no-strova:tema')).toBe('claro');
    expect(corDaBarra()).toBe('#f6f6f4');
    expect(alternarTema()).toBe('escuro');
    expect(corDaBarra()).toBe('#0a0a0a');
  });

  it('reabre no claro quando essa foi a escolha salva', () => {
    localStorage.setItem('no-strova:tema', 'claro');
    aplicarTemaSalvo();
    expect(temaEfetivo()).toBe('claro');
  });

  it('valor salvo inválido volta ao escuro', () => {
    localStorage.setItem('no-strova:tema', 'roxo');
    aplicarTemaSalvo();
    expect(temaEfetivo()).toBe('escuro');
  });

  it('funciona mesmo se o armazenamento estiver bloqueado', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado');
    };
    try {
      expect(alternarTema()).toBe('claro');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
