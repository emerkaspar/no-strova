// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  salvarPreferencias: vi.fn(),
  salvarConfig: vi.fn(),
  reconstruirCalibracao: vi.fn(),
  serie: null,
}));

vi.mock('../../core/functions.js', () => ({ reconstruirCalibracao: m.reconstruirCalibracao }));
vi.mock('../../infrastructure/calibracaoRepo.js', () => ({ salvarPreferencias: m.salvarPreferencias }));
vi.mock('../../infrastructure/configsRepo.js', () => ({ salvarConfig: m.salvarConfig }));
vi.mock('../../infrastructure/atividadesRepo.js', () => ({ lerSerieFc: async () => m.serie }));

const { criarCartaoCalibracao, criarCartaoTesteLthr } = await import('./calibracao.js');

const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Série a cada 5 s: fases [duraçãoS, fc]. */
function serie(fases) {
  const t = [];
  const fc = [];
  let tempo = 0;
  for (const [duracao, valor] of fases) {
    for (let i = 0; i < duracao / 5; i++) {
      t.push(tempo);
      fc.push(valor);
      tempo += 5;
    }
  }
  return { passoS: 5, t, fc };
}

beforeEach(() => {
  document.body.innerHTML = '';
  m.salvarPreferencias.mockReset().mockResolvedValue();
  m.salvarConfig.mockReset().mockResolvedValue();
  m.reconstruirCalibracao.mockReset().mockResolvedValue({ amostras: 7 });
  m.serie = null;
  window.confirm = vi.fn(() => true);
});

