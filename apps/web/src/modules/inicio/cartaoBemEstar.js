import { faixaDoSono, faixaDosPassos, formatarSono, prontidao, resumoDeBemEstar, serieDeBemEstar, somarDias } from '@no-strova/domain';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';

const DIAS_DO_MINIGRAFICO = 14;

const SELO_DA_PRONTIDAO = Object.freeze({
  boa: { texto: 'Pronto para treinar', classe: 'boa' },
  moderada: { texto: 'Atenção ao descanso', classe: 'moderada' },
  baixa: { texto: 'Priorize a recuperação', classe: 'baixa' },
});

const TEXTO_FAIXA_SONO = Object.freeze({ ideal: 'faixa ideal', curto: 'curto', 'muito-curto': 'muito curto', longo: 'longo' });
const TEXTO_FAIXA_PASSOS = Object.freeze({ atingiu: 'meta atingida', quase: 'quase na meta', abaixo: 'abaixo da meta' });

/**
 * Prontidão de hoje para treinar (Forma + sono da noite + dias seguidos treinando). O sono só conta se for de hoje ou de
 * ontem: um registro antigo não diz nada sobre hoje.
 * @returns {{ nivel: 'boa'|'moderada'|'baixa'|null, motivos: string[] }}
 */
export function prontidaoDeHoje({ bemEstar = [], hoje, forma = null, diasTreinandoSeguidos = 0 }) {
  const r = resumoDeBemEstar(bemEstar, hoje);
  const sonoUltimoS = r.sono && r.sono.data >= somarDias(hoje, -1) ? r.sono.segundos : null;
  return prontidao({ forma, sonoUltimoS, mediaSono7S: r.mediaSono7S, noites7: r.noites7, diasTreinandoSeguidos });
}

/**
 * Cartão "Sono e passos" da coluna lateral do gráfico principal: mostra o dia que está sob o mouse (ou Hoje), com passos
 * contra a meta, sono da noite, as médias de 7 dias e, em Hoje, a prontidão. `mostrar(data)` troca o dia.
 * Os minigráficos mostram os 14 dias até hoje e são criados uma única vez (só o contorno do dia e os textos mudam), para
 * que passar o mouse sobre uma barra possa mover o gráfico maior (`aoPassar`) sem o cartão se refazer debaixo do mouse.
 * Devolve `null` quando não há nenhum registro (quem não sincroniza passos e sono não vê o cartão).
 * @param {{ bemEstar?: any[], hoje: string, meta: number, prontidaoHoje?: any, aoPassar?: (data: string) => void, aoSair?: () => void }} p
 * @returns {{ el: HTMLElement, mostrar: (data: string) => void }|null}
 */
