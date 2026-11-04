import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { h } from './dom.js';

const ATRIBUICAO = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

const temaClaro = () => document.documentElement.dataset.tema === 'claro';
const cssVar = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

function camadaDoTema() {
  return L.tileLayer(`https://{s}.basemaps.cartocdn.com/${temaClaro() ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png`, {
    attribution: ATRIBUICAO,
    subdomains: 'abcd',
    maxZoom: 19,
  });
}

/**
 * Mapa do trajeto (Leaflet + mapa base escuro ou claro conforme o tema). Os pontos vêm da série reduzida da atividade.
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
  let base = camadaDoTema().addTo(mapa);

  const cor = cssVar('--primary', '#ff5200');
  const linha = L.polyline(pontos, { color: cor, weight: 4, opacity: 0.95, lineJoin: 'round' }).addTo(mapa);
  const borda = cssVar('--surface', '#161616');
  L.circleMarker(pontos[0], { radius: 7, color: borda, weight: 2, fillColor: cssVar('--success', '#4ade80'), fillOpacity: 1 }).bindTooltip('Início').addTo(mapa);
  L.circleMarker(pontos[pontos.length - 1], { radius: 7, color: borda, weight: 2, fillColor: cssVar('--danger', '#f87171'), fillOpacity: 1 }).bindTooltip('Fim').addTo(mapa);
  const cursor = L.circleMarker(pontos[0], { radius: 7, color: '#ffffff', weight: 3, fillColor: cor, fillOpacity: 1, interactive: false });

  const ajustar = () => {
    mapa.invalidateSize();
    mapa.fitBounds(linha.getBounds(), { padding: [24, 24] });
  };
  ajustar();

  // o mapa nasce antes de entrar na página: reajusta quando o container ganha tamanho
  let primeiraMedida = true;
  const observadorTamanho = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        if (primeiraMedida) {
          primeiraMedida = false;
          ajustar();
        } else {
          mapa.invalidateSize();
        }
      })
    : null;
  observadorTamanho?.observe(el);

  // troca o mapa base quando o usuário alterna entre tema claro e escuro
  const temaObs = new MutationObserver(() => {
    mapa.removeLayer(base);
    base = camadaDoTema().addTo(mapa);
    base.bringToBack();
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
