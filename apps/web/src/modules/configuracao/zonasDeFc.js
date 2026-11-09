import { FAIXAS_LTHR, faixaDeFcDaZona, fcMediaDaZona } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { secaoRecolhivel } from './secaoRecolhivel.js';

/** Como cada zona é sentida e para que serve (Z1 a Z5), com o ícone e a cor (`--zona-N`, azul → verde → amarelo → laranja → vermelho). */
const ZONAS_DE_FC = [
  { zona: 'Z1', nome: 'Recuperação', icone: 'folha', sensacao: 'Bem leve: dá para conversar sem esforço. Solta as pernas depois de um dia forte.' },
  { zona: 'Z2', nome: 'Aeróbico', icone: 'fc', sensacao: 'Ritmo confortável, sustentável por horas. É a base que constrói resistência.' },
  { zona: 'Z3', nome: 'Tempo', icone: 'cronometro', sensacao: 'Moderado: a respiração fica mais forte e só cabem frases curtas.' },
  { zona: 'Z4', nome: 'Limiar', icone: 'velocimetro', sensacao: 'Forte: perto do que você aguenta por cerca de 1 hora. Desconfortável, mas controlado.' },
  { zona: 'Z5', nome: 'VO2máx', icone: 'chama', sensacao: 'Máximo: esforços curtos e intensos, com recuperação entre eles.' },
];

const percentual = (fracao) => `${formatarNumero(fracao * 100, (fracao * 100) % 1 === 0 ? 0 : 1)}%`;

/** A faixa em palavras: a FC abaixo da Z1 conta na Z1 e a acima da Z5 conta na Z5, então as pontas ficam abertas. */
function textoDaFaixa(zona, [baixo, alto]) {
  if (zona === 'Z1') return `até ${alto}`;
  if (zona === 'Z5') return `${baixo}+`;
  return `${baixo} – ${alto}`;
}

/**
 * Cartão "Zonas de frequência cardíaca": mostra em bpm as faixas que o app está usando (Z1 a Z5), calculadas a partir do LTHR
 * da vigência escolhida (a mais recente por padrão), e explica de onde elas vêm.
 * @param {{ configs: any[] }} p `configs` vem da mais recente para a mais antiga
 */
export function criarCartaoZonasDeFc({ configs }) {
  const corpo = h('div', { class: 'zfc-corpo' });
  const abas = h('div', { class: 'zfc-vigencias', role: 'group', 'aria-label': 'Vigência da configuração' });
  let indice = 0;

  function desenhar() {
    const config = configs[indice];
    abas.replaceChildren(
      ...(configs.length > 1
        ? configs.map((c, i) =>
            h(
              'button',
              { class: `zfc-aba${i === indice ? ' zfc-aba-ativa' : ''}`, type: 'button', 'aria-pressed': String(i === indice), onClick: () => { indice = i; desenhar(); } },
              i === 0 ? 'Atual' : `Desde ${formatarData(c.vigenteDesde)}`,
            ),
          )
        : []),
    );
    abas.hidden = configs.length < 2;

    if (!config) {
      corpo.replaceChildren(h('p', { class: 'vazio-curto' }, 'Cadastre a configuração do atleta (com o LTHR) para ver as suas zonas.'));
      return;
    }

    const faixas = ZONAS_DE_FC.map((z) => ({ ...z, faixa: faixaDeFcDaZona(z.zona, config), fracoes: FAIXAS_LTHR[z.zona], media: fcMediaDaZona(z.zona, config) }));

    // régua com as cinco zonas lado a lado (a largura de cada uma segue a sua faixa em bpm) e a marca do LTHR
    const regua = h(
      'div',
      { class: 'zfc-regua', role: 'img', 'aria-label': faixas.map((f) => `${f.zona}: ${textoDaFaixa(f.zona, f.faixa)} bpm`).join('; ') },
      ...faixas.map((f) => h('span', { class: `zfc-trecho zona-${f.zona.slice(1)}`, style: `flex-grow:${Math.max(f.faixa[1] - f.faixa[0], 1)}` }, f.zona)),
    );

    const cartoes = faixas.map((f) =>
      h(
        'li',
        { class: `zfc-cartao zona-${f.zona.slice(1)}` },
        h(
          'div',
          { class: 'zfc-topo' },
          h('span', { class: 'zfc-icone', 'aria-hidden': 'true' }, icone(f.icone, 22)),
          h('div', { class: 'zfc-ident' }, h('strong', { class: 'zfc-zona' }, f.zona), h('span', { class: 'zfc-nome' }, f.nome)),
        ),
        h('div', { class: 'zfc-faixa' }, h('strong', { class: 'zfc-bpm' }, textoDaFaixa(f.zona, f.faixa)), h('span', { class: 'zfc-unidade' }, 'bpm')),
        h(
          'p',
          { class: 'zfc-meta' },
          f.zona === 'Z1' ? `até ${percentual(f.fracoes[1])} do LTHR` : f.zona === 'Z5' ? `a partir de ${percentual(f.fracoes[0])} do LTHR` : `${percentual(f.fracoes[0])} a ${percentual(f.fracoes[1])} do LTHR`,
        ),
        h('p', { class: 'zfc-sensacao' }, f.sensacao),
        h('p', { class: 'zfc-media' }, 'FC média presumida na estimativa: ', h('strong', null, `${f.media} bpm`)),
      ),
    );

    corpo.replaceChildren(
      h(
        'p',
        { class: 'zfc-base' },
        `Calculadas com o LTHR de ${config.lthr} bpm`,
        config.fcMax ? ` e a FC máxima de ${config.fcMax} bpm` : '',
        `, vigente desde ${formatarData(config.vigenteDesde)}.`,
      ),
      regua,
      h('ul', { class: 'zfc-grade' }, ...cartoes),
    );
  }
  desenhar();

  return secaoRecolhivel({
    id: 'zonas-fc',
    titulo: 'Zonas de frequência cardíaca',
    corpo: [
      h(
        'p',
        { class: 'texto-secundario' },
        'Estas são as faixas de FC que o app usa em tudo: no tempo por zona das atividades, nos alvos dos treinos planejados e na calibração acima. Elas seguem as faixas de Joe Friel e são calculadas só a partir do seu LTHR (limitadas pela FC máxima). Não são estimadas pelas atividades.',
      ),
      h(
        'p',
        { class: 'texto-secundario' },
        'Elas mudam quando o LTHR muda, ou seja, quando você cria uma nova vigência na configuração do atleta (por exemplo, depois de um Teste de LTHR). Cada atividade usa a vigência da data dela, e o “Recalcular histórico” aplica as zonas novas às atividades já importadas. A FC abaixo da Z1 conta na Z1 e a acima da Z5 conta na Z5.',
      ),
      abas,
      corpo,
    ],
  });
}
