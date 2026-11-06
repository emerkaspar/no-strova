import { aceitarRascunho, aceitarRascunhoDaIa, descartarRascunhoDaIa } from '../../application/provas.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';
import { linkDosDiasDeTreino } from './diasDeTreino.js';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const rotuloDaData = (iso) => `${DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${formatarData(iso).slice(0, 5)}`;
const ROTULO_TIPO = Object.freeze({ longao: 'Longão', leve: 'Rodagem leve', intenso: 'Treino intenso', moderado: 'Treino moderado', ativacao: 'Soltura' });

const AVISO_RASCUNHO = 'Rascunho montado por regras a partir da sua preparação para o evento: revise antes de aceitar. Nada entra no plano sem a sua confirmação. Não substitui orientação de treinador.';

/**
 * Rascunho de treinos do plano anual (por regras ou vindo da IA), agrupado por semana, com os treinos marcáveis e os botões
 * Aceitar/Descartar. Compartilhado pelo cartão do plano anual e pelo painel de IA.
 * @param {{
 *   rascunho: { itens: any[], avisos: string[], porSemana: any[], marcados: Set<number>, ia?: { rascunhoId: string, resumo?: string, aviso: string }|null },
 *   prova: any, uid: string,
 *   obterContexto: () => { configs: any[], calibracao: any },
 *   aoAceitar: (quantidade: number) => void,
 *   aoDescartar: () => void
 * }} p
 */
