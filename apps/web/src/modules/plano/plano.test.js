// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  hoje: '2026-11-04', // quarta-feira
  dias: [],
  treinos: [],
  atividades: [],
  configs: [],
  metas: [],
  metasCondicionamento: [],
  definirMetaCondicionamento: vi.fn(),
  excluirMetaCondicionamento: vi.fn(),
  calibracao: { chaves: {} },
  preferencias: null,
  criarTreino: vi.fn(),
  atualizarTreino: vi.fn(),
  moverTreino: vi.fn(),
  vincularTreino: vi.fn(),
  desvincularTreino: vi.fn(),
  pularTreino: vi.fn(),
  excluirTreino: vi.fn(),
  definirMeta: vi.fn(),
  excluirMeta: vi.fn(),
}));

const assinar = (chave) => (...args) => {
  const aoDados = args.find((a) => typeof a === 'function');
  aoDados(m[chave]);
  return () => {};
};
vi.mock('../../infrastructure/estresseRepo.js', () => ({ observarEstresseDiario: assinar('dias') }));
vi.mock('../../infrastructure/atividadesRepo.js', () => ({ observarAtividadesDesde: assinar('atividades') }));
vi.mock('../../infrastructure/configsRepo.js', () => ({ observarConfigs: assinar('configs') }));
vi.mock('../../infrastructure/calibracaoRepo.js', () => ({ observarCalibracao: assinar('calibracao'), observarPreferencias: assinar('preferencias') }));
vi.mock('../../core/functions.js', () => ({ reconstruirCalibracao: vi.fn().mockResolvedValue({}) }));
vi.mock('../../infrastructure/planoRepo.js', () => ({
  observarTreinos: assinar('treinos'),
  observarMetas: assinar('metas'),
  observarMetasCondicionamento: assinar('metasCondicionamento'),
  definirMetaCondicionamento: m.definirMetaCondicionamento,
  excluirMetaCondicionamento: m.excluirMetaCondicionamento,
  criarTreino: m.criarTreino,
  atualizarTreino: m.atualizarTreino,
  moverTreino: m.moverTreino,
  vincularTreino: m.vincularTreino,
  desvincularTreino: m.desvincularTreino,
  pularTreino: m.pularTreino,
  excluirTreino: m.excluirTreino,
  definirMeta: m.definirMeta,
  excluirMeta: m.excluirMeta,
}));
vi.mock('../../utils/formatters.js', async (importarOriginal) => ({ ...(await importarOriginal()), hojeIso: () => m.hoje }));

const { render } = await import('./plano.view.js');
const { textoDaAvaliacao } = await import('./meta.js');
const { estadoPlano, vinculosIgnorados } = await import('./state.js');

