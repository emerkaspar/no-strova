import { totaisDaSemana } from '@no-strova/domain';
import { recortarJanela } from '../../application/plano.js';
import { destaqueDoInicio } from '../../application/inicio.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { graficoForma } from '../../utils/graficoForma.js';
import { pedirImportacao } from '../atividades/state.js';
import { criarDicaZonas } from './dicaZonas.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEM_HRSS = 'Disponível quando houver atividades com HRSS calculado.';

function cabecalhoDoBloco(titulo, extra) {
  return h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, titulo), extra ?? null);
}

/**
 * O número da Forma: a parte inteira gigante e a decimal menor ao lado (ex.: "+0" e ",2").
 * A Anton não tem o sinal de menos tipográfico: o número usa o hífen.
 */
function numeroGrande(numero) {
  const [inteiro, decimal] = numero.replace('−', '-').split(',');
  return h(
    'p',
    { class: 'hero-numero', 'aria-label': `Forma hoje: ${numero}` },
    h('span', { class: 'hero-inteiro' }, inteiro),
    decimal === undefined ? null : h('span', { class: 'hero-decimal' }, `,${decimal}`),
  );
}

/**
 * 1. Bloco de destaque: a Forma de hoje em número grande, com a cor da zona (ótima = laranja da marca, fresca =
 * verde, neutra = cinza, transição = azul, sobrecarga = vermelho) e quatro dados menores. A frase e a explicação
 * das zonas ficam no hint do chip e do número. Ver destaqueDoInicio.
 */
export function blocoForma({ serie, carregou, semHrss = false }) {
  if (!carregou) {
    return h('section', { class: 'hero hero-modo-vazio', 'aria-label': 'Destaque do dia' }, h('p', { class: 'hero-rotulo' }, 'Hoje'), h('p', { class: 'hero-texto' }, 'Carregando…'));
  }
  const d = destaqueDoInicio(serie, { semHrss });
  const cta = d.cta.href
    ? h('a', { class: 'btn-hero', href: d.cta.href }, d.cta.rotulo)
    : h('button', { class: 'btn-hero', type: 'button', onClick: pedirImportacao }, d.cta.rotulo);

  if (d.tipo === 'vazio') {
    return h(
      'section',
      { class: 'hero hero-modo-vazio', 'aria-label': 'Destaque do dia' },
      h('p', { class: 'hero-rotulo' }, d.rotulo),
      h('p', { class: 'hero-chamada' }, d.titulo),
      h('p', { class: 'hero-texto' }, d.texto),
      cta,
    );
  }

  const estatisticas = d.estatisticas.map((e) =>
    h(
      'li',
      { class: `hero-dado hero-dado-${e.id}` },
      h('span', { class: 'hero-dado-rotulo' }, e.rotulo),
      h('strong', { class: 'hero-dado-valor' }, e.valor),
      e.nota ? h('span', { class: 'hero-dado-nota' }, e.nota) : null,
    ),
  );
  // O chip e o número abrem o hint que explica as zonas e destaca a atual.
  const dica = criarDicaZonas({ zonaAtual: d.zona, rotuloChip: d.chip, valor: d.numero, resumo: d.titulo });
  const numero = numeroGrande(d.numero);
  dica.ligarGatilho(numero);
  return h(
    'section',
    { class: `hero hero-modo-numero hero-zona-${d.zona}`, 'aria-label': 'Forma hoje' },
    h('div', { class: 'hero-topo' }, h('p', { class: 'hero-rotulo' }, d.rotulo), dica.raiz),
    numero,
    h('ul', { class: 'hero-dados' }, ...estatisticas),
    cta,
  );
}

/**
 * 2. Cartão "Carga e fadiga": Fitness e Fadiga dos últimos 21 dias, com o marcador de hoje e, se houver treinos
 * planejados, a projeção tracejada dos próximos dias. `serie` vem de montarProjecao (itens com `projetado`).
 */
