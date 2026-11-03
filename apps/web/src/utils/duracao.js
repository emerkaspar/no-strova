/**
 * Duração digitada → segundos (inteiro), ou null se não der para entender.
 * Aceita "30s", "30 s", "3", "3 min", "2,5" (minutos), "1:30" (min:s) e "1h".
 */
export function lerDuracao(texto) {
  const t = String(texto ?? '').trim().toLowerCase().replace(',', '.');
  if (t === '') return null;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*(s|seg|segundos?)$/.exec(t);
  if (m) return Math.round(Number(m[1]));
  m = /^(\d+(?:\.\d+)?)\s*(h|hora|horas)$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 3600);
  m = /^(\d+(?:\.\d+)?)\s*(m|min|minutos?)?$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  return null;
}

/** Segundos → texto do campo: "30 s", "3 min" ou "2:30". */
export function textoDeDuracao(segundos) {
  if (!Number.isFinite(segundos)) return '';
  if (segundos < 60) return `${segundos} s`;
  if (segundos % 60 === 0) return `${segundos / 60} min`;
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}
