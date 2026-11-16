import { describe, expect, it } from 'vitest';
import {
  anexarEficiencia,
  avaliarAtividade,
  candidatosAoDesacoplamento,
  desacoplamentoDaSerie,
  ESPORTE_PADRAO_DE_DESEMPENHO,
  leituraDaEficiencia,
  leituraDoDesacoplamento,
  pontosDeDesempenho,
  resumoDeDesempenho,
  ritmoEmFcFixa,
  serieDeEficiencia,
  vdotDaCorrida,
  vdotDosMelhoresEsforcos,
} from './desempenho.js';

const HOJE = '2026-11-16';
const LEVE = [600, 1800, 600, 0, 0]; // tudo em Z1–Z3

/** Corrida leve de 30 min: 5 km a 150 bpm de FC média, salvo o que for informado. */
const corrida = (extra = {}) => ({
  id: 'a1',
  esporte: 'corrida',
  data: '2026-11-10',
  origem: 'arquivo',
  tempoMovimentoS: 1800,
  duracaoS: 1850,
  distanciaM: 5000,
  altimetriaM: 20,
  fcMedia: 150,
  tempoZonasS: LEVE,
  ...extra,
});

describe('avaliarAtividade', () => {
  it('calcula EF, batimentos por km e velocidade de um treino leve', () => {
    const r = avaliarAtividade(corrida());
    expect(r.ok).toBe(true);
    // 5000 m em 30 min = 166,67 m/min ÷ 150 bpm
    expect(r.ponto.ef).toBeCloseTo(1.1111, 3);
    // 150 bpm × 30 min ÷ 5 km = 900 batimentos por km
    expect(r.ponto.bpmPorKm).toBeCloseTo(900, 6);
    expect(r.ponto.velocidadeKmh).toBeCloseTo(10, 6);
  });

  it('explica por que deixa a atividade de fora', () => {
    expect(avaliarAtividade(corrida({ esporte: 'outro' })).motivo).toBe('esporte');
    expect(avaliarAtividade(corrida({ fcMedia: null })).motivo).toBe('sem-fc');
    expect(avaliarAtividade(corrida({ tempoMovimentoS: 600, distanciaM: 1500 })).motivo).toBe('curta');
    expect(avaliarAtividade(corrida({ tempoZonasS: null })).motivo).toBe('sem-zonas');
    expect(avaliarAtividade(corrida({ tempoZonasS: [0, 600, 600, 600, 600] })).motivo).toBe('intensa');
    expect(avaliarAtividade(corrida({ altimetriaM: 200 })).motivo).toBe('relevo');
    expect(avaliarAtividade({ ...corrida({ esporte: 'ciclismo', altimetriaM: 10, distanciaM: 15000 }), feedback: { etiquetas: ['em-grupo'] } }).motivo).toBe('em-grupo');
  });

  it('o pedal tolera mais intensidade (25%) e relevo (20 m/km) que a corrida', () => {
    const pedal = (extra) => ({ ...corrida({ distanciaM: 15000, altimetriaM: 270, ...extra }), esporte: 'ciclismo' });
    // 18 m/km e 20% em Z4–Z5: entra no pedal
    expect(avaliarAtividade(pedal({ tempoZonasS: [400, 1000, 400, 600, 0] })).ok).toBe(true);
    // 30% em Z4–Z5 e 24 m/km: fora
    expect(avaliarAtividade(pedal({ tempoZonasS: [300, 700, 300, 500, 0] })).motivo).toBe('intensa');
    expect(avaliarAtividade(pedal({ altimetriaM: 360 })).motivo).toBe('relevo');
    // a corrida segue com 10% e 15 m/km
    expect(avaliarAtividade(corrida({ tempoZonasS: [400, 1000, 400, 600, 0] })).motivo).toBe('intensa');
    expect(avaliarAtividade(corrida({ distanciaM: 15000, altimetriaM: 270 })).motivo).toBe('relevo');
  });

  it('usa a duração total quando não há tempo em movimento', () => {
    const r = avaliarAtividade(corrida({ tempoMovimentoS: null, duracaoS: 2000 }));
    expect(r.ok).toBe(true);
    expect(r.ponto.tempoS).toBe(2000);
  });
});

describe('pontosDeDesempenho', () => {
  it('separa por esporte, ordena por data e conta as excluídas', () => {
    const lista = [corrida({ id: 'b', data: '2026-11-12' }), corrida({ id: 'a', data: '2026-11-01' }), corrida({ id: 'c', tempoZonasS: null }), { ...corrida({ id: 'd' }), esporte: 'ciclismo' }];
    const { pontos, excluidas } = pontosDeDesempenho(lista, 'corrida');
    expect(pontos.map((p) => p.id)).toEqual(['a', 'b']);
    expect(excluidas).toEqual({ 'sem-zonas': 1 });
  });
});

describe('esporte padrão', () => {
  it('é sempre o ciclismo', () => {
    expect(ESPORTE_PADRAO_DE_DESEMPENHO).toBe('ciclismo');
  });
});

