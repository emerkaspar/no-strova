import { ROTULOS_DAS_ZONAS, textoDaJanela, velocidadeMediaMs, zonasGuardadas } from '@no-strova/domain';
import { carregarImpacto } from '../../application/impactoTreino.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarForma, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal } from '../../utils/modal.js';
import { valorDaMedalha } from './medalhaCartao.js';
import { ROTULO_ESPORTE } from './textos.js';

const reduzirMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COR_DA_MEDALHA = Object.freeze({ ouro: 'var(--medalha-ouro)', prata: 'var(--medalha-prata)', bronze: 'var(--medalha-bronze)', recente: 'var(--primary)' });
const NOME_DA_POSICAO = Object.freeze({ ouro: '1º lugar', prata: '2º lugar', bronze: '3º lugar' });

/** Número que sobe de 0 até o valor (some em "reduzir movimento"). */
function contador(valor, duracaoMs = 900) {
  const el = h('span', { class: 'rt-kcal-valor' }, formatarNumero(valor));
  if (reduzirMovimento()) return el;
  const inicio = performance.now();
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    el.textContent = formatarNumero(valor * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(passo);
  };
  el.textContent = '0';
  requestAnimationFrame(passo);
  return el;
}

/** Ritmo (corrida) ou velocidade (demais) médios da atividade, ou null. */
function ritmoMedio(a) {
  const v = velocidadeMediaMs(a);
  if (!v) return null;
  if (a.esporte === 'corrida') {
    const s = Math.round(1000 / v);
    return { rotulo: 'Ritmo médio', valor: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km` };
  }
  return { rotulo: 'Velocidade média', valor: `${formatarNumero(v * 3.6, 1)} km/h` };
}

/** Fichas com os números do treino (só os que existem). */
function numerosDoTreino(a) {
  const itens = [
    a.distanciaM > 0 ? { rotulo: 'Distância', valor: formatarDistancia(a.distanciaM) } : null,
    a.duracaoS > 0 ? { rotulo: 'Tempo', valor: formatarDuracao(a.duracaoS) } : null,
    ritmoMedio(a),
    a.fcMedia > 0 ? { rotulo: 'FC média', valor: `${formatarNumero(a.fcMedia)} bpm` } : null,
    a.fcMax > 0 ? { rotulo: 'FC máx.', valor: `${formatarNumero(a.fcMax)} bpm` } : null,
    a.altimetriaM > 0 ? { rotulo: 'Subida', valor: `${formatarNumero(a.altimetriaM)} m` } : null,
    a.hrss > 0 ? { rotulo: 'Carga (HRSS)', valor: formatarNumero(a.hrss, 1) } : null,
  ].filter(Boolean);
  if (!itens.length) return null;
  return h('div', { class: 'rt-numeros rt-entra', style: '--atraso:40ms' }, ...itens.map((i) => h('div', { class: 'rt-numero' }, h('small', null, i.rotulo), h('strong', null, i.valor))));
}

/** Cartão "antes → depois" de uma métrica. `serie` é a variável de cor do tema. */
function cartaoMetrica({ nome, dica, par, serie, formatar, atraso }) {
  const sobe = par.delta > 0;
  const igual = par.delta === 0;
  return h(
    'div',
    { class: 'rt-metrica rt-entra', style: `--serie:${serie};--atraso:${atraso}ms` },
    h('p', { class: 'rt-metrica-nome' }, nome),
    h('p', { class: 'rt-metrica-valores' }, h('span', { class: 'rt-antes' }, formatar(par.antes)), h('span', { class: 'rt-seta', 'aria-hidden': 'true' }, '→'), h('strong', { class: 'rt-depois' }, formatar(par.depois))),
    h('span', { class: `rt-delta ${igual ? '' : sobe ? 'rt-delta-sobe' : 'rt-delta-desce'}`.trim() }, `${igual ? '=' : sobe ? '▲' : '▼'} ${formatar(Math.abs(par.delta))}`),
    h('small', null, dica),
  );
}

/** Linha de uma medalha de recorde. */
function linhaDaMedalha(m, esporte) {
  const valor = valorDaMedalha(m, esporte);
  const tipo = m.tipo === 'podio' ? m.medalha : 'recente';
  const legenda = m.tipo === 'podio' ? `${NOME_DA_POSICAO[m.medalha]} entre ${m.total} treinos` : textoDaJanela(m.dias);
  return h(
    'li',
    { class: 'rt-medalha', style: `--medalha:${COR_DA_MEDALHA[tipo]}` },
    h('span', { class: 'rt-medalha-selo', 'aria-hidden': 'true' }, icone('medalha', 22)),
    h('span', { class: 'rt-medalha-texto' }, h('b', null, m.rotulo), h('small', null, legenda)),
    h('span', { class: 'rt-medalha-valor' }, valor.texto, valor.nota ? h('small', null, valor.nota) : null),
  );
}

/** "▲ 12%" entre dois valores; null sem base de comparação. */
function variacao(atual, anterior) {
  if (!(anterior > 0)) return null;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  return { texto: pct === 0 ? 'igual' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`, classe: pct > 0 ? 'rt-delta-sobe' : pct < 0 ? 'rt-delta-desce' : '' };
}

/** Cartão de um período (semana ou mês) comparado ao anterior. */
function cartaoDoPeriodo(titulo, { atual, anterior }, subtitulo) {
  const linhas = [
    { rotulo: 'Treinos', a: atual.atividades, b: anterior.atividades, f: (v) => formatarNumero(v) },
    { rotulo: 'Tempo', a: atual.duracaoS, b: anterior.duracaoS, f: formatarDuracao },
    { rotulo: 'Distância', a: atual.distanciaM, b: anterior.distanciaM, f: formatarDistancia },
    { rotulo: 'Carga', a: atual.carga, b: anterior.carga, f: (v) => formatarNumero(v, 0) },
  ];
  return h(
    'div',
    { class: 'rt-periodo' },
    h('p', { class: 'rt-metrica-nome' }, titulo),
    h('small', { class: 'rt-periodo-sub' }, subtitulo),
    ...linhas.map((l) => {
      const v = variacao(l.a, l.b);
      return h('div', { class: 'rt-periodo-linha' }, h('span', null, l.rotulo), h('b', null, l.f(l.a)), v ? h('span', { class: `rt-delta ${v.classe}`.trim() }, v.texto) : h('span', { class: 'rt-periodo-sem' }, '—'));
    }),
  );
}

/** Barra empilhada com o tempo em cada zona de FC. */
function barraDeZonas(a) {
  const z = zonasGuardadas(a);
  const total = z ? z.reduce((t, v) => t + v, 0) : 0;
  if (!total) return null;
  const segmentos = z.map((v, i) => (v > 0 ? h('span', { class: 'rt-zona', style: `flex:${v};--zona:var(--zona-${i + 1})`, title: `${ROTULOS_DAS_ZONAS[i]}: ${formatarDuracao(v)}` }, v / total >= 0.1 ? ROTULOS_DAS_ZONAS[i] : '') : null)).filter(Boolean);
  return h(
    'section',
    { class: 'rt-secao' },
    h('h3', { class: 'fb-secao-titulo' }, 'Tempo por zona de FC'),
    h('div', { class: 'rt-zonas', role: 'img', 'aria-label': ROTULOS_DAS_ZONAS.map((r, i) => `${r}: ${formatarDuracao(z[i])}`).join(', ') }, ...segmentos),
    h('div', { class: 'rt-zonas-legenda' }, ...z.map((v, i) => h('span', { style: `--zona:var(--zona-${i + 1})` }, h('i', { 'aria-hidden': 'true' }), `${ROTULOS_DAS_ZONAS[i]} ${formatarDuracao(v)}`))),
  );
}

function corpo({ atividade, dados }) {
  const { impacto, equivalencias, conquistas, recomendacao } = dados;
  const secoes = [numerosDoTreino(atividade)];

  if (atividade.calorias > 0) {
    secoes.push(
      h(
        'section',
        { class: 'rt-kcal rt-entra', style: '--atraso:0ms' },
        h('span', { class: 'rt-kcal-icone', 'aria-hidden': 'true' }, '🔥'),
        h('div', null, h('p', { class: 'rt-kcal-linha' }, contador(atividade.calorias), h('span', { class: 'rt-kcal-un' }, ' kcal')), h('small', null, atividade.caloriasOrigem === 'estimada' ? 'queimadas (estimativa pela FC)' : 'queimadas')),
      ),
    );
  }

  if (conquistas.medalhas.length || conquistas.marcos.length) {
    secoes.push(
      h(
        'section',
        { class: 'rt-secao rt-conquistas' },
        h('h3', { class: 'fb-secao-titulo' }, 'Conquistas e recordes'),
        conquistas.medalhas.length ? h('ul', { class: 'rt-medalhas' }, ...conquistas.medalhas.map((m) => linhaDaMedalha(m, atividade.esporte))) : null,
        conquistas.marcos.length ? h('div', { class: 'rt-selos' }, ...conquistas.marcos.map((d) => h('span', { class: 'rt-selo' }, h('span', { 'aria-hidden': 'true' }, d.emoji), d.texto))) : null,
      ),
    );
  }

  if (impacto) {
    secoes.push(
      h(
        'section',
        { class: 'rt-secao' },
        h('h3', { class: 'fb-secao-titulo' }, 'O que mudou em você'),
        h(
          'div',
          { class: 'rt-metricas' },
          cartaoMetrica({ nome: 'Condicionamento', dica: 'sua base de longo prazo', par: impacto.fitness, serie: 'var(--serie-fitness)', formatar: (v) => formatarNumero(v, 1), atraso: 80 }),
          cartaoMetrica({ nome: 'Fadiga', dica: 'o cansaço de agora', par: impacto.fadiga, serie: 'var(--serie-fadiga)', formatar: (v) => formatarNumero(v, 1), atraso: 160 }),
          cartaoMetrica({ nome: 'Forma amanhã', dica: impacto.faixaDepois.chip, par: impacto.forma, serie: 'var(--serie-forma)', formatar: (v) => formatarForma(v, 1), atraso: 240 }),
        ),
        impacto.faixaAntes.id !== impacto.faixaDepois.id
          ? h('p', { class: 'rt-faixa' }, `Sua zona passou de ${impacto.faixaAntes.rotulo.toLowerCase()} para ${impacto.faixaDepois.rotulo.toLowerCase()}.`)
          : null,
      ),
    );
  } else {
    secoes.push(h('p', { class: 'texto-secundario rt-aviso' }, 'Sem carga (HRSS) nesta atividade, então não dá para calcular o impacto em Condicionamento, Fadiga e Forma. Registre a FC para ver essa parte.'));
  }

  secoes.push(barraDeZonas(atividade));

  secoes.push(
    h(
      'section',
      { class: 'rt-secao' },
      h('h3', { class: 'fb-secao-titulo' }, 'Sua semana e seu mês'),
      h('div', { class: 'rt-periodos' }, cartaoDoPeriodo('Esta semana', conquistas.semana, 'contra o mesmo trecho da semana passada'), cartaoDoPeriodo('Este mês', conquistas.mes, 'contra o mesmo trecho do mês passado')),
      h('p', { class: 'rt-faixa' }, `Este foi o seu treino nº ${conquistas.nSemana} da semana e o nº ${conquistas.nAno} do ano.`),
    ),
  );

  if (equivalencias.length) {
    secoes.push(
      h(
        'section',
        { class: 'rt-secao' },
        h('h3', { class: 'fb-secao-titulo' }, 'Traduzindo em comida'),
        h('div', { class: 'rt-equiv' }, ...equivalencias.map((e, i) => h('div', { class: 'rt-equiv-item rt-entra', style: `--atraso:${320 + i * 90}ms` }, h('span', { class: 'rt-emoji', 'aria-hidden': 'true' }, e.emoji), h('p', null, e.frase)))),
      ),
    );
  } else if (!(atividade.calorias > 0)) {
    secoes.push(h('p', { class: 'texto-secundario rt-aviso' }, 'Sem calorias registradas. Com a FC e o peso informados, o resumo mostra quanta pizza você queimou.'));
  }

  if (recomendacao) {
    secoes.push(
      h(
        'section',
        { class: 'rt-recomendacao rt-entra', style: '--atraso:600ms' },
        h('span', { class: 'rt-emoji', 'aria-hidden': 'true' }, recomendacao.emoji),
        h('div', null, h('strong', null, recomendacao.titulo), h('p', null, recomendacao.texto)),
      ),
    );
  }
  return h('div', { class: 'fb-corpo rt-corpo' }, ...secoes.filter(Boolean));
}

/**
 * Abre o resumo do treino recém-salvo. Nunca lança: se não conseguir montar, simplesmente não abre
 * (o "Como foi?" já foi salvo).
 *
 * @param {{ uid: string, atividade: object, tom?: string }} opcoes `atividade` com os campos já salvos; `tom` é a cor da sensação
 */
export async function abrirResumoDoTreino({ uid, atividade, tom = 'var(--primary)' }) {
  let dados;
  try {
    dados = await carregarImpacto({ uid, atividade });
  } catch {
    return;
  }
  const a = atividade;
  const resumo = [formatarData(a.data), a.duracaoS ? formatarDuracao(a.duracaoS) : null, a.distanciaM ? formatarDistancia(a.distanciaM) : null].filter(Boolean).join(' · ');
  await abrirModal({
    classe: 'modal-feedback modal-resumo',
    rotulo: 'Resumo do treino',
    fecharNoFundo: true,
    conteudo: (fechar) =>
      h(
        'div',
        { class: 'fb rt', style: `--tom:${tom}` },
        h(
          'header',
          { class: 'fb-topo' },
          h('span', { class: 'fb-esporte', 'aria-hidden': 'true' }, icone(a.esporte, 26)),
          h('div', { class: 'fb-topo-texto' }, h('p', { class: 'fb-kicker' }, 'Treino salvo ✓'), h('h2', { class: 'fb-titulo' }, 'Resumo do treino'), h('p', { class: 'fb-resumo' }, `${a.titulo || ROTULO_ESPORTE[a.esporte] || a.esporte} · ${resumo}`)),
          h('button', { type: 'button', class: 'fb-fechar', title: 'Fechar', 'aria-label': 'Fechar', onClick: () => fechar(undefined) }, icone('fechar', 20)),
        ),
        corpo({ atividade: a, dados }),
        h('footer', { class: 'fb-rodape' }, h('span', { class: 'fb-rodape-espaco' }), h('button', { type: 'button', class: 'btn fb-salvar', onClick: () => fechar(undefined) }, 'Bora!')),
      ),
  });
}
