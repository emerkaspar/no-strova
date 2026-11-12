import { somarDias } from '@no-strova/domain';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { confirmar } from '../../utils/modal.js';
import { rotuloDoDia } from '../inicio/graficoPrincipal.js';
import { linkDosDiasDeTreino } from '../plano/diasDeTreino.js';
import { abrirSugestaoDeTreinoDoDia } from '../plano/sugestaoTreinoDia.js';

/** Quantos dias à frente o "incluir treino por IA" oferece. */
const DIAS_A_FRENTE = 14;

/** Dias de hoje em diante (até `DIAS_A_FRENTE`) sem treino planejado nem realizado. */
export function diasLivres(treinos, hoje) {
  const ocupados = new Set(treinos.filter((t) => t.status === 'planejado' || t.status === 'realizado').map((t) => t.data));
  const livres = [];
  for (let i = 0; i <= DIAS_A_FRENTE; i += 1) {
    const d = somarDias(hoje, i);
    if (!ocupados.has(d)) livres.push(d);
  }
  return livres;
}

function resumoDaSemana(semana) {
  if (!semana) {
    return h('p', { class: 'texto-secundario' }, 'A IA ainda não montou nenhuma semana para você. A próxima rodada é no domingo, às 20h; você recebe um push com o resumo.');
  }
  if (semana.status === 'falhou') {
    return h('p', { class: 'mensagem mensagem-aviso' }, semana.erro || 'Não foi possível montar a semana na última rodada. Você pode incluir treinos por IA abaixo.');
  }
  if (semana.status === 'sem-treinos') {
    return h('p', { class: 'texto-secundario' }, `Na rodada de ${formatarData(somarDias(semana.inicio, -1))} nenhum treino passou pelas regras de segurança, então a semana ficou sem treinos criados.`);
  }
  const itens = Array.isArray(semana.itens) ? [...semana.itens].sort((a, b) => (a.data < b.data ? -1 : 1)) : [];
  return h(
    'div',
    { class: 'pilha semana-ia-resumo' },
    h('h3', { class: 'titulo-bloco' }, `Semana de ${formatarData(semana.inicio)} a ${formatarData(semana.fim)}`),
    semana.resumo ? h('p', { class: 'ia-resumo' }, semana.resumo) : null,
    itens.length > 0
      ? h(
          'ul',
          { class: 'semana-ia-lista' },
          ...itens.map((i) =>
            h('li', null, h('strong', null, rotuloDoDia(i.data)), ` · ${i.nome}`, h('span', { class: 'texto-secundario' }, ` · ${i.duracaoMin} min`), i.motivo ? h('p', { class: 'texto-secundario' }, i.motivo) : null),
          ),
        )
      : null,
    Array.isArray(semana.consideracoes) && semana.consideracoes.length > 0
      ? h('div', null, h('strong', null, 'O que a IA levou em conta'), h('ul', { class: 'semana-ia-lista' }, ...semana.consideracoes.map((c) => h('li', null, c))))
      : null,
  );
}

/**
 * Corpo da seção "Esta semana" para quem liga "Montar minha semana com IA": o aviso explícito de que os treinos são criados
 * automaticamente, o resumo da última rodada, a inclusão de um treino por IA num dia livre e, atrás de uma confirmação, a
 * liberação das sugestões manuais.
 * @param {{ uid: string, hoje: string, semana: any, treinos: any[], configs: any[], proprios: any[], liberada: boolean, aoLiberar: () => void, aoMudar: () => void }} p
 */
export function criarPainelSemanaAutomatica({ uid, hoje, semana, treinos, configs, proprios, liberada, aoLiberar, aoMudar }) {
  const mensagem = areaMensagem();
  const livres = diasLivres(treinos, hoje);

  const aviso = h(
    'div',
    { class: 'semana-ia-aviso', role: 'note' },
    icone('ia', 18),
    h(
      'div',
      null,
      h('strong', null, 'Seus treinos desta semana são criados automaticamente pela IA.'),
      h(
        'p',
        { class: 'texto-secundario' },
        'Todo domingo às 20h ela analisa seus últimos treinos, como você se sentiu e o seu nível, e cria a semana seguinte nos seus dias de treino. Você pode trocar, mover ou excluir qualquer treino no Plano. ',
        linkDosDiasDeTreino('Desligar ou ajustar no Perfil de treino'),
      ),
    ),
  );

  let incluir;
  if (livres.length === 0) {
    incluir = h('p', { class: 'texto-secundario' }, `Todos os próximos ${DIAS_A_FRENTE} dias já têm treino.`);
  } else {
    const escolha = seletor({ id: 'semana-ia-dia', rotulo: 'Dia sem treino', opcoes: livres.map((d) => ({ valor: d, rotulo: rotuloDoDia(d) })), valor: livres[0] });
    const botao = h('button', { class: 'btn', type: 'button' }, 'Sugerir treino com IA');
    botao.addEventListener('click', () =>
      abrirSugestaoDeTreinoDoDia({
        uid,
        data: escolha.value || livres[0],
        configs,
        modelos: proprios,
        aoAceitar: (texto) => {
          mensagem.mostrar(texto, 'ok');
          aoMudar();
        },
      }),
    );
    incluir = h('div', { class: 'linha-botoes semana-ia-incluir' }, escolha, botao);
  }

  const liberar = liberada
    ? h('p', { class: 'mensagem mensagem-aviso' }, 'Você liberou as sugestões manuais. Elas não levam em conta os treinos criados pela IA: confira os dias antes de adicionar.')
    : h(
        'button',
        {
          class: 'btn btn-secundario',
          type: 'button',
          onClick: async () => {
            const ok = await confirmar({
              titulo: 'Ver as sugestões manuais?',
              mensagem: 'Os treinos desta semana já são criados automaticamente pela IA. As sugestões manuais podem repetir ou conflitar com eles. Quer ver mesmo assim?',
              confirmarTexto: 'Ver sugestões',
              tipo: 'aviso',
              icone: 'ia',
            });
            if (ok) aoLiberar();
          },
        },
        'Ver sugestões manuais mesmo assim',
      );

  return h(
    'div',
    { class: 'pilha', id: 'semana-automatica' },
    aviso,
    resumoDaSemana(semana),
    h('div', { class: 'pilha' }, h('h3', { class: 'titulo-bloco' }, 'Incluir um treino por IA'), h('p', { class: 'texto-secundario' }, 'Escolha um dia livre e a IA sugere um treino pela sua carga e pelo seu sentimento recente. Nada entra no plano sem a sua aprovação.'), incluir),
    mensagem.el,
    liberar,
  );
}
