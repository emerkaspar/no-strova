import { describe, expect, it } from 'vitest';
import { diasEntre, somarDias } from './forma.js';
import { gerarPlanoAnual, gerarRascunhoDoPlano, REGRAS_PLANO_ANUAL } from './planoAnual.js';
import { validarTreinoPlanejado } from './planejamento.js';
import { diaDaSemana, inicioDaSemana } from './semana.js';
import { MINIMO_DO_LONGAO_MIN } from './treinosDeBase.js';

const HOJE = '2026-11-04'; // quarta-feira
const CONFIG = { vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 175 };
const configEm = () => CONFIG;

/** 8 semanas de histórico com 200 de carga por semana (50 em quatro dias). */
function historico() {
  const dias = [];
  for (let i = 1; i <= 56; i++) {
    const data = somarDias(HOJE, -i);
    if ([1, 3, 5, 6].includes(diaDaSemana(data))) dias.push({ data, estresse: 50 });
  }
  return dias;
}

describe('gerarPlanoAnual', () => {
  const prova = { data: '2027-03-14', prioridade: 'A' }; // domingo, ~19 semanas
  const dias = historico();
  const plano = gerarPlanoAnual({ hoje: HOJE, prova, dias, cargaBase: 200 });

  it('vai da semana atual até a semana da prova, de segunda a domingo', () => {
    expect(plano.semanas[0].inicio).toBe(inicioDaSemana(HOJE));
    expect(plano.semanas.at(-1).inicio).toBe(inicioDaSemana(prova.data));
    expect(plano.semanas.at(-1).semanaDaProva).toBe(true);
    for (const s of plano.semanas) expect(diaDaSemana(s.inicio)).toBe(0);
    expect(plano.resumo.semanasTotal).toBe(plano.semanas.length);
    expect(plano.resumo.diasAteProva).toBe(diasEntre(HOJE, prova.data));
  });

  it('segue a ordem base → construção → pico → polimento', () => {
    const ordem = ['base', 'construcao', 'pico', 'polimento'];
    const indices = plano.semanas.map((s) => ordem.indexOf(s.fase));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(plano.semanas.map((s) => s.fase)).size).toBe(4);
  });

  it('prova A tem 2 semanas de polimento e a carga cai até a semana da prova', () => {
    const polimento = plano.semanas.filter((s) => s.fase === 'polimento');
    expect(polimento).toHaveLength(2);
    expect(polimento[0].cargaAlvo).toBeLessThan(plano.resumo.cargaPico);
    expect(polimento[1].cargaAlvo).toBeLessThan(polimento[0].cargaAlvo);
  });

  it('o aumento entre semanas de treino nunca passa de 10% e o pico respeita o teto', () => {
    const treino = plano.semanas.filter((s) => s.fase !== 'polimento');
    for (let i = 1; i < treino.length; i++) {
      // depois de uma semana de recuperação a comparação é com a anterior ao descanso
      const anterior = treino[i - 1].recuperacao ? treino[i - 2] : treino[i - 1];
      expect(treino[i].cargaAlvo).toBeLessThanOrEqual(Math.ceil(anterior.cargaAlvo * 1.1));
    }
    expect(plano.resumo.cargaPico).toBeLessThanOrEqual(Math.round(200 * REGRAS_PLANO_ANUAL.tetoSobreBase));
  });

  it('tem semanas de recuperação, e nenhuma no pico', () => {
    const recuperacoes = plano.semanas.filter((s) => s.recuperacao);
    expect(recuperacoes.length).toBeGreaterThan(0);
    expect(recuperacoes.every((s) => s.fase !== 'pico')).toBe(true);
    for (const r of recuperacoes) {
      const i = plano.semanas.indexOf(r);
      expect(r.cargaAlvo).toBeLessThan(plano.semanas[i - 1].cargaAlvo);
    }
  });

  it('projeta Condicionamento e Forma no dia da prova (Forma positiva após o polimento)', () => {
    expect(plano.resumo.condicionamentoNaProva).toBeGreaterThan(0);
    expect(plano.resumo.formaNaProva).toBeGreaterThan(0);
  });

  it('conta o realizado da semana atual até hoje', () => {
    const atual = plano.semanas.find((s) => s.atual);
    const esperado = dias.filter((d) => d.data >= atual.inicio && d.data <= HOJE).reduce((s, d) => s + d.estresse, 0);
    expect(atual.realizado).toBe(esperado);
    expect(plano.semanas.filter((s) => !s.atual).every((s) => s.realizado === 0)).toBe(true);
  });

  it('prova B tem 1 semana de polimento', () => {
    const b = gerarPlanoAnual({ hoje: HOJE, prova: { ...prova, prioridade: 'B' }, dias, cargaBase: 200 });
    expect(b.semanas.filter((s) => s.fase === 'polimento')).toHaveLength(1);
  });

  it('com Forma-alvo escolhe o polimento que deixa a Forma mais perto dela', () => {
    const baixo = gerarPlanoAnual({ hoje: HOJE, prova: { ...prova, formaAlvo: 0 }, dias, cargaBase: 200 });
    const alto = gerarPlanoAnual({ hoje: HOJE, prova: { ...prova, formaAlvo: 30 }, dias, cargaBase: 200 });
    expect(alto.resumo.semanasDePolimento).toBeGreaterThanOrEqual(baixo.resumo.semanasDePolimento);
    expect(Math.abs(alto.resumo.formaNaProva - 30)).toBeLessThanOrEqual(Math.abs(baixo.resumo.formaNaProva - 30));
  });

  it('sem histórico usa a carga mínima e avisa', () => {
    const p = gerarPlanoAnual({ hoje: HOJE, prova, dias: [], cargaBase: 0 });
    expect(p.avisos.some((a) => a.includes('Sem histórico'))).toBe(true);
    expect(p.resumo.cargaBase).toBe(100);
  });

  it('prova distante: cobre só as últimas 52 semanas', () => {
    const longe = gerarPlanoAnual({ hoje: HOJE, prova: { data: '2028-09-17', prioridade: 'A' }, dias, cargaBase: 200 });
    expect(longe.semanas).toHaveLength(52);
    expect(longe.avisos.some((a) => a.includes('52 semanas'))).toBe(true);
  });

  it('prova nesta semana: só polimento', () => {
    const p = gerarPlanoAnual({ hoje: HOJE, prova: { data: '2026-11-08', prioridade: 'A' }, dias, cargaBase: 200 });
    expect(p.semanas).toHaveLength(1);
    expect(p.semanas[0]).toMatchObject({ fase: 'polimento', semanaDaProva: true });
  });

  it('prova passada ou ausente não gera plano', () => {
    expect(gerarPlanoAnual({ hoje: HOJE, prova: { data: '2026-11-01', prioridade: 'A' }, cargaBase: 200 }).semanas).toEqual([]);
    expect(gerarPlanoAnual({ hoje: HOJE, prova: null, cargaBase: 200 }).semanas).toEqual([]);
  });
});

