import { describe, expect, it } from 'vitest';
import { RECURSOS, recursosDoUsuario, temRecurso, validarRecursos } from './usuarios.js';

describe('recursosDoUsuario', () => {
  it('sem o campo vale o padrão: IA ligada, Garmin e Strava desligados', () => {
    expect(recursosDoUsuario({})).toEqual({ ia: true, garmin: false, strava: false });
    expect(recursosDoUsuario(null)).toEqual({ ia: true, garmin: false, strava: false });
  });

  it('usa o valor gravado e completa o que faltar com o padrão', () => {
    expect(recursosDoUsuario({ recursos: { garmin: true } })).toEqual({ ia: true, garmin: true, strava: false });
    expect(recursosDoUsuario({ recursos: { strava: true } })).toEqual({ ia: true, garmin: false, strava: true });
    expect(recursosDoUsuario({ recursos: { ia: false, garmin: false, strava: false } })).toEqual({ ia: false, garmin: false, strava: false });
  });

  it('ignora valores que não são booleanos', () => {
    expect(recursosDoUsuario({ recursos: { ia: 'não', garmin: 1, strava: 'sim' } })).toEqual({ ia: true, garmin: false, strava: false });
  });
});

describe('temRecurso', () => {
  it('consulta um recurso do perfil', () => {
    expect(temRecurso({ recursos: { ia: false } }, RECURSOS.IA)).toBe(false);
    expect(temRecurso({}, RECURSOS.IA)).toBe(true);
    expect(temRecurso({}, RECURSOS.GARMIN)).toBe(false);
    expect(temRecurso({}, RECURSOS.STRAVA)).toBe(false);
    expect(temRecurso({ recursos: { strava: true } }, RECURSOS.STRAVA)).toBe(true);
  });
});

describe('validarRecursos', () => {
  const completo = { ia: false, garmin: true, strava: false };

  it('aceita o objeto completo', () => {
    expect(validarRecursos(completo)).toEqual({ valido: true, erro: null, valores: completo });
  });

  it('recusa chave desconhecida, faltando ou não booleana', () => {
    expect(validarRecursos({ ...completo, extra: true }).valido).toBe(false);
    expect(validarRecursos({ ia: true }).valido).toBe(false);
    expect(validarRecursos({ ia: true, garmin: true }).valido).toBe(false);
    expect(validarRecursos({ ...completo, ia: 'sim' }).valido).toBe(false);
    expect(validarRecursos(null).valido).toBe(false);
    expect(validarRecursos([]).valido).toBe(false);
  });
});
