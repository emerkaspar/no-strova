import { situacaoDoPerfilDeTreino } from '@no-strova/domain';
import { carregarDadosDoWizard, concluirOnboarding, pularOnboarding } from '../../application/onboarding.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { logo } from '../../utils/marca.js';
import { criarPassos, estadoInicial } from './passos.js';

let aberto = false;

/** True enquanto o wizard está na tela (a faixa do Início e o menu não abrem um segundo). */
export function wizardAberto() {
  return aberto;
}

/**
 * Abre o wizard de perfil em tela cheia. No primeiro acesso (`primeiraVez`) começa pelas boas-vindas; pelo menu da conta
 * começa em "Você", já preenchido com o que está salvo. Cada passo grava ao continuar, então sair não perde o que já foi feito.
 * Com `passoInicial` (id de um passo, ex.: 'semana'), abre direto nele.
 * @param {{ sessao: any, primeiraVez?: boolean, passoInicial?: string|null, aoFechar?: () => void }} p
 */
export function abrirWizard({ sessao, primeiraVez = false, passoInicial = null, aoFechar = () => {} }) {
  if (aberto) return;
  aberto = true;

  const app = document.getElementById('app');
  const focoAnterior = document.activeElement;
  const palco = h('div', { class: 'wz-palco' });
  const progresso = h('ol', { class: 'wz-progresso', 'aria-label': 'Progresso' });
  const textoPasso = h('p', { class: 'wz-contador' });
  const botaoFechar = h('button', { class: 'btn-link wz-fechar', type: 'button' }, primeiraVez ? 'Preencher depois' : 'Fechar');
  const raiz = h(
    'div',
    { class: 'wizard', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wz-titulo' },
    h('header', { class: 'wz-topo' }, h('div', { class: 'wz-marca' }, logo()), textoPasso, botaoFechar),
    progresso,
    palco,
  );

  let concluido = false;
  let dados = null;

  function fechar() {
    if (!aberto) return;
    aberto = false;
    document.removeEventListener('keydown', aoTeclar);
    document.documentElement.classList.remove('wz-travado');
    raiz.remove();
    if (app) app.inert = false;
    focoAnterior?.focus?.();
    aoFechar();
  }

  async function sair() {
    // Fechar sem concluir lembra pela faixa do Início (só quando o perfil ainda está pendente).
    if (!concluido && dados && situacaoDoPerfilDeTreino({ preferencias: dados.preferencias, configs: dados.configs }) !== 'ok') {
      await pularOnboarding(sessao.uid, dados.preferencias).catch(() => {});
    }
    fechar();
  }

  function aoTeclar(e) {
    if (e.key === 'Escape') sair();
  }

  botaoFechar.addEventListener('click', sair);
  document.addEventListener('keydown', aoTeclar);
  document.documentElement.classList.add('wz-travado');
  if (app) app.inert = true;
  document.body.append(raiz);
  palco.replaceChildren(h('p', { class: 'wz-carregando', role: 'status' }, 'Carregando o que você já preencheu…'));

  carregarDadosDoWizard(sessao.uid).then((carregados) => {
    if (!aberto) return;
    dados = carregados;
    iniciar();
  });

  function iniciar() {
    const estado = estadoInicial(sessao, dados);
    let indice = 0;
    let passos = [];
    let anterior = -1;

    const irParaId = (id) => {
      const i = passos.findIndex((p) => p.id === id);
      if (i >= 0) mostrar(i);
    };
    // Perfil já preenchido aberto pelo menu: mostra o resumo e só entra nos passos pelo "Editar".
    const revisao = !primeiraVez && situacaoDoPerfilDeTreino({ preferencias: dados.preferencias, configs: dados.configs }) === 'ok';
    const concluir = async () => {
      if (revisao) {
        fechar();
        return;
      }
      await concluirOnboarding(sessao.uid);
      concluido = true;
      fechar();
      window.location.hash = '#/inicio';
    };
    passos = criarPassos({ uid: sessao.uid, sessao, dados, estado, irPara: irParaId, concluir, revisao });
    if (!primeiraVez) passos = passos.filter((p) => p.id !== 'inicio');

    // O progresso conta os passos de dados (as boas-vindas ficam de fora).
    const passosDeDados = passos.filter((p) => p.id !== 'inicio');
    progresso.replaceChildren(
      ...passosDeDados.map((p) => h('li', { class: 'wz-etapa', 'aria-label': p.rotulo }, h('span', { class: 'wz-etapa-barra' }), h('span', { class: 'wz-etapa-nome' }, p.rotulo))),
    );

    const iResumo = passos.length - 1;

    function mostrar(i) {
      const direcao = i >= anterior ? 'vai' : 'volta';
      anterior = i;
      indice = i;
      const passo = passos[i];
      const pos = passosDeDados.indexOf(passo);
      const noResumo = revisao && i === iResumo;
      progresso.hidden = noResumo;
      textoPasso.textContent = noResumo ? 'Perfil de treino' : revisao ? 'Editando' : pos < 0 ? 'Boas-vindas' : `Passo ${pos + 1} de ${passosDeDados.length}`;
      [...progresso.children].forEach((li, n) => {
        li.classList.toggle('feito', n < pos);
        li.classList.toggle('atual', n === pos);
        if (n === pos) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
      });

      const mensagem = areaMensagem();
      const botaoVoltar = h(
        'button',
        { class: 'btn btn-secundario wz-voltar', type: 'button', hidden: revisao ? noResumo : i === 0, onClick: () => mostrar(revisao ? iResumo : i - 1) },
        revisao ? 'Cancelar' : 'Voltar',
      );
      const botaoContinuar = h('button', { class: 'btn wz-continuar', type: 'submit' }, passo.textoContinuar ?? (revisao ? 'Salvar' : 'Continuar'));
      const titulo = h('h1', { id: 'wz-titulo', class: 'wz-titulo', tabindex: '-1' }, passo.titulo);
      const form = h(
        'form',
        {
          class: `wz-passo wz-${direcao}`,
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            executarComBotao(
              botaoContinuar,
              mensagem,
              async () => {
                await passo.continuar?.();
                if (passo.id !== 'pronto') mostrar(revisao ? iResumo : i + 1);
              },
              'Salvando...',
            );
          },
        },
        h('div', { class: 'wz-cabeca' }, h('span', { class: 'wz-numero', 'aria-hidden': 'true' }, pos < 0 ? '' : String(pos + 1).padStart(2, '0')), h('p', { class: 'wz-eyebrow' }, passo.eyebrow), titulo, h('p', { class: 'wz-sub' }, passo.subtitulo)),
        passo.raiz,
        mensagem.el,
        h('div', { class: 'wz-rodape' }, botaoVoltar, botaoContinuar),
      );
      palco.replaceChildren(form);
      passo.entrar?.();
      palco.scrollTop = 0;
      (passo.foco ?? titulo).focus({ preventScroll: true });
    }

    mostrar(revisao ? iResumo : indice);
    if (passoInicial) irParaId(passoInicial);
  }
}
