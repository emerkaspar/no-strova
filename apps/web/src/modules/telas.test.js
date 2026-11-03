// @vitest-environment jsdom
// Testes de fumaça das telas da Fase 2: renderizam com dados simulados e disparam as ações principais.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fn = vi.hoisted(() => ({
  processarArquivoAtividade: vi.fn(),
  criarAtividadeManual: vi.fn(),
  excluirAtividade: vi.fn(),
  obterUrlArquivo: vi.fn(),
  recalcularHistorico: vi.fn(),
  enviarArquivoAtividade: vi.fn(),
  salvarConfig: vi.fn(),
  excluirConfig: vi.fn(),
  atualizarDadosPessoais: vi.fn(),
  atividades: [],
  configs: [],
  calibracao: { chaves: {} },
  preferencias: null,
  salvarPreferencias: vi.fn(),
  reconstruirCalibracao: vi.fn(),
  atividade: null,
  serie: null,
}));

vi.mock('../core/functions.js', () => ({
  processarArquivoAtividade: fn.processarArquivoAtividade,
  criarAtividadeManual: fn.criarAtividadeManual,
  excluirAtividade: fn.excluirAtividade,
  obterUrlArquivo: fn.obterUrlArquivo,
  recalcularHistorico: fn.recalcularHistorico,
  reconstruirCalibracao: fn.reconstruirCalibracao,
}));
vi.mock('../infrastructure/calibracaoRepo.js', () => ({
  observarCalibracao: (_uid, aoDados) => {
    aoDados(fn.calibracao);
    return () => {};
  },
  observarPreferencias: (_uid, aoDados) => {
    aoDados(fn.preferencias);
    return () => {};
  },
  salvarPreferencias: fn.salvarPreferencias,
}));
vi.mock('../core/storage.js', () => ({ enviarArquivoAtividade: fn.enviarArquivoAtividade }));
vi.mock('../infrastructure/atividadesRepo.js', () => ({
  observarAtividades: (_uid, aoDados) => {
    aoDados(fn.atividades);
    return () => {};
  },
  lerAtividade: async () => fn.atividade,
  lerSerieFc: async () => fn.serie,
}));
vi.mock('../infrastructure/configsRepo.js', () => ({
  observarConfigs: (_uid, aoDados) => {
    aoDados(fn.configs);
    return () => {};
  },
  salvarConfig: fn.salvarConfig,
  excluirConfig: fn.excluirConfig,
}));
vi.mock('../infrastructure/perfilRepo.js', () => ({ atualizarDadosPessoais: fn.atualizarDadosPessoais }));

const { render: renderLista } = await import('./atividades/lista.view.js');
const { render: renderDetalhe } = await import('./atividades/detalhe.view.js');
const { render: renderConfig } = await import('./configuracao/configuracao.view.js');
const { painelManual } = await import('./atividades/manual.js');
const { painelImportar } = await import('./atividades/importar.js');
const { estadoAtividades, EVENTO_IMPORTAR } = await import('./atividades/state.js');

