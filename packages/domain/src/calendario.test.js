import { describe, expect, it } from 'vitest';
import { gradeDoMes, primeiroDoMes, rotuloDoMes, somarMeses, ultimoDoMes } from './calendario.js';

describe('datas do mês', () => {
  it('primeiro e último dia, inclusive em fevereiro bissexto', () => {
    expect(primeiroDoMes('2026-11-17')).toBe('2026-11-01');
    expect(ultimoDoMes('2026-11-17')).toBe('2026-11-30');
    expect(ultimoDoMes('2024-02-10')).toBe('2024-02-29');
    expect(ultimoDoMes('2026-02-10')).toBe('2026-02-28');
  });

  it('soma meses, passando de ano', () => {
    expect(somarMeses('2026-11-17', 1)).toBe('2026-12-01');
    expect(somarMeses('2026-11-17', 2)).toBe('2027-01-01');
    expect(somarMeses('2026-01-31', -1)).toBe('2025-12-01');
    expect(somarMeses('2026-11-17', 0)).toBe('2026-11-01');
    expect(somarMeses('2026-11-17', -23)).toBe('2024-12-01');
  });

  it('rótulo em pt-BR', () => {
    expect(rotuloDoMes('2026-11-03')).toBe('novembro de 2026');
    expect(rotuloDoMes('2026-03-01')).toBe('março de 2026');
  });
});

describe('gradeDoMes', () => {
  it('novembro de 2026: começa na segunda 26/10 e termina no domingo 06/12 (6 semanas)', () => {
    const grade = gradeDoMes('2026-11-15');
    expect(grade).toHaveLength(6);
    expect(grade.every((semana) => semana.length === 7)).toBe(true);
    expect(grade[0][0]).toEqual({ data: '2026-10-26', doMes: false });
    expect(grade[0][6]).toEqual({ data: '2026-11-01', doMes: true }); // 1/11/2026 é domingo
    expect(grade.at(-1)[6].data).toBe('2026-12-06');
  });

  it('fevereiro de 2027 (começa numa segunda e acaba num domingo): 4 semanas exatas, sem dias de outros meses', () => {
    const grade = gradeDoMes('2027-02-10');
    expect(grade).toHaveLength(4);
    expect(grade.flat().every((d) => d.doMes)).toBe(true);
  });

  it('marca doMes só para os dias do mês e cobre todos eles uma única vez', () => {
    const dias = gradeDoMes('2026-09-01').flat();
    expect(dias.filter((d) => d.doMes)).toHaveLength(30);
    expect(new Set(dias.map((d) => d.data)).size).toBe(dias.length);
    expect(dias.every((d, i) => i === 0 || d.data > dias[i - 1].data)).toBe(true);
  });

  it('toda semana começa na segunda-feira', () => {
    for (const semana of gradeDoMes('2026-05-20')) {
      expect(new Date(`${semana[0].data}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });
});
