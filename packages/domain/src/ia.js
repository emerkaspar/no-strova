import { modelosDoCatalogo } from './catalogoTreinos.js';
import { diasEntre, somarDias } from './forma.js';
import { inicioDaSemana } from './semana.js';
import { REGRAS_SUGESTAO } from './sugestaoTreinos.js';
import { dataIsoValida } from './usuarios.js';
import { FOCOS, resumirTreino } from './treinosEstruturados.js';

/**
 * Regras da IA (Fase 6). A IA só sugere; tudo o que ela devolve passa por aqui antes de virar rascunho, e os limites de
 * segurança valem **no código**, não só no prompt. Funções puras, sem Firebase e sem DOM.
 */
export const LIMITES_IA = Object.freeze({
  /** Chamadas de IA por usuário por dia (treinos e meta de peso somados). */
  chamadasPorDia: 5,
  semanasMax: 4,
  /** Aumento máximo da carga semanal sobre a base (média das semanas com treino nas últimas 8): 10% por semana. */
  aumentoSemanalMaximo: 0.1,
  /** Piso da base de carga (HRSS por semana): com histórico pequeno, o limite de 10% ficaria apertado demais. */
  pisoDaCargaBase: 60,
  /** Perda de peso: padrão sugerido 0,5% do peso por semana, máximo 1%. */
  perdaPadraoSemanalPct: 0.5,
  perdaMaximaSemanalPct: 1,
  /** Déficit diário máximo: 20% do gasto diário total (já contando o treino). */
  deficitMaximoPct: 0.2,
  /** Ganho de peso: até 0,5% do peso por semana. */
  ganhoMaximoSemanalPct: 0.5,
  kcalPorKg: 7700,
  /** Parte do déficit que a sugestão atribui ao treino (o resto fica para a alimentação). */
  parteDoTreinoNoDeficit: 0.4,
  imcMinimo: 18.5,
});

export const AVISO_IA = 'Sugestão gerada por IA: revise antes de aceitar. Não substitui orientação de médico, nutricionista ou treinador.';

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const arredondar = (v, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;
const pt = (v, casas = 1) => String(arredondar(v, casas)).replace(".", ",");

// ---------------------------------------------------------------------------------------------------------------
// Sugestão de treinos
// ---------------------------------------------------------------------------------------------------------------

/**
 * Valida o pedido de sugestão de treinos.
 * @returns {{ valido: boolean, erros: string[], valores: { semanas: number, diasPorSemana: number, horasPorSemana: number, esporte: 'ciclismo'|'corrida'|'ambos', observacao: string }|null }}
 */
export function validarEntradaDeTreinos(entrada) {
  const erros = [];
  const semanas = numero(entrada?.semanas);
  const dias = numero(entrada?.diasPorSemana);
  const horas = numero(entrada?.horasPorSemana);
  if (semanas === null || !Number.isInteger(semanas) || semanas < 1 || semanas > LIMITES_IA.semanasMax) erros.push(`Escolha de 1 a ${LIMITES_IA.semanasMax} semanas.`);
  if (dias === null || !Number.isInteger(dias) || dias < 1 || dias > 7) erros.push('Informe de 1 a 7 dias de treino por semana.');
  if (horas === null || horas < 1 || horas > 25) erros.push('Informe de 1 a 25 horas de treino por semana.');
  const esporte = entrada?.esporte ?? 'ambos';
  if (!['ciclismo', 'corrida', 'ambos'].includes(esporte)) erros.push('Escolha ciclismo, corrida ou os dois.');
  const observacao = typeof entrada?.observacao === 'string' ? entrada.observacao.trim().replace(/\s+/g, ' ') : '';
  if (observacao.length > 300) erros.push('A observação pode ter até 300 caracteres.');
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { semanas, diasPorSemana: dias, horasPorSemana: horas, esporte, observacao } };
}

/** Catálogo enxuto para a IA escolher: só id, nome, esporte, foco, intensidade, nível e duração. */
export function catalogoParaIa(esporte = 'ambos') {
  return modelosDoCatalogo({})
    .filter((m) => esporte === 'ambos' || m.esporte === esporte)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      esporte: m.esporte,
      foco: m.foco,
      intensidade: FOCOS[m.foco]?.intensidade ?? 'moderada',
      nivel: m.nivel,
      duracaoMin: resumirTreino(m.passos).duracaoMin,
    }));
}

/**
 * Base de carga semanal (soma do estresse): média das semanas **com treino** nas últimas 8 semanas completas, com piso
 * de 60 quando há histórico. Semanas sem treino (viagem, descanso) não puxam a base para baixo. Zero sem histórico.
 * @param {Array<{ data: string, estresse: number }>} dias
 */
