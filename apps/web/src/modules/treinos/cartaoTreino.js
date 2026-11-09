import { estimarEstresseEstruturado, FOCOS, formatarSegundos, NIVEIS, resumirTreino } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';

/** Linha de resumo: duração, zona predominante e HRSS estimado (quando há configuração de FC). */
export function textoResumo(modelo, config) {
  const r = resumirTreino(modelo.passos);
  const hrss = estimarEstresseEstruturado({ passos: modelo.passos, config });
  return `${formatarSegundos(r.duracaoS)} · ${r.zona} · ${hrss === null ? 'HRSS sem configuração de FC' : `~${formatarNumero(hrss, 0)} de HRSS`}`;
}

/**
 * Cartão de um treino (catálogo ou próprio): nome, apelido, foco e nível, perfil em miniatura e resumo.
 * @param {{ modelo: any, config: any|null, acoes?: Array<HTMLElement>, aoAbrir: (modelo: any) => void }} p
 */
export function criarCartaoTreino({ modelo, config, acoes = [], aoAbrir }) {
  const foco = FOCOS[modelo.foco];
  return h(
    'article',
    { class: 'treino-cartao', 'data-id': modelo.id },
    h(
      'div',
      { class: 'treino-cabecalho' },
      h('div', null, h('h3', { class: 'treino-nome' }, modelo.nome), modelo.especificacao ? h('p', { class: 'treino-apelido' }, modelo.especificacao) : null),
      h('span', { class: `chip-foco chip-foco-${foco?.intensidade ?? 'moderada'}` }, foco?.rotulo ?? modelo.foco),
    ),
    perfilDoTreino(modelo.passos),
    modelo.trajetoNome ? h('p', null, h('span', { class: 'chip-trajeto', title: 'Treino adaptado à altimetria deste trajeto' }, icone('rota', 13), ` ${modelo.trajetoNome}`)) : null,
    h('p', { class: 'treino-resumo' }, textoResumo(modelo, config)),
    h(
      'div',
      { class: 'treino-rodape' },
      h('span', { class: 'texto-secundario' }, `${NIVEIS[modelo.nivel] ?? modelo.nivel}${modelo.origem === 'proprio' ? ' · seu treino' : ''}`),
      h('div', { class: 'acoes' }, ...acoes, h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => aoAbrir(modelo) }, 'Ver treino')),
    ),
  );
}
