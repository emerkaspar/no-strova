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

/**
 * Mapa para escolher o início e o fim do trajeto sobre o traçado de uma atividade. Os dois marcadores são arrastáveis e
 * se encaixam sempre num ponto do traçado; o trecho entre eles fica em destaque.
 * @returns {{
 *   el: HTMLElement,
 *   definir: (trilha: { lat: Array<number|null>, lon: Array<number|null>, dKm: Array<number|null> }) => void,
 *   faixa: (iniKm: number|null, fimKm: number|null, editavel: boolean) => void,
 *   aoMudar: (f: (faixa: { iniKm: number, fimKm: number }) => void) => void,
 *   destruir: () => void,
 * }}
 */
export function mapaEditorDeFaixa({ rotulo = 'Mapa para marcar o início e o fim do trajeto' } = {}) {
  const el = h('div', { class: 'mapa-trajeto traj-mapa', role: 'region', 'aria-label': rotulo });
  const mapa = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  camadaBase().addTo(mapa);
  mapa.setView([0, 0], 2);

  let pontos = []; // { ll: [lat, lon], d: km }
  let ini = 0;
  let fim = 0;
  let editavel = false;
  let escutar = () => {};
  let limites = null;
  let fundo = null;
  let destaque = null;

  const alca = (classe, texto) => L.marker([0, 0], {
    draggable: true,
    keyboard: false,
    icon: L.divIcon({ className: `mapa-alca ${classe}`, html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
    zIndexOffset: 1000,
    title: texto,
  });
  const marcaIni = alca('mapa-alca-ini', 'Início do trajeto: arraste');
  const marcaFim = alca('mapa-alca-fim', 'Fim do trajeto: arraste');

  const ajustar = () => {
    mapa.invalidateSize();
    if (limites) mapa.fitBounds(limites, { padding: [24, 24] });
  };
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (el.clientWidth > 0) ajustar();
  }) : null;
  observador?.observe(el);

  /**
   * Ponto do traçado para onde o marcador foi arrastado, só entre os índices `de` e `ate`. Onde o traçado passa várias vezes
   * pelo mesmo lugar (voltas), vale a passagem mais perto do índice `atual`: o marcador segue o caminho em vez de pular de volta.
   */
  function maisProximo(ll, de, ate, atual) {
    const k = Math.cos((ll.lat * Math.PI) / 180);
    const q = [];
    let menor = Infinity;
    for (let i = de; i <= ate; i++) {
      const dx = (pontos[i].ll[1] - ll.lng) * k;
      const dy = pontos[i].ll[0] - ll.lat;
      q[i] = dx * dx + dy * dy;
      if (q[i] < menor) menor = q[i];
    }
    // tolerância de ~16 px no zoom atual: pontos nessa faixa contam como "o mesmo lugar"
    const tol = (16 * 360) / (256 * 2 ** mapa.getZoom());
    const limite = Math.max(menor, tol * tol);
    let melhor = de;
    let distancia = Infinity;
    for (let i = de; i <= ate; i++) {
      if (q[i] <= limite && Math.abs(i - atual) < distancia) {
        distancia = Math.abs(i - atual);
        melhor = i;
      }
    }
    return melhor;
  }

  function desenhar() {
    if (pontos.length < 2) return;
    destaque?.setLatLngs(pontos.slice(ini, fim + 1).map((p) => p.ll));
    marcaIni.setLatLng(pontos[ini].ll);
    marcaFim.setLatLng(pontos[fim].ll);
  }
  const avisar = () => escutar({ iniKm: pontos[ini].d, fimKm: pontos[fim].d });

  marcaIni.on('drag', (e) => {
    ini = maisProximo(e.latlng, 0, fim - 1, ini);
    desenhar();
    avisar();
  });
  marcaFim.on('drag', (e) => {
    fim = maisProximo(e.latlng, ini + 1, pontos.length - 1, fim);
    desenhar();
    avisar();
  });
  // ao soltar, o marcador assenta no ponto do traçado
  marcaIni.on('dragend', desenhar);
  marcaFim.on('dragend', desenhar);

  const indiceDoKm = (km) => {
    let melhor = 0;
    let menor = Infinity;
    pontos.forEach((p, i) => {
      const dif = Math.abs(p.d - km);
      if (dif < menor) {
        menor = dif;
        melhor = i;
      }
    });
    return melhor;
  };

  return {
    el,
    definir({ lat, lon, dKm }) {
      pontos = [];
      lat.forEach((la, i) => {
        const d = dKm?.[i];
        if (Number.isFinite(la) && Number.isFinite(lon[i]) && Number.isFinite(d)) pontos.push({ ll: [la, lon[i]], d });
      });
      fundo?.remove();
      destaque?.remove();
      marcaIni.remove();
      marcaFim.remove();
      limites = null;
      if (pontos.length < 2) return;
      fundo = L.polyline(pontos.map((p) => p.ll), { color: cssVar('--text-secondary', '#9a9a9a'), weight: 3, opacity: 0.9, lineJoin: 'round', interactive: false }).addTo(mapa);
      destaque = L.polyline([], { color: cssVar('--primary', '#ff5200'), weight: 5, opacity: 0.95, lineJoin: 'round', interactive: false }).addTo(mapa);
      ini = 0;
      fim = pontos.length - 1;
      limites = fundo.getBounds();
      desenhar();
      marcaIni.addTo(mapa);
      marcaFim.addTo(mapa);
      ajustar();
    },
    /** Posiciona a faixa (em km da atividade). Sem valores, vale a atividade inteira. `podeEditar` libera o arraste. */
    faixa(iniKm, fimKm, podeEditar) {
      if (pontos.length < 2) return;
      editavel = podeEditar;
      let a = Number.isFinite(iniKm) ? indiceDoKm(iniKm) : 0;
      let b = Number.isFinite(fimKm) ? indiceDoKm(fimKm) : pontos.length - 1;
      if (b <= a) {
        a = Math.min(a, pontos.length - 2);
        b = a + 1;
      }
      ini = a;
      fim = b;
      for (const m of [marcaIni, marcaFim]) {
        if (editavel) m.dragging.enable();
        else m.dragging.disable();
        m.getElement()?.classList.toggle('mapa-alca-fixa', !editavel);
      }
      desenhar();
    },
    aoMudar(f) {
      escutar = f;
    },
    destruir() {
      observador?.disconnect();
      mapa.remove();
    },
  };
}