describe('serieDeEficiencia e anexarEficiencia', () => {
  const pontos = pontosDeDesempenho(
    [corrida({ id: 'a', data: '2026-10-01', fcMedia: 150 }), corrida({ id: 'b', data: '2026-10-20', fcMedia: 140 })],
    'corrida',
  ).pontos;

  it('suaviza pela média dos últimos 28 dias e deixa nulo o dia sem treino na janela', () => {
    const s = serieDeEficiencia(pontos, { ate: '2026-11-30' });
    expect(s[0]).toMatchObject({ data: '2026-10-01', n: 1 });
    expect(s[0].eficiencia).toBeCloseTo(1.1111, 3);
    // em 20/10 entram os dois treinos (mesmo tempo): média de 166,67/150 e 166,67/140
    const dia20 = s.find((d) => d.data === '2026-10-20');
    expect(dia20.n).toBe(2);
    expect(dia20.eficiencia).toBeCloseTo((1.1111 + 1.1905) / 2, 3);
    // 28 dias depois do último treino a janela esvazia
    expect(s.find((d) => d.data === '2026-11-30').eficiencia).toBeNull();
    expect(s[s.length - 1].data).toBe('2026-11-30');
  });

  it('anexa o EF a uma série por data', () => {
    const s = serieDeEficiencia(pontos, { ate: '2026-10-25' });
    const anexada = anexarEficiencia([{ data: '2026-09-30', fitness: 1 }, { data: '2026-10-20', fitness: 2 }], s);
    expect(anexada[0].eficiencia).toBeNull();
    expect(anexada[1].eficiencia).toBeGreaterThan(1);
    expect(anexada[1].fitness).toBe(2);
  });

  it('série vazia sem pontos', () => {
    expect(serieDeEficiencia([], { ate: HOJE })).toEqual([]);
  });
});

describe('resumoDeDesempenho', () => {
  const lista = [
    // janela anterior (17/09 a 14/10): 150 bpm; recente (15/10 a 11/11 e até hoje): 140 bpm no mesmo ritmo
    corrida({ id: 'a', data: '2026-09-25', fcMedia: 150 }),
    corrida({ id: 'b', data: '2026-10-05', fcMedia: 150 }),
    corrida({ id: 'c', data: '2026-11-03', fcMedia: 140, feedback: { rpe: 4 } }),
    corrida({ id: 'd', data: '2026-11-12', fcMedia: 140, feedback: { rpe: 3 } }),
  ];
  const { pontos } = pontosDeDesempenho(lista, 'corrida');
  const r = resumoDeDesempenho(pontos, { hoje: HOJE });

  it('compara a janela recente com a anterior', () => {
    expect(r.eficiencia.nRecente).toBe(2);
    expect(r.eficiencia.nAnterior).toBe(2);
    expect(r.eficiencia.variacaoPct).toBeCloseTo((150 / 140 - 1) * 100, 2);
    expect(r.leitura.id).toBe('melhorou');
  });

  it('batimentos por km caem quando a FC cai no mesmo ritmo', () => {
    expect(r.bpmPorKm.anterior).toBeCloseTo(900, 6);
    expect(r.bpmPorKm.recente).toBeCloseTo(840, 6);
    expect(r.bpmPorKm.variacaoPct).toBeCloseTo(-6.667, 2);
  });

  it('média de RPE só dos treinos que têm RPE', () => {
    expect(r.rpe.recente).toBe(3.5);
    expect(r.rpe.anterior).toBeNull();
  });

  it('é nulo sem pontos', () => {
    expect(resumoDeDesempenho([], { hoje: HOJE })).toBeNull();
  });
});

describe('leituraDaEficiencia', () => {
  it('usa ±2% como limite', () => {
    expect(leituraDaEficiencia(2).id).toBe('melhorou');
    expect(leituraDaEficiencia(-2).id).toBe('piorou');
    expect(leituraDaEficiencia(1.9).id).toBe('estavel');
    expect(leituraDaEficiencia(null).id).toBe('sem-dados');
  });
});

describe('ritmoEmFcFixa', () => {
  it('compara a velocidade só dos treinos na banda da FC de referência', () => {
    const { pontos } = pontosDeDesempenho(
      [
        corrida({ id: 'a', data: '2026-08-20', fcMedia: 150, distanciaM: 5000 }), // anterior: 10 km/h
        corrida({ id: 'b', data: '2026-09-05', fcMedia: 152, distanciaM: 5000 }),
        corrida({ id: 'c', data: '2026-10-25', fcMedia: 151, distanciaM: 5300 }), // recente: 10,6 km/h
        corrida({ id: 'd', data: '2026-11-08', fcMedia: 149, distanciaM: 5300 }),
        corrida({ id: 'e', data: '2026-11-09', fcMedia: 170, distanciaM: 6000 }), // fora da banda
      ],
      'corrida',
    );
    const r = ritmoEmFcFixa(pontos, { hoje: HOJE });
    expect(r.centro).toBe(151);
    expect(r.recenteKmh).toBeCloseTo(10.6, 6);
    expect(r.anteriorKmh).toBeCloseTo(10, 6);
    expect(r.variacaoPct).toBeCloseTo(6, 6);
    expect(r.nRecente).toBe(2);
  });

  it('precisa de ao menos 3 treinos', () => {
    const { pontos } = pontosDeDesempenho([corrida({ id: 'a' }), corrida({ id: 'b', data: '2026-11-11' })], 'corrida');
    expect(ritmoEmFcFixa(pontos, { hoje: HOJE })).toBeNull();
  });
});

