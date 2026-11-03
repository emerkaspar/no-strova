// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sair: vi.fn() }));

vi.mock('../../application/sessao.js', () => ({ sair: mocks.sair }));
// As telas são simuladas: aqui só se testa o cabeçalho e o roteamento.
for (const [caminho, nome] of [
  ['../admin/aprovacoes.view.js', 'aprovações'],
  ['../atividades/detalhe.view.js', 'detalhe'],
  ['../atividades/lista.view.js', 'atividades'],
  ['../configuracao/configuracao.view.js', 'configuração'],
  ['../forma/forma.view.js', 'forma'],
  ['../inicio/inicio.view.js', 'início'],
  ['../peso/peso.view.js', 'peso'],
  ['../plano/plano.view.js', 'plano'],
]) {
  vi.doMock(caminho, () => ({
    render: (raiz) => {
      raiz.textContent = `tela ${nome}`;
      return () => {};
    },
  }));
}

const { render } = await import('./shell.view.js');
const { estadoAtividades, EVENTO_IMPORTAR } = await import('../atividades/state.js');

const sessaoComum = { uid: 'u1', email: 'emer@x.com', perfil: { nome: 'Emerson Kaspar' }, admin: false };
const dormir = (ms = 15) => new Promise((r) => setTimeout(r, ms));
let raiz;
let destruir;

async function montar(sessao = sessaoComum, hash = '') {
  window.location.hash = hash;
  await dormir();
  destruir = render(raiz, sessao);
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#0a0a0a">';
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz');
  delete document.documentElement.dataset.tema;
  localStorage.clear();
  mocks.sair.mockReset();
  estadoAtividades.abrirImportar = false;
  window.scrollTo = () => {};
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 10, 3, 15, 0)); // terça, 12h em São Paulo
});

afterEach(() => {
  destruir?.();
  vi.useRealTimers();
});

const itensPilula = () => [...raiz.querySelectorAll('.menu-pilula a')].map((a) => a.textContent);
const ativo = (seletor) => raiz.querySelector(`${seletor} a[aria-current="page"]`)?.textContent;

describe('cabeçalho: logo, data e saudação', () => {
  it('mostra o logo, a data por extenso e a saudação com o primeiro nome', async () => {
    await montar();
    expect(raiz.querySelector('.topo-logo img.logo')).not.toBeNull();
    expect(raiz.querySelector('.topo-data').textContent).toBe('Terça-feira, 3 de novembro de 2026');
    expect(raiz.querySelector('.topo-saudacao').textContent).toBe('Boa tarde, Emerson');
  });

  it('a saudação segue a hora de São Paulo', async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 3, 11, 0)); // 08h
    await montar();
    expect(raiz.querySelector('.topo-saudacao').textContent).toBe('Bom dia, Emerson');
    destruir();
    vi.setSystemTime(Date.UTC(2026, 10, 3, 23, 0)); // 20h
    await montar();
    expect(raiz.querySelector('.topo-saudacao').textContent).toBe('Boa noite, Emerson');
  });

  it('sem nome no perfil, usa um tratamento neutro', async () => {
    await montar({ ...sessaoComum, perfil: null });
    expect(raiz.querySelector('.topo-saudacao').textContent).toBe('Boa tarde, atleta');
  });
});