export function desenharRascunhoAnual({ rascunho, prova, uid, obterContexto, aoAceitar, aoDescartar }) {
  const { itens, avisos, porSemana, marcados } = rascunho;
  const ia = rascunho.ia ?? null;
  const msg = areaMensagem();
  const botaoAceitar = h('button', { class: 'btn', type: 'button' });
  const botaoDescartar = h('button', { class: 'btn btn-secundario', type: 'button' }, itens.length > 0 ? 'Descartar' : 'Fechar');
  botaoDescartar.addEventListener('click', () => {
    // o rascunho da IA também é marcado como descartado no servidor (se falhar, só some da tela)
    if (ia) descartarRascunhoDaIa(ia.rascunhoId).catch(() => {});
    aoDescartar();
  });
  const atualizarBotao = () => {
    botaoAceitar.textContent = `Aceitar ${marcados.size} treino${marcados.size === 1 ? '' : 's'}`;
    botaoAceitar.disabled = marcados.size === 0;
  };
  atualizarBotao();
  botaoAceitar.addEventListener('click', async () => {
    const escolhidos = itens.filter((_, i) => marcados.has(i));
    if (!(await confirmar({ titulo: 'Adicionar ao plano?', mensagem: `${escolhidos.length} treino${escolhidos.length === 1 ? '' : 's'} do rascunho ${escolhidos.length === 1 ? 'entra' : 'entram'} no seu plano.`, confirmarTexto: 'Adicionar', tipo: 'info', icone: 'plano' }))) return;
    executarComBotao(botaoAceitar, msg, async () => {
      const { configs, calibracao } = obterContexto();
      if (ia) await aceitarRascunhoDaIa({ uid, rascunhoId: ia.rascunhoId, itens: escolhidos, configs, calibracao });
      else await aceitarRascunho({ uid, itens: escolhidos, configs, calibracao });
      aoAceitar(escolhidos.length);
    });
  });

  const semanas = [...new Set(itens.map((i) => i.semana))];
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // título do resultado: o que foi montado (ou por que não há nada a adicionar)
  const titulo =
    itens.length > 0
      ? h('p', { class: 'rascunho-titulo' }, `Rascunho: ${plural(itens.length, 'treino', 'treinos')} em ${plural(semanas.length, 'semana', 'semanas')}`)
      : null;

  // sem treinos: explica o motivo em vez de só dizer "nenhum treino"
  const vazio = itens.length === 0 ? estadoVazio(porSemana) : null;

  return h(
    'div',
    { class: 'ia-resultado rascunho-anual' },
    titulo,
    h('p', { class: 'rascunho-aviso' }, icone('info', 14), ia ? ia.aviso : AVISO_RASCUNHO),
    ia?.resumo ? h('p', { class: 'ia-resumo' }, ia.resumo) : null,
    vazio,
    itens.length > 0
      ? h(
          'div',
          null,
          ...semanas.map((inicio) => {
            const resumo = porSemana.find((s) => s.inicio === inicio);
            return h(
              'div',
              { class: 'anual-rascunho-semana' },
              h(
                'h4',
                null,
                `Semana de ${formatarData(inicio).slice(0, 5)}`,
                resumo ? h('small', { class: 'texto-secundario' }, ` · meta ${formatarNumero(resumo.cargaAlvo, 0)} · já no plano ${formatarNumero(resumo.existente, 0)} · rascunho +${formatarNumero(resumo.rascunho, 0)}`) : null,
              ),
              h(
                'ul',
                { class: 'ia-itens' },
                ...itens.map((it, i) =>
                  it.semana !== inicio
                    ? null
                    : h(
                        'li',
                        { class: 'ia-item' },
                        h('input', {
                          type: 'checkbox',
                          checked: marcados.has(i),
                          'aria-label': `Incluir ${ROTULO_TIPO[it.tipo]} em ${rotuloDaData(it.data)}`,
                          onChange: (e) => {
                            if (e.target.checked) marcados.add(i);
                            else marcados.delete(i);
                            atualizarBotao();
                          },
                        }),
                        h('span', { class: 'ia-item-data' }, rotuloDaData(it.data)),
                        h('span', { class: 'ia-item-treino' }, icone(prova.esporte === 'ciclismo' ? 'ciclismo' : 'corrida', 16), h('strong', null, it.modelo?.nome ?? ROTULO_TIPO[it.tipo]), h('span', { class: 'texto-secundario' }, ` · ${it.entrada.duracaoMin} min · ${it.entrada.zona} · carga ~${formatarNumero(it.estresse, 0)}`)),
                        h('span', { class: 'ia-item-motivo texto-secundario' }, it.motivo),
                      ),
                ),
              ),
            );
          }),
        )
      : null,
    // observações do gerador: úteis, mas não precisam disputar a atenção com o resultado
    avisos.length > 0
      ? h('details', { class: 'rascunho-obs' }, h('summary', null, `Observações sobre o rascunho (${avisos.length})`), h('ul', { class: 'ia-avisos' }, ...avisos.map((a) => h('li', null, a))))
      : null,
    h('div', { class: 'linha-botoes' }, itens.length > 0 ? botaoAceitar : null, botaoDescartar),
    msg.el,
  );
}

/** Estado "nada a adicionar": mostra a situação de cada semana (meta × o que já está no plano) e o que fazer. */
function estadoVazio(porSemana) {
  const comTreinos = porSemana.some((s) => s.existente > 0);
  if (!comTreinos) {
    return h(
      'div',
      { class: 'rascunho-vazio' },
      h('strong', null, 'Não há dias livres para sugerir treinos.'),
      h('p', { class: 'texto-secundario' }, 'Confira os seus ', linkDosDiasDeTreino(), ' e veja se há uma data de evento muito próxima.'),
    );
  }
  return h(
    'div',
    { class: 'rascunho-vazio' },
    h('strong', null, 'Nada a adicionar: as próximas semanas já estão cobertas.'),
    h('p', { class: 'texto-secundario' }, 'O que você já fez ou planejou atende a meta de carga, ou não sobraram dias livres nos seus dias de treino. Para montar de novo, exclua treinos planejados no calendário ou mude os ', linkDosDiasDeTreino(), '.'),
    h(
      'ul',
      { class: 'rascunho-vazio-semanas' },
      ...porSemana.map((s) => h('li', null, h('span', null, `Semana de ${formatarData(s.inicio).slice(0, 5)}`), h('span', { class: 'texto-secundario' }, `meta ${formatarNumero(s.cargaAlvo, 0)} · já no plano ${formatarNumero(s.existente, 0)}`))),
    ),
  );
}
