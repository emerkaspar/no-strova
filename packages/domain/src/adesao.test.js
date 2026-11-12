import { describe, expect, it } from 'vitest';
import { diasDesde, estaParado, etapasAlcancadas, faixaDeUso, resumirAdesao, situacaoGarmin, situacaoIntervals } from './adesao.js';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 10, 12, 12);
const atras = (dias) => AGORA - dias * DIA;
const base = { aprovado: true, ativo: true };

describe('faixaDeUso', () => {
  it('usa o mais recente entre o último acesso e a última atividade', () => {
    expect(faixaDeUso({ ...base, ultimoAcesso: atras(40), atividades: { ultimaEm: atras(2) } }, AGORA)).toBe('semana');
  });

  it('separa semana, mês, parado e nunca', () => {
    expect(faixaDeUso({ ultimoAcesso: atras(7) }, AGORA)).toBe('semana');
    expect(faixaDeUso({ ultimoAcesso: atras(8) }, AGORA)).toBe('mes');
    expect(faixaDeUso({ ultimoAcesso: atras(31) }, AGORA)).toBe('parado');
    expect(faixaDeUso({}, AGORA)).toBe('nunca');
  });
});

describe('estaParado', () => {
  it('só vale para quem está aprovado e ativo', () => {
    expect(estaParado({ aprovado: false, ultimoAcesso: atras(90) }, AGORA)).toBe(false);
    expect(estaParado({ ...base, ativo: false, ultimoAcesso: atras(90) }, AGORA)).toBe(false);
  });

  it('considera parado após 14 dias ou sem nenhum uso', () => {
    expect(estaParado({ ...base, ultimoAcesso: atras(14) }, AGORA)).toBe(false);
    expect(estaParado({ ...base, ultimoAcesso: atras(15) }, AGORA)).toBe(true);
    expect(estaParado(base, AGORA)).toBe(true);
  });
});

describe('conexões', () => {
  it('intervals: ativa, chave inválida ou não', () => {
    expect(situacaoIntervals({ intervals: { status: 'ativa' } })).toBe('ativa');
    expect(situacaoIntervals({ intervals: { status: 'chaveInvalida' } })).toBe('chaveInvalida');
    expect(situacaoIntervals({})).toBe('nao');
  });

  it('garmin: conectado, expirado ou não', () => {
    expect(situacaoGarmin({ garmin: { conectado: true, expiraEm: AGORA + DIA } }, AGORA)).toBe('conectado');
    expect(situacaoGarmin({ garmin: { conectado: true, expiraEm: AGORA - DIA } }, AGORA)).toBe('expirado');
    expect(situacaoGarmin({ garmin: { conectado: false } }, AGORA)).toBe('nao');
  });
});

describe('etapasAlcancadas', () => {
  it('para na aprovação quando o usuário ainda não foi aprovado', () => {
    expect(etapasAlcancadas({ aprovado: false, onboarding: 'concluido' })).toEqual(['cadastrou']);
  });

  it('percorre o funil completo', () => {
    const l = { ...base, onboarding: 'concluido', intervals: { status: 'ativa' }, atividades: { total: 3 } };
    expect(etapasAlcancadas(l)).toEqual(['cadastrou', 'aprovado', 'onboarding', 'conectou', 'importou']);
  });
});

describe('diasDesde', () => {
  it('devolve null sem data', () => {
    expect(diasDesde(null, AGORA)).toBeNull();
    expect(diasDesde(atras(3), AGORA)).toBe(3);
  });
});

describe('resumirAdesao', () => {
  const linhas = [
    { ...base, ultimoAcesso: atras(1), onboarding: 'concluido', intervals: { status: 'ativa' }, atividades: { total: 5 }, push: true },
    { ...base, ultimoAcesso: atras(20), garmin: { conectado: true, expiraEm: AGORA + DIA }, atividades: { total: 1 }, ia: { chamadas: 2 } },
    { ...base },
    { aprovado: false, ativo: true },
    { aprovado: true, ativo: false },
  ];

  it('conta só aprovados e ativos na base das porcentagens', () => {
    const r = resumirAdesao(linhas, AGORA);
    expect(r).toMatchObject({ cadastrados: 5, pendentes: 1, bloqueados: 1, base: 3, ativos7: 1, ativos30: 2, parados: 2 });
    expect(r.comIntervals).toBe(1);
    expect(r.comGarmin).toBe(1);
    expect(r.comAtividades).toBe(2);
    expect(r.comPush).toBe(1);
    expect(r.comIa).toBe(1);
    expect(r.percentuais.ativos7).toBe(33);
  });

  it('monta o funil sobre todos os cadastrados', () => {
    const r = resumirAdesao(linhas, AGORA);
    expect(r.funil.map((e) => e.quantos)).toEqual([5, 4, 1, 2, 2]);
  });

  it('lida com lista vazia', () => {
    const r = resumirAdesao([], AGORA);
    expect(r.base).toBe(0);
    expect(r.percentuais.intervals).toBe(0);
  });
});
