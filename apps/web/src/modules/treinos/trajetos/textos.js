import { SENSACOES } from '@no-strova/domain';
import { formatarDuracaoCurta, formatarNumero } from '../../../utils/formatters.js';

/** Métricas que o gráfico de evolução alterna. `invertido`: menor é melhor (o eixo vira, para o melhor ficar sempre em cima). */
export function metricasDoEsporte(esporte) {
  const principal =
    esporte === 'corrida'
      ? { id: 'desempenho', rotulo: 'Ritmo', campo: (p) => p.ritmoSKm, formatar: (v) => `${formatarDuracaoCurta(v)} /km`, invertido: true, passoMinimo: 5 }
      : { id: 'desempenho', rotulo: 'Velocidade', campo: (p) => p.velocidadeKmh, formatar: (v) => `${formatarNumero(v, 1)} km/h`, invertido: false, passoMinimo: 0.5 };
  return [
    principal,
    { id: 'eficiencia', rotulo: 'Eficiência', campo: (p) => p.eficiencia, formatar: (v) => `${formatarNumero(v, 2)} m/min por bpm`, invertido: false, passoMinimo: 0.01 },
    { id: 'fc', rotulo: 'FC média', campo: (p) => p.fcMedia, formatar: (v) => `${formatarNumero(v, 0)} bpm`, invertido: false, passoMinimo: 1 },
  ];
}

/** Desempenho de uma passagem no texto do esporte: ritmo (corrida) ou velocidade (ciclismo). */
export function textoDeDesempenho(p, esporte) {
  return esporte === 'corrida' ? `${formatarDuracaoCurta(p.ritmoSKm)} /km` : `${formatarNumero(p.velocidadeKmh, 1)} km/h`;
}

/** "+4,2%" / "−1,0%" (com o sinal de menos tipográfico); traço sem valor. */
export function textoDeVariacao(pct, casas = 1) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const sinal = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sinal}${formatarNumero(Math.abs(pct), casas)}%`;
}

/** Diferença de segundos como "+0:12" / "−0:08". */
export function textoDeDiferencaDeTempo(s) {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—';
  const sinal = s > 0 ? '+' : s < 0 ? '−' : '';
  return `${sinal}${formatarDuracaoCurta(Math.abs(s))}`;
}

/** Diferença numérica com sinal ("+3", "−1,5"). */
export function textoDeDiferenca(valor, casas = 0, unidade = '') {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '';
  return `${sinal}${formatarNumero(Math.abs(valor), casas)}${unidade}`;
}

export const ROTULO_SENSACAO = Object.freeze(Object.fromEntries(SENSACOES.map((s) => [s.valor, s.rotulo])));

/** Texto da origem do trecho de uma passagem. */
export function textoDoTrecho(p, temRota) {
  if (p.origemDoTrecho === 'inteira') return 'Inteira (escolha sua)';
  if (p.origemDoTrecho === 'manual') return 'Trecho (ajustado)';
  if (p.soTrecho) return 'Trecho';
  return temRota ? 'Inteira (sem correspondência)' : 'Inteira';
}

/** "2,4 km" para a distância de trecho; usa o formatador de números do app. */
export function kmTexto(metros) {
  return metros === null || metros === undefined || !Number.isFinite(metros) ? '—' : `${formatarNumero(metros / 1000, 2)} km`;
}
