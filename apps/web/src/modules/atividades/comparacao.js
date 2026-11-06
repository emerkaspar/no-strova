import { compararPassos, formatarSegundos, resumirAderencia } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { caminhoSuave } from '../../utils/graficoAtividade.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 800;
const A = 240;
const MARGEM = { esq: 38, dir: 8, topo: 10, base: 24 };
const AJUSTES_S = [-30, -5, 5, 30];

const VEREDITOS = {
  dentro: { icone: '✓', texto: 'Na zona' },
  abaixo: { icone: '↓', texto: 'Abaixo da zona' },
  acima: { icone: '↑', texto: 'Acima da zona' },
  'sem-alvo': { icone: '–', texto: 'Por esforço' },
  'sem-dados': { icone: '?', texto: 'Sem FC' },
  'nao-feito': { icone: '×', texto: 'Não feito' },
};

function svg(nome, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

/** Nome de cada passo: "Aquecimento", "Esforço 3", "Recuperação"… (um único esforço vira "Parte principal"). */
function rotulosDosPassos(avaliacoes) {
  const totalEsforcos = avaliacoes.filter((a) => a.papel === 'principal').length;
  let k = 0;
  return avaliacoes.map((a) => {
    if (a.papel === 'aquecimento') return 'Aquecimento';
    if (a.papel === 'desaquecimento') return 'Volta à calma';
    if (a.papel === 'recuperacao') return 'Recuperação';
    k += 1;
    return totalEsforcos === 1 ? 'Parte principal' : `Esforço ${k}`;
  });
}

const textoFaixa = (faixa) => (faixa ? `${faixa[0]}–${faixa[1]} bpm` : 'sem alvo de FC');

function textoRitmo(esporte, velKmh) {
  if (!Number.isFinite(velKmh) || velKmh <= 0) return '—';
  if (esporte === 'corrida') {
    const s = Math.round(3600 / velKmh);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
  }
  return `${formatarNumero(velKmh, 1)} km/h`;
}

function marcador(veredito) {
  const v = VEREDITOS[veredito];
  return h('span', { class: `cpr-v cpr-v-${veredito}` }, h('span', { 'aria-hidden': 'true' }, v.icone), ` ${v.texto}`);
}

/**
 * Comparação "Planejado × Realizado" de uma atividade com o treino intervalado vinculado.
 *
 * @param {object} p
 * @param {{ esporte: string }} p.atividade
 * @param {{ passos: object[], nomeTreino?: string }} p.treino
 * @param {{ t: number[], fc?: number[], vel?: number[], dist?: number[] }} p.detalhe série detalhada (tempo em segundos)
 * @param {Array<{ iniS: number, fimS: number }>} p.voltas voltas do aparelho ([] quando não há)
 * @param {{ lthr: number, fcMax: number }} p.config configuração de FC vigente na data da atividade
 * @param {(sel: { i0: number, i1: number } | null) => void} [p.aoSelecionar] trecho do passo escolhido (para destacar no mapa)
 * @returns {{ el: HTMLElement }}
 */
export function criarComparacao({ atividade, treino, detalhe, voltas, config, aoSelecionar }) {
  const el = h('section', { class: 'cpr' });
  let deslocamentoS = 0;
  let escolhido = null; // índice do passo destacado

  function desenhar() {
    el.replaceChildren(h('h2', null, 'Planejado × Realizado'), h('p', { class: 'texto-secundario' }, treino.nomeTreino ? `Treino: ${treino.nomeTreino}` : 'Treino intervalado vinculado a esta atividade'));
    if (!detalhe?.fc || !config) {
      el.append(h('p', { class: 'mensagem' }, 'Esta atividade não tem frequência cardíaca (ou a configuração de FC da data não foi encontrada), então não dá para comparar com as zonas do treino.'));
      return;
    }
    const linhas = compararPassos({ passos: treino.passos, voltas, serie: detalhe, config, deslocamentoS });
    if (linhas.length === 0) return;
    const avaliacoes = linhas.map((l) => l.avaliacao);
    const rotulos = rotulosDosPassos(avaliacoes);
    const origem = linhas[0].alinhado.origem;

    el.append(resumo(avaliacoes, origem), ...(origem === 'tempo' ? [ajuste()] : []), grafico(linhas), tabela(linhas, avaliacoes, rotulos));
  }

  function resumo(avaliacoes, origem) {
    const r = resumirAderencia(avaliacoes);
    const esforcos = avaliacoes.filter((a) => a.papel === 'principal' && a.veredito !== 'sem-alvo');
    const titulo =
      r.esforcos > 0
        ? `${r.cumpridos} de ${r.esforcos} ${r.esforcos === 1 ? 'esforço dentro' : 'esforços dentro'} da zona`
        : r.tirosCurtos > 0
          ? `${r.tirosCurtos} ${r.tirosCurtos === 1 ? 'tiro curto' : 'tiros curtos'}`
          : 'Treino sem alvo de FC nos esforços';
    const notas = [];
    if (r.acima) notas.push(`${r.acima} acima da zona`);
    if (r.abaixo) notas.push(`${r.abaixo} abaixo da zona`);
    if (r.naoFeitos) notas.push(`${r.naoFeitos} não ${r.naoFeitos === 1 ? 'feito' : 'feitos'}`);
    if (r.fcMediaEsforcos !== null) notas.push(`FC média nos esforços: ${r.fcMediaEsforcos} bpm`);
    if (r.tendenciaFc !== null && Math.abs(r.tendenciaFc) >= 6) {
      notas.push(`a FC ${r.tendenciaFc > 0 ? 'subiu' : 'caiu'} ${Math.abs(r.tendenciaFc)} bpm do primeiro ao último esforço${r.tendenciaFc > 0 ? ' (deriva cardíaca)' : ''}`);
    }
    // tiros curtos não têm faixa de FC (a FC não chega a tempo): o que mede é manter o nível de um tiro ao outro
    const c = r.consistencia;
    if (c) {
      const ritmo = (v) => textoRitmo(atividade.esporte, v);
      notas.push(
        Math.abs(c.variacaoPct) < 3
          ? `Nos tiros curtos você manteve o nível: ${ritmo(c.velInicialKmh)} no começo, ${ritmo(c.velFinalKmh)} no fim`
          : `Nos tiros curtos, ${atividade.esporte === 'corrida' ? 'o ritmo' : 'a velocidade'} foi de ${ritmo(c.velInicialKmh)} para ${ritmo(c.velFinalKmh)} do começo ao fim (${atividade.esporte === 'corrida' ? 'velocidade ' : ''}${c.variacaoPct > 0 ? '+' : '−'}${Math.abs(c.variacaoPct)}%)`,
      );
      if (c.fcPicoMedio !== null) notas.push(`pico de FC médio nos tiros: ${c.fcPicoMedio} bpm`);
    }
    return h(
      'div',
      { class: 'cpr-resumo' },
      h('strong', { class: 'cpr-resumo-titulo' }, titulo),
      esforcos.length
        ? h('div', { class: 'cpr-pontos', 'aria-hidden': 'true' }, ...esforcos.map((a) => h('i', { class: `cpr-ponto cpr-v-${a.veredito}`, title: VEREDITOS[a.veredito].texto })))
        : null,
      notas.length ? h('p', { class: 'texto-secundario' }, notas.join(' · ')) : null,
      h(
        'p',
        { class: 'texto-secundario cpr-origem' },
        origem === 'volta' ? 'Alinhado pelas voltas gravadas no relógio.' : 'Alinhado pelo tempo planejado, a partir do início da atividade. Se os trechos não batem com o que você fez, ajuste o início abaixo.',
      ),
    );
  }

  function ajuste() {
    const botoes = AJUSTES_S.map((s) => {
      const b = h('button', { class: 'btn btn-secundario', type: 'button' }, `${s > 0 ? '+' : '−'}${Math.abs(s)} s`);
      b.addEventListener('click', () => mudarDeslocamento(deslocamentoS + s));
      return b;
    });
    const zerar = h('button', { class: 'btn btn-secundario', type: 'button', disabled: deslocamentoS === 0 }, 'Zerar');
    zerar.addEventListener('click', () => mudarDeslocamento(0));
    return h('div', { class: 'cpr-ajuste' }, h('span', null, 'Início do treino: ', h('strong', null, deslocamentoS === 0 ? 'no começo da atividade' : `${deslocamentoS > 0 ? '+' : '−'}${formatarSegundos(Math.abs(deslocamentoS))} do começo`)), h('div', { class: 'linha-botoes' }, ...botoes, zerar));
  }

  function mudarDeslocamento(valor) {
    deslocamentoS = Math.max(0, Math.min(valor, Math.round(detalhe.t[detalhe.t.length - 1])));
    escolhido = null;
    aoSelecionar?.(null);
    desenhar();
  }

  function escolher(indice, linhas) {
    escolhido = escolhido === indice ? null : indice;
    const l = linhas[indice];
    aoSelecionar?.(escolhido === null ? null : l.alinhado.fimIdx > l.alinhado.iniIdx ? { i0: l.alinhado.iniIdx, i1: l.alinhado.fimIdx } : null);
    desenhar();
  }

  function grafico(linhas) {
    const fim = detalhe.t[detalhe.t.length - 1];
    const fcs = detalhe.fc.filter(Number.isFinite);
    const faixas = linhas.map((l) => l.avaliacao.faixa).filter(Boolean);
    const minimo = Math.min(...fcs, ...faixas.map((f) => f[0])) - 5;
    const maximo = Math.max(...fcs, ...faixas.map((f) => f[1])) + 5;
    const px = (s) => MARGEM.esq + (s / (fim || 1)) * (L - MARGEM.esq - MARGEM.dir);
    const py = (bpm) => MARGEM.topo + (1 - (bpm - minimo) / (maximo - minimo || 1)) * (A - MARGEM.topo - MARGEM.base);
    const base = A - MARGEM.base;

    const raiz = svg('svg', { class: 'cpr-grafico', viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': 'Frequência cardíaca da atividade sobre as faixas de FC planejadas para cada passo' });

    const passoBpm = maximo - minimo > 80 ? 20 : 10;
    for (let v = Math.ceil(minimo / passoBpm) * passoBpm; v <= maximo; v += passoBpm) {
      raiz.append(svg('line', { x1: MARGEM.esq, x2: L - MARGEM.dir, y1: py(v), y2: py(v), class: 'cpr-grade' }), svg('text', { x: MARGEM.esq - 6, y: py(v) + 4, 'text-anchor': 'end', class: 'cpr-rotulo' }, String(v)));
    }
    const passoMin = fim / 60 > 90 ? 20 : fim / 60 > 40 ? 10 : 5;
    for (let m = 0; m * 60 <= fim; m += passoMin) {
      raiz.append(svg('text', { x: px(m * 60), y: A - 6, 'text-anchor': 'middle', class: 'cpr-rotulo' }, `${m} min`));
    }

    for (const { alinhado, avaliacao } of linhas) {
      if (alinhado.fimS <= alinhado.iniS) continue;
      const x = px(alinhado.iniS);
      const largura = Math.max(1, px(alinhado.fimS) - x);
      const sel = escolhido === alinhado.indice;
      if (sel) raiz.append(svg('rect', { x, y: MARGEM.topo, width: largura, height: base - MARGEM.topo, class: 'cpr-coluna-sel' }));
      if (avaliacao.faixa) {
        const [baixo, alto] = avaliacao.faixa;
        raiz.append(svg('rect', { x, y: py(alto), width: largura, height: Math.max(2, py(baixo) - py(alto)), class: `cpr-faixa cpr-faixa-${avaliacao.zona.toLowerCase()}${sel ? ' cpr-faixa-sel' : ''}` }));
      }
      const alvo = svg('rect', { x, y: MARGEM.topo, width: largura, height: base - MARGEM.topo, class: 'cpr-clique', tabindex: 0, role: 'button', 'aria-label': `${avaliacao.papel} ${alinhado.indice + 1}: ${textoFaixa(avaliacao.faixa)}` }, svg('title', {}, `${formatarSegundos(avaliacao.duracaoPlanejadaS)} em ${avaliacao.zona} · ${textoFaixa(avaliacao.faixa)}`));
      alvo.addEventListener('click', () => escolher(alinhado.indice, linhas));
      alvo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          escolher(alinhado.indice, linhas);
        }
      });
      raiz.append(alvo);
    }

    // FC real: segmentos contínuos (a série pode ter lacunas)
    let atual = [];
    const segmentos = [];
    detalhe.fc.forEach((v, i) => {
      if (Number.isFinite(v)) atual.push([px(detalhe.t[i]), py(v)]);
      else if (atual.length) {
        segmentos.push(atual);
        atual = [];
      }
    });
    if (atual.length) segmentos.push(atual);
    for (const seg of segmentos) raiz.append(svg('path', { d: caminhoSuave(seg), class: 'cpr-fc' }));

    return h(
      'figure',
      { class: 'cpr-figura' },
      raiz,
      h('figcaption', { class: 'texto-secundario' }, h('span', { class: 'cpr-leg cpr-leg-fc' }, 'FC da atividade'), h('span', { class: 'cpr-leg cpr-leg-faixa' }, 'Faixa de FC planejada'), ' · toque num trecho para ver o passo'),
    );
  }

  function tabela(linhas, avaliacoes, rotulos) {
    const corpo = linhas.map(({ alinhado }, k) => {
      const a = avaliacoes[k];
      const tr = h(
        'tr',
        { class: `cpr-linha cpr-linha-${a.papel}${escolhido === k ? ' cpr-linha-sel' : ''}`, tabindex: 0, 'aria-selected': escolhido === k ? 'true' : 'false' },
        h('th', { scope: 'row' }, rotulos[k], alinhado.bloco.descricao ? h('small', null, alinhado.bloco.descricao) : null),
        h('td', null, formatarSegundos(a.duracaoPlanejadaS), h('small', null, `${a.zona} · ${textoFaixa(a.faixa)}`)),
        h('td', null, a.veredito === 'nao-feito' ? '—' : formatarDuracao(a.duracaoRealS), h('small', null, a.distanciaM !== null && a.veredito !== 'nao-feito' ? `${formatarNumero(a.distanciaM / 1000, 2)} km` : '')),
        h('td', null, a.fcMedia !== null ? `${a.fcMedia} bpm` : '—', h('small', null, a.fracaoNaFaixa !== null ? `${Math.round(a.fracaoNaFaixa * 100)}% do tempo na faixa` : a.veredito === 'sem-alvo' && a.fcPico !== null ? `pico ${a.fcPico} bpm` : '')),
        h('td', null, a.veredito === 'nao-feito' ? '—' : textoRitmo(atividade.esporte, a.velMediaKmh)),
        h('td', null, marcador(a.veredito)),
      );
      tr.addEventListener('click', () => escolher(k, linhas));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          escolher(k, linhas);
        }
      });
      return tr;
    });
    return h(
      'div',
      { class: 'cpr-tabela-rolagem' },
      h(
        'table',
        { class: 'cpr-tabela' },
        h('caption', { class: 'texto-secundario' }, 'A FC média e o tempo na faixa ignoram os primeiros segundos de cada passo, porque o coração demora a reagir à mudança de esforço. Passos de menos de 1 min não têm faixa de FC (a FC não chega a tempo): nesses, o resultado é "Por esforço" e a tabela mostra o pico de FC, que costuma vir logo depois do passo, e o ritmo.'),
        h('thead', null, h('tr', null, ...['Passo', 'Planejado', 'Feito', 'FC média', 'Ritmo', 'Resultado'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, ...corpo),
      ),
    );
  }

  desenhar();
  return { el };
}
