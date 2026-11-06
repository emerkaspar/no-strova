import { calcularHrss, condicaoDoClima, iconeDoClima, configVigenteEm, zonasPendentes, MEDALHAS, textoDaJanela, esforcosDoEsporte, melhorTempoNaDistancia, pontosDeDistanciaDoTrecho, resumirTrecho, tempoPorZonaDeFc, VERSAO_DO_DETALHE, VERSAO_DOS_ESFORCOS } from '@no-strova/domain';
import { calcularMelhoresEsforcos, excluirAtividade, obterUrlArquivo, renomearAtividade } from '../../core/functions.js';
import { lerAtividade, lerSerieDetalhe, lerSerieFc, lerVoltas } from '../../infrastructure/atividadesRepo.js';
import { lerConfig, lerConfigs } from '../../infrastructure/configsRepo.js';
import { lerTreinoDaAtividade } from '../../infrastructure/planoRepo.js';
import { lerTrajeto } from '../../infrastructure/trajetosRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { formatarData, formatarDataHora, formatarDistancia, formatarDuracao, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { graficoAtividade } from '../../utils/graficoAtividade.js';
import { corDoEsforco, mapaTrajeto } from '../../utils/mapaTrajeto.js';
import { ritmoTexto, tempoDeEsforco } from './esforcos.js';
import { ROTULO_ESPORTE, ROTULO_ORIGEM_CALORIAS, ROTULO_ORIGEM_HRSS, TEXTO_ALERTA } from './textos.js';
import { confirmar } from '../../utils/modal.js';
import { cartaoComoFoi } from './feedbackModal.js';
import { criarComparacao } from './comparacao.js';
import { EVENTO_VINCULO } from './treinoDoDia.js';
import { medalhasDaAtividade } from '../../application/medalhas.js';
import { prepararEvolucaoDoTrajeto } from '../treinos/state.js';

/** Indicador no estilo dos recordes: ícone, rótulo, valor grande e nota no rodapé. */
function indicador(rotulo, valor, nota, nomeIcone = 'atividades') {
  return h(
    'article',
    { class: 'ativ-recorde' },
    h('div', { class: 'ativ-recorde-topo' }, h('span', { class: 'ativ-recorde-icone' }, icone(nomeIcone, 18)), h('span', { class: 'ativ-recorde-rotulo' }, rotulo)),
    h('strong', { class: 'ativ-recorde-valor' }, valor),
    nota ? h('div', { class: 'ativ-recorde-rodape' }, h('span', { class: 'ativ-recorde-quando' }, nota)) : null,
  );
}

/** Média móvel centrada que ignora lacunas: tira o serrilhado da velocidade sem mudar o formato da curva. */
function suavizar(valores, raio = 2) {
  return valores.map((_, i) => {
    let soma = 0;
    let n = 0;
    for (let j = Math.max(0, i - raio); j <= Math.min(valores.length - 1, i + raio); j++) {
      if (Number.isFinite(valores[j])) {
        soma += valores[j];
        n += 1;
      }
    }
    return n > 0 ? soma / n : null;
  });
}

const ritmoDoEixo = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Monta o gráfico a partir da série detalhada (ou, nas atividades antigas, só da FC). Null se não há o que mostrar. */
function montarGrafico(a, detalhe, serieFc, aoPassar, aoSelecionar) {
  if (detalhe?.t?.length > 1) {
    const emKm = Array.isArray(detalhe.dist);
    const x = emKm ? detalhe.dist : detalhe.t.map((s) => s / 60);
    const series = [];
    if (detalhe.alt) series.push({ id: 'alt', rotulo: 'Elevação', unidade: 'm', valores: detalhe.alt, lado: 'e', area: true, formatar: (v) => String(Math.round(v)) });
    if (detalhe.fc) series.push({ id: 'fc', rotulo: 'Frequência cardíaca', unidade: 'bpm', valores: detalhe.fc, lado: 'e', formatar: (v) => String(Math.round(v)) });
    if (detalhe.vel) {
      const suave = suavizar(detalhe.vel);
      if (a.esporte === 'corrida') {
        const ritmo = suave.map((kmh) => (Number.isFinite(kmh) && kmh >= 2 ? Math.min(3600 / kmh, 900) : null));
        series.push({ id: 'vel', rotulo: 'Ritmo', unidade: '/km', valores: ritmo, lado: 'd', inverter: true, passos: [10, 15, 20, 30, 60, 120], formatar: ritmoDoEixo });
      } else {
        series.push({ id: 'vel', rotulo: 'Velocidade', unidade: 'km/h', valores: suave, lado: 'd', formatar: (v) => formatarNumero(v, 1) });
      }
    }
    if (series.length === 0) return null;
    return graficoAtividade({
      x,
      rotuloX: (i) => `${emKm ? `${formatarNumero(detalhe.dist[i] ?? 0, 2)} km · ` : ''}${formatarDuracao(detalhe.t[i])}`,
      formatarEixoX: (v) => (emKm ? `${formatarNumero(v, v < 10 && v % 1 ? 1 : 0)} km` : `${Math.round(v)} min`),
      series,
      aoPassar,
      aoSelecionar,
    });
  }
  if (serieFc?.fc?.length > 1) {
    return graficoAtividade({
      x: serieFc.t.map((s) => s / 60),
      rotuloX: (i) => formatarDuracao(serieFc.t[i]),
      formatarEixoX: (v) => `${Math.round(v)} min`,
      series: [{ id: 'fc', rotulo: 'Frequência cardíaca', unidade: 'bpm', valores: serieFc.fc, lado: 'e', formatar: (v) => String(Math.round(v)) }],
      aoPassar,
    });
  }
  return null;
}

