import { h } from './dom.js';
import { icone } from './icones.js';

let contador = 0;

/**
 * Lista suspensa própria (no lugar do <select> nativo, que não aceita estilo). Botão que abre uma lista de opções
 * com a marca da escolhida, uma opção de ação opcional ("+ Criar novo…") separada das demais, teclado completo
 * (setas, Home, End, Enter, Espaço, Esc, Tab) e papéis de combobox/listbox para leitores de tela.
 * A lista abre sobre o conteúdo (posição fixa), por isso não é cortada pela rolagem do modal, e vira para cima
 * quando falta espaço embaixo.
 *
 *   const lista = listaSuspensa({ rotulo: 'Trajeto', aoMudar: (valor) => ... });
 *   lista.definir([{ valor: '', rotulo: 'Nenhum' }, { valor: 'a', rotulo: 'Volta da Lagoa' }], '');
 *
 * Opção: `{ valor, rotulo, rotuloCurto?, acao? }`; `rotuloCurto` é o texto no botão quando ela está escolhida, e
 * `acao: true` desenha a opção como ação (cor de destaque, ícone de mais, separada por uma linha).
 *
 * @param {{ rotulo: string, aoMudar?: (valor: string) => void }} p
 * @returns {{ raiz: HTMLElement, definir: (opcoes: Array<object>, valor: string) => void, valor: () => string, desabilitar: (desligado: boolean) => void, fechar: () => void }}
 */
