import { agruparTreinoECorpo, diasNaMetaDePassos, dividaDeSono, formatarSono, META_PASSOS_PADRAO, resumoDeBemEstar, validarMetaPassos } from '@no-strova/domain';
import { intervalsSincronizarBemEstar } from '../../core/functions.js';
import { observarPreferencias, salvarPreferencias } from '../../infrastructure/calibracaoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarNumero } from '../../utils/formatters.js';
import { abrirModal } from '../../utils/modal.js';
import { criarGraficoSaude } from './graficoSaude.js';

const DIAS_DA_META = 14;
const montar = (el, ...filhos) => el.replaceChildren(...filhos.filter((f) => f !== null && f !== undefined));

/** Um número da faixa de resumo: rótulo pequeno, valor e uma nota curta. */
const estatistica = (rotulo, valor, nota, tom = '') =>
  h('div', { class: `saude-stat${tom ? ` saude-tom-${tom}` : ''}` }, h('span', { class: 'saude-stat-rotulo' }, rotulo), h('strong', { class: 'saude-stat-valor' }, valor), h('span', { class: 'saude-stat-nota' }, nota));

/**
 * Seção "Sono, passos e treino": UM gráfico com os três no mesmo eixo de tempo (diário, semanal ou mensal conforme o período
 * da página) e uma faixa de três números. Os dados vêm do intervals.icu (Garmin, Huawei Health etc.); "Atualizar" pede uma
 * sincronização agora (a rotina diária faz o mesmo às 05:00). A meta diária de passos é editada numa janela.
 * `dados.bemEstar`/`bemEstarCarregou` e `dados.dias` (estresse diário) vêm da tela; chame `desenhar()` quando mudarem.
 * @returns {{ el: HTMLElement, fechar: () => void, desenhar: () => void, meta: () => number }}
 */
