// @vitest-environment jsdom
import { somarDias } from '@no-strova/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hoje: '2026-11-04', // quarta-feira
  dias: [],
  ultimas: [],
  daSemana: [],
  treinos: [],
  configs: [],
  calibracao: { chaves: {} },
  preferencias: null,
  metasCondicionamento: [],
  reconstruir: vi.fn(),
}));

vi.mock('../../core/functions.js', () => ({ reconstruirEstresseDiario: mocks.reconstruir, reconstruirCalibracao: vi.fn().mockResolvedValue({}) }));
vi.mock('../../infrastructure/calibracaoRepo.js', () => ({
  observarCalibracao: (_uid, aoDados) => {
    aoDados(mocks.calibracao);
    return () => {};
  },
  observarPreferencias: (_uid, aoDados) => {
    aoDados(mocks.preferencias);
    return () => {};
  },
}));
vi.mock('../../infrastructure/estresseRepo.js', () => ({
  observarEstresseDiario: (_uid, aoDados) => {
    aoDados(mocks.dias);
    return () => {};
  },
}));
vi.mock('../../infrastructure/atividadesRepo.js', () => ({
  observarUltimasAtividades: (_uid, _n, aoDados) => {
    aoDados(mocks.ultimas);
    return () => {};
  },
  observarAtividadesDesde: (_uid, _desde, aoDados) => {
    aoDados(mocks.daSemana);
    return () => {};
  },
}));
vi.mock('../../infrastructure/planoRepo.js', () => ({
  observarTreinos: (_uid, _desde, aoDados) => {
    aoDados(mocks.treinos);
    return () => {};
  },
  observarMetasCondicionamento: (_uid, aoDados) => {
    aoDados(mocks.metasCondicionamento);
    return () => {};
  },
}));
vi.mock('../../infrastructure/configsRepo.js', () => ({
  observarConfigs: (_uid, aoDados) => {
    aoDados(mocks.configs);
    return () => {};
  },
}));
vi.mock('../../utils/formatters.js', async (importarOriginal) => ({
  ...(await importarOriginal()),
  hojeIso: () => mocks.hoje,
}));

const { render } = await import('./inicio.view.js');
const { controleAgregacao } = await import('../../application/forma.js');
const { estadoAtividades } = await import('../atividades/state.js');

const sessao = { uid: 'u1' };
let raiz;

beforeEach(() => {
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz');
  window.location.hash = '';
  mocks.hoje = '2026-11-04';
  mocks.dias = [];
  mocks.ultimas = [];
  mocks.daSemana = [];
  mocks.treinos = [];
  mocks.configs = [];
  mocks.calibracao = { chaves: {} };
  mocks.preferencias = null;
  mocks.metasCondicionamento = [];
  mocks.reconstruir.mockReset().mockResolvedValue({ dias: 0, removidos: 0 });
  controleAgregacao.pedido = false;
  estadoAtividades.abrirImportar = false;
});

const texto = (seletor) => raiz.querySelector(seletor)?.textContent;

