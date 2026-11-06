import { avaliarTesteLthr, ETIQUETAS, LIMITES_FEEDBACK, LIMITES_TRAJETO, SENSACOES } from '@no-strova/domain';
import { obterSessao } from '../../application/sessao.js';
import { excluirTrajeto, salvarAtividade } from '../../core/functions.js';
import { lerAtividade } from '../../infrastructure/atividadesRepo.js';
import { lerConfigs } from '../../infrastructure/configsRepo.js';
import { lerTrajetos } from '../../infrastructure/trajetosRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { listaSuspensa, seletor } from '../../utils/listaSuspensa.js';
import { abrirModal, confirmar } from '../../utils/modal.js';
import { analisarAtividadeLthr, montarResultadoLthr } from '../configuracao/resultadoLthr.js';
import { OPCOES_ESPORTE, ROTULO_ESPORTE } from './textos.js';
import { criarSecaoTreinoDoDia } from './treinoDoDia.js';

const TITULO_MAX = 80;
/** Valor da lista de trajetos que significa "criar um novo". */
const NOVO_TRAJETO = '__novo__';

/** Cor de cada nível da escala de sensação (variáveis do tema, valem no escuro e no claro). */
const TOM_DA_SENSACAO = Object.freeze({ 1: 'var(--success)', 2: 'var(--zona-1)', 3: 'var(--zona-3)', 4: 'var(--zona-4)', 5: 'var(--zona-5)' });

/** Rótulo do esforço percebido (escala de 1 a 10). */
function rotuloDoEsforco(n) {
  if (n <= 2) return 'Muito leve';
  if (n <= 4) return 'Leve';
  if (n <= 6) return 'Moderado';
  if (n <= 8) return 'Forte';
  if (n === 9) return 'Muito forte';
  return 'Máximo';
}

/** Cor do esforço: do azul (leve) ao vermelho (máximo), pelas mesmas cores das zonas. */
const corDoEsforco = (n) => `var(--zona-${Math.min(5, Math.ceil(n / 2))})`;

/** Grupo de botões exclusivos (radio) navegável pelas setas; clicar no selecionado desmarca quando `desmarcavel`. */
function grupoRadio({ rotulo, classe, itens, valor, desmarcavel, aoMudar }) {
  const grupo = h('div', { class: classe, role: 'radiogroup', 'aria-label': rotulo });
  let atual = valor;
  const botoes = itens.map((item) => {
    const b = h('button', { type: 'button', role: 'radio', class: item.classe, title: item.titulo ?? null, style: item.estilo ?? null, onClick: () => escolher(atual === item.valor && desmarcavel ? null : item.valor, true) }, ...item.filhos);
    b.dataset.valor = String(item.valor);
    return b;
  });

  function escolher(novo, avisar) {
    atual = novo;
    botoes.forEach((b, i) => {
      const marcado = itens[i].valor === atual;
      b.setAttribute('aria-checked', String(marcado));
      b.classList.toggle('marcado', marcado);
      // roving tabindex: só o selecionado (ou o primeiro, sem seleção) entra na ordem de tabulação
      b.tabIndex = marcado || (atual === null && i === 0) ? 0 : -1;
    });
    if (avisar) aoMudar(atual);
  }

  grupo.addEventListener('keydown', (e) => {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!passo) return;
    e.preventDefault();
    const indice = Math.max(0, itens.findIndex((i) => i.valor === atual));
    const proximo = (indice + passo + itens.length) % itens.length;
    escolher(itens[proximo].valor, true);
    botoes[proximo].focus();
  });

  grupo.append(...botoes);
  escolher(atual, false);
  return { raiz: grupo, valor: () => atual };
}

/**
 * Abre o modal "Como foi?" da atividade: título, esporte, sensação, esforço percebido, etiquetas e notas.
 * Os dados medidos do arquivo (duração, distância, FC) não são editáveis aqui.
 *
 * @param {{ atividade: object, primeiraVez?: boolean }} opcoes `primeiraVez` é o modo logo após a importação ("Pular" em vez de "Cancelar")
 * @returns {Promise<{ titulo: string|null, esporte: string, feedback: object|null }|null>} o que foi salvo, ou null se fechou sem salvar
 */
