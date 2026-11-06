import { buscarClimaAgora, localizarUsuario } from '../infrastructure/climaAgoraRepo.js';

/**
 * Clima de agora no local do usuário, para o card "Forma hoje". `null` quando não há local ou o serviço não responde.
 * @returns {Promise<{ temperaturaC: number, sensacaoC: number|null, ventoKmh: number|null, chuvaMm: number|null, climaCodigo: number|null, dia: boolean }|null>}
 */
export async function climaAgoraDoUsuario() {
  const ponto = await localizarUsuario();
  return ponto ? buscarClimaAgora(ponto) : null;
}
