import { diasEntre, progressoDaMetaPeso, resumoDePeso, somarDias, totaisDaSemana } from '@no-strova/domain';
import { destaqueDoInicio } from '../../application/inicio.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarDuracaoCurta, formatarNumero } from '../../utils/formatters.js';
import { pedirImportacao } from '../atividades/state.js';
import { criarDicaZonas } from './dicaZonas.js';
import { criarGraficoPrincipal } from './graficoPrincipal.js';
import { cartaoMetaCondicionamento, cartaoProximoTreino, cartaoSequencia, progressoDaCarga, resumoDaSemana } from './semanaExtras.js';
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
 * 2. Gráfico principal: Condicionamento, fadiga e forma com o plano projetado, Peso e meta e a coluna lateral do
 * dia selecionado (ver graficoPrincipal.js). `serie` vem de montarProjecao (itens com `projetado`).
 */
export function blocoGrafico({ serie, carregou, hoje, treinoDoDia, esportesDoDia, pesos = [], metaPeso = null, aoClicarDia = null, diaClicavel = null }) {
  if (!carregou || serie.length === 0) {
    return h(
      'section',
      { class: 'card bloco-grafico' },
      cabecalhoDoBloco('Condicionamento, fadiga e forma'),
      estadoVazio(carregou ? SEM_HRSS : 'Carregando…'),
    );
  }
  return criarGraficoPrincipal({ serie, hoje, treinoDoDia, esportesDoDia, pesos, metaPeso, aoClicarDia, diaClicavel });
}

function tituloDaSemana(semana) {
  const [primeiro, ultimo] = [semana[0], semana[6]];
  const mes = (d) => MESES[Number(d.data.slice(5, 7)) - 1];
  const dia = (d) => Number(d.dia);
  return mes(primeiro) === mes(ultimo)
    ? `Semana de ${dia(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`
    : `Semana de ${dia(primeiro)} de ${mes(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`;
}

export function tituloDoDia(atividadesDoDia) {
  if (atividadesDoDia.length === 0) return null;
  if (atividadesDoDia.length > 1) return `${atividadesDoDia.length} atividades`;
  const a = atividadesDoDia[0];
  return `${ROTULO_ESPORTE[a.esporte] ?? a.esporte}${a.distanciaM ? ` ${formatarDistancia(a.distanciaM)}` : ''}`;
}

export function tituloDoTreino(treinosDoDia) {
  if (treinosDoDia.length === 0) return null;
  if (treinosDoDia.length > 1) return `${treinosDoDia.length} treinos`;
  const t = treinosDoDia[0];
  return t.nomeTreino ?? `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.zona}`;
}

/** Mini-cartões sob o destaque: o próximo treino planejado, a sequência de semanas com treino e a meta de Condicionamento. */
export function blocoMinis({ proximo, sequencia, metaCondicionamento = null, avaliacaoCondicionamento = null, condicionamentoAtual = null }) {
  return h(
    'div',
    { class: 'semana-minis' },
    cartaoProximoTreino(proximo),
    cartaoSequencia(sequencia),
    cartaoMetaCondicionamento({ meta: metaCondicionamento, avaliacao: avaliacaoCondicionamento, condicionamentoAtual }),
  );
}

/** 3. Semana atual em 7 colunas: realizado cheio, planejado tracejado, descanso mínimo. */
export function blocoSemana({ semana, atividades, treinos = [], carregou, comparativo = null }) {
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
      h('p', { class: 'dia-titulo' }, titulo ?? (d.planejado > 0 ? 'Treino planejado' : d.futuro ? 'Livre' : 'Descanso')),
      h('p', { class: 'dia-valor' }, valor),
    );
  });

  // abaixo das barras: resumo da semana e progresso da carga
  const extras =
    comparativo
      ? h(
          'div',
          { class: 'semana-extras' },
          resumoDaSemana(comparativo),
          progressoDaCarga(totais),
        )
      : null;
  return h('section', { class: 'card bloco-semana' }, cabecalho, h('ul', { class: 'semana' }, ...colunas), extras);
}

