import { compararPassagens, ROTULOS_DAS_ZONAS } from '@no-strova/domain';
import { carregarDetalhes } from '../../../application/trajetos.js';
import { h } from '../../../utils/dom.js';
import { formatarData, formatarDuracaoCurta, formatarNumero } from '../../../utils/formatters.js';
import { graficoSobreposto, suavizar } from './graficos.js';
import { mapaDeCamadas } from './mapa.js';
import { kmTexto, textoDeDesempenho, textoDeDiferenca, textoDeDiferencaDeTempo, textoDeVariacao } from './textos.js';

const cssVar = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

/**
 * Comparação lado a lado de duas passagens do trajeto: diferenças nas métricas e nas zonas, e, lendo as séries sob demanda,
 * parciais por km, gráficos sobrepostos e mapa. A passagem mais antiga é a A.
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function criarComparacao({ a, b, esporte, rota, aoLimpar }) {
  const destrutores = [];
  let ativa = true;
  const corrida = esporte === 'corrida';
  const dif = compararPassagens(a, b);

  // melhor = 'maior' | 'menor' | null (sem juízo de valor, como a distância)
  const linha = (rotulo, va, vb, texto, melhor, delta) => {
    const bom = melhor && Number.isFinite(delta) && delta !== 0 ? (melhor === 'maior' ? delta > 0 : delta < 0) : null;
    return h(
      'tr',
      null,
      h('th', { scope: 'row' }, rotulo),
      h('td', null, va),
      h('td', null, vb),
      h('td', { class: bom === null ? '' : bom ? 'traj-melhor' : 'traj-pior' }, texto),
    );
  };
  const tabelaMetricas = h(
    'tbody',
    null,
    linha(corrida ? 'Ritmo' : 'Velocidade', textoDeDesempenho(a, esporte), textoDeDesempenho(b, esporte), corrida ? `${textoDeDiferencaDeTempo(dif.ritmoSKm)} /km` : textoDeDiferenca(dif.velocidadeKmh, 1, ' km/h'), corrida ? 'menor' : 'maior', corrida ? dif.ritmoSKm : dif.velocidadeKmh),
    linha('Tempo', formatarDuracaoCurta(a.tempoS), formatarDuracaoCurta(b.tempoS), textoDeDiferencaDeTempo(dif.tempoS), null, dif.tempoS),
    linha('Distância', kmTexto(a.distanciaM), kmTexto(b.distanciaM), textoDeDiferenca(dif.distanciaM === null ? null : dif.distanciaM / 1000, 2, ' km'), null, dif.distanciaM),
    linha('FC média', a.fcMedia === null ? '—' : `${a.fcMedia} bpm`, b.fcMedia === null ? '—' : `${b.fcMedia} bpm`, textoDeDiferenca(dif.fcMedia, 0, ' bpm'), 'menor', dif.fcMedia),
    linha('FC máxima', a.fcMax === null ? '—' : `${a.fcMax} bpm`, b.fcMax === null ? '—' : `${b.fcMax} bpm`, textoDeDiferenca(dif.fcMax, 0, ' bpm'), null, dif.fcMax),
    linha('Eficiência', a.eficiencia === null ? '—' : formatarNumero(a.eficiencia, 2), b.eficiencia === null ? '—' : formatarNumero(b.eficiencia, 2), textoDeVariacao(dif.eficienciaPct), 'maior', dif.eficienciaPct),
    linha('Altimetria', a.altimetriaM === null ? '—' : `${a.altimetriaM} m`, b.altimetriaM === null ? '—' : `${b.altimetriaM} m`, textoDeDiferenca(dif.altimetriaM, 0, ' m'), null, dif.altimetriaM),
    linha('HRSS (atividade)', a.hrss === null ? '—' : formatarNumero(a.hrss, 0), b.hrss === null ? '—' : formatarNumero(b.hrss, 0), textoDeDiferenca(dif.hrss, 0), null, dif.hrss),
  );
  if (dif.zonasS) {
    ROTULOS_DAS_ZONAS.forEach((z, i) => {
      tabelaMetricas.append(linha(`Tempo em ${z}`, formatarDuracaoCurta(a.tempoZonasS[i]), formatarDuracaoCurta(b.tempoZonasS[i]), textoDeDiferencaDeTempo(dif.zonasS[i]), null, dif.zonasS[i]));
    });
  }

  const cabecalho = h(
    'div',
    { class: 'bloco-topo' },
    h('h2', null, 'Comparação'),
    h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoLimpar }, 'Limpar seleção'),
  );
  const legenda = h(
    'p',
    { class: 'traj-legenda' },
    h('span', { class: 'traj-chip traj-chip-a' }, `A · ${formatarData(a.data)}${a.totalVoltas > 1 ? ` (volta ${a.volta})` : ''}`),
    h('span', { class: 'traj-chip traj-chip-b' }, `B · ${formatarData(b.data)}${b.totalVoltas > 1 ? ` (volta ${b.volta})` : ''}`),
    h('span', { class: 'texto-secundario' }, 'A diferença é B menos A. Verde melhora, vermelho piora.'),
  );
  const tabela = h(
    'div',
    { class: 'tabela-wrap' },
    h('table', { class: 'tabela traj-tabela-comparacao' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Métrica'), h('th', { scope: 'col' }, 'A'), h('th', { scope: 'col' }, 'B'), h('th', { scope: 'col' }, 'Diferença'))), tabelaMetricas),
  );

  const detalhes = h('div', { class: 'pilha' }, h('p', { class: 'vazio-curto', role: 'status' }, 'Carregando parciais, gráficos e mapa…'));

  function desenharDetalhes(mapaDetalhes) {
    const da = mapaDetalhes.get(a.id);
    const db = mapaDetalhes.get(b.id);
    if (!da?.perfil && !db?.perfil) {
      detalhes.replaceChildren(h('p', { class: 'vazio-curto' }, 'Estas passagens não têm série detalhada (atividade manual ou sem arquivo), então não há parciais, gráficos nem mapa.'));
      return;
    }
    const secoes = [];

    // parciais por km
    const pa = da?.parciais ?? [];
    const pb = db?.parciais ?? [];
    if (pa.length || pb.length) {
      const total = Math.max(pa.length, pb.length);
      const celula = (p) => (p ? (corrida ? `${formatarDuracaoCurta(p.tempoS / (p.distanciaM / 1000))} /km` : `${formatarNumero(p.velocidadeKmh, 1)} km/h`) : '—');
      const fc = (p) => (p?.fcMedia ? ` · ${p.fcMedia} bpm` : '');
      const linhas = [];
      for (let k = 0; k < total; k++) {
        const x = pa[k];
        const y = pb[k];
        const d = x && y ? (corrida ? y.tempoS / (y.distanciaM / 1000) - x.tempoS / (x.distanciaM / 1000) : y.velocidadeKmh - x.velocidadeKmh) : null;
        const bom = d === null || d === 0 ? null : corrida ? d < 0 : d > 0;
        linhas.push(
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, `${k + 1}${(x ?? y).distanciaM < 950 ? ' (parcial)' : ''}`),
            h('td', null, celula(x), h('small', { class: 'texto-secundario' }, fc(x))),
            h('td', null, celula(y), h('small', { class: 'texto-secundario' }, fc(y))),
            h('td', { class: bom === null ? '' : bom ? 'traj-melhor' : 'traj-pior' }, d === null ? '—' : corrida ? `${textoDeDiferencaDeTempo(d)} /km` : textoDeDiferenca(d, 1, ' km/h')),
          ),
        );
      }
      secoes.push(
        h(
          'section',
          null,
          h('h3', null, 'Parciais por km'),
          h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Km'), h('th', { scope: 'col' }, 'A'), h('th', { scope: 'col' }, 'B'), h('th', { scope: 'col' }, 'Diferença'))), h('tbody', null, ...linhas))),
        ),
      );
    }

    // gráficos sobrepostos
    const velocidade = (p) => p?.vel ?? null;
    const ritmo = (p) => velocidade(p)?.map((v) => (Number.isFinite(v) && v > 1 ? 3600 / v : null)) ?? null;
    const serie = (perfil, campo) => (perfil && perfil.dKm && campo(perfil) ? { x: perfil.dKm, y: suavizar(campo(perfil)) } : null);
    const montar = (rotuloY, campo, opcoes) => {
      const sa = serie(da?.perfil, campo);
      const sb = serie(db?.perfil, campo);
      const linhas = [sa && { rotulo: 'A', classe: 'traj-curva-a', ...sa }, sb && { rotulo: 'B', classe: 'traj-curva-b', ...sb }].filter(Boolean);
      return linhas.length ? graficoSobreposto(linhas, { rotuloY, ...opcoes }) : h('p', { class: 'vazio-curto' }, `Sem ${rotuloY.toLowerCase()} detalhada nestas passagens.`);
    };
    const areaGrafico = h('div');
    const metricas = [
      corrida
        ? { id: 'ritmo', rotulo: 'Ritmo', gerar: () => montar('Ritmo', (p) => ritmo(p), { formatarY: (v) => `${formatarDuracaoCurta(v)}/km`, invertido: true, passoMinimo: 5 }) }
        : { id: 'vel', rotulo: 'Velocidade', gerar: () => montar('Velocidade', (p) => velocidade(p), { formatarY: (v) => `${formatarNumero(v, 1)} km/h`, passoMinimo: 0.5 }) },
      { id: 'fc', rotulo: 'FC', gerar: () => montar('FC', (p) => p?.fc ?? null, { formatarY: (v) => `${Math.round(v)} bpm`, passoMinimo: 1 }) },
    ];
    let atual = metricas[0].id;
    const botoes = h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Métrica do gráfico sobreposto' });
    const pintar = () => {
      botoes.replaceChildren(...metricas.map((m) => h('button', { class: 'cg-periodo', type: 'button', 'aria-pressed': String(m.id === atual), onClick: () => { atual = m.id; pintar(); } }, m.rotulo)));
      areaGrafico.replaceChildren(metricas.find((m) => m.id === atual).gerar());
    };
    pintar();
    secoes.push(h('section', null, h('div', { class: 'bloco-topo' }, h('h3', null, 'Gráficos sobrepostos'), botoes), areaGrafico));

    // mapa
    const temGps = (p) => p?.lat?.some(Number.isFinite);
    if (temGps(da?.perfil) || temGps(db?.perfil)) {
      const mapa = mapaDeCamadas({ rotulo: 'Mapa das duas passagens' });
      destrutores.push(mapa.destruir);
      const camadas = [];
      if (rota) camadas.push({ lat: rota.lat, lon: rota.lon, cor: cssVar('--text-secondary', '#9a9a9a'), peso: 8, tracejado: true, rotulo: 'Rota de referência' });
      if (temGps(da?.perfil)) camadas.push({ lat: da.perfil.lat, lon: da.perfil.lon, cor: cssVar('--traj-a', '#ff5200'), peso: 4, rotulo: `A · ${formatarData(a.data)}${a.totalVoltas > 1 ? ` (volta ${a.volta})` : ''}` });
      if (temGps(db?.perfil)) camadas.push({ lat: db.perfil.lat, lon: db.perfil.lon, cor: cssVar('--traj-b', '#38bdf8'), peso: 4, rotulo: `B · ${formatarData(b.data)}${b.totalVoltas > 1 ? ` (volta ${b.volta})` : ''}` });
      secoes.push(h('section', null, h('h3', null, 'Mapa'), mapa.el));
      detalhes.replaceChildren(...secoes);
      mapa.definir(camadas);
      return;
    }
    detalhes.replaceChildren(...secoes);
  }

  carregarDetalhes([a, b])
    .then((m) => ativa && desenharDetalhes(m))
    .catch(() => ativa && detalhes.replaceChildren(h('p', { class: 'vazio-curto' }, 'Não foi possível carregar os detalhes destas passagens.')));

  const el = h('section', { class: 'card pilha traj-comparacao' }, cabecalho, legenda, tabela, detalhes);
  return {
    el,
    destruir: () => {
      ativa = false;
      destrutores.forEach((f) => f());
    },
  };
}
