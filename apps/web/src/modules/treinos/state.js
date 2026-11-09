/**
 * Estado da tela de Treinos, que sobrevive aos redesenhos (cada snapshot do Firestore refaz a tela).
 * Os níveis ficam nas preferências do usuário; o resto é só da sessão (menos as seções recolhidas, guardadas no navegador).
 */

/** Seções recolhíveis da aba "Treinos", na ordem em que aparecem. ("Meus trajetos" tem aba própria.) */
export const SECOES = Object.freeze([
  { id: 'semana', rotulo: 'Esta semana' },
  { id: 'biblioteca', rotulo: 'Biblioteca' },
  { id: 'meus', rotulo: 'Meus treinos' },
]);

const CHAVE_RECOLHIDAS = 'ns:treinos:recolhidas';

/** Seções recolhidas guardadas no navegador. Na primeira visita tudo abre, e a Biblioteca (a mais longa) passa a vir recolhida nas próximas. */
function lerRecolhidas() {
  try {
    const bruto = localStorage.getItem(CHAVE_RECOLHIDAS);
    if (bruto === null) {
      localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify(['biblioteca']));
      return [];
    }
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista.filter((id) => SECOES.some((s) => s.id === id)) : [];
  } catch {
    // navegador sem armazenamento (janela privada, dados bloqueados): tudo aberto
    return [];
  }
}

export function salvarRecolhidas(lista) {
  try {
    localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify(lista));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

export const estadoTreinos = {
  esporte: 'ciclismo',
  foco: '',
  /** nível de cada bloco ('todos' ou um nível); null segue o nível salvo nas preferências */
  nivelSemana: null,
  nivelBiblioteca: null,
  /** id do modelo aberto no detalhe */
  modeloAberto: null,
  /** { base } quando o construtor está aberto (base: modelo a duplicar/editar ou null) */
  construtor: null,
  /** sugestões: a semente do sorteio e os modelos recusados */
  semente: null,
  recusados: [],
  /** chaves 'data|modeloId' das sugestões que o usuário desmarcou */
  desmarcadas: [],
  /** ids das seções recolhidas */
  recolhidas: lerRecolhidas(),
  /** aba aberta ('treinos' ou 'trajetos'); null segue a última aba lembrada no navegador */
  aba: null,
  /** seção para onde a tela deve rolar ao abrir (uma vez) */
  rolarPara: null,
  /** seção Trajetos: o trajeto aberto, a métrica do gráfico, as passagens marcadas para comparar (até 2), o filtro de clima e a ordem da tabela */
  trajetos: novoEstadoDosTrajetos(),
};

function novoEstadoDosTrajetos() {
  return { aberto: null, metrica: 'desempenho', comparadas: [], ocultarClima: false, ordem: { campo: 'data', direcao: 'desc' } };
}

/** Prepara a tela de Treinos para abrir rolando até Trajetos, com o trajeto aberto (usado pelo detalhe da atividade). */
export function prepararEvolucaoDoTrajeto({ esporte, trajetoId }) {
  estadoTreinos.esporte = esporte;
  estadoTreinos.trajetos = { ...novoEstadoDosTrajetos(), aberto: trajetoId };
  estadoTreinos.aba = 'trajetos';
  estadoTreinos.rolarPara = 'trajetos';
}

export function reiniciarEstadoTreinos() {
  Object.assign(estadoTreinos, {
    esporte: 'ciclismo',
    foco: '',
    nivelSemana: null,
    nivelBiblioteca: null,
    modeloAberto: null,
    construtor: null,
    semente: null,
    recusados: [],
    desmarcadas: [],
    aba: null,
    rolarPara: null,
    trajetos: novoEstadoDosTrajetos(),
  });
}
