// Regras da coleção `provas`. Roda no emulador do Firestore:
//   npx firebase emulators:exec --only firestore --project demo-nostrova "npx vitest run firebase/tests"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

const prova = (extra = {}) => ({
  userId: 'ana',
  nome: 'Meia de Porto Alegre',
  data: '2027-03-14',
  esporte: 'corrida',
  prioridade: 'A',
  distanciaKm: null,
  metaTempoS: null,
  local: null,
  formaAlvo: null,
  ...extra,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nostrova',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('users/ana').set({ aprovado: true, ativo: true, role: 'atleta' });
    await db.doc('users/beto').set({ aprovado: true, ativo: true, role: 'atleta' });
    await db.doc('users/novo').set({ aprovado: false, ativo: true, role: 'atleta' });
  });
});

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('provas', () => {
  it('o dono cria uma prova com os opcionais nulos', async () => {
    await assertSucceeds(como('ana').doc('provas/p1').set(prova()));
  });

  it('aceita todos os opcionais preenchidos', async () => {
    await assertSucceeds(como('ana').doc('provas/p1').set(prova({ distanciaKm: 21.1, metaTempoS: 6300, local: 'Porto Alegre', formaAlvo: 10 })));
  });

  it('aceita criar sem os campos opcionais', async () => {
    const { userId, nome, data, esporte, prioridade } = prova();
    await assertSucceeds(como('ana').doc('provas/p1').set({ userId, nome, data, esporte, prioridade }));
  });

  it('recusa prioridade, esporte e data inválidos', async () => {
    await assertFails(como('ana').doc('provas/p1').set(prova({ prioridade: 'D' })));
    await assertFails(como('ana').doc('provas/p1').set(prova({ esporte: 'natacao' })));
    await assertFails(como('ana').doc('provas/p1').set(prova({ data: '14/03/2027' })));
  });

  it('recusa nome curto, distância, tempo e Forma-alvo fora da faixa', async () => {
    await assertFails(como('ana').doc('provas/p1').set(prova({ nome: 'ab' })));
    await assertFails(como('ana').doc('provas/p1').set(prova({ distanciaKm: 0 })));
    await assertFails(como('ana').doc('provas/p1').set(prova({ metaTempoS: 10 })));
    await assertFails(como('ana').doc('provas/p1').set(prova({ formaAlvo: 99 })));
  });

  it('recusa campo extra e dono diferente do autenticado', async () => {
    await assertFails(como('ana').doc('provas/p1').set(prova({ premio: 'x' })));
    await assertFails(como('ana').doc('provas/p1').set(prova({ userId: 'beto' })));
  });

  it('só o dono lê, edita e apaga', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('provas/p1').set(prova()));
    await assertSucceeds(como('ana').doc('provas/p1').get());
    await assertFails(como('beto').doc('provas/p1').get());
    await assertSucceeds(como('ana').doc('provas/p1').update({ prioridade: 'B' }));
    await assertFails(como('beto').doc('provas/p1').update({ prioridade: 'C' }));
    await assertFails(como('beto').doc('provas/p1').delete());
    await assertSucceeds(como('ana').doc('provas/p1').delete());
  });

  it('usuário não aprovado e visitante não acessam', async () => {
    await assertFails(como('novo').doc('provas/p1').set(prova({ userId: 'novo' })));
    await assertFails(env.unauthenticatedContext().firestore().doc('provas/p1').get());
  });
});

describe('treinosModelos: focos', () => {
  const modelo = (foco) => ({
    userId: 'ana', nome: 'Meu treino', esporte: 'ciclismo', foco, nivel: 'intermediario',
    passos: [{ tipo: 'bloco', papel: 'principal', duracaoS: 1800, zona: 'Z2' }],
  });

  it('aceita os focos leves e o teste, além dos de qualidade', async () => {
    for (const foco of ['vo2max', 'recuperacao', 'resistencia', 'teste']) {
      await assertSucceeds(como('ana').doc(`treinosModelos/${foco}`).set(modelo(foco)));
    }
  });

  it('recusa foco desconhecido', async () => {
    await assertFails(como('ana').doc('treinosModelos/x').set(modelo('natacao')));
  });
});
