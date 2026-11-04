/** Slogans do cabeçalho: tiradas curtas e ácidas (até ~30 caracteres, para caber na etiqueta). */
export const SLOGANS = [
  'Quem gosta de curtida é ovo.',
  'Treino não é post.',
  'Corra mais, poste menos.',
  'Kudos não pagam o boleto.',
  'Pace bom dispensa selfie.',
  'Seu rival é o sofá.',
  'Perna dói igual sem plateia.',
  'Seu GPS sabe. Só ele precisa.',
  'Ladeira não curte foto.',
  'Só mais uma volta.',
];

let ultimo = -1;

/** Sorteia um slogan, sem repetir o anterior. */
export function sloganAleatorio() {
  let i;
  do {
    i = Math.floor(Math.random() * SLOGANS.length);
  } while (i === ultimo);
  ultimo = i;
  return SLOGANS[i];
}
