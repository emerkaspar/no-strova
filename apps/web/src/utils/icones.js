const NS = 'http://www.w3.org/2000/svg';

// Ícones de traço (24×24, sem preenchimento), desenhados para a barra de abas.
const CAMINHOS = Object.freeze({
  inicio: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9.5h13V10', 'M10 19.5v-5.5h4v5.5'],
  atividades: ['M3 12h4l2.5-7 5 14L17 12h4'],
  plano: ['M4 6.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z', 'M4 10h16', 'M8.5 3v4M15.5 3v4'],
  treinos: ['M3 17h3.5v-5H10v5h3v-9h3.5v9H20', 'M3 20.5h17'],
  peso: ['M5 4h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4z', 'M8.5 11.5a3.5 3.5 0 0 1 7 0', 'M12 11.5l1.8-2.3'],
  configuracao: ['M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1', 'M15 5v4M9 10v4M17 15v4'],
  aprovacoes: ['M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6', 'M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M16.5 10.5l2 2 3.5-4'],
});

/** Ícone de traço pelo nome (inicio, atividades, plano, treinos, peso, configuracao, aprovacoes). */
export function icone(nome, tamanho = 24) {
  const el = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    width: tamanho,
    height: tamanho,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'icone',
  })) {
    el.setAttribute(k, String(v));
  }
  for (const d of CAMINHOS[nome] ?? []) {
    const caminho = document.createElementNS(NS, 'path');
    caminho.setAttribute('d', d);
    el.append(caminho);
  }
  return el;
}