const sessao = { uid: 'u1', perfil: { nome: 'Fulano', dataNascimento: '1982-04-30' }, admin: false };
const config = { id: 'u1_20260101', userId: 'u1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 72.5, alturaCm: 178 };
const tick = () => new Promise((r) => setTimeout(r, 0));

function digitar(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function enviarForm(raiz) {
  raiz.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

let raiz;
beforeEach(() => {
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz');
  vi.restoreAllMocks();
  Object.values(fn).forEach((f) => typeof f?.mockReset === "function" && f.mockReset());
  fn.atividades = [];
  fn.configs = [];
  fn.atividade = null;
  fn.serie = null;
  Object.assign(estadoAtividades, { busca: '', esporte: '', ordem: { campo: 'data', direcao: 'desc' }, abrirImportar: false });
  window.scrollTo = () => {};
});

describe('lista de atividades', () => {
  const atividades = [
    { id: 'a1', data: '2026-11-01', esporte: 'ciclismo', duracaoS: 3600, distanciaM: 30000, fcMedia: 140, hrss: 55.5, hrssOrigem: 'fc', origem: 'arquivo', alertas: [] },
    { id: 'a2', data: '2026-11-03', esporte: 'corrida', duracaoS: 1800, distanciaM: 5000, fcMedia: 160, hrss: 40, hrssOrigem: 'zona', origem: 'manual', alertas: [] },
    { id: 'a3', data: '2026-10-20', esporte: 'ciclismo', duracaoS: 7200, distanciaM: null, fcMedia: null, hrss: null, hrssOrigem: null, origem: 'arquivo', alertas: ['semConfigFc'] },
  ];

  it('mostra as atividades e avisa quando falta configuração de FC', () => {
    fn.atividades = atividades;
    renderLista(raiz, sessao);
    expect(raiz.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(raiz.textContent).toContain('03/11/2026');
    expect(raiz.textContent).toContain('3 de 3 atividades');
    expect(raiz.textContent).toContain('Cadastre a sua configuração de FC');
    expect(raiz.querySelector('a[href="#/atividades/a1"]')).not.toBeNull();
    expect(raiz.textContent).toContain('sem HRSS');
  });

  it('não mostra o aviso quando há configuração e ordena por data (mais recente primeiro)', () => {
    fn.atividades = atividades;
    fn.configs = [config];
    renderLista(raiz, sessao);
    expect(raiz.textContent).not.toContain('Cadastre a sua configuração de FC');
    const datas = [...raiz.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent);
    expect(datas).toEqual(['03/11/2026', '01/11/2026', '20/10/2026']);
  });

  it('ordena ao clicar no cabeçalho, deixando vazios por último', () => {
    fn.atividades = atividades;
    renderLista(raiz, sessao);
    const botaoHrss = [...raiz.querySelectorAll('th button')].find((b) => b.textContent.startsWith('HRSS'));
    botaoHrss.click(); // asc
    let ids = [...raiz.querySelectorAll('tbody a')].map((a) => a.getAttribute('href'));
    expect(ids).toEqual(['#/atividades/a2', '#/atividades/a1', '#/atividades/a3']);
    [...raiz.querySelectorAll('th button')].find((b) => b.textContent.startsWith('HRSS')).click(); // desc
    ids = [...raiz.querySelectorAll('tbody a')].map((a) => a.getAttribute('href'));
    expect(ids).toEqual(['#/atividades/a1', '#/atividades/a2', '#/atividades/a3']);
  });

  it('filtra pela busca e pelo esporte', () => {
    fn.atividades = atividades;
    renderLista(raiz, sessao);
    digitar(raiz.querySelector('input[type=search]'), 'corrida');
    expect(raiz.querySelectorAll('tbody tr')).toHaveLength(1);
    digitar(raiz.querySelector('input[type=search]'), '');
    digitar(raiz.querySelector('#filtro-esporte'), 'ciclismo');
    expect(raiz.querySelectorAll('tbody tr')).toHaveLength(2);
    digitar(raiz.querySelector('input[type=search]'), 'nada-disso');
    expect(raiz.textContent).toContain('Nenhum resultado');
  });

  it('mostra o estado vazio e abre os painéis de importação e cadastro manual', () => {
    renderLista(raiz, sessao);
    expect(raiz.textContent).toContain('Nenhuma atividade ainda');
    const [importar, manual] = [...raiz.querySelectorAll('.linha-botoes button')];
    importar.click();
    expect(raiz.querySelector('input[type=file]')).not.toBeNull();
    importar.click();
    expect(raiz.querySelector('input[type=file]')).toBeNull();
    manual.click();
    expect(raiz.querySelector('#man-duracao')).not.toBeNull();
  });
});

describe('pedido de importação vindo do cabeçalho', () => {
  it('ao abrir a lista com o pedido pendente, já mostra o painel de importação e limpa o pedido', () => {
    estadoAtividades.abrirImportar = true;
    const destruir = renderLista(raiz, sessao);
    expect(raiz.querySelector('input[type=file]')).not.toBeNull();
    expect(estadoAtividades.abrirImportar).toBe(false);
    destruir(); // só existe uma lista aberta por vez
  });

  it('com a lista já aberta, o evento do cabeçalho abre o painel e remover a tela cancela o ouvinte', () => {
    const destruir = renderLista(raiz, sessao);
    expect(raiz.querySelector('input[type=file]')).toBeNull();
    window.dispatchEvent(new CustomEvent(EVENTO_IMPORTAR));
    expect(raiz.querySelector('input[type=file]')).not.toBeNull();
    destruir();
    raiz.replaceChildren();
    window.dispatchEvent(new CustomEvent(EVENTO_IMPORTAR));
    expect(raiz.querySelector('input[type=file]')).toBeNull(); // ouvinte removido
  });
});

describe('detalhe da atividade', () => {
  const base = {
    userId: 'u1', data: '2026-11-01', esporte: 'ciclismo', origem: 'arquivo', extensao: 'fit', arquivoPath: 'atividades/u1/a1/original.fit',
    duracaoS: 7475, tempoMovimentoS: 7273, distanciaM: 42221, altimetriaM: 655, fcMedia: 153, fcMax: 186,
    hrss: 137.34, hrssOrigem: 'fc', calorias: 1497, caloriasOrigem: 'estimada', alertas: ['hrssAnormal'],
  };

  it('mostra os indicadores, o aviso, o rótulo "estimadas" e o gráfico de FC', async () => {
    fn.atividade = base;
    fn.serie = { passoS: 5, t: [0, 5, 10, 15, 20], fc: [120, 130, 150, 160, 155] };
    renderDetalhe(raiz, sessao, { id: 'a1' });
    await tick();
    const texto = raiz.textContent;
    expect(texto).toContain('Ciclismo · 01/11/2026');
    expect(texto).toContain('137,3');
    expect(texto).toContain('calculado pela FC média');
    expect(texto).toContain('2h 04min');
    expect(texto).toContain('42,2 km');
    expect(texto).toContain('estimadas');
    expect(texto).toContain('acima de 225');
    expect(raiz.querySelector('svg polyline')).not.toBeNull();
  });

  it('atividade de outro usuário ou inexistente mostra "não encontrada"', async () => {
    fn.atividade = { ...base, userId: 'outro' };
    renderDetalhe(raiz, sessao, { id: 'a1' });
    await tick();
    expect(raiz.textContent).toContain('Atividade não encontrada');
  });

  it('exclui após confirmar e volta para a lista', async () => {
    fn.atividade = base;
    fn.excluirAtividade.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetalhe(raiz, sessao, { id: 'a1' });
    await tick();
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Excluir atividade').click();
    await tick();
    expect(fn.excluirAtividade).toHaveBeenCalledWith({ atividadeId: 'a1' });
    expect(window.location.hash).toBe('#/atividades');
  });

  it('não exclui se o usuário cancelar', async () => {
    fn.atividade = base;
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderDetalhe(raiz, sessao, { id: 'a1' });
    await tick();
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Excluir atividade').click();
    await tick();
    expect(fn.excluirAtividade).not.toHaveBeenCalled();
  });

  it('atividade manual não oferece download do arquivo', async () => {
    fn.atividade = { ...base, origem: 'manual', arquivoPath: null, extensao: null };
    renderDetalhe(raiz, sessao, { id: 'a1' });
    await tick();
    expect([...raiz.querySelectorAll('button')].some((b) => b.textContent.includes('Baixar'))).toBe(false);
    expect(raiz.textContent).toContain('Registrada manualmente');
  });
});

describe('cadastro manual', () => {
  it('envia os valores digitados para a callable', async () => {
    fn.criarAtividadeManual.mockResolvedValue({ atividadeId: 'x', hrss: 70.2, alertas: [] });
    const painel = painelManual();
    raiz.append(painel);
    digitar(painel.querySelector('#man-duracao'), '90');
    digitar(painel.querySelector('#man-zona'), 'Z3');
    digitar(painel.querySelector('#man-distancia'), '40,5');
    enviarForm(painel);
    await tick();
    expect(fn.criarAtividadeManual).toHaveBeenCalledTimes(1);
    expect(fn.criarAtividadeManual.mock.calls[0][0]).toMatchObject({ esporte: 'ciclismo', duracaoMin: '90', zona: 'Z3', distanciaKm: '40,5' });
    expect(painel.textContent).toContain('Atividade registrada');
    expect(painel.textContent).toContain('HRSS 70,2');
  });

  it('mostra o erro devolvido pelo servidor', async () => {
    fn.criarAtividadeManual.mockRejectedValue(new Error('Informe a FC média, a zona predominante ou o estresse (HRSS) da atividade.'));
    const painel = painelManual();
    raiz.append(painel);
    enviarForm(painel);
    await tick();
    expect(painel.querySelector('[role=alert]').textContent).toContain('Informe a FC média');
  });
});

describe('importação de arquivos', () => {
  function escolher(painel, ...arquivos) {
    const entrada = painel.querySelector('input[type=file]');
    Object.defineProperty(entrada, 'files', { value: arquivos, configurable: true });
    entrada.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('rejeita formato não aceito sem enviar nada', async () => {
    const painel = painelImportar({ uid: 'u1' });
    escolher(painel, new File(['x'], 'foto.png'));
    await tick();
    expect(painel.textContent).toContain('Formato não aceito');
    expect(fn.enviarArquivoAtividade).not.toHaveBeenCalled();
  });

  it('envia ao Storage no caminho do usuário e processa', async () => {
    fn.enviarArquivoAtividade.mockResolvedValue();
    fn.processarArquivoAtividade.mockResolvedValue({ atividadeId: 'x', hrss: 88.8, alertas: ['fcAcimaDaMaxima'] });
    const painel = painelImportar({ uid: 'u1' });
    escolher(painel, new File(['conteudo'], 'Pedal.FIT'));
    await tick();
    await tick();
    const [uid, id, extensao] = fn.enviarArquivoAtividade.mock.calls[0];
    expect([uid, extensao]).toEqual(['u1', 'fit']);
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,40}$/);
    expect(fn.processarArquivoAtividade).toHaveBeenCalledWith({ atividadeId: id, extensao: 'fit', esporte: undefined, zona: undefined });
    expect(painel.textContent).toContain('Importado · HRSS 88,8');
    expect(painel.textContent).toContain('FC máxima da atividade passou');
  });

  it('arquivo sem FC pede a zona e reprocessa sem novo envio', async () => {
    fn.enviarArquivoAtividade.mockResolvedValue();
    const semFc = Object.assign(new Error('O arquivo não tem frequência cardíaca. Informe a zona predominante.'), { codigo: 'sem-fc' });
    fn.processarArquivoAtividade.mockRejectedValueOnce(semFc).mockResolvedValueOnce({ atividadeId: 'x', hrss: 36.5, alertas: [] });
    const painel = painelImportar({ uid: 'u1' });
    escolher(painel, new File(['conteudo'], 'corrida.gpx'));
    await tick();
    await tick();
    expect(painel.textContent).toContain('não tem frequência cardíaca');
    const botao = [...painel.querySelectorAll('button')].find((b) => b.textContent === 'Estimar o estresse');
    digitar(painel.querySelector('select[id^=zona-]'), 'Z4');
    botao.click();
    await tick();
    await tick();
    expect(fn.enviarArquivoAtividade).toHaveBeenCalledTimes(1);
    expect(fn.processarArquivoAtividade).toHaveBeenCalledTimes(2);
    expect(fn.processarArquivoAtividade.mock.calls[1][0]).toMatchObject({ extensao: 'gpx', zona: 'Z4' });
    expect(painel.textContent).toContain('Importado · HRSS 36,5');
  });

  it('mostra o motivo quando o servidor rejeita (duplicada)', async () => {
    fn.enviarArquivoAtividade.mockResolvedValue();
    fn.processarArquivoAtividade.mockRejectedValue(new Error('Esta atividade já foi importada (mesmo arquivo ou mesmo início e duração).'));
    const painel = painelImportar({ uid: 'u1' });
    escolher(painel, new File(['conteudo'], 'repetida.tcx'));
    await tick();
    await tick();
    expect(painel.textContent).toContain('já foi importada');
  });
});

describe('configuração do atleta', () => {
  it('lista as vigências e marca a mais recente como atual', () => {
    fn.configs = [config, { ...config, id: 'u1_20250101', vigenteDesde: '2025-01-01', fcMax: 188 }];
    renderConfig(raiz, sessao);
    expect(raiz.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(raiz.textContent).toContain('01/01/2026');
    expect(raiz.textContent).toContain('atual');
    expect(raiz.querySelector('#cfg-max').value).toBe('190'); // nova vigência parte da mais recente
  });

  it('rejeita valores inválidos sem gravar e mostra os erros', async () => {
    renderConfig(raiz, sessao);
    const formConfig = [...raiz.querySelectorAll('form')][1];
    digitar(raiz.querySelector('#cfg-max'), '190');
    digitar(raiz.querySelector('#cfg-repouso'), '200');
    formConfig.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(fn.salvarConfig).not.toHaveBeenCalled();
    expect(raiz.textContent).toContain('A FC de repouso deve ser menor que a FC máxima');
  });

  it('grava uma configuração válida com números normalizados', async () => {
    fn.salvarConfig.mockResolvedValue();
    renderConfig(raiz, sessao);
    const formConfig = [...raiz.querySelectorAll('form')][1];
    digitar(raiz.querySelector('#cfg-desde'), '2026-03-01');
    digitar(raiz.querySelector('#cfg-max'), '190');
    digitar(raiz.querySelector('#cfg-repouso'), '50');
    digitar(raiz.querySelector('#cfg-lthr'), '170');
    digitar(raiz.querySelector('#cfg-sexo'), 'feminino');
    digitar(raiz.querySelector('#cfg-peso'), '61,5');
    digitar(raiz.querySelector('#cfg-altura'), '165');
    formConfig.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(fn.salvarConfig).toHaveBeenCalledWith('u1', {
      vigenteDesde: '2026-03-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'feminino', pesoKg: 61.5, alturaCm: 165,
    });
    expect(raiz.textContent).toContain('Configuração salva');
  });

  it('editar uma vigência preenche o formulário; excluir pede confirmação', async () => {
    fn.configs = [config];
    fn.excluirConfig.mockResolvedValue();
    renderConfig(raiz, sessao);
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Editar').click();
    expect(raiz.textContent).toContain('Editando a vigência de 01/01/2026');
    expect(raiz.querySelector('#cfg-lthr').value).toBe('170');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Excluir').click();
    await tick();
    expect(fn.excluirConfig).toHaveBeenCalledWith('u1_20260101');
  });

  it('recalcula o histórico só depois de confirmar e mostra o resultado', async () => {
    fn.recalcularHistorico.mockResolvedValue({ total: 9, atualizadas: 1 });
    renderConfig(raiz, sessao);
    const botao = [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Recalcular histórico');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    botao.click();
    await tick();
    expect(fn.recalcularHistorico).not.toHaveBeenCalled();
    botao.click();
    await tick();
    expect(fn.recalcularHistorico).toHaveBeenCalledTimes(1);
    expect(raiz.textContent).toContain('1 de 9 atividades atualizada');
  });

  it('salva nome e data de nascimento validados', async () => {
    fn.atualizarDadosPessoais.mockResolvedValue();
    renderConfig(raiz, sessao);
    const formDados = raiz.querySelector('form');
    digitar(raiz.querySelector('#dp-nome'), '  Maria   Souza ');
    formDados.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(fn.atualizarDadosPessoais).toHaveBeenCalledWith('u1', { nome: 'Maria Souza', dataNascimento: '1982-04-30' });
  });
});

describe('vigência da configuração e atividades sem HRSS', () => {
  const semConfig = (id, data) => ({ id, data, esporte: 'ciclismo', duracaoS: 3000, distanciaM: 20000, fcMedia: 149, hrss: null, hrssOrigem: null, origem: 'arquivo', alertas: ['semConfigFc'] });
  const comHrss = { id: 'ok1', data: '2026-11-03', esporte: 'ciclismo', duracaoS: 3000, distanciaM: 17100, fcMedia: 146, hrss: 50.6, hrssOrigem: 'fc', origem: 'arquivo', alertas: [] };

  it('lista: avisa que a configuração mais antiga vale depois das atividades sem HRSS', () => {
    fn.atividades = [comHrss, semConfig('a19', '2026-10-19'), semConfig('a15', '2026-10-15')];
    fn.configs = [{ ...config, id: 'c', vigenteDesde: '2026-11-03' }];
    renderLista(raiz, sessao);
    const aviso = raiz.querySelector('.card > .mensagem');
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain('2 atividades estão sem HRSS');
    expect(aviso.textContent).toContain('vale desde 03/11/2026');
    expect(aviso.textContent).toContain('Recalcular histórico');
    expect(aviso.querySelector('a').getAttribute('href')).toBe('#/configuracao');
  });

  it('lista: se a configuração já cobre as datas, manda só recalcular', () => {
    fn.atividades = [semConfig('a15', '2026-10-15')];
    fn.configs = [{ ...config, id: 'c', vigenteDesde: '2026-01-01' }];
    renderLista(raiz, sessao);
    const aviso = raiz.querySelector('.card > .mensagem');
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain('1 atividade está sem HRSS');
    expect(aviso.textContent).toContain('já existe configuração vigente');
  });

  it('lista: sem atividades sem HRSS, não mostra aviso', () => {
    fn.atividades = [comHrss];
    fn.configs = [{ ...config, id: 'c', vigenteDesde: '2026-11-03' }];
    renderLista(raiz, sessao);
    expect(raiz.querySelector('.card > .mensagem').hidden).toBe(true);
  });

  it('configuração: a primeira vigência sugere a data da atividade mais antiga, não hoje', () => {
    fn.atividades = [semConfig('a1', '2026-10-19'), semConfig('a2', '2026-10-15'), comHrss];
    renderConfig(raiz, sessao);
    expect(raiz.querySelector('#cfg-desde').value).toBe('2026-10-15');
    expect(raiz.textContent).toContain('use uma data anterior à sua atividade mais antiga');
  });

  it('configuração: avisa antes de salvar uma vigência que deixa atividades sem HRSS', async () => {
    fn.atividades = [semConfig('a1', '2026-10-19'), semConfig('a2', '2026-10-15')];
    fn.salvarConfig.mockResolvedValue();
    renderConfig(raiz, sessao);
    const formConfig = [...raiz.querySelectorAll('form')][1];
    const preencher = () => {
      digitar(raiz.querySelector('#cfg-desde'), '2026-11-03');
      digitar(raiz.querySelector('#cfg-max'), '190');
      digitar(raiz.querySelector('#cfg-repouso'), '50');
      digitar(raiz.querySelector('#cfg-lthr'), '170');
      digitar(raiz.querySelector('#cfg-sexo'), 'masculino');
      digitar(raiz.querySelector('#cfg-peso'), '75');
      digitar(raiz.querySelector('#cfg-altura'), '178');
    };
    const enviar = async () => {
      formConfig.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await tick();
    };
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    preencher();
    await enviar(); // recusa
    expect(confirmar.mock.calls[0][0]).toContain('2 atividades são anteriores a 03/11/2026');
    expect(confirmar.mock.calls[0][0]).toContain('ficarão sem HRSS');
    expect(fn.salvarConfig).not.toHaveBeenCalled();

    await enviar(); // aceita
    expect(fn.salvarConfig).toHaveBeenCalledTimes(1);
  });

  it('configuração: não avisa quando a vigência começa antes das atividades', async () => {
    fn.atividades = [semConfig('a1', '2026-10-19')];
    fn.salvarConfig.mockResolvedValue();
    renderConfig(raiz, sessao);
    digitar(raiz.querySelector('#cfg-desde'), '2026-10-01');
    digitar(raiz.querySelector('#cfg-max'), '190');
    digitar(raiz.querySelector('#cfg-repouso'), '50');
    digitar(raiz.querySelector('#cfg-lthr'), '170');
    digitar(raiz.querySelector('#cfg-sexo'), 'masculino');
    digitar(raiz.querySelector('#cfg-peso'), '75');
    digitar(raiz.querySelector('#cfg-altura'), '178');
    const confirmar = vi.spyOn(window, 'confirm');
    [...raiz.querySelectorAll('form')][1].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(confirmar).not.toHaveBeenCalled();
    expect(fn.salvarConfig).toHaveBeenCalledTimes(1);
  });

  it('recálculo: informa quantas atividades continuam sem HRSS e o que fazer', async () => {
    fn.recalcularHistorico.mockResolvedValue({ total: 3, atualizadas: 1, semConfig: 2 });
    renderConfig(raiz, sessao);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Recalcular histórico').click();
    await tick();
    const texto = raiz.textContent;
    expect(texto).toContain('1 de 3 atividades atualizada');
    expect(texto).toContain('2 continuam sem HRSS');
    expect(texto).toContain('Vigente desde');
  });
});
