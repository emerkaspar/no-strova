import { carregarTerrenoDoTrajeto, carregarTrilhaDaAtividade, definirRota } from '../../../application/trajetos.js';
import { areaMensagem, executarComBotao } from '../../../utils/componentes.js';
import { h } from '../../../utils/dom.js';
import { mapaEditorDeFaixa } from './mapa.js';
import { seletorDeFaixa } from './cortador.js';
import { textoDoResultado } from './rota.js';
import { formatarNumero } from '../../../utils/formatters.js';
import { icone } from '../../../utils/icones.js';
import { FAIXAS_DE_INCLINACAO, perfilDoTerreno } from './perfilTerreno.js';
import { abrirTreinoAdaptado } from './treinoAdaptado.js';

const chip = (nomeIcone, rotulo, valor, classe = '') =>
  h('div', { class: `traj-chip ${classe}`.trim() }, h('span', { class: 'traj-chip-icone' }, icone(nomeIcone, 16)), h('div', null, h('p', { class: 'traj-chip-rotulo' }, rotulo), h('p', { class: 'traj-chip-valor' }, valor)));

const legenda = () =>
  h(
    'p',
    { class: 'traj-legenda traj-legenda-inclinacao texto-secundario' },
    h('span', { class: 'traj-legenda-titulo' }, 'Inclinação'),
    ...FAIXAS_DE_INCLINACAO.map((f) => h('span', { class: `traj-legenda-item ${f.classe}` }, h('i', { class: 'traj-ponto' }), f.rotulo)),
  );