/** Segundos → "1h 05min" ou "30min" (totais, sem segundos). */
function duracaoTotal(segundos) {
  const minutos = Math.round(segundos / 60);
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas}h ${String(minutos % 60).padStart(2, '0')}min` : `${minutos}min`;
}

/** Variação em %: seta para cima (verde), para baixo (vermelha) ou traço quando igual; "novo" se antes era zero. */
function indicadorDeVariacao(atual, anterior) {
  const diferenca = atual - anterior;
  if (diferenca === 0) return h('span', { class: 'comp-var comp-igual', title: 'Igual ao período anterior' }, atual === 0 ? '—' : '= igual');
  const sobe = diferenca > 0;
  const texto = anterior > 0 ? `${formatarNumero((Math.abs(diferenca) / anterior) * 100, 0)}%` : 'novo';
  return h('span', { class: `comp-var ${sobe ? 'comp-sobe' : 'comp-desce'}`, title: sobe ? 'Acima do período anterior' : 'Abaixo do período anterior' }, icone(sobe ? 'setaCima' : 'setaBaixo', 14), texto);
}

function secaoComparativa({ titulo, referencia, comparativo }) {
  const { atual, anterior } = comparativo;
  const linhas = [
    ['duracao', 'Tempo', atual.duracaoS, anterior.duracaoS, duracaoTotal],
    ['hrss', 'HRSS', atual.carga, anterior.carga, (v) => formatarNumero(v, 0)],
    ['distancia', 'Distância', atual.distanciaM, anterior.distanciaM, (m) => formatarDistancia(m)],
  ];
  return h(
    'div',
    { class: 'comp-secao' },
    h('h3', { class: 'comp-titulo' }, titulo),
    h('p', { class: 'comp-ref' }, referencia),
    h(
      'ul',
      { class: 'comp-lista' },
      ...linhas.map(([ic, rotulo, a, b, fmt]) =>
        h(
          'li',
          { class: 'comp-linha' },
          h('span', { class: 'comp-rotulo', title: rotulo }, icone(ic, 16), h('span', { class: 'comp-rotulo-texto' }, rotulo)),
          h('strong', { class: 'comp-valor' }, a > 0 ? fmt(a) : '—'),
          indicadorDeVariacao(a, b),
          h('span', { class: 'comp-antes' }, `antes ${b > 0 ? fmt(b) : '—'}`),
        ),
      ),
    ),
  );
}

/** Comparativo de treinos: semana atual × semana passada e mês atual × mês anterior (mesmo trecho de cada um). */
export function blocoComparativo({ semana, mes, hoje, carregou }) {
  const topo = cabecalhoDoBloco('Comparativo');
  if (!carregou) return h('section', { class: 'card bloco-comparativo' }, topo, estadoVazio('Carregando…'));
  const mesAtual = Number(hoje.slice(5, 7)) - 1;
  return h(
    'section',
    { class: 'card bloco-comparativo' },
    topo,
    h(
      'div',
      { class: 'comp-secoes' },
      secaoComparativa({ titulo: 'Semana', referencia: 'Até hoje, contra o mesmo trecho da semana passada.', comparativo: semana }),
      secaoComparativa({ titulo: 'Mês', referencia: `1 a ${Number(hoje.slice(8))} de ${MESES[mesAtual]}, contra o mesmo trecho de ${MESES[(mesAtual + 11) % 12]}.`, comparativo: mes }),
    ),
  );
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
      h('td', { class: 'celula-esporte' }, h('span', { role: 'img', title: ROTULO_ESPORTE[a.esporte] ?? a.esporte, 'aria-label': ROTULO_ESPORTE[a.esporte] ?? a.esporte }, icone(a.esporte === 'ciclismo' || a.esporte === 'corrida' ? a.esporte : 'outro', 20))),
      h('td', null, formatarDuracaoCurta(a.duracaoS)),
      h('td', null, formatarDistancia(a.distanciaM)),
      h('td', { class: 'celula-hrss' }, a.hrss === null || a.hrss === undefined ? '—' : formatarNumero(a.hrss, 1)),
      h('td', null, a.fcMedia ? String(a.fcMedia) : '—'),
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
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ...[
              ['plano', 'Data'],
              ['esporte', 'Esporte'],
              ['duracao', 'Duração'],
              ['distancia', 'Distância'],
              ['hrss', 'HRSS'],
              ['fc', 'FC média (bpm)'],
            ].map(([ic, t]) => h('th', { scope: 'col', title: t, 'aria-label': t }, icone(ic, 16))),
          ),
        ),
        h('tbody', null, ...linhas),
      ),
    ),
    h('p', { class: 'bloco-rodape' }, h('a', { href: '#/atividades' }, 'Ver todas')),
  );
}

/** 4b. Peso e meta: peso atual, tendência semanal e o progresso da meta; sem pesagens, convida a registrar. */
export function blocoPeso({ pesagens = [], meta = null, hoje, carregou = true } = {}) {
  const topo = cabecalhoDoBloco('Peso');
  const r = resumoDePeso(pesagens, hoje);
  if (!carregou || !r.atual) {
    return h(
      'section',
      { class: 'card bloco-peso' },
      topo,
      estadoVazio(carregou ? 'Sem pesagens ainda.' : 'Carregando…', carregou ? { href: '#/peso', rotulo: 'Registrar peso' } : null),
    );
  }
  const sinal = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), 1)}`;
  const progresso = meta ? progressoDaMetaPeso({ pesoInicialKg: meta.pesoInicialKg, pesoAtualKg: r.atual.pesoKg, pesoAlvoKg: meta.pesoAlvoKg }) : null;
  const pct = progresso === null ? null : Math.round(progresso * 100);
  return h(
    'section',
    { class: 'card bloco-peso' },
    topo,
    h('p', { class: 'peso-inicio-valor' }, h('strong', null, `${formatarNumero(r.atual.pesoKg, 1)} kg`), h('span', { class: 'texto-secundario' }, ` em ${formatarData(r.atual.data)}`)),
    h('p', { class: 'texto-secundario' }, r.semanalKg === null ? 'Tendência: registre pesagens por duas semanas.' : `Tendência: ${sinal(r.semanalKg)} kg por semana`),
    meta
      ? h(
          'div',
          { class: 'peso-inicio-meta' },
          h('p', { class: 'texto-secundario' }, `Meta: ${formatarNumero(meta.pesoAlvoKg, 1)} kg até ${formatarData(meta.dataAlvo)}${pct === null ? '' : ` · ${pct}%`} · faltam ${formatarNumero(Math.abs(r.atual.pesoKg - meta.pesoAlvoKg), 1)} kg`),
          pct === null ? null : h('div', { class: 'semana-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso da meta de peso' }, h('span', { style: `width:${pct}%` })),
        )
      : h('p', { class: 'texto-secundario' }, 'Sem meta de peso. ', h('a', { href: '#/peso' }, 'Definir meta')),
    h('p', { class: 'bloco-rodape' }, h('a', { href: '#/peso' }, 'Abrir Peso')),
  );
}