export function criarSecaoSonoPassosTreino({ sessao, hoje, dados, periodo, aoMudarMeta = null }) {
  let preferencias = null;
  let atualizando = false;
  let aviso = '';
  const el = h('section', { class: 'card' });

  const meta = () => validarMetaPassos(preferencias?.metaPassos) ?? META_PASSOS_PADRAO;

  async function sincronizar() {
    atualizando = true;
    aviso = '';
    desenhar();
    try {
      const r = await intervalsSincronizarBemEstar();
      aviso = r?.dias > 0 ? '' : 'O intervals.icu não trouxe passos nem sono dos últimos dias. Confira se o relógio sincroniza com ele.';
    } catch (erro) {
      aviso =
        erro?.code === 'functions/failed-precondition'
          ? 'Conecte o intervals.icu na Configuração para trazer passos e sono.'
          : erro?.code === 'functions/resource-exhausted'
            ? 'Passos e sono foram atualizados há pouco. Tente de novo em alguns minutos.'
            : 'Não foi possível atualizar agora. Tente de novo em instantes.';
    }
    atualizando = false;
    desenhar();
  }

  /** Meta diária de passos: salva em preferencias/{uid}; vale para as cores do gráfico e dos resumos. */
  function editarMeta() {
    return abrirModal({
      classe: 'modal-meta',
      rotulo: 'Meta diária de passos',
      conteudo: (fechar) => {
        const campoMeta = campo({ id: 'meta-passos', rotulo: 'Passos por dia', inputmode: 'numeric', value: formatarNumero(meta(), 0), autocomplete: 'off', dica: 'Entre 1.000 e 50.000. Dias com pelo menos essa meta ganham a cor forte no gráfico.' });
        const mensagem = areaMensagem();
        const salvar = h('button', { class: 'btn', type: 'submit' }, 'Salvar meta');
        const cancelar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Cancelar');
        const form = h(
          'form',
          { class: 'prog-form', novalidate: true },
          h('h2', null, 'Meta diária de passos'),
          h('div', { class: 'prog-form-grade' }, campoMeta.raiz),
          mensagem.el,
          h('div', { class: 'prog-rodape' }, h('span'), h('div', { class: 'linha-botoes' }, salvar, cancelar)),
        );
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          executarComBotao(salvar, mensagem, async () => {
            const valor = validarMetaPassos(campoMeta.input.value);
            if (valor === null) throw new Error('Informe uma meta entre 1.000 e 50.000 passos.');
            await salvarPreferencias(sessao.uid, { metaPassos: valor });
            fechar(true);
          });
        });
        setTimeout(() => campoMeta.input.select(), 0);
        return form;
      },
    });
  }

  function desenhar() {
    const m = meta();
    const dias = dados.bemEstar;
    const temBemEstar = dias.length > 0;
    const { grupos, granularidade } = agruparTreinoECorpo({ pesagens: [], bemEstar: dias, estresse: dados.dias }, hoje, { dias: periodo().dias });
    const grafico = criarGraficoSaude({ grupos, granularidade, metaPassos: m });

    const r = resumoDeBemEstar(dias, hoje);
    const divida = dividaDeSono(dias, hoje);
    const naMeta = diasNaMetaDePassos(dias, hoje, DIAS_DA_META, m);
    const tomSono = r.mediaSono7S === null ? '' : r.mediaSono7S >= 7 * 3600 ? 'ok' : r.mediaSono7S >= 6 * 3600 ? 'atencao' : 'alerta';
    const tomDivida = divida.noites === 0 ? '' : divida.segundos === 0 ? 'ok' : divida.segundos >= 5 * 3600 ? 'alerta' : 'atencao';

    montar(
      el,
      h(
        'div',
        { class: 'bloco-topo' },
        h('h2', { class: 'titulo-bloco' }, 'Sono, passos e treino'),
        h(
          'div',
          { class: 'bloco-acoes' },
          h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', title: 'Alterar a meta diária de passos', onClick: editarMeta }, `Meta: ${formatarNumero(m, 0)} passos`),
          h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', disabled: atualizando, onClick: sincronizar }, atualizando ? 'Atualizando…' : 'Atualizar dados'),
        ),
      ),
      aviso ? h('p', { class: 'texto-secundario', role: 'status' }, aviso) : null,
      temBemEstar
        ? h(
            'div',
            { class: 'saude-stats' },
            estatistica('Sono · média de 7 noites', r.mediaSono7S === null ? '—' : formatarSono(r.mediaSono7S), 'ideal: 7 a 9 h por noite', tomSono),
            estatistica('Dívida de sono · 7 dias', divida.noites === 0 ? '—' : divida.segundos === 0 ? '0 min' : formatarSono(divida.segundos), divida.noites === 0 ? 'sem noites registradas' : `o que faltou para 7 h em ${divida.noites} noite${divida.noites > 1 ? 's' : ''}`, tomDivida),
            estatistica(`Meta de passos · ${DIAS_DA_META} dias`, naMeta.comRegistro === 0 ? '—' : `${naMeta.atingiu} de ${naMeta.comRegistro} dias`, `meta de ${formatarNumero(m, 0)} passos por dia`),
          )
        : null,
      grafico ?? estadoVazio(dados.bemEstarCarregou ? 'Sem sono, passos ou treinos neste período. Conecte o intervals.icu na Configuração e use "Atualizar dados" (funciona com Garmin e Huawei Health).' : 'Carregando…'),
      grafico
        ? h(
            'p',
            { class: 'peso-legenda texto-secundario' },
            h('span', { class: 'gps-leg gps-leg-sono' }, 'Sono ideal'),
            h('span', { class: 'gps-leg gps-leg-curto' }, 'Sono curto (6 a 7 h)'),
            h('span', { class: 'gps-leg gps-leg-muito-curto' }, 'Menos de 6 h'),
            h('span', { class: 'gps-leg gps-leg-passos' }, 'Passos (cor forte = meta atingida)'),
            h('span', { class: 'gps-leg gps-leg-carga' }, 'Carga de treino'),
            granularidade === 'dia' ? h('span', { class: 'gps-leg gps-leg-media' }, 'Média de 7 dias') : null,
          )
        : null,
    );
  }

  desenhar();
  const cancelar = observarPreferencias(
    sessao.uid,
    (p) => {
      const mudou = meta() !== (validarMetaPassos(p?.metaPassos) ?? META_PASSOS_PADRAO);
      preferencias = p;
      if (mudou) {
        desenhar();
        aoMudarMeta?.();
      }
    },
    () => {},
  );
  return { el, fechar: cancelar, desenhar, meta };
}
