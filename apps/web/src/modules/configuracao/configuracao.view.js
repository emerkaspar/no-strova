import { atividadesAntesDaPrimeiraVigencia, primeiraVigencia, RECURSOS, SEXOS, temRecurso, validarConfigAtleta, validarDadosPerfil } from '@no-strova/domain';
import { observarCalibracaoDoUsuario } from '../../application/calibracao.js';
import { recalcularHistorico } from '../../core/functions.js';
import { observarAtividades } from '../../infrastructure/atividadesRepo.js';
import { excluirConfig, observarConfigs, salvarConfig } from '../../infrastructure/configsRepo.js';
import { atualizarDadosPessoais } from '../../infrastructure/perfilRepo.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { criarCartaoCalibracao, criarCartaoTesteLthr } from './calibracao.js';
import { criarCartaoGarmin } from './garmin.js';
import { editar, estadoConfiguracao } from './state.js';

const ROTULO_SEXO = { [SEXOS.MASCULINO]: 'Masculino', [SEXOS.FEMININO]: 'Feminino' };

function cartaoDadosPessoais(sessao) {
  const nome = campo({ id: 'dp-nome', rotulo: 'Nome', maxlength: 80, value: sessao.perfil?.nome ?? '' });
  const nascimento = campo({
    id: 'dp-nasc',
    rotulo: 'Data de nascimento',
    tipo: 'date',
    value: sessao.perfil?.dataNascimento ?? '',
    dica: 'Usada para estimar o gasto calórico (calorias estimadas) nas atividades sem calorias no arquivo.',
  });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Salvar dados');
  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          const r = validarDadosPerfil({ nome: nome.input.value, dataNascimento: nascimento.input.value });
          if (!r.valido) throw new Error(r.erros.join(' '));
          await atualizarDadosPessoais(sessao.uid, r.valores);
          mensagem.mostrar('Dados salvos. Use “Recalcular histórico” para atualizar as calorias estimadas.', 'ok');
        });
      },
    },
    h('div', { class: 'grid' }, nome.raiz, nascimento.raiz),
    mensagem.el,
    botao,
  );
  return h('section', { class: 'card' }, h('h2', null, 'Seus dados'), form);
}


