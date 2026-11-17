import {
  candidatosAoDesacoplamento,
  comparativoDeEsforcos,
  comparativoNaFc,
  desacoplamentoDaSerie,
  diasEntre,
  ESPORTE_PADRAO_DE_DESEMPENHO,
  JANELA_EFICIENCIA_DIAS,
  leituraDoDesacoplamento,
  mediaMovelNosTreinos,
  MOTIVOS_DE_EXCLUSAO,
  pontosDeDesempenho,
  resumoDeDesempenho,
  sequenciaSemanal,
  somarDias,
  vdotDosMelhoresEsforcos,
  velocidadeNaFc,
  vereditoDeEvolucao,
  zonasPendentes,
} from '@no-strova/domain';
import { completarAtividades } from '../../application/completarAtividades.js';
import { lerSerieDetalhe } from '../../infrastructure/atividadesRepo.js';
import { h } from '../../utils/dom.js';
import { tempoDeEsforco } from '../atividades/esforcos.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { passoDoEixo } from '../../utils/graficoLinha.js';
import { caminhoSuave } from '../../utils/graficoAtividade.js';
import { cartaoIndicador } from './cartaoIndicador.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 720;
const A = 260;
const M = { topo: 16, direita: 14, base: 28, esquerda: 46 };

/** Escolhas do painel, mantidas quando a tela de Progressão é redesenhada. `esporte: null` = sem escolha (ciclismo). */
const estadoDesempenho = { esporte: null, dias: 180 };
const ESPORTES = Object.freeze([
  { id: 'corrida', rotulo: 'Corrida' },
  { id: 'ciclismo', rotulo: 'Ciclismo' },
]);
const PERIODOS = Object.freeze([
  { id: 90, rotulo: '3 meses' },
  { id: 180, rotulo: '6 meses' },
  { id: 365, rotulo: '1 ano' },
  { id: 0, rotulo: 'Tudo' },
]);

/** Desacoplamento lido da série detalhada: um treino por vez, guardado para não reler a cada redesenho da tela. */
const desacoplamentos = new Map();
function desacoplamentoDe(atividade) {
  if (!desacoplamentos.has(atividade.id)) {
    desacoplamentos.set(
      atividade.id,
      lerSerieDetalhe(atividade.id)
        .then((serie) => desacoplamentoDaSerie(serie, atividade.esporte))
        .catch(() => {
          desacoplamentos.delete(atividade.id); // erro de leitura: tenta de novo na próxima vez
          return null;
        }),
    );
  }
  return desacoplamentos.get(atividade.id);
}

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

