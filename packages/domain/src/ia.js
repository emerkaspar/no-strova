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
  /** Chamadas de IA por usuário por dia (padrão; o administrador pode mudar). */
  chamadasPorDia: 5,
  semanasMax: 4,
  /** Aumento máximo da carga semanal sobre a base (média das semanas com treino nas últimas 8): 10% por semana. */
  aumentoSemanalMaximo: 0.1,
});

/**
 * Piso da base de carga (HRSS por semana): com histórico pequeno, a média das últimas semanas deixaria a carga leve demais
 * (e o limite de 10% apertado). O piso é o maior entre o do nível do atleta e as horas por semana do perfil × `hrssPorHora`,
 * limitado a `teto`. É só o ponto de partida: a carga sobe 8% por semana. Os valores ficam abaixo das referências comuns de
 * treinamento (~50 de TSS por hora), por prudência, já que o HRSS (por FC) tende a ser menor que o TSS (por potência).
 */
export const PISO_DA_CARGA_BASE = Object.freeze({
  porNivel: Object.freeze({ iniciante: 100, intermediario: 160, avancado: 220 }),
  hrssPorHora: 35,
  teto: 400,
});

/**
 * Piso da base de carga de um atleta: nível (sem nível vale intermediário) e, se houver, as horas por semana do perfil.
 * @param {{ nivel?: string|null, horasSemana?: number|null }} [perfil]
 */
export function pisoDaCargaBase({ nivel, horasSemana } = {}) {
  const P = PISO_DA_CARGA_BASE;
  const doNivel = P.porNivel[nivel] ?? P.porNivel.intermediario;
  const dasHoras = Number.isFinite(horasSemana) && horasSemana > 0 ? horasSemana * P.hrssPorHora : 0;
  return Math.round(Math.min(P.teto, Math.max(doNivel, dasHoras)));
}

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

const ORDEM_DE_NIVEL = Object.freeze({ iniciante: 0, intermediario: 1, avancado: 2 });

/** No máximo quantos treinos próprios do usuário entram no cardápio da IA (os mais recentes), para o pedido não crescer sem limite. */
export const MAXIMO_DE_PROPRIOS_NA_IA = 40;

/**
 * Treinos próprios do usuário como a IA os enxerga: o mesmo formato enxuto do catálogo, com `proprio: true` e, nos treinos
 * adaptados a um trajeto, o `trajeto` (eles só fazem sentido para quem vai fazer aquele trajeto). Valem os do esporte pedido,
 * de qualquer nível (foi o próprio usuário quem os criou), sem o teste de LTHR; entram os mais recentes, até o máximo.
 * @param {any[]} proprios modelos próprios já validados (`{ id, nome, esporte, foco, nivel, passos, trajetoNome? }`), do mais recente ao mais antigo
 * @param {string} [esporte] 'ciclismo', 'corrida' ou 'ambos'
 */
export function propriosParaIa(proprios, esporte = 'ambos') {
  return (proprios ?? [])
    .filter((m) => m?.id && Array.isArray(m.passos) && m.passos.length > 0 && (esporte === 'ambos' || m.esporte === esporte) && FOCOS[m.foco]?.intensidade !== 'teste')
    .slice(0, MAXIMO_DE_PROPRIOS_NA_IA)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      esporte: m.esporte,
      foco: m.foco,
      intensidade: FOCOS[m.foco]?.intensidade ?? 'moderada',
      nivel: m.nivel,
      duracaoMin: resumirTreino(m.passos).duracaoMin,
      proprio: true,
      ...(m.trajetoNome ? { trajeto: m.trajetoNome } : {}),
    }));
}

/**
 * Catálogo enxuto para a IA escolher: só id, nome, esporte, foco, intensidade, nível e duração. `nivelMaximo` corta os treinos
 * do catálogo acima do nível do atleta. Os treinos próprios do usuário (`proprios`) entram junto, marcados com `proprio: true`.
 */
