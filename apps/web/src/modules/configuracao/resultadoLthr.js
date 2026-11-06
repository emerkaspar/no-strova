import { analisarTesteLthr, configAposTeste, configVigenteEm } from '@no-strova/domain';
import { lerSerieFc } from '../../infrastructure/atividadesRepo.js';
import { salvarConfig } from '../../infrastructure/configsRepo.js';
import { executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarDuracao } from '../../utils/formatters.js';
import { confirmar } from '../../utils/modal.js';
import { conferirLthrNoIntervals } from './lthrIntervals.js';

/**
 * Análise de uma atividade como teste de LTHR (protocolo de 30 minutos): lê a série de FC guardada e acha a melhor janela.
 * Compartilhada pelo cartão "Teste de LTHR" de Configuração e pelo modal "Como foi?".
 * @param {{ id: string, data: string }} atividade
 * @param {any[]} configs configurações de FC do usuário (para os avisos e a configuração-base)
 * @returns {Promise<NonNullable<ReturnType<typeof analisarTesteLthr>>>}
 * @throws {Error} em português, quando não há série de FC ou 30 minutos seguidos
 */
export async function analisarAtividadeLthr(atividade, configs) {
  const serie = await lerSerieFc(atividade.id);
  if (!serie?.fc?.length) throw new Error('Esta atividade não tem série de frequência cardíaca guardada.');
  const analise = analisarTesteLthr(serie, configVigenteEm(configs, atividade.data) ?? configs[0] ?? null);
  if (!analise) throw new Error('Não achei 30 minutos seguidos de FC nesta atividade. O teste precisa de pelo menos 30 minutos de esforço contínuo.');
  return analise;
}

/**
 * Blocos do resultado do teste: LTHR sugerido, FC da janela, FC máxima, avisos e o botão que cria a nova vigência
 * (com confirmação, porque o LTHR muda o HRSS de tudo).
 * @param {{ uid: string, atividade: { data: string }, analise: any, configs: any[], mensagem: { mostrar: Function }, idCaixa?: string }} p
 * @returns {HTMLElement[]}
 */
export function montarResultadoLthr({ uid, atividade, analise, configs, mensagem, idCaixa = 'teste-fcmax' }) {
  const base = configVigenteEm(configs, atividade.data) ?? configs[0] ?? null;
  const maisAlta = base && analise.fcMaxObservada > base.fcMax;
  const caixaFcMax = h('input', { type: 'checkbox', id: idCaixa, checked: Boolean(maisAlta) });
  const botaoAplicar = h('button', { class: 'btn', type: 'button' }, 'Criar nova vigência com este LTHR');

  botaoAplicar.addEventListener('click', () =>
    executarComBotao(botaoAplicar, mensagem, async () => {
      if (!base) throw new Error('Cadastre primeiro a sua configuração de FC (sexo, peso, altura e FC de repouso), para o app criar a nova vigência a partir dela.');
      const r = configAposTeste({ base, lthr: analise.lthr, fcMaxObservada: analise.fcMaxObservada, atualizarFcMax: caixaFcMax.checked, data: atividade.data });
      if (!r.valido) throw new Error(r.erros.join(' '));
      const existente = configs.find((c) => c.vigenteDesde === r.valores.vigenteDesde);
      const texto = `Criar a vigência de ${formatarData(r.valores.vigenteDesde)} com LTHR ${r.valores.lthr} bpm${r.valores.fcMax !== base.fcMax ? ` e FC máxima ${r.valores.fcMax} bpm` : ''}?${existente ? ' Já existe uma configuração com essa data; ela será substituída.' : ''}`;
      if (!(await confirmar({ titulo: 'Criar nova vigência?', mensagem: texto, confirmarTexto: 'Criar vigência', tipo: 'info', icone: 'configuracao' }))) return;
      await salvarConfig(uid, r.valores);
      const avisoIntervals = await conferirLthrNoIntervals();
      mensagem.mostrar(`Vigência de ${formatarData(r.valores.vigenteDesde)} criada com LTHR ${r.valores.lthr} bpm. Use “Recalcular histórico” para aplicar às atividades já importadas.${avisoIntervals}`, 'ok');
    }),
  );

  // os blocos opcionais saem da lista antes (replaceChildren(null) escreveria "null" na tela)
  return [
    h(
      'div',
      { class: 'teste-numeros' },
      h('div', { class: 'teste-numero' }, h('span', { class: 'teste-rotulo' }, 'LTHR sugerido'), h('strong', { class: 'teste-lthr' }, `${analise.lthr} bpm`), h('span', { class: 'teste-nota' }, 'média dos últimos 20 min da melhor janela de 30 min')),
      h('div', { class: 'teste-numero' }, h('span', { class: 'teste-rotulo' }, 'FC média dos 30 min'), h('strong', null, `${analise.mediaJanela} bpm`), h('span', { class: 'teste-nota' }, `de ${formatarDuracao(analise.inicioS)} a ${formatarDuracao(analise.fimS)} da atividade`)),
      h('div', { class: 'teste-numero' }, h('span', { class: 'teste-rotulo' }, 'FC máxima observada'), h('strong', null, `${analise.fcMaxObservada} bpm`), base ? h('span', { class: 'teste-nota' }, `configurada: ${base.fcMax} bpm`) : null),
    ),
    ...analise.avisos.map((a) => h('p', { class: 'mensagem mensagem-aviso' }, a)),
    maisAlta ? h('label', { class: 'opcao', for: idCaixa }, caixaFcMax, ` Atualizar também a FC máxima para ${analise.fcMaxObservada} bpm (a observada passou da configurada)`) : null,
    h('p', { class: 'texto-secundario' }, `A nova vigência vale a partir de ${formatarData(atividade.data)}, a data do teste.`),
    botaoAplicar,
  ].filter(Boolean);
}