describe('menu', () => {
  it('tem Início, Atividades, Plano, Peso e Configuração; Aprovações só para admin', async () => {
    await montar();
    expect(itensPilula()).toEqual(['Início', 'Atividades', 'Plano', 'Peso', 'Configuração']);
    destruir();
    await montar({ ...sessaoComum, admin: true });
    expect(itensPilula()).toEqual(['Início', 'Atividades', 'Plano', 'Peso', 'Configuração', 'Aprovações']);
  });

  it('a barra de abas do rodapé tem os mesmos itens, cada um com ícone de traço', async () => {
    await montar({ ...sessaoComum, admin: true });
    const abas = [...raiz.querySelectorAll('.barra-abas a')];
    expect(abas.map((a) => a.textContent)).toEqual(['Início', 'Atividades', 'Plano', 'Peso', 'Configuração', 'Aprovações']);
    for (const a of abas) {
      const icone = a.querySelector('svg.icone');
      expect(icone).not.toBeNull();
      expect(icone.getAttribute('fill')).toBe('none');
      expect(icone.getAttribute('stroke')).toBe('currentColor');
    }
  });

  it('marca o item ativo conforme a rota, nos dois menus', async () => {
    await montar();
    expect(ativo('.menu-pilula')).toBe('Início');
    expect(raiz.querySelector('main').textContent).toBe('tela início');

    window.location.hash = '#/plano';
    await dormir();
    expect(ativo('.menu-pilula')).toBe('Plano');
    expect(ativo('.barra-abas')).toBe('Plano');
    expect(raiz.querySelector('main').textContent).toBe('tela plano');

    window.location.hash = '#/peso';
    await dormir();
    expect(raiz.querySelector('main').textContent).toBe('tela peso');
    expect(raiz.querySelectorAll('[aria-current="page"]')).toHaveLength(2); // um por menu
  });

  it('detalhe de atividade mantém Atividades ativo; Forma mantém Início ativo', async () => {
    await montar(sessaoComum, '#/atividades/abcdef123456');
    expect(ativo('.menu-pilula')).toBe('Atividades');
    expect(raiz.querySelector('main').textContent).toBe('tela detalhe');
    window.location.hash = '#/forma';
    await dormir();
    expect(ativo('.menu-pilula')).toBe('Início');
    expect(raiz.querySelector('main').textContent).toBe('tela forma');
  });

  it('Aprovações é bloqueada para quem não é admin e abre para o admin', async () => {
    await montar(sessaoComum, '#/admin');
    expect(raiz.querySelector('main').textContent).toBe('tela início');
    destruir();
    await montar({ ...sessaoComum, admin: true }, '#/admin');
    expect(raiz.querySelector('main').textContent).toBe('tela aprovações');
    expect(ativo('.menu-pilula')).toBe('Aprovações');
  });
});

describe('botão "Importar arquivo"', () => {
  it('é laranja (botão primário) e tem o nome acessível completo', async () => {
    await montar();
    const botao = raiz.querySelector('.btn-importar');
    expect(botao.classList.contains('btn')).toBe(true);
    expect(botao.getAttribute('aria-label')).toBe('Importar arquivo');
  });

  it('de outra tela, abre Atividades pedindo o painel de importação', async () => {
    await montar(sessaoComum, '#/plano');
    raiz.querySelector('.btn-importar').click();
    expect(estadoAtividades.abrirImportar).toBe(true);
    expect(window.location.hash).toBe('#/atividades');
  });

  it('já em Atividades, avisa a lista por evento, sem trocar de rota', async () => {
    await montar(sessaoComum, '#/atividades');
    const ouvinte = vi.fn();
    window.addEventListener(EVENTO_IMPORTAR, ouvinte);
    raiz.querySelector('.btn-importar').click();
    window.removeEventListener(EVENTO_IMPORTAR, ouvinte);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/atividades');
    expect(estadoAtividades.abrirImportar).toBe(false); // sem pedido pendente: o evento basta
  });
});

describe('avatar e menu da conta', () => {
  const avatar = () => raiz.querySelector('.avatar');
  const menu = () => raiz.querySelector('.menu-conta');

  it('mostra a inicial do nome e começa com o menu fechado', async () => {
    await montar();
    expect(avatar().textContent).toBe('E');
    expect(avatar().getAttribute('aria-expanded')).toBe('false');
    expect(menu().hidden).toBe(true);
  });

  it('usa a inicial do e-mail quando não há nome', async () => {
    await montar({ ...sessaoComum, perfil: null });
    expect(avatar().textContent).toBe('E');
  });

  it('abre com "Tema claro" e "Sair" e fecha com Escape', async () => {
    await montar();
    avatar().click();
    expect(menu().hidden).toBe(false);
    expect(avatar().getAttribute('aria-expanded')).toBe('true');
    expect([...menu().querySelectorAll('[role=menuitem]')].map((b) => b.textContent)).toEqual(['Tema claro', 'Sair']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu().hidden).toBe(true);
    expect(avatar().getAttribute('aria-expanded')).toBe('false');
  });

  it('fecha ao clicar fora, mas não ao clicar dentro do menu', async () => {
    await montar();
    avatar().click();
    menu().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu().hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu().hidden).toBe(true);
  });

  it('alterna o tema (escuro é o padrão), lembra a escolha e atualiza o rótulo', async () => {
    await montar();
    avatar().click();
    menu().querySelector('[role=menuitem]').click();
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('no-strova:tema')).toBe('claro');
    expect(menu().hidden).toBe(true);
    avatar().click();
    expect(menu().querySelector('[role=menuitem]').textContent).toBe('Tema escuro');
  });

  it('"Sair" encerra a sessão', async () => {
    await montar();
    avatar().click();
    [...menu().querySelectorAll('[role=menuitem]')].find((b) => b.textContent === 'Sair').click();
    expect(mocks.sair).toHaveBeenCalledTimes(1);
  });
});
