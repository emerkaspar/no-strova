import { ESPORTES_VALIDOS } from './atividade.js';
import { arredondarHrss, estimarHrssPorZona, ZONAS } from './hrss.js';

/**
 * Treinos estruturados (intervalados): uma lista de passos, cada um com duração e zona de FC.
 *   - bloco: { tipo: 'bloco', papel, duracaoS, zona, descricao?, alvoAberto? }
 *   - série: { tipo: 'serie', repeticoes, esforco: { duracaoS, zona, descricao?, alvoAberto? }, recuperacao: { duracaoS, zona, descricao?, alvoAberto? } }
 *   - `alvoAberto`: o passo não tem alvo de FC no relógio (o teste de LTHR: o aparelho não deve cobrar uma faixa que o teste ainda vai descobrir).
 *     Passo com menos de 1 min também não tem alvo de FC (ver `etapaTemAlvoDeFc`), mesmo sem `alvoAberto`.
 *     (a recuperação vem entre as repetições, não depois da última)
 * Funções puras, sem Firebase e sem DOM.
 */

export const PAPEIS_DO_BLOCO = Object.freeze(['aquecimento', 'principal', 'recuperacao', 'desaquecimento']);
export const ESPORTES_TREINO = Object.freeze(['ciclismo', 'corrida']);

export const FOCOS = Object.freeze({
  vo2max: { rotulo: 'VO2máx', intensidade: 'alta' },
  limiar: { rotulo: 'Limiar', intensidade: 'alta' },
  tempo: { rotulo: 'Tempo', intensidade: 'moderada' },
  overunder: { rotulo: 'Over-under', intensidade: 'alta' },
  piramide: { rotulo: 'Pirâmide', intensidade: 'alta' },
  fartlek: { rotulo: 'Fartlek', intensidade: 'moderada' },
  sprint: { rotulo: 'Sprints', intensidade: 'alta' },
  progressivo: { rotulo: 'Progressivo', intensidade: 'moderada' },
  subidas: { rotulo: 'Subidas', intensidade: 'alta' },
  // dias leves: entram nas sugestões da semana (intensidade 'baixa')
  recuperacao: { rotulo: 'Recuperação', intensidade: 'baixa' },
  resistencia: { rotulo: 'Resistência', intensidade: 'baixa' },
  // teste de LTHR: só na biblioteca (nunca é sugerido nem escolhido pela IA)
  teste: { rotulo: 'Teste de LTHR', intensidade: 'teste' },
});

