import { describe, expect, it } from 'vitest';
import {
  TIPOS_NOTIFICACAO,
  idNotificacao,
  lembretePeriodicoVencido,
  marcoAtingido,
  MARCOS_PROVA_DIAS,
  montarNotificacao,
  normalizarPreferenciasNotificacao,
  tipoLigado,
} from './notificacoes.js';

describe('normalizarPreferenciasNotificacao', () => {
  it('usa os padrões quando não há preferência', () => {
    const p = normalizarPreferenciasNotificacao(undefined);
    expect(p.intervaloPesoDias).toBe(14);
    expect(p.intervaloMedidasDias).toBe(60);
    expect(p.intervaloLthrSemanas).toBe(12);
    expect(Object.values(p.tipos).every(Boolean)).toBe(true);
  });

  it('respeita tipos desligados e descarta intervalos inválidos', () => {
    const p = normalizarPreferenciasNotificacao({ tipos: { pesar: false }, intervaloPesoDias: 0, intervaloMedidasDias: 30 });
    expect(p.tipos.pesar).toBe(false);
    expect(p.tipos.medidas).toBe(true);
    expect(p.intervaloPesoDias).toBe(14);
    expect(p.intervaloMedidasDias).toBe(30);
  });

  it('tipoLigado recusa tipo desconhecido', () => {
    expect(tipoLigado({}, 'pesar')).toBe(true);
    expect(tipoLigado({ tipos: { pesar: false } }, 'pesar')).toBe(false);
    expect(tipoLigado({}, 'inexistente')).toBe(false);
  });
});

describe('idNotificacao', () => {
  it('é determinístico e sanitiza a referência', () => {
    expect(idNotificacao('u1', 'pesar', '2026-10-01-c0')).toBe('u1_pesar_2026-10-01-c0');
    expect(idNotificacao('u1', 'pesar', 'a/b c')).toBe('u1_pesar_a-b-c');
    expect(idNotificacao('u1', 'pesar')).toBe('u1_pesar_unico');
  });
});

describe('lembretePeriodicoVencido', () => {
  it('não vence antes do intervalo', () => {
    expect(lembretePeriodicoVencido({ ultimaData: '2026-11-01', hoje: '2026-11-09', intervaloDias: 14 })).toBeNull();
  });

  it('vence no intervalo e muda de ciclo a cada novo intervalo', () => {
    expect(lembretePeriodicoVencido({ ultimaData: '2026-10-26', hoje: '2026-11-09', intervaloDias: 14 })).toEqual({
      diasDesde: 14,
      ciclo: 0,
      referencia: '2026-10-26-c0',
    });
    expect(lembretePeriodicoVencido({ ultimaData: '2026-10-12', hoje: '2026-11-09', intervaloDias: 14 })?.ciclo).toBe(1);
  });

  it('avisa uma vez quando nunca houve registro', () => {
    expect(lembretePeriodicoVencido({ ultimaData: null, hoje: '2026-11-09', intervaloDias: 14 })).toEqual({ diasDesde: null, ciclo: 0, referencia: 'nunca' });
  });
});

describe('marcoAtingido', () => {
  it('só devolve quando falta exatamente um marco', () => {
    expect(marcoAtingido('2026-11-16', '2026-11-09', MARCOS_PROVA_DIAS)).toBe(7);
    expect(marcoAtingido('2026-11-17', '2026-11-09', MARCOS_PROVA_DIAS)).toBeNull();
  });
});

describe('montarNotificacao', () => {
  it('cobre todos os tipos do catálogo com grupo coerente', () => {
    const ctx = { data: '2026-11-09', atividadeId: 'a1', quantidade: 2, nome: 'Maratona', dias: 7, provaId: 'p1', metaId: 'm1', dataAlvo: '2026-12-01', rotuloMeta: 'Meta de peso', conquistaId: 'c1', falhas: 2, expiraEm: '2026-11-16', referencia: 'r', rascunhoId: 'd1', novoUid: 'u2' };
    for (const [tipo, def] of Object.entries(TIPOS_NOTIFICACAO)) {
      const n = montarNotificacao(tipo, ctx);
      expect(n, tipo).not.toBeNull();
      expect(n.grupo).toBe(def.grupo);
      expect(n.rota.startsWith('#/')).toBe(true);
      expect(n.titulo.length).toBeGreaterThan(0);
    }
  });

  it('retorna null para tipo desconhecido', () => {
    expect(montarNotificacao('nada')).toBeNull();
  });

  it('treino do dia diferencia manhã e tarde na referência', () => {
    const m = montarNotificacao('treinoHoje', { data: '2026-11-09', quantidade: 1, periodo: 'manha' });
    const t = montarNotificacao('treinoHoje', { data: '2026-11-09', quantidade: 1, periodo: 'tarde' });
    expect(m.referencia).not.toBe(t.referencia);
  });
});
