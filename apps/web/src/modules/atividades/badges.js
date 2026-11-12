import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';

/**
 * Faixa de badges da linha de atividade. Cada badge é uma entrada em `BADGES` (ícone, rótulo, categoria, prioridade):
 * para criar um novo, basta acrescentar a entrada aqui e devolvê-lo em `badgesDaAtividade` (lista.view.js). A faixa ordena
 * por prioridade (menor primeiro), mostra até `MAXIMO_VISIVEL` e agrupa o resto em um chip "+N" com popover.
 *
 * Categorias: acao e registro (cinza por padrão), status (verde). Os badges do "Como foi?" têm `tom` próprio (sensação e esforço trazem o da escala).
 * A medalha de recorde não é um badge: vive no emblema próprio da linha (lista.view.js). Todo badge é um círculo de 20px com ícone e dica de texto. Campos opcionais: `tom` (cor própria) e `valor` (um número no lugar do ícone, como o esforço).
 */
export const BADGES = Object.freeze({
  vinculado: { icone: 'vinculo', rotulo: 'Vinculada a um treino', categoria: 'status', prioridade: 15 },
  semVinculo: { icone: 'semVinculo', rotulo: 'Sem vínculo com um treino', categoria: 'registro', prioridade: 15 },
  sensacao: { icone: 'sensacaoBateria3', rotulo: 'Como foi', categoria: 'acao', prioridade: 20 },
  esforco: { icone: 'fc', rotulo: 'Esforço percebido', categoria: 'acao', prioridade: 25 },
  etiquetas: { icone: 'etiqueta', rotulo: 'O que marcou o treino', categoria: 'registro', tom: 'var(--zona-3)', prioridade: 30 },
  testeLthr: { icone: 'fcPulso', rotulo: 'Teste de LTHR', categoria: 'acao', tom: 'var(--serie-fc)', prioridade: 35 },
  trajeto: { icone: 'rota', rotulo: 'Trajeto de treino', categoria: 'registro', tom: 'var(--serie-vel)', prioridade: 40 },
  comoFoi: { icone: 'lapis', rotulo: 'Contar como foi esta atividade', categoria: 'registro', tom: 'var(--primary)', prioridade: 50 },
});

export const MAXIMO_VISIVEL = 5;

const MARGEM = 12;

/** Junta a config do tipo com os dados da atividade (`rotulo`, `icone`, `tom`, `aoClicar`, `ligar` sobrescrevem). */
export function montarBadge(tipo, dados = {}) {
  const base = BADGES[tipo];
  if (!base) throw new Error(`Badge desconhecido: ${tipo}`);
  return { id: tipo, ...base, ...dados };
}

/** O ícone do badge ou, com `valor`, o número. */
const conteudoDoBadge = (b, tamanho) => (b.valor !== undefined && b.valor !== null ? h('span', { class: 'ativ-badge-valor' }, String(b.valor)) : icone(b.icone, tamanho));

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
      ...badges.map((b) => h('div', { class: 'ativ-badges-item' }, h('span', { class: `ativ-badge ativ-badge-${b.categoria}`, style: b.tom ? `--cor:${b.tom}` : null }, conteudoDoBadge(b, 14)), h('span', null, b.rotulo))),
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

  function chipDoBadge(b) {
    const conteudo = [conteudoDoBadge(b, 14)];
    const props = {
      class: `ativ-badge ativ-badge-${b.categoria}`,
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
      const visiveis = ordenados.slice(0, MAXIMO_VISIVEL);
      const resto = ordenados.length - visiveis.length;
      const mais =
        resto > 0
          ? h('button', { type: 'button', class: 'ativ-badge ativ-badge-mais', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: `Ver todos os ${ordenados.length} badges`, 'aria-label': `Mais ${resto} badge${resto === 1 ? '' : 's'}: ver todos` }, `+${resto}`)
          : null;
      mais?.addEventListener('click', () => (aberto === mais ? esconder() : mostrar(mais, ordenados)));
      return h('div', { class: 'ativ-badges' }, ...visiveis.map(chipDoBadge), mais);
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
