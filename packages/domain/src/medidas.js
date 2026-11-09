import { dataIsoValida } from './usuarios.js';

/**
 * Medidas corporais (fita métrica): validação, composição corporal estimada (método da Marinha dos EUA), relações
 * cintura/quadril e cintura/altura e evolução entre medições. Funções puras, sem Firebase e sem DOM.
 */
export const LIMITES_MEDIDAS = Object.freeze({ min: 10, max: 250 });

/**
 * Catálogo das medidas: `campo` é o nome gravado no documento. `ponto` diz onde passar a fita e `dica` o cuidado.
 * A ordem é a da tela.
 */
export const MEDIDAS = Object.freeze([
  { campo: 'pescocoCm', rotulo: 'Pescoço', grupo: 'tronco', ponto: 'Logo abaixo do pomo de Adão (a "gaiola" da garganta), com a fita levemente inclinada para baixo na frente.', dica: 'Cabeça reta, olhando para a frente, sem esticar o pescoço.' },
  { campo: 'toraxCm', rotulo: 'Tórax', grupo: 'tronco', ponto: 'Na linha dos mamilos, passando pelas costas na altura das axilas.', dica: 'Braços relaxados ao lado do corpo e medida ao final de uma expiração normal.' },
  { campo: 'cinturaCm', rotulo: 'Cintura', grupo: 'tronco', ponto: 'No ponto médio entre a última costela e o osso do quadril, onde o tronco é mais estreito.', dica: 'Solte a barriga, sem encolher nem estufar. Meça ao final de uma expiração normal.' },
  { campo: 'abdomenCm', rotulo: 'Abdômen', grupo: 'tronco', ponto: 'Na altura do umbigo.', dica: 'Em pé, abdômen relaxado, fita paralela ao chão.' },
  { campo: 'quadrilCm', rotulo: 'Quadril', grupo: 'tronco', ponto: 'Na parte mais larga dos glúteos, vista de lado.', dica: 'Pés juntos e fita paralela ao chão, sem apertar.' },
  { campo: 'bracoCm', rotulo: 'Braço direito', grupo: 'membros', ponto: 'No ponto médio entre o ombro e o cotovelo, com o braço relaxado e esticado ao lado do corpo.', dica: 'Músculo relaxado, sem contrair o bíceps.' },
  { campo: 'coxaCm', rotulo: 'Coxa direita', grupo: 'membros', ponto: 'No ponto médio entre a dobra da virilha e o joelho.', dica: 'Peso distribuído nas duas pernas, músculo relaxado.' },
  { campo: 'panturrilhaCm', rotulo: 'Panturrilha direita', grupo: 'membros', ponto: 'No ponto mais largo da panturrilha.', dica: 'Em pé, com o peso igual nas duas pernas.' },
]);

export const CAMPOS_DE_MEDIDA = Object.freeze(MEDIDAS.map((m) => m.campo));

function numero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const arredondar1 = (v) => Math.round(v * 10) / 10;
const arredondar2 = (v) => Math.round(v * 100) / 100;

/**
 * Valida um registro de medidas. Todas as medidas são opcionais, mas é preciso informar ao menos uma. Um registro por
 * dia: gravar de novo na mesma data substitui o anterior.
 * @returns {{ valido: boolean, erros: string[], valores: object|null }} `valores` traz `data` e só as medidas informadas.
 */
export function validarMedidas(entrada, hoje) {
  const erros = [];
  const valores = {};
  const { min, max } = LIMITES_MEDIDAS;
  for (const { campo, rotulo } of MEDIDAS) {
    const bruto = entrada?.[campo];
    if (bruto === undefined || bruto === null || (typeof bruto === 'string' && bruto.trim() === '')) continue;
    const n = numero(bruto);
    if (n === null || n < min || n > max) erros.push(`${rotulo}: informe a medida em cm, de ${min} a ${max}.`);
    else valores[campo] = arredondar1(n);
  }
  if (erros.length === 0 && Object.keys(valores).length === 0) erros.push('Informe ao menos uma medida.');
  const data = entrada?.data;
  if (!dataIsoValida(data)) erros.push('Informe a data da medição.');
  else if (data > hoje) erros.push('A data da medição não pode estar no futuro.');
  if (erros.length > 0) return { valido: false, erros, valores: null };
  return { valido: true, erros, valores: { data, ...valores } };
}

const log10 = Math.log10;

