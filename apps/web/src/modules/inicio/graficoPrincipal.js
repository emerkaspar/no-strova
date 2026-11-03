import { FAIXAS_FORMA } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarForma, formatarNumero } from '../../utils/formatters.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 760;
const MARGEM = { esquerda: 40, direita: 14 };
const LARGURA = L - MARGEM.esquerda - MARGEM.direita;
const FAIXA_ATIVIDADES = 22; // altura da faixa de atividades, no alto do painel de Forma, acima das barras
const PAINEL = { cond: { topo: 20, alto: 170 }, forma: { topo: 218, alto: 120 + FAIXA_ATIVIDADES }, peso: { topo: 388, alto: 90 } };
const EIXO_X = 500; // y dos rótulos de data
const ALTURA = 522;
const LIMITE_ESCALA_FORMA = 40;
const PASSOS_CONDICIONAMENTO = [1, 2, 5, 10, 20, 25, 50, 100, 200];
const ESCALA_REGUA = { min: -40, max: 40 };
const LIMITES_REGUA = [25, 5, -10, -30];

/** Períodos do seletor: dias já realizados e dias de plano projetado mostrados (o plano cabe até onde houver treinos). */
export const PERIODOS = Object.freeze([
  { id: '6sem', rotulo: '6 sem', passado: 28, futuro: 14 },
  { id: '10sem', rotulo: '10 sem', passado: 42, futuro: 28 },
  { id: '6meses', rotulo: '6 meses', passado: 154, futuro: 28 },
  { id: '1ano', rotulo: '1 ano', passado: 337, futuro: 28 },
]);

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10-28" → "qua, 28 out". */
export function rotuloDoDia(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return `${DIAS_SEMANA[diaSemana]}, ${dia} ${MESES_CURTOS[mes - 1]}`;
}

/** Ícones dos esportes (traços em uma grade de 24 × 24). */
const ICONES = {
  ciclismo: [
    ['circle', { cx: 6, cy: 17, r: 3.8 }],
    ['circle', { cx: 18, cy: 17, r: 3.8 }],
    ['path', { d: 'M6 17l4-8h5l3 8M10 9l3 8H6M15 9l-1-3h-2' }],
  ],
  // corredor em passada: cabeça, tronco, braços e pernas
  corrida: [
    ['circle', { cx: 14.5, cy: 4.5, r: 1.9 }],
    ['path', { d: 'M13 8.5L10.5 13M12.8 9.5L17.5 11.5L19.5 9.5M12.4 10L8.5 9.5L6.5 12' }],
    ['path', { d: 'M10.5 13L14.5 15.2L13.5 20.5M10.5 13L7.5 16.5L4 15.5' }],
  ],
  outro: [['path', { d: 'M13 3L5 14h6l-1 7 8-11h-6z' }]],
  // o preguiçoso do dia de descanso: carinha de sono, olhos fechados, bocejo e um "z"
  preguica: [
    ['circle', { cx: 11, cy: 13, r: 8 }],
    ['path', { d: 'M7.2 12q1.5 1.3 3 0M12.8 12q1.5 1.3 3 0' }],
    ['ellipse', { cx: 11.5, cy: 16.6, rx: 1.7, ry: 1.3 }],
    ['path', { d: 'M16.5 2.5h4l-4 4h4' }],
  ],
};

/** Frases do dia de descanso, uma por dia (a escolha depende da data, para não mudar a cada redesenho). */
const PIADAS_DO_DESCANSO = [
  'Hoje o sofá é o treino.',
  'Músculo também cresce deitado.',
  'Descanso faz parte do plano. Juro.',
  'A bike está com saudade, mas aguenta.',
  'Treino de hoje: recuperar na horizontal.',
  'Hoje nem o ventilador girou.',
  'Cansaço bom é o que passa no sofá.',
];
const piadaDoDia = (data) => PIADAS_DO_DESCANSO[Number(data.slice(8, 10)) % PIADAS_DO_DESCANSO.length];

