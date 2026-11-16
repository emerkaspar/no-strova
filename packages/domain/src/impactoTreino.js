/**
 * Resumo do impacto de um treino: o que mudou em Condicionamento, Fadiga e Forma, equivalências bem-humoradas
 * das calorias, destaques frente ao histórico e recomendação para amanhã. Funções puras, sem Firebase e sem DOM.
 */
import { calcularSerieForma, faixaDaForma, somarDias } from './forma.js';
import { medalhasDasAtividades } from './medalhas.js';
import { maiorCondicionamento, semanaMaisPesada } from './recordesAtividades.js';
import { comparativoMensal, comparativoSemanal, inicioDaSemana, sequenciaSemanal } from './semana.js';

const arredondar = (n, casas = 1) => Number(n.toFixed(casas));

/**
 * Antes e depois de uma atividade.
 * Condicionamento e Fadiga são os valores no fim do dia do treino. A Forma é a de amanhã (Fitness − Fadiga do
 * dia do treino), porque a Forma de um dia usa os valores de ontem.
 *
 * @param {{ outrasAtividades: Array<{ data: string, hrss?: number|null }>, atividade: { data: string, hrss?: number|null } }} entrada
 *   `outrasAtividades` são todas as demais atividades do usuário (sem a atual, que é somada aqui)
 * @returns {null | { fitness, fadiga, forma: {antes:number, depois:number, delta:number}, faixaAntes, faixaDepois, hrss: number }}
 */
export function calcularImpacto({ outrasAtividades = [], atividade }) {
  const hrss = atividade?.hrss;
  if (!atividade?.data || !Number.isFinite(hrss) || hrss <= 0) return null;

  const base = outrasAtividades
    .filter((x) => x.data && Number.isFinite(x.hrss) && x.hrss > 0)
    .map((x) => ({ data: x.data, estresse: x.hrss }));
  const amanha = somarDias(atividade.data, 1);

  const estadoNoDia = (dias) => {
    const serie = calcularSerieForma(dias, { ate: amanha });
    const dia = serie.find((d) => d.data === atividade.data);
    // sem nenhum treino anterior, tudo era zero
    return dia ?? { fitness: 0, fadiga: 0 };
  };
  const antes = estadoNoDia(base);
  const depois = estadoNoDia([...base, { data: atividade.data, estresse: hrss }]);

  const par = (a, d) => ({ antes: arredondar(a), depois: arredondar(d), delta: arredondar(d - a) });
  const formaAntes = antes.fitness - antes.fadiga;
  const formaDepois = depois.fitness - depois.fadiga;
  return {
    hrss,
    fitness: par(antes.fitness, depois.fitness),
    fadiga: par(antes.fadiga, depois.fadiga),
    forma: par(formaAntes, formaDepois),
    faixaAntes: faixaDaForma(formaAntes),
    faixaDepois: faixaDaForma(formaDepois),
  };
}

/**
 * Catálogo de equivalências. `kcal` é o valor de uma unidade; `unidade` e `plural` concordam com o número;
 * `frases` usam {n} (já formatado, com a unidade) e podem ser sorteadas.
 */
export const EQUIVALENCIAS = Object.freeze([
  {
    id: 'cerveja',
    emoji: '🍺',
    kcal: 150,
    unidade: 'cerveja',
    plural: 'cervejas',
    frases: ['Em vez de tomar, você queimou {n}.', 'Isso paga {n}. Saúde! (sem querer incentivar)'],
  },
  {
    id: 'pizza',
    emoji: '🍕',
    kcal: 285,
    unidade: 'pedaço de pizza',
    plural: 'pedaços de pizza',
    frases: ['Você pode comer {n}, mas não recomendamos.', 'Dá para encarar {n}… e o seu treino de amanhã agradece que você não encare.'],
  },
  {
    id: 'brigadeiro',
    emoji: '🍫',
    kcal: 90,
    unidade: 'brigadeiro',
    plural: 'brigadeiros',
    frases: ['Foram {n} que você não precisa sentir culpa de comer. Quase.', 'O equivalente a {n} de festa de criança.'],
  },
  {
    id: 'hamburguer',
    emoji: '🍔',
    kcal: 500,
    unidade: 'hambúrguer',
    plural: 'hambúrgueres',
    frases: ['Você queimou {n}. Com batata, claro que não vale.', 'Isso foi {n} suado.'],
  },
  {
    id: 'pao-de-queijo',
    emoji: '🧀',
    kcal: 80,
    unidade: 'pão de queijo',
    plural: 'pães de queijo',
    frases: ['Seu café da tarde de hoje está liberado: {n}.', 'Dá {n}. Mineiro nenhum come só um.'],
  },
  {
    id: 'coxinha',
    emoji: '🥟',
    kcal: 280,
    unidade: 'coxinha',
    plural: 'coxinhas',
    frases: ['Seu esforço virou {n} de padaria.', 'Foram {n}. Passou da conta, pode comer o catupiry.'],
  },
  {
    id: 'acai',
    emoji: '🥣',
    kcal: 500,
    unidade: 'açaí de 500 ml',
    plural: 'açaís de 500 ml (com leite em pó)',
    frases: ['Você queimou {n}. E sim, o granola conta.'],
  },
  {
    id: 'banana',
    emoji: '🍌',
    kcal: 90,
    unidade: 'banana',
    plural: 'bananas',
    frases: ['Versão saudável: {n} repostas.', 'Para repor, bastam {n}.'],
  },
  {
    id: 'chopp',
    emoji: '🍻',
    kcal: 140,
    unidade: 'chopp',
    plural: 'chopps',
    frases: ['Rodada paga: {n} queimados.', 'Foram {n}. A rodada do pós-treino é por sua conta.'],
  },
  {
    id: 'sorvete',
    emoji: '🍦',
    kcal: 210,
    unidade: 'bola de sorvete',
    plural: 'bolas de sorvete',
    frases: ['Hoje você ganhou {n} de graça.'],
  },
]);

