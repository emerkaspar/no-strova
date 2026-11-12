import { describe, expect, it } from 'vitest';
import { diasEntre } from './forma.js';
import { sugerirTreinos } from './sugestaoTreinos.js';

const HOJE = '2026-11-04'; // quarta-feira
const base = { hoje: HOJE, esporte: 'ciclismo', nivel: 'iniciante' };
const focosDeIntensidade = (r, intensidade) => r.sugestoes.filter((s) => s.intensidade === intensidade);

describe('sugerirTreinos: dias leves', () => {
  const r = sugerirTreinos(base);

  it('traz treinos fortes, moderado e dias leves, nunca o teste de LTHR', () => {
    expect(focosDeIntensidade(r, 'alta').length).toBeGreaterThan(0);
    expect(focosDeIntensidade(r, 'baixa').length).toBeGreaterThan(0);
    expect(r.sugestoes.some((s) => s.modelo.foco === 'teste')).toBe(false);
    expect(new Set(r.sugestoes.map((s) => s.intensidade))).toEqual(new Set(['alta', 'moderada', 'baixa']));
  });

  it('no máximo 2 fortes, 1 moderado, 1 recuperação e 1 resistência, cada um num dia', () => {
    expect(focosDeIntensidade(r, 'alta').length).toBeLessThanOrEqual(2);
    expect(focosDeIntensidade(r, 'moderada').length).toBeLessThanOrEqual(1);
    expect(r.sugestoes.filter((s) => s.modelo.foco === 'recuperacao').length).toBeLessThanOrEqual(1);
    expect(r.sugestoes.filter((s) => s.modelo.foco === 'resistencia').length).toBeLessThanOrEqual(1);
    const datas = r.sugestoes.map((s) => s.data);
    expect(new Set(datas).size).toBe(datas.length);
  });

  it('as sugestões saem em ordem de data', () => {
    const datas = r.sugestoes.map((s) => s.data);
    expect(datas).toEqual([...datas].sort());
  });

  it('a recuperação vem no dia seguinte a um treino forte', () => {
    const fortes = focosDeIntensidade(r, 'alta').map((s) => s.data);
    for (const rec of r.sugestoes.filter((s) => s.modelo.foco === 'recuperacao')) {
      expect(fortes.some((d) => diasEntre(d, rec.data) === 1)).toBe(true);
    }
  });

  it('a resistência fica a pelo menos 2 dias de qualquer treino forte', () => {
    const fortes = focosDeIntensidade(r, 'alta').map((s) => s.data);
    for (const res of r.sugestoes.filter((s) => s.modelo.foco === 'resistencia')) {
      for (const d of fortes) expect(Math.abs(diasEntre(d, res.data))).toBeGreaterThanOrEqual(2);
    }
  });

  it('respeita o treino forte que já está no plano: recuperação logo depois dele', () => {
    const treinos = [{ data: '2026-11-06', status: 'planejado', zona: 'Z4' }];
    const com = sugerirTreinos({ ...base, treinos });
    const rec = com.sugestoes.find((s) => s.modelo.foco === 'recuperacao');
    expect(rec?.data).toBe('2026-11-07');
  });

  it('é estável: a mesma semente dá as mesmas sugestões', () => {
    const a = sugerirTreinos({ ...base, semente: 'x' }).sugestoes.map((s) => `${s.data}:${s.modelo.id}`);
    const b = sugerirTreinos({ ...base, semente: 'x' }).sugestoes.map((s) => `${s.data}:${s.modelo.id}`);
    expect(a).toEqual(b);
  });

  it('o iniciante recebe treinos leves do nível dele', () => {
    const ini = sugerirTreinos({ ...base, nivel: 'iniciante' });
    const leves = ini.sugestoes.filter((s) => s.intensidade === 'baixa');
    expect(leves.length).toBeGreaterThan(0);
    expect(leves.every((s) => s.modelo.nivel === 'iniciante')).toBe(true);
  });

  it('quem não é iniciante não recebe recuperação em zona 1', () => {
    for (const nivel of ['intermediario', 'avancado']) {
      expect(sugerirTreinos({ ...base, nivel }).sugestoes.some((s) => s.modelo.foco === 'recuperacao'), nivel).toBe(false);
    }
  });

  it('um treino leve recusado não volta', () => {
    const todosRec = sugerirTreinos(base).sugestoes.filter((s) => s.modelo.foco === 'recuperacao').map((s) => s.modelo.id);
    const sem = sugerirTreinos({ ...base, excluir: todosRec });
    expect(sem.sugestoes.some((s) => todosRec.includes(s.modelo.id))).toBe(false);
  });
});

describe('sugerirTreinos: sobrecarga', () => {
  const r = sugerirTreinos({ ...base, forma: -40 });

  it('sem treino forte nem resistência; só um giro de recuperação, no primeiro dia livre', () => {
    expect(focosDeIntensidade(r, 'alta')).toHaveLength(0);
    expect(r.sugestoes.some((s) => s.modelo.foco === 'resistencia')).toBe(false);
    const rec = r.sugestoes.filter((s) => s.modelo.foco === 'recuperacao');
    expect(rec).toHaveLength(1);
    expect(rec[0].data).toBe('2026-11-05');
    expect(r.avisos.some((a) => a.includes('sobrecarga'))).toBe(true);
  });
});