export function blocoGrafico({ serie, carregou }) {
  const temProjecao = serie.some((d) => d.projetado);
  const legenda = h(
    'ul',
    { class: 'legenda-inline' },
    h('li', null, h('span', { class: 'amostra amostra-fitness' }), ' Fitness'),
    h('li', null, h('span', { class: 'amostra amostra-fadiga' }), ' Fadiga'),
    temProjecao ? h('li', null, h('span', { class: 'amostra amostra-projecao' }), ' Projeção') : null,
  );
  const conteudo =
    carregou && serie.length > 0
      ? graficoForma(recortarJanela(serie, 21), { barras: false, faixas: false, series: ['fitness', 'fadiga'], marcarHoje: true, projecao: true })
      : estadoVazio(carregou ? SEM_HRSS : 'Carregando…');
  return h(
    'section',
    { class: 'card bloco-grafico' },
    cabecalhoDoBloco('Carga e fadiga', legenda),
    conteudo,
    serie.length > 0 ? h('p', { class: 'bloco-rodape' }, h('a', { href: '#/forma' }, 'Ver gráfico completo')) : null,
  );
}

function tituloDaSemana(semana) {
  const [primeiro, ultimo] = [semana[0], semana[6]];
  const mes = (d) => MESES[Number(d.data.slice(5, 7)) - 1];
  const dia = (d) => Number(d.dia);
  return mes(primeiro) === mes(ultimo)
    ? `Semana de ${dia(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`
    : `Semana de ${dia(primeiro)} de ${mes(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`;
}

function tituloDoDia(atividadesDoDia) {
  if (atividadesDoDia.length === 0) return null;
  if (atividadesDoDia.length > 1) return `${atividadesDoDia.length} atividades`;
  const a = atividadesDoDia[0];
  return `${ROTULO_ESPORTE[a.esporte] ?? a.esporte}${a.distanciaM ? ` ${formatarDistancia(a.distanciaM)}` : ''}`;
}

function tituloDoTreino(treinosDoDia) {
  if (treinosDoDia.length === 0) return null;
  if (treinosDoDia.length > 1) return `${treinosDoDia.length} treinos`;
  const t = treinosDoDia[0];
  return `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.zona}`;
}

/** 3. Semana atual em 7 colunas: realizado cheio, planejado tracejado, descanso mínimo. */
export function blocoSemana({ semana, atividades, treinos = [], carregou }) {
  const totais = totaisDaSemana(semana);
  const resumo =
    totais.planejado > 0
      ? `Carga total prevista: ${formatarNumero(totais.realizado + totais.planejado, 0)} · realizada até hoje: ${formatarNumero(totais.realizado, 0)}`
      : `Realizada até hoje: ${formatarNumero(totais.realizado, 0)}`;
  const cabecalho = cabecalhoDoBloco(tituloDaSemana(semana), h('p', { class: 'texto-secundario bloco-resumo' }, resumo));

  if (!carregou || (totais.realizado === 0 && totais.planejado === 0)) {
    return h(
      'section',
      { class: 'card bloco-semana' },
      cabecalho,
      estadoVazio(
        carregou ? 'Nenhum treino nesta semana ainda.' : 'Carregando…',
        carregou ? { href: '#/plano', rotulo: 'Planejar a semana' } : null,
      ),
    );
  }

  const maximo = Math.max(1, ...semana.flatMap((d) => [d.realizado, d.planejado]));
  const porDia = new Map();
  for (const a of atividades) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a]);
  const planoPorDia = new Map();
  for (const t of treinos) planoPorDia.set(t.data, [...(planoPorDia.get(t.data) ?? []), t]);

  const colunas = semana.map((d) => {
    const titulo = tituloDoDia(porDia.get(d.data) ?? []) ?? tituloDoTreino(planoPorDia.get(d.data) ?? []);
    const descanso = d.realizado === 0 && d.planejado === 0;
    const valor =
      d.realizado > 0
        ? `${formatarNumero(d.realizado, 0)} · feito`
        : d.planejado > 0
          ? `~${formatarNumero(d.planejado, 0)} · plano`
          : '—';
    const barras = h(
      'div',
      { class: 'dia-barras', role: 'img', 'aria-label': `${d.nome}, dia ${Number(d.dia)}: ${descanso ? 'sem treino' : valor}` },
      d.planejado > 0 ? h('span', { class: 'barra-planejada', style: `height:${Math.max(6, (d.planejado / maximo) * 100)}%` }) : null,
      d.realizado > 0 ? h('span', { class: 'barra-real', style: `height:${Math.max(6, (d.realizado / maximo) * 100)}%` }) : null,
      descanso ? h('span', { class: 'barra-descanso' }) : null,
    );
    return h(
      'li',
      { class: `dia${d.hoje ? ' dia-hoje' : ''}${descanso ? ' dia-descanso' : ''}`, 'aria-current': d.hoje ? 'date' : null },
      barras,
      h('p', { class: 'dia-rotulo' }, `${d.rotulo} ${Number(d.dia)}${d.hoje ? ' · HOJE' : ''}`),
      h('p', { class: 'dia-titulo' }, titulo ?? (d.planejado > 0 ? 'Treino planejado' : d.futuro ? 'Sem plano' : 'Descanso')),
      h('p', { class: 'dia-valor' }, valor),
    );
  });

  return h('section', { class: 'card bloco-semana' }, cabecalho, h('ul', { class: 'semana' }, ...colunas));
}

