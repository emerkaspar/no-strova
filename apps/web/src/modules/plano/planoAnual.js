import { FASES, formatarTempoDaProva, LIMITES_IA_PLANO_ANUAL, PRIORIDADES_PROVA, provaDoPlano, provasFuturas, RECURSOS, temRecurso } from '@no-strova/domain';
import { restantesDaIa } from '../../application/ia.js';
import { aceitarRascunho, aceitarRascunhoDaIa, definirMetaDeFormaDaProva, descartarRascunhoDaIa, montarPlanoAnual, montarRascunho, pedirRascunhoAnualDaIa } from '../../application/provas.js';
import { obterSessao } from '../../application/sessao.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { formatarData, formatarForma, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const rotuloDaData = (iso) => `${DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${formatarData(iso).slice(0, 5)}`;
const ROTULO_TIPO = Object.freeze({ longao: 'Longão', leve: 'Rodagem leve', intenso: 'Treino intenso', moderado: 'Treino moderado', ativacao: 'Soltura' });

const AVISO_RASCUNHO = 'Rascunho montado por regras a partir do seu plano anual: revise antes de aceitar. Nada entra no plano sem a sua confirmação. Não substitui orientação de treinador.';

/**
 * Cartão "Plano anual": semanas, fases e carga-alvo até a prova, e o rascunho de treinos das próximas semanas. É criado
 * uma vez por tela (guarda a prova escolhida e o rascunho aberto) e redesenhado por `atualizar`.
 * @param {{ uid: string, hoje: string, aoAceitar?: () => void }} p
 */
