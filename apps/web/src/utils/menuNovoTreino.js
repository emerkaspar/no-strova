import { h } from './dom.js';
import { icone } from './icones.js';

/** Menu aberto no momento (só um por vez); fecha ao clicar fora ou apertar Esc. */
let aberto = null;

function fechar() {
  if (!aberto) return;
  aberto.classList.remove('aberto');
  aberto.querySelector('.novo-mais')?.setAttribute('aria-expanded', 'false');
  aberto = null;
}
document.addEventListener('click', (e) => {
  if (aberto && !aberto.contains(e.target)) fechar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fechar();
});

/**
 * Botão redondo que abre ícones coloridos com animação.
 * @param {{
 *   rotuloBotao: string, simbolo?: string, classe?: string, centralizado?: boolean, variante?: string,
 *   opcoes: Array<{ icone: string, titulo: string, rotulo: string, classe: string, aoClicar: () => void }>
 * }} p
 */
export function criarMenuDeOpcoes({ rotuloBotao, simbolo = '+', classe = '', centralizado = false, variante = '', opcoes }) {
  const mais = h('button', { type: 'button', class: `novo-mais ${classe}`.trim(), 'aria-label': rotuloBotao, 'aria-haspopup': 'true', 'aria-expanded': 'false' }, simbolo);
  const menu = h(
    'div',
    { class: 'novo-menu', role: 'group', 'aria-label': rotuloBotao },
    ...opcoes.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: `novo-opcao ${o.classe}`,
          title: o.titulo,
          'aria-label': o.rotulo,
          onClick: () => {
            fechar();
            o.aoClicar();
          },
        },
        icone(o.icone, 16),
      ),
    ),
  );
  const wrap = h('div', { class: `novo-wrap${centralizado ? ' novo-centro' : ''}${variante ? ` ${variante}` : ''}` }, mais, menu);
  wrap.addEventListener('click', (e) => e.stopPropagation()); // não dispara o detalhe do dia da coluna
  mais.addEventListener('click', () => {
    const abrir = aberto !== wrap;
    fechar();
    if (abrir) {
      wrap.classList.add('aberto');
      mais.setAttribute('aria-expanded', 'true');
      aberto = wrap;
    }
  });
  return wrap;
}

/**
 * "+" de novo treino num dia. Com a IA liberada, abre dois ícones (manual e IA); sem IA, é um botão simples que já escolhe o manual.
 * @param {{ rotulo: string, comIa: boolean, aoEscolher: (modo: 'manual'|'ia') => void, classe?: string, centralizado?: boolean }} p
 */
export function criarMenuNovoTreino({ rotulo, comIa, aoEscolher, classe = '', centralizado = false }) {
  if (!comIa) {
    return h('button', { type: 'button', class: `novo-mais ${classe}`.trim(), 'aria-label': `Novo treino em ${rotulo}`, onClick: () => aoEscolher('manual') }, '+');
  }
  return criarMenuDeOpcoes({
    rotuloBotao: `Novo treino em ${rotulo}`,
    classe,
    centralizado,
    opcoes: [
      { icone: 'lapis', titulo: 'Criar manualmente', rotulo: `Criar treino manualmente em ${rotulo}`, classe: 'novo-manual', aoClicar: () => aoEscolher('manual') },
      { icone: 'ia', titulo: 'Sugerir com IA', rotulo: `Pedir um treino à IA para ${rotulo}`, classe: 'novo-ia', aoClicar: () => aoEscolher('ia') },
    ],
  });
}

/**
 * Botão "⋯" de um dia que já tem treino planejado: abre criar manualmente, sugerir com IA (se liberada) e excluir o treino do dia.
 * @param {{ rotulo: string, comIa: boolean, aoEscolher: (modo: 'manual'|'ia') => void, aoExcluir: () => void, classe?: string, centralizado?: boolean }} p
 */
export function criarMenuDoTreino({ rotulo, comIa, aoEscolher, aoExcluir, classe = '', centralizado = false }) {
  return criarMenuDeOpcoes({
    rotuloBotao: `Opções do dia ${rotulo}: novo treino ou excluir o treino planejado`,
    simbolo: '⋯',
    classe,
    centralizado,
    variante: 'novo-edicao',
    opcoes: [
      { icone: 'lapis', titulo: 'Criar manualmente', rotulo: `Criar treino manualmente em ${rotulo}`, classe: 'novo-manual', aoClicar: () => aoEscolher('manual') },
      ...(comIa ? [{ icone: 'ia', titulo: 'Sugerir com IA', rotulo: `Pedir um treino à IA para ${rotulo}`, classe: 'novo-ia', aoClicar: () => aoEscolher('ia') }] : []),
      { icone: 'lixeira', titulo: 'Excluir treino planejado', rotulo: `Excluir o treino planejado de ${rotulo}`, classe: 'novo-excluir', aoClicar: aoExcluir },
    ],
  });
}