describe('Início sem dados: cada bloco mostra um estado vazio curto', () => {
  beforeEach(() => render(raiz, sessao));

  it('mantém a ordem dos blocos', () => {
    const ordem = [...raiz.querySelectorAll('.inicio section')].map((el) => el.className.split(' ').pop());
    expect(ordem).toEqual(['hero-modo-vazio', 'bloco-semana', 'bloco-grafico', 'bloco-atividades', 'bloco-peso', 'bloco-sugestao']);
  });

  it('destaque: convida a começar, sem número, e o botão abre a importação', () => {
    expect(texto('.hero-rotulo')).toBe('Hoje');
    expect(texto('.hero-chamada')).toBe('Vamos começar');
    expect(raiz.querySelector('.hero-numero')).toBeNull();
    expect(raiz.querySelector('.chip-zona')).toBeNull();
    expect(texto('.hero-texto')).toBe('Importe um treino ou registre um pedal para ver a sua forma.');
    const botao = raiz.querySelector('.btn-hero');
    expect(botao.textContent).toBe('Importar arquivo');
    botao.click();
    expect(estadoAtividades.abrirImportar).toBe(true);
    expect(window.location.hash).toBe('#/atividades');
  });

  it('gráfico, semana, atividades, peso e sugestão têm texto de estado vazio', () => {
    expect(texto('.bloco-grafico h2')).toBe('Condicionamento, fadiga e forma');
    expect(texto('.bloco-grafico .vazio-curto')).toContain('Disponível quando houver atividades com HRSS');
    expect(raiz.querySelector('.bloco-grafico svg')).toBeNull();
    expect(texto('.bloco-semana .vazio-curto')).toContain('Nenhum treino nesta semana');
    expect(raiz.querySelector('.bloco-semana .semana')).toBeNull();
    expect(texto('.bloco-atividades .vazio-curto')).toContain('Nenhuma atividade ainda');
    expect(texto('.bloco-peso .vazio-curto')).toContain('Disponível quando houver registro de peso');
    expect(texto('.bloco-sugestao .vazio-curto')).toBe('Disponível quando houver plano de treino.');
  });

  it('pede a reconstrução da agregação uma única vez por sessão', () => {
    expect(mocks.reconstruir).toHaveBeenCalledTimes(1);
    render(raiz, sessao);
    expect(mocks.reconstruir).toHaveBeenCalledTimes(1);
  });
});

describe('Destaque do Início (bloco colorido pela zona de Forma)', () => {
  it('há atividades, mas nenhuma com HRSS: pede para configurar a FC', () => {
    mocks.dias = [{ data: '2026-11-03', estresse: 0, qtdAtividades: 1 }];
    render(raiz, sessao);
    expect(texto('.hero-chamada')).toBe('Falta a FC');
    expect(raiz.querySelector('a.btn-hero').getAttribute('href')).toBe('#/configuracao');
    expect(mocks.reconstruir).not.toHaveBeenCalled();
  });

  it('Forma ≈ 0 (o caso do usuário): mostra o número, a zona neutra e os quatro dados menores', () => {
    mocks.dias = [{ data: '2026-11-04', estresse: 51 }];
    render(raiz, sessao);
    const hero = raiz.querySelector('.hero');
    expect(hero.classList.contains('hero-zona-neutral')).toBe(true);
    expect(texto('.hero-rotulo')).toBe('Forma hoje');
    expect(texto('.hero-numero')).toBe('0,0');
    expect(texto('.hero-inteiro')).toBe('0');
    expect(texto('.hero-decimal')).toBe(',0');
    expect(texto('.chip-texto')).toBe('Zona neutra');
    // a frase saiu do bloco: vive no hint, na linha da zona atual
    expect(raiz.querySelector('.hero-frase')).toBeNull();
    expect(texto('.zona-atual .zona-resumo')).toBe('Fase de recuperação, boa para absorver o treino.');
    expect(raiz.querySelector('.hero-chamada')).toBeNull();

    const rotulos = [...raiz.querySelectorAll('.hero-dado-rotulo')].map((el) => el.textContent);
    expect(rotulos).toEqual(['Condicionamento', 'Fadiga', 'Forma amanhã', 'Último treino']);
    expect(texto('.hero-dado-ultimo .hero-dado-valor')).toBe('Hoje');
    expect(texto('.hero-dado-ultimo .hero-dado-nota')).toBe('51 de HRSS');
    expect(texto('.hero-dado-amanha .hero-dado-valor')).toMatch(/^[+−]?\d+,\d$/);

    const botao = raiz.querySelector('a.btn-hero');
    expect(botao.textContent).toBe('Planejar treino');
    expect(botao.getAttribute('href')).toBe('#/plano');
  });

  it('o bloco é o mesmo em todas as zonas; só a cor (classe da zona), o número e a frase mudam', () => {
    // dez dias alternando treino leve e duro, até hoje: Forma bem negativa (sobrecarga)
    mocks.dias = Array.from({ length: 10 }, (_, i) => ({ data: somarDias('2026-10-26', i), estresse: i % 2 === 0 ? 40 : 160 }));
    render(raiz, sessao);
    const hero = raiz.querySelector('.hero');
    expect(hero.classList.contains('hero-zona-overload')).toBe(true);
    expect(texto('.hero-numero')).toMatch(/^-\d+,\d$/); // hífen no lugar do sinal de menos (a Anton não tem o "−")
    expect(raiz.querySelector('.hero-numero').getAttribute('aria-label')).toMatch(/^Forma hoje: −\d+,\d$/);
    expect(texto('.hero-inteiro')).toMatch(/^-\d+$/);
    expect(texto('.hero-decimal')).toMatch(/^,\d$/);
    expect(texto('.chip-texto')).toBe('Zona de sobrecarga');
    expect(raiz.querySelector('.hero-frase')).toBeNull();
    expect(texto('.zona-atual .zona-resumo')).toBe('Carga acima do ideal: priorize o descanso.');
    expect(texto('.zona-atual strong')).toBe('Zona de sobrecarga');
    expect(raiz.querySelectorAll('.hero-dado')).toHaveLength(4);
    expect(raiz.querySelector('.btn-hero').getAttribute('href')).toBe('#/plano');
  });

  it('descansado depois de um bloco de treino: zona fresca ou de transição, número positivo', () => {
    // 40 dias de treino (até 26/10) e 9 de descanso até hoje (04/11)
    mocks.dias = Array.from({ length: 40 }, (_, i) => ({ data: somarDias('2026-09-17', i), estresse: 90 }));
    render(raiz, sessao);
    const classes = raiz.querySelector('.hero').className;
    expect(classes).toMatch(/hero-zona-(freshness|transicao)/);
    expect(texto('.hero-numero')).toMatch(/^\+\d+,\d$/);
    expect(texto('.hero-dado-ultimo .hero-dado-valor')).toBe('Há 9 dias');
  });

  it('mostra Condicionamento com a variação em 7 dias e Fadiga', () => {
    mocks.dias = [{ data: '2026-11-04', estresse: 51 }];
    render(raiz, sessao);
    expect(texto('.hero-dado-fitness .hero-dado-nota')).toMatch(/^▲ \d+,\d em 7 dias$/);
    expect(texto('.hero-dado-fadiga .hero-dado-nota')).toBe('média de 7 dias');
  });
});

