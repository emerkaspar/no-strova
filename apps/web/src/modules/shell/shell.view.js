import { situacaoDoPerfilDeTreino } from '@no-strova/domain';
import { observarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { h } from '../../utils/dom.js';
import { render as renderAdmin } from '../admin/admin.view.js';
import { render as renderDetalhe } from '../atividades/detalhe.view.js';
import { render as renderAtividades } from '../atividades/lista.view.js';
import { render as renderConfiguracao } from '../configuracao/configuracao.view.js';
import { render as renderForma } from '../forma/forma.view.js';
import { render as renderInicio } from '../inicio/inicio.view.js';
import { render as renderPeso } from '../peso/peso.view.js';
import { render as renderPlano } from '../plano/plano.view.js';
import { render as renderProgressao } from '../progressao/progressao.view.js';
import { abrirWizard, wizardAberto } from '../onboarding/wizard.js';
import { render as renderTreinos } from '../treinos/treinos.view.js';
import { criarCabecalho } from './cabecalho.js';

// Itens do menu principal (a tela de Forma abre pelo Início e não tem item próprio; a Administração fica no menu da conta).
const MENU = [
  { caminho: '#/inicio', rotulo: 'Início', icone: 'inicio' },
  { caminho: '#/atividades', rotulo: 'Atividades', icone: 'atividades' },
  { caminho: '#/plano', rotulo: 'Plano', icone: 'plano' },
  { caminho: '#/progressao', rotulo: 'Progressão', icone: 'progressao' },
  { caminho: '#/treinos', rotulo: 'Treinos', icone: 'treinos' },
  { caminho: '#/peso', rotulo: 'Peso', icone: 'peso' },
  { caminho: '#/configuracao', rotulo: 'Configuração', icone: 'configuracao' },
];

/** Resolve o hash em { menu, render, params }. Rotas desconhecidas ou proibidas caem no Início. */
function resolverRota(hash, admin) {
  const detalhe = /^#\/atividades\/([A-Za-z0-9_-]{8,40})$/.exec(hash);
  if (detalhe) return { menu: '#/atividades', render: renderDetalhe, params: { id: detalhe[1] } };
  // as antigas abas do Plano viraram seções da mesma página: a rota rola até a seção correspondente
  const plano = /^#\/plano\/(projecao|calendario|provas|acompanhamento)$/.exec(hash);
  if (plano) return { menu: '#/plano', render: renderPlano, params: { secao: plano[1] } };
  switch (hash) {
    case '#/forma':
      return { menu: '#/inicio', render: renderForma, params: {} };
    case '#/atividades':
      return { menu: hash, render: renderAtividades, params: {} };
    case '#/plano':
      return { menu: hash, render: renderPlano, params: {} };
    case '#/progressao':
      return { menu: hash, render: renderProgressao, params: {} };
    case '#/treinos':
      return { menu: hash, render: renderTreinos, params: {} };
    case '#/peso':
      return { menu: hash, render: renderPeso, params: {} };
    case '#/configuracao':
      return { menu: hash, render: renderConfiguracao, params: {} };
    case '#/admin':
      if (admin) return { menu: hash, render: renderAdmin, params: {} };
      break;
    default:
  }
  return { menu: '#/inicio', render: renderInicio, params: {} };
}

/** O wizard abre sozinho uma vez por carregamento da página (quem fecha sem concluir vê a faixa do Início). */
let wizardJaOferecido = false;

export function render(raiz, sessao) {
  const cabecalho = criarCabecalho(sessao, MENU);
  const saida = h('main', { class: 'container conteudo' });
  const faixa = h(
    'div',
    { class: 'container faixa-perfil-wrap', hidden: true },
    h(
      'aside',
      { class: 'faixa-perfil', 'aria-label': 'Perfil de treino incompleto' },
      h('p', null, h('strong', null, 'Falta preencher o seu perfil de treino.'), h('span', null, 'Sem os seus números, o app só chuta zonas, HRSS e plano.')),
      h('button', { class: 'btn', type: 'button', onClick: () => abrirWizard({ sessao }) }, 'Completar perfil'),
    ),
  );
  let destruirRota = null;
  let menuAtual = '#/inicio';
  let situacao = 'ok';
  const dadosPerfil = { preferencias: undefined, configs: undefined };

  function atualizarFaixa() {
    faixa.hidden = !(situacao === 'pulado' && menuAtual === '#/inicio');
  }

  /** Reavalia o perfil quando as preferências e as configurações já chegaram. */
  function avaliarPerfil() {
    if (dadosPerfil.preferencias === undefined || dadosPerfil.configs === undefined) return;
    situacao = situacaoDoPerfilDeTreino(dadosPerfil);
    atualizarFaixa();
    if (situacao === 'novo' && !wizardJaOferecido && !wizardAberto()) {
      wizardJaOferecido = true;
      abrirWizard({ sessao, primeiraVez: true });
    }
  }

  const cancelarPerfil = [
    observarPreferencias(
      sessao.uid,
      (p) => {
        dadosPerfil.preferencias = p;
        avaliarPerfil();
      },
      () => {},
    ),
    observarConfigs(
      sessao.uid,
      (c) => {
        dadosPerfil.configs = c;
        avaliarPerfil();
      },
      () => {},
    ),
  ];

  function desenharRota() {
    destruirRota?.();
    const rota = resolverRota(window.location.hash, sessao.admin);
    cabecalho.marcarAtivo(rota.menu);
    menuAtual = rota.menu;
    atualizarFaixa();
    window.scrollTo(0, 0);
    destruirRota = rota.render(saida, sessao, rota.params);
  }

  raiz.replaceChildren(cabecalho.topo, faixa, saida, cabecalho.abas);

  window.addEventListener('hashchange', desenharRota);
  desenharRota();

  return () => {
    window.removeEventListener('hashchange', desenharRota);
    cabecalho.destruir();
    cancelarPerfil.forEach((fn) => fn());
    destruirRota?.();
  };
}