/** Texto da quantidade: "1 cerveja", "2,5 cervejas", "meia cerveja". */
export function textoDaQuantidade(quantidade, item) {
  if (quantidade <= 0.5) return `meia ${item.unidade}`;
  const n = quantidade >= 10 ? Math.round(quantidade) : Math.round(quantidade * 2) / 2; // de meio em meio
  const base = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${base} ${n === 1 ? item.unidade : item.plural}`;
}

/**
 * Sorteia equivalências de uma quantidade de calorias.
 * @param {number|null} kcal
 * @param {{ quantas?: number, sorteio?: () => number }} [opcoes] `sorteio` devolve [0, 1) (injetável nos testes)
 * @returns {Array<{ id, emoji, quantidade: number, texto: string, frase: string }>} vazio sem calorias
 */
export function equivalenciasDeCalorias(kcal, { quantas = 3, sorteio = Math.random } = {}) {
  if (!Number.isFinite(kcal) || kcal <= 0) return [];
  // só entram itens em que a quantia não vira "meia unidade" ou menos
  const elegiveis = EQUIVALENCIAS.filter((e) => kcal / e.kcal >= 0.75);
  const pool = (elegiveis.length ? elegiveis : [...EQUIVALENCIAS].sort((a, b) => a.kcal - b.kcal).slice(0, 2)).slice();
  const escolhidos = [];
  while (escolhidos.length < quantas && pool.length) {
    escolhidos.push(pool.splice(Math.min(pool.length - 1, Math.floor(sorteio() * pool.length)), 1)[0]);
  }
  return escolhidos.map((item) => {
    const quantidade = kcal / item.kcal;
    const texto = textoDaQuantidade(quantidade, item);
    const modelo = item.frases[Math.min(item.frases.length - 1, Math.floor(sorteio() * item.frases.length))];
    return { id: item.id, emoji: item.emoji, quantidade, texto, frase: modelo.replace('{n}', texto) };
  });
}

/**
 * Conquistas do treino frente a todo o histórico: medalhas de recorde (pódio e recentes), marcos (pico de
 * Condicionamento, semana mais pesada, sequência de semanas, distância acumulada) e os totais da semana e do mês
 * contra os períodos anteriores. Só traz o que é verdadeiro.
 *
 * @param {{ atividade: object, outrasAtividades?: object[], hojeIso?: string }} entrada `atividade` já com os campos salvos;
 *   `hojeIso` é a data de referência das medalhas recentes e dos comparativos (padrão: a data da atividade)
 * @returns {{ medalhas: object[], marcos: Array<{ id: string, emoji: string, texto: string }>, semana: object, mes: object, nSemana: number, nAno: number }}
 */
export function conquistasDoTreino({ atividade, outrasAtividades = [], hojeIso } = {}) {
  const hoje = hojeIso && hojeIso >= atividade.data ? hojeIso : atividade.data;
  const outras = outrasAtividades.filter((x) => x.id !== atividade.id);
  const todas = [...outras, atividade];
  const medalhas = medalhasDasAtividades(todas, hoje).get(atividade.id) ?? [];
  const marcos = [];

  // pico de Condicionamento (antes e depois deste treino)
  if (Number.isFinite(atividade.hrss) && atividade.hrss > 0) {
    const dias = (lista) => lista.filter((x) => x.hrss > 0).map((x) => ({ data: x.data, estresse: x.hrss }));
    const antes = maiorCondicionamento(calcularSerieForma(dias(outras), { ate: atividade.data }));
    const depois = maiorCondicionamento(calcularSerieForma(dias(todas), { ate: atividade.data }));
    if (depois && antes && depois.valor > antes.valor && depois.data === atividade.data) {
      marcos.push({ id: 'pico-condicionamento', emoji: '📈', texto: `Novo pico de Condicionamento: ${arredondar(depois.valor)}` });
    }
    const pesadaAntes = semanaMaisPesada(outras);
    const pesadaDepois = semanaMaisPesada(todas);
    if (pesadaAntes && pesadaDepois && pesadaDepois.inicio === inicioDaSemana(atividade.data) && pesadaDepois.valor > pesadaAntes.valor) {
      marcos.push({ id: 'semana-mais-pesada', emoji: '🏋️', texto: `Sua semana mais pesada até agora (HRSS ${arredondar(pesadaDepois.valor, 0)})` });
    }
  }

  // sequência de semanas seguidas com treino
  const seq = sequenciaSemanal(todas.map((x) => x.data), hoje);
  const antesSeq = sequenciaSemanal(outras.map((x) => x.data), hoje);
  if (seq.atual >= 2 && seq.nestaSemana) {
    const recorde = seq.atual === seq.recorde && seq.atual > antesSeq.recorde;
    marcos.push({ id: 'sequencia', emoji: '🔗', texto: recorde ? `${seq.atual} semanas seguidas treinando: sua maior sequência!` : `${seq.atual} semanas seguidas treinando` });
  }

  // distância acumulada no ano, no esporte: cruzou um marco redondo?
  const ano = atividade.data.slice(0, 4);
  const doAno = outras.filter((x) => x.esporte === atividade.esporte && x.data.slice(0, 4) === ano);
  const somaKm = (lista) => lista.reduce((t, x) => t + (Number(x.distanciaM) || 0), 0) / 1000;
  if (atividade.distanciaM > 0) {
    const antesKm = somaKm(doAno);
    const depoisKm = antesKm + atividade.distanciaM / 1000;
    const passo = depoisKm >= 1000 ? 500 : depoisKm >= 300 ? 100 : 50;
    const marco = Math.floor(depoisKm / passo) * passo;
    if (marco > 0 && antesKm < marco) marcos.push({ id: 'km-no-ano', emoji: '🗺️', texto: `Você passou de ${marco} km no ano (${atividade.esporte === 'ciclismo' ? 'pedalando' : 'em atividade'})` });
  }

  const nSemana = todas.filter((x) => x.data >= inicioDaSemana(atividade.data) && x.data <= atividade.data).length;
  const nAno = todas.filter((x) => x.data.slice(0, 4) === ano && x.data <= atividade.data).length;
  const dados = { atividades: todas, dias: todas.filter((x) => x.hrss > 0).map((x) => ({ data: x.data, estresse: x.hrss })) };
  const { atual: semana, anterior: semanaAnterior } = comparativoSemanal(atividade.data, dados);
  const { atual: mes, anterior: mesAnterior } = comparativoMensal(atividade.data, dados);
  return { medalhas, marcos, semana: { atual: semana, anterior: semanaAnterior }, mes: { atual: mes, anterior: mesAnterior }, nSemana, nAno };
}

/**
 * Frase de recuperação para amanhã, a partir da Forma prevista.
 * @param {number} formaAmanha
 * @returns {{ emoji: string, titulo: string, texto: string, faixa: object }}
 */
export function recomendacaoDeRecuperacao(formaAmanha) {
  const faixa = faixaDaForma(formaAmanha);
  const tabela = {
    transicao: { emoji: '🚀', titulo: 'Pode voltar com vontade', texto: 'Você está bem descansado: amanhã é dia de treino de qualidade.' },
    freshness: { emoji: '⚡', titulo: 'Pernas fresquinhas', texto: 'Amanhã comporta um treino forte. Aproveite.' },
    neutral: { emoji: '🙂', titulo: 'Tudo sob controle', texto: 'Um treino moderado amanhã mantém o ritmo sem pesar.' },
    optimal: { emoji: '💪', titulo: 'Na zona de evolução', texto: 'Você está carregado na medida certa. Amanhã, treino leve ou descanso ajudam a absorver.' },
    overload: { emoji: '🛌', titulo: 'Hora de segurar o freio', texto: 'A carga passou do ideal. Descanse amanhã: seu corpo evolui na recuperação.' },
  };
  return { ...tabela[faixa.id], faixa };
}
