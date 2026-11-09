import { descreverSegmento, ESTRATEGIAS_TRAJETO, FOCOS, FOCOS_PARA_TRAJETO, formatarSegundos, NIVEIS, resumirTreino, ROTULOS_DO_TERRENO } from '@no-strova/domain';
import { gerarTreinoDoTrajeto, salvarTreinoDoTrajeto } from '../../../application/trajetos.js';
import { areaMensagem, executarComBotao, selecao } from '../../../utils/componentes.js';
import { h } from '../../../utils/dom.js';
import { formatarNumero } from '../../../utils/formatters.js';
import { icone } from '../../../utils/icones.js';
import { abrirModal } from '../../../utils/modal.js';
import { perfilDoTreino } from '../../../utils/perfilTreino.js';
import { perfilDoTerreno } from './perfilTerreno.js';

/**
 * Modal "Criar treino adaptado ao trajeto": o usuário escolhe foco, nível e estratégia de esforço; o servidor lê a altimetria
 * da rota de referência e monta um treino cujos blocos acompanham o terreno (a IA decide a intensidade de cada trecho, ou as
 * regras da estratégia, sem IA). O usuário confere a prévia e salva em "Meus treinos", com a tag do trajeto.
 * @param {{ uid: string, trajeto: { id: string, nome: string }, esporte: string, nivelInicial?: string }} p
 * @returns {Promise<{ salvo: boolean, id?: string }|undefined>}
 */