const sessao = { uid: 'u1' };
const config = { id: 'c1', userId: 'u1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
const tick = () => new Promise((r) => setTimeout(r, 0));
let raiz;
let destruir;

const treino = (extra) => ({ id: 't1', userId: 'u1', data: '2026-11-06', esporte: 'ciclismo', duracaoMin: 60, zona: 'Z2', status: 'planejado', estresseManual: 48, observacoes: '', atividadeId: null, ...extra });
const atividade = (extra) => ({ id: 'a1', data: '2026-11-03', esporte: 'ciclismo', distanciaM: 17100, duracaoS: 2983, hrss: 50.6, ...extra });

function digitar(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// Clica no botão de enviar do cartão (como o usuário), em vez de disparar o evento no form: um botão fora do form não envia.
const enviar = (form) => (form.closest('section') ?? form).querySelector('button[type="submit"]').click();
const botao = (texto, onde = raiz) => [...onde.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
const celula = (data) => raiz.querySelector(`[data-data="${data}"]`);
const evento = (tipo) => new Event(tipo, { bubbles: true, cancelable: true });

beforeEach(() => {
  destruir?.();
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz');
  window.scrollTo = () => {};
  m.hoje = '2026-11-04';
  m.dias = [];
  m.treinos = [];
  m.atividades = [];
  m.configs = [config];
  m.metas = [];
  m.metasCondicionamento = [];
  m.calibracao = { chaves: {} };
  m.preferencias = null;
  for (const f of [m.criarTreino, m.atualizarTreino, m.moverTreino, m.vincularTreino, m.desvincularTreino, m.pularTreino, m.excluirTreino, m.definirMeta, m.excluirMeta]) {
    f.mockReset().mockResolvedValue('novo-id');
  }
  vi.restoreAllMocks();
  Object.assign(estadoPlano, { visao: 'semana', ancora: null });
  vinculosIgnorados.clear();
});

const abrir = () => {
  destruir = render(raiz, sessao);
};

describe('calendário da semana', () => {
  it('mostra os 7 dias da semana atual, com hoje marcado e os treinos do dia', () => {
    m.treinos = [treino(), treino({ id: 't2', data: '2026-11-06', esporte: 'corrida', duracaoMin: 30, zona: 'Z4', estresseManual: 40 })];
    m.atividades = [atividade()];
    abrir();
    expect(raiz.querySelector('.plano-periodo').textContent).toBe('02/11/2026 a 08/11/2026');
    expect(raiz.querySelectorAll('.cal-semana .cal-dia')).toHaveLength(7);
    expect(celula('2026-11-04').classList.contains('cal-hoje')).toBe(true);
    const sexta = celula('2026-11-06');
    const chips = [...sexta.querySelectorAll('.chip-treino')];
    expect(chips.map((c) => c.querySelector('.chip-titulo').textContent)).toEqual(['Ciclismo 60min · Z2', 'Corrida 30min · Z4']);
    expect(chips[0].querySelector('.chip-sub').textContent).toBe('~48 · plano');
    expect(sexta.querySelector('.cal-total').textContent).toBe('Plano ~88');
    const terca = celula('2026-11-03');
    expect(terca.querySelector('.chip-atividade .chip-titulo').textContent).toBe('Ciclismo 17,1 km');
    expect(terca.querySelector('.chip-atividade').getAttribute('href')).toBe('#/atividades/a1');
    expect(terca.querySelector('.cal-total').textContent).toBe('Realizado 51');
  });

  it('avisa quando não há configuração de FC (sem ela o estresse não é estimado)', () => {
    m.configs = [];
    abrir();
    expect(raiz.textContent).toContain('Cadastre a sua configuração de FC');
    expect(raiz.querySelector('.card > .mensagem a').getAttribute('href')).toBe('#/configuracao');
  });

  it('navega entre semanas e volta para hoje', () => {
    abrir();
    botao('›').click();
    expect(raiz.querySelector('.plano-periodo').textContent).toBe('09/11/2026 a 15/11/2026');
    expect(celula('2026-11-09')).not.toBeNull();
    botao('‹').click();
    botao('‹').click();
    expect(raiz.querySelector('.plano-periodo').textContent).toBe('26/10/2026 a 01/11/2026');
    botao('Hoje').click();
    expect(raiz.querySelector('.plano-periodo').textContent).toBe('02/11/2026 a 08/11/2026');
  });

  it('visão de mês: grade de 6 semanas, contagem por dia, navegação por mês', () => {
    m.treinos = [treino(), treino({ id: 't2', data: '2026-11-06' })];
    abrir();
    botao('Mês').click();
    expect(raiz.querySelector('.plano-periodo').textContent).toBe('novembro de 2026');
    expect(raiz.querySelectorAll('.cal-mes .cal-semana-linha')).toHaveLength(6);
    expect(raiz.querySelectorAll('.cal-mes .cal-dia')).toHaveLength(42);
    expect(celula('2026-11-06').querySelector('.cal-contagem').textContent).toBe('2');
    expect(celula('2026-10-27').classList.contains('cal-fora')).toBe(true);
    botao('›').click();
    expect(raiz.querySelector('.plano-periodo').textContent).toBe('dezembro de 2026');
    expect(botao('Mês').getAttribute('aria-pressed')).toBe('true');
    expect(estadoPlano.visao).toBe('mes');
  });

  it('no mês, mais de 3 itens num dia mostram "+N"', () => {
    m.treinos = Array.from({ length: 5 }, (_, i) => treino({ id: `t${i}` }));
    abrir();
    botao('Mês').click();
    const dia = celula('2026-11-06');
    expect(dia.querySelectorAll('.chip-treino')).toHaveLength(3);
    expect(dia.querySelector('.cal-mais').textContent).toBe('+2');
  });

  it('chips de estados diferentes: feito, pulado, não realizado (passado) e planejado', () => {
    m.treinos = [
      treino({ id: 'a', data: '2026-11-06' }),
      treino({ id: 'b', data: '2026-11-03', status: 'realizado', atividadeId: 'a1' }),
      treino({ id: 'c', data: '2026-11-05', status: 'pulado' }),
      treino({ id: 'd', data: '2026-11-02' }),
    ];
    abrir();
    expect(celula('2026-11-06').querySelector('.chip-planejado')).not.toBeNull();
    expect(celula('2026-11-03').querySelector('.chip-feito .chip-sub').textContent).toBe('~48 · feito');
    expect(celula('2026-11-05').querySelector('.chip-pulado .chip-sub').textContent).toBe('~48 · pulado');
    expect(celula('2026-11-02').querySelector('.chip-atrasado .chip-sub').textContent).toBe('~48 · não realizado');
    // só o planejado pode ser arrastado
    expect(celula('2026-11-06').querySelector('.chip-treino').draggable).toBe(true);
    expect(celula('2026-11-03').querySelector('.chip-treino').draggable).toBe(false);
    expect(celula('2026-11-05').querySelector('.chip-treino').draggable).toBe(false);
  });
});

describe('arrastar e soltar', () => {
  beforeEach(() => {
    m.treinos = [treino()];
    abrir();
  });

  it('soltar o treino em outro dia move a data e avisa', async () => {
    celula('2026-11-06').querySelector('.chip-treino').dispatchEvent(evento('dragstart'));
    const alvo = celula('2026-11-08');
    const sobre = evento('dragover');
    alvo.dispatchEvent(sobre);
    expect(sobre.defaultPrevented).toBe(true);
    expect(alvo.classList.contains('cal-alvo')).toBe(true);
    alvo.dispatchEvent(evento('drop'));
    await tick();
    expect(m.moverTreino).toHaveBeenCalledWith('t1', '2026-11-08');
    expect(raiz.textContent).toContain('Treino movido para 08/11/2026.');
  });

  it('soltar no mesmo dia não faz nada', () => {
    celula('2026-11-06').querySelector('.chip-treino').dispatchEvent(evento('dragstart'));
    celula('2026-11-06').dispatchEvent(evento('drop'));
    expect(m.moverTreino).not.toHaveBeenCalled();
  });

  it('sem um treino sendo arrastado, o dia não aceita soltar', () => {
    celula('2026-11-06').querySelector('.chip-treino').dispatchEvent(evento('dragstart'));
    celula('2026-11-06').querySelector('.chip-treino').dispatchEvent(evento('dragend'));
    const sobre = evento('dragover');
    celula('2026-11-08').dispatchEvent(sobre);
    expect(sobre.defaultPrevented).toBe(false);
  });

  it('mostra o erro se não conseguir mover', async () => {
    m.moverTreino.mockRejectedValue(new Error('Sem permissão.'));
    celula('2026-11-06').querySelector('.chip-treino').dispatchEvent(evento('dragstart'));
    celula('2026-11-07').dispatchEvent(evento('drop'));
    await tick();
    expect(raiz.querySelector('[role=alert]').textContent).toContain('Sem permissão.');
  });
});

describe('novo treino e edição', () => {
  const preencher = (campos) => {
    for (const [id, valor] of Object.entries(campos)) digitar(raiz.querySelector(`#${id}`), valor);
  };

  it('"Novo treino" abre o editor; a estimativa acompanha a zona e a duração', () => {
    abrir();
    botao('Novo treino').click();
    expect(raiz.querySelector('#editor-treino h2').textContent).toBe('Novo treino');
    expect(raiz.querySelector('#tr-data').value).toBe('2026-11-04');
    expect(raiz.querySelector('.estimativa').textContent).toContain('Informe a data, a duração e a zona');
    preencher({ 'tr-duracao': '60', 'tr-zona': 'Z2' });
    expect(raiz.querySelector('.estimativa').textContent).toMatch(/^Estimativa: ~\d+ de HRSS\.$/);
    const z2 = Number(raiz.querySelector('.estimativa').textContent.match(/~(\d+)/)[1]);
    preencher({ 'tr-zona': 'Z4' });
    expect(Number(raiz.querySelector('.estimativa').textContent.match(/~(\d+)/)[1])).toBeGreaterThan(z2);
    preencher({ 'tr-estresse': '70' });
    expect(raiz.querySelector('.estimativa').textContent).toContain('você informou outro valor');
  });

  describe('com calibração', () => {
    const cal = { chaves: { ciclismo_Z2: { n: 30, mediana: 100, amostras: [] } } };

    it('a estimativa usa o histórico do atleta e diz com quantas atividades foi calibrada', () => {
      m.calibracao = cal;
      abrir();
      botao('Novo treino').click();
      preencher({ 'tr-esporte': 'ciclismo', 'tr-duracao': '60', 'tr-zona': 'Z2' });
      const texto = raiz.querySelector('.estimativa').textContent;
      expect(texto).toContain('calibrada com as suas 30 atividades parecidas');
      expect(texto).toMatch(/pela fórmula seria ~[0-9]+/);
      const calibrada = Number(texto.match(/~([0-9]+)/)[1]);
      expect(calibrada).toBeGreaterThan(Number(texto.match(/seria ~([0-9]+)/)[1]));
    });

    it('esporte sem amostras continua na fórmula', () => {
      m.calibracao = cal;
      abrir();
      botao('Novo treino').click();
      preencher({ 'tr-esporte': 'corrida', 'tr-duracao': '60', 'tr-zona': 'Z2' });
      expect(raiz.querySelector('.estimativa').textContent).toMatch(/^Estimativa: ~[0-9]+ de HRSS[.]$/);
    });

    it('com a calibração desligada nas preferências, vale só a fórmula', () => {
      m.calibracao = cal;
      m.preferencias = { calibracaoAtiva: false };
      abrir();
      botao('Novo treino').click();
      preencher({ 'tr-esporte': 'ciclismo', 'tr-duracao': '60', 'tr-zona': 'Z2' });
      expect(raiz.querySelector('.estimativa').textContent).toMatch(/^Estimativa: ~[0-9]+ de HRSS[.]$/);
    });

    it('o treino salvo guarda a estimativa calibrada, e o calendário mostra o valor calibrado', async () => {
      m.calibracao = cal;
      abrir();
      botao('Novo treino').click();
      preencher({ 'tr-data': '2026-11-07', 'tr-esporte': 'ciclismo', 'tr-duracao': '60', 'tr-zona': 'Z2' });
      enviar(raiz.querySelector('#editor-treino form'));
      await tick();
      const estimado = m.criarTreino.mock.calls[0][2];
      expect(estimado).toBeGreaterThan(70); // a mediana de 100 HRSS/h puxa a estimativa para cima
    });
  });

  it('sem configuração, a estimativa pede para cadastrá-la', () => {
    m.configs = [];
    abrir();
    botao('Novo treino').click();
    preencher({ 'tr-duracao': '60' });
    expect(raiz.querySelector('.estimativa').textContent).toContain('Cadastre a configuração de FC');
  });

  it('o "+" do dia abre o editor com aquela data', () => {
    abrir();
    celula('2026-11-07').querySelector('.cal-novo').click();
    expect(raiz.querySelector('#tr-data').value).toBe('2026-11-07');
  });

  it('salva um treino válido (valida, estima e grava) e fecha o editor com aviso', async () => {
    abrir();
    botao('Novo treino').click();
    preencher({ 'tr-data': '2026-11-07', 'tr-esporte': 'corrida', 'tr-duracao': '45', 'tr-zona': 'Z3', 'tr-obs': '  Intervalado  ' });
    enviar(raiz.querySelector('#editor-treino form'));
    await tick();
    expect(m.criarTreino).toHaveBeenCalledTimes(1);
    const [uid, valores, estimado] = m.criarTreino.mock.calls[0];
    expect(uid).toBe('u1');
    expect(valores).toEqual({ esporte: 'corrida', data: '2026-11-07', duracaoMin: 45, zona: 'Z3', estresseManual: null, observacoes: 'Intervalado' });
    expect(estimado).toBeGreaterThan(0);
    expect(raiz.querySelector('#editor-treino')).toBeNull();
    expect(raiz.textContent).toContain('Treino adicionado.');
  });

  it('mostra os erros de validação e não grava', async () => {
    abrir();
    botao('Novo treino').click();
    preencher({ 'tr-duracao': '3' });
    enviar(raiz.querySelector('#editor-treino form'));
    await tick();
    expect(m.criarTreino).not.toHaveBeenCalled();
    expect(raiz.querySelector('#editor-treino [role=alert]').textContent).toContain('duração em minutos inteiros');
    expect(raiz.querySelector('#editor-treino')).not.toBeNull();
  });

  it('cancelar fecha o editor sem gravar', () => {
    abrir();
    botao('Novo treino').click();
    botao('Cancelar').click();
    expect(raiz.querySelector('#editor-treino')).toBeNull();
    expect(m.criarTreino).not.toHaveBeenCalled();
  });

  it('clicar no treino abre o editor preenchido; salvar atualiza (não cria outro)', async () => {
    m.treinos = [treino({ observacoes: 'Serra', estresseManual: 55 })];
    abrir();
    celula('2026-11-06').querySelector('.chip-treino').click();
    expect(raiz.querySelector('#editor-treino h2').textContent).toBe('Editar treino');
    expect(raiz.querySelector('#tr-duracao').value).toBe('60');
    expect(raiz.querySelector('#tr-zona').value).toBe('Z2');
    expect(raiz.querySelector('#tr-estresse').value).toBe('55');
    expect(raiz.querySelector('#tr-obs').value).toBe('Serra');
    preencher({ 'tr-duracao': '90' });
    enviar(raiz.querySelector('#editor-treino form'));
    await tick();
    expect(m.criarTreino).not.toHaveBeenCalled();
    expect(m.atualizarTreino).toHaveBeenCalledTimes(1);
    expect(m.atualizarTreino.mock.calls[0][0]).toBe('t1');
    expect(m.atualizarTreino.mock.calls[0][1]).toMatchObject({ duracaoMin: 90, estresseManual: 55 });
    expect(raiz.textContent).toContain('Treino atualizado.');
  });

  it('duplica para a próxima semana (mesma duração, zona e esporte, data +7 dias)', async () => {
    m.treinos = [treino()];
    abrir();
    celula('2026-11-06').querySelector('.chip-treino').click();
    botao('Duplicar para a próxima semana').click();
    await tick();
    expect(m.criarTreino.mock.calls[0][1]).toMatchObject({ data: '2026-11-13', duracaoMin: 60, zona: 'Z2', esporte: 'ciclismo' });
    expect(raiz.textContent).toContain('Treino duplicado para 13/11/2026.');
  });

  it('marca como pulado e exclui (com confirmação)', async () => {
    m.treinos = [treino()];
    abrir();
    celula('2026-11-06').querySelector('.chip-treino').click();
    botao('Marcar como pulado').click();
    await tick();
    expect(m.pularTreino).toHaveBeenCalledWith('t1');

    celula('2026-11-06').querySelector('.chip-treino').click();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    botao('Excluir').click();
    await tick();
    expect(m.excluirTreino).not.toHaveBeenCalled();
    botao('Excluir').click();
    await tick();
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(m.excluirTreino).toHaveBeenCalledWith('t1');
  });

  it('treino vinculado oferece desvincular; treino pulado, voltar para planejado', async () => {
    m.treinos = [treino({ status: 'realizado', atividadeId: 'a1', data: '2026-11-03' }), treino({ id: 't2', status: 'pulado', data: '2026-11-05' })];
    m.atividades = [atividade()];
    abrir();
    celula('2026-11-03').querySelector('.chip-treino').click();
    botao('Desvincular da atividade').click();
    await tick();
    expect(m.desvincularTreino).toHaveBeenCalledWith('t1');
    celula('2026-11-05').querySelector('.chip-treino').click();
    expect(botao('Voltar para planejado')).toBeDefined();
  });
});

describe('projeção do plano', () => {
  const historico = Array.from({ length: 20 }, (_, i) => ({ data: `2026-10-${String(10 + i).padStart(2, '0')}`, estresse: 70 }));

  it('com treinos planejados, o gráfico mostra a projeção tracejada e a região sombreada', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-08' })];
    abrir();
    const cartao = [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Projeção do plano');
    expect(cartao.querySelectorAll('polyline.cg-tracejada')).toHaveLength(2); // condicionamento e fadiga
    expect(cartao.querySelectorAll('rect.cg-barra-futura').length).toBeGreaterThan(0); // Forma planejada: só contorno
    expect(cartao.querySelector('.cg-futuro')).not.toBeNull();
    expect(cartao.querySelector('.cg-hoje-rotulo').textContent).toBe('HOJE');
    expect(cartao.querySelector('.cg-lateral .cg-legenda').textContent).toContain('Projeção do plano');
  });

  it('é o mesmo gráfico do Início, em modo plano: seletor com mais futuro, estresse do dia e sem painel de peso', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-08' })];
    abrir();
    const cartao = [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Projeção do plano');
    expect([...cartao.querySelectorAll('.cg-periodo')].map((b) => b.textContent)).toEqual(['2 sem', '4 sem', '8 sem', '12 sem']);
    expect(cartao.querySelector('.cg-periodo[aria-pressed="true"]').textContent).toBe('8 sem');
    expect([...cartao.querySelectorAll('.cg-titulo-painel')].map((t) => t.textContent)).toEqual(['CONDICIONAMENTO E FADIGA', 'FORMA', 'ESTRESSE DO DIA']);
    expect(cartao.querySelector('.cg-peso-vazio')).toBeNull();
    expect(cartao.querySelectorAll('rect.cg-estresse').length).toBeGreaterThan(0); // realizado
    expect(cartao.querySelectorAll('rect.cg-estresse-futuro')).toHaveLength(1); // o treino planejado
    expect(cartao.querySelector('.cg-atividade')).toBeNull(); // sem ícones de atividade
  });

  it('clicar num dia do gráfico abre o editor naquela data (novo treino) ou o treino que já existe', () => {
    m.dias = historico;
    m.treinos = [treino({ id: 'tx', data: '2026-11-08', duracaoMin: 90 })];
    abrir();
    const cartao = [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Projeção do plano');
    const area = cartao.querySelector('.cg-area-grafico');
    expect(area.classList.contains('cg-clicavel')).toBe(true);
    area.querySelector('svg').getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 500, right: 760, bottom: 500 });
    const clicarEm = (x) => area.dispatchEvent(Object.assign(new Event('click', { bubbles: true }), { clientX: x }));
    const dias = cartao.querySelectorAll('rect.cg-barra').length;
    const xDoDia = (i) => 40 + ((i + 0.5) / dias) * (760 - 40 - 14);
    clicarEm(xDoDia(dias - 1)); // último dia da janela: sem treino
    expect(raiz.querySelector('#editor-treino h2').textContent).toBe('Novo treino');
    expect(raiz.querySelector('#tr-data').value).toBe('2026-11-22'); // o plano termina 14 dias depois do último treino
    // o dia do treino planejado abre a edição dele: 21 dias de passado, hoje (04/11) é o índice 21 e 08/11 o 25
    clicarEm(xDoDia(25));
    expect(raiz.querySelector('#editor-treino h2').textContent).toBe('Editar treino');
    expect(raiz.querySelector('#tr-data').value).toBe('2026-11-08');
    expect(raiz.querySelector('#tr-duracao').value).toBe('90');
  });

  it('sem treinos planejados, mostra só o realizado e convida a planejar', () => {
    m.dias = historico;
    abrir();
    const cartao = [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Projeção do plano');
    expect(cartao.querySelector('polyline.cg-tracejada')).toBeNull();
    expect(cartao.querySelector('.cg-futuro')).toBeNull();
    expect(cartao.textContent).toContain('Ainda não há treinos planejados: clique num dia para planejar um');
  });

  it('sem nenhum dado, mostra o estado vazio', () => {
    abrir();
    expect(raiz.textContent).toContain('Registre atividades e planeje treinos para ver a projeção.');
  });

  it('treino planejado em dia passado e não feito não entra na projeção', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-02', estresseManual: 500 })];
    abrir();
    const cartao = [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Projeção do plano');
    expect(cartao.querySelector('polyline.cg-tracejada')).toBeNull();
  });
});

describe('meta de forma', () => {
  const historico = Array.from({ length: 30 }, (_, i) => ({ data: `2026-10-${String(5 + i).padStart(2, '0')}`.replace('2026-10-3', '2026-11-0').replace('2026-10-4', '2026-11-1'), estresse: 70 })).filter((d) => d.data <= '2026-11-03');
  const cartaoMeta = () => [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Meta de forma');

  it('sem meta, explica como funciona; o formulário define a meta (e desativa a anterior)', async () => {
    abrir();
    expect(cartaoMeta().textContent).toContain('chegar com Forma X na data Y');
    digitar(raiz.querySelector('#meta-forma'), '+10,5');
    digitar(raiz.querySelector('#meta-data'), '2026-11-20');
    enviar(cartaoMeta().querySelector('form'));
    await tick();
    expect(m.definirMeta).toHaveBeenCalledWith('u1', { formaAlvo: 10.5, dataAlvo: '2026-11-20' }, []);
  });

  it('valida a meta antes de gravar', async () => {
    abrir();
    digitar(raiz.querySelector('#meta-forma'), '99');
    digitar(raiz.querySelector('#meta-data'), '2026-10-01');
    enviar(cartaoMeta().querySelector('form'));
    await tick();
    expect(m.definirMeta).not.toHaveBeenCalled();
    expect(cartaoMeta().querySelector('[role=alert]').textContent).toContain('Forma desejada');
    expect(cartaoMeta().querySelector('[role=alert]').textContent).toContain('passado');
  });

  it('com meta ativa, mostra o resultado projetado, os dias que faltam e troca a meta desativando a atual', async () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metas = [{ id: 'm1', userId: 'u1', formaAlvo: 10, dataAlvo: '2026-11-20', ativa: true }];
    abrir();
    const cartao = cartaoMeta();
    const resultado = cartao.querySelector('.meta-resultado');
    expect(resultado.textContent).toContain('Com o plano atual você chega em 20/11/2026 com Forma');
    expect(resultado.textContent).toContain('Faltam 16 dias.');
    expect(resultado.querySelector('.chip-estado').textContent).toMatch(/^(Chega lá|Fica abaixo|Fica acima)$/);
    expect(cartao.querySelector('#meta-forma').value).toBe('10');
    expect(botao('Trocar a meta', cartao)).toBeDefined();

    digitar(cartao.querySelector('#meta-forma'), '-5');
    digitar(cartao.querySelector('#meta-data'), '2026-11-25');
    enviar(cartao.querySelector('form'));
    await tick();
    expect(m.definirMeta.mock.calls[0][1]).toEqual({ formaAlvo: -5, dataAlvo: '2026-11-25' });
    expect(m.definirMeta.mock.calls[0][2].map((x) => x.id)).toEqual(['m1']);
  });

  it('o gráfico marca a meta (losango e rótulo)', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metas = [{ id: 'm1', userId: 'u1', formaAlvo: 10, dataAlvo: '2026-11-20', ativa: true }];
    abrir();
    expect(raiz.querySelector('.cg-meta-marcador')).not.toBeNull();
    expect(raiz.querySelector('.cg-meta-rotulo').textContent).toBe('Meta +10,0 · sex, 20 nov');
    expect(raiz.querySelector('.cg-meta-faixa')).not.toBeNull(); // tolerância de ±3
    expect(raiz.querySelector('.cg-meta-linha')).not.toBeNull();
  });

  it('o tooltip do dia diz quanto falta para a meta (ou que está dentro dela)', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metas = [{ id: 'm1', userId: 'u1', formaAlvo: 10, dataAlvo: '2026-11-20', ativa: true }];
    abrir();
    const area = raiz.querySelector('.cg-area-grafico');
    area.querySelector('svg').getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 500, right: 760, bottom: 500 });
    const dias = raiz.querySelectorAll('rect.cg-barra').length;
    // com meta, o plano vai até 14 dias depois dela (04/12); a meta é em 20/11, 14 dias antes do fim
    const x = 40 + ((dias - 1 - 14 + 0.5) / dias) * (760 - 40 - 14);
    area.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true }), { clientX: x, pointerType: 'mouse' }));
    expect(raiz.querySelector('.cg-dica .cg-dica-meta').textContent).toMatch(/^Meta de forma\+10,0 · (faltam [0-9]+,[0-9]|dentro da meta|[0-9]+,[0-9] acima)$/);
  });

  it('remove a meta (com confirmação) e lista as anteriores', async () => {
    m.metas = [
      { id: 'm1', userId: 'u1', formaAlvo: 10, dataAlvo: '2026-11-20', ativa: true },
      { id: 'm0', userId: 'u1', formaAlvo: -8, dataAlvo: '2026-10-15', ativa: false },
    ];
    abrir();
    expect(cartaoMeta().querySelector('.meta-anteriores').textContent).toContain('Forma −8,0 em 15/10/2026');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    botao('Remover meta').click();
    await tick();
    expect(m.excluirMeta).not.toHaveBeenCalled();
    botao('Remover meta').click();
    await tick();
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(m.excluirMeta).toHaveBeenCalledWith('m1');
  });

  it('textoDaAvaliacao: uma frase para cada resultado', () => {
    const base = { formaAlvo: 10, dataAlvo: '2026-11-20' };
    expect(textoDaAvaliacao({ ...base, estado: 'atinge', formaProjetada: 11.2, diferenca: 1.2 })).toBe('Com o plano atual você chega em 20/11/2026 com Forma +11,2, dentro da meta (+10,0).');
    expect(textoDaAvaliacao({ ...base, estado: 'abaixo', formaProjetada: 2, diferenca: -8 })).toContain('8,0 pontos abaixo da meta (+10,0). Falta descanso');
    expect(textoDaAvaliacao({ ...base, estado: 'acima', formaProjetada: 20.5, diferenca: 10.5 })).toContain('10,5 pontos acima da meta (+10,0). Dá para treinar um pouco mais');
    expect(textoDaAvaliacao({ ...base, estado: 'sem-dados', formaProjetada: null, diferenca: null })).toContain('Ainda não dá para projetar');
  });
});

