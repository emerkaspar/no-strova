import { HrmTarget, NoTarget, Step, StepType, TimeDuration, WorkoutBuilder, WorkoutType } from "@flow-js/garmin-connect";

/** Treino do plano como sai de `montarPlanoParaExportar` (passos já expandidos, com a faixa de FC em bpm). */
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

const TIPOS_DE_PASSO: Record<string, StepType> = {
  aquecimento: StepType.WarmUp,
  principal: StepType.Run,
  recuperacao: StepType.Recovery,
  desaquecimento: StepType.Cooldown,
};

/** Nome no Garmin com o dia na frente ("06/11 Pedrada"): acha-se fácil no aparelho e treinos de mesmo nome não se confundem. */
export function nomeNoGarmin(treino: Pick<TreinoPlano, "data" | "nome">): string {
  const [, mes, dia] = treino.data.split("-");
  return `${dia}/${mes} ${treino.nome}`;
}

/** Converte um treino do plano no treino do Garmin Connect: passos por tempo, com alvo de FC em bpm quando há faixa. */
export function treinoParaGarmin(treino: TreinoPlano) {
  if (treino.passos.length === 0) throw new Error("Treino sem passos.");
  const esporte = treino.esporte === "corrida" ? WorkoutType.Running : WorkoutType.Cycling;
  const construtor = new WorkoutBuilder(esporte, nomeNoGarmin(treino));
  for (const p of treino.passos) {
    construtor.addStep(
      new Step(
        TIPOS_DE_PASSO[p.papel] ?? StepType.Run,
        TimeDuration.fromSeconds(p.duracaoS),
        p.fc ? new HrmTarget(p.fc[0], p.fc[1]) : new NoTarget(),
        p.descricao ?? undefined,
      ),
    );
  }
  const treinoGarmin = construtor.build();
  treinoGarmin.estimatedDurationInSecs = treino.passos.reduce((total, p) => total + p.duracaoS, 0);
  return treinoGarmin;
}
