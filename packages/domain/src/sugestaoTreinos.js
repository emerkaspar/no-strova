import { modelosDoCatalogo, modeloPorId } from './catalogoTreinos.js';
import { somarDias } from './forma.js';
import { diaDaSemana } from './semana.js';
import { FOCOS } from './treinosEstruturados.js';

/**
 * Motor de sugestão de treinos intervalados, por regras (sem IA): escolhe modelos do nível e do esporte do atleta,
 * gira o foco, evita repetir o mesmo treino e respeita a carga (no máximo 2 treinos intensos por semana, 48 h entre
 * eles, e menos intensidade quando a Forma está baixa). Além dos treinos de qualidade, a semana ganha **dias leves**: um de
 * recuperação (no dia seguinte a um treino forte) e um de resistência (longe dos dias fortes, de preferência no fim de semana).
 * Funções puras, sem Firebase e sem DOM.
 */
export const REGRAS_SUGESTAO = Object.freeze({
  /** Dias à frente (a partir de amanhã) que a sugestão cobre. */
  diasAFrente: 7,
  maximoIntensosPorSemana: 2,
  /** Dias mínimos entre dois treinos intensos (48 h = 2 dias de diferença). */
  espacoEntreIntensos: 2,
  /** Com a Forma abaixo disto, só 1 treino intenso na semana; abaixo de FORMA_SOBRECARGA, nenhum. */
  formaCarregada: -20,
  formaSobrecarga: -30,
  /** Não repete o mesmo modelo dentro deste período. */
  diasSemRepetirModelo: 42,
  maximoModerados: 1,
  /** Dias leves por semana: um de resistência (zona 2) e um de recuperação (zona 1). */
  maximoResistencia: 1,
  maximoRecuperacao: 1,
});

const ehZonaIntensa = (zona) => zona === 'Z4' || zona === 'Z5';

