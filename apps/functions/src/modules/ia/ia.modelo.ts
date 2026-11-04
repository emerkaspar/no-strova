import { googleAI } from "@genkit-ai/google-genai";
import { genkit, type z } from "genkit";

/** Modelo Gemini usado nas sugestões (troque aqui para mudar em todas). */
export const MODELO_GEMINI = "gemini-2.5-flash";

/**
 * Chama o Gemini pelo Genkit pedindo saída estruturada. A chave vem do Secret Manager (`GEMINI_API_KEY`) e é
 * passada por quem chama. Lança erro se o modelo não devolver uma saída que case com o schema.
 */
export async function gerarSaidaEstruturada<T extends z.ZodTypeAny>(
  apiKey: string,
  pedido: { sistema: string; prompt: string; schema: T; temperatura?: number },
): Promise<z.infer<T>> {
  const ai = genkit({ plugins: [googleAI({ apiKey })] });
  const { output } = await ai.generate({
    model: googleAI.model(MODELO_GEMINI),
    system: pedido.sistema,
    prompt: pedido.prompt,
    output: { schema: pedido.schema },
    config: { temperature: pedido.temperatura ?? 0.4 },
  });
  if (!output) throw new Error("O modelo não devolveu uma saída válida.");
  return output as z.infer<T>;
}
