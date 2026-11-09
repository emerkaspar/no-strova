import { sair } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { dataCurta, horaNoFuso, saudacaoDaHora } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { logosCabecalho } from '../../utils/marca.js';
import { fraseAleatoria, LIMITE_FRASE, textoExibido } from '../../utils/frases.js';
import { alternarTema, temaEfetivo } from '../../utils/tema.js';
import { pedirImportacao } from '../atividades/state.js';
import { aoMudarNaoLidas, totalNaoLidas } from '../notificacoes/state.js';
import { abrirWizard } from '../onboarding/wizard.js';

function inicialDe(sessao) {
  const base = (sessao.perfil?.nome || sessao.email || '?').trim();
  return base.charAt(0).toUpperCase();
}

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
 * Cabeçalho de todas as telas: logo, data por extenso e saudação, menu em pílula, e à direita quatro ícones: importar
 * arquivo, notificações (sino com contador), tema (claro/escuro) e o avatar, cujo menu tem o Perfil de treino (o wizard), a Administração (só para admin) e Sair. Abaixo de 768 px o menu
 * vira barra de abas no rodapé (os dois menus ficam no DOM; o CSS mostra um por vez).
 * @param {{ perfil?: any, email?: string, admin?: boolean }} sessao
 * @param {Array<{ caminho: string, rotulo: string, icone: string }>} itens
 */
