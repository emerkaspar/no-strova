import { FOCOS, NIVEIS, sugerirTreinos } from '@no-strova/domain';
import { adicionarVariosAoPlano } from '../../application/treinos.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarForma } from '../../utils/formatters.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';
import { rotuloDoDia } from '../inicio/graficoPrincipal.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { textoResumo } from './cartaoTreino.js';
import { estadoTreinos } from './state.js';
import { confirmar } from '../../utils/modal.js';

const chave = (s) => `${s.data}|${s.modelo.id}`;

/**
 * Aba "Sugestões": os treinos que o app indica para os próximos 7 dias (por regras), com "Trocar" em cada um e
 * "Montar minha semana" para adicionar os selecionados ao plano de uma vez, com a aprovação do usuário.
 * @param {{
 *   uid: string, hoje: string, esporte: string, nivel: string, treinos: any[], configs: any[], proprios: any[],
 *   forma: number|null, aoVer: (modelo: any) => void, aoMudar: () => void
 * }} p `aoMudar` pede para a tela se redesenhar depois de trocar, sugerir outras ou adicionar
 */
export function criarAbaSugestoes({ uid, hoje, esporte, nivel, treinos, configs, proprios, forma, aoVer, aoMudar }) {
  const config = configs[0] ?? null;
  const mensagem = areaMensagem();
  const { sugestoes, avisos } = sugerirTreinos({
    hoje,
    esporte,
    nivel,
    treinos,
    forma,
    proprios,
    excluir: estadoTreinos.recusados,
    semente: estadoTreinos.semente ?? hoje,
  });
  const marcadas = sugestoes.filter((s) => !estadoTreinos.desmarcadas.includes(chave(s)));

  const linhas = sugestoes.map((s) => {
    const caixa = h('input', { type: 'checkbox', checked: !estadoTreinos.desmarcadas.includes(chave(s)), 'aria-label': `Incluir ${s.modelo.nome} em ${rotuloDoDia(s.data)}` });
    caixa.addEventListener('change', () => {
      const k = chave(s);
      estadoTreinos.desmarcadas = caixa.checked ? estadoTreinos.desmarcadas.filter((x) => x !== k) : [...estadoTreinos.desmarcadas, k];
      aoMudar();
    });
    return h(
      'li',
      { class: 'sugestao', 'data-data': s.data },
      h('label', { class: 'sugestao-dia' }, caixa, h('span', null, rotuloDoDia(s.data))),
      h(
        'div',
        { class: 'sugestao-corpo' },
        h('strong', null, s.modelo.nome, s.modelo.especificacao ? h('span', { class: 'texto-secundario' }, ` (${s.modelo.especificacao})`) : null, ' ', h('span', { class: `chip-foco chip-foco-${s.intensidade}` }, FOCOS[s.modelo.foco]?.rotulo ?? s.modelo.foco)),
        perfilDoTreino(s.modelo.passos, { altura: 36 }),
        h('p', { class: 'treino-resumo' }, textoResumo(s.modelo, config)),
        h('p', { class: 'texto-secundario' }, s.motivo),
      ),
      h(
        'div',
        { class: 'acoes' },
        h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => aoVer(s.modelo) }, 'Ver'),
        h(
          'button',
          {
            class: 'btn btn-secundario',
            type: 'button',
            onClick: () => {
              estadoTreinos.recusados = [...estadoTreinos.recusados, s.modelo.id];
              aoMudar();
            },
          },
          'Trocar',
        ),
      ),
    );
  });

  const botaoAdicionar = h('button', { class: 'btn', type: 'button', disabled: marcadas.length === 0 }, marcadas.length > 0 ? `Adicionar ${marcadas.length} ao plano` : 'Adicionar ao plano');
  botaoAdicionar.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Adicionar ao plano?', mensagem: `${marcadas.length} treino${marcadas.length === 1 ? '' : 's'} ${marcadas.length === 1 ? 'entra' : 'entram'} no seu plano.`, confirmarTexto: 'Adicionar', tipo: 'info', icone: 'plano' }))) return;
    executarComBotao(botaoAdicionar, mensagem, async () => {
      await adicionarVariosAoPlano({ uid, itens: marcadas.map((s) => ({ modelo: s.modelo, data: s.data })), configs });
      estadoTreinos.recusados = [];
      estadoTreinos.desmarcadas = [];
      estadoTreinos.semente = null;
      mensagem.mostrar(`${marcadas.length} treino${marcadas.length === 1 ? '' : 's'} adicionado${marcadas.length === 1 ? '' : 's'} ao plano.`, 'ok');
    });
  });
  const botaoOutras = h(
    'button',
    {
      class: 'btn btn-secundario',
      type: 'button',
      onClick: () => {
        estadoTreinos.semente = String(Date.now());
        estadoTreinos.recusados = [];
        estadoTreinos.desmarcadas = [];
        aoMudar();
      },
    },
    'Sugerir outras',
  );

  return h(
    'section',
    { class: 'card', id: 'sugestoes' },
    h('h2', null, 'Montar minha semana'),
    h(
      'p',
      { class: 'texto-secundario' },
      `Treinos ${(NIVEIS[nivel] ?? nivel).toLowerCase()}s de ${(ROTULO_ESPORTE[esporte] ?? esporte).toLowerCase()} para os próximos 7 dias. O app gira o foco, evita repetir treinos e respeita a sua carga: no máximo 2 treinos intensos por semana, com 48 h entre eles${forma === null ? '' : `. Sua Forma hoje: ${formatarForma(forma, 1)}`}. Nada entra no plano sem a sua aprovação.`,
    ),
    ...avisos.map((a) => h('p', { class: 'mensagem mensagem-aviso' }, a)),
    sugestoes.length > 0
      ? h('ul', { class: 'sugestoes' }, ...linhas)
      : avisos.length === 0
        ? h('p', { class: 'vazio-curto' }, 'Sem sugestões para esta semana.')
        : null,
    mensagem.el,
    h('div', { class: 'linha-botoes' }, botaoAdicionar, botaoOutras),
  );
}
