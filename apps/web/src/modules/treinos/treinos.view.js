import { CATALOGO_TREINOS, FOCOS, modelosDoCatalogo, NIVEIS, RECURSOS, somarDias, temRecurso } from '@no-strova/domain';
import { montarSerie } from '../../application/forma.js';
import { excluirModeloProprio, modelosProprios, salvarNivelDosTreinos } from '../../application/treinos.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarModelos } from '../../infrastructure/modelosRepo.js';
import { observarTreinos } from '../../infrastructure/planoRepo.js';
import { observarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { observarSemanaIa } from '../../infrastructure/semanaIaRepo.js';
import { criarAbas } from '../../utils/abas.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { hojeIso } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { criarCartaoTreino } from './cartaoTreino.js';
import { criarConstrutor } from './construtor.js';
import { criarDetalheTreino } from './detalhe.js';
import { criarPainelSemanaAutomatica } from './semanaAutomatica.js';
import { criarSecaoSugestoes } from './sugestoes.js';
import { estadoTreinos, salvarRecolhidas } from './state.js';
import { criarSecaoTrajetos } from './trajetos/aba.js';

/** Quantos dias de histórico a sugestão considera (o suficiente para a regra de não repetir em 6 semanas). */
const DIAS_DE_HISTORICO = 45;

/**
 * Treinos, numa página só: sugestões para a semana (por regras), a evolução nos trajetos do usuário, a biblioteca do sistema
 * (ciclismo e corrida, por foco e nível) e os treinos próprios, com construtor. As seções podem ser recolhidas (o app lembra)
 * e um índice fixo leva a cada uma. Cada treino pode ir para o plano ou para o relógio (.fit).
 */
export function render(raiz, sessao) {
  const hoje = hojeIso();
  const dados = { treinos: [], configs: [], modelos: [], dias: [], preferencias: null, semanaIa: null };
  const carregou = { treinos: false, configs: false, modelos: false, dias: false, preferencias: false, semanaIa: false };
  let ativa = true;
  const cancelar = [];

  const nivel = () => dados.preferencias?.nivelTreinos ?? 'intermediario';
  /** O usuário liga "Montar minha semana com IA" no Perfil de treino (e tem a IA liberada): a semana é criada sozinha. */
  const semanaAutomatica = () => dados.preferencias?.planoIaAutomatico === true && temRecurso(sessao.perfil, RECURSOS.IA);
  const proprios = () => modelosProprios(dados.modelos);
  const mensagem = areaMensagem();
  /** Seção Trajetos: criada uma vez (tem os próprios listeners) e reaproveitada a cada redesenho da página. */
  const trajetos = criarSecaoTrajetos({
    uid: sessao.uid,
    esporte: estadoTreinos.esporte,
    nivel,
    // treino adaptado salvo: leva o usuário a "Meus treinos", onde ele já aparece com a tag do trajeto
    aoCriarTreino: () => {
      estadoTreinos.aba = 'treinos';
      definirRecolhida('meus', false);
      estadoTreinos.rolarPara = 'meus';
      mensagem.mostrar('Treino salvo em Meus treinos, com o nome do trajeto.', 'ok');
      desenhar();
    },
  });
  cancelar.push(() => trajetos.destruir());

  const cabecalho = h('section', { class: 'card' });
  const controles = h('div', { class: 'treinos-controles' });
  /** Barra fixa com os controles (esporte e nível), sempre à mão ao rolar. */
  const barra = h('div', { class: 'treinos-barra' }, controles);
  const aberto = h('div');
  const secoes = h('div', { class: 'pilha' });
  raiz.replaceChildren(h('div', { class: 'pilha' }, cabecalho, barra, aberto, secoes));

  function segmentado(rotulo, itens, atual, aoEscolher) {
    return h(
      'div',
      { class: 'segmentado', role: 'group', 'aria-label': rotulo },
      ...itens.map(([valor, texto]) =>
        h('button', { class: 'cg-periodo', type: 'button', 'aria-pressed': String(valor === atual), onClick: () => aoEscolher(valor) }, texto),
      ),
    );
  }

  function modeloPorIdAtual(id) {
    return CATALOGO_TREINOS.find((m) => m.id === id) ?? proprios().find((m) => m.id === id) ?? null;
  }

  function abrirDetalhe(modelo) {
    estadoTreinos.modeloAberto = modelo.id;
    estadoTreinos.construtor = null;
    desenhar();
    aberto.firstChild?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function abrirConstrutor(base) {
    estadoTreinos.construtor = { base: base ?? null };
    estadoTreinos.modeloAberto = null;
    desenhar();
    aberto.firstChild?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  // ---------- seções recolhíveis e índice ----------

  const estaRecolhida = (id) => estadoTreinos.recolhidas.includes(id);

  function definirRecolhida(id, recolher) {
    const sem = estadoTreinos.recolhidas.filter((x) => x !== id);
    estadoTreinos.recolhidas = recolher ? [...sem, id] : sem;
    salvarRecolhidas(estadoTreinos.recolhidas);
  }

  /**
   * Seção da página: um cartão com título (que recolhe e abre), ações à direita e o corpo; `fora` é o que fica logo abaixo do
   * cartão (o painel de um trajeto), e some junto quando a seção é recolhida.
   */
  function secao(id, { titulo, acoes = null, corpo, fora = null }) {
    // com a semana automática ligada, "Esta semana" abre recolhida em cada visita: o usuário a abre de propósito
    const forcada = id === 'semana' && semanaAutomatica() && !estadoTreinos.semanaAutoAberta;
    const recolhida = forcada || estaRecolhida(id);
    const corpoId = `treinos-corpo-${id}`;
    const botao = h(
      'button',
      {
        class: 'treinos-secao-titulo',
        type: 'button',
        'aria-expanded': String(!recolhida),
        'aria-controls': corpoId,
        onClick: () => {
          if (forcada) {
            estadoTreinos.semanaAutoAberta = true;
            if (estaRecolhida(id)) definirRecolhida(id, false);
          } else {
            definirRecolhida(id, !recolhida);
          }
          desenhar();
          raiz.querySelector(`#treinos-${id} .treinos-secao-titulo`)?.focus();
        },
      },
      h('h2', null, titulo),
      h('span', { class: 'treinos-secao-seta', 'aria-hidden': 'true' }, '▾'),
    );
    if (fora) fora.hidden = recolhida;
    return h(
      'section',
      { class: 'treinos-secao pilha', id: `treinos-${id}`, 'data-recolhida': String(recolhida) },
      h('div', { class: 'card' }, h('div', { class: 'bloco-topo' }, botao, acoes), h('div', { class: 'treinos-secao-corpo', id: corpoId, hidden: recolhida }, corpo)),
      fora,
    );
  }

  // ---------- partes da página ----------

  function desenharAberto() {
    if (estadoTreinos.construtor) {
      const { base } = estadoTreinos.construtor;
      aberto.replaceChildren(
        criarConstrutor({
          uid: sessao.uid,
          base,
          config: dados.configs[0] ?? null,
          esporteInicial: estadoTreinos.esporte,
          aoSalvar: () => {
            estadoTreinos.construtor = null;
            definirRecolhida('meus', false);
            estadoTreinos.rolarPara = 'meus';
            mensagem.mostrar('Treino salvo em Meus treinos.', 'ok');
            desenhar();
          },
          aoCancelar: () => {
            estadoTreinos.construtor = null;
            desenhar();
          },
        }),
      );
      return;
    }
    const modelo = estadoTreinos.modeloAberto ? modeloPorIdAtual(estadoTreinos.modeloAberto) : null;
    if (!modelo) {
      estadoTreinos.modeloAberto = null;
      aberto.replaceChildren();
      return;
    }
    aberto.replaceChildren(
      criarDetalheTreino({
        uid: sessao.uid,
        modelo,
        configs: dados.configs,
        hoje,
        aoFechar: () => {
          estadoTreinos.modeloAberto = null;
          desenhar();
        },
        aoEditar: (m) => abrirConstrutor(m),
        aoExcluir: async (m) => {
          await excluirModeloProprio(m.id);
          estadoTreinos.modeloAberto = null;
          mensagem.mostrar('Treino excluído.', 'ok');
          desenhar();
        },
      }),
    );
  }

  function desenharCabecalho() {
    cabecalho.replaceChildren(
      h('h1', null, 'Treinos'),
      h(
        'p',
        { class: 'texto-secundario' },
        'Sugestões para a semana, a sua evolução em cada trajeto e uma biblioteca de treinos intervalados para ciclismo e corrida, por foco e nível. Escolha um treino, leve para o plano ou para o relógio, ou crie o seu.',
      ),
      mensagem.el,
    );
  }

  /** Esporte, na barra fixa. Vale para a página inteira. */
  function desenharControles() {
    controles.replaceChildren(
      h('div', { class: 'treinos-controle' }, h('span', { class: 'treinos-controle-rotulo' }, 'Esporte'), segmentado('Esporte', [['ciclismo', 'Ciclismo'], ['corrida', 'Corrida']], estadoTreinos.esporte, (v) => {
        estadoTreinos.esporte = v;
        estadoTreinos.recusados = [];
        estadoTreinos.desmarcadas = [];
        desenhar();
      })),
    );
  }

  /**
   * Nível de um bloco: 'todos' ou um dos níveis. Cada bloco (Esta semana e Biblioteca) tem o seu, na sessão; sem escolha, vale o
   * nível salvo nas preferências. "Todos" nunca é salvo (as regras só aceitam os três níveis).
   * @param {'nivelSemana'|'nivelBiblioteca'} chave
   */
  const nivelDoBloco = (chave) => estadoTreinos[chave] ?? nivel();
  /** O nível que as regras recebem: vazio quer dizer todos. */
  const nivelParaRegras = (chave) => (nivelDoBloco(chave) === 'todos' ? undefined : nivelDoBloco(chave));

  function seletorDeNivel(chave) {
    return h(
      'div',
      { class: 'treinos-controle' },
      h('span', { class: 'treinos-controle-rotulo' }, 'Nível'),
      segmentado('Nível', [['todos', 'Todos'], ...Object.entries(NIVEIS)], nivelDoBloco(chave), (v) => {
        estadoTreinos[chave] = v;
        if (chave === 'nivelSemana') {
          estadoTreinos.recusados = [];
          estadoTreinos.desmarcadas = [];
          // o nível das sugestões fica salvo, para a próxima visita
          if (v !== 'todos') {
            dados.preferencias = { ...(dados.preferencias ?? {}), nivelTreinos: v };
            salvarNivelDosTreinos(sessao.uid, v).catch(() => mensagem.mostrar('Não foi possível salvar o nível.'));
          }
        }
        desenhar();
      }),
    );
  }

  function grade(modelos) {
    const config = dados.configs[0] ?? null;
    return modelos.length === 0
      ? h('p', { class: 'vazio-curto' }, 'Nenhum treino com esses filtros.')
      : h('div', { class: 'treinos-grade' }, ...modelos.map((m) => criarCartaoTreino({ modelo: m, config, acoes: [], aoAbrir: abrirDetalhe })));
  }

  function desenharSecoes() {
    const esporte = estadoTreinos.esporte;
    const nomeEsporte = (ROTULO_ESPORTE[esporte] ?? esporte).toLowerCase();
    trajetos.definirEsporte(esporte);
    const pronto = Object.values(carregou).every(Boolean);
    const carregando = h('p', { class: 'vazio', role: 'status' }, 'Carregando…');

    // Esta semana
    let corpoSemana = carregando;
    const automatica = semanaAutomatica();
    if (pronto) {
      const serie = montarSerie(dados.dias, hoje);
      const forma = serie.length > 0 ? serie[serie.length - 1].forma : null;
      const sugestoesManuais = () => criarSecaoSugestoes({
        uid: sessao.uid,
        hoje,
        esporte,
        nivel: nivelParaRegras('nivelSemana'),
        treinos: dados.treinos,
        configs: dados.configs,
        proprios: proprios(),
        forma,
        aoVer: abrirDetalhe,
        aoMudar: desenhar,
      });
      corpoSemana = !automatica
        ? sugestoesManuais()
        : h(
            'div',
            { class: 'pilha' },
            criarPainelSemanaAutomatica({
              uid: sessao.uid,
              hoje,
              semana: dados.semanaIa,
              treinos: dados.treinos,
              configs: dados.configs,
              proprios: proprios(),
              liberada: estadoTreinos.semanaManualLiberada,
              aoLiberar: () => {
                estadoTreinos.semanaManualLiberada = true;
                desenhar();
              },
              aoMudar: desenhar,
            }),
            estadoTreinos.semanaManualLiberada ? sugestoesManuais() : null,
          );
    }

    // Biblioteca
    let corpoBiblioteca = carregando;
    let acoesBiblioteca = null;
    if (pronto) {
      const foco = seletor({
        id: 'filtro-foco',
        rotulo: 'Foco',
        opcoes: [{ valor: '', rotulo: 'Todos os focos' }, ...Object.entries(FOCOS).filter(([id]) => id !== 'recorde').map(([id, f]) => ({ valor: id, rotulo: f.rotulo }))],
        valor: estadoTreinos.foco ?? '',
      });
      foco.addEventListener('change', () => {
        estadoTreinos.foco = foco.value;
        desenhar();
      });
      const lista = modelosDoCatalogo({ esporte, nivel: nivelParaRegras('nivelBiblioteca'), foco: estadoTreinos.foco || undefined });
      acoesBiblioteca = h('div', { class: 'treinos-secao-acoes' }, seletorDeNivel('nivelBiblioteca'), foco);
      const nomeNivel = nivelParaRegras('nivelBiblioteca') ? ` ${NIVEIS[nivelDoBloco('nivelBiblioteca')].toLowerCase()}${lista.length === 1 ? '' : 's'}` : '';
      corpoBiblioteca = h(
        'div',
        { class: 'pilha' },
        h('p', { class: 'texto-secundario' }, `${lista.length} treino${lista.length === 1 ? '' : 's'}${nomeNivel} de ${nomeEsporte}${nivelParaRegras('nivelBiblioteca') ? '' : ', de todos os níveis'}.`),
        grade(lista),
      );
    }

    // Meus treinos
    let corpoMeus = carregando;
    if (pronto) {
      const meus = proprios().filter((m) => m.esporte === esporte);
      corpoMeus = h(
        'div',
        { class: 'pilha' },
        h('p', { class: 'texto-secundario' }, 'Os seus treinos aparecem também nas sugestões, no mesmo nível e esporte. Dá para duplicar e editar qualquer treino da biblioteca.'),
        meus.length === 0 ? h('p', { class: 'vazio-curto' }, `Você ainda não criou treinos de ${nomeEsporte}.`) : grade(meus),
      );
    }

    const painelTreinos = h(
      'div',
      { class: 'pilha' },
      secao('semana', { titulo: 'Esta semana', acoes: pronto && (!automatica || estadoTreinos.semanaManualLiberada) ? h('div', { class: 'treinos-secao-acoes' }, seletorDeNivel('nivelSemana')) : null, corpo: corpoSemana }),
      secao('biblioteca', { titulo: 'Biblioteca', acoes: acoesBiblioteca, corpo: corpoBiblioteca }),
      secao('meus', {
        titulo: 'Meus treinos',
        acoes: h('div', { class: 'treinos-secao-acoes' }, h('button', { class: 'btn', type: 'button', onClick: () => abrirConstrutor(null) }, 'Criar treino')),
        corpo: corpoMeus,
      }),
    );
    // "Trajetos de Treino" fica na própria aba; o painel do trajeto escolhido abre logo abaixo dos badges
    const painelTrajetos = h(
      'div',
      { class: 'pilha' },
      h('section', { class: 'treinos-secao pilha', id: 'treinos-trajetos' }, h('div', { class: 'card' }, h('h2', null, 'Trajetos de Treino'), trajetos.el), trajetos.painelEl),
    );

    // a aba em uso vem do estado da sessão; um pedido de rolagem leva à aba onde a seção está
    const anterior = estadoTreinos.aba;
    const abas = criarAbas({
      chave: 'ns:treinos:aba',
      rotuloAria: 'Treinos e trajetos',
      aoSelecionar: (id) => { estadoTreinos.aba = id; },
      abas: [
        { id: 'treinos', nome: 'Treinos', icone: 'treinos', painel: painelTreinos },
        { id: 'trajetos', nome: 'Trajetos de Treino', icone: 'rota', painel: painelTrajetos },
      ],
    });
    const desejada = estadoTreinos.rolarPara ? (estadoTreinos.rolarPara === 'trajetos' ? 'trajetos' : 'treinos') : anterior;
    if (desejada === 'treinos' || desejada === 'trajetos') abas.selecionar(desejada);
    secoes.replaceChildren(abas.lista, ...abas.paineis);
  }

  function desenhar() {
    if (!ativa) return;
    desenharCabecalho();
    desenharControles();
    desenharAberto();
    desenharSecoes();
    // pedido de rolagem (vindo do detalhe da atividade ou do construtor): vale uma vez só
    const destino = estadoTreinos.rolarPara;
    if (destino) {
      estadoTreinos.rolarPara = null;
      requestAnimationFrame(() => raiz.querySelector(`#treinos-${destino}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
    }
  }
  desenhar();

  const aoErro = () => mensagem.mostrar('Não foi possível carregar alguns dados. Tente recarregar a página.');
  const ouvir = (chave, assinar) =>
    assinar((lista) => {
      dados[chave] = lista;
      carregou[chave] = true;
      desenhar();
    });
  cancelar.push(
    ouvir('treinos', (cb) => observarTreinos(sessao.uid, somarDias(hoje, -DIAS_DE_HISTORICO), cb, aoErro)),
    ouvir('configs', (cb) => observarConfigs(sessao.uid, cb, aoErro)),
    ouvir('modelos', (cb) => observarModelos(sessao.uid, cb, aoErro)),
    ouvir('dias', (cb) => observarEstresseDiario(sessao.uid, cb, aoErro)),
    ouvir('preferencias', (cb) => observarPreferencias(sessao.uid, cb, aoErro)),
    ouvir('semanaIa', (cb) => observarSemanaIa(sessao.uid, cb, aoErro)),
  );

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
