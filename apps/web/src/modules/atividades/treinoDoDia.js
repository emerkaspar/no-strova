import { desvincularTreino, lerTreinoDaAtividade, lerTreinosDoDia, vincularTreino } from '../../infrastructure/planoRepo.js';
import { h } from '../../utils/dom.js';
import { icone } from '../../utils/icones.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';
import { ROTULO_ESPORTE } from './textos.js';

/** Aviso global de que o vínculo de uma atividade mudou: o detalhe da atividade recarrega a comparação. */
export const EVENTO_VINCULO = 'no-strova:vinculo-do-treino';

const nomeDoTreino = (t) => t.nomeTreino || `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.duracaoMin}min · ${t.zona}`;
const temPassos = (t) => Array.isArray(t.passos) && t.passos.length > 0;

function cartaoDoTreino(t, acao) {
  return h(
    'div',
    { class: 'fb-treino' },
    temPassos(t) ? h('div', { class: 'fb-treino-perfil' }, perfilDoTreino(t.passos, { altura: 44 })) : h('span', { class: 'fb-treino-icone', 'aria-hidden': 'true' }, icone(t.esporte, 26)),
    h('div', { class: 'fb-treino-texto' }, h('strong', null, nomeDoTreino(t)), h('small', null, `${temPassos(t) ? 'Intervalado' : 'Treino livre'} · ${t.duracaoMin} min · ${t.zona}`)),
    acao,
  );
}

/**
 * Seção do modal "Como foi?": mostra, em destaque, o treino planejado para o dia da atividade e deixa vincular com um toque.
 * Fica escondida enquanto carrega e quando não há o que mostrar (sem treino no dia e sem vínculo).
 * O vínculo é gravado na hora (`status: realizado` + `atividadeId`), sem esperar o botão Salvar do modal.
 *
 * @param {{ atividade: { id: string, data: string, esporte: string }, uid: string }} p
 * @returns {HTMLElement}
 */
export function criarSecaoTreinoDoDia({ atividade, uid }) {
  const raiz = h('section', { class: 'fb-secao fb-treino-secao', hidden: true });
  let vinculado = null;
  let candidatos = [];

  function avisar() {
    window.dispatchEvent(new CustomEvent(EVENTO_VINCULO, { detail: { atividadeId: atividade.id } }));
  }

  async function executar(botao, acao) {
    botao.disabled = true;
    const original = botao.textContent;
    try {
      await acao();
      avisar();
    } catch {
      botao.disabled = false;
      botao.textContent = original;
      raiz.append(h('p', { class: 'mensagem mensagem-erro', role: 'alert' }, 'Não foi possível salvar o vínculo. Tente novamente.'));
    }
  }

  function desenhar() {
    raiz.querySelectorAll('.mensagem-erro').forEach((n) => n.remove());
    if (vinculado) {
      const desfazer = h('button', { type: 'button', class: 'btn btn-secundario' }, 'Desvincular');
      desfazer.addEventListener('click', () =>
        executar(desfazer, async () => {
          await desvincularTreino(vinculado.id);
          candidatos = [{ ...vinculado, status: 'planejado', atividadeId: null }, ...candidatos];
          vinculado = null;
          desenhar();
        }),
      );
      raiz.replaceChildren(
        h('h3', { class: 'fb-secao-titulo' }, 'Treino do plano'),
        cartaoDoTreino(vinculado, desfazer),
        h('p', { class: 'fb-treino-ok' }, h('span', { 'aria-hidden': 'true' }, icone('ok', 14)), temPassos(vinculado) ? ' Vinculado. A comparação passo a passo fica no detalhe da atividade.' : ' Vinculado ao treino planejado.'),
      );
      raiz.hidden = false;
      return;
    }
    if (candidatos.length === 0) {
      raiz.hidden = true;
      return;
    }
    raiz.replaceChildren(
      h('h3', { class: 'fb-secao-titulo' }, candidatos.length === 1 ? 'Você tinha este treino planejado' : 'Você tinha estes treinos planejados'),
      ...candidatos.map((t) => {
        const botao = h('button', { type: 'button', class: 'btn' }, 'Foi este treino');
        botao.addEventListener('click', () =>
          executar(botao, async () => {
            await vincularTreino(t.id, atividade.id);
            vinculado = { ...t, status: 'realizado', atividadeId: atividade.id };
            candidatos = candidatos.filter((c) => c.id !== t.id);
            desenhar();
          }),
        );
        return cartaoDoTreino(t, botao);
      }),
      h('p', { class: 'fb-treino-dica' }, 'Vincular compara o planejado com o que você fez e tira o treino das pendências do Plano.'),
    );
    raiz.hidden = false;
  }

  Promise.all([lerTreinoDaAtividade(uid, atividade.id), lerTreinosDoDia(uid, atividade.data)]).then(
    ([jaVinculado, doDia]) => {
      vinculado = jaVinculado;
      // o mesmo esporte da atividade vem primeiro; só entra o que ainda não foi feito nem vinculado
      candidatos = doDia
        .filter((t) => t.status === 'planejado' && !t.atividadeId)
        .sort((x, y) => Number(y.esporte === atividade.esporte) - Number(x.esporte === atividade.esporte));
      desenhar();
    },
    () => {}, // sem a consulta, o modal segue sem a seção
  );

  return raiz;
}
