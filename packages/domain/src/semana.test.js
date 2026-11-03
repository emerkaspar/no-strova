import { describe, expect, it } from 'vitest';
import { comparativoSemanal, diaDaSemana, inicioDaSemana, montarSemana, proximoTreinoPlanejado, resumoDoPeriodo, sequenciaSemanal, totaisDaSemana } from './semana.js';

describe('diaDaSemana / inicioDaSemana', () => {
  it('conta a semana de segunda (0) a domingo (6)', () => {
    expect(diaDaSemana('2026-11-02')).toBe(0); // segunda
    expect(diaDaSemana('2026-11-03')).toBe(1); // terça
    expect(diaDaSemana('2026-11-08')).toBe(6); // domingo
  });

  it('o início da semana é sempre a segunda-feira, inclusive na virada de mês e de ano', () => {
    expect(inicioDaSemana('2026-11-03')).toBe('2026-11-02');
    expect(inicioDaSemana('2026-11-08')).toBe('2026-11-02');
    expect(inicioDaSemana('2026-11-02')).toBe('2026-11-02');
    expect(inicioDaSemana('2026-01-01')).toBe('2025-12-29');
    expect(inicioDaSemana('2026-03-01')).toBe('2026-02-23');
  });
});

describe('montarSemana', () => {
  const hoje = '2026-11-04'; // quarta

  it('devolve 7 dias de segunda a domingo e marca hoje e os dias futuros', () => {
    const semana = montarSemana(hoje);
    expect(semana.map((d) => d.data)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(semana.map((d) => d.rotulo)).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
    expect(semana.map((d) => d.dia)).toEqual(['02', '03', '04', '05', '06', '07', '08']);
    expect(semana.filter((d) => d.hoje).map((d) => d.rotulo)).toEqual(['QUA']);
    expect(semana.filter((d) => d.futuro).map((d) => d.rotulo)).toEqual(['QUI', 'SEX', 'SÁB', 'DOM']);
  });

  it('distribui o estresse realizado e o planejado nos dias certos, somando repetidos', () => {
    const semana = montarSemana(hoje, {
      realizado: [{ data: '2026-11-02', estresse: 50 }, { data: '2026-11-02', estresse: 20 }, { data: '2026-11-04', estresse: 80 }, { data: '2026-10-30', estresse: 99 }],
      planejado: [{ data: '2026-11-05', estresse: 60 }, { data: '2026-11-08', estresse: 40 }],
    });
    expect(semana.map((d) => d.realizado)).toEqual([70, 0, 80, 0, 0, 0, 0]);
    expect(semana.map((d) => d.planejado)).toEqual([0, 0, 0, 60, 0, 0, 40]);
  });

  it('ignora estresse inválido ou não positivo', () => {
    const semana = montarSemana(hoje, { realizado: [{ data: '2026-11-02', estresse: 0 }, { data: '2026-11-03', estresse: null }, { data: '2026-11-04', estresse: Number.NaN }] });
    expect(semana.every((d) => d.realizado === 0)).toBe(true);
  });

  it('soma os totais da semana', () => {
    const semana = montarSemana(hoje, { realizado: [{ data: '2026-11-02', estresse: 70 }], planejado: [{ data: '2026-11-06', estresse: 50 }] });
    expect(totaisDaSemana(semana)).toEqual({ realizado: 70, planejado: 50 });
  });

  it('numa segunda-feira, hoje é o primeiro dia e os outros seis são futuros', () => {
    const semana = montarSemana('2026-11-02');
    expect(semana[0].hoje).toBe(true);
    expect(semana.slice(1).every((d) => d.futuro)).toBe(true);
  });
});

describe('resumo e comparativo semanal', () => {
  const atividades = [
    { data: '2026-11-02', duracaoS: 3600, distanciaM: 30000 }, // segunda desta semana
    { data: '2026-11-03', duracaoS: 1800, distanciaM: 10000 },
    { data: '2026-10-26', duracaoS: 7200, distanciaM: 50000 }, // segunda da semana passada
    { data: '2026-10-29', duracaoS: 3600, distanciaM: 20000 }, // quinta: fora do trecho comparável
  ];
  const dias = [
    { data: '2026-11-02', estresse: 60 },
    { data: '2026-11-03', estresse: 40 },
    { data: '2026-10-26', estresse: 90 },
    { data: '2026-10-29', estresse: 50 },
  ];

  it('soma atividades, tempo, distância e carga do período', () => {
    expect(resumoDoPeriodo({ atividades, dias }, '2026-11-02', '2026-11-03')).toEqual({ atividades: 2, duracaoS: 5400, distanciaM: 40000, carga: 100 });
  });

  it('compara com o mesmo trecho da semana passada (segunda até terça)', () => {
    const c = comparativoSemanal('2026-11-03', { atividades, dias });
    expect(c.atual.atividades).toBe(2);
    expect(c.anterior).toEqual({ atividades: 1, duracaoS: 7200, distanciaM: 50000, carga: 90 });
  });

  it('sem dados, tudo zero', () => {
    expect(resumoDoPeriodo({}, '2026-11-02', '2026-11-08')).toEqual({ atividades: 0, duracaoS: 0, distanciaM: 0, carga: 0 });
  });
});

describe('sequenciaSemanal', () => {
  it('conta semanas seguidas com treino, incluindo a atual', () => {
    expect(sequenciaSemanal(['2026-11-03', '2026-10-28', '2026-10-20'], '2026-11-04')).toEqual({ atual: 3, recorde: 3, nestaSemana: true });
  });

  it('sem treino nesta semana, a sequência segue viva com as semanas anteriores', () => {
    expect(sequenciaSemanal(['2026-10-28', '2026-10-20'], '2026-11-04')).toEqual({ atual: 2, recorde: 2, nestaSemana: false });
  });

  it('uma semana inteira sem treino quebra a sequência; o recorde guarda a melhor', () => {
    const datas = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-10-27'];
    expect(sequenciaSemanal(datas, '2026-11-04')).toEqual({ atual: 1, recorde: 4, nestaSemana: false });
  });

  it('sem treinos: zero', () => {
    expect(sequenciaSemanal([], '2026-11-04')).toEqual({ atual: 0, recorde: 0, nestaSemana: false });
  });
});

describe('proximoTreinoPlanejado', () => {
  const t = (id, data, status = 'planejado') => ({ id, data, status });
  it('pega o planejado mais cedo de hoje em diante', () => {
    expect(proximoTreinoPlanejado([t('b', '2026-11-07'), t('a', '2026-11-05'), t('p', '2026-11-02')], '2026-11-04').id).toBe('a');
  });
  it('ignora pulados, realizados e passados; sem nenhum, null', () => {
    expect(proximoTreinoPlanejado([t('x', '2026-11-05', 'pulado'), t('y', '2026-11-06', 'realizado'), t('z', '2026-11-01')], '2026-11-04')).toBeNull();
  });
});
