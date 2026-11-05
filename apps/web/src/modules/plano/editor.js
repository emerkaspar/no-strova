import {
  configVigenteEm,
  descreverPasso,
  duracaoTotalS,
  estimarEstresseEstruturado,
  FOCOS,
  formatarSegundos,
  gerarFitDoTreino,
  modelosDoCatalogo,
  NIVEIS,
  resumirTreino,
  somarDias,
} from '@no-strova/domain';
import { detalheDaEstimativa, salvarTreinoPlanejado } from '../../application/plano.js';
import { desvincularTreino, excluirTreino, pularTreino } from '../../infrastructure/planoRepo.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { baixarArquivo, perfilDoTreino } from '../../utils/perfilTreino.js';
import { OPCOES_ESPORTE, OPCOES_ZONA } from '../atividades/textos.js';
import { confirmar } from '../../utils/modal.js';

/**
 * Formulário de treino planejado (novo ou existente). O treino pode ser livre (zona e duração) ou vir da biblioteca
 * de intervalados (do catálogo ou dos treinos próprios), caso em que a duração, a zona e o HRSS vêm dos passos.
 * @param {{
 *   uid: string, configs: () => any[], calibracao?: () => any, modelos?: () => any[],
 *   treino: any|null, dataInicial: string, aoConcluir: (aviso?: string) => void, aoCancelar: () => void
 * }} p `configs`, `calibracao` e `modelos` (os treinos próprios) são funções para sempre ler o valor mais recente
 */
