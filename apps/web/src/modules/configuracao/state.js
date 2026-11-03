/** Estado da tela de configuração: vigência em edição (null = nova). */
export const estadoConfiguracao = {
  editandoId: null,
};

export function editar(id) {
  estadoConfiguracao.editandoId = id;
}