/** Marcador de atividade do dia: o ícone do esporte (ou um ponto, quando o gráfico está denso). */
function iconeDoEsporte(esporte, x, y, tamanho) {
  const grupo = svg('g', { class: 'cg-icone', transform: `translate(${(x - tamanho / 2).toFixed(1)} ${(y - tamanho / 2).toFixed(1)}) scale(${(tamanho / 24).toFixed(3)})` });
  for (const [nome, atributos] of ICONES[esporte] ?? ICONES.outro) grupo.append(svg(nome, atributos));
  return grupo;
}

/** Ícone do esporte como <svg> próprio (para a coluna lateral e o tooltip). */
function iconeSolto(esporte, tamanho) {
  const el = svg('svg', { viewBox: '0 0 24 24', width: tamanho, height: tamanho, class: `cg-icone cg-icone-solto cg-esporte-${esporte}`, 'aria-hidden': 'true' });
  for (const [nome, atributos] of ICONES[esporte] ?? ICONES.outro) el.append(svg(nome, atributos));
  return el;
}

/** Último período escolhido: sobrevive aos redesenhos do Início (cada snapshot refaz o cartão). */
let periodoEscolhido = '10sem';
let sequencia = 0;

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos ?? {})) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

const sinalDaForma = (valor) => formatarForma(valor, 1);

/** Estado do dia: antes de hoje é realizado, depois é planejado. */
const statusDoDia = (data, hoje) => (data === hoje ? 'Hoje' : data < hoje ? 'Realizado' : 'Planejado');

/**
 * Recorta a série (com `projetado` nos dias futuros) para o período: os últimos `passado` dias até hoje e até
 * `futuro` dias de projeção.
 */
export function recortarPeriodo(serie, periodo) {
  if (serie.length === 0) return [];
  const primeiroFuturo = serie.findIndex((d) => d.projetado);
  const fimReal = primeiroFuturo === -1 ? serie.length - 1 : primeiroFuturo - 1;
  const inicio = Math.max(0, fimReal - periodo.passado);
  const fim = Math.min(serie.length - 1, fimReal + periodo.futuro);
  return serie.slice(inicio, fim + 1);
}

/** Peso interpolado da linha da meta no dia `data`, ou null fora do trecho. */
function valorDaMeta(data, metaLinha) {
  if (!metaLinha || data < metaLinha.de.data || data > metaLinha.ate.data) return null;
  const total = diasEntreIso(metaLinha.de.data, metaLinha.ate.data);
  if (total <= 0) return metaLinha.ate.kg;
  const passo = diasEntreIso(metaLinha.de.data, data) / total;
  return metaLinha.de.kg + (metaLinha.ate.kg - metaLinha.de.kg) * passo;
}

