import { ESTRATEGIAS_EM_LOTE, ESTRATEGIAS_TRAJETO, FOCOS, FOCOS_PARA_TRAJETO, formatarSegundos, NIVEIS, QUANTIDADES_EM_LOTE, resumirTreino } from '@no-strova/domain';
import { gerarTreinosDoTrajetoEmLote, salvarTreinosDoTrajeto } from '../../../application/trajetos.js';
import { areaMensagem, executarComBotao, selecao } from '../../../utils/componentes.js';
import { h } from '../../../utils/dom.js';
import { formatarNumero } from '../../../utils/formatters.js';
import { icone } from '../../../utils/icones.js';
import { abrirModal } from '../../../utils/modal.js';
import { perfilDoTreino } from '../../../utils/perfilTreino.js';

/**
 * Modal "Criar vários treinos do trajeto": o usuário escolhe quantos (5, 10 ou 20) e os critérios que podem variar (estratégias
 * de esforço, foco e nível). O servidor planeja combinações diferentes de foco × estratégia × nível e, com IA, uma só chamada
 * escolhe as zonas de todos os treinos. O usuário confere a lista, desmarca o que não quiser e salva o resto em "Meus treinos",
 * com a tag do trajeto.
 * @param {{ uid: string, trajeto: { id: string, nome: string }, esporte: string, nivelInicial?: string }} p
 * @returns {Promise<{ salvos: number }|undefined>}
 */
