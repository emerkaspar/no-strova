import { RITMO_MAXIMO_SEMANAL, progressoDaMetaCondicionamento } from '@no-strova/domain';
import { salvarMetaDeCondicionamento } from '../../application/plano.js';
import { excluirMetaCondicionamento } from '../../infrastructure/planoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';
import { ligarFormRecolhivel } from './formRecolhivel.js';
import { comSinal, montarCartaoDeMeta } from './metaCartao.js';

const ROTULO_ESTADO = Object.freeze({ atinge: 'Chega lá', abaixo: 'Fica abaixo', acima: 'Fica acima' });

// fora do cartão: ele é refeito a cada atualização de dados
const estadoDoFormulario = { aberto: false };

// orientação curta de cada situação (a conta e o estado vêm do domínio)
const ORIENTACAO = Object.freeze({
  atinge: 'O plano atual chega dentro da meta.',
  abaixo: 'Falta carga: planeje mais treino (volume ou intensidade).',
  acima: 'Dá para treinar um pouco menos e ainda chegar lá.',
});

/** Frase que explica o resultado da meta de Condicionamento e o que fazer. */
export function textoDaAvaliacaoCondicionamento(a) {
  const data = formatarData(a.dataAlvo);
  if (a.estado === 'sem-dados') return `Ainda não dá para projetar o Condicionamento em ${data}: registre atividades e planeje treinos até lá.`;
  const projetado = formatarNumero(a.condicionamentoProjetado, 1);
  const alvo = formatarNumero(a.condicionamentoAlvo, 1);
  const pontos = formatarNumero(Math.abs(a.diferenca), 1);
  if (a.estado === 'atinge') return `Com o plano atual você chega em ${data} com Condicionamento ${projetado}, dentro da meta (${alvo}).`;
  if (a.estado === 'abaixo') return `Com o plano atual você chega em ${data} com Condicionamento ${projetado}, ${pontos} pontos abaixo da meta (${alvo}). Falta carga: planeje mais treino (volume ou intensidade) até essa data.`;
  return `Com o plano atual você chega em ${data} com Condicionamento ${projetado}, ${pontos} pontos acima da meta (${alvo}). Dá para treinar um pouco menos e ainda chegar lá.`;
}

/**
 * Cartão da meta principal do plano, a meta de Condicionamento: formulário, resultado, ritmo, progresso e metas anteriores.
 * @param {{
 *   uid: string, hoje: string, metaAtiva: any|null, metasAnteriores: any[], avaliacao: any|null,
 *   condicionamentoAtual: number|null
 * }} p
 */
