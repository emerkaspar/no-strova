import { CATALOGO_TREINOS, FOCOS, modelosDoCatalogo, NIVEIS, somarDias } from '@no-strova/domain';
import { montarSerie } from '../../application/forma.js';
import { excluirModeloProprio, modelosProprios, salvarNivelDosTreinos } from '../../application/treinos.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarModelos } from '../../infrastructure/modelosRepo.js';
import { observarTreinos } from '../../infrastructure/planoRepo.js';
import { observarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { hojeIso } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { criarCartaoTreino } from './cartaoTreino.js';
import { criarConstrutor } from './construtor.js';
import { criarDetalheTreino } from './detalhe.js';
import { criarAbaSugestoes } from './sugestoes.js';
import { estadoTreinos } from './state.js';

/** Quantos dias de histórico a sugestão considera (o suficiente para a regra de não repetir em 6 semanas). */
const DIAS_DE_HISTORICO = 45;

const ABAS = [
  { id: 'sugestoes', rotulo: 'Sugestões' },
  { id: 'biblioteca', rotulo: 'Biblioteca' },
  { id: 'meus', rotulo: 'Meus treinos' },
];

/**
 * Treinos intervalados: sugestões para a semana (por regras), biblioteca do sistema (ciclismo e corrida, por foco e
 * nível) e os treinos próprios do usuário, com construtor. Cada treino pode ir para o plano ou para o relógio (.fit).
 */
export function render(raiz, sessao) {
  const hoje = hojeIso();
  const dados = { treinos: [], configs: [], modelos: [], dias: [], preferencias: null };
  const carregou = { treinos: false, configs: false, modelos: false, dias: false, preferencias: false };
  let ativa = true;
  const cancelar = [];

  const nivel = () => dados.preferencias?.nivelTreinos ?? 'intermediario';
  const proprios = () => modelosProprios(dados.modelos);
  const mensagem = areaMensagem();

  const cabecalho = h('section', { class: 'card' });
  const aberto = h('div');
  const conteudo = h('div', { class: 'pilha' });
  raiz.replaceChildren(h('div', { class: 'pilha' }, cabecalho, aberto, conteudo));

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
            estadoTreinos.aba = 'meus';
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
      h('h1', null, 'Treinos intervalados'),
      h(
        'p',
        { class: 'texto-secundario' },
        'Uma biblioteca de treinos para ciclismo e corrida, por foco e nível, com sugestões para a semana. Escolha um, leve para o plano ou para o relógio, ou crie o seu.',
      ),
      h(
        'div',
        { class: 'treinos-controles' },
        h('div', null, h('p', { class: 'cg-mini-rotulo' }, 'Esporte'), segmentado('Esporte', [['ciclismo', 'Ciclismo'], ['corrida', 'Corrida']], estadoTreinos.esporte, (v) => {
          estadoTreinos.esporte = v;
          estadoTreinos.recusados = [];
          estadoTreinos.desmarcadas = [];
          desenhar();
        })),
        h('div', null, h('p', { class: 'cg-mini-rotulo' }, 'Nível'), segmentado('Nível', Object.entries(NIVEIS), nivel(), (v) => {
          dados.preferencias = { ...(dados.preferencias ?? {}), nivelTreinos: v };
          estadoTreinos.recusados = [];
          estadoTreinos.desmarcadas = [];
          desenhar();
          salvarNivelDosTreinos(sessao.uid, v).catch(() => mensagem.mostrar('Não foi possível salvar o nível.'));
        })),
      ),
      mensagem.el,
      h('div', { class: 'treinos-abas', role: 'tablist', 'aria-label': 'Seções' }, ...ABAS.map((a) =>
        h('button', { class: 'treinos-aba', type: 'button', role: 'tab', 'aria-selected': String(estadoTreinos.aba === a.id), onClick: () => {
          estadoTreinos.aba = a.id;
          mensagem.limpar();
          desenhar();
        } }, a.rotulo),
      )),
    );
  }

  function grade(modelos, acoes = () => []) {
    const config = dados.configs[0] ?? null;
    return modelos.length === 0
      ? h('p', { class: 'vazio-curto' }, 'Nenhum treino com esses filtros.')
      : h('div', { class: 'treinos-grade' }, ...modelos.map((m) => criarCartaoTreino({ modelo: m, config, acoes: acoes(m), aoAbrir: abrirDetalhe })));
  }

  function desenharConteudo() {
    const pronto = Object.values(carregou).every(Boolean);
    if (!pronto) {
      conteudo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
      return;
    }
    const esporte = estadoTreinos.esporte;
    if (estadoTreinos.aba === 'sugestoes') {
      const serie = montarSerie(dados.dias, hoje);
      const forma = serie.length > 0 ? serie[serie.length - 1].forma : null;
      conteudo.replaceChildren(
        criarAbaSugestoes({
          uid: sessao.uid,
          hoje,
          esporte,
          nivel: nivel(),
          treinos: dados.treinos,
          configs: dados.configs,
          proprios: proprios(),
          forma,
          aoVer: abrirDetalhe,
          aoMudar: desenhar,
        }),
      );
      return;
    }
    if (estadoTreinos.aba === 'biblioteca') {
      const foco = h(
        'select',
        { id: 'filtro-foco', 'aria-label': 'Foco' },
        h('option', { value: '' }, 'Todos os focos'),
        ...Object.entries(FOCOS).map(([id, f]) => h('option', { value: id, selected: id === estadoTreinos.foco }, f.rotulo)),
      );
      foco.addEventListener('change', () => {
        estadoTreinos.foco = foco.value;
        desenhar();
      });
      const lista = modelosDoCatalogo({ esporte, nivel: nivel(), foco: estadoTreinos.foco || undefined });
      conteudo.replaceChildren(
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'bloco-topo' }, h('h2', null, 'Biblioteca'), foco),
          h('p', { class: 'texto-secundario' }, `${lista.length} treino${lista.length === 1 ? '' : 's'} ${(NIVEIS[nivel()] ?? '').toLowerCase()}${lista.length === 1 ? '' : 's'} de ${(ROTULO_ESPORTE[esporte] ?? esporte).toLowerCase()}. Mude o nível acima para ver os outros.`),
          grade(lista),
        ),
      );
      return;
    }
    const meus = proprios().filter((m) => m.esporte === esporte);
    conteudo.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'bloco-topo' }, h('h2', null, 'Meus treinos'), h('button', { class: 'btn', type: 'button', onClick: () => abrirConstrutor(null) }, 'Criar treino')),
        h('p', { class: 'texto-secundario' }, 'Os seus treinos aparecem também nas sugestões, no mesmo nível e esporte. Dá para duplicar e editar qualquer treino da biblioteca.'),
        meus.length === 0 ? h('p', { class: 'vazio-curto' }, `Você ainda não criou treinos de ${(ROTULO_ESPORTE[esporte] ?? esporte).toLowerCase()}.`) : grade(meus),
      ),
    );
  }

  function desenhar() {
    if (!ativa) return;
    desenharCabecalho();
    desenharAberto();
    desenharConteudo();
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
  );

  return () => {
    ativa = false;
    cancelar.forEach((fn) => fn());
  };
}
