import { chaveDeReceita } from '@no-strova/domain';
import { carimboDeServidor, excluirDocumento, gravarDocumento, observarConsulta, observarDocumento } from '../core/db.js';

/** Perfil alimentar do usuário ou null (sem documento, vale o padrão do domínio). */
export function observarPerfilAlimentar(uid, aoDados, aoErro) {
  return observarDocumento(`perfilAlimentar/${uid}`, aoDados, aoErro);
}

/** Grava (substitui) o perfil já validado por `validarPerfilAlimentar`. */
export function salvarPerfilAlimentar(uid, valores) {
  const { objetivo, usarMetaDePeso, restricoes, contexto, refeicoesPorDia, refeicoes } = valores;
  return gravarDocumento(`perfilAlimentar/${uid}`, { userId: uid, objetivo, usarMetaDePeso, restricoes, contexto, refeicoesPorDia, refeicoes });
}

/**
 * As últimas sugestões geradas pela IA (só o servidor escreve): `{ dia?, semana? }`, cada um com
 * `{ data, objetivo, tipoDeDia, saida: { resumo, itens, avisos, aviso }, geradoEm }`; null enquanto nunca gerou.
 */
export function observarSugestaoAlimentar(uid, aoDados, aoErro) {
  return observarDocumento(`alimentacaoIa/${uid}`, aoDados, aoErro);
}

/** Receitas favoritas: `[{ id, chave, item }]`. */
export function observarFavoritas(uid, aoDados, aoErro) {
  return observarConsulta('receitasFavoritas', { onde: [['userId', '==', uid]] }, aoDados, aoErro);
}

export function favoritarReceita(uid, item) {
  const chave = chaveDeReceita(item);
  const { bloco, dia, nome, tipo, porQue, tempoMin, ingredientes, preparo, equipamento, vespera } = item;
  const limpo = { bloco, ...(dia ? { dia } : {}), nome, tipo, porQue: porQue ?? '', tempoMin: tempoMin ?? null, ingredientes, preparo, equipamento, vespera: vespera === true };
  return gravarDocumento(`receitasFavoritas/${uid}_${chave}`, { userId: uid, chave, item: limpo, criadoEm: carimboDeServidor() });
}

export function desfavoritarReceita(uid, chave) {
  return excluirDocumento(`receitasFavoritas/${uid}_${chave}`);
}