const nomePadrao = (a) => `${ROTULO_ESPORTE[a.esporte] ?? a.esporte} · ${formatarData(a.data)}`;
const TITULO_MAX = 80;

/** Título da atividade (o nome padrão, "Esporte · data", enquanto não houver um) com edição no próprio lugar. */
function cabecalhoEditavel(a, id) {
  const raiz = h('div', { class: 'ativ-titulo' });

  function ver() {
    const botao = h('button', { class: 'ativ-titulo-editar', type: 'button', title: 'Editar o título', 'aria-label': 'Editar o título da atividade' }, icone('lapis', 18));
    botao.addEventListener('click', editar);
    raiz.replaceChildren(
      h('div', { class: 'ativ-titulo-linha' }, h('h1', null, a.titulo || nomePadrao(a)), botao),
      ...(a.titulo ? [h('p', { class: 'texto-secundario ativ-titulo-padrao' }, nomePadrao(a))] : []),
    );
  }

  function editar() {
    const campo = h('input', { type: 'text', maxLength: TITULO_MAX, value: a.titulo ?? '', placeholder: nomePadrao(a), 'aria-label': 'Título da atividade', class: 'ativ-titulo-campo' });
    const erro = h('p', { class: 'mensagem mensagem-erro', hidden: true });
    const salvar = h('button', { class: 'btn', type: 'button' }, 'Salvar');
    const cancelar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Cancelar');
    async function gravar() {
      salvar.disabled = true;
      erro.hidden = true;
      try {
        const r = await renomearAtividade({ atividadeId: id, titulo: campo.value });
        a.titulo = r.titulo ?? undefined;
        ver();
      } catch (err) {
        erro.textContent = err.message || 'Não foi possível salvar o título.';
        erro.hidden = false;
        salvar.disabled = false;
      }
    }
    salvar.addEventListener('click', gravar);
    cancelar.addEventListener('click', ver);
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') gravar();
      else if (e.key === 'Escape') ver();
    });
    raiz.replaceChildren(
      h('div', { class: 'ativ-titulo-edicao' }, campo, salvar, cancelar),
      h('p', { class: 'texto-secundario ativ-titulo-padrao' }, 'Deixe em branco para voltar ao nome padrão.'),
      erro,
    );
    campo.focus();
    campo.select();
  }

  ver();
  return raiz;
}

const ritmoDaLegenda = (kmh) => {
  const s = Math.round(3600 / kmh);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
};

