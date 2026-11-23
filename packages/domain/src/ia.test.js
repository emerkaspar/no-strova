import { describe, expect, it } from 'vitest';
import { avisosDaCargaPedida, catalogoParaIa, lerDuracaoPedida, maisProximosDaDuracao, MAXIMO_DE_PROPRIOS_NA_IA, preferirProprioParaODia, propriosParaIa, validarEntradaDeTreinos, validarSugestaoDeTreinos } from './ia.js';

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

describe('tempo pedido para o treino único', () => {
  it('é opcional: vazio vira null, fora de 15 a 360 min ou inválido vira undefined', () => {
    expect(lerDuracaoPedida(undefined)).toBeNull();
    expect(lerDuracaoPedida('')).toBeNull();
    expect(lerDuracaoPedida('60')).toBe(60);
    expect(lerDuracaoPedida(45.4)).toBe(45);
    for (const ruim of [5, 400, 'abc', NaN]) expect(lerDuracaoPedida(ruim), String(ruim)).toBeUndefined();
  });

  it('traz primeiro os treinos de duração mais próxima da pedida', () => {
    const lista = [{ id: 'a', duracaoMin: 30, estresse: 20 }, { id: 'b', duracaoMin: 58, estresse: 50 }, { id: 'c', duracaoMin: 90, estresse: 80 }, { id: 'd', duracaoMin: 62, estresse: 40 }];
    expect(maisProximosDaDuracao(lista, 60, 2).map((m) => m.id)).toEqual(['d', 'b']);
    // só entram os que ficam até 25% do tempo pedido (45 a 75 min); fora da faixa, os 3 mais próximos
    expect(maisProximosDaDuracao(lista, 60).map((m) => m.id)).toEqual(['d', 'b']);
    expect(maisProximosDaDuracao(lista, 200).map((m) => m.id)).toEqual(['c', 'd', 'b']);
  });

  it('avisa quando a carga é alta ou baixa demais e quando o tempo difere muito do pedido', () => {
    const base = { cargaBase: 200 };
    expect(avisosDaCargaPedida({ estresse: 100, duracaoMin: 90 }, base).join(' ')).toMatch(/alta demais/);
    expect(avisosDaCargaPedida({ estresse: 10, duracaoMin: 20 }, base).join(' ')).toMatch(/baixa/);
    expect(avisosDaCargaPedida({ estresse: 50, duracaoMin: 60 }, base)).toEqual([]);
    expect(avisosDaCargaPedida({ estresse: 50, duracaoMin: 90 }, { ...base, duracaoPedida: 60 }).join(' ')).toMatch(/pediu 60 min/);
    expect(avisosDaCargaPedida({ estresse: 500, duracaoMin: 90 }, { cargaBase: 0 })).toEqual([]);
  });
});

describe('semana automática: Meus treinos primeiro', () => {
  const hoje = '2026-11-04'; // quarta-feira (dias 1, 3 e 5 = quinta, sábado e terça)
  const entrada = validarEntradaDeTreinos({ semanas: 1, diasDaSemana: [1, 3, 5], horasPorSemana: 10, esporte: 'ciclismo' }).valores;
  const meus = ['A', 'B', 'C'].map((x) => meu({ id: `Meu${x}`, nome: `Meu ${x}`, foco: 'resistencia' }));
  const ctx = (extra = {}) => ({ hoje, entrada, cargaBase: 0, estimarEstresse: () => 40, nivel: 'iniciante', proprios: meus, ...extra });
  const doCatalogo = { treinos: [
    { data: '2026-11-05', modeloId: 'tempo-20-ciclismo', motivo: 'a' },
    { data: '2026-11-07', modeloId: 'fart-leve-ciclismo', motivo: 'b' },
    { data: '2026-11-10', modeloId: 'tempo-20-ciclismo', motivo: 'c' },
  ] };
  const proprios = (r) => r.itens.filter((i) => i.modeloId.startsWith('Meu'));

  it('sem a prioridade, os treinos do catálogo ficam como a IA escolheu', () => {
    expect(proprios(validarSugestaoDeTreinos(doCatalogo, ctx()))).toHaveLength(0);
  });

  it('com a prioridade, mais da metade da semana vira treinos próprios (2 de 3), sem repetir', () => {
    const r = validarSugestaoDeTreinos(doCatalogo, ctx({ priorizarProprios: true }));
    expect(r.itens).toHaveLength(3);
    expect(proprios(r).length).toBeGreaterThan(r.itens.length / 2);
    expect(new Set(r.itens.map((i) => i.modeloId)).size).toBe(r.itens.length);
    expect(r.avisos.join(' ')).toMatch(/Meus treinos/);
  });

  it('com poucos treinos próprios, usa os que há e avisa; treino de trajeto não entra', () => {
    const r = validarSugestaoDeTreinos(doCatalogo, ctx({ priorizarProprios: true, proprios: [meu({ id: 'MeuA' }), meu({ id: 'DoTrajeto', trajetoNome: 'Brochier/Paris' })] }));
    expect(proprios(r)).toHaveLength(1);
    expect(r.itens.some((i) => i.modeloId === 'DoTrajeto')).toBe(false);
    expect(r.avisos.join(' ')).toMatch(/poucos treinos/);
  });

  it('não troca um treino intenso por um leve (respeita a regra dos intensos)', () => {
    const r = validarSugestaoDeTreinos({ treinos: [{ data: '2026-11-05', modeloId: 'vo2-4x2-ciclismo', motivo: 'forte' }] }, ctx({ priorizarProprios: true }));
    expect(r.itens.find((i) => i.data === '2026-11-05').modeloId).toBe('vo2-4x2-ciclismo');
  });
});

