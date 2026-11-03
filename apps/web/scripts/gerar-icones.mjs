// Gera favicon, ícones do PWA e o logo da interface a partir de assets/logo.png (arte original, 1254×1254).
// Uso: npm run icones -w apps/web
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = resolve(raiz, 'assets/logo.png');
const publico = resolve(raiz, 'public');
const icones = resolve(publico, 'icons');
mkdirSync(icones, { recursive: true });

const PRETO = { r: 0, g: 0, b: 0, alpha: 1 };
// Recorte quadrado justo em volta do texto: legível mesmo em 16–32 px.
const RECORTE_FAVICON = { left: 42, top: 57, width: 1170, height: 1170 };

const png = (entrada) => entrada.png({ compressionLevel: 9 });
const completo = (tamanho) => png(sharp(fonte).resize(tamanho, tamanho));
const favicon = (tamanho) => png(sharp(fonte).extract(RECORTE_FAVICON).resize(tamanho, tamanho));

/** Maskable: o sistema corta até 20% das bordas, então o logo ocupa 70% central sobre fundo preto. */
async function maskable(tamanho) {
  const miolo = await sharp(fonte).resize(Math.round(tamanho * 0.7)).png().toBuffer();
  return png(sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: PRETO } }).composite([{ input: miolo, gravity: 'center' }]));
}

/** ICO com uma imagem PNG embutida (aceito por todos os navegadores atuais). */
function empacotarIco(pngBuffer, tamanho) {
  const cabecalho = Buffer.alloc(22);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // tipo: ícone
  cabecalho.writeUInt16LE(1, 4); // quantidade de imagens
  cabecalho.writeUInt8(tamanho, 6);
  cabecalho.writeUInt8(tamanho, 7);
  cabecalho.writeUInt16LE(1, 10); // planos
  cabecalho.writeUInt16LE(32, 12); // bits por pixel
  cabecalho.writeUInt32LE(pngBuffer.length, 14);
  cabecalho.writeUInt32LE(22, 18); // deslocamento dos dados
  return Buffer.concat([cabecalho, pngBuffer]);
}

const saidas = [
  [resolve(publico, 'logo.png'), completo(256)],
  [resolve(publico, 'favicon-32.png'), favicon(32)],
  [resolve(publico, 'favicon-48.png'), favicon(48)],
  [resolve(icones, 'icon-192.png'), completo(192)],
  [resolve(icones, 'icon-512.png'), completo(512)],
  [resolve(icones, 'icon-maskable-512.png'), await maskable(512)],
  [resolve(icones, 'apple-touch-icon.png'), completo(180)],
];
for (const [destino, imagem] of saidas) {
  writeFileSync(destino, await imagem.toBuffer());
  console.log(`gerado ${destino.replace(`${raiz}\\`, '').replace(`${raiz}/`, '')}`);
}
writeFileSync(resolve(publico, 'favicon.ico'), empacotarIco(await favicon(48).toBuffer(), 48));
console.log('gerado public/favicon.ico');
