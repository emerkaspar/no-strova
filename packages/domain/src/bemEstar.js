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
  const sonos7 = semana.filter((d) => d.sonoSegundos > 0).map((d) => d.sonoSegundos);
  return {
    passos: ultimoPassos ? { data: ultimoPassos.data, valor: ultimoPassos.passos } : null,
    sono: ultimoSono ? { data: ultimoSono.data, segundos: ultimoSono.sonoSegundos } : null,
    mediaPassos7: media(semana.filter((d) => d.passos > 0).map((d) => d.passos)),
    mediaSono7S: media(sonos7),
    /** Quantas noites com registro entram na média de sono (para saber se ela é confiável). */
    noites7: sonos7.length,
  };
}

/** Meta diária de passos quando o usuário não configurou outra. */
export const META_PASSOS_PADRAO = 8000;
/** Limites da meta de passos aceitos na configuração. */
export const LIMITES_META_PASSOS = Object.freeze({ min: 1000, max: 50000 });
/** Sono considerado saudável para adultos: de 7 a 9 horas por noite. */
export const SONO_IDEAL = Object.freeze({ minS: 7 * 3600, maxS: 9 * 3600 });
const SONO_MUITO_CURTO_S = 6 * 3600;

/** Valida a meta diária de passos digitada: inteiro entre os limites, ou null se inválida. */
export function validarMetaPassos(valor) {
  const n = typeof valor === 'string' ? Number(valor.replace(/\./g, '').replace(',', '.')) : valor;
  if (!Number.isFinite(n)) return null;
  const inteiro = Math.round(n);
  return inteiro >= LIMITES_META_PASSOS.min && inteiro <= LIMITES_META_PASSOS.max ? inteiro : null;
}

/** Faixa da noite de sono: 'ideal' (7 a 9 h), 'curto' (6 a 7 h), 'muito-curto' (< 6 h) ou 'longo' (> 9 h). null sem dado. */
export function faixaDoSono(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return null;
  if (segundos < SONO_MUITO_CURTO_S) return 'muito-curto';
  if (segundos < SONO_IDEAL.minS) return 'curto';
  if (segundos > SONO_IDEAL.maxS) return 'longo';
  return 'ideal';
}

/** Faixa dos passos do dia contra a meta: 'atingiu' (≥ meta), 'quase' (≥ 70%) ou 'abaixo'. null sem dado. */
export function faixaDosPassos(passos, meta = META_PASSOS_PADRAO) {
  if (!Number.isFinite(passos) || passos <= 0) return null;
  if (passos >= meta) return 'atingiu';
  return passos >= meta * 0.7 ? 'quase' : 'abaixo';
}

/**
 * Série contínua dos últimos `nDias` dias até `hoje` (lacunas ficam null), com a média móvel de 7 dias de cada métrica
 * (só dos dias com registro na janela; null se a janela não tem nenhum).
 * @returns {{ data: string, passos: number|null, sonoSegundos: number|null, mediaPassos7: number|null, mediaSono7S: number|null }[]}
 */