/** 4a. Últimas atividades: tabela real com as cinco mais recentes. */
export function blocoAtividades({ atividades, carregou }) {
  const topo = cabecalhoDoBloco('Últimas atividades');
  if (!carregou || atividades.length === 0) {
    return h(
      'section',
      { class: 'card bloco-atividades' },
      topo,
      estadoVazio(carregou ? 'Nenhuma atividade ainda.' : 'Carregando…', carregou ? { href: '#/atividades', rotulo: 'Importar arquivo' } : null),
    );
  }
  const linhas = atividades.map((a) =>
    h(
      'tr',
      null,
      h('td', null, h('a', { class: 'link-data', href: `#/atividades/${a.id}` }, formatarData(a.data))),
      h('td', null, ROTULO_ESPORTE[a.esporte] ?? a.esporte),
      h('td', null, formatarDuracao(a.duracaoS)),
      h('td', null, formatarDistancia(a.distanciaM)),
      h('td', null, a.fcMedia ? `${a.fcMedia} bpm` : '—'),
      h('td', { class: 'celula-hrss' }, a.hrss === null || a.hrss === undefined ? '—' : formatarNumero(a.hrss, 1)),
    ),
  );
  return h(
    'section',
    { class: 'card bloco-atividades' },
    topo,
    h(
      'div',
      { class: 'tabela-wrap' },
      h(
        'table',
        { class: 'tabela tabela-compacta' },
        h('thead', null, h('tr', null, ...['Data', 'Esporte', 'Duração', 'Distância', 'FC média', 'HRSS'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, ...linhas),
      ),
    ),
    h('p', { class: 'bloco-rodape' }, h('a', { href: '#/atividades' }, 'Ver todas')),
  );
}

/** 4b. Peso e meta: sem registros até a tela de peso existir. */
export function blocoPeso() {
  return h(
    'section',
    { class: 'card bloco-peso' },
    cabecalhoDoBloco('Peso'),
    estadoVazio('Disponível quando houver registro de peso.', { href: '#/peso', rotulo: 'Abrir Peso' }),
  );
}

/** 4c. Sugestão (rascunho da IA): sem conteúdo até haver plano de treino. */
export function blocoSugestao() {
  return h(
    'section',
    { class: 'card bloco-sugestao' },
    cabecalhoDoBloco('Sugestão'),
    estadoVazio('Disponível quando houver plano de treino.'),
  );
}
