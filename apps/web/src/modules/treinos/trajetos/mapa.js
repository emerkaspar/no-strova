import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { h } from '../../../utils/dom.js';
import { camadaBase } from '../../../utils/mapaTrajeto.js';

const cssVar = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

/**
 * Mapa com várias camadas (a rota de referência e as passagens). Cada camada é uma linha: `{ lat, lon, cor, peso?, tracejado?, rotulo? }`
 * (listas paralelas, com vazios permitidos). `definir` troca todas as camadas e reenquadra o mapa.
 * @returns {{ el: HTMLElement, definir: (camadas: object[]) => void, destruir: () => void }}
 */
export function mapaDeCamadas({ rotulo = 'Mapa do trajeto' } = {}) {
  const el = h('div', { class: 'mapa-trajeto traj-mapa', role: 'region', 'aria-label': rotulo });
  const mapa = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  camadaBase().addTo(mapa);
  mapa.setView([0, 0], 2);
  let grupo = null;

  // o mapa nasce antes de entrar na página: reenquadra quando o container ganha tamanho
  let limites = null;
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (el.clientWidth === 0) return;
    mapa.invalidateSize();
    if (limites) mapa.fitBounds(limites, { padding: [24, 24] });
  }) : null;
  observador?.observe(el);

  return {
    el,
    definir(camadas) {
      grupo?.remove();
      grupo = L.featureGroup().addTo(mapa);
      for (const c of camadas) {
        const pontos = [];
        c.lat.forEach((la, i) => {
          if (Number.isFinite(la) && Number.isFinite(c.lon[i])) pontos.push([la, c.lon[i]]);
        });
        if (pontos.length < 2) continue;
        const linha = L.polyline(pontos, { color: c.cor, weight: c.peso ?? 4, opacity: 0.9, lineJoin: 'round', dashArray: c.tracejado ? '6 8' : null });
        if (c.rotulo) linha.bindTooltip(c.rotulo, { sticky: true });
        linha.addTo(grupo);
        if (c.pontas) {
          const borda = cssVar('--surface', '#161616');
          L.circleMarker(pontos[0], { radius: 6, color: borda, weight: 2, fillColor: cssVar('--success', '#4ade80'), fillOpacity: 1 }).bindTooltip('Início').addTo(grupo);
          L.circleMarker(pontos[pontos.length - 1], { radius: 6, color: borda, weight: 2, fillColor: cssVar('--danger', '#f87171'), fillOpacity: 1 }).bindTooltip('Fim').addTo(grupo);
        }
      }
      const caixa = grupo.getBounds();
      limites = caixa.isValid() ? caixa : null;
      if (limites) {
        mapa.invalidateSize();
        mapa.fitBounds(limites, { padding: [24, 24] });
      }
    },
    destruir() {
      observador?.disconnect();
      mapa.remove();
    },
  };
}
