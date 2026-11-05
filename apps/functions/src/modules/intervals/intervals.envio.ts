import { createHash } from "node:crypto";
import { textoDoTreinoIntervals } from "@no-strova/domain";
import { type EventoIntervals, IntervalsErroApi } from "./intervals.cliente";

/** Treino do plano como sai de `montarPlanoParaExportar` (passos já expandidos). */
export interface PassoPlano {
  papel: string;
  duracaoS: number;
  zona: string;
  descricao: string | null;
  fc: [number, number] | null;
}

export interface TreinoPlano {
  id: string;
  data: string;
  nome: string;
  esporte: string;
  passos: PassoPlano[];
}

/** O que o envio usa do intervals.icu (facilita o teste com um cliente falso). */
export interface ClienteIntervals {
  criar(evento: EventoIntervals): Promise<string>;
  atualizar(eventoId: string, evento: EventoIntervals): Promise<void>;
}

/** Registro do que já foi enviado de um treino: evita duplicar e permite atualizar o treino quando ele muda. */
export interface RegistroEnvio {
  eventoId: string;
  assinatura: string;
}

export interface ProblemaEnvio {
  data: string;
  nome: string;
  motivo: string;
}

export interface ResultadoEnvio {
  enviados: number;
  atualizados: number;
  jaEnviados: number;
  falhas: number;
  problemas: ProblemaEnvio[];
}

/** Nome com o dia na frente ("06/11 Pedrada"): acha-se fácil no relógio e treinos de mesmo nome não se confundem. */
export function nomeDoEvento(treino: Pick<TreinoPlano, "data" | "nome">): string {
  const [, mes, dia] = treino.data.split("-");
  return `${dia}/${mes} ${treino.nome}`;
}

/** O treino do plano como evento de treino do calendário do intervals.icu. */
export function eventoDoTreino(treino: TreinoPlano): EventoIntervals {
  if (treino.passos.length === 0) throw new Error("Treino sem passos.");
  return {
    category: "WORKOUT",
    start_date_local: `${treino.data}T00:00:00`,
    type: treino.esporte === "corrida" ? "Run" : "Ride",
    name: nomeDoEvento(treino),
    description: textoDoTreinoIntervals(treino.passos),
    external_id: `no-strova-${treino.id}`,
  };
}

/** Muda quando o treino muda (dia, nome ou passos). */
export function assinaturaDoTreino(treino: TreinoPlano): string {
  return createHash("sha256").update(JSON.stringify(treino)).digest("hex").slice(0, 16);
}

/** Mensagem curta e segura (sem dados da requisição) para mostrar ao usuário. */
export function motivoDaFalha(erro: unknown): string {
  if (erro instanceof IntervalsErroApi) {
    if (erro.status === 401 || erro.status === 403) return "o intervals.icu recusou a chave de API";
    if (erro.status === 429) return "o intervals.icu limitou as requisições; tente de novo em instantes";
    return erro.message;
  }
  return (erro instanceof Error ? erro.message : String(erro)).slice(0, 160);
}

/**
 * Cria cada treino no calendário do intervals.icu. Treino já enviado e igual é pulado; treino que mudou desde o último envio
 * é atualizado no mesmo evento (ou criado de novo, se o evento foi apagado lá). A falha de um treino não impede os demais.
 */
export async function enviarTreinos(
  cliente: ClienteIntervals,
  treinos: TreinoPlano[],
  registros: Map<string, RegistroEnvio>,
  aoRegistrar: (treinoId: string, registro: RegistroEnvio) => Promise<void>,
): Promise<ResultadoEnvio> {
  const resultado: ResultadoEnvio = { enviados: 0, atualizados: 0, jaEnviados: 0, falhas: 0, problemas: [] };
  for (const treino of treinos) {
    const assinatura = assinaturaDoTreino(treino);
    const anterior = registros.get(treino.id);
    try {
      if (anterior?.assinatura === assinatura) {
        resultado.jaEnviados++;
        continue;
      }
      const evento = eventoDoTreino(treino);
      let eventoId: string | null = null;
      if (anterior) {
        try {
          await cliente.atualizar(anterior.eventoId, evento);
          eventoId = anterior.eventoId;
          resultado.atualizados++;
        } catch (erro) {
          if (!(erro instanceof IntervalsErroApi && erro.status === 404)) throw erro; // evento apagado no intervals.icu: cria de novo
        }
      }
      if (eventoId === null) {
        eventoId = await cliente.criar(evento);
        resultado.enviados++;
      }
      await aoRegistrar(treino.id, { eventoId, assinatura });
    } catch (erro) {
      resultado.falhas++;
      resultado.problemas.push({ data: treino.data, nome: nomeDoEvento(treino), motivo: motivoDaFalha(erro) });
    }
  }
  return resultado;
}
