/** Estado da tela do Plano, mantido ao navegar e voltar. */
export const estadoPlano = {
  visao: 'semana', // 'semana' | 'mes'
  ancora: null, // yyyy-mm-dd de referência do calendário; null = hoje
};

/** Sugestões de vínculo que o usuário dispensou ("não foi esse") nesta sessão. */
export const vinculosIgnorados = new Set();
