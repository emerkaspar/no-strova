import { somarDias } from './forma.js';
import { inicioDaSemana } from './semana.js';

/** Até onde olhar para trás ao contar dias seguidos (evita varrer o histórico inteiro). */
const LIMITE_DIAS = 60;

/**
 * Descanso e recuperação, para o Início nos dias sem treino planejado. Complementa a Sequência (que conta semanas).
 * - `descansosNaSemana`: dias sem treino de segunda até hoje (hoje conta se ainda não houve treino);
 * - `diasSemTreinoSeguidos`: dias seguidos sem treinar até hoje (0 se hoje já teve treino);
 * - `diasTreinandoSeguidos`: dias seguidos com treino logo antes do descanso atual (ou terminando hoje, se hoje teve).
 * @param {string[]} diasComTreino datas yyyy-mm-dd com treino realizado (qualquer ordem, repetidas ok)
 * @param {string} hoje yyyy-mm-dd
 */
export function descansoERecuperacao(diasComTreino, hoje) {
  const treinou = new Set(diasComTreino);
  const segunda = inicioDaSemana(hoje);

  let descansosNaSemana = 0;
  for (let d = segunda; d <= hoje; d = somarDias(d, 1)) {
    if (!treinou.has(d)) descansosNaSemana += 1;
  }

  let dia = hoje;
  let diasSemTreinoSeguidos = 0;
  while (diasSemTreinoSeguidos < LIMITE_DIAS && !treinou.has(dia)) {
    diasSemTreinoSeguidos += 1;
    dia = somarDias(dia, -1);
  }
  let diasTreinandoSeguidos = 0;
  while (diasTreinandoSeguidos < LIMITE_DIAS && treinou.has(dia)) {
    diasTreinandoSeguidos += 1;
    dia = somarDias(dia, -1);
  }

  return { descansosNaSemana, diasSemTreinoSeguidos, diasTreinandoSeguidos };
}
