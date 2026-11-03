import { FAIXAS_FORMA } from '@no-strova/domain';
import { h } from '../../utils/dom.js';

let sequencia = 0;

/**
 * Chip da zona de Forma com um hint que explica as cinco zonas e destaca a atual.
 * Abre ao passar o mouse (no chip, no cartão ou no número, se ligado com `ligarGatilho`), ao focar o chip pelo
 * teclado e ao clicar/tocar (o clique fixa o cartão até outro clique, Esc ou toque fora).
 * O cartão abre ao lado do bloco (ver layout.css), sem cobrir o número.
 * @param {{ zonaAtual: string, rotuloChip: string, valor: string, resumo: string }} opcoes
 *   `zonaAtual`: id da zona (ver FAIXAS_FORMA); `valor`: Forma formatada (ex.: "+0,2"); `resumo`: a frase da
 *   zona atual, mostrada em destaque na linha dela
 */
export function criarDicaZonas({ zonaAtual, rotuloChip, valor, resumo }) {
  const id = `dica-zonas-${++sequencia}`;

  const linhas = FAIXAS_FORMA.map((f) => {
    const atual = f.id === zonaAtual;
    return h(
      'li',
      { class: `zona-linha${atual ? ' zona-atual' : ''}`, 'aria-current': atual ? 'true' : null },
      h('span', { class: `zona-amostra zona-amostra-${f.id}`, 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'zona-corpo' },
        h(
          'p',
          { class: 'zona-nome' },
          h('strong', null, f.chip),
          h('span', { class: 'zona-intervalo' }, f.intervalo),
          atual ? h('span', { class: 'zona-voce' }, `Você está aqui · ${valor}`) : null,
        ),
        atual ? h('p', { class: 'zona-resumo' }, resumo) : null,
        h('p', { class: 'zona-descricao' }, f.descricao),
      ),
    );
  });

  const dica = h(
    'div',
    { class: 'dica-zonas', id, role: 'tooltip', hidden: true },
    h('p', { class: 'dica-zonas-titulo' }, 'Zonas de Forma'),
    h('p', { class: 'dica-zonas-texto' }, 'A Forma é o Fitness menos a Fadiga de ontem. A faixa em que ela cai mostra como o seu treino está sendo absorvido.'),
    h('ul', { class: 'zona-lista' }, ...linhas),
  );

  const chip = h(
    'button',
    { class: 'chip-zona', type: 'button', 'aria-describedby': id, 'aria-expanded': 'false' },
    h('span', { class: 'chip-texto' }, rotuloChip),
    h('span', { class: 'chip-info', 'aria-hidden': 'true' }, 'i'),
  );
  const raiz = h('div', { class: 'hero-zona' }, chip, dica);

  let fixado = false;

  const foraDoCartao = (e) => {
    if (!raiz.contains(e.target)) esconder();
  };
  function mostrar() {
    dica.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
  }
  function esconder() {
    dica.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    fixado = false;
    document.removeEventListener('pointerdown', foraDoCartao, true);
  }
  function fixar() {
    fixado = true;
    mostrar();
    document.addEventListener('pointerdown', foraDoCartao, true);
  }

  raiz.addEventListener('mouseenter', mostrar);
  raiz.addEventListener('mouseleave', () => {
    if (!fixado) esconder();
  });
  chip.addEventListener('focus', mostrar);
  chip.addEventListener('blur', () => {
    if (!fixado) esconder();
  });
  chip.addEventListener('click', () => (fixado ? esconder() : fixar()));
  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') esconder(); // não devolve o foco: o foco reabriria o cartão
  });

  return {
    raiz,
    /** Faz o elemento (por exemplo, o número grande) abrir o mesmo hint ao passar o mouse. */
    ligarGatilho(elemento) {
      elemento.classList.add('com-ajuda');
      elemento.addEventListener('mouseenter', mostrar);
      elemento.addEventListener('mouseleave', () => {
        if (!fixado) esconder();
      });
    },
  };
}
