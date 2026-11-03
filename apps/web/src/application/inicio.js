import { faixaDaForma } from '@no-strova/domain';
import { formatarForma, formatarNumero } from '../utils/formatters.js';

/** Dias desde o último treino (0 = treinou hoje). `null` se a série não tem treino. */
export function diasDesdeUltimoTreino(serie) {
  for (let i = serie.length - 1; i >= 0; i--) {
    if (serie[i].estresse > 0) return serie.length - 1 - i;
  }
  return null;
}

function textoUltimoTreino(dias) {
  if (dias === null) return '—';
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return `Há ${dias} dias`;
}

/** "▲ 1,2 em 7 dias", "▼ 0,4 em 7 dias" ou "estável em 7 dias". */
function variacaoEm7Dias(serie, campo) {
  const hoje = serie[serie.length - 1];
  const antes = serie[serie.length - 8] ?? serie[0];
  const delta = hoje[campo] - antes[campo];
  if (Math.abs(delta) < 0.05) return 'estável em 7 dias';
  return `${delta > 0 ? '▲' : '▼'} ${formatarNumero(Math.abs(delta), 1)} em 7 dias`;
}

/**
 * O que o bloco colorido do Início mostra: a Forma de hoje em destaque, a cor da zona e poucos dados menores.
 *  - `numero`: sempre que há série. A zona define a cor (ótima = laranja da marca; fresca = verde; neutra = cinza;
 *    transição = azul; sobrecarga = vermelho). A frase da zona vira um título pequeno. Os dados menores:
 *    Fitness (com a variação em 7 dias), Fadiga, Forma de amanhã e Último treino.
 *  - `vazio`: ainda não há atividade com HRSS; convida a começar.
 * A Forma de hoje é Fitness − Fadiga de ontem (regra do Elevate). Por isso "Forma amanhã" (Fitness − Fadiga de
 * hoje) mostra o efeito do treino de hoje.
 * @param {import('@no-strova/domain').DiaForma[]} serie série até hoje (último item = hoje)
 * @param {{ semHrss?: boolean }} [opcoes] `semHrss`: há atividades, mas nenhuma com HRSS calculado
 */
export function destaqueDoInicio(serie, { semHrss = false } = {}) {
  if (serie.length === 0) {
    return semHrss
      ? { tipo: 'vazio', rotulo: 'Hoje', titulo: 'Falta a FC', texto: 'Cadastre a sua FC máxima, de repouso e o LTHR para ver a sua forma.', cta: { rotulo: 'Configurar FC', href: '#/configuracao' } }
      : { tipo: 'vazio', rotulo: 'Hoje', titulo: 'Vamos começar', texto: 'Importe um treino ou registre um pedal para ver a sua forma.', cta: { rotulo: 'Importar arquivo', acao: 'importar' } };
  }

  const hoje = serie[serie.length - 1];
  const faixa = faixaDaForma(hoje.forma);
  const formaAmanha = hoje.fitness - hoje.fadiga;
  const dias = diasDesdeUltimoTreino(serie);
  const cargaDoUltimo = dias === null ? null : serie[serie.length - 1 - dias].estresse;

  return {
    tipo: 'numero',
    zona: faixa.id,
    rotulo: 'Forma hoje',
    numero: formatarForma(hoje.forma, 1),
    chip: faixa.chip,
    titulo: faixa.resumo,
    estatisticas: [
      { id: 'fitness', rotulo: 'Fitness', valor: formatarNumero(hoje.fitness, 1), nota: variacaoEm7Dias(serie, 'fitness') },
      { id: 'fadiga', rotulo: 'Fadiga', valor: formatarNumero(hoje.fadiga, 1), nota: 'média de 7 dias' },
      { id: 'amanha', rotulo: 'Forma amanhã', valor: formatarForma(formaAmanha, 1), nota: faixaDaForma(formaAmanha).chip },
      {
        id: 'ultimo',
        rotulo: 'Último treino',
        valor: textoUltimoTreino(dias),
        nota: cargaDoUltimo === null ? null : `${formatarNumero(cargaDoUltimo, 0)} de HRSS`,
      },
    ],
    cta: { rotulo: 'Planejar treino', href: '#/plano' },
  };
}
