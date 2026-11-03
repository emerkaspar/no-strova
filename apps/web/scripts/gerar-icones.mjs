// Gera os ícones PNG do PWA sem dependências externas (anel branco sobre azul).
// Uso: npm run icones -w apps/web
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const saida = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(saida, { recursive: true });

const FUNDO = [37, 99, 235];
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

const suave = (d) => Math.min(1, Math.max(0, 0.5 - d));

function gerarPng(tam, { mascara }) {
  const linhas = Buffer.alloc((tam * 4 + 1) * tam);
  const centro = tam / 2;
  const raioExterno = tam * 0.3;
  const raioInterno = tam * 0.18;
  const canto = tam * 0.2;
  for (let y = 0; y < tam; y++) {
    const base = y * (tam * 4 + 1);
    for (let x = 0; x < tam; x++) {
      const px = x + 0.5 - centro;
      const py = y + 0.5 - centro;
      const dist = Math.hypot(px, py);
      // Opacidade do quadrado arredondado (maskable ocupa tudo).
      let alfa = 1;
      if (!mascara) {
        const qx = Math.abs(px) - (centro - canto);
        const qy = Math.abs(py) - (centro - canto);
        alfa = suave(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - canto);
      }
      const anel = Math.min(suave(dist - raioExterno), suave(raioInterno - dist));
      const i = base + 1 + x * 4;
      for (let c = 0; c < 3; c++) linhas[i + c] = Math.round(FUNDO[c] + (255 - FUNDO[c]) * anel);
      linhas[i + 3] = Math.round(alfa * 255);
    }
  }
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(tam, 0);
  cabecalho.writeUInt32BE(tam, 4);
  cabecalho.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(linhas)),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const arquivos = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [nome, tam, mascara] of arquivos) {
  writeFileSync(resolve(saida, nome), gerarPng(tam, { mascara }));
  console.log(`gerado ${nome}`);
}