describe('gerarRascunhoDoPlano', () => {
  const prova = { data: '2027-03-14', prioridade: 'A', esporte: 'corrida' };
  const dias = historico();
  const plano = gerarPlanoAnual({ hoje: HOJE, prova, dias, cargaBase: 200 });
  const entrada = { plano, prova, hoje: HOJE, esporte: 'corrida', nivel: 'intermediario', configEm, diasTreino: [1, 3, 5, 6], diaLongao: 6 };

  it('só usa os dias de treino escolhidos, de amanhã em diante, e nunca repete o dia', () => {
    const r = gerarRascunhoDoPlano(entrada);
    expect(r.itens.length).toBeGreaterThan(0);
    const datas = r.itens.map((i) => i.data);
    expect(new Set(datas).size).toBe(datas.length);
    for (const i of r.itens) {
      expect([1, 3, 5, 6]).toContain(diaDaSemana(i.data));
      expect(i.data > HOJE).toBe(true);
    }
  });

  it('põe o longão no dia escolhido, em zona 2, e é o treino mais longo da semana', () => {
    const r = gerarRascunhoDoPlano(entrada);
    const longoes = r.itens.filter((i) => i.tipo === 'longao');
    expect(longoes.length).toBeGreaterThan(0);
    for (const l of longoes) {
      expect(diaDaSemana(l.data)).toBe(6);
      expect(l.entrada.zona).toBe('Z2');
      const mesmaSemana = r.itens.filter((i) => i.semana === l.semana && i.tipo === 'leve');
      for (const leve of mesmaSemana) expect(l.entrada.duracaoMin).toBeGreaterThanOrEqual(leve.entrada.duracaoMin);
    }
  });

  it('o rascunho chega perto da meta de carga de cada semana', () => {
    const r = gerarRascunhoDoPlano(entrada);
    const semanaCheia = r.porSemana.find((s) => s.inicio > inicioDaSemana(HOJE));
    expect(semanaCheia.rascunho).toBeGreaterThan(semanaCheia.cargaAlvo * 0.8);
    expect(semanaCheia.rascunho).toBeLessThan(semanaCheia.cargaAlvo * 1.25);
  });

  it('no máximo um treino intenso por semana e 48 h entre intensos', () => {
    const r = gerarRascunhoDoPlano({ ...entrada, semanas: 12 });
    const intensos = r.itens.filter((i) => i.tipo === 'intenso').map((i) => i.data);
    for (let i = 1; i < intensos.length; i++) expect(diasEntre(intensos[i - 1], intensos[i])).toBeGreaterThanOrEqual(2);
    const porSemana = {};
    for (const i of r.itens.filter((x) => x.tipo === 'intenso')) porSemana[i.semana] = (porSemana[i.semana] ?? 0) + 1;
    expect(Object.values(porSemana).every((n) => n <= 1)).toBe(true);
  });

  it('respeita dias já ocupados', () => {
    const livre = gerarRascunhoDoPlano(entrada);
    const ocupado = livre.itens[0].data;
    const r = gerarRascunhoDoPlano({ ...entrada, treinos: [{ data: ocupado, status: 'planejado', zona: 'Z2', esporte: 'corrida', duracaoMin: 60 }] });
    expect(r.itens.map((i) => i.data)).not.toContain(ocupado);
  });

  it('sem configuração de FC, não monta e explica', () => {
    const r = gerarRascunhoDoPlano({ ...entrada, configEm: () => null });
    expect(r.itens).toEqual([]);
    expect(r.avisos[0]).toContain('configuração de FC');
  });

  it('esporte "outro" não tem rascunho', () => {
    expect(gerarRascunhoDoPlano({ ...entrada, esporte: 'outro' }).itens).toEqual([]);
  });

  it('sem dias de treino definidos, usa o padrão e avisa', () => {
    const r = gerarRascunhoDoPlano({ ...entrada, diasTreino: null, diaLongao: null });
    expect(r.avisos.some((a) => a.includes('Sem dias de treino'))).toBe(true);
    expect(r.itens.length).toBeGreaterThan(0);
  });

  it('semana da prova: só soltura na véspera, nada depois da prova', () => {
    const proxima = { data: '2026-11-15', prioridade: 'B', esporte: 'corrida' }; // domingo, 2 semanas
    const p = gerarPlanoAnual({ hoje: HOJE, prova: proxima, dias, cargaBase: 200 });
    const r = gerarRascunhoDoPlano({ ...entrada, plano: p, prova: proxima, semanas: 4 });
    expect(r.itens.every((i) => i.data < proxima.data)).toBe(true);
    const daProva = r.itens.filter((i) => i.semana === inicioDaSemana(proxima.data));
    expect(daProva.map((i) => i.tipo)).toEqual(['ativacao']);
    expect(daProva[0].data).toBe('2026-11-14');
  });
});

