import { somarDias } from '@no-strova/domain';
import { detalheDaEstimativa, salvarTreinoPlanejado } from '../../application/plano.js';
import { desvincularTreino, excluirTreino, pularTreino } from '../../infrastructure/planoRepo.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { OPCOES_ESPORTE, OPCOES_ZONA } from '../atividades/textos.js';

/**
 * Formulário de treino planejado (novo ou existente).
 * @param {{
 *   uid: string, configs: () => any[], calibracao?: () => any, treino: any|null, dataInicial: string,
 *   aoConcluir: (aviso?: string) => void, aoCancelar: () => void
 * }} p `configs` e `calibracao` são funções para sempre ler o valor mais recente
 */
export function criarEditor({ uid, configs, calibracao = () => null, treino, dataInicial, aoConcluir, aoCancelar }) {
  const existente = Boolean(treino);
  const data = campo({ id: 'tr-data', rotulo: 'Data', tipo: 'date', value: treino?.data ?? dataInicial });
  const esporte = selecao({ id: 'tr-esporte', rotulo: 'Esporte', opcoes: OPCOES_ESPORTE, valor: treino?.esporte ?? 'ciclismo' });
  const duracao = campo({ id: 'tr-duracao', rotulo: 'Duração (minutos)', inputmode: 'numeric', value: treino?.duracaoMin ?? '' });
  const zona = selecao({ id: 'tr-zona', rotulo: 'Zona predominante', opcoes: OPCOES_ZONA, valor: treino?.zona ?? 'Z2' });
  const estresse = campo({
    id: 'tr-estresse',
    rotulo: 'Estresse informado (opcional)',
    inputmode: 'decimal',
    value: treino?.estresseManual ?? '',
    dica: 'Sem valor, o app estima pela zona e pela duração.',
  });
  const observacoes = h('textarea', { id: 'tr-obs', name: 'tr-obs', rows: 3, maxlength: 500, placeholder: 'Ex.: serra, intervalado 4×8 min…' });
  observacoes.value = treino?.observacoes ?? '';
  const estimativa = h('p', { class: 'estimativa', 'aria-live': 'polite' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, existente ? 'Salvar alterações' : 'Adicionar treino');

  function atualizarEstimativa() {
    const detalhe = detalheDaEstimativa({
      zona: zona.select.value,
      duracaoMin: duracao.input.value,
      data: data.input.value,
      configs: configs(),
      esporte: esporte.select.value,
      calibracao: calibracao(),
    });
    if (detalhe === null) {
      estimativa.textContent =
        configs().length === 0
          ? 'Cadastre a configuração de FC (em Configuração) para o app estimar o estresse do treino.'
          : 'Informe a data, a duração e a zona para ver a estimativa.';
      return;
    }
    const outroValor = estresse.input.value ? ' (você informou outro valor abaixo)' : '';
    estimativa.textContent = detalhe.calibrado
      ? `Estimativa: ~${formatarNumero(detalhe.valor, 0)} de HRSS, calibrada com as suas ${detalhe.n} atividades parecidas (pela fórmula seria ~${formatarNumero(detalhe.formula, 0)})${outroValor}.`
      : `Estimativa: ~${formatarNumero(detalhe.valor, 0)} de HRSS${outroValor}.`;
  }
  for (const el of [data.input, duracao.input, esporte.select, zona.select, estresse.input]) {
    el.addEventListener('input', atualizarEstimativa);
    el.addEventListener('change', atualizarEstimativa);
  }
  atualizarEstimativa();

  const entrada = () => ({
    esporte: esporte.select.value,
    data: data.input.value,
    duracaoMin: duracao.input.value,
    zona: zona.select.value,
    estresseManual: estresse.input.value,
    observacoes: observacoes.value,
  });

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          await salvarTreinoPlanejado({ uid, id: treino?.id, entrada: entrada(), configs: configs(), calibracao: calibracao() });
          aoConcluir(existente ? 'Treino atualizado.' : 'Treino adicionado.');
        });
      },
    },
    h('div', { class: 'grid' }, data.raiz, esporte.raiz, duracao.raiz, zona.raiz, estresse.raiz),
    h('div', { class: 'campo' }, h('label', { for: 'tr-obs' }, 'Observações (opcional)'), observacoes),
    estimativa,
    mensagem.el,
  );
  // O botão de enviar precisa estar DENTRO do formulário: fora dele, clicar não dispara o submit.

  async function acao(botaoAcao, executar, aviso) {
    botaoAcao.disabled = true;
    mensagem.limpar();
    try {
      await executar();
      aoConcluir(aviso);
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível concluir a operação.');
      botaoAcao.disabled = false;
    }
  }

  const botoes = h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoCancelar }, 'Cancelar'));

  if (existente) {
    const duplicar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Duplicar para a próxima semana');
    duplicar.addEventListener('click', () =>
      acao(
        duplicar,
        () => salvarTreinoPlanejado({ uid, entrada: { ...entrada(), data: somarDias(treino.data, 7) }, configs: configs(), calibracao: calibracao() }),
        `Treino duplicado para ${formatarData(somarDias(treino.data, 7))}.`,
      ),
    );
    botoes.append(duplicar);

    if (treino.status === 'planejado') {
      const pular = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Marcar como pulado');
      pular.addEventListener('click', () => acao(pular, () => pularTreino(treino.id), 'Treino marcado como pulado.'));
      botoes.append(pular);
    } else {
      const reabrir = h('button', { class: 'btn btn-secundario', type: 'button' }, treino.status === 'realizado' ? 'Desvincular da atividade' : 'Voltar para planejado');
      reabrir.addEventListener('click', () => acao(reabrir, () => desvincularTreino(treino.id), 'Treino voltou para planejado.'));
      botoes.append(reabrir);
    }

    const excluir = h('button', { class: 'btn btn-perigo', type: 'button' }, 'Excluir');
    excluir.addEventListener('click', () => {
      if (!confirm('Excluir este treino do plano?')) return;
      acao(excluir, () => excluirTreino(treino.id), 'Treino excluído.');
    });
    botoes.append(excluir);
  }

  form.append(botoes);
  return h('section', { class: 'card', id: 'editor-treino' }, h('h2', null, existente ? 'Editar treino' : 'Novo treino'), form);
}
