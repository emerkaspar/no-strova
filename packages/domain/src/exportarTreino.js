import { expandirPassos, faixaDeFcDaZona } from './treinosEstruturados.js';

/**
 * Exportação de um treino estruturado para um arquivo de treino FIT (Garmin, Wahoo e outros aparelhos que importam
 * treinos FIT). Cada bloco vira um passo por tempo, com a faixa de FC da zona (em bpm, da configuração do atleta).
 * As séries são expandidas em passos (esforço, recuperação…), então a duração bate com a do app. Função pura.
 *
 * Mensagens: file_id (tipo "workout"), workout (nome, esporte, nº de passos) e workout_step (um por bloco).
 * Valores de referência do perfil FIT: duração por tempo = 0 (em milissegundos); alvo de FC = 1, com
 * target_value = 0 (personalizado) e limites em bpm + 100; intensidades: ativo 0, descanso 1, aquecimento 2,
 * desaquecimento 3, recuperação 4.
 */

const EPOCA_FIT_S = 631065600; // 1989-12-31 em segundos Unix
const MAX_PASSOS = 99;

const ESPORTE_FIT = { corrida: 1, ciclismo: 2 };
const INTENSIDADE_FIT = { aquecimento: 2, principal: 0, recuperacao: 4, desaquecimento: 3 };

const TIPOS = { enum: 0x00, uint16: 0x84, uint32: 0x86, string: 0x07, uint32z: 0x8c };

// CRC-16 do FIT
const TABELA_CRC = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crcFit(bytes, crcInicial = 0) {
  let crc = crcInicial;
  for (const b of bytes) {
    let tmp = TABELA_CRC[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ TABELA_CRC[b & 0xf];
    tmp = TABELA_CRC[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ TABELA_CRC[(b >> 4) & 0xf];
  }
  return crc;
}

/** Texto em UTF-8 com tamanho fixo (preenchido com zeros; o último byte é sempre o terminador). */
function textoFixo(texto, tamanho) {
  const bytes = new TextEncoder().encode(texto);
  const saida = new Uint8Array(tamanho);
  let n = Math.min(bytes.length, tamanho - 1);
  while (n > 0 && (bytes[n] & 0xc0) === 0x80) n--; // não corta um caractere no meio
  saida.set(bytes.slice(0, n));
  return saida;
}

const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/** Definição de mensagem: campos como [número, tamanho, tipo base]. */
function definicao(local, mensagemGlobal, campos) {
  return [0x40 | local, 0, 0, ...u16(mensagemGlobal), campos.length, ...campos.flatMap(([n, t, b]) => [n, t, b])];
}

/**
 * Gera o arquivo de treino FIT.
 * @param {{ nome: string, esporte: string, passos: any[] }} treino
 * @param {{ config?: { lthr: number, fcMax: number }|null, agora?: number }} [opcoes] `agora`: instante em ms (para testes)
 * @returns {{ bytes: Uint8Array, nomeArquivo: string, passos: number }}
 */
export function gerarFitDoTreino(treino, { config = null, agora = Date.now() } = {}) {
  const blocos = expandirPassos(treino.passos);
  if (blocos.length === 0) throw new Error('O treino não tem passos para exportar.');
  if (blocos.length > MAX_PASSOS) throw new Error(`O treino tem ${blocos.length} passos e os aparelhos aceitam até ${MAX_PASSOS}. Reduza as repetições para exportar.`);

  const dados = [];
  const empurrar = (...partes) => {
    for (const p of partes) dados.push(...p);
  };

  // file_id
  empurrar(
    definicao(0, 0, [[0, 1, TIPOS.enum], [1, 2, TIPOS.uint16], [2, 2, TIPOS.uint16], [3, 4, TIPOS.uint32z], [4, 4, TIPOS.uint32]]),
    [0x00, 5, ...u16(255), ...u16(0), ...u32(1), ...u32(Math.floor(agora / 1000) - EPOCA_FIT_S)],
  );

  // workout
  empurrar(
    definicao(1, 26, [[4, 1, TIPOS.enum], [5, 4, TIPOS.uint32z], [6, 2, TIPOS.uint16], [8, 32, TIPOS.string]]),
    [0x01, ESPORTE_FIT[treino.esporte] ?? 0, ...u32(0), ...u16(blocos.length), ...textoFixo(treino.nome, 32)],
  );

  // workout_step: um por bloco, na ordem de execução
  empurrar(
    definicao(2, 27, [
      [254, 2, TIPOS.uint16],
      [0, 16, TIPOS.string],
      [1, 1, TIPOS.enum],
      [2, 4, TIPOS.uint32],
      [3, 1, TIPOS.enum],
      [4, 4, TIPOS.uint32],
      [5, 4, TIPOS.uint32],
      [6, 4, TIPOS.uint32],
      [7, 1, TIPOS.enum],
    ]),
  );
  const totalEsforcos = blocos.filter((b) => b.papel === 'principal').length;
  let esforco = 0;
  blocos.forEach((b, i) => {
    let nome;
    if (b.papel === 'aquecimento') nome = 'Aquecimento';
    else if (b.papel === 'desaquecimento') nome = 'Volta a calma';
    else if (b.papel === 'recuperacao') nome = 'Recuperacao';
    else nome = totalEsforcos > 1 ? `Esforco ${++esforco}/${totalEsforcos}` : 'Esforco';
    const faixa = faixaDeFcDaZona(b.zona, config);
    empurrar([
      0x02,
      ...u16(i),
      ...textoFixo(nome, 16),
      0, // duração por tempo
      ...u32(Math.round(b.duracaoS * 1000)),
      faixa ? 1 : 2, // alvo de FC (ou aberto, sem configuração)
      ...u32(0), // personalizado
      ...u32(faixa ? faixa[0] + 100 : 0),
      ...u32(faixa ? faixa[1] + 100 : 0),
      INTENSIDADE_FIT[b.papel] ?? 0,
    ]);
  });

  const cabecalho = [14, 0x20, ...u16(2132), ...u32(dados.length), 0x2e, 0x46, 0x49, 0x54]; // ".FIT"
  const crcCabecalho = crcFit(cabecalho);
  const arquivo = [...cabecalho, ...u16(crcCabecalho), ...dados];
  arquivo.push(...u16(crcFit(arquivo)));

  const base = treino.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return { bytes: Uint8Array.from(arquivo), nomeArquivo: `${base || 'treino'}.fit`, passos: blocos.length };
}
