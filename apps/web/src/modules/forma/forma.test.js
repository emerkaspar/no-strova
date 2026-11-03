// @vitest-environment jsdom
import { calcularSerieForma } from '@no-strova/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dias: [], reconstruir: vi.fn() }));

vi.mock('../../core/functions.js', () => ({ reconstruirEstresseDiario: mocks.reconstruir }));
vi.mock('../../infrastructure/estresseRepo.js', () => ({
  observarEstresseDiario: (_uid, aoDados) => {
    aoDados(mocks.dias);
    return () => {};
  },
}));
vi.mock('../../utils/formatters.js', async (importarOriginal) => ({
  ...(await importarOriginal()),
  hojeIso: () => '2026-11-10',
}));

const { render } = await import('./forma.view.js');
const { estadoForma } = await import('./state.js');
const { graficoForma } = await import('../../utils/graficoForma.js');
const { montarSerie, recortarPeriodo, cargaRecente, controleAgregacao } = await import('../../application/forma.js');

const sessao = { uid: 'u1' };
const tick = () => new Promise((r) => setTimeout(r, 0));
let raiz;

beforeEach(() => {
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz');
  mocks.dias = [];
  mocks.reconstruir.mockReset().mockResolvedValue({ dias: 0, removidos: 0 });
  Object.assign(estadoForma, { periodo: '90', barras: true });
  controleAgregacao.pedido = false;
});

const treinos = [
  { data: '2026-10-01', estresse: 80 },
  { data: '2026-10-03', estresse: 120 },
  { data: '2026-10-05', estresse: 60 },
  { data: '2026-10-20', estresse: 100 },
];

describe('application/forma', () => {
  it('monta a série até hoje com decaimento depois do último treino', () => {
    const serie = montarSerie(treinos, '2026-11-10');
    expect(serie.at(-1).data).toBe('2026-11-10');
    expect(serie.at(-1).estresse).toBe(0);
    expect(serie[0].data).toBe('2026-09-30');
  });

  it('recorta pelo período escolhido e soma a carga recente', () => {
    const serie = montarSerie(treinos, '2026-11-10');
    expect(recortarPeriodo(serie, '30')).toHaveLength(30);
    expect(recortarPeriodo(serie, 'tudo')).toHaveLength(serie.length);
    expect(recortarPeriodo(serie, 'inexistente')).toHaveLength(Math.min(90, serie.length));
    expect(cargaRecente(montarSerie([{ data: '2026-11-09', estresse: 50 }, { data: '2026-11-10', estresse: 70 }], '2026-11-10'), 7)).toBe(120);
  });
});

describe('graficoForma', () => {
  const serie = calcularSerieForma(treinos, { ate: '2026-11-10' });

  it('desenha as três linhas, as faixas de Forma e as barras de estresse', () => {
    const c = graficoForma(serie, { barras: true });
    expect(c.querySelectorAll('polyline')).toHaveLength(3);
    expect(c.querySelector('.serie-fitness')).not.toBeNull();
    expect(c.querySelector('.serie-fadiga')).not.toBeNull();
    expect(c.querySelector('.serie-forma')).not.toBeNull();
    expect(c.querySelectorAll('rect.faixa').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('rect.grafico-barra')).toHaveLength(4);
    expect(c.querySelector('svg').getAttribute('aria-label')).toContain('30/09/2026 a 10/11/2026');
  });

  it('sem barras, não desenha o estresse diário', () => {
    expect(graficoForma(serie, { barras: false }).querySelectorAll('rect.grafico-barra')).toHaveLength(0);
  });

  it('mostra o tooltip do dia sob o cursor e o esconde ao sair', () => {
    const c = graficoForma(serie);
    const svg = c.querySelector('svg');
    svg.getBoundingClientRect = () => ({ left: 0, width: 760 });
    const area = [...svg.querySelectorAll('rect')].find((r) => r.getAttribute('fill') === 'transparent');
    area.dispatchEvent(new MouseEvent('pointermove', { clientX: 44 + (760 - 44 - 92) * 0.5 }));
    const dica = c.querySelector('.grafico-dica');
    expect(dica.hidden).toBe(false);
    expect(dica.textContent).toMatch(/\d{2}\/\d{2}\/2026/);
    expect(dica.textContent).toContain('Fitness');
    expect(dica.textContent).toContain('Forma');
    expect(dica.textContent).toContain('Estresse do dia');
    area.dispatchEvent(new MouseEvent('pointerleave'));
    expect(dica.hidden).toBe(true);
  });

  it('com menos de dois dias devolve só o container vazio', () => {
    expect(graficoForma([]).querySelector('svg')).toBeNull();
    expect(graficoForma(serie.slice(0, 1)).querySelector('svg')).toBeNull();
  });
});

