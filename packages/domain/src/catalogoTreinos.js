import { ESPORTES_TREINO } from './treinosEstruturados.js';

/**
 * Catálogo de treinos intervalados do sistema (ciclismo e corrida), por foco e nível. Os modelos ficam no código
 * (sem custo de leitura) e cada um vira um modelo por esporte, com id `${base}-${esporte}`. Os blocos são por tempo
 * e zona de FC; esforços muito curtos (menos de ~2 min) têm a descrição do esforço, porque a FC reage devagar.
 */

const seg = (minutos) => Math.round(minutos * 60);

const aquecimento = (min = 10, zona = 'Z2') => ({ tipo: 'bloco', papel: 'aquecimento', duracaoS: seg(min), zona, descricao: 'Aquecimento progressivo' });
const volta = (min = 10) => ({ tipo: 'bloco', papel: 'desaquecimento', duracaoS: seg(min), zona: 'Z1', descricao: 'Volta à calma' });
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

const BASE = [
  // ---- VO2máx ----
  { id: 'vo2-4x2', nome: '4 × 2 min no VO2', apelido: 'Primeiro contato', foco: 'vo2max', nivel: 'iniciante', descricao: 'Quatro esforços curtos e fortes para conhecer a sensação de FC alta, sem exagerar.', passos: [aquecimento(12), serie(4, 2, 'Z5', 2.5), volta(10)] },
  { id: 'vo2-30-30', nome: '30/30 no VO2', apelido: 'Pisca-pisca', foco: 'vo2max', nivel: 'iniciante', descricao: '8 repetições de 30 s fortes e 30 s leves. A FC demora a subir: faça pelo esforço (forte, mas controlado), não só pelo relógio.', passos: [aquecimento(15), serieS(8, 30, 'Z5', 30, 'Z1', 'forte e controlado'), volta(10)] },
  { id: 'vo2-5x3', nome: '5 × 3 min no VO2', apelido: 'A clássica', foco: 'vo2max', nivel: 'intermediario', descricao: 'A série clássica para elevar o VO2máx: cinco esforços de 3 min com recuperação igual.', passos: [aquecimento(15), serie(5, 3, 'Z5', 3), volta(10)] },
  { id: 'vo2-6x3', nome: '6 × 3 min no VO2', apelido: 'Meia dúzia', foco: 'vo2max', nivel: 'intermediario', descricao: 'Uma repetição a mais que a clássica. Mantenha o mesmo ritmo do primeiro ao último esforço.', passos: [aquecimento(15), serie(6, 3, 'Z5', 3), volta(10)] },
  { id: 'vo2-4x4', nome: '4 × 4 min no VO2', apelido: 'O norueguês', foco: 'vo2max', nivel: 'intermediario', descricao: 'Quatro esforços de 4 min, o formato mais estudado para VO2máx. A FC chega perto do máximo no fim de cada um.', passos: [aquecimento(15), serie(4, 4, 'Z5', 3), volta(10)] },
  { id: 'vo2-5x4', nome: '5 × 4 min no VO2', apelido: 'Mão pesada', foco: 'vo2max', nivel: 'avancado', descricao: 'Volume alto de trabalho no VO2máx. Só com boa recuperação nos dias anteriores.', passos: [aquecimento(15), serie(5, 4, 'Z5', 4), volta(10)] },
  { id: 'vo2-2x8x30', nome: '2 séries de 30/30', apelido: 'Dois tempos', foco: 'vo2max', nivel: 'avancado', descricao: 'Duas séries de 8 × (30 s forte / 30 s leve), com 5 min de pausa entre elas. Esforço forte e controlado: a FC reage devagar.', passos: [aquecimento(15), serieS(8, 30, 'Z5', 30, 'Z1', 'forte e controlado'), pausa(5), serieS(8, 30, 'Z5', 30, 'Z1', 'forte e controlado'), volta(10)] },

  // ---- Limiar ----
  { id: 'lim-2x10', nome: '2 × 10 min no limiar', apelido: 'Dupla de dez', foco: 'limiar', nivel: 'iniciante', descricao: 'Dois blocos de 10 min no ritmo que você sustentaria por cerca de 1 hora: desconfortável, mas estável.', passos: [aquecimento(15), serie(2, 10, 'Z4', 5), volta(10)] },
  { id: 'lim-3x8', nome: '3 × 8 min no limiar', apelido: 'Trinca', foco: 'limiar', nivel: 'intermediario', descricao: 'Três blocos de 8 min, recuperação de 4 min. Bom para estabilizar o ritmo de limiar.', passos: [aquecimento(15), serie(3, 8, 'Z4', 4), volta(10)] },
  { id: 'lim-3x10', nome: '3 × 10 min no limiar', apelido: 'Meia hora de limiar', foco: 'limiar', nivel: 'intermediario', descricao: '30 min no limiar divididos em três. Não saia forte demais no primeiro: o último tem que sair igual.', passos: [aquecimento(15), serie(3, 10, 'Z4', 5), volta(10)] },
  { id: 'lim-2x15', nome: '2 × 15 min no limiar', apelido: 'Dois quinzes', foco: 'limiar', nivel: 'intermediario', descricao: 'Dois blocos longos para treinar a constância. Respire fundo e segure o ritmo.', passos: [aquecimento(15), serie(2, 15, 'Z4', 5), volta(10)] },
  { id: 'lim-2x20', nome: '2 × 20 min no limiar', apelido: 'Os vinte', foco: 'limiar', nivel: 'avancado', descricao: 'O treino clássico de limiar: 40 min de trabalho em dois blocos de 20.', passos: [aquecimento(15), serie(2, 20, 'Z4', 6), volta(10)] },
  { id: 'lim-4x10', nome: '4 × 10 min no limiar', apelido: 'Quarteto', foco: 'limiar', nivel: 'avancado', descricao: 'Quatro blocos de 10 min com pausas curtas: muito tempo no limiar, com alívio entre eles.', passos: [aquecimento(15), serie(4, 10, 'Z4', 4), volta(10)] },

  // ---- Tempo ----
  { id: 'tempo-20', nome: '20 min em ritmo de tempo', apelido: 'Cruzeiro', foco: 'tempo', nivel: 'iniciante', descricao: 'Um bloco contínuo em ritmo firme, abaixo do limiar. Constrói base de resistência.', passos: [aquecimento(10), bloco(20, 'Z3'), volta(10)] },
  { id: 'tempo-30', nome: '30 min em ritmo de tempo', apelido: 'Cruzeiro longo', foco: 'tempo', nivel: 'intermediario', descricao: 'Meia hora contínua em ritmo firme, sem variar.', passos: [aquecimento(12), bloco(30, 'Z3'), volta(10)] },
  { id: 'tempo-2x20', nome: '2 × 20 min em tempo', apelido: 'Dois cruzeiros', foco: 'tempo', nivel: 'intermediario', descricao: 'Dois blocos de 20 min em ritmo de tempo, com 5 min de pausa.', passos: [aquecimento(12), serie(2, 20, 'Z3', 5), volta(10)] },
  { id: 'tempo-45', nome: '45 min em ritmo de tempo', apelido: 'Maratona de tempo', foco: 'tempo', nivel: 'avancado', descricao: 'Um bloco longo e contínuo para resistência muscular.', passos: [aquecimento(15), bloco(45, 'Z3'), volta(10)] },

  // ---- Over-under ----
  { id: 'ou-2x15', nome: 'Over-under 2 × 15 min', apelido: 'Gangorra', foco: 'overunder', nivel: 'intermediario', descricao: 'Alterna 3 min no limiar (over) e 3 min logo abaixo (under), sem parar. Ensina o corpo a limpar o esforço rodando forte.', passos: [aquecimento(15), serie(3, 3, 'Z4', 3, 'Z3'), pausa(5), serie(3, 3, 'Z4', 3, 'Z3'), volta(10)] },
  { id: 'ou-3x15', nome: 'Over-under 3 × 21 min', apelido: 'Montanha-russa', foco: 'overunder', nivel: 'avancado', descricao: 'Três séries de 21 min alternando 3 min no limiar e 3 min logo abaixo. Treino duro de verdade.', passos: [aquecimento(15), serie(4, 3, 'Z4', 3, 'Z3'), pausa(5), serie(4, 3, 'Z4', 3, 'Z3'), pausa(5), serie(4, 3, 'Z4', 3, 'Z3'), volta(10)] },

  // ---- Pirâmides ----
  { id: 'pir-246', nome: 'Pirâmide 2-4-6-4-2 no limiar', apelido: 'Pirâmide', foco: 'piramide', nivel: 'intermediario', descricao: 'Os esforços crescem até 6 min e voltam a diminuir. Quebra a monotonia e treina o limiar em vários tamanhos.', passos: [aquecimento(15), ...piramide([2, 4, 6, 4, 2], 'Z4', 0.6), volta(10)] },
  { id: 'pir-vo2', nome: 'Pirâmide 1-2-3-4-3-2-1 no VO2', apelido: 'Escadaria', foco: 'piramide', nivel: 'avancado', descricao: 'Sobe a escada de 1 a 4 min e desce de volta, sempre forte. A pausa é igual ao esforço anterior.', passos: [aquecimento(15), ...piramide([1, 2, 3, 4, 3, 2, 1], 'Z5', 1), volta(10)] },

  { id: 'pir-234', nome: 'Pirâmide 2-3-4-3-2 em tempo', apelido: 'Degraus curtos', foco: 'piramide', nivel: 'iniciante', descricao: 'Esforços de 2, 3, 4, 3 e 2 min em ritmo firme (tempo), com pausas curtas. Uma pirâmide leve para começar a variar o treino.', passos: [aquecimento(12), ...piramide([2, 3, 4, 3, 2], 'Z3', 0.5), volta(10)] },

  // ---- Fartlek ----
  { id: 'fart-leve', nome: 'Fartlek leve', apelido: 'Solto', foco: 'fartlek', nivel: 'iniciante', descricao: '8 esforços de 1 min fortes, cada um seguido de 2 min leves. Brincadeira de ritmos, sem pressão.', passos: [aquecimento(10), serie(8, 1, 'Z4', 2, 'Z2'), volta(10)] },
  { id: 'fart-medio', nome: 'Fartlek de ritmos', apelido: 'Troca-troca', foco: 'fartlek', nivel: 'intermediario', descricao: 'Duas fases: 6 esforços de 2 min no limiar e, depois de uma pausa, 4 esforços de 1 min bem fortes.', passos: [aquecimento(10), serie(6, 2, 'Z4', 2, 'Z2'), pausa(3, 'Z2'), serie(4, 1, 'Z5', 2, 'Z2'), volta(10)] },
  { id: 'fart-forte', nome: 'Fartlek variado', apelido: 'Imprevisível', foco: 'fartlek', nivel: 'avancado', descricao: 'Cinco esforços de 3 min no limiar e cinco de 1 min no máximo controlado, com pouca recuperação.', passos: [aquecimento(12), serie(5, 3, 'Z4', 2, 'Z2'), pausa(3, 'Z2'), serie(5, 1, 'Z5', 1.5, 'Z2'), volta(10)] },

  // ---- Sprints ----
  { id: 'spr-6x20', nome: '6 × 20 s de sprint', apelido: 'Faísca', foco: 'sprint', nivel: 'iniciante', descricao: 'Seis tiros de 20 s no máximo, com 3 min de recuperação total. A FC não acompanha tiros tão curtos: guie-se pelo esforço.', passos: [aquecimento(15), serieS(6, 20, 'Z5', 180, 'Z1', 'esforço máximo'), volta(10)] },
  { id: 'spr-8x30', nome: '8 × 30 s de sprint', apelido: 'Raio', foco: 'sprint', nivel: 'intermediario', descricao: 'Oito tiros de 30 s no máximo, com recuperação de 3 min 30 s para sair inteiro em cada um.', passos: [aquecimento(15), serieS(8, 30, 'Z5', 210, 'Z1', 'esforço máximo'), volta(10)] },
  { id: 'spr-10x30', nome: '10 × 30 s de sprint', apelido: 'Tempestade', foco: 'sprint', nivel: 'avancado', descricao: 'Dez tiros de 30 s no máximo, com 3 min de recuperação. Qualidade acima de tudo: pare se o ritmo cair muito.', passos: [aquecimento(15), serieS(10, 30, 'Z5', 180, 'Z1', 'esforço máximo'), volta(10)] },

  // ---- Progressivos ----
  { id: 'prog-3x10', nome: 'Progressivo 3 × 10 min', apelido: 'Degraus', foco: 'progressivo', nivel: 'iniciante', descricao: 'Três degraus de 10 min, cada um um pouco mais forte que o anterior (Z2, Z3, Z4). Termina cansado, não exausto.', passos: [aquecimento(10, 'Z1'), bloco(10, 'Z2'), bloco(10, 'Z3'), bloco(10, 'Z4'), volta(10)] },
  { id: 'prog-4x10', nome: 'Progressivo 4 × 10 min', apelido: 'Escada rolante', foco: 'progressivo', nivel: 'intermediario', descricao: 'Quatro degraus (Z2, Z3, Z4 e 5 min em Z5) com aceleração contínua. Os últimos minutos são os de verdade.', passos: [aquecimento(10, 'Z1'), bloco(10, 'Z2'), bloco(10, 'Z3'), bloco(10, 'Z4'), bloco(5, 'Z5'), volta(10)] },

  // ---- Subidas ----
  { id: 'sub-4x2', nome: '4 × 2 min em subida', apelido: 'Rampinha', foco: 'subidas', nivel: 'iniciante', descricao: 'Quatro subidas curtas de 2 min em esforço firme, com 3 min para recuperar na descida. A porta de entrada para treinar subida.', passos: [aquecimento(15), serie(4, 2, 'Z4', 3), volta(10)] },
  { id: 'sub-6x3', nome: '6 × 3 min em subida', apelido: 'Rampa', foco: 'subidas', nivel: 'intermediario', descricao: 'Seis subidas de 3 min no limiar. Desça ou volte devagar para recuperar. Trabalha força e limiar juntos.', passos: [aquecimento(15), serie(6, 3, 'Z4', 3), volta(10)] },
  { id: 'sub-8x2', nome: '8 × 2 min em subida forte', apelido: 'Serra', foco: 'subidas', nivel: 'avancado', descricao: 'Oito subidas de 2 min fortes, com 3 min de recuperação na descida. Pico de FC no fim de cada uma.', passos: [aquecimento(15), serie(8, 2, 'Z5', 3), volta(10)] },
];

/** Modelos só de um esporte (os demais valem para os dois). */
const SO_CORRIDA = [
  { id: 'tiros-10x1', nome: 'Tiros de 1 min', apelido: 'Tiro curto', foco: 'vo2max', nivel: 'iniciante', descricao: 'Dez tiros de 1 min fortes, com 1 min 30 s de trote para recuperar. O clássico da pista, por tempo.', passos: [aquecimento(12), serie(10, 1, 'Z5', 1.5), volta(10)] },
];

function expandir() {
  const lista = [];
  for (const m of BASE) {
    for (const esporte of ESPORTES_TREINO) lista.push({ ...m, id: `${m.id}-${esporte}`, esporte, origem: 'catalogo' });
  }
  for (const m of SO_CORRIDA) lista.push({ ...m, id: `${m.id}-corrida`, esporte: 'corrida', origem: 'catalogo' });
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
