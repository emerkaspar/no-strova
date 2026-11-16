import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { NOME_APP } from '../../core/constants.js';
import { criarBotaoTema, criarConta, criarSino } from './acoes.js';

const CHAVE = 'no-strova:rail-recolhida';

function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

function gravarRecolhida(valor) {
  try {
    localStorage.setItem(CHAVE, valor ? '1' : '0');
  } catch {
    // sem armazenamento (janela privada): o estado vale só nesta sessão
  }
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * Marca do logo anterior (o polegar cortado pela barra laranja, a mesma de `logo/naostrova-logo-*-sem-slogan.svg`), só o
 * ícone, em 32 px. O traço do polegar segue o tema (`currentColor`: preto no claro, branco no escuro); a barra é laranja.
 */
function marcaDoLogo() {
  const el = (nome, atributos, ...filhos) => {
    const n = document.createElementNS(NS, nome);
    for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, v);
    n.append(...filhos);
    return n;
  };
  const traco = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const barra = 'M3 3 L21 21';
  const svg = el('svg', { viewBox: '0 0 24 24', width: 32, height: 32, class: 'rail-marca', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    el('mask', { id: 'rail-marca-corte', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 24, height: 24 }, el('rect', { width: 24, height: 24, fill: '#fff' }), el('path', { d: barra, stroke: '#000', 'stroke-width': 5, ...traco })),
    el(
      'g',
      { mask: 'url(#rail-marca-corte)', stroke: 'currentColor', 'stroke-width': 1.6, ...traco },
      el('path', { d: 'M7 10v12' }),
      el('path', { d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z' }),
    ),
    el('path', { d: barra, stroke: '#FF5200', 'stroke-width': 1.9, ...traco }),
  );
  return svg;
}

/**
 * Barra lateral do desktop (>= 768 px), "integrada ao fundo" (sem fundo próprio, borda ou sombra). De cima para baixo: logo
 * (ícone + nome), botão Importar, os itens do menu principal e, no rodapé, a pílula com Avisos, Tema e Config., o Perfil
 * (avatar com o menu da conta) e o botão de recolher. Dois estados: expandida (96 px, ícone + rótulo) e recolhida (64 px, só
 * ícones, com o nome numa dica escura ao passar o mouse ou focar). O estado persiste no localStorage. No celular ela não
 * aparece (CSS): lá valem a barra de abas e o cabeçalho.
 * @param {Array<{ caminho: string, rotulo: string, icone: string, soIcone?: boolean }>} itens
 * @param {any} sessao
 * @param {{ aoImportar: (botao: HTMLElement) => void }} opcoes
 */
export function criarRail(itens, sessao, { aoImportar }) {
  const principais = itens.filter((m) => !m.soIcone);
  const configuracao = itens.find((m) => m.soIcone);

  const item = (m, rotulo = m.rotulo, nomeIcone = m.icone) =>
    h(
      'a',
      { class: 'rail-item', href: m.caminho, 'data-caminho': m.caminho, 'aria-label': m.rotulo },
      h('span', { class: 'rail-pilula' }, icone(nomeIcone, 20)),
      h('span', { class: 'rail-rotulo' }, rotulo),
      h('span', { class: 'rail-dica', role: 'tooltip' }, rotulo),
    );

  // expandida: ícone e nome empilhados; recolhida: só a marca (o texto some no CSS)
  const logo = h(
    'a',
    { class: 'rail-logo', href: '#/inicio', 'aria-label': `${NOME_APP} — Início` },
    marcaDoLogo(),
    h('span', { class: 'rail-logo-nome', 'aria-hidden': 'true' }, 'NÃO STROVA'),
  );

  const botaoImportar = h(
    'button',
    { class: 'rail-importar', type: 'button', 'aria-label': 'Importar atividades', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    h('span', { class: 'rail-importar-circulo' }, icone('importar', 22)),
    h('span', { class: 'rail-rotulo' }, 'Importar'),
    h('span', { class: 'rail-dica', role: 'tooltip' }, 'Importar'),
  );
  botaoImportar.addEventListener('click', () => aoImportar(botaoImportar));

  const linksPrincipais = principais.map((m) => item(m));
  const linkConfig = configuracao ? item(configuracao, 'Config.', 'engrenagem') : null;

  const sino = criarSino('rail');
  const tema = criarBotaoTema('rail');
  const conta = criarConta(sessao, 'rail');

  const botaoRecolher = h('button', { class: 'rail-recolher', type: 'button' });

  const el = h(
    'aside',
    { class: 'rail', 'aria-label': 'Navegação lateral' },
    h('div', { class: 'rail-topo' }, logo, botaoImportar),
    h('nav', { class: 'rail-menu', 'aria-label': 'Principal' }, ...linksPrincipais),
    h(
      'div',
      { class: 'rail-rodape' },
      h('div', { class: 'rail-grupo' }, sino.el, tema.el, linkConfig, conta.el),
      botaoRecolher,
    ),
  );

  let recolhida = lerRecolhida();
  /** O elemento do shell que recebe a classe de recolhida, para a largura também ajustar o conteúdo. */
  let alvo = null;

  function aplicar() {
    alvo?.classList.toggle('rail-recolhida', recolhida);
    const texto = recolhida ? 'Expandir a barra lateral' : 'Recolher a barra lateral';
    botaoRecolher.replaceChildren(icone(recolhida ? 'chevronsDir' : 'chevronsEsq', 20), h('span', { class: 'rail-dica', role: 'tooltip' }, texto));
    botaoRecolher.setAttribute('aria-label', texto);
    botaoRecolher.setAttribute('aria-expanded', String(!recolhida));
  }
  botaoRecolher.addEventListener('click', () => {
    recolhida = !recolhida;
    gravarRecolhida(recolhida);
    aplicar();
  });

  return {
    el,
    /** Liga a barra ao elemento do shell que recebe a classe de recolhida. */
    ligar(shell) {
      alvo = shell;
      aplicar();
    },
    marcarAtivo(caminho) {
      for (const link of [...linksPrincipais, linkConfig].filter(Boolean)) {
        if (link.dataset.caminho === caminho) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      sino.marcarAtivo(caminho);
      conta.marcarAtivo(caminho);
    },
    destruir() {
      sino.destruir();
      conta.destruir();
    },
  };
}
