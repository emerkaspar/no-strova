import { describe, expect, it } from 'vitest';
import { CATALOGO_TREINOS, modelosDoCatalogo } from './catalogoTreinos.js';
import { gerarFitDoTreino } from './exportarTreino.js';
import { TREINOS_DE_BASE } from './treinosDeBase.js';
import { duracaoTotalS, expandirPassos, FOCOS, NIVEIS, validarPassos } from './treinosEstruturados.js';

const minutos = (blocos) => blocos.reduce((t, b) => t + b.duracaoS, 0) / 60;
const FORTES = ['vo2max', 'sprint', 'limiar', 'overunder', 'piramide', 'subidas'];
const MODERADOS = ['tempo', 'progressivo', 'fartlek'];
const LEVES = ['recuperacao', 'resistencia'];
const doGrupo = (focos) => CATALOGO_TREINOS.filter((m) => focos.includes(m.foco));
const duracaoMin = (m) => duracaoTotalS(m.passos) / 60;

/** Os blocos de aquecimento do começo do treino (e o resto). */
function aquecimentoDe(m) {
  const blocos = expandirPassos(m.passos);
  const inicio = blocos.findIndex((b) => b.papel !== 'aquecimento');
  return { aquecimento: blocos.slice(0, inicio), resto: blocos.slice(inicio), blocos };
}

describe('catálogo: estrutura geral', () => {
  it('todo modelo tem passos válidos e foco conhecido', () => {
    for (const m of CATALOGO_TREINOS) {
      expect(validarPassos(m.passos).valido, m.id).toBe(true);
      expect(FOCOS[m.foco], m.id).toBeTruthy();
    }
  });

  it('os nomes são únicos por esporte e nível, e não repetem os treinos de base do plano anual', () => {
    const vistos = new Set();
    for (const m of CATALOGO_TREINOS) {
      const chave = `${m.esporte}|${m.nivel}|${m.nome}`;
      expect(vistos.has(chave), chave).toBe(false);
      vistos.add(chave);
    }
    const nomesDeBase = new Set(TREINOS_DE_BASE.map((t) => t.nome));
    for (const m of CATALOGO_TREINOS) expect(nomesDeBase.has(m.nome), m.nome).toBe(false);
  });

  it('o mesmo nome só se repete entre níveis no teste de LTHR', () => {
    const porNome = new Map();
    for (const m of CATALOGO_TREINOS.filter((x) => x.esporte === 'ciclismo')) porNome.set(m.nome, (porNome.get(m.nome) ?? 0) + 1);
    for (const [nome, n] of porNome) if (n > 1) expect(nome).toBe('Hora da Verdade');
  });
});

describe('catálogo: aquecimento e volta à calma', () => {
  it('treinos fortes e moderados aquecem de 10 a 13 minutos, no começo, e nunca 15', () => {
    for (const m of doGrupo([...FORTES, ...MODERADOS])) {
      const { aquecimento, resto } = aquecimentoDe(m);
      expect(aquecimento.length, m.id).toBeGreaterThan(0);
      expect(resto.some((b) => b.papel === 'aquecimento'), `${m.id}: aquecimento fora do começo`).toBe(false);
      expect(minutos(aquecimento), m.id).toBeGreaterThanOrEqual(10);
      expect(minutos(aquecimento), m.id).toBeLessThanOrEqual(13);
    }
  });

  it('moderados aquecem 10 min sem aberturas; os fortes têm 2 ou 3 aberturas de 20 s', () => {
    for (const m of doGrupo([...FORTES, ...MODERADOS])) {
      const { aquecimento } = aquecimentoDe(m);
      const aberturas = aquecimento.filter((b) => b.duracaoS === 20);
      if (FORTES.includes(m.foco)) {
        const tres = m.foco === 'vo2max' || m.foco === 'sprint';
        expect(aberturas.length, m.id).toBe(tres ? 3 : 2);
        expect(aberturas.every((b) => b.zona === (tres ? 'Z5' : 'Z4')), m.id).toBe(true);
      } else {
        expect(aberturas.length, m.id).toBe(0);
        expect(minutos(aquecimento), m.id).toBe(10);
      }
    }
  });

  it('a abertura não conta como esforço principal e a última é seguida de 2 min leves', () => {
    const m = CATALOGO_TREINOS.find((x) => x.id === 'vo2-5x3-ciclismo');
    const blocos = expandirPassos(m.passos);
    expect(blocos.filter((b) => b.papel === 'principal')).toHaveLength(5);
    const ultimaAbertura = blocos.map((b, i) => ({ b, i })).filter(({ b }) => b.duracaoS === 20).pop();
    expect(blocos[ultimaAbertura.i + 1]).toMatchObject({ papel: 'aquecimento', zona: 'Z1', duracaoS: 120 });
  });

  it('treinos leves (recuperação e resistência) começam leves: 5 min em Z1 e nada de abertura', () => {
    for (const m of doGrupo(LEVES)) {
      const { aquecimento } = aquecimentoDe(m);
      expect(aquecimento, m.id).toHaveLength(1);
      expect(aquecimento[0], m.id).toMatchObject({ duracaoS: 300, zona: 'Z1' });
    }
  });

  it('a volta à calma tem 8 min depois dos fortes e 5 min depois dos moderados e dos leves', () => {
    for (const m of doGrupo([...FORTES, ...MODERADOS, ...LEVES])) {
      const volta = expandirPassos(m.passos).at(-1);
      expect(volta.papel, m.id).toBe('desaquecimento');
      expect(volta.duracaoS / 60, m.id).toBe(FORTES.includes(m.foco) ? 8 : 5);
    }
  });
});

