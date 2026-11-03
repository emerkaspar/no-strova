import { describe, expect, it } from 'vitest';
import { modeloPorId } from './catalogoTreinos.js';
import { gerarFitDoTreino } from './exportarTreino.js';
import { duracaoTotalS, expandirPassos, faixaDeFcDaZona } from './treinosEstruturados.js';

const config = { lthr: 170, fcMax: 190 };

// CRC-16 do FIT, reimplementado aqui de forma independente (loop por bit) para conferir o do gerador
function crcDeReferencia(bytes) {
  let crc = 0;
  for (const b of bytes) {
    for (let i = 0; i < 8; i++) {
      const bit = ((b >> i) & 1) ^ (crc & 1);
      crc >>= 1;
      if (bit) crc ^= 0xa001; // polinômio CRC-16/ARC (o FIT usa o mesmo cálculo, byte a byte, LSB primeiro)
    }
  }
  return crc;
}

/** Decodificador mínimo de FIT: devolve as mensagens (número global e campos por número). */
function decodificar(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tamanhoCabecalho = bytes[0];
  const tamanhoDados = dv.getUint32(4, true);
  const mensagens = [];
  const definicoes = new Map();
  let pos = tamanhoCabecalho;
  const fim = tamanhoCabecalho + tamanhoDados;
  while (pos < fim) {
    const cab = bytes[pos++];
    const local = cab & 0x0f;
    if (cab & 0x40) {
      pos += 1; // reservado
      const little = bytes[pos++] === 0;
      const global = dv.getUint16(pos, little);
      pos += 2;
      const n = bytes[pos++];
      const campos = [];
      for (let i = 0; i < n; i++) {
        campos.push({ num: bytes[pos], tamanho: bytes[pos + 1], base: bytes[pos + 2] });
        pos += 3;
      }
      definicoes.set(local, { global, campos, little });
    } else {
      const def = definicoes.get(local);
      const campos = {};
      for (const c of def.campos) {
        if (c.base === 0x07) {
          const texto = new TextDecoder().decode(bytes.slice(pos, pos + c.tamanho)).replace(/\0.*$/, '');
          campos[c.num] = texto;
        } else if (c.tamanho === 1) campos[c.num] = bytes[pos];
        else if (c.tamanho === 2) campos[c.num] = dv.getUint16(pos, def.little);
        else campos[c.num] = dv.getUint32(pos, def.little);
        pos += c.tamanho;
      }
      mensagens.push({ global: def.global, campos });
    }
  }
  return { mensagens, tamanhoDados, tamanhoCabecalho };
}

describe('gerarFitDoTreino', () => {
  const modelo = modeloPorId('vo2-5x3-ciclismo');
  const { bytes, nomeArquivo, passos } = gerarFitDoTreino(modelo, { config, agora: Date.UTC(2026, 10, 4) });

  it('cabeçalho FIT de 14 bytes, assinatura ".FIT", tamanho dos dados e os dois CRC corretos', () => {
    expect(bytes[0]).toBe(14);
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('.FIT');
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(4, true)).toBe(bytes.length - 14 - 2);
    expect(dv.getUint16(12, true)).toBe(crcDeReferencia(bytes.slice(0, 12)));
    expect(dv.getUint16(bytes.length - 2, true)).toBe(crcDeReferencia(bytes.slice(0, bytes.length - 2)));
  });

  it('file_id de treino, mensagem de workout com nome, esporte e número de passos', () => {
    const { mensagens } = decodificar(bytes);
    const fileId = mensagens.find((m) => m.global === 0);
    expect(fileId.campos[0]).toBe(5); // tipo: workout
    const workout = mensagens.find((m) => m.global === 26);
    expect(workout.campos[8]).toBe(modelo.nome);
    expect(workout.campos[4]).toBe(2); // ciclismo
    expect(workout.campos[6]).toBe(passos);
  });

  it('um passo por bloco, na ordem, com a duração em milissegundos e a faixa de FC da zona em bpm + 100', () => {
    const blocos = expandirPassos(modelo.passos);
    const steps = decodificar(bytes).mensagens.filter((m) => m.global === 27);
    expect(steps).toHaveLength(blocos.length);
    expect(steps.reduce((t, s) => t + s.campos[2], 0)).toBe(duracaoTotalS(modelo.passos) * 1000);
    steps.forEach((s, i) => {
      expect(s.campos[254]).toBe(i);
      expect(s.campos[1]).toBe(0); // por tempo
      expect(s.campos[2]).toBe(blocos[i].duracaoS * 1000);
      expect(s.campos[3]).toBe(1); // alvo: FC
      const [baixo, alto] = faixaDeFcDaZona(blocos[i].zona, config);
      expect(s.campos[5]).toBe(baixo + 100);
      expect(s.campos[6]).toBe(alto + 100);
    });
  });

  it('as intensidades e os nomes dos passos acompanham o papel do bloco', () => {
    const steps = decodificar(bytes).mensagens.filter((m) => m.global === 27);
    expect(steps[0].campos[7]).toBe(2); // aquecimento
    expect(steps[0].campos[0]).toBe('Aquecimento');
    expect(steps[1].campos[0]).toBe('Esforco 1/5');
    expect(steps[1].campos[7]).toBe(0);
    expect(steps[2].campos[0]).toBe('Recuperacao');
    expect(steps[2].campos[7]).toBe(4);
    expect(steps[steps.length - 1].campos[7]).toBe(3); // desaquecimento
  });

  it('o nome do arquivo vem do nome do treino, sem acentos e símbolos', () => {
    expect(nomeArquivo).toBe('5-3-min-no-VO2.fit');
  });

  it('sem configuração de FC, o alvo fica aberto', () => {
    const r = gerarFitDoTreino(modelo, { config: null });
    const steps = decodificar(r.bytes).mensagens.filter((m) => m.global === 27);
    expect(steps.every((s) => s.campos[3] === 2)).toBe(true);
  });

  it('esporte de corrida usa o código de corrida', () => {
    const r = gerarFitDoTreino(modeloPorId('vo2-5x3-corrida'), { config });
    expect(decodificar(r.bytes).mensagens.find((m) => m.global === 26).campos[4]).toBe(1);
  });

  it('recusa treino sem passos ou com passos demais', () => {
    expect(() => gerarFitDoTreino({ nome: 'x', esporte: 'ciclismo', passos: [] }, { config })).toThrow('não tem passos');
    const grande = [{ tipo: 'serie', repeticoes: 60, esforco: { duracaoS: 60, zona: 'Z5' }, recuperacao: { duracaoS: 60, zona: 'Z1' } }];
    expect(() => gerarFitDoTreino({ nome: 'x', esporte: 'ciclismo', passos: grande }, { config })).toThrow('até 99');
  });

  it('nomes longos ou com acento são cortados sem quebrar o texto', () => {
    const r = gerarFitDoTreino({ ...modelo, nome: 'Pirâmide ' + 'á'.repeat(60) }, { config });
    const nome = decodificar(r.bytes).mensagens.find((m) => m.global === 26).campos[8];
    expect(nome.startsWith('Pirâmide')).toBe(true);
    expect(nome).not.toContain('�');
  });
});
