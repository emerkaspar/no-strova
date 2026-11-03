import { describe, expect, it } from 'vitest';
import {
  amostraDeCalibracao,
  atualizarCalibracao,
  chaveDeCalibracao,
  estimarEstresseCalibrado,
  hrssPorHoraCalibrado,
  mediana,
  reconstruirCalibracao,
  zonaDaFcMedia,
} from './calibracao.js';
import { estimarEstresseTreino, estresseDoTreino } from './planejamento.js';

const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
const atividade = (extra) => ({ id: 'a1', esporte: 'ciclismo', data: '2026-10-01', hrss: 60, hrssOrigem: 'fc', fcMedia: 145, tempoMovimentoS: 3600, alertas: [], ...extra });

describe('zonaDaFcMedia', () => {
  it('escolhe a zona mais próxima da FC presumida (fração do LTHR)', () => {
    expect(zonaDaFcMedia(128, 170)).toBe('Z1'); // 0,75
    expect(zonaDaFcMedia(145, 170)).toBe('Z2'); // 0,85
    expect(zonaDaFcMedia(157, 170)).toBe('Z3');
    expect(zonaDaFcMedia(165, 170)).toBe('Z4');
    expect(zonaDaFcMedia(175, 170)).toBe('Z5');
  });

  it('FC fora da faixa plausível ou dados ruins: null', () => {
    expect(zonaDaFcMedia(90, 170)).toBeNull();
    expect(zonaDaFcMedia(200, 170)).toBeNull();
    expect(zonaDaFcMedia(null, 170)).toBeNull();
    expect(zonaDaFcMedia(150, 0)).toBeNull();
  });
});

describe('amostraDeCalibracao', () => {
  it('HRSS por hora da atividade, na chave esporte_zona', () => {
    expect(amostraDeCalibracao(atividade({ hrss: 45, tempoMovimentoS: 2700 }), config)).toEqual({ chave: 'ciclismo_Z2', id: 'a1', data: '2026-10-01', v: 60 });
  });

  it('só HRSS pela FC real, com tempo mínimo e sem alerta de HRSS anormal', () => {
    expect(amostraDeCalibracao(atividade({ hrssOrigem: 'zona' }), config)).toBeNull();
    expect(amostraDeCalibracao(atividade({ hrssOrigem: 'manual' }), config)).toBeNull();
    expect(amostraDeCalibracao(atividade({ tempoMovimentoS: 600 }), config)).toBeNull();
    expect(amostraDeCalibracao(atividade({ alertas: ['hrssAnormal'] }), config)).toBeNull();
    expect(amostraDeCalibracao(atividade({ hrss: null }), config)).toBeNull();
    expect(amostraDeCalibracao(atividade(), null)).toBeNull();
  });
});

describe('atualizarCalibracao / reconstruirCalibracao', () => {
  const amostra = (id, data, v, chave = 'ciclismo_Z2') => ({ chave, id, data, v });

  it('mediana e n a partir das amostras', () => {
    let c = null;
    for (const [id, v] of [['a', 50], ['b', 60], ['c', 70]]) c = atualizarCalibracao(c, { amostra: amostra(id, `2026-10-0${id === 'a' ? 1 : id === 'b' ? 2 : 3}`, v) });
    expect(c.chaves.ciclismo_Z2.n).toBe(3);
    expect(c.chaves.ciclismo_Z2.mediana).toBe(60);
  });

  it('a mesma atividade editada substitui a amostra (não duplica) e pode mudar de chave', () => {
    let c = atualizarCalibracao(null, { amostra: amostra('a', '2026-10-01', 50) });
    c = atualizarCalibracao(c, { removerId: 'a', amostra: amostra('a', '2026-10-01', 80, 'ciclismo_Z3') });
    expect(c.chaves.ciclismo_Z2).toBeUndefined();
    expect(c.chaves.ciclismo_Z3.amostras).toEqual([{ id: 'a', data: '2026-10-01', v: 80 }]);
  });

  it('atividade excluída sai da calibração', () => {
    let c = atualizarCalibracao(null, { amostra: amostra('a', '2026-10-01', 50) });
    c = atualizarCalibracao(c, { removerId: 'a' });
    expect(c.chaves).toEqual({});
  });

  it('guarda só as 30 mais recentes por chave', () => {
    const lista = Array.from({ length: 35 }, (_, i) => amostra(`x${String(i).padStart(2, '0')}`, `2026-09-${String(i + 1).padStart(2, '0')}`.replace(/-3[1-5]$/, '-30'), 50 + i));
    const c = reconstruirCalibracao(lista);
    expect(c.chaves.ciclismo_Z2.n).toBe(30);
    expect(c.chaves.ciclismo_Z2.amostras.every((a) => a.id !== 'x00')).toBe(true);
  });

  it('não altera o objeto recebido', () => {
    const c = atualizarCalibracao(null, { amostra: amostra('a', '2026-10-01', 50) });
    const copia = JSON.parse(JSON.stringify(c));
    atualizarCalibracao(c, { removerId: 'a' });
    expect(c).toEqual(copia);
  });

  it('mediana de lista par é a média dos dois do meio', () => {
    expect(mediana([10, 20, 30, 40])).toBe(25);
    expect(mediana([])).toBeNull();
  });
});

