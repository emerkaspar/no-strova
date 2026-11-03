import { describe, expect, it } from 'vitest';
import { CATALOGO_TREINOS, modelosDoCatalogo, modeloPorId } from './catalogoTreinos.js';
import {
  descreverPasso,
  duracaoTotalS,
  estimarEstresseEstruturado,
  expandirPassos,
  faixaDeFcDaZona,
  FOCOS,
  formatarSegundos,
  NIVEIS,
  resumirTreino,
  tempoPorZona,
  treinoPlanejadoDoModelo,
  validarPassos,
  validarTreinoEstruturado,
  zonaPredominante,
} from './treinosEstruturados.js';

const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };

const aq = { tipo: 'bloco', papel: 'aquecimento', duracaoS: 600, zona: 'Z2' };
const dq = { tipo: 'bloco', papel: 'desaquecimento', duracaoS: 600, zona: 'Z1' };
const serie = { tipo: 'serie', repeticoes: 5, esforco: { duracaoS: 180, zona: 'Z5' }, recuperacao: { duracaoS: 180, zona: 'Z1' } };
const treino = [aq, serie, dq];

describe('expandirPassos e totais', () => {
  it('a série vira esforço, recuperação, esforço…, sem recuperação depois do último esforço', () => {
    const blocos = expandirPassos([serie]);
    expect(blocos).toHaveLength(9); // 5 esforços e 4 recuperações
    expect(blocos.map((b) => b.papel)).toEqual(['principal', 'recuperacao', 'principal', 'recuperacao', 'principal', 'recuperacao', 'principal', 'recuperacao', 'principal']);
  });

  it('duração total, tempo por zona e zona predominante', () => {
    expect(duracaoTotalS(treino)).toBe(600 + (5 * 180 + 4 * 180) + 600);
    expect(tempoPorZona(treino)).toMatchObject({ Z1: 600 + 4 * 180, Z2: 600, Z5: 5 * 180 });
    expect(zonaPredominante(treino)).toBe('Z5');
  });

  it('a zona predominante olha o trabalho principal (o aquecimento longo não conta) e o empate vai para a mais alta', () => {
    const longo = [{ tipo: 'bloco', papel: 'aquecimento', duracaoS: 3600, zona: 'Z2' }, { tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z4' }];
    expect(zonaPredominante(longo)).toBe('Z4');
    const empate = [{ tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z3' }, { tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z4' }];
    expect(zonaPredominante(empate)).toBe('Z4');
  });

  it('resumirTreino junta duração (arredondada para cima em minutos), zona e número de esforços', () => {
    const r = resumirTreino(treino);
    expect(r.duracaoMin).toBe(Math.ceil(duracaoTotalS(treino) / 60));
    expect(r.zona).toBe('Z5');
    expect(r.esforcos).toBe(5);
  });
});

describe('estimarEstresseEstruturado', () => {
  it('soma o HRSS de cada bloco na zona dele: mais que tratar o treino todo na zona predominante dos blocos leves, e coerente com as zonas', () => {
    const z2 = estimarEstresseEstruturado({ passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: 3600, zona: 'Z2' }], config });
    const z5 = estimarEstresseEstruturado({ passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: 3600, zona: 'Z5' }], config });
    expect(z5).toBeGreaterThan(z2);
    const intervalado = estimarEstresseEstruturado({ passos: treino, config });
    expect(intervalado).toBeGreaterThan(0);
    // um intervalado de ~1h30 em Z5 vale menos que 1h30 inteira em Z5 e mais que 1h30 inteira em Z2
    const total = duracaoTotalS(treino);
    expect(intervalado).toBeLessThan(estimarEstresseEstruturado({ passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: total, zona: 'Z5' }], config }));
    expect(intervalado).toBeGreaterThan(estimarEstresseEstruturado({ passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: total, zona: 'Z2' }], config }));
  });

  it('sem configuração ou sem passos: null', () => {
    expect(estimarEstresseEstruturado({ passos: treino, config: null })).toBeNull();
    expect(estimarEstresseEstruturado({ passos: [], config })).toBeNull();
  });
});

