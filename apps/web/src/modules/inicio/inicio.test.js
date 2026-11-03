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
  reconstruir: vi.fn(),
}));

vi.mock('../../core/functions.js', () => ({ reconstruirEstresseDiario: mocks.reconstruir }));
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
  mocks.reconstruir.mockReset().mockResolvedValue({ dias: 0, removidos: 0 });
  controleAgregacao.pedido = false;
  estadoAtividades.abrirImportar = false;
});

const texto = (seletor) => raiz.querySelector(seletor)?.textContent;

describe('Início sem dados: cada bloco mostra um estado vazio curto', () => {
  beforeEach(() => render(raiz, sessao));

  it('mantém a ordem dos blocos', () => {
    const ordem = [...raiz.querySelectorAll('.inicio > * > *, .inicio > * ')].filter((el) => el.matches('section')).map((el) => el.className.split(' ').pop());
    expect(ordem).toEqual(['hero-modo-vazio', 'bloco-grafico', 'bloco-semana', 'bloco-atividades', 'bloco-peso', 'bloco-sugestao']);
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
    expect(texto('.bloco-grafico h2')).toBe('Carga e fadiga');
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
    expect(rotulos).toEqual(['Fitness', 'Fadiga', 'Forma amanhã', 'Último treino']);
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

  it('mostra Fitness com a variação em 7 dias e Fadiga', () => {
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

  it('Carga e fadiga: Fitness e Fadiga com o marcador de hoje e link para o gráfico completo', () => {
    const grafico = raiz.querySelector('.bloco-grafico');
    expect(grafico.querySelectorAll('polyline')).toHaveLength(2);
    expect(grafico.querySelector('.serie-fitness')).not.toBeNull();
    expect(grafico.querySelector('.serie-fadiga')).not.toBeNull();
    expect(grafico.querySelector('.serie-forma')).toBeNull();
    expect(grafico.querySelector('rect.faixa')).toBeNull();
    expect(grafico.querySelector('.grafico-hoje-rotulo').textContent).toBe('Hoje');
    expect(grafico.querySelector('.legenda-inline').textContent).toContain('Fitness');
    expect(grafico.querySelector('a[href="#/forma"]')).not.toBeNull();
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
    expect(dias[3].querySelector('.dia-titulo').textContent).toBe('Sem plano');
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

  it('o gráfico ganha a projeção tracejada dos próximos dias e a legenda "Projeção"', () => {
    mocks.treinos = [planejado()];
    render(raiz, sessao);
    const grafico = raiz.querySelector('.bloco-grafico');
    expect(grafico.querySelectorAll('polyline')).toHaveLength(4); // fitness e fadiga: cheias + tracejadas
    expect(grafico.querySelectorAll('polyline.serie-projetada')).toHaveLength(2);
    expect(grafico.querySelector('.grafico-projecao-rotulo')).not.toBeNull();
    expect(grafico.querySelector('.legenda-inline').textContent).toContain('Projeção');
  });

  it('sem plano, o gráfico não tem projeção nem a legenda', () => {
    mocks.treinos = [];
    render(raiz, sessao);
    const grafico = raiz.querySelector('.bloco-grafico');
    expect(grafico.querySelector('polyline.serie-projetada')).toBeNull();
    expect(grafico.querySelector('.legenda-inline').textContent).not.toContain('Projeção');
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
