import { atividadesAntesDaPrimeiraVigencia, primeiraVigencia, RECURSOS, SEXOS, temRecurso, validarConfigAtleta } from '@no-strova/domain';
import { observarCalibracaoDoUsuario } from '../../application/calibracao.js';
import { recalcularHistorico } from '../../core/functions.js';
import { observarAtividades } from '../../infrastructure/atividadesRepo.js';
import { excluirConfig, observarConfigs, salvarConfig } from '../../infrastructure/configsRepo.js';
import { conferirLthrNoIntervals } from './lthrIntervals.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { criarCartaoCalibracao, criarCartaoTesteLthr } from './calibracao.js';
import { criarCartaoGarmin } from './garmin.js';
import { criarCartaoZonasDeFc } from './zonasDeFc.js';
import { linhaCartao, metricaCartao } from './linhaCartao.js';
import { reiniciarSecoes, secaoRecolhivel } from './secaoRecolhivel.js';
import { editar, estadoConfiguracao } from './state.js';
import { confirmar } from '../../utils/modal.js';

const ROTULO_SEXO = { [SEXOS.MASCULINO]: 'Masculino', [SEXOS.FEMININO]: 'Feminino' };


export function render(raiz, sessao) {
  reiniciarSecoes(); // todas as seções abrem recolhidas
  let configs = [];
  const cancelar = [];
  const corpoTabela = h('div');
  const areaForm = h('div');
  // O formulário só aparece ao adicionar ou editar uma vigência (ou quando ainda não há nenhuma).
  let formAberto = false;
  const botaoNovaVigencia = h('button', { class: 'btn', type: 'button' });
  botaoNovaVigencia.addEventListener('click', () => {
    formAberto = !formAberto;
    editar(null);
    mensagemForm.limpar();
    desenharForm();
    if (formAberto) areaForm.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  });
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

  const areaZonas = h('div');

  function desenharCalibracao() {
    areaCalibracao.replaceChildren(criarCartaoCalibracao({ uid: sessao.uid, configs, ...dadosCalibracao }));
  }

  function desenharZonas() {
    areaZonas.replaceChildren(criarCartaoZonasDeFc({ configs }));
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
        'ul',
        { class: 'cfg-lista' },
        ...configs.map((c, i) =>
          linhaCartao({
            atual: i === 0,
            nomeIcone: 'calendario',
            topo: ['Vigente desde'],
            titulo: h('strong', { class: 'cfg-titulo' }, formatarData(c.vigenteDesde), i === 0 ? h('span', { class: 'cfg-pill' }, 'atual') : null),
            lado: [
              h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => { editar(c.id); formAberto = true; mensagemForm.limpar(); desenharForm(); areaForm.scrollIntoView?.({ behavior: 'smooth' }); } }, 'Editar'),
              h(
                'button',
                {
                  class: 'btn btn-perigo',
                  type: 'button',
                  onClick: async () => {
                    if (!(await confirmar({ titulo: 'Excluir esta configuração?', mensagem: `A configuração vigente desde ${formatarData(c.vigenteDesde)} será apagada.`, confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
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
            ],
            colunas: 6,
            metricas: [
              metricaCartao('fcPulso', 'FC máx.', `${c.fcMax} bpm`),
              metricaCartao('fc', 'FC repouso', `${c.fcRepouso} bpm`),
              metricaCartao('atividades', 'LTHR', `${c.lthr} bpm`),
              metricaCartao('perfil', 'Sexo', ROTULO_SEXO[c.sexo] ?? c.sexo),
              metricaCartao('peso', 'Peso', `${formatarNumero(c.pesoKg, 1)} kg`),
              metricaCartao('regua', 'Altura', `${formatarNumero(c.alturaCm, 0)} cm`),
            ],
          }),
        ),
      ),
    );
  }

  function desenharForm() {
    const emEdicao = configs.find((c) => c.id === estadoConfiguracao.editandoId) ?? null;
    if (!emEdicao) editar(null);
    idDesenhado = emEdicao?.id ?? null;
    const aberto = formAberto || Boolean(emEdicao) || configs.length === 0;
    const criando = aberto && !emEdicao && configs.length > 0;
    botaoNovaVigencia.hidden = configs.length === 0;
    botaoNovaVigencia.textContent = criando ? 'Fechar' : '+ Nova vigência';
    botaoNovaVigencia.className = criando ? 'btn btn-secundario' : 'btn';
    if (!aberto) {
      areaForm.replaceChildren(mensagemForm.el);
      return;
    }
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
        class: 'prog-form',
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
            if (outraComMesmaData && !(await confirmar({ titulo: 'Substituir a configuração?', mensagem: 'Já existe uma configuração com essa data.', confirmarTexto: 'Substituir', tipo: 'aviso', icone: 'configuracao' }))) return;
            const vigenciasResultantes = [...configs.filter((c) => c.id !== emEdicao?.id).map((c) => c.vigenteDesde), r.valores.vigenteDesde];
            const semCobertura = atividadesAntesDaPrimeiraVigencia(vigenciasResultantes, datasAtividades);
            if (
              semCobertura > 0 &&
              !(await confirmar({ titulo: 'Salvar assim mesmo?', mensagem: `${semCobertura === 1 ? '1 atividade é anterior' : `${semCobertura} atividades são anteriores`} a ${formatarData(primeiraVigencia(vigenciasResultantes))} e ficarão sem HRSS, porque não haverá configuração vigente nas datas delas.`, confirmarTexto: 'Salvar', tipo: 'aviso', icone: 'alerta' }))
            ) {
              return;
            }
            await salvarConfig(sessao.uid, r.valores);
            if (emEdicao && emEdicao.vigenteDesde !== r.valores.vigenteDesde) await excluirConfig(emEdicao.id);
            // para quem envia treinos ao Garmin pelo intervals.icu: confere o LTHR de lá e oferece atualizar
            const avisoIntervals = await conferirLthrNoIntervals();
            editar(null);
            formAberto = false;
            desenharForm();
            mensagem.mostrar(`Configuração salva. Use “Recalcular histórico” para aplicar às atividades já importadas.${avisoIntervals}`, 'ok');
          });
        },
      },
      h('div', { class: 'grid' }, vigente.raiz, fcMax.raiz, fcRepouso.raiz, lthr.raiz, sexo.raiz, peso.raiz, altura.raiz),
      mensagem.el,
      h(
        'div',
        { class: 'linha-botoes' },
        botao,
        configs.length > 0 ? h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => { editar(null); formAberto = false; mensagemForm.limpar(); desenharForm(); } }, 'Cancelar') : null,
      ),
    );
    form.prepend(h('h3', null, emEdicao ? `Editando a vigência de ${formatarData(emEdicao.vigenteDesde)}` : 'Nova vigência'));
    areaForm.replaceChildren(form);
  }

  const mensagemRecalculo = areaMensagem();
  const botaoRecalculo = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Recalcular histórico');
  botaoRecalculo.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Recalcular o histórico?', mensagem: 'Recalcular o HRSS de todas as atividades com a configuração vigente na data de cada uma? O estresse que você informou manualmente não muda.', confirmarTexto: 'Recalcular', tipo: 'aviso', icone: 'hrss' }))) return;
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
      temRecurso(sessao.perfil, RECURSOS.GARMIN) ? criarCartaoGarmin().raiz : null,
      secaoRecolhivel({
        id: 'atleta',
        titulo: 'Configuração do atleta',
        acoes: botaoNovaVigencia,
        corpo: [
          h('p', { class: 'texto-secundario' }, 'FC máxima, FC de repouso, LTHR, sexo, peso e altura, cada conjunto com a data em que passa a valer. É a base do cálculo do HRSS. Atividades anteriores à primeira vigência ficam sem HRSS.'),
          mensagemTabela.el,
          corpoTabela,
          areaForm,
          h(
            'div',
            { class: 'config-recalculo' },
            h('h3', null, 'Recalcular histórico'),
            h('p', { class: 'texto-secundario' }, 'Depois de mudar a configuração (ou de cadastrá-la pela primeira vez, inclusive pelo Teste de LTHR), recalcule o HRSS e as calorias estimadas das atividades já registradas.'),
            mensagemRecalculo.el,
            botaoRecalculo,
          ),
        ],
      }),
      testeLthr.raiz,
      areaCalibracao,
      areaZonas,
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
        desenharZonas();
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
