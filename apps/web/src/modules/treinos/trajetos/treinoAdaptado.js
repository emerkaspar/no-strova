import { descreverSegmento, ESTRATEGIA_RECORDE, ESTRATEGIAS_TRAJETO, FOCOS, FOCOS_PARA_TRAJETO, formatarSegundos, NIVEIS, resumirTreino, ROTULOS_DO_TERRENO } from '@no-strova/domain';
import { gerarTreinoDoTrajeto, salvarTreinoDoTrajeto } from '../../../application/trajetos.js';
import { areaMensagem, executarComBotao, selecao } from '../../../utils/componentes.js';
import { h } from '../../../utils/dom.js';
import { formatarNumero } from '../../../utils/formatters.js';
import { icone } from '../../../utils/icones.js';
import { abrirModal } from '../../../utils/modal.js';
import { perfilDoTreino } from '../../../utils/perfilTreino.js';
import { perfilDoTerreno } from './perfilTerreno.js';

const minutosESegundos = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dataBr = (iso) => String(iso ?? '').split('-').reverse().join('/');

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
        radio.addEventListener('change', () => { estrategia = valor; atualizarModo(); });
        const destaque = valor === ESTRATEGIA_RECORDE ? ' traj-opcao-destaque' : '';
        return h('label', { class: `traj-opcao traj-opcao-bloco${destaque}` }, radio, h('span', null, h('strong', null, e.rotulo), h('small', { class: 'dica' }, e.descricao)));
      });
      const observacao = h('input', { id: 'terreno-obs', type: 'text', maxLength: 300, placeholder: 'Ex.: quero terminar com a perna boa para amanhã (opcional)' });
      const formFocoNivel = h('div', { class: 'terreno-form' }, foco.raiz, nivel.raiz);
      const campoObs = h('div', { class: 'campo' }, h('label', { for: 'terreno-obs' }, 'Observação'), observacao);
      // "Zerar o trajeto" é a opção única: some o resto e aparecem só as instruções
      const instrucoes = h('div', { class: 'terreno-instrucoes', hidden: true },
        h('strong', null, 'Como funciona o “Zerar o trajeto”'),
        h('ol', null,
          h('li', null, 'O app procura a sua melhor marca neste trajeto (a passagem mais rápida, sem contar as de distância muito diferente).'),
          h('li', null, 'Refaz o terreno dessa passagem e a FC que você teve em cada trecho.'),
          h('li', null, 'Monta blocos com a meta de tempo e de ritmo de cada trecho, para fechar o trajeto cerca de 1% mais rápido que o recorde (no mínimo 5 s).'),
        ),
        h('p', { class: 'texto-secundario' }, 'Não usa IA nem gasta as sugestões do dia: o cálculo é todo feito com os seus dados. Aqueça antes e comece no ponto de partida do trajeto, com o treino iniciado.'),
      );

      const previa = h('div', { class: 'pilha terreno-previa', hidden: true });
      const botaoIa = h('button', { class: 'btn', type: 'button' }, icone('ia', 16), ' Gerar com IA');
      const botaoRegras = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Montar sem IA');
      const botaoRecorde = h('button', { class: 'btn', type: 'button', hidden: true }, 'Montar treino para zerar o trajeto');

      function atualizarModo() {
        const recorde = estrategia === ESTRATEGIA_RECORDE;
        formFocoNivel.hidden = recorde;
        campoObs.hidden = recorde;
        botaoIa.hidden = recorde;
        botaoRegras.hidden = recorde;
        botaoRecorde.hidden = !recorde;
        instrucoes.hidden = !recorde;
        previa.hidden = true;
        mensagem.limpar();
      }

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
      botaoRecorde.addEventListener('click', () => gerar(botaoRecorde, false));

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
            r.origem === 'ia' ? h('span', { class: 'chip-foco chip-foco-moderada' }, icone('ia', 12), ' Sugerido por IA') : r.origem === 'recorde' ? h('span', { class: 'chip-foco chip-foco-alta' }, 'Meta do recorde') : h('span', { class: 'chip-foco chip-foco-baixa' }, 'Regras da estratégia'),
          ),
          r.recorde
            ? h('div', { class: 'terreno-recorde' },
                h('strong', null, `Recorde: ${minutosESegundos(r.recorde.recordeS)} em ${dataBr(r.recorde.data)}`),
                h('span', null, `Meta: ${minutosESegundos(r.recorde.metaS)} (${Math.round(r.recorde.ganhoS)} s mais rápido)`),
                r.melhores?.length > 1 ? h('small', { class: 'dica' }, `Suas melhores marcas: ${r.melhores.map((m, i) => `${i + 1}º ${minutosESegundos(m.tempoS)} (${dataBr(m.data)})`).join(' · ')}`) : null,
              )
            : null,
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
          h('div', { class: 'traj-opcoes', role: 'radiogroup', 'aria-label': 'Estratégia de esforço' }, ...radios),
          instrucoes,
          formFocoNivel,
          campoObs,
          mensagem.el,
          h('div', { class: 'modal-acoes' },
            h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Fechar'),
            botaoRegras,
            botaoIa,
            botaoRecorde,
          ),
          previa,
        ),
      );
    },
  });
}
