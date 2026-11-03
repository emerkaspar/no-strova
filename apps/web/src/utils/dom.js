/**
 * Cria elementos sem innerHTML: todo texto entra como nó de texto (sem risco de XSS).
 * Props: `class`, `onClick`/`onInput`/... (eventos), propriedades do elemento ou atributos.
 */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') {
      el.className = valor;
    } else if (chave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(chave.slice(2).toLowerCase(), valor);
    } else if (chave in el && chave !== 'list') {
      el[chave] = valor;
    } else {
      el.setAttribute(chave, valor === true ? '' : valor);
    }
  }
  el.append(...filhos.flat().filter((f) => f !== null && f !== undefined && f !== false));
  return el;
}