export function catalogoParaIa(esporte = 'ambos', nivelMaximo = 'avancado', proprios = []) {
  const teto = ORDEM_DE_NIVEL[nivelMaximo] ?? ORDEM_DE_NIVEL.avancado;
  const doCatalogo = modelosDoCatalogo({})
    .filter((m) => esporte === 'ambos' || m.esporte === esporte)
    .filter((m) => (ORDEM_DE_NIVEL[m.nivel] ?? 0) <= teto)
    .filter((m) => FOCOS[m.foco]?.intensidade !== 'teste') // o teste de LTHR é só da biblioteca
    // zona 1 é fácil demais para quem não é iniciante: a recuperação só entra no cardápio do iniciante
    .filter((m) => m.foco !== 'recuperacao' || teto === ORDEM_DE_NIVEL.iniciante)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      esporte: m.esporte,
      foco: m.foco,
      intensidade: FOCOS[m.foco]?.intensidade ?? 'moderada',
      nivel: m.nivel,
      duracaoMin: resumirTreino(m.passos).duracaoMin,
    }));
  return [...doCatalogo, ...propriosParaIa(proprios, esporte)];
}

/** Duração mínima e máxima (min) que o usuário pode pedir para um treino único. */
export const LIMITES_DURACAO_PEDIDA = Object.freeze({ min: 15, max: 360 });

/** Lê a duração pedida (opcional): vazio → null; fora dos limites ou inválida → `undefined` (o chamador recusa). */
export function lerDuracaoPedida(valor) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) return null;
  const n = numero(valor);
  if (n === null || !Number.isFinite(n) || n < LIMITES_DURACAO_PEDIDA.min || n > LIMITES_DURACAO_PEDIDA.max) return undefined;
  return Math.round(n);
}

/**
 * Treinos candidatos para o tempo pedido: os que ficam até 25% acima ou abaixo dele (no máximo `maximo`, os mais próximos
 * primeiro); se nenhum cabe na faixa, só os 3 de duração mais próxima, para a IA não fugir muito do pedido. Empate: menor
 * estresse, depois o id, para o resultado ser estável.
 */
export function maisProximosDaDuracao(lista, duracaoMin, maximo = 12) {
  const dist = (m) => Math.abs(m.duracaoMin - duracaoMin);
  const ordenada = [...lista].sort((a, b) => dist(a) - dist(b) || (a.estresse ?? 0) - (b.estresse ?? 0) || (a.id < b.id ? -1 : 1));
  const naFaixa = ordenada.filter((m) => dist(m) / duracaoMin <= 0.25);
  return naFaixa.length > 0 ? naFaixa.slice(0, maximo) : ordenada.slice(0, 3);
}

/**
 * Avisos em português sobre o treino escolhido: carga alta demais ou baixa demais para o momento do atleta (uma sessão passa de
 * ~40% da carga semanal ou fica abaixo de ~10%) e, se ele pediu um tempo, o quanto o treino difere dele (a partir de 20%).
 * @param {{ estresse: number, duracaoMin: number }} treino
 * @param {{ cargaBase: number, duracaoPedida?: number|null }} ctx
 * @returns {string[]}
 */
export function avisosDaCargaPedida(treino, { cargaBase, duracaoPedida = null }) {
  const avisos = [];
  if (duracaoPedida && Math.abs(treino.duracaoMin - duracaoPedida) / duracaoPedida >= 0.2) {
    avisos.push(`Você pediu ${duracaoPedida} min, mas o treino do catálogo mais próximo tem ${treino.duracaoMin} min.`);
  }
  if (cargaBase > 0) {
    if (treino.estresse > cargaBase * 0.4) avisos.push(`Atenção: a carga deste treino (~${treino.estresse}) é alta demais para o seu momento, perto de ${Math.round((treino.estresse / cargaBase) * 100)}% da sua carga semanal. Considere um treino mais curto ou leve.`);
    else if (treino.estresse < cargaBase * 0.1) avisos.push(`Atenção: a carga deste treino (~${treino.estresse}) é baixa para o seu momento, só ${Math.round((treino.estresse / cargaBase) * 100)}% da sua carga semanal. Se quiser evoluir, escolha um treino mais longo ou mais forte.`);
  }
  return avisos;
}

