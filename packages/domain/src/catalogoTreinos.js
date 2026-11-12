import { ESPORTES_TREINO, NIVEIS } from './treinosEstruturados.js';

/**
 * Catálogo de treinos intervalados do sistema (ciclismo e corrida), por foco e nível. Os modelos ficam no código
 * (sem custo de leitura) e cada um vira um modelo por esporte, com id `${base}-${esporte}`. Os blocos são por tempo
 * e zona de FC; esforços muito curtos (menos de ~2 min) têm a descrição do esforço, porque a FC reage devagar.
 */

const seg = (minutos) => Math.round(minutos * 60);

/**
 * Aquecimento e volta à calma são **marcadores**: a expansão do catálogo (`expandir`) troca cada um pelos passos certos para o
 * foco do treino (`aquecimentoDoFoco` e `voltaDoFoco`), então a duração não é escolhida treino a treino.
 */
const aquecimento = () => ({ marcador: 'aquecimento' });
const volta = () => ({ marcador: 'volta' });
const bloco = (min, zona, descricao) => ({ tipo: 'bloco', papel: 'principal', duracaoS: seg(min), zona, ...(descricao ? { descricao } : {}) });
const pausa = (min, zona = 'Z1', descricao = 'Recuperação') => ({ tipo: 'bloco', papel: 'recuperacao', duracaoS: seg(min), zona, descricao });
/** Série em minutos. */
const serie = (repeticoes, esforcoMin, esforcoZona, recMin, recZona = 'Z1', descricaoEsforco) => ({
  tipo: 'serie',
  repeticoes,
  esforco: { duracaoS: seg(esforcoMin), zona: esforcoZona, ...(descricaoEsforco ? { descricao: descricaoEsforco } : {}) },
  recuperacao: { duracaoS: seg(recMin), zona: recZona },
});
/** Série em segundos (esforços curtos). */
const serieS = (repeticoes, esforcoS, esforcoZona, recS, recZona = 'Z1', descricaoEsforco) => ({
  tipo: 'serie',
  repeticoes,
  esforco: { duracaoS: esforcoS, zona: esforcoZona, ...(descricaoEsforco ? { descricao: descricaoEsforco } : {}) },
  recuperacao: { duracaoS: recS, zona: recZona },
});

/** Pirâmide: esforços com as durações (min) dadas, recuperação em Z1 de `fracaoRec` do esforço anterior (mín. 1 min). */
function piramide(duracoes, zona, fracaoRec) {
  const passos = [];
  duracoes.forEach((d, i) => {
    passos.push(bloco(d, zona));
    if (i < duracoes.length - 1) passos.push(pausa(Math.max(1, d * fracaoRec)));
  });
  return passos;
}

/**
 * Aquecimento por foco (estudo em docs/dominio.md, "Aquecimento e volta à calma"):
 *  - treinos **moderados** (tempo, progressivo, fartlek): 10 min, 5 em zona 1 e 5 em zona 2, sem esforço forte;
 *  - treinos **fortes**: os mesmos blocos de zona 1 e 2 (7 min) e **aberturas**, esforços de 20 s na zona do primeiro esforço
 *    (zona 4 no limiar, over-under, pirâmide e subidas; zona 5 no VO2máx e nos sprints), cada uma seguida de 70 s leves; a última
 *    abertura é seguida de 2 min leves, para o primeiro esforço começar descansado. Dão cerca de 11 min com 2 aberturas e 12 min
 *    com 3 (antes eram 15). As aberturas são blocos de aquecimento (não entram como esforços principais).
 */
const ABERTURAS_DO_FOCO = Object.freeze({
  limiar: { n: 2, zona: 'Z4' },
  overunder: { n: 2, zona: 'Z4' },
  piramide: { n: 2, zona: 'Z4' },
  subidas: { n: 2, zona: 'Z4' },
  vo2max: { n: 3, zona: 'Z5' },
  sprint: { n: 3, zona: 'Z5' },
});

const aquecer = (min, zona, descricao) => ({ tipo: 'bloco', papel: 'aquecimento', duracaoS: seg(min), zona, descricao });

