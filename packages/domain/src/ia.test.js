import { describe, expect, it } from 'vitest';
import { catalogoParaIa, MAXIMO_DE_PROPRIOS_NA_IA, propriosParaIa, validarEntradaDeTreinos, validarSugestaoDeTreinos } from './ia.js';

const passos = [{ tipo: 'bloco', papel: 'principal', duracaoS: 2400, zona: 'Z2' }];
const meu = (extra = {}) => ({ id: 'MeuTreinoAbC123', nome: 'Rolê da orla', esporte: 'ciclismo', foco: 'resistencia', nivel: 'avancado', passos, origem: 'proprio', ...extra });

describe('propriosParaIa e catalogoParaIa com treinos próprios', () => {
  it('o cardápio traz os treinos do catálogo e os próprios, marcados com proprio: true', () => {
    const lista = catalogoParaIa('ciclismo', 'iniciante', [meu()]);
    const meus = lista.filter((m) => m.proprio);
    expect(meus).toHaveLength(1);
    expect(meus[0]).toMatchObject({ id: 'MeuTreinoAbC123', nome: 'Rolê da orla', intensidade: 'baixa', nivel: 'avancado', duracaoMin: 40, proprio: true });
    expect(lista.filter((m) => !m.proprio).length).toBeGreaterThan(5);
  });

  it('sem treinos próprios, o cardápio é o de antes (nenhum item marcado)', () => {
    expect(catalogoParaIa('ciclismo', 'intermediario').some((m) => m.proprio)).toBe(false);
  });

  it('só o esporte pedido, sem o teste, sem passos e sem id; o trajeto vai junto', () => {
    const proprios = [meu(), meu({ id: 'b', esporte: 'corrida' }), meu({ id: 'c', foco: 'teste' }), meu({ id: 'd', passos: [] }), meu({ id: 'e', trajetoNome: 'Brochier/Paris' }), meu({ id: '' })];
    expect(propriosParaIa(proprios, 'ciclismo').map((m) => m.id)).toEqual(['MeuTreinoAbC123', 'e']);
    expect(propriosParaIa(proprios, 'ambos').map((m) => m.id)).toEqual(['MeuTreinoAbC123', 'b', 'e']);
    expect(propriosParaIa(proprios, 'ciclismo').find((m) => m.id === 'e').trajeto).toBe('Brochier/Paris');
  });

  it('limita a quantidade, ficando com os mais recentes (o começo da lista)', () => {
    const muitos = Array.from({ length: MAXIMO_DE_PROPRIOS_NA_IA + 10 }, (_, i) => meu({ id: `t${i}` }));
    const lista = propriosParaIa(muitos, 'ciclismo');
    expect(lista).toHaveLength(MAXIMO_DE_PROPRIOS_NA_IA);
    expect(lista[0].id).toBe('t0');
  });
});

describe('validarSugestaoDeTreinos com treinos próprios', () => {
  const hoje = '2026-11-04'; // quarta-feira
  const entrada = validarEntradaDeTreinos({ semanas: 1, diasDaSemana: [1, 3], horasPorSemana: 8, esporte: 'ciclismo' }).valores;
  const ctx = (proprios) => ({ hoje, entrada, cargaBase: 0, estimarEstresse: () => 40, nivel: 'iniciante', proprios });
  const sugestao = (modeloId) => ({ treinos: [{ data: '2026-11-05', modeloId, motivo: 'bom para o dia' }] });

  it('aceita o treino próprio escolhido pela IA', () => {
    const r = validarSugestaoDeTreinos(sugestao('MeuTreinoAbC123'), ctx([meu()]));
    const item = r.itens.find((i) => i.data === '2026-11-05');
    expect(item).toMatchObject({ modeloId: 'MeuTreinoAbC123', nome: 'Rolê da orla', motivo: 'bom para o dia' });
    expect(r.avisos.some((a) => a.includes('não existe'))).toBe(false);
  });

  it('sem o treino na lista de próprios, o id é descartado', () => {
    const r = validarSugestaoDeTreinos(sugestao('MeuTreinoAbC123'), ctx([]));
    expect(r.itens.find((i) => i.modeloId === 'MeuTreinoAbC123')).toBeUndefined();
    expect(r.avisos.some((a) => a.includes('não existe'))).toBe(true);
  });

  it('ao completar um dia vazio, o código não escolhe sozinho um treino atrelado a um trajeto', () => {
    const doTrajeto = meu({ id: 'DoTrajeto', trajetoNome: 'Brochier/Paris' });
    const r = validarSugestaoDeTreinos(sugestao('MeuTreinoAbC123'), ctx([meu(), doTrajeto]));
    expect(r.itens.some((i) => i.modeloId === 'DoTrajeto')).toBe(false);
    expect(r.itens.length).toBeGreaterThan(1); // o outro dia escolhido foi completado com um treino leve
  });

  it('um treino de trajeto vale quando a IA o escolhe', () => {
    const doTrajeto = meu({ id: 'DoTrajeto', trajetoNome: 'Brochier/Paris' });
    const r = validarSugestaoDeTreinos(sugestao('DoTrajeto'), ctx([doTrajeto]));
    expect(r.itens.find((i) => i.data === '2026-11-05')?.modeloId).toBe('DoTrajeto');
  });
});
