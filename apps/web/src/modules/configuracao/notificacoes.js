import { GRUPOS_NOTIFICACAO, LIMITES_INTERVALO, normalizarPreferenciasNotificacao, TIPOS_NOTIFICACAO } from '@no-strova/domain';
import { lerPreferencias, salvarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { secaoRecolhivel } from './secaoRecolhivel.js';

const INTERVALOS = [
  { campo: 'intervaloPesoDias', rotulo: 'Lembrar de pesar a cada (dias)' },
  { campo: 'intervaloMedidasDias', rotulo: 'Lembrar de refazer as medidas a cada (dias)' },
  { campo: 'intervaloLthrSemanas', rotulo: 'Lembrar de refazer o teste de LTHR a cada (semanas)' },
];

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
    const grupos = Object.entries(GRUPOS_NOTIFICACAO).map(([grupo, rotuloGrupo]) => {
      const tipos = Object.entries(TIPOS_NOTIFICACAO).filter(([, def]) => def.grupo === grupo && (!def.soAdmin || admin));
      if (tipos.length === 0) return null;
      return h(
        'fieldset',
        { class: 'notif-grupo' },
        h('legend', null, rotuloGrupo),
        ...tipos.map(([tipo, def]) => {
          const input = h('input', { type: 'checkbox', id: `notif-${tipo}`, checked: atual.tipos[tipo] });
          checks[tipo] = input;
          return h('label', { class: 'notif-opcao', for: `notif-${tipo}` }, input, def.rotulo);
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
            // tipos que o usuário não vê (ex.: avisos de admin) mantêm o valor salvo
            notificacoes.tipos = { ...atual.tipos, ...notificacoes.tipos };
            await salvarPreferencias(uid, { notificacoes });
            mensagem.mostrar('Preferências de notificação salvas.', 'ok');
          });
        },
      },
      h('p', { class: 'texto-secundario' }, 'Escolha quais avisos receber. Cada aviso fica na central de Notificações até você marcá-lo como lido.'),
      ...grupos,
      h('div', { class: 'notif-intervalos' }, ...INTERVALOS.map((i) => campos[i.campo].raiz)),
      botao,
    );
    corpo.replaceChildren(form);
  }

  return { raiz };
}
