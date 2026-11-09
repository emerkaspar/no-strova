import { composicaoCorporal, MEDIDAS, pesoNaData, relacaoCinturaAltura, relacaoCinturaQuadril, somarDias, variacaoDeMedida, vereditoDaEvolucao } from '@no-strova/domain';
import { salvarMedidas } from '../../application/medidas.js';
import { excluirMedidas, idDasMedidas } from '../../infrastructure/medidasRepo.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { criarAbas } from '../../utils/abas.js';
import { graficoLinha } from '../../utils/graficoLinha.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';
import { cartao } from './cartaoIndicador.js';
import { PERIODOS_DO_PESO } from './graficoPeso.js';
import { criarGuiaDeMedidas } from './guiaMedidas.js';
import { criarPopoversDeMedidas, guiaDoIndicador } from './medidasPopover.js';

const montar = (el, ...filhos) => el.replaceChildren(...filhos.filter((f) => f !== null && f !== undefined));
const cm = (v) => `${formatarNumero(v, 1)} cm`;
const comSinal = (v, casas = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), casas)}`;
const porData = (a, b) => (a.data < b.data ? -1 : 1);
const segundos = (data) => Date.parse(`${data}T12:00:00Z`) / 1000;

/** Medidas em que a redução é boa notícia (gordura central): o aumento fica em vermelho, a queda em verde. */
const CENTRAIS = new Set(['cinturaCm', 'abdomenCm']);
const VEREDITO_CLASSE = Object.freeze({ ok: 'atinge', atencao: 'acima', alerta: 'abaixo', neutro: 'sem-dados' });

const SERIES_CALCULADAS = Object.freeze([
  { valor: 'gorduraPct', rotulo: '% de gordura (estimado)', unidade: '%' },
  { valor: 'massaMagraKg', rotulo: 'Massa magra (estimada)', unidade: 'kg' },
]);

/**
 * Seção "Medidas corporais" da tela de Peso: resumo com indicadores, evolução, registro, guia de como medir e histórico.
 * `dados` é o objeto compartilhado da tela (pesagens, medidas, configs); `perfil()` devolve { sexo, alturaCm }.
 * @returns {{ el: HTMLElement, desenhar: () => void, fechar: () => void }}
 */
export function criarSecaoMedidas({ sessao, dados, hoje, perfil, erroGeral }) {
  const popovers = criarPopoversDeMedidas();
  let campoDoGrafico = 'cinturaCm';
  let periodoId = '90d';
  let carregou = false;
  let abas = null;

  const ordenadas = () => [...dados.medidas].sort(porData);

  // ---- painéis
  const painelResumo = h('div', { class: 'medidas-painel' });
  const painelEvolucao = h('div', { class: 'medidas-painel' });
  const painelRegistro = h('div', { class: 'medidas-painel' });
  const painelGuia = h('div', { class: 'medidas-painel' });
  const painelHistorico = h('div', { class: 'medidas-painel' });

  const irParaRegistro = () => abas.selecionar('registrar');
  const irParaGuia = () => abas.selecionar('como-medir');

  // ---- resumo
  function nota(valor, bomSeCair) {
    if (valor === null || valor === 0) return null;
    return { texto: comSinal(valor), classe: (valor < 0) === bomSeCair ? 'peso-ok' : 'peso-alerta' };
  }

  function desenharResumo() {
    popovers.fechar();
    const registros = ordenadas();
    if (registros.length === 0) {
      montar(
        painelResumo,
        estadoVazio(carregou ? 'Nenhuma medição ainda. Meça com a fita e registre para acompanhar a evolução além do peso.' : 'Carregando…'),
        carregou
          ? h('div', { class: 'medidas-acoes' }, h('button', { class: 'btn', type: 'button', onClick: irParaGuia }, 'Ver como medir'), h('button', { class: 'btn btn-secundario', type: 'button', onClick: irParaRegistro }, 'Registrar medidas'))
          : null,
      );
      return;
    }
    const { sexo, alturaCm } = perfil();
    const ultimo = registros[registros.length - 1];
    const anterior = registros.length > 1 ? registros[registros.length - 2] : null;
    const composicao = (r) => (r ? composicaoCorporal(r, { sexo, alturaCm, pesoKg: pesoNaData(dados.pesagens, r.data) }) : null);
    const compUltimo = composicao(ultimo);
    const compAnterior = composicao(anterior);

    const cartoes = [];
    const comGuia = (el, id, rotulo) => popovers.ligar(el, guiaDoIndicador(id, rotulo));

    if (compUltimo) {
      const dGordura = compAnterior ? Math.round((compUltimo.gorduraPct - compAnterior.gorduraPct) * 10) / 10 : null;
      const dMassaGorda = compAnterior ? Math.round((compUltimo.massaGordaKg - compAnterior.massaGordaKg) * 10) / 10 : null;
      const dMassaMagra = compAnterior ? Math.round((compUltimo.massaMagraKg - compAnterior.massaMagraKg) * 10) / 10 : null;
      const comDelta = (base, d, unidade, bomSeCair) => {
        const n = nota(d, bomSeCair);
        return n ? `${base} · ${n.texto} ${unidade} desde a anterior` : base;
      };
      cartoes.push(
        comGuia(cartao({ rotulo: '% de gordura', nomeIcone: 'perfil', valor: `${formatarNumero(compUltimo.gorduraPct, 1)} %`, nota: comDelta(compUltimo.faixa?.rotulo ?? 'Estimativa', dGordura, 'pt', true), gravidade: compUltimo.faixa?.gravidade ?? '' }), 'gordura'),
        comGuia(cartao({ rotulo: 'Massa gorda', nomeIcone: 'peso', valor: `${formatarNumero(compUltimo.massaGordaKg, 1)} kg`, nota: comDelta('Estimada', dMassaGorda, 'kg', true) }), 'massaGorda'),
        comGuia(cartao({ rotulo: 'Massa magra', nomeIcone: 'esporte', valor: `${formatarNumero(compUltimo.massaMagraKg, 1)} kg`, nota: comDelta('Estimada', dMassaMagra, 'kg', false) }), 'massaMagra'),
      );
    }

    const rcq = relacaoCinturaQuadril(sexo, ultimo);
    if (rcq) {
      cartoes.push(
        comGuia(
          cartao({
            rotulo: 'Cintura/quadril',
            nomeIcone: 'regua',
            valor: formatarNumero(rcq.valor, 2),
            gravidade: rcq.gravidade ?? '',
            nota: rcq.limite === null ? 'Informe o sexo na Configuração' : rcq.gravidade === 'ok' ? `Dentro do esperado (até ${formatarNumero(rcq.limite, 2)})` : `Acima de ${formatarNumero(rcq.limite, 2)}: risco aumentado`,
          }),
          'cinturaQuadril',
        ),
      );
    }
    const rca = relacaoCinturaAltura(ultimo, alturaCm);
    if (rca) {
      const textos = { ok: 'Cintura abaixo da metade da altura', atencao: 'Atenção: entre 0,50 e 0,59', alerta: 'Risco alto: 0,60 ou mais' };
      cartoes.push(comGuia(cartao({ rotulo: 'Cintura/altura', nomeIcone: 'regua', valor: formatarNumero(rca.valor, 2), gravidade: rca.gravidade, nota: textos[rca.gravidade] }), 'cinturaAltura'));
    }

    // por que a gordura não foi calculada
    const faltas = [];
    if (!compUltimo) {
      if (!sexo) faltas.push('o sexo');
      if (!alturaCm) faltas.push('a altura');
      if (pesoNaData(dados.pesagens, ultimo.data) === null) faltas.push('uma pesagem até a data da medição');
      if (!(ultimo.pescocoCm > 0)) faltas.push('a medida do pescoço');
      if (sexo === 'feminino') {
        if (!(ultimo.cinturaCm > 0)) faltas.push('a cintura');
        if (!(ultimo.quadrilCm > 0)) faltas.push('o quadril');
      } else if (!(ultimo.abdomenCm > 0)) {
        faltas.push('o abdômen');
      }
    }
    const aviso =
      faltas.length > 0
        ? h(
            'p',
            { class: 'mensagem mensagem-aviso' },
            `Para estimar a gordura corporal falta: ${faltas.join(', ')}. `,
            !sexo || !alturaCm ? h('a', { href: '#/configuracao' }, 'Abrir a Configuração') : null,
          )
        : null;

    // cada medida com a última leitura, a variação desde a anterior e desde a primeira
    const medidasCartoes = MEDIDAS.map((m) => {
      const leituras = registros.filter((r) => Number.isFinite(r[m.campo]));
      if (leituras.length === 0) return null;
      const atual = leituras[leituras.length - 1];
      const antes = leituras.length > 1 ? leituras[leituras.length - 2] : null;
      const primeira = leituras[0];
      const bomSeCair = CENTRAIS.has(m.campo);
      const dAnterior = antes ? variacaoDeMedida(m.campo, antes, atual) : null;
      const dPrimeira = leituras.length > 2 ? variacaoDeMedida(m.campo, primeira, atual) : null;
      const n = nota(dAnterior, bomSeCair);
      const cor = (d) => (!CENTRAIS.has(m.campo) || d === 0 || d === null ? '' : (d < 0) === bomSeCair ? 'peso-ok' : 'peso-alerta');
      return comGuia(
        cartao({
          rotulo: m.rotulo,
          nomeIcone: 'regua',
          valor: cm(atual[m.campo]),
          nota: antes ? (dAnterior === 0 ? `Igual a ${formatarData(antes.data).slice(0, 5)}` : `${n.texto} cm desde ${formatarData(antes.data).slice(0, 5)}`) : `em ${formatarData(atual.data)}`,
          classeNota: cor(dAnterior),
          extra: dPrimeira === null ? null : h('div', { class: `medidas-desde ${cor(dPrimeira)}` }, `${comSinal(dPrimeira)} cm desde a primeira (${formatarData(primeira.data).slice(0, 5)})`),
        }),
        'medida',
        m.rotulo,
      );
    }).filter(Boolean);

    const veredito = vereditoDaEvolucao(registros, { sexo, alturaCm, pesagens: dados.pesagens });
    montar(
      painelResumo,
      h('p', { class: 'texto-secundario' }, `Última medição em ${formatarData(ultimo.data)} · ${registros.length} ${registros.length === 1 ? 'medição' : 'medições'}. Toque em um cartão para ver o que o número significa.`),
      h('div', { class: `meta-resultado meta-${VEREDITO_CLASSE[veredito.gravidade]}`, role: 'status' }, h('p', null, veredito.texto)),
      aviso,
      cartoes.length > 0 ? h('div', { class: 'ativ-recordes-grade' }, ...cartoes) : null,
      h('h3', { class: 'medidas-subtitulo' }, 'Cada medida'),
      h('div', { class: 'ativ-recordes-grade' }, ...medidasCartoes),
      h('p', { class: 'texto-secundario medidas-rodape' }, 'Os percentuais e as massas são estimativas pela fita métrica: servem para acompanhar a tendência, não para diagnóstico.'),
    );
  }

  // ---- evolução
  const seletorDeMedida = selecao({
    id: 'medidas-grafico-campo',
    rotulo: 'O que acompanhar',
    opcoes: [...MEDIDAS.map((m) => ({ valor: m.campo, rotulo: m.rotulo })), ...SERIES_CALCULADAS.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))],
    valor: campoDoGrafico,
  });
  seletorDeMedida.select.addEventListener('change', () => {
    campoDoGrafico = seletorDeMedida.select.value;
    desenharGrafico();
  });
  const areaGrafico = h('div', { class: 'medidas-grafico' });

  function serieDo(campoEscolhido) {
    const { sexo, alturaCm } = perfil();
    const pontos = [];
    for (const r of ordenadas()) {
      let y = null;
      if (campoEscolhido === 'gorduraPct' || campoEscolhido === 'massaMagraKg') {
        const c = composicaoCorporal(r, { sexo, alturaCm, pesoKg: pesoNaData(dados.pesagens, r.data) });
        y = c ? c[campoEscolhido] : null;
      } else if (Number.isFinite(r[campoEscolhido])) {
        y = r[campoEscolhido];
      }
      if (y !== null) pontos.push({ data: r.data, y });
    }
    return pontos;
  }

  function desenharGrafico() {
    const periodo = PERIODOS_DO_PESO.find((p) => p.id === periodoId) ?? PERIODOS_DO_PESO[1];
    const todos = serieDo(campoDoGrafico);
    const pontos = periodo.dias === null ? todos : todos.filter((p) => p.data >= somarDias(hoje, -periodo.dias));
    const calculada = SERIES_CALCULADAS.find((s) => s.valor === campoDoGrafico);
    const rotulo = calculada ? calculada.rotulo : MEDIDAS.find((m) => m.campo === campoDoGrafico)?.rotulo ?? '';
    const unidade = calculada ? calculada.unidade : 'cm';
    const chips = h(
      'div',
      { class: 'ativ-grupo', role: 'group', 'aria-label': 'Período do gráfico' },
      ...PERIODOS_DO_PESO.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: `ativ-chip${p.id === periodoId ? ' ativo' : ''}`,
            'aria-pressed': String(p.id === periodoId),
            onClick: () => {
              periodoId = p.id;
              desenharGrafico();
            },
          },
          p.rotulo,
        ),
      ),
    );
    let corpo;
    if (pontos.length < 2) {
      const semDados = todos.length < 2;
      corpo = estadoVazio(
        !carregou
          ? 'Carregando…'
          : semDados
            ? calculada
              ? 'Ainda não há duas medições com dados suficientes para calcular. Veja o aviso no Resumo.'
              : `Registre ao menos duas medições de ${rotulo.toLowerCase()} para ver o gráfico.`
            : 'Há menos de duas medições no período escolhido. Tente um período maior.',
      );
    } else {
      corpo = graficoLinha({ x: pontos.map((p) => segundos(p.data)), y: pontos.map((p) => p.y) }, {
        rotuloY: `${unidade} (${rotulo.toLowerCase()})`,
        formatarX: (v) => formatarData(new Date(v * 1000).toISOString().slice(0, 10)),
        formatarY: (v) => formatarNumero(v, 1),
      });
      corpo.querySelector('svg')?.setAttribute('aria-label', `Gráfico de ${rotulo.toLowerCase()} em ${unidade} ao longo do tempo, de ${formatarData(pontos[0].data)} a ${formatarData(pontos[pontos.length - 1].data)}`);
    }
    montar(areaGrafico, h('div', { class: 'medidas-grafico-topo' }, h('h3', { class: 'medidas-subtitulo' }, `${rotulo} (${unidade})`), chips), corpo);
  }

  montar(painelEvolucao, seletorDeMedida.raiz, areaGrafico);

  // ---- registro
  const dataCampo = campo({ id: 'medidas-data', rotulo: 'Data da medição', tipo: 'date', value: hoje, max: hoje });
  const campos = new Map();
  const botaoAjuda = (m) =>
    h(
      'button',
      {
        class: 'medidas-ajuda',
        type: 'button',
        'aria-label': `Como medir: ${m.rotulo}`,
        title: 'Como medir',
        onClick: () => {
          irParaGuia();
          document.getElementById(`medidas-guia-${m.campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
      },
      icone('info', 14),
    );
  const criarCampo = (m) => {
    const c = campo({ id: `medidas-${m.campo}`, rotulo: m.rotulo, inputmode: 'decimal', placeholder: 'cm', autocomplete: 'off' });
    c.raiz.querySelector('label').append(' ', botaoAjuda(m));
    campos.set(m.campo, c.input);
    return c.raiz;
  };
  const msgRegistro = areaMensagem();
  const botaoRegistro = h('button', { class: 'btn', type: 'submit' }, 'Registrar medidas');
  const formRegistro = h(
    'form',
    {
      class: 'medidas-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botaoRegistro, msgRegistro, async () => {
          const entrada = { data: dataCampo.input.value };
          for (const [nome, input] of campos) entrada[nome] = input.value;
          await salvarMedidas({ uid: sessao.uid, entrada, hoje });
          for (const input of campos.values()) input.value = '';
          msgRegistro.mostrar('Medidas registradas.', 'ok');
        });
      },
    },
    h('div', { class: 'medidas-form-data' }, dataCampo.raiz),
    h('h3', { class: 'medidas-subtitulo' }, 'Tronco'),
    h('div', { class: 'medidas-form-grade' }, ...MEDIDAS.filter((m) => m.grupo === 'tronco').map(criarCampo)),
    h('h3', { class: 'medidas-subtitulo' }, 'Braço e pernas (lado direito)'),
    h('div', { class: 'medidas-form-grade' }, ...MEDIDAS.filter((m) => m.grupo === 'membros').map(criarCampo)),
    h('p', { class: 'texto-secundario' }, 'Preencha só o que mediu: nenhuma medida é obrigatória, mas pescoço e abdômen (homens) ou pescoço, cintura e quadril (mulheres) permitem estimar a gordura corporal. Registrar de novo no mesmo dia substitui o anterior.'),
    h('div', { class: 'medidas-acoes' }, botaoRegistro),
  );

  function atualizarPlaceholders() {
    const registros = ordenadas();
    for (const [nome, input] of campos) {
      const ultima = [...registros].reverse().find((r) => Number.isFinite(r[nome]));
      input.placeholder = ultima ? `última: ${formatarNumero(ultima[nome], 1)}` : 'cm';
    }
  }

  montar(painelRegistro, formRegistro, msgRegistro.el);

  // ---- como medir
  montar(painelGuia, criarGuiaDeMedidas({ aoAbrirRegistro: irParaRegistro }));

  // ---- histórico
  function desenharHistorico() {
    const lista = ordenadas().reverse();
    montar(
      painelHistorico,
      lista.length === 0
        ? estadoVazio(carregou ? 'Nenhuma medição ainda.' : 'Carregando…')
        : h(
            'div',
            { class: 'tabela-wrap' },
            h(
              'table',
              { class: 'tabela tabela-compacta' },
              h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Data'), ...MEDIDAS.map((m) => h('th', { scope: 'col', title: m.rotulo }, m.rotulo.replace(' direito', '').replace(' direita', ''))), h('th', { scope: 'col' }, ''))),
              h(
                'tbody',
                null,
                ...lista.slice(0, 60).map((r) =>
                  h(
                    'tr',
                    null,
                    h('td', null, formatarData(r.data)),
                    ...MEDIDAS.map((m) => h('td', { class: 'celula-hrss' }, Number.isFinite(r[m.campo]) ? formatarNumero(r[m.campo], 1) : '—')),
                    h(
                      'td',
                      null,
                      h(
                        'button',
                        {
                          class: 'btn btn-secundario btn-pequeno',
                          type: 'button',
                          'aria-label': `Excluir as medidas de ${formatarData(r.data)}`,
                          onClick: async () => {
                            const confirmado = await confirmar({
                              titulo: 'Excluir medidas?',
                              mensagem: `As medidas de ${formatarData(r.data)} serão apagadas e não poderão ser recuperadas.`,
                              tipo: 'perigo',
                              icone: 'lixeira',
                              confirmarTexto: 'Excluir',
                            });
                            if (!confirmado) return;
                            excluirMedidas(r.id ?? idDasMedidas(sessao.uid, r.data)).catch(() => erroGeral.mostrar('Não foi possível excluir as medidas.'));
                          },
                        },
                        'Excluir',
                      ),
                    ),
                  ),
                ),
              ),
            ),
            lista.length > 60 ? h('p', { class: 'texto-secundario' }, `Mostrando as 60 mais recentes de ${lista.length}.`) : null,
          ),
    );
  }

  abas = criarAbas({
    chave: 'peso-medidas',
    rotuloAria: 'Medidas corporais',
    abas: [
      { id: 'resumo', nome: 'Resumo', icone: 'perfil', painel: painelResumo },
      { id: 'evolucao', nome: 'Evolução', icone: 'atividades', painel: painelEvolucao },
      { id: 'registrar', nome: 'Registrar', icone: 'lapis', painel: painelRegistro },
      { id: 'como-medir', nome: 'Como medir', icone: 'regua', painel: painelGuia },
      { id: 'historico', nome: 'Histórico', icone: 'calendario', painel: painelHistorico },
    ],
  });

  const el = h(
    'section',
    { class: 'card medidas-cartao' },
    h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Medidas corporais')),
    h('p', { class: 'texto-secundario' }, 'O peso sozinho não mostra se você perde gordura ou ganha músculo. Com a fita métrica e a balança, o app estima a gordura e a massa magra e mostra a evolução das medidas.'),
    abas.lista,
    ...abas.paineis,
  );

  function desenhar() {
    carregou = true;
    desenharResumo();
    desenharGrafico();
    desenharHistorico();
    atualizarPlaceholders();
  }

  // primeiro desenho, ainda sem dados (mostra "Carregando…")
  carregou = false;
  desenharResumo();
  desenharGrafico();
  desenharHistorico();

  return { el, desenhar, atualizar: () => { desenharResumo(); desenharGrafico(); }, fechar: popovers.fechar };
}
