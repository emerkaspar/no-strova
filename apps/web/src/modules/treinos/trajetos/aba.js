import { montarTrajetos } from '../../../application/trajetos.js';
import { observarAtividadesComTrajeto } from '../../../infrastructure/atividadesRepo.js';
import { observarTrajetos } from '../../../infrastructure/trajetosRepo.js';
import { h } from '../../../utils/dom.js';
import { estadoVazio } from '../../../utils/estadoVazio.js';
import { icone } from '../../../utils/icones.js';
import { ROTULO_ESPORTE } from '../../atividades/textos.js';
import { estadoTreinos } from '../state.js';
import { miniTendencia } from './graficos.js';
import { carregarTerrenoDoTrajeto } from '../../../application/trajetos.js';
import { descreverSegmento, ROTULOS_DO_TERRENO } from '@no-strova/domain';
import { classeDaInclinacao, miniPerfilDoTerreno } from './perfilTerreno.js';
import { criarPainel } from './painel.js';
import { formatarData, formatarDuracaoCurta } from '../../../utils/formatters.js';
import { kmTexto, textoDeVariacao } from './textos.js';

/** Uma métrica do cartão: rótulo pequeno em cima (com ícone) e o valor em destaque embaixo. */
function metrica(nomeIcone, rotulo, valor, classe = '', dica = '') {
  const valorEl = h('strong', { class: 'traj-metrica-valor' }, valor);
  const el = h('span', { class: `traj-metrica ${classe}`.trim(), title: dica || null }, h('span', { class: 'traj-metrica-rotulo' }, icone(nomeIcone, 13), rotulo), valorEl);
  return { el, definir: (texto) => { valorEl.textContent = texto; } };
}

/**
 * Altimetria do trajeto no cartão: curva suave com degradê, a faixa de subida, plano e descida e a escala de altitude. O espaço
 * fica reservado enquanto a rota é lida; some se ela não tem altimetria. `aoLer` recebe o terreno lido (para o ganho de altitude).
 */
function altimetria(trajeto, aoLer) {
  const el = h('span', { class: 'traj-badge-alt' }, h('span', { class: 'traj-badge-alt-vazio', 'aria-hidden': 'true' }));
  carregarTerrenoDoTrajeto(trajeto).then((terreno) => {
    if (!terreno) {
      el.hidden = true;
      return;
    }
    aoLer(terreno);
    el.replaceChildren(
      miniPerfilDoTerreno({ perfil: terreno.perfil }),
      h('span', { class: 'traj-faixa-terreno', 'aria-hidden': 'true' }, ...terreno.segmentos.map((seg) => h('span', { class: classeDaInclinacao(seg.gradienteMedio), style: `flex: ${seg.distanciaM}`, title: `${ROTULOS_DO_TERRENO[seg.tipo]}: ${descreverSegmento(seg)}` }))),
      h('span', { class: 'traj-badge-escala' }, h('span', null, `${terreno.altMin.toFixed(0)} m`), h('span', null, `${terreno.altMax.toFixed(0)} m`)),
    );
  });
  return el;
}

/**
 * Seção "Trajetos" de Treinos: cada trajeto do esporte é um badge; ao escolher um, a evolução dele abre logo abaixo.
 * Tem os próprios listeners e se redesenha sozinha a cada mudança nos dados. Devolve dois nós: `el` (o texto e os badges,
 * que vão dentro do cartão da seção) e `painelEl` (o painel, que fica logo abaixo do cartão).
 * @returns {{ el: HTMLElement, painelEl: HTMLElement, definirEsporte: (esporte: string) => void, destruir: () => void }}
 */