export function criarCabecalho(sessao, itens) {
  // --- saudação e data (fuso de São Paulo) ---
  const saudacao = `${saudacaoDaHora(horaNoFuso())}, ${primeiroNome(sessao)}`;
  const frase = criarFrase();
  const logoLink = h('a', { href: '#/inicio', class: 'topo-logo', 'aria-label': 'NÃO STROVA — Início' }, ...logosCabecalho());
  const faixa = h('span', { class: 'topo-faixa', 'aria-hidden': 'true' });
  const titulo = h('div', { class: 'topo-titulo' }, h('p', { class: 'topo-data' }, dataCurta()), h('p', { class: 'topo-saudacao' }, saudacao));

  // --- menu em pílula (desktop) e barra de abas (mobile) ---
  // item "soIcone": na pílula é sempre só a engrenagem, com o nome na dica e no aria-label (a barra de abas mantém o rótulo)
  const linksPilula = itens.map((m) =>
    m.soIcone
      ? h('a', { href: m.caminho, 'data-caminho': m.caminho, class: 'so-icone', 'aria-label': m.rotulo, title: m.rotulo }, icone('engrenagem', 20))
      : h('a', { href: m.caminho, 'data-caminho': m.caminho }, m.rotulo),
  );
  const pilula = h('nav', { class: 'menu-pilula', 'aria-label': 'Principal' }, ...linksPilula);
  const linksAbas = itens.map((m) => h('a', { href: m.caminho, 'data-caminho': m.caminho }, icone(m.icone), h('span', null, m.rotulo)));
  const abas = h('nav', { class: 'barra-abas', 'aria-label': 'Principal (abas)' }, ...linksAbas);

  // --- importar arquivo (só o ícone) ---
  const importar = h(
    'button',
    { class: 'btn-icone btn-icone-primario', type: 'button', 'aria-label': 'Importar arquivo', title: 'Importar arquivo', onClick: pedirImportacao },
    icone('importar', 22),
  );

  // --- sino de notificações: link para a central, com o contador de não lidas ---
  const contador = h('span', { class: 'sino-contador', 'aria-hidden': 'true', hidden: true });
  const sino = h('a', { class: 'btn-icone sino', href: '#/notificacoes', 'data-caminho': '#/notificacoes' }, icone('sino', 22), contador);
  function rotularSino(n) {
    const texto = n > 0 ? `Notificações: ${n} ${n === 1 ? 'não lida' : 'não lidas'}` : 'Notificações';
    contador.textContent = n > 99 ? '99+' : String(n);
    contador.hidden = n === 0;
    sino.setAttribute('aria-label', texto);
    sino.title = texto;
  }
  rotularSino(totalNaoLidas());
  const pararSino = aoMudarNaoLidas(rotularSino);

  // --- tema: ícone sempre visível (sol no tema escuro, lua no claro) ---
  const botaoTema = h('button', { class: 'btn-icone', type: 'button' });
  function rotularTema() {
    const escuro = temaEfetivo() === 'escuro';
    const texto = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    botaoTema.replaceChildren(icone(escuro ? 'sol' : 'lua', 22));
    botaoTema.setAttribute('aria-label', texto);
    botaoTema.title = texto;
  }
  rotularTema();
  botaoTema.addEventListener('click', () => {
    alternarTema();
    rotularTema();
  });

  // --- avatar com menu da conta ---
  const itemAdmin = sessao.admin
    ? h('a', { class: 'menu-conta-item', href: '#/admin', role: 'menuitem', 'data-caminho': '#/admin' }, icone('aprovacoes', 18), 'Administração')
    : null;
  const itemPerfil = h(
    'button',
    {
      class: 'menu-conta-item',
      type: 'button',
      role: 'menuitem',
      onClick: () => {
        fechar(false);
        abrirWizard({ sessao });
      },
    },
    icone('perfil', 18),
    'Perfil de treino',
  );
  const itemSair = h('button', { class: 'menu-conta-item', type: 'button', role: 'menuitem', onClick: sair }, icone('sair', 18), 'Sair');
  const perfil = h(
    'div',
    { class: 'menu-conta-perfil' },
    h('strong', null, (sessao.perfil?.nome || '').trim() || 'Minha conta'),
    sessao.email ? h('span', null, sessao.email) : null,
  );
  const menu = h('div', { class: 'menu-conta', role: 'menu', 'aria-label': 'Conta', hidden: true }, perfil, h('div', { class: 'menu-conta-itens' }, itemPerfil, itemAdmin, itemSair));
  const avatar = h(
    'button',
    { class: 'avatar', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu da conta' },
    inicialDe(sessao),
  );

  function marcarAtivo(caminho) {
    for (const link of [...linksPilula, ...linksAbas]) {
      if (link.dataset.caminho === caminho) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    // Administração mora no menu da conta: na tela dela, o avatar fica destacado
    if (caminho === '#/notificacoes') sino.setAttribute('aria-current', 'page');
    else sino.removeAttribute('aria-current');
    const naAdmin = caminho === '#/admin';
    avatar.classList.toggle('avatar-ativo', naAdmin);
    if (naAdmin) itemAdmin?.setAttribute('aria-current', 'page');
    else itemAdmin?.removeAttribute('aria-current');
  }

  const foraDoMenu = (e) => {
    if (!menu.contains(e.target) && !avatar.contains(e.target)) fechar(false);
  };
  const teclas = (e) => {
    if (e.key === 'Escape') fechar(true);
  };
  function abrir() {
    menu.hidden = false;
    avatar.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', foraDoMenu, true);
    document.addEventListener('keydown', teclas);
    itemPerfil.focus();
  }
  function fechar(devolverFoco) {
    menu.hidden = true;
    avatar.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', foraDoMenu, true);
    document.removeEventListener('keydown', teclas);
    if (devolverFoco) avatar.focus();
  }
  avatar.addEventListener('click', () => (menu.hidden ? abrir() : fechar(false)));
  // ir para a Administração fecha o menu
  itemAdmin?.addEventListener('click', () => fechar(false));

  const topo = h(
    'header',
    { class: 'topo' },
    h(
      'div',
      { class: 'container topo-wrap' },
      // grade de 2 linhas: logo e faixa nas duas; data e saudação, menu e ações na 1ª; a frase na 2ª (ver layout.css)
      h('div', { class: 'topo-card' }, logoLink, faixa, titulo, pilula, h('div', { class: 'topo-acoes' }, importar, sino, botaoTema, h('div', { class: 'conta' }, avatar, menu)), frase.el),
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
      pararSino();
      document.removeEventListener('pointerdown', foraDoMenu, true);
      document.removeEventListener('keydown', teclas);
    },
  };
}
