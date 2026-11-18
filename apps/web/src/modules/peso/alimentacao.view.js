import {
  BLOCOS_ALIMENTARES,
  chaveDeReceita,
  CONTEXTO_ALIMENTAR_PADRAO,
  diaDaSemana,
  LIMITES_ALIMENTACAO,
  NOMES_DIA,
  OBJETIVOS_ALIMENTARES,
  objetivoEfetivo,
  orientacaoDoTipoDeDia,
  PERFIL_ALIMENTAR_PADRAO,
  REFEICOES_ESCOLHIVEIS,
  REFEICOES_PADRAO,
  validarRefeicoesEscolhidas,
} from '@no-strova/domain';
import { pedirSugestaoAlimentar, salvarPerfilDeAlimentacao } from '../../application/alimentacao.js';
import { restantesDaIa } from '../../application/ia.js';
import { desfavoritarReceita, favoritarReceita, observarFavoritas, observarPerfilAlimentar, observarSugestaoAlimentar } from '../../infrastructure/alimentacaoRepo.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData } from '../../utils/formatters.js';
import { abrirModal } from '../../utils/modal.js';

const montar = (el, ...filhos) => el.replaceChildren(...filhos.filter((f) => f !== null && f !== undefined));

const ROTULO_EQUIPAMENTO = Object.freeze({ torradeira: 'Torradeira', geladeira: 'Geladeira', fogao: 'Fogão', forno: 'Forno' });
/** Textos de cada escopo: o botão de gerar e o que falta quando ainda não há nada. "Amanhã" = o que fazer hoje para levar ao trabalho. */
const TEXTOS_DO_ESCOPO = Object.freeze({
  dia: { gerar: 'Gerar ideias de hoje', vazio: 'ideias para hoje' },
  amanha: { gerar: 'Gerar lanches para amanhã', vazio: 'lanches para amanhã' },
  semana: { gerar: 'Gerar cardápio da semana', vazio: 'cardápio da semana' },
});
const capitalizar =(s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cartão de uma sugestão: nome, selos, por que, e a receita (ou o que pedir na padaria) numa área que abre e fecha. */
function cartaoDaSugestao(item, { favorita, aoFavoritar, abertas, idAberto }) {
  const equipamentos = (item.equipamento ?? []).filter((e) => ROTULO_EQUIPAMENTO[e]).map((e) => ROTULO_EQUIPAMENTO[e]);
  const naPadaria = item.bloco === 'padaria';
  const estrela = h(
    'button',
    {
      class: `alim-estrela${favorita ? ' ativa' : ''}`,
      type: 'button',
      'aria-pressed': String(favorita),
      'aria-label': favorita ? `Remover ${item.nome} das favoritas` : `Favoritar ${item.nome}`,
      title: favorita ? 'Remover das favoritas' : 'Favoritar',
      onClick: aoFavoritar,
    },
    favorita ? '★' : '☆',
  );
  return h(
    'article',
    { class: 'alim-item' },
    h(
      'div',
      { class: 'alim-item-topo' },
      h('h4', { class: 'alim-item-nome' }, item.nome),
      estrela,
    ),
    h(
      'p',
      { class: 'alim-selos' },
      h('span', { class: `selo ${item.tipo === 'doce' ? 'selo-aviso' : 'selo-ok'}` }, capitalizar(item.tipo)),
      h('span', { class: 'selo selo-neutro' }, BLOCOS_ALIMENTARES[item.bloco]),
      item.tempoMin ? h('span', { class: 'selo selo-neutro' }, `${item.tempoMin} min`) : null,
      item.vespera ? h('span', { class: 'selo selo-destaque' }, 'Dá para adiantar') : null,
      ...equipamentos.map((e) => h('span', { class: 'selo selo-neutro' }, e)),
    ),
    item.porQue ? h('p', { class: 'texto-secundario' }, item.porQue) : null,
    h(
      'details',
      {
        class: 'alim-receita',
        open: abertas.has(idAberto),
        onToggle: (e) => (e.target.open ? abertas.add(idAberto) : abertas.delete(idAberto)),
      },
      h('summary', null, naPadaria ? 'O que pedir' : 'Ver receita'),
      h('h5', null, naPadaria ? 'Peça' : 'Ingredientes'),
      h('ul', null, ...item.ingredientes.map((i) => h('li', null, i))),
      item.preparo?.length > 0 ? h('h5', null, 'Modo de fazer') : null,
      item.preparo?.length > 0 ? h('ol', null, ...item.preparo.map((p) => h('li', null, p))) : null,
    ),
  );
}

/** Agrupa os itens: por bloco no dia; por dia da semana (a partir da data da geração) na semana. */
function agrupar(itens, escopo, dataGeracao) {
  if (escopo !== 'semana') {
    return Object.entries(BLOCOS_ALIMENTARES)
      .map(([bloco, rotulo]) => ({ titulo: rotulo, itens: itens.filter((i) => i.bloco === bloco) }))
      .filter((g) => g.itens.length > 0);
  }
  const inicio = diaDaSemana(dataGeracao);
  const posicao = (dia) => (NOMES_DIA.indexOf(dia) - inicio + 7) % 7;
  const dias = [...new Set(itens.map((i) => i.dia))].filter(Boolean).sort((a, b) => posicao(a) - posicao(b));
  return dias.map((dia) => ({ titulo: capitalizar(dia), itens: itens.filter((i) => i.dia === dia) }));
}

/**
 * Seção "Alimentação": guia de reeducação alimentar com ideias de lanches (para levar ao trabalho e da padaria) e receitas em
 * casa, geradas pela IA a partir do treino do dia, do condicionamento, do sono e do perfil alimentar. O último resultado de cada
 * escopo (hoje e semana) fica salvo no servidor; as receitas podem ser favoritadas.
 * @param {{ sessao: { uid: string }, hoje: string, perderPeso: () => (boolean|null) }} p
 * @returns {{ el: HTMLElement, fechar: () => void, desenhar: () => void }}
 */
export function criarSecaoAlimentacao({ sessao, hoje, perderPeso }) {
  let perfil = null;
  let sugestoes = null;
  let favoritas = [];
  let escopo = 'dia';
  let restantes; // undefined = ainda não sabe; null = sem limite
  let gerando = false;
  const abertas = new Set(); // receitas abertas: o redesenho (ao favoritar, por exemplo) não as fecha
  const el = h('section', { class: 'card alim' });
  const mensagem = areaMensagem();
  const observacao = campo({ id: 'alim-observacao', rotulo: 'Pedido extra (opcional)', maxlength: '200', placeholder: 'Ex.: sem fogão hoje, algo com ovo, mais leve', autocomplete: 'off' });

  const perfilEfetivo = () => ({ ...PERFIL_ALIMENTAR_PADRAO, ...(perfil ?? {}) });
  const chavesFavoritas = () => new Set(favoritas.map((f) => f.chave));
  const refeicoesEscolhidas = () => {
    const r = validarRefeicoesEscolhidas(perfilEfetivo().refeicoes);
    return r.valido ? r.valores : [...REFEICOES_PADRAO];
  };

  /** Liga ou desliga uma refeição na escolha do que gerar e guarda no perfil. Sempre fica pelo menos uma. */
  async function alternarRefeicao(chave) {
    const atuais = refeicoesEscolhidas();
    const novas = atuais.includes(chave) ? atuais.filter((r) => r !== chave) : [...atuais, chave];
    if (novas.length === 0) {
      mensagem.mostrar('Deixe pelo menos uma refeição marcada.');
      return;
    }
    mensagem.limpar();
    const anterior = perfil;
    perfil = { ...perfilEfetivo(), refeicoes: validarRefeicoesEscolhidas(novas).valores };
    desenhar();
    try {
      await salvarPerfilDeAlimentacao(sessao.uid, perfil);
    } catch {
      perfil = anterior;
      mensagem.mostrar('Não foi possível guardar a escolha. Tente novamente.');
      desenhar();
    }
  }

  async function alternarFavorita(item) {
    const chave = chaveDeReceita(item);
    try {
      if (chavesFavoritas().has(chave)) await desfavoritarReceita(sessao.uid, chave);
      else await favoritarReceita(sessao.uid, item);
    } catch {
      mensagem.mostrar('Não foi possível atualizar as favoritas. Tente novamente.');
    }
  }

  async function gerar(botao) {
    gerando = true;
    const ok = await executarComBotao(
      botao,
      mensagem,
      async () => {
        // "amanhã" é sempre lanche para levar; nos outros, vale a escolha da tela (mandada junto, sem esperar o salvamento do perfil)
        const r = await pedirSugestaoAlimentar(escopo, observacao.input.value, escopo === 'amanha' ? null : refeicoesEscolhidas());
        restantes = r.restantes;
      },
      'Gerando… pode levar alguns segundos',
    );
    gerando = false;
    if (ok) observacao.input.value = '';
    desenhar();
  }

  function editarPerfil() {
    return abrirModal({
      classe: 'modal-meta',
      rotulo: 'Perfil alimentar',
      conteudo: (fechar) => {
        const p = perfilEfetivo();
        const objetivo = selecao({
          id: 'alim-objetivo',
          rotulo: 'Objetivo',
          opcoes: Object.entries(OBJETIVOS_ALIMENTARES).map(([valor, rotulo]) => ({ valor, rotulo })),
          valor: p.objetivo,
        });
        const seguirMeta = h('input', { type: 'checkbox', id: 'alim-meta', checked: p.usarMetaDePeso !== false });
        const restricoes = h('textarea', { id: 'alim-restricoes', rows: 2, maxlength: 600, placeholder: 'Ex.: lactose, amendoim, camarão' }, (p.restricoes ?? []).join(', '));
        const contexto = h('textarea', { id: 'alim-contexto', rows: 5, maxlength: LIMITES_ALIMENTACAO.contextoMax }, p.contexto ?? CONTEXTO_ALIMENTAR_PADRAO);
        const refeicoes = campo({ id: 'alim-refeicoes', rotulo: 'Refeições por dia', tipo: 'number', min: String(LIMITES_ALIMENTACAO.refeicoesMin), max: String(LIMITES_ALIMENTACAO.refeicoesMax), step: '1', value: String(p.refeicoesPorDia) });
        const erro = areaMensagem();
        const salvar = h('button', { class: 'btn', type: 'submit' }, 'Salvar perfil');
        const cancelar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Cancelar');
        const form = h(
          'form',
          { class: 'prog-form', novalidate: true },
          h('h2', null, 'Perfil alimentar'),
          h(
            'div',
            { class: 'prog-form-grade' },
            objetivo.raiz,
            h('div', { class: 'campo' }, h('label', { for: 'alim-meta' }, h('span', null, 'Seguir a meta de peso ', seguirMeta)), h('small', { class: 'dica' }, 'Com meta de peso ativa, o objetivo acima é trocado por perder ou ganhar peso, conforme a meta.')),
            refeicoes.raiz,
            h('div', { class: 'campo campo-largo' }, h('label', { for: 'alim-restricoes' }, 'Restrições e alergias'), restricoes, h('small', { class: 'dica' }, 'Separe por vírgula. A IA nunca usa esses alimentos.')),
            h('div', { class: 'campo campo-largo' }, h('label', { for: 'alim-contexto' }, 'Sobre você e a sua rotina'), contexto, h('small', { class: 'dica' }, 'Onde você come, o que tem à mão, o que gosta e o que sabe fazer.')),
          ),
          erro.el,
          h('div', { class: 'prog-rodape' }, h('span'), h('div', { class: 'linha-botoes' }, salvar, cancelar)),
        );
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          executarComBotao(salvar, erro, async () => {
            await salvarPerfilDeAlimentacao(sessao.uid, {
              objetivo: objetivo.select.value,
              usarMetaDePeso: seguirMeta.checked,
              restricoes: restricoes.value,
              contexto: contexto.value,
              refeicoesPorDia: refeicoes.input.value,
              refeicoes: p.refeicoes, // a escolha do que gerar não é deste formulário: mantém a atual
            });
            fechar(true);
          });
        });
        return form;
      },
    });
  }

  function listaDeSugestoes() {
    const doc = sugestoes?.[escopo] ?? null;
    if (!doc) {
      return estadoVazio(`Ainda não há ${TEXTOS_DO_ESCOPO[escopo].vazio}. Toque em "${TEXTOS_DO_ESCOPO[escopo].gerar}".`);
    }
    const orientacao = orientacaoDoTipoDeDia(doc.tipoDeDia);
    const antiga = doc.data !== hoje;
    const favoritaDe = chavesFavoritas();
    const grupos = agrupar(doc.saida?.itens ?? [], escopo, doc.data);
    return h(
      'div',
      { class: 'alim-resultado' },
      h('p', { class: 'texto-secundario' }, `Gerado ${antiga ? `em ${formatarData(doc.data)}` : 'hoje'}${antiga ? ` · gere de novo para ajustar ao treino de ${escopo === 'amanha' ? 'amanhã' : 'hoje'}.` : ''}`),
      orientacao && escopo !== 'semana' ? h('p', { class: 'alim-orientacao' }, h('strong', null, orientacao.rotulo), ` · ${orientacao.orientacao}`) : null,
      doc.saida?.resumo ? h('p', null, doc.saida.resumo) : null,
      ...(doc.saida?.avisos ?? []).map((a) => h('p', { class: 'texto-secundario', role: 'status' }, a)),
      ...grupos.map((g) =>
        h(
          'div',
          { class: 'alim-grupo' },
          h('h3', { class: 'alim-grupo-titulo' }, g.titulo),
          h('div', { class: 'alim-grade' }, ...g.itens.map((item) => cartaoDaSugestao(item, { favorita: favoritaDe.has(chaveDeReceita(item)), aoFavoritar: () => alternarFavorita(item), abertas, idAberto: `${escopo}|${item.dia ?? ''}|${chaveDeReceita(item)}` }))),
        ),
      ),
      h('p', { class: 'texto-secundario' }, doc.saida?.aviso ?? ''),
    );
  }

  function listaDeFavoritas() {
    if (favoritas.length === 0) return null;
    const ordenadas = [...favoritas].sort((a, b) => a.item.nome.localeCompare(b.item.nome, 'pt-BR'));
    return h(
      'details',
      { class: 'alim-favoritas' },
      h('summary', null, `Favoritas (${ordenadas.length})`),
      h('div', { class: 'alim-grade' }, ...ordenadas.map((f) => cartaoDaSugestao(f.item, { favorita: true, aoFavoritar: () => alternarFavorita(f.item), abertas, idAberto: `fav|${f.chave}` }))),
    );
  }

  function desenhar() {
    const objetivo = objetivoEfetivo(perfilEfetivo(), perderPeso());
    const jaTem = Boolean(sugestoes?.[escopo]);
    const botaoGerar = h('button', { class: 'btn', type: 'button', disabled: gerando || restantes === 0 }, jaTem ? 'Gerar de novo' : TEXTOS_DO_ESCOPO[escopo].gerar);
    botaoGerar.addEventListener('click', () => gerar(botaoGerar));
    const chips = h(
      'div',
      { class: 'ativ-grupo alim-escopo', role: 'group', 'aria-label': 'Escopo das ideias' },
      ...[
        ['dia', 'Hoje'],
        ['amanha', 'Amanhã'],
        ['semana', 'Semana'],
      ].map(([id, rotulo]) =>
        h('button', { type: 'button', class: `ativ-chip${escopo === id ? ' ativo' : ''}`, 'aria-pressed': String(escopo === id), onClick: () => { escopo = id; desenhar(); } }, rotulo),
      ),
    );
    montar(
      el,
      h(
        'div',
        { class: 'bloco-topo' },
        h('h2', { class: 'titulo-bloco' }, 'Alimentação'),
        h('div', { class: 'bloco-acoes' }, h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', onClick: editarPerfil }, 'Meu perfil')),
      ),
      h('p', { class: 'texto-secundario' }, `Ideias de lanches para o trabalho e receitas para casa, ajustadas ao seu treino, ao seu cansaço e ao seu sono. Objetivo: ${OBJETIVOS_ALIMENTARES[objetivo].toLowerCase()}.`),
      chips,
      escopo === 'amanha'
        ? h('p', { class: 'texto-secundario' }, 'Lanches para fazer hoje à noite e levar ao trabalho amanhã, pensados no treino de amanhã.')
        : h(
            'div',
            { class: 'alim-refeicoes' },
            h('span', { class: 'texto-secundario', id: 'alim-refeicoes-rotulo' }, 'O que gerar:'),
            h(
              'div',
              { class: 'ativ-grupo', role: 'group', 'aria-labelledby': 'alim-refeicoes-rotulo' },
              ...Object.entries(REFEICOES_ESCOLHIVEIS).map(([chave, rotulo]) => {
                const marcada = refeicoesEscolhidas().includes(chave);
                return h('button', { type: 'button', class: `ativ-chip${marcada ? ' ativo' : ''}`, 'aria-pressed': String(marcada), onClick: () => alternarRefeicao(chave) }, rotulo);
              }),
            ),
          ),
      h('div', { class: 'alim-pedido' }, observacao.raiz, botaoGerar),
      restantes === undefined ? null : h('p', { class: 'texto-secundario' }, restantes === null ? 'Sem limite de sugestões de IA hoje.' : restantes === 0 ? 'As sugestões de IA de hoje acabaram. Volte amanhã.' : `${restantes} sugestão(ões) de IA restante(s) hoje, somadas às dos treinos.`),
      mensagem.el,
      listaDeSugestoes(),
      listaDeFavoritas(),
    );
  }

  desenhar();
  const aoErro = () => mensagem.mostrar('Não foi possível carregar a alimentação.');
  const cancelar = [
    observarPerfilAlimentar(sessao.uid, (p) => { perfil = p; desenhar(); }, () => {}),
    observarSugestaoAlimentar(sessao.uid, (s) => { sugestoes = s; desenhar(); }, aoErro),
    observarFavoritas(sessao.uid, (lista) => { favoritas = lista; desenhar(); }, () => {}),
  ];
  restantesDaIa()
    .then((n) => { restantes = n; desenhar(); })
    .catch(() => {});

  return { el, fechar: () => cancelar.forEach((fn) => fn()), desenhar };
}
