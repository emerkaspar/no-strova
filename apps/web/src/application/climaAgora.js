import { buscarClimaAgora, localizarUsuario } from '../infrastructure/climaAgoraRepo.js';

/**
 * Clima de agora no local do usuário, para o card "Forma hoje".
 * `motivo` explica a ausência: `localizacao-negada`, `localizacao-indisponivel` ou `sem-resposta` (o serviço falhou).
 * @returns {Promise<{ clima: { temperaturaC: number, sensacaoC: number|null, ventoKmh: number|null, chuvaMm: number|null, climaCodigo: number|null, dia: boolean }|null, motivo: string|null }>}
 */
export async function climaAgoraDoUsuario() {
  const { ponto, erro } = await localizarUsuario();
  if (!ponto) return { clima: null, motivo: erro === 1 ? 'localizacao-negada' : 'localizacao-indisponivel' };
  const clima = await buscarClimaAgora(ponto);
  return { clima, motivo: clima ? null : 'sem-resposta' };
}
