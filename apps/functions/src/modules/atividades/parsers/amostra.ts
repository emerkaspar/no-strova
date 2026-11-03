export interface Amostra {
  /** Segundos desde o primeiro ponto. */
  t: number;
  fc?: number;
  vel?: number;
  dist?: number;
  alt?: number;
  lat?: number;
  lon?: number;
}

export interface Ponto {
  ms: number;
  fc?: number;
  vel?: number;
  dist?: number;
  alt?: number;
  lat?: number;
  lon?: number;
}

export function numero(valor: unknown): number | undefined {
  const n = typeof valor === "string" ? Number.parseFloat(valor) : typeof valor === "number" ? valor : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Ordena os pontos no tempo, descarta instantes repetidos ou inválidos e converte para
 * segundos desde o primeiro ponto.
 */
export function montarAmostras(pontos: Ponto[]): { inicioMs: number; amostras: Amostra[] } | null {
  const validos = pontos.filter((p) => Number.isFinite(p.ms)).sort((a, b) => a.ms - b.ms);
  if (validos.length === 0) return null;

  const inicioMs = validos[0].ms;
  const amostras: Amostra[] = [];
  let ultimoMs = Number.NEGATIVE_INFINITY;
  for (const { ms, ...resto } of validos) {
    if (ms === ultimoMs) continue;
    ultimoMs = ms;
    const amostra: Amostra = { t: (ms - inicioMs) / 1000 };
    for (const [chave, valor] of Object.entries(resto)) {
      if (valor !== undefined) (amostra as unknown as Record<string, number>)[chave] = valor;
    }
    amostras.push(amostra);
  }
  return { inicioMs, amostras };
}
