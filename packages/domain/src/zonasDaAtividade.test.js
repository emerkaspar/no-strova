import { describe, expect, it } from 'vitest';
import { diasEntre } from './forma.js';
import { atividadePrecisaCompletar, distribuicaoPorZona, leituraDaDistribuicao, tempoNasZonasDaAtividade, VERSAO_DAS_ZONAS, zonasPendentes } from './zonasDaAtividade.js';

const HOJE = '2026-11-04'; // quarta-feira
const CONFIG = { lthr: 170, fcMax: 190 }; // Z1 102–136, Z2 136–151, Z3 151–161, Z4 161–170, Z5 170–187

/** Série com um bloco de 5 s por FC informada. */
const serie = (fcs) => ({ t: fcs.map((_, i) => i * 5), fc: fcs });

describe('tempoNasZonasDaAtividade', () => {
  it('soma o tempo de cada zona pela FC', () => {
    const fcs = [...Array(13).fill(120), ...Array(13).fill(140), ...Array(13).fill(155), ...Array(13).fill(165), ...Array(13).fill(180)];
    const z = tempoNasZonasDaAtividade(serie(fcs), CONFIG);
    // o primeiro ponto só abre o intervalo: 12 intervalos de 5 s na Z1 e 13 nas demais
    expect(z).toEqual([60, 65, 65, 65, 65]);
  });

  it('é nulo sem FC ou sem configuração', () => {
    expect(tempoNasZonasDaAtividade({ t: [0, 5, 10] }, CONFIG)).toBeNull();
    expect(tempoNasZonasDaAtividade(serie([140, 140, 140]), null)).toBeNull();
  });

  it('pausa longa não conta', () => {
    const s = { t: [0, 5, 10, 400, 405], fc: [140, 140, 140, 140, 140] };
    expect(tempoNasZonasDaAtividade(s, CONFIG)).toEqual([0, 15, 0, 0, 0]);
  });
});

describe('zonasPendentes / atividadePrecisaCompletar', () => {
  const versoes = { versaoDosEsforcos: 2, versaoDoDetalhe: 1 };
  const pronta = { origem: 'arquivo', melhoresEsforcosEm: 2, detalheEm: 1, zonasEm: VERSAO_DAS_ZONAS, zonasConfigId: 'c1', configIdUsada: 'c1', tempoZonasS: [1, 2, 3, 4, 5] };

  it('atividade completa não tem pendência', () => {
    expect(zonasPendentes(pronta)).toBe(false);
    expect(atividadePrecisaCompletar(pronta, versoes)).toBe(false);
  });

  it('nunca calculada, ou calculada com outra configuração, fica pendente', () => {
    expect(zonasPendentes({ ...pronta, zonasEm: undefined })).toBe(true);
    expect(zonasPendentes({ ...pronta, configIdUsada: 'c2' })).toBe(true);
    expect(atividadePrecisaCompletar({ ...pronta, melhoresEsforcosEm: 1 }, versoes)).toBe(true);
  });

  it('sem configuração dos dois lados não fica pendente para sempre', () => {
    expect(zonasPendentes({ ...pronta, zonasConfigId: null, configIdUsada: null, tempoZonasS: null })).toBe(false);
    expect(zonasPendentes({ ...pronta, zonasConfigId: undefined, configIdUsada: undefined })).toBe(false);
  });

  it('atividade manual nunca é pendente', () => {
    expect(atividadePrecisaCompletar({ origem: 'manual' }, versoes)).toBe(false);
  });
});

describe('distribuicaoPorZona', () => {
  const ativ = (data, z, extra = {}) => ({ id: data, data, esporte: 'corrida', origem: 'arquivo', zonasEm: VERSAO_DAS_ZONAS, tempoZonasS: z, ...extra });

  it('uma linha por semana, da mais antiga à atual, somando as zonas', () => {
    const r = distribuicaoPorZona(
      [ativ('2026-11-03', [600, 1200, 0, 0, 0]), ativ('2026-11-04', [0, 0, 300, 0, 0]), ativ('2026-10-27', [0, 0, 0, 120, 60])],
      { hoje: HOJE, semanas: 4 },
    );
    expect(r.semanas).toHaveLength(4);
    expect(r.semanas.at(-1)).toMatchObject({ inicio: '2026-11-02', segundos: [600, 1200, 300, 0, 0], total: 2100 });
    expect(r.semanas.at(-2)).toMatchObject({ inicio: '2026-10-26', segundos: [0, 0, 0, 120, 60] });
    expect(diasEntre(r.semanas[0].inicio, r.semanas.at(-1).inicio)).toBe(21);
    expect(r.segundos).toEqual([600, 1200, 300, 120, 60]);
    expect(r.atividadesComDados).toBe(3);
  });

  it('agrupa em três faixas: leve, moderado e intenso', () => {
    const r = distribuicaoPorZona([ativ('2026-11-03', [400, 400, 100, 50, 50])], { hoje: HOJE });
    expect(r.tres.leve).toBeCloseTo(0.8);
    expect(r.tres.moderado).toBeCloseTo(0.1);
    expect(r.tres.intenso).toBeCloseTo(0.1);
  });

  it('filtra por esporte e ignora o que está fora da janela', () => {
    const lista = [ativ('2026-11-03', [100, 0, 0, 0, 0]), ativ('2026-11-02', [0, 0, 0, 0, 500], { esporte: 'ciclismo' }), ativ('2026-01-05', [999, 0, 0, 0, 0])];
    expect(distribuicaoPorZona(lista, { hoje: HOJE, semanas: 4, esporte: 'corrida' }).segundos).toEqual([100, 0, 0, 0, 0]);
    expect(distribuicaoPorZona(lista, { hoje: HOJE, semanas: 4 }).segundos).toEqual([100, 0, 0, 0, 500]);
  });

  it('conta as atividades que ainda não têm o tempo por zona', () => {
    const r = distribuicaoPorZona([ativ('2026-11-03', [100, 0, 0, 0, 0]), { id: 'x', data: '2026-11-02', esporte: 'corrida', origem: 'arquivo' }, { id: 'm', data: '2026-11-01', esporte: 'corrida', origem: 'manual' }], { hoje: HOJE });
    expect(r.atividadesComDados).toBe(1);
    expect(r.atividadesSemDados).toBe(1); // a manual nunca tem
  });

  it('sem dados não há fração nem leitura', () => {
    const r = distribuicaoPorZona([], { hoje: HOJE });
    expect(r.totalS).toBe(0);
    expect(r.tres).toBeNull();
    expect(leituraDaDistribuicao(r.tres)).toBeNull();
  });
});

describe('leituraDaDistribuicao', () => {
  it('classifica as distribuições típicas', () => {
    expect(leituraDaDistribuicao({ leve: 0.8, moderado: 0.05, intenso: 0.15 }).id).toBe('polarizado');
    expect(leituraDaDistribuicao({ leve: 0.95, moderado: 0.03, intenso: 0.02 }).id).toBe('leve');
    expect(leituraDaDistribuicao({ leve: 0.5, moderado: 0.4, intenso: 0.1 }).id).toBe('moderado');
    expect(leituraDaDistribuicao({ leve: 0.6, moderado: 0.2, intenso: 0.2 }).id).toBe('misto');
  });
});