/**
 * Cabeçalho do trajeto: nome, altimetria da rota de referência (perfil de elevação por subida, plano e descida), dados do
 * terreno e o botão em destaque "Criar treino adaptado ao trajeto".
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function criarHeroDoTrajeto({ trajeto, passagens, rota, esporte, uid, nivelInicial, aoCriarTreino }) {
  let ativo = true;
  const temRotaDeReferencia = Boolean(trajeto.rotaAtividadeId);

  // ---- altimetria ----
  const perfilEl = h('div', { class: 'traj-hero-perfil' });
  const chips = h('div', { class: 'traj-chips' });
  const semAltimetria = (texto) => perfilEl.replaceChildren(h('p', { class: 'traj-hero-vazio' }, icone('elevacao', 20), h('span', null, texto)));

  if (!temRotaDeReferencia) {
    semAltimetria('Defina a rota de referência do trajeto (mais abaixo) para ver a altimetria e criar o treino adaptado.');
  } else {
    perfilEl.replaceChildren(h('p', { class: 'traj-hero-vazio', role: 'status' }, h('span', { class: 'traj-hero-carregando' }), h('span', null, 'Lendo a altimetria…')));
    carregarTerrenoDoTrajeto(trajeto).then((terreno) => {
      if (!ativo) return;
      if (!terreno) {
        semAltimetria('A atividade de referência não tem altimetria. Escolha outra como rota de referência.');
        return;
      }
      const { resumo, segmentos } = terreno;
      const maiorSubida = segmentos.filter((s) => s.tipo === 'subida').sort((a, b) => b.ganhoM - a.ganhoM)[0] ?? null;
      perfilEl.replaceChildren(perfilDoTerreno({ perfil: terreno.perfil, segmentos, cor: 'terreno', altura: 210 }), legenda());
      chips.replaceChildren(
        chip('distancia', 'Distância', `${formatarNumero(resumo.distanciaM / 1000, 1)} km`),
        chip('setaCima', 'Ganho', `+${formatarNumero(resumo.ganhoTotalM, 0)} m`, 'traj-chip-subida'),
        chip('setaBaixo', 'Perda', `−${formatarNumero(resumo.perdaTotalM, 0)} m`, 'traj-chip-descida'),
        chip('elevacao', 'Altitude', `${formatarNumero(terreno.altMin, 0)}–${formatarNumero(terreno.altMax, 0)} m`),
        maiorSubida ? chip('chama', 'Maior subida', `${formatarNumero(maiorSubida.distanciaM / 1000, 1)} km a ${formatarNumero(maiorSubida.gradienteMedio, 1)}%`, 'traj-chip-destaque') : null,
      );
    });
  }

  // ---- mapa da rota, com início e fim editáveis ----
  const mapaWrap = h('div', { class: 'traj-hero-mapa', hidden: true });
  let editor = null;
  if (temRotaDeReferencia) {
    carregarTrilhaDaAtividade(trajeto.rotaAtividadeId).then((trilha) => {
      if (!ativo || !trilha) return;
      const finitos = trilha.dKm.filter((d) => Number.isFinite(d));
      const totalKm = finitos[finitos.length - 1] ?? 0;
      const iniSalvo = Number.isFinite(trajeto.rotaIniM) ? trajeto.rotaIniM / 1000 : null;
      const fimSalvo = Number.isFinite(trajeto.rotaFimM) ? trajeto.rotaFimM / 1000 : null;
      let atual = { iniKm: iniSalvo ?? 0, fimKm: fimSalvo ?? totalKm };

      editor = mapaEditorDeFaixa({ rotulo: `Mapa do trajeto ${trajeto.nome}` });
      editor.definir(trilha);
      editor.faixa(iniSalvo, fimSalvo, false);

      const mensagem = areaMensagem();
      const resultado = h('p', { class: 'texto-secundario', role: 'status', hidden: true });
      const leitura = h('span', { class: 'texto-secundario traj-hero-mapa-leitura' });
      const dica = h('p', { class: 'dica', hidden: true }, 'Arraste as alças no gráfico (ou os marcadores no mapa) e clique em Salvar. O app refaz o trecho de todas as passagens.');
      const mostrarLeitura = () => {
        leitura.textContent = `De ${formatarNumero(atual.iniKm, 2)} km até ${formatarNumero(atual.fimKm, 2)} km (${formatarNumero(atual.fimKm - atual.iniKm, 2)} km)`;
      };
      const textoParado = () => {
        leitura.textContent = `Percurso de ${formatarNumero(atual.fimKm - atual.iniKm, 1)} km (início e fim marcados no mapa)`;
      };
      textoParado();
      // gráfico de corte (como no Strava e no Garmin): alças de início e fim sobre o perfil da atividade inteira.
      // Escolhe pela distância, então serve também quando o traçado passa duas vezes no mesmo lugar (voltas).
      const corte = seletorDeFaixa({
        dKm: trilha.dKm,
        alt: trilha.alt,
        totalKm,
        aoMudar: ({ iniKm, fimKm }) => {
          atual = { iniKm, fimKm };
          editor.faixa(iniKm, fimKm, true);
          mostrarLeitura();
        },
      });
      const sincronizarSliders = () => corte.definir(atual.iniKm, atual.fimKm);
      const sliders = h(
        'div',
        { class: 'traj-hero-mapa-corte', hidden: true },
        h('p', { class: 'texto-secundario' }, 'Arraste as alças verde (início) e vermelha (fim) no gráfico para cortar o trajeto, como no Strava e no Garmin.'),
        corte.el,
      );
      const botaoEditar = h('button', { class: 'btn traj-hero-mapa-editar', type: 'button' }, icone('lapis', 18), ' Editar início e fim');
      const botaoSalvar = h('button', { class: 'btn', type: 'button', hidden: true }, 'Salvar');
      const botaoCancelar = h('button', { class: 'btn btn-secundario', type: 'button', hidden: true }, 'Cancelar');
      const alternar = (editando) => {
        botaoEditar.hidden = editando;
        botaoSalvar.hidden = !editando;
        botaoCancelar.hidden = !editando;
        dica.hidden = !editando;
        sliders.hidden = !editando;
        resultado.hidden = true;
        mensagem.limpar?.();
        editor.faixa(editando ? atual.iniKm : iniSalvo, editando ? atual.fimKm : fimSalvo, editando);
        if (editando) {
          sincronizarSliders();
          mostrarLeitura();
        }
        else textoParado();
      };
      editor.aoMudar((f) => {
        atual = f;
        sincronizarSliders();
        mostrarLeitura();
      });
      botaoEditar.addEventListener('click', () => alternar(true));
      botaoCancelar.addEventListener('click', () => {
        atual = { iniKm: iniSalvo ?? 0, fimKm: fimSalvo ?? totalKm };
        alternar(false);
      });
      botaoSalvar.addEventListener('click', async () => {
        if (!(atual.fimKm > atual.iniKm)) {
          mensagem.mostrar('O fim precisa ficar depois do início.');
          return;
        }
        let resposta = null;
        const ok = await executarComBotao(botaoSalvar, mensagem, async () => {
          resposta = await definirRota({ trajetoId: trajeto.id, atividadeId: trajeto.rotaAtividadeId, iniKm: atual.iniKm, fimKm: atual.fimKm });
        }, 'Refazendo os trechos…');
        if (ok && resposta) {
          resultado.textContent = textoDoResultado(resposta);
          resultado.hidden = false;
          botaoEditar.hidden = false;
          botaoSalvar.hidden = true;
          botaoCancelar.hidden = true;
          dica.hidden = true;
          sliders.hidden = true;
          editor.faixa(atual.iniKm, atual.fimKm, false);
          textoParado();
        }
      });
      mapaWrap.replaceChildren(
        h('div', { class: 'traj-hero-mapa-barra' }, leitura, botaoEditar, botaoCancelar, botaoSalvar),
        editor.el,
        sliders,
        dica,
        mensagem.el,
        resultado,
      );
      mapaWrap.hidden = false;
    });
  }

  // ---- botão em destaque ----
  const botao = h(
    'button',
    { class: 'traj-cta', type: 'button', disabled: !temRotaDeReferencia, 'aria-describedby': temRotaDeReferencia ? null : 'traj-cta-dica' },
    h('span', { class: 'traj-cta-icone' }, icone('ia', 26)),
    h('span', { class: 'traj-cta-texto' }, h('strong', null, 'Criar treino adaptado ao trajeto'), h('small', null, 'Intervalos que seguem cada subida e descida, ou meta para zerar o seu recorde.')),
    h('span', { class: 'traj-cta-seta' }, icone('seta', 22)),
  );
  botao.addEventListener('click', async () => {
    const r = await abrirTreinoAdaptado({ uid, trajeto: { id: trajeto.id, nome: trajeto.nome }, esporte, nivelInicial });
    if (r?.salvo) aoCriarTreino?.(r);
  });

  const n = passagens.length;
  const subtitulo = n === 0 ? 'Nenhuma atividade neste trajeto ainda.' : `${n} ${n === 1 ? 'passagem' : 'passagens'}${rota ? ', medidas no trecho que acompanha a rota de referência' : ', medidas na atividade inteira (defina a rota de referência para medir só o trecho)'}.`;

  const el = h(
    'section',
    { class: 'card traj-hero' },
    h('div', { class: 'traj-hero-topo' },
      h('span', { class: 'traj-hero-marca' }, icone('rota', 24)),
      h('div', { class: 'traj-hero-titulo' }, h('h2', null, trajeto.nome), h('p', { class: 'texto-secundario' }, subtitulo)),
    ),
    mapaWrap,
    perfilEl,
    chips,
    botao,
    temRotaDeReferencia ? null : h('p', { class: 'dica', id: 'traj-cta-dica' }, 'O botão libera quando o trajeto tem uma rota de referência.'),
  );
  return { el, destruir: () => { ativo = false; editor?.destruir(); } };
}