export const NIVEIS = Object.freeze({ iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' });

export const LIMITES_TREINO_ESTRUTURADO = Object.freeze({
  passos: { min: 1, max: 30 },
  duracaoPassoS: { min: 10, max: 4 * 3600 },
  repeticoes: { min: 1, max: 50 },
  duracaoTotalS: { min: 5 * 60, max: 24 * 3600 },
  nome: { min: 3, max: 60 },
  descricao: { max: 500 },
});

const ZONAS_VALIDAS = Object.keys(ZONAS);

/** Fronteiras das zonas, em fração do LTHR (as faixas de Friel): Z1 60–80%, Z2 80–89%, Z3 89–94,5%, Z4 94,5–100%, Z5 100–110%. */
export const FAIXAS_LTHR = Object.freeze({ Z1: [0.6, 0.8], Z2: [0.8, 0.89], Z3: [0.89, 0.945], Z4: [0.945, 1], Z5: [1, 1.1] });

/** Faixa de FC (bpm) de uma zona para o atleta; o topo nunca passa da FC máxima. Null sem configuração. */
export function faixaDeFcDaZona(zona, config) {
  const f = FAIXAS_LTHR[zona];
  if (!f || !config) return null;
  const baixo = Math.round(config.lthr * f[0]);
  const alto = Math.min(Math.round(config.lthr * f[1]), config.fcMax);
  return [Math.min(baixo, alto), alto];
}

/**
 * Abaixo disto a FC não alcança a faixa da zona: ela leva de 30 a 60 s para reagir (e para cair), então um tiro de 30 s
 * termina antes da FC chegar e a recuperação seguinte ainda mostra a FC do tiro. Esses passos são guiados pelo esforço.
 */
export const DURACAO_MINIMA_ALVO_FC_S = 60;

/** O passo tem faixa de FC como alvo? Não tem se for marcado `alvoAberto` ou se for curto demais para a FC acompanhar. */
export function etapaTemAlvoDeFc(etapa) {
  return etapa?.alvoAberto !== true && etapa?.duracaoS >= DURACAO_MINIMA_ALVO_FC_S;
}

/** Passos em blocos planos, na ordem de execução (a série vira esforço, recuperação, esforço…). */
export function expandirPassos(passos) {
  const blocos = [];
  for (const p of passos ?? []) {
    if (p.tipo === 'serie') {
      for (let i = 0; i < p.repeticoes; i++) {
        blocos.push({ papel: 'principal', duracaoS: p.esforco.duracaoS, zona: p.esforco.zona, descricao: p.esforco.descricao ?? null, alvoAberto: !etapaTemAlvoDeFc(p.esforco) });
        if (i < p.repeticoes - 1) blocos.push({ papel: 'recuperacao', duracaoS: p.recuperacao.duracaoS, zona: p.recuperacao.zona, descricao: p.recuperacao.descricao ?? null, alvoAberto: !etapaTemAlvoDeFc(p.recuperacao) });
      }
    } else {
      blocos.push({ papel: p.papel, duracaoS: p.duracaoS, zona: p.zona, descricao: p.descricao ?? null, alvoAberto: !etapaTemAlvoDeFc(p) });
    }
  }
  return blocos;
}

export const duracaoTotalS = (passos) => expandirPassos(passos).reduce((t, b) => t + b.duracaoS, 0);

/** Segundos por zona (Z1–Z5), de todos os blocos. */
export function tempoPorZona(passos) {
  const tempo = Object.fromEntries(ZONAS_VALIDAS.map((z) => [z, 0]));
  for (const b of expandirPassos(passos)) tempo[b.zona] += b.duracaoS;
  return tempo;
}

/** A zona em que o treino passa mais tempo no trabalho principal (empate: a mais alta). */
export function zonaPredominante(passos) {
  const blocos = expandirPassos(passos);
  const principais = blocos.filter((b) => b.papel === 'principal');
  const tempo = Object.fromEntries(ZONAS_VALIDAS.map((z) => [z, 0]));
  for (const b of principais.length > 0 ? principais : blocos) tempo[b.zona] += b.duracaoS;
  return ZONAS_VALIDAS.reduce((melhor, z) => (tempo[z] >= tempo[melhor] ? z : melhor), ZONAS_VALIDAS[0]);
}

/**
 * HRSS estimado do treino: a soma do HRSS de cada bloco, na FC presumida da zona dele (mais preciso que tratar o
 * treino inteiro numa zona só, porque o TRIMP pesa muito mais os minutos em FC alta). Null sem configuração.
 */
export function estimarEstresseEstruturado({ passos, config }) {
  if (!config || !Array.isArray(passos) || passos.length === 0) return null;
  let total = 0;
  for (const b of expandirPassos(passos)) {
    const hrss = estimarHrssPorZona({ zona: b.zona, duracaoS: b.duracaoS, config });
    if (hrss === null) return null;
    total += hrss;
  }
  return arredondarHrss(total);
}

/** Resumo do treino: duração, zona predominante, tempo por zona e número de esforços principais. */
export function resumirTreino(passos) {
  const total = duracaoTotalS(passos);
  return {
    duracaoS: total,
    duracaoMin: Math.ceil(total / 60),
    zona: zonaPredominante(passos),
    tempoPorZona: tempoPorZona(passos),
    esforcos: expandirPassos(passos).filter((b) => b.papel === 'principal').length,
  };
}

/** "30 s", "3 min", "2 min 30 s", "1 h 05". */
export function formatarSegundos(segundos) {
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const resto = s % 60;
    return resto === 0 ? `${m} min` : `${m} min ${resto} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Descrição curta de um passo: "5 × 3 min Z5 / 3 min Z1" ou "10 min Z1 (aquecimento)". */
export function descreverPasso(passo) {
  if (passo.tipo === 'serie') {
    return `${passo.repeticoes} × ${formatarSegundos(passo.esforco.duracaoS)} ${passo.esforco.zona} / ${formatarSegundos(passo.recuperacao.duracaoS)} ${passo.recuperacao.zona}`;
  }
  return `${formatarSegundos(passo.duracaoS)} ${passo.zona}`;
}

function inteiro(v) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return Number.isInteger(n) ? n : null;
}

function validarEtapa(e, rotulo, erros) {
  const L = LIMITES_TREINO_ESTRUTURADO.duracaoPassoS;
  const duracaoS = inteiro(e?.duracaoS);
  if (duracaoS === null || duracaoS < L.min || duracaoS > L.max) erros.push(`${rotulo}: a duração deve ser de ${L.min} segundos a ${L.max / 3600} horas.`);
  if (!ZONAS_VALIDAS.includes(e?.zona)) erros.push(`${rotulo}: escolha a zona (Z1 a Z5).`);
  const descricao = typeof e?.descricao === 'string' ? e.descricao.trim().slice(0, 120) : null;
  return duracaoS === null || !ZONAS_VALIDAS.includes(e?.zona) ? null : { duracaoS, zona: e.zona, ...(descricao ? { descricao } : {}), ...(e.alvoAberto === true ? { alvoAberto: true } : {}) };
}

/**
 * Valida e normaliza a lista de passos.
 * @returns {{ valido: boolean, erros: string[], passos: any[]|null }}
 */
export function validarPassos(entrada) {
  const erros = [];
  const L = LIMITES_TREINO_ESTRUTURADO;
  if (!Array.isArray(entrada) || entrada.length < L.passos.min || entrada.length > L.passos.max) {
    return { valido: false, erros: [`O treino precisa de ${L.passos.min} a ${L.passos.max} passos.`], passos: null };
  }
  const passos = [];
  entrada.forEach((p, i) => {
    const rotulo = `Passo ${i + 1}`;
    if (p?.tipo === 'serie') {
      const repeticoes = inteiro(p.repeticoes);
      if (repeticoes === null || repeticoes < L.repeticoes.min || repeticoes > L.repeticoes.max) erros.push(`${rotulo}: repetições de ${L.repeticoes.min} a ${L.repeticoes.max}.`);
      const esforco = validarEtapa(p.esforco, `${rotulo} (esforço)`, erros);
      const recuperacao = validarEtapa(p.recuperacao, `${rotulo} (recuperação)`, erros);
      if (repeticoes !== null && esforco && recuperacao) passos.push({ tipo: 'serie', repeticoes, esforco, recuperacao });
    } else if (p?.tipo === 'bloco') {
      if (!PAPEIS_DO_BLOCO.includes(p.papel)) erros.push(`${rotulo}: escolha o tipo do bloco.`);
      const etapa = validarEtapa(p, rotulo, erros);
      if (etapa && PAPEIS_DO_BLOCO.includes(p.papel)) passos.push({ tipo: 'bloco', papel: p.papel, ...etapa });
    } else {
      erros.push(`${rotulo}: tipo de passo inválido.`);
    }
  });
  if (erros.length > 0) return { valido: false, erros, passos: null };

  const total = duracaoTotalS(passos);
  if (total < L.duracaoTotalS.min || total > L.duracaoTotalS.max) erros.push('A duração total do treino deve ficar entre 5 minutos e 24 horas.');
  if (!expandirPassos(passos).some((b) => b.papel === 'principal')) erros.push('O treino precisa de pelo menos um esforço principal (um bloco principal ou uma série).');
  return erros.length > 0 ? { valido: false, erros, passos: null } : { valido: true, erros, passos };
}

/**
 * Valida o treino estruturado (modelo próprio do usuário).
 * @returns {{ valido: boolean, erros: string[], valores: { nome: string, esporte: string, foco: string, nivel: string, descricao: string, passos: any[] }|null }}
 */
export function validarTreinoEstruturado(entrada) {
  const erros = [];
  const L = LIMITES_TREINO_ESTRUTURADO;
  const nome = String(entrada?.nome ?? '').trim();
  if (nome.length < L.nome.min || nome.length > L.nome.max) erros.push(`O nome deve ter de ${L.nome.min} a ${L.nome.max} caracteres.`);
  if (!ESPORTES_TREINO.includes(entrada?.esporte)) erros.push('Escolha o esporte (ciclismo ou corrida).');
  if (!FOCOS[entrada?.foco]) erros.push('Escolha o foco do treino.');
  if (!NIVEIS[entrada?.nivel]) erros.push('Escolha o nível do treino.');
  const descricao = String(entrada?.descricao ?? '').trim();
  if (descricao.length > L.descricao.max) erros.push(`A descrição pode ter até ${L.descricao.max} caracteres.`);
  const passos = validarPassos(entrada?.passos);
  erros.push(...passos.erros);
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { nome, esporte: entrada.esporte, foco: entrada.foco, nivel: entrada.nivel, descricao, passos: passos.passos } };
}

/** Os esportes do treino estruturado precisam existir no app. */
export const ESPORTES_COMPATIVEIS = ESPORTES_TREINO.filter((e) => ESPORTES_VALIDOS.includes(e));

/**
 * Entrada do treino planejado a partir de um modelo e uma data. A duração e a zona vêm dos passos; o treino guarda
 * uma cópia dos passos, então mudar ou apagar o modelo depois não altera o plano.
 */
export function treinoPlanejadoDoModelo(modelo, data) {
  const resumo = resumirTreino(modelo.passos);
  return {
    esporte: modelo.esporte,
    data,
    duracaoMin: resumo.duracaoMin,
    zona: resumo.zona,
    observacoes: '',
    nomeTreino: modelo.nome,
    modeloId: modelo.id ?? null,
    passos: modelo.passos,
  };
}

/** Faixa de uma zona em % do LTHR (ex.: Z2 = [80, 89]), para quem recebe o treino como percentual (intervals.icu). Null se a zona é desconhecida. */
export function faixaPercentualDaZona(zona) {
  const f = FAIXAS_LTHR[zona];
  return f ? [Math.round(f[0] * 1000) / 10, Math.round(f[1] * 1000) / 10] : null;
}
