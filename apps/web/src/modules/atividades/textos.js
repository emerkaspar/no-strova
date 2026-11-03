import { ESPORTES, ZONAS } from '@no-strova/domain';

export const ROTULO_ESPORTE = Object.freeze({
  [ESPORTES.CICLISMO]: 'Ciclismo',
  [ESPORTES.CORRIDA]: 'Corrida',
  [ESPORTES.OUTRO]: 'Outro',
});

export const OPCOES_ESPORTE = Object.entries(ROTULO_ESPORTE).map(([valor, rotulo]) => ({ valor, rotulo }));

export const OPCOES_ZONA = Object.entries(ZONAS).map(([valor, z]) => ({ valor, rotulo: z.rotulo }));

export const ROTULO_ORIGEM_HRSS = Object.freeze({
  fc: 'calculado pela FC média',
  zona: 'estimado pela zona informada',
  manual: 'informado por você',
});

export const ROTULO_ORIGEM_CALORIAS = Object.freeze({
  arquivo: 'do arquivo',
  informada: 'informadas por você',
  estimada: 'estimadas (Keytel, pela FC, peso e idade)',
});

export const TEXTO_ALERTA = Object.freeze({
  semConfigFc:
    'Não havia configuração de FC vigente nesta data, então o HRSS não foi calculado. Em Configuração, ajuste o “Vigente desde” da sua configuração mais antiga para uma data anterior a esta atividade e use “Recalcular histórico”.',
  semFc: 'A atividade não tem FC nem zona informada, então o HRSS não foi calculado.',
  hrssAnormal: 'O HRSS por hora está muito alto (acima de 225). Confira os dados: pode ser erro do sensor.',
  fcAcimaDaMaxima: 'A FC máxima da atividade passou da FC máxima configurada. Confira a sua configuração.',
});
