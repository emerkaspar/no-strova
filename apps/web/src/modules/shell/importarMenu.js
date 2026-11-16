import { RECURSOS, temRecurso } from '@no-strova/domain';
import { obterSessao } from '../../application/sessao.js';
import { garminSituacao, intervalsSituacao } from '../../core/functions.js';
import { avisoDispensavel } from '../../utils/avisoDispensavel.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { abrirFeedbackPorId } from '../atividades/feedbackModal.js';
import { pedirImportacao } from '../atividades/state.js';
import { resumoSincronizacao, semNovidades, sincronizarGarmin } from '../configuracao/garmin.js';
import { resumoDoIntervals, sincronizarIntervals } from '../configuracao/intervalsAtividades.js';

/**
 * Menu "Importar atividades": enviar arquivo, sincronizar com o intervals.icu e sincronizar com o Garmin. Mesmo componente
 * no desktop (popover à direita do botão da barra lateral) e no celular (bottom sheet, aberto pelo botão do cabeçalho). O
 * resultado das sincronizações aparece num aviso flutuante, porque o menu pode ser aberto de qualquer tela.
 */
export function criarMenuImportar() {
  const aviso = avisoDispensavel();
  const avisoEl = h('div', { class: 'importar-aviso' }, aviso.el);

  const fundo = h('div', { class: 'importar-fundo', hidden: true });
  const opcao = (nomeIcone, titulo, subtitulo, aoClicar) =>
    h(
      'button',
      { class: 'importar-opcao', type: 'button', role: 'menuitem', onClick: aoClicar },
      h('span', { class: 'importar-opcao-icone' }, icone(nomeIcone, 18)),
      h('span', { class: 'importar-opcao-texto' }, h('strong', null, titulo), h('small', null, subtitulo)),
    );

  const opcaoArquivo = opcao('arquivoEnviar', 'Enviar arquivo', 'Arquivos .fit, .gpx ou .tcx', () => {
    fechar(false);
    pedirImportacao();
  });
  const opcaoIntervals = opcao('graficoLinha', 'Sincronizar com Intervals.icu', 'Importar atividades da sua conta', () => {
    fechar(false);
    sincronizar({
      nome: 'intervals.icu',
      situacao: intervalsSituacao,
      executar: sincronizarIntervals,
      resumo: (total, limitado) => resumoDoIntervals(total, limitado),
      tipo: (total) => (semNovidades(total) && !total.semArquivo ? 'info' : 'ok'),
    });
  });
  // o Garmin só aparece para quem tem o recurso liberado pelo administrador (como no resto do app)
  const opcaoGarmin = opcao('relogio', 'Sincronizar com Garmin', 'Importar do Garmin Connect', () => {
    fechar(false);
    sincronizar({
      nome: 'Garmin',
      situacao: garminSituacao,
      executar: sincronizarGarmin,
      resumo: (total, limitado, primeira) => resumoSincronizacao(total, limitado, primeira ? 'Nos últimos 30 dias, nenhuma atividade foi encontrada.' : 'Desde a última sincronização, nenhuma atividade foi encontrada.'),
      tipo: (total) => (semNovidades(total) ? 'info' : 'ok'),
    });
  });

  const el = h(
    'div',
    { class: 'importar-menu', role: 'menu', 'aria-label': 'Importar atividades', hidden: true },
    h('p', { class: 'importar-titulo' }, 'IMPORTAR ATIVIDADES'),
    opcaoArquivo,
    opcaoIntervals,
    opcaoGarmin,
  );

  /** Sincroniza sem sair da tela; o aviso mostra o andamento e o resultado. */
  async function sincronizar({ nome, situacao, executar, resumo, tipo }) {
    aviso.limpar();
    try {
      const estado = await situacao();
      if (!estado.conectado) {
        aviso.mostrar(`O ${nome} não está conectado. Conecte em Configuração para trazer suas atividades.`, 'info');
        return;
      }
      if (estado.status === 'chaveInvalida') {
        aviso.mostrar(`O ${nome} recusou a sua chave e as atividades pararam de chegar. Gere a chave de novo e reconecte em Configuração.`);
        return;
      }
      aviso.mostrar(`Sincronizando com o ${nome}…`, 'carregando');
      const primeira = !estado.ultimaSincronizacao;
      const { total, limitado } = await executar({ dias: primeira ? 30 : undefined });
      aviso.mostrar(resumo(total, limitado, primeira), tipo(total));
      // uma única atividade nova: já pergunta como foi (com várias, ficam com o selo "Como foi?" na lista)
      if (total.importadas === 1 && total.novasIds.length === 1) abrirFeedbackPorId(total.novasIds[0], { primeiraVez: true }).catch(() => {});
    } catch (err) {
      aviso.mostrar(err.message || `Não foi possível sincronizar com o ${nome}.`);
    }
  }

  let ancora = null;

  const itens = () => [...el.querySelectorAll('.importar-opcao:not([hidden])')];
  const aoTecla = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      fechar(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const lista = itens();
      const i = lista.indexOf(document.activeElement);
      lista[(i + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length]?.focus();
    } else if (e.key === 'Tab') {
      fechar(false);
    }
  };
  const aoClicarFora = (e) => {
    if (el.contains(e.target) || ancora?.contains(e.target)) return;
    fechar(false);
  };

  /** Posiciona à direita do botão (desktop); no celular o CSS usa a folha de baixo e ignora estas variáveis. */
  function posicionar() {
    if (!ancora) return;
    const r = ancora.getBoundingClientRect();
    const altura = el.offsetHeight;
    const topo = Math.max(8, Math.min(r.top, window.innerHeight - altura - 8));
    el.style.setProperty('--importar-x', `${Math.round(r.right + 12)}px`);
    el.style.setProperty('--importar-y', `${Math.round(topo)}px`);
  }

  function abrir(botao) {
    if (!el.hidden) return fechar(false);
    ancora = botao;
    opcaoGarmin.hidden = !temRecurso(obterSessao().perfil, RECURSOS.GARMIN);
    el.hidden = false;
    fundo.hidden = false;
    posicionar();
    ancora?.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', aoClicarFora, true);
    document.addEventListener('keydown', aoTecla);
    window.addEventListener('resize', posicionar);
    itens()[0]?.focus();
  }

  function fechar(devolverFoco) {
    if (el.hidden) return;
    el.hidden = true;
    fundo.hidden = true;
    ancora?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', aoClicarFora, true);
    document.removeEventListener('keydown', aoTecla);
    window.removeEventListener('resize', posicionar);
    if (devolverFoco) ancora?.focus();
  }

  return { el, fundo, avisoEl, abrir, fechar };
}