function aquecimentoDoFoco(foco) {
  // recuperação e resistência já começam leves: 5 min em zona 1 bastam, sem aberturas
  if (foco === 'recuperacao' || foco === 'resistencia') return [aquecer(5, 'Z1', 'Começando bem leve')];
  const aberturas = ABERTURAS_DO_FOCO[foco];
  if (!aberturas) return [aquecer(5, 'Z1', 'Começando bem leve'), aquecer(5, 'Z2', 'Subindo para a zona 2')];
  const passos = [aquecer(4, 'Z1', 'Começando bem leve'), aquecer(3, 'Z2', 'Subindo para a zona 2')];
  for (let i = 1; i <= aberturas.n; i++) {
    const ultima = i === aberturas.n;
    passos.push(
      { tipo: 'bloco', papel: 'aquecimento', duracaoS: 20, zona: aberturas.zona, descricao: `Abertura ${i} de ${aberturas.n}: 20 s no ritmo do primeiro esforço` },
      { tipo: 'bloco', papel: 'aquecimento', duracaoS: ultima ? 120 : 70, zona: 'Z1', descricao: ultima ? 'Solta e respira: o primeiro esforço vem já' : 'Solta e respira' },
    );
  }
  return passos;
}

/** Volta à calma: 8 min depois dos treinos fortes e 5 min depois dos moderados. */
const voltaDoFoco = (foco) => ({ tipo: 'bloco', papel: 'desaquecimento', duracaoS: seg(ABERTURAS_DO_FOCO[foco] ? 8 : 5), zona: 'Z1', descricao: 'Volta à calma' });

/** Troca os marcadores de aquecimento e volta à calma pelos passos do foco do treino. */
const resolverMarcadores = (m, esporte) =>
  (typeof m.passos === 'function' ? m.passos(esporte) : m.passos).flatMap((p) => (p.marcador === 'aquecimento' ? aquecimentoDoFoco(m.foco) : p.marcador === 'volta' ? [voltaDoFoco(m.foco)] : [p]));

/** Valor por esporte: `por(ciclismo, corrida)(esporte)`. Os treinos longos e leves precisam de durações diferentes no pedal e na corrida. */
const por = (ciclismo, corrida) => (esporte) => (esporte === 'ciclismo' ? ciclismo : corrida);

