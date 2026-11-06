import { describe, expect, it } from 'vitest';
import { climaAgoraDaResposta, fraseDoClima, urlDoClimaAgora } from './climaAgora.js';

const base = { temperaturaC: 24, sensacaoC: 25, ventoKmh: 8, chuvaMm: 0, climaCodigo: 0, dia: true };

describe('urlDoClimaAgora', () => {
  it('pede a leitura atual no ponto', () => {
    const url = urlDoClimaAgora({ lat: -30.03, lon: -51.22 });
    expect(url).toContain('latitude=-30.03');
    expect(url).toContain('current=temperature_2m');
    expect(url).toContain('timezone=auto');
  });
});

describe('climaAgoraDaResposta', () => {
  it('arredonda e converte is_day', () => {
    const r = climaAgoraDaResposta({ current: { temperature_2m: 23.6, apparent_temperature: 24.4, wind_speed_10m: 11.2, precipitation: 0, weather_code: 2, is_day: 0 } });
    expect(r).toEqual({ temperaturaC: 24, sensacaoC: 24, ventoKmh: 11, chuvaMm: 0, climaCodigo: 2, dia: false });
  });

  it('é null sem temperatura', () => {
    expect(climaAgoraDaResposta({ current: {} })).toBeNull();
    expect(climaAgoraDaResposta(null)).toBeNull();
  });
});

describe('fraseDoClima', () => {
  it('céu limpo de dia convida a treinar', () => {
    expect(fraseDoClima(base)).toBe('Bom dia para treinar.');
  });

  it('chuva, trovoada, noite, calor, vento e frio têm frase própria', () => {
    expect(fraseDoClima({ ...base, climaCodigo: 95 })).toContain('Trovoada');
    expect(fraseDoClima({ ...base, climaCodigo: 63 })).toBe('Vale o risco.');
    expect(fraseDoClima({ ...base, climaCodigo: 53 })).toContain('Vale o risco');
    expect(fraseDoClima({ ...base, dia: false })).toContain('noite');
    expect(fraseDoClima({ ...base, sensacaoC: 35 })).toContain('Calor');
    expect(fraseDoClima({ ...base, ventoKmh: 40 })).toContain('Vento');
    expect(fraseDoClima({ ...base, sensacaoC: 6 })).toContain('casaquinho');
  });

  it('nublado cai na frase neutra e as frases são curtas', () => {
    expect(fraseDoClima({ ...base, climaCodigo: 3 })).toBe('Tempo firme para treinar.');
    for (const c of [0, 3, 45, 53, 63, 95]) expect(fraseDoClima({ ...base, climaCodigo: c }).length).toBeLessThanOrEqual(40);
  });
});
