/**
 * Frases do cabeçalho: citações de brincadeira atribuídas a grandes nomes da história, sobre perrengues de pedal e corrida.
 * Para crescer, é só acrescentar { texto, autor } ao array (até ~140 caracteres cada; acima disso o cabeçalho trunca
 * e mostra a frase inteira na dica). Nada de políticos nem pessoas vivas.
 */
export const FRASES = [
  { texto: 'Quem gosta de curtida é ovo.', autor: 'Machado de Assis' },
  { texto: 'O sofrimento é temporário. O print do Strava é eterno.', autor: 'Sócrates' },
  { texto: 'Não existe vento contra. Existe você indo na direção errada.', autor: 'Confúcio' },
  { texto: 'A dor é inevitável. O descanso é negociável. A fisioterapia é cara.', autor: 'Benjamin Franklin' },
  { texto: 'O importante não é chegar primeiro. É chegar sem precisar chamar alguém com uma caminhonete.', autor: 'Júlio César' },
  { texto: 'A vida é feita de escolhas. Hoje você escolheu subir aquela desgraça.', autor: 'Dostoiévski' },
  { texto: 'O homem nasce livre, mas está sempre preso ao vento contra.', autor: 'Jean-Jacques Rousseau' },
  { texto: 'Penso, logo existo. Pedalo, logo questiono minhas escolhas.', autor: 'Descartes' },
  { texto: 'Há duas coisas infinitas: o universo e a subida que o GPS jurou ser plana.', autor: 'Einstein' },
  { texto: 'O segredo da felicidade é ter pernas fortes e expectativas baixas.', autor: 'Aristóteles' },
  { texto: 'Não importa a velocidade. O importante é não ser ultrapassado por alguém passeando com o cachorro.', autor: 'Darwin' },
  { texto: 'A persistência é o caminho do êxito. A insistência com dor no joelho é burrice.', autor: 'Charles Chaplin' },
  { texto: 'Vim, vi, venci. Depois precisei sentar na calçada por vinte minutos.', autor: 'Júlio César' },
  { texto: 'O homem que não conhece seus limites provavelmente ainda não chegou naquela subida.', autor: 'Sócrates' },
  { texto: 'A revolução não será televisionada. Mas o treino estará registrado no GPS.', autor: 'Che Guevara' },
  { texto: 'O que não me mata me deixa dolorido por três dias.', autor: 'Nietzsche' },
  { texto: 'A pressa é inimiga da perfeição. E o excesso de confiança é inimigo da corrente.', autor: 'Leonardo da Vinci' },
  { texto: 'Se queres paz, prepara-te para o vento contra.', autor: 'Vegetius' },
  { texto: 'O impossível é apenas uma questão de não ter olhado a previsão do tempo.', autor: 'Napoleão Bonaparte' },
  { texto: 'A melhor parte do treino é quando ele acaba.', autor: 'Beethoven' },
  { texto: 'A humanidade deu grandes passos. Você deu 18 mil e ainda está longe de casa.', autor: 'Neil Armstrong' },
  { texto: 'Não é sobre vencer os outros. É sobre vencer a vontade de voltar para a cama.', autor: 'Marco Aurélio' },
  { texto: 'O destino baralha as cartas, mas é você quem precisa pedalar na chuva.', autor: 'Arthur Schopenhauer' },
  { texto: 'A teoria é quando você sabe tudo e não consegue subir. A prática é quando você sobe e não sabe como.', autor: 'Albert Einstein' },
  { texto: 'A liberdade começa onde termina a bateria do GPS.', autor: 'Nikola Tesla' },
  { texto: 'Todo caminho tem um fim. Menos aquela subida que você achou que era a última.', autor: 'Dante Alighieri' },
  { texto: 'O corpo humano é uma máquina extraordinária. Pena que veio sem opção de trocar as pernas.', autor: 'Leonardo da Vinci' },
  { texto: 'Se a vida te der limões, faça uma limonada. Se te der um pneu furado, sente e chore.', autor: 'William Shakespeare' },
  { texto: 'O sucesso consiste em ir de fracasso em fracasso sem perder o entusiasmo. Ou a pressão dos pneus.', autor: 'Winston Churchill' },
  { texto: 'A única coisa que cai mais rápido que a sua velocidade é a sua motivação no último quilômetro.', autor: 'Isaac Newton' },
  { texto: 'O verdadeiro sábio sabe quando acelerar e quando fingir que está admirando a paisagem.', autor: 'Sun Tzu' },
  { texto: 'Não confunda silêncio com paz. É só você sem fôlego para reclamar.', autor: 'Franz Kafka' },
  { texto: 'A jornada de mil quilômetros começa com um pneu calibrado. E termina com fome.', autor: 'Lao-Tsé' },
  { texto: 'A vida é curta demais para pedalar com selim desconfortável. E longa demais para aquela subida.', autor: 'Oscar Wilde' },
  { texto: 'O sofrimento aproxima o homem dos deuses. A cãibra aproxima o homem do chão.', autor: 'Homero' },
  { texto: 'Você não precisa de motivação. Precisa parar de negociar com o despertador.', autor: 'Kant' },
  { texto: 'O importante é participar. Mentira. O importante é não chegar por último.', autor: 'Barão de Coubertin' },
  { texto: 'A estrada não julga. Mas o seu pace de hoje vai ficar registrado.', autor: 'George Orwell' },
  { texto: 'A coragem não é ausência de medo. É sair mesmo sabendo que tem subida.', autor: 'Nelson Mandela' },
  { texto: 'O descanso é parte do treino. Mas não precisa exagerar nessa parte.', autor: 'Hipócrates' },
];

/** Limite de caracteres por frase (~140): o cabeçalho mostra a frase em uma linha e trunca com reticências; a dica mostra inteira. */
export const LIMITE_FRASE = 140;

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