const BASE = [
  // ---- VO2máx ----
  { id: 'vo2-4x2', nome: 'Oi, Coração!', especificacao: '4 × 2 min no VO2', foco: 'vo2max', nivel: 'iniciante', descricao: 'Quatro esforços curtos e fortes para conhecer a sensação de FC alta, sem exagerar.', passos: [aquecimento(), serie(4, 2, 'Z5', 2.5), volta()] },
  { id: 'vo2-30-30', nome: 'Pisca-Pisca Dolorido', especificacao: '30/30 no VO2', foco: 'vo2max', nivel: 'iniciante', descricao: '8 repetições de 30 s fortes e 30 s leves. A FC demora a subir: faça pelo esforço (forte, mas controlado), não só pelo relógio.', passos: [aquecimento(), serieS(8, 30, 'Z5', 30, 'Z1', 'forte e controlado'), volta()] },
  { id: 'vo2-5x3', nome: 'Cinco Vezes, Por Quê?', especificacao: '5 × 3 min no VO2', foco: 'vo2max', nivel: 'intermediario', descricao: 'A série clássica para elevar o VO2máx: cinco esforços de 3 min com recuperação igual.', passos: [aquecimento(), serie(5, 3, 'Z5', 3), volta()] },
  { id: 'vo2-6x3', nome: 'Meia Dúzia de Arrependimentos', especificacao: '6 × 3 min no VO2', foco: 'vo2max', nivel: 'intermediario', descricao: 'Uma repetição a mais que a clássica. Mantenha o mesmo ritmo do primeiro ao último esforço.', passos: [aquecimento(), serie(6, 3, 'Z5', 3), volta()] },
  { id: 'vo2-4x4', nome: 'O Norueguês Sádico', especificacao: '4 × 4 min no VO2', foco: 'vo2max', nivel: 'intermediario', descricao: 'Quatro esforços de 4 min, o formato mais estudado para VO2máx. A FC chega perto do máximo no fim de cada um.', passos: [aquecimento(), serie(4, 4, 'Z5', 3), volta()] },
  { id: 'vo2-5x4', nome: 'Pulmão pra Fora', especificacao: '5 × 4 min no VO2', foco: 'vo2max', nivel: 'avancado', descricao: 'Volume alto de trabalho no VO2máx. Só com boa recuperação nos dias anteriores.', passos: [aquecimento(), serie(5, 4, 'Z5', 4), volta()] },
  { id: 'vo2-2x8x30', nome: 'Dois Tempos de Agonia', especificacao: '2 séries de 30/30', foco: 'vo2max', nivel: 'avancado', descricao: 'Duas séries de 8 × (30 s forte / 30 s leve), com 5 min de pausa entre elas. Esforço forte e controlado: a FC reage devagar.', passos: [aquecimento(), serieS(8, 30, 'Z5', 30, 'Z1', 'forte e controlado'), pausa(5), serieS(8, 30, 'Z5', 30, 'Z1', 'forte e controlado'), volta()] },

  // ---- Limiar ----
  { id: 'lim-2x10', nome: 'Dupla do Desconforto', especificacao: '2 × 10 min no limiar', foco: 'limiar', nivel: 'iniciante', descricao: 'Dois blocos de 10 min no ritmo que você sustentaria por cerca de 1 hora: desconfortável, mas estável.', passos: [aquecimento(), serie(2, 10, 'Z4', 5), volta()] },
  { id: 'lim-3x8', nome: 'Trio Parada Dura', especificacao: '3 × 8 min no limiar', foco: 'limiar', nivel: 'intermediario', descricao: 'Três blocos de 8 min, recuperação de 4 min. Bom para estabilizar o ritmo de limiar.', passos: [aquecimento(), serie(3, 8, 'Z4', 4), volta()] },
  { id: 'lim-3x10', nome: 'Meia Hora de Sofrência', especificacao: '3 × 10 min no limiar', foco: 'limiar', nivel: 'intermediario', descricao: '30 min no limiar divididos em três. Não saia forte demais no primeiro: o último tem que sair igual.', passos: [aquecimento(), serie(3, 10, 'Z4', 5), volta()] },
  { id: 'lim-2x15', nome: 'Quinze e Quinze, Sem Choro', especificacao: '2 × 15 min no limiar', foco: 'limiar', nivel: 'intermediario', descricao: 'Dois blocos longos para treinar a constância. Respire fundo e segure o ritmo.', passos: [aquecimento(), serie(2, 15, 'Z4', 5), volta()] },
  { id: 'lim-2x20', nome: 'Os Vinte da Verdade', especificacao: '2 × 20 min no limiar', foco: 'limiar', nivel: 'avancado', descricao: 'O treino clássico de limiar: 40 min de trabalho em dois blocos de 20.', passos: [aquecimento(), serie(2, 20, 'Z4', 6), volta()] },
  { id: 'lim-4x10', nome: 'Quarteto do Apocalipse', especificacao: '4 × 10 min no limiar', foco: 'limiar', nivel: 'avancado', descricao: 'Quatro blocos de 10 min com pausas curtas: muito tempo no limiar, com alívio entre eles.', passos: [aquecimento(), serie(4, 10, 'Z4', 4), volta()] },

  // ---- Tempo ----
  { id: 'tempo-20', nome: 'Cruzeiro com Opinião', especificacao: '20 min em ritmo de tempo', foco: 'tempo', nivel: 'iniciante', descricao: 'Um bloco contínuo em ritmo firme, abaixo do limiar. Constrói base de resistência.', passos: [aquecimento(), bloco(20, 'Z3'), volta()] },
  { id: 'tempo-30', nome: 'Cruzeiro Sem Escala', especificacao: '30 min em ritmo de tempo', foco: 'tempo', nivel: 'intermediario', descricao: 'Meia hora contínua em ritmo firme, sem variar.', passos: [aquecimento(), bloco(30, 'Z3'), volta()] },
  { id: 'tempo-2x20', nome: 'Dois Cruzeiros, Zero Sombra', especificacao: '2 × 20 min em tempo', foco: 'tempo', nivel: 'intermediario', descricao: 'Dois blocos de 20 min em ritmo de tempo, com 5 min de pausa.', passos: [aquecimento(), serie(2, 20, 'Z3', 5), volta()] },
  { id: 'tempo-45', nome: 'Maratona do Teimoso', especificacao: '45 min em ritmo de tempo', foco: 'tempo', nivel: 'avancado', descricao: 'Um bloco longo e contínuo para resistência muscular.', passos: [aquecimento(), bloco(45, 'Z3'), volta()] },

  // ---- Over-under ----
  { id: 'ou-2x15', nome: 'Gangorra do Sofrimento', especificacao: 'Over-under 2 × 15 min', foco: 'overunder', nivel: 'intermediario', descricao: 'Alterna 3 min no limiar (over) e 3 min logo abaixo (under), sem parar. Ensina o corpo a limpar o esforço rodando forte.', passos: [aquecimento(), serie(3, 3, 'Z4', 3, 'Z3'), pausa(5), serie(3, 3, 'Z4', 3, 'Z3'), volta()] },
  { id: 'ou-3x15', nome: 'Montanha-Russa Sem Cinto', especificacao: 'Over-under 3 × 21 min', foco: 'overunder', nivel: 'avancado', descricao: 'Três séries de 21 min alternando 3 min no limiar e 3 min logo abaixo. Treino duro de verdade.', passos: [aquecimento(), serie(4, 3, 'Z4', 3, 'Z3'), pausa(5), serie(4, 3, 'Z4', 3, 'Z3'), pausa(5), serie(4, 3, 'Z4', 3, 'Z3'), volta()] },

  // ---- Pirâmides ----
  { id: 'pir-246', nome: 'Pirâmide do Faraó Bravo', especificacao: 'Pirâmide 2-4-6-4-2 no limiar', foco: 'piramide', nivel: 'intermediario', descricao: 'Os esforços crescem até 6 min e voltam a diminuir. Quebra a monotonia e treina o limiar em vários tamanhos.', passos: [aquecimento(), ...piramide([2, 4, 6, 4, 2], 'Z4', 0.6), volta()] },
  { id: 'pir-vo2', nome: 'Escadaria pro Inferno', especificacao: 'Pirâmide 1-2-3-4-3-2-1 no VO2', foco: 'piramide', nivel: 'avancado', descricao: 'Sobe a escada de 1 a 4 min e desce de volta, sempre forte. A pausa é igual ao esforço anterior.', passos: [aquecimento(), ...piramide([1, 2, 3, 4, 3, 2, 1], 'Z5', 1), volta()] },

  { id: 'pir-234', nome: 'Pirâmide de Isopor', especificacao: 'Pirâmide 2-3-4-3-2 em tempo', foco: 'piramide', nivel: 'iniciante', descricao: 'Esforços de 2, 3, 4, 3 e 2 min em ritmo firme (tempo), com pausas curtas. Uma pirâmide leve para começar a variar o treino.', passos: [aquecimento(), ...piramide([2, 3, 4, 3, 2], 'Z3', 0.5), volta()] },

  // ---- Fartlek ----
  { id: 'fart-leve', nome: 'Brincadeira de Criança', especificacao: 'Fartlek leve', foco: 'fartlek', nivel: 'iniciante', descricao: '8 esforços de 1 min fortes, cada um seguido de 2 min leves. Brincadeira de ritmos, sem pressão.', passos: [aquecimento(), serie(8, 1, 'Z4', 2, 'Z2'), volta()] },
  { id: 'fart-medio', nome: 'Troca-Troca Maluco', especificacao: 'Fartlek de ritmos', foco: 'fartlek', nivel: 'intermediario', descricao: 'Duas fases: 6 esforços de 2 min no limiar e, depois de uma pausa, 4 esforços de 1 min bem fortes.', passos: [aquecimento(), serie(6, 2, 'Z4', 2, 'Z2'), pausa(3, 'Z2'), serie(4, 1, 'Z5', 2, 'Z2'), volta()] },
  { id: 'fart-forte', nome: 'Imprevisível e Mal-Humorado', especificacao: 'Fartlek variado', foco: 'fartlek', nivel: 'avancado', descricao: 'Cinco esforços de 3 min no limiar e cinco de 1 min no máximo controlado, com pouca recuperação.', passos: [aquecimento(), serie(5, 3, 'Z4', 2, 'Z2'), pausa(3, 'Z2'), serie(5, 1, 'Z5', 1.5, 'Z2'), volta()] },

  // ---- Sprints ----
  { id: 'spr-6x20', nome: 'Faísca na Veia', especificacao: '6 × 20 s de sprint', foco: 'sprint', nivel: 'iniciante', descricao: 'Seis tiros de 20 s no máximo, com 3 min de recuperação total. A FC não acompanha tiros tão curtos: guie-se pelo esforço.', passos: [aquecimento(), serieS(6, 20, 'Z5', 180, 'Z1', 'esforço máximo'), volta()] },
  { id: 'spr-8x30', nome: 'Raio Que o Parta', especificacao: '8 × 30 s de sprint', foco: 'sprint', nivel: 'intermediario', descricao: 'Oito tiros de 30 s no máximo, com recuperação de 3 min 30 s para sair inteiro em cada um.', passos: [aquecimento(), serieS(8, 30, 'Z5', 210, 'Z1', 'esforço máximo'), volta()] },
  { id: 'spr-10x30', nome: 'Tempestade de Palavrão', especificacao: '10 × 30 s de sprint', foco: 'sprint', nivel: 'avancado', descricao: 'Dez tiros de 30 s no máximo, com 3 min de recuperação. Qualidade acima de tudo: pare se o ritmo cair muito.', passos: [aquecimento(), serieS(10, 30, 'Z5', 180, 'Z1', 'esforço máximo'), volta()] },

  // ---- Progressivos ----
  { id: 'prog-3x10', nome: 'Subindo o Tom', especificacao: 'Progressivo 3 × 10 min', foco: 'progressivo', nivel: 'iniciante', descricao: 'Três degraus de 10 min, cada um um pouco mais forte que o anterior (Z2, Z3, Z4). Termina cansado, não exausto.', passos: [aquecimento(), bloco(10, 'Z2'), bloco(10, 'Z3'), bloco(10, 'Z4'), volta()] },
  { id: 'prog-4x10', nome: 'Escada Rolante Quebrada', especificacao: 'Progressivo 4 × 10 min', foco: 'progressivo', nivel: 'intermediario', descricao: 'Quatro degraus (Z2, Z3, Z4 e 5 min em Z5) com aceleração contínua. Os últimos minutos são os de verdade.', passos: [aquecimento(), bloco(10, 'Z2'), bloco(10, 'Z3'), bloco(10, 'Z4'), bloco(5, 'Z5'), volta()] },

  // ---- Recuperação (zona 1 é muito fácil, mais leve que uma escada rolante: só existe para o iniciante, curta, e a IA só a considera para ele) ----
  { id: 'rec-cafe', nome: 'Café com Leite', especificacao: 'Zona 1 contínua, bem leve', foco: 'recuperacao', nivel: 'iniciante', descricao: 'Um giro curto e bem leve para as pernas se recuperarem. Se a conversa ficar difícil, você está forte demais.', passos: (e) => [aquecimento(), bloco(por(25, 15)(e), 'Z1', 'Bem leve, sem olhar o relógio'), volta()] },

  // ---- Resistência (zona 2, a base aeróbica) ----
  { id: 'res-constante', nome: 'Constante Sem Drama', especificacao: 'Zona 2 contínua', foco: 'resistencia', nivel: 'iniciante', descricao: 'Zona 2 do começo ao fim, em ritmo de conversa. Constrói a base aeróbica sem cansar.', passos: (e) => [aquecimento(), bloco(por(50, 30)(e), 'Z2', 'Ritmo de conversa'), volta()] },
  { id: 'res-folego', nome: 'Fôlego Longo', especificacao: 'Zona 2 contínua, mais longa', foco: 'resistencia', nivel: 'iniciante', descricao: 'A mesma zona 2, só que por mais tempo. Aumente a duração com calma, semana a semana.', passos: (e) => [aquecimento(), bloco(por(80, 50)(e), 'Z2', 'Ritmo de conversa'), volta()] },
  { id: 'res-base', nome: 'Base Sólida', especificacao: 'Zona 2 longa e contínua', foco: 'resistencia', nivel: 'intermediario', descricao: 'Um bloco longo em zona 2: o treino que sustenta todos os outros. Não passe de zona 2 nem para provar nada.', passos: (e) => [aquecimento(), bloco(por(110, 65)(e), 'Z2', 'Ritmo de conversa'), volta()] },
  { id: 'res-passeio', nome: 'Passeio com Pimenta', especificacao: 'Zona 2 com 6 aceleradas', foco: 'resistencia', nivel: 'intermediario', descricao: 'Zona 2 e, no final, seis aceleradas de 30 s com 90 s para soltar. Quebra a monotonia e acorda as pernas.', passos: (e) => [aquecimento(), bloco(por(70, 44)(e), 'Z2', 'Ritmo de conversa'), serieS(6, 30, 'Z4', 90, 'Z1', 'Acelerada solta, sem forçar'), volta()] },
  { id: 'res-marolas', nome: 'Marolas na Zona 2', especificacao: 'Zona 2 com ondas em zona 3', foco: 'resistencia', nivel: 'intermediario', descricao: 'Zona 2 com ondas de 5 min em zona 3, cada uma seguida de um trecho leve. Mais estímulo sem virar treino forte.', passos: (e) => [aquecimento(), bloco(por(54, 30)(e), 'Z2', 'Ritmo de conversa'), serie(por(4, 3)(e), 5, 'Z3', por(12, 10)(e), 'Z2', 'Onda firme'), volta()] },
  { id: 'res-longao', nome: 'Longão do Domingo', especificacao: 'Zona 2 longa (2 h ou mais)', foco: 'resistencia', nivel: 'avancado', descricao: 'O longão de verdade, em zona 2 contínua. Leve água e comida, e não transforme em corrida.', passos: (e) => [aquecimento(), bloco(por(170, 110)(e), 'Z2', 'Ritmo de conversa'), volta()] },
  { id: 'res-finale', nome: 'Longão com Gran Finale', especificacao: 'Zona 2 longa com final firme em zona 3', foco: 'resistencia', nivel: 'avancado', descricao: 'Longão em zona 2 que termina com 20 min mais firmes, em zona 3, já com as pernas cansadas. Dura mais que parece.', passos: (e) => [aquecimento(), bloco(por(120, 90)(e), 'Z2', 'Ritmo de conversa'), bloco(20, 'Z3', 'Final firme'), volta()] },

  // ---- Subidas ----
  { id: 'sub-4x2', nome: 'Rampinha Inocente', especificacao: '4 × 2 min em subida', foco: 'subidas', nivel: 'iniciante', descricao: 'Quatro subidas curtas de 2 min em esforço firme, com 3 min para recuperar na descida. A porta de entrada para treinar subida.', passos: [aquecimento(), serie(4, 2, 'Z4', 3), volta()] },
  { id: 'sub-6x3', nome: 'Rampa Sem Piedade', especificacao: '6 × 3 min em subida', foco: 'subidas', nivel: 'intermediario', descricao: 'Seis subidas de 3 min no limiar. Desça ou volte devagar para recuperar. Trabalha força e limiar juntos.', passos: [aquecimento(), serie(6, 3, 'Z4', 3), volta()] },
  { id: 'sub-8x2', nome: 'Serra do Arrependimento', especificacao: '8 × 2 min em subida forte', foco: 'subidas', nivel: 'avancado', descricao: 'Oito subidas de 2 min fortes, com 3 min de recuperação na descida. Pico de FC no fim de cada uma.', passos: [aquecimento(), serie(8, 2, 'Z5', 3), volta()] },
];

