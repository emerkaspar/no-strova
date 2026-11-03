import { excluirAtividade, obterUrlArquivo } from '../../core/functions.js';
import { lerAtividade, lerSerieFc } from '../../infrastructure/atividadesRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDataHora, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { graficoLinha } from '../../utils/graficoLinha.js';
import { ROTULO_ESPORTE, ROTULO_ORIGEM_CALORIAS, ROTULO_ORIGEM_HRSS, TEXTO_ALERTA } from './textos.js';

function indicador(rotulo, valor, nota) {
  return h('div', { class: 'indicador' }, h('span', { class: 'indicador-rotulo' }, rotulo), h('strong', null, valor), nota ? h('small', { class: 'dica' }, nota) : null);
}

export function render(raiz, sessao, { id }) {
  let ativa = true;
  const mensagem = areaMensagem();
  raiz.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  async function carregar() {
    try {
      const [a, serie] = await Promise.all([lerAtividade(id), lerSerieFc(id)]);
      if (!ativa) return;
      if (!a || a.userId !== sessao.uid) {
        raiz.replaceChildren(
          h('section', { class: 'card' }, h('h1', null, 'Atividade não encontrada'), h('a', { href: '#/atividades' }, '← Voltar às atividades')),
        );
        return;
      }
      desenhar(a, serie);
    } catch {
      if (ativa) raiz.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'mensagem mensagem-erro' }, 'Não foi possível carregar a atividade.'), h('a', { href: '#/atividades' }, '← Voltar')));
    }
  }

  function desenhar(a, serie) {
    const baixar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Baixar arquivo original');
    baixar.addEventListener('click', async () => {
      baixar.disabled = true;
      mensagem.limpar();
      try {
        const { url } = await obterUrlArquivo({ atividadeId: id });
        window.open(url, '_blank', 'noopener');
      } catch (err) {
        mensagem.mostrar(err.message);
      } finally {
        baixar.disabled = false;
      }
    });

    const excluir = h('button', { class: 'btn btn-perigo', type: 'button' }, 'Excluir atividade');
    excluir.addEventListener('click', async () => {
      if (!confirm('Excluir esta atividade? O arquivo original também será apagado. Isso não pode ser desfeito.')) return;
      excluir.disabled = true;
      mensagem.limpar();
      try {
        await excluirAtividade({ atividadeId: id });
        window.location.hash = '#/atividades';
      } catch (err) {
        mensagem.mostrar(err.message);
        excluir.disabled = false;
      }
    });

    const hrssTexto = a.hrss === null || a.hrss === undefined ? '—' : formatarNumero(a.hrss, 1);
    const caloriasNota = a.caloriasOrigem ? ROTULO_ORIGEM_CALORIAS[a.caloriasOrigem] : null;
    const grafico =
      serie?.fc?.length > 1
        ? graficoLinha(
            { x: serie.t, y: serie.fc },
            { rotuloY: 'bpm', formatarX: (s) => `${Math.round(s / 60)} min`, formatarY: (v) => String(Math.round(v)) },
          )
        : null;

    raiz.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('p', null, h('a', { href: '#/atividades' }, '← Atividades')),
        h('h1', null, `${ROTULO_ESPORTE[a.esporte] ?? a.esporte} · ${formatarData(a.data)}`),
        h(
          'p',
          { class: 'texto-secundario' },
          `${a.origem === 'arquivo' ? `Importada de arquivo .${a.extensao}` : 'Registrada manualmente'} · início ${formatarDataHora(a.inicio?.toMillis?.())}`,
        ),
        ...(a.alertas ?? []).map((alerta) => h('p', { class: 'mensagem' }, TEXTO_ALERTA[alerta] ?? alerta)),
        h(
          'div',
          { class: 'grid indicadores' },
          indicador('HRSS', hrssTexto, a.hrssOrigem ? ROTULO_ORIGEM_HRSS[a.hrssOrigem] : null),
          indicador('Duração', formatarDuracao(a.duracaoS)),
          indicador('Em movimento', formatarDuracao(a.tempoMovimentoS)),
          indicador('Distância', formatarDistancia(a.distanciaM)),
          indicador('Subida', a.altimetriaM === null || a.altimetriaM === undefined ? '—' : `${formatarNumero(a.altimetriaM)} m`),
          indicador('FC média', a.fcMedia ? `${a.fcMedia} bpm` : '—', a.zona ? `Zona informada: ${a.zona}` : null),
          indicador('FC máxima', a.fcMax ? `${a.fcMax} bpm` : '—'),
          indicador('Calorias', a.calorias ? `${formatarNumero(a.calorias)} kcal` : '—', caloriasNota),
        ),
        grafico ? h('div', null, h('h2', null, 'Frequência cardíaca'), grafico) : null,
        mensagem.el,
        h('div', { class: 'linha-botoes' }, a.arquivoPath ? baixar : null, excluir),
      ),
    );
  }

  carregar();
  return () => {
    ativa = false;
  };
}