describe('Início com dados', () => {
  const treinos = [
    { data: '2026-10-01', estresse: 80 },
    { data: '2026-10-10', estresse: 120 },
    { data: '2026-10-25', estresse: 60 },
    { data: '2026-11-02', estresse: 62 },
    { data: '2026-11-03', estresse: 50 },
  ];
  const atividades = [
    { id: 'a3', data: '2026-11-03', esporte: 'ciclismo', duracaoS: 2983, distanciaM: 17100, fcMedia: 146, hrss: 50.6 },
    { id: 'a2', data: '2026-11-02', esporte: 'corrida', duracaoS: 5520, distanciaM: 41800, fcMedia: 138, hrss: 62 },
    { id: 'a1', data: '2026-10-25', esporte: 'ciclismo', duracaoS: 2890, distanciaM: null, fcMedia: null, hrss: null },
  ];

  beforeEach(() => {
    mocks.dias = treinos;
    mocks.ultimas = atividades;
    mocks.daSemana = atividades.slice(0, 2);
    render(raiz, sessao);
  });

  it('Gráfico principal: três painéis, barras de Forma por zona, marcador de hoje e régua de zonas', () => {
    const g = raiz.querySelector('.bloco-grafico');
    expect(g.querySelector('h2').textContent).toBe('Condicionamento, fadiga e forma');
    expect(g.querySelectorAll('polyline.cg-fitness')).toHaveLength(1);
    expect(g.querySelectorAll('polyline.cg-fadiga')).toHaveLength(1);
    expect(g.querySelectorAll('rect.cg-barra').length).toBeGreaterThan(10);
    expect([...g.querySelectorAll('.cg-titulo-painel')].map((t) => t.textContent)).toEqual(['CONDICIONAMENTO E FADIGA', 'FORMA', 'PESO E META']);
    expect([...g.querySelectorAll('.cg-regua-nome')].map((t) => t.textContent)).toEqual(['Transição', 'Descansado', 'Neutra', 'Ótima', 'Sobrecarga']);
    expect([...g.querySelectorAll('.cg-regua-limite')].map((t) => t.textContent)).toEqual(['+25', '+5', '−10', '−30']);
    expect(g.querySelectorAll('.cg-periodo')).toHaveLength(4);
    expect(g.querySelector('.cg-periodo[aria-pressed="true"]').textContent).toBe('10 sem');
  });

  it('sem peso cadastrado, o painel de peso mostra o estado vazio com link para cadastrar', () => {
    const vazio = raiz.querySelector('.bloco-grafico .cg-peso-vazio');
    expect(vazio.textContent).toContain('Sem registros de peso');
    expect(vazio.querySelector('a').getAttribute('href')).toBe('#/peso');
  });

  it('a coluna lateral começa em Hoje: Forma em número grande, chip da zona e treino do dia (ou Descanso)', () => {
    const lateral = raiz.querySelector('.cg-lateral');
    expect(lateral.querySelector('.cg-dia-rotulo').textContent).toBe('Hoje · qua, 4 nov');
    expect(lateral.querySelector('.cg-dia-forma').textContent).toMatch(/^[+-]?[0-9]+,[0-9]$/);
    expect(lateral.querySelector('.cg-chip').textContent).toMatch(/^(Transição|Descansado|Neutra|Ótima|Sobrecarga)$/);
    expect(lateral.querySelector('.cg-dia-treino .cg-treino-linha').textContent).toBe('Descanso');
    expect(lateral.querySelector('.cg-regua-marcador')).not.toBeNull();
    expect(lateral.querySelector('.cg-legenda').textContent).toContain('Plano e meta');
  });

  it('o seletor troca o período e lembra a escolha', () => {
    const botoes = [...raiz.querySelectorAll('.cg-periodo')];
    const barrasAntes = raiz.querySelectorAll('rect.cg-barra').length;
    botoes[0].click(); // 6 sem
    expect(raiz.querySelector('.cg-periodo[aria-pressed="true"]').textContent).toBe('6 sem');
    expect(raiz.querySelectorAll('rect.cg-barra').length).toBeLessThan(barrasAntes);
    botoes[1].click();
  });

  it('Semana: título, 7 colunas, realizado cheio, descanso mínimo e hoje destacado', () => {
    expect(texto('.bloco-semana h2')).toBe('Semana de 2 a 8 de novembro');
    expect(texto('.bloco-resumo')).toBe('Realizada até hoje: 112');
    const dias = [...raiz.querySelectorAll('.semana .dia')];
    expect(dias).toHaveLength(7);
    expect(dias.map((d) => d.querySelector('.dia-rotulo').textContent)).toEqual([
      'SEG 2', 'TER 3', 'QUA 4 · HOJE', 'QUI 5', 'SEX 6', 'SÁB 7', 'DOM 8',
    ]);
    expect(raiz.querySelectorAll('.barra-real')).toHaveLength(2);
    expect(raiz.querySelectorAll('.barra-planejada')).toHaveLength(0);
    expect(raiz.querySelectorAll('.barra-descanso')).toHaveLength(5);
    expect(dias[2].classList.contains('dia-hoje')).toBe(true);
    expect(dias[2].getAttribute('aria-current')).toBe('date');
    expect(dias[0].querySelector('.dia-titulo').textContent).toBe('Corrida 41,8 km');
    expect(dias[0].querySelector('.dia-valor').textContent).toBe('62 · feito');
    expect(dias[1].querySelector('.dia-titulo').textContent).toBe('Ciclismo 17,1 km');
    expect(dias[2].querySelector('.dia-titulo').textContent).toBe('Descanso');
    expect(dias[3].querySelector('.dia-titulo').textContent).toBe('Livre');
    expect(dias[3].querySelector('.dia-valor').textContent).toBe('—');
  });

  it('a altura da barra é proporcional ao maior valor da semana', () => {
    const [seg, ter] = [...raiz.querySelectorAll('.barra-real')].map((b) => parseFloat(b.style.height));
    expect(seg).toBeCloseTo(100, 5); // 62 é o máximo
    expect(ter).toBeCloseTo((50 / 62) * 100, 3);
  });

  it('Últimas atividades: tabela real com as colunas pedidas, datas e HRSS', () => {
    const cabecalho = [...raiz.querySelectorAll('.bloco-atividades th')].map((th) => th.textContent);
    expect(cabecalho).toEqual(['Data', 'Esporte', 'Duração', 'Distância', 'FC média', 'HRSS']);
    const linhas = [...raiz.querySelectorAll('.bloco-atividades tbody tr')];
    expect(linhas).toHaveLength(3);
    const primeira = [...linhas[0].children].map((td) => td.textContent);
    expect(primeira).toEqual(['03/11/2026', 'Ciclismo', '49min 43s', '17,1 km', '146 bpm', '50,6']);
    expect(linhas[0].querySelector('a').getAttribute('href')).toBe('#/atividades/a3');
    const semDados = [...linhas[2].children].map((td) => td.textContent);
    expect(semDados.slice(3)).toEqual(['—', '—', '—']);
    expect(raiz.querySelector('.bloco-atividades a[href="#/atividades"]')).not.toBeNull();
  });

  it('Peso e Sugestão seguem com estado vazio', () => {
    expect(texto('.bloco-peso .vazio-curto')).toContain('Disponível quando houver registro de peso');
    expect(texto('.bloco-sugestao .vazio-curto')).toBe('Disponível quando houver plano de treino.');
  });
});

