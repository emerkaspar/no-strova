import { describe, expect, it } from 'vitest';
import { camposDeClima, climaDaResposta, condicaoDoClima, iconeDoClima, pontoDePartida, recordesDeClima, resumirTemperaturaDoSensor, urlDoClima, VERSAO_DO_CLIMA } from './clima.js';

const hora = (iso) => Date.parse(iso);

const resposta = {
  hourly: {
    time: ['2026-10-19T10:00', '2026-10-19T11:00', '2026-10-19T12:00'],
    temperature_2m: [20, 24, 30],
    apparent_temperature: [21, 26, 33],
    relative_humidity_2m: [80, 70, 50],
    precipitation: [0, 1, 2],
    wind_speed_10m: [10, 14, 20],
    weather_code: [1, 61, 3],
  },
};

describe('resumirTemperaturaDoSensor', () => {
  it('tira média, mínima e máxima e ignora leituras absurdas', () => {
    expect(resumirTemperaturaDoSensor([{ temp: 20 }, { temp: 30 }, { temp: 200 }, {}])).toEqual({ mediaC: 25, minC: 20, maxC: 30 });
  });
  it('sem leitura, nulo', () => {
    expect(resumirTemperaturaDoSensor([{}, { temp: Number.NaN }])).toBeNull();
    expect(resumirTemperaturaDoSensor(null)).toBeNull();
  });
});

describe('pontoDePartida', () => {
  it('usa a primeira coordenada e arredonda a ~1 km', () => {
    expect(pontoDePartida([{ t: 0 }, { t: 1, lat: -30.03456, lon: -51.21789 }])).toEqual({ lat: -30.03, lon: -51.22 });
  });
  it('sem GPS, nulo', () => {
    expect(pontoDePartida([{ t: 0, fc: 100 }])).toBeNull();
  });
});

describe('urlDoClima', () => {
  const base = { lat: -30.03, lon: -51.22, inicioMs: hora('2026-10-19T10:30:00Z'), duracaoS: 3600 };
  it('atividade antiga usa o arquivo histórico e a recente usa a previsão', () => {
    expect(urlDoClima({ ...base, agoraMs: hora('2026-11-06T00:00:00Z') })).toContain('archive-api.open-meteo.com');
    expect(urlDoClima({ ...base, agoraMs: hora('2026-10-20T00:00:00Z') })).toContain('api.open-meteo.com/v1/forecast');
  });
  it('pede os dias tocados, em UTC', () => {
    const url = urlDoClima({ ...base, inicioMs: hora('2026-10-19T23:30:00Z'), agoraMs: hora('2026-11-06T00:00:00Z') });
    expect(url).toContain('start_date=2026-10-19');
    expect(url).toContain('end_date=2026-10-20');
    expect(url).toContain('timezone=GMT');
  });
});

describe('climaDaResposta', () => {
  it('pondera pelo tempo em cada hora e soma a chuva proporcional', () => {
    // 10:30 a 11:30: meia hora em 10h (20 °C) e meia em 11h (24 °C)
    const c = climaDaResposta(resposta, hora('2026-10-19T10:30:00Z'), 3600);
    expect(c.temperaturaC).toBe(22);
    expect(c.umidadePct).toBe(75);
    expect(c.ventoKmh).toBe(12);
    expect(c.chuvaMm).toBe(0.5);
  });
  it('a condição é a da hora com mais tempo', () => {
    const c = climaDaResposta(resposta, hora('2026-10-19T10:50:00Z'), 3600);
    expect(c.climaCodigo).toBe(61);
    expect(condicaoDoClima(c.climaCodigo)).toBe('Chuva fraca');
  });
  it('sem hora que cubra a atividade ou resposta vazia, nulo', () => {
    expect(climaDaResposta(resposta, hora('2026-10-25T10:00:00Z'), 3600)).toBeNull();
    expect(climaDaResposta({}, hora('2026-10-19T10:00:00Z'), 3600)).toBeNull();
  });
});

describe('iconeDoClima', () => {
  it('escolhe o ícone pela condição do tempo', () => {
    expect(iconeDoClima(0)).toBe('sol');
    expect(iconeDoClima(2)).toBe('solNuvem');
    expect(iconeDoClima(3)).toBe('nuvem');
    expect(iconeDoClima(45)).toBe('neblina');
    expect(iconeDoClima(61)).toBe('chuva');
    expect(iconeDoClima(81)).toBe('chuva');
    expect(iconeDoClima(73)).toBe('floco');
    expect(iconeDoClima(95)).toBe('trovoada');
  });
  it('sem código, sol', () => {
    expect(iconeDoClima(null)).toBe('sol');
    expect(iconeDoClima(undefined)).toBe('sol');
  });
});

describe('camposDeClima', () => {
  const clima = { temperaturaC: 22, sensacaoC: 23, umidadePct: 70, ventoKmh: 12, chuvaMm: 0, climaCodigo: 1 };
  it('o sensor tem prioridade na temperatura', () => {
    const c = camposDeClima({ mediaC: 27, minC: 20, maxC: 31 }, clima);
    expect(c).toMatchObject({ temperaturaMediaC: 27, temperaturaMinC: 20, temperaturaMaxC: 31, temperaturaOrigem: 'sensor', ventoKmh: 12 });
  });
  it('sem sensor, usa a do serviço; sem nada, nulos', () => {
    expect(camposDeClima(null, clima)).toMatchObject({ temperaturaMediaC: 22, temperaturaOrigem: 'clima', temperaturaMinC: null });
    expect(camposDeClima(null, null)).toMatchObject({ temperaturaMediaC: null, temperaturaOrigem: null, ventoKmh: null });
  });
});

describe('recordesDeClima', () => {
  it('acha a mais quente, a mais fria (aceita 0 °C e negativos) e a de mais vento', () => {
    const lista = [
      { id: 'a', data: '2026-01-01', temperaturaMediaC: 0, ventoKmh: 10 },
      { id: 'b', data: '2026-02-01', temperaturaMediaC: 35, ventoKmh: 30 },
      { id: 'c', data: '2026-03-01', temperaturaMediaC: 12, ventoKmh: null },
      { id: 'd', data: '2026-04-01' },
    ];
    const r = recordesDeClima(lista);
    expect(r.quente.atividade.id).toBe('b');
    expect(r.fria).toMatchObject({ valor: 0 });
    expect(r.fria.atividade.id).toBe('a');
    expect(r.vento.valor).toBe(30);
  });
  it('sem dados, nulos', () => {
    expect(recordesDeClima([{ data: '2026-01-01' }])).toEqual({ quente: null, fria: null, vento: null });
  });
  it('versão do cálculo', () => {
    expect(VERSAO_DO_CLIMA).toBe(1);
  });
});
