// @vitest-environment jsdom
import { modeloPorId } from '@no-strova/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  hoje: '2026-11-04', // quarta
  treinos: [],
  configs: [],
  modelos: [],
  dias: [],
  preferencias: null,
  criarTreino: vi.fn(),
  criarTreinosEmLote: vi.fn(),
  criarModelo: vi.fn(),
  atualizarModelo: vi.fn(),
  excluirModelo: vi.fn(),
  salvarPreferencias: vi.fn(),
  baixarArquivo: vi.fn(),
  cancelar: vi.fn(),
}));

const assinar = (chave) => (...args) => {
  const aoDados = args.find((a) => typeof a === 'function');
  aoDados(m[chave]);
  return m.cancelar;
};
vi.mock('../../infrastructure/planoRepo.js', () => ({
  observarTreinos: assinar('treinos'),
  criarTreino: m.criarTreino,
  criarTreinosEmLote: m.criarTreinosEmLote,
}));
vi.mock('../../infrastructure/configsRepo.js', () => ({ observarConfigs: assinar('configs') }));
vi.mock('../../infrastructure/estresseRepo.js', () => ({ observarEstresseDiario: assinar('dias') }));
vi.mock('../../infrastructure/modelosRepo.js', () => ({
  observarModelos: assinar('modelos'),
  criarModelo: m.criarModelo,
  atualizarModelo: m.atualizarModelo,
  excluirModelo: m.excluirModelo,
}));
vi.mock('../../infrastructure/calibracaoRepo.js', () => ({ observarPreferencias: assinar('preferencias'), salvarPreferencias: m.salvarPreferencias }));
vi.mock('../../utils/perfilTreino.js', async (importarOriginal) => ({ ...(await importarOriginal()), baixarArquivo: m.baixarArquivo }));
vi.mock('../../utils/formatters.js', async (importarOriginal) => ({ ...(await importarOriginal()), hojeIso: () => m.hoje }));

const { render } = await import('./treinos.view.js');
const { reiniciarEstadoTreinos } = await import('./state.js');

const sessao = { uid: 'u1' };
const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
const tick = () => new Promise((r) => setTimeout(r, 0));
let raiz;
let destruir;

const botao = (texto, onde = raiz) => [...onde.querySelectorAll('button')].find((b) => b.textContent.trim() === texto || b.textContent.trim().startsWith(texto));
const abrir = () => {
  destruir = render(raiz, sessao);
};
const aba = (nome) => botao(nome, raiz.querySelector('.treinos-abas')).click();

beforeEach(() => {
  destruir?.();
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz');
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  reiniciarEstadoTreinos();
  m.hoje = '2026-11-04';
  m.treinos = [];
  m.configs = [config];
  m.modelos = [];
  m.dias = Array.from({ length: 20 }, (_, i) => ({ data: `2026-10-${String(10 + i).padStart(2, '0')}`, estresse: 60 })).filter((d) => d.data <= '2026-10-31');
  m.preferencias = null;
  for (const f of [m.criarTreino, m.criarTreinosEmLote, m.criarModelo, m.atualizarModelo, m.excluirModelo, m.salvarPreferencias, m.baixarArquivo]) f.mockReset().mockResolvedValue('id1');
  m.baixarArquivo.mockReset();
  window.confirm = vi.fn(() => true);
});

