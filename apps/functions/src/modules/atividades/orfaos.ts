/** Arquivos enviados ao Storage cuja atividade nunca foi criada (a callable não foi chamada ou falhou). */

export const IDADE_MINIMA_ORFAO_MS = 24 * 60 * 60 * 1000;

const CAMINHO = /^atividades\/([^/]+)\/([A-Za-z0-9_-]{8,40})\/original\.(fit|gpx|tcx)$/;

export function lerCaminho(caminho: string): { uid: string; atividadeId: string } | null {
  const m = CAMINHO.exec(caminho);
  return m ? { uid: m[1], atividadeId: m[2] } : null;
}

export interface DependenciasOrfaos {
  listar(): Promise<Array<{ caminho: string; criadoEmMs: number }>>;
  /** userId dono da atividade, ou null se ela não existe. */
  donoDaAtividade(atividadeId: string): Promise<string | null>;
  apagar(caminho: string): Promise<void>;
}

/**
 * Apaga arquivos com mais de 24 h sem atividade correspondente do mesmo dono. O prazo preserva o arquivo
 * de uma importação sem FC que aguarda o usuário informar a zona.
 * @returns quantos arquivos foram removidos
 */
export async function limparOrfaos(deps: DependenciasOrfaos, agoraMs: number): Promise<number> {
  let removidos = 0;
  for (const { caminho, criadoEmMs } of await deps.listar()) {
    const alvo = lerCaminho(caminho);
    if (!alvo || !(agoraMs - criadoEmMs >= IDADE_MINIMA_ORFAO_MS)) continue;
    if ((await deps.donoDaAtividade(alvo.atividadeId)) === alvo.uid) continue;
    await deps.apagar(caminho);
    removidos += 1;
  }
  return removidos;
}