describe('faixaDeFcDaZona', () => {
  it('faixas em fração do LTHR, com o topo limitado à FC máxima', () => {
    expect(faixaDeFcDaZona('Z4', config)).toEqual([161, 170]); // 94,5% a 100% de 170
    expect(faixaDeFcDaZona('Z2', config)).toEqual([136, 151]);
    expect(faixaDeFcDaZona('Z5', config)[1]).toBe(187); // 110% de 170, abaixo de 190
    expect(faixaDeFcDaZona('Z5', { ...config, fcMax: 180 })[1]).toBe(180);
    expect(faixaDeFcDaZona('Z9', config)).toBeNull();
    expect(faixaDeFcDaZona('Z2', null)).toBeNull();
  });
});

describe('formatação', () => {
  it('formatarSegundos e descreverPasso', () => {
    expect(formatarSegundos(30)).toBe('30 s');
    expect(formatarSegundos(180)).toBe('3 min');
    expect(formatarSegundos(150)).toBe('2 min 30 s');
    expect(formatarSegundos(3900)).toBe('1 h 05');
    expect(descreverPasso(serie)).toBe('5 × 3 min Z5 / 3 min Z1');
    expect(descreverPasso(aq)).toBe('10 min Z2');
  });
});

describe('validarPassos', () => {
  it('aceita um treino válido e normaliza', () => {
    const r = validarPassos(treino);
    expect(r.valido).toBe(true);
    expect(r.passos).toHaveLength(3);
  });

  it('recusa lista vazia, passo inválido, zona e duração ruins, repetições demais e treino sem esforço principal', () => {
    expect(validarPassos([]).valido).toBe(false);
    expect(validarPassos([{ tipo: 'x' }]).valido).toBe(false);
    expect(validarPassos([{ ...aq, zona: 'Z9' }, serie]).valido).toBe(false);
    expect(validarPassos([{ ...aq, duracaoS: 5 }, serie]).valido).toBe(false);
    expect(validarPassos([{ ...serie, repeticoes: 99 }]).valido).toBe(false);
    expect(validarPassos([aq, dq]).erros.join(' ')).toContain('esforço principal');
    expect(validarPassos([{ tipo: 'bloco', papel: 'principal', duracaoS: 120, zona: 'Z4' }]).erros.join(' ')).toContain('5 minutos');
  });

  it('recusa mais de 30 passos', () => {
    expect(validarPassos(Array.from({ length: 31 }, () => ({ tipo: 'bloco', papel: 'principal', duracaoS: 300, zona: 'Z2' }))).valido).toBe(false);
  });
});

describe('validarTreinoEstruturado', () => {
  const entrada = { nome: '  Meu intervalado  ', esporte: 'ciclismo', foco: 'vo2max', nivel: 'intermediario', descricao: 'Forte.', passos: treino };

  it('normaliza e aceita', () => {
    const r = validarTreinoEstruturado(entrada);
    expect(r.valido).toBe(true);
    expect(r.valores.nome).toBe('Meu intervalado');
  });

  it('valida nome, esporte, foco, nível e descrição', () => {
    for (const ruim of [{ nome: 'ab' }, { nome: 'x'.repeat(61) }, { esporte: 'natacao' }, { foco: 'x' }, { nivel: 'x' }, { descricao: 'x'.repeat(501) }, { passos: [] }]) {
      expect(validarTreinoEstruturado({ ...entrada, ...ruim }).valido).toBe(false);
    }
  });
});

