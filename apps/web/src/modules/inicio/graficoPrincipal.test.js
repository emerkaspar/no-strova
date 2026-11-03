// @vitest-environment jsdom
import { calcularSerieForma, somarDias } from '@no-strova/domain';
import { describe, expect, it } from 'vitest';
import { criarGraficoPrincipal, PERIODOS, recortarPeriodo, rotuloDoDia } from './graficoPrincipal.js';

const HOJE = '2026-11-04';

/** 60 dias de treino até hoje e 10 dias de plano depois. */
function serieDeTeste(total = 60) {
  const dias = Array.from({ length: total }, (_, i) => ({ data: somarDias(somarDias(HOJE, -(total - 1)), i), estresse: i % 3 === 0 ? 0 : 70 }));
  const real = calcularSerieForma(dias, { ate: HOJE }).map((d) => ({ ...d, projetado: false }));
  const futuro = Array.from({ length: 10 }, (_, i) => ({ ...real[real.length - 1], data: somarDias(HOJE, i + 1), projetado: true }));
  return [...real, ...futuro];
}

const mover = (area, x, pointerType = 'mouse') =>
  area.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true }), { clientX: x, pointerType }));

function montar(extra = {}) {
  document.body.innerHTML = '';
  const el = criarGraficoPrincipal({ serie: serieDeTeste(extra.total), hoje: HOJE, ...extra });
  document.body.append(el);
  const area = el.querySelector('.cg-area-grafico');
  area.querySelector('svg').getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 500, right: 760, bottom: 500 });
  return { el, area };
}

describe('rotuloDoDia', () => {
  it('escreve o dia da semana, o dia e o mês abreviados', () => {
    expect(rotuloDoDia('2026-10-28')).toBe('qua, 28 out');
    expect(rotuloDoDia('2026-11-01')).toBe('dom, 1 nov');
  });
});

describe('recortarPeriodo', () => {
  it('mantém os dias realizados do período e até o limite de dias de plano', () => {
    const serie = serieDeTeste();
    const periodo = PERIODOS.find((p) => p.id === '6sem');
    const recorte = recortarPeriodo(serie, periodo);
    expect(recorte.filter((d) => !d.projetado)).toHaveLength(periodo.passado + 1);
    expect(recorte.filter((d) => d.projetado)).toHaveLength(10); // o plano só tem 10 dias
    expect(recorte[recorte.length - 1].data).toBe(somarDias(HOJE, 10));
  });

  it('série vazia → vazio', () => {
    expect(recortarPeriodo([], PERIODOS[0])).toEqual([]);
  });
});

describe('criarGraficoPrincipal', () => {
  it('sem peso, mostra o estado vazio no terceiro painel', () => {
    const { el } = montar();
    expect(el.querySelector('.cg-peso-vazio a').getAttribute('href')).toBe('#/peso');
    expect(el.querySelector('polyline.cg-peso')).toBeNull();
  });

  it('com peso e meta, desenha a linha contínua e a meta tracejada; o tooltip mostra Peso e, no futuro, Meta', () => {
    const pesos = [
      { data: somarDias(HOJE, -20), kg: 80 },
      { data: somarDias(HOJE, -10), kg: 79.2 },
      { data: HOJE, kg: 78.4 },
    ];
    const { el, area } = montar({ pesos, metaPeso: { dataAlvo: somarDias(HOJE, 10), kg: 77 } });
    expect(el.querySelector('.cg-peso-vazio')).toBeNull();
    expect(el.querySelector('polyline.cg-peso:not(.cg-tracejada)')).not.toBeNull();
    expect(el.querySelector('polyline.cg-peso.cg-tracejada')).not.toBeNull();

    // último ponto da janela de 10 sem: hoje + 10 dias (meta de 77 kg)
    mover(area, 757);
    expect(el.querySelector('.cg-dica').textContent).toContain('Meta77,0 kg');
    // o dia de hoje tem a pesagem
    const dias = [...el.querySelectorAll('rect.cg-barra')];
    const xHoje = 40 + ((dias.length - 10 - 1 + 0.5) / dias.length) * (760 - 40 - 14);
    mover(area, xHoje);
    expect(el.querySelector('.cg-dica').textContent).toContain('Peso78,4 kg');
  });

  it('a barra do dia sob o cursor fica em destaque e a régua acompanha a Forma do dia', () => {
    const { el, area } = montar();
    const marcadorHoje = el.querySelector('.cg-regua-marcador').style.top;
    mover(area, 45);
    expect(el.querySelectorAll('.cg-barra-ativa')).toHaveLength(1);
    expect(el.querySelector('.cg-regua-marcador').style.top).not.toBe('');
    area.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    expect(el.querySelectorAll('.cg-barra-ativa')).toHaveLength(0);
    expect(el.querySelector('.cg-regua-marcador').style.top).toBe(marcadorHoje);
  });

  it('no toque a seleção fica depois de tirar o dedo', () => {
    const { el, area } = montar();
    mover(area, 45, 'touch');
    area.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'touch' }));
    expect(el.querySelector('.cg-dica').hidden).toBe(false);
  });
});

