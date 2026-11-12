const LADO_FOTO = 256;
const ENTRADA_MAX = 15 * 1024 * 1024;

/**
 * Recorta o centro da imagem em quadrado, reduz para 256 px e devolve um JPEG (cabe folgado no limite de 600 KB das regras).
 * @param {File} arquivo
 * @returns {Promise<Blob>}
 */
export async function prepararFotoDePerfil(arquivo) {
  if (!arquivo?.type?.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
  if (arquivo.size > ENTRADA_MAX) throw new Error('A imagem é grande demais. Use uma de até 15 MB.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível ler essa imagem. Tente outro arquivo.');
  }
  const lado = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = LADO_FOTO;
  canvas.height = LADO_FOTO;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Não foi possível preparar a imagem. Tente outro arquivo.');
  return blob;
}