export async function abrirFeedbackDaAtividade({ atividade, primeiraVez = false }) {
  const a = atividade;
  const existente = a.feedback ?? null;
  const resultado = await abrirModal({
    classe: 'modal-feedback',
    rotulo: 'Como foi a atividade?',
    conteudo: (fechar) => montar(fechar),
  });
  return resultado ?? null;

  function montar(fechar) {
    const estado = {
      sensacao: existente?.sensacao ?? null,
      rpe: existente?.rpe ?? null,
      etiquetas: new Set(existente?.etiquetas ?? []),
    };
    const nomePadrao = `${ROTULO_ESPORTE[a.esporte] ?? a.esporte} · ${formatarData(a.data)}`;
    const raiz = h('form', { class: 'fb', novalidate: true });
    const mensagem = areaMensagem();

    // ---------- nome e esporte (ficam no cabeçalho) ----------
    const campoTitulo = h('input', { type: 'text', class: 'fb-nome', maxLength: TITULO_MAX, value: a.titulo ?? '', placeholder: nomePadrao, 'aria-label': 'Nome da atividade', title: 'Nome da atividade (em branco, volta ao nome padrão)' });
    const campoEsporte = seletor({ classe: 'fb-esporte-seletor', rotulo: 'Esporte', opcoes: OPCOES_ESPORTE, valor: a.esporte });

    // ---------- cabeçalho ----------
    const resumo = [formatarData(a.data), a.duracaoS ? formatarDuracao(a.duracaoS) : null, a.distanciaM ? formatarDistancia(a.distanciaM) : null].filter(Boolean);
    const cabecalho = h(
      'header',
      { class: 'fb-topo' },
      h('span', { class: 'fb-esporte', 'aria-hidden': 'true' }, icone(a.esporte, 26)),
      h(
        'div',
        { class: 'fb-topo-texto' },
        h('p', { class: 'fb-kicker' }, primeiraVez ? 'Atividade registrada ✓' : existente ? 'Seu registro' : 'Registro da atividade'),
        h('h2', { class: 'fb-titulo' }, 'Como foi?'),
        h('label', { class: 'fb-nome-linha' }, h('span', { class: 'fb-nome-lapis', 'aria-hidden': 'true' }, icone('lapis', 15)), campoTitulo),
        h('div', { class: 'fb-resumo' }, campoEsporte, h('span', null, resumo.join(' · '))),
      ),
      h('button', { type: 'button', class: 'fb-fechar', title: 'Fechar', 'aria-label': 'Fechar', onClick: () => fechar(undefined) }, icone('fechar', 20)),
    );

    // ---------- sensação ----------
    const legendaSensacao = h('p', { class: 'fb-legenda', 'aria-live': 'polite' });
    function atualizarTom() {
      const s = SENSACOES.find((x) => x.valor === estado.sensacao);
      raiz.style.setProperty('--tom', s ? TOM_DA_SENSACAO[s.valor] : 'var(--primary)');
      raiz.classList.toggle('fb-com-sensacao', Boolean(s));
      legendaSensacao.replaceChildren(...(s ? [h('strong', null, s.rotulo), ` · ${s.dica}`] : ['Toque no que mais combina com o treino de hoje.']));
    }
    const sensacao = grupoRadio({
      rotulo: 'Sensação',
      classe: 'fb-sensacoes',
      desmarcavel: true,
      valor: estado.sensacao,
      itens: SENSACOES.map((s) => ({
        valor: s.valor,
        classe: 'fb-sensacao',
        titulo: s.dica,
        estilo: `--cor:${TOM_DA_SENSACAO[s.valor]}`,
        filhos: [h('span', { class: 'fb-sensacao-icone' }, icone(s.id, 34)), h('span', { class: 'fb-sensacao-rotulo' }, s.rotulo)],
      })),
      aoMudar: (v) => {
        estado.sensacao = v;
        atualizarTom();
      },
    });

    // ---------- esforço percebido ----------
    const legendaEsforco = h('span', { class: 'fb-esforco-valor', 'aria-live': 'polite' });
    function atualizarEsforco() {
      legendaEsforco.textContent = estado.rpe ? `${estado.rpe} · ${rotuloDoEsforco(estado.rpe)}` : 'Opcional';
      legendaEsforco.style.color = estado.rpe ? corDoEsforco(estado.rpe) : '';
    }
    const esforco = grupoRadio({
      rotulo: 'Esforço percebido de 1 a 10',
      classe: 'fb-esforco',
      desmarcavel: true,
      valor: estado.rpe,
      itens: Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
        valor: n,
        classe: 'fb-esforco-passo',
        titulo: `${n} · ${rotuloDoEsforco(n)}`,
        estilo: `--cor:${corDoEsforco(n)}`,
        filhos: [String(n)],
      })),
      aoMudar: (v) => {
        estado.rpe = v;
        atualizarEsforco();
      },
    });

    // ---------- etiquetas ----------
    const campoDor = h('input', { type: 'text', class: 'fb-dor-campo', maxLength: LIMITES_FEEDBACK.dor, value: existente?.dor ?? '', placeholder: 'Onde? Ex.: joelho direito', 'aria-label': 'Local da dor' });
    const blocoDor = h('div', { class: 'fb-dor' }, icone('alerta', 18), campoDor);
    const chips = ETIQUETAS.map((e) => {
      const chip = h('button', { type: 'button', class: 'fb-chip', 'aria-pressed': String(estado.etiquetas.has(e.id)) }, h('span', { class: 'fb-chip-marca', 'aria-hidden': 'true' }, icone('ok', 14)), e.rotulo);
      chip.addEventListener('click', () => {
        if (estado.etiquetas.has(e.id)) estado.etiquetas.delete(e.id);
        else estado.etiquetas.add(e.id);
        chip.setAttribute('aria-pressed', String(estado.etiquetas.has(e.id)));
        atualizarDor();
        if (e.id === 'dor' && estado.etiquetas.has('dor')) campoDor.focus();
      });
      return chip;
    });
    function atualizarDor() {
      blocoDor.hidden = !estado.etiquetas.has('dor');
    }

    // ---------- notas ----------
    const notas = h('textarea', { class: 'fb-notas', rows: 3, maxLength: LIMITES_FEEDBACK.notas, placeholder: 'Como o corpo respondeu? Alguma coisa para lembrar nos próximos treinos?', 'aria-label': 'Notas' });
    notas.value = existente?.notas ?? '';
    const contador = h('small', { class: 'fb-contador' });
    const contar = () => {
      contador.textContent = `${notas.value.length}/${LIMITES_FEEDBACK.notas}`;
    };
    notas.addEventListener('input', contar);

    // ---------- marcações: teste de LTHR e trajeto de treino ----------
    const uid = obterSessao().uid;
    const avaliacao = avaliarTesteLthr(a);
    estado.testeLthr = avaliacao.elegivel && a.testeLthr === true;
    estado.trajetoId = a.trajetoId ?? '';

    const caixaLthr = h('input', { type: 'checkbox', class: 'fb-marca-caixa', checked: estado.testeLthr, disabled: !avaliacao.elegivel });
    const botaoAnalise = h('button', { type: 'button', class: 'fb-marca-link' }, icone('fc', 15), 'Ver a análise do teste');
    botaoAnalise.addEventListener('click', () => mostrarAnalise(null));
    const cartaoLthr = h(
      'label',
      { class: `fb-marca fb-marca-lthr${avaliacao.elegivel ? '' : ' fb-marca-desligada'}` },
      h('span', { class: 'fb-marca-icone', 'aria-hidden': 'true' }, icone('fc', 22)),
      h(
        'span',
        { class: 'fb-marca-texto' },
        h('strong', null, 'Foi um teste de LTHR?'),
        h('small', null, avaliacao.elegivel ? 'O app analisa a sua FC e sugere o LTHR para criar uma nova vigência.' : avaliacao.motivo),
      ),
      h('span', { class: 'fb-marca-chave', 'aria-hidden': 'true' }),
      caixaLthr,
    );
    function atualizarMarcas() {
      cartaoLthr.classList.toggle('fb-marca-ligada', estado.testeLthr);
      botaoAnalise.hidden = !(a.testeLthr === true && estado.testeLthr);
    }
    caixaLthr.addEventListener('change', () => {
      estado.testeLthr = caixaLthr.checked;
      atualizarMarcas();
    });

    let trajetos = [];
    let trajetosCarregados = false;
    const listaTrajeto = listaSuspensa({
      rotulo: 'Trajeto de treino',
      aoMudar: (valor) => {
        estado.trajetoId = valor;
        campoTrajetoNovo.hidden = valor !== NOVO_TRAJETO;
        atualizarExcluirTrajeto();
        if (valor === NOVO_TRAJETO) campoTrajetoNovo.focus();
      },
    });
    listaTrajeto.definir([{ valor: '', rotulo: 'Carregando…' }], '');
    listaTrajeto.desabilitar(true);
    const campoTrajetoNovo = h('input', { type: 'text', class: 'fb-marca-novo', maxLength: LIMITES_TRAJETO.nomeMax, placeholder: 'Nome do trajeto. Ex.: Volta da Lagoa', 'aria-label': 'Nome do novo trajeto', hidden: true });
    // exclui o trajeto escolhido da lista (as atividades que o usavam ficam sem trajeto)
    const botaoExcluirTrajeto = h('button', { type: 'button', class: 'fb-marca-excluir', title: 'Excluir este trajeto', 'aria-label': 'Excluir o trajeto escolhido', hidden: true }, icone('lixeira', 18));
    function atualizarExcluirTrajeto() {
      botaoExcluirTrajeto.hidden = !trajetosCarregados || estado.trajetoId === '' || estado.trajetoId === NOVO_TRAJETO;
    }
    botaoExcluirTrajeto.addEventListener('click', async () => {
      const escolhido = trajetos.find((t) => t.id === estado.trajetoId);
      if (!escolhido) return;
      const confirmado = await confirmar({
        titulo: 'Excluir o trajeto?',
        mensagem: `"${escolhido.nome}" sai da sua lista e as atividades marcadas com ele ficam sem trajeto. Isso não pode ser desfeito.`,
        tipo: 'perigo',
        icone: 'lixeira',
        confirmarTexto: 'Excluir trajeto',
      });
      if (!confirmado) return;
      botaoExcluirTrajeto.disabled = true;
      mensagem.limpar();
      try {
        await excluirTrajeto({ trajetoId: escolhido.id });
        trajetos = trajetos.filter((t) => t.id !== escolhido.id);
        estado.trajetoId = '';
        desenharTrajetos();
      } catch (err) {
        mensagem.mostrar(err.message || 'Não foi possível excluir o trajeto.');
      } finally {
        botaoExcluirTrajeto.disabled = false;
      }
    });
    /** A lista mostra só os trajetos do esporte escolhido; trocar o esporte solta um trajeto de outro esporte. */
    function desenharTrajetos() {
      // sem a lista não dá para saber o que é válido: o trajeto gravado fica como está (nunca é apagado por engano)
      if (!trajetosCarregados) return;
      const doEsporte = trajetos.filter((t) => t.esporte === campoEsporte.value);
      const valido = estado.trajetoId === NOVO_TRAJETO || doEsporte.some((t) => t.id === estado.trajetoId);
      if (!valido) estado.trajetoId = '';
      listaTrajeto.definir(
        [
          { valor: '', rotulo: 'Nenhum' },
          ...doEsporte.map((t) => ({ valor: t.id, rotulo: t.nome })),
          { valor: NOVO_TRAJETO, rotulo: 'Criar novo trajeto', rotuloCurto: 'Novo trajeto', acao: true },
        ],
        estado.trajetoId,
      );
      campoTrajetoNovo.hidden = estado.trajetoId !== NOVO_TRAJETO;
      atualizarExcluirTrajeto();
    }
    campoEsporte.addEventListener('change', desenharTrajetos);
    const avisoTrajetos = h('small', { class: 'fb-marca-erro', role: 'alert', hidden: true }, 'Não foi possível carregar os seus trajetos agora. O trajeto desta atividade continua como está.');
    lerTrajetos(uid).then(
      (lista) => {
        trajetos = lista;
        trajetosCarregados = true;
        listaTrajeto.desabilitar(false);
        desenharTrajetos();
      },
      () => {
        listaTrajeto.definir([{ valor: '', rotulo: a.trajetoId ? 'Trajeto indisponível' : 'Indisponível' }], '');
        avisoTrajetos.hidden = false;
      },
    );
    const cartaoTrajeto = h(
      'div',
      { class: 'fb-marca fb-marca-trajeto' },
      h('span', { class: 'fb-marca-icone', 'aria-hidden': 'true' }, icone('rota', 22)),
      h(
        'div',
        { class: 'fb-marca-texto' },
        h('strong', null, 'Trajeto de treino'),
        h('small', null, 'Dê nome ao percurso para comparar esforços entre treinos no mesmo trajeto.'),
        h('div', { class: 'fb-marca-linha' }, listaTrajeto.raiz, botaoExcluirTrajeto),
        campoTrajetoNovo,
        avisoTrajetos,
      ),
    );

    /** Troca o modal pelo resultado do teste de LTHR: análise da FC e botão para criar a nova vigência. */
    async function mostrarAnalise(salvo) {
      const msg = areaMensagem();
      const corpo = h('div', { class: 'fb-corpo' }, h('p', { class: 'texto-secundario', role: 'status' }, 'Analisando a frequência cardíaca…'));
      raiz.classList.add('fb-analise');
      raiz.replaceChildren(
        h(
          'header',
          { class: 'fb-topo' },
          h('span', { class: 'fb-esporte', 'aria-hidden': 'true' }, icone('fc', 26)),
          h('div', { class: 'fb-topo-texto' }, h('p', { class: 'fb-kicker' }, 'Teste de LTHR'), h('h2', { class: 'fb-titulo' }, 'Resultado'), h('p', { class: 'fb-resumo' }, a.titulo || nomePadrao)),
          h('button', { type: 'button', class: 'fb-fechar', title: 'Fechar', 'aria-label': 'Fechar', onClick: () => fechar(salvo ?? undefined) }, icone('fechar', 20)),
        ),
        corpo,
        h('footer', { class: 'fb-rodape' }, h('span', { class: 'fb-rodape-espaco' }), h('button', { type: 'button', class: 'btn btn-secundario', onClick: () => fechar(salvo ?? undefined) }, 'Fechar')),
      );
      try {
        const configs = await lerConfigs(uid);
        const analise = await analisarAtividadeLthr(a, configs);
        corpo.replaceChildren(...montarResultadoLthr({ uid, atividade: a, analise, configs, mensagem: msg, idCaixa: 'fb-teste-fcmax' }), msg.el);
      } catch (err) {
        corpo.replaceChildren(h('p', { class: 'mensagem mensagem-erro' }, err.message || 'Não foi possível analisar esta atividade.'));
      }
    }

    // ---------- ações ----------
    const salvar = h('button', { type: 'submit', class: 'btn fb-salvar' }, 'Salvar');
    const cancelar = h('button', { type: 'button', class: 'btn btn-secundario', onClick: () => fechar(undefined) }, primeiraVez ? 'Pular por agora' : 'Cancelar');
    const remover = existente
      ? h(
          'button',
          {
            type: 'button',
            class: 'fb-remover',
            onClick: async () => {
              remover.disabled = true;
              try {
                fechar(await salvarAtividade({ atividadeId: a.id, feedback: null }));
              } catch (err) {
                remover.disabled = false;
                mensagem.mostrar(err.message || 'Não foi possível remover o registro.');
              }
            },
          },
          icone('lixeira', 16),
          'Remover registro',
        )
      : null;

    raiz.append(
      cabecalho,
      h(
        'div',
        { class: 'fb-corpo' },
        criarSecaoTreinoDoDia({ atividade: a, uid }),
        h('section', { class: 'fb-secao' }, h('h3', { class: 'fb-secao-titulo' }, 'Como você se sentiu?'), sensacao.raiz, legendaSensacao),
        h('section', { class: 'fb-secao' }, h('div', { class: 'fb-secao-linha' }, h('h3', { class: 'fb-secao-titulo' }, 'Quão duro foi?'), legendaEsforco), esforco.raiz, h('div', { class: 'fb-escala' }, h('span', null, 'leve'), h('span', null, 'máximo'))),
        h('section', { class: 'fb-secao' }, h('h3', { class: 'fb-secao-titulo' }, 'O que marcou o treino?'), h('div', { class: 'fb-chips' }, ...chips), blocoDor),
        h('section', { class: 'fb-secao' }, h('div', { class: 'fb-secao-linha' }, h('h3', { class: 'fb-secao-titulo' }, 'Notas'), contador), notas),
        h('section', { class: 'fb-secao' }, h('h3', { class: 'fb-secao-titulo' }, 'Marcações'), h('div', { class: 'fb-marcas' }, h('div', { class: 'fb-marca-bloco' }, cartaoLthr, botaoAnalise), cartaoTrajeto)),
        mensagem.el,
      ),
      h('footer', { class: 'fb-rodape' }, remover, h('span', { class: 'fb-rodape-espaco' }), cancelar, salvar),
    );

    atualizarTom();
    atualizarEsforco();
    atualizarDor();
    contar();
    atualizarMarcas();

    raiz.addEventListener('submit', async (e) => {
      e.preventDefault();
      mensagem.limpar();
      const pedido = { atividadeId: a.id };
      const tituloNovo = campoTitulo.value.replace(/\s+/g, ' ').trim();
      if (tituloNovo !== (a.titulo ?? '')) pedido.titulo = tituloNovo;
      if (campoEsporte.value !== a.esporte) pedido.esporte = campoEsporte.value;
      if (avaliacao.elegivel && estado.testeLthr !== (a.testeLthr === true)) pedido.testeLthr = estado.testeLthr;
      if (!trajetosCarregados) {
        // lista indisponível: não mexe no trajeto
      } else if (estado.trajetoId === NOVO_TRAJETO) {
        const nomeTrajeto = campoTrajetoNovo.value.replace(/\s+/g, ' ').trim();
        if (!nomeTrajeto) {
          mensagem.mostrar('Dê um nome ao trajeto novo ou escolha outra opção.');
          campoTrajetoNovo.focus();
          return;
        }
        pedido.trajeto = { nome: nomeTrajeto };
      } else if (estado.trajetoId !== (a.trajetoId ?? '')) {
        pedido.trajeto = estado.trajetoId === '' ? null : { id: estado.trajetoId };
      }

      const temOutroDado = estado.rpe !== null || estado.etiquetas.size > 0 || notas.value.trim() !== '';
      if (estado.sensacao === null && temOutroDado) {
        mensagem.mostrar('Escolha como foi a sensação para salvar o registro.');
        return;
      }
      if (estado.sensacao !== null) {
        pedido.feedback = {
          sensacao: estado.sensacao,
          rpe: estado.rpe,
          etiquetas: [...estado.etiquetas],
          dor: estado.etiquetas.has('dor') ? campoDor.value : null,
          notas: notas.value,
        };
      }
      if (!pedido.feedback && !('titulo' in pedido) && !('esporte' in pedido) && !('testeLthr' in pedido) && !('trajeto' in pedido)) {
        fechar(undefined);
        return;
      }

      const textoOriginal = salvar.textContent;
      salvar.disabled = true;
      salvar.textContent = 'Salvando…';
      try {
        const salvo = await salvarAtividade(pedido);
        // recém-marcado como teste: o resultado da análise aparece aqui mesmo, antes de fechar
        if (pedido.testeLthr === true) mostrarAnalise(salvo);
        else fechar(salvo);
      } catch (err) {
        salvar.disabled = false;
        salvar.textContent = textoOriginal;
        mensagem.mostrar(err.message || 'Não foi possível salvar. Tente novamente.');
      }
    });

    // o foco começa na primeira escolha, para dar para responder só com o teclado
    queueMicrotask(() => raiz.querySelector('.fb-sensacao[tabindex="0"]')?.focus());
    return raiz;
  }
}