export function criarCartaoBemEstar({ bemEstar = [], hoje, meta, prontidaoHoje = null, aoPassar = null, aoSair = null }) {
  if (!bemEstar.some((d) => d.passos > 0 || d.sonoSegundos > 0)) return null;
  const porDia = new Map(serieDeBemEstar(bemEstar, hoje, 60).map((d) => [d.data, d]));
  const janela = [];
  for (let i = DIAS_DO_MINIGRAFICO - 1; i >= 0; i -= 1) {
    const dia = somarDias(hoje, -i);
    janela.push(porDia.get(dia) ?? { data: dia, passos: null, sonoSegundos: null });
  }
  const maxPassos = Math.max(meta, ...janela.map((x) => x.passos ?? 0));
  const maxSono = Math.max(9 * 3600, ...janela.map((x) => x.sonoSegundos ?? 0));

  /** Barrinhas dos 14 dias: altura = valor, cor = faixa, linha pontilhada = meta. Passar o mouse numa barra move o gráfico maior. */
  function miniBarras({ valorDe, maximo, classeDe, rotuloDe, linha, rotuloLinha, aria }) {
    const barras = janela.map((d) => {
      const v = valorDe(d);
      const barra = !(v > 0)
        ? h('span', { class: 'mini-barra mini-barra-vazia', title: `${formatarData(d.data)}: sem registro` })
        : h('span', { class: `mini-barra ${classeDe(v)}`, style: `height:${Math.max(8, Math.min(100, (v / maximo) * 100)).toFixed(0)}%`, title: `${formatarData(d.data)}: ${rotuloDe(v)}` });
      if (aoPassar) {
        barra.addEventListener('pointerenter', () => aoPassar(d.data));
        barra.addEventListener('pointerdown', () => aoPassar(d.data));
      }
      return barra;
    });
    const el = h(
      'div',
      { class: 'mini-barras', role: 'img', 'aria-label': aria },
      h('span', { class: 'mini-meta', style: `bottom:${Math.min(100, (linha / maximo) * 100).toFixed(1)}%`, title: rotuloLinha }),
      ...barras,
    );
    if (aoSair) el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') aoSair();
    });
    return { el, barras };
  }

  const passosBarras = miniBarras({
    valorDe: (x) => x.passos,
    maximo: maxPassos,
    classeDe: (v) => `mini-passos-${faixaDosPassos(v, meta)}`,
    rotuloDe: (v) => `${formatarNumero(v, 0)} passos`,
    linha: meta,
    rotuloLinha: `Meta de ${formatarNumero(meta, 0)} passos`,
    aria: 'Passos dos últimos 14 dias',
  });
  const sonoBarras = miniBarras({
    valorDe: (x) => x.sonoSegundos,
    maximo: maxSono,
    classeDe: (v) => `mini-sono-${faixaDoSono(v)}`,
    rotuloDe: (v) => formatarSono(v),
    linha: 7 * 3600,
    rotuloLinha: 'Sono mínimo ideal: 7 h',
    aria: 'Sono das últimas 14 noites',
  });

  // elementos fixos: só o texto e o contorno mudam a cada dia
  const selo = h('p', { class: 'bem-estar-selo', hidden: true });
  const motivos = h('p', { class: 'cg-bem-estar-nota', hidden: true });
  const rotuloPassos = h('span', { class: 'cg-mini-rotulo' });
  const valorPassos = h('strong');
  const notaPassos = h('p', { class: 'cg-bem-estar-nota' });
  const valorSono = h('strong');
  const notaSono = h('p', { class: 'cg-bem-estar-nota' });
  const semRegistro = h('p', { class: 'cg-bem-estar-nota', hidden: true });
  const corpo = h(
    'div',
    { class: 'cg-bem-estar' },
    h('p', { class: 'cg-bem-estar-linha cg-bem-estar-primeira' }, rotuloPassos, valorPassos),
    notaPassos,
    passosBarras.el,
    h('p', { class: 'cg-bem-estar-linha' }, h('span', { class: 'cg-mini-rotulo' }, 'Sono da noite'), valorSono),
    notaSono,
    sonoBarras.el,
    // abaixo dos minigráficos: o que aparece e some conforme o dia (prontidão, aviso) não empurra as barras para longe do mouse
    selo,
    motivos,
    semRegistro,
    h('p', { class: 'cg-bem-estar-nota' }, h('a', { href: '#/peso' }, 'Abrir Saúde')),
  );
  const el = h('div', { class: 'cg-cartao' }, h('h3', { class: 'cg-subtitulo' }, 'Sono e passos'), corpo);

  function mostrar(data) {
    const d = porDia.get(data) ?? null;
    const fp = d ? faixaDosPassos(d.passos, meta) : null;
    const fs = d ? faixaDoSono(d.sonoSegundos) : null;
    const seloDoDia = data === hoje && prontidaoHoje?.nivel ? SELO_DA_PRONTIDAO[prontidaoHoje.nivel] : null;
    const frase = (prontidaoHoje?.motivos ?? []).join(', ');
    selo.hidden = !seloDoDia;
    if (seloDoDia) {
      selo.textContent = seloDoDia.texto;
      selo.className = `bem-estar-selo bem-estar-selo-${seloDoDia.classe}`;
    }
    motivos.hidden = !(seloDoDia && frase);
    motivos.textContent = frase ? `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.` : '';
    rotuloPassos.textContent = `Passos · ${formatarData(data).slice(0, 5)}`;
    valorPassos.textContent = d?.passos ? formatarNumero(d.passos, 0) : '—';
    notaPassos.textContent = `${fp ? `${TEXTO_FAIXA_PASSOS[fp]} · ` : ''}meta ${formatarNumero(meta, 0)}${d?.mediaPassos7 ? ` · média ${formatarNumero(d.mediaPassos7, 0)}` : ''}`;
    valorSono.textContent = d?.sonoSegundos ? formatarSono(d.sonoSegundos) : '—';
    notaSono.textContent = `${fs ? `${TEXTO_FAIXA_SONO[fs]} · ` : ''}${d?.mediaSono7S ? `média ${formatarSono(d.mediaSono7S)}` : 'ideal 7 a 9 h'}`;
    janela.forEach((x, i) => {
      passosBarras.barras[i].classList.toggle('mini-barra-ativa', x.data === data);
      sonoBarras.barras[i].classList.toggle('mini-barra-ativa', x.data === data);
    });
    semRegistro.hidden = Boolean(d?.passos || d?.sonoSegundos);
    semRegistro.textContent = data > hoje ? 'Dia que ainda não chegou.' : 'Sem registro neste dia.';
  }

  return { el, mostrar };
}
