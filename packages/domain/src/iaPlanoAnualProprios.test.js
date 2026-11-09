import { describe, expect, it } from 'vitest';
import { somarDias } from './forma.js';
import { menuParaIa, validarRascunhoAnualDaIa } from './iaPlanoAnual.js';
import { gerarPlanoAnual } from './planoAnual.js';
import { diaDaSemana } from './semana.js';

const HOJE = '2026-11-04'; // quarta-feira
const CONFIG = { vigenteDesde: '2026-01-01', fcMax: 190, fcRepouso: 50, lthr: 170, sexo: 'masculino', pesoKg: 75, alturaCm: 175 };
const configEm = () => CONFIG;
const PROVA = { data: '2027-03-14', prioridade: 'A', esporte: 'ciclismo' };

function cenario(extra = {}) {
  const dias = [];
  for (let i = 1; i <= 56; i++) {
    const data = somarDias(HOJE, -i);
    if ([1, 3, 5, 6].includes(diaDaSemana(data))) dias.push({ data, estresse: 350 / 4 });
  }
  const plano = gerarPlanoAnual({ hoje: HOJE, prova: PROVA, dias, cargaBase: 350 });
  return { plano, prova: PROVA, hoje: HOJE, esporte: 'ciclismo', nivel: 'intermediario', configEm, diasTreino: [1, 3, 5, 6], diaLongao: 6, semanas: 4, ...extra };
}

const passosLeves = [{ tipo: 'bloco', papel: 'principal', duracaoS: 3600, zona: 'Z2' }];
const meu = { id: 'MeuTreino1AbC', nome: 'Meu rolê leve', esporte: 'ciclismo', foco: 'resistencia', nivel: 'avancado', passos: passosLeves, origem: 'proprio' };
const doTrajeto = { ...meu, id: 'TreinoTrajeto2', nome: 'Over-under Paris', trajetoNome: 'Brochier/Paris' };
const deCorrida = { ...meu, id: 'TreinoCorrida3', esporte: 'corrida' };
const doTeste = { ...meu, id: 'TreinoTeste4', foco: 'teste' };
const proprios = [meu, doTrajeto, deCorrida, doTeste];

const prop = (data, id, motivo = 'ok') => ({ data, origem: 'proprio', id, motivo });
const cat = (data, id) => ({ data, origem: 'catalogo', id, motivo: 'ok' });
const validar = (treinos, extra = {}) => validarRascunhoAnualDaIa({ treinos }, cenario({ proprios, ...extra }));
const noDia = (r, data) => r.itens.find((i) => i.data === data);
const temAviso = (r, trecho) => r.avisos.some((a) => a.includes(trecho));

describe('treinos próprios na IA do plano anual', () => {
  it('o menu traz os treinos próprios do esporte (de qualquer nível, sem o teste), com estresse e o trajeto', () => {
    const menu = menuParaIa({ esporte: 'ciclismo', nivel: 'iniciante', configEm, hoje: HOJE, proprios });
    expect(menu.proprios.map((m) => m.id)).toEqual(['MeuTreino1AbC', 'TreinoTrajeto2']);
    expect(menu.proprios.every((m) => m.proprio === true && m.estresse > 0 && m.duracaoMin === 60)).toBe(true);
    expect(menu.proprios.find((m) => m.id === 'TreinoTrajeto2').trajeto).toBe('Brochier/Paris');
    expect(menu.proprios[0].trajeto).toBeUndefined();
  });

  it('sem treinos próprios, a lista vem vazia', () => {
    expect(menuParaIa({ esporte: 'ciclismo', nivel: 'intermediario', configEm, hoje: HOJE }).proprios).toEqual([]);
  });

  it('aceita o treino próprio, mesmo de nível acima, e o rascunho traz o id dele e os passos', () => {
    const r = validar([prop('2026-11-05', 'MeuTreino1AbC', 'Rolê leve do próprio atleta.')]);
    const item = noDia(r, '2026-11-05');
    expect(item).toBeTruthy();
    expect(item.modelo.id).toBe('MeuTreino1AbC');
    expect(item.entrada.modeloId).toBe('MeuTreino1AbC');
    expect(item.entrada.passos).toEqual(passosLeves);
    expect(item.motivo).toBe('Rolê leve do próprio atleta.');
  });

  it('descarta treino próprio que não existe, de outro esporte ou que é o teste', () => {
    for (const id of ['inventado', 'TreinoCorrida3', 'TreinoTeste4']) {
      expect(noDia(validar([prop('2026-11-05', id)]), '2026-11-05'), id).toBeUndefined();
    }
    expect(temAviso(validar([prop('2026-11-05', 'inventado')]), 'entre os seus treinos')).toBe(true);
  });

  it('o id do treino próprio não vale como treino do catálogo, e o do catálogo não vale como próprio', () => {
    expect(noDia(validar([cat('2026-11-05', 'MeuTreino1AbC')]), '2026-11-05')).toBeUndefined();
    expect(noDia(validar([prop('2026-11-05', 'tempo-30-ciclismo')]), '2026-11-05')).toBeUndefined();
  });

  it('sem a lista de próprios no contexto, o treino próprio é descartado', () => {
    const r = validarRascunhoAnualDaIa({ treinos: [prop('2026-11-05', 'MeuTreino1AbC')] }, cenario());
    expect(noDia(r, '2026-11-05')).toBeUndefined();
  });

  it('o mesmo treino próprio não se repete em menos de 14 dias', () => {
    const r = validar([prop('2026-11-05', 'MeuTreino1AbC'), prop('2026-11-08', 'MeuTreino1AbC')]);
    expect(r.itens.filter((i) => i.modelo.id === 'MeuTreino1AbC')).toHaveLength(1);
    expect(temAviso(r, 'menos de 14 dias')).toBe(true);
  });
});