describe('meta de Condicionamento (a meta principal)', () => {
  const historico = Array.from({ length: 30 }, (_, i) => ({ data: `2026-10-${String(5 + i).padStart(2, '0')}`.replace('2026-10-3', '2026-11-0').replace('2026-10-4', '2026-11-1'), estresse: 70 })).filter((d) => d.data <= '2026-11-03');
  const cartao = () => [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Meta de Condicionamento');
  const meta = (extra) => ({ id: 'mc1', userId: 'u1', condicionamentoAlvo: 50, condicionamentoInicial: 20, dataAlvo: '2026-11-20', ativa: true, ...extra });

  it('vem antes da meta de forma, que fica em segundo plano e opcional', () => {
    abrir();
    const titulos = [...raiz.querySelectorAll('.card h2')].map((h) => h.textContent);
    expect(titulos.indexOf('Meta de Condicionamento')).toBeGreaterThan(-1);
    expect(titulos.indexOf('Meta de Condicionamento')).toBeLessThan(titulos.indexOf('Meta de forma'));
    expect(raiz.textContent).toContain('Opcional, complementa a meta de Condicionamento');
  });

  it('sem meta, explica; o formulário define a meta guardando o Condicionamento de hoje como ponto de partida', async () => {
    m.dias = historico;
    abrir();
    expect(cartao().textContent).toContain('A meta principal do plano');
    expect(cartao().querySelector('.dica').textContent).toContain('Hoje:');
    digitar(raiz.querySelector('#metacond-alvo'), '45,5');
    digitar(raiz.querySelector('#metacond-data'), '2026-12-20');
    enviar(cartao().querySelector('form'));
    await tick();
    expect(m.definirMetaCondicionamento).toHaveBeenCalledTimes(1);
    const [uid, valores, ativas] = m.definirMetaCondicionamento.mock.calls[0];
    expect(uid).toBe('u1');
    expect(valores).toMatchObject({ condicionamentoAlvo: 45.5, dataAlvo: '2026-12-20' });
    expect(valores.condicionamentoInicial).toBeGreaterThan(0);
    expect(ativas).toEqual([]);
  });

  it('valida a meta antes de gravar', async () => {
    abrir();
    digitar(raiz.querySelector('#metacond-alvo'), '999');
    digitar(raiz.querySelector('#metacond-data'), '2026-10-01');
    enviar(cartao().querySelector('form'));
    await tick();
    expect(m.definirMetaCondicionamento).not.toHaveBeenCalled();
    expect(cartao().querySelector('.mensagem-erro').textContent).toContain('Condicionamento desejado');
  });

  it('com meta, mostra o resultado, o ritmo necessário e o do plano, e o progresso', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metasCondicionamento = [meta()];
    abrir();
    const c = cartao();
    expect(c.querySelector('.chip-estado').textContent).toMatch(/^(Chega lá|Fica abaixo|Fica acima)$/);
    expect(c.querySelector('.meta-resultado p').textContent).toContain('Condicionamento');
    expect(c.querySelector('.meta-ritmo').textContent).toMatch(/^Ritmo necessário: [+−][0-9]+,[0-9] por semana · o seu plano entrega [+−0-9,]+ por semana\.$/);
    expect(c.querySelector('.meta-progresso .texto-secundario').textContent).toContain('de 20,0 até 50,0');
    expect(c.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(c.textContent).toContain('Faltam 16 dias.');
  });

  it('avisa quando o ritmo necessário passa de 7 pontos por semana', () => {
    m.dias = historico;
    m.metasCondicionamento = [meta({ condicionamentoAlvo: 200, dataAlvo: '2026-11-18' })];
    abrir();
    expect(cartao().querySelector('.meta-agressiva').textContent).toContain('Ritmo agressivo');
  });

  it('meta realista não gera o aviso', () => {
    m.dias = historico;
    m.metasCondicionamento = [meta({ condicionamentoAlvo: 20, dataAlvo: '2026-11-30' })];
    abrir();
    expect(cartao().querySelector('.meta-agressiva')).toBeNull();
  });

  it('o gráfico marca a meta de Condicionamento no painel de cima (faixa, linha, losango e rótulo) e a legenda a cita', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metasCondicionamento = [meta()];
    abrir();
    expect(raiz.querySelector('.cg-meta-marcador.cg-meta-cond')).not.toBeNull();
    expect(raiz.querySelector('.cg-meta-rotulo.cg-meta-cond').textContent).toBe('Meta 50,0 · sex, 20 nov');
    expect(raiz.querySelector('.cg-meta-faixa.cg-meta-cond')).not.toBeNull();
    expect(raiz.querySelector('.cg-lateral .cg-legenda').textContent).toContain('Meta de Condicionamento');
  });

  it('as duas metas convivem: cada uma marcada no seu painel', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metasCondicionamento = [meta()];
    m.metas = [{ id: 'm1', userId: 'u1', formaAlvo: 10, dataAlvo: '2026-11-20', ativa: true }];
    abrir();
    expect(raiz.querySelector('.cg-meta-marcador.cg-meta-cond')).not.toBeNull();
    expect([...raiz.querySelectorAll('.cg-meta-marcador')].filter((el) => !el.classList.contains('cg-meta-cond'))).toHaveLength(1);
  });

  it('o tooltip diz quanto falta para a meta de Condicionamento', () => {
    m.dias = historico;
    m.treinos = [treino({ data: '2026-11-10', estresseManual: 80 })];
    m.metasCondicionamento = [meta()];
    abrir();
    const area = raiz.querySelector('.cg-area-grafico');
    area.querySelector('svg').getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 500, right: 760, bottom: 500 });
    const dias = raiz.querySelectorAll('rect.cg-barra').length;
    // com meta, o plano vai até 14 dias depois dela (04/12): a meta (20/11) está 14 dias antes do fim
    const x = 40 + ((dias - 1 - 14 + 0.5) / dias) * (760 - 40 - 14);
    area.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true }), { clientX: x, pointerType: 'mouse' }));
    expect(raiz.querySelector('.cg-dica .cg-dica-meta-cond').textContent).toMatch(/^Meta de Condicionamento50,0 · (faltam [0-9]+,[0-9]|dentro da meta|[0-9]+,[0-9] acima)$/);
  });

  it('remover a meta pede confirmação; trocar desativa a anterior; metas anteriores aparecem listadas', async () => {
    m.metasCondicionamento = [meta(), meta({ id: 'mc0', ativa: false, condicionamentoAlvo: 30, dataAlvo: '2026-10-15' })];
    abrir();
    expect(cartao().querySelector('.meta-anteriores').textContent).toContain('Condicionamento 30,0 em 15/10/2026');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const remover = botao('Remover meta', cartao());
    remover.click();
    await tick();
    expect(m.excluirMetaCondicionamento).not.toHaveBeenCalled();
    remover.click();
    await tick();
    expect(m.excluirMetaCondicionamento).toHaveBeenCalledWith('mc1');
    confirmar.mockRestore();
    digitar(raiz.querySelector('#metacond-alvo'), '55');
    digitar(raiz.querySelector('#metacond-data'), '2026-12-20');
    enviar(cartao().querySelector('form'));
    await tick();
    expect(m.definirMetaCondicionamento.mock.calls[0][2]).toEqual([expect.objectContaining({ id: 'mc1' })]);
  });
});