describe('rascunho: variedade', () => {
  const prova = { data: '2027-03-14', prioridade: 'A', esporte: 'ciclismo' };
  const rascunhoDe = (cargaBase, extra = {}) => {
    const dias = [];
    for (let i = 1; i <= 56; i++) {
      const data = somarDias(HOJE, -i);
      if ([1, 3, 5, 6].includes(diaDaSemana(data))) dias.push({ data, estresse: cargaBase / 4 });
    }
    const plano = gerarPlanoAnual({ hoje: HOJE, prova, dias, cargaBase });
    return gerarRascunhoDoPlano({ plano, prova, hoje: HOJE, esporte: 'ciclismo', nivel: 'intermediario', configEm, diasTreino: [1, 3, 5, 6], diaLongao: 6, ...extra });
  };

  it('com carga alta há muitos treinos diferentes, nenhum igual ao anterior e poucas repetições', () => {
    const { itens } = rascunhoDe(350, { semanas: 4 });
    const nomes = itens.map((i) => i.modelo?.nome ?? i.tipo);
    expect(itens.length).toBeGreaterThanOrEqual(12);
    expect(new Set(nomes).size).toBeGreaterThanOrEqual(Math.ceil(itens.length * 0.6));
    for (let i = 1; i < nomes.length; i++) expect(nomes[i]).not.toBe(nomes[i - 1]);
    const contagem = nomes.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map());
    expect(Math.max(...contagem.values())).toBeLessThanOrEqual(3);
  });

  it('longão só com 2 horas ou mais; abaixo disso o dia é uma rodagem', () => {
    for (const carga of [100, 200, 350]) {
      for (const i of rascunhoDe(carga, { semanas: 4 }).itens) {
        if (i.tipo === 'longao') expect(i.entrada.duracaoMin).toBeGreaterThanOrEqual(MINIMO_DO_LONGAO_MIN.ciclismo);
        // pedal leve de 20 ou 30 minutos não existe: o piso é de 45 min no ciclismo (a soltura da véspera inclusive)
        if (i.tipo === 'leve' || i.tipo === 'ativacao') expect(i.entrada.duracaoMin).toBeGreaterThanOrEqual(45);
      }
    }
  });

  it('com carga baixa não há longão e o aviso explica', () => {
    const r = rascunhoDe(100, { semanas: 4 });
    expect(r.itens.some((i) => i.tipo === 'longao')).toBe(false);
    expect(r.avisos.some((a) => a.includes('Sem longão'))).toBe(true);
  });

  it('toda sessão é um treino estruturado válido para gravar no plano', () => {
    for (const carga of [100, 350]) {
      for (const i of rascunhoDe(carga, { semanas: 4 }).itens.filter((x) => x.tipo !== 'ativacao')) {
        expect(i.entrada.passos?.length).toBeGreaterThan(0);
        expect(validarTreinoPlanejado(i.entrada).valido).toBe(true);
      }
    }
  });

  it('no máximo duas sessões de qualidade por semana, de focos diferentes, e uma só forte', () => {
    const { itens } = rascunhoDe(350, { semanas: 4 });
    const semanas = new Set(itens.map((i) => i.semana));
    for (const s of semanas) {
      const q = itens.filter((i) => i.semana === s && (i.tipo === 'intenso' || i.tipo === 'moderado'));
      expect(q.length).toBeLessThanOrEqual(2);
      expect(new Set(q.map((x) => x.modelo.foco)).size).toBe(q.length);
      expect(q.filter((x) => x.tipo === 'intenso').length).toBeLessThanOrEqual(1);
    }
  });

  it('a carga de cada semana fica no máximo 25% acima da meta (menos o que já estava no plano)', () => {
    const r = rascunhoDe(350, { semanas: 4 });
    for (const s of r.porSemana) expect(s.rascunho + s.existente).toBeLessThanOrEqual(Math.ceil(s.cargaAlvo * 1.25) + 1);
  });
});
