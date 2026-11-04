import { avaliarMetaPeso, calcularImc, classificarImc, faixaDePesoSaudavel, situacaoNaFaixa, configVigenteEm, progressoDaMetaPeso, resumoDePeso, resumoSemanalDePeso, somarDias } from '@no-strova/domain';
import { salvarMetaDePeso, salvarPesagem } from '../../application/peso.js';
import { observarAtividadesDesde } from '../../infrastructure/atividadesRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { excluirMetaPeso, excluirPesagem, idDaPesagem, observarMetasPeso, observarPesagens } from '../../infrastructure/pesoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { criarGraficoPeso, PERIODOS_DO_PESO } from './graficoPeso.js';

const DIAS_DE_TREINO = 70;

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

/**
 * Cartão de indicador (mesmo estilo dos recordes): ícone, rótulo, valor grande e uma nota no rodapé. `gravidade`
 * (ok, atencao, alerta) colore a faixa lateral e o valor; `classeNota` colore a nota; `extra` entra entre o valor e o rodapé.
 */
function cartao({ rotulo, nomeIcone, valor, nota = null, classeNota = '', gravidade = '', extra = null, largo = false }) {
  return h(
    'article',
    { class: `ativ-recorde${largo ? ' ativ-recorde-largo' : ''}${gravidade ? ` peso-${gravidade}-cartao` : ''}` },
    h('div', { class: 'ativ-recorde-topo' }, h('span', { class: 'ativ-recorde-icone' }, icone(nomeIcone, 18)), h('span', { class: 'ativ-recorde-rotulo' }, rotulo)),
    h('strong', { class: `ativ-recorde-valor${gravidade ? ` peso-${gravidade}` : ''}` }, valor),
    extra,
    nota ? h('div', { class: 'ativ-recorde-rodape' }, h('span', { class: `ativ-recorde-quando ${classeNota}` }, nota)) : null,
  );
}

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