describe('acompanhamento: vínculos, atrasados e planejado × realizado', () => {
  const cartao = () => [...raiz.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === 'Acompanhamento');

  it('nada pendente: mostra uma frase curta', () => {
    abrir();
    expect(cartao().textContent).toContain('Nada pendente');
  });

  it('sugere vincular treino planejado à atividade do mesmo dia e esporte; "Vincular" grava', async () => {
    m.treinos = [treino({ data: '2026-11-03' })];
    m.atividades = [atividade()];
    abrir();
    const secao = cartao();
    expect(secao.querySelector('h3').textContent).toBe('Parece que você fez');
    expect(secao.querySelector('.acomp-item').textContent).toContain('03/11/2026 · Ciclismo 60min · Z2');
    expect(secao.querySelector('.acomp-item').textContent).toContain('HRSS 50,6');
    botao('Vincular', secao).click();
    await tick();
    expect(m.vincularTreino).toHaveBeenCalledWith('t1', 'a1');
    expect(raiz.textContent).toContain('Treino vinculado à atividade.');
  });

  it('"Não foi esse" esconde a sugestão e o treino passa a aparecer em "Não realizados"', () => {
    m.treinos = [treino({ data: '2026-11-03' })];
    m.atividades = [atividade()];
    abrir();
    expect(cartao().querySelector('h3').textContent).toBe('Parece que você fez');
    botao('Não foi esse').click();
    expect(vinculosIgnorados.has('t1:a1')).toBe(true);
    const titulos = [...cartao().querySelectorAll('h3')].map((h3) => h3.textContent);
    expect(titulos).toEqual(['Não realizados']);
  });

  it('treino que passou sem ser feito: reagendar para hoje ou pular', async () => {
    m.treinos = [treino({ id: 'atrasado', data: '2026-11-02' })];
    abrir();
    const secao = cartao();
    expect(secao.querySelector('h3').textContent).toBe('Não realizados');
    expect(secao.textContent).toContain('não entra mais na projeção');
    botao('Reagendar para hoje', secao).click();
    await tick();
    expect(m.moverTreino).toHaveBeenCalledWith('atrasado', '2026-11-04');
    botao('Pular', secao).click();
    await tick();
    expect(m.pularTreino).toHaveBeenCalledWith('atrasado');
  });

  it('compara planejado × realizado dos treinos vinculados', () => {
    m.treinos = [treino({ data: '2026-11-03', status: 'realizado', atividadeId: 'a1', estresseManual: 40, duracaoMin: 45 })];
    m.atividades = [atividade({ hrss: 50.6, duracaoS: 2983 })];
    abrir();
    const secao = cartao();
    expect(secao.querySelector('h3').textContent).toBe('Planejado × realizado');
    const celulas = [...secao.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(celulas).toEqual(['03/11/2026', 'Ciclismo 45min · Z2', '40', '50,6', '+10,6', '45 → 50 min']);
  });
});

describe('ciclo de vida', () => {
  it('a tela só aparece quando tudo carregou e para de ouvir ao sair', () => {
    abrir();
    expect(raiz.querySelector('.cal-semana')).not.toBeNull();
    destruir();
    destruir = null;
    expect(() => document.body.append('x')).not.toThrow();
  });
});
