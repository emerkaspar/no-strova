import { describe, expect, it } from 'vitest';
import {
  avisoSonoCarga,
  diasNaMetaDePassos,
  dividaDeSono,
  faixaDoSono,
  faixaDosPassos,
  fatorDeCargaPorSono,
  formatarSono,
  prontidao,
  resumoDeBemEstar,
  serieDeBemEstar,
  validarMetaPassos,
} from './bemEstar.js';

const H = 3600;

const HOJE = '2026-11-17';

describe('resumoDeBemEstar', () => {
  it('pega o dado mais recente de cada métrica e a média de 7 dias', () => {
    const r = resumoDeBemEstar(
      [
        { data: '2026-11-17', passos: 8000, sonoSegundos: null },
        { data: '2026-11-16', passos: 6000, sonoSegundos: 7 * 3600 },
        { data: '2026-11-10', passos: 20000, sonoSegundos: 9 * 3600 }, // fora dos 7 dias
      ],
      HOJE,
    );
    expect(r.passos).toEqual({ data: '2026-11-17', valor: 8000 });
    expect(r.sono).toEqual({ data: '2026-11-16', segundos: 7 * 3600 });
    expect(r.mediaPassos7).toBe(7000);
    expect(r.mediaSono7S).toBe(7 * 3600);
  });

  it('ignora dias futuros e devolve null sem dados', () => {
    const r = resumoDeBemEstar([{ data: '2026-11-20', passos: 5000, sonoSegundos: 3600 }], HOJE);
    expect(r).toEqual({ passos: null, sono: null, mediaPassos7: null, mediaSono7S: null, noites7: 0 });
    expect(resumoDeBemEstar([], HOJE).passos).toBeNull();
  });
});

describe('formatarSono', () => {
  it('formata horas e minutos', () => {
    expect(formatarSono(7 * 3600 + 5 * 60)).toBe('7 h 05 min');
    expect(formatarSono(45 * 60)).toBe('45 min');
    expect(formatarSono(0)).toBe('—');
    expect(formatarSono(null)).toBe('—');
  });
});

describe('faixas', () => {
  it('classifica o sono', () => {
    expect(faixaDoSono(5.5 * H)).toBe('muito-curto');
    expect(faixaDoSono(6.5 * H)).toBe('curto');
    expect(faixaDoSono(7 * H)).toBe('ideal');
    expect(faixaDoSono(9 * H)).toBe('ideal');
    expect(faixaDoSono(9.5 * H)).toBe('longo');
    expect(faixaDoSono(null)).toBeNull();
  });

  it('classifica os passos contra a meta', () => {
    expect(faixaDosPassos(8000, 8000)).toBe('atingiu');
    expect(faixaDosPassos(5600, 8000)).toBe('quase');
    expect(faixaDosPassos(5599, 8000)).toBe('abaixo');
    expect(faixaDosPassos(0)).toBeNull();
    expect(faixaDosPassos(8000)).toBe('atingiu');
  });
});

describe('validarMetaPassos', () => {
  it('aceita número ou texto com separador de milhar e recusa fora dos limites', () => {
    expect(validarMetaPassos('10.000')).toBe(10000);
    expect(validarMetaPassos(8000)).toBe(8000);
    expect(validarMetaPassos('999')).toBeNull();
    expect(validarMetaPassos('50001')).toBeNull();
    expect(validarMetaPassos('abc')).toBeNull();
  });
});

describe('serieDeBemEstar', () => {
  it('devolve dias contínuos com lacunas null e média móvel de 7 dias', () => {
    const s = serieDeBemEstar([{ data: '2026-11-17', passos: 6000, sonoSegundos: 7 * H }, { data: '2026-11-15', passos: 10000, sonoSegundos: null }], '2026-11-17', 3);
    expect(s.map((d) => d.data)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
    expect(s[1].passos).toBeNull();
    expect(s[2].mediaPassos7).toBe(8000);
    expect(s[1].mediaSono7S).toBeNull();
    expect(s[2].mediaSono7S).toBe(7 * H);
  });
});

describe('dividaDeSono e diasNaMetaDePassos', () => {
  it('soma o que faltou para 7 h só nas noites com registro', () => {
    const r = dividaDeSono([{ data: '2026-11-17', sonoSegundos: 6 * H }, { data: '2026-11-16', sonoSegundos: 8 * H }, { data: '2026-11-15', sonoSegundos: 5 * H }, { data: '2026-11-01', sonoSegundos: 1 * H }], '2026-11-17');
    expect(r).toEqual({ segundos: 3 * H, noites: 3 });
  });

  it('conta os dias na meta', () => {
    const r = diasNaMetaDePassos([{ data: '2026-11-17', passos: 9000 }, { data: '2026-11-16', passos: 3000 }, { data: '2026-11-10', passos: 12000 }], '2026-11-17', 7, 8000);
    expect(r).toEqual({ atingiu: 1, comRegistro: 2 });
  });
});

describe('prontidao', () => {
  it('é boa com sono e forma tranquilos', () => {
    expect(prontidao({ forma: 0, sonoUltimoS: 8 * H }).nivel).toBe('boa');
  });
  it('é baixa com sono curto e sobrecarga', () => {
    const r = prontidao({ forma: -35, sonoUltimoS: 5 * H });
    expect(r.nivel).toBe('baixa');
    expect(r.motivos).toContain('dormiu menos de 6 h');
  });
  it('é moderada com um só fator e null sem dados', () => {
    expect(prontidao({ forma: 0, sonoUltimoS: 6.5 * H }).nivel).toBe('moderada');
    expect(prontidao({}).nivel).toBeNull();
  });
});

describe('avisoSonoCarga', () => {
  it('avisa com menos de 6 h de sono e Forma abaixo de −10', () => {
    expect(avisoSonoCarga({ sonoUltimoS: 5 * H, forma: -15 })).toEqual({ avisar: true, motivo: 'carregado' });
    expect(avisoSonoCarga({ sonoUltimoS: 5 * H, forma: -40 })).toEqual({ avisar: true, motivo: 'sobrecarga' });
  });
  it('não avisa com sono suficiente, forma folgada ou sem dados', () => {
    expect(avisoSonoCarga({ sonoUltimoS: 7 * H, forma: -40 }).avisar).toBe(false);
    expect(avisoSonoCarga({ sonoUltimoS: 5 * H, forma: 0 }).avisar).toBe(false);
    expect(avisoSonoCarga({ sonoUltimoS: null, forma: -40 }).avisar).toBe(false);
  });
});

describe('fatorDeCargaPorSono', () => {
  it('reduz a carga com sono curto na semana e ignora poucas noites', () => {
    expect(fatorDeCargaPorSono({ mediaSono7S: 5 * H, noites7: 4 })).toBe(0.8);
    expect(fatorDeCargaPorSono({ mediaSono7S: 6 * H, noites7: 4 })).toBe(0.9);
    expect(fatorDeCargaPorSono({ mediaSono7S: 7.5 * H, noites7: 4, sonoUltimoS: 4 * H })).toBe(0.92);
    expect(fatorDeCargaPorSono({ mediaSono7S: 5 * H, noites7: 2 })).toBeNull();
    expect(fatorDeCargaPorSono({ mediaSono7S: 8 * H, noites7: 5, sonoUltimoS: 8 * H })).toBeNull();
  });
});
