import { VERSAO_DO_DETALHE, VERSAO_DOS_ESFORCOS } from '@no-strova/domain';
import { calcularMelhoresEsforcos, excluirAtividade, obterUrlArquivo } from '../../core/functions.js';
import { lerAtividade, lerSerieDetalhe, lerSerieFc } from '../../infrastructure/atividadesRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarDataHora, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { graficoAtividade } from '../../utils/graficoAtividade.js';
import { mapaTrajeto } from '../../utils/mapaTrajeto.js';
import { ritmoTexto, tempoDeEsforco } from './esforcos.js';
import { ROTULO_ESPORTE, ROTULO_ORIGEM_CALORIAS, ROTULO_ORIGEM_HRSS, TEXTO_ALERTA } from './textos.js';

/** Indicador no estilo dos recordes: ícone, rótulo, valor grande e nota no rodapé. */
function indicador(rotulo, valor, nota, nomeIcone = 'atividades') {
  return h(
    'article',
    { class: 'ativ-recorde' },
    h('div', { class: 'ativ-recorde-topo' }, h('span', { class: 'ativ-recorde-icone' }, icone(nomeIcone, 18)), h('span', { class: 'ativ-recorde-rotulo' }, rotulo)),
    h('strong', { class: 'ativ-recorde-valor' }, valor),
    nota ? h('div', { class: 'ativ-recorde-rodape' }, h('span', { class: 'ativ-recorde-quando' }, nota)) : null,
  );
}

/** Média móvel centrada que ignora lacunas: tira o serrilhado da velocidade sem mudar o formato da curva. */
function suavizar(valores, raio = 2) {
  return valores.map((_, i) => {
    let soma = 0;
    let n = 0;
    for (let j = Math.max(0, i - raio); j <= Math.min(valores.length - 1, i + raio); j++) {
      if (Number.isFinite(valores[j])) {
        soma += valores[j];
        n += 1;
      }
    }
    return n > 0 ? soma / n : null;
  });
}

const ritmoDoEixo = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Monta o gráfico a partir da série detalhada (ou, nas atividades antigas, só da FC). Null se não há o que mostrar. */
function montarGrafico(a, detalhe, serieFc, aoPassar) {
  if (detalhe?.t?.length > 1) {
    const emKm = Array.isArray(detalhe.dist);
    const x = emKm ? detalhe.dist : detalhe.t.map((s) => s / 60);
    const series = [];
    if (detalhe.alt) series.push({ id: 'alt', rotulo: 'Elevação', unidade: 'm', valores: detalhe.alt, lado: 'e', area: true, formatar: (v) => String(Math.round(v)) });
    if (detalhe.fc) series.push({ id: 'fc', rotulo: 'Frequência cardíaca', unidade: 'bpm', valores: detalhe.fc, lado: 'e', formatar: (v) => String(Math.round(v)) });
    if (detalhe.vel) {
      const suave = suavizar(detalhe.vel);
      if (a.esporte === 'corrida') {
        const ritmo = suave.map((kmh) => (Number.isFinite(kmh) && kmh >= 2 ? Math.min(3600 / kmh, 900) : null));
        series.push({ id: 'vel', rotulo: 'Ritmo', unidade: '/km', valores: ritmo, lado: 'd', inverter: true, passos: [10, 15, 20, 30, 60, 120], formatar: ritmoDoEixo });
      } else {
        series.push({ id: 'vel', rotulo: 'Velocidade', unidade: 'km/h', valores: suave, lado: 'd', formatar: (v) => formatarNumero(v, 1) });
      }
    }
    if (series.length === 0) return null;
    return graficoAtividade({
      x,
      rotuloX: (i) => `${emKm ? `${formatarNumero(detalhe.dist[i] ?? 0, 2)} km · ` : ''}${formatarDuracao(detalhe.t[i])}`,
      formatarEixoX: (v) => (emKm ? `${formatarNumero(v, v < 10 && v % 1 ? 1 : 0)} km` : `${Math.round(v)} min`),
      series,
      aoPassar,
    });
  }
  if (serieFc?.fc?.length > 1) {
    return graficoAtividade({
      x: serieFc.t.map((s) => s / 60),
      rotuloX: (i) => formatarDuracao(serieFc.t[i]),
      formatarEixoX: (v) => `${Math.round(v)} min`,
      series: [{ id: 'fc', rotulo: 'Frequência cardíaca', unidade: 'bpm', valores: serieFc.fc, lado: 'e', formatar: (v) => String(Math.round(v)) }],
      aoPassar,
    });
  }
  return null;
}

