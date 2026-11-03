import { calcularSerieForma, faixaDaForma, somarDias } from '@no-strova/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../core/functions.js', () => ({ reconstruirEstresseDiario: vi.fn() }));

const { destaqueDoInicio, diasDesdeUltimoTreino } = await import('./inicio.js');
const { formatarForma, formatarNumero } = await import('../utils/formatters.js');

const serieDe = (treinos, ate) => calcularSerieForma(treinos, { ate });
const dado = (d, id) => d.estatisticas.find((e) => e.id === id);

describe('diasDesdeUltimoTreino', () => {
  it('0 quando treinou hoje; senão, quantos dias faz', () => {
    expect(diasDesdeUltimoTreino(serieDe([{ data: '2026-11-03', estresse: 50 }], '2026-11-03'))).toBe(0);
    expect(diasDesdeUltimoTreino(serieDe([{ data: '2026-11-03', estresse: 50 }], '2026-11-06'))).toBe(3);
    expect(diasDesdeUltimoTreino([])).toBeNull();
  });
});

describe('destaqueDoInicio: sem dados', () => {
  it('sem atividades, convida a começar importando um treino', () => {
    const d = destaqueDoInicio([]);
    expect(d.tipo).toBe('vazio');
    expect(d.titulo).toBe('Vamos começar');
    expect(d.cta).toEqual({ rotulo: 'Importar arquivo', acao: 'importar' });
  });

  it('com atividades mas sem HRSS, pede a configuração da FC', () => {
    const d = destaqueDoInicio([], { semHrss: true });
    expect(d.tipo).toBe('vazio');
    expect(d.cta).toEqual({ rotulo: 'Configurar FC', href: '#/configuracao' });
  });
});

describe('destaqueDoInicio: a Forma aparece sempre, em qualquer zona', () => {
  it('o caso do usuário (Forma ≈ 0 depois de um treino): mostra o 0 na zona neutra, com os dados menores', () => {
    const serie = serieDe([{ data: '2026-11-03', estresse: 51 }], '2026-11-03');
    const hoje = serie.at(-1);
    const d = destaqueDoInicio(serie);
    expect(d.tipo).toBe('numero');
    expect(d.numero).toBe('0,0');
    expect(d.zona).toBe('neutral');
    expect(d.chip).toBe('Zona neutra');
    expect(d.titulo).toBe(faixaDaForma(0).resumo);
    expect(d.estatisticas.map((e) => e.id)).toEqual(['fitness', 'fadiga', 'amanha', 'ultimo']);
    expect(dado(d, 'fitness').valor).toBe(formatarNumero(hoje.fitness, 1));
    expect(dado(d, 'fadiga').valor).toBe(formatarNumero(hoje.fadiga, 1));
    expect(d.cta).toEqual({ rotulo: 'Planejar treino', href: '#/plano' });
  });

  it('"Forma amanhã" é Condicionamento − Fadiga de hoje (o efeito do treino de hoje) e mostra a zona de amanhã', () => {
    const serie = serieDe([{ data: '2026-11-03', estresse: 51 }], '2026-11-03');
    const hoje = serie.at(-1);
    const amanha = serieDe([{ data: '2026-11-03', estresse: 51 }], '2026-11-04').at(-1);
    const d = destaqueDoInicio(serie);
    expect(dado(d, 'amanha').valor).toBe(formatarForma(hoje.fitness - hoje.fadiga, 1));
    expect(hoje.fitness - hoje.fadiga).toBeCloseTo(amanha.forma, 10); // é exatamente a Forma de amanhã
    expect(dado(d, 'amanha').nota).toBe(faixaDaForma(amanha.forma).chip);
  });

  it('cada zona tem o seu id (a cor do bloco) e o seu chip', () => {
    const dia = (forma) => ({ data: '2026-11-03', estresse: 0, fitness: 0, fadiga: 0, forma, faixa: 'x' });
    const zonaDe = (forma) => destaqueDoInicio([dia(forma), dia(forma)]);
    expect([zonaDe(30).zona, zonaDe(30).chip]).toEqual(['transicao', 'Zona de transição']);
    expect([zonaDe(10).zona, zonaDe(10).chip]).toEqual(['freshness', 'Zona descansada']);
    expect([zonaDe(0).zona, zonaDe(0).chip]).toEqual(['neutral', 'Zona neutra']);
    expect([zonaDe(-19).zona, zonaDe(-19).chip]).toEqual(['optimal', 'Zona ótima']);
    expect([zonaDe(-40).zona, zonaDe(-40).chip]).toEqual(['overload', 'Zona de sobrecarga']);
    expect(zonaDe(-19).numero).toBe('−19,0'); // o caso do mockup
    expect(zonaDe(12).numero).toBe('+12,0');
  });

  it('o número leva uma casa decimal: a Forma de 0,2 aparece como "+0,2", não como "0"', () => {
    const dia = (forma) => ({ data: '2026-11-03', estresse: 0, fitness: 0, fadiga: 0, forma, faixa: 'x' });
    const numeroDe = (forma) => destaqueDoInicio([dia(forma), dia(forma)]).numero;
    expect(numeroDe(0.2)).toBe('+0,2'); // o caso do usuário
    expect(numeroDe(-0.2)).toBe('−0,2');
    expect(numeroDe(-19.44)).toBe('−19,4');
    expect(numeroDe(5.04)).toBe('+5,0');
  });

  it('Último treino: Hoje, Ontem ou "Há N dias", com o HRSS daquele dia', () => {
    const treino = [{ data: '2026-11-01', estresse: 62 }];
    expect(dado(destaqueDoInicio(serieDe(treino, '2026-11-01')), 'ultimo')).toMatchObject({ valor: 'Hoje', nota: '62 de HRSS' });
    expect(dado(destaqueDoInicio(serieDe(treino, '2026-11-02')), 'ultimo')).toMatchObject({ valor: 'Ontem', nota: '62 de HRSS' });
    expect(dado(destaqueDoInicio(serieDe(treino, '2026-11-05')), 'ultimo')).toMatchObject({ valor: 'Há 4 dias', nota: '62 de HRSS' });
  });

  it('Condicionamento mostra a variação em 7 dias: sobe com treino, cai parado, fica estável com carga constante', () => {
    const sobe = serieDe(Array.from({ length: 8 }, (_, i) => ({ data: somarDias('2026-10-25', i), estresse: 80 })), '2026-11-01');
    expect(dado(destaqueDoInicio(sobe), 'fitness').nota).toMatch(/^▲ \d+,\d em 7 dias$/);

    const cai = serieDe([{ data: '2026-10-01', estresse: 200 }], '2026-10-20');
    expect(dado(destaqueDoInicio(cai), 'fitness').nota).toMatch(/^▼ \d+,\d em 7 dias$/);

    const estavel = serieDe(Array.from({ length: 400 }, (_, i) => ({ data: somarDias('2025-01-01', i), estresse: 100 })));
    expect(dado(destaqueDoInicio(estavel), 'fitness').nota).toBe('estável em 7 dias');
  });

  it('com histórico curto (menos de 8 dias), compara com o início da série', () => {
    const serie = serieDe([{ data: '2026-11-03', estresse: 51 }], '2026-11-03');
    expect(dado(destaqueDoInicio(serie), 'fitness').nota).toMatch(/^▲ \d+,\d em 7 dias$/);
  });
});