describe('marcadores de atividade', () => {
  it('desenha o ícone do esporte nos dias com atividade e nada nos dias de descanso', () => {
    const feitas = new Map([
      [somarDias(HOJE, -2), ['ciclismo']],
      [somarDias(HOJE, -5), ['corrida']],
    ]);
    const { el } = montar({ esportesDoDia: (data) => feitas.get(data) ?? [] });
    const titulos = [...el.querySelectorAll('.cg-atividade title')].map((t) => t.textContent);
    expect(titulos.filter((t) => t.endsWith('· Ciclismo'))).toHaveLength(1);
    expect(titulos.filter((t) => t.endsWith('· Corrida'))).toHaveLength(1);
  });

  it('com o gráfico denso (período longo), usa traços finos coloridos no lugar dos ícones', () => {
    const { el } = montar({ total: 300, esportesDoDia: (data) => (data === HOJE ? ['ciclismo'] : []) });
    el.querySelectorAll('.cg-periodo')[3].click(); // 1 ano
    expect(el.querySelector('.cg-atividade .cg-icone')).toBeNull();
    expect(el.querySelectorAll('.cg-esporte-ciclismo line.cg-traco').length).toBeGreaterThan(0);
  });
});

describe('contador de atividades no dia', () => {
  it('com mais de uma atividade no dia, mostra o contador ao lado do ícone', () => {
    const { el } = montar({ esportesDoDia: (data) => (data === HOJE ? ['ciclismo', 'corrida'] : []) });
    const grupo = [...el.querySelectorAll('.cg-atividade')].find((g) => g.querySelector('title').textContent.includes('2 atividades'));
    expect(grupo.querySelector('.cg-contador').textContent).toBe('2');
  });

  it('com uma só atividade não há contador', () => {
    const { el } = montar({ esportesDoDia: (data) => (data === HOJE ? ['ciclismo'] : []) });
    expect(el.querySelector('.cg-contador')).toBeNull();
    expect(el.querySelector('.cg-esporte-ciclismo .cg-icone')).not.toBeNull();
  });

  it('no modo denso, vários traços empilhados indicam mais de uma atividade', () => {
    const { el } = montar({ total: 300, esportesDoDia: (data) => (data === HOJE ? ['ciclismo', 'ciclismo'] : []) });
    el.querySelectorAll('.cg-periodo')[3].click();
    const grupo = [...el.querySelectorAll('.cg-atividade')].find((g) => g.querySelector('title').textContent.includes('2 atividades'));
    expect(grupo.querySelectorAll('line.cg-traco')).toHaveLength(2);
  });
});

describe('treino do dia com ícone', () => {
  it('a coluna lateral mostra o ícone do esporte ao lado do treino', () => {
    const { el } = montar({ treinoDoDia: (data) => (data === HOJE ? [{ texto: 'Ciclismo 17,1 km', esporte: 'ciclismo' }] : null) });
    const linha = el.querySelector('.cg-dia-treino .cg-treino-linha');
    expect(linha.querySelector('svg.cg-esporte-ciclismo')).not.toBeNull();
    expect(linha.textContent).toBe('Ciclismo 17,1 km');
  });

  it('sem atividade, mostra "Descanso" com o preguiçoso e uma frase bem-humorada', () => {
    const { el } = montar();
    expect(el.querySelector('.cg-dia-treino .cg-treino-linha').textContent).toBe('Descanso');
    expect(el.querySelector('.cg-dia-treino svg.cg-esporte-preguica')).not.toBeNull();
    expect(el.querySelector('.cg-dia-treino .cg-piada').textContent.length).toBeGreaterThan(10);
  });
});
