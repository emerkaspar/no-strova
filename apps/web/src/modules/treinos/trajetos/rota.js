import { ajustarTrecho, carregarDetalhes, definirRota } from '../../../application/trajetos.js';
import { areaMensagem, executarComBotao } from '../../../utils/componentes.js';
import { h } from '../../../utils/dom.js';
import { seletor } from '../../../utils/listaSuspensa.js';
import { formatarData, formatarNumero } from '../../../utils/formatters.js';
import { abrirModal } from '../../../utils/modal.js';
import { mapaDeCamadas, mapaEditorDeFaixa } from './mapa.js';
import { kmTexto } from './textos.js';

const cssVar = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

/** Número digitado em km ("2,5" ou "2.5"); null se vazio ou inválido. */
function lerKm(texto) {
  const n = Number(String(texto).trim().replace(',', '.'));
  return String(texto).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

const rotuloDaPassagem = (p) => `${formatarData(p.data)} · ${kmTexto(p.distanciaM)}${p.titulo ? ` · ${p.titulo}` : ''}`;

export function textoDoResultado(r) {
  const partes = [`${r.comTrecho} de ${r.total} ${r.total === 1 ? 'passagem' : 'passagens'} com o trecho encontrado`];
  if (r.voltas > 0) partes.push(`${r.voltas} ${r.voltas === 1 ? 'volta a mais encontrada' : 'voltas a mais encontradas'} (cada volta conta como uma passagem)`);
  if (r.semCorrespondencia > 0) partes.push(`${r.semCorrespondencia} não passa${r.semCorrespondencia === 1 ? '' : 'm'} pela rota (vale a atividade inteira)`);
  if (r.semGps > 0) partes.push(`${r.semGps} sem GPS (vale a atividade inteira)`);
  if (r.preservadas > 0) partes.push(`${r.preservadas} ajustada${r.preservadas === 1 ? '' : 's'} por você, mantida${r.preservadas === 1 ? '' : 's'}`);
  return `${partes.join('; ')}.`;
}

/**
 * Cartão da rota de referência do trajeto: mostra a rota atual no mapa e deixa escolher uma atividade (inteira ou só uma
 * faixa de km) como nova referência. O servidor refaz o trecho de todas as passagens.
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function criarCartaoRota({ trajeto, passagens, rota }) {
  const destrutores = [];
  const mensagem = areaMensagem();
  const candidatas = passagens.filter((p) => p.temArquivo && p.volta === 1);
  const aberto = !rota;
  const el = h('details', { class: 'card traj-rota', open: aberto });
  const resultado = h('p', { class: 'texto-secundario', role: 'status', hidden: true });

  const resumo = h(
    'summary',
    null,
    h('h2', null, 'Rota de referência'),
    h('span', { class: 'texto-secundario' }, rota ? `${kmTexto(rota.comprimentoM)} · ${trajeto.rotaIniM != null ? 'faixa de uma atividade' : 'atividade inteira'}` : 'Ainda não definida'),
  );

  const explicacao = h(
    'p',
    { class: 'texto-secundario' },
    rota
      ? 'O sistema procura essa rota nas passagens e mede só o trecho em que você passou por ela. Para trocar, escolha outra atividade.'
      : 'Sem rota, cada passagem vale como a atividade inteira. Escolha uma atividade (ou só uma faixa dela) que represente o trajeto e o sistema acha esse trecho nas outras passagens, mesmo quando você segue por outros caminhos.',
  );

  const mapa = rota ? mapaDeCamadas({ rotulo: `Rota de referência de ${trajeto.nome}` }) : null;
  if (mapa) {
    destrutores.push(mapa.destruir);
    mapa.definir([{ lat: rota.lat, lon: rota.lon, cor: cssVar('--primary', '#ff5200'), peso: 5, pontas: true }]);
  }

  // formulário
  const lista = seletor({
    id: `rota-atividade-${trajeto.id}`,
    rotulo: 'Atividade de referência',
    opcoes: [...candidatas].reverse().map((p) => ({ valor: p.id, rotulo: rotuloDaPassagem(p) })),
    valor: trajeto.rotaAtividadeId ?? '',
  });
  lista.disabled = candidatas.length === 0;
  const soFaixa = h('input', { type: 'checkbox', id: `rota-faixa-${trajeto.id}` });
  const ini = h('input', { type: 'text', inputMode: 'decimal', id: `rota-ini-${trajeto.id}`, 'aria-label': 'Início do trecho em km', placeholder: 'ex.: 2,5', size: 6 });
  const fim = h('input', { type: 'text', inputMode: 'decimal', id: `rota-fim-${trajeto.id}`, 'aria-label': 'Fim do trecho em km', placeholder: 'ex.: 8', size: 6 });
  const campos = h('div', { class: 'traj-faixa', hidden: true }, h('label', null, 'De (km)', ini), h('label', null, 'Até (km)', fim));
  const previa = mapaEditorDeFaixa({ rotulo: 'Mapa para marcar o início e o fim do trajeto' });
  destrutores.push(previa.destruir);
  const dicaMapa = h('p', { class: 'dica', hidden: true }, 'Arraste o marcador verde (início) e o vermelho (fim) sobre o traçado. Os campos de km acompanham.');
  const previaWrap = h('div', { hidden: true }, previa.el, dicaMapa);

  // já havia uma faixa gravada na atividade de referência: começa nela, para editar em vez de refazer
  if (trajeto.rotaIniM != null && trajeto.rotaFimM != null && trajeto.rotaAtividadeId && lista.value === trajeto.rotaAtividadeId) {
    soFaixa.checked = true;
    campos.hidden = false;
    ini.value = String(trajeto.rotaIniM / 1000).replace('.', ',');
    fim.value = String(trajeto.rotaFimM / 1000).replace('.', ',');
  }

  const kmEmTexto = (km) => String(Math.round(km * 100) / 100).replace('.', ',');
  let carregada = null; // id da atividade que está desenhada no mapa
  let sequencia = 0;

  /** Reposiciona os marcadores conforme os campos de km. */
  function aplicarFaixa() {
    previa.faixa(soFaixa.checked ? lerKm(ini.value) : null, soFaixa.checked ? lerKm(fim.value) : null, soFaixa.checked);
    dicaMapa.hidden = !soFaixa.checked;
  }

  async function atualizarPrevia() {
    const id = lista.value;
    const passagem = candidatas.find((p) => p.id === id);
    if (!passagem) return;
    if (carregada === id) {
      aplicarFaixa();
      return;
    }
    const minha = ++sequencia;
    // a prévia mostra a atividade inteira, não o trecho que o trajeto já tem nela
    const detalhes = await carregarDetalhes([{ ...passagem, trecho: null }]).catch(() => null);
    if (minha !== sequencia) return;
    const perfil = detalhes?.get(id)?.perfil;
    if (!perfil?.lat || !perfil.dKm) {
      previaWrap.hidden = true;
      carregada = null;
      return;
    }
    carregada = id;
    previaWrap.hidden = false;
    previa.definir({ lat: perfil.lat, lon: perfil.lon, dKm: perfil.dKm });
    aplicarFaixa();
  }

  // arrastar um marcador preenche os campos de km
  previa.aoMudar(({ iniKm, fimKm }) => {
    ini.value = kmEmTexto(iniKm);
    fim.value = kmEmTexto(fimKm);
  });
  soFaixa.addEventListener('change', () => {
    campos.hidden = !soFaixa.checked;
    if (soFaixa.checked && (lerKm(ini.value) === null || lerKm(fim.value) === null)) {
      // sem valores ainda: começa com a atividade inteira, para o usuário só arrastar
      const distanciaM = candidatas.find((p) => p.id === lista.value)?.distanciaM;
      ini.value = '0';
      if (distanciaM) fim.value = kmEmTexto(distanciaM / 1000);
    }
    atualizarPrevia();
  });
  lista.addEventListener('change', () => {
    ini.value = '';
    fim.value = '';
    carregada = null;
    atualizarPrevia();
  });
  ini.addEventListener('input', aplicarFaixa);
  fim.addEventListener('input', aplicarFaixa);

  const botao = h('button', { class: 'btn', type: 'button', disabled: candidatas.length === 0 }, rota ? 'Trocar rota e refazer trechos' : 'Definir rota e achar os trechos');
  botao.addEventListener('click', async () => {
    resultado.hidden = true;
    let faixa = {};
    if (soFaixa.checked) {
      const a = lerKm(ini.value);
      const b = lerKm(fim.value);
      if (a === null || b === null || !(b > a)) {
        mensagem.mostrar('Informe o início e o fim do trecho em km, com o fim maior que o início.');
        return;
      }
      faixa = { iniKm: a, fimKm: b };
    }
    let resposta = null;
    const ok = await executarComBotao(botao, mensagem, async () => {
      resposta = await definirRota({ trajetoId: trajeto.id, atividadeId: lista.value, ...faixa });
    }, 'Procurando a rota nas passagens…');
    if (ok && resposta) {
      resultado.textContent = textoDoResultado(resposta);
      resultado.hidden = false;
    }
  });

  el.append(
    resumo,
    h(
      'div',
      { class: 'traj-rota-corpo' },
      explicacao,
      mapa?.el ?? null,
      candidatas.length === 0
        ? h('p', { class: 'vazio-curto' }, 'Precisa de uma atividade importada de arquivo, com GPS, neste trajeto.')
        : h(
            'div',
            { class: 'traj-rota-form' },
            h('div', { class: 'campo' }, h('label', { for: lista.id }, 'Atividade de referência'), lista),
            h('label', { class: 'traj-opcao', for: soFaixa.id }, soFaixa, ' Usar só uma parte da atividade'),
            campos,
            previaWrap,
            mensagem.el,
            botao,
            resultado,
          ),
    ),
  );
  if (candidatas.length > 0 && aberto) atualizarPrevia();
  // a prévia só carrega quando o usuário abre o cartão (evita ler a série à toa quando já há rota)
  el.addEventListener('toggle', () => {
    if (el.open) atualizarPrevia();
  });
  return { el, destruir: () => destrutores.forEach((f) => f()) };
}