/**
 * Percentual de gordura pelo método da Marinha dos EUA (medidas em cm). Homem usa abdômen e pescoço; mulher usa
 * cintura, quadril e pescoço. Devolve null sem os dados necessários ou se o resultado for implausível.
 * É uma estimativa, com erro típico de alguns pontos percentuais.
 * @param {'masculino'|'feminino'} sexo
 */
export function gorduraMarinha(sexo, { alturaCm, pescocoCm, cinturaCm, abdomenCm, quadrilCm }) {
  if (!(alturaCm > 0) || !(pescocoCm > 0)) return null;
  let pct;
  if (sexo === 'masculino') {
    if (!(abdomenCm > pescocoCm)) return null;
    pct = 495 / (1.0324 - 0.19077 * log10(abdomenCm - pescocoCm) + 0.15456 * log10(alturaCm)) - 450;
  } else if (sexo === 'feminino') {
    if (!(cinturaCm > 0) || !(quadrilCm > 0) || !(cinturaCm + quadrilCm > pescocoCm)) return null;
    pct = 495 / (1.29579 - 0.35004 * log10(cinturaCm + quadrilCm - pescocoCm) + 0.221 * log10(alturaCm)) - 450;
  } else {
    return null;
  }
  if (!Number.isFinite(pct) || pct < 2 || pct > 60) return null;
  return arredondar1(pct);
}

const FAIXAS_GORDURA = Object.freeze({
  masculino: [[2, 'Abaixo do essencial', 'atencao'], [6, 'Gordura essencial', 'atencao'], [14, 'Atleta', 'ok'], [18, 'Fitness', 'ok'], [25, 'Aceitável', 'ok'], [Infinity, 'Acima do recomendado', 'alerta']],
  feminino: [[10, 'Abaixo do essencial', 'atencao'], [14, 'Gordura essencial', 'atencao'], [21, 'Atleta', 'ok'], [25, 'Fitness', 'ok'], [32, 'Aceitável', 'ok'], [Infinity, 'Acima do recomendado', 'alerta']],
});

/** Classifica o % de gordura (faixas do ACE). @returns {{ rotulo: string, gravidade: 'ok'|'atencao'|'alerta' }|null} */
export function classificarGordura(sexo, pct) {
  const faixas = FAIXAS_GORDURA[sexo];
  if (!faixas || !Number.isFinite(pct)) return null;
  const [, rotulo, gravidade] = faixas.find(([limite]) => pct < limite);
  return { rotulo, gravidade };
}

/**
 * Composição corporal estimada de um registro: % de gordura, massa gorda e massa magra (kg). Precisa do peso do dia.
 * @returns {{ gorduraPct: number, massaGordaKg: number, massaMagraKg: number, faixa: object|null }|null}
 */
export function composicaoCorporal(registro, { sexo, alturaCm, pesoKg }) {
  if (!registro || !(pesoKg > 0)) return null;
  const gorduraPct = gorduraMarinha(sexo, { alturaCm, ...registro });
  if (gorduraPct === null) return null;
  const massaGordaKg = arredondar1((pesoKg * gorduraPct) / 100);
  return { gorduraPct, massaGordaKg, massaMagraKg: arredondar1(pesoKg - massaGordaKg), faixa: classificarGordura(sexo, gorduraPct) };
}

/** Relação cintura/quadril e leitura da OMS (risco aumentado acima de 0,90 no homem e 0,85 na mulher). */
export function relacaoCinturaQuadril(sexo, { cinturaCm, quadrilCm }) {
  if (!(cinturaCm > 0) || !(quadrilCm > 0)) return null;
  const valor = arredondar2(cinturaCm / quadrilCm);
  const limite = sexo === 'feminino' ? 0.85 : sexo === 'masculino' ? 0.9 : null;
  return { valor, limite, gravidade: limite === null ? null : valor > limite ? 'alerta' : 'ok' };
}

/** Relação cintura/altura: abaixo de 0,5 é adequado, de 0,5 a 0,59 pede atenção e 0,6 ou mais é risco alto. */
export function relacaoCinturaAltura({ cinturaCm }, alturaCm) {
  if (!(cinturaCm > 0) || !(alturaCm > 0)) return null;
  const valor = arredondar2(cinturaCm / alturaCm);
  return { valor, gravidade: valor < 0.5 ? 'ok' : valor < 0.6 ? 'atencao' : 'alerta' };
}

const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

/** Peso (kg) da pesagem mais recente com data até `data`; null se não houver. */
export function pesoNaData(pesagens, data) {
  const anteriores = pesagens.filter((p) => p.data <= data && Number.isFinite(p.pesoKg)).sort(porData);
  return anteriores.length > 0 ? anteriores[anteriores.length - 1].pesoKg : null;
}

