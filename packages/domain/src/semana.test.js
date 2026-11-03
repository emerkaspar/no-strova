import { describe, expect, it } from 'vitest';
import { diaDaSemana, inicioDaSemana, montarSemana, totaisDaSemana } from './semana.js';

describe('diaDaSemana / inicioDaSemana', () => {
  it('conta a semana de segunda (0) a domingo (6)', () => {
    expect(diaDaSemana('2026-11-02')).toBe(0); // segunda
    expect(diaDaSemana('2026-11-03')).toBe(1); // terça
    expect(diaDaSemana('2026-11-08')).toBe(6); // domingo
  });

  it('o início da semana é sempre a segunda-feira, inclusive na virada de mês e de ano', () => {
    expect(inicioDaSemana('2026-11-03')).toBe('2026-11-02');
    expect(inicioDaSemana('2026-11-08')).toBe('2026-11-02');
    expect(inicioDaSemana('2026-11-02')).toBe('2026-11-02');
    expect(inicioDaSemana('2026-01-01')).toBe('2025-12-29');
    expect(inicioDaSemana('2026-03-01')).toBe('2026-02-23');
  });
});

describe('montarSemana', () => {
  const hoje = '2026-11-04'; // quarta

  it('devolve 7 dias de segunda a domingo e marca hoje e os dias futuros', () => {
    const semana = montarSemana(hoje);
    expect(semana.map((d) => d.data)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(semana.map((d) => d.rotulo)).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
    expect(semana.map((d) => d.dia)).toEqual(['02', '03', '04', '05', '06', '07', '08']);
    expect(semana.filter((d) => d.hoje).map((d) => d.rotulo)).toEqual(['QUA']);
    expect(semana.filter((d) => d.futuro).map((d) => d.rotulo)).toEqual(['QUI', 'SEX', 'SÁB', 'DOM']);
  });

  it('distribui o estresse realizado e o planejado nos dias certos, somando repetidos', () => {
    const semana = montarSemana(hoje, {
      realizado: [{ data: '2026-11-02', estresse: 50 }, { data: '2026-11-02', estresse: 20 }, { data: '2026-11-04', estresse: 80 }, { data: '2026-10-30', estresse: 99 }],
      planejado: [{ data: '2026-11-05', estresse: 60 }, { data: '2026-11-08', estresse: 40 }],
    });
    expect(semana.map((d) => d.realizado)).toEqual([70, 0, 80, 0, 0, 0, 0]);
    expect(semana.map((d) => d.planejado)).toEqual([0, 0, 0, 60, 0, 0, 40]);
  });

  it('ignora estresse inválido ou não positivo', () => {
    const semana = montarSemana(hoje, { realizado: [{ data: '2026-11-02', estresse: 0 }, { data: '2026-11-03', estresse: null }, { data: '2026-11-04', estresse: Number.NaN }] });
    expect(semana.every((d) => d.realizado === 0)).toBe(true);
  });

  it('soma os totais da semana', () => {
    const semana = montarSemana(hoje, { realizado: [{ data: '2026-11-02', estresse: 70 }], planejado: [{ data: '2026-11-06', estresse: 50 }] });
    expect(totaisDaSemana(semana)).toEqual({ realizado: 70, planejado: 50 });
  });

  it('numa segunda-feira, hoje é o primeiro dia e os outros seis são futuros', () => {
    const semana = montarSemana('2026-11-02');
    expect(semana[0].hoje).toBe(true);
    expect(semana.slice(1).every((d) => d.futuro)).toBe(true);
  });
});
