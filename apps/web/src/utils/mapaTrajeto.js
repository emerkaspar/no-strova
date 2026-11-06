import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { h } from './dom.js';

const ATRIBUICAO = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const cssVar = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

const TOKEN_MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN;
const temaClaro = () => document.documentElement.dataset.tema === 'claro';

/**
 * Mapa base. Com `VITE_MAPBOX_TOKEN` (token público do Mapbox) usa os estilos escuro/claro do Mapbox; sem ele, cai para os
 * blocos do OpenStreetMap, que não pedem chave (no tema escuro o CSS os escurece: .mapa-base).
 */
export function camadaBase() {
  if (TOKEN_MAPBOX) {
    const estilo = temaClaro() ? 'light-v11' : 'dark-v11';
    return L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${estilo}/tiles/{z}/{x}/{y}?access_token=${TOKEN_MAPBOX}`, {
      attribution: '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 19,
    });
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: ATRIBUICAO, maxZoom: 19, className: 'mapa-base' });
}

/** Cor da escala de esforço: azul (baixo) → verde → amarelo → vermelho (alto), `t` de 0 a 1. */
export function corDoEsforco(t) {
  const x = Math.min(1, Math.max(0, t));
  return `hsl(${Math.round(220 - 220 * x)} 85% ${x > 0.35 && x < 0.65 ? 48 : 52}%)`;
}

/** Faixa (percentis 5–95, para um ponto fora da curva não achatar a escala) dos valores válidos; null se não há variação. */
function faixaDosValores(valores) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const min = v[Math.floor((v.length - 1) * 0.05)];
  const max = v[Math.ceil((v.length - 1) * 0.95)];
  return max > min ? { min, max } : null;
}

/**
 * Mapa do trajeto (Leaflet + OpenStreetMap, escurecido por CSS no tema escuro). Os pontos vêm da série reduzida da atividade.
 * Nenhum dado do usuário é enviado ao provedor de mapas além dos blocos de imagem que o navegador pede.
 *
 * @param {Array<number|null>} lat
 * @param {Array<number|null>} lon
 * @returns {{ el: HTMLElement, destacar: (i: number|null) => void, destruir: () => void } | null} null sem coordenadas suficientes
 */
export function mapaTrajeto(lat, lon) {
  const pontos = [];
  const indices = []; // índice da série de cada ponto desenhado
  lat.forEach((la, i) => {
    if (Number.isFinite(la) && Number.isFinite(lon[i])) {
      pontos.push([la, lon[i]]);
      indices.push(i);
    }
  });
  if (pontos.length < 2) return null;

  const el = h('div', { class: 'mapa-trajeto', role: 'region', 'aria-label': 'Mapa do trajeto da atividade' });
  const mapa = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  let base = camadaBase().addTo(mapa);

  const cor = cssVar('--primary', '#ff5200');
  const linha = L.polyline(pontos, { color: cor, weight: 4, opacity: 0.95, lineJoin: 'round' }).addTo(mapa);
  const borda = cssVar('--surface', '#161616');
  L.circleMarker(pontos[0], { radius: 7, color: borda, weight: 2, fillColor: cssVar('--success', '#4ade80'), fillOpacity: 1 }).bindTooltip('Início').addTo(mapa);
  L.circleMarker(pontos[pontos.length - 1], { radius: 7, color: borda, weight: 2, fillColor: cssVar('--danger', '#f87171'), fillOpacity: 1 }).bindTooltip('Fim').addTo(mapa);
  // marcador que acompanha o cursor sobre o gráfico (HTML, para ficar sempre acima do trajeto)
  let trecho = null; // camada do trecho selecionado
  let selecaoAtual = null;
  let esforco = null; // { valores, faixa } quando o trajeto é colorido por FC ou velocidade
  let segmentos = null; // um traço por intervalo entre pontos, na cor do esforço
  const cursor = L.marker(pontos[0], {
    icon: L.divIcon({ className: 'mapa-cursor', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 1000,
  });

  const ajustar = () => {
    mapa.invalidateSize();
    mapa.fitBounds((trecho ?? linha).getBounds(), { padding: [24, 24] });
  };

  /** Traços coloridos do ponto `ini` ao `fim` do trajeto. Intervalo sem valor fica cinza. */
  const tracos = (ini, fim, peso, opacidade) => {
    const grupo = L.featureGroup();
    const lista = [];
    for (let k = ini; k < fim; k++) {
      const v = esforco.valores[indices[k + 1]];
      lista.push({ k, t: Number.isFinite(v) ? (v - esforco.faixa.min) / (esforco.faixa.max - esforco.faixa.min) : null });
    }
    // Em ida e volta pelo mesmo caminho, o trecho mais intenso (mais rápido ou de FC mais alta) fica por cima: os menos intensos são desenhados primeiro.
    lista.sort((x, y) => (x.t ?? -1) - (y.t ?? -1));
    for (const { k, t } of lista) {
      L.polyline([pontos[k], pontos[k + 1]], { color: t === null ? '#8a8a8a' : corDoEsforco(t), weight: peso, opacity: opacidade, lineCap: 'round', interactive: false }).addTo(grupo);
    }
    return grupo;
  };
  const atenuar = (sim) => {
    linha.setStyle({ opacity: esforco ? 0 : sim ? 0.3 : 0.95 });
    segmentos?.setStyle({ opacity: sim ? 0.3 : 1 });
  };
  ajustar();

  // o mapa nasce antes de entrar na página: reajusta quando o container ganha tamanho
  const observadorTamanho = typeof ResizeObserver === 'function' ? new ResizeObserver(ajustar) : null;
  observadorTamanho?.observe(el);

  // ao alternar o tema: o OpenStreetMap muda por CSS; o Mapbox troca de estilo; a cor do trajeto é reaplicada
  const temaObs = new MutationObserver(() => {
    if (TOKEN_MAPBOX) {
      mapa.removeLayer(base);
      base = camadaBase().addTo(mapa);
      base.bringToBack();
    }
    linha.setStyle({ color: cssVar('--primary', '#ff5200') });
  });
  temaObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

  // índice da série -> ponto do trajeto mais próximo que tenha coordenadas
  const posicaoNoTrajeto = (i) => {
    let ini = 0;
    let fim = indices.length - 1;
    while (fim - ini > 1) {
      const meio = (ini + fim) >> 1;
      if (indices[meio] < i) ini = meio;
      else fim = meio;
    }
    return Math.abs(indices[ini] - i) <= Math.abs(indices[fim] - i) ? ini : fim;
  };

  return {
    el,
    /** Destaca o trecho `i0`..`i1` (índices da série) e enquadra o mapa nele; null volta ao trajeto inteiro. */
    selecionar(sel) {
      trecho?.remove();
      trecho = null;
      selecaoAtual = sel;
      if (!sel) {
        atenuar(false);
        mapa.fitBounds(linha.getBounds(), { padding: [24, 24] });
        return;
      }
      const a = posicaoNoTrajeto(sel.i0);
      const b = posicaoNoTrajeto(sel.i1);
      const parte = pontos.slice(Math.min(a, b), Math.max(a, b) + 1);
      if (parte.length < 2) return;
      atenuar(true);
      const ini = Math.min(a, b);
      trecho = esforco ? tracos(ini, ini + parte.length - 1, 6, 1).addTo(mapa) : L.polyline(parte, { color: cor, weight: 6, opacity: 1, lineJoin: 'round' }).addTo(mapa);
      mapa.fitBounds(trecho.getBounds(), { padding: [32, 32] });
    },
    /**
     * Colore o trajeto pelo esforço (`valores` na mesma indexação da série: FC ou velocidade); null volta à cor única.
     * Devolve a faixa da escala ({ min, max }) para a legenda, ou null quando não há como colorir.
     */
    colorirPor(valores) {
      segmentos?.remove();
      segmentos = null;
      esforco = null;
      const faixa = valores ? faixaDosValores(indices.map((i) => valores[i])) : null;
      if (faixa) {
        esforco = { valores, faixa };
        segmentos = tracos(0, pontos.length - 1, 4, 1).addTo(mapa);
      }
      this.selecionar(selecaoAtual); // reaplica o realce do trecho (e a opacidade) na cor nova
      return faixa;
    },
    destacar(i) {
      if (i === null || i === undefined) {
        cursor.remove();
        return;
      }
      cursor.setLatLng(pontos[posicaoNoTrajeto(i)]);
      if (!mapa.hasLayer(cursor)) cursor.addTo(mapa);
    },
    destruir() {
      observadorTamanho?.disconnect();
      temaObs.disconnect();
      mapa.remove();
    },
  };
}
