import { describe, expect, it } from 'vitest';
import { calcularSerieForma, somarDias } from './forma.js';
import {
  avaliarMeta,
  compararTreino,
  estimarEstresseTreino,
  estresseDoTreino,
  estressesParaProjecao,
  horizonteDaProjecao,
  HORIZONTE_MAXIMO_DIAS,
  MARGEM_PROJECAO_DIAS,
  serieComProjecao,
  sugerirVinculos,
  TOLERANCIA_META,
  treinoNaoRealizado,
  validarMetaForma,
  validarTreinoPlanejado,
} from './planejamento.js';

const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
const configs = [config];
const HOJE = '2026-11-04';
const treino = (extra) => ({ id: 't', data: '2026-11-06', esporte: 'ciclismo', duracaoMin: 60, zona: 'Z2', status: 'planejado', ...extra });

describe('estimativa de estresse do treino', () => {
  it('estima pelo HRSS da zona e cresce com a duração e com a zona', () => {
    const z2 = estimarEstresseTreino({ zona: 'Z2', duracaoMin: 60, config });
    expect(z2).toBeGreaterThan(30);
    expect(estimarEstresseTreino({ zona: 'Z2', duracaoMin: 120, config })).toBeCloseTo(z2 * 2, 0);
    expect(estimarEstresseTreino({ zona: 'Z4', duracaoMin: 60, config })).toBeGreaterThan(z2);
    expect(estimarEstresseTreino({ zona: 'Z4', duracaoMin: 60, config })).toBeLessThan(110);
  });

  it('sem configuração ou sem duração, não estima', () => {
    expect(estimarEstresseTreino({ zona: 'Z2', duracaoMin: 60, config: null })).toBeNull();
    expect(estimarEstresseTreino({ zona: 'Z2', duracaoMin: 0, config })).toBeNull();
  });

  it('o estresse do treino: informado > estimado pela configuração vigente > gravado > 0', () => {
    const base = treino();
    const estimado = estimarEstresseTreino({ zona: 'Z2', duracaoMin: 60, config });
    expect(estresseDoTreino({ ...base, estresseManual: 80 }, configs)).toBe(80);
    expect(estresseDoTreino(base, configs)).toBe(estimado);
    // sem configuração vigente na data: usa o valor gravado ao salvar
    expect(estresseDoTreino({ ...base, estresseEstimado: 44.4 }, [])).toBe(44.4);
    expect(estresseDoTreino(base, [])).toBe(0);
  });

  it('acompanha a mudança de LTHR: o estimado é recalculado com a configuração vigente', () => {
    const nova = { ...config, id: 'c2', vigenteDesde: '2026-11-01', lthr: 150 };
    const antes = estresseDoTreino(treino({ data: '2026-10-20' }), [config, nova]);
    const depois = estresseDoTreino(treino({ data: '2026-11-06' }), [config, nova]);
    expect(depois).not.toBe(antes);
  });
});

describe('validarTreinoPlanejado', () => {
  const ok = { esporte: 'ciclismo', data: '2026-11-06', duracaoMin: '60', zona: 'Z2' };

  it('aceita e normaliza (duração em texto, observações com espaços)', () => {
    const r = validarTreinoPlanejado({ ...ok, observacoes: '  Serra  ', estresseManual: '' });
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ esporte: 'ciclismo', data: '2026-11-06', duracaoMin: 60, zona: 'Z2', estresseManual: null, observacoes: 'Serra' });
  });

  it('aceita estresse informado com vírgula e arredonda a 2 casas', () => {
    expect(validarTreinoPlanejado({ ...ok, estresseManual: '62,456' }).valores.estresseManual).toBe(62.46);
  });

  it('rejeita esporte, data, duração, zona e estresse inválidos', () => {
    for (const ruim of [
      { esporte: 'natacao' }, { data: '2026-02-30' }, { data: '1999-01-01' }, { duracaoMin: '4' }, { duracaoMin: '1500' },
      { duracaoMin: '45,5' }, { duracaoMin: '' }, { zona: 'Z9' }, { zona: '' }, { estresseManual: '0' }, { estresseManual: '5000' },
      { observacoes: 'x'.repeat(501) },
    ]) {
      expect(validarTreinoPlanejado({ ...ok, ...ruim }).valido).toBe(false);
    }
    expect(validarTreinoPlanejado(null).valido).toBe(false);
  });

  it('aceita datas passadas (registrar um treino que já aconteceu)', () => {
    expect(validarTreinoPlanejado({ ...ok, data: '2026-01-10' }).valido).toBe(true);
  });
});