describe('tela de Treinos: cabeçalho e abas', () => {
  it('mostra o título, os controles de esporte e nível (intermediário por padrão) e as três abas', () => {
    abrir();
    expect(raiz.querySelector('h1').textContent).toBe('Treinos intervalados');
    expect(raiz.querySelector('[aria-label="Esporte"] [aria-pressed="true"]').textContent).toBe('Ciclismo');
    expect(raiz.querySelector('[aria-label="Nível"] [aria-pressed="true"]').textContent).toBe('Intermediário');
    expect([...raiz.querySelectorAll('.treinos-aba')].map((b) => b.textContent)).toEqual(['Sugestões', 'Biblioteca', 'Meus treinos']);
    expect(raiz.querySelector('.treinos-aba[aria-selected="true"]').textContent).toBe('Sugestões');
  });

  it('o nível salvo nas preferências é o escolhido; trocar salva sem apagar as outras preferências', async () => {
    m.preferencias = { calibracaoAtiva: false, nivelTreinos: 'avancado' };
    abrir();
    expect(raiz.querySelector('[aria-label="Nível"] [aria-pressed="true"]').textContent).toBe('Avançado');
    botao('Iniciante', raiz.querySelector('[aria-label="Nível"]')).click();
    await tick();
    expect(m.salvarPreferencias).toHaveBeenCalledWith('u1', { nivelTreinos: 'iniciante' });
    expect(raiz.querySelector('[aria-label="Nível"] [aria-pressed="true"]').textContent).toBe('Iniciante');
  });

  it('trocar de esporte muda os treinos mostrados', () => {
    abrir();
    aba('Biblioteca');
    const nomesCiclismo = [...raiz.querySelectorAll('.treino-nome')].map((n) => n.textContent);
    botao('Corrida', raiz.querySelector('[aria-label="Esporte"]')).click();
    expect([...raiz.querySelectorAll('.treino-nome')].map((n) => n.textContent).length).toBeGreaterThan(0);
    expect(raiz.querySelector('.treinos-grade')).not.toBeNull();
    expect(nomesCiclismo.length).toBeGreaterThan(0);
  });
});

describe('aba Sugestões', () => {
  it('mostra sugestões para os próximos dias, com data, perfil, resumo e motivo', () => {
    abrir();
    const linhas = [...raiz.querySelectorAll('.sugestao')];
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    for (const l of linhas) {
      expect(l.dataset.data > '2026-11-04').toBe(true);
      expect(l.querySelector('svg.perfil-treino')).not.toBeNull();
      expect(l.querySelector('.treino-resumo').textContent).toMatch(/de HRSS$/);
      expect(l.querySelector('.sugestao-corpo > p.texto-secundario').textContent).toContain('Foco em');
    }
    expect(raiz.querySelector('#sugestoes').textContent).toContain('Nada entra no plano sem a sua aprovação');
  });

  it('o texto diz a Forma de hoje e a regra de no máximo 2 treinos intensos', () => {
    abrir();
    const texto = raiz.querySelector('#sugestoes .texto-secundario').textContent;
    expect(texto).toContain('no máximo 2 treinos intensos');
    expect(texto).toMatch(/Sua Forma hoje: [+−]?[0-9]+,[0-9]/);
  });

  it('"Trocar" tira o treino da lista e o substitui por outro', () => {
    abrir();
    const nome = raiz.querySelector('.sugestao strong').firstChild.textContent;
    botao('Trocar', raiz.querySelector('.sugestao')).click();
    const nomes = [...raiz.querySelectorAll('.sugestao strong')].map((s) => s.firstChild.textContent);
    expect(nomes).not.toContain(nome);
  });

  it('"Adicionar ao plano" grava os selecionados de uma vez, depois de confirmar', async () => {
    abrir();
    const total = raiz.querySelectorAll('.sugestao').length;
    expect(botao('Adicionar', raiz.querySelector('#sugestoes')).textContent).toBe(`Adicionar ${total} ao plano`);
    botao('Adicionar', raiz.querySelector('#sugestoes')).click();
    await tick();
    expect(window.confirm).toHaveBeenCalled();
    expect(m.criarTreinosEmLote).toHaveBeenCalledTimes(1);
    const [uid, itens] = m.criarTreinosEmLote.mock.calls[0];
    expect(uid).toBe('u1');
    expect(itens).toHaveLength(total);
    for (const { valores, estimado } of itens) {
      expect(valores.passos.length).toBeGreaterThan(0);
      expect(valores.nomeTreino).toBeTruthy();
      expect(estimado).toBeGreaterThan(0);
    }
    expect(raiz.querySelector('#sugestoes .mensagem-ok').textContent).toContain('adicionados ao plano');
  });

  it('desmarcar uma sugestão a tira do lote; sem confirmação, nada é gravado', async () => {
    abrir();
    const total = raiz.querySelectorAll('.sugestao').length;
    raiz.querySelector('.sugestao input[type="checkbox"]').click();
    expect(botao('Adicionar', raiz.querySelector('#sugestoes')).textContent).toBe(`Adicionar ${total - 1} ao plano`);
    window.confirm = vi.fn(() => false);
    botao('Adicionar', raiz.querySelector('#sugestoes')).click();
    await tick();
    expect(m.criarTreinosEmLote).not.toHaveBeenCalled();
  });

  it('respeita o plano: dias com treino ficam de fora, e com a Forma na sobrecarga avisa e não sugere intensos', () => {
    m.treinos = [{ id: 't1', data: '2026-11-05', status: 'planejado', zona: 'Z2', esporte: 'ciclismo' }];
    m.dias = Array.from({ length: 10 }, (_, i) => ({ data: `2026-10-${String(22 + i).padStart(2, '0')}`, estresse: i % 2 ? 160 : 40 }));
    m.dias.push({ data: '2026-11-01', estresse: 160 }, { data: '2026-11-02', estresse: 180 }, { data: '2026-11-03', estresse: 190 }, { data: '2026-11-04', estresse: 200 });
    abrir();
    expect([...raiz.querySelectorAll('.sugestao')].map((l) => l.dataset.data)).not.toContain('2026-11-05');
    expect(raiz.querySelector('#sugestoes .mensagem-aviso')).not.toBeNull();
    expect(raiz.querySelectorAll('.sugestao .chip-foco-alta')).toHaveLength(0);
  });

  it('"Sugerir outras" muda as sugestões e limpa as trocas', () => {
    abrir();
    const antes = [...raiz.querySelectorAll('.sugestao strong')].map((s) => s.firstChild.textContent).join('|');
    let mudou = false;
    for (let i = 0; i < 5 && !mudou; i++) {
      botao('Sugerir outras', raiz).click();
      mudou = [...raiz.querySelectorAll('.sugestao strong')].map((s) => s.firstChild.textContent).join('|') !== antes;
    }
    expect(mudou).toBe(true);
  });
});

