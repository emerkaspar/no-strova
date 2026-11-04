/** Estado da fila de aprovação: busca e ordenação da tabela. */
export const estadoAprovacoes = {
  busca: '',
  ordem: { campo: 'criadoEm', direcao: 'asc' },
};

export function alternarOrdem(campo) {
  const atual = estadoAprovacoes.ordem;
  estadoAprovacoes.ordem = {
    campo,
    direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
  };
}

/** Estado da lista de usuários: busca e ordenação da tabela. */
export const estadoUsuarios = {
  busca: '',
  ordem: { campo: 'nome', direcao: 'asc' },
};

export function alternarOrdemUsuarios(campo) {
  const atual = estadoUsuarios.ordem;
  estadoUsuarios.ordem = {
    campo,
    direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
  };
}

/** Aba aberta na página de Administração: 'aprovacoes', 'usuarios' ou 'sistema'. */
export const estadoAdmin = { aba: 'aprovacoes' };