/** Peso e metas: registro de pesagens, indicadores, gráfico, meta de peso e resumo semanal com o treino. */
export function render(raiz, sessao) {
  const hoje = hojeIso();
  const dados = { pesagens: [], metas: [], configs: [], dias: [], atividades: [] };
  const carregou = { pesagens: false, metas: false };
  let periodoId = '90d';
  const cancelar = [];

  const tiles = h('div', { class: 'ativ-recordes-grade' });
  const graficoCartao = h('section', { class: 'card peso-grafico-cartao' });
  const metaCartao = h('section', { class: 'card peso-meta' });
  const semanalCartao = h('section', { class: 'card' });
  const historicoCartao = h('section', { class: 'card' });
  const erroGeral = areaMensagem();

  const metaAtiva = () => dados.metas.find((m) => m.status === 'ativa') ?? null;
  const alturaCm = () => configVigenteEm(dados.configs, hoje)?.alturaCm ?? dados.configs[dados.configs.length - 1]?.alturaCm ?? null;

  // ---- registro de pesagem
  const dataCampo = campo({ id: 'peso-data', rotulo: 'Data', tipo: 'date', value: hoje, max: hoje });
  const pesoCampo = campo({ id: 'peso-kg', rotulo: 'Peso (kg)', inputmode: 'decimal', placeholder: 'ex.: 82,4', autocomplete: 'off' });
  const msgRegistro = areaMensagem();
  const botaoRegistro = h('button', { class: 'btn', type: 'submit' }, 'Registrar peso');
  const formRegistro = h(
    'form',
    {
      class: 'peso-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botaoRegistro, msgRegistro, async () => {
          await salvarPesagem({ uid: sessao.uid, entrada: { data: dataCampo.input.value, pesoKg: pesoCampo.input.value }, hoje });
          pesoCampo.input.value = '';
          pesoCampo.input.focus();
        });
      },
    },
    dataCampo.raiz,
    pesoCampo.raiz,
    h('div', { class: 'campo campo-botao' }, botaoRegistro),
  );

  // ---- indicadores
  function desenharTiles() {
    const r = resumoDePeso(dados.pesagens, hoje);
    const meta = metaAtiva();
    const perder = meta && r.atual ? meta.pesoAlvoKg < r.atual.pesoKg : null;
    // verde quando a variação vai na direção da meta; neutro sem meta
    const gravidadeDaVariacao = (v) => (v === null || v === 0 || perder === null ? '' : (v < 0) === perder ? 'ok' : 'alerta');
    const imc = calcularImc(r.atual?.pesoKg, alturaCm());
    const faixa = faixaDePesoSaudavel(alturaCm());
    const situacao = r.atual ? situacaoNaFaixa(r.atual.pesoKg, faixa, imc) : null;
    const nomeDoEstado = situacao ? (situacao.estado === 'dentro' ? TEXTO_DA_SITUACAO.dentro : `${formatarNumero(situacao.diferencaKg, 1)} kg ${TEXTO_DA_SITUACAO[situacao.estado]}`) : null;
    montar(
      tiles,
      cartao({ rotulo: 'Peso atual', nomeIcone: 'peso', valor: r.atual ? kg(r.atual.pesoKg) : '—', nota: r.atual ? `em ${formatarData(r.atual.data)}` : 'Sem pesagens' }),
      cartao({ rotulo: 'Média de 7 dias', nomeIcone: 'atividades', valor: r.media7 === null ? '—' : kg(r.media7), nota: 'Suaviza as oscilações do dia' }),
      cartao({ rotulo: 'Tendência semanal', nomeIcone: r.semanalKg !== null && r.semanalKg > 0 ? 'setaCima' : 'setaBaixo', valor: r.semanalKg === null ? '—' : `${comSinal(r.semanalKg)} kg`, nota: 'Média de hoje contra a de 7 dias atrás', gravidade: gravidadeDaVariacao(r.semanalKg) }),
      cartao({ rotulo: 'Em 30 dias', nomeIcone: 'plano', valor: r.variacao30Kg === null ? '—' : `${comSinal(r.variacao30Kg)} kg`, nota: 'Contra a pesagem de 30 dias atrás', gravidade: gravidadeDaVariacao(r.variacao30Kg) }),
      cartao({ rotulo: 'IMC', nomeIcone: 'configuracao', valor: imc === null ? '—' : formatarNumero(imc, 1), nota: imc === null ? 'Cadastre a altura na Configuração' : `${classificarImc(imc)} · altura ${alturaCm()} cm`, gravidade: imc !== null && situacao ? situacao.gravidade : '' }),
      cartao({
        rotulo: 'Faixa saudável',
        nomeIcone: 'esporte',
        valor: faixa ? `${formatarNumero(faixa.minKg, 1)} a ${formatarNumero(faixa.maxKg, 1)} kg` : '—',
        gravidade: situacao?.gravidade ?? '',
        largo: true,
        extra: faixa && r.atual && situacao ? barraDaFaixa({ faixa, pesoKg: r.atual.pesoKg, metaKg: meta?.pesoAlvoKg ?? null, situacao }) : null,
        nota: faixa ? (situacao ? nomeDoEstado : 'Para a sua altura (IMC de 18,5 a 24,9)') : 'Cadastre a altura na Configuração',
        classeNota: situacao ? `peso-${situacao.gravidade}` : '',
      }),
    );
  }

  // ---- gráfico
  function desenharGrafico() {
    const chips = h(
      'div',
      { class: 'ativ-grupo', role: 'group', 'aria-label': 'Período do gráfico' },
      ...PERIODOS_DO_PESO.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: `ativ-chip${p.id === periodoId ? ' ativo' : ''}`,
            'aria-pressed': String(p.id === periodoId),
            onClick: () => {
              periodoId = p.id;
              desenharGrafico();
            },
          },
          p.rotulo,
        ),
      ),
    );
    const grafico = criarGraficoPeso({ pesagens: dados.pesagens, meta: metaAtiva(), hoje, periodoId, faixa: faixaDePesoSaudavel(alturaCm()) });
    montar(graficoCartao, 
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Evolução do peso'), chips),
      grafico ?? estadoVazio(carregou.pesagens ? 'Registre a primeira pesagem acima para ver o gráfico.' : 'Carregando…'),
      grafico
        ? h(
            'p',
            { class: 'peso-legenda texto-secundario' },
            h('span', { class: 'peso-leg peso-leg-ponto' }, 'Pesagem'),
            h('span', { class: 'peso-leg peso-leg-media' }, 'Média de 7 dias'),
            metaAtiva() ? h('span', { class: 'peso-leg peso-leg-meta' }, 'Meta') : null,
            faixaDePesoSaudavel(alturaCm()) ? h('span', { class: 'peso-leg peso-leg-faixa' }, 'Faixa saudável') : null,
          )
        : null,
    );
  }

  // ---- meta de peso
  function desenharMeta() {
    const meta = metaAtiva();
    const anteriores = dados.metas.filter((m) => m.status !== 'ativa').sort((a, b) => (a.dataAlvo < b.dataAlvo ? 1 : -1));
    const r = resumoDePeso(dados.pesagens, hoje);
    const avaliacao = avaliarMetaPeso(meta, dados.pesagens, hoje);
    const alvo = campo({ id: 'metapeso-alvo', rotulo: 'Peso desejado (kg)', inputmode: 'decimal', value: meta ? String(meta.pesoAlvoKg).replace('.', ',') : '', dica: r.atual ? `Hoje: ${kg(r.atual.pesoKg)}.` : 'Registre o peso de hoje para medir o progresso.' });
    const dataAlvo = campo({ id: 'metapeso-data', rotulo: 'Na data', tipo: 'date', value: meta?.dataAlvo ?? '', min: somarDias(hoje, 1) });
    const mensagem = areaMensagem();
    const botao = h('button', { class: 'btn', type: 'submit' }, meta ? 'Trocar a meta' : 'Definir meta');
    const form = h(
      'form',
      {
        novalidate: true,
        class: 'peso-form',
        onSubmit: (e) => {
          e.preventDefault();
          executarComBotao(botao, mensagem, async () => {
            const avisos = await salvarMetaDePeso({ uid: sessao.uid, hoje, entrada: { pesoAlvoKg: alvo.input.value, dataAlvo: dataAlvo.input.value }, metasAtivas: meta ? [meta] : [], pesagens: dados.pesagens, alturaCm: alturaCm() });
            if (avisos.length > 0) mensagem.mostrar(avisos.join(' '), 'aviso');
          });
        },
      },
      alvo.raiz,
      dataAlvo.raiz,
      h('div', { class: 'campo campo-botao' }, botao),
    );

    const progresso = meta ? progressoDaMetaPeso({ pesoInicialKg: meta.pesoInicialKg, pesoAtualKg: r.atual?.pesoKg, pesoAlvoKg: meta.pesoAlvoKg }) : null;
    const pct = progresso === null ? null : Math.round(progresso * 100);
    const resultado = !meta
      ? h('p', { class: 'texto-secundario' }, 'Defina “chegar a X kg na data Y” e o app mostra se a sua tendência atual leva até lá e em que ritmo. Perder mais de 1% do peso por semana gera um aviso.')
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
                h('p', { class: 'texto-secundario' }, `Progresso: ${pct}% do caminho (de ${kg(meta.pesoInicialKg)} até ${kg(meta.pesoAlvoKg)}) · faltam ${formatarNumero(Math.abs((r.atual?.pesoKg ?? meta.pesoInicialKg) - meta.pesoAlvoKg), 1)} kg. O progresso conta a partir do peso de quando a meta foi criada.`),
                h('div', { class: 'semana-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso da meta de peso' }, h('span', { style: `width:${pct}%` })),
              ),
          avaliacao.dias >= 0 ? h('p', { class: 'texto-secundario' }, avaliacao.dias === 0 ? 'A meta é hoje.' : `Faltam ${avaliacao.dias} dia${avaliacao.dias === 1 ? '' : 's'}.`) : null,
        );

    montar(metaCartao, 
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Meta de peso')),
      resultado,
      form,
      mensagem.el,
      anteriores.length > 0
        ? h(
            'details',
            { class: 'peso-anteriores' },
            h('summary', null, `Metas anteriores (${anteriores.length})`),
            h(
              'ul',
              null,
              ...anteriores.map((m) =>
                h(
                  'li',
                  null,
                  `${kg(m.pesoAlvoKg)} até ${formatarData(m.dataAlvo)} `,
                  h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', onClick: () => excluirMetaPeso(m.id).catch(() => erroGeral.mostrar('Não foi possível excluir a meta.')) }, 'Excluir'),
                ),
              ),
            ),
          )
        : null,
    );
  }

  // ---- peso e treino por semana
  function desenharSemanal() {
    const linhas = resumoSemanalDePeso({ pesagens: dados.pesagens, dias: dados.dias, atividades: dados.atividades }, hoje, 8);
    const temAlgo = linhas.some((l) => l.pesoMedioKg !== null || l.cargaHrss > 0 || l.kcalTreino > 0);
    montar(semanalCartao, 
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Peso e treino por semana')),
      temAlgo
        ? h(
            'div',
            { class: 'tabela-wrap' },
            h(
              'table',
              { class: 'tabela tabela-compacta' },
              h('thead', null, h('tr', null, ...['Semana', 'Peso médio', 'Carga (HRSS)', 'Gasto dos treinos'].map((t) => h('th', { scope: 'col' }, t)))),
              h(
                'tbody',
                null,
                ...linhas.map((l) =>
                  h(
                    'tr',
                    null,
                    h('td', null, `${formatarData(l.inicio).slice(0, 5)} a ${formatarData(l.fim).slice(0, 5)}`),
                    h('td', null, l.pesoMedioKg === null ? '—' : kg(l.pesoMedioKg)),
                    h('td', { class: 'celula-hrss' }, l.cargaHrss > 0 ? formatarNumero(l.cargaHrss, 0) : '—'),
                    h('td', null, l.kcalTreino > 0 ? `${formatarNumero(l.kcalTreino, 0)} kcal` : '—'),
                  ),
                ),
              ),
            ),
          )
        : estadoVazio('Sem dados nas últimas 8 semanas.'),
    );
  }

  // ---- histórico de pesagens
  function desenharHistorico() {
    const lista = [...dados.pesagens].sort((a, b) => (a.data < b.data ? 1 : -1));
    montar(historicoCartao, 
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Histórico de pesagens')),
      lista.length === 0
        ? estadoVazio(carregou.pesagens ? 'Nenhuma pesagem ainda.' : 'Carregando…')
        : h(
            'div',
            { class: 'tabela-wrap peso-historico' },
            h(
              'table',
              { class: 'tabela tabela-compacta' },
              h('thead', null, h('tr', null, ...['Data', 'Peso', ''].map((t) => h('th', { scope: 'col' }, t)))),
              h(
                'tbody',
                null,
                ...lista.slice(0, 60).map((p) =>
                  h(
                    'tr',
                    null,
                    h('td', null, formatarData(p.data)),
                    h('td', { class: 'celula-hrss' }, kg(p.pesoKg)),
                    h(
                      'td',
                      null,
                      h(
                        'button',
                        {
                          class: 'btn btn-secundario btn-pequeno',
                          type: 'button',
                          'aria-label': `Excluir a pesagem de ${formatarData(p.data)}`,
                          onClick: () => excluirPesagem(p.id ?? idDaPesagem(sessao.uid, p.data)).catch(() => erroGeral.mostrar('Não foi possível excluir a pesagem.')),
                        },
                        'Excluir',
                      ),
                    ),
                  ),
                ),
              ),
            ),
            lista.length > 60 ? h('p', { class: 'texto-secundario' }, `Mostrando as 60 mais recentes de ${lista.length}.`) : null,
          ),
    );
  }

  function desenhar() {
    desenharTiles();
    desenharGrafico();
    desenharMeta();
    desenharSemanal();
    desenharHistorico();
  }

  raiz.replaceChildren(
    h(
      'div',
      { class: 'ativ-pagina' },
      h('header', { class: 'ativ-cabecalho' }, h('div', null, h('h1', null, 'Peso'), h('p', { class: 'texto-secundario' }, 'Registre o peso, acompanhe a tendência e cruze com a carga de treino.'))),
      erroGeral.el,
      h('section', { class: 'card' }, h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Registrar peso')), formRegistro, msgRegistro.el),
      tiles,
      graficoCartao,
      metaCartao,
      semanalCartao,
      historicoCartao,
    ),
  );
  desenhar();

  const aoErro = () => erroGeral.mostrar('Não foi possível carregar os dados de peso.');
  cancelar.push(
    observarPesagens(
      sessao.uid,
      (lista) => {
        dados.pesagens = lista;
        carregou.pesagens = true;
        desenhar();
      },
      aoErro,
    ),
    observarMetasPeso(
      sessao.uid,
      (lista) => {
        dados.metas = lista;
        carregou.metas = true;
        desenhar();
      },
      aoErro,
    ),
    observarConfigs(
      sessao.uid,
      (lista) => {
        dados.configs = lista;
        desenharTiles();
        desenharMeta();
      },
      () => {},
    ),
    observarEstresseDiario(
      sessao.uid,
      (lista) => {
        dados.dias = lista;
        desenharSemanal();
      },
      () => {},
    ),
    observarAtividadesDesde(
      sessao.uid,
      somarDias(hoje, -DIAS_DE_TREINO),
      (lista) => {
        dados.atividades = lista;
        desenharSemanal();
      },
      () => {},
    ),
  );
  return () => cancelar.forEach((fn) => fn());
}
