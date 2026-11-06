import { describe, expect, it } from 'vitest';
import { diasEntre, somarDias } from './forma.js';
import { contextoDasSemanas, limitesDoTreinoDeBase, menuParaIa, validarRascunhoAnualDaIa } from './iaPlanoAnual.js';
import { gerarPlanoAnual } from './planoAnual.js';
import { validarTreinoPlanejado } from './planejamento.js';
import { diaDaSemana } from './semana.js';
import { TREINOS_DE_BASE } from './treinosDeBase.js';

const HOJE = '2026-11-04'; // quarta-feira
const CONFIG = { vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 175 };
const configEm = () => CONFIG;
const PROVA = { data: '2027-03-14', prioridade: 'A', esporte: 'ciclismo' };

function cenario(cargaBase = 350, extra = {}) {
  const dias = [];
  for (let i = 1; i <= 56; i++) {
    const data = somarDias(HOJE, -i);
    if ([1, 3, 5, 6].includes(diaDaSemana(data))) dias.push({ data, estresse: cargaBase / 4 });
  }
  const prova = extra.prova ?? PROVA;
  const plano = gerarPlanoAnual({ hoje: HOJE, prova, dias, cargaBase });
  return { plano, prova, hoje: HOJE, esporte: 'ciclismo', nivel: 'intermediario', configEm, diasTreino: [1, 3, 5, 6], diaLongao: 6, semanas: 4, ...extra };
}

const cat = (data, id, motivo = 'ok') => ({ data, origem: 'catalogo', id, motivo });
const base = (data, id, duracaoMin, motivo = 'ok') => ({ data, origem: 'base', id, duracaoMin, motivo });
const validar = (treinos, extra = {}) => validarRascunhoAnualDaIa({ treinos }, cenario(350, extra));
const temAviso = (r, trecho) => r.avisos.some((a) => a.includes(trecho));

describe('menuParaIa', () => {
  const menu = menuParaIa({ esporte: 'ciclismo', nivel: 'intermediario', configEm, hoje: HOJE });

  it('só treinos do esporte e do nível (ou abaixo), sem o teste de LTHR, com duração e estresse', () => {
    expect(menu.catalogo.length).toBeGreaterThan(20);
    expect(menu.catalogo.every((m) => m.id.endsWith('-ciclismo'))).toBe(true);
    expect(menu.catalogo.some((m) => m.nivel === 'avancado')).toBe(false);
    expect(menu.catalogo.some((m) => m.foco === 'teste')).toBe(false);
    expect(menu.catalogo.every((m) => m.duracaoMin > 0 && m.estresse > 0)).toBe(true);
  });

  it('os treinos de base têm os limites do esporte: rodagem de 45 min e longão de 2 h', () => {
    const rodagem = menu.base.find((t) => t.id === 'leve-raiz');
    const longao = menu.base.find((t) => t.id === 'longao-raiz');
    expect(rodagem.minMin).toBe(45);
    expect(longao.minMin).toBe(120);
    expect(menu.base).toHaveLength(TREINOS_DE_BASE.length);
    expect(limitesDoTreinoDeBase(TREINOS_DE_BASE.find((t) => t.id === 'leve-raiz'), 'corrida').min).toBe(30);
  });
});

describe('validarRascunhoAnualDaIa: o que passa', () => {
  const r = validar([
    cat('2026-11-05', 'tempo-30-ciclismo', 'Cruzeiro para abrir a base.'),
    base('2026-11-08', 'longao-raiz', 120, 'Longão no domingo.'),
    cat('2026-11-10', 'lim-3x8-ciclismo'),
    base('2026-11-12', 'leve-aceleradas', 60),
  ]);

  it('aceita treinos do catálogo e de base nos dias livres, na ordem das datas', () => {
    expect(r.itens.map((i) => i.data)).toEqual(['2026-11-05', '2026-11-08', '2026-11-10', '2026-11-12']);
    expect(r.itens.map((i) => i.tipo)).toEqual(['moderado', 'longao', 'intenso', 'leve']);
    // nenhum descarte nem ajuste (sobram dias livres, o que é só um aviso)
    expect(r.avisos.filter((a) => a.startsWith('Descartei') || a.startsWith('Ajustei'))).toEqual([]);
  });

  it('o formato é o do rascunho por regras: modelo, entrada válida, semana e fase', () => {
    for (const i of r.itens) {
      expect(i.modelo.nome).toBeTruthy();
      expect(i.estresse).toBeGreaterThan(0);
      expect(i.semana).toBe(i.data < '2026-11-09' ? '2026-11-02' : '2026-11-09');
      expect(['base', 'construcao', 'pico', 'polimento']).toContain(i.fase);
      expect(validarTreinoPlanejado(i.entrada).valido).toBe(true);
    }
    expect(r.itens[0].entrada.modeloId).toBe('tempo-30-ciclismo');
    expect(r.itens[1].entrada.modeloId).toBeNull();
  });

  it('guarda o motivo da IA (cortado em 160 caracteres) ou uma frase padrão', () => {
    expect(r.itens[0].motivo).toBe('Cruzeiro para abrir a base.');
    const longo = validar([cat('2026-11-05', 'tempo-30-ciclismo', 'x'.repeat(400)), base('2026-11-07', 'leve-raiz', 60, '  ')]);
    expect(longo.itens[0].motivo).toHaveLength(160);
    expect(longo.itens[1].motivo).toMatch(/^Fase de base/);
  });

  it('o resumo por semana soma o que foi escolhido', () => {
    expect(r.porSemana).toHaveLength(4);
    const primeira = r.porSemana[0];
    expect(primeira.rascunho).toBe(Math.round(r.itens.filter((i) => i.semana === primeira.inicio).reduce((s, i) => s + i.estresse, 0)));
  });
});

