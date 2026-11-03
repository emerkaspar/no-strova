const FUSO = 'America/Sao_Paulo';

/** Data e hora em pt-BR no fuso de São Paulo. Aceita milissegundos ou Date. */
export function formatarDataHora(valor) {
  if (valor === null || valor === undefined) return '—';
  return new Date(valor).toLocaleString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