/** Abre o modal de uma atividade pelo id (lê o documento antes). Devolve o que foi salvo, ou null. */
export async function abrirFeedbackPorId(id, opcoes = {}) {
  const dados = await lerAtividade(id);
  if (!dados) return null;
  return abrirFeedbackDaAtividade({ atividade: { ...dados, id }, ...opcoes });
}

/** Ícone pequeno da sensação registrada (tabela de atividades), ou null sem registro. */
export function miniSensacao(feedback) {
  const s = dadosDaSensacao(feedback);
  if (!s) return null;
  return h('span', { class: 'ativ-sensacao', style: `--cor:${s.tom}`, title: s.rotulo, role: 'img', 'aria-label': s.rotulo }, icone(s.icone, 16));
}

/** Ícone, texto e cor da sensação registrada no "Como foi?" (null sem sensação). */
export function dadosDaSensacao(feedback) {
  const s = SENSACOES.find((x) => x.valor === feedback?.sensacao);
  if (!s) return null;
  const rpe = feedback.rpe ? ` · esforço ${feedback.rpe}/10` : '';
  return { icone: s.id, rotulo: `Sensação: ${s.rotulo}${rpe}`, tom: TOM_DA_SENSACAO[s.valor] };
}

/**
 * Cartão "Como foi?" da página de detalhe: mostra o registro (ou convida a fazê-lo) e abre o modal para editar.
 * `aoSalvar(resultado)` recebe o que o servidor devolveu, para a tela se atualizar.
 */
