import { describe, expect, it } from 'vitest';
import { medalhasDasAtividades, melhorMedalha, podioDaMetrica, textoDaJanela } from './medalhas.js';

const HOJE = '2026-11-04';
const ativ = (id, data, extra = {}) => ({ id, data, esporte: 'ciclismo', distanciaM: 20000, duracaoS: 3600, altimetriaM: 100, hrss: 50, ...extra });
const podio = (mapa, id, metrica) => (mapa.get(id) ?? []).find((m) => m.tipo === 'podio' && m.metrica === metrica)?.medalha ?? null;
const recente = (mapa, id, metrica) => (mapa.get(id) ?? []).find((m) => m.tipo === 'recente' && m.metrica === metrica)?.dias ?? null;

describe('pódio', () => {
  const lista = [
    ativ('a', '2026-01-10', { distanciaM: 90000 }),
    ativ('b', '2026-02-10', { distanciaM: 80000 }),
    ativ('c', '2026-03-10', { distanciaM: 70000 }),
    ativ('d', '2026-04-10', { distanciaM: 60000 }),
  ];
  const mapa = medalhasDasAtividades(lista, HOJE);

  it('ouro, prata e bronze para as três melhores; a quarta não ganha', () => {
    expect(podio(mapa, 'a', 'distancia')).toBe('ouro');
    expect(podio(mapa, 'b', 'distancia')).toBe('prata');
    expect(podio(mapa, 'c', 'distancia')).toBe('bronze');
    expect(podio(mapa, 'd', 'distancia')).toBeNull();
  });

  it('guarda a posição e o total de atividades comparadas', () => {
    expect(mapa.get('b').find((m) => m.metrica === 'distancia')).toMatchObject({ posicao: 2, total: 4, valor: 80000 });
  });

  it('só ganha quem supera pelo menos uma outra atividade', () => {
    expect(medalhasDasAtividades([ativ('so', '2026-01-01')], HOJE).size).toBe(0);
    const duas = medalhasDasAtividades([ativ('x', '2026-01-01', { distanciaM: 30000 }), ativ('y', '2026-01-02')], HOJE);
    expect(podio(duas, 'x', 'distancia')).toBe('ouro');
    expect(podio(duas, 'y', 'distancia')).toBeNull();
    const tres = medalhasDasAtividades([ativ('x', '2026-01-01', { distanciaM: 30000 }), ativ('y', '2026-01-02', { distanciaM: 25000 }), ativ('z', '2026-01-03')], HOJE);
    expect(podio(tres, 'y', 'distancia')).toBe('prata');
    expect(podio(tres, 'z', 'distancia')).toBeNull();
  });

  it('só compara dentro do mesmo esporte', () => {
    const m = medalhasDasAtividades(
      [ativ('bike1', '2026-10-01', { distanciaM: 100000 }), ativ('bike2', '2026-10-02'), ativ('corrida1', '2026-10-03', { esporte: 'corrida', distanciaM: 10000 })],
      HOJE,
    );
    expect(podio(m, 'bike1', 'distancia')).toBe('ouro');
    expect(podio(m, 'corrida1', 'distancia')).toBeNull();
  });

  it('no melhor esforço vence o menor tempo; esforço fora do esporte não conta', () => {
    const m = medalhasDasAtividades(
      [
        ativ('lenta', '2026-10-01', { esporte: 'corrida', melhor5kS: 1600 }),
        ativ('media', '2026-10-05', { esporte: 'corrida', melhor5kS: 1500 }),
        ativ('rapida', '2026-10-10', { esporte: 'corrida', melhor5kS: 1450 }),
        ativ('b1', '2026-10-01', { melhor1kS: 100 }),
        ativ('b2', '2026-10-02', { melhor1kS: 90 }),
      ],
      HOJE,
    );
    expect(podio(m, 'rapida', 'melhor5k')).toBe('ouro');
    expect(podio(m, 'media', 'melhor5k')).toBe('prata');
    expect(podio(m, 'lenta', 'melhor5k')).toBeNull();
    expect(podio(m, 'b2', 'melhor1k')).toBeNull();
  });

  it('empate de valor: a mais antiga fica na frente', () => {
    const m = medalhasDasAtividades([ativ('nova', '2026-10-10', { distanciaM: 60000 }), ativ('velha', '2026-10-01', { distanciaM: 60000 }), ativ('menor', '2026-10-02')], HOJE);
    expect(podio(m, 'velha', 'distancia')).toBe('ouro');
    expect(podio(m, 'nova', 'distancia')).toBe('prata');
  });
});