describe('tela de forma', () => {
  it('sem atividades, mostra o estado vazio e pede a reconstrução uma única vez', async () => {
    render(raiz, sessao);
    await tick();
    expect(raiz.textContent).toContain('Ainda não há atividades');
    expect(raiz.querySelector('a[href="#/atividades"]')).not.toBeNull();
    expect(mocks.reconstruir).toHaveBeenCalledTimes(1);
    render(raiz, sessao); // reabrir a tela na mesma sessão
    await tick();
    expect(mocks.reconstruir).toHaveBeenCalledTimes(1);
  });

  it('com dias de estresse zero (sem HRSS), orienta a configurar e recalcular', () => {
    mocks.dias = [{ data: '2026-11-01', estresse: 0, qtdAtividades: 1 }];
    render(raiz, sessao);
    expect(raiz.textContent).toContain('Nenhuma atividade tem HRSS calculado');
    expect(raiz.querySelector('a[href="#/configuracao"]')).not.toBeNull();
    expect(mocks.reconstruir).not.toHaveBeenCalled();
  });

  it('mostra indicadores de hoje, a faixa de Forma, o gráfico e a legenda', () => {
    mocks.dias = treinos;
    render(raiz, sessao);
    const texto = raiz.textContent;
    expect(texto).toContain('Fitness hoje');
    expect(texto).toContain('Fadiga hoje');
    expect(texto).toContain('Forma hoje');
    expect(texto).toContain('Carga em 7 dias');
    expect(raiz.querySelectorAll('svg polyline')).toHaveLength(3);
    for (const faixa of ['Transição', 'Freshness', 'Neutral', 'Optimal', 'Overload']) expect(texto).toContain(faixa);
    expect(mocks.reconstruir).not.toHaveBeenCalled();
  });

  it('troca de período e liga/desliga as barras', () => {
    mocks.dias = treinos;
    render(raiz, sessao);
    const botoes = [...raiz.querySelectorAll('[role=group] button')];
    expect(botoes.map((b) => b.textContent)).toEqual(['30 dias', '90 dias', '6 meses', '1 ano', 'Tudo']);
    expect(botoes[1].getAttribute('aria-pressed')).toBe('true');
    const pontos = () => raiz.querySelector('.serie-fitness').getAttribute('points').split(' ').length;
    expect(pontos()).toBe(42); // 30/09 a 10/11, tudo cabe nos 90 dias
    botoes[0].click();
    expect(estadoForma.periodo).toBe('30');
    expect(pontos()).toBe(30);
    expect(botoes[0].getAttribute('aria-pressed')).toBe('true');
    expect(botoes[1].getAttribute('aria-pressed')).toBe('false');
    expect(raiz.querySelectorAll('rect.grafico-barra').length).toBeGreaterThan(0);
    const caixa = raiz.querySelector('#forma-barras');
    caixa.checked = false;
    caixa.dispatchEvent(new Event('change', { bubbles: true }));
    expect(raiz.querySelectorAll('rect.grafico-barra')).toHaveLength(0);
  });
});
