// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const HOJE = new Date().toISOString().slice(0, 10);
const dia = (n) => new Date(Date.parse(`${HOJE}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const pesagens = [20, 13, 6, 0].map((n, i) => ({ id: `p${i}`, data: dia(n), pesoKg: 91 - i * 0.4 }));
const bemEstar = Array.from({ length: 60 }, (_, n) => ({ data: dia(n), sonoSegundos: (5 + (n % 4)) * 3600, passos: 4000 + (n % 7) * 1000 })).reverse();
const estresse = Array.from({ length: 40 }, (_, n) => ({ data: dia(n * 2), estresse: 60, qtdAtividades: 1 })).reverse();
const configs = [{ id: 'c1', vigenteDesde: '2020-01-01', alturaCm: 180, sexo: 'masculino', pesoKg: 91, fcMax: 190, fcRepouso: 55, lthr: 170 }];

// os repositórios entregam os dados de exemplo na hora e devolvem uma função de cancelamento
vi.mock('../../infrastructure/pesoRepo.js', () => ({
  observarPesagens: (uid, cb) => (cb(pesagens), () => {}),
  observarMetasPeso: (uid, cb) => (cb([{ id: 'm1', status: 'ativa', pesoAlvoKg: 85, pesoInicialKg: 91, dataAlvo: '2099-01-01' }]), () => {}),
  excluirMetaPeso: vi.fn(),
  excluirPesagem: vi.fn(),
  idDaPesagem: vi.fn(),
}));
vi.mock('../../infrastructure/bemEstarRepo.js', () => ({ DIAS_CARREGADOS_BEM_ESTAR: 90, observarBemEstar: (uid, desde, cb) => (cb(bemEstar), () => {}) }));
vi.mock('../../infrastructure/configsRepo.js', () => ({ observarConfigs: (uid, cb) => (cb(configs), () => {}) }));
vi.mock('../../infrastructure/estresseRepo.js', () => ({ observarEstresseDiario: (uid, cb) => (cb(estresse), () => {}) }));
vi.mock('../../infrastructure/medidasRepo.js', () => ({ observarMedidas: (uid, cb) => (cb([]), () => {}), excluirMedidas: vi.fn(), idDasMedidas: vi.fn() }));
vi.mock('../../infrastructure/calibracaoRepo.js', () => ({ observarPreferencias: (uid, cb) => (cb({ metaPassos: 7000 }), () => {}), salvarPreferencias: vi.fn() }));
vi.mock('../../application/peso.js', () => ({ salvarMetaDePeso: vi.fn(), salvarPesagem: vi.fn() }));
vi.mock('../../application/medidas.js', () => ({ salvarMedidas: vi.fn() }));
vi.mock('../../core/functions.js', () => ({ intervalsSincronizarBemEstar: vi.fn() }));
const sugestaoDeAlimentacao = {
  dia: {
    data: HOJE,
    objetivo: 'emagrecer',
    tipoDeDia: 'moderado',
    saida: {
      resumo: 'Treino moderado hoje.',
      avisos: [],
      aviso: 'Sugestão gerada por IA.',
      itens: [
        { bloco: 'levar', nome: 'Torrada com queijo', tipo: 'salgado', porQue: 'Energia para o treino.', tempoMin: 5, ingredientes: ['pão', 'queijo'], preparo: ['Torre o pão.'], equipamento: ['torradeira'], vespera: false },
        { bloco: 'padaria', nome: 'Pão de queijo e café', tipo: 'salgado', porQue: 'Opção rápida.', tempoMin: 0, ingredientes: ['2 pães de queijo', 'café'], preparo: [], equipamento: ['nenhum'], vespera: false },
        { bloco: 'casa', nome: 'Bolo de banana fit', tipo: 'doce', porQue: 'Recuperação.', tempoMin: 35, ingredientes: ['banana', 'aveia', 'ovo'], preparo: ['Misture tudo.', 'Asse.'], equipamento: ['forno'], vespera: true },
      ],
    },
  },
};
vi.mock('../../infrastructure/alimentacaoRepo.js', () => ({
  observarPerfilAlimentar: (uid, cb) => (cb(null), () => {}),
  observarSugestaoAlimentar: (uid, cb) => (cb(sugestaoDeAlimentacao), () => {}),
  observarFavoritas: (uid, cb) => (cb([]), () => {}),
  favoritarReceita: vi.fn(),
  desfavoritarReceita: vi.fn(),
  salvarPerfilAlimentar: vi.fn(),
}));
vi.mock('../../application/alimentacao.js', () => ({ pedirSugestaoAlimentar: vi.fn(), salvarPerfilDeAlimentacao: vi.fn() }));
vi.mock('../../application/ia.js', () => ({ restantesDaIa: () => Promise.resolve(3) }));

const { render } = await import('./peso.view.js');

describe('página Saúde', () => {
  it('monta o índice, o período único e as cinco seções', () => {
    const raiz = document.createElement('div');
    document.body.append(raiz);
    const sair = render(raiz, { uid: 'u1' });

    // controles fixos: índice com 5 seções (Alimentação por último), 5 períodos e o botão de registrar peso
    expect([...raiz.querySelectorAll('.plano-ancora')].map((b) => b.textContent)).toEqual(['Resumo', 'Peso', 'Sono, passos e treino', 'Medidas', 'Alimentação']);
    expect(raiz.querySelectorAll('.saude-controles .ativ-chip')).toHaveLength(5);
    expect(raiz.querySelector('.saude-controles .btn').textContent).toBe('Registrar peso');
    expect(['saude-resumo', 'saude-peso', 'saude-sono-passos', 'saude-medidas', 'saude-alimentacao'].every((id) => raiz.querySelector(`#${id}`))).toBe(true);

    // resumo com os 4 cartões e a leitura; peso com gráfico, meta e IMC; sono/passos com gráfico; medidas com 3 abas
    expect(raiz.querySelectorAll('#saude-resumo .saude-card')).toHaveLength(4);
    expect(raiz.querySelector('#saude-peso .peso-grafico-cartao svg')).not.toBeNull();
    expect(raiz.querySelector('#saude-peso').textContent).toContain('Meta de peso');
    expect(raiz.querySelector('#saude-peso').textContent).toContain('IMC e faixa saudável');
    expect(raiz.querySelector('#saude-sono-passos svg')).not.toBeNull();
    expect(raiz.querySelector('#saude-sono-passos').textContent).toContain('Meta: 7.000 passos');
    expect(raiz.querySelectorAll('#saude-medidas [role="tab"]')).toHaveLength(3);

    // alimentação: sugestões do dia agrupadas por bloco, com receita, selos e o objetivo seguindo a meta de peso (perder peso)
    const alim = raiz.querySelector('#saude-alimentacao');
    expect(alim.querySelectorAll('.alim-item')).toHaveLength(3);
    expect([...alim.querySelectorAll('.alim-grupo-titulo')].map((t) => t.textContent)).toEqual(['Lanche para levar', 'Lanche na padaria', 'Receita para fazer em casa']);
    expect(alim.textContent).toContain('Objetivo: emagrecer');
    expect(alim.textContent).toContain('Gerar de novo');
    expect(alim.querySelector('.alim-orientacao').textContent).toContain('Treino moderado');
    expect(alim.querySelectorAll('.alim-item')[1].textContent).toContain('O que pedir');

    // nada de texto estragado na tela
    expect(raiz.textContent).not.toMatch(/\bnull\b|NaN|undefined/);

    // o período único redesenha as seções sem erro
    for (const botao of raiz.querySelectorAll('.saude-controles .ativ-chip')) {
      botao.click();
      expect(botao.getAttribute('aria-pressed')).toBe('true');
      expect(raiz.querySelectorAll('.saude-controles .ativ-chip[aria-pressed="true"]')).toHaveLength(1);
      expect(raiz.textContent).not.toMatch(/\bnull\b|NaN|undefined/);
    }
    sair();
    raiz.remove();
  });
});