export function criarSecaoTrajetos({ uid, esporte: esporteInicial, nivel = () => 'intermediario', aoCriarTreino = null }) {
  const estado = estadoTreinos.trajetos;
  let esporte = esporteInicial;
  let ativa = true;
  const dados = { trajetos: [], atividades: [] };
  const carregou = { trajetos: false, atividades: false };
  let erro = null;
  let painel = null;
  const raiz = h('div', { class: 'pilha' });
  const painelEl = h('div', { class: 'traj-painel' });

  function fecharPainel() {
    painel?.destruir();
    painel = null;
    painelEl.replaceChildren();
  }

  function desenhar() {
    if (!ativa) return;
    fecharPainel();
    if (erro) {
      raiz.replaceChildren(h('p', { class: 'mensagem mensagem-erro', role: 'alert' }, erro));
      return;
    }
    if (!carregou.trajetos || !carregou.atividades) {
      raiz.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
      return;
    }

    const itens = montarTrajetos(dados.trajetos, dados.atividades, esporte);
    const nomeEsporte = (ROTULO_ESPORTE[esporte] ?? esporte).toLowerCase();
    if (itens.length === 0) {
      raiz.replaceChildren(estadoVazio(`Você ainda não tem trajetos de ${nomeEsporte}. Crie um no “Como foi?” de uma atividade e escolha o mesmo trajeto nas próximas.`, { href: '#/atividades', rotulo: 'Ir para Atividades' }));
      return;
    }

    const escolhido = itens.find((i) => i.trajeto.id === estado.aberto) ?? null;
    if (!escolhido) estado.aberto = null;

    const badges = itens.map((i) => {
      const aberto = escolhido === i;
      const n = i.passagens.length;
      const mini = n >= 2 ? miniTendencia(i.passagens.map((p) => p.velocidadeKmh), false) : null;
      const melhora = i.resumo?.inicioRecente?.velocidade ?? null;
      const ganho = metrica('setaCima', 'Ganho', '—', 'traj-metrica-sobe', 'Ganho de altitude na rota de referência');
      return h(
        'button',
        {
          class: `badge traj-badge${n === 0 ? ' traj-badge-vazio' : ''}`,
          type: 'button',
          'aria-pressed': String(aberto),
          onClick: () => {
            estado.aberto = aberto ? null : i.trajeto.id;
            estado.comparadas = [];
            estado.periodoEficiencia = null;
            desenhar();
            if (!aberto) painelEl.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          },
        },
        h('span', { class: 'traj-badge-topo' },
          h('span', { class: 'traj-badge-icone' }, icone('rota', 18)),
          h('span', { class: 'traj-badge-textos' },
            h('span', { class: 'badge-nome' }, i.trajeto.nome),
            h('span', { class: 'badge-meta' }, n === 0 ? 'Sem passagens' : `${n} ${n === 1 ? 'passagem' : 'passagens'}`),
          ),
          aberto ? h('span', { class: 'traj-badge-aberto', 'aria-hidden': 'true' }, icone('ok', 18)) : null,
        ),
        i.trajeto.rotaAtividadeId ? altimetria(i.trajeto, (terreno) => ganho.definir(`${Math.round(terreno.resumo.ganhoTotalM)} m`)) : null,
        i.resumo
          ? h('span', { class: 'traj-badge-metricas' },
              metrica('distancia', 'Distância', kmTexto(i.resumo.distanciaTipicaM), '', 'Distância usual do trajeto').el,
              ganho.el,
              metrica('medalha', 'Melhor tempo', formatarDuracaoCurta(i.resumo.melhor.tempoS), 'traj-metrica-ouro', `Melhor tempo: ${formatarData(i.resumo.melhor.data)}`).el,
            )
          : null,
        mini || melhora !== null
          ? h('span', { class: 'traj-badge-rodape' },
              h('span', { class: 'traj-badge-evolucao' }, mini, h('span', { class: 'traj-metrica-rotulo' }, 'Evolução')),
              melhora !== null ? h('span', { class: `traj-delta traj-delta-pilula ${melhora > 0 ? 'traj-melhor' : melhora < 0 ? 'traj-pior' : ''}` }, `${textoDeVariacao(melhora)} desde o início`) : null,
            )
          : null,
      );
    });

    raiz.replaceChildren(
      h('p', { class: 'texto-secundario' }, `Escolha um trajeto de ${nomeEsporte} para ver como você evoluiu nele: ritmo, eficiência, comparação entre passagens e mais.`),
      h('div', { class: 'badges traj-badges' }, ...badges),
    );
    if (escolhido) {
      painel = criarPainel({ item: escolhido, esporte, estado, aoMudar: desenhar, uid, nivelInicial: nivel(), aoCriarTreino });
      painelEl.replaceChildren(painel.el);
    }
  }
  desenhar();

  const aoErro = (err) => {
    // o console mostra o motivo real (por exemplo, índice ausente, com o link para criá-lo)
    console.error('Trajetos:', err);
    erro = err?.code === 'failed-precondition'
      ? 'Falta publicar o índice de trajetos no Firebase (deploy das regras e índices). Veja o console do navegador.'
      : 'Não foi possível carregar os trajetos. Tente recarregar a página.';
    desenhar();
  };
  const cancelar = [
    observarTrajetos(
      uid,
      (lista) => {
        dados.trajetos = lista;
        carregou.trajetos = true;
        desenhar();
      },
      aoErro,
    ),
    observarAtividadesComTrajeto(
      uid,
      (lista) => {
        dados.atividades = lista;
        carregou.atividades = true;
        desenhar();
      },
      aoErro,
    ),
  ];

  return {
    el: raiz,
    painelEl,
    definirEsporte(novo) {
      if (novo === esporte) return;
      esporte = novo;
      estado.aberto = null;
      estado.comparadas = [];
      estado.periodoEficiencia = null;
      desenhar();
    },
    destruir() {
      ativa = false;
      fecharPainel();
      cancelar.forEach((fn) => fn());
    },
  };
}
