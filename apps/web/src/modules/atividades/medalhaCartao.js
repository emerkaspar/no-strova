import { esforcosDoEsporte, MEDALHAS, melhorMedalha, textoDaJanela } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { ritmoTexto, tempoDeEsforco } from './esforcos.js';
import { ROTULO_ESPORTE } from './textos.js';

const LARGURA = 340;
const MARGEM = 14;
const ATRASO_MS = 120;
const FECHAR_MS = 200;

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
 * tipo são (pódio: ouro, prata ou bronze; ou recente: o melhor dos últimos 30, 60 ou 90 dias). Abre ao passar o mouse na medalha
 * e continua aberto enquanto o ponteiro está nele. Clicar em um recorde do pódio abre o **ranking** dele (as três melhores
 * atividades, com link); clicar de novo recolhe. Esc ou um clique fora fecham; no toque, tocar na medalha alterna o cartão.
 * @param {{ aoAbrir?: () => void, podioDe?: (esporte: string, metrica: string) => Array<{ posicao: number, medalha: string, atividade: object, valor: number }> }} [opcoes]
 *   `aoAbrir`: chamado antes de abrir (a lista esconde a prévia do mapa); `podioDe`: o pódio de uma métrica (ver `podioDaMetrica`)
 * @returns {{ ligar: (medalha: HTMLElement, atividade: object, medalhas: object[]) => void, esconder: () => void, destruir: () => void }}
 */
