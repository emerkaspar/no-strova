/** Estado da lista de atividades: busca, filtro e ordenação (mantidos ao voltar do detalhe). */
export const estadoAtividades = {
  busca: '',
  esporte: '',
  ordem: { campo: 'data', direcao: 'desc' },
};

export function alternarOrdem(campo) {
  const atual = estadoAtividades.ordem;
  estadoAtividades.ordem = {
    campo,
    direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
  };
}
