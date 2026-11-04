import { calcularMelhoresEsforcos } from '../core/functions.js';

let emAndamento = null;

/**
 * Pede ao servidor para completar o que se deriva do arquivo das atividades importadas (melhores esforços, série detalhada e
 * tempo por zona), em lotes, até acabar. Só uma execução por vez: quem chama durante outra recebe a mesma promessa.
 * @param {(feitas: number) => void} [aoProgresso]
 * @returns {Promise<number>} quantas atividades foram processadas
 */
export function completarAtividades(aoProgresso = () => {}) {
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    let feitas = 0;
    try {
      for (;;) {
        const r = await calcularMelhoresEsforcos();
        feitas += r.processadas;
        aoProgresso(feitas);
        if (r.restantes === 0 || r.processadas === 0) break;
      }
      return feitas;
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}
