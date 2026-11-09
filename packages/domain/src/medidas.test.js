import { describe, expect, it } from 'vitest';
import {
  classificarGordura,
  composicaoCorporal,
  gorduraMarinha,
  pesoNaData,
  relacaoCinturaAltura,
  relacaoCinturaQuadril,
  validarMedidas,
  variacaoDeMedida,
  vereditoDaEvolucao,
} from './medidas.js';

const HOJE = '2026-11-09';

describe('validarMedidas', () => {
  it('aceita medidas parciais, com vírgula, e guarda só as informadas', () => {
    const r = validarMedidas({ data: '2026-11-01', cinturaCm: '82,5', pescocoCm: 38, quadrilCm: '' }, HOJE);
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ data: '2026-11-01', pescocoCm: 38, cinturaCm: 82.5 });
  });

  it('exige ao menos uma medida', () => {
    const r = validarMedidas({ data: '2026-11-01' }, HOJE);
    expect(r.valido).toBe(false);
    expect(r.erros).toContain('Informe ao menos uma medida.');
  });

  it('recusa valor fora do limite, data futura e data inválida', () => {
    expect(validarMedidas({ data: '2026-11-01', cinturaCm: 5 }, HOJE).valido).toBe(false);
    expect(validarMedidas({ data: '2026-11-01', coxaCm: 300 }, HOJE).valido).toBe(false);
    expect(validarMedidas({ data: '2026-11-20', cinturaCm: 80 }, HOJE).erros).toContain('A data da medição não pode estar no futuro.');
    expect(validarMedidas({ data: 'ontem', cinturaCm: 80 }, HOJE).erros).toContain('Informe a data da medição.');
  });
});

describe('gorduraMarinha', () => {
  it('homem: 180 cm, abdômen 90, pescoço 38 dá cerca de 19,8%', () => {
    expect(gorduraMarinha('masculino', { alturaCm: 180, abdomenCm: 90, pescocoCm: 38 })).toBeCloseTo(19.8, 1);
  });

  it('mulher: 165 cm, cintura 75, quadril 100, pescoço 32 dá cerca de 28%', () => {
    const pct = gorduraMarinha('feminino', { alturaCm: 165, cinturaCm: 75, quadrilCm: 100, pescocoCm: 32 });
    expect(pct).toBeGreaterThan(26);
    expect(pct).toBeLessThan(30);
  });

  it('devolve null sem os dados necessários', () => {
    expect(gorduraMarinha('masculino', { alturaCm: 180, cinturaCm: 90, pescocoCm: 38 })).toBeNull();
    expect(gorduraMarinha('feminino', { alturaCm: 165, cinturaCm: 75, pescocoCm: 32 })).toBeNull();
    expect(gorduraMarinha(null, { alturaCm: 180, abdomenCm: 90, pescocoCm: 38 })).toBeNull();
    expect(gorduraMarinha('masculino', { abdomenCm: 90, pescocoCm: 38 })).toBeNull();
    expect(gorduraMarinha('masculino', { alturaCm: 180, abdomenCm: 36, pescocoCm: 38 })).toBeNull();
  });
});

describe('classificarGordura', () => {
  it('usa faixas diferentes por sexo', () => {
    expect(classificarGordura('masculino', 15).rotulo).toBe('Fitness');
    expect(classificarGordura('feminino', 15).rotulo).toBe('Atleta');
    expect(classificarGordura('masculino', 30)).toEqual({ rotulo: 'Acima do recomendado', gravidade: 'alerta' });
    expect(classificarGordura(null, 15)).toBeNull();
  });
});

describe('composicaoCorporal', () => {
  it('calcula massa gorda e magra a partir do peso', () => {
    const c = composicaoCorporal({ abdomenCm: 90, pescocoCm: 38 }, { sexo: 'masculino', alturaCm: 180, pesoKg: 80 });
    expect(c.gorduraPct).toBeCloseTo(19.8, 1);
    expect(c.massaGordaKg + c.massaMagraKg).toBeCloseTo(80, 1);
  });

  it('é null sem peso', () => {
    expect(composicaoCorporal({ abdomenCm: 90, pescocoCm: 38 }, { sexo: 'masculino', alturaCm: 180, pesoKg: null })).toBeNull();
  });
});