/** Melhor 5 km e 10 km: só para atividades que chegam à distância. `calculando` mostra o aviso enquanto o servidor relê o arquivo. */
function indicadoresDeEsforco(a, calculando) {
  return [
    ['Melhor 5 km', 5000, a.melhor5kS],
    ['Melhor 10 km', 10000, a.melhor10kS],
  ]
    .filter(([, metros]) => a.distanciaM >= metros)
    .map(([rotulo, metros, tempo]) => {
      if (Number.isFinite(tempo) && tempo > 0) return indicador(rotulo, tempoDeEsforco(tempo), ritmoTexto(a.esporte, tempo, metros), 'duracao');
      return indicador(rotulo, calculando ? 'Calculando…' : '—', calculando ? 'Lendo o arquivo da atividade' : 'Sem dados de distância no arquivo', 'duracao');
    });
}

export function render(raiz, sessao, { id }) {
  let ativa = true;
  let limparVisuais = () => {};
  const mensagem = areaMensagem();
  raiz.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  async function carregar() {
    try {
      const [a, serie, detalhe] = await Promise.all([lerAtividade(id), lerSerieFc(id), lerSerieDetalhe(id)]);
      if (!ativa) return;
      if (!a || a.userId !== sessao.uid) {
        raiz.replaceChildren(
          h('section', { class: 'card' }, h('h1', null, 'Atividade não encontrada'), h('a', { href: '#/atividades' }, '← Voltar às atividades')),
        );
        return;
      }
      const faltaEsforcos = a.origem === 'arquivo' && a.melhoresEsforcosEm !== VERSAO_DOS_ESFORCOS && a.distanciaM >= 5000;
      const faltaDetalhe = a.origem === 'arquivo' && !!a.arquivoPath && a.detalheEm !== VERSAO_DO_DETALHE;
      desenhar(a, serie, detalhe, { calculando: faltaEsforcos, carregandoDetalhe: faltaDetalhe });
      if (faltaEsforcos || faltaDetalhe) {
        // atividade importada antes desses recursos: o servidor relê o arquivo e a tela é redesenhada com os dados novos
        try {
          await calcularMelhoresEsforcos({ atividadeId: id });
          const [atualizada, novoDetalhe] = await Promise.all([lerAtividade(id), lerSerieDetalhe(id)]);
          if (ativa && atualizada) desenhar(atualizada, serie, novoDetalhe, {});
        } catch {
          if (ativa) desenhar(a, serie, detalhe, {});
        }
      }
    } catch {
      if (ativa) raiz.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'mensagem mensagem-erro' }, 'Não foi possível carregar a atividade.'), h('a', { href: '#/atividades' }, '← Voltar')));
    }
  }

  function desenhar(a, serie, detalhe, { calculando = false, carregandoDetalhe = false } = {}) {
    limparVisuais();
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
    const mapa = detalhe?.lat && detalhe?.lon ? mapaTrajeto(detalhe.lat, detalhe.lon) : null;
    const grafico = montarGrafico(a, detalhe, serie, (i) => mapa?.destacar(i));
    limparVisuais = () => {
      grafico?.destruir();
      mapa?.destruir();
    };
    const indicadores = h(
      'div',
      { class: 'ativ-recordes-grade ativ-indicadores' },
      indicador('HRSS', hrssTexto, a.hrssOrigem ? ROTULO_ORIGEM_HRSS[a.hrssOrigem] : null, 'hrss'),
      indicador('Duração', formatarDuracao(a.duracaoS), null, 'duracao'),
      indicador('Em movimento', formatarDuracao(a.tempoMovimentoS), null, 'duracao'),
      indicador('Distância', formatarDistancia(a.distanciaM), null, 'distancia'),
      indicador('Subida', a.altimetriaM === null || a.altimetriaM === undefined ? '—' : `${formatarNumero(a.altimetriaM)} m`, null, 'elevacao'),
      indicador('FC média', a.fcMedia ? `${a.fcMedia} bpm` : '—', a.zona ? `Zona informada: ${a.zona}` : null, 'fc'),
      indicador('FC máxima', a.fcMax ? `${a.fcMax} bpm` : '—', null, 'fc'),
      indicador('Calorias', a.calorias ? `${formatarNumero(a.calorias)} kcal` : '—', caloriasNota, 'atividades'),
      ...indicadoresDeEsforco(a, calculando),
    );

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
        h('div', { class: mapa ? 'ativ-detalhe-topo' : 'ativ-detalhe-topo ativ-detalhe-topo-sem-mapa' }, mapa ? mapa.el : null, indicadores),
        carregandoDetalhe && !grafico ? h('p', { class: 'texto-secundario', role: 'status' }, 'Gerando o gráfico e o mapa a partir do arquivo da atividade…') : null,
        grafico ? h('div', { class: 'ativ-grafico' }, h('h2', null, 'Desempenho'), grafico.el) : null,
        mensagem.el,
        h('div', { class: 'linha-botoes' }, a.arquivoPath ? baixar : null, excluir),
      ),
    );
  }

  carregar();
  return () => {
    ativa = false;
    limparVisuais();
  };
}