describe('catálogo', () => {
  it('todo modelo é válido, tem id único e fica entre 30 min e 3 h', () => {
    const ids = new Set();
    for (const m of CATALOGO_TREINOS) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      const r = validarTreinoEstruturado(m);
      expect(r.erros, m.id).toEqual([]);
      const minutos = duracaoTotalS(m.passos) / 60;
      expect(minutos, m.id).toBeGreaterThanOrEqual(30);
      expect(minutos, m.id).toBeLessThanOrEqual(180);
    }
  });

  it('tem variedade: dezenas de treinos, todos os focos, os três níveis e os dois esportes', () => {
    expect(CATALOGO_TREINOS.length).toBeGreaterThanOrEqual(50);
    for (const esporte of ['ciclismo', 'corrida']) {
      const doEsporte = modelosDoCatalogo({ esporte });
      expect(new Set(doEsporte.map((m) => m.foco))).toEqual(new Set(Object.keys(FOCOS)));
      for (const nivel of Object.keys(NIVEIS)) expect(modelosDoCatalogo({ esporte, nivel }).length).toBeGreaterThanOrEqual(8);
      expect(new Set(doEsporte.map((m) => m.nome)).size).toBe(doEsporte.length); // nomes distintos no mesmo esporte
    }
    // nomes únicos em todo o catálogo (identificam o treino no relógio) e cabem nos 32 bytes do campo do FIT
    const nomes = CATALOGO_TREINOS.filter((m) => m.esporte === 'ciclismo' || m.id.startsWith('tiros')).map((m) => m.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const m of CATALOGO_TREINOS) expect(new TextEncoder().encode(m.nome).length).toBeLessThan(32);
  });

  it('filtros e busca por id', () => {
    expect(modelosDoCatalogo({ esporte: 'corrida', foco: 'sprint' }).every((m) => m.esporte === 'corrida' && m.foco === 'sprint')).toBe(true);
    expect(modeloPorId('vo2-5x3-ciclismo')).toMatchObject({ nome: 'Cinco Vezes, Por Quê?', especificacao: '5 × 3 min no VO2' });
    expect(modeloPorId('x')).toBeNull();
    expect(modeloPorId('meu', [{ id: 'meu', nome: 'Meu' }]).nome).toBe('Meu');
  });

  it('a série clássica de VO2 tem a estrutura esperada', () => {
    const m = modeloPorId('vo2-5x3-ciclismo');
    expect(resumirTreino(m.passos).esforcos).toBe(5);
    expect(zonaPredominante(m.passos)).toBe('Z5');
  });
});

describe('treinoPlanejadoDoModelo', () => {
  it('traz a duração e a zona dos passos, o nome e uma cópia dos passos', () => {
    const m = modeloPorId('lim-3x10-corrida');
    const t = treinoPlanejadoDoModelo(m, '2026-11-10');
    expect(t).toMatchObject({ esporte: 'corrida', data: '2026-11-10', zona: 'Z4', nomeTreino: m.nome, modeloId: m.id });
    expect(t.duracaoMin).toBe(resumirTreino(m.passos).duracaoMin);
    expect(t.passos).toEqual(m.passos);
  });
});

describe('treino planejado estruturado (planejamento.js)', () => {
  it('a duração e a zona vêm dos passos, e o treino guarda nome, modelo e passos', async () => {
    const { validarTreinoPlanejado } = await import('./planejamento.js');
    const m = modeloPorId('vo2-5x3-ciclismo');
    const r = validarTreinoPlanejado({ ...treinoPlanejadoDoModelo(m, '2026-11-10'), duracaoMin: 5, zona: 'Z1' }); // o formulário não manda
    expect(r.valido).toBe(true);
    expect(r.valores).toMatchObject({ duracaoMin: resumirTreino(m.passos).duracaoMin, zona: 'Z5', nomeTreino: m.nome, modeloId: m.id });
    expect(r.valores.passos).toEqual(m.passos);
  });

  it('passos inválidos recusam o treino; sem passos, o formulário comum continua valendo', async () => {
    const { validarTreinoPlanejado } = await import('./planejamento.js');
    expect(validarTreinoPlanejado({ esporte: 'ciclismo', data: '2026-11-10', passos: [{ tipo: 'x' }] }).valido).toBe(false);
    const comum = validarTreinoPlanejado({ esporte: 'ciclismo', data: '2026-11-10', duracaoMin: 60, zona: 'Z2' });
    expect(comum.valido).toBe(true);
    expect(comum.valores.passos).toBeUndefined();
  });

  it('o estresse do treino estruturado soma os blocos; o valor informado continua mandando', async () => {
    const { estresseDoTreino } = await import('./planejamento.js');
    const m = modeloPorId('vo2-5x3-ciclismo');
    const t = { ...treinoPlanejadoDoModelo(m, '2026-11-10'), status: 'planejado' };
    expect(estresseDoTreino(t, [config])).toBe(estimarEstresseEstruturado({ passos: m.passos, config }));
    expect(estresseDoTreino({ ...t, estresseManual: 77 }, [config])).toBe(77);
    // sem configuração, cai para o valor gravado
    expect(estresseDoTreino({ ...t, estresseEstimado: 55 }, [])).toBe(55);
  });
});
