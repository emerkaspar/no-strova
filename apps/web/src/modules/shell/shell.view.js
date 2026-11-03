import { h } from '../../utils/dom.js';
import { render as renderAprovacoes } from '../admin/aprovacoes.view.js';
import { render as renderDetalhe } from '../atividades/detalhe.view.js';
import { render as renderAtividades } from '../atividades/lista.view.js';
import { render as renderConfiguracao } from '../configuracao/configuracao.view.js';
import { render as renderForma } from '../forma/forma.view.js';
import { render as renderInicio } from '../inicio/inicio.view.js';
import { render as renderPeso } from '../peso/peso.view.js';
import { render as renderPlano } from '../plano/plano.view.js';
import { criarCabecalho } from './cabecalho.js';

// Itens do menu (a tela de Forma abre pelo Início e não tem item próprio).
const MENU = [
  { caminho: '#/inicio', rotulo: 'Início', icone: 'inicio' },
  { caminho: '#/atividades', rotulo: 'Atividades', icone: 'atividades' },
  { caminho: '#/plano', rotulo: 'Plano', icone: 'plano' },
  { caminho: '#/peso', rotulo: 'Peso', icone: 'peso' },
  { caminho: '#/configuracao', rotulo: 'Configuração', icone: 'configuracao' },
  { caminho: '#/admin', rotulo: 'Aprovações', icone: 'aprovacoes', soAdmin: true },
];

/** Resolve o hash em { menu, render, params }. Rotas desconhecidas ou proibidas caem no Início. */
function resolverRota(hash, admin) {
  const detalhe = /^#\/atividades\/([A-Za-z0-9_-]{8,40})$/.exec(hash);
  if (detalhe) return { menu: '#/atividades', render: renderDetalhe, params: { id: detalhe[1] } };
  switch (hash) {
    case '#/forma':
      return { menu: '#/inicio', render: renderForma, params: {} };
    case '#/atividades':
      return { menu: hash, render: renderAtividades, params: {} };
    case '#/plano':
      return { menu: hash, render: renderPlano, params: {} };
    case '#/peso':
      return { menu: hash, render: renderPeso, params: {} };
    case '#/configuracao':
      return { menu: hash, render: renderConfiguracao, params: {} };
    case '#/admin':
      if (admin) return { menu: hash, render: renderAprovacoes, params: {} };
      break;
    default:
  }
  return { menu: '#/inicio', render: renderInicio, params: {} };
}

export function render(raiz, sessao) {
  const itens = MENU.filter((m) => !m.soAdmin || sessao.admin);
  const cabecalho = criarCabecalho(sessao, itens);
  const saida = h('main', { class: 'container conteudo' });
  let destruirRota = null;

  function desenharRota() {
    destruirRota?.();
    const rota = resolverRota(window.location.hash, sessao.admin);
    cabecalho.marcarAtivo(rota.menu);
    window.scrollTo(0, 0);
    destruirRota = rota.render(saida, sessao, rota.params);
  }

  raiz.replaceChildren(cabecalho.topo, saida, cabecalho.abas);

  window.addEventListener('hashchange', desenharRota);
  desenharRota();

  return () => {
    window.removeEventListener('hashchange', desenharRota);
    cabecalho.destruir();
    destruirRota?.();
  };
}
