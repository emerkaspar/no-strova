import { describe, expect, it } from 'vitest';
import { DICAS_DE_ZONAS, dicaDeZonaDoDia } from './dicasDeZonas.js';
import { ZONAS } from './hrss.js';

describe('dicaDeZonaDoDia', () => {
  it('é a mesma na mesma data e muda no dia seguinte', () => {
    expect(dicaDeZonaDoDia('2026-11-06')).toBe(dicaDeZonaDoDia('2026-11-06'));
    expect(dicaDeZonaDoDia('2026-11-07')).not.toBe(dicaDeZonaDoDia('2026-11-06'));
  });

  it('dois dias seguidos nunca falam da mesma zona', () => {
    for (let i = 0; i < DICAS_DE_ZONAS.length; i++) {
      const proxima = DICAS_DE_ZONAS[(i + 1) % DICAS_DE_ZONAS.length];
      expect(proxima.zona).not.toBe(DICAS_DE_ZONAS[i].zona);
    }
  });

  it('percorre todas as dicas em um ciclo', () => {
    const vistas = new Set();
    for (let d = 1; d <= DICAS_DE_ZONAS.length; d++) vistas.add(dicaDeZonaDoDia(`2026-11-${String(d).padStart(2, '0')}`));
    expect(vistas.size).toBe(DICAS_DE_ZONAS.length);
  });

  it('só usa zonas que existem', () => {
    for (const d of DICAS_DE_ZONAS) expect(ZONAS[d.zona]).toBeDefined();
  });
});