/** Mapa com a escolha da cor do trajeto: única, ou pelo esforço (velocidade ou FC), com legenda da escala. */
function montarBlocoDoMapa(a, detalhe, mapa, inicial, aoEscolher) {
  const opcoes = [
    detalhe.alt ? { id: 'alt', rotulo: 'Elevação' } : null,
    detalhe.vel ? { id: 'vel', rotulo: a.esporte === 'corrida' ? 'Ritmo' : 'Velocidade' } : null,
    detalhe.fc ? { id: 'fc', rotulo: 'Frequência cardíaca' } : null,
  ].filter(Boolean);
  const legenda = h('div', { class: 'mapa-legenda', hidden: true });
  const botoes = new Map();
  let escalaAtual = null; // { valores, faixa, formatar } da cor escolhida
  let marcador = null;

  function escolher(id) {
    const valores = id === 'vel' ? suavizar(detalhe.vel) : id === 'fc' ? suavizar(detalhe.fc) : id === 'alt' ? suavizar(detalhe.alt) : null;
    const faixa = mapa.colorirPor(valores);
    const efetivo = faixa ? id : 'padrao';
    aoEscolher(efetivo);
    for (const [k, b] of botoes) {
      b.classList.toggle('ativo', k === efetivo);
      b.setAttribute('aria-pressed', String(k === efetivo));
    }
    legenda.hidden = !faixa;
    escalaAtual = null;
    marcador = null;
    if (!faixa) return;
    const passos = Array.from({ length: 6 }, (_, i) => corDoEsforco(i / 5));
    const formatar = id === 'fc' ? (v) => `${Math.round(v)} bpm` : id === 'alt' ? (v) => `${Math.round(v)} m` : a.esporte === 'corrida' ? ritmoDaLegenda : (v) => `${formatarNumero(v, 1)} km/h`;
    legenda.replaceChildren(
      h('span', null, id === 'fc' ? 'Mais leve' : id === 'alt' ? 'Mais baixo' : 'Mais lento'),
      h('strong', null, formatar(faixa.min)),
      h('div', { class: 'mapa-legenda-trilha' }, h('i', { class: 'mapa-legenda-barra', style: `background: linear-gradient(90deg, ${passos.join(', ')})` }), (marcador = h('span', { class: 'mapa-legenda-marcador', hidden: true }, h('b')))),
      h('strong', null, formatar(faixa.max)),
      h('span', null, id === 'fc' ? 'Mais intenso' : id === 'alt' ? 'Mais alto' : 'Mais rápido'),
    );
    escalaAtual = { valores, faixa, formatar };
  }

  /** Mostra na barra da legenda onde a atividade está no ponto `i` da série (cursor sobre o gráfico); null esconde. */
  function indicar(i) {
    if (!marcador) return;
    const v = i === null || i === undefined ? null : escalaAtual?.valores[i];
    if (!Number.isFinite(v)) {
      marcador.hidden = true;
      return;
    }
    const { faixa, formatar } = escalaAtual;
    const t = Math.min(1, Math.max(0, (v - faixa.min) / (faixa.max - faixa.min)));
    marcador.style.left = `${t * 100}%`;
    marcador.firstChild.textContent = formatar(v);
    marcador.hidden = false;
  }

  const barra =
    opcoes.length > 1
      ? h(
          'div',
          { class: 'mapa-cores' },
          h('span', { class: 'mapa-cores-rotulo' }, 'Cor do trajeto'),
          h('div', { class: 'ativ-grupo', role: 'group', 'aria-label': 'Cor do trajeto no mapa' }, ...opcoes.map((o) => {
            const b = h('button', { type: 'button', class: 'ativ-chip', 'aria-pressed': 'false', onClick: () => escolher(o.id) }, o.rotulo);
            botoes.set(o.id, b);
            return b;
          })),
        )
      : null;
  escolher(botoes.has(inicial) ? inicial : (botoes.keys().next().value ?? 'padrao'));
  const bloco = h('div', { class: 'mapa-bloco' }, barra, mapa.el, legenda);
  bloco.indicar = indicar;
  return bloco;
}

/** Melhor 5 km e 10 km: só para atividades que chegam à distância. `calculando` mostra o aviso enquanto o servidor relê o arquivo. */
function indicadoresDeEsforco(a, calculando) {
  return esforcosDoEsporte(a.esporte)
    .map((e) => [`Melhor ${e.rotulo}`, e.metros, a[e.campo]])
    .filter(([, metros]) => a.distanciaM >= metros)
    .map(([rotulo, metros, tempo]) => {
      if (Number.isFinite(tempo) && tempo > 0) return indicador(rotulo, tempoDeEsforco(tempo), ritmoTexto(a.esporte, tempo, metros), 'duracao');
      return indicador(rotulo, calculando ? 'Calculando…' : '—', calculando ? 'Lendo o arquivo da atividade' : 'Sem dados de distância no arquivo', 'duracao');
    });
}

/**
 * Potência do ciclismo: medida (medidor no arquivo) ou estimada pelo modelo físico (margem típica de 10 a 20%, sem vento nem pelotão).
 * Atividade sem potência calculada não mostra nada.
 */