describe('preferirProprioParaODia (treino único do dia)', () => {
  const escolhido = { id: 'tempo-20-ciclismo', intensidade: 'moderada', estresse: 60, duracaoMin: 60 };
  const meuX = (extra = {}) => ({ id: 'MeuX', proprio: true, intensidade: 'moderada', estresse: 62, duracaoMin: 65, cabeNaSemana: true, ...extra });

  it('troca pelo treino próprio que serve igual ao dia (mesmo esforço, carga e duração parecidas)', () => {
    expect(preferirProprioParaODia(escolhido, [meuX()])?.id).toBe('MeuX');
  });
  it('escolhe o próprio de carga mais próxima', () => {
    expect(preferirProprioParaODia(escolhido, [meuX({ id: 'longe', estresse: 70 }), meuX({ id: 'perto', estresse: 59 })])?.id).toBe('perto');
  });
  it.each([
    ['esforço diferente', { intensidade: 'alta' }],
    ['carga muito diferente', { estresse: 90 }],
    ['não cabe na semana', { cabeNaSemana: false }],
    ['duração muito diferente', { duracaoMin: 120 }],
    ['treino de trajeto', { trajeto: 'Volta da Lagoa' }],
  ])('não troca quando o próprio não serve ao dia (%s)', (_, extra) => {
    expect(preferirProprioParaODia(escolhido, [meuX(extra)])).toBeNull();
  });
  it('com tempo pedido, o próprio precisa ficar tão perto do tempo quanto o escolhido', () => {
    expect(preferirProprioParaODia(escolhido, [meuX({ duracaoMin: 75 })], { duracaoPedida: 90 })?.id).toBe('MeuX');
    expect(preferirProprioParaODia(escolhido, [meuX({ duracaoMin: 45 })], { duracaoPedida: 90 })).toBeNull();
  });
  it('se a IA já escolheu um treino próprio, nada muda', () => {
    expect(preferirProprioParaODia({ ...escolhido, proprio: true }, [meuX()])).toBeNull();
  });
});

describe('tempo de cada dia e variação de trajetos', () => {
  const hoje = '2026-11-04'; // quarta-feira; quinta = 2026-11-05 (dia 3), sexta = 2026-11-06 (dia 4)
  const curto = (extra = {}) => ({ id: 'Trajeto30', nome: 'Volta curta', esporte: 'ciclismo', foco: 'resistencia', nivel: 'avancado', origem: 'proprio', trajetoNome: 'Orla', passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: 1800, zona: 'Z2' }], ...extra });
  const pedido = (extra = {}) => validarEntradaDeTreinos({ semanas: 1, diasDaSemana: [3], minutosPorDia: { 3: 60 }, esporte: 'ciclismo', ...extra }).valores;
  const ctx = (entrada, proprios, extra = {}) => ({ hoje, entrada, cargaBase: 0, estimarEstresse: () => 40, nivel: 'avancado', proprios, ...extra });
  const sugestao = (...ids) => ({ treinos: ids.map((id, i) => ({ data: i === 0 ? '2026-11-05' : '2026-11-06', modeloId: id, motivo: 'ok' })) });

  it('a entrada com tempo por dia deriva as horas da semana', () => {
    const v = validarEntradaDeTreinos({ semanas: 1, diasDaSemana: [1, 3], minutosPorDia: { 1: 60, 3: 90 }, esporte: 'ambos' });
    expect(v.valido).toBe(true);
    expect(v.valores.horasPorSemana).toBe(2.5);
    expect(v.valores.minutosPorDia).toEqual({ 1: 60, 3: 90 });
    expect(validarEntradaDeTreinos({ semanas: 1, diasDaSemana: [1, 3], minutosPorDia: { 1: 60 }, esporte: 'ambos' }).valido).toBe(false);
  });

  it('treino de trajeto curto ganha voltas para fechar o tempo do dia (plano automático)', () => {
    const r = validarSugestaoDeTreinos(sugestao('Trajeto30'), ctx(pedido(), [curto()], { permitirVoltas: true }));
    expect(r.itens[0]).toMatchObject({ modeloId: 'Trajeto30', voltas: 2, duracaoMin: 60, trajeto: 'Orla' });
  });

  it('sem voltas permitidas, o treino curto é trocado por um que caiba entre 80% e 120% do dia', () => {
    const r = validarSugestaoDeTreinos(sugestao('Trajeto30'), ctx(pedido(), [curto()]));
    const item = r.itens.find((i) => i.data === '2026-11-05');
    expect(item.modeloId).not.toBe('Trajeto30');
    expect(item.duracaoMin).toBeGreaterThanOrEqual(48);
    expect(item.duracaoMin).toBeLessThanOrEqual(72);
  });

  it('todo treino da semana respeita o tempo do dia (80% a 120%)', () => {
    const r = validarSugestaoDeTreinos({ treinos: [] }, ctx(pedido({ minutosPorDia: { 3: 90 } }), []));
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].duracaoMin).toBeGreaterThanOrEqual(72);
    expect(r.itens[0].duracaoMin).toBeLessThanOrEqual(108);
  });

  it('no máximo um treino por trajeto na semana', () => {
    const outro = curto({ id: 'Trajeto30b', nome: 'Outra volta curta' });
    const entrada = pedido({ diasDaSemana: [3, 4], minutosPorDia: { 3: 60, 4: 60 } });
    const r = validarSugestaoDeTreinos(sugestao('Trajeto30', 'Trajeto30b'), ctx(entrada, [curto(), outro], { permitirVoltas: true, variarTrajetos: true }));
    expect(r.itens.filter((i) => i.trajeto === 'Orla')).toHaveLength(1);
    expect(r.avisos.some((a) => a.includes('para variar os trajetos'))).toBe(true);
    expect(r.itens).toHaveLength(2); // o dia liberado foi completado com um treino que não é de trajeto
  });
});
