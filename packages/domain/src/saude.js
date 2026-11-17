/**
 * Resumo da página Saúde: peso, sono, passos e carga de treino num período, comparados com o período anterior de mesmo
 * tamanho, e a "leitura do período" (frases curtas e determinísticas, sem IA). Regras puras, sem Firebase nem DOM.
 */

import { faixaDoSono, formatarSono, META_PASSOS_PADRAO } from './bemEstar.js';
import { somarDias } from './forma.js';
import { agruparTreinoECorpo } from './treinoCorpo.js';

const media = (valores) => (valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length);
const diasEntreIso = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
/** Variação percentual de `atual` contra `anterior` (null sem base). */
const variacaoPct = (atual, anterior) => (Number.isFinite(atual) && Number.isFinite(anterior) && anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);

/**
 * Números do período (`dias`; null = todo o histórico) e do período anterior de mesmo tamanho.
 * @param {{ pesagens?: any[], bemEstar?: any[], estresse?: any[], metaPassos?: number, hoje: string, dias: number|null }} p
 */
export function resumoSaude({ pesagens = [], bemEstar = [], estresse = [], metaPassos = META_PASSOS_PADRAO, hoje, dias }) {
  const datas = [...pesagens, ...bemEstar, ...estresse].map((x) => x.data).filter((d) => typeof d === 'string' && d <= hoje);
  const menor = datas.length ? datas.reduce((a, b) => (a < b ? a : b)) : hoje;
  const inicio = dias === null ? menor : somarDias(hoje, -(dias - 1));
  const tamanho = diasEntreIso(inicio, hoje) + 1;
  const inicioAnterior = dias === null ? null : somarDias(inicio, -tamanho);
  const fimAnterior = dias === null ? null : somarDias(inicio, -1);
  const dentro = (d, de, ate) => d >= de && d <= ate;
  const noPeriodo = (x) => typeof x.data === 'string' && dentro(x.data, inicio, hoje);
  const noAnterior = (x) => inicioAnterior !== null && typeof x.data === 'string' && dentro(x.data, inicioAnterior, fimAnterior);

  // ---- peso: o último peso, e a variação contra o último peso até o início do período (ou o primeiro dentro dele)
  const validas = pesagens.filter((p) => Number.isFinite(p.pesoKg) && p.data <= hoje).sort((a, b) => (a.data < b.data ? -1 : 1));
  const atual = validas.length ? validas[validas.length - 1] : null;
  const dentroDoPeriodo = validas.filter(noPeriodo);
  const antes = [...validas].reverse().find((p) => p.data < inicio) ?? null;
  const referencia = antes ?? dentroDoPeriodo[0] ?? null;
  const variacaoKg = atual && referencia && referencia.data !== atual.data ? atual.pesoKg - referencia.pesoKg : null;
  const semanas = referencia && atual ? diasEntreIso(referencia.data, atual.data) / 7 : 0;
  const peso = {
    atualKg: atual?.pesoKg ?? null,
    data: atual?.data ?? null,
    variacaoKg,
    semanalKg: variacaoKg !== null && semanas >= 1 ? variacaoKg / semanas : null,
    serie: dentroDoPeriodo.map((p) => p.pesoKg),
  };

  // ---- sono e passos (médias só dos dias com registro)
  const sonos = bemEstar.filter((b) => b.sonoSegundos > 0);
  const passos = bemEstar.filter((b) => b.passos > 0);
  const mediaSono = media(sonos.filter(noPeriodo).map((b) => b.sonoSegundos));
  const mediaPassos = media(passos.filter(noPeriodo).map((b) => b.passos));
  const grupos = agruparTreinoECorpo({ pesagens: [], bemEstar, estresse }, hoje, { dias }).grupos;
  const sono = {
    mediaS: mediaSono,
    noites: sonos.filter(noPeriodo).length,
    anteriorS: media(sonos.filter(noAnterior).map((b) => b.sonoSegundos)),
    faixa: mediaSono === null ? null : faixaDoSono(mediaSono),
    serie: grupos.map((g) => g.sonoMedioS).filter((v) => v !== null),
  };
  const passosResumo = {
    media: mediaPassos,
    dias: passos.filter(noPeriodo).length,
    anterior: media(passos.filter(noAnterior).map((b) => b.passos)),
    pctMeta: mediaPassos === null ? null : (mediaPassos / metaPassos) * 100,
    meta: metaPassos,
    serie: grupos.map((g) => g.passosMedio).filter((v) => v !== null),
  };

  // ---- carga de treino (HRSS por semana)
  const total = estresse.filter(noPeriodo).reduce((s, e) => s + (Number.isFinite(e.estresse) ? e.estresse : 0), 0);
  const totalAnterior = estresse.filter(noAnterior).reduce((s, e) => s + (Number.isFinite(e.estresse) ? e.estresse : 0), 0);
  const semanasDoPeriodo = Math.max(tamanho / 7, 1);
  const porSemana = total / semanasDoPeriodo;
  const anteriorPorSemana = inicioAnterior === null ? null : totalAnterior / semanasDoPeriodo;
  const carga = {
    total,
    porSemana,
    anteriorPorSemana,
    variacaoPct: anteriorPorSemana ? variacaoPct(porSemana, anteriorPorSemana) : null,
    serie: grupos.map((g) => g.cargaHrss),
  };

  return { dias, inicio, fim: hoje, peso, sono, passos: passosResumo, carga };
}