describe('treinoNaoRealizado', () => {
  it('só o treino "planejado" com data anterior a hoje', () => {
    expect(treinoNaoRealizado(treino({ data: '2026-11-03' }), HOJE)).toBe(true);
    expect(treinoNaoRealizado(treino({ data: HOJE }), HOJE)).toBe(false);
    expect(treinoNaoRealizado(treino({ data: '2026-11-03', status: 'realizado' }), HOJE)).toBe(false);
    expect(treinoNaoRealizado(treino({ data: '2026-11-03', status: 'pulado' }), HOJE)).toBe(false);
  });
});

describe('estressesParaProjecao: passado só o realizado; hoje o maior; futuro o planejado', () => {
  const realizado = [{ data: '2026-11-02', estresse: 60 }, { data: HOJE, estresse: 40 }];
  const por = (lista) => Object.fromEntries(lista.map((d) => [d.data, d.estresse]));

  it('ignora o planejado dos dias passados', () => {
    const r = por(estressesParaProjecao({ realizado, treinos: [treino({ data: '2026-11-02', estresseManual: 200 })], configs, hoje: HOJE }));
    expect(r['2026-11-02']).toBe(60);
  });

  it('hoje usa o maior entre planejado e realizado', () => {
    const maior = por(estressesParaProjecao({ realizado, treinos: [treino({ data: HOJE, estresseManual: 90 })], configs, hoje: HOJE }));
    expect(maior[HOJE]).toBe(90);
    const menor = por(estressesParaProjecao({ realizado, treinos: [treino({ data: HOJE, estresseManual: 10 })], configs, hoje: HOJE }));
    expect(menor[HOJE]).toBe(40);
  });

  it('dias futuros usam o planejado, somando treinos do mesmo dia', () => {
    const r = por(
      estressesParaProjecao({
        realizado,
        treinos: [treino({ id: 'a', data: '2026-11-06', estresseManual: 50 }), treino({ id: 'b', data: '2026-11-06', estresseManual: 30 })],
        configs,
        hoje: HOJE,
      }),
    );
    expect(r['2026-11-06']).toBe(80);
  });

  it('treino vinculado (realizado) e pulado não somam: o realizado já conta e o pulado não existe', () => {
    const r = por(
      estressesParaProjecao({
        realizado,
        treinos: [treino({ data: HOJE, status: 'realizado', estresseManual: 500 }), treino({ id: 'p', data: '2026-11-07', status: 'pulado', estresseManual: 70 })],
        configs,
        hoje: HOJE,
      }),
    );
    expect(r[HOJE]).toBe(40);
    expect(r['2026-11-07']).toBeUndefined();
  });

  it('ignora o realizado de datas futuras (não deveria existir)', () => {
    const r = por(estressesParaProjecao({ realizado: [{ data: '2026-11-09', estresse: 99 }], treinos: [], configs, hoje: HOJE }));
    expect(r['2026-11-09']).toBeUndefined();
  });
});

describe('horizonteDaProjecao', () => {
  it('sem plano nem meta, termina hoje', () => {
    expect(horizonteDaProjecao({ treinos: [], meta: null, hoje: HOJE })).toBe(HOJE);
    expect(horizonteDaProjecao({ treinos: [treino({ data: '2026-11-01' })], meta: null, hoje: HOJE })).toBe(HOJE);
  });

  it('vai até o último treino planejado mais 14 dias', () => {
    const h = horizonteDaProjecao({ treinos: [treino({ data: '2026-11-10' }), treino({ id: 'b', data: '2026-11-20' })], meta: null, hoje: HOJE });
    expect(h).toBe(somarDias('2026-11-20', MARGEM_PROJECAO_DIAS));
  });

  it('tem teto de 90 dias a partir de hoje', () => {
    const h = horizonteDaProjecao({ treinos: [treino({ data: '2027-03-01' })], meta: null, hoje: HOJE });
    expect(h).toBe(somarDias(HOJE, HORIZONTE_MAXIMO_DIAS));
  });

  it('a meta também conta e, se for mais distante que o teto, estende a série até ela', () => {
    expect(horizonteDaProjecao({ treinos: [], meta: { ativa: true, dataAlvo: '2026-11-30' }, hoje: HOJE })).toBe(somarDias('2026-11-30', 14));
    expect(horizonteDaProjecao({ treinos: [], meta: { ativa: true, dataAlvo: '2027-06-01' }, hoje: HOJE })).toBe('2027-06-01');
    expect(horizonteDaProjecao({ treinos: [], meta: { ativa: false, dataAlvo: '2026-11-30' }, hoje: HOJE })).toBe(HOJE);
  });
});

