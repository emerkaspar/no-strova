import { describe, expect, it } from 'vitest';
import { alinharPassos, avaliarPasso, compararPassos, resumirAderencia } from './comparacaoTreino.js';

const config = { vigenteDesde: '2026-01-01', lthr: 170, fcMax: 190 };
// Z2 = 136–151, Z4 = 161–170, Z1 = 102–136

const aquecimento = { tipo: 'bloco', papel: 'aquecimento', duracaoS: 600, zona: 'Z2' };
const serie = { tipo: 'serie', repeticoes: 2, esforco: { duracaoS: 300, zona: 'Z4' }, recuperacao: { duracaoS: 120, zona: 'Z1' } };
const passos = [aquecimento, serie]; // 600 + 300 + 120 + 300 = 1320 s

/** Série a cada 5 s com FC dada por função do tempo. */
function serieSintetica(duracaoS, fcDe) {
  const t = [];
  const fc = [];
  const dist = [];
  const vel = [];
  for (let s = 0; s <= duracaoS; s += 5) {
    t.push(s);
    fc.push(fcDe(s));
    vel.push(12);
    dist.push((s * 12) / 3600);
  }
  return { passoS: 5, t, fc, dist, vel };
}

const fcCumprida = (s) => (s < 600 ? 140 : s < 900 ? 165 : s < 1020 ? 120 : 165);

describe('alinharPassos', () => {
  it('empilha as durações planejadas quando não há voltas', () => {
    const al = alinharPassos({ passos, voltas: null, serie: serieSintetica(1320, fcCumprida) });
    expect(al.map((a) => a.origem)).toEqual(['tempo', 'tempo', 'tempo', 'tempo']);
    expect(al.map((a) => [a.iniS, a.fimS])).toEqual([[0, 600], [600, 900], [900, 1020], [1020, 1320]]);
    expect(al.every((a) => !a.incompleto)).toBe(true);
  });

  it('aplica o deslocamento manual', () => {
    const al = alinharPassos({ passos, voltas: null, serie: serieSintetica(1400, fcCumprida), deslocamentoS: 60 });
    expect(al[0].iniS).toBe(60);
    expect(al[1].iniS).toBe(660);
  });

  it('usa as voltas do aparelho quando há uma por passo', () => {
    const voltas = [{ iniS: 0, fimS: 640 }, { iniS: 640, fimS: 930 }, { iniS: 930, fimS: 1050 }, { iniS: 1050, fimS: 1320 }];
    const al = alinharPassos({ passos, voltas, serie: serieSintetica(1320, fcCumprida) });
    expect(al.every((a) => a.origem === 'volta')).toBe(true);
    expect(al[1].iniS).toBe(640);
  });

  it('ignora voltas quando a quantidade não bate com os passos', () => {
    const voltas = [{ iniS: 0, fimS: 660 }, { iniS: 660, fimS: 1320 }];
    const al = alinharPassos({ passos, voltas, serie: serieSintetica(1320, fcCumprida) });
    expect(al[0].origem).toBe('tempo');
  });

  it('marca como incompleto o que passa do fim da atividade', () => {
    const al = alinharPassos({ passos, voltas: null, serie: serieSintetica(1000, fcCumprida) });
    expect(al[0].incompleto).toBe(false);
    expect(al[3].incompleto).toBe(true);
    expect(al[3].fimS).toBeLessThanOrEqual(1000);
  });

  it('devolve vazio sem série', () => {
    expect(alinharPassos({ passos, voltas: null, serie: null })).toEqual([]);
  });
});

describe('avaliarPasso / compararPassos', () => {
  it('considera cumpridos os esforços dentro da faixa', () => {
    const r = compararPassos({ passos, voltas: null, serie: serieSintetica(1320, fcCumprida), config });
    const [aq, e1, rec, e2] = r.map((x) => x.avaliacao);
    expect(aq.veredito).toBe('dentro');
    expect(e1.veredito).toBe('dentro');
    expect(Math.abs(e1.fcMedia - 165)).toBeLessThanOrEqual(2);
    expect(rec.veredito).toBe('dentro');
    expect(e2.veredito).toBe('dentro');
    expect(e1.distanciaM).toBe(1000);
  });

  it('ignora a carência inicial: a FC que ainda sobe não reprova o tiro', () => {
    // sobe de 130 a 165 nos primeiros 30 s do tiro e depois fica na faixa
    const fc = (s) => (s < 600 ? 140 : s < 630 ? 130 + ((s - 600) / 30) * 35 : s < 900 ? 165 : s < 1020 ? 120 : 165);
    const r = compararPassos({ passos, voltas: null, serie: serieSintetica(1320, fc), config });
    expect(r[1].avaliacao.veredito).toBe('dentro');
  });

  it('aponta esforço abaixo e acima da faixa', () => {
    const baixo = compararPassos({ passos, voltas: null, serie: serieSintetica(1320, (s) => (s < 600 ? 140 : s < 900 ? 150 : s < 1020 ? 120 : 175)), config });
    expect(baixo[1].avaliacao.veredito).toBe('abaixo');
    expect(baixo[3].avaliacao.veredito).toBe('acima');
  });

  it('não dá veredito para passo com alvo aberto', () => {
    const livre = [{ tipo: 'bloco', papel: 'principal', duracaoS: 300, zona: 'Z4', alvoAberto: true }];
    const r = compararPassos({ passos: livre, voltas: null, serie: serieSintetica(300, () => 150), config });
    expect(r[0].avaliacao.veredito).toBe('sem-alvo');
    expect(r[0].avaliacao.fcMedia).toBe(150);
  });

  it('marca como não feito o passo que a atividade nem chegou a cobrir', () => {
    const r = compararPassos({ passos, voltas: null, serie: serieSintetica(1000, fcCumprida), config });
    expect(r[3].avaliacao.veredito).toBe('nao-feito');
  });

  it('sem FC no trecho devolve sem-dados', () => {
    const serie0 = serieSintetica(1320, fcCumprida);
    delete serie0.fc;
    const al = alinharPassos({ passos, voltas: null, serie: serie0 });
    expect(avaliarPasso({ alinhado: al[1], serie: serie0, config }).veredito).toBe('sem-dados');
  });
});

