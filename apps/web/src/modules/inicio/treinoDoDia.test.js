import { FRASES_DO_TREINO } from '@no-strova/domain';
import { describe, expect, it } from 'vitest';
import { criarTreinoDoDia } from './treinoDoDia.js';

const HOJE = '2026-11-04';
const base = (extra) => ({ atividades: [], treinos: [], dias: [], configs: [], calibracao: null, ...extra });
const planejado = (extra) => ({ id: 'p', data: '2026-11-06', esporte: 'ciclismo', duracaoMin: 60, zona: 'Z2', status: 'planejado', estresseManual: 40, ...extra });

describe('treinoDoDia com frase de humor', () => {
  it('descanso segue sem linhas (a frase do descanso vem do gráfico)', () => {
    expect(criarTreinoDoDia(base(), HOJE)('2026-11-06')).toBeNull();
  });

  it('treino planejado traz uma frase "antes" do nível de esforço', () => {
    const linhas = criarTreinoDoDia(base({ treinos: [planejado({ estresseManual: 150 })] }), HOJE)('2026-11-06');
    expect(linhas).toHaveLength(1);
    expect(FRASES_DO_TREINO.brutal.antes).toContain(linhas[0].piada);
  });

  it('treino muito fácil já feito traz uma frase "depois" de esforço mínimo', () => {
    const dados = base({ atividades: [{ id: 'a', data: '2026-11-03', esporte: 'ciclismo', distanciaM: 5000, hrss: 8 }] });
    const linhas = criarTreinoDoDia(dados, HOJE)('2026-11-03');
    expect(FRASES_DO_TREINO['muito-facil'].depois).toContain(linhas[0].piada);
  });

  it('com várias linhas, só a última leva a frase', () => {
    const dados = base({ atividades: [{ id: 'a', data: HOJE, esporte: 'corrida', hrss: 30 }], treinos: [planejado({ data: HOJE, estresseManual: 100 })] });
    const linhas = criarTreinoDoDia(dados, HOJE)(HOJE);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].piada).toBeUndefined();
    expect(FRASES_DO_TREINO.forte.antes).toContain(linhas[1].piada);
  });
});