/**
 * Modal para ajustar à mão o trecho de uma passagem: voltar à detecção pela rota, usar a atividade inteira ou marcar uma
 * faixa de km.
 */
export function abrirAjusteDeTrecho({ passagem, temRota }) {
  return abrirModal({
    classe: 'modal-trecho',
    rotulo: 'Ajustar o trecho do trajeto',
    conteudo: (fechar) => {
      const mensagem = areaMensagem();
      const atual = passagem.origemDoTrecho === 'inteira' ? 'inteira' : passagem.origemDoTrecho === 'manual' ? 'faixa' : 'auto';
      const opcoes = [
        ...(temRota ? [['auto', 'Automático (achar pela rota)', 'O sistema procura a rota do trajeto nesta atividade.']] : []),
        ['inteira', 'Atividade inteira', 'Mede a atividade toda, sem recortar.'],
        ['faixa', 'Marcar uma faixa', 'Informe de qual km até qual km fica o trajeto.'],
      ];
      let modo = opcoes.some(([v]) => v === atual) ? atual : opcoes[0][0];
      const ini = h('input', { type: 'text', inputMode: 'decimal', 'aria-label': 'Início em km', size: 6 });
      const fim = h('input', { type: 'text', inputMode: 'decimal', 'aria-label': 'Fim em km', size: 6 });
      const campos = h('div', { class: 'traj-faixa', hidden: modo !== 'faixa' }, h('label', null, 'De (km)', ini), h('label', null, 'Até (km)', fim));
      const radios = opcoes.map(([valor, rotulo, dica]) => {
        const radio = h('input', { type: 'radio', name: 'modo-trecho', value: valor, checked: valor === modo });
        radio.addEventListener('change', () => {
          modo = valor;
          campos.hidden = modo !== 'faixa';
        });
        return h('label', { class: 'traj-opcao traj-opcao-bloco' }, radio, h('span', null, h('strong', null, rotulo), h('small', { class: 'dica' }, dica)));
      });
      const salvar = h('button', { class: 'btn', type: 'button' }, 'Salvar');
      salvar.addEventListener('click', async () => {
        let faixa = {};
        if (modo === 'faixa') {
          const a = lerKm(ini.value);
          const b = lerKm(fim.value);
          if (a === null || b === null || !(b > a)) {
            mensagem.mostrar('Informe o início e o fim em km, com o fim maior que o início.');
            return;
          }
          faixa = { iniKm: a, fimKm: b };
        }
        const ok = await executarComBotao(salvar, mensagem, () => ajustarTrecho({ atividadeId: passagem.id, modo, ...faixa }), 'Salvando…');
        if (ok) fechar(true);
      });
      return h(
        'div',
        { class: 'modal-corpo traj-modal' },
        h('div', { class: 'modal-texto' },
          h('h2', { class: 'modal-titulo' }, 'Ajustar o trecho do trajeto'),
          h('p', { class: 'modal-mensagem' }, `Atividade de ${formatarData(passagem.data)} (${formatarNumero(passagem.distanciaM / 1000, 1)} km medidos agora).`),
          h('div', { class: 'traj-opcoes' }, ...radios),
          campos,
          mensagem.el,
          h('div', { class: 'modal-acoes' }, h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => fechar(false) }, 'Cancelar'), salvar),
        ),
      );
    },
  });
}
