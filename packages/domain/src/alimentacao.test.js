import { describe, expect, it } from 'vitest';
import { chaveDeReceita, nomesParaEvitar, objetivoEfetivo, PERFIL_ALIMENTAR_PADRAO, tipoDeDia, validarPerfilAlimentar, validarSugestaoAlimentar } from './alimentacao.js';

const item = (extra = {}) => ({
  bloco: 'levar',
  nome: 'Torrada com queijo e tomate',
  tipo: 'salgado',
  porQue: 'Proteína e carboidrato antes do treino.',
  tempoMin: 5,
  ingredientes: ['pão integral', 'queijo minas', 'tomate'],
  preparo: ['Torre o pão.', 'Monte com queijo e tomate.'],
  equipamento: ['torradeira'],
  vespera: false,
  ...extra,
});

describe('validarPerfilAlimentar', () => {
  it('aceita o padrão e normaliza as restrições', () => {
    const r = validarPerfilAlimentar({ ...PERFIL_ALIMENTAR_PADRAO, restricoes: 'amendoim, Lactose ,amendoim' });
    expect(r.valido).toBe(true);
    expect(r.valores.restricoes).toEqual(['amendoim', 'Lactose']);
  });
  it('usa o padrão quando faltam campos', () => {
    expect(validarPerfilAlimentar({}).valido).toBe(true);
  });
  it('rejeita objetivo, refeições e contexto inválidos', () => {
    expect(validarPerfilAlimentar({ objetivo: 'secar' }).valido).toBe(false);
    expect(validarPerfilAlimentar({ refeicoesPorDia: 12 }).valido).toBe(false);
    expect(validarPerfilAlimentar({ contexto: 'x'.repeat(601) }).valido).toBe(false);
  });
});

describe('objetivoEfetivo', () => {
  it('segue a meta de peso quando ligada', () => {
    expect(objetivoEfetivo({ objetivo: 'manter', usarMetaDePeso: true }, true)).toBe('emagrecer');
    expect(objetivoEfetivo({ objetivo: 'manter', usarMetaDePeso: true }, false)).toBe('ganhar');
  });
  it('usa o objetivo escolhido sem meta ou com a opção desligada', () => {
    expect(objetivoEfetivo({ objetivo: 'ganhar', usarMetaDePeso: true }, null)).toBe('ganhar');
    expect(objetivoEfetivo({ objetivo: 'manter', usarMetaDePeso: false }, true)).toBe('manter');
  });
});

describe('tipoDeDia', () => {
  it('descanso sem treino', () => expect(tipoDeDia().tipo).toBe('descanso'));
  it('recuperação sem treino mas cansado', () => expect(tipoDeDia({ forma: -20 }).tipo).toBe('recuperacao'));
  it('pesado com treino longo ou intenso', () => {
    expect(tipoDeDia({ treinosHoje: [{ duracaoMin: 100, zona: 'Z2' }] }).tipo).toBe('pesado');
    expect(tipoDeDia({ treinosHoje: [{ duracaoMin: 50, zona: 'Z4' }] }).tipo).toBe('pesado');
  });
  it('moderado e leve', () => {
    expect(tipoDeDia({ treinosHoje: [{ duracaoMin: 60, zona: 'Z2' }] }).tipo).toBe('moderado');
    expect(tipoDeDia({ treinosHoje: [{ duracaoMin: 30, zona: 'Z2' }] }).tipo).toBe('leve');
  });
  it('explica o motivo', () => {
    expect(tipoDeDia({ treinosHoje: [{ duracaoMin: 60 }], sonoMediaHoras: 5.5 }).motivo).toContain('sono curto');
  });
});

describe('validarSugestaoAlimentar', () => {
  it('mantém itens válidos e mistura de salgado e doce', () => {
    const r = validarSugestaoAlimentar({ resumo: 'Dia leve.', itens: [item(), item({ nome: 'Iogurte com granola', tipo: 'doce', ingredientes: ['iogurte', 'granola'], equipamento: ['geladeira'] })] });
    expect(r.valido).toBe(true);
    expect(r.itens).toHaveLength(2);
    expect(r.avisos).toEqual([]);
  });
  it('descarta o que cita uma restrição', () => {
    const r = validarSugestaoAlimentar({ itens: [item(), item({ nome: 'Pasta de amendoim', ingredientes: ['amendoim', 'pão'] })] }, { restricoes: ['Amendoim'] });
    expect(r.itens).toHaveLength(1);
    expect(r.avisos[0]).toContain('descartadas');
  });
  it('descarta receita sem preparo, mas aceita a da padaria sem preparo', () => {
    const r = validarSugestaoAlimentar({ itens: [item({ preparo: [] }), item({ bloco: 'padaria', nome: 'Pão de queijo e café', preparo: [] })] });
    expect(r.itens.map((i) => i.bloco)).toEqual(['padaria']);
  });
  it('descarta repetidos e promessas médicas', () => {
    const r = validarSugestaoAlimentar({ itens: [item(), item(), item({ nome: 'Suco detox', porQue: 'Cura tudo' })] });
    expect(r.itens).toHaveLength(1);
  });
  it('avisa quando só vem um sabor ou fruta demais', () => {
    expect(validarSugestaoAlimentar({ itens: [item(), item({ nome: 'Ovo cozido', ingredientes: ['ovo'] })] }).avisos.join(' ')).toContain('salgadas');
    const frutas = ['Banana', 'Maçã', 'Laranja'].map((n) => item({ nome: n, tipo: 'doce', ingredientes: [n], preparo: ['Descasque.'] }));
    expect(validarSugestaoAlimentar({ itens: [item(), ...frutas] }).avisos.join(' ')).toContain('só fruta');
  });
  it('na semana exige o dia e limita a quantidade', () => {
    const r = validarSugestaoAlimentar({ itens: [item({ dia: 'Segunda' }), item({ nome: 'Outro', dia: 'Qualquer' }), item({ nome: 'Sem dia' })] }, { escopo: 'semana' });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].dia).toBe('segunda');
  });
  it('em "amanhã" aceita só lanches para levar e limita a 4', () => {
    const levar = ['Torrada', 'Iogurte', 'Wrap', 'Bolinho', 'Ovo'].map((nome, i) => item({ nome, tipo: i % 2 ? 'doce' : 'salgado', ingredientes: [nome, 'pão'] }));
    const r = validarSugestaoAlimentar({ itens: [item({ bloco: 'casa', nome: 'Jantar' }), item({ bloco: 'padaria', nome: 'Café', preparo: [] }), ...levar] }, { escopo: 'amanha' });
    expect(r.itens.map((i) => i.bloco)).toEqual(['levar', 'levar', 'levar', 'levar']);
    expect(r.itens).toHaveLength(4);
  });
  it('é inválido sem itens', () => expect(validarSugestaoAlimentar({ itens: [] }).valido).toBe(false));
});

describe('auxiliares', () => {
  it('nomesParaEvitar tira duplicados', () => expect(nomesParaEvitar([{ nome: 'A' }, { nome: 'A' }, { nome: 'B' }])).toEqual(['A', 'B']));
  it('chaveDeReceita é estável e sem acento', () => expect(chaveDeReceita({ bloco: 'casa', nome: 'Pão de Queijo!' })).toBe('casa_pao-de-queijo'));
});
