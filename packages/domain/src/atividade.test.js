import { describe, expect, it } from 'vitest';
import { caloriasKeytel } from './calorias.js';
import {
  diaNoFuso,
  esporteDoArquivo,
  idadeNaData,
  reduzirSerieFc,
  resumirAmostras,
  validarAtividadeManual,
} from './atividade.js';

/** 10 minutos a 1 Hz, 25 km/h (6,94 m/s), FC de 140 a 150. */
function pedalada(n = 601) {
  return Array.from({ length: n }, (_, i) => ({
    t: i,
    fc: 140 + (i % 11),
    vel: 25 / 3.6,
    dist: (25 / 3.6) * i,
    alt: 100 + i * 0.1,
  }));
}

describe('resumirAmostras', () => {
  it('resume duração, distância, subida e FC', () => {
    const r = resumirAmostras(pedalada(), 'ciclismo');
    expect(r.duracaoS).toBe(600);
    expect(r.tempoMovimentoS).toBe(600);
    expect(r.distanciaM).toBe(Math.round((25 / 3.6) * 600));
    expect(r.altimetriaM).toBeGreaterThan(50);
    expect(r.fcMedia).toBe(145);
    expect(r.fcMax).toBe(150);
  });

  it('desconta paradas do tempo em movimento (limiar de 4 km/h no ciclismo)', () => {
    const amostras = pedalada();
    for (let i = 300; i < 400; i++) amostras[i].vel = 0;
    const r = resumirAmostras(amostras, 'ciclismo');
    expect(r.duracaoS).toBe(600);
    expect(r.tempoMovimentoS).toBe(500);
  });

  it('o limiar da corrida é menor: 3 km/h conta como movimento na corrida, não no ciclismo', () => {
    const lento = Array.from({ length: 121 }, (_, i) => ({ t: i, fc: 120, vel: 3 / 3.6 }));
    expect(resumirAmostras(lento, 'corrida').tempoMovimentoS).toBe(120);
    expect(resumirAmostras(lento, 'ciclismo').tempoMovimentoS).toBe(120); // sem movimento detectado: vale a duração
  });

  it('deriva a velocidade da distância quando o arquivo não traz velocidade', () => {
    const amostras = pedalada().map(({ vel, ...resto }) => resto);
    for (let i = 300; i < 400; i++) amostras[i].dist = amostras[299].dist;
    expect(resumirAmostras(amostras, 'ciclismo').tempoMovimentoS).toBe(500);
  });

  it('deriva a velocidade das coordenadas quando só há latitude e longitude (GPX)', () => {
    // 0,0001° de latitude ≈ 11,1 m por segundo (~40 km/h) durante 60 s, depois 60 s parado
    const amostras = Array.from({ length: 121 }, (_, i) => ({ t: i, lat: Math.min(i, 60) * 0.0001, lon: 0 }));
    const r = resumirAmostras(amostras, 'ciclismo');
    expect(r.duracaoS).toBe(120);
    expect(r.tempoMovimentoS).toBe(60);
  });

  it('sem velocidade nem distância, o tempo em movimento é a duração', () => {
    const amostras = Array.from({ length: 61 }, (_, i) => ({ t: i, fc: 130 }));
    expect(resumirAmostras(amostras, 'outro').tempoMovimentoS).toBe(60);
  });

  it('ignora leituras de FC inválidas (0 e valores absurdos)', () => {
    const amostras = pedalada(61).map((a, i) => ({ ...a, fc: i < 5 ? 0 : 150 }));
    amostras[10].fc = 255;
    const r = resumirAmostras(amostras, 'ciclismo');
    expect(r.fcMedia).toBe(150);
    expect(r.fcMax).toBe(150);
  });

  it('sem FC no arquivo, fcMedia e fcMax são nulos', () => {
    const amostras = pedalada(61).map(({ fc, ...resto }) => resto);
    const r = resumirAmostras(amostras, 'ciclismo');
    expect(r.fcMedia).toBeNull();
    expect(r.fcMax).toBeNull();
  });

  it('soma a distância por coordenadas quando não há distância acumulada', () => {
    // ~111,2 km por grau de latitude
    const amostras = [
      { t: 0, lat: 0, lon: 0 },
      { t: 600, lat: 0.01, lon: 0 },
    ];
    expect(resumirAmostras(amostras, 'corrida').distanciaM).toBeGreaterThan(1100);
    expect(resumirAmostras(amostras, 'corrida').distanciaM).toBeLessThan(1120);
  });

  it('descarta ruído de altímetro (oscilação menor que 3 m)', () => {
    const amostras = Array.from({ length: 61 }, (_, i) => ({ t: i, alt: 100 + (i % 2) * 2 }));
    expect(resumirAmostras(amostras, 'outro').altimetriaM).toBe(0);
  });

  it('retorna null com amostras insuficientes', () => {
    expect(resumirAmostras([], 'ciclismo')).toBeNull();
    expect(resumirAmostras([{ t: 0 }], 'ciclismo')).toBeNull();
    expect(resumirAmostras([{ t: 5 }, { t: 5 }], 'ciclismo')).toBeNull();
  });
});

describe('reduzirSerieFc', () => {
  it('reduz a um ponto a cada 5 s com a média do intervalo', () => {
    const { t, fc } = reduzirSerieFc(pedalada(61), 5);
    expect(t[0]).toBe(0);
    expect(t[1]).toBe(5);
    expect(t.length).toBe(fc.length);
    expect(t.length).toBeGreaterThan(10);
    expect(t.length).toBeLessThan(15);
  });
});