function diasEntreIso(a, b) {
  const t = (iso) => Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * Cartão do gráfico principal do Início: Condicionamento e fadiga, Forma (barras por zona) e Peso e meta, sobre o
 * mesmo calendário, com o plano projetado depois de "Hoje", tooltip por dia e uma coluna lateral (dia selecionado,
 * régua de zonas e legenda).
 * @param {{
 *   serie: Array<{ data: string, fitness: number, fadiga: number, forma: number, faixa: string, estresse: number, projetado?: boolean }>,
 *   hoje: string,
 *   treinoDoDia?: (data: string) => string|string[]|null,
 *   esportesDoDia?: (data: string) => string[],
 *   pesos?: Array<{ data: string, kg: number }>,
 *   metaPeso?: { dataAlvo: string, kg: number }|null
 * }} p
 */
export function criarGraficoPrincipal({ serie, hoje, treinoDoDia = () => null, esportesDoDia = () => [], pesos = [], metaPeso = null }) {
  const raiz = h('section', { class: 'card bloco-grafico cg' });
  const periodo = () => PERIODOS.find((p) => p.id === periodoEscolhido) ?? PERIODOS[1];

  function desenhar() {
    const dias = recortarPeriodo(serie, periodo());
    const temFuturo = dias.some((d) => d.projetado);
    const seletor = h(
      'div',
      { class: 'cg-periodos', role: 'group', 'aria-label': 'Período do gráfico' },
      ...PERIODOS.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'cg-periodo',
            'aria-pressed': String(p.id === periodoEscolhido),
            onClick: () => {
              periodoEscolhido = p.id;
              desenhar();
            },
          },
          p.rotulo,
        ),
      ),
    );
    const topo = h(
      'div',
      { class: 'cg-topo' },
      h('div', null, h('h2', { class: 'titulo-bloco' }, 'Condicionamento, fadiga e forma'), h('p', { class: 'texto-secundario cg-sub' }, 'Realizado até hoje e plano projetado. Passe o mouse sobre o gráfico.')),
      seletor,
    );
    if (dias.length < 2) {
      raiz.replaceChildren(topo, h('p', { class: 'vazio-curto' }, 'Disponível quando houver atividades com HRSS calculado.'));
      return;
    }
    raiz.replaceChildren(topo, corpo(dias, temFuturo));
  }

  function corpo(dias, temFuturo) {
    const n = dias.length;
    const idGradiente = `cg-grad-${++sequencia}`;
    const indiceHoje = Math.max(0, dias.findIndex((d) => d.data === hoje));
    // cada dia ocupa uma "casa" e o ponto fica no meio dela: a primeira e a última barras não invadem o eixo
    const passoX = LARGURA / n;
    const px = (i) => MARGEM.esquerda + (i + 0.5) * passoX;

    // ---- escalas ----
    // As escalas se ajustam aos dados: com valores baixos, uma escala fixa de 0 a 100 deixaria as linhas coladas no fundo.
    const maxCond = Math.max(1, ...dias.flatMap((d) => [d.fitness, d.fadiga]));
    const passoCond = PASSOS_CONDICIONAMENTO.find((p) => (maxCond * 1.1) / p <= 4) ?? 200;
    const topoCond = Math.ceil((maxCond * 1.1) / passoCond) * passoCond;
    const yCond = (v) => PAINEL.cond.topo + (1 - v / topoCond) * PAINEL.cond.alto;
    const formas = dias.map((d) => d.forma);
    const formaMin = Math.max(-LIMITE_ESCALA_FORMA, Math.floor((Math.min(...formas, -10) - 3) / 5) * 5);
    const formaMax = Math.min(LIMITE_ESCALA_FORMA, Math.ceil((Math.max(...formas, 5) + 3) / 5) * 5);
    const limitaForma = (v) => Math.min(formaMax, Math.max(formaMin, v));
    const yForma = (v) => PAINEL.forma.topo + FAIXA_ATIVIDADES + (1 - (limitaForma(v) - formaMin) / (formaMax - formaMin)) * (PAINEL.forma.alto - FAIXA_ATIVIDADES);

    // ---- peso e meta ----
    const primeiro = dias[0].data;
    const ultimo = dias[n - 1].data;
    const indiceDe = (data) => dias.findIndex((d) => d.data === data);
    const pesosNaJanela = pesos.filter((p) => p.data >= primeiro && p.data <= ultimo && Number.isFinite(p.kg)).sort((a, b) => (a.data < b.data ? -1 : 1));
    const pesoPorDia = new Map(pesosNaJanela.map((p) => [p.data, p.kg]));
    const ultimoPeso = [...pesos].filter((p) => p.data <= hoje && Number.isFinite(p.kg)).sort((a, b) => (a.data < b.data ? 1 : -1))[0] ?? null;
    let metaLinha = null;
    if (metaPeso && ultimoPeso && metaPeso.dataAlvo > ultimoPeso.data && ultimoPeso.data >= primeiro) {
      const fim = metaPeso.dataAlvo > ultimo ? ultimo : metaPeso.dataAlvo;
      const total = diasEntreIso(ultimoPeso.data, metaPeso.dataAlvo);
      const kgFim = ultimoPeso.kg + (metaPeso.kg - ultimoPeso.kg) * (diasEntreIso(ultimoPeso.data, fim) / total);
      metaLinha = { de: ultimoPeso, ate: { data: fim, kg: kgFim } };
    }
    const kgs = [...pesosNaJanela.map((p) => p.kg), ...(metaLinha ? [metaLinha.ate.kg] : [])];
    const temPeso = kgs.length > 0;
    const menorKg = temPeso ? Math.floor(Math.min(...kgs) - 1) : 0;
    const maiorKg = temPeso ? Math.ceil(Math.max(...kgs) + 1) : 1;
    const yPeso = (kg) => PAINEL.peso.topo + (1 - (kg - menorKg) / (maiorKg - menorKg || 1)) * PAINEL.peso.alto;

    const raizSvg = svg('svg', {
      viewBox: `0 0 ${L} ${ALTURA}`,
      class: 'cg-svg',
      role: 'img',
      'aria-label': `Condicionamento, fadiga, forma e peso de ${rotuloDoDia(primeiro)} a ${rotuloDoDia(ultimo)}${temFuturo ? ', com o plano projetado' : ''}`,
    });

    // fundo dos dias futuros, atravessando os três painéis
    if (temFuturo) {
      raizSvg.append(svg('rect', { x: px(indiceHoje), y: PAINEL.cond.topo, width: px(n - 1) - px(indiceHoje), height: PAINEL.peso.topo + PAINEL.peso.alto - PAINEL.cond.topo, class: 'cg-futuro' }));
    }

    // painel 1: grade 0–100 (ou mais, se a fadiga passar)
    raizSvg.append(svg('text', { x: MARGEM.esquerda, y: PAINEL.cond.topo - 6, class: 'cg-titulo-painel' }, 'CONDICIONAMENTO E FADIGA'));
    for (let v = 0; v <= topoCond + 1e-9; v += passoCond) {
      raizSvg.append(
        svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: yCond(v), y2: yCond(v), class: 'cg-grade' }),
        svg('text', { x: MARGEM.esquerda - 8, y: yCond(v) + 4, 'text-anchor': 'end', class: 'cg-rotulo' }, formatarNumero(v, 0)),
      );
    }
    const pontos = (campo, y, de, ate) =>
      dias
        .slice(de, ate + 1)
        .map((d, k) => `${px(de + k).toFixed(1)},${y(d[campo]).toFixed(1)}`)
        .join(' ');
    const defs = svg(
      'defs',
      null,
      svg('linearGradient', { id: idGradiente, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('stop', { offset: '0%', class: 'cg-grad-topo' }), svg('stop', { offset: '100%', class: 'cg-grad-base' })),
    );
    const caminhoArea = `M ${px(0).toFixed(1)},${yCond(0)} L ${pontos('fitness', yCond, 0, indiceHoje).replaceAll(' ', ' L ')} L ${px(indiceHoje).toFixed(1)},${yCond(0)} Z`;
    raizSvg.append(defs, svg('path', { d: caminhoArea, fill: `url(#${idGradiente})`, class: 'cg-area' }));
    for (const campo of ['fadiga', 'fitness']) {
      raizSvg.append(svg('polyline', { points: pontos(campo, yCond, 0, indiceHoje), class: `cg-linha cg-${campo}` }));
      if (temFuturo) raizSvg.append(svg('polyline', { points: pontos(campo, yCond, indiceHoje, n - 1), class: `cg-linha cg-${campo} cg-tracejada` }));
    }

    // painel 2: Forma em barras pela zona, a partir do zero
    raizSvg.append(svg('text', { x: MARGEM.esquerda, y: PAINEL.forma.topo - 6, class: 'cg-titulo-painel' }, 'FORMA'));
    for (const v of [5, 0, -10, -30].filter((x) => x < formaMax && x > formaMin + 2)) {
      raizSvg.append(
        svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: yForma(v), y2: yForma(v), class: 'cg-limite' }),
        svg('text', { x: MARGEM.esquerda - 8, y: yForma(v) + 4, 'text-anchor': 'end', class: 'cg-rotulo' }, v > 0 ? `+${v}` : v === 0 ? '0' : `−${Math.abs(v)}`),
      );
    }
    const larguraBarra = Math.max(1.5, passoX * 0.7);
    const barras = dias.map((d, i) => {
      const y0 = yForma(0);
      const y1 = yForma(d.forma);
      const barra = svg('rect', {
        x: (px(i) - larguraBarra / 2).toFixed(1),
        y: Math.min(y0, y1).toFixed(1),
        width: larguraBarra.toFixed(1),
        height: Math.max(1, Math.abs(y1 - y0)).toFixed(1),
        class: `cg-barra cg-zona-${d.faixa}${d.projetado ? ' cg-barra-futura' : ''}`,
      });
      return barra;
    });
    raizSvg.append(...barras);

    // atividades do dia, logo acima das barras de Forma: ícone do esporte (com contador quando há mais de uma) ou,
    // com o gráfico denso, um traço fino (empilhado quando há mais de uma), sempre na cor do esporte
    const nomeEsporte = { ciclismo: 'Ciclismo', corrida: 'Corrida', outro: 'Outra atividade' };
    const comIcone = passoX >= 10;
    dias.forEach((d, i) => {
      if (d.projetado) return;
      const esportes = esportesDoDia(d.data);
      const esporte = esportes[0] ?? (d.estresse > 0 ? 'outro' : null);
      if (!esporte) return;
      const quantidade = Math.max(1, esportes.length);
      const titulo = `${rotuloDoDia(d.data)} · ${quantidade > 1 ? `${quantidade} atividades` : (nomeEsporte[esporte] ?? 'Atividade')}`;
      const grupo = svg('g', { class: `cg-atividade cg-esporte-${esporte}` });
      // o marcador assenta logo acima da barra do dia (ou da linha do zero, quando a barra desce)
      const base = Math.min(yForma(0), yForma(d.forma)) - 3;
      const meioFaixa = base - 6;
      if (comIcone) {
        grupo.append(iconeDoEsporte(esporte, px(i), meioFaixa, Math.min(12, passoX * 1.1)));
        if (quantidade > 1) {
          grupo.append(
            svg('circle', { cx: (px(i) + 6).toFixed(1), cy: (meioFaixa - 5).toFixed(1), r: 4.2, class: 'cg-contador-fundo' }),
            svg('text', { x: (px(i) + 6).toFixed(1), y: (meioFaixa - 2.2).toFixed(1), 'text-anchor': 'middle', class: 'cg-contador' }, String(quantidade)),
          );
        }
      } else {
        const largura = Math.max(1.2, Math.min(3, passoX * 0.7)).toFixed(1);
        for (let k = 0; k < Math.min(quantidade, 3); k++) {
          const y2 = base - k * 6;
          grupo.append(svg('line', { x1: px(i).toFixed(1), x2: px(i).toFixed(1), y1: y2 - 4.5, y2, class: 'cg-traco', 'stroke-width': largura }));
        }
      }
      grupo.append(svg('title', {}, titulo));
      raizSvg.append(grupo);
    });
    raizSvg.append(svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: yForma(0), y2: yForma(0), class: 'cg-zero' }));

    // painel 3: peso (contínuo) e meta (tracejada)
    raizSvg.append(svg('text', { x: MARGEM.esquerda, y: PAINEL.peso.topo - 6, class: 'cg-titulo-painel' }, 'PESO E META'));
    if (temPeso) {
      for (const kg of [menorKg, (menorKg + maiorKg) / 2, maiorKg]) {
        raizSvg.append(
          svg('line', { x1: MARGEM.esquerda, x2: L - MARGEM.direita, y1: yPeso(kg), y2: yPeso(kg), class: 'cg-grade' }),
          svg('text', { x: MARGEM.esquerda - 8, y: yPeso(kg) + 4, 'text-anchor': 'end', class: 'cg-rotulo' }, formatarNumero(kg, Number.isInteger(kg) ? 0 : 1)),
        );
      }
      if (pesosNaJanela.length > 0) {
        raizSvg.append(svg('polyline', { points: pesosNaJanela.map((p) => `${px(indiceDe(p.data)).toFixed(1)},${yPeso(p.kg).toFixed(1)}`).join(' '), class: 'cg-linha cg-peso' }));
      }
      if (metaLinha) {
        const de = indiceDe(metaLinha.de.data);
        const ate = indiceDe(metaLinha.ate.data);
        if (de >= 0 && ate >= 0) {
          raizSvg.append(svg('polyline', { points: `${px(de).toFixed(1)},${yPeso(metaLinha.de.kg).toFixed(1)} ${px(ate).toFixed(1)},${yPeso(metaLinha.ate.kg).toFixed(1)}`, class: 'cg-linha cg-peso cg-tracejada' }));
        }
      }
    }

    // divisória "Hoje" e rótulos do calendário
    if (temFuturo) {
      raizSvg.append(
        svg('line', { x1: px(indiceHoje), x2: px(indiceHoje), y1: PAINEL.cond.topo, y2: PAINEL.peso.topo + PAINEL.peso.alto, class: 'cg-hoje' }),
        svg('text', { x: px(indiceHoje), y: EIXO_X + 14, 'text-anchor': 'middle', class: 'cg-hoje-rotulo' }, 'HOJE'),
      );
    }
    const marcas = Math.min(n > 60 ? 6 : 5, n);
    const anoNoRotulo = n > 200;
    for (let k = 0; k < marcas; k++) {
      const i = Math.round((k / (marcas - 1 || 1)) * (n - 1));
      const [ano, mes, dia] = dias[i].data.split('-');
      const texto = anoNoRotulo ? `${MESES_CURTOS[Number(mes) - 1]} ${ano.slice(2)}` : `${Number(dia)} ${MESES_CURTOS[Number(mes) - 1]}`;
      const ancora = k === 0 ? 'start' : k === marcas - 1 ? 'end' : 'middle';
      if (temFuturo && Math.abs(i - indiceHoje) < n * 0.07) continue; // não colide com "HOJE"
      raizSvg.append(svg('text', { x: px(i), y: EIXO_X, 'text-anchor': ancora, class: 'cg-rotulo' }, texto));
    }

    // interação: guia vertical, um ponto por série e a barra do dia em destaque
    const guia = svg('line', { y1: PAINEL.cond.topo, y2: PAINEL.peso.topo + PAINEL.peso.alto, class: 'cg-guia', visibility: 'hidden' });
    const pontoCond = svg('circle', { r: 4.5, class: 'cg-ponto cg-ponto-fitness', visibility: 'hidden' });
    const pontoFadiga = svg('circle', { r: 4.5, class: 'cg-ponto cg-ponto-fadiga', visibility: 'hidden' });
    const pontoForma = svg('circle', { r: 4.5, class: 'cg-ponto cg-ponto-forma', visibility: 'hidden' });
    const pontoPeso = svg('circle', { r: 4.5, class: 'cg-ponto cg-ponto-peso', visibility: 'hidden' });
    raizSvg.append(guia, pontoCond, pontoFadiga, pontoForma, pontoPeso);

    const dica = h('div', { class: 'cg-dica', role: 'status', hidden: true });
    const area = h('div', { class: 'cg-area-grafico' }, raizSvg, dica);

    if (!temPeso) {
      area.append(
        h(
          'div',
          { class: 'cg-peso-vazio', style: `top:${(PAINEL.peso.topo / ALTURA) * 100}%;height:${(PAINEL.peso.alto / ALTURA) * 100}%;left:${(MARGEM.esquerda / L) * 100}%;right:${(MARGEM.direita / L) * 100}%` },
          h('span', null, 'Sem registros de peso. '),
          h('a', { href: '#/peso' }, 'Cadastrar peso'),
        ),
      );
    }

    /** Linhas do treino do dia: o feito, o planejado ou "Descanso". */
    function linhasDoTreino(data) {
      const bruto = treinoDoDia(data);
      const linhas = (Array.isArray(bruto) ? bruto : [bruto]).filter(Boolean).map((l) => (typeof l === 'string' ? { texto: l, esporte: null } : l));
      return linhas.length > 0 ? linhas : [{ texto: 'Descanso', esporte: 'preguica', piada: piadaDoDia(data) }];
    }

    /** Uma linha do treino, com o ícone do esporte à esquerda quando se sabe qual é. */
    const linhaDeTreino = (t, classe) =>
      h('p', { class: classe ?? 'cg-treino-linha' }, t.esporte ? iconeSolto(t.esporte, 18) : null, h('span', null, t.texto));

    // ---- coluna lateral ----
    const lateral = lateralDoDia();
    function lateralDoDia() {
      const rotuloDia = h('p', { class: 'cg-dia-rotulo' });
      const numero = h('p', { class: 'cg-dia-forma' });
      const chip = h('span', { class: 'cg-chip' });
      const treino = h('div', { class: 'cg-dia-treino' });
      const cartaoDia = h('div', { class: 'cg-cartao' }, rotuloDia, h('div', { class: 'cg-dia-linha' }, numero, chip), h('p', { class: 'cg-mini-rotulo' }, 'Treino'), treino);

      const marcador = h('span', { class: 'cg-regua-marcador', 'aria-hidden': 'true' });
      const segmentos = FAIXAS_FORMA.map((f, i) => {
        const sup = i === 0 ? ESCALA_REGUA.max : FAIXAS_FORMA[i - 1].acimaDe;
        const inf = Math.max(f.acimaDe, ESCALA_REGUA.min);
        return { f, sup, inf };
      });
      const total = ESCALA_REGUA.max - ESCALA_REGUA.min;
      const pct = (v) => ((ESCALA_REGUA.max - v) / total) * 100;
      const regua = h(
        'div',
        { class: 'cg-regua' },
        h('div', { class: 'cg-regua-barra' }, ...segmentos.map(({ f, sup, inf }) => h('span', { class: `cg-regua-seg cg-zona-${f.id}`, style: `flex:${sup - inf}` }))),
        marcador,
        ...segmentos.map(({ f, sup, inf }) => h('span', { class: 'cg-regua-nome', style: `top:${pct((sup + inf) / 2)}%` }, f.rotulo)),
        ...LIMITES_REGUA.map((v) => h('span', { class: 'cg-regua-limite', style: `top:${pct(v)}%` }, v > 0 ? `+${v}` : `−${Math.abs(v)}`)),
      );
      const cartaoRegua = h('div', { class: 'cg-cartao' }, h('h3', { class: 'cg-subtitulo' }, 'Régua de zonas'), regua);

      const legenda = h(
        'ul',
        { class: 'cg-legenda' },
        h('li', null, h('span', { class: 'cg-amostra cg-amostra-fitness' }), 'Condicionamento'),
        h('li', null, h('span', { class: 'cg-amostra cg-amostra-fadiga' }), 'Fadiga'),
        h('li', null, h('span', { class: 'cg-amostra cg-amostra-peso' }), 'Peso'),
        h('li', null, h('span', { class: 'cg-amostra cg-amostra-plano' }), 'Plano e meta'),
        h('li', null, h('span', { class: 'cg-amostra-esporte cg-esporte-ciclismo' }), 'Ciclismo'),
        h('li', null, h('span', { class: 'cg-amostra-esporte cg-esporte-corrida' }), 'Corrida'),
        h('li', null, h('span', { class: 'cg-amostra-esporte cg-esporte-outro' }), 'Outro')
      );

      return {
        raiz: h('div', { class: 'cg-lateral' }, cartaoDia, cartaoRegua, legenda),
        mostrar(d) {
          const faixa = FAIXAS_FORMA.find((f) => f.id === d.faixa);
          rotuloDia.textContent = `${statusDoDia(d.data, hoje)} · ${rotuloDoDia(d.data)}`;
          numero.textContent = sinalDaForma(d.forma).replace('−', '-'); // a Anton não tem o sinal de menos
          numero.setAttribute('aria-label', `Forma ${sinalDaForma(d.forma)}`);
          chip.textContent = faixa?.rotulo ?? '';
          chip.className = `cg-chip cg-zona-${d.faixa}`;
          treino.replaceChildren(...linhasDoTreino(d.data).flatMap((t) => [linhaDeTreino(t), t.piada ? h('p', { class: 'cg-piada' }, t.piada) : null]).filter(Boolean));
          marcador.style.top = `${pct(Math.min(ESCALA_REGUA.max, Math.max(ESCALA_REGUA.min, d.forma)))}%`;
        },
      };
    }
    lateral.mostrar(dias[indiceHoje]);

    // ---- hover e toque ----
    const linhaDica = (rotulo, valor, classe) =>
      h('div', { class: `cg-dica-linha${classe ? ` ${classe}` : ''}` }, h('span', null, rotulo), h('strong', null, valor));

    function destacar(i) {
      const d = dias[i];
      const x = px(i);
      guia.setAttribute('x1', x);
      guia.setAttribute('x2', x);
      guia.setAttribute('visibility', 'visible');
      for (const [ponto, y] of [[pontoCond, yCond(d.fitness)], [pontoFadiga, yCond(d.fadiga)], [pontoForma, yForma(d.forma)]]) {
        ponto.setAttribute('cx', x);
        ponto.setAttribute('cy', y);
        ponto.setAttribute('visibility', 'visible');
      }
      const kg = pesoPorDia.get(d.data) ?? null;
      const kgMeta = d.data > hoje ? valorDaMeta(d.data, metaLinha) : null;
      const valorPeso = kg ?? kgMeta;
      if (valorPeso !== null) {
        pontoPeso.setAttribute('cx', x);
        pontoPeso.setAttribute('cy', yPeso(valorPeso));
        pontoPeso.setAttribute('visibility', 'visible');
      } else {
        pontoPeso.setAttribute('visibility', 'hidden');
      }
      barras.forEach((b, k) => b.classList.toggle('cg-barra-ativa', k === i));

      const faixa = FAIXAS_FORMA.find((f) => f.id === d.faixa);
      const treinos = linhasDoTreino(d.data);
      dica.replaceChildren(...[
        h('p', { class: 'cg-dica-topo' }, `${statusDoDia(d.data, hoje)} · ${rotuloDoDia(d.data)}`),
        ...treinos.map((t) => linhaDeTreino(t, 'cg-treino-linha cg-dica-treino')),
        linhaDica('Condicionamento', formatarNumero(d.fitness, 1), 'cg-dica-fitness'),
        linhaDica('Fadiga', formatarNumero(d.fadiga, 1)),
        linhaDica('Forma', `${sinalDaForma(d.forma)} · ${faixa?.rotulo ?? ''}`),
        kg !== null ? linhaDica('Peso', `${formatarNumero(kg, 1)} kg`, 'cg-dica-peso') : kgMeta !== null ? linhaDica('Meta', `${formatarNumero(kgMeta, 1)} kg`, 'cg-dica-peso') : null,
      ].filter(Boolean));
      dica.hidden = false;
      const pct = (x / L) * 100;
      dica.style.left = `${pct}%`;
      dica.classList.toggle('cg-dica-esquerda', pct > 65); // passa de ~65% da largura, vira para a esquerda
      lateral.mostrar(d);
    }

    function limpar() {
      guia.setAttribute('visibility', 'hidden');
      for (const p of [pontoCond, pontoFadiga, pontoForma, pontoPeso]) p.setAttribute('visibility', 'hidden');
      barras.forEach((b) => b.classList.remove('cg-barra-ativa'));
      dica.hidden = true;
      lateral.mostrar(dias[indiceHoje]); // sem hover, o dia selecionado volta a ser Hoje
    }

    const indiceDoPonteiro = (e) => {
      const caixa = raizSvg.getBoundingClientRect();
      const xSvg = ((e.clientX - caixa.left) / (caixa.width || 1)) * L;
      return Math.min(n - 1, Math.max(0, Math.floor(((xSvg - MARGEM.esquerda) / LARGURA) * n)));
    };
    area.addEventListener('pointermove', (e) => destacar(indiceDoPonteiro(e)));
    area.addEventListener('pointerdown', (e) => destacar(indiceDoPonteiro(e)));
    area.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') limpar(); // no toque, a seleção fica até o próximo toque
    });

    return h('div', { class: 'cg-corpo' }, h('div', { class: 'cg-principal' }, area), lateral.raiz);
  }

  desenhar();
  return raiz;
}

/** Dias de projeção que o Início pede ao plano (o maior período mostra até 28). */
export const DIAS_DE_PLANO = 28;