/** Variação de uma medida (cm) entre dois registros; null se faltar em algum. */
export function variacaoDeMedida(campo, de, para) {
  const a = de?.[campo];
  const b = para?.[campo];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return arredondar1(b - a);
}

/**
 * Lê a evolução entre a primeira e a última medição: cruza a cintura (gordura) com a massa magra estimada ou, sem ela,
 * com a média dos membros (músculo).
 * @param {Array<object>} registros medições (qualquer ordem)
 * @param {{ sexo?: string, alturaCm?: number, pesagens?: Array<object> }} contexto
 * @returns {{ codigo: string, gravidade: 'ok'|'atencao'|'alerta'|'neutro', texto: string }}
 */
export function vereditoDaEvolucao(registros, { sexo = null, alturaCm = null, pesagens = [] } = {}) {
  const lista = [...registros].sort(porData);
  if (lista.length < 2) {
    return { codigo: 'poucos-dados', gravidade: 'neutro', texto: 'Registre mais uma medição, de preferência em 2 a 4 semanas, para ver se você está evoluindo.' };
  }
  const primeiro = lista[0];
  const ultimo = lista[lista.length - 1];
  const campoCintura = Number.isFinite(primeiro.cinturaCm) && Number.isFinite(ultimo.cinturaCm) ? 'cinturaCm' : 'abdomenCm';
  const dCintura = variacaoDeMedida(campoCintura, primeiro, ultimo);

  let musculo = null;
  const compA = composicaoCorporal(primeiro, { sexo, alturaCm, pesoKg: pesoNaData(pesagens, primeiro.data) });
  const compB = composicaoCorporal(ultimo, { sexo, alturaCm, pesoKg: pesoNaData(pesagens, ultimo.data) });
  if (compA && compB) {
    const d = compB.massaMagraKg - compA.massaMagraKg;
    musculo = d >= 0.5 ? 'subiu' : d <= -1 ? 'caiu' : 'estavel';
  } else {
    const variacoes = ['bracoCm', 'coxaCm', 'panturrilhaCm'].map((c) => variacaoDeMedida(c, primeiro, ultimo)).filter((v) => v !== null);
    if (variacoes.length > 0) {
      const media = variacoes.reduce((s, v) => s + v, 0) / variacoes.length;
      musculo = media >= 0.5 ? 'subiu' : media <= -1 ? 'caiu' : 'estavel';
    }
  }

  if (dCintura === null && musculo === null) {
    return { codigo: 'sem-comparacao', gravidade: 'neutro', texto: 'As medições registradas não têm medidas em comum para comparar. Meça sempre os mesmos pontos.' };
  }
  const cintura = dCintura === null ? null : dCintura <= -1 ? 'caiu' : dCintura >= 1 ? 'subiu' : 'estavel';

  if (cintura === 'caiu' && musculo !== 'caiu') {
    return { codigo: 'perdendo-gordura', gravidade: 'ok', texto: 'A cintura diminuiu e a massa muscular se manteve: você está perdendo gordura e preservando músculo.' };
  }
  if (cintura === 'caiu' && musculo === 'caiu') {
    return { codigo: 'perdendo-massa', gravidade: 'atencao', texto: 'A cintura diminuiu, mas a massa muscular também caiu. Confira a ingestão de proteína, o descanso e o treino de força.' };
  }
  if (cintura === 'subiu' && musculo === 'subiu') {
    return { codigo: 'ganho-misto', gravidade: 'neutro', texto: 'A cintura e a massa muscular aumentaram: ganho de massa com algum acúmulo de gordura. Vale acompanhar a cintura.' };
  }
  if (cintura === 'subiu') {
    return { codigo: 'gordura-subindo', gravidade: 'alerta', texto: 'A cintura aumentou sem ganho de massa muscular: sinal de acúmulo de gordura abdominal.' };
  }
  if (musculo === 'subiu') {
    return { codigo: 'ganhando-musculo', gravidade: 'ok', texto: 'A cintura está estável e a massa muscular aumentou: boa recomposição corporal.' };
  }
  if (musculo === 'caiu') {
    return { codigo: 'musculo-caindo', gravidade: 'atencao', texto: 'A massa muscular diminuiu com a cintura estável. Confira o treino de força, a proteína e o descanso.' };
  }
  return { codigo: 'estavel', gravidade: 'neutro', texto: 'As medidas estão estáveis desde a primeira medição.' };
}
