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
            if (!aberto) painelEl.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          },
        },
        h('span', { class: 'badge-nome' }, i.trajeto.nome),
        h('span', { class: 'badge-meta' }, n === 0 ? 'Sem passagens' : `${n} ${n === 1 ? 'passagem' : 'passagens'}`),
        mini,
        melhora !== null ? h('span', { class: `traj-delta ${melhora > 0 ? 'traj-melhor' : melhora < 0 ? 'traj-pior' : ''}` }, `${textoDeVariacao(melhora)} desde o início`) : null,
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
      desenhar();
    },
    destruir() {
      ativa = false;
      fecharPainel();
      cancelar.forEach((fn) => fn());
    },
  };
}
