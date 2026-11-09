import { describe, expect, it } from 'vitest';
import { decisoesPadrao, ESTRATEGIAS_TRAJETO, montarTreinoDoTerreno, normalizarDecisoes, perfilDoTrajeto, segmentarTerreno } from './treinoPorTrajeto.js';
import { duracaoTotalS, expandirPassos } from './treinosEstruturados.js';

/** Série detalhada sintética: pontos a cada 5 s a 3 m/s; `trechos` = [[metros, inclinação em %]]. */
function serieSintetica(trechos, { altInicial = 100, velocidade = 3 } = {}) {
  const t = [];
  const dist = [];
  const alt = [];
  let d = 0;
  let a = altInicial;
  let s = 0;
  for (const [metros, pct] of trechos) {
    const fim = d + metros;
    while (d < fim) {
      t.push(s);
      dist.push(d / 1000);
      alt.push(a);
      const passo = Math.min(velocidade * 5, fim - d);
      d += passo;
      a += (passo * pct) / 100;
      s += 5;
    }
  }
  t.push(s);
  dist.push(d / 1000);
  alt.push(a);
  return { t, dist, alt };
}

const TRAJETO = [[1000, 0], [1000, 6], [1000, 0], [1000, -6]];

describe('perfilDoTrajeto', () => {
  it('recorta o trecho e conta a distância e o tempo do início', () => {
    const serie = serieSintetica([[3000, 0]]);
    const perfil = perfilDoTrajeto(serie, 1000, 2000);
    expect(perfil.dM[0]).toBe(0);
    expect(perfil.dM.at(-1)).toBeLessThanOrEqual(1000);
    expect(perfil.dM.at(-1)).toBeGreaterThan(950);
    expect(perfil.tS[0]).toBe(0);
  });

  it('devolve null sem altitude, sem trecho ou com poucos pontos', () => {
    const serie = serieSintetica([[3000, 0]]);
    expect(perfilDoTrajeto({ ...serie, alt: undefined }, 0, 3000)).toBeNull();
    expect(perfilDoTrajeto(serie, 2000, 1000)).toBeNull();
    expect(perfilDoTrajeto(serie, 0, 20)).toBeNull();
  });
});

describe('segmentarTerreno', () => {
  const { segmentos, resumo, perfil } = segmentarTerreno(perfilDoTrajeto(serieSintetica(TRAJETO), 0, 4000));

  it('acha plano, subida, plano e descida na ordem', () => {
    expect(segmentos.map((s) => s.tipo)).toEqual(['plano', 'subida', 'plano', 'descida']);
  });

  it('os segmentos cobrem o trajeto inteiro sem buracos', () => {
    expect(segmentos[0].iniM).toBe(0);
    for (let i = 1; i < segmentos.length; i++) expect(segmentos[i].iniM).toBe(segmentos[i - 1].fimM);
    expect(segmentos.at(-1).fimM).toBeGreaterThan(3950);
    expect(segmentos.reduce((t, s) => t + s.duracaoS, 0)).toBe(resumo.duracaoS);
  });

  it('mede o ganho e o gradiente da subida e da descida', () => {
    const subida = segmentos.find((s) => s.tipo === 'subida');
    const descida = segmentos.find((s) => s.tipo === 'descida');
    expect(subida.ganhoM).toBeGreaterThan(45);
    expect(subida.gradienteMedio).toBeGreaterThan(4.5);
    expect(descida.ganhoM).toBeLessThan(-45);
    expect(resumo.relevante).toBe(true);
    expect(resumo.ganhoTotalM).toBeGreaterThan(45);
    expect(resumo.perdaTotalM).toBeGreaterThan(45);
    expect(perfil.dM.length).toBe(perfil.alt.length);
  });

  it('trajeto plano não é relevante', () => {
    const plano = segmentarTerreno(perfilDoTrajeto(serieSintetica([[3000, 0]]), 0, 3000));
    expect(plano.resumo.relevante).toBe(false);
    expect(plano.segmentos.map((s) => s.tipo)).toEqual(['plano']);
  });

  it('funde um morrinho curto no plano em volta', () => {
    const serie = serieSintetica([[1500, 0], [100, 8], [1500, 0]]);
    const { segmentos: s } = segmentarTerreno(perfilDoTrajeto(serie, 0, 3100));
    expect(s.every((x) => x.distanciaM >= 200 || s.length === 1)).toBe(true);
    expect(s.some((x) => x.tipo === 'subida')).toBe(false);
  });
});

describe('decisoesPadrao', () => {
  const { segmentos } = segmentarTerreno(perfilDoTrajeto(serieSintetica(TRAJETO), 0, 4000));
  const porTipo = (decisoes, tipo) => decisoes[segmentos.findIndex((s) => s.tipo === tipo)];

  it('esforço nas subidas: forte na subida, recuperação no plano e na descida', () => {
    const d = decisoesPadrao(segmentos, 'subidas', 'limiar');
    expect(porTipo(d, 'subida')).toMatchObject({ papel: 'principal', zona: 'Z4' });
    expect(porTipo(d, 'descida')).toMatchObject({ papel: 'recuperacao', zona: 'Z1' });
    expect(d.filter((x) => x.papel === 'principal')).toHaveLength(1);
  });

  it('esforço nas descidas e planos: subida mais leve', () => {
    const d = decisoesPadrao(segmentos, 'descidas_planos', 'limiar');
    expect(porTipo(d, 'subida').papel).toBe('recuperacao');
    expect(porTipo(d, 'descida')).toMatchObject({ papel: 'principal', zona: 'Z4' });
  });

  it('equilibrada: plano em ritmo firme, descida em recuperação', () => {
    const d = decisoesPadrao(segmentos, 'equilibrada', 'vo2max');
    expect(porTipo(d, 'subida')).toMatchObject({ papel: 'principal', zona: 'Z5' });
    expect(porTipo(d, 'plano')).toMatchObject({ papel: 'principal', zona: 'Z4' });
    expect(porTipo(d, 'descida').papel).toBe('recuperacao');
  });

  it('sem subida, a estratégia de subidas ainda deixa um trecho de esforço', () => {
    const soDescida = segmentarTerreno(perfilDoTrajeto(serieSintetica([[1500, 0], [1500, -6]]), 0, 3000)).segmentos;
    const d = decisoesPadrao(soDescida, 'subidas', 'limiar');
    expect(d.some((x) => x.papel === 'principal')).toBe(true);
  });

  it('as estratégias existentes têm rótulo', () => {
    for (const e of Object.values(ESTRATEGIAS_TRAJETO)) expect(e.rotulo).toBeTruthy();
  });
});

