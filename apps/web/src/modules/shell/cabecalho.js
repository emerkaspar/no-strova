import { sair } from '../../application/sessao.js';
import { h } from '../../utils/dom.js';
import { dataCurta, dataPorExtenso, horaNoFuso, saudacaoDaHora } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { logo } from '../../utils/marca.js';
import { fraseAleatoria, limiteDaFrase, textoExibido } from '../../utils/frases.js';
import { alternarTema, temaEfetivo } from '../../utils/tema.js';
import { pedirImportacao } from '../atividades/state.js';
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
 * Frase de brincadeira sob a saudação: itálico discreto e autoria mais clara; passar o mouse (ou focar) abre a frase
 * inteira e o disclaimer. Só troca quando o usuário muda de página (`trocar`); ao entrar ou atualizar, sorteia uma.
 */
function criarFrase() {
  let limite = limiteDaFrase(0);
  const texto = h('span', { class: 'frase-texto', 'aria-live': 'off' });
  const dica = h('span', { class: 'frase-dica', role: 'tooltip', id: 'frase-dica' });
  const el = h('div', { class: 'topo-frase', tabindex: '0', 'aria-describedby': 'frase-dica' }, texto, dica);

  let atual = null;
  let timer = null;

  const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function mostrar(f) {
    atual = f;
    const exibido = textoExibido(f.texto, limite);
    texto.replaceChildren(`“${exibido}” `, h('span', { class: 'frase-autor' }, `— ${f.autor}`));
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

  // o limite de caracteres acompanha a largura do cabeçalho (mesmas faixas do CSS)
  const observador = typeof ResizeObserver === 'function'
    ? new ResizeObserver(([entrada]) => {
        const novo = limiteDaFrase(entrada.contentBoxSize?.[0]?.inlineSize ?? entrada.contentRect.width);
        if (novo !== limite && atual) {
          limite = novo;
          mostrar(atual);
        }
        limite = novo;
      })
    : null;

  trocar();

  return {
    el,
    trocar,
    observar: (alvo) => observador?.observe(alvo),
    parar: () => {
      clearTimeout(timer);
      observador?.disconnect();
    },
  };
}

/**
 * Cabeçalho de todas as telas: logo, data por extenso e saudação, menu em pílula, e à direita três ícones: importar
 * arquivo, tema (claro/escuro) e o avatar, cujo menu tem o Perfil de treino (o wizard), a Administração (só para admin) e Sair. Abaixo de 768 px o menu
 * vira barra de abas no rodapé (os dois menus ficam no DOM; o CSS mostra um por vez).
 * @param {{ perfil?: any, email?: string, admin?: boolean }} sessao
 * @param {Array<{ caminho: string, rotulo: string, icone: string }>} itens
 */
export function criarCabecalho(sessao, itens) {
  // --- saudação e data (fuso de São Paulo) ---
  const saudacao = `${saudacaoDaHora(horaNoFuso())}, ${primeiroNome(sessao)}`;
  const frase = criarFrase();
  const marca = h(
    'div',
    { class: 'topo-marca' },
    h('a', { href: '#/inicio', class: 'topo-logo', 'aria-label': 'NÃO STROVA — Início' }, logo()),
    h('div', { class: 'topo-texto' }, h('p', { class: 'topo-data' }, h('span', { class: 'data-longa' }, dataPorExtenso()), h('span', { class: 'data-curta' }, dataCurta())), h('p', { class: 'topo-saudacao' }, saudacao), frase.el),
  );

  // --- menu em pílula (desktop) e barra de abas (mobile) ---
  // item "soIcone": a pílula mostra o rótulo ou só a engrenagem conforme a largura do cabeçalho (CSS); a dica e o aria-label ficam sempre
  const linksPilula = itens.map((m) =>
    m.soIcone
      ? h('a', { href: m.caminho, 'data-caminho': m.caminho, class: 'so-icone', 'aria-label': m.rotulo, title: m.rotulo }, icone('engrenagem', 20), h('span', { class: 'rotulo' }, m.rotulo))
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
      { class: 'container topo-conteudo' },
      h('div', { class: 'topo-linha' }, marca, pilula, h('div', { class: 'topo-acoes' }, importar, botaoTema, h('div', { class: 'conta' }, avatar, menu))),
    ),
  );
  frase.observar(topo.querySelector('.topo-conteudo'));

  return {
    topo,
    abas,
    marcarAtivo,
    /** Sorteia outra frase (o shell chama a cada troca de página). */
    novaFrase: () => frase.trocar(),
    destruir() {
      frase.parar();
      document.removeEventListener('pointerdown', foraDoMenu, true);
      document.removeEventListener('keydown', teclas);
    },
  };
}