export function criarEditor({ uid, configs, calibracao = () => null, modelos = () => [], treino, dataInicial, aoConcluir, aoCancelar }) {
  const existente = Boolean(treino);
  // Treino estruturado (intervalado): { passos, nomeTreino, modeloId } ou null (treino livre)
  let estrutura = treino?.passos?.length ? { passos: treino.passos, nomeTreino: treino.nomeTreino, modeloId: treino.modeloId ?? null } : null;
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

  // ---- treino da biblioteca ----
  const painelEstrutura = h('div');
  const ORDEM_NIVEL = Object.keys(NIVEIS);
  const ORDEM_FOCO = Object.keys(FOCOS);
  const todosOsModelos = () => [...modelos(), ...modelosDoCatalogo({})];

  // Seletor da biblioteca: busca, filtro por foco e lista com perfil, nível, duração, zona e HRSS de cada treino
  let filtroFoco = 'todos'; // 'todos' | 'proprio' | id do foco
  let textoBusca = '';
  let faixaHrss = 'todas'; // 'todas' | id de NIVEIS_DE_ESFORCO
  const FAIXAS_HRSS = [
    { id: 'leve', rotulo: 'Leve · até 45', min: 0, max: 45 },
    { id: 'moderado', rotulo: 'Moderado · 45–80', min: 45, max: 80 },
    { id: 'forte', rotulo: 'Forte · 80–120', min: 80, max: 120 },
    { id: 'brutal', rotulo: 'Pesado · 120+', min: 120, max: Infinity },
  ];
  const busca = h('input', { type: 'search', id: 'tr-busca', name: 'tr-busca', class: 'biblioteca-busca', placeholder: 'Buscar treino pelo nome…', autocomplete: 'off', 'aria-label': 'Buscar treino da biblioteca' });
  busca.addEventListener('input', () => {
    textoBusca = busca.value.trim().toLocaleLowerCase('pt-BR');
    desenharLista();
  });
  const filtros = h('div', { class: 'biblioteca-filtros', role: 'group', 'aria-label': 'Filtrar por foco' });
  const filtrosHrss = h('div', { class: 'biblioteca-filtros', role: 'group', 'aria-label': 'Filtrar por HRSS' });
  const lista = h('div', { class: 'biblioteca-lista', role: 'listbox', 'aria-label': 'Treino da biblioteca' });

  const selecionadoId = (ids) => (estrutura ? (ids.has(estrutura.modeloId) ? estrutura.modeloId : '__atual') : '');

  function linhaDaBiblioteca({ id, nome, subtitulo, passos, config, selecionado }) {
    const resumo = passos ? resumirTreino(passos) : null;
    const hrss = passos ? estimarEstresseEstruturado({ passos, config }) : null;
    const metrica = (valor, rotulo, destaque = false) => h('div', { class: `biblioteca-metrica${destaque ? ' destaque' : ''}` }, h('strong', null, valor), h('span', null, rotulo));
    return h(
      'button',
      { type: 'button', class: `biblioteca-linha${selecionado ? ' selecionado' : ''}`, role: 'option', 'aria-selected': String(selecionado), 'data-id': id, onClick: () => escolherTreino(id) },
      h('div', { class: 'biblioteca-perfil' }, passos ? perfilDoTreino(passos, { altura: 40 }) : h('span', { class: 'biblioteca-livre-icone', 'aria-hidden': 'true' }, '✎')),
      h('div', { class: 'biblioteca-texto' }, h('strong', { class: 'biblioteca-nome' }, nome), h('span', { class: 'biblioteca-sub' }, subtitulo)),
      resumo
        ? h(
            'div',
            { class: 'biblioteca-metricas' },
            metrica(formatarSegundos(resumo.duracaoS), 'duração'),
            metrica(resumo.zona, 'zona'),
            metrica(hrss === null ? '—' : `~${formatarNumero(hrss, 0)}`, 'HRSS', true),
          )
        : null,
    );
  }

  /** Redesenha filtros e lista: "treino livre", o treino atual (se não está na lista), os próprios e o catálogo por foco. */
  function desenharLista() {
    const esp = esporte.select.value;
    const config = configVigenteEm(configs(), data.input.value || treino?.data || dataInicial);
    const doEsporte = todosOsModelos().filter((m) => m.esporte === esp);
    const ids = new Set(doEsporte.map((m) => m.id));
    const atualForaDaLista = estrutura && !ids.has(estrutura.modeloId);
    const selecionado = selecionadoId(ids);

    const focosPresentes = ORDEM_FOCO.filter((f) => doEsporte.some((m) => m.origem !== 'proprio' && m.foco === f));
    const temProprios = doEsporte.some((m) => m.origem === 'proprio');
    if (filtroFoco !== 'todos' && !(filtroFoco === 'proprio' ? temProprios : focosPresentes.includes(filtroFoco))) filtroFoco = 'todos';
    const chip = (valor, rotulo) =>
      h('button', { type: 'button', class: `biblioteca-chip${filtroFoco === valor ? ' ativo' : ''}`, 'aria-pressed': String(filtroFoco === valor), onClick: () => { filtroFoco = valor; desenharLista(); } }, rotulo);
    filtros.replaceChildren(
      chip('todos', 'Todos'),
      ...(temProprios ? [chip('proprio', 'Meus treinos')] : []),
      ...focosPresentes.map((f) => chip(f, FOCOS[f].rotulo)),
    );

    const chipHrss = (valor, rotulo) =>
      h('button', { type: 'button', class: `biblioteca-chip${faixaHrss === valor ? ' ativo' : ''}`, 'aria-pressed': String(faixaHrss === valor), onClick: () => { faixaHrss = valor; desenharLista(); } }, rotulo);
    if (!config) faixaHrss = 'todas';
    filtrosHrss.hidden = !config;
    filtrosHrss.replaceChildren(h('span', { class: 'biblioteca-filtro-rotulo' }, 'HRSS'), chipHrss('todas', 'Todos'), ...FAIXAS_HRSS.map((f) => chipHrss(f.id, f.rotulo)));
    const faixa = FAIXAS_HRSS.find((f) => f.id === faixaHrss);
    const dentroDaFaixa = (m) => {
      if (!faixa) return true;
      const valor = estimarEstresseEstruturado({ passos: m.passos, config });
      return valor !== null && valor >= faixa.min && valor < faixa.max;
    };

    const casa = (m) =>
      dentroDaFaixa(m) &&
      (filtroFoco === 'todos' || (filtroFoco === 'proprio' ? m.origem === 'proprio' : m.origem !== 'proprio' && m.foco === filtroFoco)) &&
      (!textoBusca || `${m.nome} ${m.especificacao ?? ''}`.toLocaleLowerCase('pt-BR').includes(textoBusca));
    const ordenar = (itens) => [...itens].sort((a, b) => ORDEM_NIVEL.indexOf(a.nivel) - ORDEM_NIVEL.indexOf(b.nivel) || duracaoTotalS(a.passos) - duracaoTotalS(b.passos) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const linha = (m) =>
      linhaDaBiblioteca({
        id: m.id,
        nome: m.nome,
        subtitulo: [m.origem === 'proprio' ? 'Seu treino' : FOCOS[m.foco]?.rotulo ?? m.foco, NIVEIS[m.nivel] ?? m.nivel].join(' · '),
        passos: m.passos,
        config,
        selecionado: selecionado === m.id,
      });
    const grupo = (titulo, itens) => (itens.length === 0 ? [] : [h('p', { class: 'biblioteca-grupo' }, titulo), ...ordenar(itens).map(linha)]);

    const filtrados = doEsporte.filter(casa);
    const rolagem = lista.scrollTop;
    lista.replaceChildren(
      linhaDaBiblioteca({ id: '', nome: 'Treino livre', subtitulo: 'Eu informo a zona e a duração', passos: null, config, selecionado: selecionado === '' }),
      ...(atualForaDaLista ? [linhaDaBiblioteca({ id: '__atual', nome: `${estrutura.nomeTreino} (atual)`, subtitulo: 'Treino já salvo neste dia', passos: estrutura.passos, config, selecionado: selecionado === '__atual' })] : []),
      ...grupo('Meus treinos', filtrados.filter((m) => m.origem === 'proprio')),
      ...ORDEM_FOCO.flatMap((f) => grupo(FOCOS[f].rotulo, filtrados.filter((m) => m.origem !== 'proprio' && m.foco === f))),
      ...(filtrados.length === 0 ? [h('p', { class: 'biblioteca-vazio texto-secundario' }, 'Nenhum treino encontrado com esse filtro.')] : []),
    );
    lista.scrollTop = rolagem;
  }

  function escolherTreino(valor) {
    if (valor === '__atual') return;
    if (valor === '') {
      estrutura = null;
    } else {
      const modelo = todosOsModelos().find((m) => m.id === valor);
      if (!modelo) return;
      estrutura = { passos: modelo.passos, nomeTreino: modelo.nome, modeloId: modelo.id };
      esporte.select.value = modelo.esporte;
    }
    aplicarEstrutura();
  }

  /** Mostra a estrutura (perfil e passos) e trava o que vem dos passos: a duração, a zona e o esporte. */
  function aplicarEstrutura() {
    duracao.input.disabled = Boolean(estrutura);
    zona.select.disabled = Boolean(estrutura);
    esporte.select.disabled = Boolean(estrutura);
    if (estrutura) {
      const resumo = resumirTreino(estrutura.passos);
      duracao.input.value = String(resumo.duracaoMin);
      zona.select.value = resumo.zona;
    }
    painelEstrutura.replaceChildren(
      ...(estrutura
        ? [
            h(
              'div',
              { class: 'treino-estrutura' },
              h('p', { class: 'cg-mini-rotulo' }, 'Treino estruturado'),
              h('strong', null, estrutura.nomeTreino),
              perfilDoTreino(estrutura.passos),
              h('ul', { class: 'treino-estrutura-passos' }, ...estrutura.passos.map((passo) => h('li', null, descreverPasso(passo)))),
              h('p', { class: 'texto-secundario' }, 'A duração, a zona e o esporte vêm dos passos. Para usar outra estrutura, escolha outro treino na lista acima ou volte para "Treino livre".'),
            ),
          ]
        : []),
    );
    desenharLista();
    atualizarEstimativa();
  }

  function atualizarEstimativa() {
    if (estrutura) {
      const valor = estimarEstresseEstruturado({ passos: estrutura.passos, config: configVigenteEm(configs(), data.input.value || treino?.data || dataInicial) });
      estimativa.textContent =
        valor === null
          ? 'Cadastre a configuração de FC (em Configuração) para o app estimar o estresse do treino.'
          : `Estimativa: ~${formatarNumero(valor, 0)} de HRSS, somando os blocos do treino${estresse.input.value ? ' (você informou outro valor abaixo)' : ''}.`;
      return;
    }
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
  // sem estrutura, trocar o esporte refaz a lista da biblioteca (que é por esporte); a data muda a config de FC, logo o HRSS
  esporte.select.addEventListener('change', () => {
    if (!estrutura) desenharLista();
  });
  data.input.addEventListener('change', desenharLista);
  aplicarEstrutura();

  const entrada = () => ({
    esporte: esporte.select.value,
    data: data.input.value,
    duracaoMin: duracao.input.value,
    zona: zona.select.value,
    estresseManual: estresse.input.value,
    observacoes: observacoes.value,
    ...(estrutura ? { passos: estrutura.passos, nomeTreino: estrutura.nomeTreino, modeloId: estrutura.modeloId ?? null } : {}),
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
    h(
      'div',
      { class: 'campo' },
      h('label', { for: 'tr-busca' }, 'Treino da biblioteca'),
      h('div', { class: 'biblioteca' }, busca, filtros, filtrosHrss, lista),
      h('small', { class: 'dica' }, 'Escolha um intervalado pronto (ou um dos seus) ou deixe "Treino livre" para informar a zona e a duração. O HRSS é estimado pela sua configuração de FC.'),
    ),
    painelEstrutura,
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

  /** Baixa o treino do formulário como arquivo .fit para o relógio. O treino livre vira um passo único na zona e duração. */
  function exportarFit() {
    mensagem.limpar();
    try {
      const dataTreino = data.input.value || treino?.data || dataInicial;
      const config = configVigenteEm(configs(), dataTreino);
      let modelo;
      if (estrutura) {
        modelo = { nome: estrutura.nomeTreino, esporte: esporte.select.value, passos: estrutura.passos };
      } else {
        const minutos = Number(String(duracao.input.value).replace(',', '.'));
        if (!Number.isFinite(minutos) || minutos <= 0) throw new Error('Informe a duração do treino para gerar o arquivo.');
        const nomeEsporte = OPCOES_ESPORTE.find((o) => o.valor === esporte.select.value)?.rotulo ?? 'Treino';
        modelo = {
          nome: `${nomeEsporte} ${zona.select.value} ${Math.round(minutos)}min`,
          esporte: esporte.select.value,
          passos: [{ tipo: 'bloco', papel: 'principal', zona: zona.select.value, duracaoS: Math.round(minutos * 60), descricao: null }],
        };
      }
      const { bytes, nomeArquivo } = gerarFitDoTreino(modelo, { config });
      baixarArquivo(bytes, nomeArquivo, 'application/vnd.ant.fit');
      mensagem.mostrar(
        `Arquivo ${nomeArquivo} gerado${config ? ', com a faixa de FC de cada zona' : ' sem faixa de FC (cadastre a configuração de FC para incluir)'}. Copie para a pasta de treinos do aparelho (Garmin: NewFiles) ou importe no Garmin Connect.`,
        'ok',
      );
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível gerar o arquivo.');
    }
  }

  const botoes = h(
    'div',
    { class: 'linha-botoes' },
    botao,
    h('button', { class: 'btn btn-secundario', type: 'button', onClick: exportarFit }, 'Salvar treino (.fit)'),
    h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoCancelar }, 'Cancelar'),
  );

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
    excluir.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Excluir este treino?', mensagem: 'Ele sai do plano e da projeção.', confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
      acao(excluir, () => excluirTreino(treino.id), 'Treino excluído.');
    });
    botoes.append(excluir);
  }

  form.append(botoes);
  return h('section', { class: 'card', id: 'editor-treino' }, h('h2', null, existente ? 'Editar treino' : 'Novo treino'), form);
}
