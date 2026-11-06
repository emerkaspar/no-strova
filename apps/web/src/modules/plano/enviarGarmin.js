import { inicioDaSemana, primeiroDoMes, somarDias, somarMeses } from '@no-strova/domain';
import { intervalsDesconectar, intervalsEnviarTreinos, intervalsLthr, intervalsSituacao } from '../../core/functions.js';
import { areaMensagem, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { confirmar } from '../../utils/modal.js';
import { confirmarEAtualizarLthr, detalheDoLthrDiferente, esportesComLthrDiferente } from '../configuracao/lthrIntervals.js';
import { criarCampoDaChave, criarGuiaIntervals } from './conexaoIntervals.js';

const PERIODOS = [
  { valor: 'proximos7', rotulo: 'Próximos 7 dias' },
  { valor: 'proximos14', rotulo: 'Próximos 14 dias' },
  { valor: 'semana', rotulo: 'Semana mostrada no calendário' },
  { valor: 'mes', rotulo: 'Mês mostrado no calendário' },
];

/** Intervalo yyyy-mm-dd (inclusive) de cada opção do seletor. */
function intervaloDe(periodo, { hoje, ancora }) {
  if (periodo === 'proximos14') return { de: hoje, ate: somarDias(hoje, 13) };
  if (periodo === 'semana') {
    const inicio = inicioDaSemana(ancora);
    return { de: inicio, ate: somarDias(inicio, 6) };
  }
  if (periodo === 'mes') {
    const inicio = primeiroDoMes(ancora);
    return { de: inicio, ate: somarDias(somarMeses(inicio, 1), -1) };
  }
  return { de: hoje, ate: somarDias(hoje, 6) };
}

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

/** Resumo do envio, em frases curtas. */
export function resumirEnvio(r) {
  const partes = [];
  if (r.enviados > 0) partes.push(`${plural(r.enviados, 'treino enviado', 'treinos enviados')} ao intervals.icu`);
  if (r.atualizados > 0) partes.push(plural(r.atualizados, 'treino alterado foi atualizado', 'treinos alterados foram atualizados'));
  if (r.jaEnviados > 0) partes.push(`${plural(r.jaEnviados, 'já estava', 'já estavam')} lá, sem mudanças`);
  if (r.falhas > 0) partes.push(plural(r.falhas, 'treino não pôde ser enviado', 'treinos não puderam ser enviados'));
  if (r.semPassos > 0) partes.push(`${plural(r.semPassos, 'treino ficou de fora', 'treinos ficaram de fora')} por não ter passos nem duração`);
  return `${partes.join(' · ')}.`;
}

/**
 * Painel "Enviar para o Garmin". O Garmin bloqueia o login vindo de servidores, então o envio passa pelo intervals.icu: o
 * usuário conecta o Garmin lá uma vez, cola aqui a chave de API do intervals.icu, e o sistema cria os treinos no calendário
 * dele; o intervals.icu repassa a próxima semana ao Garmin Connect.
 * @param {{ hoje: string, obterAncora: () => string, aoFechar: () => void, aoConectar?: () => void }} p
 */
export function criarPainelEnviarGarmin({ hoje, obterAncora, aoFechar, aoConectar = () => {} }) {
  const corpo = h('div', { class: 'pilha' });
  const mensagem = areaMensagem();

  const cabecalho = [
    h('p', { class: 'cg-mini-rotulo' }, 'Enviar para o Garmin'),
    h('p', null, 'Cria os treinos planejados do período no seu calendário do intervals.icu, que os coloca no Garmin Connect com a faixa de FC de cada passo. Depois é só sincronizar o relógio pelo app do Garmin Connect.'),
  ];

  // ---- ainda não conectado: configurar o intervals.icu e colar a chave ----
  function desenharConexao() {
    const form = criarCampoDaChave({
      mensagem,
      aoConectado: async () => {
        aoConectar();
        await carregar();
      },
      botoesExtras: [h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoFechar }, 'Fechar')],
    });
    corpo.replaceChildren(h('p', null, h('strong', null, 'Configuração (uma vez só):')), criarGuiaIntervals(), form);
  }

  // ---- conectado: escolher o período e enviar ----
  function desenharEnvio(situacao) {
    const periodo = selecao({ id: 'int-periodo', rotulo: 'Período', opcoes: PERIODOS, valor: 'proximos7' });
    const botao = h('button', { class: 'btn', type: 'submit' }, 'Enviar para o Garmin');
    const resultado = h('div', { 'aria-live': 'polite' });
    // conferência do LTHR: só leitura; falhas aqui não atrapalham o envio
    const lthrArea = h('div', { 'aria-live': 'polite' });

    function desenharLthr(s) {
      const diferentes = esportesComLthrDiferente(s);
      if (!Number.isFinite(s?.nostrova) || !(Number.isFinite(s.ciclismo) || Number.isFinite(s.corrida))) {
        lthrArea.replaceChildren();
        return;
      }
      if (diferentes.length === 0) {
        lthrArea.replaceChildren(h('p', { class: 'texto-secundario' }, `LTHR igual nos dois: ${s.nostrova} bpm.`));
        return;
      }
      const msg = areaMensagem();
      const botaoAtualizar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Atualizar no intervals.icu');
      const detalhe = detalheDoLthrDiferente(s);
      botaoAtualizar.addEventListener('click', () =>
        executarComBotao(botaoAtualizar, msg, async () => {
          const novo = await confirmarEAtualizarLthr(s);
          if (novo) desenharLthr(novo);
        }),
      );
      lthrArea.replaceChildren(
        h('p', { class: 'mensagem mensagem-aviso' }, `O LTHR do intervals.icu (${detalhe}) é diferente do No Strova (${s.nostrova} bpm). As faixas de FC dos treinos só batem se forem iguais.`),
        h('div', { class: 'linha-botoes' }, botaoAtualizar),
        msg.el,
      );
    }

    // falha na conferência não atrapalha o envio, mas o motivo aparece (discreto) para dar para investigar
    intervalsLthr()
      .then(desenharLthr)
      .catch((err) => lthrArea.replaceChildren(h('p', { class: 'texto-secundario' }, `Não consegui conferir o LTHR no intervals.icu: ${err?.message || 'erro desconhecido'}`)));

    async function desconectar() {
      const ok = await confirmar({
        titulo: 'Desconectar o intervals.icu?',
        mensagem: 'A chave guardada será apagada. Os treinos já enviados continuam no intervals.icu e no Garmin.',
        confirmarTexto: 'Desconectar',
        tipo: 'aviso',
        icone: 'lixeira',
      });
      if (!ok) return;
      try {
        await intervalsDesconectar();
        await carregar();
      } catch (err) {
        mensagem.mostrar(err.message || 'Não foi possível desconectar.');
      }
    }

    const form = h(
      'form',
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          resultado.replaceChildren();
          const { de, ate } = intervaloDe(periodo.select.value, { hoje, ancora: obterAncora() });
          executarComBotao(
            botao,
            mensagem,
            async () => {
              const r = await intervalsEnviarTreinos({ de, ate });
              // replaceChildren() escreve "null" na tela se receber null: os itens opcionais saem pelo filter
              resultado.replaceChildren(
                ...[
                  h('p', { class: `mensagem ${r.falhas > 0 ? 'mensagem-aviso' : 'mensagem-ok'}` }, resumirEnvio(r)),
                  r.problemas.length > 0 ? h('ul', null, ...r.problemas.map((p) => h('li', null, `${formatarData(p.data)} · ${p.nome}: ${p.motivo}`))) : null,
                  r.lthr ? h('p', { class: 'texto-secundario' }, `As faixas de FC vão em % do LTHR. Confira no intervals.icu (Settings, na configuração do esporte) se o LTHR é ${r.lthr} bpm, o mesmo do No Strova.`) : null,
                  r.enviados + r.atualizados > 0
                    ? h('p', null, h('strong', null, 'Agora abra o app Garmin Connect no celular e sincronize o relógio.'), ' O intervals.icu envia ao Garmin os treinos da próxima semana; os mais distantes sobem quando chegarem a esse prazo.')
                    : null,
                ].filter(Boolean),
              );
            },
            'Enviando…',
          );
        },
      },
      h('div', { class: 'grid' }, periodo.raiz),
      h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoFechar }, 'Fechar')),
    );
    corpo.replaceChildren(
      h(
        'p',
        { class: 'texto-secundario' },
        `Conectado ao intervals.icu${situacao.atleta ? ` como ${situacao.atleta}` : ''}. `,
        h('button', { class: 'btn-link', type: 'button', onClick: desconectar }, 'Desconectar'),
      ),
      lthrArea,
      form,
      resultado,
    );
  }

  async function carregar() {
    mensagem.limpar();
    corpo.replaceChildren(h('p', { class: 'texto-secundario', role: 'status' }, 'Carregando…'));
    try {
      const situacao = await intervalsSituacao();
      if (situacao.conectado) desenharEnvio(situacao);
      else desenharConexao();
    } catch (err) {
      corpo.replaceChildren();
      mensagem.mostrar(err.message || 'Não foi possível carregar a situação do intervals.icu.');
    }
  }
  carregar();

  return h('div', { class: 'exportar-garmin' }, ...cabecalho, corpo, mensagem.el);
}
