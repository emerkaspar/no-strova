// @vitest-environment jsdom
import { FAIXAS_FORMA } from '@no-strova/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarDicaZonas } from './dicaZonas.js';

let dica;
let chip;
let cartao;

const RESUMO = 'Fase de recuperação, boa para absorver o treino.';

function montar(opcoes = { zonaAtual: 'neutral', rotuloChip: 'Zona neutra', valor: '+0,2', resumo: RESUMO }) {
  document.body.innerHTML = '';
  dica = criarDicaZonas(opcoes);
  document.body.append(dica.raiz);
  chip = dica.raiz.querySelector('.chip-zona');
  cartao = dica.raiz.querySelector('.dica-zonas');
}

const evento = (el, tipo, init) => el.dispatchEvent(new MouseEvent(tipo, { bubbles: tipo !== 'mouseenter' && tipo !== 'mouseleave', ...init }));

beforeEach(() => montar());

describe('conteúdo do hint', () => {
  it('começa fechado e o chip aponta para ele (acessibilidade)', () => {
    expect(cartao.hidden).toBe(true);
    expect(cartao.getAttribute('role')).toBe('tooltip');
    expect(chip.getAttribute('aria-describedby')).toBe(cartao.id);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.querySelector('.chip-texto').textContent).toBe('Zona neutra');
    expect(chip.querySelector('.chip-info').getAttribute('aria-hidden')).toBe('true');
  });

  it('explica a Forma e lista as cinco zonas, da mais alta para a mais baixa, com intervalo e significado', () => {
    expect(cartao.querySelector('.dica-zonas-titulo').textContent).toBe('Zonas de Forma');
    expect(cartao.querySelector('.dica-zonas-texto').textContent).toContain('Fitness menos a Fadiga de ontem');
    const linhas = [...cartao.querySelectorAll('.zona-linha')];
    expect(linhas).toHaveLength(5);
    linhas.forEach((linha, i) => {
      const f = FAIXAS_FORMA[i];
      expect(linha.querySelector('.zona-nome strong').textContent).toBe(f.chip);
      expect(linha.querySelector('.zona-intervalo').textContent).toBe(f.intervalo);
      expect(linha.querySelector('.zona-descricao').textContent).toBe(f.descricao);
      expect(linha.querySelector(`.zona-amostra-${f.id}`)).not.toBeNull();
    });
    expect(linhas.map((l) => l.querySelector('strong').textContent)).toEqual([
      'Zona de transição', 'Zona fresca', 'Zona neutra', 'Zona ótima', 'Zona de sobrecarga',
    ]);
  });

  it('destaca só a zona atual, dizendo onde o usuário está e com que valor', () => {
    const atuais = cartao.querySelectorAll('.zona-atual');
    expect(atuais).toHaveLength(1);
    expect(atuais[0].querySelector('strong').textContent).toBe('Zona neutra');
    expect(atuais[0].getAttribute('aria-current')).toBe('true');
    expect(atuais[0].querySelector('.zona-voce').textContent).toBe('Você está aqui · +0,2');
    expect(cartao.querySelectorAll('.zona-voce')).toHaveLength(1);
  });

  it('o destaque acompanha a zona informada', () => {
    montar({ zonaAtual: 'optimal', rotuloChip: 'Zona ótima', valor: '−19,4', resumo: 'Você treina carregado.' });
    const atual = cartao.querySelector('.zona-atual');
    expect(atual.querySelector('strong').textContent).toBe('Zona ótima');
    expect(atual.querySelector('.zona-voce').textContent).toBe('Você está aqui · −19,4');
    expect(atual.querySelector('.zona-resumo').textContent).toBe('Você treina carregado.');
  });

  it('a frase de destaque (resumo) aparece só na zona atual, junto da descrição de cada zona', () => {
    expect(cartao.querySelectorAll('.zona-resumo')).toHaveLength(1);
    expect(cartao.querySelector('.zona-atual .zona-resumo').textContent).toBe(RESUMO);
    expect(cartao.querySelectorAll('.zona-descricao')).toHaveLength(5);
  });

  it('cada hint tem um id próprio (vários na mesma página)', () => {
    const a = criarDicaZonas({ zonaAtual: 'optimal', rotuloChip: 'x', valor: '1', resumo: 'r' }).raiz.querySelector('.dica-zonas').id;
    const b = criarDicaZonas({ zonaAtual: 'optimal', rotuloChip: 'x', valor: '1', resumo: 'r' }).raiz.querySelector('.dica-zonas').id;
    expect(a).not.toBe(b);
  });
});

describe('mouse', () => {
  it('abre ao passar o mouse e fecha ao sair', () => {
    evento(dica.raiz, 'mouseenter');
    expect(cartao.hidden).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    evento(dica.raiz, 'mouseleave');
    expect(cartao.hidden).toBe(true);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('o número grande também abre o mesmo hint', () => {
    const numero = document.createElement('p');
    document.body.append(numero);
    dica.ligarGatilho(numero);
    expect(numero.classList.contains('com-ajuda')).toBe(true);
    evento(numero, 'mouseenter');
    expect(cartao.hidden).toBe(false);
    evento(numero, 'mouseleave');
    expect(cartao.hidden).toBe(true);
  });
});

describe('teclado e toque', () => {
  it('abre ao focar o chip e fecha ao sair do foco', () => {
    chip.dispatchEvent(new FocusEvent('focus'));
    expect(cartao.hidden).toBe(false);
    chip.dispatchEvent(new FocusEvent('blur'));
    expect(cartao.hidden).toBe(true);
  });

  it('o clique fixa o cartão (funciona no toque): sobrevive à saída do mouse e fecha no segundo clique', () => {
    chip.click();
    expect(cartao.hidden).toBe(false);
    evento(dica.raiz, 'mouseleave');
    expect(cartao.hidden).toBe(false);
    chip.click();
    expect(cartao.hidden).toBe(true);
  });

  it('Esc fecha, inclusive se estiver fixado, e não reabre ao devolver o foco', () => {
    chip.click();
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cartao.hidden).toBe(true);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    chip.dispatchEvent(new FocusEvent('blur'));
    expect(cartao.hidden).toBe(true);
  });

  it('um toque fora fecha o cartão fixado; um toque dentro não', () => {
    chip.click();
    cartao.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(cartao.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(cartao.hidden).toBe(true);
  });
});
