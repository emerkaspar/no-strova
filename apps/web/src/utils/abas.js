import { h } from './dom.js';
import { icone } from './icones.js';

/** Colunas de uma grade de cartões: até 5 por fileira; acima disso as fileiras ficam parelhas (8 viram 4 + 4, sem cartão sozinho). */
export const colunasDe = (n) => (n <= 5 ? n : Math.ceil(n / Math.ceil(n / 5)));

const lerAba = (chave) => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};

const guardarAba = (chave, id) => {
  try {
    localStorage.setItem(chave, id);
  } catch {
    /* sem armazenamento: a aba volta para a primeira */
  }
};

/**
 * Abas (ARIA tablist) com um painel por aba: só o da aba ativa aparece, a última aba aberta fica lembrada no navegador
 * (`chave`) e as setas, Home e End trocam de aba. Abas nulas são ignoradas.
 * @param {{ chave: string, rotuloAria: string, abas: Array<null | { id: string, nome: string, titulo?: string, icone: string, ponto?: boolean, painel: HTMLElement }> }} opcoes
 * `ponto`: mostra o pontinho de "tem novidade" na aba. `painel` é o conteúdo da aba (a função só liga os atributos de acessibilidade).
 * @returns {{ lista: HTMLElement, paineis: HTMLElement[], selecionar: (id: string) => void }}
 */
export function criarAbas({ abas, chave, rotuloAria }) {
  const uteis = abas.filter(Boolean);
  const botoes = new Map();
  const paineis = new Map();

  const selecionar = (id, { foco = false } = {}) => {
    for (const [k, botao] of botoes) {
      const ligada = k === id;
      botao.classList.toggle('ativa', ligada);
      botao.setAttribute('aria-selected', String(ligada));
      botao.tabIndex = ligada ? 0 : -1;
      paineis.get(k).hidden = !ligada;
    }
    guardarAba(chave, id);
    const alvo = botoes.get(id);
    if (foco) alvo.focus();
    alvo.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  };

  for (const a of uteis) {
    const botao = h(
      'button',
      { class: 'rec-aba', type: 'button', role: 'tab', id: `${chave}-aba-${a.id}`, 'aria-controls': `${chave}-painel-${a.id}`, title: a.titulo ?? a.nome },
      icone(a.icone, 15),
      a.nome,
      a.ponto ? h('span', { class: 'rec-aba-ponto', title: 'Tem recorde novo', role: 'img', 'aria-label': 'Tem recorde novo' }) : null,
    );
    botao.addEventListener('click', () => selecionar(a.id));
    botoes.set(a.id, botao);
    a.painel.setAttribute('role', 'tabpanel');
    a.painel.id = `${chave}-painel-${a.id}`;
    a.painel.setAttribute('aria-labelledby', botao.id);
    paineis.set(a.id, a.painel);
  }

  const lista = h('div', { class: 'rec-abas', role: 'tablist', 'aria-label': rotuloAria }, ...botoes.values());
  lista.addEventListener('keydown', (e) => {
    const ids = [...botoes.keys()];
    const atual = ids.findIndex((id) => botoes.get(id).getAttribute('aria-selected') === 'true');
    const destino = { ArrowRight: (atual + 1) % ids.length, ArrowLeft: (atual - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    selecionar(ids[destino], { foco: true });
  });

  const salva = lerAba(chave);
  const inicial = uteis.some((a) => a.id === salva) ? salva : uteis[0]?.id;
  if (inicial) selecionar(inicial);
  return { lista, paineis: [...paineis.values()], selecionar };
}
