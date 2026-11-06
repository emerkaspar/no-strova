/**
 * Dicas curtas sobre as zonas de FC (Z1 a Z5, faixas de Friel), uma por dia no cartão "Dica do dia" do Início.
 * A lista alterna as zonas para dois dias seguidos nunca falarem da mesma. Funções puras, sem Firebase e sem DOM.
 */

/** @type {ReadonlyArray<{ zona: 'Z1'|'Z2'|'Z3'|'Z4'|'Z5', texto: string }>} */
export const DICAS_DE_ZONAS = Object.freeze([
  { zona: 'Z2', texto: 'Z2 constrói a base aeróbica. Se dá para conversar em frases inteiras, o ritmo está certo.' },
  { zona: 'Z4', texto: 'Z4 é o limiar: sustente em blocos de 8 a 20 min, com recuperação entre eles.' },
  { zona: 'Z1', texto: 'Z1 é recuperação: se dá para cantar, está certo. Ir mais forte só atrasa o descanso.' },
  { zona: 'Z5', texto: 'Z5 é VO2máx: tiros de 2 a 5 min, com pausa igual ou maior. Vale a qualidade, não o volume.' },
  { zona: 'Z3', texto: 'Z3 cansa mais que a Z2 e rende menos que a Z4. Use com parcimônia.' },
  { zona: 'Z2', texto: 'Treino longo na Z2 treina o corpo a gastar gordura e poupa o glicogênio para o final.' },
  { zona: 'Z4', texto: 'Em Z4 o final do bloco tem que parecer "difícil, mas controlado". Se travar, foi forte demais.' },
  { zona: 'Z1', texto: 'Dia leve de verdade rende mais que dia médio: fica na Z1 e guarda a perna para o treino-chave.' },
  { zona: 'Z5', texto: 'A FC demora 30 a 60 s para subir: num tiro curto, guie-se pelo esforço e não pelo número.' },
  { zona: 'Z3', texto: 'Treinar sempre em Z3 deixa tudo "meio forte" e nada realmente bom. Alterne leve e forte.' },
]);

/** Dias inteiros desde 1970-01-01 (UTC) de uma data yyyy-mm-dd. */
function diaDaEra(dataIso) {
  const [a, m, d] = dataIso.split('-').map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
}

/**
 * Dica do dia: a mesma para todo mundo na mesma data, e uma diferente a cada dia.
 * @param {string} dataIso yyyy-mm-dd
 * @returns {{ zona: string, texto: string }}
 */
export function dicaDeZonaDoDia(dataIso) {
  const i = ((diaDaEra(dataIso) % DICAS_DE_ZONAS.length) + DICAS_DE_ZONAS.length) % DICAS_DE_ZONAS.length;
  return DICAS_DE_ZONAS[i];
}
