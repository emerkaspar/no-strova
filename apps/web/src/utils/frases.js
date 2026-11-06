/**
 * Frases do cabeçalho: citações de brincadeira atribuídas a grandes nomes da história, sobre perrengues de pedal e corrida.
 * Para crescer, é só acrescentar { texto, autor } ao array (até ~130 caracteres cada; acima disso o cabeçalho trunca
 * e mostra a frase inteira na dica). Nada de políticos nem pessoas vivas.
 */
export const FRASES = [
  { texto: 'Quem gosta de curtida é ovo.', autor: 'Machado de Assis' },
  { texto: 'Treino não é post.', autor: 'Leonardo da Vinci' },
  { texto: 'Corra mais, poste menos.', autor: 'Júlio César' },
  { texto: 'Kudos não pagam o boleto.', autor: 'Mozart' },
  { texto: 'Pace bom dispensa selfie.', autor: 'Charles Chaplin' },
  { texto: 'Seu rival é o sofá.', autor: 'Darwin' },
  { texto: 'Perna dói igual sem plateia.', autor: 'Shakespeare' },
  { texto: 'Seu GPS sabe. Só ele precisa.', autor: 'Nikola Tesla' },
  { texto: 'Ladeira não curte foto.', autor: 'Newton' },
  { texto: 'Só mais uma volta.', autor: 'Thomas Edison' },
  { texto: 'Tudo é relativo: os 10 km da ida voam; os da volta, com vento contra, duram uma era geológica.', autor: 'Einstein' },
  { texto: 'A insanidade é repetir o mesmo treino esperando que o joelho pare de doer.', autor: 'Einstein' },
  { texto: 'Voar eu consegui. Furar pneu a dois quilômetros de casa é que é desafio.', autor: 'Santos Dumont' },
  { texto: 'Compus nove sinfonias, mas nenhuma me preparou para o GPS perder o sinal na hora do sprint.', autor: 'Beethoven' },
  { texto: 'Se vi mais longe, foi porque subi de pé nos pedais. Sentado, só via o asfalto.', autor: 'Newton' },
  { texto: 'Nada na vida deve ser temido, apenas compreendido. Exceto a cãibra no km 8.', autor: 'Marie Curie' },
  { texto: 'Ao vencedor, as batatas; ao corredor, a bolha no calcanhar.', autor: 'Machado de Assis' },
  { texto: 'Sobrevive não o mais forte, mas o que levou câmara de ar reserva.', autor: 'Darwin' },
  { texto: 'Não falhei: só descobri dez mil jeitos de furar pneu.', autor: 'Thomas Edison' },
  { texto: 'Ser ou não ser: sair para pedalar com 70% de chance de chuva, eis a questão.', autor: 'Shakespeare' },
  { texto: 'Vim, vi e venci, mas só depois de empurrar a bike no último quilômetro.', autor: 'Júlio César' },
  { texto: 'O GPS mandou virar à esquerda e eu acabei descobrindo a América.', autor: 'Cristóvão Colombo' },
  { texto: 'A vida é uma tragédia vista de perto e uma comédia vista de longe. O pneu furado é tragédia nos dois casos.', autor: 'Charles Chaplin' },
  { texto: 'Projetei máquinas voadoras, mas nunca consegui prever em que subida a corrente vai sair.', autor: 'Leonardo da Vinci' },
  { texto: 'Se quiser descobrir os segredos do universo, leve um gel: a bateria sempre acaba no km 30.', autor: 'Nikola Tesla' },
];

export const LIMITE_FRASE = 130;
export const LIMITE_FRASE_LARGA = 160;

/** Limite de caracteres pela largura do cabeçalho: 160 a partir de 1400 px, 130 abaixo disso. */
export function limiteDaFrase(larguraDoCabecalho) {
  return larguraDoCabecalho >= 1400 ? LIMITE_FRASE_LARGA : LIMITE_FRASE;
}

let ultima = null;

/** Sorteia uma frase, sem repetir a anterior nem o autor dela (quando há alternativa). */
export function fraseAleatoria(frases = FRASES) {
  const candidatas = frases.filter((f) => f !== ultima && f.autor !== ultima?.autor);
  const lista = candidatas.length ? candidatas : frases.filter((f) => f !== ultima);
  const escolhida = (lista.length ? lista : frases)[Math.floor(Math.random() * (lista.length || frases.length))];
  ultima = escolhida;
  return escolhida;
}

/** Texto exibido: passando do limite, corta numa palavra e fecha com reticências. */
export function textoExibido(texto, limite = LIMITE_FRASE) {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite - 1);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return `${corte.slice(0, ultimoEspaco > limite * 0.6 ? ultimoEspaco : corte.length).trimEnd()}…`;
}
