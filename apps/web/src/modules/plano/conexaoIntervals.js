import { intervalsConectar } from '../../core/functions.js';
import { campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';

const LINK = (texto, href) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, texto);

/**
 * Passo a passo para ligar o Garmin ao No Strova pelo intervals.icu. O Garmin bloqueia o login vindo de servidores, então os
 * treinos passam por um site gratuito (intervals.icu) que tem integração oficial com o Garmin Connect.
 * @param {{ comCampo?: boolean }} [p] `comCampo`: o último passo manda colar a chave "abaixo" (quando há o campo logo depois)
 */
export function criarGuiaIntervals({ comCampo = true } = {}) {
  return h(
    'ol',
    { class: 'guia-intervals' },
    h('li', null, 'Crie uma conta gratuita em ', LINK('intervals.icu', 'https://intervals.icu'), '.'),
    h('li', null, 'No intervals.icu, abra ', h('strong', null, 'Settings'), ', conecte o Garmin e marque ', h('strong', null, 'Upload planned workouts'), '.'),
    h('li', null, 'Ainda em Settings, em ', h('strong', null, 'Developer Settings'), ', gere e copie a ', h('strong', null, 'API Key'), '.'),
    h('li', null, comCampo ? 'Cole a chave abaixo. Ela fica guardada com criptografia e só serve para criar treinos no seu calendário.' : 'Depois de liberado, cole a chave no passo Garmin do Perfil de treino (ou em Plano → Enviar para o Garmin). Ela fica guardada com criptografia.'),
  );
}

/**
 * Passo a passo do intervals.icu como conector oficial de atividades (independente do Garmin): cria a conta, liga o aparelho ao
 * intervals.icu e copia a chave de API. Usado no cadastro (wizard) e no cartão de Configuração.
 */
export function criarGuiaConector() {
  return h(
    'ol',
    { class: 'guia-intervals' },
    h('li', null, 'Crie uma conta gratuita em ', LINK('intervals.icu', 'https://intervals.icu'), '.'),
    h(
      'li',
      null,
      'Ligue o seu aparelho ao intervals.icu. ',
      h('strong', null, 'IGPSPORT:'),
      ' no app da IGPSPORT (celular), abra ',
      h('strong', null, 'Meu → Vincular com outros aplicativos'),
      ' e autorize o intervals.icu; só os pedais feitos depois de vincular são enviados. ',
      h('strong', null, 'Garmin, Wahoo, Coros, Zwift e outros:'),
      ' no intervals.icu, em ',
      h('strong', null, 'Settings → Connections'),
      '.',
    ),
    h('li', null, 'Ainda em Settings, em ', h('strong', null, 'Developer Settings'), ', gere e copie a ', h('strong', null, 'API Key'), '.'),
    h('li', null, 'Cole a chave abaixo. Ela fica guardada com criptografia e só serve para ler as suas atividades e criar treinos no seu calendário.'),
  );
}

/**
 * Campo da chave de API + botão Conectar. No painel do Plano é um formulário de verdade; no wizard (que já é um formulário,
 * e formulário dentro de formulário faria o Enter avançar o passo) é uma caixa comum e o Enter só conecta.
 * @param {{
 *   mensagem: { mostrar: Function, limpar: Function },
 *   aoConectado: () => void|Promise<void>,
 *   idCampo?: string,
 *   comoFormulario?: boolean,
 *   botoesExtras?: HTMLElement[]
 * }} p
 */
export function criarCampoDaChave({ mensagem, aoConectado, idCampo = 'int-chave', comoFormulario = true, botoesExtras = [] }) {
  const chave = campo({ id: idCampo, rotulo: 'Chave de API do intervals.icu', tipo: 'password', autocomplete: 'off' });
  const botao = h('button', { class: 'btn', type: comoFormulario ? 'submit' : 'button' }, 'Conectar');
  const conectar = () =>
    executarComBotao(botao, mensagem, async () => {
      await intervalsConectar({ chave: chave.input.value });
      chave.input.value = '';
      await aoConectado();
    });
  const linhaDeBotoes = h('div', { class: 'linha-botoes' }, botao, ...botoesExtras);

  if (comoFormulario) {
    return h(
      'form',
      {
        novalidate: true,
        autocomplete: 'off',
        onSubmit: (e) => {
          e.preventDefault();
          conectar();
        },
      },
      chave.raiz,
      linhaDeBotoes,
    );
  }
  botao.addEventListener('click', conectar);
  chave.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    conectar();
  });
  return h('div', { class: 'conexao-intervals' }, chave.raiz, linhaDeBotoes);
}
