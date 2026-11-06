import { h } from '../../utils/dom.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { horaDoInicio } from '../atividades/abrirDoDia.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

const ATRASO_FECHAR_MS = 120;
const MARGEM = 8;

const ehNumero = (v) => Number.isFinite(v) && v > 0;

/** Velocidade média: ritmo em min/km na corrida, km/h nos demais esportes. */
function textoVelocidade(a) {
  if (!ehNumero(a.velocidadeMs)) return null;
  if (a.esporte === 'corrida') {
    const s = Math.round(1000 / a.velocidadeMs);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
  }
  return `${formatarNumero(a.velocidadeMs * 3.6, 1)} km/h`;
}

function linhaDeDado(rotulo, valor) {
  return h('div', { class: 'dia-pop-dado' }, h('dt', null, rotulo), h('dd', null, valor));
}

function blocoDeAtividade(a, totalRealizado) {
  const hora = horaDoInicio(a);
  const dados = [
    ehNumero(a.distanciaM) ? linhaDeDado('Distância', formatarDistancia(a.distanciaM)) : null,
    ehNumero(a.duracaoS) ? linhaDeDado('Duração', formatarDuracao(a.duracaoS)) : null,
    textoVelocidade(a) ? linhaDeDado(a.esporte === 'corrida' ? 'Ritmo' : 'Vel. média', textoVelocidade(a)) : null,
    ehNumero(a.fcMedia) ? linhaDeDado('FC média', `${formatarNumero(a.fcMedia, 0)} bpm`) : null,
    ehNumero(a.fcMax) ? linhaDeDado('FC máxima', `${formatarNumero(a.fcMax, 0)} bpm`) : null,
    Number.isFinite(a.hrss)
      ? linhaDeDado('HRSS', totalRealizado > 0 ? `${formatarNumero(a.hrss, 0)} · ${formatarNumero((a.hrss / totalRealizado) * 100, 0)}% da semana` : formatarNumero(a.hrss, 0))
      : null,
  ].filter(Boolean);
  return h(
    'section',
    { class: 'dia-pop-bloco' },
    h('p', { class: 'dia-pop-nome' }, a.titulo || ROTULO_ESPORTE[a.esporte] || a.esporte, hora ? h('span', { class: 'dia-pop-hora' }, ` · ${hora}`) : null),
    h('p', { class: 'dia-pop-sub' }, ROTULO_ESPORTE[a.esporte] ?? a.esporte),
    dados.length > 0 ? h('dl', { class: 'dia-pop-dados' }, ...dados) : null,
    h('a', { class: 'dia-pop-link', href: `#/atividades/${a.id}` }, 'Ver atividade →'),
  );
}

function blocoDeTreino(t) {
  const dados = [
    t.zona ? linhaDeDado('Zona', String(t.zona)) : null,
    ehNumero(t.duracaoMin) ? linhaDeDado('Duração prevista', formatarDuracao(t.duracaoMin * 60)) : null,
  ].filter(Boolean);
  // treino estruturado: perfil em barras (largura = tempo; altura e cor = zona de FC)
  const perfil = Array.isArray(t.passos) && t.passos.length > 0 ? perfilDoTreino(t.passos) : null;
  return h(
    'section',
    { class: 'dia-pop-bloco dia-pop-plano' },
    h('p', { class: 'dia-pop-nome' }, t.nomeTreino || `${ROTULO_ESPORTE[t.esporte] ?? t.esporte} ${t.zona ?? ''}`.trim()),
    h('p', { class: 'dia-pop-sub' }, `Planejado · ${ROTULO_ESPORTE[t.esporte] ?? t.esporte}`),
    perfil ? h('div', { class: 'dia-pop-perfil' }, perfil) : null,
    ehNumero(t.estresseProjetado)
      ? h('p', { class: 'dia-pop-hrss' }, h('span', { class: 'dia-pop-hrss-valor' }, `~${formatarNumero(t.estresseProjetado, 0)}`), h('span', { class: 'dia-pop-hrss-rotulo' }, 'HRSS projetado'))
      : null,
    dados.length > 0 ? h('dl', { class: 'dia-pop-dados' }, ...dados) : null,
    h('a', { class: 'dia-pop-link', href: '#/plano' }, 'Ver no plano →'),
  );
}

/** "Previsto 40 → Feito 51 (+28%)": só quando o dia tem treino realizado e planejado. */
function comparacaoPrevistoFeito(dia) {
  if (!(dia.realizado > 0 && dia.planejado > 0)) return null;
  const variacao = ((dia.realizado - dia.planejado) / dia.planejado) * 100;
  const sinal = variacao > 0 ? '+' : variacao < 0 ? '−' : '';
  return h(
    'p',
    { class: 'dia-pop-comparacao' },
    `Previsto ${formatarNumero(dia.planejado, 0)} → Feito ${formatarNumero(dia.realizado, 0)} (${sinal}${formatarNumero(Math.abs(variacao), 0)}%)`,
  );
}

