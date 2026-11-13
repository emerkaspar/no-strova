import { AVISO_IA, modeloPorId } from '@no-strova/domain';
import { carregarModelosProprios } from '../../application/modelos.js';
import { aceitarTreinosDaIa, descartarRascunho, pedirTreinoUnicoDaIa } from '../../application/ia.js';
import { salvarModeloProprio } from '../../application/treinos.js';
import { lerTrajetos } from '../../infrastructure/trajetosRepo.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal } from '../../utils/modal.js';

/**
 * "+" do calendário → IA: o modal pergunta o tempo de treino (opcional; sem ele a IA decide), pede UM treino para o dia
 * (a IA olha a carga e o sentimento recente) e mostra o resultado, onde o usuário aceita (entra no plano) ou descarta.
 * A IA busca um treino de duração aproximada e o resultado traz avisos se a carga ficou alta ou baixa demais.
 * A IA também pode escolher entre os treinos próprios do usuário (`modelos`); quem não os tem à mão deixa `modelos` vazio
 * (null) e eles são lidos ao aceitar, para o treino escolhido ser sempre encontrado.
 * @param {{ uid: string, data: string, configs: any[], modelos?: any[], aoAceitar?: (texto: string) => void }} p
 */
export async function abrirSugestaoDeTreinoDoDia({ uid, data, configs, modelos = null, aoAceitar = () => {} }) {
  const mensagem = areaMensagem();
  const corpo = h('div', { class: 'ia-resultado' });
  const rodape = h('div', { class: 'linha-botoes' });
  let rascunhoId = null;
  let fecharModal = () => {};

  const botaoFechar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fecharModal() }, 'Cancelar');
  // tempo em horas e minutos (3 h 30 min sem calculadora) e atalhos para os tempos mais comuns
  const horasEl = h('input', { id: 'ia-dia-horas', style: 'width:96px', type: 'number', inputmode: 'numeric', min: '0', max: '6', step: '1', placeholder: '0', 'aria-label': 'Horas' });
  const minutosEl = h('input', { id: 'ia-dia-minutos', style: 'width:96px', type: 'number', inputmode: 'numeric', min: '0', max: '59', step: '5', placeholder: '0', 'aria-label': 'Minutos' });
  const totalMin = () => (Number(horasEl.value) || 0) * 60 + (Number(minutosEl.value) || 0);
  const definirTotal = (min) => {
    horasEl.value = min >= 60 ? String(Math.floor(min / 60)) : '';
    minutosEl.value = min % 60 > 0 ? String(min % 60) : '';
  };
  const ATALHOS = [30, 45, 60, 90, 120, 180, 240];
  const rotuloAtalho = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`);
  const tempo = {
    raiz: h(
      'div',
      { class: 'campo' },
      h('label', { for: 'ia-dia-horas' }, 'Quanto tempo você quer treinar? (opcional)'),
      h('div', { class: 'linha-botoes', style: 'align-items:center' }, horasEl, h('span', null, 'h'), minutosEl, h('span', null, 'min')),
      h('div', { class: 'linha-botoes', style: 'flex-wrap:wrap;margin-top:8px' }, ...ATALHOS.map((m) => h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => definirTotal(m) }, rotuloAtalho(m)))),
      h('small', { class: 'dica' }, 'Deixe em branco e a IA indica o treino ideal para o seu momento. Com tempo informado, ela busca um treino de duração próxima e avisa se a carga ficar alta ou baixa demais.'),
    ),
    input: horasEl,
  };
  // trajeto (opcional): a IA leva o terreno em conta e, se nenhum treino servir, cria um novo sob medida
  const trajetoEl = h('select', { id: 'ia-dia-trajeto', disabled: true }, h('option', { value: '' }, 'Sem trajeto específico'));
  const trajeto = {
    raiz: h(
      'div',
      { class: 'campo' },
      h('label', { for: 'ia-dia-trajeto' }, 'Em qual trajeto? (opcional)'),
      trajetoEl,
      h('small', { class: 'dica' }, 'Com um trajeto, a IA considera o terreno dele e, se nenhum treino seu combinar com o dia, cria um novo adaptado ao trajeto, olhando também o que você já fez e os treinos já marcados nos próximos dias.'),
    ),
  };
  lerTrajetos(uid)
    .then((lista) => {
      const validos = lista.filter((t) => t.esporte === 'ciclismo' || t.esporte === 'corrida');
      if (validos.length === 0) {
        trajeto.raiz.remove();
        return;
      }
      for (const t of validos) trajetoEl.append(h('option', { value: t.id }, `${t.nome} · ${t.esporte === 'corrida' ? 'corrida' : 'ciclismo'}`));
      trajetoEl.disabled = false;
    })
    .catch(() => trajeto.raiz.remove());
  const botaoPedir = h('button', { class: 'btn', type: 'button' }, icone('ia', 16), ' Pedir treino à IA');
  corpo.append(tempo.raiz, trajeto.raiz);
  rodape.append(botaoPedir, botaoFechar);

  function mostrar({ rascunhoId: id, saida }) {
    rascunhoId = id;
    const it = saida.itens[0];
    const botaoAceitar = h('button', { class: 'btn', type: 'button' }, 'Adicionar ao plano');
    const botaoDescartar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Descartar');
    botaoAceitar.addEventListener('click', () =>
      executarComBotao(botaoAceitar, mensagem, async () => {
        let modelo;
        if (it.novoTreino) {
          // treino novo criado pela IA para o trajeto: entra em "Meus treinos" e depois no plano
          const novoId = await salvarModeloProprio({ uid, entrada: it.novoTreino });
          modelo = { ...it.novoTreino, id: novoId, origem: 'proprio' };
        } else {
          const proprios = modelos ?? (await carregarModelosProprios(uid));
          modelo = modeloPorId(it.modeloId, proprios);
        }
        await aceitarTreinosDaIa({ uid, rascunhoId: id, itens: [{ modelo, data: it.data }], configs });
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
      ...[
      h('p', { class: 'ia-aviso' }, icone('ia', 14), AVISO_IA),
      h(
        'p',
        { class: 'ia-item-treino' },
        icone(it.esporte === 'corrida' ? 'corrida' : 'ciclismo', 16),
        h('strong', null, it.nome),
        h('span', { class: 'texto-secundario' }, ` · ${it.duracaoMin} min · carga ~${it.estresse}`),
      ),
      it.trajetoNome
        ? h(
            'p',
            { class: 'texto-secundario' },
            `Trajeto: ${it.trajetoNome}`,
            it.voltas > 1 ? h('strong', null, ` · ${it.voltas} voltas`) : null,
            it.novoTreino ? ' · treino novo criado pela IA' : '',
          )
        : null,
      it.motivo ? h('p', { class: 'ia-resumo' }, it.motivo) : null,
      saida.avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...saida.avisos.map((a) => h('li', null, a))) : null,
      ].filter(Boolean),
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

  async function pedir() {
    const total = totalMin();
    const duracaoMin = total === 0 ? null : total;
    if (duracaoMin !== null && (duracaoMin < 15 || duracaoMin > 360)) {
      mensagem.mostrar('Informe um tempo entre 15 min e 6 h, ou deixe em branco para a IA sugerir.', 'erro');
      return;
    }
    mensagem.limpar();
    corpo.replaceChildren(h('p', { class: 'texto-secundario', role: 'status' }, 'A IA está avaliando sua carga e como você tem se sentido… pode levar alguns segundos.'));
    rodape.replaceChildren(botaoFechar);
    try {
      mostrar(await pedirTreinoUnicoDaIa({ data, duracaoMin: duracaoMin === null ? null : Math.round(duracaoMin), trajetoId: trajetoEl.value || null }));
    } catch (err) {
      corpo.replaceChildren(h('p', { class: 'mensagem mensagem-erro', role: 'alert' }, err.message || 'Não foi possível gerar a sugestão agora.'));
      rodape.replaceChildren(botaoFechar);
    }
  }
  botaoPedir.addEventListener('click', pedir);
  for (const el of [horasEl, minutosEl]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        pedir();
      }
    });
  }
  await janela;
  // fechou sem decidir: o rascunho fica pendente; marcar como descartado mantém o histórico limpo
  if (rascunhoId) descartarRascunho(rascunhoId).catch(() => {});
}
