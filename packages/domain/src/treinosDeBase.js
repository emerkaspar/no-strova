/**
 * Treinos de base para o rascunho do plano anual: rodagens leves e longões **com estrutura** (aquecimento, blocos por zona
 * e, em alguns, aceleradas ou ondas), em vez de um "Rodagem leve" igual todos os dias. Cada treino é um construtor que, dada a
 * duração desejada em minutos, devolve os passos (o formato de treinosEstruturados.js). Funções puras, sem Firebase e sem DOM.
 *
 * As durações dos passos são aproximadas: a duração real do treino vem da soma dos passos (`resumirTreino`).
 *
 * Aquecimento enxuto: rodagem e longão já começam leves, então o aquecimento é de 5 a 8 minutos (nenhum passa de 8); a volta à
 * calma é de 5. Ver o estudo em docs/dominio.md, "Aquecimento e volta à calma".
 */
import { duracaoTotalS } from './treinosEstruturados.js';

const seg = (minutos) => Math.round(minutos * 60);
const minimo = (v, piso) => Math.max(piso, Math.round(v));
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

const bloco = (papel, min, zona, descricao) => ({ tipo: 'bloco', papel, duracaoS: seg(min), zona, ...(descricao ? { descricao } : {}) });
const aquecer = (min, zona = 'Z2') => bloco('aquecimento', min, zona, 'Aquecimento progressivo');
const voltar = (min = 5) => bloco('desaquecimento', min, 'Z1', 'Volta à calma');
const principal = (min, zona, descricao) => bloco('principal', minimo(min, 1), zona, descricao);
const serie = (repeticoes, esforcoMin, esforcoZona, recMin, recZona, descricao) => ({
  tipo: 'serie',
  repeticoes,
  esforco: { duracaoS: seg(esforcoMin), zona: esforcoZona, ...(descricao ? { descricao } : {}) },
  recuperacao: { duracaoS: seg(recMin), zona: recZona },
});
const serieS = (repeticoes, esforcoS, esforcoZona, recS, recZona, descricao) => ({
  tipo: 'serie',
  repeticoes,
  esforco: { duracaoS: esforcoS, zona: esforcoZona, ...(descricao ? { descricao } : {}) },
  recuperacao: { duracaoS: recS, zona: recZona },
});

/**
 * Fecha a duração pedida: se os passos ficaram mais curtos que `minutos` (as séries não somam a recuperação depois da última
 * repetição), completa com um bloco em zona 2 logo depois do aquecimento.
 */
function fechar(passos, minutos) {
  const falta = minutos * 60 - duracaoTotalS(passos);
  if (falta < 60) return passos;
  return [passos[0], bloco('principal', falta / 60, 'Z2', 'Ritmo de conversa'), ...passos.slice(1)];
}

/**
 * @typedef {object} TreinoDeBase
 * @property {string} id
 * @property {'leve'|'longao'} tipo
 * @property {string} nome nome do treino (o mesmo na tela, no plano e no relógio)
 * @property {string} motivo frase curta para o rascunho
 * @property {number} minMin duração mínima em que o treino faz sentido
 * @property {number} maxMin duração máxima
 * @property {boolean} [recuperacao] serve para semana de recuperação (bem leve)
 * @property {(minutos: number) => any[]} passos
 */

