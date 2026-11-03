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

/** Duração compacta para tabelas estreitas: "49:43" (min:s) ou "1:05:12" (h:min:s). */
export function formatarDuracaoCurta(segundos) {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return '—';
  const total = Math.round(segundos);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(min).padStart(2, '0')}:${s}` : `${min}:${s}`;
}

/** Metros → "42,2 km"; traço quando não há valor. */
export function formatarDistancia(metros) {
  if (metros === null || metros === undefined || !Number.isFinite(metros)) return '—';
  return `${formatarNumero(metros / 1000, 1)} km`;
}

/** Hora (0–23) de um instante no fuso de São Paulo. */
export function horaNoFuso(instanteMs = Date.now()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' }).format(new Date(instanteMs)));
}

/** Bom dia (5h–11h59), Boa tarde (12h–17h59) ou Boa noite (18h–4h59). */
export function saudacaoDaHora(hora) {
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "Terça-feira, 3 de novembro de 2026", no fuso de São Paulo. */
export function dataPorExtenso(instanteMs = Date.now()) {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(instanteMs));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Forma com sinal explícito e `casas` decimais: "+12", "−8" (sinal de menos de verdade) ou "0";
 * com 1 casa: "+0,2", "−19,4", "0,0".
 */
export function formatarForma(valor, casas = 0) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const fator = 10 ** casas;
  const r = Math.round(valor * fator) / fator;
  const texto = formatarNumero(Math.abs(r), casas);
  if (r > 0) return `+${texto}`;
  if (r < 0) return `−${texto}`;
  return texto;
}

/** yyyy-mm-dd de hoje no fuso de São Paulo. */
export function hojeIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
