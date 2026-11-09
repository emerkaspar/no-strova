import { carregarTerrenoDoTrajeto } from '../../../application/trajetos.js';
import { h } from '../../../utils/dom.js';
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
    perfilEl,
    chips,
    botao,
    temRotaDeReferencia ? null : h('p', { class: 'dica', id: 'traj-cta-dica' }, 'O botão libera quando o trajeto tem uma rota de referência.'),
  );
  return { el, destruir: () => { ativo = false; } };
}