describe('normalizarDecisoes', () => {
  const { segmentos } = segmentarTerreno(perfilDoTrajeto(serieSintetica(TRAJETO), 0, 4000));

  it('usa a decisão válida, a padrão onde faltar ou vier inválida', () => {
    const recebidas = [{ segmentoId: segmentos[1].id, zona: 'Z4', papel: 'principal', motivo: 'ok' }, { segmentoId: segmentos[2].id, zona: 'Z9', papel: 'principal' }];
    const d = normalizarDecisoes(segmentos, recebidas, { estrategia: 'subidas', foco: 'limiar' });
    expect(d).toHaveLength(segmentos.length);
    expect(d[1]).toMatchObject({ zona: 'Z4', papel: 'principal', motivo: 'ok' });
    expect(d[2].papel).toBe('recuperacao');
  });

  it('respeita o teto de zona do foco e a coerência entre zona e papel', () => {
    const recebidas = segmentos.map((s, i) => ({ segmentoId: s.id, zona: 'Z5', papel: i === 1 ? 'principal' : 'recuperacao' }));
    const d = normalizarDecisoes(segmentos, recebidas, { estrategia: 'subidas', foco: 'tempo' });
    expect(d[1].zona).toBe('Z4');
    expect(d[0].zona).toBe('Z2');
  });
});

describe('montarTreinoDoTerreno', () => {
  const { segmentos } = segmentarTerreno(perfilDoTrajeto(serieSintetica(TRAJETO), 0, 4000));
  const contexto = { esporte: 'corrida', foco: 'limiar', nivel: 'intermediario', estrategia: 'subidas', trajetoNome: 'Volta do parque' };

  it('gera um treino válido cuja duração é a do trajeto', () => {
    const r = montarTreinoDoTerreno(segmentos, null, contexto);
    expect(r.valido, r.erros.join(' ')).toBe(true);
    expect(r.treino.nome).toContain('Volta do parque');
    expect(r.treino.passos.every((p) => p.tipo === 'bloco')).toBe(true);
    expect(duracaoTotalS(r.treino.passos)).toBe(segmentos.reduce((t, s) => t + s.duracaoS, 0));
    expect(expandirPassos(r.treino.passos).some((b) => b.papel === 'principal')).toBe(true);
    expect(r.segmentos.every((s) => s.zona && s.papel && s.motivo)).toBe(true);
  });

  it('funde vizinhos de mesma zona e papel', () => {
    const r = montarTreinoDoTerreno(segmentos, null, contexto);
    // plano, subida, plano, descida: plano e descida são recuperação, mas em zonas diferentes
    expect(r.treino.passos).toHaveLength(4);
    const todosIguais = segmentos.map((s) => ({ segmentoId: s.id, zona: 'Z2', papel: 'recuperacao' }));
    const fundido = montarTreinoDoTerreno(segmentos, [...todosIguais.slice(0, 1), { segmentoId: segmentos[1].id, zona: 'Z4', papel: 'principal' }, ...todosIguais.slice(2)], contexto);
    expect(fundido.treino.passos.length).toBeLessThanOrEqual(4);
  });

  it('respeita o limite de 30 passos num trajeto muito ondulado', () => {
    const ondas = Array.from({ length: 25 }, () => [[400, 6], [400, -6]]).flat();
    const { segmentos: muitos } = segmentarTerreno(perfilDoTrajeto(serieSintetica(ondas), 0, 20000));
    expect(muitos.length).toBeGreaterThan(30);
    const r = montarTreinoDoTerreno(muitos, null, contexto);
    expect(r.valido, r.erros.join(' ')).toBe(true);
    expect(r.treino.passos.length).toBeLessThanOrEqual(30);
    expect(duracaoTotalS(r.treino.passos)).toBe(muitos.reduce((t, s) => t + s.duracaoS, 0));
  });

  it('recusa foco, nível, esporte ou estratégia inválidos', () => {
    expect(montarTreinoDoTerreno(segmentos, null, { ...contexto, foco: 'teste' }).valido).toBe(false);
    expect(montarTreinoDoTerreno(segmentos, null, { ...contexto, nivel: 'x' }).valido).toBe(false);
    expect(montarTreinoDoTerreno(segmentos, null, { ...contexto, esporte: 'natacao' }).valido).toBe(false);
    expect(montarTreinoDoTerreno(segmentos, null, { ...contexto, estrategia: 'x' }).valido).toBe(false);
  });

  it('recusa um trajeto curto demais (menos de 5 minutos)', () => {
    const curto = segmentarTerreno(perfilDoTrajeto(serieSintetica([[400, 0], [400, 6]], { velocidade: 4 }), 0, 800)).segmentos;
    const r = montarTreinoDoTerreno(curto, null, contexto);
    expect(r.valido).toBe(false);
  });
});