describe('Início com plano de treino', () => {
  const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
  const historico = Array.from({ length: 15 }, (_, i) => ({ data: somarDias('2026-10-20', i), estresse: 60 }));
  const planejado = (extra) => ({ id: 'p1', data: '2026-11-06', esporte: 'ciclismo', duracaoMin: 60, zona: 'Z2', status: 'planejado', estresseManual: 48, ...extra });

  beforeEach(() => {
    mocks.dias = historico;
    mocks.configs = [config];
  });

  it('a semana mostra o planejado tracejado, com título e valor "~N · plano"', () => {
    mocks.treinos = [planejado(), planejado({ id: 'p2', data: '2026-11-08', esporte: 'corrida', zona: 'Z4', estresseManual: 98 })];
    render(raiz, sessao);
    const dias = [...raiz.querySelectorAll('.semana .dia')];
    expect(raiz.querySelectorAll('.barra-planejada')).toHaveLength(2);
    expect(dias[4].querySelector('.dia-titulo').textContent).toBe('Ciclismo Z2'); // sexta 06/11
    expect(dias[4].querySelector('.dia-valor').textContent).toBe('~48 · plano');
    expect(dias[6].querySelector('.dia-titulo').textContent).toBe('Corrida Z4');
    // realizado da semana: 02/11 e 03/11 do histórico (60 + 60); planejado: 48 + 98
    expect(texto('.bloco-resumo')).toBe('Carga total prevista: 266 · realizada até hoje: 120');
  });

  it('vários treinos no mesmo dia viram "N treinos"; o estresse sem valor informado é estimado pela configuração', () => {
    mocks.treinos = [planejado({ estresseManual: null }), planejado({ id: 'p2', estresseManual: null, zona: 'Z4' })];
    render(raiz, sessao);
    expect([...raiz.querySelectorAll('.semana .dia')][4].querySelector('.dia-titulo').textContent).toBe('2 treinos');
    expect(parseFloat(raiz.querySelector('.barra-planejada').style.height)).toBeCloseTo(100, 5);
    expect([...raiz.querySelectorAll('.semana .dia')][4].querySelector('.dia-valor').textContent).toMatch(/^~\d+ · plano$/);
  });

  it('não desenha planejado de dia passado, pulado nem vinculado', () => {
    mocks.treinos = [
      planejado({ id: 'a', data: '2026-11-02' }),
      planejado({ id: 'b', data: '2026-11-06', status: 'pulado' }),
      planejado({ id: 'c', data: '2026-11-07', status: 'realizado', atividadeId: 'x' }),
    ];
    mocks.dias = [{ data: '2026-11-03', estresse: 50 }];
    render(raiz, sessao);
    expect(raiz.querySelectorAll('.barra-planejada')).toHaveLength(0);
  });

  it('com realizado e planejado no mesmo dia (hoje), mostra as duas barras', () => {
    mocks.dias = [{ data: '2026-11-04', estresse: 30 }];
    mocks.treinos = [planejado({ data: '2026-11-04', estresseManual: 70 })];
    render(raiz, sessao);
    const hoje = raiz.querySelector('.semana .dia-hoje');
    expect(hoje.querySelector('.barra-planejada')).not.toBeNull();
    expect(hoje.querySelector('.barra-real')).not.toBeNull();
  });

  it('semana sem nenhum treino convida a planejar', () => {
    mocks.dias = [];
    render(raiz, sessao);
    expect(texto('.bloco-semana .vazio-curto')).toContain('Nenhum treino nesta semana ainda.');
    expect(raiz.querySelector('.bloco-semana a[href="#/plano"]').textContent).toBe('Planejar a semana');
  });

  it('o gráfico ganha a projeção tracejada dos próximos dias, com barras só de contorno e o fundo de plano', () => {
    mocks.treinos = [planejado()];
    render(raiz, sessao);
    const grafico = raiz.querySelector('.bloco-grafico');
    expect(grafico.querySelectorAll('polyline.cg-tracejada').length).toBe(2); // condicionamento e fadiga
    expect(grafico.querySelectorAll('rect.cg-barra-futura').length).toBeGreaterThan(0);
    expect(grafico.querySelector('.cg-futuro')).not.toBeNull();
    expect(grafico.querySelector('.cg-hoje-rotulo').textContent).toBe('HOJE');
  });

  it('sem plano, o gráfico não tem divisória de hoje nem linhas tracejadas', () => {
    mocks.treinos = [];
    render(raiz, sessao);
    const grafico = raiz.querySelector('.bloco-grafico');
    expect(grafico.querySelector('polyline.cg-tracejada')).toBeNull();
    expect(grafico.querySelector('.cg-futuro')).toBeNull();
  });

  it('o treino do dia na coluna lateral vem do plano; passar o mouse num dia mostra o tooltip e atualiza a coluna', () => {
    mocks.treinos = [planejado()];
    render(raiz, sessao);
    const area = raiz.querySelector('.cg-area-grafico');
    const svg = area.querySelector('svg');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 500, right: 760, bottom: 500 });
    const mover = (x, tipo = 'mouse') => area.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true }), { clientX: x, pointerType: tipo }));
    const dica = raiz.querySelector('.cg-dica');
    expect(dica.hidden).toBe(true);
    // 10 sem: 42 dias realizados + hoje + projeção; o último ponto é o 06/11 (planejado)
    mover(757);
    expect(dica.hidden).toBe(false);
    expect(dica.querySelector('.cg-dica-topo').textContent).toMatch(/^Planejado · [a-zá]{3}, [0-9]+ nov$/);
    expect(dica.textContent).toContain('Condicionamento');
    expect(dica.textContent).toContain('Fadiga');
    expect(dica.classList.contains('cg-dica-esquerda')).toBe(true); // depois de ~65% vira para a esquerda
    expect(raiz.querySelector('.cg-dia-rotulo').textContent).toMatch(/^Planejado/);
    expect(raiz.querySelectorAll('.cg-barra-ativa')).toHaveLength(1);
    mover(60);
    expect(dica.classList.contains('cg-dica-esquerda')).toBe(false);
    expect(dica.querySelector('.cg-dica-topo').textContent).toMatch(/^Realizado/);
    area.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    expect(dica.hidden).toBe(true);
    expect(raiz.querySelector('.cg-dia-rotulo').textContent).toBe('Hoje · qua, 4 nov');
  });

  it('o destaque "Forma hoje" não muda com o plano', () => {
    mocks.treinos = [];
    render(raiz, sessao);
    const semPlano = texto('.hero-numero');
    document.body.innerHTML = '<div id="raiz"></div>';
    raiz = document.getElementById('raiz');
    mocks.treinos = [planejado({ data: '2026-11-05', estresseManual: 300 })];
    render(raiz, sessao);
    expect(texto('.hero-numero')).toBe(semPlano);
  });
});

