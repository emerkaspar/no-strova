import { garminConectar, garminDesconectar, garminSincronizar, garminSituacao } from '../../core/functions.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';

const VALIDADES = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '180 dias' },
  { valor: '365', rotulo: '1 ano' },
];
const PERIODOS = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '60', rotulo: 'Últimos 60 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 6 meses' },
];

function plural(n, singular, pluralTexto) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** Nada novo: nenhuma importada e nada que mereça aviso (sem FC ou falha). Os "já existiam" não interessam nesse caso. */
export function semNovidades(t) {
  return t.importadas === 0 && t.semFc === 0 && t.falhas === 0;
}

export function resumo(t, vazio = 'Nenhuma atividade foi encontrada no período.') {
  if (semNovidades(t)) return vazio;
  const partes = [];
  if (t.importadas > 0) {
    partes.push(plural(t.importadas, 'atividade importada', 'atividades importadas'));
    if (t.jaExistiam > 0) partes.push(`${t.jaExistiam} já existiam`);
  }
  if (t.semFc > 0) partes.push(`${plural(t.semFc, 'ficou de fora por não ter', 'ficaram de fora por não terem')} frequência cardíaca`);
  if (t.falhas > 0) partes.push(`${plural(t.falhas, 'não pôde ser lida', 'não puderam ser lidas')}`);
  return `${partes.join(' · ')}.${detalhesDosProblemas(t.problemas)}`;
}

const MAXIMO_DE_PROBLEMAS_LISTADOS = 5;

/** Quais atividades ficaram de fora e por quê ("Corrida em 04/11/2026: não tem frequência cardíaca"). */
function detalhesDosProblemas(problemas = []) {
  if (problemas.length === 0) return '';
  const lista = problemas.slice(0, MAXIMO_DE_PROBLEMAS_LISTADOS).map((p) => `${p.atividade}: ${p.motivo}`);
  const resto = problemas.length - lista.length;
  return ` Ficaram de fora → ${lista.join('; ')}${resto > 0 ? `; e mais ${resto}` : ''}.`;
}

/** Mensagem final de uma sincronização (resumo + aviso do limite por rodada). `vazio` é o texto de quando nada foi encontrado. */
export function resumoSincronizacao(total, limitado, vazio) {
  return `${resumo(total, vazio)}${limitado ? ' Foi atingido o limite de 200 atividades; sincronize de novo para continuar.' : ''}`;
}

/**
 * Sincroniza as atividades do Garmin, rodada a rodada, até terminar. `dias` omitido traz só o que é novo desde a última vez.
 * `aoProgresso` recebe os totais parciais a cada rodada. Lança Error em português (o servidor valida a conexão).
 */
export async function sincronizarGarmin({ dias, aoProgresso } = {}) {
  const total = { importadas: 0, novasIds: [], jaExistiam: 0, semFc: 0, falhas: 0, problemas: [] };
  let inicio = 0;
  let limitado = false;
  for (;;) {
    aoProgresso?.(total);
    const r = await garminSincronizar({ dias, inicio });
    for (const k of ['importadas', 'jaExistiam', 'semFc', 'falhas']) total[k] += r[k];
    total.novasIds.push(...(r.novasIds ?? []));
    total.problemas.push(...(r.problemas ?? []));
    inicio = r.proximo;
    limitado = r.limitado;
    if (r.terminou) break;
  }
  return { total, limitado };
}

