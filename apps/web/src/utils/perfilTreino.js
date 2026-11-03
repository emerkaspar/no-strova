import { descreverPasso, duracaoTotalS, expandirPassos, formatarSegundos } from '@no-strova/domain';

const NS = 'http://www.w3.org/2000/svg';
const NIVEL_DA_ZONA = { Z1: 0.22, Z2: 0.4, Z3: 0.62, Z4: 0.82, Z5: 1 };

/**
 * Perfil do treino: uma barra por bloco, com a largura proporcional ao tempo e a altura e a cor pela zona (Z1 baixa e
 * azul até Z5 alta e vermelha). Dá para escolher o treino sem ler os passos.
 * @param {any[]} passos
 * @param {{ altura?: number }} [opcoes]
 */
export function perfilDoTreino(passos, { altura = 56 } = {}) {
  const blocos = expandirPassos(passos);
  const total = duracaoTotalS(passos) || 1;
  const largura = 300;
  const folga = 1; // respiro entre as barras
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'perfil-treino');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Perfil do treino: ${passos.map(descreverPasso).join(', ')}. Duração total ${formatarSegundos(total)}.`);

  let x = 0;
  for (const b of blocos) {
    const w = (b.duracaoS / total) * largura;
    const h = Math.max(3, NIVEL_DA_ZONA[b.zona] * altura);
    const barra = document.createElementNS(NS, 'rect');
    barra.setAttribute('x', x.toFixed(2));
    barra.setAttribute('y', (altura - h).toFixed(2));
    barra.setAttribute('width', Math.max(0.5, w - folga).toFixed(2));
    barra.setAttribute('height', h.toFixed(2));
    barra.setAttribute('rx', '1.5');
    barra.setAttribute('class', `perfil-barra perfil-${b.zona.toLowerCase()}`);
    const titulo = document.createElementNS(NS, 'title');
    titulo.textContent = `${formatarSegundos(b.duracaoS)} em ${b.zona}${b.descricao ? ` · ${b.descricao}` : ''}`;
    barra.append(titulo);
    svg.append(barra);
    x += w;
  }
  return svg;
}

/** Baixa um arquivo gerado no navegador (sem ir ao servidor). */
export function baixarArquivo(bytes, nome, tipo = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
