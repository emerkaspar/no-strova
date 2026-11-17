/**
 * Passos e sono por dia (vindos do intervals.icu). Regras puras, sem Firebase nem DOM.
 * Dia: { data: 'YYYY-MM-DD', passos: number|null, sonoSegundos: number|null }.
 */

const DIA_MS = 86_400_000;
const somarDiasIso = (data, n) => new Date(Date.parse(`${data}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

const media = (valores) => (valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length);

/**
 * Resumo de passos e sono: o dado mais recente de cada um (até `hoje`) e a média dos últimos 7 dias (`hoje` e os 6 anteriores,
 * só dos dias que têm o dado).
 * @param {{ data: string, passos: number|null, sonoSegundos: number|null }[]} dias
 * @param {string} hoje YYYY-MM-DD
 */
export function resumoDeBemEstar(dias, hoje) {
  const validos = (dias ?? []).filter((d) => d && typeof d.data === 'string' && d.data <= hoje).sort((a, b) => (a.data < b.data ? 1 : -1));
  const inicio7 = somarDiasIso(hoje, -6);
  const semana = validos.filter((d) => d.data >= inicio7);
  const ultimoPassos = validos.find((d) => Number.isFinite(d.passos) && d.passos > 0) ?? null;
  const ultimoSono = validos.find((d) => Number.isFinite(d.sonoSegundos) && d.sonoSegundos > 0) ?? null;
  return {
    passos: ultimoPassos ? { data: ultimoPassos.data, valor: ultimoPassos.passos } : null,
    sono: ultimoSono ? { data: ultimoSono.data, segundos: ultimoSono.sonoSegundos } : null,
    mediaPassos7: media(semana.filter((d) => d.passos > 0).map((d) => d.passos)),
    mediaSono7S: media(semana.filter((d) => d.sonoSegundos > 0).map((d) => d.sonoSegundos)),
  };
}

/** "7 h 05 min" (ou "45 min"), a partir de segundos. */
export function formatarSono(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return '—';
  const minutos = Math.round(segundos / 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}
