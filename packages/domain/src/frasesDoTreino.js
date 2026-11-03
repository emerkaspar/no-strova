/**
 * Frases de humor para o dia de treino (cartão do dia no gráfico da Início). A frase acompanha o esforço: quanto mais
 * pesado o treino, mais dramática; quando é muito fácil, também vale a piada. Funções puras: a escolha depende só da
 * data e do esforço, então não muda a cada redesenho.
 */

/** Níveis de esforço, do mais leve ao mais pesado, com o limite superior de HRSS de cada um. */
export const NIVEIS_DE_ESFORCO = Object.freeze([
  { id: 'muito-facil', ate: 20 },
  { id: 'leve', ate: 45 },
  { id: 'moderado', ate: 80 },
  { id: 'forte', ate: 120 },
  { id: 'brutal', ate: Infinity },
]);

/** Nível de esforço pelo HRSS (estresse) do treino; sem valor, considera moderado. */
export function nivelDeEsforco(hrss) {
  if (!Number.isFinite(hrss) || hrss <= 0) return 'moderado';
  return NIVEIS_DE_ESFORCO.find((n) => hrss <= n.ate).id;
}

/** `antes`: para o treino que ainda vai acontecer; `depois`: para o que já foi feito. */
export const FRASES_DO_TREINO = Object.freeze({
  'muito-facil': {
    antes: [
      'Hoje é só pra desenferrujar a corrente.',
      'Treino tão leve que dá pra ir assobiando.',
      'Isso aqui nem é treino, é passeio com crachá.',
      'Vai com calma: hoje só dá nó, não dá suor.',
      'Se suar, desconfie do termômetro.',
      'Dia de girar as pernas e conversar com o vento.',
    ],
    depois: [
      'Hoje só deu nó.',
      'Treino tão leve que o suor nem ficou sabendo.',
      'Passeio com crachá de treino. Valeu.',
      'Girou as pernas e a conta quase não subiu.',
      'Nem a garrafa d’água sentiu falta de ser esvaziada.',
      'Foi quase um alongamento com rodas.',
    ],
  },
  leve: {
    antes: [
      'Ritmo de quem tem boleto, mas sem pressa.',
      'Dá pra conversar o treino inteiro. Aproveite.',
      'Treino de manutenção: o corpo agradece e o ego nem nota.',
      'Fácil o suficiente pra lembrar por que você gosta disso.',
      'Um treininho simpático, daqueles que cumprimentam a gente.',
      'Hoje o coração só passa pra dar um oi.',
    ],
    depois: [
      'Treino simpático: cumprido sem ninguém sair machucado.',
      'Fácil, gostoso e sem boletim de ocorrência.',
      'Base feita. O corpo guardou e agradeceu.',
      'Daqueles que fazem bem e não cobram a conta amanhã.',
      'Cumprido com um sorriso. Ou quase.',
      'O coração passou só pra dar um oi.',
    ],
  },
  moderado: {
    antes: [
      'Treino de gente grande: sem drama, mas com intenção.',
      'Aqui já tem trabalho de verdade. Capricha no aquecimento.',
      'Nem leve nem cruel: o ponto certo do esforço.',
      'Prepara a garrafa, que hoje vai pedir água.',
      'Dia de construir: tijolo por tijolo, batimento por batimento.',
      'Vai suar, mas com educação.',
    ],
    depois: [
      'Trabalho honesto, sem enrolação.',
      'Tijolinho colocado na obra do condicionamento.',
      'Suou, sorriu e seguiu a vida. Boa.',
      'Esforço no ponto certo: nem sobrou, nem faltou.',
      'Isso sim foi gastar a sola, a corrente e a água.',
      'Cumprido. O sofá que espere.',
    ],
  },
  forte: {
    antes: [
      'Hoje o treino morde. Come bem antes.',
      'Esse não é pra amador distraído. Foco e garrafa cheia.',
      'Vai doer num lugar bonito: o limite.',
      'Avise a família: hoje você volta com cara de quem viu coisa.',
      'Aqueça direito, que o treino não vai pedir licença.',
      'Os números não mentem, e hoje eles estão carrancudos.',
    ],
    depois: [
      'O treino mordeu e você mordeu de volta.',
      'Voltou com cara de quem viu coisa. Respeito.',
      'Isso foi trabalho pesado. Come bem e dorme melhor.',
      'O limite pediu desculpa por ter aparecido.',
      'Perna reclamando, orgulho sorrindo.',
      'Forte demais pra ser chamado de treino de domingo.',
    ],
  },
  brutal: {
    antes: [
      'Escreve o testamento antes. Brincadeira. Mais ou menos.',
      'Hoje o corpo vai negociar. Não aceite a primeira proposta.',
      'Treino de lenda ou de ambulância. Hidrate-se.',
      'Se sobrar pulmão no fim, você não fez direito.',
      'Combine com o sofá: à noite ele vai ser seu único amigo.',
      'Respire fundo agora, porque lá na frente vai faltar.',
    ],
    depois: [
      'Sobreviveu! Pode pedir a pizza, você merece.',
      'O sofá já te espera de braços abertos.',
      'Pulmão devolvido com juros. Lenda.',
      'Isso foi nível olímpico de sofrimento.',
      'Se a perna tremer na escada, é normal. É medalha.',
      'Treino épico. Agora só as escadas te seguram.',
    ],
  },
});

/**
 * Uma frase para o dia: escolhida de forma estável pela data (a mesma data sempre dá a mesma frase).
 * @param {{ hrss?: number|null, data: string, feito?: boolean }} entrada `feito`: o treino já aconteceu
 */
export function fraseDoTreino({ hrss, data, feito = false }) {
  const lista = FRASES_DO_TREINO[nivelDeEsforco(hrss)][feito ? 'depois' : 'antes'];
  const semente = [...String(data)].reduce((soma, c) => soma + c.charCodeAt(0), 0);
  return lista[semente % lista.length];
}
