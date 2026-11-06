import { AVISO_IA, LIMITES_IA_PLANO_ANUAL, modeloPorId, provaDoPlano, provasFuturas } from '@no-strova/domain';
import { lerPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { aceitarTreinosDaIa, descartarRascunho, pedirTreinosDaIa, restantesDaIa } from '../../application/ia.js';
import { pedirRascunhoAnualDaIa } from '../../application/provas.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { formatarData } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { desenharRascunhoAnual } from './rascunhoAnual.js';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const rotuloDaData = (iso) => `${DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${formatarData(iso).slice(0, 5)}`;

/**
 * Painel único de IA do plano: o usuário escolhe o horizonte — "próximas semanas" (dias, longão e horas; a IA escolhe treinos
 * do catálogo) ou "até a prova" (a IA monta as primeiras semanas rumo ao evento escolhido) — e o resultado é um rascunho que ele
 * revisa, marca e aceita ou descarta. O servidor confere os limites de segurança; as duas formas consomem a mesma cota diária.
 * @param {{ uid: string, hoje: string, obterContexto: () => { configs: any[], calibracao: any, provas: any[] }, aoAceitar?: () => void }} p
 *   O painel é criado uma vez (guarda o formulário e o rascunho aberto); `atualizar()` relê as provas.
 */
export function criarPainelIa({ uid, hoje, obterContexto, aoAceitar = () => {} }) {
  let horizonte = 'semanas'; // 'semanas' | 'prova'

  const semanas = selecao({ id: 'ia-semanas', rotulo: 'Semanas', valor: '2', opcoes: [1, 2, 3, 4].map((n) => ({ valor: String(n), rotulo: `${n} semana${n === 1 ? '' : 's'}` })) });
  const ABREV = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const NOMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const escolhidos = new Set([1, 3, 5, 6]);
  const longaoSelecionado = { valor: '6' };
  const diasCampo = h('div', { class: 'campo ia-dias-campo' }, h('span', { class: 'ia-rotulo' }, 'Dias de treino'));
  const longao = seletor({ id: 'ia-longao', rotulo: 'Dia do longão' });
  const longaoCampo = h('div', { class: 'campo' }, h('label', { for: 'ia-longao' }, 'Dia do longão'), longao);
  longao.addEventListener('change', () => {
    longaoSelecionado.valor = longao.value;
  });
  function desenharDias() {
    const ordenados = [...escolhidos].sort((a, b) => a - b);
    if (!escolhidos.has(Number(longaoSelecionado.valor))) longaoSelecionado.valor = '';
    longao.definirOpcoes([{ valor: '', rotulo: 'Sem longão' }, ...ordenados.map((d) => ({ valor: String(d), rotulo: NOMES[d] }))], longaoSelecionado.valor);
    diasCampo.replaceChildren(
      h('span', { class: 'ia-rotulo' }, `Dias de treino (${escolhidos.size} por semana)`),
      h(
        'div',
        { class: 'ia-dias', role: 'group', 'aria-label': 'Dias da semana em que você quer treinar' },
        ...ABREV.map((rotulo, d) =>
          h(
            'button',
            {
              type: 'button',
              class: `ativ-chip${escolhidos.has(d) ? ' ativo' : ''}`,
              'aria-pressed': String(escolhidos.has(d)),
              title: NOMES[d],
              onClick: () => {
                if (escolhidos.has(d)) escolhidos.delete(d);
                else escolhidos.add(d);
                desenharDias();
              },
            },
            rotulo,
          ),
        ),
      ),
    );
  }
  desenharDias();
  const horas = campo({ id: 'ia-horas', rotulo: 'Horas por semana', inputmode: 'decimal', value: '6' });
  const esporte = selecao({
    id: 'ia-esporte',
    rotulo: 'Esporte',
    valor: 'ambos',
    opcoes: [
      { valor: 'ambos', rotulo: 'Ciclismo e corrida' },
      { valor: 'ciclismo', rotulo: 'Ciclismo' },
      { valor: 'corrida', rotulo: 'Corrida' },
    ],
  });
  // Pré-preenche com a rotina salva no perfil de treino (wizard): dias, longão, horas e esporte.
  lerPreferencias(uid)
    .then((p) => {
      if (!p) return;
      if (Array.isArray(p.diasTreino) && p.diasTreino.length > 0) {
        escolhidos.clear();
        p.diasTreino.forEach((d) => escolhidos.add(d));
        longaoSelecionado.valor = p.diaLongao === null || p.diaLongao === undefined ? '' : String(p.diaLongao);
        desenharDias();
      }
      if (Number.isFinite(p.horasSemana)) horas.input.value = String(p.horasSemana).replace('.', ',');
      if (p.esportePrincipal) esporte.select.value = p.esportePrincipal;
    })
    .catch(() => {});

  // ---- horizonte "até o evento" ----
  const provaSel = seletor({ id: 'ia-prova', rotulo: 'Evento' });
  const provaCampo = h('div', { class: 'campo' }, h('label', { for: 'ia-prova' }, 'Evento'), provaSel);
  const semProva = h('p', { class: 'texto-secundario' }, 'Cadastre um evento futuro (seção Eventos) para a IA montar o plano até ele.');
  let chaveProvas = null;
  function atualizarProvas() {
    const futuras = provasFuturas(obterContexto().provas, hoje);
    const chave = futuras.map((p) => p.id).join(',');
    if (chave === chaveProvas) return;
    chaveProvas = chave;
    const atual = futuras.some((p) => p.id === provaSel.value) ? provaSel.value : (provaDoPlano(futuras, hoje)?.id ?? '');
    provaSel.definirOpcoes(futuras.map((p) => ({ valor: p.id, rotulo: `${p.prioridade} · ${p.nome} · ${formatarData(p.data)}` })), atual);
    desenharHorizonte();
  }

  const observacao = campo({ id: 'ia-obs', rotulo: 'Observação (opcional)', maxlength: String(LIMITES_IA_PLANO_ANUAL.observacaoMax), placeholder: 'ex.: viajo na semana 2; joelho sensível', autocomplete: 'off' });
  const mensagem = areaMensagem();
  const contador = h('p', { class: 'texto-secundario ia-restantes' });
  const resultado = h('div', { class: 'ia-resultado' });
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Sugerir treinos');

  function atualizarRestantes(n) {
    contador.textContent = n === undefined ? '' : n === null ? 'Sem limite de sugestões de IA por dia.' : `Restam ${n} sugest${n === 1 ? 'ão' : 'ões'} de IA hoje (limite definido pelo administrador; cada pedido, de qualquer tipo, conta uma).`;
  }
  restantesDaIa().then(atualizarRestantes).catch(() => {});

  const camposSemanas = [semanas.raiz, horas.raiz, esporte.raiz, diasCampo, longaoCampo];
  const camposProva = [provaCampo];
  const grupoSemanas = h('div', { class: 'ia-grupo' }, ...camposSemanas);
  const grupoProva = h('div', { class: 'ia-grupo' }, ...camposProva);
  const botoesHorizonte = h('div', { class: 'linha-botoes', role: 'group', 'aria-label': 'Até quando a IA deve planejar' });

  function desenharHorizonte() {
    const futuras = chaveProvas !== '' && chaveProvas !== null;
    const botaoHorizonte = (id, rotulo) =>
      h('button', { class: 'btn btn-secundario', type: 'button', 'aria-pressed': String(horizonte === id), onClick: () => { horizonte = id; desenharHorizonte(); } }, rotulo);
    botoesHorizonte.replaceChildren(botaoHorizonte('semanas', 'Próximas semanas'), botaoHorizonte('prova', 'Até o evento'));
    grupoSemanas.hidden = horizonte !== 'semanas';
    grupoProva.hidden = horizonte !== 'prova';
    provaCampo.hidden = !futuras;
    semProva.hidden = horizonte !== 'prova' || futuras;
    botao.textContent = horizonte === 'prova' ? 'Montar plano até o evento' : 'Sugerir treinos';
    botao.disabled = horizonte === 'prova' && !futuras;
  }

  function mostrarRascunho({ rascunhoId, saida, restantes }) {
    atualizarRestantes(restantes);
    const itens = saida.itens;
    const marcados = new Set(itens.map((_, i) => i));
    const msgDecisao = areaMensagem();
    const botaoAceitar = h('button', { class: 'btn', type: 'button' });
    const botaoDescartar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Descartar');
    const atualizarBotao = () => {
      botaoAceitar.textContent = `Aceitar ${marcados.size} treino${marcados.size === 1 ? '' : 's'}`;
      botaoAceitar.disabled = marcados.size === 0;
    };
    atualizarBotao();

    botaoAceitar.addEventListener('click', () =>
      executarComBotao(botaoAceitar, msgDecisao, async () => {
        const escolhidos = itens.filter((_, i) => marcados.has(i)).map((it) => ({ modelo: modeloPorId(it.modeloId), data: it.data }));
        await aceitarTreinosDaIa({ uid, rascunhoId, itens: escolhidos, configs: obterContexto().configs });
        resultado.replaceChildren(h('p', { class: 'mensagem mensagem-ok', role: 'status' }, `${escolhidos.length} treino${escolhidos.length === 1 ? '' : 's'} adicionado${escolhidos.length === 1 ? '' : 's'} ao plano.`));
        aoAceitar();
      }),
    );
    botaoDescartar.addEventListener('click', () =>
      executarComBotao(botaoDescartar, msgDecisao, async () => {
        await descartarRascunho(rascunhoId);
        resultado.replaceChildren(h('p', { class: 'texto-secundario' }, 'Sugestão descartada. Nada foi alterado no plano.'));
      }),
    );

    resultado.replaceChildren(
      h('p', { class: 'ia-aviso' }, icone('esporte', 14), AVISO_IA),
      saida.resumo ? h('p', { class: 'ia-resumo' }, saida.resumo) : null,
      saida.avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...saida.avisos.map((a) => h('li', null, a))) : null,
      itens.length === 0
        ? h('p', { class: 'texto-secundario' }, 'Nenhum treino passou pelas regras de segurança.')
        : h(
            'ul',
            { class: 'ia-itens' },
            ...itens.map((it, i) =>
              h(
                'li',
                { class: 'ia-item' },
                h('input', {
                  type: 'checkbox',
                  checked: true,
                  'aria-label': `Incluir ${it.nome} em ${rotuloDaData(it.data)}`,
                  onChange: (e) => {
                    if (e.target.checked) marcados.add(i);
                    else marcados.delete(i);
                    atualizarBotao();
                  },
                }),
                h('span', { class: 'ia-item-data' }, rotuloDaData(it.data)),
                h('span', { class: 'ia-item-treino' }, icone(it.esporte === 'corrida' ? 'corrida' : 'ciclismo', 16), h('strong', null, it.nome), h('span', { class: 'texto-secundario' }, ` · ${it.duracaoMin} min · carga ~${it.estresse}`)),
                it.motivo ? h('span', { class: 'ia-item-motivo texto-secundario' }, it.motivo) : null,
              ),
            ),
          ),
      itens.length > 0 ? h('div', { class: 'linha-botoes' }, botaoAceitar, botaoDescartar) : h('div', { class: 'linha-botoes' }, botaoDescartar),
      msgDecisao.el,
    );
  }

  /** Rascunho "até o evento": mesmo formato do rascunho por regras, com os treinos agrupados por semana. */
  function mostrarRascunhoDaProva(resposta, prova) {
    const { saida } = resposta;
    atualizarRestantes(resposta.restantes);
    resultado.replaceChildren(
      desenharRascunhoAnual({
        rascunho: {
          itens: saida.itens,
          avisos: saida.avisos,
          porSemana: saida.porSemana,
          marcados: new Set(saida.itens.map((_, i) => i)),
          ia: { rascunhoId: resposta.rascunhoId, resumo: saida.resumo, aviso: saida.aviso },
        },
        prova,
        uid,
        obterContexto,
        aoDescartar: () => resultado.replaceChildren(h('p', { class: 'texto-secundario' }, 'Sugestão descartada. Nada foi alterado no plano.')),
        aoAceitar: (n) => {
          resultado.replaceChildren(h('p', { class: 'mensagem mensagem-ok', role: 'status' }, `${n} treino${n === 1 ? '' : 's'} adicionado${n === 1 ? '' : 's'} ao plano.`));
          aoAceitar();
        },
      }),
    );
  }

  const form = h(
    'form',
    {
      class: 'peso-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          resultado.replaceChildren(h('p', { class: 'texto-secundario', role: 'status' }, 'A IA está montando o plano… pode levar alguns segundos.'));
          try {
            if (horizonte === 'prova') {
              const prova = provasFuturas(obterContexto().provas, hoje).find((p) => p.id === provaSel.value);
              if (!prova) throw new Error('Escolha um evento futuro.');
              const resposta = await pedirRascunhoAnualDaIa({ provaId: prova.id, observacao: observacao.input.value.trim() });
              mostrarRascunhoDaProva(resposta, prova);
            } else {
              const r = await pedirTreinosDaIa({ semanas: semanas.select.value, diasDaSemana: [...escolhidos], diaLongao: longaoSelecionado.valor === '' ? null : Number(longaoSelecionado.valor), horasPorSemana: horas.input.value, esporte: esporte.select.value, observacao: observacao.input.value });
              mostrarRascunho(r);
            }
          } catch (err) {
            resultado.replaceChildren();
            throw err;
          }
        });
      },
    },
    botoesHorizonte,
    grupoSemanas,
    grupoProva,
    semProva,
    observacao.raiz,
    h('div', { class: 'campo campo-botao' }, botao),
  );

  const el = h(
    'section',
    { class: 'card ia-cartao', id: 'plano-ia', hidden: true },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Sugestão de treinos com IA')),
    h('p', { class: 'texto-secundario' }, 'Escolha até quando planejar: as próximas semanas (você informa os dias e o longão) ou até o evento. A IA monta os treinos olhando o seu Condicionamento, a Forma e o que já está no plano; você revisa e escolhe o que entra.'),
    form,
    mensagem.el,
    contador,
    resultado,
  );
  atualizarProvas();
  desenharHorizonte();

  return { el, atualizar: atualizarProvas };
}
