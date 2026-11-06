import { diasEntre, formatarTempoDaProva, PRIORIDADES_PROVA, provasFuturas } from '@no-strova/domain';
import { salvarProva } from '../../application/provas.js';
import { excluirProva } from '../../infrastructure/provasRepo.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarForma, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';

const ESPORTES = Object.freeze({ ciclismo: 'Ciclismo', corrida: 'Corrida', outro: 'Outro' });

/** "faltam 12 dias", "é amanhã", "é hoje". */
export function textoDeProximidade(diasAte) {
  if (diasAte <= 0) return 'é hoje';
  if (diasAte === 1) return 'é amanhã';
  if (diasAte < 14) return `faltam ${diasAte} dias`;
  const semanas = Math.round(diasAte / 7);
  return `faltam ${semanas} semanas`;
}

/**
 * Cartão "Eventos": lista os próximos eventos (A/B/C) e tem o formulário para criar e editar. É criado uma vez por tela e
 * redesenhado por `atualizar`, para o formulário não perder o que o usuário digitou quando chegam dados novos.
 * @param {{ uid: string, hoje: string }} p
 */
export function criarCartaoProvas({ uid, hoje }) {
  let provas = [];
  let editando = null;
  let aberto = false;

  const nome = campo({ id: 'prova-nome', rotulo: 'Nome do evento', maxlength: '60', autocomplete: 'off', placeholder: 'ex.: Meia Maratona de Porto Alegre' });
  const data = campo({ id: 'prova-data', rotulo: 'Data', tipo: 'date', min: hoje });
  const esporte = selecao({ id: 'prova-esporte', rotulo: 'Esporte', valor: 'corrida', opcoes: Object.entries(ESPORTES).map(([valor, rotulo]) => ({ valor, rotulo })) });
  const prioridade = selecao({
    id: 'prova-prioridade',
    rotulo: 'Prioridade',
    valor: 'A',
    opcoes: Object.entries(PRIORIDADES_PROVA).map(([valor, p]) => ({ valor, rotulo: p.rotulo })),
    dica: 'A é o objetivo da temporada: a preparação faz você chegar descansado nele.',
  });
  const distancia = campo({ id: 'prova-distancia', rotulo: 'Distância (km, opcional)', inputmode: 'decimal', autocomplete: 'off' });
  const metaTempo = campo({ id: 'prova-tempo', rotulo: 'Meta de tempo (opcional)', autocomplete: 'off', placeholder: '1:45:00', dica: 'h:mm:ss ou mm:ss' });
  const local = campo({ id: 'prova-local', rotulo: 'Local (opcional)', maxlength: '80', autocomplete: 'off' });
  const formaAlvo = campo({ id: 'prova-forma', rotulo: 'Forma-alvo (opcional)', inputmode: 'decimal', autocomplete: 'off', dica: 'Ex.: +10 para chegar descansado. Guia o polimento da preparação.' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Salvar evento');
  const cancelar = h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => definirAberto(false) }, 'Cancelar');
  const botaoNova = h('button', { class: 'btn', type: 'button', onClick: () => (aberto && !editando ? definirAberto(false) : abrirNova()) });
  // avisos que precisam aparecer com o formulário fechado (prova salva, erro ao excluir)
  const aviso = areaMensagem();
  const titulo = h('h3', { class: 'prova-form-titulo' }, 'Novo evento');
  const lista = h('div');

  function definirAberto(valor) {
    aberto = valor;
    form.hidden = !aberto;
    botaoNova.textContent = aberto && !editando ? 'Fechar' : '+ Novo evento';
    botaoNova.className = aberto && !editando ? 'btn btn-secundario' : 'btn';
    botaoNova.setAttribute('aria-expanded', String(aberto && !editando));
    if (!aberto) iniciarEdicao(null, { manterFechado: true });
  }

  function abrirNova() {
    iniciarEdicao(null);
    definirAberto(true);
    nome.input.focus?.({ preventScroll: true });
    nome.input.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  function iniciarEdicao(prova, { manterFechado = false } = {}) {
    editando = prova;
    mensagem.limpar();
    aviso.limpar();
    titulo.textContent = prova ? 'Editar evento' : 'Novo evento';
    botao.textContent = prova ? 'Salvar alterações' : 'Salvar evento';
    nome.input.value = prova?.nome ?? '';
    data.input.value = prova?.data ?? '';
    esporte.select.value = prova?.esporte ?? 'corrida';
    prioridade.select.value = prova?.prioridade ?? 'A';
    distancia.input.value = prova?.distanciaKm ? String(prova.distanciaKm).replace('.', ',') : '';
    metaTempo.input.value = prova?.metaTempoS ? formatarTempoDaProva(prova.metaTempoS) : '';
    local.input.value = prova?.local ?? '';
    formaAlvo.input.value = Number.isFinite(prova?.formaAlvo) ? String(prova.formaAlvo).replace('.', ',') : '';
    if (!manterFechado) definirAberto(Boolean(prova) || aberto);
    if (prova) nome.input.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  const form = h(
    'form',
    {
      class: 'prova-form',
      hidden: true,
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          await salvarProva({
            uid,
            id: editando?.id,
            hoje,
            entrada: {
              nome: nome.input.value,
              data: data.input.value,
              esporte: esporte.select.value,
              prioridade: prioridade.select.value,
              distanciaKm: distancia.input.value,
              metaTempo: metaTempo.input.value,
              local: local.input.value,
              formaAlvo: formaAlvo.input.value,
            },
          });
          definirAberto(false);
          aviso.mostrar('Evento salvo.', 'ok');
        });
      },
    },
    titulo,
    h('div', { class: 'grid' }, nome.raiz, data.raiz, esporte.raiz, prioridade.raiz, distancia.raiz, metaTempo.raiz, local.raiz, formaAlvo.raiz),
    mensagem.el,
    h('div', { class: 'linha-botoes' }, botao, cancelar),
  );

  function desenharLista() {
    const futuras = provasFuturas(provas, hoje);
    if (futuras.length === 0) {
      lista.replaceChildren(h('p', { class: 'texto-secundario' }, 'Nenhum evento cadastrado. Cadastre o evento-alvo da temporada (prioridade A) para gerar a preparação.'));
      return;
    }
    lista.replaceChildren(
      h(
        'ul',
        { class: 'provas-lista' },
        ...futuras.map((p) => {
          const detalhes = [
            ESPORTES[p.esporte],
            p.distanciaKm ? `${formatarNumero(p.distanciaKm, p.distanciaKm % 1 === 0 ? 0 : 1)} km` : null,
            p.metaTempoS ? `meta ${formatarTempoDaProva(p.metaTempoS)}` : null,
            p.local,
            Number.isFinite(p.formaAlvo) ? `Forma-alvo ${formatarForma(p.formaAlvo, 1)}` : null,
          ].filter(Boolean);
          return h(
            'li',
            { class: 'prova-item' },
            h('span', { class: `prova-prioridade prova-${p.prioridade}`, title: PRIORIDADES_PROVA[p.prioridade]?.rotulo, 'aria-label': `Prioridade ${p.prioridade}` }, p.prioridade),
            h(
              'div',
              { class: 'prova-dados' },
              h('strong', null, icone(p.esporte === 'corrida' ? 'corrida' : 'ciclismo', 16), ' ', p.nome),
              h('span', { class: 'texto-secundario' }, `${formatarData(p.data)} · ${textoDeProximidade(diasEntre(hoje, p.data))}`),
              h('span', { class: 'texto-secundario' }, detalhes.join(' · ')),
            ),
            h(
              'div',
              { class: 'linha-botoes' },
              h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => iniciarEdicao(p) }, 'Editar'),
              h(
                'button',
                {
                  class: 'btn btn-secundario',
                  type: 'button',
                  onClick: async () => {
                    if (!(await confirmar({ titulo: 'Excluir este evento?', mensagem: `“${p.nome}” será apagado do seu calendário de eventos.`, confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
                    try {
                      await excluirProva(p.id);
                      if (editando?.id === p.id) definirAberto(false);
                    } catch {
                      aviso.mostrar('Não foi possível excluir o evento.');
                    }
                  },
                },
                'Excluir',
              ),
            ),
          );
        }),
      ),
    );
  }

  desenharLista();
  const el = h(
    'section',
    { class: 'card', id: 'provas' },
    h('div', { class: 'prog-secao-topo' }, h('h2', null, 'Eventos'), botaoNova),
    h('p', { class: 'texto-secundario' }, 'Cadastre os seus eventos com prioridade A (principal), B (importante) ou C (treino). A preparação usa o evento A mais próximo.'),
    aviso.el,
    form,
    lista,
  );
  definirAberto(false);

  return {
    el,
    /** Abre o formulário de um novo evento e leva o foco ao nome (usado pelo botão "Novo evento" do Plano). */
    abrirNova,
    atualizar(novas) {
      provas = novas;
      // a prova em edição pode ter sido apagada em outro lugar
      if (editando && !provas.some((p) => p.id === editando.id)) definirAberto(false);
      desenharLista();
    },
  };
}
