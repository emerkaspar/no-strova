import { describe, expect, it } from 'vitest';
import { FORMATO_PLANO, montarPlanoParaExportar } from './exportarPlano.js';

const config = { vigenteDesde: '2026-01-01', lthr: 170, fcMax: 190 };
const AGORA = Date.UTC(2026, 10, 5);

const serie = { tipo: 'serie', repeticoes: 2, esforco: { duracaoS: 300, zona: 'Z4' }, recuperacao: { duracaoS: 120, zona: 'Z1' } };
const aquecimento = { tipo: 'bloco', papel: 'aquecimento', duracaoS: 600, zona: 'Z2', descricao: 'Aquecimento progressivo' };

const estruturado = { id: 'a', data: '2026-11-06', status: 'planejado', esporte: 'ciclismo', nomeTreino: 'Pedrada', passos: [aquecimento, serie], duracaoMin: 27, zona: 'Z4' };
const livre = { id: 'b', data: '2026-11-07', status: 'planejado', esporte: 'corrida', duracaoMin: 45, zona: 'Z2' };

const exportar = (treinos, extra = {}) => montarPlanoParaExportar(treinos, { configs: [config], de: '2026-11-02', ate: '2026-11-08', agora: AGORA, ...extra });

describe('montarPlanoParaExportar', () => {
  it('expande as séries e traz a faixa de FC de cada passo', () => {
    const { plano } = exportar([estruturado]);
    expect(plano.formato).toBe(FORMATO_PLANO);
    expect(plano.treinos).toHaveLength(1);
    const passos = plano.treinos[0].passos;
    expect(passos.map((p) => p.papel)).toEqual(['aquecimento', 'principal', 'recuperacao', 'principal']);
    expect(passos[1].duracaoS).toBe(300);
    expect(passos[1].fc).toEqual(expect.any(Array));
    expect(passos[1].fc[0]).toBeLessThanOrEqual(passos[1].fc[1]);
  });

  it('o treino livre vira um passo único com o nome pelo esporte, zona e duração', () => {
    const { plano } = exportar([livre]);
    expect(plano.treinos[0].nome).toBe('Corrida Z2 45min');
    expect(plano.treinos[0].passos).toHaveLength(1);
    expect(plano.treinos[0].passos[0]).toMatchObject({ papel: 'principal', duracaoS: 2700, zona: 'Z2' });
  });

  it('só leva os planejados do período, em ordem de data', () => {
    const { plano } = exportar([
      livre,
      estruturado,
      { ...livre, id: 'c', status: 'pulado' },
      { ...livre, id: 'd', status: 'realizado' },
      { ...livre, id: 'e', data: '2026-11-09' },
      { ...livre, id: 'f', data: '2026-11-01' },
    ]);
    expect(plano.treinos.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('inclui os dois extremos do período', () => {
    const { plano } = exportar([{ ...livre, id: 'x', data: '2026-11-02' }, { ...livre, id: 'y', data: '2026-11-08' }]);
    expect(plano.treinos.map((t) => t.id)).toEqual(['x', 'y']);
  });

  it('sem configuração de FC, os passos saem sem faixa', () => {
    const { plano } = exportar([estruturado], { configs: [] });
    expect(plano.treinos[0].passos.every((p) => p.fc === null)).toBe(true);
  });

  it('usa a configuração vigente na data do treino', () => {
    const nova = { vigenteDesde: '2026-11-07', lthr: 180, fcMax: 195 };
    const { plano } = exportar([{ ...livre, id: 'v1', data: '2026-11-06' }, { ...livre, id: 'v2', data: '2026-11-07' }], { configs: [config, nova] });
    expect(plano.treinos[1].passos[0].fc[0]).toBeGreaterThan(plano.treinos[0].passos[0].fc[0]);
  });

  it('o passo de alvo aberto não leva faixa de FC', () => {
    const t = { ...estruturado, passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z4', alvoAberto: true }] };
    expect(exportar([t]).plano.treinos[0].passos[0].fc).toBeNull();
  });

  it('treino sem passos nem duração é ignorado e listado', () => {
    const vazio = { id: 'z', data: '2026-11-06', status: 'planejado', esporte: 'ciclismo', zona: 'Z2', duracaoMin: 0 };
    const { plano, ignorados } = exportar([vazio, livre]);
    expect(plano.treinos.map((t) => t.id)).toEqual(['b']);
    expect(ignorados).toEqual([expect.objectContaining({ id: 'z', data: '2026-11-06' })]);
  });
});
