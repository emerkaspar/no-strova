import { h } from './dom.js';
import { icone } from './icones.js';

/**
 * Cabeçalho único das páginas (Atividades, Plano, Progressão, Treinos, Peso, Notificações, Configuração, Administração, Forma):
 * um cartão com degradê laranja suave, o ícone da página num bloco laranja, o título (h1), uma barrinha de destaque, o
 * subtítulo e, à direita, as ações da página. O ícone grande e apagado ao fundo é só decoração. O Início não usa.
 * @param {{ icone: string, titulo: string, subtitulo?: string, acoes?: Node | null }} opcoes
 */
export function paginaTopo({ icone: nomeIcone, titulo, subtitulo = '', acoes = null }) {
  return h(
    'header',
    { class: 'pagina-topo' },
    h('span', { class: 'pagina-topo-marca', 'aria-hidden': 'true' }, icone(nomeIcone, 150)),
    h('span', { class: 'pagina-topo-icone', 'aria-hidden': 'true' }, icone(nomeIcone, 28)),
    h('div', { class: 'pagina-topo-texto' }, h('h1', null, titulo), h('span', { class: 'pagina-topo-barra', 'aria-hidden': 'true' }), subtitulo ? h('p', null, subtitulo) : null),
    acoes ? h('div', { class: 'pagina-topo-acoes' }, acoes) : null,
  );
}