export function criarCartaoDeMedalhas({ aoAbrir = () => {}, podioDe = () => [] } = {}) {
  const el = h('div', { class: 'medalha-cartao', role: 'tooltip', hidden: true });
  document.body.append(el);
  const podeHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
  let temporizador = null;
  let aberto = null; // o elemento da medalha cujo cartão está aberto
  let dados = null; // { atividade, medalhas } do cartão aberto
  let rankingAberto = null; // id da métrica cujo ranking está expandido

  /** Linhas do pódio de um recorde; a atividade da medalha aparece destacada. */
  function podioDoRecorde(m, atividade) {
    const podio = podioDe(atividade.esporte, m.metrica);
    if (podio.length === 0) return null;
    return h(
      'ol',
      { class: 'medalha-cartao-podio' },
      ...podio.map((p) => {
        const valor = valorDaMedalha({ metrica: m.metrica, valor: p.valor }, atividade.esporte);
        const eu = p.atividade.id === atividade.id;
        return h(
          'li',
          null,
          h(
            'a',
            { class: `medalha-cartao-posicao medalha-cartao-item-${p.medalha}${eu ? ' atual' : ''}`, href: `#/atividades/${p.atividade.id}`, title: 'Abrir a atividade' },
            h('span', { class: 'medalha-cartao-ordem' }, `${p.posicao}º`),
            h('span', { class: 'medalha-cartao-quem' }, h('b', null, p.atividade.titulo || (ROTULO_ESPORTE[p.atividade.esporte] ?? p.atividade.esporte)), h('small', null, formatarData(p.atividade.data))),
            h('span', { class: 'medalha-cartao-quanto' }, valor.texto),
          ),
        );
      }),
    );
  }

  function conteudo({ atividade, medalhas }) {
    const melhor = melhorMedalha(medalhas);
    const soRecente = melhor === 'recente';
    const esporte = ROTULO_ESPORTE[atividade.esporte] ?? atividade.esporte;
    el.className = `medalha-cartao medalha-cartao-${melhor}${el.classList.contains('visivel') ? ' visivel' : ''}`;
    const temPodio = medalhas.some((m) => m.tipo === 'podio');
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
          const expandido = !recente && rankingAberto === m.metrica;
          const corpo = [
            h('span', { class: 'medalha-cartao-icone' }, icone(ICONE_DA_METRICA[m.metrica] ?? 'duracao', 18)),
            h('div', { class: 'medalha-cartao-texto' }, h('strong', null, m.rotulo), h('small', null, recente ? textoDaJanela(m.dias) : MEDALHAS[m.medalha].rotulo)),
            h('div', { class: 'medalha-cartao-valor' }, h('b', null, valor.texto), valor.nota ? h('small', null, valor.nota) : null),
          ];
          const classe = `medalha-cartao-item medalha-cartao-item-${recente ? 'recente' : m.medalha}`;
          return h(
            'li',
            { class: 'medalha-cartao-bloco' },
            recente
              ? h('div', { class: classe }, ...corpo)
              : h(
                  'button',
                  {
                    type: 'button',
                    class: `${classe} medalha-cartao-escolha${expandido ? ' aberto' : ''}`,
                    'aria-expanded': String(expandido),
                    onClick: () => {
                      rankingAberto = expandido ? null : m.metrica;
                      redesenhar();
                    },
                  },
                  ...corpo,
                  h('span', { class: 'medalha-cartao-seta' }, icone('chevronBaixo', 16)),
                ),
            expandido ? podioDoRecorde(m, atividade) : null,
          );
        }),
      ),
      temPodio && rankingAberto === null ? h('footer', { class: 'medalha-cartao-dica' }, 'Clique em um recorde para ver o ranking') : null,
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

  /**
   * Desenha de novo o cartão aberto (ao expandir ou recolher um ranking), mantendo a rolagem. O topo não muda (só sobe o
   * mínimo para caber na tela): reposicionar pela medalha jogaria o cartão para longe do ponteiro, que sairia dele e o fecharia.
   */
  function redesenhar() {
    const rolagem = el.scrollTop;
    const topo = Number.parseFloat(el.style.top) || MARGEM;
    el.replaceChildren(...conteudo(dados).filter(Boolean));
    el.style.top = `${Math.max(MARGEM, Math.min(topo, window.innerHeight - el.offsetHeight - MARGEM))}px`;
    el.scrollTop = rolagem;
  }

  function mostrar(ancora, atividade, medalhas) {
    aoAbrir();
    aberto = ancora;
    dados = { atividade, medalhas };
    rankingAberto = null;
    el.replaceChildren(...conteudo(dados).filter(Boolean));
    el.hidden = false;
    posicionar(ancora);
    requestAnimationFrame(() => el.classList.add('visivel'));
  }

  function esconder() {
    clearTimeout(temporizador);
    temporizador = null;
    aberto = null;
    dados = null;
    rankingAberto = null;
    el.classList.remove('visivel');
    el.hidden = true;
  }

  /** Fecha depois de um instante, para dar tempo de o ponteiro ir da medalha ao cartão (e voltar). */
  function agendarFechamento() {
    clearTimeout(temporizador);
    temporizador = setTimeout(esconder, FECHAR_MS);
  }

  // toque fora ou Esc fecham (necessário no toque, onde não há "mouseleave")
  const foraOuEsc = (e) => {
    if (!aberto) return;
    if (e.type === 'keydown' ? e.key === 'Escape' : !aberto.contains(e.target) && !el.contains(e.target)) esconder();
  };
  document.addEventListener('click', foraOuEsc, true);
  document.addEventListener('keydown', foraOuEsc);
  if (podeHover) {
    el.addEventListener('mouseenter', () => clearTimeout(temporizador));
    el.addEventListener('mouseleave', agendarFechamento);
  }

  return {
    ligar(medalha, atividade, medalhas) {
      if (podeHover) {
        medalha.addEventListener('mouseenter', () => {
          clearTimeout(temporizador);
          if (aberto === medalha) return;
          aoAbrir(); // a prévia do mapa da linha não deve abrir por cima
          temporizador = setTimeout(() => mostrar(medalha, atividade, medalhas), ATRASO_MS);
        });
        medalha.addEventListener('mouseleave', agendarFechamento);
      } else {
        // toque: não há hover, então tocar alterna o cartão
        medalha.addEventListener('click', () => (aberto === medalha ? esconder() : mostrar(medalha, atividade, medalhas)));
      }
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
