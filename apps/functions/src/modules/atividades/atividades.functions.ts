import { HttpsError, onCall } from "firebase-functions/v2/https";
import { REGIAO } from "../../shared/config";
import { exigirAcesso, lerObjeto } from "../../shared/guards";
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

export const obterUrlArquivo = onCall({ region: REGIAO }, async (request) => {
  const { uid } = await exigirAcesso(request);
  const url = await servico.urlDoArquivo(uid, servico.validarIdAtividade(lerObjeto(request.data).atividadeId));
  return { url };
});

export const recalcularHistorico = onCall({ region: REGIAO, timeoutSeconds: 300 }, async (request) => {
  const { uid, perfil } = await exigirAcesso(request);
  return servico.recalcularHistorico(uid, dataNascimentoDoPerfil(perfil));
});
