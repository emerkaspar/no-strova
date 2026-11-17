import { calcularSerieForma, ehRecorrente, PERIODOS_DE_PROGRESSAO, periodoDe, TIPOS_DE_PROGRESSAO } from '@no-strova/domain';
import { editarMeta, encerrarMetaDeProgressao, salvarMetaDeProgressao } from '../../application/progressao.js';
import { observarAtividadesParaProgressao } from '../../infrastructure/atividadesRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { excluirMetaProgressao, observarMetasProgressao } from '../../infrastructure/metasProgressaoRepo.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { paginaTopo } from '../../utils/paginaTopo.js';
import { formatarNumero, hojeIso } from '../../utils/formatters.js';
import { ESPORTES, estadoInicialDaAnalise } from './analise.js';
import { criarPainelDesempenho } from './desempenho.js';
import { abrirComparacao, abrirObjetivo } from './objetivoModal.js';
import { painelDeObjetivos } from './objetivos.js';
import { consumirMetaPedida } from './state.js';
import { abrirModal, confirmar } from '../../utils/modal.js';
import { criarCartaoZonas } from './zonas.js';
import { criarBlocoProjecao } from './projecaoPlano.js';

const ANOS_DE_HISTORICO = 5;

/** Seções da página, na ordem em que aparecem; a barra de abas no topo leva a elas (como no Plano). */
const SECOES = [
  { id: 'projecao', rotulo: 'Projeção' },
  { id: 'objetivos', rotulo: 'Objetivos' },
  { id: 'desempenho', rotulo: 'Desempenho' },
  { id: 'zonas', rotulo: 'Zonas' },
];