describe('serieComProjecao', () => {
  const realizado = [{ data: '2026-10-28', estresse: 80 }, { data: '2026-11-02', estresse: 60 }];

  it('marca como projetado só o que vem depois de hoje', () => {
    const serie = serieComProjecao({ realizado, treinos: [treino({ data: '2026-11-07', estresseManual: 90 })], configs, hoje: HOJE, ate: '2026-11-10' });
    expect(serie.at(-1).data).toBe('2026-11-10');
    expect(serie.filter((d) => d.projetado).map((d) => d.data)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    expect(serie.find((d) => d.data === HOJE).projetado).toBe(false);
  });

  it('o passado não muda com o plano; o treino futuro sobe a Fadiga e derruba a Forma depois dele', () => {
    const semPlano = serieComProjecao({ realizado, treinos: [], configs, hoje: HOJE, ate: '2026-11-10' });
    const comPlano = serieComProjecao({ realizado, treinos: [treino({ data: '2026-11-07', estresseManual: 120 })], configs, hoje: HOJE, ate: '2026-11-10' });
    for (const d of semPlano.filter((x) => x.data < '2026-11-07')) {
      expect(comPlano.find((x) => x.data === d.data).fitness).toBeCloseTo(d.fitness, 10);
    }
    const dia = (s, data) => s.find((x) => x.data === data);
    expect(dia(comPlano, '2026-11-08').fadiga).toBeGreaterThan(dia(semPlano, '2026-11-08').fadiga);
    expect(dia(comPlano, '2026-11-08').forma).toBeLessThan(dia(semPlano, '2026-11-08').forma);
  });

  it('sem `ate`, termina hoje (sem projeção)', () => {
    const serie = serieComProjecao({ realizado, treinos: [treino()], configs, hoje: HOJE });
    expect(serie.at(-1).data).toBe(HOJE);
    expect(serie.some((d) => d.projetado)).toBe(false);
  });

  it('a série passada é idêntica à calculada só com o realizado', () => {
    const direta = calcularSerieForma(realizado, { ate: HOJE });
    const serie = serieComProjecao({ realizado, treinos: [], configs, hoje: HOJE });
    expect(serie.map((d) => d.forma)).toEqual(direta.map((d) => d.forma));
  });
});

describe('meta de forma', () => {
  it('valida a forma desejada e a data (futura, até 365 dias)', () => {
    expect(validarMetaForma({ formaAlvo: '10,5', dataAlvo: '2026-11-20' }, HOJE)).toMatchObject({ valido: true, valores: { formaAlvo: 10.5, dataAlvo: '2026-11-20' } });
    expect(validarMetaForma({ formaAlvo: '+12', dataAlvo: HOJE }, HOJE).valido).toBe(true);
    expect(validarMetaForma({ formaAlvo: '-20', dataAlvo: '2026-12-01' }, HOJE).valido).toBe(true);
    for (const ruim of [{ formaAlvo: '99' }, { formaAlvo: '-99' }, { formaAlvo: '' }, { formaAlvo: 'x' }, { dataAlvo: '2026-11-03' }, { dataAlvo: '2028-01-01' }, { dataAlvo: 'amanhã' }]) {
      expect(validarMetaForma({ formaAlvo: '10', dataAlvo: '2026-11-20', ...ruim }, HOJE).valido).toBe(false);
    }
  });

  const serie = (forma) => [{ data: '2026-11-20', forma, projetado: true }];
  const meta = { formaAlvo: 10, dataAlvo: '2026-11-20', ativa: true };

  it('"atinge" dentro de ±3 pontos, "abaixo" e "acima" fora', () => {
    expect(avaliarMeta(serie(10), meta, HOJE)).toMatchObject({ estado: 'atinge', diferenca: 0 });
    expect(avaliarMeta(serie(10 - TOLERANCIA_META), meta, HOJE).estado).toBe('atinge');
    expect(avaliarMeta(serie(10 + TOLERANCIA_META), meta, HOJE).estado).toBe('atinge');
    expect(avaliarMeta(serie(4), meta, HOJE)).toMatchObject({ estado: 'abaixo', diferenca: -6, formaProjetada: 4 });
    expect(avaliarMeta(serie(18.5), meta, HOJE)).toMatchObject({ estado: 'acima', diferenca: 8.5 });
  });

  it('traz quantos dias faltam e sinaliza quando a série não cobre a data', () => {
    expect(avaliarMeta(serie(10), meta, HOJE).dias).toBe(16);
    expect(avaliarMeta([{ data: '2026-11-10', forma: 0 }], meta, HOJE)).toMatchObject({ estado: 'sem-dados', formaProjetada: null });
    expect(avaliarMeta(serie(10), null, HOJE)).toBeNull();
  });

  it('com treino pesado antes da data, o plano não chega na Forma alta (abaixo); com descanso, chega', () => {
    const realizado = Array.from({ length: 30 }, (_, i) => ({ data: somarDias('2026-10-05', i), estresse: 70 }));
    const pesado = Array.from({ length: 12 }, (_, i) => treino({ id: `p${i}`, data: somarDias('2026-11-05', i), estresseManual: 90 }));
    const alvo = { formaAlvo: 12, dataAlvo: '2026-11-16', ativa: true };
    const ate = horizonteDaProjecao({ treinos: pesado, meta: alvo, hoje: HOJE });
    const comCarga = serieComProjecao({ realizado, treinos: pesado, configs, hoje: HOJE, ate });
    expect(avaliarMeta(comCarga, alvo, HOJE).estado).toBe('abaixo');
    const descanso = serieComProjecao({ realizado, treinos: [], configs, hoje: HOJE, ate });
    expect(avaliarMeta(descanso, alvo, HOJE).formaProjetada).toBeGreaterThan(avaliarMeta(comCarga, alvo, HOJE).formaProjetada);
  });
});

describe('sugerirVinculos', () => {
  const atividades = [
    { id: 'a1', data: '2026-11-03', esporte: 'ciclismo' },
    { id: 'a2', data: '2026-11-03', esporte: 'corrida' },
    { id: 'a3', data: '2026-11-02', esporte: 'ciclismo' },
  ];

  it('sugere atividade do mesmo dia e esporte, sem repetir', () => {
    const treinos = [treino({ id: 't1', data: '2026-11-03' }), treino({ id: 't2', data: '2026-11-03' }), treino({ id: 't3', data: '2026-11-03', esporte: 'corrida' })];
    expect(sugerirVinculos(treinos, atividades)).toEqual([
      { treinoId: 't1', atividadeId: 'a1' },
      { treinoId: 't3', atividadeId: 'a2' },
    ]); // t2 fica sem par: a1 já foi usada
  });

  it('não sugere para treino já vinculado, realizado, pulado ou sem atividade no dia', () => {
    const treinos = [
      treino({ id: 'v', data: '2026-11-03', status: 'realizado', atividadeId: 'a1' }),
      treino({ id: 'p', data: '2026-11-02', status: 'pulado' }),
      treino({ id: 'outro', data: '2026-11-01' }),
    ];
    expect(sugerirVinculos(treinos, atividades)).toEqual([]);
  });

  it('não reaproveita atividade que já está vinculada a outro treino', () => {
    const treinos = [treino({ id: 'v', data: '2026-11-03', status: 'realizado', atividadeId: 'a1' }), treino({ id: 'n', data: '2026-11-03' })];
    expect(sugerirVinculos(treinos, atividades)).toEqual([]);
  });
});

describe('compararTreino', () => {
  it('compara estresse e duração planejados com os realizados', () => {
    const t = treino({ estresseManual: 60, duracaoMin: 60 });
    expect(compararTreino(t, { hrss: 71.4, duracaoS: 3900 }, configs)).toEqual({
      planejado: 60, realizado: 71.4, diferenca: 11.4, duracaoPlanejadaMin: 60, duracaoRealizadaMin: 65,
    });
  });

  it('atividade sem HRSS deixa o realizado e a diferença em branco', () => {
    const r = compararTreino(treino({ estresseManual: 60 }), { hrss: null, duracaoS: 1800 }, configs);
    expect(r.realizado).toBeNull();
    expect(r.diferenca).toBeNull();
    expect(r.duracaoRealizadaMin).toBe(30);
  });
});