describe('validarRascunhoAnualDaIa: dias', () => {
  it('descarta dia que não é de treino, passado, duplicado ou ocupado', () => {
    const r = validar(
      [cat('2026-11-09', 'tempo-30-ciclismo'), cat('2026-11-03', 'tempo-30-ciclismo'), base('2026-11-05', 'leve-raiz', 60), base('2026-11-05', 'leve-escada', 60), base('2026-11-07', 'leve-raiz', 60)],
      { treinos: [{ data: '2026-11-07', status: 'planejado', zona: 'Z2', esporte: 'ciclismo', duracaoMin: 60 }] },
    );
    expect(r.itens.map((i) => i.data)).toEqual(['2026-11-05']);
    expect(temAviso(r, 'não está entre os seus dias livres')).toBe(true);
    expect(temAviso(r, 'já há outro treino nesse dia')).toBe(true);
  });

  it('semana da prova: descarta o que a IA pôs e acrescenta a soltura da véspera', () => {
    const prova = { data: '2026-11-15', prioridade: 'B', esporte: 'ciclismo' }; // domingo, na 2ª semana
    const r = validar([base('2026-11-10', 'leve-raiz', 60), base('2026-11-12', 'leve-raiz', 60), base('2026-11-14', 'leve-escada', 60)], { prova });
    expect(r.itens.some((i) => i.data === '2026-11-14' && i.tipo === 'ativacao')).toBe(true);
    expect(r.itens.some((i) => i.data === '2026-11-14' && i.tipo !== 'ativacao')).toBe(false);
    expect(r.itens.every((i) => i.data < prova.data)).toBe(true);
    expect(temAviso(r, 'na semana do evento só vale a soltura')).toBe(true);
  });
});

describe('validarRascunhoAnualDaIa: treinos', () => {
  it('descarta id inexistente, de outro esporte, de nível acima e o teste de LTHR', () => {
    const r = validar([
      cat('2026-11-05', 'nao-existe'),
      cat('2026-11-07', 'tempo-30-corrida'),
      cat('2026-11-08', 'lim-2x20-ciclismo'), // avançado
      cat('2026-11-10', 'teste-lthr-intermediario-ciclismo'),
      base('2026-11-12', 'nao-existe', 60),
      { data: '2026-11-14', origem: 'magica', id: 'x' },
    ]);
    expect(r.itens).toHaveLength(0);
    expect(r.avisos.filter((a) => a.startsWith('Descartei')).length).toBe(6);
    expect(temAviso(r, 'Nenhum treino da IA passou')).toBe(true);
  });

  it('ajusta a duração dos treinos de base para os limites e avisa', () => {
    const r = validar([base('2026-11-05', 'leve-raiz', 20), base('2026-11-08', 'longao-raiz', 90)]);
    expect(r.itens[0].entrada.duracaoMin).toBeGreaterThanOrEqual(45);
    expect(r.itens[1].entrada.duracaoMin).toBeGreaterThanOrEqual(120);
    expect(r.avisos.filter((a) => a.startsWith('Ajustei a duração')).length).toBe(2);
  });

  it('o longão só vale no dia de longão do perfil', () => {
    const r = validar([base('2026-11-07', 'longao-raiz', 120)]); // sábado; o longão é no domingo
    expect(r.itens).toHaveLength(0);
    expect(temAviso(r, 'dia de longão')).toBe(true);
  });

  it('variedade: o mesmo treino do catálogo não volta em menos de 14 dias', () => {
    const r = validar([cat('2026-11-05', 'tempo-30-ciclismo'), cat('2026-11-10', 'tempo-30-ciclismo'), cat('2026-11-19', 'tempo-30-ciclismo')]);
    expect(r.itens.map((i) => i.data)).toEqual(['2026-11-05', '2026-11-19']); // 5 dias depois: não; 14 dias depois: sim
    expect(temAviso(r, 'menos de 14 dias')).toBe(true);
  });

  it('conta o que já está no plano na variedade', () => {
    const r = validar([cat('2026-11-10', 'tempo-30-ciclismo')], { treinos: [{ data: '2026-11-03', status: 'realizado', modeloId: 'tempo-30-ciclismo', zona: 'Z3', esporte: 'ciclismo' }] });
    expect(r.itens).toHaveLength(0);
  });
});

