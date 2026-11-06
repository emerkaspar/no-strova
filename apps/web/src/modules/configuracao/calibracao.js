import { avaliarTesteLthr, configVigenteEm, hrssPorHoraCalibrado } from '@no-strova/domain';
import { reconstruirCalibracao } from '../../core/functions.js';
import { salvarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { formatarData, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { analisarAtividadeLthr, montarResultadoLthr } from './resultadoLthr.js';
import { criarControlePopover } from '../inicio/semanaPopover.js';
import { secaoRecolhivel } from './secaoRecolhivel.js';

const ZONAS_EM_ORDEM = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

/** "ciclismo_Z2" → { esporte: 'ciclismo', zona: 'Z2' }. */
function separarChave(chave) {
  const [esporte, zona] = chave.split('_');
  return { esporte, zona };
}

/**
 * Cartão "Calibração das estimativas": explica, mostra o que o app aprendeu com o histórico (por esporte e zona) e
 * deixa ligar ou desligar o uso nas estimativas dos treinos planejados.
 * @param {{ uid: string, configs: any[], calibracao: any, preferencias: any }} p
 */
export function criarCartaoCalibracao({ uid, configs, calibracao, preferencias }) {
  const ativa = preferencias?.calibracaoAtiva !== false;
  controlePopover.fechar(); // o cartão é redesenhado a cada atualização: não deixa popover órfão
  const mensagem = areaMensagem();
  const config = configs[0] ?? null; // a mais recente

  const caixa = h('input', { type: 'checkbox', id: 'cal-ativa', checked: ativa });
  caixa.addEventListener('change', async () => {
    mensagem.limpar();
    caixa.disabled = true;
    try {
      await salvarPreferencias(uid, { calibracaoAtiva: caixa.checked });
      mensagem.mostrar(caixa.checked ? 'Calibração ligada: as estimativas dos treinos planejados usam o seu histórico.' : 'Calibração desligada: as estimativas voltam à fórmula.', 'ok');
    } catch {
      caixa.checked = !caixa.checked;
      mensagem.mostrar('Não foi possível salvar a preferência.');
    } finally {
      caixa.disabled = false;
    }
  });

  const chaves = Object.entries(calibracao?.chaves ?? {})
    .map(([chave, entrada]) => ({ ...separarChave(chave), ...entrada }))
    .sort((a, b) => (a.esporte === b.esporte ? ZONAS_EM_ORDEM.indexOf(a.zona) - ZONAS_EM_ORDEM.indexOf(b.zona) : a.esporte < b.esporte ? -1 : 1));

  const linhas = chaves.map((c) => {
    const r = hrssPorHoraCalibrado({ esporte: c.esporte, zona: c.zona, config, calibracao });
    return h(
      'tr',
      null,
      h('td', null, ROTULO_ESPORTE[c.esporte] ?? c.esporte),
      h('td', null, c.zona),
      h('td', null, String(c.n)),
      h('td', { class: 'celula-hrss' }, formatarNumero(c.mediana, 1)),
      h('td', null, r.formula === null ? '—' : formatarNumero(r.formula, 1)),
      h('td', null, r.calibrado ? `${formatarNumero(r.peso * 100, 0)}%` : `precisa de ${3 - c.n > 0 ? 3 - c.n : 0} a mais`),
    );
  });

  const botaoRefazer = h(
    'button',
    {
      class: 'cal-refazer-link',
      type: 'button',
      title: 'Lê todas as suas atividades de novo e monta esta tabela do zero. Não altera nenhuma atividade. Depois de mudar a configuração ou o LTHR, o “Recalcular histórico” já faz isso junto.',
    },
    'Refazer a calibração',
  );
  botaoRefazer.addEventListener('click', () =>
    executarComBotao(botaoRefazer, mensagem, async () => {
      const r = await reconstruirCalibracao();
      mensagem.mostrar(`Calibração refeita com ${r.amostras} atividade${r.amostras === 1 ? '' : 's'}.`, 'ok');
    }),
  );

  const tabela =
    chaves.length === 0
      ? h('p', { class: 'vazio-curto' }, 'Ainda sem dados suficientes: cada esporte e zona precisa de pelo menos 3 atividades com FC de 20 minutos ou mais.')
      : h(
          'div',
          { class: 'tabela-wrap' },
          h(
            'table',
            { class: 'tabela tabela-compacta' },
            h(
              'thead',
              null,
              h('tr', null, ...GUIA_DAS_COLUNAS.map((item) => cabecalho(item))),
            ),
            h('tbody', null, ...linhas),
          ),
        );

  return secaoRecolhivel({
    id: 'calibracao',
    titulo: 'Calibração das estimativas',
    corpo: [
      h(
        'p',
        { class: 'texto-secundario' },
        'A estimativa de HRSS dos treinos planejados parte de uma fórmula (a FC média típica de cada zona). Com a calibração, o app aprende com as suas atividades já feitas, com FC real, quanto HRSS por hora você de fato faz em cada esporte e zona, e mistura isso com a fórmula: quanto mais atividades, mais peso para o seu histórico. Atualiza sozinha a cada importação.',
      ),
      h('label', { class: 'opcao', for: 'cal-ativa' }, caixa, ' Usar a calibração nas estimativas dos treinos planejados'),
      tabela,
      chaves.length > 0 ? h('p', { class: 'dica' }, 'Passe o mouse (ou toque) no nome de uma coluna para ver o que ela significa.') : null,
      h(
        'div',
        { class: 'cal-refazer' },
        h('span', null, 'A tabela se atualiza sozinha. Algo parece errado ou desatualizado?'),
        botaoRefazer,
        mensagem.el,
      ),
    ],
  });
}

const controlePopover = criarControlePopover();

/** Cabeçalho de coluna que abre um popover explicativo ao passar o mouse, focar (teclado) ou tocar (celular). */
function cabecalho(item) {
  const th = h('th', { scope: 'col', class: 'cal-coluna', tabIndex: 0 }, item.coluna);
  const conteudo = () => [
    h('p', { class: 'dia-pop-titulo' }, item.coluna),
    ...item.paragrafos.map((p) => h('p', { class: 'cal-pop-texto' }, p)),
    item.exemplo ? h('p', { class: 'cal-pop-exemplo' }, h('strong', null, 'Exemplo: '), item.exemplo) : null,
  ];
  const abrir = (opcoes) => controlePopover.abrir(th, conteudo, { rotulo: item.coluna, ...opcoes });
  th.addEventListener('mouseenter', () => abrir());
  th.addEventListener('mouseleave', controlePopover.agendarFechar);
  th.addEventListener('focus', () => abrir());
  th.addEventListener('click', () => {
    if (controlePopover.coluna() === th && controlePopover.fixado()) controlePopover.fechar();
    else abrir({ fixar: true });
  });
  return th;
}

/** Explicação de cada coluna da tabela, com exemplos genéricos (números inventados, não são os do usuário). */
const GUIA_DAS_COLUNAS = [
  {
    coluna: 'Esporte',
    paragrafos: ['O esporte das atividades usadas no cálculo. Ciclismo e corrida são calibrados separadamente, porque a mesma zona de FC rende um HRSS diferente em cada um.'],
  },
  {
    coluna: 'Zona',
    paragrafos: [
      'A zona de frequência cardíaca, de Z1 (bem leve) a Z5 (máximo). Ela vem do seu LTHR vigente na data de cada atividade, e cada atividade entra na zona em que passou mais tempo.',
      'É a mesma zona dos treinos planejados: um treino em Z2 usa a linha “Z2” do esporte dele.',
    ],
  },
  {
    coluna: 'Atividades',
    paragrafos: [
      'Quantas atividades suas já feitas alimentam aquela linha. Só contam as de 20 minutos ou mais e com frequência cardíaca real; treinos curtos ou sem FC ficam de fora.',
      'O app guarda as 30 mais recentes de cada esporte e zona, então a calibração acompanha a sua forma atual.',
    ],
    exemplo: 'quatro pedaladas em Z2, todas com mais de 20 minutos e com FC, aparecem como 4.',
  },
  {
    coluna: 'Seu HRSS/h',
    paragrafos: [
      'O HRSS (estresse do treino) que você realmente acumula por hora naquele esporte e zona. É a mediana, isto é, o valor do meio, então um dia fora do normal não distorce o resultado.',
      'Acima da fórmula: o mesmo treino pesa mais para você do que o previsto. Abaixo: pesa menos.',
    ],
    exemplo: 'três atividades fizeram 40, 50 e 90 HRSS por hora. A mediana é 50 (o 90 isolado não puxa o número).',
  },
  {
    coluna: 'Fórmula (HRSS/h)',
    paragrafos: [
      'O HRSS por hora que o app estima sem olhar o seu histórico. Ela usa a FC média típica da zona e a sua configuração de atleta (LTHR, FC máxima, FC de repouso e sexo).',
      'É o ponto de partida: com poucas atividades, a estimativa fica perto desse valor.',
    ],
    exemplo: 'a fórmula diz que uma hora em Z2 dá 60 de HRSS.',
  },
  {
    coluna: 'Peso da calibração',
    paragrafos: [
      'Quanto a estimativa confia no seu histórico em vez da fórmula. O cálculo é atividades ÷ (atividades + 5): 3 atividades dão 38%, 5 dão 50%, 10 dão 67% e 30 dão 86%. Nunca chega a 100%.',
      'Com menos de 3 atividades a calibração ainda não entra (“precisa de N a mais”) e vale só a fórmula.',
      'A estimativa final por hora é: peso × seu HRSS/h + (1 − peso) × fórmula.',
    ],
    exemplo: 'com 5 atividades o peso é 50%. Se o seu HRSS/h é 80 e a fórmula diz 60, a estimativa é 0,5 × 80 + 0,5 × 60 = 70.',
  },
];

const ROTEIRO_DO_TESTE = [
  'Escolha um trecho plano e constante, sem semáforos e sem cruzamentos (ou uma pista), e pedale ou corra sozinho, sem pegar vácuo.',
  'Aqueça de 15 a 20 minutos, com alguns esforços curtos mais fortes no final.',
  'Faça 30 minutos no maior ritmo que você consegue sustentar até o fim, sem sair rápido demais. Aperte o botão de volta (lap) só se o aparelho precisar; o app acha a janela sozinho.',
  'Volte devagar por uns 10 minutos, salve a atividade com a cinta ou o sensor de FC e importe o arquivo em Atividades.',
  'Volte aqui, escolha a atividade abaixo e analise.',
];

/**
 * Cartão "Teste de LTHR": protocolo de 30 minutos, análise de uma atividade importada (FC amostra a amostra, lida da
 * série já guardada) e criação de uma nova vigência com o LTHR encontrado.
 * @param {{ uid: string }} p
 * @returns {{ raiz: HTMLElement, atualizar: (dados: { configs: any[], atividades: any[] }) => void }}
 */
export function criarCartaoTesteLthr({ uid }) {
  let configs = [];
  let atividades = [];
  const mensagem = areaMensagem();
  const resultado = h('div', { class: 'teste-resultado' });
  const select = seletor({ id: 'teste-atividade', rotulo: 'Atividade do teste' });
  const botaoAnalisar = h('button', { class: 'btn', type: 'button' }, 'Analisar esta atividade');
  const dicaSemOpcoes = h('p', { class: 'vazio-curto' }, 'Importe uma atividade de pelo menos 30 minutos com frequência cardíaca para analisá-la aqui.');

  // as atividades marcadas como teste no "Como foi?" vêm primeiro (e a primeira já fica escolhida)
  const candidatas = () =>
    atividades
      .filter((a) => avaliarTesteLthr(a).elegivel)
      .slice(0, 40)
      .sort((x, y) => Number(y.testeLthr === true) - Number(x.testeLthr === true));
  const rotulo = (a) => `${a.testeLthr ? '★ Teste marcado · ' : ''}${formatarData(a.data)} · ${ROTULO_ESPORTE[a.esporte] ?? a.esporte} · ${formatarDuracao(a.duracaoS)} · FC média ${a.fcMedia} bpm`;

  function atualizarOpcoes() {
    const atual = select.value;
    const lista = candidatas();
    select.definirOpcoes(lista.map((a) => ({ valor: a.id, rotulo: rotulo(a) })), atual);
    select.hidden = lista.length === 0;
    botaoAnalisar.hidden = lista.length === 0;
    dicaSemOpcoes.hidden = lista.length > 0;
  }

  botaoAnalisar.addEventListener('click', () =>
    executarComBotao(botaoAnalisar, mensagem, async () => {
      resultado.replaceChildren();
      const atividade = atividades.find((a) => a.id === select.value);
      if (!atividade) throw new Error('Escolha uma atividade.');
      const analise = await analisarAtividadeLthr(atividade, configs);
      resultado.replaceChildren(...montarResultadoLthr({ uid, atividade, analise, configs, mensagem }));
    }),
  );

  const raiz = secaoRecolhivel({
    id: 'teste-lthr',
    titulo: 'Teste de LTHR',
    corpo: [
      h(
        'p',
        { class: 'texto-secundario' },
        'O LTHR (a FC no seu limiar) define as zonas e o HRSS de tudo. Um valor errado desloca todos os cálculos, então vale medir. O teste de 30 minutos, de Joe Friel, é o mais usado: o LTHR é a FC média dos últimos 20 minutos de um esforço máximo sustentável de 30.',
      ),
      h('ol', { class: 'roteiro' }, ...ROTEIRO_DO_TESTE.map((passo) => h('li', null, passo))),
      h('p', { class: 'texto-secundario' }, 'Se você pedala e corre, faça o teste no esporte que mais treina: o LTHR na corrida costuma ser alguns bpm maior que no pedal.'),
      h('div', { class: 'campo' }, h('label', { for: 'teste-atividade' }, 'Atividade do teste'), select, dicaSemOpcoes),
      mensagem.el,
      botaoAnalisar,
      resultado,
    ],
  });
  atualizarOpcoes();

  return {
    raiz,
    atualizar(dados) {
      configs = dados.configs;
      atividades = dados.atividades;
      atualizarOpcoes();
    },
  };
}
