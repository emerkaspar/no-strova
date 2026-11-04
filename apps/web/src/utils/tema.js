const CHAVE = 'no-strova:tema';
const COR_DA_BARRA = { escuro: '#FF5200', claro: '#f6f6f4' };

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

function aplicar(tema) {
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[tema]);
}

/** Tema em uso. O padrão é o escuro; o claro só vale se o usuário escolheu. */
export function temaEfetivo() {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';
}

export function aplicarTemaSalvo() {
  aplicar(lerSalvo() === 'claro' ? 'claro' : 'escuro');
}

/** Alterna entre escuro e claro e lembra a escolha. Retorna o novo tema. */
export function alternarTema() {
  const novo = temaEfetivo() === 'escuro' ? 'claro' : 'escuro';
  aplicar(novo);
  salvar(novo);
  return novo;
}