function hashDe(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

/** Intensidade ('alta', 'moderada') de um treino já no plano: pelo foco do modelo, ou pela zona predominante. */
function intensidadeDoTreino(treino, proprios) {
  const modelo = treino.modeloId ? modeloPorId(treino.modeloId, proprios) : null;
  if (modelo) return FOCOS[modelo.foco]?.intensidade ?? 'moderada';
  return ehZonaIntensa(treino.zona) ? 'alta' : 'baixa';
}

/**
 * @typedef {object} Sugestao
 * @property {string} data yyyy-mm-dd
 * @property {any} modelo
 * @property {'alta'|'moderada'|'baixa'} intensidade
 * @property {string} motivo
 */

/**
 * Sugestões para a próxima semana.
 * @param {{
 *   hoje: string, esporte: string, nivel: string,
 *   treinos?: Array<{ data: string, status: string, zona?: string, modeloId?: string|null }>,
 *   forma?: number|null, proprios?: any[], excluir?: string[], semente?: string, incluirProprios?: boolean
 * }} p `treinos` são os treinos já planejados ou realizados (o plano atual e o recente)
 * @returns {{ sugestoes: Sugestao[], avisos: string[] }}
 */
export function sugerirTreinos({ hoje, esporte, nivel, treinos = [], forma = null, proprios = [], excluir = [], semente = hoje, incluirProprios = true }) {
  const R = REGRAS_SUGESTAO;
  const avisos = [];
  const ativos = treinos.filter((t) => t.status === 'planejado' || t.status === 'realizado');

  // dias livres: amanhã em diante, sem treino planejado ou realizado
  const janela = Array.from({ length: R.diasAFrente }, (_, i) => somarDias(hoje, i + 1));
  const ocupados = new Set(ativos.map((t) => t.data));
  const livres = janela.filter((d) => !ocupados.has(d));
  if (livres.length === 0) return { sugestoes: [], avisos: ['Todos os próximos dias já têm treino. Libere um dia para receber uma sugestão.'] };

  // carga já existente: dias intensos de 2 dias atrás até o fim da janela
  const diasIntensos = ativos
    .filter((t) => t.data >= somarDias(hoje, -R.espacoEntreIntensos) && t.data <= janela[janela.length - 1])
    .filter((t) => intensidadeDoTreino(t, proprios) === 'alta')
    .map((t) => t.data);
  const intensosNaJanela = diasIntensos.filter((d) => d >= janela[0]).length;

  let intensosPermitidos = R.maximoIntensosPorSemana - intensosNaJanela;
  if (forma !== null && forma < R.formaSobrecarga) {
    intensosPermitidos = 0;
    avisos.push('A sua Forma está na zona de sobrecarga: sem treinos intensos nesta semana. Priorize descanso e treinos leves.');
  } else if (forma !== null && forma < R.formaCarregada) {
    intensosPermitidos = Math.min(intensosPermitidos, Math.max(0, 1 - intensosNaJanela));
    avisos.push('A sua Forma está baixa: no máximo um treino intenso nesta semana.');
  }
  if (intensosPermitidos <= 0 && !(forma !== null && forma < R.formaCarregada)) avisos.push('A semana já tem treinos intensos suficientes.');

  // candidatos: nível e esporte do atleta; sem os usados nas últimas semanas nem os recusados
  const usadosRecentes = new Set(
    treinos.filter((t) => t.modeloId && t.data >= somarDias(hoje, -R.diasSemRepetirModelo)).map((t) => t.modeloId),
  );
  const todos = [...modelosDoCatalogo({ esporte, nivel }), ...(incluirProprios ? proprios.filter((m) => m.esporte === esporte && m.nivel === nivel) : [])];
  const candidatos = todos.filter((m) => !usadosRecentes.has(m.id) && !excluir.includes(m.id));
  if (candidatos.length === 0) return { sugestoes: [], avisos: [...avisos, 'Não há mais treinos novos para este nível e esporte: mude o nível ou recuse menos sugestões.'] };

  // há quantos dias cada foco foi treinado (focos nunca treinados valem como 60 dias)
  const ultimoUsoDoFoco = new Map();
  for (const t of treinos) {
    const modelo = t.modeloId ? modeloPorId(t.modeloId, proprios) : null;
    if (!modelo || t.data > hoje) continue;
    if (!ultimoUsoDoFoco.has(modelo.foco) || t.data > ultimoUsoDoFoco.get(modelo.foco)) ultimoUsoDoFoco.set(modelo.foco, t.data);
  }
  const diasSemFoco = (foco) => {
    const ultimo = ultimoUsoDoFoco.get(foco);
    if (!ultimo) return 60;
    const [a1, m1, d1] = ultimo.split('-').map(Number);
    const [a2, m2, d2] = hoje.split('-').map(Number);
    return Math.min(60, Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000));
  };

  const focosEscolhidos = new Set();
  const escolher = (intensidade) => {
    const doTipo = candidatos.filter((m) => (FOCOS[m.foco]?.intensidade ?? 'moderada') === intensidade);
    let melhor = null;
    for (const m of doTipo) {
      // foco há mais tempo sem treinar vale mais; foco já escolhido nesta rodada, bem menos; sorteio estável desempata
      const pontos = diasSemFoco(m.foco) - (focosEscolhidos.has(m.foco) ? 40 : 0) + (hashDe(`${semente}:${m.id}`) % 100) / 10;
      if (melhor === null || pontos > melhor.pontos) melhor = { modelo: m, pontos };
    }
    return melhor?.modelo ?? null;
  };

  const sugestoes = [];
  const intensosColocados = [...diasIntensos];
  const longe = (data, dias, minimo) => dias.every((d) => Math.abs(diasEntre(d, data)) >= minimo);
  let moderados = 0;

  for (const dia of livres) {
    // 1) intenso, se ainda cabe e respeita as 48 h
    if (intensosPermitidos > 0 && longe(dia, intensosColocados, R.espacoEntreIntensos)) {
      const modelo = escolher('alta');
      if (modelo) {
        focosEscolhidos.add(modelo.foco);
        sugestoes.push({ data: dia, modelo, intensidade: 'alta', motivo: motivoDe(modelo, diasSemFoco(modelo.foco)) });
        intensosColocados.push(dia);
        intensosPermitidos -= 1;
        continue;
      }
    }
    // 2) moderado, longe (1 dia) de um intenso, para não empilhar carga
    // em sobrecarga (Forma abaixo de -30) nem o moderado entra: só recuperação
    if (moderados < R.maximoModerados && !(forma !== null && forma < R.formaSobrecarga) && longe(dia, intensosColocados, 1)) {
      const modelo = escolher('moderada');
      if (modelo) {
        focosEscolhidos.add(modelo.foco);
        sugestoes.push({ data: dia, modelo, intensidade: 'moderada', motivo: motivoDe(modelo, diasSemFoco(modelo.foco)) });
        moderados += 1;
      }
    }
  }
  // ---- dias leves: recuperação depois de um treino forte e resistência longe deles ----
  const sorteioDe = (lista, rotulo) => [...lista].sort((a, b) => hashDe(`${semente}:${rotulo}:${a.id}`) - hashDe(`${semente}:${rotulo}:${b.id}`))[0] ?? null;
  // dia leve pode repetir treino (há poucos por nível): prefere os não usados, mas aceita os usados
  const modelosDe = (foco) => {
    const doFoco = todos.filter((m) => m.foco === foco && !excluir.includes(m.id));
    const novos = doFoco.filter((m) => !usadosRecentes.has(m.id));
    return novos.length > 0 ? novos : doFoco;
  };
  const sobrecarga = forma !== null && forma < R.formaSobrecarga;
  let diasLivres = livres.filter((d) => !sugestoes.some((s) => s.data === d));

  if (R.maximoRecuperacao > 0) {
    // no dia seguinte a um treino forte (já no plano ou sugerido); em sobrecarga, no primeiro dia livre
    const dia = diasLivres.find((d) => intensosColocados.some((i) => diasEntre(i, d) === 1)) ?? (sobrecarga ? diasLivres[0] : undefined);
    const modelo = dia ? sorteioDe(modelosDe('recuperacao'), 'recuperacao') : null;
    if (modelo) {
      sugestoes.push({
        data: dia, modelo, intensidade: 'baixa',
        motivo: sobrecarga ? 'A sua Forma está na sobrecarga: um giro leve em zona 1 ajuda a recuperar.' : 'Giro leve em zona 1 no dia seguinte a um treino forte, para recuperar.',
      });
      diasLivres = diasLivres.filter((d) => d !== dia);
    }
  }

  if (R.maximoResistencia > 0 && !sobrecarga) {
    // longe dos dias fortes (2 dias de distância), de preferência no fim de semana e mais para o fim da janela
    const aceitaveis = diasLivres.filter((d) => longe(d, intensosColocados, 2));
    const pontos = (d) => (diaDaSemana(d) >= 5 ? 100 : 0) + diasEntre(hoje, d);
    const dia = [...aceitaveis].sort((a, b) => pontos(b) - pontos(a))[0];
    const modelo = dia ? sorteioDe(modelosDe('resistencia'), 'resistencia') : null;
    if (modelo) sugestoes.push({ data: dia, modelo, intensidade: 'baixa', motivo: 'Resistência em zona 2 para construir a base, longe dos dias fortes.' });
  }

  sugestoes.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return { sugestoes, avisos };
}

function diasEntre(a, b) {
  const t = (iso) => Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((t(b) - t(a)) / 86400000);
}

function motivoDe(modelo, diasSemTreinar) {
  const foco = FOCOS[modelo.foco]?.rotulo ?? modelo.foco;
  if (diasSemTreinar >= 60) return `Foco em ${foco}, que você ainda não treinou pelo plano.`;
  return `Foco em ${foco}: faz ${diasSemTreinar} dias que você não treina isso.`;
}
