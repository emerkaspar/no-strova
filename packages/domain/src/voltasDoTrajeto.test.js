import { describe, expect, it } from 'vitest';
import { acharTrechoNaSerie, acharTrechosNaSerie, resumoDoTrechoDoTrajeto, rotaDeReferencia } from './trechoDoTrajeto.js';
import { passagensDaAtividade, passagensDoTrajeto } from './evolucaoTrajeto.js';

const LAT0 = -29.25;
const LON0 = -51.5;
const RAIO_M = 320; // circuito de uns 2 km

/** Ponto do circuito no ângulo `a` (rad). */
const ponto = (a) => [LAT0 + (RAIO_M * Math.sin(a)) / 111320, LON0 + (RAIO_M * Math.cos(a)) / (111320 * Math.cos((LAT0 * Math.PI) / 180))];

/**
 * Série com `voltas` voltas no circuito, uma volta por `amostras` pontos, 10 s entre eles, com um trecho fora do circuito
 * antes, entre as voltas e depois (a pessoa sai e volta). Distância acumulada em km.
 */
function serieDeVoltas(voltas, amostras = 100, foraEntre = true) {
  const t = [];
  const lat = [];
  const lon = [];
  const dist = [];
  let km = 0;
  const empurrar = (la, lo) => {
    t.push(t.length * 10);
    lat.push(la);
    lon.push(lo);
    dist.push(km);
    km += 0.02;
  };
  const fora = () => {
    for (let i = 0; i < 12; i++) empurrar(LAT0 + 0.02 + i * 0.0005, LON0 + 0.02); // longe do circuito
  };
  fora();
  for (let v = 0; v < voltas; v++) {
    for (let i = 0; i <= amostras; i++) {
      const [la, lo] = ponto(0.1 + (i / amostras) * (2 * Math.PI - 0.2));
      empurrar(la, lo);
    }
    if (foraEntre || v === voltas - 1) fora();
  }
  return { t, lat, lon, dist };
}

const umaVolta = serieDeVoltas(1);
const rota = rotaDeReferencia(umaVolta, 12, 12 + 100);

describe('voltas do trajeto', () => {
  it('a rota de referência sai de uma volta', () => {
    expect(rota).not.toBeNull();
    expect(rota.comprimentoM).toBeGreaterThan(1800);
  });

  it('acha uma passagem por volta, em ordem de tempo', () => {
    const achados = acharTrechosNaSerie(serieDeVoltas(2), rota);
    expect(achados).toHaveLength(2);
    expect(achados[0].tIniS).toBeLessThan(achados[1].tIniS);
    expect(achados[0].tFimS).toBeLessThan(achados[1].tIniS);
  });

  it('acha as voltas também quando são seguidas, sem sair do circuito', () => {
    const achados = acharTrechosNaSerie(serieDeVoltas(2, 100, false), rota);
    expect(achados).toHaveLength(2);
    const tres = acharTrechosNaSerie(serieDeVoltas(3, 100, false), rota);
    expect(tres).toHaveLength(3);
  });

  it('uma volta só continua sendo uma passagem', () => {
    expect(acharTrechosNaSerie(umaVolta, rota)).toHaveLength(1);
    expect(acharTrechoNaSerie(umaVolta, rota)).not.toBeNull();
  });

  it('cada volta vira uma passagem, com id próprio e a série da mesma atividade', () => {
    const serie = serieDeVoltas(2);
    const resumos = acharTrechosNaSerie(serie, rota).map((a) => resumoDoTrechoDoTrajeto(serie, a, 'ciclismo', 'auto'));
    const atividade = {
      id: 'ativ12345',
      trajetoId: 'traj1',
      data: '2026-11-08',
      esporte: 'ciclismo',
      distanciaM: 9000,
      duracaoS: 3000,
      hrss: 80,
      origem: 'arquivo',
      trajetoTrecho: resumos[0],
      trajetoVoltas: resumos.slice(1),
    };
    const passagens = passagensDoTrajeto([atividade], 'traj1');
    expect(passagens).toHaveLength(2);
    expect(passagens.map((p) => p.id)).toEqual(['ativ12345', 'ativ12345#2']);
    expect(passagens.every((p) => p.atividadeId === 'ativ12345' && p.totalVoltas === 2)).toBe(true);
    expect(passagens.map((p) => p.volta)).toEqual([1, 2]);
    // o HRSS é da atividade inteira: só a primeira volta o leva, para não contar em dobro
    expect(passagens[0].hrss).toBe(80);
    expect(passagens[1].hrss).toBeNull();
    expect(passagens[1].soTrecho).toBe(true);
  });

  it('trecho ajustado à mão ou atividade inteira ignora voltas gravadas', () => {
    const base = { id: 'a1', data: '2026-01-01', esporte: 'ciclismo', distanciaM: 5000, duracaoS: 1000, trajetoVoltas: [{ origem: 'auto', distanciaM: 2000, duracaoS: 500 }] };
    expect(passagensDaAtividade({ ...base, trajetoTrecho: { origem: 'manual', distanciaM: 2000, duracaoS: 500, tIniS: 0, tFimS: 500 } })).toHaveLength(1);
    expect(passagensDaAtividade({ ...base, trajetoTrecho: { origem: 'inteira' } })).toHaveLength(1);
    expect(passagensDaAtividade(base)).toHaveLength(1);
  });
});