function conteudoDoDia({ dia, atividades, treinos, totalRealizado }) {
  const planejados = dia.hoje || dia.futuro ? treinos.filter((t) => t.status === 'planejado') : [];
  const blocos = [...atividades.map((a) => blocoDeAtividade(a, totalRealizado)), ...planejados.map(blocoDeTreino)];
  return [
    h('p', { class: 'dia-pop-titulo' }, `${dia.nome}, ${formatarData(dia.data)}`),
    ...blocos,
    comparacaoPrevistoFeito(dia),
    blocos.length === 0
      ? h('p', { class: 'dia-pop-vazio' }, dia.futuro ? 'Livre. Nada planejado para este dia.' : 'Descanso. Nenhum treino registrado.')
      : null,
  ];
}

/**
 * Cartão flutuante com o detalhe de cada dia da semana. Abre ao passar o mouse, ao focar (teclado) e ao tocar
 * (mobile); fecha com Esc, tocando fora ou saindo da coluna. Um único cartão é reaproveitado por todas as colunas.
 * @param {HTMLElement} coluna o `li` do dia (vira focável)
 * @param {{ dia: any, atividades: any[], treinos: any[], totalRealizado: number }} dados
 * @param {{ abrir: Function, fechar: Function }} controle compartilhado entre as colunas (ver criarControlePopover)
 */
export function ligarPopoverDoDia(coluna, dados, controle) {
  coluna.tabIndex = 0;
  coluna.classList.add('dia-interativo');
  const abrir = () => controle.abrir(coluna, () => conteudoDoDia(dados));
  coluna.addEventListener('mouseenter', abrir);
  coluna.addEventListener('mouseleave', controle.agendarFechar);
  coluna.addEventListener('focus', abrir);
  coluna.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (controle.coluna() === coluna && controle.fixado()) controle.fechar();
    else controle.abrir(coluna, () => conteudoDoDia(dados), { fixar: true });
  });
}

/** Controle compartilhado: cria o cartão sob demanda, posiciona e cuida dos listeners globais enquanto aberto. */
export function criarControlePopover() {
  let cartao = null;
  let colunaAtual = null;
  let fixado = false;
  let temporizador = null;

  const aoTecla = (e) => {
    if (e.key === 'Escape') fechar();
  };
  const aoClicarFora = (e) => {
    if (cartao?.contains(e.target) || colunaAtual?.contains(e.target)) return;
    fechar();
  };

  function posicionar() {
    if (!cartao || !colunaAtual) return;
    const alvo = colunaAtual.getBoundingClientRect();
    const { width, height } = cartao.getBoundingClientRect();
    const esquerda = Math.min(Math.max(MARGEM, alvo.left + alvo.width / 2 - width / 2), window.innerWidth - width - MARGEM);
    // acima da coluna quando cabe; senão abaixo dela
    const acima = alvo.top - height - MARGEM;
    const topo = acima >= MARGEM ? acima : Math.min(alvo.bottom + MARGEM, Math.max(MARGEM, window.innerHeight - height - MARGEM));
    cartao.style.left = `${esquerda}px`;
    cartao.style.top = `${topo}px`;
  }

  function fechar() {
    clearTimeout(temporizador);
    cartao?.remove();
    cartao = null;
    colunaAtual = null;
    fixado = false;
    document.removeEventListener('keydown', aoTecla);
    document.removeEventListener('pointerdown', aoClicarFora);
    window.removeEventListener('scroll', fechar, true);
    window.removeEventListener('resize', fechar);
  }

  function agendarFechar() {
    if (fixado) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(fechar, ATRASO_FECHAR_MS);
  }

  function abrir(coluna, montar, { fixar = false, rotulo = 'Detalhe do dia' } = {}) {
    clearTimeout(temporizador);
    if (colunaAtual === coluna && cartao) {
      fixado = fixado || fixar;
      return;
    }
    const jaAberto = cartao !== null;
    if (jaAberto) cartao.remove();
    colunaAtual = coluna;
    fixado = fixar;
    cartao = h('div', { class: 'dia-pop', role: 'dialog', 'aria-label': rotulo }, ...montar().filter(Boolean));
    cartao.addEventListener('mouseenter', () => clearTimeout(temporizador));
    cartao.addEventListener('mouseleave', agendarFechar);
    document.body.append(cartao);
    posicionar();
    if (!jaAberto) {
      document.addEventListener('keydown', aoTecla);
      document.addEventListener('pointerdown', aoClicarFora);
      window.addEventListener('scroll', fechar, true);
      window.addEventListener('resize', fechar);
    }
  }

  return { abrir, fechar, agendarFechar, coluna: () => colunaAtual, fixado: () => fixado };
}
