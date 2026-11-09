import { HttpsError } from "firebase-functions/v2/https";

/**
 * Regras da sincronização automática de atividades do intervals.icu, sem Firebase: a ordem dos usuários, o orçamento de tempo
 * e o que fazer com cada tipo de falha. A rotina agendada (intervals.functions.ts) só liga isto ao Firestore.
 */

export interface ConexaoAgendada {
  uid: string;
  /** Última tentativa (ms), ou null se nunca tentou. */
  ultimaTentativaMs: number | null;
}

export type TipoFalha = "chaveInvalida" | "limite" | "outra";

/**
 * O que uma falha de sincronização significa:
 * - `chaveInvalida`: o intervals.icu recusou a chave (ou ela não pôde ser lida): só o usuário resolve, reconectando;
 * - `limite`: o intervals.icu pediu para esperar (429): vale para todos, então a rodada para;
 * - `outra`: rede ou erro do servidor: conta como falha e segue para o próximo.
 */
export function classificarFalha(erro: unknown): TipoFalha {
  if (erro instanceof HttpsError) {
    if (erro.code === "failed-precondition") return "chaveInvalida";
    if (erro.code === "resource-exhausted") return "limite";
  }
  return "outra";
}

/** Quem nunca tentou vem primeiro; depois, a tentativa mais antiga. Assim o que não coube numa rodada abre a seguinte. */
export function ordenarPorTentativa(conexoes: ConexaoAgendada[]): ConexaoAgendada[] {
  return [...conexoes].sort((a, b) => {
    if (a.ultimaTentativaMs === b.ultimaTentativaMs) return a.uid.localeCompare(b.uid);
    if (a.ultimaTentativaMs === null) return -1;
    if (b.ultimaTentativaMs === null) return 1;
    return a.ultimaTentativaMs - b.ultimaTentativaMs;
  });
}

export interface DependenciasAgenda {
  listar(): Promise<ConexaoAgendada[]>;
  sincronizar(uid: string): Promise<{ importadas: number }>;
  marcarChaveInvalida(uid: string): Promise<void>;
  registrarFalha(uid: string): Promise<void>;
  avisarChaveInvalida(uid: string): Promise<void>;
  agora(): number;
}

export interface ResumoAgenda {
  processados: number;
  importadas: number;
  chaveInvalida: number;
  falhas: number;
  /** Não deu tempo nesta rodada: ficam para a próxima. */
  adiados: number;
  /** A rodada parou por causa do limite de requisições do intervals.icu. */
  paradaPorLimite: boolean;
}

/**
 * Sincroniza, um por vez, os usuários conectados. Para de começar usuários novos quando o orçamento de tempo acaba (a função tem um
 * prazo máximo) ou quando o intervals.icu manda esperar. A falha de um usuário nunca derruba os demais.
 */
export async function rodarAgenda(deps: DependenciasAgenda, orcamentoMs: number): Promise<ResumoAgenda> {
  const inicio = deps.agora();
  const fila = ordenarPorTentativa(await deps.listar());
  const resumo: ResumoAgenda = { processados: 0, importadas: 0, chaveInvalida: 0, falhas: 0, adiados: 0, paradaPorLimite: false };

  for (let i = 0; i < fila.length; i += 1) {
    if (deps.agora() - inicio >= orcamentoMs) {
      resumo.adiados = fila.length - i;
      break;
    }
    const { uid } = fila[i];
    try {
      const r = await deps.sincronizar(uid);
      resumo.processados += 1;
      resumo.importadas += r.importadas;
    } catch (erro) {
      const tipo = classificarFalha(erro);
      if (tipo === "limite") {
        resumo.adiados = fila.length - i;
        resumo.paradaPorLimite = true;
        break;
      }
      resumo.processados += 1;
      if (tipo === "chaveInvalida") {
        resumo.chaveInvalida += 1;
        await deps.marcarChaveInvalida(uid).catch(() => undefined);
        await deps.avisarChaveInvalida(uid).catch(() => undefined);
      } else {
        resumo.falhas += 1;
        await deps.registrarFalha(uid).catch(() => undefined);
      }
    }
  }
  return resumo;
}
