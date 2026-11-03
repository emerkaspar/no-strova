export interface PerfilResumo {
  role: string;
  aprovado: boolean;
  ativo: boolean;
}

export interface UsuarioPendente {
  uid: string;
  nome: string;
  email: string;
  criadoEm: number | null;
}