/** Cartão "Garmin Connect": colar a chave pessoal, ver o estado e sincronizar as atividades. */
export function criarCartaoGarmin() {
  const corpo = h('div');
  const mensagem = areaMensagem();

  function desenharDesconectado() {
    const chave = campo({
      id: 'garmin-chave',
      rotulo: 'Chave pessoal (Personal API)',
      tipo: 'password',
      autocomplete: 'off',
      spellcheck: false,
      placeholder: 'Cole aqui a chave copiada do Garmin Connect',
      dica: 'O Garmin mostra a chave uma única vez. Ela fica guardada criptografada no servidor e nunca é exibida de novo.',
    });
    const validade = selecao({
      id: 'garmin-validade',
      rotulo: 'Validade que você escolheu ao criar a chave',
      valor: '365',
      opcoes: VALIDADES,
      dica: 'Serve para avisar antes de a chave expirar.',
    });
    const botao = h('button', { class: 'btn', type: 'submit' }, 'Conectar');
    const form = h(
      'form',
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          executarComBotao(
            botao,
            mensagem,
            async () => {
              const valor = chave.input.value.trim();
              if (!valor) throw new Error('Cole a chave pessoal do Garmin.');
              const situacao = await garminConectar({ chave: valor, validadeDias: Number(validade.select.value) });
              chave.input.value = '';
              desenhar(situacao);
              mensagem.mostrar('Garmin conectado. Escolha o período e sincronize.', 'ok');
            },
            'Validando…',
          );
        },
      },
      h('div', { class: 'grid' }, chave.raiz, validade.raiz),
      botao,
    );
    corpo.replaceChildren(
      h(
        'ol',
        { class: 'texto-secundario' },
        h('li', null, 'No Garmin Connect, abra Configurações e a página “Personal API Key”.'),
        h('li', null, 'Aceite os termos, escolha a validade e crie a chave.'),
        h('li', null, 'Copie a chave e cole no campo abaixo.'),
      ),
      form,
    );
  }

  function desenharConectado(s) {
    const aviso = s.diasParaExpirar !== null && s.diasParaExpirar <= 7;
    const status = h(
      'p',
      { class: 'texto-secundario' },
      s.diasParaExpirar !== null && s.diasParaExpirar <= 0
        ? 'A chave expirou. Gere outra no Garmin Connect e conecte de novo.'
        : `Conectado${s.expiraEm ? ` · a chave expira em ${formatarData(s.expiraEm.slice(0, 10))}${aviso ? ` (faltam ${plural(s.diasParaExpirar, 'dia', 'dias')})` : ''}` : ''}.`,
      s.ultimaSincronizacao ? ` Última sincronização em ${formatarData(s.ultimaSincronizacao.slice(0, 10))}.` : ' Ainda não sincronizou.',
    );
    const opcoes = s.ultimaSincronizacao ? [{ valor: '', rotulo: 'Só o que é novo desde a última vez' }, ...PERIODOS] : PERIODOS;
    const periodo = selecao({ id: 'garmin-periodo', rotulo: 'Período', valor: s.ultimaSincronizacao ? '' : '30', opcoes });
    const progresso = h('p', { class: 'texto-secundario', role: 'status' });
    const botao = h('button', { class: 'btn', type: 'button' }, 'Sincronizar agora');
    botao.addEventListener('click', () => {
      executarComBotao(
        botao,
        mensagem,
        async () => {
          const dias = periodo.select.value === '' ? undefined : Number(periodo.select.value);
          const { total, limitado } = await sincronizarGarmin({
            dias,
            aoProgresso: (t) => {
              progresso.textContent = `Sincronizando… ${plural(t.importadas, 'atividade importada', 'atividades importadas')}`;
            },
          }).finally(() => {
            progresso.textContent = '';
          });
          mensagem.mostrar(resumoSincronizacao(total, limitado), 'ok');
          desenhar(await garminSituacao());
        },
        'Sincronizando…',
      );
    });
    const desconectar = h('button', { class: 'btn btn-perigo', type: 'button' }, 'Desconectar');
    desconectar.addEventListener('click', () => {
      if (!confirm('Desconectar o Garmin? A chave guardada será apagada. As atividades já importadas continuam no app.')) return;
      executarComBotao(desconectar, mensagem, async () => {
        await garminDesconectar();
        mensagem.limpar();
        desenhar({ conectado: false });
      });
    });
    corpo.replaceChildren(
      status,
      h('div', { class: 'grid' }, periodo.raiz),
      progresso,
      h('div', { class: 'linha-botoes' }, botao, desconectar),
    );
  }

  function desenhar(s) {
    if (s.conectado) desenharConectado(s);
    else desenharDesconectado();
  }

  corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
  garminSituacao().then(desenhar, () => {
    corpo.replaceChildren();
    mensagem.mostrar('Não foi possível carregar o estado da conexão com o Garmin.');
  });

  const raiz = h(
    'section',
    { class: 'card' },
    h('h2', null, 'Garmin Connect'),
    h('p', { class: 'texto-secundario' }, 'Traga as atividades da sua conta Garmin sem exportar arquivos. A sincronização é feita só quando você clica no botão. Esportes que não são corrida nem ciclismo entram como “outro”.'),
    mensagem.el,
    corpo,
  );
  return { raiz };
}