export function cargaBaseSemanal(dias, hoje) {
  const inicioAtual = inicioDaSemana(hoje);
  const somas = [];
  for (let i = 1; i <= 8; i++) {
    const de = somarDias(inicioAtual, -7 * i);
    const ate = somarDias(de, 6);
    const soma = dias.filter((d) => d.data >= de && d.data <= ate).reduce((s, d) => s + (Number.isFinite(d.estresse) ? d.estresse : 0), 0);
    if (soma > 0) somas.push(soma);
  }
  if (somas.length === 0) return 0;
  return Math.max(LIMITES_IA.pisoDaCargaBase, somas.reduce((a, b) => a + b, 0) / somas.length);
}

/**
 * Confere a saída da IA contra as regras e descarta o que não pode: modelo fora do catálogo, data inválida ou ocupada,
 * mais dias ou horas que o pedido, treinos intensos demais ou sem 48 h entre eles e aumento de carga acima de 10% por
 * semana. Cada descarte vira um aviso em português.
 * @param {{ treinos?: Array<{ data: string, modeloId: string, motivo?: string }> }} saida
 * @param {{
 *   hoje: string, entrada: { semanas: number, diasPorSemana: number, horasPorSemana: number, esporte: string },
 *   ocupados?: string[], intensosAnteriores?: string[], cargaBase: number, estimarEstresse: (modelo: any) => number,
 *   estresseJaPlanejadoPorSemana?: Record<string, number>
 * }} ctx `ocupados`: datas que já têm treino; `intensosAnteriores`: datas de treinos intensos já no plano ou recentes
 * @returns {{ itens: any[], avisos: string[], cargaPorSemana: Record<string, number> }}
 */
export function validarSugestaoDeTreinos(saida, ctx) {
  const { hoje, entrada, ocupados = [], intensosAnteriores = [], cargaBase, estimarEstresse, estresseJaPlanejadoPorSemana = {} } = ctx;
  const avisos = [];
  const catalogo = new Map(catalogoParaIa(entrada.esporte).map((m) => [m.id, m]));
  const modelos = new Map(modelosDoCatalogo({}).map((m) => [m.id, m]));
  const primeiro = somarDias(hoje, 1);
  const ultimo = somarDias(hoje, 7 * entrada.semanas);
  const usadas = new Set(ocupados);
  const brutos = Array.isArray(saida?.treinos) ? saida.treinos : [];
  const candidatos = [];
  for (const t of brutos) {
    const ref = catalogo.get(t?.modeloId);
    if (!ref) {
      avisos.push(`Um treino sugerido ("${String(t?.modeloId ?? '').slice(0, 40)}") não existe no catálogo e foi descartado.`);
      continue;
    }
    if (!dataIsoValida(t.data) || t.data < primeiro || t.data > ultimo) {
      avisos.push(`"${ref.nome}" veio com uma data fora do período pedido e foi descartado.`);
      continue;
    }
    candidatos.push({ data: t.data, ref, modelo: modelos.get(ref.id), motivo: typeof t.motivo === 'string' ? t.motivo.trim().slice(0, 200) : '' });
  }
  candidatos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  const itens = [];
  let descartadosPorCarga = false;
  const intensos = [...intensosAnteriores];
  const porSemana = new Map();
  const cargaPorSemana = {};
  for (const c of candidatos) {
    if (usadas.has(c.data)) {
      avisos.push(`${c.ref.nome}: o dia ${c.data.split('-').reverse().join('/')} já tem treino e foi descartado.`);
      continue;
    }
    const inicio = inicioDaSemana(c.data);
    const semana = porSemana.get(inicio) ?? { dias: 0, minutos: 0, intensos: 0, carga: estresseJaPlanejadoPorSemana[inicio] ?? 0 };
    const indiceDaSemana = Math.max(0, Math.round(diasEntre(inicioDaSemana(primeiro), inicio) / 7));
    const estresse = estimarEstresse(c.modelo);
    const intenso = c.ref.intensidade === 'alta';
    const rotulo = `${c.ref.nome} (${c.data.split('-').reverse().join('/')})`;

    if (semana.dias >= entrada.diasPorSemana) {
      avisos.push(`${rotulo}: passaria de ${entrada.diasPorSemana} dia(s) de treino na semana e foi descartado.`);
      continue;
    }
    if (semana.minutos + c.ref.duracaoMin > entrada.horasPorSemana * 60) {
      avisos.push(`${rotulo}: passaria de ${entrada.horasPorSemana} h na semana e foi descartado.`);
      continue;
    }
    if (intenso && semana.intensos >= REGRAS_SUGESTAO.maximoIntensosPorSemana) {
      avisos.push(`${rotulo}: já há ${REGRAS_SUGESTAO.maximoIntensosPorSemana} treinos intensos na semana e este foi descartado.`);
      continue;
    }
    if (intenso && intensos.some((d) => Math.abs(diasEntre(d, c.data)) < REGRAS_SUGESTAO.espacoEntreIntensos)) {
      avisos.push(`${rotulo}: ficaria a menos de 48 h de outro treino intenso e foi descartado.`);
      continue;
    }
    if (cargaBase > 0) {
      const limite = cargaBase * (1 + LIMITES_IA.aumentoSemanalMaximo) ** (indiceDaSemana + 1);
      if (semana.carga + estresse > limite) {
        avisos.push(`${rotulo}: a carga da semana passaria de ${Math.round(limite)} (aumento máximo de 10% por semana) e foi descartado.`);
        descartadosPorCarga = true;
        continue;
      }
    }
    usadas.add(c.data);
    if (intenso) intensos.push(c.data);
    porSemana.set(inicio, { dias: semana.dias + 1, minutos: semana.minutos + c.ref.duracaoMin, intensos: semana.intensos + (intenso ? 1 : 0), carga: semana.carga + estresse });
    cargaPorSemana[inicio] = semana.carga + estresse;
    itens.push({ data: c.data, modeloId: c.ref.id, nome: c.ref.nome, esporte: c.ref.esporte, foco: c.ref.foco, intensidade: c.ref.intensidade, duracaoMin: c.ref.duracaoMin, estresse: Math.round(estresse), motivo: c.motivo });
  }
  if (descartadosPorCarga) avisos.push(`Limite de carga: a sua base recente é de cerca de ${Math.round(cargaBase)} por semana e a carga só pode subir 10% por semana (por isso a sugestão tem menos treinos do que você pediu). Treinar com regularidade eleva a base e libera mais treino nas próximas sugestões.`);
  if (cargaBase <= 0) avisos.push('Sem histórico de treino nas últimas 4 semanas: o limite de aumento de carga não pôde ser aplicado. Comece leve.');
  if (itens.length === 0) avisos.push('Nenhum treino da sugestão passou pelas regras de segurança. Tente de novo ou ajuste dias e horas.');
  return { itens, avisos, cargaPorSemana };
}

