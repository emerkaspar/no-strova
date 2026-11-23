import {
  configVigenteEm,
  consideracoesDaSemana,
  diaNoFuso,
  estimarEstresseEstruturado,
  modeloPorId,
  RECURSOS,
  repetirVoltas,
  somarDias,
  temRecurso,
  textoDoAvisoDaSemana,
  treinoPlanejadoDoModelo,
  usuarioPodeAcessar,
  validarTreinoPlanejado,
} from "@no-strova/domain";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "../../shared/firebase";
import { carregarConfigs } from "../atividades/atividades.service";
import { criarNotificacao } from "../notificacoes/notificacoes.service";
import { sugerirTreinosDoUsuario } from "./ia.service";

const refSemana = (uid: string) => db.doc(`semanaIa/${uid}`);

type Resultado = "gerada" | "sem-treinos" | "falhou" | "ignorado";

/**
 * Monta a próxima semana (de segunda a domingo, a partir de amanhã) para um usuário que ligou "gerar com IA":
 * a IA escolhe, o código confere (as mesmas regras da sugestão manual), os treinos entram direto no plano com a marca
 * `geradoPorIa`, o resumo fica em `semanaIa/{uid}` e o usuário recebe o aviso (central e push). Rodar de novo na mesma
 * semana não faz nada.
 */
export async function gerarSemanaDoUsuario(uid: string, apiKey: string, hoje: string = diaNoFuso(Date.now())): Promise<Resultado> {
  const inicio = somarDias(hoje, 1);
  const fim = somarDias(hoje, 7);

  const [perfilSnap, prefSnap, atualSnap] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`preferencias/${uid}`).get(), refSemana(uid).get()]);
  const perfil = perfilSnap.data();
  if (!perfil || !usuarioPodeAcessar(perfil as never) || !temRecurso(perfil as never, RECURSOS.IA)) return "ignorado";
  const pref = prefSnap.data() ?? {};
  if (pref.planoIaAutomatico !== true) return "ignorado";
  if (atualSnap.data()?.inicio === inicio && atualSnap.data()?.status === "gerada") return "ignorado";

  const registrar = async (status: Resultado, extra: Record<string, unknown> = {}) => {
    await refSemana(uid).set({ userId: uid, inicio, fim, status, geradoEm: FieldValue.serverTimestamp(), ...extra });
  };

  const dias: number[] = Array.isArray(pref.diasTreino) ? pref.diasTreino : [];
  if (dias.length === 0) {
    await registrar("falhou", { erro: "Defina os seus dias de treino no Perfil de treino para a IA montar a semana." });
    return "falhou";
  }
  // tempo de cada dia de treino (só vale se todos os dias de treino têm tempo; senão a semana usa as horas totais)
  const minutosPref = pref.minutosPorDia && typeof pref.minutosPorDia === "object" ? (pref.minutosPorDia as Record<string, unknown>) : null;
  const minutosPorDia = minutosPref && dias.every((d) => typeof minutosPref[String(d)] === "number") ? Object.fromEntries(dias.map((d) => [String(d), minutosPref[String(d)] as number])) : null;
  const entrada = {
    semanas: 1,
    diasDaSemana: dias,
    ...(minutosPorDia ? { minutosPorDia } : {}),
    diaLongao: typeof pref.diaLongao === "number" ? pref.diaLongao : null,
    horasPorSemana: typeof pref.horasSemana === "number" ? pref.horasSemana : 6,
    esporte: pref.esportePrincipal === "ciclismo" || pref.esportePrincipal === "corrida" ? pref.esportePrincipal : "ambos",
    observacao: "",
  };

  let rascunho;
  try {
    rascunho = await sugerirTreinosDoUsuario(uid, entrada, apiKey, { automatico: true });
  } catch (err) {
    logger.error("Semana automática: falha na IA", { uid, erro: String(err) });
    await registrar("falhou", { erro: "Não foi possível montar a semana agora. Você ainda pode pedir os treinos manualmente." });
    return "falhou";
  }

  const itens = (rascunho.saida.itens as Array<{ data: string; modeloId: string; nome: string; foco: string; duracaoMin: number; estresse: number; motivo: string; voltas?: number; trajeto?: string }>).filter((i) => i.data >= inicio && i.data <= fim);
  const ctx = rascunho.contextoResumo;
  const consideracoes = consideracoesDaSemana({
    nivel: ctx?.nivel ?? "intermediario",
    estado: ctx?.estado ?? null,
    cargaBase: ctx?.cargaBase,
    feedback: ctx?.feedback as never,
    bemEstar: ctx?.bemEstar ?? null,
    diasDeTreino: dias,
    diaLongao: entrada.diaLongao,
    horasPorSemana: entrada.horasPorSemana,
    ocupados: ctx?.ocupados ?? [],
  });
  if (itens.length === 0) {
    await registrar("sem-treinos", { consideracoes, avisos: rascunho.saida.avisos });
    return "sem-treinos";
  }

  // grava no plano pelo mesmo formato do app (validado), tudo ou nada
  const configs = await carregarConfigs(uid);
  const lote = db.batch();
  for (const item of itens) {
    const base = modeloPorId(item.modeloId, ctx?.proprios ?? []);
    if (!base) continue;
    // treino de trajeto com voltas: repete os passos do trajeto para fechar o tempo do dia
    const modelo = item.voltas && item.voltas > 1 ? repetirVoltas(base, item.voltas) : base;
    if (!modelo) continue;
    const r = validarTreinoPlanejado(treinoPlanejadoDoModelo(modelo, item.data));
    if (!r.valido || !r.valores) {
      logger.warn("Semana automática: treino descartado", { uid, modeloId: item.modeloId, erros: r.erros });
      continue;
    }
    const estimado = estimarEstresseEstruturado({ passos: (r.valores as { passos?: unknown }).passos as never, config: configVigenteEm(configs, item.data) });
    lote.set(db.collection("treinosPlanejados").doc(), {
      userId: uid,
      ...r.valores,
      estresseEstimado: estimado ?? null,
      status: "planejado",
      atividadeId: null,
      geradoPorIa: true,
      criadoEm: FieldValue.serverTimestamp(),
    });
  }
  await lote.commit();

  await registrar("gerada", {
    resumo: rascunho.saida.resumo,
    consideracoes,
    avisos: rascunho.saida.avisos,
    itens: itens.map((i) => ({ data: i.data, nome: i.nome, foco: i.foco, duracaoMin: i.duracaoMin, estresse: i.estresse, motivo: i.motivo })),
  });

  const texto = textoDoAvisoDaSemana({ itens, consideracoes });
  await criarNotificacao(uid, "semanaIa", { inicio, ...texto });
  return "gerada";
}

/** Domingo às 20h: monta a semana de todos os usuários que ligaram o recurso (falha de um não derruba os outros). */
export async function gerarSemanasAutomaticas(apiKey: string): Promise<void> {
  const snap = await db.collection("preferencias").where("planoIaAutomatico", "==", true).get();
  const resumo: Record<string, number> = {};
  const lote = 4;
  for (let i = 0; i < snap.docs.length; i += lote) {
    await Promise.all(
      snap.docs.slice(i, i + lote).map(async (d) => {
        let r: Resultado = "falhou";
        try {
          r = await gerarSemanaDoUsuario(d.id, apiKey);
        } catch (err) {
          logger.error("Semana automática: falha inesperada", { uid: d.id, erro: String(err) });
        }
        resumo[r] = (resumo[r] ?? 0) + 1;
      }),
    );
  }
  logger.info("Semana automática concluída", { usuarios: snap.size, ...resumo });
}
