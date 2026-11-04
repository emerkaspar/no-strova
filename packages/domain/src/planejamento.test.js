import { describe, expect, it } from 'vitest';
import { treinosFuturos } from './planejamento.js';

const HOJE = '2026-11-04';
const t = (id, data, status = 'planejado') => ({ id, data, status });

describe('treinosFuturos', () => {
  it('só os planejados de amanhã em diante', () => {
    const lista = [
      t('ontem', '2026-11-03'),
      t('hoje', HOJE),
      t('amanha', '2026-11-05'),
      t('longe', '2027-03-01'),
      t('feito', '2026-11-10', 'realizado'),
      t('pulado', '2026-11-11', 'pulado'),
    ];
    expect(treinosFuturos(lista, HOJE).map((x) => x.id)).toEqual(['amanha', 'longe']);
  });

  it('lista vazia ou ausente', () => {
    expect(treinosFuturos([], HOJE)).toEqual([]);
    expect(treinosFuturos(undefined, HOJE)).toEqual([]);
  });
});