describe('Semana que cruza dois meses', () => {
  it('escreve os dois meses no título', () => {
    mocks.hoje = '2026-11-01'; // domingo: a semana começa em 26/10
    mocks.dias = [{ data: '2026-10-27', estresse: 40 }];
    mocks.daSemana = [{ id: 'x', data: '2026-10-27', esporte: 'outro', duracaoS: 1800, distanciaM: null }];
    render(raiz, sessao);
    expect(texto('.bloco-semana h2')).toBe('Semana de 26 de outubro a 1 de novembro');
  });

  it('vários treinos no mesmo dia aparecem como "N atividades"', () => {
    mocks.hoje = '2026-11-04';
    mocks.dias = [{ data: '2026-11-02', estresse: 90 }];
    mocks.daSemana = [
      { id: 'x', data: '2026-11-02', esporte: 'ciclismo', duracaoS: 1800, distanciaM: 10000 },
      { id: 'y', data: '2026-11-02', esporte: 'corrida', duracaoS: 1800, distanciaM: 5000 },
    ];
    render(raiz, sessao);
    expect(raiz.querySelector('.semana .dia .dia-titulo').textContent).toBe('2 atividades');
  });
});

describe('Semana: resumo, progresso, próximo treino e sequência', () => {
  const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
  const atividades = [
    { id: 'a2', data: '2026-11-02', esporte: 'ciclismo', duracaoS: 3600, distanciaM: 30000, hrss: 62 },
    { id: 'a3', data: '2026-11-03', esporte: 'corrida', duracaoS: 1800, distanciaM: 5000, hrss: 50 },
    { id: 'a0', data: '2026-10-27', esporte: 'ciclismo', duracaoS: 7200, distanciaM: 50000, hrss: 90 },
  ];
  const dias = [
    { data: '2026-10-27', estresse: 90 },
    { data: '2026-10-28', estresse: 40 },
    { data: '2026-11-02', estresse: 62 },
    { data: '2026-11-03', estresse: 50 },
  ];

  beforeEach(() => {
    mocks.dias = dias;
    mocks.daSemana = atividades;
    mocks.configs = [config];
  });

  it('resumo: tempo, distância, atividades e carga, com a variação sobre o mesmo trecho da semana passada', () => {
    render(raiz, sessao);
    const valor = (id) => texto(`.semana-stat-${id} .semana-stat-valor`);
    const nota = (id) => texto(`.semana-stat-${id} .semana-stat-nota`);
    expect(valor('tempo')).toBe('1h 30min');
    expect(valor('distancia')).toBe('35,0 km');
    expect(valor('atividades')).toBe('2');
    expect(valor('carga')).toBe('112');
    // semana passada, de segunda a terça: 1 atividade de 2h, 50 km e carga 130 (90 + 40)
    expect(nota('tempo')).toBe('▼ 30min');
    expect(nota('distancia')).toBe('▼ 15,0 km');
    expect(nota('atividades')).toBe('▲ 1');
    expect(nota('carga')).toMatch(/^▼ \d+%$/);
  });

  it('sem treino planejado, o progresso convida a planejar', () => {
    render(raiz, sessao);
    expect(texto('.semana-progresso-vazio')).toContain('Sem treinos planejados');
    expect(texto('.semana-proximo .semana-mini-valor')).toBe('Nenhum treino planejado');
  });

  it('com plano: barra de progresso da carga, faltante e próximo treino em destaque', () => {
    mocks.treinos = [{ id: 'p1', data: '2026-11-06', esporte: 'ciclismo', duracaoMin: 75, zona: 'Z4', status: 'planejado', estresseManual: 98 }];
    render(raiz, sessao);
    expect(texto('.semana-progresso-texto')).toContain('112 de 210 (53%)');
    expect(raiz.querySelector('.semana-progresso-barra').getAttribute('aria-valuenow')).toBe('53');
    expect(texto('.semana-legenda + .semana-legenda, .semana-progresso .semana-legenda')).toBe('Faltam 98 para fechar o plano.');
    expect(texto('.semana-proximo .semana-mini-valor')).toBe('Ciclismo Z4 · 75 min');
    expect(texto('.semana-proximo .semana-mini-nota')).toBe('sex, 6 nov · ~98 de carga');
  });

  it('sequência: semanas seguidas com treino e o recorde', () => {
    render(raiz, sessao);
    expect(texto('.semana-sequencia .semana-mini-numero')).toBe('2');
    expect(texto('.semana-sequencia .semana-mini-valor')).toContain('semanas seguidas treinando');
    expect(texto('.semana-sequencia .semana-mini-nota')).toBe('Recorde: 2 semanas.');
  });

  it('o título do dia quebra em linhas em vez de ser cortado', () => {
    render(raiz, sessao);
    expect(getComputedStyle(raiz.querySelector('.dia-titulo')).whiteSpace).not.toBe('nowrap');
  });
});

