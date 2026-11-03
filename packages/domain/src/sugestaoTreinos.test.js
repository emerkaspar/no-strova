import { describe, expect, it } from 'vitest';
import { modeloPorId } from './catalogoTreinos.js';
import { REGRAS_SUGESTAO, sugerirTreinos } from './sugestaoTreinos.js';
import { FOCOS } from './treinosEstruturados.js';

const HOJE = '2026-11-04'; // quarta

const base = { hoje: HOJE, esporte: 'ciclismo', nivel: 'intermediario' };
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

describe('sugerirTreinos', () => {
  it('sugere até 2 treinos intensos e 1 moderado, em dias livres a partir de amanhã, do nível e esporte pedidos', () => {
    const { sugestoes } = sugerirTreinos(base);
    expect(sugestoes.length).toBeGreaterThanOrEqual(2);
    expect(sugestoes.filter((s) => s.intensidade === 'alta').length).toBeLessThanOrEqual(2);
    expect(sugestoes.filter((s) => s.intensidade === 'moderada').length).toBeLessThanOrEqual(1);
    for (const s of sugestoes) {
      expect(s.data > HOJE).toBe(true);
      expect(s.modelo.esporte).toBe('ciclismo');
      expect(s.modelo.nivel).toBe('intermediario');
      expect(s.motivo).toContain('Foco em');
    }
    expect(new Set(sugestoes.map((s) => s.data)).size).toBe(sugestoes.length); // um por dia
  });

  it('deixa pelo menos 48 h entre treinos intensos', () => {
    const intensos = sugerirTreinos(base).sugestoes.filter((s) => s.intensidade === 'alta').map((s) => s.data);
    for (let i = 1; i < intensos.length; i++) expect(diasEntre(intensos[i - 1], intensos[i])).toBeGreaterThanOrEqual(REGRAS_SUGESTAO.espacoEntreIntensos);
  });

  it('não coloca um moderado colado em um intenso', () => {
    const { sugestoes } = sugerirTreinos(base);
    const intensos = sugestoes.filter((s) => s.intensidade === 'alta').map((s) => s.data);
    for (const m of sugestoes.filter((s) => s.intensidade === 'moderada')) {
      for (const i of intensos) expect(Math.abs(diasEntre(i, m.data))).toBeGreaterThanOrEqual(1);
    }
  });

  it('pula dias que já têm treino', () => {
    const treinos = ['2026-11-05', '2026-11-06', '2026-11-08'].map((data) => ({ data, status: 'planejado', zona: 'Z2' }));
    const { sugestoes } = sugerirTreinos({ ...base, treinos });
    for (const s of sugestoes) expect(['2026-11-05', '2026-11-06', '2026-11-08']).not.toContain(s.data);
  });

  it('conta os intensos que já estão no plano (por zona ou pelo foco do modelo) no limite de 2 por semana', () => {
    const treinos = [
      { data: '2026-11-06', status: 'planejado', zona: 'Z5' },
      { data: '2026-11-09', status: 'planejado', zona: 'Z4' },
    ];
    const { sugestoes, avisos } = sugerirTreinos({ ...base, treinos });
    expect(sugestoes.filter((s) => s.intensidade === 'alta')).toHaveLength(0);
    expect(avisos.join(' ')).toContain('já tem treinos intensos suficientes');
  });

  it('respeita as 48 h também em relação a um intenso já planejado', () => {
    const treinos = [{ data: '2026-11-07', status: 'planejado', zona: 'Z5' }];
    const intensos = sugerirTreinos({ ...base, treinos }).sugestoes.filter((s) => s.intensidade === 'alta').map((s) => s.data);
    for (const d of intensos) expect(Math.abs(diasEntre('2026-11-07', d))).toBeGreaterThanOrEqual(2);
  });

  it('um intenso de ontem ou anteontem afasta o primeiro intenso da sugestão', () => {
    const treinos = [{ data: '2026-11-04', status: 'realizado', zona: 'Z5' }]; // hoje
    const intensos = sugerirTreinos({ ...base, treinos }).sugestoes.filter((s) => s.intensidade === 'alta');
    expect(intensos[0]?.data > '2026-11-05').toBe(true); // amanhã seria 1 dia depois: não
  });

  it('com a Forma na sobrecarga, nenhum treino intenso e um aviso', () => {
    const { sugestoes, avisos } = sugerirTreinos({ ...base, forma: -35 });
    expect(sugestoes.filter((s) => s.intensidade === 'alta')).toHaveLength(0);
    expect(avisos.join(' ')).toContain('sobrecarga');
  });

  it('com a Forma baixa (−20 a −30), no máximo um treino intenso', () => {
    const { sugestoes, avisos } = sugerirTreinos({ ...base, forma: -25 });
    expect(sugestoes.filter((s) => s.intensidade === 'alta').length).toBeLessThanOrEqual(1);
    expect(avisos.join(' ')).toContain('Forma está baixa');
  });

  it('gira o foco: os focos treinados há pouco perdem para os que não são treinados há mais tempo', () => {
    const treinos = [
      { data: '2026-11-01', status: 'realizado', zona: 'Z5', modeloId: 'vo2-5x3-ciclismo' },
      { data: '2026-10-30', status: 'realizado', zona: 'Z4', modeloId: 'lim-3x10-ciclismo' },
    ];
    const intensos = sugerirTreinos({ ...base, treinos }).sugestoes.filter((s) => s.intensidade === 'alta');
    for (const s of intensos) expect(['vo2max', 'limiar']).not.toContain(s.modelo.foco);
  });

  it('não repete o mesmo modelo usado nas últimas 6 semanas', () => {
    const treinos = [{ data: '2026-10-20', status: 'realizado', zona: 'Z5', modeloId: 'vo2-5x3-ciclismo' }];
    for (const semente of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const ids = sugerirTreinos({ ...base, treinos, semente }).sugestoes.map((s) => s.modelo.id);
      expect(ids).not.toContain('vo2-5x3-ciclismo');
    }
  });

  it('as duas sugestões intensas têm focos diferentes', () => {
    for (const semente of ['a', 'b', 'c', 'd']) {
      const intensos = sugerirTreinos({ ...base, semente }).sugestoes.filter((s) => s.intensidade === 'alta');
      if (intensos.length === 2) expect(intensos[0].modelo.foco).not.toBe(intensos[1].modelo.foco);
    }
  });

  it('é estável para a mesma semente e varia com outra', () => {
    const ids = (semente) => sugerirTreinos({ ...base, semente }).sugestoes.map((s) => s.modelo.id).join(',');
    expect(ids('x')).toBe(ids('x'));
    const variacoes = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(ids));
    expect(variacoes.size).toBeGreaterThan(1);
  });

  it('"excluir" tira modelos recusados', () => {
    const primeira = sugerirTreinos(base).sugestoes.map((s) => s.modelo.id);
    const segunda = sugerirTreinos({ ...base, excluir: primeira }).sugestoes.map((s) => s.modelo.id);
    for (const id of primeira) expect(segunda).not.toContain(id);
  });

  it('inclui os treinos próprios do usuário, do mesmo esporte e nível', () => {
    const meu = { id: 'meu-1', nome: 'Meu', esporte: 'ciclismo', nivel: 'intermediario', foco: 'sprint', passos: modeloPorId('spr-8x30-ciclismo').passos };
    const achou = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].some((semente) => sugerirTreinos({ ...base, proprios: [meu], semente }).sugestoes.some((s) => s.modelo.id === 'meu-1'));
    expect(achou).toBe(true);
    expect(sugerirTreinos({ ...base, proprios: [meu], incluirProprios: false, semente: 'a' }).sugestoes.some((s) => s.modelo.id === 'meu-1')).toBe(false);
  });

  it('sem dias livres, não sugere e avisa', () => {
    const treinos = Array.from({ length: 7 }, (_, i) => ({ data: `2026-11-${String(5 + i).padStart(2, '0')}`, status: 'planejado', zona: 'Z2' }));
    const r = sugerirTreinos({ ...base, treinos });
    expect(r.sugestoes).toEqual([]);
    expect(r.avisos.join(' ')).toContain('Libere um dia');
  });

  it('treinos pulados não ocupam o dia nem contam como carga', () => {
    const treinos = [{ data: '2026-11-05', status: 'pulado', zona: 'Z5' }];
    const { sugestoes } = sugerirTreinos({ ...base, treinos });
    expect(sugestoes.filter((s) => s.intensidade === 'alta').length).toBeGreaterThan(0);
  });

  it('o rótulo do foco está no motivo, e a intensidade vem do foco', () => {
    for (const s of sugerirTreinos(base).sugestoes) {
      expect(s.motivo).toContain(FOCOS[s.modelo.foco].rotulo);
      expect(s.intensidade).toBe(FOCOS[s.modelo.foco].intensidade);
    }
  });
});
