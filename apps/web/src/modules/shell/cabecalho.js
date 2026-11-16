import { h } from '../../utils/dom.js';
import { dataCurta, horaNoFuso, saudacaoDaHora } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { logosCabecalho } from '../../utils/marca.js';
import { fraseAleatoria, LIMITE_FRASE, textoExibido } from '../../utils/frases.js';
import { criarBotaoTema, criarConta, criarSino } from './acoes.js';

function primeiroNome(sessao) {
  return (sessao.perfil?.nome || '').trim().split(/\s+/)[0] || 'atleta';
}

const FADE_MS = 300;

/**
 * Frase de brincadeira na 2ª linha do cabeçalho (uma linha só): itálico discreto e autoria mais clara; passar o mouse (ou focar) abre a frase
 * inteira e o disclaimer. Só troca quando o usuário muda de página (`trocar`); ao entrar ou atualizar, sorteia uma.
 */
function criarFrase() {
  const texto = h('span', { class: 'frase-texto', 'aria-live': 'off' });
  const dica = h('span', { class: 'frase-dica', role: 'tooltip', id: 'frase-dica' });
  const el = h('div', { class: 'topo-frase', tabindex: '0', 'aria-describedby': 'frase-dica' }, texto, dica);

  let atual = null;
  let timer = null;

  const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function mostrar(f) {
    atual = f;
    const exibido = textoExibido(f.texto, LIMITE_FRASE);
    texto.replaceChildren(h('span', { class: 'frase-citacao' }, `“${exibido}”`), h('span', { class: 'frase-autor' }, `— ${f.autor}`));
    const aviso = `${f.autor} nunca diria uma besteira dessas.`;
    dica.replaceChildren(`“${f.texto}” — ${f.autor}`, h('span', { class: 'frase-aviso' }, `Disclaimer: ${aviso}`));
  }

  /** Sorteia outra frase (a primeira chamada só mostra; as seguintes trocam com fade). */
  function trocar() {
    clearTimeout(timer);
    const proxima = fraseAleatoria();
    if (!atual || reduzMovimento()) {
      texto.classList.remove('saindo');
      mostrar(proxima);
      return;
    }
    texto.classList.add('saindo');
    timer = setTimeout(() => {
      mostrar(proxima);
      texto.classList.remove('saindo');
    }, FADE_MS);
  }

  trocar();

  return {
    el,
    trocar,
    parar: () => {
      clearTimeout(timer);
    },
  };
}

/**
 * Cabeçalho de todas as telas: data por extenso, saudação e frase, e à direita notificações (sino com contador), tema
 * (claro/escuro) e o avatar, cujo menu tem o Perfil de treino (o wizard), a Administração (só para admin) e Sair.
 * No desktop (>= 768 px) o menu e o botão Importar ficam na barra lateral (rail.js). No celular o cabeçalho mostra
 * também o logo e o botão Importar, e o menu vira a barra de abas no rodapé.
 * @param {{ perfil?: any, email?: string, admin?: boolean }} sessao
 * @param {Array<{ caminho: string, rotulo: string, icone: string }>} itens
 * @param {{ aoImportar: (botao: HTMLElement) => void }} opcoes
 */
export function criarCabecalho(sessao, itens, { aoImportar }) {
  // --- saudação e data (fuso de São Paulo) ---
  const saudacao = `${saudacaoDaHora(horaNoFuso())}, ${primeiroNome(sessao)}`;
  const frase = criarFrase();
  const logoLink = h('a', { href: '#/inicio', class: 'topo-logo', 'aria-label': 'NÃO STROVA — Início' }, ...logosCabecalho());
  const faixa = h('span', { class: 'topo-faixa', 'aria-hidden': 'true' });
  const titulo = h('div', { class: 'topo-titulo' }, h('p', { class: 'topo-data' }, dataCurta()), h('p', { class: 'topo-saudacao' }, saudacao));

  // --- barra de abas (mobile); no desktop o menu fica na barra lateral (rail.js) ---
  const linksAbas = itens.map((m) => h('a', { href: m.caminho, 'data-caminho': m.caminho }, icone(m.icone), h('span', null, m.rotulo)));
  const abas = h('nav', { class: 'barra-abas', 'aria-label': 'Principal (abas)' }, ...linksAbas);

  // --- importar (só o ícone; só no celular, no desktop o botão fica na barra lateral): abre o menu com as 3 opções ---
  const importar = h(
    'button',
    { class: 'btn-icone btn-icone-primario btn-importar-topo', type: 'button', 'aria-label': 'Importar atividades', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Importar atividades' },
    icone('importar', 22),
  );
  importar.addEventListener('click', () => aoImportar(importar));

  // --- sino, tema e avatar com menu da conta (a mesma lógica da barra lateral; ver acoes.js) ---
  const sinoAcao = criarSino('topo');
  const temaAcao = criarBotaoTema('topo');
  const contaAcao = criarConta(sessao, 'topo');

  function marcarAtivo(caminho) {
    for (const link of linksAbas) {
      if (link.dataset.caminho === caminho) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    sinoAcao.marcarAtivo(caminho);
    contaAcao.marcarAtivo(caminho);
  }

  const topo = h(
    'header',
    { class: 'topo' },
    h(
      'div',
      { class: 'container topo-wrap' },
      // grade de 2 linhas: logo e faixa nas duas; data e saudação, menu e ações na 1ª; a frase na 2ª (ver layout.css)
      h('div', { class: 'topo-card' }, logoLink, faixa, titulo, h('div', { class: 'topo-acoes' }, importar, sinoAcao.el, temaAcao.el, contaAcao.el), frase.el),
    ),
  );

  return {
    topo,
    abas,
    marcarAtivo,
    /** Sorteia outra frase (o shell chama a cada troca de página). */
    novaFrase: () => frase.trocar(),
    destruir() {
      frase.parar();
      sinoAcao.destruir();
      contaAcao.destruir();
    },
  };
}
