import { HttpsError, onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { logger } from "firebase-functions";
import { exigirAcesso, lerObjeto } from "../../shared/guards";
import { reconstruirCalibracaoDoUsuario } from "../calibracao/calibracao.service";
import * as servico from "./atividades.service";
import { extensaoValida } from "./parsers";

function dataNascimentoDoPerfil(perfil: { dataNascimento?: string | null }): string | null {
  return typeof perfil.dataNascimento === "string" ? perfil.dataNascimento : null;
}

/** O arquivo já está no Storage (enviado pelo cliente); esta callable valida, calcula e grava a atividade. */
export const processarArquivoAtividade = onCall(
  { region: REGIAO, memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    const { uid, perfil } = await exigirAcesso(request);
    const dados = lerObjeto(request.data);
    if (!extensaoValida(dados.extensao)) {
      throw new HttpsError("invalid-argument", "Extensão inválida. Use .fit, .gpx ou .tcx.");
    }
    return servico.processarArquivo(uid, dataNascimentoDoPerfil(perfil), servico.lerPedidoArquivo(dados, dados.extensao));
  },
);

export const criarAtividadeManual = onCall({ region: REGIAO }, async (request) => {
  const { uid, perfil } = await exigirAcesso(request);
  return servico.criarManual(uid, dataNascimentoDoPerfil(perfil), lerObjeto(request.data));
});

export const excluirAtividade = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  await servico.excluirAtividade(uid, servico.validarIdAtividade(lerObjeto(request.data).atividadeId));
  return { ok: true };
});

export const renomearAtividade = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const dados = lerObjeto(request.data);
  const titulo = await servico.renomearAtividade(uid, servico.validarIdAtividade(dados.atividadeId), dados.titulo);
  return { titulo };
});

/** Salva o modal "Como foi?": título, esporte e feedback (sensação, esforço, etiquetas e notas). */
export const salvarAtividade = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const dados = lerObjeto(request.data);
  return servico.salvarEdicaoDaAtividade(uid, servico.validarIdAtividade(dados.atividadeId), dados);
});

export const obterUrlArquivo = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const url = await servico.urlDoArquivo(uid, servico.validarIdAtividade(lerObjeto(request.data).atividadeId));
  return { url };
});

export const recalcularHistorico = onCall({ region: REGIAO, timeoutSeconds: 300 }, async (request) => {
  const { uid, perfil } = await exigirAcesso(request);
  const resultado = await servico.recalcularHistorico(uid, dataNascimentoDoPerfil(perfil));
  // O HRSS e as zonas mudaram: o resumo de calibração é refeito do zero.
  try {
    await reconstruirCalibracaoDoUsuario(uid);
  } catch (err) {
    logger.error("Falha ao reconstruir a calibração depois de recalcular o histórico", err);
  }
  return resultado;
});

/** Calcula o melhor 5 km e 10 km das atividades antigas (o app chama até `restantes` zerar). */
export const calcularMelhoresEsforcos = onCall({ region: REGIAO, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const prioritaria = request.data?.atividadeId === undefined ? null : servico.validarIdAtividade(request.data.atividadeId);
  return servico.calcularMelhoresEsforcosDoUsuario(uid, prioritaria);
});