/** Modelos só de um esporte (os demais valem para os dois). */
const SO_CORRIDA = [
  { id: 'tiros-10x1', nome: 'Tiro Curto, Fôlego Curto', especificacao: 'Tiros de 1 min', foco: 'vo2max', nivel: 'iniciante', descricao: 'Dez tiros de 1 min fortes, com 1 min 30 s de trote para recuperar. O clássico da pista, por tempo.', passos: [aquecimento(), serie(10, 1, 'Z5', 1.5), volta()] },
];

/**
 * Teste de LTHR de 30 minutos (protocolo de Joe Friel, o mesmo de Configuração): aquecimento de 18 min (mais longo que o dos
 * outros treinos, porque o teste exige o esforço máximo sustentável desde o primeiro minuto), 10 + 20 min no maior ritmo que
 * você sustenta e volta à calma. Os passos principais têm **alvo de FC aberto**: o relógio não cobra uma faixa que o teste
 * ainda vai descobrir. Depois, importe a atividade e use a análise do teste em Configuração.
 */
const TESTE_DE_LTHR = {
  nome: 'Hora da Verdade',
  especificacao: 'Teste de LTHR de 30 minutos',
  foco: 'teste',
  descricao: 'Num trecho plano, sozinho e sem paradas: 10 min firmes e constantes e mais 20 min no maior ritmo que você sustenta. O seu LTHR é a FC média desses últimos 20 min. O relógio não cobra faixa de FC neste treino. Depois, importe a atividade e analise o teste em Configuração.',
};