const numero = (v, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');

/**
 * "Leitura do período": até 4 frases curtas com o que importa, na ordem de importância. `tom`: ok, atencao, alerta ou neutro.
 * `perderPeso`: true/false conforme a meta de peso ativa (para saber se a variação é boa); null sem meta.
 * @returns {Array<{ tema: 'peso'|'sono'|'passos'|'carga'|'cruzado', tom: 'ok'|'atencao'|'alerta'|'neutro', texto: string }>}
 */
export function leituraDoPeriodo(resumo, { perderPeso = null } = {}) {
  const frases = [];
  const { peso, sono, passos, carga } = resumo;

  // cruzamento: carga subindo com sono curto (o aviso mais útil da página)
  const cargaSubindo = carga.variacaoPct !== null && carga.variacaoPct >= 20 && carga.porSemana > 0;
  const sonoCurto = sono.faixa === 'curto' || sono.faixa === 'muito-curto';
  if (cargaSubindo && sonoCurto) {
    frases.push({ tema: 'cruzado', tom: 'alerta', texto: `Você aumentou a carga de treino (${sinal(carga.variacaoPct)}${numero(Math.abs(carga.variacaoPct))}%) e está dormindo pouco: priorize a recuperação.` });
  }

  if (sono.mediaS !== null) {
    const diff = sono.anteriorS !== null ? sono.mediaS - sono.anteriorS : null;
    const comparacao = diff !== null && Math.abs(diff) >= 600 ? ` (${sinal(diff)}${formatarSono(Math.abs(diff))} contra o período anterior)` : '';
    const leitura = { ideal: 'dentro da faixa ideal (7 a 9 h)', curto: 'abaixo do ideal (7 a 9 h)', 'muito-curto': 'bem abaixo do ideal (7 a 9 h)', longo: 'acima do ideal (7 a 9 h)' }[sono.faixa];
    const tom = { ideal: 'ok', curto: 'atencao', 'muito-curto': 'alerta', longo: 'neutro' }[sono.faixa];
    frases.push({ tema: 'sono', tom, texto: `Sono: média de ${formatarSono(sono.mediaS)} por noite, ${leitura}${comparacao}.` });
  }

  if (passos.media !== null) {
    const pct = Math.round(passos.pctMeta);
    const tom = pct >= 100 ? 'ok' : pct >= 70 ? 'atencao' : 'alerta';
    frases.push({ tema: 'passos', tom, texto: `Passos: média de ${numero(passos.media)} por dia, ${pct}% da meta de ${numero(passos.meta)}.` });
  }

  if (peso.variacaoKg !== null && Math.abs(peso.variacaoKg) >= 0.05) {
    const subiu = peso.variacaoKg > 0;
    const tom = perderPeso === null ? 'neutro' : subiu === !perderPeso ? 'ok' : 'atencao';
    const ritmo = peso.semanalKg !== null ? ` (${sinal(peso.semanalKg)}${numero(Math.abs(peso.semanalKg), 1)} kg por semana)` : '';
    frases.push({ tema: 'peso', tom, texto: `Peso: ${subiu ? 'subiu' : 'caiu'} ${numero(Math.abs(peso.variacaoKg), 1)} kg no período${ritmo}.` });
  }

  if (carga.total > 0) {
    const v = carga.variacaoPct;
    const comparacao = v !== null && Math.abs(v) >= 5 ? `, ${sinal(v)}${numero(Math.abs(v))}% contra o período anterior` : '';
    frases.push({ tema: 'carga', tom: v !== null && v > 40 ? 'atencao' : 'neutro', texto: `Treino: carga de ${numero(carga.porSemana)} de HRSS por semana${comparacao}.` });
  }

  return frases.slice(0, 4);
}
