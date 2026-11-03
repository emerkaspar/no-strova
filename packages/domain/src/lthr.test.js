import { describe, expect, it } from 'vitest';
import { analisarTesteLthr, configAposTeste, TESTE_LTHR } from './lthr.js';

const config = { fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };

/** Série a cada 5 s: `fases` é uma lista de [duraçãoS, fc]. */
function serie(fases, passo = 5) {
  const t = [];
  const fc = [];
  let tempo = 0;
  for (const [duracao, valor] of fases) {
    for (let i = 0; i < duracao / passo; i++) {
      t.push(tempo);
      fc.push(typeof valor === 'function' ? valor(i) : valor);
      tempo += passo;
    }
  }
  return { t, fc };
}

describe('analisarTesteLthr', () => {
  it('acha a janela de 30 min mais forte e devolve a FC média dos últimos 20 min', () => {
    // 15 min de aquecimento a 130, 10 min a 160 (início do esforço), 20 min a 172 (últimos 20), 10 min de volta a 120
    const r = analisarTesteLthr(serie([[900, 130], [600, 160], [1200, 172], [600, 120]]), config);
    expect(r.lthr).toBe(172);
    expect(Math.abs(r.inicioS - 900)).toBeLessThanOrEqual(10); // a janela começa no esforço (± uma amostra)
    expect(r.fimS - r.inicioS).toBeGreaterThanOrEqual(TESTE_LTHR.janelaS - 10);
    expect(Math.abs(r.mediaJanela - (160 * 600 + 172 * 1200) / 1800)).toBeLessThan(1);
  });

  it('informa a FC máxima observada', () => {
    const r = analisarTesteLthr(serie([[600, 130], [1800, 168], [60, 186]]), config);
    expect(r.fcMaxObservada).toBe(186);
  });

  it('atividade com menos de 30 minutos: null', () => {
    expect(analisarTesteLthr(serie([[1500, 150]]), config)).toBeNull();
    expect(analisarTesteLthr({ t: [], fc: [] }, config)).toBeNull();
    expect(analisarTesteLthr(null)).toBeNull();
  });

  it('janela com buraco grande (pausa) não conta como 30 minutos contínuos', () => {
    const base = serie([[900, 160]]);
    const depois = serie([[900, 160]]).t.map((x) => x + 3000); // 40 min de pausa
    const r = analisarTesteLthr({ t: [...base.t, ...depois], fc: [...base.fc, ...serie([[900, 160]]).fc] }, config);
    expect(r).toBeNull();
  });

  it('esforço fraco gera aviso; diferença grande para o LTHR atual também', () => {
    const fraco = analisarTesteLthr(serie([[1800, 140]]), config);
    expect(fraco.lthr).toBe(140);
    expect(fraco.avisos.some((a) => a.includes('não ter sido o máximo'))).toBe(true);
    expect(fraco.avisos.some((a) => a.includes('difere 30 bpm'))).toBe(true);
  });

  it('resultado coerente não gera avisos', () => {
    expect(analisarTesteLthr(serie([[1800, 168]]), config).avisos).toEqual([]);
  });
});

describe('configAposTeste', () => {
  const dados = { base: { ...config, vigenteDesde: '2026-01-01' }, lthr: 174, fcMaxObservada: 193, data: '2026-11-03' };

  it('nova vigência na data do teste, com o LTHR novo e o resto da configuração-base', () => {
    const r = configAposTeste({ ...dados, atualizarFcMax: false });
    expect(r.valido).toBe(true);
    expect(r.valores).toMatchObject({ vigenteDesde: '2026-11-03', lthr: 174, fcMax: 190, fcRepouso: 50, sexo: 'masculino' });
  });

  it('atualiza a FC máxima só se pedido e se a observada for maior', () => {
    expect(configAposTeste({ ...dados, atualizarFcMax: true }).valores.fcMax).toBe(193);
    expect(configAposTeste({ ...dados, atualizarFcMax: true, fcMaxObservada: 180 }).valores.fcMax).toBe(190);
  });

  it('LTHR acima da FC máxima é recusado pela validação da configuração', () => {
    expect(configAposTeste({ ...dados, lthr: 195, atualizarFcMax: false }).valido).toBe(false);
  });
});