export function listaSuspensa({ rotulo, aoMudar }) {
  const id = `ls-${++contador}`;
  let opcoes = [];
  let atual = '';
  let ativo = -1;
  let aberta = false;

  const texto = h('span', { class: 'ls-texto' });
  const botao = h(
    'button',
    { type: 'button', class: 'ls-botao', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': `${id}-lista`, 'aria-label': rotulo },
    texto,
    h('span', { class: 'ls-seta', 'aria-hidden': 'true' }, icone('chevronBaixo', 18)),
  );
  const lista = h('ul', { class: 'ls-lista', id: `${id}-lista`, role: 'listbox', 'aria-label': rotulo, tabindex: '-1', hidden: true });
  const raiz = h('div', { class: 'ls' }, botao, lista);

  const itens = () => [...lista.querySelectorAll('.ls-item')];

  function atualizarTexto() {
    const escolhida = opcoes.find((o) => o.valor === atual);
    texto.textContent = escolhida ? (escolhida.rotuloCurto ?? escolhida.rotulo) : '';
  }

  function desenhar() {
    lista.replaceChildren(
      ...opcoes.flatMap((o, i) => {
        const marcado = o.valor === atual;
        const item = h(
          'li',
          { class: `ls-item${o.acao ? ' ls-acao' : ''}${marcado ? ' ls-marcado' : ''}`, role: 'option', id: `${id}-${i}`, 'aria-selected': String(marcado) },
          o.acao ? h('span', { class: 'ls-item-icone', 'aria-hidden': 'true' }, icone('mais', 16)) : null,
          h('span', { class: 'ls-item-texto' }, o.rotulo),
          marcado ? h('span', { class: 'ls-item-marca', 'aria-hidden': 'true' }, icone('ok', 16)) : null,
        );
        // mousedown não tira o foco do botão; o clique escolhe
        item.addEventListener('mousedown', (e) => e.preventDefault());
        item.addEventListener('click', () => escolher(i));
        item.addEventListener('mousemove', () => marcarAtivo(i, false));
        // a primeira ação ganha uma linha separando-a das opções comuns
        const separador = o.acao && !opcoes[i - 1]?.acao && i > 0 ? [h('li', { class: 'ls-separador', role: 'separator' })] : [];
        return [...separador, item];
      }),
    );
    ativo = Math.max(0, opcoes.findIndex((o) => o.valor === atual));
  }

  function marcarAtivo(indice, rolar = true) {
    ativo = indice;
    itens().forEach((el, i) => el.classList.toggle('ls-ativo', i === indice));
    const el = itens()[indice];
    if (el) {
      botao.setAttribute('aria-activedescendant', el.id);
      if (rolar) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function posicionar() {
    const r = botao.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom - 12;
    const acima = r.top - 12;
    const altura = Math.min(lista.scrollHeight + 2, 300);
    const paraCima = abaixo < altura && acima > abaixo;
    const maximo = Math.max(120, Math.min(300, paraCima ? acima : abaixo));
    lista.style.left = `${r.left}px`;
    lista.style.width = `${r.width}px`;
    lista.style.maxHeight = `${maximo}px`;
    lista.style.top = paraCima ? 'auto' : `${r.bottom + 6}px`;
    lista.style.bottom = paraCima ? `${window.innerHeight - r.top + 6}px` : 'auto';
    lista.classList.toggle('ls-para-cima', paraCima);
  }

  const aoClicarFora = (e) => {
    if (!raiz.contains(e.target)) fechar();
  };
  // rolar o modal (ou a página) com a lista aberta a deixaria solta: fecha
  const aoRolar = (e) => {
    if (!lista.contains(e.target)) fechar();
  };

  function abrir() {
    if (aberta || botao.disabled || opcoes.length === 0) return;
    aberta = true;
    lista.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    raiz.classList.add('ls-aberta');
    posicionar();
    marcarAtivo(Math.max(0, opcoes.findIndex((o) => o.valor === atual)));
    document.addEventListener('pointerdown', aoClicarFora, true);
    document.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', fechar);
  }

  function fechar() {
    if (!aberta) return;
    aberta = false;
    lista.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    botao.removeAttribute('aria-activedescendant');
    raiz.classList.remove('ls-aberta');
    document.removeEventListener('pointerdown', aoClicarFora, true);
    document.removeEventListener('scroll', aoRolar, true);
    window.removeEventListener('resize', fechar);
  }

  function escolher(indice) {
    const o = opcoes[indice];
    if (!o) return;
    const mudou = o.valor !== atual;
    atual = o.valor;
    atualizarTexto();
    desenhar();
    fechar();
    botao.focus();
    if (mudou) aoMudar?.(atual);
  }

  botao.addEventListener('click', () => (aberta ? fechar() : abrir()));
  botao.addEventListener('keydown', (e) => {
    const ultimo = opcoes.length - 1;
    if (!aberta) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        marcarAtivo(Math.min(ultimo, ativo + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        marcarAtivo(Math.max(0, ativo - 1));
        break;
      case 'Home':
        e.preventDefault();
        marcarAtivo(0);
        break;
      case 'End':
        e.preventDefault();
        marcarAtivo(ultimo);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        escolher(ativo);
        break;
      case 'Escape':
        // fecha só a lista: sem isto o Esc também fecharia o modal por trás
        e.preventDefault();
        e.stopPropagation();
        fechar();
        break;
      case 'Tab':
        fechar();
        break;
      default:
    }
  });

  return {
    raiz,
    /** Troca as opções e a escolhida. */
    definir(novas, valor) {
      opcoes = novas;
      atual = valor;
      atualizarTexto();
      desenhar();
    },
    valor: () => atual,
    desabilitar(desligado) {
      botao.disabled = desligado;
      if (desligado) fechar();
    },
    fechar,
  };
}

/**
 * Substituto do <select> nativo com a lista suspensa do projeto. Devolve o elemento (`.ls`) com a mesma interface básica
 * de um select: `.value` (lê e escreve), `.disabled`, `.hidden` e o evento `change`. `definirOpcoes(opcoes, valor)` troca as
 * opções. Use `id` para que um <label for> aponte para o botão.
 *
 *   const esporte = seletor({ id: 'esporte', rotulo: 'Esporte', opcoes: [{ valor: 'corrida', rotulo: 'Corrida' }], valor: 'corrida' });
 *
 * @param {{ id?: string, rotulo: string, opcoes?: Array<{ valor: string, rotulo: string }>, valor?: string, classe?: string }} p
 */
export function seletor({ id, rotulo, opcoes = [], valor = '', classe = '' }) {
  let atuais = opcoes;
  const lista = listaSuspensa({ rotulo, aoMudar: () => el.dispatchEvent(new Event('change', { bubbles: true })) });
  const el = lista.raiz;
  const botao = el.querySelector('.ls-botao');
  if (id) botao.id = id;
  if (classe) el.classList.add(...classe.split(' '));
  const escolhaValida = (v) => (atuais.some((o) => o.valor === v) ? v : (atuais[0]?.valor ?? ''));
  lista.definir(atuais, escolhaValida(String(valor)));
  Object.defineProperty(el, 'value', {
    get: () => lista.valor(),
    set: (v) => lista.definir(atuais, escolhaValida(String(v))),
  });
  Object.defineProperty(el, 'disabled', {
    get: () => botao.disabled,
    set: (d) => lista.desabilitar(Boolean(d)),
  });
  el.definirOpcoes = (novas, v = lista.valor()) => {
    atuais = novas;
    lista.definir(atuais, escolhaValida(String(v)));
  };
  return el;
}
