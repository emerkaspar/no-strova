import { montarTrajetos } from '../../../application/trajetos.js';
import { observarAtividadesComTrajeto } from '../../../infrastructure/atividadesRepo.js';
import { observarTrajetos } from '../../../infrastructure/trajetosRepo.js';
import { h } from '../../../utils/dom.js';
import { estadoVazio } from '../../../utils/estadoVazio.js';
import { ROTULO_ESPORTE } from '../../atividades/textos.js';
import { estadoTreinos } from '../state.js';
import { miniTendencia } from './graficos.js';
import { criarPainel } from './painel.js';
import { textoDeVariacao } from './textos.js';

/**
 * Aba "Trajetos" de Treinos: cada trajeto do esporte é um badge; ao escolher um, aparece a evolução dele.
 * Tem os próprios listeners (só existem enquanto a aba está aberta) e se redesenha sozinha a cada mudança nos dados.
 * @returns {{ el: HTMLElement, definirEsporte: (esporte: string) => void, destruir: () => void }}
 */
export function criarAbaTrajetos({ uid, esporte: esporteInicial }) {
  const estado = estadoTreinos.trajetos;
  let esporte = esporteInicial;
  let ativa = true;
  const dados = { trajetos: [], atividades: [] };
  const carregou = { trajetos: false, atividades: false };
  let erro = null;
  let painel = null;
  const raiz = h('div', { class: 'pilha' });

  function fecharPainel() {
    painel?.destruir();
    painel = null;
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
      raiz.replaceChildren(
        h(
          'section',
          { class: 'card' },
          h('h2', null, 'Trajetos'),
          estadoVazio(`Você ainda não tem trajetos de ${nomeEsporte}. Crie um no “Como foi?” de uma atividade e escolha o mesmo trajeto nas próximas.`, { href: '#/atividades', rotulo: 'Ir para Atividades' }),
        ),
      );
      return;
    }

    const escolhido = itens.find((i) => i.trajeto.id === estado.aberto) ?? null;
    if (!escolhido) estado.aberto = null;

    const badges = itens.map((i) => {
      const aberto = escolhido === i;
      const n = i.passagens.length;
      const mini = n >= 2 ? miniTendencia(i.passagens.map((p) => p.velocidadeKmh), false) : null;
      const melhora = i.resumo?.inicioRecente?.velocidade ?? null;
      return h(
        'button',
        {
          class: `badge traj-badge${n === 0 ? ' traj-badge-vazio' : ''}`,
          type: 'button',
          'aria-pressed': String(aberto),
          onClick: () => {
            estado.aberto = aberto ? null : i.trajeto.id;
            estado.comparadas = [];
            desenhar();
            if (!aberto) raiz.querySelector('.traj-painel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          },
        },
        h('span', { class: 'badge-nome' }, i.trajeto.nome),
        h('span', { class: 'badge-meta' }, n === 0 ? 'Sem passagens' : `${n} ${n === 1 ? 'passagem' : 'passagens'}`),
        mini,
        melhora !== null ? h('span', { class: `traj-delta ${melhora > 0 ? 'traj-melhor' : melhora < 0 ? 'traj-pior' : ''}` }, `${textoDeVariacao(melhora)} desde o início`) : null,
      );
    });

    const conteudo = [
      h(
        'section',
        { class: 'card pilha' },
        h('h2', null, 'Trajetos'),
        h('p', { class: 'texto-secundario' }, `Escolha um trajeto de ${nomeEsporte} para ver como você evoluiu nele: ritmo, eficiência, comparação entre passagens e mais.`),
        h('div', { class: 'badges traj-badges' }, ...badges),
      ),
    ];
    if (escolhido) {
      painel = criarPainel({ item: escolhido, esporte, estado, aoMudar: desenhar });
      conteudo.push(h('div', { class: 'traj-painel' }, painel.el));
    }
    raiz.replaceChildren(...conteudo);
  }
  desenhar();

  const aoErro = () => {
    erro = 'Não foi possível carregar os trajetos. Tente recarregar a página.';
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
    definirEsporte(novo) {
      if (novo === esporte) return;
      esporte = novo;
      estado.aberto = null;
      estado.comparadas = [];
      desenhar();
    },
    destruir() {
      ativa = false;
      fecharPainel();
      cancelar.forEach((fn) => fn());
    },
  };
}