/**
 * Base de carga semanal (soma do estresse): média das semanas **com treino** nas últimas 8 semanas completas, com o piso do
 * atleta (`pisoDaCargaBase`: nível e horas por semana) quando há histórico. Semanas sem treino (viagem, descanso) não puxam
 * a base para baixo. Zero sem histórico.
 * @param {Array<{ data: string, estresse: number }>} dias
 * @param {string} hoje
 * @param {{ nivel?: string|null, horasSemana?: number|null }} [perfil]
 */
export function cargaBaseSemanal(dias, hoje, perfil = {}) {
  const inicioAtual = inicioDaSemana(hoje);
  const somas = [];
  for (let i = 1; i <= 8; i++) {
    const de = somarDias(inicioAtual, -7 * i);
    const ate = somarDias(de, 6);
    const soma = dias.filter((d) => d.data >= de && d.data <= ate).reduce((s, d) => s + (Number.isFinite(d.estresse) ? d.estresse : 0), 0);
    if (soma > 0) somas.push(soma);
  }
  if (somas.length === 0) return 0;
  return Math.max(pisoDaCargaBase(perfil), somas.reduce((a, b) => a + b, 0) / somas.length);
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
 *   estresseJaPlanejadoPorSemana?: Record<string, number>, nivel?: string, proprios?: any[]
 * }} ctx `ocupados`: datas que já têm treino; `intensosAnteriores`: datas de treinos intensos já no plano ou recentes;
 *   `proprios`: os treinos próprios do usuário que a IA pôde escolher (o mesmo cardápio dado a ela)
 * @returns {{ itens: any[], avisos: string[], cargaPorSemana: Record<string, number> }}
 */
