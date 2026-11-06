import { camposDeClima, climaDaResposta, pontoDePartida, resumirTemperaturaDoSensor, urlDoClima } from "@no-strova/domain";
import { logger } from "firebase-functions";
import type { Amostra } from "./parsers/amostra";

const TEMPO_LIMITE_MS = 3000;

type CamposDeClima = ReturnType<typeof camposDeClima>;

/**
 * Temperatura e clima de uma atividade com arquivo: o sensor do arquivo tem prioridade na temperatura; o resto vem do
 * Open-Meteo, pelo ponto de partida arredondado (~1 km) e pela hora. Qualquer falha de rede vira clima ausente: a
 * atividade nunca deixa de ser importada por causa do clima.
 */
export async function climaDaAtividade(amostras: Amostra[], inicioMs: number, duracaoS: number): Promise<CamposDeClima> {
  const sensor = resumirTemperaturaDoSensor(amostras);
  const ponto = pontoDePartida(amostras);
  let clima: ReturnType<typeof climaDaResposta> = null;
  if (ponto) {
    try {
      const resposta = await fetch(urlDoClima({ ...ponto, inicioMs, duracaoS, agoraMs: Date.now() }), {
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      if (resposta.ok) clima = climaDaResposta(await resposta.json(), inicioMs, duracaoS);
      else logger.warn("O serviço de clima respondeu com erro", { status: resposta.status });
    } catch (err) {
      logger.warn("Não foi possível buscar o clima da atividade", { erro: String(err) });
    }
  }
  return camposDeClima(sensor, clima);
}