export function cartaoComoFoi(atividade, aoSalvar, { trajetoNome = null } = {}) {
  const f = atividade.feedback ?? null;
  const s = SENSACOES.find((x) => x.valor === f?.sensacao);
  const marcas = [
    atividade.testeLthr ? h('span', { class: 'fb-cartao-marca fb-cartao-marca-lthr' }, icone('fc', 14), 'Teste de LTHR') : null,
    trajetoNome ? h('span', { class: 'fb-cartao-marca' }, icone('rota', 14), trajetoNome) : null,
  ].filter(Boolean);
  const blocoMarcas = marcas.length > 0 ? h('div', { class: 'fb-cartao-etiquetas' }, ...marcas) : null;
  const rotuloEtiqueta = (id) => ETIQUETAS.find((e) => e.id === id)?.rotulo ?? id;

  const botao = h('button', { type: 'button', class: 'btn btn-secundario' }, icone('lapis', 16), f ? 'Editar' : 'Registrar como foi');
  botao.addEventListener('click', async () => {
    const r = await abrirFeedbackDaAtividade({ atividade });
    if (r) aoSalvar(r);
  });

  if (!s) {
    return h('div', { class: 'fb-cartao fb-cartao-vazio' }, h('div', null, h('strong', null, 'Como foi essa atividade?'), h('p', { class: 'texto-secundario' }, 'Registre a sensação e o esforço: isso ajuda o app a sugerir treinos melhores.'), blocoMarcas), botao);
  }
  return h(
    'div',
    { class: 'fb-cartao', style: `--tom:${TOM_DA_SENSACAO[s.valor]}` },
    h('span', { class: 'fb-cartao-icone', 'aria-hidden': 'true' }, icone(s.id, 34)),
    h(
      'div',
      { class: 'fb-cartao-texto' },
      h('strong', null, s.rotulo, f.rpe ? h('span', { class: 'fb-cartao-rpe', style: `color:${corDoEsforco(f.rpe)}` }, ` · esforço ${f.rpe}/10 (${rotuloDoEsforco(f.rpe)})`) : null),
      (f.etiquetas ?? []).length > 0 ? h('div', { class: 'fb-cartao-etiquetas' }, ...f.etiquetas.map((id) => h('span', { class: 'fb-cartao-etiqueta' }, id === 'dor' && f.dor ? `Dor: ${f.dor}` : rotuloEtiqueta(id)))) : null,
      f.notas ? h('p', { class: 'fb-cartao-notas' }, f.notas) : null,
      blocoMarcas,
    ),
    botao,
  );
}
