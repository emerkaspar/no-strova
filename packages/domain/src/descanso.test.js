import { describe, expect, it } from 'vitest';
import { descansoERecuperacao } from './descanso.js';

// 2026-11-06 é sexta-feira; a semana começa em 2026-11-02
describe('descansoERecuperacao', () => {
  it('conta os dias sem treino da semana, incluindo hoje quando ainda não treinou', () => {
    const r = descansoERecuperacao(['2026-11-02', '2026-11-03', '2026-11-05'], '2026-11-06');
    expect(r.descansosNaSemana).toBe(2); // quarta e sexta
  });

  it('hoje sem treino, vindo de dias treinando', () => {
    const r = descansoERecuperacao(['2026-11-03', '2026-11-04', '2026-11-05'], '2026-11-06');
    expect(r.diasSemTreinoSeguidos).toBe(1);
    expect(r.diasTreinandoSeguidos).toBe(3);
  });

  it('vários dias parado', () => {
    const r = descansoERecuperacao(['2026-11-02'], '2026-11-06');
    expect(r.diasSemTreinoSeguidos).toBe(4);
    expect(r.diasTreinandoSeguidos).toBe(1);
  });

  it('hoje com treino: não há descanso seguido e a sequência de treino termina hoje', () => {
    const r = descansoERecuperacao(['2026-11-05', '2026-11-06'], '2026-11-06');
    expect(r.diasSemTreinoSeguidos).toBe(0);
    expect(r.diasTreinandoSeguidos).toBe(2);
  });

  it('sem nenhum treino', () => {
    const r = descansoERecuperacao([], '2026-11-06');
    expect(r).toEqual({ descansosNaSemana: 5, diasSemTreinoSeguidos: 60, diasTreinandoSeguidos: 0 });
  });
});
