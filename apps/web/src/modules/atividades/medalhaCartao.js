import { esforcosDoEsporte, MEDALHAS, melhorMedalha, textoDaJanela } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { ritmoTexto, tempoDeEsforco } from './esforcos.js';
import { ROTULO_ESPORTE } from './textos.js';

const LARGURA = 340;
const MARGEM = 14;
const ATRASO_MS = 120;

const ICONE_DA_METRICA = Object.freeze({ distancia: 'distancia', duracao: 'duracao', elevacao: 'elevacao', hrss: 'hrss' });

/** Valor do recorde para mostrar: distância, tempo, subida, HRSS ou o tempo (e ritmo) de um melhor esforço. */
function valorDaMedalha(m, esporte) {
  if (m.metrica === 'distancia') return { texto: formatarDistancia(m.valor), nota: null };
  if (m.metrica === 'duracao') return { texto: formatarDuracao(m.valor), nota: null };
  if (m.metrica === 'elevacao') return { texto: `${formatarNumero(m.valor, 0)} m`, nota: null };
  if (m.metrica === 'hrss') return { texto: formatarNumero(m.valor, 1), nota: null };
  const esforco = esforcosDoEsporte(esporte).find((e) => e.id === m.metrica);
  return { texto: tempoDeEsforco(m.valor), nota: esforco ? ritmoTexto(esporte, m.valor, esforco.metros) : null };
}

/**
 * Cartão flutuante dos recordes pessoais de uma atividade (a medalha da lista): quais recordes, o valor de cada um e a que
 * tipo são (pódio: ouro, prata ou bronze; ou recente: o melhor dos últimos 30, 60 ou 90 dias). Abre ao passar o mouse, focar pelo
 * teclado ou tocar na medalha; Esc fecha.
 * @param {{ aoAbrir?: () => void }} [opcoes] `aoAbrir`: chamado antes de abrir (a lista esconde a prévia do mapa)
 * @returns {{ ligar: (medalha: HTMLElement, atividade: object, medalhas: object[]) => void, esconder: () => void, destruir: () => void }}
 */
export function criarCartaoDeMedalhas({ aoAbrir = () => {} } = {}) {
  const el = h('div', { class: 'medalha-cartao', role: 'tooltip', hidden: true });
  document.body.append(el);
  const podeHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
  let temporizador = null;
  let aberto = null; // o elemento da medalha cujo cartão está aberto

  function conteudo(atividade, medalhas) {
    const melhor = melhorMedalha(medalhas);
    const soRecente = melhor === 'recente';
    const esporte = ROTULO_ESPORTE[atividade.esporte] ?? atividade.esporte;
    el.className = `medalha-cartao medalha-cartao-${melhor}`;
    return [
      h(
        'header',
        { class: 'medalha-cartao-topo' },
        h('span', { class: 'medalha-cartao-selo' }, icone('medalha', 30)),
        h(
          'div',
          null,
          h('strong', null, soRecente ? 'Destaque recente' : `Medalha de ${MEDALHAS[melhor].rotulo.toLowerCase()}`),
          h('span', null, `${medalhas.length} ${soRecente ? (medalhas.length === 1 ? 'melhor marca do período' : 'melhores marcas do período') : medalhas.length === 1 ? 'recorde pessoal' : 'recordes pessoais'}`),
          h('small', null, `${atividade.titulo ? `${atividade.titulo} · ` : ''}${esporte} · ${formatarData(atividade.data)}`),
        ),
      ),
      h(
        'ul',
        { class: 'medalha-cartao-lista' },
        ...medalhas.map((m) => {
          const valor = valorDaMedalha(m, atividade.esporte);
          const recente = m.tipo === 'recente';
          return h(
            'li',
            { class: `medalha-cartao-item medalha-cartao-item-${recente ? 'recente' : m.medalha}` },
            h('span', { class: 'medalha-cartao-icone' }, icone(ICONE_DA_METRICA[m.metrica] ?? 'duracao', 18)),
            h('div', { class: 'medalha-cartao-texto' }, h('strong', null, m.rotulo), h('small', null, recente ? textoDaJanela(m.dias) : MEDALHAS[m.medalha].rotulo)),
            h('div', { class: 'medalha-cartao-valor' }, h('b', null, valor.texto), valor.nota ? h('small', null, valor.nota) : null),
          );
        }),
      ),
    ];
  }

  function posicionar(ancora) {
    const r = ancora.getBoundingClientRect();
    const altura = el.offsetHeight;
    const x = Math.min(Math.max(MARGEM, r.left - 8), window.innerWidth - LARGURA - MARGEM);
    const abaixo = r.bottom + 10;
    const y = abaixo + altura <= window.innerHeight - MARGEM ? abaixo : Math.max(MARGEM, r.top - altura - 10);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function mostrar(ancora, atividade, medalhas) {
    aoAbrir();
    aberto = ancora;
    el.replaceChildren(...conteudo(atividade, medalhas));
    el.hidden = false;
    posicionar(ancora);
    requestAnimationFrame(() => el.classList.add('visivel'));
  }

  function esconder() {
    clearTimeout(temporizador);
    temporizador = null;
    aberto = null;
    el.classList.remove('visivel');
    el.hidden = true;
  }

  // toque fora ou Esc fecham (necessário no toque, onde não há "mouseleave")
  const foraOuEsc = (e) => {
    if (!aberto) return;
    if (e.type === 'keydown' ? e.key === 'Escape' : !aberto.contains(e.target)) esconder();
  };
  document.addEventListener('click', foraOuEsc, true);
  document.addEventListener('keydown', foraOuEsc);

  return {
    ligar(medalha, atividade, medalhas) {
      if (podeHover) {
        medalha.addEventListener('mouseenter', () => {
          clearTimeout(temporizador);
          aoAbrir(); // a prévia do mapa da linha não deve abrir por cima
          temporizador = setTimeout(() => mostrar(medalha, atividade, medalhas), ATRASO_MS);
        });
        medalha.addEventListener('mouseleave', esconder);
      }
      // teclado: o foco por Tab (e não o do clique do mouse) abre; Enter ou espaço alternam; Esc fecha (ver acima)
      medalha.addEventListener('focus', () => {
        if (medalha.matches(':focus-visible')) mostrar(medalha, atividade, medalhas);
      });
      medalha.addEventListener('blur', esconder);
      medalha.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (aberto === medalha) esconder();
          else mostrar(medalha, atividade, medalhas);
        }
      });
      // toque: não há hover, então tocar alterna o cartão
      if (!podeHover) medalha.addEventListener('click', () => (aberto === medalha ? esconder() : mostrar(medalha, atividade, medalhas)));
    },
    esconder,
    destruir() {
      esconder();
      document.removeEventListener('click', foraOuEsc, true);
      document.removeEventListener('keydown', foraOuEsc);
      el.remove();
    },
  };
}