describe('medalhas recentes (30, 60 e 90 dias)', () => {
  // histórico de 200 dias; quatro atividades enormes antigas ocupam o pódio
  const antigas = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'].map((d, i) => ativ(`antiga${i}`, d, { distanciaM: 200000 - i * 1000 }));

  it('o melhor dos últimos 30 dias, fora do pódio, ganha a medalha de 30 dias', () => {
    const lista = [...antigas, ativ('r1', '2026-10-20', { distanciaM: 50000 }), ativ('r2', '2026-10-25', { distanciaM: 40000 })];
    const m = medalhasDasAtividades(lista, HOJE);
    expect(podio(m, 'r1', 'distancia')).toBeNull();
    expect(recente(m, 'r1', 'distancia')).toBe(90); // também é o melhor dos 60 e 90 dias: vale a janela mais longa
    expect(recente(m, 'r2', 'distancia')).toBeNull();
  });

  it('vale a janela mais longa que a atividade vence', () => {
    const lista = [
      ...antigas,
      ativ('dia45', '2026-09-20', { distanciaM: 70000 }), // o melhor dos 60 e 90 dias, mas fora dos 30
      ativ('dia10', '2026-10-25', { distanciaM: 60000 }), // o melhor dos 30 dias
      ativ('dia5', '2026-10-30', { distanciaM: 30000 }), // concorrente na janela de 30 dias
    ];
    const m = medalhasDasAtividades(lista, HOJE);
    expect(recente(m, 'dia45', 'distancia')).toBe(90);
    expect(recente(m, 'dia10', 'distancia')).toBe(30);
  });

  it('o ouro do pódio dispensa a medalha menor da mesma métrica', () => {
    const lista = [ativ('velha', '2026-03-01'), ativ('nova', '2026-10-25', { distanciaM: 99000 })];
    const m = medalhasDasAtividades(lista, HOJE);
    expect(podio(m, 'nova', 'distancia')).toBe('ouro');
    expect(recente(m, 'nova', 'distancia')).toBeNull();
  });

  it('só existe se o histórico passa da janela', () => {
    // todo o histórico cabe nos últimos 30 dias: seria igual ao pódio
    const curto = [...['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d, i) => ativ(`c${i}`, d, { distanciaM: 90000 - i * 1000 })), ativ('c4', '2026-10-24', { distanciaM: 10000 })];
    const m = medalhasDasAtividades(curto, HOJE);
    expect([...m.values()].flat().some((x) => x.tipo === 'recente')).toBe(false);
  });

  it('com 45 dias de histórico há medalha de 30 dias, mas não de 60 nem de 90', () => {
    const lista = [
      ...['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'].map((d, i) => ativ(`o${i}`, d, { distanciaM: 150000 - i * 1000 })),
      ativ('r1', '2026-10-20', { distanciaM: 50000 }),
      ativ('r2', '2026-10-25', { distanciaM: 40000 }),
    ];
    const m = medalhasDasAtividades(lista, HOJE);
    expect(recente(m, 'r1', 'distancia')).toBe(30);
  });

  it('exige pelo menos duas atividades com valor na janela', () => {
    const lista = [...antigas, ativ('so', '2026-10-25', { distanciaM: 50000 })];
    expect(recente(medalhasDasAtividades(lista, HOJE), 'so', 'distancia')).toBeNull();
  });

  it('ordena o pódio (do ouro ao bronze) antes das recentes', () => {
    const lista = [...antigas, ativ('r1', '2026-10-20', { distanciaM: 50000, hrss: 999 }), ativ('r2', '2026-10-25')];
    const l = medalhasDasAtividades(lista, HOJE).get('r1');
    const tipos = l.map((x) => x.tipo);
    expect(tipos).toEqual([...tipos].sort((a, b) => (a === 'podio' ? -1 : 1) - (b === 'podio' ? -1 : 1)));
  });
});

describe('melhorMedalha / textoDaJanela', () => {
  it('a mais alta do pódio; sem pódio, "recente"; sem medalhas, nulo', () => {
    expect(melhorMedalha([{ tipo: 'podio', posicao: 2, medalha: 'prata' }, { tipo: 'podio', posicao: 1, medalha: 'ouro' }])).toBe('ouro');
    expect(melhorMedalha([{ tipo: 'recente', dias: 30 }])).toBe('recente');
    expect(melhorMedalha([])).toBeNull();
    expect(melhorMedalha(undefined)).toBeNull();
  });

  it('escreve a janela', () => {
    expect(textoDaJanela(30)).toBe('Melhor dos últimos 30 dias');
  });
});

describe('podioDaMetrica', () => {
  const lista = [
    ativ('a', '2026-01-10', { distanciaM: 90000 }),
    ativ('b', '2026-02-10', { distanciaM: 80000 }),
    ativ('c', '2026-03-10', { distanciaM: 70000 }),
    ativ('d', '2026-04-10', { distanciaM: 60000 }),
    ativ('e', '2026-05-10', { distanciaM: 95000, esporte: 'corrida' }),
  ];

  it('devolve as três melhores do esporte, da melhor para a pior', () => {
    const p = podioDaMetrica(lista, 'ciclismo', 'distancia');
    expect(p.map((x) => [x.posicao, x.medalha, x.atividade.id, x.valor])).toEqual([
      [1, 'ouro', 'a', 90000],
      [2, 'prata', 'b', 80000],
      [3, 'bronze', 'c', 70000],
    ]);
  });

  it('com duas atividades só há ouro; métrica inexistente ou esporte sem atividade dá vazio', () => {
    expect(podioDaMetrica(lista.slice(0, 2), 'ciclismo', 'distancia').map((x) => x.medalha)).toEqual(['ouro']);
    expect(podioDaMetrica(lista, 'ciclismo', 'nao-existe')).toEqual([]);
    expect(podioDaMetrica(lista, 'outro', 'distancia')).toEqual([]);
  });
});
