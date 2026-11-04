import { analisarTesteLthr, configAposTeste, configVigenteEm, hrssPorHoraCalibrado, TESTE_LTHR } from '@no-strova/domain';
import { reconstruirCalibracao } from '../../core/functions.js';
import { lerSerieFc } from '../../infrastructure/atividadesRepo.js';
import { salvarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { salvarConfig } from '../../infrastructure/configsRepo.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { confirmar } from '../../utils/modal.js';

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

  const botaoRefazer = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Refazer a calibração');
  botaoRefazer.addEventListener('click', () =>
    executarComBotao(botaoRefazer, mensagem, async () => {
      const r = await reconstruirCalibracao();
      mensagem.mostrar(`Calibração refeita com ${r.amostras} atividade${r.amostras === 1 ? '' : 's'}.`, 'ok');
    }),
  );

  return h(
    'section',
    { class: 'card', id: 'calibracao' },
    h('h2', null, 'Calibração das estimativas'),
    h(
      'p',
      { class: 'texto-secundario' },
      'A estimativa de HRSS dos treinos planejados parte de uma fórmula (a FC média típica de cada zona). Com a calibração, o app aprende com as suas atividades já feitas, com FC real, quanto HRSS por hora você de fato faz em cada esporte e zona, e mistura isso com a fórmula: quanto mais atividades, mais peso para o seu histórico. Atualiza sozinha a cada importação.',
    ),
    h('label', { class: 'opcao', for: 'cal-ativa' }, caixa, ' Usar a calibração nas estimativas dos treinos planejados'),
    chaves.length === 0
      ? h('p', { class: 'vazio-curto' }, 'Ainda sem dados suficientes: cada esporte e zona precisa de pelo menos 3 atividades com FC de 20 minutos ou mais.')
      : h(
          'div',
          { class: 'tabela-wrap' },
          h(
            'table',
            { class: 'tabela tabela-compacta' },
            h('thead', null, h('tr', null, ...['Esporte', 'Zona', 'Atividades', 'Seu HRSS/h', 'Fórmula (HRSS/h)', 'Peso da calibração'].map((t) => h('th', { scope: 'col' }, t)))),
            h('tbody', null, ...linhas),
          ),
        ),
    mensagem.el,
    botaoRefazer,
  );
}

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
  const select = h('select', { id: 'teste-atividade', name: 'teste-atividade' });
  const botaoAnalisar = h('button', { class: 'btn', type: 'button' }, 'Analisar esta atividade');
  const dicaSemOpcoes = h('p', { class: 'vazio-curto' }, 'Importe uma atividade de pelo menos 30 minutos com frequência cardíaca para analisá-la aqui.');

  const candidatas = () => atividades.filter((a) => a.origem === 'arquivo' && a.fcMedia && (a.duracaoS ?? 0) >= TESTE_LTHR.janelaS).slice(0, 40);
  const rotulo = (a) => `${formatarData(a.data)} · ${ROTULO_ESPORTE[a.esporte] ?? a.esporte} · ${formatarDuracao(a.duracaoS)} · FC média ${a.fcMedia} bpm`;

  function atualizarOpcoes() {
    const atual = select.value;
    const lista = candidatas();
    select.replaceChildren(...lista.map((a) => h('option', { value: a.id }, rotulo(a))));
    if (lista.some((a) => a.id === atual)) select.value = atual;
    select.hidden = lista.length === 0;
    botaoAnalisar.hidden = lista.length === 0;
    dicaSemOpcoes.hidden = lista.length > 0;
  }

  function mostrarResultado(atividade, analise) {
    const base = configVigenteEm(configs, atividade.data) ?? configs[0] ?? null;
    const maisAlta = base && analise.fcMaxObservada > base.fcMax;
    const caixaFcMax = h('input', { type: 'checkbox', id: 'teste-fcmax', checked: Boolean(maisAlta) });
    const botaoAplicar = h('button', { class: 'btn', type: 'button' }, 'Criar nova vigência com este LTHR');

    botaoAplicar.addEventListener('click', () =>
      executarComBotao(botaoAplicar, mensagem, async () => {
        if (!base) throw new Error('Cadastre primeiro a sua configuração de FC (sexo, peso, altura e FC de repouso), para o app criar a nova vigência a partir dela.');
        const r = configAposTeste({ base, lthr: analise.lthr, fcMaxObservada: analise.fcMaxObservada, atualizarFcMax: caixaFcMax.checked, data: atividade.data });
        if (!r.valido) throw new Error(r.erros.join(' '));
        const existente = configs.find((c) => c.vigenteDesde === r.valores.vigenteDesde);
        const texto = `Criar a vigência de ${formatarData(r.valores.vigenteDesde)} com LTHR ${r.valores.lthr} bpm${r.valores.fcMax !== base.fcMax ? ` e FC máxima ${r.valores.fcMax} bpm` : ''}?${existente ? ' Já existe uma configuração com essa data; ela será substituída.' : ''}`;
        if (!(await confirmar({ titulo: 'Criar nova vigência?', mensagem: texto, confirmarTexto: 'Criar vigência', tipo: 'info', icone: 'configuracao' }))) return;
        await salvarConfig(uid, r.valores);
        mensagem.mostrar(`Vigência de ${formatarData(r.valores.vigenteDesde)} criada com LTHR ${r.valores.lthr} bpm. Use “Recalcular histórico” para aplicar às atividades já importadas.`, 'ok');
      }),
    );

    // replaceChildren(null) escreveria "null" na tela: os blocos opcionais saem da lista antes
    resultado.replaceChildren(
      ...[
      h(
        'div',
        { class: 'teste-numeros' },
        h('div', { class: 'teste-numero' }, h('span', { class: 'teste-rotulo' }, 'LTHR sugerido'), h('strong', { class: 'teste-lthr' }, `${analise.lthr} bpm`), h('span', { class: 'teste-nota' }, 'média dos últimos 20 min da melhor janela de 30 min')),
        h('div', { class: 'teste-numero' }, h('span', { class: 'teste-rotulo' }, 'FC média dos 30 min'), h('strong', null, `${analise.mediaJanela} bpm`), h('span', { class: 'teste-nota' }, `de ${formatarDuracao(analise.inicioS)} a ${formatarDuracao(analise.fimS)} da atividade`)),
        h('div', { class: 'teste-numero' }, h('span', { class: 'teste-rotulo' }, 'FC máxima observada'), h('strong', null, `${analise.fcMaxObservada} bpm`), base ? h('span', { class: 'teste-nota' }, `configurada: ${base.fcMax} bpm`) : null),
      ),
      ...analise.avisos.map((a) => h('p', { class: 'mensagem mensagem-aviso' }, a)),
      maisAlta
        ? h('label', { class: 'opcao', for: 'teste-fcmax' }, caixaFcMax, ` Atualizar também a FC máxima para ${analise.fcMaxObservada} bpm (a observada passou da configurada)`)
        : null,
      h('p', { class: 'texto-secundario' }, `A nova vigência vale a partir de ${formatarData(atividade.data)}, a data do teste.`),
      botaoAplicar,
      ].filter(Boolean),
    );
  }

  botaoAnalisar.addEventListener('click', () =>
    executarComBotao(botaoAnalisar, mensagem, async () => {
      resultado.replaceChildren();
      const atividade = atividades.find((a) => a.id === select.value);
      if (!atividade) throw new Error('Escolha uma atividade.');
      const serie = await lerSerieFc(atividade.id);
      if (!serie?.fc?.length) throw new Error('Esta atividade não tem série de frequência cardíaca guardada.');
      const analise = analisarTesteLthr(serie, configVigenteEm(configs, atividade.data) ?? configs[0] ?? null);
      if (!analise) throw new Error('Não achei 30 minutos seguidos de FC nesta atividade. O teste precisa de pelo menos 30 minutos de esforço contínuo.');
      mostrarResultado(atividade, analise);
    }),
  );

  const raiz = h(
    'section',
    { class: 'card', id: 'teste-lthr' },
    h('h2', null, 'Teste de LTHR'),
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
  );
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