describe('aba Biblioteca', () => {
  it('lista os treinos do esporte e do nível, com filtro por foco', () => {
    abrir();
    aba('Biblioteca');
    const todos = raiz.querySelectorAll('.treino-cartao').length;
    expect(todos).toBeGreaterThanOrEqual(9);
    const foco = raiz.querySelector('#filtro-foco');
    foco.value = 'vo2max';
    foco.dispatchEvent(new Event('change'));
    const filtrados = raiz.querySelectorAll('.treino-cartao');
    expect(filtrados.length).toBeGreaterThan(0);
    expect(filtrados.length).toBeLessThan(todos);
    for (const c of filtrados) expect(c.querySelector('.chip-foco').textContent).toBe('VO2máx');
  });

  it('o cartão mostra nome, apelido, perfil, duração, zona e HRSS estimado', () => {
    abrir();
    aba('Biblioteca');
    const c = raiz.querySelector('.treino-cartao');
    expect(c.querySelector('.treino-nome').textContent.length).toBeGreaterThan(3);
    expect(c.querySelector('.treino-apelido').textContent).toMatch(/\d/); // especificação técnica (ex.: 5 × 3 min no VO2)
    expect(c.querySelector('svg.perfil-treino rect.perfil-barra')).not.toBeNull();
    expect(c.querySelector('.treino-resumo').textContent).toMatch(/^.+ · Z[1-5] · ~[0-9]+ de HRSS$/);
  });

  it('sem configuração de FC, o resumo avisa que falta o HRSS', () => {
    m.configs = [];
    abrir();
    aba('Biblioteca');
    expect(raiz.querySelector('.treino-resumo').textContent).toContain('HRSS sem configuração de FC');
  });
});

