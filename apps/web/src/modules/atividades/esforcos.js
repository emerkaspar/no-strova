import { ritmoDoEsforco } from '@no-strova/domain';
import { formatarNumero } from '../../utils/formatters.js';

/** Tempo de um esforço: "21:45" ou "1:05:30". */
export function tempoDeEsforco(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.round(segundos % 60);
  const dois = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`;
}

/** Ritmo (corrida, min/km) ou velocidade (ciclismo, km/h) de um esforço de `metros`. */
export function ritmoTexto(esporte, tempoS, metros) {
  if (esporte === 'corrida') {
    const porKm = ritmoDoEsforco(tempoS, metros);
    return porKm === null ? '' : `${Math.floor(porKm / 60)}:${String(porKm % 60).padStart(2, '0')} /km`;
  }
  return `${formatarNumero((metros / tempoS) * 3.6, 1)} km/h`;
}
