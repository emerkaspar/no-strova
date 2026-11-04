import { modelosDoCatalogo } from './catalogoTreinos.js';
import { diasEntre, somarDias } from './forma.js';
import { diaDaSemana, inicioDaSemana, NOMES_DIA } from './semana.js';
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
  pisoDaCargaBase: 100,
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

/** Dias da semana por índice (0 = segunda … 6 = domingo), para mostrar e para o prompt. */
export const NOMES_DIAS_DA_SEMANA = NOMES_DIA;

/**
 * Valida o pedido de sugestão de treinos. Os dias de treino são escolhidos pelo usuário (`diasDaSemana`, índices de
 * 0 = segunda a 6 = domingo; sem eles, vale `diasPorSemana` de segunda em diante) e o dia do longão (`diaLongao`) é um deles.
 * @returns {{ valido: boolean, erros: string[], valores: { semanas: number, diasDaSemana: number[], diasPorSemana: number, diaLongao: number|null, horasPorSemana: number, esporte: 'ciclismo'|'corrida'|'ambos', observacao: string }|null }}
 */
export function validarEntradaDeTreinos(entrada) {
  const erros = [];
  const semanas = numero(entrada?.semanas);
  const horas = numero(entrada?.horasPorSemana);
  if (semanas === null || !Number.isInteger(semanas) || semanas < 1 || semanas > LIMITES_IA.semanasMax) erros.push(`Escolha de 1 a ${LIMITES_IA.semanasMax} semanas.`);
  let dias;
  if (Array.isArray(entrada?.diasDaSemana)) {
    dias = [...new Set(entrada.diasDaSemana.map(numero))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  } else {
    const n = numero(entrada?.diasPorSemana);
    dias = n !== null && Number.isInteger(n) && n >= 1 && n <= 7 ? Array.from({ length: n }, (_, i) => i) : [];
  }
  if (dias.length === 0) erros.push('Escolha pelo menos um dia da semana para treinar.');
  const longao = numero(entrada?.diaLongao);
  if (longao !== null && !dias.includes(longao)) erros.push('O dia do longão precisa ser um dos dias de treino escolhidos.');
  if (horas === null || horas < 1 || horas > 25) erros.push('Informe de 1 a 25 horas de treino por semana.');
  const esporte = entrada?.esporte ?? 'ambos';
  if (!['ciclismo', 'corrida', 'ambos'].includes(esporte)) erros.push('Escolha ciclismo, corrida ou os dois.');
  const observacao = typeof entrada?.observacao === 'string' ? entrada.observacao.trim().replace(/\s+/g, ' ') : '';
  if (observacao.length > 300) erros.push('A observação pode ter até 300 caracteres.');
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { semanas, diasDaSemana: dias, diasPorSemana: dias.length, diaLongao: longao, horasPorSemana: horas, esporte, observacao } };
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
 * de 100 quando há histórico. Semanas sem treino (viagem, descanso) não puxam a base para baixo. Zero sem histórico.
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
 * Confere a saída da IA contra as regras e **mantém os dias que o usuário escolheu**:
 *  - descarta modelo fora do catálogo, data fora do período, dia já ocupado e dia da semana que o usuário não escolheu;
 *  - respeita as horas por semana, no máximo 2 treinos intensos por semana e 48 h entre eles;
 *  - o aumento de carga é limitado a 10% por semana sobre a base: um treino que passaria disso é **trocado por um mais leve**
 *    (e, se nem o mais leve cabe, é mantido com um aviso, porque o usuário pediu aquele dia);
 *  - dia escolhido que a IA deixou vazio é **completado** com um treino leve;
 *  - o dia do longão recebe o treino mais longo da semana.
 * Cada troca, descarte ou preenchimento vira um aviso em português.
 * @param {{ treinos?: Array<{ data: string, modeloId: string, motivo?: string }> }} saida
 * @param {{
 *   hoje: string, entrada: ReturnType<typeof validarEntradaDeTreinos>['valores'],
 *   ocupados?: string[], intensosAnteriores?: string[], cargaBase: number, estimarEstresse: (modelo: any) => number,
 *   estresseJaPlanejadoPorSemana?: Record<string, number>
 * }} ctx `ocupados`: datas que já têm treino; `intensosAnteriores`: datas de treinos intensos já no plano ou recentes
 * @returns {{ itens: any[], avisos: string[], cargaPorSemana: Record<string, number> }}
 */
export function validarSugestaoDeTreinos(saida, ctx) {
  const { hoje, entrada, ocupados = [], intensosAnteriores = [], cargaBase, estimarEstresse, estresseJaPlanejadoPorSemana = {} } = ctx;
  const avisos = [];
  const diasEscolhidos = new Set(entrada.diasDaSemana);
  const catalogo = new Map(catalogoParaIa(entrada.esporte).map((m) => [m.id, m]));
  const modelos = new Map(modelosDoCatalogo({}).map((m) => [m.id, m]));
  const primeiro = somarDias(hoje, 1);
  const ultimo = somarDias(hoje, 7 * entrada.semanas);
  const primeiraSegunda = inicioDaSemana(primeiro);
  const usadas = new Set(ocupados);
  const dataBr = (d) => d.split('-').reverse().join('/');
  const limiteMin = entrada.horasPorSemana * 60;
  const estresseDe = new Map();
  const estimar = (id) => {
    if (!estresseDe.has(id)) estresseDe.set(id, estimarEstresse(modelos.get(id)));
    return estresseDe.get(id);
  };

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
    if (!diasEscolhidos.has(diaDaSemana(t.data))) {
      avisos.push(`${ref.nome} (${dataBr(t.data)}): cai num dia da semana que você não escolheu e foi descartado.`);
      continue;
    }
    candidatos.push({ data: t.data, ref, motivo: typeof t.motivo === 'string' ? t.motivo.trim().slice(0, 200) : '' });
  }
  candidatos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  const itens = [];
  const intensos = [...intensosAnteriores];
  const semanas = new Map();
  const cargaPorSemana = {};
  let trocados = false;
  let completados = 0;
  const estadoDaSemana = (inicio) => {
    if (!semanas.has(inicio)) semanas.set(inicio, { minutos: 0, intensos: 0, carga: estresseJaPlanejadoPorSemana[inicio] ?? 0 });
    return semanas.get(inicio);
  };
  const limiteDeCarga = (inicio) => {
    if (!(cargaBase > 0)) return Infinity;
    const indice = Math.max(0, Math.round(diasEntre(primeiraSegunda, inicio) / 7));
    return cargaBase * (1 + LIMITES_IA.aumentoSemanalMaximo) ** (indice + 1);
  };
  const registrar = (data, ref, estresse, motivo) => {
    const inicio = inicioDaSemana(data);
    const semana = estadoDaSemana(inicio);
    usadas.add(data);
    if (ref.intensidade === 'alta') {
      intensos.push(data);
      semana.intensos += 1;
    }
    semana.minutos += ref.duracaoMin;
    semana.carga += estresse;
    cargaPorSemana[inicio] = semana.carga;
    itens.push({ data, modeloId: ref.id, nome: ref.nome, esporte: ref.esporte, foco: ref.foco, intensidade: ref.intensidade, duracaoMin: ref.duracaoMin, estresse: Math.round(estresse), motivo });
  };
  /** Treinos leves (não intensos) do esporte que cabem nas horas da semana, com o estresse de cada um. */
  const leves = (esporte, inicio) => {
    const semana = estadoDaSemana(inicio);
    return [...catalogo.values()]
      .filter((m) => m.esporte === esporte && m.intensidade !== 'alta' && semana.minutos + m.duracaoMin <= limiteMin)
      .map((m) => ({ ref: m, estresse: estimar(m.id) }))
      .filter((m) => m.estresse > 0);
  };
  /** Escolhe o treino leve para um dia: o mais forte que cabe na carga (o mais longo, no dia do longão); senão o mais leve. */
  const escolherLeve = (esporte, data, naSemana) => {
    const inicio = inicioDaSemana(data);
    const semana = estadoDaSemana(inicio);
    const limite = limiteDeCarga(inicio);
    const lista = leves(esporte, inicio);
    if (lista.length === 0) return null;
    const ehLongao = entrada.diaLongao !== null && diaDaSemana(data) === entrada.diaLongao;
    const cabem = lista.filter((m) => semana.carga + m.estresse <= limite);
    const ordem = (a, b) => (ehLongao ? b.ref.duracaoMin - a.ref.duracaoMin : b.estresse - a.estresse);
    const preferidos = cabem.filter((m) => !naSemana.has(m.ref.id)).sort(ordem);
    const escolhido = preferidos[0] ?? cabem.sort(ordem)[0];
    if (escolhido) return { ...escolhido, dentro: true };
    return { ...lista.sort((a, b) => a.estresse - b.estresse)[0], dentro: false };
  };
  const nomesNaSemana = (inicio) => new Set(itens.filter((it) => inicioDaSemana(it.data) === inicio).map((it) => it.modeloId));

  for (const c of candidatos) {
    const inicio = inicioDaSemana(c.data);
    const semana = estadoDaSemana(inicio);
    let ref = c.ref;
    let estresse = estimar(ref.id);
    const rotulo = `${ref.nome} (${dataBr(c.data)})`;

    if (usadas.has(c.data)) {
      avisos.push(`${rotulo}: o dia já tem treino e foi descartado.`);
      continue;
    }
    if (semana.minutos + ref.duracaoMin > limiteMin) {
      avisos.push(`${rotulo}: passaria de ${entrada.horasPorSemana} h na semana e foi descartado.`);
      continue;
    }
    if (ref.intensidade === 'alta' && semana.intensos >= REGRAS_SUGESTAO.maximoIntensosPorSemana) {
      avisos.push(`${rotulo}: já há ${REGRAS_SUGESTAO.maximoIntensosPorSemana} treinos intensos na semana e este foi descartado.`);
      continue;
    }
    if (ref.intensidade === 'alta' && intensos.some((d) => Math.abs(diasEntre(d, c.data)) < REGRAS_SUGESTAO.espacoEntreIntensos)) {
      avisos.push(`${rotulo}: ficaria a menos de 48 h de outro treino intenso e foi descartado.`);
      continue;
    }
    const limite = limiteDeCarga(inicio);
    if (semana.carga + estresse > limite) {
      const troca = escolherLeve(ref.esporte, c.data, nomesNaSemana(inicio));
      if (!troca) {
        avisos.push(`${rotulo}: não há treino leve que caiba nas horas da semana e foi descartado.`);
        continue;
      }
      avisos.push(
        troca.dentro
          ? `${rotulo}: trocado por "${troca.ref.nome}", mais leve, para a carga da semana não passar de ${Math.round(limite)} (aumento máximo de 10% por semana).`
          : `${rotulo}: trocado por "${troca.ref.nome}", o treino mais leve do catálogo. Mesmo assim a carga da semana passa de ${Math.round(limite)} (aumento de 10% por semana): foi mantido porque você escolheu esse dia. Vá com calma.`,
      );
      trocados = true;
      ref = troca.ref;
      estresse = troca.estresse;
    }
    registrar(c.data, ref, estresse, c.motivo);
  }

  // Dias escolhidos que a IA deixou vazios: completa com um treino leve (o dia do longão recebe o mais longo).
  const esportePadrao = entrada.esporte === 'ambos' ? (itens[0]?.esporte ?? [...catalogo.values()][0]?.esporte ?? 'ciclismo') : entrada.esporte;
  for (let d = primeiro; d <= ultimo; d = somarDias(d, 1)) {
    if (!diasEscolhidos.has(diaDaSemana(d)) || usadas.has(d)) continue;
    const inicio = inicioDaSemana(d);
    const escolha = escolherLeve(esportePadrao, d, nomesNaSemana(inicio));
    if (!escolha) {
      avisos.push(`${NOMES_DIA[diaDaSemana(d)]} (${dataBr(d)}): não coube mais treino nas ${entrada.horasPorSemana} h da semana e o dia ficou livre.`);
      continue;
    }
    registrar(d, escolha.ref, escolha.estresse, 'Dia de treino que você escolheu, completado com um treino leve.');
    completados += 1;
    if (!escolha.dentro) trocados = true;
  }
  if (completados > 0) avisos.push(`${completados} dia(s) que você escolheu ficaram sem treino na sugestão da IA e foram completados com treinos leves.`);

  // Longão: o treino mais longo da semana fica no dia do longão (troca de data, se nenhum dos dois for intenso).
  if (entrada.diaLongao !== null) {
    const porSemana = new Map();
    for (const it of itens) {
      const inicio = inicioDaSemana(it.data);
      porSemana.set(inicio, [...(porSemana.get(inicio) ?? []), it]);
    }
    for (const lista of porSemana.values()) {
      const doLongao = lista.find((it) => diaDaSemana(it.data) === entrada.diaLongao);
      const maisLongo = [...lista].sort((a, b) => b.duracaoMin - a.duracaoMin)[0];
      if (!doLongao || !maisLongo || maisLongo === doLongao || maisLongo.duracaoMin <= doLongao.duracaoMin) continue;
      if (doLongao.intensidade === 'alta' || maisLongo.intensidade === 'alta') continue;
      [doLongao.data, maisLongo.data] = [maisLongo.data, doLongao.data];
    }
    itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  if (trocados) avisos.push(`Carga: a sua base recente é de cerca de ${Math.round(cargaBase)} por semana e ela só deve subir 10% por semana. Os dias que você escolheu foram mantidos, com treinos mais leves onde foi preciso. Treinar com regularidade eleva a base e libera treinos mais fortes.`);
  if (!(cargaBase > 0)) avisos.push('Sem histórico de treino recente: não dá para limitar o aumento de carga. Os dias escolhidos foram mantidos; comece leve e aumente aos poucos.');
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