describe('Meta de Condicionamento no Início', () => {
  const config = { id: 'c1', vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 178 };
  const historico = Array.from({ length: 30 }, (_, i) => ({ data: somarDias('2026-10-06', i), estresse: 60 })); // até 04/11
  const meta = (extra) => ({ id: 'mc1', userId: 'u1', condicionamentoAlvo: 50, condicionamentoInicial: 10, dataAlvo: '2026-11-25', ativa: true, ...extra });

  beforeEach(() => {
    mocks.dias = historico;
    mocks.configs = [config];
  });

  it('sem meta, convida a definir uma no Plano', () => {
    render(raiz, sessao);
    expect(texto('.semana-meta .semana-mini-valor')).toBe('Nenhuma meta definida');
    expect(raiz.querySelector('.semana-meta a').getAttribute('href')).toBe('#/plano');
  });

  it('com meta, mostra do Condicionamento de hoje ao alvo, o progresso e o que o plano atual entrega', () => {
    mocks.metasCondicionamento = [meta()];
    render(raiz, sessao);
    const cartao = raiz.querySelector('.semana-meta');
    expect(cartao.querySelector('.semana-mini-numero').textContent).toBe('50,0');
    expect(cartao.querySelector('.semana-mini-valor').textContent).toMatch(/^[0-9]+,[0-9] → 50,0 · [0-9]+%$/);
    expect(cartao.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(cartao.querySelector('.semana-mini-nota').textContent).toMatch(/^Plano atual: (chega lá em 25\/11\/2026|fica [0-9]+,[0-9] pontos abaixo em 25\/11\/2026|passa [0-9]+,[0-9] pontos do alvo em 25\/11\/2026)/);
  });

  it('meta antiga, sem o valor inicial: mostra só a projeção, sem barra de progresso', () => {
    mocks.metasCondicionamento = [meta({ condicionamentoInicial: undefined })];
    render(raiz, sessao);
    expect(raiz.querySelector('.semana-meta [role="progressbar"]')).toBeNull();
    expect(raiz.querySelector('.semana-meta .semana-mini-nota').textContent).toContain('Plano atual');
  });

  it('meta inativa não aparece; a mais próxima das ativas vale', () => {
    mocks.metasCondicionamento = [meta({ id: 'a', ativa: false, condicionamentoAlvo: 99 }), meta({ id: 'b', condicionamentoAlvo: 61, dataAlvo: '2026-12-20' }), meta({ id: 'c', condicionamentoAlvo: 55, dataAlvo: '2026-12-01' })];
    render(raiz, sessao);
    expect(raiz.querySelector('.semana-meta .semana-mini-numero').textContent).toBe('55,0');
  });

  it('ritmo agressivo aparece como aviso curto', () => {
    mocks.metasCondicionamento = [meta({ condicionamentoAlvo: 220, dataAlvo: '2026-11-11' })];
    render(raiz, sessao);
    expect(raiz.querySelector('.semana-meta-aviso').textContent).toContain('Ritmo agressivo');
  });
});
