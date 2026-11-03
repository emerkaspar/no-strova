import { describe, expect, it } from 'vitest';
import {
  dataPorExtenso,
  formatarForma,
  horaNoFuso,
  saudacaoDaHora,
  formatarData,
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  formatarNumero,
} from './formatters.js';

describe('formatarDataHora', () => {
  it('formata em pt-BR no fuso de São Paulo (UTC−3)', () => {
    const texto = formatarDataHora(Date.UTC(2026, 10, 3, 15, 30));
    expect(texto).toContain('03/11/2026');
    expect(texto).toContain('12:30');
  });

  it('usa traço quando não há valor', () => {
    expect(formatarDataHora(null)).toBe('—');
    expect(formatarDataHora(undefined)).toBe('—');
  });
});

describe('formatarData', () => {
  it('converte yyyy-mm-dd para dd/mm/aaaa sem deslocar o dia', () => {
    expect(formatarData('2026-11-03')).toBe('03/11/2026');
    expect(formatarData('2026-01-01')).toBe('01/01/2026');
  });

  it('usa traço para valores inválidos', () => {
    expect(formatarData(undefined)).toBe('—');
    expect(formatarData('03/11/2026')).toBe('—');
  });
});

describe('formatarNumero', () => {
  it('usa vírgula decimal e separador de milhar', () => {
    expect(formatarNumero(1234.5, 1)).toBe('1.234,5');
    expect(formatarNumero(42)).toBe('42');
    expect(formatarNumero(null)).toBe('—');
    expect(formatarNumero(Number.NaN)).toBe('—');
  });
});

describe('formatarDuracao', () => {
  it('mostra horas e minutos, ou minutos e segundos', () => {
    expect(formatarDuracao(3900)).toBe('1h 05min');
    expect(formatarDuracao(7475)).toBe('2h 04min');
    expect(formatarDuracao(2530)).toBe('42min 10s');
    expect(formatarDuracao(null)).toBe('—');
  });
});

describe('formatarDistancia', () => {
  it('converte metros em km com uma casa', () => {
    expect(formatarDistancia(42221)).toBe('42,2 km');
    expect(formatarDistancia(0)).toBe('0,0 km');
    expect(formatarDistancia(null)).toBe('—');
  });
});

describe('saudação, hora e data por extenso', () => {
  it('escolhe a saudação pela hora', () => {
    expect(saudacaoDaHora(4)).toBe('Boa noite');
    expect(saudacaoDaHora(5)).toBe('Bom dia');
    expect(saudacaoDaHora(11)).toBe('Bom dia');
    expect(saudacaoDaHora(12)).toBe('Boa tarde');
    expect(saudacaoDaHora(17)).toBe('Boa tarde');
    expect(saudacaoDaHora(18)).toBe('Boa noite');
    expect(saudacaoDaHora(0)).toBe('Boa noite');
  });

  it('usa a hora do fuso de São Paulo (UTC−3), não a do aparelho', () => {
    expect(horaNoFuso(Date.UTC(2026, 10, 3, 15, 30))).toBe(12);
    expect(horaNoFuso(Date.UTC(2026, 10, 3, 2, 59))).toBe(23);
    expect(horaNoFuso(Date.UTC(2026, 10, 3, 3, 0))).toBe(0);
  });

  it('escreve a data por extenso em pt-BR com a inicial maiúscula', () => {
    expect(dataPorExtenso(Date.UTC(2026, 10, 3, 15))).toBe('Terça-feira, 3 de novembro de 2026');
    // 02:00 UTC ainda é o dia anterior em São Paulo
    expect(dataPorExtenso(Date.UTC(2026, 10, 4, 2))).toBe('Terça-feira, 3 de novembro de 2026');
  });
});

describe('formatarForma', () => {
  it('mostra sinal explícito e usa o sinal de menos tipográfico', () => {
    expect(formatarForma(12.4)).toBe('+12');
    expect(formatarForma(-7.6)).toBe('−8');
    expect(formatarForma(0)).toBe('0');
    expect(formatarForma(-0.4)).toBe('0');
    expect(formatarForma(null)).toBe('—');
    expect(formatarForma(Number.NaN)).toBe('—');
  });

  it('com uma casa decimal, mostra o que o inteiro esconderia (o "0" de 0,2)', () => {
    expect(formatarForma(0.2, 1)).toBe('+0,2');
    expect(formatarForma(-0.2, 1)).toBe('−0,2');
    expect(formatarForma(0, 1)).toBe('0,0');
    expect(formatarForma(-0.04, 1)).toBe('0,0'); // arredonda para zero: sem sinal
    expect(formatarForma(-19.44, 1)).toBe('−19,4');
    expect(formatarForma(12, 1)).toBe('+12,0');
    expect(formatarForma(1234.5, 1)).toBe('+1.234,5');
    expect(formatarForma(null, 1)).toBe('—');
  });
});
