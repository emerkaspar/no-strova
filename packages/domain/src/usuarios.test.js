import { describe, expect, it } from 'vitest';
import { RECURSOS, recursosDoUsuario, temRecurso, validarRecursos } from './usuarios.js';

describe('recursosDoUsuario', () => {
  it('sem o campo vale o padrão: IA ligada e Garmin desligado', () => {
    expect(recursosDoUsuario({})).toEqual({ ia: true, garmin: false });
    expect(recursosDoUsuario(null)).toEqual({ ia: true, garmin: false });
  });

  it('usa o valor gravado e completa o que faltar com o padrão', () => {
    expect(recursosDoUsuario({ recursos: { garmin: true } })).toEqual({ ia: true, garmin: true });
    expect(recursosDoUsuario({ recursos: { ia: false, garmin: false } })).toEqual({ ia: false, garmin: false });
  });

  it('ignora valores que não são booleanos', () => {
    expect(recursosDoUsuario({ recursos: { ia: 'não', garmin: 1 } })).toEqual({ ia: true, garmin: false });
  });
});

describe('temRecurso', () => {
  it('consulta um recurso do perfil', () => {
    expect(temRecurso({ recursos: { ia: false } }, RECURSOS.IA)).toBe(false);
    expect(temRecurso({}, RECURSOS.IA)).toBe(true);
    expect(temRecurso({}, RECURSOS.GARMIN)).toBe(false);
  });
});

describe('validarRecursos', () => {
  it('aceita o objeto completo', () => {
    expect(validarRecursos({ ia: false, garmin: true })).toEqual({ valido: true, erro: null, valores: { ia: false, garmin: true } });
  });

  it('recusa chave desconhecida, faltando ou não booleana', () => {
    expect(validarRecursos({ ia: true, garmin: true, extra: true }).valido).toBe(false);
    expect(validarRecursos({ ia: true }).valido).toBe(false);
    expect(validarRecursos({ ia: 'sim', garmin: false }).valido).toBe(false);
    expect(validarRecursos(null).valido).toBe(false);
    expect(validarRecursos([]).valido).toBe(false);
  });
});
