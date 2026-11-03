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

/** yyyy-mm-dd → dd/mm/aaaa (sem passar por Date, para não deslocar o dia por fuso). */
export function formatarData(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Número em pt-BR com casas fixas; traço quando não há valor. */
export function formatarNumero(valor, casas = 0) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Segundos → "1h 05min" ou "42min 10s"; traço quando não há valor. */
export function formatarDuracao(segundos) {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return '—';
  const total = Math.round(segundos);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(min).padStart(2, '0')}min`;
  return `${min}min ${String(s).padStart(2, '0')}s`;
}

/** Metros → "42,2 km"; traço quando não há valor. */
export function formatarDistancia(metros) {
  if (metros === null || metros === undefined || !Number.isFinite(metros)) return '—';
  return `${formatarNumero(metros / 1000, 1)} km`;
}

/** yyyy-mm-dd de hoje no fuso de São Paulo. */
export function hojeIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
