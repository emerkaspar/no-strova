import { avaliarMetaPeso, calcularImc, classificarImc, configVigenteEm, faixaDePesoSaudavel, progressoDaMetaPeso, resumoDePeso, situacaoNaFaixa, somarDias } from '@no-strova/domain';
import { salvarMetaDePeso } from '../../application/peso.js';
import { DIAS_CARREGADOS_BEM_ESTAR, observarBemEstar } from '../../infrastructure/bemEstarRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarMedidas } from '../../infrastructure/medidasRepo.js';
import { excluirMetaPeso, observarMetasPeso, observarPesagens } from '../../infrastructure/pesoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { criarIndiceDeSecoes } from '../../utils/indiceDeSecoes.js';
import { abrirModal } from '../../utils/modal.js';
import { paginaTopo } from '../../utils/paginaTopo.js';
import { criarGraficoPeso, PERIODOS_DO_PESO } from './graficoPeso.js';
import { criarHistoricoDePesagens } from './historicoPesagens.js';
import { criarSecaoAlimentacao } from './alimentacao.view.js';
import { criarSecaoMedidas } from './medidas.view.js';
import { abrirRegistroDePeso } from './registroPeso.js';
import { criarResumoDaSaude } from './resumoDaSaude.js';
import { criarSecaoSonoPassosTreino } from './sonoPassosTreino.js';

/** Seções da página, na ordem em que aparecem; o índice fixo no topo leva a elas. */
const SECOES = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'peso', rotulo: 'Peso' },
  { id: 'sono-passos', rotulo: 'Sono, passos e treino' },
  { id: 'medidas', rotulo: 'Medidas' },
  { id: 'alimentacao', rotulo: 'Alimentação' },
];

/** Troca os filhos de um cartão ignorando null (replaceChildren escreveria "null" na tela). */
const montar = (el, ...filhos) => el.replaceChildren(...filhos.filter((f) => f !== null && f !== undefined));