// ---------------------------------------------------------------------------------------------------------------
// Sugestão de meta de peso
// ---------------------------------------------------------------------------------------------------------------

/**
 * Médias semanais de treino nas últimas 4 semanas, para converter calorias em horas e quilômetros.
 * @param {Array<{ data: string, duracaoS?: number, distanciaM?: number, calorias?: number }>} atividades
 */
export function resumoDeTreinoRecente(atividades, hoje) {
  const de = somarDias(hoje, -27);
  const recentes = atividades.filter((a) => a.data >= de && a.data <= hoje);
  const soma = (campo) => recentes.reduce((s, a) => s + (Number.isFinite(a[campo]) ? a[campo] : 0), 0);
  const horas = soma('duracaoS') / 3600;
  const km = soma('distanciaM') / 1000;
  const kcal = soma('calorias');
  return {
    horasSemana: arredondar(horas / 4, 2),
    distanciaKmSemana: arredondar(km / 4, 1),
    kcalSemana: Math.round(kcal / 4),
    kcalPorHora: horas > 0 && kcal > 0 ? Math.round(kcal / horas) : 500,
    kcalPorKm: km > 0 && kcal > 0 ? arredondar(kcal / km, 1) : 30,
    atividades: recentes.length,
  };
}

/**
 * Plano numérico para chegar ao peso-alvo, com os limites de segurança aplicados. Gasto: Mifflin-St Jeor × 1,2 (sem
 * treino) mais o treino médio. O ritmo é limitado a 1% do peso por semana e a um déficit de 20% do gasto total; se o
 * pedido passa disso, o ritmo é reduzido e a data é empurrada. Recusa alvo com IMC abaixo de 18,5.
 * @param {{
 *   pesoAtualKg: number, pesoAlvoKg: number, dataAlvo: string, hoje: string, alturaCm?: number|null,
 *   sexo?: 'masculino'|'feminino'|null, idadeAnos?: number|null, treino: ReturnType<typeof resumoDeTreinoRecente>
 * }} e
 */