describe('diaNoFuso', () => {
  it('usa o dia de São Paulo (UTC−3), inclusive na virada', () => {
    expect(diaNoFuso(Date.UTC(2026, 10, 3, 15, 0))).toBe('2026-11-03');
    expect(diaNoFuso(Date.UTC(2026, 10, 4, 1, 59))).toBe('2026-11-03'); // 22:59 em SP
    expect(diaNoFuso(Date.UTC(2026, 10, 4, 3, 0))).toBe('2026-11-04'); // 00:00 em SP
  });
});

describe('esporteDoArquivo', () => {
  it('mapeia nomes de esporte de FIT, TCX e GPX', () => {
    expect(esporteDoArquivo('cycling')).toBe('ciclismo');
    expect(esporteDoArquivo('Biking')).toBe('ciclismo');
    expect(esporteDoArquivo('running')).toBe('corrida');
    expect(esporteDoArquivo('Running')).toBe('corrida');
    expect(esporteDoArquivo('1')).toBe('ciclismo');
    expect(esporteDoArquivo('9')).toBe('corrida');
    expect(esporteDoArquivo('swimming')).toBe('outro');
    expect(esporteDoArquivo(undefined)).toBe('outro');
  });
});

describe('validarAtividadeManual', () => {
  const zonas = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const hoje = Date.UTC(2026, 10, 3, 15, 0);
  const base = { esporte: 'ciclismo', data: '2026-11-01', duracaoMin: '60', zona: 'Z2' };

  it('aceita FC média, zona ou HRSS informado', () => {
    expect(validarAtividadeManual(base, zonas, hoje).valido).toBe(true);
    expect(validarAtividadeManual({ ...base, zona: '', fcMedia: '145' }, zonas, hoje).valido).toBe(true);
    expect(validarAtividadeManual({ ...base, zona: '', hrssManual: '80' }, zonas, hoje).valido).toBe(true);
  });

  it('normaliza unidades e usa 12:00 como hora padrão', () => {
    const r = validarAtividadeManual({ ...base, distanciaKm: '30,5', duracaoMin: '90' }, zonas, hoje);
    expect(r.valores.duracaoS).toBe(5400);
    expect(r.valores.distanciaM).toBe(30500);
    expect(r.valores.horaInicio).toBe('12:00');
  });

  it('exige uma forma de estimar o estresse', () => {
    const r = validarAtividadeManual({ ...base, zona: '' }, zonas, hoje);
    expect(r.valido).toBe(false);
    expect(r.erros.join(' ')).toMatch(/FC média, a zona/);
  });

  it('rejeita esporte, data futura, duração e zona inválidos', () => {
    expect(validarAtividadeManual({ ...base, esporte: 'natacao' }, zonas, hoje).valido).toBe(false);
    expect(validarAtividadeManual({ ...base, data: '2026-11-04' }, zonas, hoje).valido).toBe(false);
    expect(validarAtividadeManual({ ...base, data: '2026-11-03' }, zonas, hoje).valido).toBe(true);
    expect(validarAtividadeManual({ ...base, duracaoMin: '0' }, zonas, hoje).valido).toBe(false);
    expect(validarAtividadeManual({ ...base, duracaoMin: '1500' }, zonas, hoje).valido).toBe(false);
    expect(validarAtividadeManual({ ...base, zona: 'Z9' }, zonas, hoje).valido).toBe(false);
    expect(validarAtividadeManual({ ...base, horaInicio: '25:00' }, zonas, hoje).valido).toBe(false);
  });
});

describe('idadeNaData', () => {
  it('calcula a idade completa na data da atividade', () => {
    expect(idadeNaData('1982-04-30', '2026-04-29')).toBe(43);
    expect(idadeNaData('1982-04-30', '2026-04-30')).toBe(44);
    expect(idadeNaData(null, '2026-04-30')).toBeNull();
  });
});

describe('caloriasKeytel', () => {
  it('estima kcal por FC, peso, idade, sexo e duração (homem, 1 h)', () => {
    const kcal = caloriasKeytel({ fcMedia: 150, pesoKg: 75, idade: 40, sexo: 'masculino', duracaoS: 3600 });
    // (−55,0969 + 94,635 + 14,91 + 8,068) / 4,184 × 60 = 886,8
    expect(kcal).toBe(Math.round(((-55.0969 + 0.6309 * 150 + 0.1988 * 75 + 0.2017 * 40) / 4.184) * 60));
    expect(kcal).toBeGreaterThan(700);
    expect(kcal).toBeLessThan(1000);
  });

  it('usa a equação feminina e nunca retorna negativo', () => {
    const fem = caloriasKeytel({ fcMedia: 150, pesoKg: 60, idade: 35, sexo: 'feminino', duracaoS: 3600 });
    expect(fem).toBe(Math.round(((-20.4022 + 0.4472 * 150 - 0.1263 * 60 + 0.074 * 35) / 4.184) * 60));
    expect(caloriasKeytel({ fcMedia: 40, pesoKg: 60, idade: 35, sexo: 'feminino', duracaoS: 3600 })).toBe(0);
  });

  it('retorna null quando falta dado', () => {
    expect(caloriasKeytel({ fcMedia: null, pesoKg: 60, idade: 35, sexo: 'feminino', duracaoS: 3600 })).toBeNull();
    expect(caloriasKeytel({ fcMedia: 150, pesoKg: 60, idade: null, sexo: 'feminino', duracaoS: 3600 })).toBeNull();
  });
});
