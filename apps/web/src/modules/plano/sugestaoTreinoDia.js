import { AVISO_IA, modeloPorId } from '@no-strova/domain';
import { aceitarTreinosDaIa, descartarRascunho, pedirTreinoUnicoDaIa } from '../../application/ia.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal } from '../../utils/modal.js';

/**
 * "+" do calendário → IA: pede UM treino para o dia (a IA olha a carga e o sentimento recente) e mostra o resultado num modal,
 * onde o usuário aceita (entra no plano) ou descarta.
 * @param {{ uid: string, data: string, configs: any[], aoAceitar?: (texto: string) => void }} p
 */
export async function abrirSugestaoDeTreinoDoDia({ uid, data, configs, aoAceitar = () => {} }) {
  const mensagem = areaMensagem();
  const corpo = h('div', { class: 'ia-resultado' });
  const rodape = h('div', { class: 'linha-botoes' });
  let rascunhoId = null;
  let fecharModal = () => {};

  const botaoFechar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fecharModal() }, 'Cancelar');
  rodape.append(botaoFechar);
  corpo.append(h('p', { class: 'texto-secundario', role: 'status' }, 'A IA está avaliando sua carga e como você tem se sentido… pode levar alguns segundos.'));

  function mostrar({ rascunhoId: id, saida }) {
    rascunhoId = id;
    const it = saida.itens[0];
    const botaoAceitar = h('button', { class: 'btn', type: 'button' }, 'Adicionar ao plano');
    const botaoDescartar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Descartar');
    botaoAceitar.addEventListener('click', () =>
      executarComBotao(botaoAceitar, mensagem, async () => {
        await aceitarTreinosDaIa({ uid, rascunhoId: id, itens: [{ modelo: modeloPorId(it.modeloId), data: it.data }], configs });
        rascunhoId = null;
        aoAceitar(`${it.nome} adicionado ao plano em ${formatarData(it.data)}.`);
        fecharModal();
      }),
    );
    botaoDescartar.addEventListener('click', () =>
      executarComBotao(botaoDescartar, mensagem, async () => {
        await descartarRascunho(id);
        rascunhoId = null;
        fecharModal();
      }),
    );
    corpo.replaceChildren(
      h('p', { class: 'ia-aviso' }, icone('ia', 14), AVISO_IA),
      h(
        'p',
        { class: 'ia-item-treino' },
        icone(it.esporte === 'corrida' ? 'corrida' : 'ciclismo', 16),
        h('strong', null, it.nome),
        h('span', { class: 'texto-secundario' }, ` · ${it.duracaoMin} min · carga ~${it.estresse}`),
      ),
      it.motivo ? h('p', { class: 'ia-resumo' }, it.motivo) : null,
      saida.avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...saida.avisos.map((a) => h('li', null, a))) : null,
    );
    rodape.replaceChildren(botaoAceitar, botaoDescartar);
  }

  const janela = abrirModal({
    classe: 'modal-ia-dia',
    rotulo: 'Sugestão de treino com IA',
    conteudo: (fechar) => {
      fecharModal = () => fechar();
      return h('div', { class: 'pilha' }, h('h2', { class: 'titulo-bloco' }, `Treino sugerido para ${formatarData(data)}`), corpo, mensagem.el, rodape);
    },
  });

  try {
    mostrar(await pedirTreinoUnicoDaIa({ data }));
  } catch (err) {
    corpo.replaceChildren(h('p', { class: 'mensagem mensagem-erro', role: 'alert' }, err.message || 'Não foi possível gerar a sugestão agora.'));
    rodape.replaceChildren(botaoFechar);
  }
  await janela;
  // fechou sem decidir: o rascunho fica pendente; marcar como descartado mantém o histórico limpo
  if (rascunhoId) descartarRascunho(rascunhoId).catch(() => {});
}
