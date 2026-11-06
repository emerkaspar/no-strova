import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';

/**
 * Faixa de badges da linha de atividade. Cada badge é uma entrada em `BADGES` (ícone, rótulo, categoria, prioridade):
 * para criar um novo, basta acrescentar a entrada aqui e devolvê-lo em `badgesDaAtividade` (lista.view.js). A faixa ordena
 * por prioridade (menor primeiro), mostra até `MAXIMO_VISIVEL` e agrupa o resto em um chip "+N" com popover.
 *
 * Categorias (a cor vem do CSS `.ativ-badge-<categoria>`): conquista (amarelo), acao (laranja), registro (cinza), status (verde).
 * Campos opcionais da config: `texto` (rótulo curto para a versão em pill, usada só com poucos badges) e `tom` (cor própria).
 */
export const BADGES = Object.freeze({
  medalha: { icone: 'medalha', rotulo: 'Recorde pessoal', texto: 'Recorde', categoria: 'conquista', prioridade: 10 },
  sensacao: { icone: 'sensacaoFoguete', rotulo: 'Como foi', categoria: 'acao', prioridade: 20 },
  comoFoi: { icone: 'lapis', rotulo: 'Contar como foi esta atividade', texto: 'Como foi?', categoria: 'registro', prioridade: 30 },
});

export const MAXIMO_VISIVEL = 5;
/** Até esta quantidade, os badges que têm `texto` aparecem como pill; acima, tudo vira só ícone. */
export const MAXIMO_COM_TEXTO = 3;

const MARGEM = 12;

/** Junta a config do tipo com os dados da atividade (`rotulo`, `icone`, `tom`, `aoClicar`, `ligar` sobrescrevem). */
export function montarBadge(tipo, dados = {}) {
  const base = BADGES[tipo];
  if (!base) throw new Error(`Badge desconhecido: ${tipo}`);
  return { id: tipo, ...base, ...dados };
}

export const ordenarBadges = (lista) => [...lista].sort((a, b) => a.prioridade - b.prioridade);

/**
 * Popover único da lista com todos os badges de uma atividade (ícone e rótulo). Abre ao clicar no "+N"; Esc ou clique fora fecham.
 * @returns {{ faixa: (badges: object[]) => HTMLElement, esconder: () => void, destruir: () => void }}
 */
export function criarFaixaDeBadges() {
  const el = h('div', { class: 'ativ-badges-popover', role: 'dialog', 'aria-label': 'Todos os badges da atividade', hidden: true });
  document.body.append(el);
  let aberto = null; // o botão "+N" cujo popover está aberto

  function esconder() {
    aberto?.setAttribute('aria-expanded', 'false');
    aberto = null;
    el.hidden = true;
  }

  function mostrar(ancora, badges) {
    esconder();
    aberto = ancora;
    ancora.setAttribute('aria-expanded', 'true');
    el.replaceChildren(
      ...badges.map((b) => h('div', { class: 'ativ-badges-item' }, h('span', { class: `ativ-badge ativ-badge-${b.categoria}`, style: b.tom ? `--cor:${b.tom}` : null }, icone(b.icone, 14)), h('span', null, b.rotulo))),
    );
    el.hidden = false;
    const r = ancora.getBoundingClientRect();
    const x = Math.min(Math.max(MARGEM, r.left), window.innerWidth - el.offsetWidth - MARGEM);
    const abaixo = r.bottom + 8;
    el.style.left = `${x}px`;
    el.style.top = `${abaixo + el.offsetHeight <= window.innerHeight - MARGEM ? abaixo : Math.max(MARGEM, r.top - el.offsetHeight - 8)}px`;
  }

  const foraOuEsc = (e) => {
    if (!aberto) return;
    if (e.type === 'keydown' ? e.key === 'Escape' : !aberto.contains(e.target) && !el.contains(e.target)) esconder();
  };
  document.addEventListener('click', foraOuEsc, true);
  document.addEventListener('keydown', foraOuEsc);

  function chipDoBadge(b, comTexto) {
    const conteudo = [icone(b.icone, 14), comTexto && b.texto ? h('span', { class: 'ativ-badge-texto' }, b.texto) : null];
    const props = {
      class: `ativ-badge ativ-badge-${b.categoria}${comTexto && b.texto ? ' ativ-badge-pill' : ''}`,
      style: b.tom ? `--cor:${b.tom}` : null,
      // o badge com popover próprio (a medalha) dispensa a dica nativa do navegador
      title: b.ligar ? null : b.rotulo,
      'aria-label': b.rotulo,
    };
    const chip = b.aoClicar
      ? h('button', { ...props, type: 'button', onClick: b.aoClicar }, ...conteudo)
      : h('span', { ...props, role: 'img', ...(b.ligar ? { role: 'button' } : {}) }, ...conteudo);
    b.ligar?.(chip);
    return chip;
  }

  return {
    faixa(lista) {
      const ordenados = ordenarBadges(lista);
      const comTexto = ordenados.length <= MAXIMO_COM_TEXTO;
      const visiveis = ordenados.slice(0, MAXIMO_VISIVEL);
      const resto = ordenados.length - visiveis.length;
      const mais =
        resto > 0
          ? h('button', { type: 'button', class: 'ativ-badge ativ-badge-pill ativ-badge-mais', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: `Ver todos os ${ordenados.length} badges`, 'aria-label': `Mais ${resto} badge${resto === 1 ? '' : 's'}: ver todos` }, `+${resto}`)
          : null;
      mais?.addEventListener('click', () => (aberto === mais ? esconder() : mostrar(mais, ordenados)));
      return h('div', { class: 'ativ-badges' }, ...visiveis.map((b) => chipDoBadge(b, comTexto)), mais);
    },
    esconder,
    destruir() {
      esconder();
      document.removeEventListener('click', foraOuEsc, true);
      document.removeEventListener('keydown', foraOuEsc);
      el.remove();
    },
  };
}