describe('resumirAderencia', () => {
  it('conta só os esforços e calcula a deriva da FC', () => {
    const tres = [{ tipo: 'serie', repeticoes: 3, esforco: { duracaoS: 300, zona: 'Z4' }, recuperacao: { duracaoS: 60, zona: 'Z1' } }];
    // esforços em 0–300, 360–660, 720–1020
    const fc = (s) => (s < 300 ? 162 : s < 360 ? 120 : s < 660 ? 166 : s < 720 ? 120 : 175);
    const r = compararPassos({ passos: tres, voltas: null, serie: serieSintetica(1020, fc), config });
    const resumo = resumirAderencia(r.map((x) => x.avaliacao));
    expect(resumo.esforcos).toBe(3);
    expect(resumo.cumpridos).toBe(2);
    expect(resumo.acima).toBe(1);
    expect(resumo.tendenciaFc).toBeGreaterThanOrEqual(11);
    expect(resumo.tendenciaFc).toBeLessThanOrEqual(15);
  });
});

describe('tiros curtos (menos de 1 min): sem alvo de FC', () => {
  const tiros = [{ tipo: 'serie', repeticoes: 4, esforco: { duracaoS: 30, zona: 'Z5', descricao: 'esforço máximo' }, recuperacao: { duracaoS: 30, zona: 'Z1' } }]; // 4 × 30 s + 3 × 30 s = 210 s
  const VEL_DO_TIRO = [36, 34, 30, 28];
  // a FC só sobe depois do tiro (nos 20 s seguintes); a velocidade cai a cada tiro
  const serieDeTiros = () => {
    const t = [];
    const fc = [];
    const vel = [];
    const dist = [];
    for (let s = 0; s <= 210; s += 5) {
      const k = (s - 1 + 60) % 60;
      const emTiro = s > 0 && k < 30;
      t.push(s);
      fc.push(k >= 30 && k < 50 && s > 0 ? 165 : 130);
      vel.push(emTiro ? VEL_DO_TIRO[Math.floor((s - 1) / 60)] : 15);
      dist.push((s * 25) / 3600);
    }
    return { passoS: 5, t, fc, vel, dist };
  };

  it('não dá veredito de FC a esforços nem a recuperações de 30 s', () => {
    const r = compararPassos({ passos: tiros, voltas: null, serie: serieDeTiros(), config });
    expect(r).toHaveLength(7);
    expect(r.every((x) => x.avaliacao.veredito === 'sem-alvo')).toBe(true);
    expect(r.every((x) => x.avaliacao.faixa === null)).toBe(true);
  });

  it('acha o pico de FC na recuperação que vem logo depois do tiro', () => {
    const r = compararPassos({ passos: tiros, voltas: null, serie: serieDeTiros(), config });
    expect(r[0].avaliacao.fcPico).toBe(165);
    expect(r[6].avaliacao.fcPico).toBe(130); // último tiro: nada depois dele
  });

  it('resume a consistência: velocidade do começo ao fim da série', () => {
    const r = compararPassos({ passos: tiros, voltas: null, serie: serieDeTiros(), config });
    const resumo = resumirAderencia(r.map((x) => x.avaliacao));
    expect(resumo.esforcos).toBe(0);
    expect(resumo.tirosCurtos).toBe(4);
    expect(resumo.consistencia.n).toBe(4);
    expect(resumo.consistencia.velInicialKmh).toBeCloseTo(35, 0);
    expect(resumo.consistencia.velFinalKmh).toBeCloseTo(29, 0);
    expect(resumo.consistencia.variacaoPct).toBe(-17);
    expect(resumo.consistencia.fcPicoMedio).toBeGreaterThan(130);
  });

  it('sem consistência com um tiro só', () => {
    const um = [{ tipo: 'bloco', papel: 'principal', duracaoS: 30, zona: 'Z5', descricao: 'máximo' }];
    const r = compararPassos({ passos: um, voltas: null, serie: serieDeTiros(), config });
    const resumo = resumirAderencia(r.map((x) => x.avaliacao));
    expect(resumo.tirosCurtos).toBe(1);
    expect(resumo.consistencia).toBeNull();
  });

  it('num treino misto, os blocos longos mantêm o veredito e só os tiros ficam sem alvo', () => {
    const misto = [{ tipo: 'bloco', papel: 'principal', duracaoS: 120, zona: 'Z4' }, ...tiros];
    const fc = (s) => (s < 120 ? 165 : 130);
    const serie = { passoS: 5, t: [], fc: [], vel: [], dist: [] };
    for (let s = 0; s <= 330; s += 5) {
      serie.t.push(s);
      serie.fc.push(fc(s));
      serie.vel.push(25);
      serie.dist.push((s * 25) / 3600);
    }
    const r = compararPassos({ passos: misto, voltas: null, serie, config });
    expect(r[0].avaliacao.veredito).toBe('dentro');
    expect(r.slice(1).every((x) => x.avaliacao.veredito === 'sem-alvo')).toBe(true);
    expect(resumirAderencia(r.map((x) => x.avaliacao)).esforcos).toBe(1);
  });
});
