import { GRUPOS_NOTIFICACAO, LIMITES_INTERVALO, normalizarPreferenciasNotificacao, TIPOS_NOTIFICACAO } from '@no-strova/domain';
import { ativarPush, desativarPush, situacaoDoPush } from '../../application/push.js';
import { lerPreferencias, salvarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { secaoRecolhivel } from './secaoRecolhivel.js';

const INTERVALOS = [
  { campo: 'intervaloPesoDias', rotulo: 'Lembrar de pesar a cada (dias)' },
  { campo: 'intervaloMedidasDias', rotulo: 'Lembrar de refazer as medidas a cada (dias)' },
  { campo: 'intervaloLthrSemanas', rotulo: 'Lembrar de refazer o teste de LTHR a cada (semanas)' },
];

/** Texto de situação do push neste aparelho. */
function textoDoPush({ suportado, permissao, ativo }) {
  if (!suportado) return 'Este navegador não suporta push. No Android, use o Chrome; no iPhone, instale o app na Tela de Início.';
  if (permissao === 'denied') return 'Bloqueado: libere as notificações nas configurações do navegador (cadeado ao lado do endereço).';
  return ativo ? 'Ativo neste aparelho.' : 'Desligado neste aparelho.';
}

/** "Push neste aparelho": liga e desliga o recebimento no navegador atual (a escolha por tipo fica abaixo). */
function criarBlocoDoAparelho(uid, mensagem) {
  const texto = h('p', { class: 'texto-secundario' }, 'Verificando…');
  const botao = h('button', { class: 'btn btn-secundario', type: 'button', hidden: true });
  let situacao = null;

  async function atualizar() {
    situacao = await situacaoDoPush(uid);
    texto.textContent = textoDoPush(situacao);
    botao.hidden = !situacao.suportado || situacao.permissao === 'denied';
    botao.textContent = situacao.ativo ? 'Desativar neste aparelho' : 'Ativar neste aparelho';
  }

  botao.addEventListener('click', () => {
    executarComBotao(botao, mensagem, async () => {
      if (situacao?.ativo) await desativarPush(uid);
      else await ativarPush(uid);
      await atualizar();
      mensagem.mostrar(situacao.ativo ? 'Push ativado neste aparelho.' : 'Push desativado neste aparelho.', 'ok');
    }).then(atualizar);
  });
  atualizar();

  return h('div', { class: 'notif-aparelho' }, h('h3', null, 'Push neste aparelho'), texto, botao);
}

/**
 * Cartão "Notificações": liga e desliga cada tipo de aviso e ajusta de quanto em quanto tempo o app lembra de pesar,
 * refazer as medidas e o teste de LTHR. Salva em `preferencias/{uid}.notificacoes`.
 * @param {{ uid: string, admin?: boolean }} p
 */
export function criarCartaoNotificacoes({ uid, admin = false }) {
  const mensagem = areaMensagem();
  const corpo = h('div', { class: 'notif-prefs' }, h('p', { class: 'texto-secundario' }, 'Carregando…'));
  const raiz = secaoRecolhivel({ id: 'notificacoes', titulo: 'Notificações', corpo: [corpo, mensagem.el] });

  lerPreferencias(uid)
    .then((prefs) => desenhar(normalizarPreferenciasNotificacao(prefs?.notificacoes)))
    .catch(() => corpo.replaceChildren(h('p', { class: 'mensagem mensagem-erro' }, 'Não foi possível carregar as preferências de notificação.')));

  function desenhar(atual) {
    const checks = {};
    const checksPush = {};
    const grupos = Object.entries(GRUPOS_NOTIFICACAO).map(([grupo, rotuloGrupo]) => {
      const tipos = Object.entries(TIPOS_NOTIFICACAO).filter(([, def]) => def.grupo === grupo && (!def.soAdmin || admin));
      if (tipos.length === 0) return null;
      return h(
        'fieldset',
        { class: 'notif-grupo' },
        h('legend', null, rotuloGrupo),
        ...tipos.map(([tipo, def]) => {
          const input = h('input', { type: 'checkbox', id: `notif-${tipo}`, checked: atual.tipos[tipo] });
          const push = h('input', { type: 'checkbox', id: `notif-push-${tipo}`, checked: atual.tiposPush[tipo], disabled: !atual.tipos[tipo] });
          // sem o aviso na central não há push: desligar o tipo trava o push dele
          input.addEventListener('change', () => {
            push.disabled = !input.checked;
          });
          checks[tipo] = input;
          checksPush[tipo] = push;
          return h(
            'div',
            { class: 'notif-linha' },
            h('label', { class: 'notif-opcao', for: `notif-${tipo}` }, input, def.rotulo),
            h('label', { class: 'notif-push', for: `notif-push-${tipo}` }, push, 'Push'),
          );
        }),
      );
    });

    const campos = Object.fromEntries(
      INTERVALOS.map((i) => [
        i.campo,
        campo({ id: `notif-${i.campo}`, rotulo: i.rotulo, tipo: 'number', inputmode: 'numeric', min: LIMITES_INTERVALO[i.campo].min, max: LIMITES_INTERVALO[i.campo].max, step: 1, value: String(atual[i.campo]) }),
      ]),
    );

    const botao = h('button', { class: 'btn', type: 'submit' }, 'Salvar notificações');
    const form = h(
      'form',
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          executarComBotao(botao, mensagem, async () => {
            const notificacoes = { tipos: Object.fromEntries(Object.entries(checks).map(([t, el]) => [t, el.checked])) };
            for (const { campo: nome, rotulo } of INTERVALOS) {
              const { min, max } = LIMITES_INTERVALO[nome];
              const n = Number(campos[nome].input.value);
              if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${rotulo}: informe um número inteiro de ${min} a ${max}.`);
              notificacoes[nome] = n;
            }
            notificacoes.tiposPush = Object.fromEntries(Object.entries(checksPush).map(([t, el]) => [t, el.checked]));
            // tipos que o usuário não vê (ex.: avisos de admin) mantêm o valor salvo
            notificacoes.tipos = { ...atual.tipos, ...notificacoes.tipos };
            notificacoes.tiposPush = { ...atual.tiposPush, ...notificacoes.tiposPush };
            await salvarPreferencias(uid, { notificacoes });
            mensagem.mostrar('Preferências de notificação salvas.', 'ok');
          });
        },
      },
      h('p', { class: 'texto-secundario' }, 'Escolha quais avisos receber. Cada aviso fica na central de Notificações até você marcá-lo como lido. A caixa "Push" faz o aviso chegar também como notificação do celular (depois de ativar o push neste aparelho).'),
      criarBlocoDoAparelho(uid, mensagem),
      ...grupos,
      h('div', { class: 'notif-intervalos' }, ...INTERVALOS.map((i) => campos[i.campo].raiz)),
      botao,
    );
    corpo.replaceChildren(form);
  }

  return { raiz };
}
