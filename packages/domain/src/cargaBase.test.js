import { describe, expect, it } from 'vitest';
import { somarDias } from './forma.js';
import { cargaBaseSemanal, pisoDaCargaBase } from './ia.js';
import { gerarPlanoAnual } from './planoAnual.js';

const HOJE = '2026-11-04'; // quarta-feira

/** Histórico de 8 semanas com `porSemana` de carga (um treino por semana). */
function historico(porSemana) {
  return Array.from({ length: 8 }, (_, i) => ({ data: somarDias(HOJE, -7 * (i + 1)), estresse: porSemana }));
}

describe('pisoDaCargaBase', () => {
  it('muda com o nível e, sem nível, vale o intermediário', () => {
    expect(pisoDaCargaBase({ nivel: 'iniciante' })).toBe(100);
    expect(pisoDaCargaBase({ nivel: 'intermediario' })).toBe(160);
    expect(pisoDaCargaBase({ nivel: 'avancado' })).toBe(220);
    expect(pisoDaCargaBase({})).toBe(160);
    expect(pisoDaCargaBase()).toBe(160);
  });

  it('as horas por semana do perfil elevam o piso quando valem mais que o nível', () => {
    expect(pisoDaCargaBase({ nivel: 'avancado', horasSemana: 6 })).toBe(220); // 6 × 35 = 210, o nível vence
    expect(pisoDaCargaBase({ nivel: 'intermediario', horasSemana: 10 })).toBe(350);
    expect(pisoDaCargaBase({ nivel: 'iniciante', horasSemana: 4 })).toBe(140);
  });

  it('tem teto, e horas inválidas são ignoradas', () => {
    expect(pisoDaCargaBase({ nivel: 'avancado', horasSemana: 25 })).toBe(400);
    expect(pisoDaCargaBase({ nivel: 'iniciante', horasSemana: 0 })).toBe(100);
    expect(pisoDaCargaBase({ nivel: 'iniciante', horasSemana: null })).toBe(100);
  });
});

describe('cargaBaseSemanal com o perfil', () => {
  it('histórico pequeno: vale o piso do nível', () => {
    expect(cargaBaseSemanal(historico(60), HOJE, { nivel: 'avancado' })).toBe(220);
    expect(cargaBaseSemanal(historico(60), HOJE, { nivel: 'iniciante' })).toBe(100);
  });

  it('histórico maior que o piso continua mandando', () => {
    expect(cargaBaseSemanal(historico(300), HOJE, { nivel: 'avancado' })).toBe(300);
  });

  it('sem histórico devolve 0 (o plano avisa e usa o piso)', () => {
    expect(cargaBaseSemanal([], HOJE, { nivel: 'avancado' })).toBe(0);
  });
});

describe('gerarPlanoAnual com o piso do perfil', () => {
  const prova = { data: '2027-01-03', prioridade: 'A' };

  it('sem histórico parte do piso do nível, com aviso', () => {
    const plano = gerarPlanoAnual({ hoje: HOJE, prova, dias: [], cargaBase: 0, perfil: { nivel: 'avancado', horasSemana: 6 } });
    expect(plano.resumo.cargaBase).toBe(220);
    expect(plano.semanas[0].cargaAlvo).toBe(220);
    expect(plano.avisos.some((a) => a.includes('Sem histórico') && a.includes('220'))).toBe(true);
  });

  it('a base maior sobe 8% por semana e a semana de recuperação cai para 70%', () => {
    const plano = gerarPlanoAnual({ hoje: HOJE, prova, dias: [], cargaBase: 220 });
    expect(plano.semanas[1].cargaAlvo).toBe(Math.round(220 * 1.08));
    const recuperacao = plano.semanas.find((s) => s.recuperacao);
    expect(recuperacao).toBeDefined();
  });
});
