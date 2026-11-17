import { h } from './dom.js';

/**
 * Índice fixo no topo de uma página de seções (mesmo visual das âncoras do Plano e da Progressão): cada botão rola até a
 * seção, a que está na parte de cima da tela fica destacada e a URL acompanha, sem recarregar.
 * As seções precisam ter `id = prefixo + id`.
 * @param {{ raiz: HTMLElement, secoes: Array<{ id: string, rotulo: string }>, prefixo: string, rotaBase: string, rotuloAria: string }} p
 * @returns {{ el: HTMLElement, observar: () => void, irPara: (id: string, comportamento?: ScrollBehavior) => void, parar: () => void }}
 */
export function criarIndiceDeSecoes({ raiz, secoes, prefixo, rotaBase, rotuloAria }) {
  let visivel = secoes[0].id;
  let observador = null;

  function irPara(id, comportamento = 'smooth') {
    window.history.replaceState(null, '', id === secoes[0].id ? rotaBase : `${rotaBase}/${id}`);
    document.getElementById(`${prefixo}${id}`)?.scrollIntoView?.({ behavior: comportamento, block: 'start' });
  }

  const el = h(
    'nav',
    { class: 'plano-ancoras', 'aria-label': rotuloAria },
    ...secoes.map((s) => h('button', { class: 'plano-ancora', type: 'button', 'data-secao': s.id, 'aria-current': visivel === s.id ? 'true' : null, onClick: () => irPara(s.id) }, s.rotulo)),
  );

  function observar() {
    observador?.disconnect();
    observador = null;
    if (typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Set();
    observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.dataset.secao);
          else visiveis.delete(e.target.dataset.secao);
        }
        const atual = secoes.find((s) => visiveis.has(s.id))?.id;
        if (atual && atual !== visivel) {
          visivel = atual;
          raiz.querySelectorAll('.plano-ancora').forEach((b) => b.setAttribute('aria-current', String(b.dataset.secao === atual)));
        }
      },
      // só conta a faixa de cima da tela (abaixo da barra fixa)
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const s of secoes) {
      const alvo = document.getElementById(`${prefixo}${s.id}`);
      if (alvo) {
        alvo.dataset.secao = s.id;
        observador.observe(alvo);
      }
    }
  }

  return { el, observar, irPara, parar: () => observador?.disconnect() };
}