describe('desacoplamentoDaSerie', () => {
  /**
   * 60 min a um ponto por 10 s, a 10 km/h. Os 10 min de aquecimento são descartados, então a janela útil vai de 10 a 60 min e a
   * metade é aos 35 min (2100 s): a FC de cada metade é informada.
   */
  const serie = (fc1, fc2) => {
    const t = Array.from({ length: 361 }, (_, i) => i * 10);
    return { t, vel: t.map(() => 10), fc: t.map((s) => (s <= 2100 ? fc1 : fc2)) };
  };

  it('é zero quando a FC não deriva', () => {
    expect(desacoplamentoDaSerie(serie(150, 150), 'corrida').pct).toBeCloseTo(0, 6);
  });

  it('é positivo quando a FC sobe na segunda metade com a mesma velocidade', () => {
    const r = desacoplamentoDaSerie(serie(150, 157.5), 'corrida');
    // EF cai de v/150 para v/157,5: (1/150 − 1/157,5) ÷ (1/150) = 4,76%
    expect(r.pct).toBeCloseTo(4.762, 2);
    expect(leituraDoDesacoplamento(r.pct).id).toBe('bom');
    expect(leituraDoDesacoplamento(8).id).toBe('medio');
    expect(leituraDoDesacoplamento(12).id).toBe('alto');
  });

  it('descarta o aquecimento', () => {
    const s = serie(150, 150);
    s.fc = s.t.map((t) => (t < 600 ? 110 : 150)); // aquecimento com FC baixa não pode inflar o resultado
    expect(desacoplamentoDaSerie(s, 'corrida').pct).toBeCloseTo(0, 6);
  });

  it('é nulo para treino curto ou sem FC', () => {
    const curta = { t: [0, 10, 20], vel: [10, 10, 10], fc: [150, 150, 150] };
    expect(desacoplamentoDaSerie(curta, 'corrida')).toBeNull();
    expect(desacoplamentoDaSerie({ t: serie(150, 150).t, vel: serie(150, 150).vel }, 'corrida')).toBeNull();
    expect(desacoplamentoDaSerie(null, 'corrida')).toBeNull();
  });
});

describe('candidatosAoDesacoplamento', () => {
  it('pega só treino longo, de arquivo, com série detalhada e comparável, do mais novo para o mais antigo', () => {
    const longo = (id, data, extra = {}) => corrida({ id, data, tempoMovimentoS: 3000, duracaoS: 3100, distanciaM: 8000, detalheEm: 2, ...extra });
    const lista = [longo('a', '2026-11-01'), longo('b', '2026-11-10'), longo('c', '2026-11-05', { detalheEm: null }), corrida({ id: 'd', data: '2026-11-11', detalheEm: 2 }), longo('e', '2026-05-01')];
    expect(candidatosAoDesacoplamento(lista, 'corrida', { hoje: HOJE }).map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('vdotDaCorrida', () => {
  it('bate com a tabela de Daniels (5 km em 20:00 ≈ 49,8)', () => {
    expect(vdotDaCorrida(5000, 20 * 60)).toBeCloseTo(49.8, 1);
  });

  it('10 km em 40:00 ≈ 51,9', () => {
    expect(vdotDaCorrida(10000, 40 * 60)).toBeCloseTo(51.9, 1);
  });

  it('é nulo sem tempo ou distância', () => {
    expect(vdotDaCorrida(0, 100)).toBeNull();
    expect(vdotDaCorrida(5000, null)).toBeNull();
  });
});

describe('vdotDosMelhoresEsforcos', () => {
  it('pega o maior VDOT de cada janela e compara', () => {
    const lista = [
      { esporte: 'corrida', data: '2026-07-01', melhor5kS: 1320 }, // anterior: 22:00
      { esporte: 'corrida', data: '2026-10-20', melhor5kS: 1260, melhor10kS: 2700 }, // recente: 21:00 e 10 km em 45:00
      { esporte: 'ciclismo', data: '2026-10-20', melhor5kS: 600 },
    ];
    const r = vdotDosMelhoresEsforcos(lista, { hoje: HOJE });
    expect(r.recente.vdot).toBeGreaterThan(r.anterior.vdot);
    expect(r.recente.data).toBe('2026-10-20');
    expect(r.variacaoPct).toBeGreaterThan(0);
  });

  it('sem esforços, tudo nulo', () => {
    expect(vdotDosMelhoresEsforcos([], { hoje: HOJE })).toEqual({ recente: null, anterior: null, variacaoPct: null });
  });
});
