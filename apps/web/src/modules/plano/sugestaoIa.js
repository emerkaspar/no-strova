import { AVISO_IA, modeloPorId } from '@no-strova/domain';
import { lerPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { aceitarTreinosDaIa, descartarRascunho, pedirTreinosDaIa, restantesDaIa } from '../../application/ia.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { formatarData } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const rotuloDaData = (iso) => `${DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${formatarData(iso).slice(0, 5)}`;

/**
 * Cartão "Sugestão de treinos com IA": o usuário informa semanas, dias e horas; a IA escolhe treinos do catálogo (o
 * servidor confere os limites de segurança) e o resultado é um rascunho que ele revisa, marca e aceita ou descarta.
 * @param {{ uid: string, obterConfigs: () => any[], aoAceitar?: () => void }} p
 *   O cartão é criado uma vez (guarda o formulário e o rascunho aberto); `obterConfigs` lê as configurações atuais.
 */
export function criarCartaoSugestaoIa({ uid, obterConfigs, aoAceitar = () => {} }) {
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
  const observacao = campo({ id: 'ia-obs', rotulo: 'Observação (opcional)', maxlength: '300', placeholder: 'ex.: viajo na semana 2; joelho sensível', autocomplete: 'off' });
  const mensagem = areaMensagem();
  const contador = h('p', { class: 'texto-secundario ia-restantes' });
  const resultado = h('div', { class: 'ia-resultado' });
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Sugerir treinos');

  function atualizarRestantes(n) {
    contador.textContent = n === undefined ? '' : n === null ? 'Sem limite de sugestões de IA por dia.' : `Restam ${n} sugest${n === 1 ? 'ão' : 'ões'} de IA hoje (limite definido pelo administrador, somando treinos e peso).`;
  }
  restantesDaIa().then(atualizarRestantes).catch(() => {});

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
        await aceitarTreinosDaIa({ uid, rascunhoId, itens: escolhidos, configs: obterConfigs() });
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
            const r = await pedirTreinosDaIa({ semanas: semanas.select.value, diasDaSemana: [...escolhidos], diaLongao: longaoSelecionado.valor === '' ? null : Number(longaoSelecionado.valor), horasPorSemana: horas.input.value, esporte: esporte.select.value, observacao: observacao.input.value });
            mostrarRascunho(r);
          } catch (err) {
            resultado.replaceChildren();
            throw err;
          }
        });
      },
    },
    semanas.raiz,
    horas.raiz,
    esporte.raiz,
    diasCampo,
    longaoCampo,
    observacao.raiz,
    h('div', { class: 'campo campo-botao' }, botao),
  );

  return h(
    'section',
    { class: 'card ia-cartao' },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Sugestão de treinos com IA')),
    h('p', { class: 'texto-secundario' }, 'Escolha os dias em que quer treinar (e o dia do longão): a IA monta as próximas semanas com treinos do catálogo, olhando o seu Condicionamento, a Forma e o que já está no plano. Você revisa e escolhe o que entra.'),
    form,
    mensagem.el,
    contador,
    resultado,
  );
}
