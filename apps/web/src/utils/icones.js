const NS = 'http://www.w3.org/2000/svg';

// Ícones de traço (24×24, sem preenchimento), desenhados para a barra de abas.
const CAMINHOS = Object.freeze({
  inicio: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9.5h13V10', 'M10 19.5v-5.5h4v5.5'],
  atividades: ['M3 12h4l2.5-7 5 14L17 12h4'],
  medalha: ['M12 15a5.5 5.5 0 1 0 0-11a5.5 5.5 0 0 0 0 11z', 'M8.6 14.2L7 21l5-2.6L17 21l-1.6-6.8', 'M12 7.2l.95 1.9 2.1.3-1.5 1.5.35 2.1L12 12l-1.9 1 .35-2.1-1.5-1.5 2.1-.3z'],
  rota: ['M6 19a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z', 'M18 7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z', 'M8.2 16.8H14a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h5.8'],
  seta: ['M5 12h14', 'M13 6l6 6-6 6'],
  olho: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'],
  chevronBaixo: ['M6 9.5l6 6 6-6'],
  mais: ['M12 5v14', 'M5 12h14'],
  chevronEsq: ['M14.5 6l-6 6 6 6'],
  chevronDir: ['M9.5 6l6 6-6 6'],
  importar: ['M12 16V4', 'M7.5 8.5L12 4l4.5 4.5', 'M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3'],
  sol: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'],
  lua: ['M20 14.2A8 8 0 0 1 9.8 4a8 8 0 1 0 10.2 10.2z'],
  sair: ['M9.5 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h3.5', 'M15.5 8l4 4-4 4', 'M19.5 12H9.5'],
  progressao: ['M4 4v16h16', 'M7.5 15l3.5-4.5 3 2.5 5-6.5', 'M16 6.5h3.5V10'],
  plano: ['M4 6.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z', 'M4 10h16', 'M8.5 3v4M15.5 3v4'],
  treinos: ['M3 17h3.5v-5H10v5h3v-9h3.5v9H20', 'M3 20.5h17'],
  peso: ['M5 4h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4z', 'M8.5 11.5a3.5 3.5 0 0 1 7 0', 'M12 11.5l1.8-2.3'],
  configuracao: ['M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1', 'M15 5v4M9 10v4M17 15v4'],
  // esportes e métricas (tabela de atividades)
  ciclismo: ['M2.2 17a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0', 'M14.2 17a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0', 'M6 17l4-8h5l3 8M10 9l3 8H6M15 9l-1-3h-2'],
  corrida: ['M12.6 4.5a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0', 'M13 8.5L10.5 13M12.8 9.5L17.5 11.5L19.5 9.5M12.4 10L8.5 9.5L6.5 12', 'M10.5 13L14.5 15.2L13.5 20.5M10.5 13L7.5 16.5L4 15.5'],
  outro: ['M13 3L5 14h6l-1 7 8-11h-6z'],
  // avisos
  fechar: ['M6 6l12 12', 'M18 6L6 18'],
  ok: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M8 12.5l3 3 5-6'],
  info: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M12 11v5', 'M12 7.8v.2'],
  alerta: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17v.2'],
  // origem da atividade (tabela de atividades)
  garmin: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M12 7.5l4.5 8.5h-9z'],
  ia: ['M10.5 6c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5z', 'M19 2.5c.25 1.7.8 2.25 2.5 2.5-1.7.25-2.25.8-2.5 2.5-.25-1.7-.8-2.25-2.5-2.5 1.7-.25 2.25-.8 2.5-2.5z', 'M18.5 16.5c.2 1.3.6 1.7 1.9 1.9-1.3.2-1.7.6-1.9 1.9-.2-1.3-.6-1.7-1.9-1.9 1.3-.2 1.7-.6 1.9-1.9z'],
  lapis: ['M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z', 'M14 7l3 3'],
  arquivo: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  esporte: ['M8 3h8v6a4 4 0 0 1-8 0z', 'M8 5H4.5v1.5A3.5 3.5 0 0 0 8 10M16 5h3.5v1.5A3.5 3.5 0 0 1 16 10', 'M12 13v4M8.5 21h7M9.5 17.5h5'],
  setaCima: ['M12 19V5', 'M6 11l6-6 6 6'],
  setaBaixo: ['M12 5v14', 'M6 13l6 6 6-6'],
  elevacao: ['M3 19l6-10 4.5 7 2.5-3.5L21 19z', 'M9 9l1.8 2.2 1.2-1.2'],
  duracao: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M12 7v5l3 2'],
  distancia: ['M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z', 'M10 11a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  hrss: ['M13 3L5 14h6l-1 7 8-11h-6z'],
  fc: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z'],
  perfil: ['M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20.5c0-3.7 3.4-6.2 7.5-6.2s7.5 2.5 7.5 6.2'],
  lixeira: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l.8 12.5h9.4L17.5 7', 'M10 11v5M14 11v5'],
  bloquear: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M5.6 5.6l12.8 12.8'],
  desbloquear: ['M5 11h14v9.5H5z', 'M8 11V8a4 4 0 0 1 7.6-1.7', 'M12 15v2'],
  recursos: ['M4 8h10M18 8h2', 'M4 16h2M10 16h10', 'M14 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M6 16a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  // escala de sensação do "Como foi?" (1 = voando … 5 = destruído)
  sensacaoFoguete: ['M12 2.8c3.2 2.2 4.6 5.6 4.1 9.4l-1.6 2.4h-5L8 12.2c-.5-3.8.8-7.2 4-9.4z', 'M10.6 8.6a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0', 'M8.3 13.2L5.5 15.5l.6 3.4 3-1.8', 'M15.7 13.2l2.8 2.3-.6 3.4-3-1.8', 'M12 16.6c.9 1.3.9 2.7 0 4.1c-.9-1.4-.9-2.8 0-4.1z'],
  sensacaoBalao: ['M12 3a6 6 0 0 1 6 6c0 3.6-3 6.2-6 8c-3-1.8-6-4.4-6-8a6 6 0 0 1 6-6z', 'M9.2 7.6a3.2 3.2 0 0 1 1.9-1.7', 'M10.6 17l-.6 1.6h4l-.6-1.6', 'M12 18.6c-1.2 1 1.2 1.8 0 2.9'],
  sensacaoXicara: ['M5 9h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5z', 'M16 10.5h1.6a2.4 2.4 0 0 1 0 4.8H15.6', 'M4 21h13', 'M8.2 3.2c-.9 1 .9 1.6 0 2.8M12.2 3.2c-.9 1 .9 1.6 0 2.8'],
  sensacaoTartaruga: ['M5 16c0-4 3-7 7-7s7 3 7 7z', 'M12 9.2V16', 'M8.6 11.2c.4 1.5.5 3 .4 4.8', 'M15.4 11.2c-.4 1.5-.5 3-.4 4.8', 'M19 15.8c.3-1.9 1.3-2.9 2.6-2.5.9.3.9 1.6.2 2.5', 'M21.1 14.2h.01', 'M7.5 16v2.4M16.5 16v2.4', 'M5 15.6l-1.6.9'],
  sensacaoCoco: ['M5 19.5h14a2.5 2.5 0 0 0 0-5H5a2.5 2.5 0 0 0 0 5z', 'M7.5 14.5h9a2.2 2.2 0 0 0 0-4.4h-9a2.2 2.2 0 0 0 0 4.4z', 'M9.5 10.1h5c1.2 0 1.8-.9 1.4-1.9-.5-1.2-1.8-1.6-2.4-2.5-.5-.8-.2-1.8.6-2.6-2.8.3-5 2-5 4.5 0 .5.1.9.3 1.2-.8.2-.9.8.1 1.3z', 'M9.3 16.6h.01', 'M14.7 16.6h.01', 'M10.6 18.2c.9.6 1.9.6 2.8 0'],
  aprovacoes: ['M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6', 'M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M16.5 10.5l2 2 3.5-4'],
});

/** Ícone de traço pelo nome (inicio, atividades, plano, treinos, peso, configuracao, aprovacoes, ciclismo, corrida, outro, garmin, lapis, arquivo, fechar, ok, info, alerta, esporte, elevacao, setaCima, setaBaixo, duracao, distancia, hrss, fc). */
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