export function planejarMetaDePeso(e) {
  const { pesoAtualKg, pesoAlvoKg, dataAlvo, hoje, alturaCm = null, sexo = null, idadeAnos = null, treino } = e;
  if (!(pesoAtualKg > 0) || !(pesoAlvoKg > 0)) return { valido: false, erro: 'Registre o seu peso atual e informe o peso desejado.' };
  if (!dataIsoValida(dataAlvo) || dataAlvo <= hoje) return { valido: false, erro: 'A data da meta deve ser depois de hoje.' };
  if (alturaCm > 0) {
    const imcAlvo = pesoAlvoKg / (alturaCm / 100) ** 2;
    if (imcAlvo < LIMITES_IA.imcMinimo) return { valido: false, erro: `Com a sua altura, ${pt(pesoAlvoKg)} kg dá IMC ${pt(imcAlvo)}, abaixo de 18,5. Escolha um peso maior.` };
  }
  const avisos = [];
  const perder = pesoAlvoKg < pesoAtualKg;
  const diferenca = Math.abs(pesoAtualKg - pesoAlvoKg);
  if (diferenca < 0.3) return { valido: false, erro: 'O peso desejado já é praticamente o seu peso atual.' };
  const semanas = diasEntre(hoje, dataAlvo) / 7;

  let basal;
  if (alturaCm > 0 && idadeAnos > 0 && sexo) basal = 10 * pesoAtualKg + 6.25 * alturaCm - 5 * idadeAnos + (sexo === 'feminino' ? -161 : 5);
  else {
    basal = pesoAtualKg * 22;
    avisos.push('Sem altura, idade ou sexo completos, o gasto foi estimado só pelo peso (menos preciso).');
  }
  const gastoBase = basal * 1.2;
  const gastoDiario = gastoBase + treino.kcalSemana / 7;

  const pedido = diferenca / semanas;
  const limitePct = (pesoAtualKg * (perder ? LIMITES_IA.perdaMaximaSemanalPct : LIMITES_IA.ganhoMaximoSemanalPct)) / 100;
  const limiteDeficit = perder ? (LIMITES_IA.deficitMaximoPct * gastoDiario * 7) / LIMITES_IA.kcalPorKg : Infinity;
  const limite = Math.min(limitePct, limiteDeficit);
  const aplicado = Math.min(pedido, limite);
  const ajustada = pedido > limite + 1e-9;
  const dataSugerida = ajustada ? somarDias(hoje, Math.ceil((diferenca / aplicado) * 7)) : dataAlvo;
  if (ajustada) avisos.push(`Chegar a ${pt(pesoAlvoKg)} kg até a data pedida exigiria ${pt(pedido, 2)} kg por semana, acima do limite seguro (${pt(limite, 2)} kg por semana). A data sugerida foi ajustada.`);
  else if (perder && (aplicado / pesoAtualKg) * 100 > LIMITES_IA.perdaPadraoSemanalPct) avisos.push(`O ritmo (${pt((aplicado / pesoAtualKg) * 100, 2)}% do peso por semana) está acima do padrão sugerido de ${LIMITES_IA.perdaPadraoSemanalPct}%, mas dentro do limite de segurança.`);

  const saldoSemanalKcal = Math.round(aplicado * LIMITES_IA.kcalPorKg);
  const base = { valido: true, perder, semanas: arredondar(semanas, 1), ritmoPedidoKgSemana: arredondar(pedido, 2), ritmoAplicadoKgSemana: arredondar(aplicado, 2), ajustada, dataPedida: dataAlvo, dataSugerida, gastoDiarioKcal: Math.round(gastoDiario), treinoAtual: treino, avisos };
  if (!perder) {
    return { ...base, saldoDiarioKcal: Math.round(saldoSemanalKcal / 7), deficitPct: 0, treinoSugerido: null, reducaoDaAlimentacaoKcalDia: null };
  }
  const extraKcal = saldoSemanalKcal * LIMITES_IA.parteDoTreinoNoDeficit;
  const alimentacaoKcalDia = Math.round((saldoSemanalKcal * (1 - LIMITES_IA.parteDoTreinoNoDeficit)) / 7);
  return {
    ...base,
    saldoDiarioKcal: -Math.round(saldoSemanalKcal / 7),
    deficitPct: arredondar(saldoSemanalKcal / 7 / gastoDiario, 3),
    reducaoDaAlimentacaoKcalDia: alimentacaoKcalDia,
    treinoSugerido: {
      horasSemana: arredondar(treino.horasSemana + extraKcal / treino.kcalPorHora, 1),
      distanciaKmSemana: arredondar(treino.distanciaKmSemana + extraKcal / treino.kcalPorKm, 0),
      kcalSemana: Math.round(treino.kcalSemana + extraKcal),
    },
  };
}
