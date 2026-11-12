/**
 * Adesão ao sistema (painel do administrador): classifica cada usuário e resume o conjunto.
 * Funções puras. Os instantes são em milissegundos (ou null); o servidor monta as linhas só com
 * booleanos, datas e contagens, nunca com chaves nem dados de saúde.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/** Janelas, em dias, para considerar alguém ativo ou parado. */
export const JANELAS_ADESAO = Object.freeze({ ativo: 7, recente: 30, parado: 14 });

/** Faixas de atividade de uso, da mais ativa para a menos. */
export const FAIXAS_DE_USO = Object.freeze({ SEMANA: 'semana', MES: 'mes', PARADO: 'parado', NUNCA: 'nunca' });

/** Etapas do funil, na ordem em que uma pessoa avança. */
export const ETAPAS_DO_FUNIL = Object.freeze([
  { id: 'cadastrou', rotulo: 'Cadastrou' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'onboarding', rotulo: 'Concluiu o onboarding' },
  { id: 'conectou', rotulo: 'Conectou intervals.icu ou Garmin' },
  { id: 'importou', rotulo: 'Tem atividades' },
]);

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Dias inteiros entre `ms` e `agora`; null sem data. */
export function diasDesde(ms, agora = Date.now()) {
  const t = numero(ms);
  return t === null ? null : Math.max(0, Math.floor((agora - t) / DIA_MS));
}

/** Instante mais recente de uso: o maior entre o último acesso e a última atividade registrada. */
export function ultimoUsoEm(linha) {
  const candidatos = [numero(linha?.ultimoAcesso), numero(linha?.atividades?.ultimaEm)].filter((v) => v !== null);
  return candidatos.length > 0 ? Math.max(...candidatos) : null;
}

/** Faixa de uso do usuário: semana, mes, parado (mais de 30 dias) ou nunca (sem nenhum uso registrado). */
export function faixaDeUso(linha, agora = Date.now()) {
  const dias = diasDesde(ultimoUsoEm(linha), agora);
  if (dias === null) return FAIXAS_DE_USO.NUNCA;
  if (dias <= JANELAS_ADESAO.ativo) return FAIXAS_DE_USO.SEMANA;
  if (dias <= JANELAS_ADESAO.recente) return FAIXAS_DE_USO.MES;
  return FAIXAS_DE_USO.PARADO;
}

/** Dias parado: aprovado e ativo, mas sem uso há mais de `JANELAS_ADESAO.parado` dias (ou sem nenhum uso). */
export function estaParado(linha, agora = Date.now()) {
  if (!linha?.aprovado || linha?.ativo === false) return false;
  const dias = diasDesde(ultimoUsoEm(linha), agora);
  return dias === null || dias > JANELAS_ADESAO.parado;
}

/** Situação da conexão com o intervals.icu: 'ativa', 'chaveInvalida' ou 'nao'. */
export function situacaoIntervals(linha) {
  const s = linha?.intervals?.status;
  return s === 'ativa' || s === 'chaveInvalida' ? s : 'nao';
}

/** Situação do Garmin: 'conectado', 'expirado' (chave vencida) ou 'nao'. */
export function situacaoGarmin(linha, agora = Date.now()) {
  if (!linha?.garmin?.conectado) return 'nao';
  const expira = numero(linha.garmin.expiraEm);
  return expira !== null && expira < agora ? 'expirado' : 'conectado';
}

/** Etapas do funil já alcançadas por um usuário (ids de ETAPAS_DO_FUNIL). */
export function etapasAlcancadas(linha) {
  const etapas = ['cadastrou'];
  if (!linha?.aprovado) return etapas;
  etapas.push('aprovado');
  if (linha.onboarding === 'concluido' || linha.onboarding === 'pulado') etapas.push('onboarding');
  if (situacaoIntervals(linha) !== 'nao' || linha?.garmin?.conectado) etapas.push('conectou');
  if ((numero(linha?.atividades?.total) ?? 0) > 0) etapas.push('importou');
  return etapas;
}

/**
 * Resume as linhas do painel. Só contam como base os usuários aprovados e não bloqueados (quem ainda espera
 * aprovação aparece à parte), para as porcentagens refletirem quem de fato pode usar o sistema.
 */
export function resumirAdesao(linhas, agora = Date.now()) {
  const lista = Array.isArray(linhas) ? linhas : [];
  const base = lista.filter((l) => l.aprovado && l.ativo !== false);
  const total = base.length;
  const contar = (fn) => base.filter(fn).length;
  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));

  const faixas = base.map((l) => faixaDeUso(l, agora));
  const ativos7 = faixas.filter((f) => f === FAIXAS_DE_USO.SEMANA).length;
  const ativos30 = ativos7 + faixas.filter((f) => f === FAIXAS_DE_USO.MES).length;
  const comIntervals = contar((l) => situacaoIntervals(l) !== 'nao');
  const comGarmin = contar((l) => situacaoGarmin(l, agora) !== 'nao');
  const comAtividades = contar((l) => (numero(l.atividades?.total) ?? 0) > 0);
  const comPush = contar((l) => l.push === true);
  const comIa = contar((l) => (numero(l.ia?.chamadas) ?? 0) > 0 || (numero(l.treinosPlanejados?.porIa) ?? 0) > 0);

  const funil = ETAPAS_DO_FUNIL.map((etapa) => {
    const quantos = lista.filter((l) => etapasAlcancadas(l).includes(etapa.id)).length;
    return { ...etapa, quantos, percentual: lista.length === 0 ? 0 : Math.round((quantos / lista.length) * 100) };
  });

  return {
    cadastrados: lista.length,
    pendentes: lista.filter((l) => !l.aprovado && l.ativo !== false).length,
    bloqueados: lista.filter((l) => l.ativo === false).length,
    base: total,
    ativos7,
    ativos30,
    parados: contar((l) => estaParado(l, agora)),
    comIntervals,
    comGarmin,
    intervalsComProblema: contar((l) => situacaoIntervals(l) === 'chaveInvalida'),
    comAtividades,
    comPush,
    comIa,
    percentuais: {
      ativos7: pct(ativos7),
      ativos30: pct(ativos30),
      intervals: pct(comIntervals),
      garmin: pct(comGarmin),
      atividades: pct(comAtividades),
      push: pct(comPush),
      ia: pct(comIa),
    },
    funil,
  };
}