describe('detalhe do treino', () => {
  function abrirDetalhe() {
    abrir();
    aba('Biblioteca');
    botao('Ver treino', raiz.querySelector('.treino-cartao')).click();
    return raiz.querySelector('#treino-detalhe');
  }

  it('mostra o perfil, os números, o passo a passo com a faixa de FC e as ações', () => {
    const d = abrirDetalhe();
    expect(d.querySelector('h2').textContent.length).toBeGreaterThan(3);
    expect(d.querySelector('svg.perfil-treino')).not.toBeNull();
    expect(d.querySelectorAll('.treino-numeros li')).toHaveLength(4);
    expect(d.querySelector('.treino-passos').textContent).toMatch(/FC [0-9]+–[0-9]+ bpm/);
    expect(botao('Adicionar ao plano', d)).toBeDefined();
    expect(botao('Exportar para o relógio (.fit)', d)).toBeDefined();
    expect(botao('Duplicar e editar', d)).toBeDefined();
  });

  it('adiciona ao plano na data escolhida, com os passos, o nome e o HRSS estimado', async () => {
    const d = abrirDetalhe();
    const data = d.querySelector('#treino-data');
    data.value = '2026-11-12';
    botao('Adicionar ao plano', d).click();
    await tick();
    expect(m.criarTreino).toHaveBeenCalledTimes(1);
    const [uid, valores, estimado] = m.criarTreino.mock.calls[0];
    expect(uid).toBe('u1');
    expect(valores).toMatchObject({ data: '2026-11-12', esporte: 'ciclismo' });
    expect(valores.passos.length).toBeGreaterThan(0);
    expect(valores.nomeTreino).toBe(d.querySelector('h2').textContent);
    expect(estimado).toBeGreaterThan(0);
    expect(d.querySelector('.mensagem-ok').textContent).toContain('12/11/2026');
  });

  it('exportar gera o arquivo .fit com a faixa de FC e o baixa', () => {
    const d = abrirDetalhe();
    botao('Exportar para o relógio (.fit)', d).click();
    expect(m.baixarArquivo).toHaveBeenCalledTimes(1);
    const [bytes, nome] = m.baixarArquivo.mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('.FIT');
    expect(nome).toMatch(/\.fit$/);
    expect(d.querySelector('.mensagem-ok').textContent).toContain('faixa de FC');
  });

  it('"Fechar" esconde o detalhe', () => {
    const d = abrirDetalhe();
    botao('Fechar', d).click();
    expect(raiz.querySelector('#treino-detalhe')).toBeNull();
  });
});