describe('catálogo: recuperação e resistência', () => {
  it('cada nível tem treinos de recuperação e de resistência, nos dois esportes', () => {
    for (const esporte of ['ciclismo', 'corrida']) {
      for (const nivel of Object.keys(NIVEIS)) {
        expect(modelosDoCatalogo({ esporte, nivel, foco: 'recuperacao' }).length, `${esporte} ${nivel} recuperação`).toBeGreaterThanOrEqual(1);
        expect(modelosDoCatalogo({ esporte, nivel, foco: 'resistencia' }).length, `${esporte} ${nivel} resistência`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('as durações dependem do esporte: o pedal leve nunca fica abaixo de 45 min', () => {
    for (const m of doGrupo(LEVES)) {
      if (m.esporte === 'ciclismo') expect(duracaoMin(m), m.id).toBeGreaterThanOrEqual(45);
      else expect(duracaoMin(m), m.id).toBeGreaterThanOrEqual(30);
    }
    const cafe = (e) => duracaoMin(CATALOGO_TREINOS.find((m) => m.id === `rec-cafe-${e}`));
    expect(cafe('ciclismo')).toBeGreaterThan(cafe('corrida'));
  });

  it('treino chamado de longão tem 2 horas ou mais nos dois esportes', () => {
    const longoes = CATALOGO_TREINOS.filter((m) => m.nome.startsWith('Longão'));
    expect(longoes.length).toBeGreaterThanOrEqual(4); // 2 treinos × 2 esportes
    for (const m of longoes) expect(duracaoMin(m), m.id).toBeGreaterThanOrEqual(120);
  });

  it('recuperação fica em zona 1 e resistência em zona 2 (com no máximo ondas e finais em zona 3 ou aceleradas curtas)', () => {
    for (const m of doGrupo(['recuperacao'])) {
      const zonas = new Set(expandirPassos(m.passos).filter((b) => b.papel === 'principal' || b.papel === 'recuperacao').map((b) => b.zona));
      expect([...zonas].every((z) => z === 'Z1' || z === 'Z2'), m.id).toBe(true);
    }
    for (const m of doGrupo(['resistencia'])) {
      const principais = expandirPassos(m.passos).filter((b) => b.papel === 'principal');
      expect(principais.some((b) => b.zona === 'Z2'), m.id).toBe(true);
      expect(principais.some((b) => b.zona === 'Z5'), m.id).toBe(false);
    }
  });

  it('são treinos leves (intensidade baixa): nunca entram como forte nas sugestões', () => {
    expect(FOCOS.recuperacao.intensidade).toBe('baixa');
    expect(FOCOS.resistencia.intensidade).toBe('baixa');
  });
});

describe('catálogo: teste de LTHR', () => {
  const teste = CATALOGO_TREINOS.filter((m) => m.foco === 'teste');

  it('existe nos três níveis e nos dois esportes', () => {
    expect(teste).toHaveLength(6);
    for (const nivel of Object.keys(NIVEIS)) for (const esporte of ['ciclismo', 'corrida']) expect(modelosDoCatalogo({ esporte, nivel, foco: 'teste' })).toHaveLength(1);
  });

  it('é o protocolo de 30 min: 10 + 20 min principais, sem alvo de FC, com aquecimento de 18 min e volta de 10', () => {
    const { aquecimento, resto } = aquecimentoDe(teste[0]);
    expect(minutos(aquecimento)).toBe(18);
    const principais = resto.filter((b) => b.papel === 'principal');
    expect(principais.map((b) => b.duracaoS / 60)).toEqual([10, 20]);
    expect(principais.every((b) => b.alvoAberto)).toBe(true);
    expect(resto.at(-1)).toMatchObject({ papel: 'desaquecimento', duracaoS: 600 });
  });

  it('o alvo aberto sobrevive à validação e muda o arquivo exportado para o relógio', () => {
    const v = validarPassos(teste[0].passos);
    expect(v.valido).toBe(true);
    expect(expandirPassos(v.passos).filter((b) => b.alvoAberto)).toHaveLength(2);

    const config = { lthr: 170, fcMax: 190 };
    const comAlvo = teste[0].passos.map((p) => ({ ...p, alvoAberto: undefined }));
    const a = gerarFitDoTreino({ nome: 'Teste', esporte: 'ciclismo', passos: teste[0].passos }, { config, agora: 0 });
    const b = gerarFitDoTreino({ nome: 'Teste', esporte: 'ciclismo', passos: comAlvo }, { config, agora: 0 });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(false);
  });
});

describe('catálogo: passos curtos (menos de 1 min) são guiados pelo esforço', () => {
  const todos = [...CATALOGO_TREINOS, ...TREINOS_DE_BASE.filter((m) => Array.isArray(m.passos))];

  it('todo esforço curto tem a descrição, a única orientação sem a faixa de FC', () => {
    for (const m of todos) {
      for (const b of expandirPassos(m.passos).filter((x) => x.papel === 'principal' && x.duracaoS < 60)) {
        expect(b.descricao, `${m.id}: esforço de ${b.duracaoS} s sem descrição`).toBeTruthy();
      }
    }
  });

  it('esforços e recuperações curtos saem sem alvo de FC; os de 1 min ou mais mantêm', () => {
    for (const m of todos) {
      for (const b of expandirPassos(m.passos)) {
        if (b.duracaoS < 60) expect(b.alvoAberto, `${m.id}: ${b.duracaoS} s`).toBe(true);
        else if (m.foco !== 'teste') expect(b.alvoAberto, `${m.id}: ${b.duracaoS} s`).toBe(false);
      }
    }
  });
});
