import { AVISO_IA } from '@no-strova/domain';
import { marcarPlanoDePesoAceito, pedirPlanoDePesoDaIa, restantesDaIa, descartarRascunho } from '../../application/ia.js';
import { salvarMetaDePeso } from '../../application/peso.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';

const kg = (v, casas = 1) => `${formatarNumero(v, casas)} kg`;

function linha(rotulo, valor, nomeIcone) {
  return h('li', { class: 'ia-numero' }, h('span', { class: 'ia-numero-rotulo' }, icone(nomeIcone, 16), rotulo), h('strong', null, valor));
}

/**
 * Cartão "Plano de peso com IA": o usuário informa o peso desejado e a data; o servidor calcula o plano com os limites
 * de segurança (ritmo, déficit, IMC) e a IA só explica. O resultado é um rascunho: "Usar como meta" grava a meta de peso.
 * @param {{ uid: string, hoje: string, obter: () => { metaAtiva: any|null, pesagens: any[], alturaCm: number|null } }} p
 *   O cartão é criado uma vez (guarda o formulário e o rascunho aberto); `obter` lê os dados atuais.
 */
export function criarCartaoPlanoDePesoIa({ uid, hoje, obter }) {
  const inicial = obter().metaAtiva;
  const alvo = campo({ id: 'iapeso-alvo', rotulo: 'Peso desejado (kg)', inputmode: 'decimal', value: inicial ? String(inicial.pesoAlvoKg).replace('.', ',') : '', autocomplete: 'off' });
  const data = campo({ id: 'iapeso-data', rotulo: 'Na data', tipo: 'date', value: inicial?.dataAlvo ?? '' });
  const mensagem = areaMensagem();
  const contador = h('p', { class: 'texto-secundario ia-restantes' });
  const resultado = h('div', { class: 'ia-resultado' });
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Planejar com IA');

  const atualizarRestantes = (n) => {
    contador.textContent = n === null || n === undefined ? '' : `Restam ${n} sugestão${n === 1 ? '' : 'ões'} de IA hoje (limite de 5 por dia, somando treinos e peso).`;
  };
  restantesDaIa().then(atualizarRestantes).catch(() => {});

  function mostrar({ rascunhoId, saida, restantes }) {
    atualizarRestantes(restantes);
    const p = saida.plano;
    const msgDecisao = areaMensagem();
    const usar = h('button', { class: 'btn', type: 'button' }, p.ajustada ? `Usar a data sugerida (${formatarData(p.dataSugerida)})` : 'Usar como meta');
    const descartar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Descartar');
    usar.addEventListener('click', () =>
      executarComBotao(usar, msgDecisao, async () => {
        const { metaAtiva, pesagens, alturaCm } = obter();
        await salvarMetaDePeso({ uid, hoje, entrada: { pesoAlvoKg: alvo.input.value, dataAlvo: p.dataSugerida }, metasAtivas: metaAtiva ? [metaAtiva] : [], pesagens, alturaCm });
        await marcarPlanoDePesoAceito(rascunhoId);
        resultado.replaceChildren(h('p', { class: 'mensagem mensagem-ok', role: 'status' }, `Meta definida: ${kg(Number(String(alvo.input.value).replace(',', '.')))} até ${formatarData(p.dataSugerida)}.`));
      }),
    );
    descartar.addEventListener('click', () =>
      executarComBotao(descartar, msgDecisao, async () => {
        await descartarRascunho(rascunhoId);
        resultado.replaceChildren(h('p', { class: 'texto-secundario' }, 'Plano descartado. A sua meta não foi alterada.'));
      }),
    );

    const t = p.treinoSugerido;
    resultado.replaceChildren(
      h('p', { class: 'ia-aviso' }, icone('esporte', 14), AVISO_IA),
      saida.explicacao ? h('p', { class: 'ia-resumo' }, saida.explicacao) : null,
      p.avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...p.avisos.map((a) => h('li', null, a))) : null,
      h(
        'ul',
        { class: 'ia-numeros' },
        linha('Ritmo', `${p.perder ? '−' : '+'}${formatarNumero(p.ritmoAplicadoKgSemana, 2)} kg por semana`, p.perder ? 'setaBaixo' : 'setaCima'),
        linha('Data', p.ajustada ? `${formatarData(p.dataSugerida)} (você pediu ${formatarData(p.dataPedida)})` : formatarData(p.dataSugerida), 'plano'),
        linha('Gasto diário estimado', `${formatarNumero(p.gastoDiarioKcal, 0)} kcal`, 'hrss'),
        linha(p.perder ? 'Déficit diário' : 'Superávit diário', `${formatarNumero(Math.abs(p.saldoDiarioKcal), 0)} kcal${p.perder ? ` (${formatarNumero(p.deficitPct * 100, 0)}% do gasto)` : ''}`, 'atividades'),
        t ? linha('Treino por semana', `${formatarNumero(t.horasSemana, 1)} h · ${formatarNumero(t.distanciaKmSemana, 0)} km · ${formatarNumero(t.kcalSemana, 0)} kcal (hoje: ${formatarNumero(p.treinoAtual.horasSemana, 1)} h)`, 'duracao') : null,
        p.perder && p.reducaoDaAlimentacaoKcalDia ? linha('Alimentação', `cerca de ${formatarNumero(p.reducaoDaAlimentacaoKcalDia, 0)} kcal a menos por dia`, 'distancia') : null,
      ),
      saida.dicas?.length > 0 ? h('ul', { class: 'ia-dicas' }, ...saida.dicas.map((d) => h('li', null, d))) : null,
      h('div', { class: 'linha-botoes' }, usar, descartar),
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
          resultado.replaceChildren(h('p', { class: 'texto-secundario', role: 'status' }, 'Calculando o plano… pode levar alguns segundos.'));
          try {
            mostrar(await pedirPlanoDePesoDaIa({ pesoAlvoKg: alvo.input.value, dataAlvo: data.input.value }));
          } catch (err) {
            resultado.replaceChildren();
            throw err;
          }
        });
      },
    },
    alvo.raiz,
    data.raiz,
    h('div', { class: 'campo campo-botao' }, botao),
  );

  return h(
    'section',
    { class: 'card ia-cartao' },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Plano de peso com IA')),
    h('p', { class: 'texto-secundario' }, 'Informe o peso e a data. O app calcula o ritmo, o déficit e quanto treinar com limites de segurança (no máximo 1% do peso por semana e 20% de déficit), e a IA explica o plano.'),
    form,
    mensagem.el,
    contador,
    resultado,
  );
}