describe('cartão de calibração', () => {
  const calibracao = { chaves: { ciclismo_Z2: { n: 5, mediana: 70, amostras: [] }, ciclismo_Z4: { n: 2, mediana: 90, amostras: [] } } };

  it('sem dados, explica o que falta', () => {
    const el = criarCartaoCalibracao({ uid: 'u1', configs: [config], calibracao: null, preferencias: null });
    expect(el.querySelector('.vazio-curto').textContent).toContain('pelo menos 3 atividades');
    expect(el.querySelector('table')).toBeNull();
  });

  it('mostra, por esporte e zona, as atividades, o seu HRSS/h, a fórmula e o peso da calibração', () => {
    const el = criarCartaoCalibracao({ uid: 'u1', configs: [config], calibracao, preferencias: null });
    const linhas = [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(linhas).toHaveLength(2);
    expect(linhas[0].slice(0, 4)).toEqual(['Ciclismo', 'Z2', '5', '70,0']);
    expect(linhas[0][5]).toBe('50%'); // 5 / (5 + 5)
    expect(linhas[1].slice(0, 3)).toEqual(['Ciclismo', 'Z4', '2']);
    expect(linhas[1][5]).toBe('precisa de 1 a mais');
  });

  it('a caixa liga e desliga o uso da calibração', async () => {
    const el = criarCartaoCalibracao({ uid: 'u1', configs: [config], calibracao, preferencias: null });
    const caixa = el.querySelector('#cal-ativa');
    expect(caixa.checked).toBe(true);
    caixa.checked = false;
    caixa.dispatchEvent(new Event('change'));
    await tick();
    expect(m.salvarPreferencias).toHaveBeenCalledWith('u1', { calibracaoAtiva: false });
    expect(el.querySelector('.mensagem-ok').textContent).toContain('desligada');
  });

  it('preferência desligada aparece desmarcada; erro ao salvar desfaz a marcação', async () => {
    const el = criarCartaoCalibracao({ uid: 'u1', configs: [config], calibracao, preferencias: { calibracaoAtiva: false } });
    const caixa = el.querySelector('#cal-ativa');
    expect(caixa.checked).toBe(false);
    m.salvarPreferencias.mockRejectedValue(new Error('x'));
    caixa.checked = true;
    caixa.dispatchEvent(new Event('change'));
    await tick();
    expect(caixa.checked).toBe(false);
    expect(el.querySelector('.mensagem-erro').textContent).toContain('Não foi possível salvar');
  });

  it('"Refazer a calibração" chama o servidor', async () => {
    const el = criarCartaoCalibracao({ uid: 'u1', configs: [config], calibracao, preferencias: null });
    el.querySelector('button.btn-secundario').click();
    await tick();
    expect(m.reconstruirCalibracao).toHaveBeenCalled();
    expect(el.querySelector('.mensagem-ok').textContent).toContain('7 atividades');
  });
});

describe('cartão do teste de LTHR', () => {
  const atividade = (extra) => ({ id: 'a1', data: '2026-11-03', esporte: 'ciclismo', origem: 'arquivo', duracaoS: 3600, fcMedia: 150, ...extra });

  function montar(atividades = [atividade()], configs = [config]) {
    const cartao = criarCartaoTesteLthr({ uid: 'u1' });
    document.body.append(cartao.raiz);
    cartao.atualizar({ configs, atividades });
    return cartao;
  }
  const clicar = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent.includes(texto)).click();

  it('mostra o protocolo e só oferece atividades de arquivo, com FC e pelo menos 30 minutos', () => {
    const { raiz } = montar([atividade(), atividade({ id: 'curta', duracaoS: 1200 }), atividade({ id: 'manual', origem: 'manual' }), atividade({ id: 'semfc', fcMedia: null })]);
    expect(raiz.querySelectorAll('.roteiro li').length).toBeGreaterThanOrEqual(4);
    expect([...raiz.querySelectorAll('select option')].map((o) => o.value)).toEqual(['a1']);
  });

  it('sem atividade candidata, esconde o seletor e orienta a importar', () => {
    const { raiz } = montar([]);
    expect(raiz.querySelector('select').hidden).toBe(true);
    expect(raiz.querySelector('.vazio-curto').hidden).toBe(false);
  });

  it('analisa a série, mostra o LTHR, a FC média da janela e a FC máxima', async () => {
    m.serie = serie([[900, 130], [600, 160], [1200, 172], [600, 120]]);
    const { raiz } = montar();
    clicar(raiz, 'Analisar');
    await tick();
    expect(raiz.querySelector('.teste-lthr').textContent).toBe('172 bpm');
    expect(raiz.querySelectorAll('.teste-numero')).toHaveLength(3);
    expect(raiz.textContent).toContain('a partir de 03/11/2026');
    expect(raiz.querySelector('.teste-resultado').textContent).not.toContain('null'); // sem a opção de FC máxima, nada de "null"
  });

  it('atividade sem série de FC ou com menos de 30 minutos de FC: mensagem de erro', async () => {
    const { raiz } = montar();
    clicar(raiz, 'Analisar');
    await tick();
    expect(raiz.querySelector('.mensagem-erro').textContent).toContain('não tem série');
    m.serie = serie([[900, 150]]);
    clicar(raiz, 'Analisar');
    await tick();
    expect(raiz.querySelector('.mensagem-erro').textContent).toContain('30 minutos seguidos');
  });

  it('aplica: cria a vigência na data do teste, com o LTHR novo e o resto da configuração vigente', async () => {
    m.serie = serie([[900, 130], [1800, 174], [300, 120]]);
    const { raiz } = montar();
    clicar(raiz, 'Analisar');
    await tick();
    clicar(raiz, 'Criar nova vigência');
    await tick();
    expect(window.confirm).toHaveBeenCalled();
    expect(m.salvarConfig).toHaveBeenCalledWith('u1', expect.objectContaining({ vigenteDesde: '2026-11-03', lthr: 174, fcMax: 190, fcRepouso: 50, sexo: 'masculino', pesoKg: 75, alturaCm: 178 }));
    expect(raiz.querySelector('.mensagem-ok').textContent).toContain('Recalcular histórico');
  });

  it('FC máxima observada acima da configurada: oferece atualizar e, marcada, grava a nova', async () => {
    m.serie = serie([[900, 130], [1800, 170], [60, 196]]);
    const { raiz } = montar();
    clicar(raiz, 'Analisar');
    await tick();
    const caixa = raiz.querySelector('#teste-fcmax');
    expect(caixa.checked).toBe(true);
    clicar(raiz, 'Criar nova vigência');
    await tick();
    expect(m.salvarConfig.mock.calls[0][1].fcMax).toBe(196);
  });

  it('cancelar a confirmação não grava nada', async () => {
    m.serie = serie([[900, 130], [1800, 174]]);
    const { raiz } = montar();
    window.confirm = vi.fn(() => false);
    clicar(raiz, 'Analisar');
    await tick();
    clicar(raiz, 'Criar nova vigência');
    await tick();
    expect(m.salvarConfig).not.toHaveBeenCalled();
  });

  it('sem configuração cadastrada, não cria a vigência e orienta a cadastrar', async () => {
    m.serie = serie([[900, 130], [1800, 174]]);
    const { raiz } = montar([atividade()], []);
    clicar(raiz, 'Analisar');
    await tick();
    clicar(raiz, 'Criar nova vigência');
    await tick();
    expect(m.salvarConfig).not.toHaveBeenCalled();
    expect(raiz.querySelector('.mensagem-erro').textContent).toContain('Cadastre primeiro');
  });
});
