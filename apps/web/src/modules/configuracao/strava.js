import { stravaConectar, stravaDesconectar, stravaSituacao } from '../../core/functions.js';
import { iniciarConexaoStrava } from '../../core/stravaOauth.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { painelConectado } from './sincronizacao.js';

/**
 * Cartão "Strava": conectar pela página de autorização do Strava, ver o estado e sincronizar as atividades.
 * `retorno` é a volta do Strava (`{ codigo, escopo }` ou `{ erro }`), quando a página acabou de abrir depois da autorização.
 * `aoVoltar` (opcional) mostra o botão de escolher outra fonte; `aoDesconectar` avisa a tela que a conexão acabou.
 */
export function criarCartaoStrava({ retorno = null, aoVoltar = null, aoDesconectar = () => {} } = {}) {
  const corpo = h('div');
  const mensagem = areaMensagem();

  function desenharDesconectado() {
    const botao = h('button', { class: 'btn', type: 'button' }, 'Conectar ao Strava');
    botao.addEventListener('click', () => {
      mensagem.limpar();
      try {
        iniciarConexaoStrava();
      } catch (err) {
        mensagem.mostrar(err.message);
      }
    });
    corpo.replaceChildren(
      h(
        'p',
        { class: 'texto-secundario' },
        'Você será levado ao Strava para permitir a leitura das suas atividades (inclusive as privadas). O No Strova só lê: nunca publica nem altera nada na sua conta. Se você usa Garmin e já envia tudo ao Strava, pode conectar só o Strava.',
      ),
      h('div', { class: 'linha-botoes' }, botao, aoVoltar ? h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoVoltar }, 'Escolher outra fonte') : null),
    );
  }

  function desenharConectado(s) {
    const status = h(
      'p',
      { class: 'texto-secundario' },
      'Conectado ao Strava.',
      s.ultimaSincronizacao ? ` Última sincronização em ${formatarData(s.ultimaSincronizacao.slice(0, 10))}.` : ' Ainda não sincronizou.',
    );
    corpo.replaceChildren(
      ...painelConectado({
        fonte: 'strava',
        nome: 'Strava',
        status,
        ultimaSincronizacao: s.ultimaSincronizacao,
        mensagem,
        aoSincronizado: async () => desenhar(await stravaSituacao()),
        desconectar: stravaDesconectar,
        aoDesconectar,
        avisoAoDesconectar: 'O acesso do No Strova será encerrado no Strava e a conexão guardada aqui, apagada.',
      }),
    );
  }

  function desenhar(s) {
    if (s.conectado) desenharConectado(s);
    else desenharDesconectado();
  }

  async function concluirConexao() {
    corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Conectando ao Strava…'));
    try {
      desenhar(await stravaConectar({ codigo: retorno.codigo, escopo: retorno.escopo }));
      mensagem.mostrar('Strava conectado. Escolha o período e sincronize.', 'ok');
    } catch (err) {
      desenharDesconectado();
      mensagem.mostrar(err.message || 'Não foi possível conectar ao Strava.');
    }
  }

  corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
  if (retorno?.codigo) {
    concluirConexao();
  } else {
    stravaSituacao().then(
      (s) => {
        desenhar(s);
        if (retorno?.erro) mensagem.mostrar(retorno.erro);
      },
      () => {
        corpo.replaceChildren();
        mensagem.mostrar('Não foi possível carregar o estado da conexão com o Strava.');
      },
    );
  }

  const raiz = h(
    'section',
    { class: 'card' },
    h('h2', null, 'Strava'),
    h('p', { class: 'texto-secundario' }, 'Traga as atividades da sua conta Strava sem exportar arquivos. A sincronização é feita só quando você clica no botão. Esportes que não são corrida nem ciclismo entram como “outro”. Use uma fonte só (Garmin ou Strava) para não duplicar atividades.'),
    mensagem.el,
    corpo,
  );
  return { raiz };
}
