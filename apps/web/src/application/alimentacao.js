import { validarPerfilAlimentar } from '@no-strova/domain';
import { sugerirAlimentacao } from '../core/functions.js';
import { salvarPerfilAlimentar } from '../infrastructure/alimentacaoRepo.js';

/**
 * Pede à IA as sugestões de comida do dia ou da semana. O servidor grava o resultado (o app o observa em
 * `alimentacaoIa/{uid}`). Retorna `{ restantes, escopo, saida }`. Lança Error em português.
 * @param {'dia'|'semana'} escopo
 * @param {string} [observacao] pedido extra curto (ex.: "sem fogão hoje")
 */
export function pedirSugestaoAlimentar(escopo, observacao = '') {
  const texto = observacao.trim();
  return sugerirAlimentacao({ escopo, ...(texto ? { observacao: texto } : {}) });
}

/** Valida e salva o perfil alimentar. Lança Error com as mensagens de validação. */
export async function salvarPerfilDeAlimentacao(uid, entrada) {
  const r = validarPerfilAlimentar(entrada);
  if (!r.valido) throw new Error(r.erros.join(' '));
  await salvarPerfilAlimentar(uid, r.valores);
  return r.valores;
}