export function serieDeBemEstar(dias, hoje, nDias) {
  const porData = new Map((dias ?? []).map((d) => [d.data, d]));
  const valor = (data, campo) => {
    const v = porData.get(data)?.[campo];
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const serie = [];
  for (let i = nDias - 1; i >= 0; i -= 1) {
    const data = somarDiasIso(hoje, -i);
    const passosJanela = [];
    const sonoJanela = [];
    for (let j = 0; j < 7; j += 1) {
      const dj = somarDiasIso(data, -j);
      const p = valor(dj, 'passos');
      const s = valor(dj, 'sonoSegundos');
      if (p !== null) passosJanela.push(p);
      if (s !== null) sonoJanela.push(s);
    }
    serie.push({ data, passos: valor(data, 'passos'), sonoSegundos: valor(data, 'sonoSegundos'), mediaPassos7: media(passosJanela), mediaSono7S: media(sonoJanela) });
  }
  return serie;
}

/** Dívida de sono dos últimos 7 dias: quanto faltou para 7 h nas noites com registro. `noites` = quantas noites entraram. */
export function dividaDeSono(dias, hoje) {
  const inicio = somarDiasIso(hoje, -6);
  let segundos = 0;
  let noites = 0;
  for (const d of dias ?? []) {
    if (d.data < inicio || d.data > hoje || !(d.sonoSegundos > 0)) continue;
    noites += 1;
    segundos += Math.max(0, SONO_IDEAL.minS - d.sonoSegundos);
  }
  return { segundos, noites };
}

/** Dias dos últimos `nDias` (até hoje) em que a meta de passos foi atingida, e quantos tinham registro. */
export function diasNaMetaDePassos(dias, hoje, nDias, meta = META_PASSOS_PADRAO) {
  const inicio = somarDiasIso(hoje, -(nDias - 1));
  let atingiu = 0;
  let comRegistro = 0;
  for (const d of dias ?? []) {
    if (d.data < inicio || d.data > hoje || !(d.passos > 0)) continue;
    comRegistro += 1;
    if (d.passos >= meta) atingiu += 1;
  }
  return { atingiu, comRegistro };
}

/**
 * Prontidão do dia para treinar: combina a Forma (TSB), o sono da noite e a média de 7 noites, e os dias seguidos treinando.
 * Cada fator soma pontos de cansaço (0 a 2); 3 ou mais = 'baixa', 1 ou 2 = 'moderada', 0 = 'boa'.
 * Sem Forma e sem sono não há o que avaliar: nivel null.
 * @param {{ forma: number|null, sonoUltimoS: number|null, mediaSono7S: number|null, noites7?: number, diasTreinandoSeguidos?: number }} entrada
 * @returns {{ nivel: 'boa'|'moderada'|'baixa'|null, motivos: string[] }}
 */
export function prontidao({ forma = null, sonoUltimoS = null, mediaSono7S = null, noites7 = 0, diasTreinandoSeguidos = 0 } = /** @type {{ forma?: number|null, sonoUltimoS?: number|null, mediaSono7S?: number|null, noites7?: number, diasTreinandoSeguidos?: number }} */ ({})) {
  const temForma = Number.isFinite(forma);
  const temSono = Number.isFinite(sonoUltimoS) && sonoUltimoS > 0;
  if (!temForma && !temSono) return { nivel: null, motivos: [] };
  let pontos = 0;
  const motivos = [];
  if (temForma && forma < -30) {
    pontos += 2;
    motivos.push('carga acima do ideal');
  } else if (temForma && forma < -10) {
    pontos += 1;
    motivos.push('você está treinando carregado');
  }
  if (temSono && sonoUltimoS < SONO_MUITO_CURTO_S) {
    pontos += 2;
    motivos.push('dormiu menos de 6 h');
  } else if (temSono && sonoUltimoS < SONO_IDEAL.minS) {
    pontos += 1;
    motivos.push('dormiu menos de 7 h');
  }
  if (noites7 >= 3 && Number.isFinite(mediaSono7S) && mediaSono7S < 6.5 * 3600) {
    pontos += 1;
    motivos.push('sono curto na semana');
  }
  if (diasTreinandoSeguidos >= 5) {
    pontos += 1;
    motivos.push(`${diasTreinandoSeguidos} dias seguidos treinando`);
  }
  return { nivel: pontos >= 3 ? 'baixa' : pontos >= 1 ? 'moderada' : 'boa', motivos };
}

/**
 * Aviso "sono curto com carga alta": dormiu menos de 6 h e a Forma está abaixo de −10 (zona ótima ou sobrecarga).
 * @returns {{ avisar: boolean, motivo: string|null }}
 */
export function avisoSonoCarga({ sonoUltimoS, forma }) {
  if (!Number.isFinite(sonoUltimoS) || sonoUltimoS <= 0 || !Number.isFinite(forma)) return { avisar: false, motivo: null };
  if (sonoUltimoS >= SONO_MUITO_CURTO_S || forma >= -10) return { avisar: false, motivo: null };
  return { avisar: true, motivo: forma < -30 ? 'sobrecarga' : 'carregado' };
}

/**
 * Ajuste de carga sugerido pelo sono (fator sobre a carga prevista), ou null se não há motivo. Só vale com pelo menos 3 noites
 * registradas na semana; a média curta reduz mais que uma noite ruim isolada.
 */
export function fatorDeCargaPorSono({ mediaSono7S = null, noites7 = 0, sonoUltimoS = null } = /** @type {{ mediaSono7S?: number|null, noites7?: number, sonoUltimoS?: number|null }} */ ({})) {
  if (noites7 < 3 || !Number.isFinite(mediaSono7S)) return null;
  if (mediaSono7S < 5.5 * 3600) return 0.8;
  if (mediaSono7S < 6.5 * 3600) return 0.9;
  if (Number.isFinite(sonoUltimoS) && sonoUltimoS > 0 && sonoUltimoS < 5 * 3600) return 0.92;
  return null;
}

/** "7 h 05 min" (ou "45 min"), a partir de segundos. */
export function formatarSono(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return '—';
  const minutos = Math.round(segundos / 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}
