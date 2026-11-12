import { describe, expect, it } from 'vitest';
import { consideracoesDaSemana, listaEmPortugues, textoDoAvisoDaSemana } from './semanaIa.js';

describe('consideracoesDaSemana', () => {
  it('cita nível, dias, condição, carga e sensação', () => {
    const r = consideracoesDaSemana({
      nivel: 'intermediario',
      estado: { condicionamento: 42.4, fadiga: 50, forma: -12 },
      cargaBase: 180,
      feedback: { registros: 3, sensacaoMedia: 4, rpeMedio: 8, dorRecorrente: false, treinosDificeis: 2 },
      diasDeTreino: [1, 3, 5],
      diaLongao: 5,
      horasPorSemana: 6,
    });
    const texto = r.join(' ');
    expect(texto).toContain('intermediário');
    expect(texto).toContain('terça, quinta e sábado');
    expect(texto).toContain('longão de sábado');
    expect(texto).toContain('cansado');
    expect(texto).toContain('180');
    expect(texto).toContain('carga foi reduzida');
  });

  it('não inventa o que não existe', () => {
    const r = consideracoesDaSemana({ nivel: 'iniciante' });
    expect(r).toEqual(['Seu nível: iniciante.']);
  });

  it('dor recorrente vence a sensação', () => {
    const r = consideracoesDaSemana({ nivel: 'avancado', feedback: { registros: 2, sensacaoMedia: 2, rpeMedio: null, dorRecorrente: true, treinosDificeis: 0 } });
    expect(r.join(' ')).toContain('dor');
  });
});

describe('textoDoAvisoDaSemana', () => {
  it('lista os treinos por data e cabe num push', () => {
    const { titulo, mensagem } = textoDoAvisoDaSemana({
      itens: [
        { data: '2026-11-18', nome: 'Gangorra' },
        { data: '2026-11-16', nome: 'Rodagem' },
      ],
      consideracoes: ['Seu nível: intermediário.', 'Sua condição hoje: em equilíbrio.', 'Outra.'],
    });
    expect(titulo).toBe('Sua semana de treino: 2 treinos montados pela IA');
    expect(mensagem.indexOf('Rodagem')).toBeLessThan(mensagem.indexOf('Gangorra'));
    expect(mensagem).toContain('seg 16/11');
    expect(mensagem.length).toBeLessThanOrEqual(480);
  });
});

describe('listaEmPortugues', () => {
  it('junta com vírgula e "e"', () => {
    expect(listaEmPortugues(['a'])).toBe('a');
    expect(listaEmPortugues(['a', 'b'])).toBe('a e b');
    expect(listaEmPortugues(['a', 'b', 'c'])).toBe('a, b e c');
  });
});
