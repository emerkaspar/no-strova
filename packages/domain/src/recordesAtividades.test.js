import { describe, expect, it } from 'vitest';
import { rankingDasAtividades } from './recordesAtividades.js';

const atv = (id, data, extra) => ({ id, data, ...extra });

describe('rankingDasAtividades', () => {
  it('ordena do maior para o menor e limita a lista', () => {
    const lista = [atv('a', '2026-01-01', { distanciaM: 10 }), atv('b', '2026-01-02', { distanciaM: 30 }), atv('c', '2026-01-03', { distanciaM: 20 })];
    const r = rankingDasAtividades(lista, 'distanciaM', { limite: 2 });
    expect(r.map((x) => [x.posicao, x.atividade.id, x.valor])).toEqual([[1, 'b', 30], [2, 'c', 20]]);
  });

  it('com menorVence, o menor valor fica em primeiro', () => {
    const lista = [atv('a', '2026-01-01', { melhor5kS: 1500 }), atv('b', '2026-01-02', { melhor5kS: 1400 })];
    expect(rankingDasAtividades(lista, 'melhor5kS', { menorVence: true }).map((x) => x.atividade.id)).toEqual(['b', 'a']);
  });

  it('no empate, a atividade mais antiga vem na frente', () => {
    const lista = [atv('novo', '2026-05-01', { hrss: 50 }), atv('velho', '2026-01-01', { hrss: 50 })];
    expect(rankingDasAtividades(lista, 'hrss').map((x) => x.atividade.id)).toEqual(['velho', 'novo']);
  });

  it('ignora valores ausentes, zero e negativos, menos com aceitaZero', () => {
    const lista = [atv('a', '2026-01-01', { temperaturaMediaC: 0 }), atv('b', '2026-01-02', { temperaturaMediaC: -3 }), atv('c', '2026-01-03', {})];
    expect(rankingDasAtividades(lista, 'temperaturaMediaC')).toEqual([]);
    expect(rankingDasAtividades(lista, 'temperaturaMediaC', { aceitaZero: true, menorVence: true }).map((x) => x.atividade.id)).toEqual(['b', 'a']);
  });

  it('não altera a lista de entrada', () => {
    const lista = [atv('a', '2026-01-01', { hrss: 1 }), atv('b', '2026-01-02', { hrss: 2 })];
    rankingDasAtividades(lista, 'hrss');
    expect(lista.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
