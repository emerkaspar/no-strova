import { ESTADOS_ONBOARDING, validarConfigAtleta, validarDadosPerfil, validarRotina } from '@no-strova/domain';
import { observarAtividades } from '../infrastructure/atividadesRepo.js';
import { observarPreferencias, salvarPreferencias } from '../infrastructure/calibracaoRepo.js';
import { idConfig, observarConfigs, salvarConfig } from '../infrastructure/configsRepo.js';
import { atualizarDadosPessoais } from '../infrastructure/perfilRepo.js';
import { observarMetasPeso, observarPesagens } from '../infrastructure/pesoRepo.js';
import { hojeIso } from '../utils/formatters.js';
import { salvarMetaDePeso, salvarPesagem } from './peso.js';

/** Espera a primeira resposta de um listener e o cancela (leitura única, sem deixar listener aberto). */
function primeiraEmissao(observar) {
  return new Promise((resolve, reject) => {
    let cancelar = null;
    let resolvido = false;
    const concluir = (fn, valor) => {
      if (resolvido) return;
      resolvido = true;
      cancelar?.();
      fn(valor);
    };
    cancelar = observar(
      (dados) => concluir(resolve, dados),
      (erro) => concluir(reject, erro),
    );
    if (resolvido) cancelar();
  });
}

/** Tudo que o wizard precisa para abrir já preenchido. Falha de leitura de um item não derruba os outros. */
export async function carregarDadosDoWizard(uid) {
  const [configs, preferencias, pesagens, metasPeso, atividades] = await Promise.all([
    primeiraEmissao((ok, erro) => observarConfigs(uid, ok, erro)).catch(() => []),
    primeiraEmissao((ok, erro) => observarPreferencias(uid, ok, erro)).catch(() => null),
    primeiraEmissao((ok, erro) => observarPesagens(uid, ok, erro)).catch(() => []),
    primeiraEmissao((ok, erro) => observarMetasPeso(uid, ok, erro)).catch(() => []),
    primeiraEmissao((ok, erro) => observarAtividades(uid, ok, erro)).catch(() => []),
  ]);
  const datas = atividades.map((a) => a.data).filter(Boolean);
  return {
    configs,
    preferencias,
    pesagens,
    metaPesoAtiva: metasPeso.find((m) => m.status === 'ativa') ?? null,
    totalAtividades: atividades.length,
    dataDaPrimeiraAtividade: datas.length > 0 ? datas.reduce((menor, d) => (d < menor ? d : menor)) : null,
  };
}

/** Passo "Você": nome e data de nascimento. Lança Error em português. */
export async function salvarPassoVoce({ uid, nome, dataNascimento }) {
  const r = validarDadosPerfil({ nome, dataNascimento });
  if (!r.valido) throw new Error(r.erros.join(' '));
  await atualizarDadosPessoais(uid, r.valores);
  return r.valores;
}

const CAMPOS_DA_CONFIG = ['fcMax', 'fcRepouso', 'lthr', 'sexo', 'pesoKg', 'alturaCm'];

/**
 * Passos "Corpo" e "Coração": grava a configuração do atleta. Sem nenhuma configuração, a primeira vigência começa na
 * atividade mais antiga (ou hoje); com configuração, valores diferentes viram uma nova vigência de hoje (o histórico
 * continua com os valores antigos até o usuário recalcular). Também registra a pesagem de hoje quando o peso mudou.
 * @returns {Promise<{ alterou: boolean }>} `alterou` é false quando nada mudou (nada foi gravado)
 */
export async function salvarPassoCorpoECoracao({ uid, entrada, dados }) {
  const hoje = hojeIso();
  const atual = dados.configs[0] ?? null;
  const vigenteDesde = atual ? hoje : (dados.dataDaPrimeiraAtividade ?? hoje);
  const r = validarConfigAtleta({ ...entrada, vigenteDesde });
  if (!r.valido) throw new Error(r.erros.join(' '));

  const mudou = !atual || CAMPOS_DA_CONFIG.some((c) => atual[c] !== r.valores[c]);
  if (mudou) await salvarConfig(uid, r.valores);

  const ultima = dados.pesagens.at(-1) ?? null;
  if (!ultima || ultima.pesoKg !== r.valores.pesoKg) {
    await salvarPesagem({ uid, entrada: { data: hoje, pesoKg: r.valores.pesoKg }, hoje });
    dados.pesagens = [...dados.pesagens.filter((p) => p.data !== hoje), { data: hoje, pesoKg: r.valores.pesoKg }];
  }
  dados.configs = mudou ? [{ ...r.valores, id: idConfig(uid, vigenteDesde) }, ...dados.configs.filter((c) => c.vigenteDesde !== vigenteDesde)] : dados.configs;
  return { alterou: mudou };
}

/** Passo "Nível". */
export function salvarPassoNivel({ uid, nivel, esporte }) {
  return salvarPreferencias(uid, { nivelTreinos: nivel, esportePrincipal: esporte });
}

/** Passo "Semana": dias, longão e horas. Lança Error em português. */
export async function salvarPassoSemana({ uid, entrada }) {
  const r = validarRotina(entrada);
  if (!r.valido) throw new Error(r.erros.join(' '));
  const { diasTreino, diaLongao, horasSemana } = r.valores;
  await salvarPreferencias(uid, { diasTreino, diaLongao, horasSemana });
  return r.valores;
}

/**
 * Passo "Meta": define a meta de peso ativa. Retorna os avisos (ex.: ritmo agressivo); lança Error em português quando
 * a meta é inválida.
 */
export async function salvarPassoMeta({ uid, pesoAlvoKg, dataAlvo, dados, alturaCm }) {
  return salvarMetaDePeso({
    uid,
    entrada: { pesoAlvoKg, dataAlvo },
    hoje: hojeIso(),
    metasAtivas: dados.metaPesoAtiva ? [dados.metaPesoAtiva] : [],
    pesagens: dados.pesagens,
    alturaCm,
  });
}

/** Marca o wizard como concluído. */
export function concluirOnboarding(uid) {
  return salvarPreferencias(uid, { onboarding: ESTADOS_ONBOARDING.CONCLUIDO });
}

/** Marca como "pulado" só quando ainda não foi concluído (fechar o wizard na revisão não rebaixa o estado). */
export function pularOnboarding(uid, preferencias) {
  if (preferencias?.onboarding === ESTADOS_ONBOARDING.CONCLUIDO) return Promise.resolve();
  return salvarPreferencias(uid, { onboarding: ESTADOS_ONBOARDING.PULADO });
}