describe('estimativa calibrada', () => {
  const formula = hrssPorHoraCalibrado({ esporte: 'ciclismo', zona: 'Z2', config, calibracao: null });
  const comN = (n, mediana) => ({ chaves: { [chaveDeCalibracao('ciclismo', 'Z2')]: { n, mediana, amostras: [] } } });

  it('sem calibração ou com poucas amostras, vale a fórmula', () => {
    expect(formula.calibrado).toBe(false);
    const poucas = hrssPorHoraCalibrado({ esporte: 'ciclismo', zona: 'Z2', config, calibracao: comN(2, 80) });
    expect(poucas.calibrado).toBe(false);
    expect(poucas.valor).toBe(formula.valor);
  });

  it('com amostras, mistura a mediana do atleta com a fórmula, com peso n/(n+5)', () => {
    const r = hrssPorHoraCalibrado({ esporte: 'ciclismo', zona: 'Z2', config, calibracao: comN(5, 80) });
    expect(r.calibrado).toBe(true);
    expect(r.peso).toBe(0.5);
    expect(r.valor).toBeCloseTo(0.5 * 80 + 0.5 * formula.formula, 6);
  });

  it('mais amostras puxam mais para a mediana', () => {
    const poucas = hrssPorHoraCalibrado({ esporte: 'ciclismo', zona: 'Z2', config, calibracao: comN(3, 80) });
    const muitas = hrssPorHoraCalibrado({ esporte: 'ciclismo', zona: 'Z2', config, calibracao: comN(30, 80) });
    expect(Math.abs(muitas.valor - 80)).toBeLessThan(Math.abs(poucas.valor - 80));
  });

  it('escala pela duração e informa se foi calibrada', () => {
    const r = estimarEstresseCalibrado({ esporte: 'ciclismo', zona: 'Z2', duracaoMin: 30, config, calibracao: comN(30, 80) });
    expect(r.calibrado).toBe(true);
    expect(r.n).toBe(30);
    expect(r.valor).toBeGreaterThan(r.formula);
    expect(estimarEstresseCalibrado({ esporte: 'ciclismo', zona: 'Z2', duracaoMin: 30, config: null, calibracao: comN(30, 80) }).valor).toBeNull();
  });

  it('estimarEstresseTreino e estresseDoTreino usam a calibração; o valor informado continua mandando', () => {
    const treino = { esporte: 'ciclismo', zona: 'Z2', duracaoMin: 60, data: '2026-11-10' };
    const semCalibracao = estimarEstresseTreino({ zona: 'Z2', duracaoMin: 60, config, esporte: 'ciclismo' });
    const cal = comN(30, 80);
    expect(estimarEstresseTreino({ zona: 'Z2', duracaoMin: 60, config, esporte: 'ciclismo', calibracao: cal })).toBeGreaterThan(semCalibracao);
    expect(estresseDoTreino(treino, [config], cal)).toBeGreaterThan(estresseDoTreino(treino, [config]));
    expect(estresseDoTreino({ ...treino, estresseManual: 33 }, [config], cal)).toBe(33);
    // outro esporte não tem amostras: continua na fórmula
    expect(estresseDoTreino({ ...treino, esporte: 'corrida' }, [config], cal)).toBe(estresseDoTreino({ ...treino, esporte: 'corrida' }, [config]));
  });
});
