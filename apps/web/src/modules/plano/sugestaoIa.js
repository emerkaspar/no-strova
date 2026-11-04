import { AVISO_IA, modeloPorId } from '@no-strova/domain';
import { aceitarTreinosDaIa, descartarRascunho, pedirTreinosDaIa, restantesDaIa } from '../../application/ia.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
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
  const dias = selecao({ id: 'ia-dias', rotulo: 'Dias de treino por semana', valor: '4', opcoes: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ valor: String(n), rotulo: String(n) })) });
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
  const observacao = campo({ id: 'ia-obs', rotulo: 'Observação (opcional)', maxlength: '300', placeholder: 'ex.: viajo na semana 2; joelho sensível', autocomplete: 'off' });
  const mensagem = areaMensagem();
  const contador = h('p', { class: 'texto-secundario ia-restantes' });
  const resultado = h('div', { class: 'ia-resultado' });
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Sugerir treinos');

  function atualizarRestantes(n) {
    contador.textContent = n === null || n === undefined ? '' : `Restam ${n} sugestão${n === 1 ? '' : 'ões'} de IA hoje (limite de 5 por dia, somando treinos e peso).`;
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
            const r = await pedirTreinosDaIa({ semanas: semanas.select.value, diasPorSemana: dias.select.value, horasPorSemana: horas.input.value, esporte: esporte.select.value, observacao: observacao.input.value });
            mostrarRascunho(r);
          } catch (err) {
            resultado.replaceChildren();
            throw err;
          }
        });
      },
    },
    semanas.raiz,
    dias.raiz,
    horas.raiz,
    esporte.raiz,
    observacao.raiz,
    h('div', { class: 'campo campo-botao' }, botao),
  );

  return h(
    'section',
    { class: 'card ia-cartao' },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Sugestão de treinos com IA')),
    h('p', { class: 'texto-secundario' }, 'A IA monta as próximas semanas com treinos do catálogo, olhando o seu Condicionamento, a Forma e o que já está no plano. Você revisa e escolhe o que entra.'),
    form,
    mensagem.el,
    contador,
    resultado,
  );
}