function passosDoTeste() {
  const abertura = (i) => ({ tipo: 'bloco', papel: 'aquecimento', duracaoS: 60, zona: 'Z4', descricao: `Abertura ${i} de 2: 1 min firme` });
  const solta = (descricao) => ({ tipo: 'bloco', papel: 'aquecimento', duracaoS: 120, zona: 'Z1', descricao });
  return [
    aquecer(6, 'Z1', 'Começando bem leve'),
    aquecer(6, 'Z2', 'Subindo para a zona 2'),
    abertura(1),
    solta('Solta e respira'),
    abertura(2),
    solta('Solta e respira: o teste começa já'),
    { tipo: 'bloco', papel: 'principal', duracaoS: seg(10), zona: 'Z5', descricao: 'Primeiros 10 min: firme e constante, sem estourar', alvoAberto: true },
    { tipo: 'bloco', papel: 'principal', duracaoS: seg(20), zona: 'Z5', descricao: 'Últimos 20 min: o seu LTHR é a FC média desta parte', alvoAberto: true },
    { tipo: 'bloco', papel: 'desaquecimento', duracaoS: seg(10), zona: 'Z1', descricao: 'Volta à calma' },
  ];
}

function expandir() {
  const lista = [];
  for (const m of BASE) {
    for (const esporte of ESPORTES_TREINO) lista.push({ ...m, passos: resolverMarcadores(m, esporte), id: `${m.id}-${esporte}`, esporte, origem: 'catalogo' });
  }
  for (const m of SO_CORRIDA) lista.push({ ...m, passos: resolverMarcadores(m, 'corrida'), id: `${m.id}-corrida`, esporte: 'corrida', origem: 'catalogo' });
  // o teste de LTHR existe nos três níveis (a biblioteca filtra pelo nível do atleta)
  for (const nivel of Object.keys(NIVEIS)) {
    for (const esporte of ESPORTES_TREINO) lista.push({ ...TESTE_DE_LTHR, nivel, passos: passosDoTeste(), id: `teste-lthr-${nivel}-${esporte}`, esporte, origem: 'catalogo' });
  }
  return lista;
}

export const CATALOGO_TREINOS = Object.freeze(expandir());

/** Modelos do catálogo, com filtros opcionais por esporte, foco e nível. */
export function modelosDoCatalogo({ esporte, foco, nivel } = {}) {
  return CATALOGO_TREINOS.filter((m) => (!esporte || m.esporte === esporte) && (!foco || m.foco === foco) && (!nivel || m.nivel === nivel));
}

/** Busca um modelo pelo id, no catálogo e entre os próprios do usuário. */
export function modeloPorId(id, proprios = []) {
  return CATALOGO_TREINOS.find((m) => m.id === id) ?? proprios.find((m) => m.id === id) ?? null;
}
