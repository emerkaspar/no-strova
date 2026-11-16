/**
 * Resumo do impacto de um treino: o que mudou em Condicionamento, Fadiga e Forma, equivalências bem-humoradas
 * das calorias, destaques frente ao histórico e recomendação para amanhã. Funções puras, sem Firebase e sem DOM.
 */
import { calcularSerieForma, faixaDaForma, somarDias } from './forma.js';

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
 * Selos que o treino merece frente ao histórico do mesmo esporte (só os verdadeiros).
 * @param {object} atividade { id, esporte, data, distanciaM, duracaoS, hrss }
 * @param {object[]} historico demais atividades (a atual é ignorada pelo id)
 * @returns {Array<{ id: string, emoji: string, texto: string }>}
 */
export function destaquesDoTreino(atividade, historico = []) {
  const outras = historico.filter((x) => x.id !== atividade.id && x.esporte === atividade.esporte);
  if (outras.length < 3) return []; // sem histórico, comparar não significa nada
  const mes = atividade.data?.slice(0, 7);
  const doMes = outras.filter((x) => x.data?.slice(0, 7) === mes);
  const maior = (lista, campo) => lista.reduce((m, x) => Math.max(m, Number(x[campo]) || 0), 0);
  const selos = [];

  const comparar = (campo, nome, emoji) => {
    const v = Number(atividade[campo]) || 0;
    if (v <= 0) return;
    if (v > maior(outras, campo)) selos.push({ id: `${campo}-recorde`, emoji, texto: `Maior ${nome} de todos os seus treinos` });
    else if (doMes.length >= 3 && v > maior(doMes, campo)) selos.push({ id: `${campo}-mes`, emoji, texto: `Maior ${nome} do mês` });
  };
  comparar('distanciaM', 'distância', '📏');
  comparar('duracaoS', 'duração', '⏱️');
  comparar('hrss', 'carga (HRSS)', '🔥');
  return selos;
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