const pct = (v, casas = 1) => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), casas)}%` : null);
/** Ritmo em min/km de uma velocidade em km/h. */
function ritmo(kmh) {
  if (!Number.isFinite(kmh) || kmh <= 0) return '—';
  const s = Math.round(3600 / kmh);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
}
const velocidade = (kmh) => (Number.isFinite(kmh) ? `${formatarNumero(kmh, 1)} km/h` : '—');
/** Tom do cartão pela variação: `melhorQuandoSobe` diz o sentido bom; menos de `limite`% é neutro. */
function gravidadeDe(v, melhorQuandoSobe, limite = 2) {
  if (!Number.isFinite(v) || Math.abs(v) < limite) return '';
  return v > 0 === melhorQuandoSobe ? 'ok' : 'alerta';
}

const TONS = Object.freeze({ melhorou: 'melhor', piorou: 'pior', misto: 'neutro', estavel: 'neutro', 'sem-dados': 'neutro' });

/** Uma linha do "antes × agora": rótulo, duas barras proporcionais (antes e agora) e a variação. */
function linhaAntesAgora({ rotulo, nota, antes, agora, textoAntes, textoAgora, variacao }) {
  const maximo = Math.max(antes ?? 0, agora ?? 0) || 1;
  const largura = (v) => (Number.isFinite(v) ? `${Math.max((v / maximo) * 100, 4).toFixed(1)}%` : '0%');
  const tom = !Number.isFinite(variacao) || Math.abs(variacao) < 2 ? '' : variacao > 0 ? ' dp-comp-melhor' : ' dp-comp-pior';
  return h(
    'li',
    { class: `dp-comp-linha${tom}` },
    h('div', { class: 'dp-comp-titulo' }, h('strong', null, rotulo), nota ? h('span', { class: 'texto-secundario' }, nota) : null),
    h(
      'div',
      { class: 'dp-comp-barras' },
      h('div', { class: 'dp-comp-barra' }, h('span', { class: 'dp-comp-rotulo' }, 'Antes'), h('div', { class: 'dp-comp-trilho' }, h('i', { class: 'dp-comp-enchimento dp-comp-antes', style: `width:${largura(antes)}` })), h('span', { class: 'dp-comp-valor' }, textoAntes)),
      h('div', { class: 'dp-comp-barra' }, h('span', { class: 'dp-comp-rotulo' }, 'Agora'), h('div', { class: 'dp-comp-trilho' }, h('i', { class: 'dp-comp-enchimento dp-comp-agora', style: `width:${largura(agora)}` })), h('span', { class: 'dp-comp-valor' }, textoAgora)),
    ),
    h('strong', { class: 'dp-comp-delta' }, pct(variacao) ?? '—'),
  );
}

/**
 * "Antes × agora": velocidade na mesma FC (60 dias contra os 60 anteriores) e melhor esforço por distância (90 dias contra os
 * 90 anteriores). Só entram linhas com os dois lados, porque sem base de comparação não há evolução para mostrar.
 */
function blocoAntesAgora({ naFc, esforcos, esporte, mostrarVelocidade }) {
  const linhas = [];
  if (naFc && Number.isFinite(naFc.recenteKmh) && Number.isFinite(naFc.anteriorKmh)) {
    linhas.push(
      linhaAntesAgora({
        rotulo: `${esporte === 'corrida' ? 'Ritmo' : 'Velocidade'} a ${naFc.fcRef} bpm`,
        nota: `${naFc.dias} dias × ${naFc.dias} anteriores`,
        antes: naFc.anteriorKmh,
        agora: naFc.recenteKmh,
        textoAntes: mostrarVelocidade(naFc.anteriorKmh),
        textoAgora: mostrarVelocidade(naFc.recenteKmh),
        variacao: naFc.variacaoPct,
      }),
    );
  }
  for (const e of esforcos) {
    if (!e.recente || !e.anterior) continue;
    linhas.push(
      linhaAntesAgora({
        rotulo: `Melhor ${e.rotulo}`,
        nota: e.recorde ? 'novo melhor de todos os tempos' : '90 dias × 90 anteriores',
        antes: e.anterior.velocidadeKmh,
        agora: e.recente.velocidadeKmh,
        textoAntes: `${tempoDeEsforco(e.anterior.tempoS)}`,
        textoAgora: `${tempoDeEsforco(e.recente.tempoS)}`,
        variacao: e.variacaoPct,
      }),
    );
  }
  if (!linhas.length) return h('p', { class: 'texto-secundario dp-comp-vazio' }, 'Sem antes × agora ainda: é preciso ter treino comparável nos dois períodos (e, para os melhores esforços, treinos de arquivo).');
  return h('div', { class: 'dp-comp' }, h('h3', { class: 'dp-titulo-grafico' }, 'Antes × agora'), h('ul', { class: 'dp-comp-lista' }, ...linhas));
}

/**
 * Gráfico da velocidade na mesma FC: um ponto por treino comparável (`valor` em km/h, já ajustado para a FC de referência) e,
 * por cima, a média móvel de 28 dias.
 * @param {{ pontos: Array<{ data: string, valor: number }>, suave: Array<{ data: string, valor: number }>, de: string, ate: string, fcRef: number, textoDoPonto: (p: object) => string }} p
 */
function graficoVelocidadeNaFc({ pontos, suave, de: deSolicitado, ate, fcRef, textoDoPonto }) {
  const dica = h('div', { class: 'grafico-dica', hidden: true });
  const container = h('div', { class: 'grafico dp-grafico' }, dica);
  // o eixo começa perto do primeiro treino: meses vazios no início só espremem os dados
  const primeiro = pontos.reduce((m, p) => (p.data < m ? p.data : m), pontos[0].data);
  const de = somarDias(primeiro, -7) > deSolicitado ? somarDias(primeiro, -7) : deSolicitado;
  const total = Math.max(diasEntre(de, ate), 1);
  const valores = [...pontos.map((p) => p.valor), ...suave.map((d) => d.valor)];
  const baixo = Math.min(...valores);
  const alto = Math.max(...valores);
  const folga = Math.max((alto - baixo) * 0.15, 0.5);
  const passoY = passoDoEixo(alto - baixo + 2 * folga || 0.1, 4);
  const yMin = Math.floor((baixo - folga) / passoY) * passoY;
  const yMax = Math.ceil((alto + folga) / passoY) * passoY;
  const largura = L - M.esquerda - M.direita;
  const altura = A - M.topo - M.base;
  const px = (data) => M.esquerda + (diasEntre(de, data) / total) * largura;
  const py = (v) => M.topo + (1 - (v - yMin) / (yMax - yMin || 1)) * altura;

  const raiz = svg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': `Velocidade na FC de ${fcRef} bpm, de ${formatarData(de)} a ${formatarData(ate)}, um ponto por treino e a média de ${JANELA_EFICIENCIA_DIAS} dias` });
  for (let v = yMin; v <= yMax + 1e-9; v += passoY) {
    raiz.append(
      svg('line', { x1: M.esquerda, x2: L - M.direita, y1: py(v), y2: py(v), class: 'grafico-grade' }),
      svg('text', { x: M.esquerda - 8, y: py(v) + 4, 'text-anchor': 'end', class: 'grafico-rotulo' }, formatarNumero(v, 1)),
    );
  }
  const mostrarAno = total > 240;
  const marcas = 5;
  for (let k = 0; k < marcas; k++) {
    const data = somarDias(de, Math.round((k / (marcas - 1)) * total));
    const [ano, mes, dia] = data.split('-');
    raiz.append(svg('text', { x: px(data), y: A - 8, 'text-anchor': k === 0 ? 'start' : k === marcas - 1 ? 'end' : 'middle', class: 'grafico-rotulo' }, mostrarAno ? `${mes}/${ano.slice(2)}` : `${dia}/${mes}`));
  }

  // média móvel: um vértice por dia de treino (valor da média naquele dia) e curva suave entre eles, em vez do degrau diário.
  // Um intervalo maior que a janela sem treino comparável quebra a linha, para não inventar tendência no vazio.
  let trecho = [];
  const fechar = () => {
    if (trecho.length >= 2) raiz.append(svg('path', { d: caminhoSuave(trecho), class: 'dp-linha' }));
    trecho = [];
  };
  let anterior = null;
  for (const d of suave) {
    if (anterior && diasEntre(anterior, d.data) > JANELA_EFICIENCIA_DIAS) fechar();
    trecho.push([px(d.data), py(d.valor)]);
    anterior = d.data;
  }
  fechar();

  for (const p of pontos) {
    const texto = textoDoPonto(p);
    const ponto = svg('circle', { cx: px(p.data).toFixed(1), cy: py(p.valor).toFixed(1), r: 4, class: 'ef-ponto ef-ponto-meio dp-ponto', tabindex: 0, role: 'img', 'aria-label': texto });
    const mostrar = () => {
      dica.textContent = texto;
      dica.hidden = false;
    };
    ponto.addEventListener('pointerenter', mostrar);
    ponto.addEventListener('focus', mostrar);
    ponto.addEventListener('pointerleave', () => (dica.hidden = true));
    ponto.addEventListener('blur', () => (dica.hidden = true));
    raiz.append(ponto);
  }
  container.prepend(raiz);
  return container;
}

/**
 * Painel "Desempenho": quanto de velocidade você entrega por esforço cardíaco e como isso evolui. Calculado pelo próprio
 * sistema a partir das atividades (distância, tempo em movimento, FC média e tempo por zona), sem depender do intervals.icu.
 * @param {{ atividades: any[], hoje: string }} p
 */
export function criarPainelDesempenho({ atividades, hoje }) {
  const raiz = h('section', { class: 'card dp-painel', id: 'progressao-desempenho' });
  let sequencia = 0; // descarta a resposta de uma leitura que ficou para trás depois de trocar o esporte

  function chips(opcoes, atual, aoEscolher, rotulo) {
    return h(
      'div',
      { class: 'ia-dias', role: 'group', 'aria-label': rotulo },
      ...opcoes.map((o) => h('button', { type: 'button', class: `ativ-chip${o.id === atual ? ' ativo' : ''}`, 'aria-pressed': String(o.id === atual), onClick: () => aoEscolher(o.id) }, o.rotulo)),
    );
  }

  function avisoDePendentes(n) {
    const estado = h('span', { class: 'texto-secundario' });
    const botao = h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button' }, `Calcular o tempo por zona (${n} atividade${n === 1 ? '' : 's'})`);
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      estado.textContent = ' Calculando…';
      try {
        await completarAtividades((feitas) => {
          estado.textContent = ` Calculando… ${feitas} de ${n}`;
        });
        estado.textContent = ' Pronto.';
      } catch (err) {
        estado.textContent = ` ${err.message || 'Não foi possível calcular agora.'}`;
        botao.disabled = false;
      }
    });
    return h('p', { class: 'zs-pendentes' }, 'Estas atividades ainda não têm o tempo por zona, que o sistema usa para separar os treinos leves. ', botao, estado);
  }

  function desenhar() {
    const esporte = estadoDesempenho.esporte ?? ESPORTE_PADRAO_DE_DESEMPENHO;
    const nomeEsporte = esporte === 'corrida' ? 'corrida' : 'pedal';
    const { pontos, excluidas } = pontosDeDesempenho(atividades, esporte);
    const resumo = resumoDeDesempenho(pontos, { hoje });
    const pendentes = atividades.filter((a) => a.esporte === esporte && zonasPendentes(a)).length;
    const ordemDeMotivos = Object.entries(excluidas).filter(([m, n]) => n > 0 && m !== 'esporte');

    const cabecalho = [
      h('h2', null, 'Desempenho'),
      h('p', { class: 'texto-secundario' }, 'Você está evoluindo? O sistema compara os seus treinos leves e constantes (velocidade na mesma FC) e os seus melhores esforços, e junta tudo em um veredito.'),
      h(
        'div',
        { class: 'zs-controles' },
        chips(ESPORTES, esporte, (id) => {
          estadoDesempenho.esporte = id;
          desenhar();
        }, 'Esporte'),
        chips(PERIODOS, estadoDesempenho.dias, (id) => {
          estadoDesempenho.dias = id;
          desenhar();
        }, 'Período do gráfico'),
      ),
      pendentes > 0 ? avisoDePendentes(pendentes) : null,
    ];

    if (!resumo) {
      raiz.replaceChildren(
        ...[
          ...cabecalho,
          h('p', { class: 'vazio-curto', role: 'status' }, `Ainda não há treinos de ${nomeEsporte} comparáveis. Entram treinos de arquivo, com FC e tempo por zona, de 20 min e 3 km ou mais, leves (pouco tempo em Z4–Z5 (até 10% na corrida e 25% no pedal)) e em terreno pouco ondulado.`),
          ordemDeMotivos.length ? h('p', { class: 'texto-secundario' }, `Ficaram de fora: ${ordemDeMotivos.map(([m, n]) => `${n} (${(MOTIVOS_DE_EXCLUSAO[m] ?? m).toLowerCase()})`).join('; ')}.`) : null,
        ].filter(Boolean),
      );
      return;
    }

    const mostrarVelocidade = esporte === 'corrida' ? ritmo : velocidade;
    const por = (r, rotuloAnterior) => (r ? `${r} ${rotuloAnterior}` : 'sem treino na janela anterior para comparar');
    const cartoes = [];

    // desacoplamento: lê a série detalhada dos treinos longos, então o cartão preenche quando as leituras chegam
    const candidatos = candidatosAoDesacoplamento(atividades, esporte, { hoje });
    let cartaoDesacoplamento = cartaoIndicador({ rotulo: 'Desacoplamento (Pa:HR)', nomeIcone: 'onda', valor: candidatos.length ? '…' : '—', nota: candidatos.length ? 'lendo os treinos longos' : 'precisa de treino de arquivo com 40 min ou mais' });
    cartoes.push(cartaoDesacoplamento);
    if (candidatos.length) {
      const minha = ++sequencia;
      Promise.all(candidatos.map(desacoplamentoDe)).then((resultados) => {
        if (minha !== sequencia) return;
        const ok = resultados.filter(Boolean);
        const media = ok.length ? ok.reduce((s, r) => s + r.pct, 0) / ok.length : null;
        const leitura = leituraDoDesacoplamento(media);
        const novo = cartaoIndicador({
          rotulo: 'Desacoplamento (Pa:HR)',
          nomeIcone: 'onda',
          valor: media === null ? '—' : `${formatarNumero(media, 1)}%`,
          nota: leitura ? `${leitura.rotulo} · média de ${ok.length} treino${ok.length === 1 ? '' : 's'} longo${ok.length === 1 ? '' : 's'} · último ${formatarNumero(resultados.find(Boolean)?.pct, 1)}%` : 'a série dos treinos longos não tem FC e velocidade suficientes',
          gravidade: leitura ? { bom: 'ok', medio: 'atencao', alto: 'alerta' }[leitura.id] : '',
        });
        cartaoDesacoplamento.replaceWith(novo);
        cartaoDesacoplamento = novo;
      });
    }

    if (esporte === 'corrida') {
      const v = vdotDosMelhoresEsforcos(atividades, { hoje });
      cartoes.push(
        cartaoIndicador({
          rotulo: 'VDOT estimado · 90 dias',
          nomeIcone: 'esporte',
          valor: v.recente ? formatarNumero(v.recente.vdot, 1) : '—',
          nota: v.recente ? `${por(pct(v.variacaoPct), 'contra os 90 dias anteriores')} · melhor de 5, 10 e 21 km` : 'precisa de um esforço de 5 km ou mais nos últimos 90 dias',
          gravidade: gravidadeDe(v.variacaoPct, true, 1),
        }),
      );
    }

    const rpe = resumo.rpe;
    cartoes.push(
      cartaoIndicador({
        rotulo: 'Esforço percebido (RPE)',
        nomeIcone: 'hrss',
        valor: Number.isFinite(rpe.recente) ? formatarNumero(rpe.recente, 1) : '—',
        nota: Number.isFinite(rpe.recente)
          ? `média de ${rpe.nRecente} treino${rpe.nRecente === 1 ? '' : 's'}${Number.isFinite(rpe.anterior) ? ` · antes ${formatarNumero(rpe.anterior, 1)}` : ''}`
          : 'preencha o esforço no “Como foi?” dos treinos',
      }),
    );

    // ---- evolução: veredito, antes × agora e gráfico da velocidade na mesma FC
    const naFc = comparativoNaFc(pontos, { hoje });
    const esforcos = comparativoDeEsforcos(atividades, esporte, { hoje });
    const semanasSeguidas = sequenciaSemanal(atividades.filter((a) => a.esporte === esporte).map((a) => a.data), hoje);
    const veredito = vereditoDeEvolucao({ naFc, esforcos, sequenciaSemanas: semanasSeguidas.atual, esporte });
    const painelVeredito = h(
      'div',
      { class: `ef-veredito ef-veredito-${TONS[veredito.id]}` },
      h('div', { class: 'ef-veredito-numero' }, h('span', { class: 'cg-mini-rotulo' }, 'Evolução'), h('strong', null, veredito.destaque === null ? '—' : pct(veredito.destaque)), h('small', null, naFc && Number.isFinite(naFc.variacaoPct) ? `${esporte === 'corrida' ? 'ritmo' : 'velocidade'} na mesma FC` : 'sem base')),
      h('div', { class: 'ef-veredito-texto' }, h('strong', null, veredito.rotulo), h('p', { class: 'texto-secundario' }, veredito.texto)),
    );
    const antesAgora = blocoAntesAgora({ naFc, esforcos, esporte, mostrarVelocidade });

    const de = estadoDesempenho.dias ? somarDias(hoje, -estadoDesempenho.dias) : pontos[0].data;
    const naJanela = naFc ? pontos.filter((p) => p.data >= de).map((p) => ({ ...p, valor: velocidadeNaFc(p, naFc.fcRef) })) : [];
    let grafico;
    if (!naFc) grafico = h('p', { class: 'vazio-curto', role: 'status' }, 'Precisa de 3 treinos comparáveis nos últimos 6 meses para traçar a evolução.');
    else if (!naJanela.length) grafico = h('p', { class: 'vazio-curto', role: 'status' }, 'Nenhum treino comparável neste período. Escolha um período maior.');
    else {
      const suave = mediaMovelNosTreinos(naJanela, (p) => p.valor, JANELA_EFICIENCIA_DIAS);
      const textoDoPonto = (p) => `${formatarData(p.data)} · ${mostrarVelocidade(p.valor)} a ${naFc.fcRef} bpm (treino: ${mostrarVelocidade(p.velocidadeKmh)} a ${formatarNumero(p.fcMedia, 0)} bpm)`;
      grafico = graficoVelocidadeNaFc({ pontos: naJanela, suave, de, ate: hoje, fcRef: naFc.fcRef, textoDoPonto });
    }

    const tendencia = resumo.tendenciaPorMes;
    const nota = h(
      'p',
      { class: 'texto-secundario zs-nota' },
      `Baseado em ${pontos.length} treino${pontos.length === 1 ? '' : 's'} de ${nomeEsporte} comparáve${pontos.length === 1 ? 'l' : 'is'} (de arquivo, leves, sem tiros, de 20 min e 3 km ou mais, em terreno pouco ondulado).`,
      ordemDeMotivos.length ? ` Ficaram de fora: ${ordemDeMotivos.map(([m, n]) => `${n} (${(MOTIVOS_DE_EXCLUSAO[m] ?? m).toLowerCase()})`).join('; ')}.` : '',
      tendencia !== null ? ` Tendência do EF nos últimos 6 meses: ${tendencia > 0 ? '+' : tendencia < 0 ? '−' : ''}${formatarNumero(Math.abs(tendencia), 3)} por mês.` : '',
    );

    const ajuda = h(
      'details',
      { class: 'dp-ajuda' },
      h('summary', null, 'Como ler estas métricas'),
      h(
        'ul',
        null,
        h('li', null, h('strong', null, 'Veredito: '), 'junta dois sinais: a velocidade na mesma FC e os melhores esforços por distância. Variações de até 2% contam como estável. A sequência de semanas treinando só aparece como contexto.'),
        h('li', null, h('strong', null, 'Velocidade na mesma FC: '), 'cada treino leve é levado para a FC típica do período (a mediana dos últimos 6 meses) por proporção: velocidade × FC de referência ÷ FC do treino. Se sobe, você anda mais rápido com o mesmo esforço cardíaco. A linha é a média dos últimos 28 dias, ponderada pelo tempo.'),
        h('li', null, h('strong', null, 'Melhores esforços: '), 'o melhor tempo em cada distância nos últimos 90 dias, contra o dos 90 dias anteriores. Mostra o seu teto, e um dia ruim pesa pouco.'),
        h('li', null, h('strong', null, 'EF e batimentos por km: '), 'a mesma ideia vista de outros ângulos (m/min por batimento e batimentos por km). Estão na página Forma e na tendência da nota abaixo do gráfico.'),
        h('li', null, h('strong', null, 'Desacoplamento (Pa:HR): '), '(EF da 1ª metade − EF da 2ª) ÷ EF da 1ª, descartando os 10 min de aquecimento. Mede quanto a FC “deriva” num treino longo e constante: abaixo de 5% indica boa base aeróbica; acima de 10%, a FC sobe muito para sustentar o ritmo.'),
        h('li', null, h('strong', null, 'VDOT (só corrida): '), 'o nível equivalente de Daniels, estimado pelos seus melhores esforços de 5, 10 e 21 km. Um treino leve dá um VDOT menor que o seu potencial: ele só sobe de verdade quando você se testa ou corre forte.'),
        h('li', null, h('strong', null, 'RPE: '), 'o esforço percebido (1 a 10) que você marca no “Como foi?”. Se cai com o mesmo ritmo, é um bom sinal.'),
        h('li', null, h('strong', null, 'Cuidado: '), 'calor, desidratação, sono ruim e cansaço pioram o EF sem que a forma tenha caído. Olhe a tendência de várias semanas, não um treino isolado.'),
      ),
    );

    raiz.replaceChildren(
      ...[
        ...cabecalho,
        painelVeredito,
        antesAgora,
        cartoes.length ? h('div', { class: 'ativ-recordes-grade ativ-indicadores dp-cartoes' }, ...cartoes) : null,
        h('h3', { class: 'dp-titulo-grafico' }, naFc ? `${esporte === 'corrida' ? 'Ritmo' : 'Velocidade'} na mesma FC (${naFc.fcRef} bpm) · ${nomeEsporte}` : `Velocidade na mesma FC · ${nomeEsporte}`),
        grafico,
        h(
          'p',
          { class: 'traj-legenda texto-secundario' },
          h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra ef-amostra-meio' }), 'treino (ajustado para a FC de referência)'),
          h('span', { class: 'traj-legenda-item' }, h('i', { class: 'traj-amostra dp-amostra-linha' }), `média de ${JANELA_EFICIENCIA_DIAS} dias`),
        ),
        nota,
        ajuda,
      ].filter(Boolean),
    );
  }

  desenhar();
  return raiz;
}
