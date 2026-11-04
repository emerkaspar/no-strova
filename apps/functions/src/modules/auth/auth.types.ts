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

/** Linha da tela de usuários do admin. */
export interface UsuarioAdmin extends UsuarioPendente {
  role: string;
  aprovado: boolean;
  ativo: boolean;
  recursos: { ia: boolean; garmin: boolean };
}