function indicadoresDePotencia(a) {
  if (a.esporte !== 'ciclismo' || !a.potenciaOrigem || !Number.isFinite(a.potenciaMediaW)) return [];
  const w = (v) => (Number.isFinite(v) ? `${formatarNumero(v)} W` : '—');
  return [
    indicador('Média', w(a.potenciaMediaW), null, 'hrss'),
    indicador('Normalizada', w(a.potenciaNormalizadaW), null, 'hrss'),
    ...[
      ['Melhor 1 min', a.potenciaMax1minW],
      ['Melhor 5 min', a.potenciaMax5minW],
      ['Melhor 20 min', a.potenciaMax20minW],
    ]
      .filter(([, v]) => Number.isFinite(v))
      .map(([rotulo, v]) => indicador(rotulo, w(v), null, 'hrss')),
  ];
}

/**
 * Temperatura e clima: a temperatura é a do sensor do arquivo (a do pulso/ciclocomputador costuma ler alto) ou, sem sensor,
 * a do serviço de clima; sensação, umidade, vento e chuva vêm do serviço, pelo ponto de partida. Sem dado, nada aparece.
 */
function indicadoresDeClima(a) {
  if (!a.temperaturaOrigem || !Number.isFinite(a.temperaturaMediaC)) return [];
  const sensor = a.temperaturaOrigem === 'sensor';
  const faixa = sensor && Number.isFinite(a.temperaturaMinC) && Number.isFinite(a.temperaturaMaxC) ? `${formatarNumero(a.temperaturaMinC, 0)} a ${formatarNumero(a.temperaturaMaxC, 0)} °C` : null;
  return [
    indicador('Temperatura', `${formatarNumero(a.temperaturaMediaC, 1)} °C`, faixa, iconeDoClima(a.climaCodigo)),
    Number.isFinite(a.sensacaoC) ? indicador('Sensação', `${formatarNumero(a.sensacaoC, 1)} °C`, null, 'sol') : null,
    Number.isFinite(a.umidadePct) ? indicador('Umidade', `${formatarNumero(a.umidadePct, 0)}%`, null, 'sol') : null,
    Number.isFinite(a.ventoKmh) ? indicador('Vento', `${formatarNumero(a.ventoKmh, 1)} km/h`, null, 'vento') : null,
    Number.isFinite(a.chuvaMm) ? indicador('Chuva', `${formatarNumero(a.chuvaMm, 1)} mm`, null, 'chuva') : null,
  ].filter(Boolean);
}

/** Bloco de indicadores com título (e um selo/nota curtos ao lado dele); sem itens, não aparece. */
function secao(titulo, itens, { selo = null, nota = null, dica = null } = {}) {
  if (itens.length === 0) return null;
  return h(
    'section',
    { class: 'ativ-secao' },
    h(
      'div',
      { class: 'ativ-secao-topo' },
      h('h3', null, titulo),
      selo ? h('span', { class: 'ativ-selo', title: dica ?? undefined }, selo) : null,
      nota ? h('span', { class: 'ativ-secao-nota' }, nota) : null,
    ),
    h('div', { class: 'ativ-secao-grade' }, ...itens),
  );
}

/** Card "Frequência cardíaca por zona": uma coluna por zona (tempo, % e faixa em bpm). */
function cartaoDeZonas(zonas, ehTrecho) {
  const maior = Math.max(...zonas.map((z) => z.segundos), 1);
  return [
    h('h2', null, ehTrecho ? 'Frequência cardíaca por zona · trecho selecionado' : 'Frequência cardíaca por zona'),
    h(
      'div',
      { class: 'zonas-barras', role: 'list' },
      zonas.map((z, k) =>
        h(
          'div',
          { class: `zona-coluna zona-${k + 1}`, role: 'listitem', title: `${z.zona}: ${tempoDeEsforco(z.segundos)} (${formatarNumero(z.fracao * 100, 0)}%)` },
          h('span', { class: 'zona-tempo' }, z.segundos > 0 ? tempoDeEsforco(z.segundos) : '—'),
          h('div', { class: 'zona-trilho' }, h('div', { class: 'zona-barra', style: `height:${Math.max(z.segundos > 0 ? 3 : 0, (z.segundos / maior) * 100)}%` })),
          h('strong', { class: 'zona-nome' }, z.zona),
          h('span', { class: 'zona-faixa' }, k === 0 ? `até ${z.faixa[1]} bpm` : k === 4 ? `${z.faixa[0]}+ bpm` : `${z.faixa[0]}–${z.faixa[1]} bpm`),
          h('span', { class: 'zona-pct' }, `${formatarNumero(z.fracao * 100, 0)}%`),
        ),
      ),
    ),
  ];
}

