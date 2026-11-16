import { carregarImpacto } from '../../application/impactoTreino.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarForma, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal } from '../../utils/modal.js';
import { ROTULO_ESPORTE } from './textos.js';

const reduzirMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Número que sobe de 0 até o valor (some em "reduzir movimento"). */
function contador(valor, duracaoMs = 900) {
  const el = h('span', { class: 'rt-kcal-valor' }, formatarNumero(valor));
  if (reduzirMovimento()) return el;
  const inicio = performance.now();
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    el.textContent = formatarNumero(valor * (1 - Math.pow(1 - t, 3)));
    if (t < 1 && el.isConnected !== false) requestAnimationFrame(passo);
  };
  el.textContent = '0';
  requestAnimationFrame(passo);
  return el;
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

function corpo({ atividade, dados }) {
  const { impacto, equivalencias, destaques, recomendacao } = dados;
  const secoes = [];

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

  if (destaques.length) {
    secoes.push(h('section', { class: 'rt-secao' }, h('h3', { class: 'fb-secao-titulo' }, 'Destaques'), h('div', { class: 'rt-selos' }, ...destaques.map((d) => h('span', { class: 'rt-selo' }, h('span', { 'aria-hidden': 'true' }, d.emoji), d.texto)))));
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