/**
 * 4c. Registro de peso: há quantos dias o usuário não pesa, a última pesagem e quantas vezes pesou nos últimos 30 dias.
 * Até 3 dias sem pesar está tudo bem; de 4 a 7 pede atenção; acima disso, alerta.
 */
export function blocoRegistroDePeso({ pesagens = [], hoje, carregou = true } = {}) {
  const topo = cabecalhoDoBloco('Registro de peso');
  if (!carregou) return h('section', { class: 'card bloco-registro-peso' }, topo, estadoVazio('Carregando…'));
  const datas = pesagens.map((p) => p.data).filter((d) => typeof d === 'string' && d <= hoje).sort();
  const ultima = datas[datas.length - 1] ?? null;
  if (!ultima) {
    return h('section', { class: 'card bloco-registro-peso' }, topo, estadoVazio('Você ainda não registrou o peso.', { href: '#/peso', rotulo: 'Registrar peso' }));
  }
  const dias = diasEntre(ultima, hoje);
  const gravidade = dias <= 3 ? 'ok' : dias <= 7 ? 'atencao' : 'alerta';
  const ultimoPeso = pesagens.find((p) => p.data === ultima)?.pesoKg;
  const limite = somarDias(hoje, -29);
  const noMes = new Set(datas.filter((d) => d >= limite)).size;
  const grande = dias === 0 ? 'Hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const frase = dias === 0 ? 'Você já registrou o peso de hoje.' : `sem registrar o peso (última pesagem em ${formatarData(ultima)})`;
  return h(
    'section',
    { class: 'card bloco-registro-peso' },
    topo,
    h('p', { class: `registro-peso-valor peso-${gravidade}` }, h('strong', null, grande)),
    h('p', { class: 'texto-secundario' }, frase),
    h(
      'ul',
      { class: 'registro-peso-lista' },
      h('li', null, h('span', { class: 'texto-secundario' }, 'Último peso'), h('strong', null, ultimoPeso === undefined ? '—' : `${formatarNumero(ultimoPeso, 1)} kg`)),
      h('li', null, h('span', { class: 'texto-secundario' }, 'Dias pesados em 30 dias'), h('strong', null, String(noMes))),
    ),
    h('p', { class: 'bloco-rodape' }, h('a', { href: '#/peso' }, dias === 0 ? 'Abrir Peso' : 'Registrar peso agora')),
  );
}