/** Os mesmos indicadores, calculados só para o trecho `sel` ({ i0, i1 }) da série detalhada. Null se o trecho é inválido. */
function indicadoresDoTrecho(a, detalhe, sel, config) {
  const r = resumirTrecho(detalhe, sel.i0, sel.i1, a.esporte);
  if (!r) return null;
  const hrss = a.hrssOrigem === 'fc' && config && r.fcMedia ? calcularHrss({ fcMedia: r.fcMedia, tempoMovimentoS: r.tempoMovimentoS, config }) : null;
  const calorias = a.calorias && a.duracaoS > 0 ? Math.round((a.calorias * r.duracaoS) / a.duracaoS) : null;
  const pontos = pontosDeDistanciaDoTrecho(detalhe, sel.i0, sel.i1);
  const esforcos = [
    ['Melhor 5 km', 5000],
    ['Melhor 10 km', 10000],
  ]
    .filter(([, metros]) => (r.distanciaM ?? 0) >= metros)
    .map(([rotulo, metros]) => {
      const tempo = melhorTempoNaDistancia(pontos, metros);
      return tempo ? indicador(rotulo, tempoDeEsforco(tempo), ritmoTexto(a.esporte, tempo, metros), 'duracao') : indicador(rotulo, '—', 'Sem dados de distância no trecho', 'duracao');
    });
  return h(
    'div',
    { class: 'ativ-recordes-grade ativ-indicadores ativ-indicadores-trecho' },
    indicador('HRSS', hrss === null ? '—' : formatarNumero(hrss, 1), hrss === null ? 'Precisa de FC e da sua configuração' : 'do trecho, pela FC média', 'hrss'),
    indicador('Duração', formatarDuracao(r.duracaoS), null, 'duracao'),
    indicador('Em movimento', formatarDuracao(r.tempoMovimentoS), null, 'duracao'),
    indicador('Distância', r.distanciaM === null ? '—' : formatarDistancia(r.distanciaM), null, 'distancia'),
    indicador('Subida', r.altimetriaM === null ? '—' : `${formatarNumero(r.altimetriaM)} m`, null, 'elevacao'),
    indicador('FC média', r.fcMedia ? `${r.fcMedia} bpm` : '—', null, 'fc'),
    indicador('FC máxima', r.fcMax ? `${r.fcMax} bpm` : '—', 'média de poucos segundos', 'fc'),
    indicador('Calorias', calorias ? `${formatarNumero(calorias)} kcal` : '—', 'proporcional ao tempo do trecho', 'atividades'),
    ...esforcos,
  );
}

