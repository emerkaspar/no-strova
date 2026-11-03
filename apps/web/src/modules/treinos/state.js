/**
 * Estado da tela de Treinos, que sobrevive aos redesenhos (cada snapshot do Firestore refaz a tela).
 * Os níveis ficam nas preferências do usuário; o resto é só da sessão.
 */
export const estadoTreinos = {
  /** 'sugestoes' | 'biblioteca' | 'meus' */
  aba: 'sugestoes',
  esporte: 'ciclismo',
  foco: '',
  /** id do modelo aberto no detalhe */
  modeloAberto: null,
  /** { base } quando o construtor está aberto (base: modelo a duplicar/editar ou null) */
  construtor: null,
  /** sugestões: a semente do sorteio e os modelos recusados */
  semente: null,
  recusados: [],
  /** chaves 'data|modeloId' das sugestões que o usuário desmarcou */
  desmarcadas: [],
};

export function reiniciarEstadoTreinos() {
  Object.assign(estadoTreinos, { aba: 'sugestoes', esporte: 'ciclismo', foco: '', modeloAberto: null, construtor: null, semente: null, recusados: [], desmarcadas: [] });
}