export function criarCartaoPlanoAnual({ uid, hoje, aoAceitar = () => {} }) {
  let ctx = null; // { provas, dias, treinos, configs, calibracao, modelos, preferencias, metasForma }
  let provaId = null;
  let rascunho = null; // { itens, avisos, porSemana, marcados:Set, ia?: { rascunhoId, resumo, aviso, restantes } }
  // a IA só aparece para quem o administrador liberou (o servidor confere de novo em cada pedido)
  const comIa = temRecurso(obterSessao().perfil, RECURSOS.IA);
  let restantesIa; // chamadas de IA que restam hoje: undefined = ainda não sabemos; null = sem limite
  const textoDasRestantes = () => (restantesIa === undefined ? '' : restantesIa === null ? 'Sem limite de sugestões de IA por dia.' : `Restam ${restantesIa} sugest${restantesIa === 1 ? 'ão' : 'ões'} de IA hoje (limite definido pelo administrador, somando as sugestões de treino).`);
  const observacaoIa = comIa ? campo({ id: 'anual-ia-obs', rotulo: 'Observação para a IA (opcional)', maxlength: String(LIMITES_IA_PLANO_ANUAL.observacaoMax), placeholder: 'ex.: viajo na semana 2; joelho sensível; prefiro treinar forte no sábado', autocomplete: 'off' }) : null;
  const mensagem = areaMensagem();
  const corpo = h('div');

  function provaEscolhida() {
    const futuras = provasFuturas(ctx.provas, hoje);
    return futuras.find((p) => p.id === provaId) ?? provaDoPlano(ctx.provas, hoje);
  }

  function estatistica(rotulo, valor, sub) {
    return h('div', { class: 'anual-estat' }, h('span', { class: 'texto-secundario' }, rotulo), h('strong', null, valor), sub ? h('small', { class: 'texto-secundario' }, sub) : null);
  }

  function tabelaDeSemanas(plano) {
    const maior = Math.max(...plano.semanas.map((s) => Math.max(s.cargaAlvo, s.realizado)), 1);
    return h(
      'div',
      { class: 'tabela-wrap anual-semanas' },
      h(
        'table',
        { class: 'tabela tabela-compacta' },
        h('thead', null, h('tr', null, ...['Semana', 'Fase', 'Meta de carga', 'Feito'].map((t) => h('th', { scope: 'col' }, t)))),
        h(
          'tbody',
          null,
          ...plano.semanas.map((s) =>
            h(
              'tr',
              { class: s.atual ? 'anual-atual' : null },
              h('td', null, `${formatarData(s.inicio).slice(0, 5)} a ${formatarData(s.fim).slice(0, 5)}`, s.atual ? h('small', { class: 'texto-secundario' }, ' · esta semana') : null, s.semanaDaProva ? h('small', { class: 'texto-secundario' }, ' · prova') : null),
              h('td', null, h('span', { class: `anual-fase anual-fase-${s.fase}`, title: FASES[s.fase].descricao }, FASES[s.fase].rotulo), s.recuperacao ? h('small', { class: 'texto-secundario' }, ' · recuperação') : null),
              h(
                'td',
                null,
                h('div', { class: 'anual-barra', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round((s.cargaAlvo / maior) * 100)}%` })),
                formatarNumero(s.cargaAlvo, 0),
              ),
              h('td', null, s.inicio > hoje ? '—' : formatarNumero(s.realizado, 0)),
            ),
          ),
        ),
      ),
    );
  }

  function desenharRascunho(prova) {
    if (!rascunho) return null;
    const { itens, avisos, porSemana, marcados } = rascunho;
    const msg = areaMensagem();
    const botaoAceitar = h('button', { class: 'btn', type: 'button' });
    const ia = rascunho.ia ?? null;
    const botaoDescartar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Descartar');
    botaoDescartar.addEventListener('click', () => {
      // o rascunho da IA também é marcado como descartado no servidor (se falhar, só some da tela)
      if (ia) descartarRascunhoDaIa(ia.rascunhoId).catch(() => {});
      rascunho = null;
      desenhar();
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
        if (ia) await aceitarRascunhoDaIa({ uid, rascunhoId: ia.rascunhoId, itens: escolhidos, configs: ctx.configs, calibracao: ctx.calibracao });
        else await aceitarRascunho({ uid, itens: escolhidos, configs: ctx.configs, calibracao: ctx.calibracao });
        rascunho = null;
        desenhar();
        mensagem.mostrar(`${escolhidos.length} treino${escolhidos.length === 1 ? '' : 's'} adicionado${escolhidos.length === 1 ? '' : 's'} ao plano.`, 'ok');
        aoAceitar();
      });
    });

    const semanas = [...new Set(itens.map((i) => i.semana))];
    return h(
      'div',
      { class: 'ia-resultado' },
      h('p', { class: 'ia-aviso' }, icone('esporte', 14), ia ? ia.aviso : AVISO_RASCUNHO),
      ia?.resumo ? h('p', { class: 'ia-resumo' }, ia.resumo) : null,
      avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...avisos.map((a) => h('li', null, a))) : null,
      itens.length === 0
        ? h('p', { class: 'texto-secundario' }, 'Nenhum treino a sugerir.')
        : h(
            'div',
            null,
            ...semanas.map((inicio) => {
              const resumo = porSemana.find((s) => s.inicio === inicio);
              return h(
                'div',
                { class: 'anual-rascunho-semana' },
                h('h4', null, `Semana de ${formatarData(inicio).slice(0, 5)}`, resumo ? h('small', { class: 'texto-secundario' }, ` · meta ${formatarNumero(resumo.cargaAlvo, 0)} · rascunho +${formatarNumero(resumo.rascunho, 0)}${resumo.existente > 0 ? ` · já no plano ${formatarNumero(resumo.existente, 0)}` : ''}`) : null),
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
          ),
      h('div', { class: 'linha-botoes' }, itens.length > 0 ? botaoAceitar : null, botaoDescartar),
      msg.el,
    );
  }

  function desenhar() {
    if (!ctx) return;
    const futuras = provasFuturas(ctx.provas, hoje);
    if (futuras.length === 0) {
      corpo.replaceChildren(h('p', { class: 'texto-secundario' }, 'Cadastre uma prova (de preferência com prioridade A) para ver o plano anual: as fases, a carga de cada semana e a Forma prevista no dia da prova.'));
      return;
    }
    const prova = provaEscolhida();
    const plano = montarPlanoAnual({ hoje, prova, dias: ctx.dias });
    const r = plano.resumo;

    const seletorProva = seletor({
      id: 'anual-prova',
      rotulo: 'Prova do plano anual',
      opcoes: futuras.map((p) => ({ valor: p.id, rotulo: `${p.prioridade} · ${p.nome} · ${formatarData(p.data)}` })),
      valor: prova.id,
    });
    seletorProva.addEventListener('change', () => {
      provaId = seletorProva.value;
      rascunho = null;
      mensagem.limpar();
      desenhar();
    });

    const botaoRascunho = h('button', { class: 'btn', type: 'button', disabled: !r }, 'Montar rascunho das próximas 4 semanas');
    botaoRascunho.addEventListener('click', () => {
      mensagem.limpar();
      const resultado = montarRascunho({
        plano, prova, hoje, treinos: ctx.treinos, configs: ctx.configs, calibracao: ctx.calibracao, proprios: ctx.modelos, preferencias: ctx.preferencias,
      });
      rascunho = { ...resultado, marcados: new Set(resultado.itens.map((_, i) => i)) };
      desenhar();
    });

    const botaoIa = comIa ? h('button', { class: 'btn btn-secundario', type: 'button', disabled: !r }, icone('esporte', 16), 'Montar com IA') : null;
    botaoIa?.addEventListener('click', () => {
      mensagem.limpar();
      executarComBotao(botaoIa, mensagem, async () => {
        rascunho = null;
        const resposta = await pedirRascunhoAnualDaIa({ provaId: prova.id, observacao: observacaoIa.input.value.trim() });
        const { saida } = resposta;
        restantesIa = resposta.restantes;
        rascunho = {
          itens: saida.itens,
          avisos: saida.avisos,
          porSemana: saida.porSemana,
          marcados: new Set(saida.itens.map((_, i) => i)),
          ia: { rascunhoId: resposta.rascunhoId, resumo: saida.resumo, aviso: saida.aviso, restantes: resposta.restantes },
        };
        desenhar();
      }, 'A IA está montando o plano…');
    });

    const botaoMeta = Number.isFinite(prova.formaAlvo)
      ? h('button', { class: 'btn btn-secundario', type: 'button' }, 'Usar a Forma-alvo como meta de Forma')
      : null;
    botaoMeta?.addEventListener('click', () =>
      executarComBotao(botaoMeta, mensagem, async () => {
        await definirMetaDeFormaDaProva({ uid, prova, hoje, metasAtivas: ctx.metasForma.filter((m) => m.ativa) });
        mensagem.mostrar(`Meta de Forma definida: ${formatarForma(prova.formaAlvo, 1)} em ${formatarData(prova.data)}.`, 'ok');
      }),
    );

    // replaceChildren() escreve "null" na tela se receber null: os itens opcionais saem pelo filter
    corpo.replaceChildren(...[
      h('div', { class: 'campo anual-seletor' }, h('label', { for: 'anual-prova' }, 'Prova'), seletorProva),
      h(
        'p',
        { class: 'texto-secundario' },
        `${PRIORIDADES_PROVA[prova.prioridade].rotulo} · ${formatarData(prova.data)}${prova.metaTempoS ? ` · meta ${formatarTempoDaProva(prova.metaTempoS)}` : ''}`,
      ),
      plano.avisos.length > 0 ? h('ul', { class: 'ia-avisos' }, ...plano.avisos.map((a) => h('li', null, a))) : null,
      r
        ? h(
            'div',
            { class: 'anual-resumo' },
            estatistica('Semanas até a prova', formatarNumero(r.semanasTotal, 0), `${formatarNumero(r.diasAteProva, 0)} dias`),
            estatistica('Carga por semana', `${formatarNumero(r.cargaBase, 0)} → ${formatarNumero(r.cargaPico, 0)}`, 'da base ao pico'),
            estatistica('Polimento', `${r.semanasDePolimento} semana${r.semanasDePolimento === 1 ? '' : 's'}`, 'contando a da prova'),
            estatistica('Condicionamento previsto', r.condicionamentoNaProva === null ? '—' : formatarNumero(r.condicionamentoNaProva, 1), 'no dia da prova'),
            estatistica('Forma prevista', r.formaNaProva === null ? '—' : formatarForma(r.formaNaProva, 1), r.formaAlvo === null ? 'no dia da prova' : `alvo ${formatarForma(r.formaAlvo, 1)}`),
          )
        : null,
      plano.semanas.length > 0 ? tabelaDeSemanas(plano) : null,
      h('p', { class: 'texto-secundario' }, 'A carga é o HRSS da semana. O plano sobe devagar (no máximo 8% por semana), tem uma semana de recuperação a cada quatro e a carga de pico não passa de 1,8 vez a sua base. A Forma prevista espalha a carga igualmente pelos dias.'),
      observacaoIa ? observacaoIa.raiz : null,
      h('div', { class: 'linha-botoes' }, botaoRascunho, botaoIa, botaoMeta),
      comIa && textoDasRestantes() ? h('p', { class: 'texto-secundario anual-ia-restantes' }, textoDasRestantes()) : null,
      mensagem.el,
      desenharRascunho(prova),
    ].filter(Boolean));
  }

  const el = h(
    'section',
    { class: 'card', id: 'plano-anual' },
    h('h2', null, 'Plano anual'),
    h('p', { class: 'texto-secundario' }, 'Da data de hoje até a prova: fases (base, construção, pico e polimento), carga de cada semana e a Forma prevista no dia. O rascunho de treinos usa os dias de treino do seu perfil.'),
    corpo,
  );
  desenhar();
  if (comIa) {
    restantesDaIa()
      .then((n) => {
        restantesIa = n;
        desenhar();
      })
      .catch(() => {});
  }

  return {
    el,
    atualizar(novo) {
      ctx = novo;
      desenhar();
    },
  };
}
