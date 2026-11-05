import { configVigenteEm } from './configAtleta.js';
import { expandirPassos, faixaDeFcDaZona } from './treinosEstruturados.js';

/**
 * Exportação do plano para um arquivo JSON que o script `tools/garmin-enviar` lê para criar os treinos no Garmin
 * Connect e agendá-los no calendário. Cada treino sai com os passos já expandidos (a série vira esforço, recuperação,
 * esforço…) e com a faixa de FC em bpm de cada passo, pela configuração vigente na data do treino. Função pura.
 */

export const FORMATO_PLANO = 'no-strova-plano';
export const VERSAO_PLANO = 1;

const ROTULO_ESPORTE = { ciclismo: 'Ciclismo', corrida: 'Corrida' };

/** Nome do treino: o do treino estruturado ou, no treino livre, "Ciclismo Z2 60min". */
function nomeDoTreino(t) {
  if (t.nomeTreino) return t.nomeTreino;
  return `${ROTULO_ESPORTE[t.esporte] ?? 'Treino'} ${t.zona} ${Math.round(t.duracaoMin)}min`;
}

/** Passos do treino em blocos planos; o treino livre vira um passo único na zona e duração planejadas. */
function blocosDoTreino(t) {
  if (t.passos?.length) return expandirPassos(t.passos);
  const minutos = Number(t.duracaoMin);
  if (!Number.isFinite(minutos) || minutos <= 0 || !t.zona) return [];
  return [{ papel: 'principal', duracaoS: Math.round(minutos * 60), zona: t.zona, descricao: null, alvoAberto: false }];
}

/**
 * Monta o conteúdo do arquivo do plano.
 * @param {any[]} treinos treinos planejados (qualquer status: só os `planejado` entram)
 * @param {{ configs?: any[], de: string, ate: string, agora?: number }} opcoes período yyyy-mm-dd, inclusive
 * @returns {{ plano: { formato: string, versao: number, geradoEm: string, de: string, ate: string, treinos: any[] }, ignorados: { id: string, data: string, nome: string, motivo: string }[] }}
 */
export function montarPlanoParaExportar(treinos, { configs = [], de, ate, agora = Date.now() }) {
  const saida = [];
  const ignorados = [];
  const doPeriodo = (treinos ?? [])
    .filter((t) => t.status === 'planejado' && t.data >= de && t.data <= ate)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  for (const t of doPeriodo) {
    const nome = nomeDoTreino(t);
    const blocos = blocosDoTreino(t);
    if (blocos.length === 0) {
      ignorados.push({ id: t.id, data: t.data, nome, motivo: 'sem passos nem duração para exportar' });
      continue;
    }
    const config = configVigenteEm(configs, t.data);
    saida.push({
      id: t.id,
      data: t.data,
      nome,
      esporte: t.esporte,
      passos: blocos.map((b) => ({
        papel: b.papel,
        duracaoS: b.duracaoS,
        zona: b.zona,
        descricao: b.descricao ?? null,
        // alvo aberto (teste de LTHR) ou sem configuração de FC: o passo fica sem faixa
        fc: b.alvoAberto ? null : faixaDeFcDaZona(b.zona, config),
      })),
    });
  }

  return {
    plano: { formato: FORMATO_PLANO, versao: VERSAO_PLANO, geradoEm: new Date(agora).toISOString(), de, ate, treinos: saida },
    ignorados,
  };
}