export function validarSugestaoDeTreinos(saida, ctx) {
  const { hoje, entrada, ocupados = [], intensosAnteriores = [], cargaBase, estimarEstresse, estresseJaPlanejadoPorSemana = {}, nivel = 'intermediario', proprios = [] } = ctx;
  const avisos = [];
  const diasEscolhidos = new Set(entrada.diasDaSemana);
  const catalogo = new Map(catalogoParaIa(entrada.esporte, nivel, proprios).map((m) => [m.id, m]));
  // o id de um treino próprio nunca sobrescreve o do catálogo
  const modelos = new Map([...proprios.map((m) => [m.id, m]), ...modelosDoCatalogo({}).map((m) => [m.id, m])]);
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
      avisos.push(`Um treino sugerido ("${String(t?.modeloId ?? '').slice(0, 40)}") não existe no catálogo nem entre os seus treinos (ou o catálogo o tem acima do seu nível) e foi descartado.`);
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
  const usos = new Map();
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
    usos.set(ref.id, (usos.get(ref.id) ?? 0) + 1);
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
      // o código também completa dias vazios e trocar por um treino leve: um treino de trajeto só entra se a IA o escolheu
      .filter((m) => m.esporte === esporte && m.intensidade !== 'alta' && !m.trajeto && semana.minutos + m.duracaoMin <= limiteMin)
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
    // variedade primeiro: o treino menos usado até aqui; depois, o mais longo (longão) ou o mais forte que cabe
    const ordem = (a, b) => (usos.get(a.ref.id) ?? 0) - (usos.get(b.ref.id) ?? 0) || (ehLongao ? b.ref.duracaoMin - a.ref.duracaoMin : b.estresse - a.estresse);
    const preferidos = cabem.filter((m) => !naSemana.has(m.ref.id)).sort(ordem);
    const escolhido = preferidos[0] ?? cabem.sort(ordem)[0];
    if (escolhido) return { ...escolhido, dentro: true };
    return { ...lista.sort((a, b) => (usos.get(a.ref.id) ?? 0) - (usos.get(b.ref.id) ?? 0) || a.estresse - b.estresse)[0], dentro: false };
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

  // Variedade: o mesmo treino não se repete em menos de 14 dias. O repetido é trocado por outro do mesmo tipo (mesma
  // intensidade e esporte) menos usado e de duração parecida, respeitando as horas da semana e a carga.
  // Janelas de tolerância: tenta 14 dias; se o catálogo não tem treinos suficientes, 7 e depois 3 (nestas, só se o novo
  // for menos usado que o atual, para não ficar trocando à toa).
  const minutosDaSemana = (inicio, menos) => itens.filter((it) => it !== menos && inicioDaSemana(it.data) === inicio).reduce((t, it) => t + it.duracaoMin, 0);
  const mantidos = [];
  let variados = 0;
  for (const it of [...itens].sort((a, b) => (a.data < b.data ? -1 : 1))) {
    const repetidoEm = (id, janela) => mantidos.some((m) => m.modeloId === id && Math.abs(diasEntre(m.data, it.data)) < janela);
    if (repetidoEm(it.modeloId, 14)) {
      const inicio = inicioDaSemana(it.data);
      const limite = limiteDeCarga(inicio);
      const cargaSemSelf = (estadoDaSemana(inicio).carga ?? 0) - it.estresse;
      const usoAtual = usos.get(it.modeloId) ?? 1;
      let troca = null;
      for (const janela of [14, 7, 3]) {
        const alternativas = [...catalogo.values()]
          .filter((m) => m.esporte === it.esporte && m.intensidade === it.intensidade && m.id !== it.modeloId && !repetidoEm(m.id, janela) && minutosDaSemana(inicio, it) + m.duracaoMin <= limiteMin)
          .filter((m) => janela === 14 || (usos.get(m.id) ?? 0) < usoAtual)
          .map((m) => ({ ref: m, estresse: estimar(m.id) }))
          .filter((m) => m.estresse > 0 && (it.intensidade === 'alta' || cargaSemSelf + m.estresse <= limite || m.estresse <= it.estresse))
          .sort((a, b) => (usos.get(a.ref.id) ?? 0) - (usos.get(b.ref.id) ?? 0) || Math.abs(a.ref.duracaoMin - it.duracaoMin) - Math.abs(b.ref.duracaoMin - it.duracaoMin));
        if (alternativas.length > 0) {
          troca = alternativas[0];
          break;
        }
      }
      if (troca) {
        usos.set(it.modeloId, Math.max(0, usoAtual - 1));
        usos.set(troca.ref.id, (usos.get(troca.ref.id) ?? 0) + 1);
        estadoDaSemana(inicio).carga = cargaSemSelf + troca.estresse;
        cargaPorSemana[inicio] = estadoDaSemana(inicio).carga;
        Object.assign(it, { modeloId: troca.ref.id, nome: troca.ref.nome, foco: troca.ref.foco, duracaoMin: troca.ref.duracaoMin, estresse: Math.round(troca.estresse), motivo: 'Trocado para variar os treinos.' });
        variados += 1;
      }
    }
    mantidos.push(it);
  }
  if (variados > 0) avisos.push(`${variados} treino(s) repetido(s) foram trocados por outros do mesmo tipo, para variar.`);

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
      // o motivo escrito para o dia antigo deixaria de fazer sentido
      doLongao.motivo = 'Treino reposicionado para o dia do longão.';
      maisLongo.motivo = 'Treino mais longo da semana, no dia do longão.';
    }
    itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  if (trocados) avisos.push(`Carga: a sua base recente é de cerca de ${Math.round(cargaBase)} por semana e ela só deve subir 10% por semana. Os dias que você escolheu foram mantidos, com treinos mais leves onde foi preciso. Treinar com regularidade eleva a base e libera treinos mais fortes.`);
  if (!(cargaBase > 0)) avisos.push('Sem histórico de treino recente: não dá para limitar o aumento de carga. Os dias escolhidos foram mantidos; comece leve e aumente aos poucos.');
  if (itens.length === 0) avisos.push('Nenhum treino da sugestão passou pelas regras de segurança. Tente de novo ou ajuste dias e horas.');
  return { itens, avisos, cargaPorSemana };
}