export function render(raiz, sessao) {
  let configs = [];
  const cancelar = [];
  const corpoTabela = h('div', { class: 'tabela-wrap' });
  const areaForm = h('div');
  const mensagemTabela = areaMensagem();
  // Fica fora do formulário para sobreviver ao redesenho depois de salvar.
  const mensagemForm = areaMensagem();
  let idDesenhado = null;
  let datasAtividades = [];
  let atividadesLista = [];
  let dadosCalibracao = { calibracao: null, preferencias: null };
  let campoVigencia = null;
  const areaCalibracao = h('div');
  const testeLthr = criarCartaoTesteLthr({ uid: sessao.uid });

  function desenharCalibracao() {
    areaCalibracao.replaceChildren(criarCartaoCalibracao({ uid: sessao.uid, configs, ...dadosCalibracao }));
  }

  /** A primeira vigência deve começar antes da atividade mais antiga; as demais, hoje. */
  function dataInicialSugerida() {
    if (configs.length === 0 && datasAtividades.length > 0) return datasAtividades.reduce((menor, d) => (d < menor ? d : menor));
    return hojeIso();
  }

  function desenharTabela() {
    if (configs.length === 0) {
      corpoTabela.replaceChildren(h('p', { class: 'vazio' }, 'Nenhuma configuração ainda. Cadastre a primeira abaixo para calcular o HRSS.'));
      return;
    }
    corpoTabela.replaceChildren(
      h(
        'table',
        { class: 'tabela' },
        h(
          'thead',
          null,
          h('tr', null, ...['Vigente desde', 'FC máx.', 'FC repouso', 'LTHR', 'Sexo', 'Peso', 'Altura', 'Ações'].map((t) => h('th', { scope: 'col' }, t))),
        ),
        h(
          'tbody',
          null,
          ...configs.map((c, i) =>
            h(
              'tr',
              null,
              h('td', null, formatarData(c.vigenteDesde), i === 0 ? h('span', { class: 'badge' }, 'atual') : null),
              h('td', null, `${c.fcMax} bpm`),
              h('td', null, `${c.fcRepouso} bpm`),
              h('td', null, `${c.lthr} bpm`),
              h('td', null, ROTULO_SEXO[c.sexo] ?? c.sexo),
              h('td', null, `${formatarNumero(c.pesoKg, 1)} kg`),
              h('td', null, `${formatarNumero(c.alturaCm, 0)} cm`),
              h(
                'td',
                null,
                h(
                  'div',
                  { class: 'acoes' },
                  h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => { editar(c.id); mensagemForm.limpar(); desenharForm(); areaForm.scrollIntoView?.({ behavior: 'smooth' }); } }, 'Editar'),
                  h(
                    'button',
                    {
                      class: 'btn btn-perigo',
                      type: 'button',
                      onClick: async () => {
                        if (!confirm(`Excluir a configuração vigente desde ${formatarData(c.vigenteDesde)}?`)) return;
                        mensagemTabela.limpar();
                        try {
                          await excluirConfig(c.id);
                        } catch {
                          mensagemTabela.mostrar('Não foi possível excluir a configuração.');
                        }
                      },
                    },
                    'Excluir',
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function desenharForm() {
    const emEdicao = configs.find((c) => c.id === estadoConfiguracao.editandoId) ?? null;
    if (!emEdicao) editar(null);
    idDesenhado = emEdicao?.id ?? null;
    // Para uma nova vigência, parte dos valores da mais recente.
    const base = emEdicao ?? configs[0] ?? {};

    const vigente = campo({ id: 'cfg-desde', rotulo: 'Vigente desde', tipo: 'date', value: emEdicao?.vigenteDesde ?? dataInicialSugerida(), dica: 'Vale a partir desta data; cada atividade usa a configuração vigente no dia dela. Na primeira configuração, use uma data anterior à sua atividade mais antiga.' });
    campoVigencia = vigente.input;
    const fcMax = campo({ id: 'cfg-max', rotulo: 'FC máxima (bpm)', inputmode: 'numeric', value: base.fcMax ?? '' });
    const fcRepouso = campo({ id: 'cfg-repouso', rotulo: 'FC de repouso (bpm)', inputmode: 'numeric', value: base.fcRepouso ?? '' });
    const lthr = campo({ id: 'cfg-lthr', rotulo: 'LTHR — FC no limiar (bpm)', inputmode: 'numeric', value: base.lthr ?? '', dica: 'Maior FC média que você sustenta por cerca de 1 hora.' });
    const sexo = selecao({
      id: 'cfg-sexo',
      rotulo: 'Sexo',
      valor: base.sexo ?? '',
      opcoes: [{ valor: '', rotulo: 'Selecione' }, ...Object.entries(ROTULO_SEXO).map(([valor, rotulo]) => ({ valor, rotulo }))],
      dica: 'Define a constante do TRIMP (1,92 ou 1,67).',
    });
    const peso = campo({ id: 'cfg-peso', rotulo: 'Peso (kg)', inputmode: 'decimal', value: base.pesoKg ?? '' });
    const altura = campo({ id: 'cfg-altura', rotulo: 'Altura (cm)', inputmode: 'decimal', value: base.alturaCm ?? '' });
    const mensagem = mensagemForm;
    const botao = h('button', { class: 'btn', type: 'submit' }, emEdicao ? 'Salvar alterações' : 'Adicionar vigência');

    const form = h(
      'form',
      {
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          executarComBotao(botao, mensagem, async () => {
            const r = validarConfigAtleta({
              vigenteDesde: vigente.input.value,
              fcMax: fcMax.input.value,
              fcRepouso: fcRepouso.input.value,
              lthr: lthr.input.value,
              sexo: sexo.select.value,
              pesoKg: peso.input.value,
              alturaCm: altura.input.value,
            });
            if (!r.valido) throw new Error(r.erros.join(' '));
            const outraComMesmaData = configs.find((c) => c.vigenteDesde === r.valores.vigenteDesde && c.id !== emEdicao?.id);
            if (outraComMesmaData && !confirm('Já existe uma configuração com essa data. Substituir?')) return;
            const vigenciasResultantes = [...configs.filter((c) => c.id !== emEdicao?.id).map((c) => c.vigenteDesde), r.valores.vigenteDesde];
            const semCobertura = atividadesAntesDaPrimeiraVigencia(vigenciasResultantes, datasAtividades);
            if (
              semCobertura > 0 &&
              !confirm(`${semCobertura === 1 ? '1 atividade é anterior' : `${semCobertura} atividades são anteriores`} a ${formatarData(primeiraVigencia(vigenciasResultantes))} e ficarão sem HRSS, porque não haverá configuração vigente nas datas delas. Salvar assim mesmo?`)
            ) {
              return;
            }
            await salvarConfig(sessao.uid, r.valores);
            if (emEdicao && emEdicao.vigenteDesde !== r.valores.vigenteDesde) await excluirConfig(emEdicao.id);
            editar(null);
            mensagem.mostrar('Configuração salva. Use “Recalcular histórico” para aplicar às atividades já importadas.', 'ok');
          });
        },
      },
      h('div', { class: 'grid' }, vigente.raiz, fcMax.raiz, fcRepouso.raiz, lthr.raiz, sexo.raiz, peso.raiz, altura.raiz),
      mensagem.el,
      h(
        'div',
        { class: 'linha-botoes' },
        botao,
        emEdicao ? h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => { editar(null); mensagemForm.limpar(); desenharForm(); } }, 'Cancelar edição') : null,
      ),
    );
    areaForm.replaceChildren(h('h3', null, emEdicao ? `Editando a vigência de ${formatarData(emEdicao.vigenteDesde)}` : 'Nova vigência'), form);
  }

  const mensagemRecalculo = areaMensagem();
  const botaoRecalculo = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Recalcular histórico');
  botaoRecalculo.addEventListener('click', () => {
    if (!confirm('Recalcular o HRSS de todas as atividades com a configuração vigente na data de cada uma? O estresse que você informou manualmente não muda.')) return;
    executarComBotao(botaoRecalculo, mensagemRecalculo, async () => {
      const r = await recalcularHistorico();
      const base = `${r.atualizadas} de ${r.total} atividade${r.total === 1 ? '' : 's'} atualizada${r.atualizadas === 1 ? '' : 's'}.`;
      if (r.semConfig > 0) {
        mensagemRecalculo.mostrar(`${base} ${r.semConfig} continua${r.semConfig === 1 ? '' : 'm'} sem HRSS: não há configuração vigente nas datas delas. Ajuste o “Vigente desde” da configuração mais antiga para antes da atividade mais antiga e recalcule de novo.`);
      } else {
        mensagemRecalculo.mostrar(base, 'ok');
      }
    });
  });

  raiz.replaceChildren(
    h('div', { class: 'pilha' },
      cartaoDadosPessoais(sessao),
      temRecurso(sessao.perfil, RECURSOS.GARMIN) ? criarCartaoGarmin().raiz : null,
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Configuração do atleta'),
        h('p', { class: 'texto-secundario' }, 'FC máxima, FC de repouso, LTHR, sexo, peso e altura, cada conjunto com a data em que passa a valer. É a base do cálculo do HRSS. Atividades anteriores à primeira vigência ficam sem HRSS.'),
        mensagemTabela.el,
        corpoTabela,
        areaForm,
      ),
      testeLthr.raiz,
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Recalcular histórico'),
        h('p', { class: 'texto-secundario' }, 'Depois de mudar a configuração (ou de cadastrá-la pela primeira vez), recalcule o HRSS e as calorias estimadas das atividades já registradas.'),
        mensagemRecalculo.el,
        botaoRecalculo,
      ),
      areaCalibracao,
    ),
  );
  corpoTabela.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));

  cancelar.push(
    observarAtividades(
      sessao.uid,
      (lista) => {
        atividadesLista = lista;
        testeLthr.atualizar({ configs, atividades: atividadesLista });
        datasAtividades = lista.map((a) => a.data).filter(Boolean);
        // Formulário da primeira vigência ainda intocado (data = hoje): sugere a data da atividade mais antiga.
        if (campoVigencia && configs.length === 0 && campoVigencia.value === hojeIso() && datasAtividades.length > 0) {
          campoVigencia.value = dataInicialSugerida();
        }
      },
      () => {},
    ),
    observarCalibracaoDoUsuario(sessao.uid, (dados) => {
      dadosCalibracao = dados;
      desenharCalibracao();
    }),
    observarConfigs(
      sessao.uid,
      (lista) => {
        configs = lista;
        testeLthr.atualizar({ configs, atividades: atividadesLista });
        desenharCalibracao();
        desenharTabela();
        // Só recria o formulário quando ele precisa mudar (não apaga o que o usuário está digitando).
        const editando = configs.some((c) => c.id === estadoConfiguracao.editandoId) ? estadoConfiguracao.editandoId : null;
        if (!areaForm.firstChild || editando !== idDesenhado) {
          editar(editando);
          desenharForm();
        }
      },
      () => mensagemTabela.mostrar('Não foi possível carregar as configurações.'),
    ),
  );

  return () => {
    cancelar.forEach((fn) => fn());
    editar(null);
  };
}
