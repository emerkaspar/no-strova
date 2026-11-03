import { reconstruirCalibracao } from '../core/functions.js';
import { observarCalibracao, observarPreferencias } from '../infrastructure/calibracaoRepo.js';

/** Controle do pedido de reconstrução (uma vez por sessão do navegador). */
export const controleCalibracao = { pedido: false };

/** A calibração que as estimativas devem usar: o resumo do servidor, a menos que o usuário a tenha desligado. */
export function calibracaoEfetiva(calibracao, preferencias) {
  return preferencias?.calibracaoAtiva === false ? null : (calibracao ?? null);
}

/**
 * Atividades anteriores ao gatilho não têm resumo de calibração: quando o documento não existe, pede a
 * reconstrução uma única vez por sessão (o resultado chega depois pelo listener).
 */
export function pedirReconstrucaoSeFaltar(calibracao) {
  if (calibracao || controleCalibracao.pedido) return;
  controleCalibracao.pedido = true;
  reconstruirCalibracao().catch(() => {});
}

/**
 * Observa o resumo de calibração e a preferência de uso. `aoMudar({ calibracao, preferencias, efetiva })` só é chamado
 * quando os dois já chegaram (ou deram erro, contando como ausentes). Quem chama cancela ao sair da tela.
 * @returns {() => void}
 */
export function observarCalibracaoDoUsuario(uid, aoMudar) {
  let calibracao = null;
  let preferencias = null;
  const chegou = { calibracao: false, preferencias: false };
  const emitir = () => {
    if (chegou.calibracao && chegou.preferencias) aoMudar({ calibracao, preferencias, efetiva: calibracaoEfetiva(calibracao, preferencias) });
  };
  const cancelar = [
    observarCalibracao(
      uid,
      (dados) => {
        calibracao = dados;
        chegou.calibracao = true;
        pedirReconstrucaoSeFaltar(dados);
        emitir();
      },
      () => {
        chegou.calibracao = true;
        emitir();
      },
    ),
    observarPreferencias(
      uid,
      (dados) => {
        preferencias = dados;
        chegou.preferencias = true;
        emitir();
      },
      () => {
        chegou.preferencias = true;
        emitir();
      },
    ),
  ];
  return () => cancelar.forEach((fn) => fn());
}