export function abrirTreinoAdaptado({ uid, trajeto, esporte, nivelInicial = 'intermediario' }) {
  return abrirModal({
    classe: 'modal-trecho modal-terreno',
    rotulo: 'Criar treino adaptado ao trajeto',
    conteudo: (fechar) => {
      const mensagem = areaMensagem();
      const foco = selecao({ id: 'terreno-foco', rotulo: 'Foco do treino', opcoes: FOCOS_PARA_TRAJETO.map((id) => ({ valor: id, rotulo: FOCOS[id].rotulo })), valor: 'limiar' });
      const nivel = selecao({ id: 'terreno-nivel', rotulo: 'Nível', opcoes: Object.entries(NIVEIS).map(([valor, rotulo]) => ({ valor, rotulo })), valor: nivelInicial in NIVEIS ? nivelInicial : 'intermediario' });
      let estrategia = 'subidas';
      const radios = Object.entries(ESTRATEGIAS_TRAJETO).map(([valor, e]) => {
        const radio = h('input', { type: 'radio', name: 'estrategia-terreno', value: valor, checked: valor === estrategia });
        radio.addEventListener('change', () => { estrategia = valor; });
        return h('label', { class: 'traj-opcao traj-opcao-bloco' }, radio, h('span', null, h('strong', null, e.rotulo), h('small', { class: 'dica' }, e.descricao)));
      });
      const observacao = h('input', { id: 'terreno-obs', type: 'text', maxLength: 300, placeholder: 'Ex.: quero terminar com a perna boa para amanhã (opcional)' });

      const previa = h('div', { class: 'pilha terreno-previa', hidden: true });
      const botaoIa = h('button', { class: 'btn', type: 'button' }, icone('ia', 16), ' Gerar com IA');
      const botaoRegras = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Montar sem IA');
      const gerar = (botao, usarIa) =>
        executarComBotao(
          botao,
          mensagem,
          async () => {
            const r = await gerarTreinoDoTrajeto({ trajetoId: trajeto.id, foco: foco.select.value, nivel: nivel.select.value, estrategia, observacao: observacao.value.trim(), usarIa });
            desenharPrevia(r);
          },
          usarIa ? 'Analisando o terreno…' : 'Montando…',
        );
      botaoIa.addEventListener('click', () => gerar(botaoIa, true));
      botaoRegras.addEventListener('click', () => gerar(botaoRegras, false));

      function desenharPrevia(r) {
        const resumo = r.resumoDoTerreno;
        const treino = r.treino;
        const treinoResumo = resumirTreino(treino.passos);
        const nome = h('input', { id: 'terreno-nome', type: 'text', maxLength: 60, value: treino.nome });
        const salvar = h('button', { class: 'btn', type: 'button' }, 'Salvar em Meus treinos');
        salvar.addEventListener('click', async () => {
          const ok = await executarComBotao(
            salvar,
            mensagem,
            async () => {
              const id = await salvarTreinoDoTrajeto({ uid, treino: { ...treino, nome: nome.value }, trajeto });
              fechar({ salvo: true, id });
            },
            'Salvando…',
          );
          if (!ok) salvar.focus();
        });

        previa.replaceChildren(
          h('div', { class: 'terreno-resumo' },
            h('span', null, `${formatarNumero(resumo.distanciaM / 1000, 1)} km`),
            h('span', null, `+${formatarNumero(resumo.ganhoTotalM, 0)} m / −${formatarNumero(resumo.perdaTotalM, 0)} m`),
            h('span', null, formatarSegundos(treinoResumo.duracaoS)),
            r.origem === 'ia' ? h('span', { class: 'chip-foco chip-foco-moderada' }, icone('ia', 12), ' Sugerido por IA') : h('span', { class: 'chip-foco chip-foco-baixa' }, 'Regras da estratégia'),
          ),
          perfilDoTerreno({ perfil: r.perfil, segmentos: r.segmentos }),
          perfilDoTreino(treino.passos, { altura: 48 }),
          h('ul', { class: 'terreno-trechos' }, ...r.segmentos.map((s) =>
            h('li', { class: 'terreno-trecho' },
              h('span', { class: `terreno-zona perfil-fundo-${s.zona.toLowerCase()}` }, s.zona),
              h('div', null,
                h('strong', null, `${ROTULOS_DO_TERRENO[s.tipo]} · ${s.papel === 'principal' ? 'esforço' : 'recuperação'}`),
                h('small', { class: 'dica' }, descreverSegmento(s)),
                h('small', { class: 'dica' }, s.motivo),
              ),
            ),
          )),
          ...r.avisos.map((a) => h('p', { class: 'mensagem mensagem-aviso', role: 'status' }, a)),
          r.aviso ? h('p', { class: 'texto-secundario' }, r.aviso) : null,
          treino.descricao ? h('p', { class: 'texto-secundario' }, treino.descricao) : null,
          h('div', { class: 'campo' }, h('label', { for: 'terreno-nome' }, 'Nome do treino'), nome),
          r.restantes !== null && r.origem === 'ia' ? h('p', { class: 'texto-secundario' }, `Restam ${r.restantes} ${r.restantes === 1 ? 'sugestão' : 'sugestões'} de IA hoje.`) : null,
          h('div', { class: 'modal-acoes' }, salvar),
        );
        previa.hidden = false;
        previa.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      }

      return h(
        'div',
        { class: 'modal-corpo traj-modal' },
        h('div', { class: 'modal-texto' },
          h('h2', { class: 'modal-titulo' }, 'Treino adaptado ao trajeto'),
          h('p', { class: 'modal-mensagem' }, `${trajeto.nome} (${esporte === 'corrida' ? 'corrida' : 'ciclismo'}). O treino acompanha as subidas e descidas da rota de referência: cada bloco dura o tempo que você levou nesse trecho.`),
          h('div', { class: 'terreno-form' }, foco.raiz, nivel.raiz),
          h('div', { class: 'traj-opcoes', role: 'radiogroup', 'aria-label': 'Estratégia de esforço' }, ...radios),
          h('div', { class: 'campo' }, h('label', { for: 'terreno-obs' }, 'Observação'), observacao),
          mensagem.el,
          h('div', { class: 'modal-acoes' },
            h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Fechar'),
            botaoRegras,
            botaoIa,
          ),
          previa,
        ),
      );
    },
  });
}
