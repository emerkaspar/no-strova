// @vitest-environment jsdom
import { agruparTreinoECorpo } from '@no-strova/domain';
import { describe, expect, it, vi } from 'vitest';

// os módulos que falam com o Firebase não rodam no teste: só o desenho dos componentes interessa
vi.mock('../../core/functions.js', () => ({ intervalsSincronizarBemEstar: vi.fn() }));
vi.mock('../../infrastructure/calibracaoRepo.js', () => ({ observarPreferencias: vi.fn(() => () => {}), salvarPreferencias: vi.fn() }));
vi.mock('../../infrastructure/pesoRepo.js', () => ({ excluirPesagem: vi.fn(), idDaPesagem: vi.fn() }));

const { criarGraficoSaude } = await import('./graficoSaude.js');
const { criarResumoDaSaude } = await import('./resumoDaSaude.js');
const { criarSecaoSonoPassosTreino } = await import('./sonoPassosTreino.js');
const { criarHistoricoDePesagens } = await import('./historicoPesagens.js');
const { criarGraficoPeso } = await import('./graficoPeso.js');

const HOJE = '2026-11-17';
const H = 3600;

/** 120 dias de dados fictícios: sono entre 5 e 8 h, passos entre 3 e 11 mil, treino em dias alternados. */
function dadosDeExemplo() {
  const bemEstar = [];
  const estresse = [];
  const pesagens = [];
  for (let i = 0; i < 120; i += 1) {
    const d = new Date(Date.parse(`${HOJE}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    bemEstar.push({ data: d, sonoSegundos: i % 9 === 0 ? null : (5 + (i % 4)) * H, passos: 3000 + (i % 9) * 1000 });
    if (i % 2 === 0) estresse.push({ data: d, estresse: 40 + (i % 5) * 10, qtdAtividades: 1 });
    if (i % 7 === 0) pesagens.push({ data: d, pesoKg: 92 - i / 40 });
  }
  return { bemEstar: bemEstar.reverse(), estresse: estresse.reverse(), pesagens: pesagens.reverse() };
}

describe('gráfico de sono, passos e treino', () => {
  const d = dadosDeExemplo();

  it.each([[30], [90], [182], [365], [null]])('desenha para o período de %s dias', (dias) => {
    const { grupos, granularidade } = agruparTreinoECorpo({ bemEstar: d.bemEstar, estresse: d.estresse }, HOJE, { dias });
    const el = criarGraficoSaude({ grupos, granularidade, metaPassos: 8000 });
    expect(el).not.toBeNull();
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('aria-label')).toContain('Sono, passos e carga de treino');
    // sem texto "null" ou "NaN" no desenho
    expect(svg.textContent).not.toMatch(/null|NaN|undefined/);
    // três painéis (sono, passos e carga)
    expect(svg.querySelectorAll('.cg-titulo-painel')).toHaveLength(3);
  });

  it('só mostra a média de 7 dias no modo diário', () => {
    const diario = agruparTreinoECorpo({ bemEstar: d.bemEstar, estresse: d.estresse }, HOJE, { dias: 30 });
    const semanal = agruparTreinoECorpo({ bemEstar: d.bemEstar, estresse: d.estresse }, HOJE, { dias: 182 });
    expect(criarGraficoSaude({ ...diario, metaPassos: 8000 }).querySelectorAll('.gps-media').length).toBeGreaterThan(0);
    expect(criarGraficoSaude({ ...semanal, metaPassos: 8000 }).querySelectorAll('.gps-media')).toHaveLength(0);
  });

  it('abre o detalhe do dia ao passar o mouse', () => {
    const { grupos, granularidade } = agruparTreinoECorpo({ bemEstar: d.bemEstar, estresse: d.estresse }, HOJE, { dias: 30 });
    const el = criarGraficoSaude({ grupos, granularidade, metaPassos: 8000 });
    document.body.append(el);
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 50, bubbles: true }));
    const dica = el.querySelector('.cg-dica');
    expect(dica.hidden).toBe(false);
    expect(dica.textContent).toContain('Sono');
    expect(dica.textContent).toContain('Passos');
    el.remove();
  });

  it('devolve null sem dados', () => {
    expect(criarGraficoSaude({ grupos: [], granularidade: 'dia', metaPassos: 8000 })).toBeNull();
  });
});

describe('resumo da saúde', () => {
  it('mostra os quatro cartões e a leitura do período', () => {
    const d = dadosDeExemplo();
    const dados = { pesagens: d.pesagens, bemEstar: d.bemEstar, dias: d.estresse };
    const r = criarResumoDaSaude({ dados, hoje: HOJE, periodo: () => ({ dias: 30 }), metaPassos: () => 8000, perderPeso: () => true });
    expect(r.el.querySelectorAll('.saude-card')).toHaveLength(4);
    expect(r.el.textContent).toContain('Leitura do período');
    expect(r.el.textContent).toContain('Sono: média de');
    expect(r.el.textContent).not.toMatch(/null|NaN|undefined/);
    r.atualizar(); // redesenhar não pode falhar
  });

  it('cada mini-gráfico tem uma referência para comparar e uma dica ao passar o mouse', () => {
    const d = dadosDeExemplo();
    const dados = { pesagens: d.pesagens, bemEstar: d.bemEstar, dias: d.estresse };
    const r = criarResumoDaSaude({ dados, hoje: HOJE, periodo: () => ({ dias: 60 }), metaPassos: () => 8000, perderPeso: () => true });
    const blocos = r.el.querySelectorAll('.saude-mini-bloco');
    expect(blocos).toHaveLength(4);
    expect(r.el.querySelectorAll('.saude-mini-faixa')).toHaveLength(1); // faixa ideal do sono
    expect(r.el.querySelectorAll('.saude-mini-ref').length).toBeGreaterThanOrEqual(2); // meta de passos e início do peso
    expect([...blocos].every((b) => b.querySelector('.saude-mini-legenda'))).toBe(true);
    const area = r.el.querySelector('.saude-card-sono .saude-mini-area');
    area.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, bubbles: true }));
    const dica = area.querySelector('.saude-mini-dica');
    expect(dica.hidden).toBe(false);
    expect(dica.textContent).toMatch(/\d{2}\/\d{2}/);
    expect(dica.textContent).toMatch(/\d h/);
    area.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    expect(dica.hidden).toBe(true);
  });

  it('funciona sem nenhum dado', () => {
    const r = criarResumoDaSaude({ dados: { pesagens: [], bemEstar: [], dias: [] }, hoje: HOJE, periodo: () => ({ dias: null }), metaPassos: () => 8000, perderPeso: () => null });
    expect(r.el.textContent).toContain('Ainda não há dados suficientes');
    expect(r.el.textContent).not.toMatch(/null|NaN|undefined/);
  });
});

describe('seção de sono, passos e treino', () => {
  it('desenha o gráfico, os três números e os botões', () => {
    const d = dadosDeExemplo();
    const dados = { pesagens: [], bemEstar: d.bemEstar, bemEstarCarregou: true, dias: d.estresse };
    const secao = criarSecaoSonoPassosTreino({ sessao: { uid: 'u1' }, hoje: HOJE, dados, periodo: () => ({ dias: 90 }) });
    expect(secao.el.querySelector('svg')).not.toBeNull();
    expect(secao.el.querySelectorAll('.saude-stat')).toHaveLength(3);
    expect(secao.el.textContent).toContain('Meta: 8.000 passos');
    expect(secao.el.textContent).toContain('Atualizar dados');
    expect(secao.el.textContent).not.toMatch(/null|NaN|undefined/);
    expect(secao.meta()).toBe(8000);
  });

  it('mostra o estado vazio sem dados', () => {
    const dados = { pesagens: [], bemEstar: [], bemEstarCarregou: true, dias: [] };
    const secao = criarSecaoSonoPassosTreino({ sessao: { uid: 'u1' }, hoje: HOJE, dados, periodo: () => ({ dias: 90 }) });
    expect(secao.el.textContent).toContain('Sem sono, passos ou treinos neste período');
  });
});

describe('histórico de pesagens', () => {
  it('agrupa por mês e pagina de 12 em 12', () => {
    const pesagens = [];
    for (let i = 0; i < 30; i += 1) pesagens.push({ id: `p${i}`, data: new Date(Date.parse(`${HOJE}T00:00:00Z`) - i * 5 * 86_400_000).toISOString().slice(0, 10), pesoKg: 90 + (i % 3) });
    const hist = criarHistoricoDePesagens({ uid: 'u1', aoErro: () => {} });
    hist.atualizar(pesagens, true);
    expect(hist.el.querySelectorAll('.peso-hist-linha')).toHaveLength(12);
    expect(hist.el.querySelectorAll('.peso-hist-mes').length).toBeGreaterThan(1);
    hist.el.querySelector('.peso-hist-corpo > button').click();
    expect(hist.el.querySelectorAll('.peso-hist-linha')).toHaveLength(24);
  });
});

describe('gráfico do peso', () => {
  const mensais = [150, 120, 90, 60, 30, 0].map((n, i) => ({ data: new Date(Date.parse(`${HOJE}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10), pesoKg: 95 - i * 1.2 }));
  const meta = { pesoAlvoKg: 83, dataAlvo: '2099-01-01' };

  it('com uma pesagem por mês: liga as pesagens, escreve os valores e não usa a média de 7 dias', () => {
    const el = criarGraficoPeso({ pesagens: mensais, meta, hoje: HOJE, periodoId: '1a' });
    expect(el.dataset.modo).toBe('esparso');
    expect(el.querySelectorAll('.peso-valor')).toHaveLength(6);
    expect(el.querySelectorAll('.peso-media')).toHaveLength(1); // a linha que liga as pesagens
    expect(el.textContent).toContain('Meta 83,0 kg');
    expect(el.textContent).not.toMatch(/null|NaN|undefined/);
  });

  it('a meta no futuro só estica o eixo quando a projeção é pedida', () => {
    const sem = criarGraficoPeso({ pesagens: mensais, meta, hoje: HOJE, periodoId: '1a' });
    const com = criarGraficoPeso({ pesagens: mensais, meta, hoje: HOJE, periodoId: '1a', comProjecao: true });
    expect(sem.querySelector('.peso-losango')).toBeNull();
    expect(com.querySelector('.peso-losango')).not.toBeNull();
    // sem projeção, o último ponto fica perto da borda direita (o eixo termina em hoje)
    const cx = (el) => Number([...el.querySelectorAll('.peso-ponto')].pop().getAttribute('cx'));
    expect(cx(sem)).toBeGreaterThan(700);
    expect(cx(com)).toBeLessThan(200);
  });

  it('com muitas pesagens usa a média móvel', () => {
    const muitas = Array.from({ length: 40 }, (_, n) => ({ data: new Date(Date.parse(`${HOJE}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10), pesoKg: 90 + (n % 3) * 0.2 }));
    const el = criarGraficoPeso({ pesagens: muitas, meta: null, hoje: HOJE, periodoId: '90d' });
    expect(el.dataset.modo).toBe('denso');
    expect(el.querySelectorAll('.peso-valor')).toHaveLength(0);
  });
});
