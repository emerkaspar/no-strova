const CHAVE = 'no-strova:tema';

function lerSalvo() {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function salvar(tema) {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Armazenamento indisponível (modo privado, bloqueado): o tema vale só nesta sessão.
  }
}

/** Tema em uso: o escolhido pelo usuário ou, na falta dele, o do sistema. */
export function temaEfetivo() {
  const escolhido = document.documentElement.dataset.tema;
  if (escolhido === 'claro' || escolhido === 'escuro') return escolhido;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTemaSalvo() {
  const salvo = lerSalvo();
  if (salvo === 'claro' || salvo === 'escuro') document.documentElement.dataset.tema = salvo;
}

/** Alterna entre claro e escuro e lembra a escolha. Retorna o novo tema. */
export function alternarTema() {
  const novo = temaEfetivo() === 'escuro' ? 'claro' : 'escuro';
  document.documentElement.dataset.tema = novo;
  salvar(novo);
  return novo;
}