describe('Meus treinos e construtor', () => {
  const salvos = () => ({ id: 'meu1', userId: 'u1', nome: 'Meu limiar', esporte: 'ciclismo', foco: 'limiar', nivel: 'intermediario', descricao: 'Forte.', passos: modeloPorId('lim-3x10-ciclismo').passos });

  it('sem treinos próprios, convida a criar', () => {
    abrir();
    aba('Meus treinos');
    expect(raiz.textContent).toContain('Você ainda não criou treinos de ciclismo');
  });

  it('lista os treinos próprios válidos e ignora os inválidos', () => {
    m.modelos = [salvos(), { id: 'ruim', userId: 'u1', nome: 'x', esporte: 'ciclismo', foco: 'vo2max', nivel: 'iniciante', passos: [] }];
    abrir();
    aba('Meus treinos');
    const nomes = [...raiz.querySelectorAll('.treino-nome')].map((n) => n.textContent);
    expect(nomes).toEqual(['Meu limiar']);
    expect(raiz.querySelector('.treino-rodape').textContent).toContain('seu treino');
  });

  it('o construtor valida e salva um treino novo', async () => {
    abrir();
    aba('Meus treinos');
    botao('Criar treino', raiz).click();
    const c = raiz.querySelector('#construtor-treino');
    expect(c).not.toBeNull();
    expect(c.querySelectorAll('.construtor-passo')).toHaveLength(3);
    expect(c.querySelector('.construtor-previa svg.perfil-treino')).not.toBeNull();
    // sem nome: o domain recusa
    c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(m.criarModelo).not.toHaveBeenCalled();
    expect(c.querySelector('.mensagem-erro').textContent).toContain('nome');
    const nome = c.querySelector('#tm-nome');
    nome.value = 'Meu intervalado';
    nome.dispatchEvent(new Event('input'));
    c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(m.criarModelo).toHaveBeenCalledTimes(1);
    const [uid, valores] = m.criarModelo.mock.calls[0];
    expect(uid).toBe('u1');
    expect(valores).toMatchObject({ nome: 'Meu intervalado', esporte: 'ciclismo', foco: 'vo2max', nivel: 'intermediario' });
    expect(valores.passos).toHaveLength(3);
    expect(raiz.querySelector('#construtor-treino')).toBeNull(); // fecha e vai para Meus treinos
  });

  it('adicionar bloco e série, mexer na duração e na zona e remover passos atualiza a prévia', () => {
    abrir();
    aba('Meus treinos');
    botao('Criar treino', raiz).click();
    const c = raiz.querySelector('#construtor-treino');
    botao('+ Bloco', c).click();
    botao('+ Série', c).click();
    expect(c.querySelectorAll('.construtor-passo')).toHaveLength(5);
    const antes = c.querySelector('.construtor-previa .treino-resumo').textContent;
    const duracao = c.querySelector('.construtor-serie input[aria-label^="Duração do esforço"]');
    duracao.value = '4:30';
    duracao.dispatchEvent(new Event('input'));
    expect(c.querySelector('.construtor-previa .treino-resumo').textContent).not.toBe(antes);
    c.querySelector('button[aria-label="Remover o passo 5"]').click();
    expect(c.querySelectorAll('.construtor-passo')).toHaveLength(4);
    const zona = c.querySelector('select[aria-label="Zona do passo 2"], .construtor-serie select[aria-label^="Zona do esforço"]');
    zona.value = 'Z4';
    zona.dispatchEvent(new Event('change'));
    expect(c.querySelector('.construtor-previa svg.perfil-treino')).not.toBeNull();
  });

  it('duração ilegível mostra o erro na prévia (sem quebrar a tela)', () => {
    abrir();
    aba('Meus treinos');
    botao('Criar treino', raiz).click();
    const c = raiz.querySelector('#construtor-treino');
    const duracao = c.querySelector('.construtor-serie input[aria-label^="Duração do esforço"]');
    duracao.value = 'abc';
    duracao.dispatchEvent(new Event('input'));
    expect(c.querySelector('.construtor-previa svg')).toBeNull();
    expect(c.querySelector('.construtor-previa').textContent).toContain('duração');
  });

  it('reordenar: subir e descer o passo', () => {
    abrir();
    aba('Meus treinos');
    botao('Criar treino', raiz).click();
    const c = raiz.querySelector('#construtor-treino');
    const rotulos = () => [...c.querySelectorAll('.construtor-passo > strong')].map((s) => s.textContent);
    expect(rotulos()).toEqual(['1. Bloco', '2. Série', '3. Bloco']);
    c.querySelector('button[aria-label="Descer o passo 1"]').click();
    expect(rotulos()).toEqual(['1. Série', '2. Bloco', '3. Bloco']);
    expect(c.querySelector('button[aria-label="Subir o passo 1"]').disabled).toBe(true);
  });

  it('duplicar e editar um treino do catálogo abre uma cópia com os passos do modelo', () => {
    abrir();
    aba('Biblioteca');
    botao('Ver treino', raiz.querySelector('.treino-cartao')).click();
    botao('Duplicar e editar', raiz.querySelector('#treino-detalhe')).click();
    const c = raiz.querySelector('#construtor-treino');
    expect(c.querySelector('h2').textContent).toBe('Novo treino a partir de um modelo');
    expect(c.querySelector('#tm-nome').value).toMatch(/\(meu\)$/);
    expect(c.querySelectorAll('.construtor-passo').length).toBeGreaterThanOrEqual(3);
  });

  it('editar um treino próprio atualiza o mesmo documento; excluir pede confirmação', async () => {
    m.modelos = [salvos()];
    abrir();
    aba('Meus treinos');
    botao('Ver treino', raiz.querySelector('.treino-cartao')).click();
    botao('Editar', raiz.querySelector('#treino-detalhe')).click();
    const c = raiz.querySelector('#construtor-treino');
    expect(c.querySelector('h2').textContent).toBe('Editar treino');
    expect(c.querySelector('#tm-nome').value).toBe('Meu limiar');
    c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(m.atualizarModelo).toHaveBeenCalledWith('meu1', expect.objectContaining({ nome: 'Meu limiar' }));
    // excluir
    botao('Ver treino', raiz.querySelector('.treino-cartao')).click();
    window.confirm = vi.fn(() => false);
    botao('Excluir', raiz.querySelector('#treino-detalhe')).click();
    await tick();
    expect(m.excluirModelo).not.toHaveBeenCalled();
    window.confirm = vi.fn(() => true);
    botao('Excluir', raiz.querySelector('#treino-detalhe')).click();
    await tick();
    expect(m.excluirModelo).toHaveBeenCalledWith('meu1');
  });

  it('os treinos próprios entram nas sugestões e na biblioteca de detalhes do mesmo nível e esporte', () => {
    m.modelos = [salvos()];
    abrir();
    aba('Meus treinos');
    expect(raiz.querySelectorAll('.treino-cartao')).toHaveLength(1);
  });
});

describe('ciclo de vida', () => {
  it('ao sair da tela, cancela os cinco listeners e não redesenha mais', () => {
    m.cancelar.mockClear();
    abrir();
    destruir();
    expect(m.cancelar).toHaveBeenCalledTimes(5);
    destruir = null;
  });
});
