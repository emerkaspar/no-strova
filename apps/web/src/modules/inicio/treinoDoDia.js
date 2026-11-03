import { estresseDoTreino, fraseDoTreino } from '@no-strova/domain';
import { tituloDoDia, tituloDoTreino } from './blocos.js';

/**
 * Função "treino do dia" do gráfico: o que foi feito e o que está planejado (linhas com texto e esporte), ou null
 * (descanso). A última linha traz uma frase de humor (`piada`) que acompanha o esforço do dia. Lê `dados.atividades`, `dados.treinos` e `dados.dias` na hora da chamada, então acompanha os snapshots.
 * @param {{ atividades: any[], treinos: any[], dias: Array<{ data: string, estresse: number }> }} dados
 * @param {string} hoje
 */
export function criarTreinoDoDia(dados, hoje) {
  return (data) => {
    const feitas = dados.atividades.filter((a) => a.data === data);
    const planejados = dados.treinos.filter((t) => t.data === data && t.status === 'planejado' && data >= hoje);
    const detalhe = (t) => `${tituloDoTreino([t])} · ${t.duracaoMin} min`;
    const linhas = [];
    if (feitas.length > 0) linhas.push({ texto: planejados.length > 0 ? `Feito: ${tituloDoDia(feitas)}` : tituloDoDia(feitas), esporte: feitas[0].esporte });
    else if (dados.dias.some((d) => d.data === data && d.estresse > 0)) linhas.push({ texto: 'Treino realizado', esporte: 'outro' });
    for (const t of planejados) linhas.push({ texto: feitas.length > 0 ? `Planejado: ${detalhe(t)}` : detalhe(t), esporte: t.esporte });
    if (linhas.length === 0) return null;

    // Esforço do dia: o estresse do que foi feito (ou do dia) e do que está planejado; vale o mais pesado.
    const estresseDoDia = dados.dias.find((d) => d.data === data)?.estresse ?? 0;
    const feito = feitas.reduce((soma, a) => soma + (Number.isFinite(a.hrss) ? a.hrss : 0), 0) || estresseDoDia;
    const previsto = planejados.reduce((soma, t) => soma + (estresseDoTreino(t, dados.configs ?? [], dados.calibracao ?? null) ?? 0), 0);
    const aindaVai = planejados.length > 0;
    linhas[linhas.length - 1].piada = fraseDoTreino({ hrss: aindaVai ? Math.max(previsto, feito) : feito, data, feito: !aindaVai });
    return linhas;
  };
}
