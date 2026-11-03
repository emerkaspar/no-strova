import { somarDias } from './forma.js';
import { inicioDaSemana } from './semana.js';

/** Helpers de calendário (semana de segunda a domingo). Datas yyyy-mm-dd, sem fuso. */
export const NOMES_MES = Object.freeze([
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]);

/** Primeiro dia do mês da data (yyyy-mm-01). */
export function primeiroDoMes(iso) {
  return `${iso.slice(0, 7)}-01`;
}

/** Primeiro dia do mês `n` meses depois (ou antes, se negativo). */
export function somarMeses(iso, n) {
  const [ano, mes] = iso.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

/** "novembro de 2026". */
export function rotuloDoMes(iso) {
  const [ano, mes] = iso.split('-').map(Number);
  return `${NOMES_MES[mes - 1]} de ${ano}`;
}

/** Último dia do mês da data. */
export function ultimoDoMes(iso) {
  return somarDias(somarMeses(iso, 1), -1);
}

/**
 * Grade do mês: lista de semanas (segunda a domingo), cada uma com 7 dias `{ data, doMes }`.
 * Inclui os dias dos meses vizinhos que completam a primeira e a última semana.
 */
export function gradeDoMes(iso) {
  const primeiro = primeiroDoMes(iso);
  const ultimo = ultimoDoMes(iso);
  const semanas = [];
  for (let inicio = inicioDaSemana(primeiro); inicio <= ultimo; inicio = somarDias(inicio, 7)) {
    semanas.push(
      Array.from({ length: 7 }, (_, i) => {
        const data = somarDias(inicio, i);
        return { data, doMes: data >= primeiro && data <= ultimo };
      }),
    );
  }
  return semanas;
}