export function render(raiz, sessao, { id }) {
  let ativa = true;
  let corDoMapa = 'alt'; // 'alt' | 'vel' | 'fc' ('padrao' = cor única, quando a atividade não tem nenhum dos dados): mantida ao redesenhar a tela
  let limparVisuais = () => {};
  let nomeDoTrajeto = null; // nome do trajeto de treino da atividade (lido uma vez; o modal atualiza)
  let configDoHrss; // undefined = ainda não buscada; null = indisponível
  let treinoVinculado; // undefined = ainda não buscado; null = a atividade não está vinculada a um treino
  let recarregarComparacao = () => {}; // refaz a seção Planejado × Realizado (o vínculo pode mudar no modal "Como foi?")
  let configDaComparacao; // configuração de FC da data da atividade, para as faixas do treino
  const mensagem = areaMensagem();
  raiz.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  async function carregar() {
    try {
      const [a, serie, detalhe] = await Promise.all([lerAtividade(id), lerSerieFc(id), lerSerieDetalhe(id)]);
      if (!ativa) return;
      if (a?.trajetoId) nomeDoTrajeto = (await lerTrajeto(a.trajetoId).catch(() => null))?.nome ?? null;
      if (!ativa) return;
      if (!a || a.userId !== sessao.uid) {
        raiz.replaceChildren(
          h('section', { class: 'card' }, h('h1', null, 'Atividade não encontrada'), h('a', { href: '#/atividades' }, '← Voltar às atividades')),
        );
        return;
      }
      const faltaEsforcos = a.origem === 'arquivo' && a.melhoresEsforcosEm !== VERSAO_DOS_ESFORCOS && a.distanciaM >= 1000;
      const faltaDetalhe = a.origem === 'arquivo' && !!a.arquivoPath && a.detalheEm !== VERSAO_DO_DETALHE;
      const faltaZonas = zonasPendentes(a);
      desenhar(a, serie, detalhe, { calculando: faltaEsforcos, carregandoDetalhe: faltaDetalhe });
      if (faltaEsforcos || faltaDetalhe || faltaZonas) {
        // atividade importada antes desses recursos: o servidor relê o arquivo e a tela é redesenhada com os dados novos
        try {
          await calcularMelhoresEsforcos({ atividadeId: id });
          const [atualizada, novoDetalhe] = await Promise.all([lerAtividade(id), lerSerieDetalhe(id)]);
          if (ativa && atualizada) desenhar(atualizada, serie, novoDetalhe, {});
        } catch {
          if (ativa) desenhar(a, serie, detalhe, {});
        }
      }
    } catch {
      if (ativa) raiz.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'mensagem mensagem-erro' }, 'Não foi possível carregar a atividade.'), h('a', { href: '#/atividades' }, '← Voltar')));
    }
  }

  function desenhar(a, serie, detalhe, { calculando = false, carregandoDetalhe = false } = {}) {
    limparVisuais();
    const baixar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Baixar arquivo original');
    baixar.addEventListener('click', async () => {
      baixar.disabled = true;
      mensagem.limpar();
      try {
        const { url } = await obterUrlArquivo({ atividadeId: id });
        window.open(url, '_blank', 'noopener');
      } catch (err) {
        mensagem.mostrar(err.message);
      } finally {
        baixar.disabled = false;
      }
    });

    const excluir = h('button', { class: 'btn btn-perigo', type: 'button' }, 'Excluir atividade');
    excluir.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Excluir esta atividade?', mensagem: 'O arquivo original também será apagado. Isso não pode ser desfeito.', confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
      excluir.disabled = true;
      mensagem.limpar();
      try {
        await excluirAtividade({ atividadeId: id });
        window.location.hash = '#/atividades';
      } catch (err) {
        mensagem.mostrar(err.message);
        excluir.disabled = false;
      }
    });

    const hrssTexto = a.hrss === null || a.hrss === undefined ? '—' : formatarNumero(a.hrss, 1);
    const caloriasNota = a.caloriasOrigem ? ROTULO_ORIGEM_CALORIAS[a.caloriasOrigem] : null;
    const mapa = detalhe?.lat && detalhe?.lon ? mapaTrajeto(detalhe.lat, detalhe.lon) : null;
    const blocoMapa = mapa ? montarBlocoDoMapa(a, detalhe, mapa, corDoMapa, (c) => (corDoMapa = c)) : null;
    let selecaoAtual = null;
    let grafico = null;
    const aviso = h('div', { class: 'ativ-selecao-aviso', hidden: true });
    const botaoLimpar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Limpar seleção');
    botaoLimpar.addEventListener('click', () => grafico?.limparSelecao());

    /** Troca os cards (e o aviso) pelos do trecho selecionado, ou pelos da atividade inteira. */
    function atualizarSelecao() {
      const doTrecho = selecaoAtual && detalhe ? indicadoresDoTrecho(a, detalhe, selecaoAtual, configDoHrss) : null;
      const novo = doTrecho ?? montarIndicadores();
      indicadores.replaceWith(novo);
      indicadores = novo;
      aviso.hidden = !doTrecho;
      if (doTrecho) {
        const d0 = detalhe.dist?.[selecaoAtual.i0];
        const d1 = detalhe.dist?.[selecaoAtual.i1];
        const faixa = Number.isFinite(d0) && Number.isFinite(d1) ? `${formatarNumero(d0, 2)} a ${formatarNumero(d1, 2)} km` : `${formatarDuracao(detalhe.t[selecaoAtual.i0])} a ${formatarDuracao(detalhe.t[selecaoAtual.i1])}`;
        aviso.replaceChildren(h('span', null, h('strong', null, 'Trecho selecionado: '), `${faixa}. Os indicadores abaixo mostram só esse trecho.`), botaoLimpar);
      }
    }

    /** Configuração de FC usada no cálculo da atividade (para HRSS e zonas do trecho). */
    async function garantirConfig() {
      if (configDoHrss !== undefined) return;
      configDoHrss = null;
      if (!a.configIdUsada) return;
      try {
        configDoHrss = await lerConfig(a.configIdUsada);
      } catch {
        configDoHrss = null;
      }
    }

    // comparação com o treino intervalado vinculado: só aparece quando existe vínculo, passos e a série detalhada
    const comparacaoEl = h('div', { class: 'ativ-grafico', hidden: true });
    async function carregarComparacao() {
      const aviso = (texto) => {
        comparacaoEl.hidden = false;
        comparacaoEl.replaceChildren(h('h2', null, 'Planejado × Realizado'), h('p', { class: 'texto-secundario' }, texto));
      };
      if (!detalhe?.t) return aviso(carregandoDetalhe ? 'Gerando os dados da atividade para poder comparar…' : 'Esta atividade não tem a série detalhada (arquivo com tempo e FC), então não dá para comparar com o treino.');
      if (treinoVinculado === undefined) {
        try {
          treinoVinculado = await lerTreinoDaAtividade(sessao.uid, id);
        } catch {
          return aviso('Não foi possível buscar o treino vinculado a esta atividade.');
        }
      }
      if (!ativa) return;
      if (!treinoVinculado) return aviso('Esta atividade não está vinculada a um treino do Plano. Em Plano, use "Vincular" no treino do dia (seção "Parece que você fez") para ver a comparação aqui.');
      if (!Array.isArray(treinoVinculado.passos) || treinoVinculado.passos.length === 0) {
        return aviso('O treino vinculado é livre (sem passos de aquecimento, esforço e recuperação), então não há o que comparar passo a passo. A comparação vale para treinos intervalados.');
      }
      if (configDaComparacao === undefined) {
        configDaComparacao = a.configIdUsada
          ? await lerConfig(a.configIdUsada).catch(() => null)
          : configVigenteEm(await lerConfigs(sessao.uid).catch(() => []), a.data);
      }
      const voltas = await lerVoltas(id).catch(() => []);
      if (!ativa) return;
      comparacaoEl.hidden = false;
      comparacaoEl.replaceChildren(criarComparacao({ atividade: a, treino: treinoVinculado, detalhe, voltas, config: configDaComparacao, aoSelecionar: (sel) => mapa?.selecionar(sel) }).el);
    }

    const zonasEl = h('div', { class: 'ativ-grafico ativ-zonas', hidden: true });
    function atualizarZonas() {
      const sel = selecaoAtual;
      const zonas = detalhe?.fc && configDoHrss ? tempoPorZonaDeFc(detalhe, sel ? sel.i0 : 0, sel ? sel.i1 : detalhe.t.length - 1, configDoHrss) : null;
      zonasEl.hidden = !zonas;
      if (zonas) zonasEl.replaceChildren(...cartaoDeZonas(zonas, !!sel));
    }

    async function aoSelecionar(sel) {
      selecaoAtual = sel;
      mapa?.selecionar(sel);
      if (sel) {
        await garantirConfig();
        if (selecaoAtual !== sel) return; // o usuário mudou a seleção enquanto a configuração carregava
      }
      if (ativa) {
        atualizarSelecao();
        atualizarZonas();
      }
    }
    if (detalhe?.fc) garantirConfig().then(() => ativa && atualizarZonas());

    grafico = montarGrafico(a, detalhe, serie, (i) => {
      mapa?.destacar(i);
      blocoMapa?.indicar(i);
    }, detalhe ? aoSelecionar : undefined);
    limparVisuais = () => {
      grafico?.destruir();
      mapa?.destruir();
    };
    // blocos com título: resumo, potência, clima e melhores esforços (cada um só aparece se tiver dados)
    const montarIndicadores = () => {
      const estimada = a.potenciaOrigem === 'estimada';
      const sensor = a.temperaturaOrigem === 'sensor';
      return h(
        'div',
        { class: 'ativ-indicadores ativ-secoes' },
        secao('Resumo', [
          indicador('Distância', formatarDistancia(a.distanciaM), null, 'distancia'),
          indicador('Duração', formatarDuracao(a.duracaoS), null, 'duracao'),
          indicador('Em movimento', formatarDuracao(a.tempoMovimentoS), null, 'duracao'),
          indicador('Subida', a.altimetriaM === null || a.altimetriaM === undefined ? '—' : `${formatarNumero(a.altimetriaM)} m`, null, 'elevacao'),
          indicador('FC média', a.fcMedia ? `${a.fcMedia} bpm` : '—', a.zona ? `Zona informada: ${a.zona}` : null, 'fc'),
          indicador('FC máxima', a.fcMax ? `${a.fcMax} bpm` : '—', null, 'fc'),
          indicador('HRSS', hrssTexto, a.hrssOrigem ? ROTULO_ORIGEM_HRSS[a.hrssOrigem] : null, 'hrss'),
          indicador('Calorias', a.calorias ? `${formatarNumero(a.calorias)} kcal` : '—', caloriasNota, 'atividades'),
        ]),
        secao('Potência', indicadoresDePotencia(a), {
          selo: estimada ? 'Estimada' : 'Medida',
          dica: estimada ? 'Estimada por velocidade, subida e peso (margem típica de 10 a 20%)' : 'Medida pelo medidor de potência',
        }),
        secao('Clima', indicadoresDeClima(a), { nota: [condicaoDoClima(a.climaCodigo), sensor ? 'temperatura do sensor' : 'dados do local de partida'].filter(Boolean).join(' · ') }),
        secao('Melhores esforços', indicadoresDeEsforco(a, calculando)),
      );
    };
    let indicadores = montarIndicadores();

    // medalhas de recorde: calculadas sobre todas as atividades, então chegam depois do resto da tela
    const medalhasEl = h('div', { class: 'ativ-medalhas', hidden: true, 'aria-label': 'Recordes pessoais desta atividade' });
    raiz.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('p', null, h('a', { href: '#/atividades' }, '← Atividades')),
        cabecalhoEditavel(a, id),
        h(
          'p',
          { class: 'texto-secundario' },
          `${a.origem === 'arquivo' ? `Importada de arquivo .${a.extensao}` : 'Registrada manualmente'} · início ${formatarDataHora(a.inicio?.toMillis?.())}`,
        ),
        ...(a.alertas ?? []).map((alerta) => h('p', { class: 'mensagem' }, TEXTO_ALERTA[alerta] ?? alerta)),
        cartaoComoFoi({ ...a, id }, (r) => {
          // o servidor devolve o que ficou salvo; a tela se redesenha com isso
          a.titulo = r.titulo ?? undefined;
          a.esporte = r.esporte;
          a.feedback = r.feedback ?? undefined;
          a.testeLthr = r.testeLthr || undefined;
          a.trajetoId = r.trajeto?.id ?? undefined;
          nomeDoTrajeto = r.trajeto?.nome ?? null;
          if (ativa) desenhar(a, serie, detalhe, { calculando, carregandoDetalhe });
        }, { trajetoNome: nomeDoTrajeto }),
        // a evolução por trajeto existe para ciclismo e corrida (os esportes de Treinos)
        a.trajetoId && nomeDoTrajeto && (a.esporte === 'ciclismo' || a.esporte === 'corrida')
          ? h('p', null, h('a', { href: '#/treinos', onClick: () => prepararEvolucaoDoTrajeto({ esporte: a.esporte, trajetoId: a.trajetoId }) }, `Ver a evolução em ${nomeDoTrajeto} →`))
          : null,
        aviso,
        medalhasEl,
        indicadores,
        blocoMapa,
        carregandoDetalhe && !grafico ? h('p', { class: 'texto-secundario', role: 'status' }, 'Gerando o gráfico e o mapa a partir do arquivo da atividade…') : null,
        grafico ? h('div', { class: 'ativ-grafico' }, h('h2', null, 'Desempenho'), grafico.el) : null,
        zonasEl,
        comparacaoEl,
        mensagem.el,
        h('div', { class: 'linha-botoes' }, a.arquivoPath ? baixar : null, excluir),
      ),
    );

    recarregarComparacao = () => {
      treinoVinculado = undefined;
      carregarComparacao().catch(() => {});
    };
    carregarComparacao().catch(() => {});

    medalhasDaAtividade(sessao.uid, id, hojeIso())
      .then((lista) => {
        if (!ativa || lista.length === 0) return;
        medalhasEl.hidden = false;
        medalhasEl.replaceChildren(
          ...lista.map((m) =>
            h(
              'span',
              { class: `ativ-medalha ativ-medalha-${m.tipo === 'recente' ? 'recente' : m.medalha}` },
              icone('medalha', 16),
              h('strong', null, m.rotulo),
              h('small', null, m.tipo === 'recente' ? textoDaJanela(m.dias) : MEDALHAS[m.medalha].rotulo),
            ),
          ),
        );
      })
      .catch(() => {});
  }

  const aoMudarVinculo = (e) => {
    if (e.detail?.atividadeId === id) recarregarComparacao();
  };
  window.addEventListener(EVENTO_VINCULO, aoMudarVinculo);
  carregar();
  return () => {
    ativa = false;
    window.removeEventListener(EVENTO_VINCULO, aoMudarVinculo);
    limparVisuais();
  };
}