export function criarCartaoMetaCondicionamento({ uid, hoje, metaAtiva, metasAnteriores, avaliacao, condicionamentoAtual }) {
  const alvo = campo({
    id: 'metacond-alvo',
    rotulo: 'Condicionamento desejado',
    inputmode: 'decimal',
    value: metaAtiva?.condicionamentoAlvo ?? '',
    dica: `${condicionamentoAtual === null ? '' : `Hoje: ${formatarNumero(condicionamentoAtual, 1)}. `}Subir até ${RITMO_MAXIMO_SEMANAL} pontos por semana é um ritmo sustentável.`,
  });
  const dataAlvo = campo({ id: 'metacond-data', rotulo: 'Na data', tipo: 'date', value: metaAtiva?.dataAlvo ?? '', min: hoje });
  const mensagem = areaMensagem();
  const aviso = areaMensagem(); // visível com o formulário fechado (ex.: erro ao remover)
  const botao = h('button', { class: 'btn', type: 'submit' }, metaAtiva ? 'Trocar a meta' : 'Definir meta');

  const form = h(
    'form',
    {
      class: 'prog-form',
      hidden: true,
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          await salvarMetaDeCondicionamento({
            uid,
            hoje,
            entrada: { condicionamentoAlvo: alvo.input.value, dataAlvo: dataAlvo.input.value },
            metasAtivas: metaAtiva ? [metaAtiva] : [],
            condicionamentoAtual,
          });
          definirAberto(false);
        });
      },
    },
    h('div', { class: 'grid' }, alvo.raiz, dataAlvo.raiz),
    mensagem.el,
    h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => definirAberto(false) }, 'Cancelar')),
  );

  const botaoAbrir = h('button', { type: 'button' });
  const definirAberto = ligarFormRecolhivel({ estado: estadoDoFormulario, botao: botaoAbrir, form, rotulo: metaAtiva ? 'Trocar meta' : '+ Definir meta', classeFechado: 'btn', icones: metaAtiva ? { fechado: 'lapis', aberto: 'fechar' } : null });
  const botaoRemover = metaAtiva
    ? h(
        'button',
        {
          class: 'btn-icone btn-icone-mini btn-icone-perigo',
          type: 'button',
          title: 'Remover meta',
          'aria-label': 'Remover meta',
          onClick: async () => {
            if (!(await confirmar({ titulo: 'Remover a meta de Condicionamento?', mensagem: 'A meta deixa de aparecer no plano.', confirmarTexto: 'Remover', tipo: 'perigo', icone: 'lixeira' }))) return;
            try {
              await excluirMetaCondicionamento(metaAtiva.id);
            } catch {
              aviso.mostrar('Não foi possível remover a meta.');
            }
          },
        },
        icone('lixeira', 16),
      )
    : null;

  const progresso = metaAtiva
    ? progressoDaMetaCondicionamento({ condicionamentoAtual, condicionamentoAlvo: metaAtiva.condicionamentoAlvo })
    : null;
  const pct = progresso === null ? null : Math.round(progresso * 100);

  const comDados = Boolean(metaAtiva && avaliacao && avaliacao.estado !== 'sem-dados');
  const um = (v) => formatarNumero(v, 1);
  const metricas = comDados
    ? [
        { rotulo: `Previsto em ${formatarData(avaliacao.dataAlvo).slice(0, 5)}`, valor: um(avaliacao.condicionamentoProjetado) },
        { rotulo: 'Meta', valor: um(avaliacao.condicionamentoAlvo) },
        { rotulo: 'Diferença', valor: comSinal(avaliacao.diferenca, um), sufixo: 'pts', destaque: true },
        avaliacao.ritmoNecessario === null ? null : { rotulo: 'Ritmo necessário', valor: comSinal(avaliacao.ritmoNecessario, um), sufixo: 'por semana' },
        avaliacao.ritmoDoPlano === null ? null : { rotulo: 'Ritmo do plano', valor: comSinal(avaliacao.ritmoDoPlano, um), sufixo: 'por semana' },
      ].filter(Boolean)
    : [];

  const agressiva = avaliacao?.agressiva
    ? h(
        'p',
        { class: 'mensagem mensagem-aviso meta-agressiva mc-aviso' },
        `Ritmo agressivo: subir mais de ${RITMO_MAXIMO_SEMANAL} pontos de Condicionamento por semana é difícil de sustentar e leva a Forma para a sobrecarga. Considere uma data mais distante ou um alvo menor.`,
      )
    : null;

  return montarCartaoDeMeta({
    id: 'meta-condicionamento',
    titulo: 'Meta de Condicionamento',
    estado: metaAtiva ? (avaliacao?.estado ?? 'sem-dados') : 'sem-dados',
    rotuloEstado: comDados ? ROTULO_ESTADO[avaliacao.estado] : null,
    acoes: [botaoAbrir, botaoRemover],
    introducao: metaAtiva ? null : 'A meta principal do plano: defina “chegar com Condicionamento X na data Y” e o app mostra se o plano atual chega lá e em que ritmo. O Condicionamento (a média de 42 dias do seu estresse) sobe com treino consistente.',
    metricas,
    progresso: pct === null ? null : { pct, atual: um(condicionamentoAtual), objetivo: um(metaAtiva.condicionamentoAlvo), rotulo: 'Progresso da meta de Condicionamento' },
    aviso: agressiva,
    orientacao: !metaAtiva ? null : comDados ? ORIENTACAO[avaliacao.estado] : avaliacao ? textoDaAvaliacaoCondicionamento(avaliacao) : null,
    dias: metaAtiva && avaliacao && avaliacao.dias >= 0 ? { dias: avaliacao.dias, dataAlvo: formatarData(avaliacao.dataAlvo) } : null,
    extras: [aviso.el, form],
    anteriores: metasAnteriores.map((m) => ({ valor: `Condicionamento ${um(m.condicionamentoAlvo)}`, data: formatarData(m.dataAlvo) })),
  });
}