describe('relações', () => {
  it('cintura/quadril respeita o limite de cada sexo', () => {
    expect(relacaoCinturaQuadril('masculino', { cinturaCm: 90, quadrilCm: 100 })).toEqual({ valor: 0.9, limite: 0.9, gravidade: 'ok' });
    expect(relacaoCinturaQuadril('feminino', { cinturaCm: 90, quadrilCm: 100 }).gravidade).toBe('alerta');
    expect(relacaoCinturaQuadril('feminino', { cinturaCm: 90 })).toBeNull();
  });

  it('cintura/altura: abaixo de 0,5 é ok', () => {
    expect(relacaoCinturaAltura({ cinturaCm: 80 }, 180).gravidade).toBe('ok');
    expect(relacaoCinturaAltura({ cinturaCm: 95 }, 180).gravidade).toBe('atencao');
    expect(relacaoCinturaAltura({ cinturaCm: 110 }, 180).gravidade).toBe('alerta');
    expect(relacaoCinturaAltura({}, 180)).toBeNull();
  });
});

describe('pesoNaData e variacaoDeMedida', () => {
  it('usa a pesagem mais recente até a data', () => {
    const pesagens = [{ data: '2026-10-01', pesoKg: 80 }, { data: '2026-10-20', pesoKg: 78 }, { data: '2026-11-05', pesoKg: 77 }];
    expect(pesoNaData(pesagens, '2026-10-25')).toBe(78);
    expect(pesoNaData(pesagens, '2026-09-01')).toBeNull();
  });

  it('variação é null se faltar a medida em algum registro', () => {
    expect(variacaoDeMedida('cinturaCm', { cinturaCm: 90 }, { cinturaCm: 86.5 })).toBe(-3.5);
    expect(variacaoDeMedida('cinturaCm', { cinturaCm: 90 }, {})).toBeNull();
  });
});

describe('vereditoDaEvolucao', () => {
  const contexto = { sexo: 'masculino', alturaCm: 180, pesagens: [{ data: '2026-09-01', pesoKg: 90 }, { data: '2026-11-01', pesoKg: 85 }] };

  it('pede mais medições com menos de dois registros', () => {
    expect(vereditoDaEvolucao([{ data: '2026-09-01', cinturaCm: 90 }], contexto).codigo).toBe('poucos-dados');
  });

  it('cintura menor e massa magra mantida: perdendo gordura', () => {
    const registros = [
      { data: '2026-09-01', abdomenCm: 100, pescocoCm: 38, cinturaCm: 96 },
      { data: '2026-11-01', abdomenCm: 92, pescocoCm: 38, cinturaCm: 90 },
    ];
    expect(vereditoDaEvolucao(registros, contexto).codigo).toBe('perdendo-gordura');
  });

  it('sem composição, usa os membros como referência do músculo', () => {
    const registros = [
      { data: '2026-09-01', cinturaCm: 90, coxaCm: 55, bracoCm: 33 },
      { data: '2026-11-01', cinturaCm: 90, coxaCm: 57, bracoCm: 34 },
    ];
    expect(vereditoDaEvolucao(registros, {}).codigo).toBe('ganhando-musculo');
  });

  it('cintura maior sem ganho de músculo é alerta', () => {
    const registros = [{ data: '2026-09-01', cinturaCm: 90, coxaCm: 55 }, { data: '2026-11-01', cinturaCm: 94, coxaCm: 55 }];
    expect(vereditoDaEvolucao(registros, {})).toMatchObject({ codigo: 'gordura-subindo', gravidade: 'alerta' });
  });

  it('registros sem medida em comum não comparam', () => {
    const registros = [{ data: '2026-09-01', pescocoCm: 38 }, { data: '2026-11-01', quadrilCm: 100 }];
    expect(vereditoDaEvolucao(registros, {}).codigo).toBe('sem-comparacao');
  });
});