export function render(raiz, sessao, params = {}) {
  const hoje = hojeIso();
  const anoHoje = Number(hoje.slice(0, 4));
  const dados = { atividades: [], dias: [], metas: [] };
  const carregou = { atividades: false, dias: false, metas: false };
  let objetivoParaAbrir = consumirMetaPedida(); // objetivo clicado na Início: abre o modal assim que os dados chegarem
  let secaoInicial = SECOES.some((x) => x.id === params.secao) ? params.secao : null; // rola até ela quando os dados chegarem
  let secaoVisivel = SECOES[0].id;
  let observador = null;
  // o formulário de meta parte do período, da métrica e dos esportes iniciais
  const estado = { ...estadoInicialDaAnalise(), formAberto: false };
  const mensagem = areaMensagem();
  // criado uma vez: tem os próprios listeners e sobrevive aos redesenhos da página
  const blocoProjecao = criarBlocoProjecao({ uid: sessao.uid, hoje });

  // ---- abas: a barra fixa leva às seções e destaca a que está na tela; a URL acompanha, sem recarregar ----
  const secaoEl = (id) => document.getElementById(`prog-${id}`);
  function irParaSecao(id, comportamento = 'smooth') {
    window.history.replaceState(null, '', id === SECOES[0].id ? '#/progressao' : `#/progressao/${id}`);
    secaoEl(id)?.scrollIntoView?.({ behavior: comportamento, block: 'start' });
  }
  function criarAbas() {
    return h(
      'nav',
      { class: 'plano-ancoras', 'aria-label': 'Seções da progressão' },
      ...SECOES.map((x) => h('button', { class: 'plano-ancora', type: 'button', 'data-secao': x.id, 'aria-current': secaoVisivel === x.id ? 'true' : null, onClick: () => irParaSecao(x.id) }, x.rotulo)),
    );
  }
  /** Destaca na barra a seção que ocupa a parte de cima da tela. A tela é redesenhada a cada dado novo, então o observador é refeito. */
  function observarSecoes() {
    observador?.disconnect();
    observador = null;
    if (typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Set();
    observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.dataset.secao);
          else visiveis.delete(e.target.dataset.secao);
        }
        const atual = SECOES.find((x) => visiveis.has(x.id))?.id;
        if (atual && atual !== secaoVisivel) {
          secaoVisivel = atual;
          raiz.querySelectorAll('.plano-ancora').forEach((b) => b.setAttribute('aria-current', String(b.dataset.secao === atual)));
        }
      },
      // só conta a faixa de cima da tela (abaixo da barra fixa)
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const x of SECOES) {
      const el = secaoEl(x.id);
      if (el) {
        el.dataset.secao = x.id;
        observador.observe(el);
      }
    }
  }

  function desenhar() {
    if (!carregou.atividades || !carregou.dias || !carregou.metas) {
      raiz.replaceChildren(h('section', { class: 'card' }, h('h1', null, 'Progressão'), h('p', { class: 'vazio', role: 'status' }, 'Carregando…')));
      return;
    }
    const condicionamentoPorData = new Map(calcularSerieForma(dados.dias, { ate: hoje }).map((d) => [d.data, d.fitness]));

    // "Nova meta" fica no cabeçalho de Objetivos; editar, encerrar e excluir ficam em cada cartão de objetivo.
    const botaoNova = h('button', { class: estado.formAberto ? 'btn btn-secundario' : 'btn', type: 'button', 'aria-expanded': String(estado.formAberto) }, estado.formAberto ? 'Fechar' : '+ Nova meta');
    botaoNova.addEventListener('click', () => {
      estado.formAberto = !estado.formAberto;
      desenhar();
    });
    // a análise livre (sem objetivo): compara o acumulado de períodos, métricas e esportes à escolha
    const botaoComparar = h('button', { class: 'btn btn-ciano', type: 'button' }, icone('atividades', 16), ' Comparar períodos');
    botaoComparar.addEventListener('click', () => abrirComparacao({ dados, hoje }));
    const acoesDoObjetivo = {
      editar: (m) =>
        abrirModal({ classe: 'modal-meta', rotulo: 'Editar meta', conteudo: (fechar) => formularioDeMeta(m, fechar) }),
      encerrar: async (m) => {
        if (!(await confirmar({ titulo: 'Encerrar esta meta?', mensagem: `Ela deixa de valer ao fim d${m.periodo === 'mes' ? 'este mês' : 'esta semana'}. O histórico e as badges conquistadas continuam com você.`, confirmarTexto: 'Encerrar meta', tipo: 'aviso', icone: 'medalha' }))) return;
        mensagem.limpar();
        try {
          await encerrarMetaDeProgressao({ meta: m, hoje });
        } catch (err) {
          mensagem.mostrar(err.message || 'Não foi possível encerrar a meta.');
        }
      },
      excluir: async (m) => {
        if (!(await confirmar({ titulo: 'Excluir esta meta?', mensagem: 'Isso não pode ser desfeito.', confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
        mensagem.limpar();
        try {
          await excluirMetaProgressao(m.id);
        } catch (err) {
          mensagem.mostrar(err.message || 'Não foi possível excluir a meta.');
        }
      },
    };

    const secao = (id, ...filhos) => h('div', { class: 'prog-secao', id: `prog-${id}` }, ...filhos);
    raiz.replaceChildren(
      h(
        'div',
        { class: 'prog-pagina' },
        paginaTopo({ icone: 'progressao', titulo: 'Progressão', subtitulo: 'Acompanhe seus objetivos, compare o acumulado com os períodos anteriores e veja se o seu desempenho está evoluindo.' }),
        criarAbas(),
        blocoProjecao.el,
        secao(
          'objetivos',
          h(
            'section',
            { class: 'card' },
            h('div', { class: 'prog-secao-topo' }, h('h2', null, 'Objetivos'), h('div', { class: 'linha-botoes' }, botaoComparar, botaoNova)),
            estado.formAberto ? formularioDeMeta() : null,
            painelDeObjetivos({
              metas: dados.metas,
              atividades: dados.atividades,
              condicionamentoPorData,
              hoje,
              selecionadaId: null,
              acoes: acoesDoObjetivo,
              // o objetivo abre em um modal, com a análise dele (gráficos, comparativos e filtros)
              aoSelecionar: (m) => abrirObjetivo({ meta: m, dados, hoje, acoes: acoesDoObjetivo }),
            }),
            mensagem.el,
          ),
        ),
        secao('desempenho', criarPainelDesempenho({ atividades: dados.atividades, hoje })),
        secao('zonas', criarCartaoZonas({ atividades: dados.atividades, hoje })),
      ),
    );
    observarSecoes();
    // rota de uma seção (#/progressao/desempenho): só rola quando os dados chegaram, para a página já ter a altura final
    if (secaoInicial) {
      const id = secaoInicial;
      secaoInicial = null;
      requestAnimationFrame(() => irParaSecao(id, 'auto'));
    }
    // objetivo pedido pela Início: abre o modal uma única vez
    if (objetivoParaAbrir) {
      const meta = dados.metas.find((m) => m.id === objetivoParaAbrir);
      objetivoParaAbrir = null;
      if (meta) abrirObjetivo({ meta, dados, hoje, acoes: acoesDoObjetivo });
    }
  }

  /** Grupo de botões de escolha única (no lugar de um select). */
  function grupoDeBotoes({ rotulo, opcoes, valor, aoMudar, desativado = false, classe = '' }) {
    let atual = valor;
    const botoes = opcoes.map(([id, texto]) => {
      const b = h('button', { class: 'prog-segmento', type: 'button', 'aria-pressed': String(id === atual), disabled: desativado }, texto);
      b.addEventListener('click', () => {
        atual = id;
        botoes.forEach((x, i) => x.setAttribute('aria-pressed', String(opcoes[i][0] === atual)));
        aoMudar?.(atual);
      });
      return b;
    });
    return { el: h('div', { class: `campo ${classe}`.trim() }, h('span', { class: 'prog-rotulo' }, rotulo), h('div', { class: 'prog-segmentos', role: 'group', 'aria-label': rotulo }, botoes)), valor: () => atual };
  }

  /** Formulário de meta: "Nova meta" ou, com `metaEdicao`, a edição de uma existente (o período não muda). */
  function formularioDeMeta(metaEdicao = null, fecharModal = null) {
    const msg = areaMensagem();
    const editando = Boolean(metaEdicao);
    const periodoInicial = metaEdicao?.periodo ?? estado.periodo;
    const tipoInicial = metaEdicao?.tipo ?? estado.tipo;
    const periodo = grupoDeBotoes({ rotulo: 'Meta de', opcoes: Object.entries(PERIODOS_DE_PROGRESSAO).map(([id, p]) => [id, p.rotulo]), valor: periodoInicial, aoMudar: () => atualizar(), desativado: editando, classe: 'campo-periodo' });
    const ano = h('input', { id: 'nm-ano', type: 'number', min: '2000', max: '2100', value: String(anoHoje) });
    const tipo = grupoDeBotoes({ rotulo: 'Tipo', opcoes: Object.entries(TIPOS_DE_PROGRESSAO).map(([id, t]) => [id, t.rotulo]), valor: tipoInicial, aoMudar: () => atualizar(), classe: 'campo-largo' });
    const valor = h('input', { id: 'nm-valor', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 2000', autocomplete: 'off', value: editando ? formatarNumero(metaEdicao.valorAlvo, TIPOS_DE_PROGRESSAO[metaEdicao.tipo].casas) : '' });
    const escolhidos = new Set(metaEdicao ? (metaEdicao.esportes ?? []) : estado.esportes);
    const chips = h(
      'div',
      { class: 'prog-chips', role: 'group', 'aria-label': 'Esportes da meta' },
      ESPORTES.map(([id, rotulo]) => {
        const botao = h('button', { class: 'prog-chip', type: 'button', 'aria-pressed': String(escolhidos.has(id)) }, rotulo);
        botao.addEventListener('click', () => {
          if (escolhidos.has(id)) escolhidos.delete(id);
          else escolhidos.add(id);
          botao.setAttribute('aria-pressed', String(escolhidos.has(id)));
        });
        return botao;
      }),
    );
    const campoAno = h('div', { class: 'campo campo-ano' }, h('label', { for: 'nm-ano' }, 'Ano'), ano);
    const campoRecorrente = h('p', { class: 'texto-secundario prog-recorrente' }, '');
    const campoEsportes = h('div', { class: 'campo campo-largo' }, h('span', { class: 'prog-rotulo' }, 'Esportes (nenhum = todos)'), chips);
    const unidade = h('small', { class: 'dica' });
    const alteraDepois = editando && ehRecorrente(metaEdicao) && metaEdicao.inicio < periodoDe(metaEdicao.periodo, hoje).inicio;
    const atualizar = () => {
      campoAno.hidden = editando || periodo.valor() !== 'ano';
      campoRecorrente.hidden = periodo.valor() === 'ano';
      const sem = periodo.valor() === 'semana';
      campoRecorrente.textContent = alteraDepois
        ? `A alteração vale a partir d${sem ? 'esta semana' : 'este mês'}; os períodos anteriores e as badges já conquistadas continuam como estavam.`
        : sem ? 'Vale para todas as semanas, a partir desta, até você alterar ou encerrar a meta. Cada semana atingida rende uma badge.' : 'Vale para todos os meses, a partir deste, até você alterar ou encerrar a meta. Cada mês atingido rende uma badge.';
      campoEsportes.hidden = !TIPOS_DE_PROGRESSAO[tipo.valor()].acumulado;
      const u = TIPOS_DE_PROGRESSAO[tipo.valor()].unidade;
      unidade.textContent = u ? `Em ${u === 'h' ? 'horas' : u === 'km' ? 'quilômetros' : 'metros'}.` : 'Valor do Condicionamento que você quer ter no fim do período.';
    };
    atualizar();

    const salvar = h('button', { class: 'btn', type: 'submit' }, 'Salvar meta');
    const cancelar = editando ? h('button', { class: 'btn btn-secundario', type: 'button' }, 'Cancelar') : null;
    cancelar?.addEventListener('click', () => fecharModal?.());
    const form = h(
      'form',
      { class: 'prog-form', novalidate: true },
      h('h2', null, editando ? 'Editar meta' : 'Nova meta'),
      h(
        'div',
        { class: 'prog-form-grade' },
        periodo.el,
        campoAno,
        h('div', { class: 'campo' }, h('label', { for: 'nm-valor' }, 'Valor da meta'), valor, unidade),
        tipo.el,
        campoEsportes,
      ),
      msg.el,
      h('div', { class: 'prog-rodape' }, campoRecorrente, h('div', { class: 'linha-botoes' }, salvar, cancelar)),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await executarComBotao(salvar, msg, async () => {
        if (editando) {
          const tipoNovo = tipo.valor();
          const esportesNovos = TIPOS_DE_PROGRESSAO[tipoNovo].acumulado ? [...escolhidos] : [];
          await editarMeta({ uid: sessao.uid, meta: metaEdicao, metas: dados.metas, valorAlvo: valor.value, tipo: tipoNovo, esportes: esportesNovos, hoje });
          fecharModal?.(true);
          desenhar();
          return;
        }
        // ano: o ano escolhido; semana e mês: a vigência começa no período atual
        const inicio = periodo.valor() === 'ano' ? `${ano.value}-01-01` : hoje;
        await salvarMetaDeProgressao({ uid: sessao.uid, metas: dados.metas, hoje, entrada: { periodo: periodo.valor(), inicio, tipo: tipo.valor(), valorAlvo: valor.value, esportes: [...escolhidos] } });
        estado.formAberto = false;
        desenhar();
      });
    });
    return form;
  }

  const aoErro = () => {
    raiz.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'mensagem mensagem-erro' }, 'Não foi possível carregar a progressão.')));
  };
  const desde = `${anoHoje - ANOS_DE_HISTORICO}-01-01`;
  const cancelar = [
    observarAtividadesParaProgressao(
      sessao.uid,
      desde,
      (lista) => {
        dados.atividades = lista;
        carregou.atividades = true;
        desenhar();
      },
      aoErro,
    ),
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        dados.dias = lista;
        carregou.dias = true;
        desenhar();
      },
      aoErro,
    ),
    observarMetasProgressao(
      sessao.uid,
      (lista) => {
        dados.metas = lista;
        carregou.metas = true;
        desenhar();
      },
      aoErro,
    ),
  ];
  desenhar();

  return () => {
    observador?.disconnect();
    cancelar.forEach((fn) => fn());
    blocoProjecao.destruir();
  };
}