/** @type {readonly TreinoDeBase[]} */
export const TREINOS_DE_BASE = Object.freeze([
  // ---- rodagens leves ----
  {
    id: 'leve-raiz', tipo: 'leve', nome: 'Rodagem Sem Pressa', minMin: 30, maxMin: 90, recuperacao: true,
    motivo: 'Rodagem leve em zona 2, no ritmo de conversa.',
    passos: (d) => [aquecer(5, 'Z1'), principal(d - 10, 'Z2', 'Ritmo de conversa'), voltar(5)],
  },
  {
    id: 'leve-recuperacao', tipo: 'leve', nome: 'Passeio da Vovó', minMin: 30, maxMin: 40, recuperacao: true,
    motivo: 'Giro bem leve em zona 1 para as pernas se recuperarem.',
    passos: (d) => [principal(d, 'Z1', 'Bem leve, sem olhar o relógio')],
  },
  {
    id: 'leve-soltura', tipo: 'leve', nome: 'Soltando a Ferrugem', minMin: 40, maxMin: 90, recuperacao: true,
    motivo: 'Rodagem leve com quatro toques rápidos e curtos, só para as pernas não enferrujarem.',
    passos: (d) => fechar([aquecer(8, 'Z1'), serieS(4, 20, 'Z3', 100, 'Z1', 'Toque rápido, sem sofrer'), voltar(5)], d),
  },
  {
    id: 'leve-alternado', tipo: 'leve', nome: 'Pé de Chinelo', minMin: 40, maxMin: 90, recuperacao: true,
    motivo: 'Alterna 10 minutos em zona 2 com 10 minutos em zona 1: leve e sem monotonia.',
    passos: (d) => {
      const n = limitar(Math.floor(d / 20), 2, 4); // n blocos de 10 min e n − 1 pausas de 10 min
      return fechar([aquecer(5, 'Z1'), serie(n, 10, 'Z2', 10, 'Z1', 'Ritmo de conversa'), voltar(5)], d);
    },
  },
  {
    id: 'leve-aceleradas', tipo: 'leve', nome: 'Pimenta nas Aceleradas', minMin: 40, maxMin: 90,
    motivo: 'Rodagem leve com seis aceleradas curtas para soltar as pernas.',
    passos: (d) => fechar([aquecer(8), serieS(6, 30, 'Z4', 90, 'Z1', 'Acelerada solta, sem forçar'), voltar(5)], d),
  },
  {
    id: 'leve-ondas', tipo: 'leve', nome: 'Maré Mansa', minMin: 40, maxMin: 90,
    motivo: 'Zona 2 com ondas curtas em zona 3 para quebrar a monotonia.',
    passos: (d) => {
      const n = limitar(Math.floor((d - 5) / 10), 2, 6); // n esforços de 4 min e n − 1 pausas de 6 min
      return fechar([aquecer(6), serie(n, 4, 'Z3', 6, 'Z2', 'Subindo um degrau'), voltar(5)], d);
    },
  },
  {
    id: 'leve-escada', tipo: 'leve', nome: 'Escadinha do Bem', minMin: 40, maxMin: 90,
    motivo: 'Começa bem leve e sobe um degrau de cada vez, sem sofrer.',
    passos: (d) => {
      const meio = d - 10;
      return [aquecer(5, 'Z1'), principal(meio * 0.25, 'Z1'), principal(meio * 0.5, 'Z2'), principal(meio * 0.25, 'Z3', 'Final firme'), voltar(5)];
    },
  },
  {
    id: 'leve-fartlek', tipo: 'leve', nome: 'Fartlek Sem Compromisso', minMin: 45, maxMin: 90,
    motivo: 'Brincadeira de ritmos: pequenas trocas entre zona 2 e zona 3.',
    passos: (d) => {
      const n = limitar(Math.floor((d - 10) / 5), 3, 8); // n esforços de 2 min e n − 1 pausas de 3 min
      return fechar([aquecer(8), serie(n, 2, 'Z3', 3, 'Z2', 'Firme, mas conversando'), voltar(5)], d);
    },
  },

  // ---- longões ----
  {
    id: 'longao-raiz', tipo: 'longao', nome: 'Longão Raiz', minMin: 120, maxMin: 300,
    motivo: 'Longão em zona 2: a base da resistência.',
    passos: (d) => [aquecer(5, 'Z1'), principal(d - 10, 'Z2', 'Ritmo de conversa'), voltar(5)],
  },
  {
    id: 'longao-final', tipo: 'longao', nome: 'Longão com Final Feliz', minMin: 120, maxMin: 300,
    motivo: 'Longão em zona 2 que termina com 15 minutos mais firmes.',
    passos: (d) => [aquecer(5, 'Z1'), principal(d - 25, 'Z2'), principal(15, 'Z3', 'Final firme'), voltar(5)],
  },
  {
    id: 'longao-ondas', tipo: 'longao', nome: 'Longão Montanha-Russa', minMin: 120, maxMin: 300,
    motivo: 'Longão com ondas de 5 minutos em zona 3 dentro da zona 2.',
    passos: (d) => {
      const n = limitar(Math.floor((d + 5) / 20), 2, 6); // n ondas de 5 min e n − 1 trechos de 15 min
      return fechar([aquecer(5, 'Z1'), serie(n, 5, 'Z3', 15, 'Z2', 'Onda firme'), voltar(5)], d);
    },
  },
  {
    id: 'longao-degraus', tipo: 'longao', nome: 'Longão em Degraus', minMin: 120, maxMin: 300,
    motivo: 'Longão que sobe de zona aos poucos: leve, constante e firme no fim.',
    passos: (d) => {
      const meio = d - 10;
      return [aquecer(5, 'Z1'), principal(meio * 0.2, 'Z1'), principal(meio * 0.55, 'Z2'), principal(meio * 0.25, 'Z3', 'Final firme'), voltar(5)];
    },
  },
]);

/**
 * Duração mínima (min) para um treino ser chamado de "longão": 2 horas, nos dois esportes. Abaixo disso o dia é uma rodagem
 * comum; um "longão" de 40 minutos não é longão.
 */
export const MINIMO_DO_LONGAO_MIN = Object.freeze({ ciclismo: 120, corrida: 120 });

/**
 * Duração mínima (min) de uma rodagem leve, inclusive a de recuperação e a soltura da véspera da prova: 45 minutos no pedal e
 * 30 na corrida. Pedal leve de 20 minutos não rende nada.
 */
export const MINIMO_DA_RODAGEM_MIN = Object.freeze({ ciclismo: 45, corrida: 30 });

/**
 * Treinos de base de um tipo que cabem na duração. Em semana de recuperação, as rodagens são só as bem leves. O longão vale
 * a partir do mínimo do esporte (`MINIMO_DO_LONGAO_MIN`).
 */
export function treinosDeBaseDisponiveis({ tipo, duracaoMin, recuperacao = false, esporte = 'ciclismo' }) {
  return TREINOS_DE_BASE.filter((t) => {
    if (t.tipo !== tipo) return false;
    const minimo = tipo === 'longao' ? Math.max(t.minMin, MINIMO_DO_LONGAO_MIN[esporte] ?? 120) : Math.max(t.minMin, MINIMO_DA_RODAGEM_MIN[esporte] ?? 30);
    if (duracaoMin < minimo || duracaoMin > t.maxMin) return false;
    return tipo === 'longao' || !recuperacao || t.recuperacao;
  });
}

/** Modelo no formato de `treinoPlanejadoDoModelo`: nome, esporte e os passos para a duração pedida. */
export function modeloDoTreinoDeBase(treino, duracaoMin, esporte) {
  return { id: null, nome: treino.nome, esporte, passos: treino.passos(duracaoMin) };
}
