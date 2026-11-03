import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const aqui = dirname(fileURLToPath(import.meta.url));

describe('index.js do domain', () => {
  it('nenhum nome é exportado por dois módulos (o "export *" ignora o conflito em silêncio e o import vira undefined)', () => {
    const donos = new Map();
    const conflitos = [];
    for (const arquivo of readdirSync(aqui).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'index.js')) {
      const codigo = readFileSync(join(aqui, arquivo), 'utf8');
      for (const [, nome] of codigo.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z0-9_$]+)/gm)) {
        if (donos.has(nome)) conflitos.push(`${nome}: ${donos.get(nome)} e ${arquivo}`);
        else donos.set(nome, arquivo);
      }
    }
    expect(conflitos).toEqual([]);
  });
});