export function abrirTreinosEmLote({ uid, trajeto, esporte }) {
  return abrirModal({
    classe: 'modal-trecho modal-terreno modal-lote',
    rotulo: 'Criar vários treinos do trajeto',
    conteudo: (fechar) => {
      const mensagem = areaMensagem();
      let quantidade = QUANTIDADES_EM_LOTE[0];

      const botoesQuantidade = QUANTIDADES_EM_LOTE.map((q) => {
        const b = h('button', { class: 'cg-periodo', type: 'button', 'aria-pressed': String(q === quantidade) }, `${q} treinos`);
        b.addEventListener('click', () => {
          quantidade = q;
          botoesQuantidade.forEach((x, i) => x.setAttribute('aria-pressed', String(QUANTIDADES_EM_LOTE[i] === quantidade)));
        });
        return b;
      });

      const caixasEstrategia = ESTRATEGIAS_EM_LOTE.map((id) => {
        const caixa = h('input', { type: 'checkbox', value: id, checked: true });
        const rotulo = h('label', { class: 'traj-opcao traj-opcao-bloco' }, caixa, h('span', null, h('strong', null, ESTRATEGIAS_TRAJETO[id].rotulo), h('small', { class: 'dica' }, ESTRATEGIAS_TRAJETO[id].descricao)));
        return { caixa, rotulo };
      });

      const foco = selecao({ id: 'lote-foco', rotulo: 'Foco', opcoes: [{ valor: '', rotulo: 'Variados (todos os focos)' }, ...FOCOS_PARA_TRAJETO.map((id) => ({ valor: id, rotulo: FOCOS[id].rotulo }))], valor: '' });
      const nivel = selecao({ id: 'lote-nivel', rotulo: 'Nível', opcoes: [{ valor: 'variado', rotulo: 'Variados (todos os níveis)' }, ...Object.entries(NIVEIS).map(([valor, rotulo]) => ({ valor, rotulo }))], valor: 'variado' });
      const observacao = h('input', { id: 'lote-obs', type: 'text', maxLength: 300, placeholder: 'Ex.: evitar treinos muito longos (opcional)' });

      const resultado = h('div', { class: 'pilha lote-resultado', hidden: true });
      const botaoIa = h('button', { class: 'btn', type: 'button' }, icone('ia', 16), ' Gerar com IA');
      const botaoRegras = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Montar sem IA');

      const gerar = (botao, usarIa) =>
        executarComBotao(
          botao,
          mensagem,
          async () => {
            const estrategias = caixasEstrategia.filter((c) => c.caixa.checked).map((c) => c.caixa.value);
            if (estrategias.length === 0) throw new Error('Escolha ao menos uma estratégia de esforço.');
            const r = await gerarTreinosDoTrajetoEmLote({ trajetoId: trajeto.id, quantidade, estrategias, foco: foco.select.value, nivel: nivel.select.value, observacao: observacao.value.trim(), usarIa });
            desenharResultado(r);
          },
          usarIa ? `Montando ${quantidade} treinos…` : 'Montando…',
        );
      botaoIa.addEventListener('click', () => gerar(botaoIa, true));
      botaoRegras.addEventListener('click', () => gerar(botaoRegras, false));

      function desenharResultado(r) {
        const itens = r.treinos.map((t) => {
          const caixa = h('input', { type: 'checkbox', checked: true, 'aria-label': `Salvar ${t.treino.nome}` });
          const resumo = resumirTreino(t.treino.passos);
          const linha = h(
            'label',
            { class: 'lote-item' },
            caixa,
            h(
              'div',
              { class: 'lote-item-corpo' },
              h('strong', null, t.treino.nome),
              h(
                'small',
                { class: 'dica' },
                `${FOCOS[t.foco]?.rotulo ?? t.foco} · ${ESTRATEGIAS_TRAJETO[t.estrategia]?.rotulo ?? t.estrategia} · ${NIVEIS[t.nivel] ?? t.nivel} · ${formatarSegundos(resumo.duracaoS)}`,
              ),
              perfilDoTreino(t.treino.passos, { altura: 28 }),
            ),
            t.origem === 'ia' ? h('span', { class: 'chip-foco chip-foco-moderada' }, icone('ia', 12), ' IA') : h('span', { class: 'chip-foco chip-foco-baixa' }, 'Regras'),
          );
          return { caixa, treino: t.treino, linha };
        });

        const salvar = h('button', { class: 'btn', type: 'button' });
        const atualizarSalvar = () => {
          const n = itens.filter((i) => i.caixa.checked).length;
          salvar.textContent = n === 0 ? 'Salvar em Meus treinos' : `Salvar ${n} ${n === 1 ? 'treino' : 'treinos'} em Meus treinos`;
          salvar.disabled = n === 0;
        };
        itens.forEach((i) => i.caixa.addEventListener('change', atualizarSalvar));
        atualizarSalvar();
        const marcar = (valor) => {
          itens.forEach((i) => { i.caixa.checked = valor; });
          atualizarSalvar();
        };
        salvar.addEventListener('click', async () => {
          await executarComBotao(
            salvar,
            mensagem,
            async () => {
              const salvos = await salvarTreinosDoTrajeto({ uid, treinos: itens.filter((i) => i.caixa.checked).map((i) => i.treino), trajeto });
              fechar({ salvos });
            },
            'Salvando…',
          );
        });

        resultado.replaceChildren(...[
          h('div', { class: 'terreno-resumo' },
            h('span', null, `${r.treinos.length} treinos`),
            h('span', null, `${formatarNumero(r.resumoDoTerreno.distanciaM / 1000, 1)} km · +${formatarNumero(r.resumoDoTerreno.ganhoTotalM, 0)} m`),
            r.origem === 'ia' ? h('span', { class: 'chip-foco chip-foco-moderada' }, icone('ia', 12), ' Sugeridos por IA') : h('span', { class: 'chip-foco chip-foco-baixa' }, 'Regras das estratégias'),
          ),
          ...r.avisos.map((a) => h('p', { class: 'mensagem mensagem-aviso', role: 'status' }, a)),
          r.aviso ? h('p', { class: 'texto-secundario' }, r.aviso) : null,
          h('div', { class: 'linha-botoes' },
            h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => marcar(true) }, 'Marcar todos'),
            h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => marcar(false) }, 'Desmarcar todos'),
          ),
          h('div', { class: 'lote-lista' }, ...itens.map((i) => i.linha)),
          r.restantes !== null && r.origem === 'ia' ? h('p', { class: 'texto-secundario' }, `Restam ${r.restantes} ${r.restantes === 1 ? 'sugestão' : 'sugestões'} de IA hoje (esta rodada gastou uma só, para os ${r.treinos.length} treinos).`) : null,
          h('div', { class: 'modal-acoes' }, salvar),
        ].filter(Boolean));
        resultado.hidden = false;
        resultado.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      }

      return h(
        'div',
        { class: 'modal-corpo traj-modal' },
        h('div', { class: 'modal-texto' },
          h('h2', { class: 'modal-titulo' }, 'Vários treinos do trajeto'),
          h('p', { class: 'modal-mensagem' }, `${trajeto.nome} (${esporte === 'corrida' ? 'corrida' : 'ciclismo'}). O app monta treinos diferentes entre si, variando foco, estratégia de esforço e nível sobre o terreno da rota de referência. Gerar com IA gasta uma única sugestão do dia, para todos os treinos.`),
          h('div', { class: 'campo' }, h('span', { class: 'treinos-controle-rotulo' }, 'Quantos treinos'), h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Quantos treinos' }, ...botoesQuantidade)),
          h('div', { class: 'campo' }, h('span', { class: 'treinos-controle-rotulo' }, 'Estratégias de esforço a variar'), h('div', { class: 'traj-opcoes' }, ...caixasEstrategia.map((c) => c.rotulo))),
          h('div', { class: 'terreno-form' }, foco.raiz, nivel.raiz),
          h('div', { class: 'campo' }, h('label', { for: 'lote-obs' }, 'Observação'), observacao),
          mensagem.el,
          h('div', { class: 'modal-acoes' },
            h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Fechar'),
            botaoRegras,
            botaoIa,
          ),
          resultado,
        ),
      );
    },
  });
}
