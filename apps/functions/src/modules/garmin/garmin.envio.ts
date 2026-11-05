import { createHash } from "node:crypto";
import { nomeNoGarmin, type TreinoPlano, treinoParaGarmin } from "./garmin.treino";

/** O que o envio usa do cliente do Garmin Connect (facilita o teste com um cliente falso). */
export interface ClienteGarmin {
  createWorkout(treino: unknown): Promise<unknown>;
  scheduleWorkout(treino: { workoutId: string }, data: string): Promise<unknown>;
  deleteWorkout(treino: { workoutId: string }): Promise<unknown>;
}

/** Registro do que já foi enviado de um treino: evita duplicar e permite trocar o treino antigo quando ele muda. */
export interface RegistroEnvio {
  workoutId: string;
  assinatura: string;
}

export interface ProblemaEnvio {
  data: string;
  nome: string;
  motivo: string;
}

export interface ResultadoEnvio {
  enviados: number;
  jaEnviados: number;
  falhas: number;
  /** Treinos antigos (que mudaram) apagados do Garmin para dar lugar à nova versão. */
  substituidos: number;
  problemas: ProblemaEnvio[];
}

/** Muda quando o treino muda (dia, nome ou passos). */
export function assinaturaDoTreino(treino: TreinoPlano): string {
  return createHash("sha256").update(JSON.stringify(treino)).digest("hex").slice(0, 16);
}

function idDoTreinoCriado(resposta: unknown): string {
  const id = (resposta as { workoutId?: unknown } | null)?.workoutId;
  if (typeof id === "number" || (typeof id === "string" && id !== "")) return String(id);
  throw new Error("O Garmin não devolveu o código do treino criado.");
}

/** Mensagem curta e segura (sem dados da requisição) para mostrar ao usuário. */
export function motivoDaFalha(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  if (/429|too many/i.test(texto)) return "o Garmin limitou as tentativas; tente de novo em alguns minutos";
  if (/401|403/.test(texto)) return "o Garmin recusou o acesso";
  return texto.slice(0, 160);
}

/**
 * Cria cada treino no Garmin Connect e o agenda no dia. Treino já enviado e igual é pulado; treino que mudou desde o último
 * envio tem a versão antiga apagada e é criado de novo. A falha de um treino não impede os demais.
 */
export async function enviarTreinos(
  cliente: ClienteGarmin,
  treinos: TreinoPlano[],
  registros: Map<string, RegistroEnvio>,
  aoRegistrar: (treinoId: string, registro: RegistroEnvio) => Promise<void>,
  aoProgredir: (feitos: number, total: number) => Promise<void> = async () => {},
): Promise<ResultadoEnvio> {
  const resultado: ResultadoEnvio = { enviados: 0, jaEnviados: 0, falhas: 0, substituidos: 0, problemas: [] };
  let feitos = 0;
  for (const treino of treinos) {
    const assinatura = assinaturaDoTreino(treino);
    const anterior = registros.get(treino.id);
    try {
      if (anterior?.assinatura === assinatura) {
        resultado.jaEnviados++;
      } else {
        if (anterior) {
          try {
            await cliente.deleteWorkout({ workoutId: anterior.workoutId });
            resultado.substituidos++;
          } catch {
            // já apagado no Garmin Connect: segue e cria a nova versão
          }
        }
        const workoutId = idDoTreinoCriado(await cliente.createWorkout(treinoParaGarmin(treino)));
        await cliente.scheduleWorkout({ workoutId }, treino.data);
        await aoRegistrar(treino.id, { workoutId, assinatura });
        resultado.enviados++;
      }
    } catch (erro) {
      resultado.falhas++;
      resultado.problemas.push({ data: treino.data, nome: nomeNoGarmin(treino), motivo: motivoDaFalha(erro) });
    }
    feitos++;
    await aoProgredir(feitos, treinos.length);
  }
  return resultado;
}
