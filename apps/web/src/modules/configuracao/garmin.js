import { garminConectar, garminDesconectar, garminSituacao } from '../../core/functions.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { painelConectado, plural } from './sincronizacao.js';

const VALIDADES = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '180 dias' },
  { valor: '365', rotulo: '1 ano' },
];

/**
 * Cartão "Garmin Connect": colar a chave pessoal, ver o estado e sincronizar as atividades.
 * `aoVoltar` (opcional) mostra o botão de escolher outra fonte; `aoDesconectar` avisa a tela que a conexão acabou.
 */
export function criarCartaoGarmin({ aoVoltar = null, aoDesconectar = () => {} } = {}) {
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
      h(
        'div',
        { class: 'linha-botoes' },
        botao,
        aoVoltar ? h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoVoltar }, 'Escolher outra fonte') : null,
      ),
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
    corpo.replaceChildren(
      ...painelConectado({
        fonte: 'garmin',
        nome: 'Garmin',
        status,
        ultimaSincronizacao: s.ultimaSincronizacao,
        mensagem,
        aoSincronizado: async () => desenhar(await garminSituacao()),
        desconectar: garminDesconectar,
        aoDesconectar,
        avisoAoDesconectar: 'A chave guardada será apagada.',
      }),
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
    h('p', { class: 'texto-secundario' }, 'Traga as atividades da sua conta Garmin sem exportar arquivos. A sincronização é feita só quando você clica no botão. Esportes que não são corrida nem ciclismo entram como “outro”. Use uma fonte só (Garmin ou Strava) para não duplicar atividades.'),
    mensagem.el,
    corpo,
  );
  return { raiz };
}
