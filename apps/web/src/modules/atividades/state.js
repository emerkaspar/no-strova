/** Estado da lista de atividades: busca, filtro e ordenação (mantidos ao voltar do detalhe). */
export const estadoAtividades = {
  busca: '',
  esporte: '',
  ordem: { campo: 'data', direcao: 'desc' },
  /** O botão "Importar arquivo" do cabeçalho pede para abrir o painel de importação. */
  abrirImportar: false,
};

export function alternarOrdem(campo) {
  const atual = estadoAtividades.ordem;
  estadoAtividades.ordem = {
    campo,
    direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
  };
}

/** Evento "abra o painel de importação agora", para quando a lista já está aberta. */
export const EVENTO_IMPORTAR = 'no-strova:importar';

/**
 * Abre a lista de atividades com o painel de importação aberto. Com a lista já aberta, avisa por evento;
 * senão deixa o pedido pendente (flag) e navega: a lista o atende ao ser montada.
 */
export function pedirImportacao() {
  if (window.location.hash === '#/atividades') {
    window.dispatchEvent(new CustomEvent(EVENTO_IMPORTAR));
    return;
  }
  estadoAtividades.abrirImportar = true;
  window.location.hash = '#/atividades';
}