const kg = (v, casas = 1) => `${formatarNumero(v, casas)} kg`;
const comSinal = (v, casas = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), casas)}`;

/** Frase que explica a avaliação da meta de peso e o que fazer. */
export function textoDaAvaliacaoPeso(a) {
  const data = formatarData(a.dataAlvo);
  if (a.estado === 'sem-dados') return `Ainda não dá para projetar o peso em ${data}: registre pesagens por pelo menos duas semanas para ver a tendência.`;
  if (a.estado === 'atingida') return 'Você já está no peso da meta. Agora é manter.';
  const projetado = kg(a.pesoProjetadoKg);
  const ritmo = a.ritmoAtualKg === null ? '' : ` (${comSinal(a.ritmoAtualKg)} kg por semana)`;
  if (a.estado === 'no-ritmo') return `Mantendo a tendência atual${ritmo}, você chega a cerca de ${projetado} em ${data}, dentro da meta.`;
  if (a.estado === 'adiantada') return `Mantendo a tendência atual${ritmo}, você chega a cerca de ${projetado} em ${data}: passa do alvo antes da data. Dá para desacelerar.`;
  return `Mantendo a tendência atual${ritmo}, você chega a cerca de ${projetado} em ${data}, ${formatarNumero(Math.abs(a.diferencaKg), 1)} kg ${a.diferencaKg > 0 ? 'acima' : 'abaixo'} do alvo. Seria preciso ${comSinal(a.ritmoNecessarioKg)} kg por semana.`;
}

const ROTULO_ESTADO = Object.freeze({ atingida: 'Atingida', 'no-ritmo': 'No ritmo', atrasada: 'Atrasada', adiantada: 'Adiantada' });

const TEXTO_DA_SITUACAO = Object.freeze({ dentro: 'Dentro da faixa saudável', acima: 'acima do limite superior', abaixo: 'abaixo do limite inferior' });

/**
 * Barra do peso na faixa saudável: trilho, zona verde da faixa (com os limites embaixo), um trecho na cor da situação
 * ligando a faixa ao peso (a "distância" que falta) e o marcador do peso. A meta aparece como um traço tracejado.
 */
function barraDaFaixa({ faixa, pesoKg, metaKg, situacao }) {
  const pontos = [faixa.minKg, faixa.maxKg, pesoKg, ...(metaKg ? [metaKg] : [])];
  const margem = Math.max((faixa.maxKg - faixa.minKg) * 0.25, 2);
  const de = Math.min(...pontos) - margem;
  const ate = Math.max(...pontos) + margem;
  const pct = (v) => ((v - de) / (ate - de)) * 100;
  const limite = pesoKg > faixa.maxKg ? faixa.maxKg : faixa.minKg;
  const esquerda = Math.min(pct(pesoKg), pct(limite));
  const largura = Math.abs(pct(pesoKg) - pct(limite));
  const rotulo = (valor) => h('span', { class: 'peso-barra-rotulo', style: `left:${pct(valor).toFixed(1)}%` }, formatarNumero(valor, 1));
  return h(
    'div',
    { class: `peso-barra-bloco peso-${situacao.gravidade}-barra`, role: 'img', 'aria-label': `Peso de ${kg(pesoKg)} contra a faixa saudável de ${kg(faixa.minKg)} a ${kg(faixa.maxKg)}` },
    h(
      'div',
      { class: 'peso-barra' },
      h('span', { class: 'peso-barra-faixa', style: `left:${pct(faixa.minKg).toFixed(1)}%;width:${(pct(faixa.maxKg) - pct(faixa.minKg)).toFixed(1)}%`, title: `Faixa saudável: ${kg(faixa.minKg)} a ${kg(faixa.maxKg)}` }),
      situacao.estado === 'dentro' ? null : h('span', { class: 'peso-barra-distancia', style: `left:${esquerda.toFixed(1)}%;width:${largura.toFixed(1)}%` }),
      metaKg ? h('span', { class: 'peso-barra-meta', style: `left:${pct(metaKg).toFixed(1)}%`, title: `Meta: ${kg(metaKg)}` }) : null,
      h('span', { class: 'peso-barra-marcador', style: `left:${pct(pesoKg).toFixed(1)}%`, title: `Você: ${kg(pesoKg)}` }),
    ),
    h('div', { class: 'peso-barra-rotulos' }, rotulo(faixa.minKg), rotulo(faixa.maxKg)),
  );
}

/**
 * Página Saúde: controles fixos no topo (índice das seções, período único dos gráficos e "Registrar peso"), Resumo do período,
 * Peso (gráfico, meta, IMC e histórico), Sono, passos e treino (um gráfico) e Medidas corporais.
 */
export function render(raiz, sessao, params = {}) {
  const hoje = hojeIso();
  const dados = { pesagens: [], metas: [], configs: [], dias: [], medidas: [], bemEstar: [], bemEstarCarregou: false };
  const carregou = { pesagens: false, metas: false };
  let periodoId = '30d'; // período único da página: vale para o peso, o sono, os passos, a carga de treino e o resumo
  let avisoDaMeta = '';
  let projecaoAteMeta = false; // o eixo do gráfico termina em hoje; este botão o estende até a data da meta
  const cancelar = [];

  const graficoCartao = h('section', { class: 'card peso-grafico-cartao' });
  const lateral = h('div', { class: 'saude-peso-cartoes' });
  const erroGeral = areaMensagem();

  const periodo = () => PERIODOS_DO_PESO.find((p) => p.id === periodoId) ?? PERIODOS_DO_PESO[0];
  const metaAtiva = () => dados.metas.find((m) => m.status === 'ativa') ?? null;
  const alturaCm = () => configVigenteEm(dados.configs, hoje)?.alturaCm ?? dados.configs[dados.configs.length - 1]?.alturaCm ?? null;
  const sexo = () => {
    const vigente = configVigenteEm(dados.configs, hoje) ?? dados.configs[dados.configs.length - 1] ?? null;
    return vigente?.sexo ?? null;
  };
  /** true se a meta ativa pede perder peso, false se pede ganhar, null sem meta ou sem pesagem. */
  const perderPeso = () => {
    const meta = metaAtiva();
    const atual = resumoDePeso(dados.pesagens, hoje).atual;
    return meta && atual ? meta.pesoAlvoKg < atual.pesoKg : null;
  };

  // o Firestore pode entregar as preferências na hora (do cache): o callback não pode depender do resumo já existir
  let resumo = null;
  const sonoPassos = criarSecaoSonoPassosTreino({ sessao, hoje, dados, periodo, aoMudarMeta: () => resumo?.atualizar() });
  resumo = criarResumoDaSaude({ dados, hoje, periodo, metaPassos: () => sonoPassos.meta(), perderPeso });
  const historico = criarHistoricoDePesagens({ uid: sessao.uid, aoErro: (m) => erroGeral.mostrar(m) });
  const indice = criarIndiceDeSecoes({ raiz, secoes: SECOES, prefixo: 'saude-', rotaBase: '#/peso', rotuloAria: 'Seções da página Saúde' });
  const medidas = criarSecaoMedidas({ sessao, dados, hoje, perfil: () => ({ sexo: sexo(), alturaCm: alturaCm() }), erroGeral });
  const alimentacao = criarSecaoAlimentacao({ sessao, hoje, perderPeso });

  // ---- gráfico do peso (o período vem do seletor único da página)
  function desenharGrafico() {
    const faixa = faixaDePesoSaudavel(alturaCm());
    const meta = metaAtiva();
    const grafico = criarGraficoPeso({ pesagens: dados.pesagens, meta, hoje, periodoId, faixa, comProjecao: projecaoAteMeta });
    const temProjecao = grafico !== null && meta !== null && meta.dataAlvo > hoje;
    const esparso = grafico?.dataset.modo === 'esparso';
    montar(
      graficoCartao,
      h(
        'div',
        { class: 'bloco-topo' },
        h('h2', { class: 'titulo-bloco' }, 'Evolução do peso'),
        temProjecao
          ? h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', 'aria-pressed': String(projecaoAteMeta), onClick: () => { projecaoAteMeta = !projecaoAteMeta; desenharGrafico(); } }, projecaoAteMeta ? 'Ocultar projeção' : 'Ver projeção até a meta')
          : null,
      ),
      grafico ?? estadoVazio(carregou.pesagens ? 'Registre a primeira pesagem para ver o gráfico.' : 'Carregando…'),
      grafico
        ? h(
            'p',
            { class: 'peso-legenda texto-secundario' },
            h('span', { class: 'peso-leg peso-leg-ponto' }, 'Pesagem'),
            esparso ? null : h('span', { class: 'peso-leg peso-leg-media' }, 'Média de 7 dias'),
            meta ? h('span', { class: 'peso-leg peso-leg-meta' }, 'Meta') : null,
            faixa ? h('span', { class: 'peso-leg peso-leg-faixa' }, 'Faixa saudável') : null,
          )
        : null,
    );
  }

  // ---- meta de peso: o formulário abre numa janela
  function abrirMeta() {
    const meta = metaAtiva();
    const atual = resumoDePeso(dados.pesagens, hoje).atual;
    return abrirModal({
      classe: 'modal-meta',
      rotulo: meta ? 'Trocar a meta de peso' : 'Definir a meta de peso',
      conteudo: (fechar) => {
        const alvo = campo({ id: 'metapeso-alvo', rotulo: 'Peso desejado (kg)', inputmode: 'decimal', value: meta ? String(meta.pesoAlvoKg).replace('.', ',') : '', dica: atual ? `Hoje: ${kg(atual.pesoKg)}.` : 'Registre o peso de hoje para medir o progresso.' });
        const dataAlvo = campo({ id: 'metapeso-data', rotulo: 'Na data', tipo: 'date', value: meta?.dataAlvo ?? '', min: somarDias(hoje, 1) });
        const mensagem = areaMensagem();
        const salvar = h('button', { class: 'btn', type: 'submit' }, meta ? 'Trocar a meta' : 'Definir meta');
        const cancelarBotao = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(undefined) }, 'Cancelar');
        const form = h(
          'form',
          { class: 'prog-form', novalidate: true },
          h('h2', null, meta ? 'Trocar a meta de peso' : 'Definir a meta de peso'),
          h('div', { class: 'prog-form-grade' }, alvo.raiz, dataAlvo.raiz),
          mensagem.el,
          h('div', { class: 'prog-rodape' }, h('p', { class: 'texto-secundario' }, 'Perder mais de 1% do peso por semana gera um aviso. Há uma meta ativa por vez.'), h('div', { class: 'linha-botoes' }, salvar, cancelarBotao)),
        );
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          executarComBotao(salvar, mensagem, async () => {
            const avisos = await salvarMetaDePeso({ uid: sessao.uid, hoje, entrada: { pesoAlvoKg: alvo.input.value, dataAlvo: dataAlvo.input.value }, metasAtivas: meta ? [meta] : [], pesagens: dados.pesagens, alturaCm: alturaCm() });
            avisoDaMeta = avisos.join(' ');
            fechar(true);
            desenharLateral();
          });
        });
        setTimeout(() => alvo.input.focus(), 0);
        return form;
      },
    });
  }

  // ---- faixa acima do gráfico: a meta de peso e o IMC com a faixa saudável, lado a lado
  function desenharLateral() {
    const r = resumoDePeso(dados.pesagens, hoje);
    const meta = metaAtiva();
    const anteriores = dados.metas.filter((m) => m.status !== 'ativa').sort((a, b) => (a.dataAlvo < b.dataAlvo ? 1 : -1));
    const avaliacao = avaliarMetaPeso(meta, dados.pesagens, hoje);
    const progresso = meta ? progressoDaMetaPeso({ pesoInicialKg: meta.pesoInicialKg, pesoAtualKg: r.atual?.pesoKg, pesoAlvoKg: meta.pesoAlvoKg }) : null;
    const pct = progresso === null ? null : Math.round(progresso * 100);

    const cartaoMeta = h(
      'section',
      { class: 'card saude-lateral-card peso-meta' },
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Meta de peso'), h('button', { class: meta ? 'btn btn-secundario btn-pequeno' : 'btn btn-pequeno', type: 'button', onClick: abrirMeta }, meta ? 'Trocar meta' : 'Definir meta')),
      !meta
        ? h('p', { class: 'texto-secundario' }, 'Defina “chegar a X kg na data Y” e o app mostra se a sua tendência atual leva até lá e em que ritmo.')
        : h(
            'div',
            { class: `meta-resultado meta-${avaliacao.estado === 'atrasada' ? 'abaixo' : avaliacao.estado === 'adiantada' ? 'acima' : avaliacao.estado === 'sem-dados' ? 'sem-dados' : 'atinge'}`, role: 'status' },
            ROTULO_ESTADO[avaliacao.estado] ? h('span', { class: 'chip-estado' }, ROTULO_ESTADO[avaliacao.estado]) : null,
            h('p', null, textoDaAvaliacaoPeso(avaliacao)),
            avaliacao.agressiva ? h('p', { class: 'mensagem mensagem-aviso' }, 'Ritmo agressivo: perder mais de 1% do peso por semana é difícil de sustentar. Considere uma data mais distante ou um peso maior.') : null,
            pct === null
              ? null
              : h(
                  'div',
                  { class: 'meta-progresso' },
                  h('p', { class: 'texto-secundario' }, `${pct}% do caminho (${kg(meta.pesoInicialKg)} → ${kg(meta.pesoAlvoKg)}) · faltam ${formatarNumero(Math.abs((r.atual?.pesoKg ?? meta.pesoInicialKg) - meta.pesoAlvoKg), 1)} kg${avaliacao.dias >= 0 ? ` · ${avaliacao.dias === 0 ? 'a meta é hoje' : `${avaliacao.dias} dia${avaliacao.dias === 1 ? '' : 's'}`}` : ''}`),
                  h('div', { class: 'semana-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso da meta de peso' }, h('span', { style: `width:${pct}%` })),
                ),
          ),
      avisoDaMeta ? h('p', { class: 'mensagem mensagem-aviso' }, avisoDaMeta) : null,
      anteriores.length > 0
        ? h(
            'details',
            { class: 'peso-anteriores' },
            h('summary', null, `Metas anteriores (${anteriores.length})`),
            h(
              'ul',
              null,
              ...anteriores.map((m) =>
                h('li', null, `${kg(m.pesoAlvoKg)} até ${formatarData(m.dataAlvo)} `, h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', onClick: () => excluirMetaPeso(m.id).catch(() => erroGeral.mostrar('Não foi possível excluir a meta.')) }, 'Excluir')),
              ),
            ),
          )
        : null,
    );

    const imc = calcularImc(r.atual?.pesoKg, alturaCm());
    const faixa = faixaDePesoSaudavel(alturaCm());
    const situacao = r.atual ? situacaoNaFaixa(r.atual.pesoKg, faixa, imc) : null;
    const nomeDoEstado = situacao ? (situacao.estado === 'dentro' ? TEXTO_DA_SITUACAO.dentro : `${formatarNumero(situacao.diferencaKg, 1)} kg ${TEXTO_DA_SITUACAO[situacao.estado]}`) : null;
    const cartaoImc = h(
      'section',
      { class: 'card saude-lateral-card' },
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'IMC e faixa saudável')),
      imc === null
        ? h('p', { class: 'texto-secundario' }, 'Cadastre a altura na Configuração para ver o IMC e a faixa de peso saudável.')
        : h(
            'div',
            { class: 'saude-imc' },
            h('p', { class: 'saude-imc-linha' }, h('strong', { class: `saude-imc-valor${situacao ? ` peso-${situacao.gravidade}` : ''}` }, formatarNumero(imc, 1)), h('span', { class: 'texto-secundario' }, `${classificarImc(imc)} · altura ${alturaCm()} cm`)),
            faixa ? h('p', { class: 'texto-secundario' }, `Faixa para a sua altura: ${formatarNumero(faixa.minKg, 1)} a ${formatarNumero(faixa.maxKg, 1)} kg (IMC de 18,5 a 24,9)`) : null,
            faixa && r.atual && situacao ? barraDaFaixa({ faixa, pesoKg: r.atual.pesoKg, metaKg: meta?.pesoAlvoKg ?? null, situacao }) : null,
            nomeDoEstado ? h('p', { class: `peso-${situacao.gravidade}` }, nomeDoEstado) : null,
          ),
    );
    montar(lateral, cartaoMeta, cartaoImc);
  }

  function desenhar() {
    desenharGrafico();
    desenharLateral();
    historico.atualizar(dados.pesagens, carregou.pesagens);
    resumo.atualizar();
    sonoPassos.desenhar();
    medidas.atualizar();
  }

  // ---- controles fixos: índice das seções, período único e registro de peso
  const chips = h(
    'div',
    { class: 'ativ-grupo', role: 'group', 'aria-label': 'Período dos gráficos da página' },
    ...PERIODOS_DO_PESO.map((p) => h('button', { type: 'button', class: 'ativ-chip', 'data-periodo': p.id, onClick: () => mudarPeriodo(p.id) }, p.rotulo)),
  );
  function marcarChips() {
    chips.querySelectorAll('.ativ-chip').forEach((b) => {
      const ativo = b.dataset.periodo === periodoId;
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    });
  }
  function mudarPeriodo(id) {
    periodoId = id;
    marcarChips();
    ampliarBemEstar(periodo().dias); // passos e sono: só busca mais dias quando o período pede
    desenharGrafico();
    resumo.atualizar();
    sonoPassos.desenhar();
  }
  marcarChips();
  const botaoRegistrar = h('button', { class: 'btn btn-pequeno', type: 'button', onClick: () => abrirRegistroDePeso({ uid: sessao.uid, hoje }) }, 'Registrar peso');
  const controles = h('div', { class: 'saude-controles' }, indice.el, h('div', { class: 'saude-controles-acoes' }, chips, botaoRegistrar));

  const secao = (id, ...filhos) => h('div', { class: 'prog-secao', id: `saude-${id}` }, ...filhos);
  raiz.replaceChildren(
    h(
      'div',
      { class: 'ativ-pagina' },
      paginaTopo({ icone: 'saude', titulo: 'Saúde', subtitulo: 'Peso, sono, passos, medidas e alimentação, cruzados com a sua carga de treino.' }),
      controles,
      erroGeral.el,
      secao('resumo', resumo.el),
      secao('peso', lateral, graficoCartao, historico.el),
      secao('sono-passos', sonoPassos.el),
      secao('medidas', medidas.el),
      secao('alimentacao', alimentacao.el),
    ),
  );
  indice.observar();
  const secaoInicial = SECOES.some((x) => x.id === params.secao) ? params.secao : null;
  if (secaoInicial) setTimeout(() => indice.irPara(secaoInicial, 'auto'), 0);
  desenhar();

  const aoErro = () => erroGeral.mostrar('Não foi possível carregar os dados de peso.');
  cancelar.push(
    observarPesagens(
      sessao.uid,
      (lista) => {
        dados.pesagens = lista;
        carregou.pesagens = true;
        desenhar();
        alimentacao.desenhar(); // o objetivo mostrado segue a meta de peso
      },
      aoErro,
    ),
    observarMetasPeso(
      sessao.uid,
      (lista) => {
        dados.metas = lista;
        carregou.metas = true;
        desenhar();
        alimentacao.desenhar();
      },
      aoErro,
    ),
    observarConfigs(
      sessao.uid,
      (lista) => {
        dados.configs = lista;
        desenharGrafico();
        desenharLateral();
        medidas.atualizar();
      },
      () => {},
    ),
    observarMedidas(
      sessao.uid,
      (lista) => {
        dados.medidas = lista;
        medidas.desenhar();
      },
      aoErro,
    ),
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        dados.dias = lista;
        resumo.atualizar();
        sonoPassos.desenhar();
      },
      () => {},
    ),
  );

  // Passos e sono: carrega os últimos 90 dias e só amplia quando o período da página pede mais (6 meses, 1 ano ou tudo)
  let janelaBemEstar = 0;
  let cancelarBemEstar = () => {};
  function assinarBemEstar(dias) {
    cancelarBemEstar();
    janelaBemEstar = dias === null ? Infinity : dias;
    const desde = dias === null ? '2000-01-01' : somarDias(hoje, -dias);
    cancelarBemEstar = observarBemEstar(
      sessao.uid,
      desde,
      (lista) => {
        dados.bemEstar = lista;
        dados.bemEstarCarregou = true;
        resumo.atualizar();
        sonoPassos.desenhar();
      },
      () => {
        dados.bemEstarCarregou = true;
        sonoPassos.desenhar();
      },
      dias,
    );
  }
  function ampliarBemEstar(dias) {
    const pedida = dias === null ? Infinity : dias;
    if (pedida > janelaBemEstar) assinarBemEstar(dias);
  }
  assinarBemEstar(DIAS_CARREGADOS_BEM_ESTAR);

  return () => {
    cancelar.forEach((fn) => fn());
    cancelarBemEstar();
    indice.parar();
    medidas.fechar();
    sonoPassos.fechar();
    alimentacao.fechar();
  };
}