describe('validarRascunhoAnualDaIa: intensidade e carga', () => {
  it('fortes: no máximo 2 por semana e com 48 h entre eles', () => {
    const r = validar([cat('2026-11-10', 'lim-3x8-ciclismo'), cat('2026-11-12', 'vo2-5x3-ciclismo'), cat('2026-11-14', 'sub-6x3-ciclismo'), cat('2026-11-15', 'sub-4x2-ciclismo')]);
    const fortes = r.itens.filter((i) => i.tipo === 'intenso');
    expect(fortes.length).toBe(2);
    expect(fortes.map((i) => i.data)).toEqual(['2026-11-10', '2026-11-12']);
    expect(temAviso(r, 'mais de 2 treinos fortes')).toBe(true);
  });

  it('respeita o treino forte que já está no plano', () => {
    const r = validar([cat('2026-11-10', 'lim-3x8-ciclismo')], { treinos: [{ data: '2026-11-09', status: 'planejado', zona: 'Z4', esporte: 'ciclismo', duracaoMin: 50 }] });
    expect(r.itens).toHaveLength(0);
  });

  it('semana de recuperação e polimento só aceitam treino leve', () => {
    const { plano } = cenario(350);
    const recuperacao = plano.semanas.find((s) => s.recuperacao && s.fim > HOJE);
    const dia = (i) => somarDias(recuperacao.inicio, [1, 3, 5, 6][i]);
    const r = validar([cat(dia(0), 'tempo-30-ciclismo'), cat(dia(1), 'lim-3x8-ciclismo'), base(dia(2), 'leve-aceleradas', 60), base(dia(3), 'leve-recuperacao', 60)], { semanas: 4 });
    expect(r.itens.map((i) => i.data)).toEqual([dia(3)]);
    expect(temAviso(r, 'semana de recuperação pede treino bem leve')).toBe(true);
  });

  it('a carga da semana fica no máximo 25% acima da meta: o treino de base é encurtado e o que não cabe é descartado', () => {
    const r = validarRascunhoAnualDaIa({ treinos: [base('2026-11-14', 'leve-raiz', 90), base('2026-11-15', 'longao-raiz', 120)] }, cenario(100));
    const semana = r.porSemana.find((s) => s.inicio === '2026-11-09');
    expect(semana.rascunho + semana.existente).toBeLessThanOrEqual(Math.ceil(semana.cargaAlvo * 1.25));
    expect(r.itens.some((i) => i.tipo === 'longao')).toBe(false);
    expect(temAviso(r, 'passaria da meta de carga')).toBe(true);
  });

  it('encurta o treino de base até caber, sem passar do piso', () => {
    const r = validarRascunhoAnualDaIa({ treinos: [base('2026-11-10', 'leve-raiz', 90), base('2026-11-12', 'leve-escada', 90), base('2026-11-14', 'leve-ondas', 90)] }, cenario(100));
    const duracoes = r.itens.map((i) => i.entrada.duracaoMin);
    expect(duracoes.every((d) => d >= 45)).toBe(true);
    expect(duracoes.some((d) => d < 90)).toBe(true);
  });
});

describe('validarRascunhoAnualDaIa: entradas ruins', () => {
  it('saída vazia, nula ou fora do formato não quebra', () => {
    for (const saida of [null, undefined, {}, { treinos: 'x' }, { treinos: [null, 3, { data: 5 }] }]) {
      const r = validarRascunhoAnualDaIa(saida, cenario());
      expect(r.itens.filter((i) => i.tipo !== 'ativacao')).toEqual([]);
    }
  });

  it('sem configuração de FC, não monta', () => {
    const r = validarRascunhoAnualDaIa({ treinos: [base('2026-11-05', 'leve-raiz', 60)] }, { ...cenario(), configEm: () => null });
    expect(r.itens).toEqual([]);
    expect(r.avisos[0]).toContain('configuração de FC');
  });

  it('esporte "outro" não tem rascunho', () => {
    expect(validarRascunhoAnualDaIa({ treinos: [] }, { ...cenario(), esporte: 'outro' }).itens).toEqual([]);
  });
});

describe('contextoDasSemanas', () => {
  it('lista os dias livres de cada semana, o que já está feito e o dia do longão', () => {
    const c = contextoDasSemanas(cenario());
    expect(c).toHaveLength(4);
    expect(c[0].livres).toEqual(['2026-11-05', '2026-11-07', '2026-11-08']);
    expect(c[1].livres).toEqual(['2026-11-10', '2026-11-12', '2026-11-14', '2026-11-15']);
    expect(c[1].dataDoLongao).toBe('2026-11-15');
    expect(diasEntre(c[0].semana.inicio, c[1].semana.inicio)).toBe(7);
  });
});
