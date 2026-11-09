// Regras da coleção `medidas`. Roda no emulador do Firestore:
//   npx firebase emulators:exec --only firestore --project demo-nostrova "npx vitest run --no-file-parallelism firebase/tests"
// (sem paralelismo entre arquivos: todos usam o mesmo emulador e o beforeEach limpa o banco)
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

const medidas = (extra = {}) => ({ userId: 'ana', data: '2026-11-09', cinturaCm: 82.5, pescocoCm: 33, ...extra });

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
    await db.doc('users/adm').set({ aprovado: true, ativo: true, role: 'admin' });
    await db.doc('users/novo').set({ aprovado: false, ativo: true, role: 'atleta' });
  });
});

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('medidas', () => {
  it('o dono grava medidas parciais', async () => {
    await assertSucceeds(como('ana').doc('medidas/ana_20261109').set(medidas()));
  });

  it('aceita as 8 medidas', async () => {
    await assertSucceeds(
      como('ana').doc('medidas/ana_20261109').set(medidas({ toraxCm: 100, abdomenCm: 90, quadrilCm: 98, bracoCm: 32, coxaCm: 56, panturrilhaCm: 38 })),
    );
  });

  it('recusa valor fora de 10 a 250 cm ou que não seja número', async () => {
    await assertFails(como('ana').doc('medidas/ana_20261109').set(medidas({ cinturaCm: 9 })));
    await assertFails(como('ana').doc('medidas/ana_20261109').set(medidas({ cinturaCm: 251 })));
    await assertFails(como('ana').doc('medidas/ana_20261109').set(medidas({ cinturaCm: '82' })));
  });

  it('recusa registro sem nenhuma medida, campo desconhecido e data inválida', async () => {
    await assertFails(como('ana').doc('medidas/ana_20261109').set({ userId: 'ana', data: '2026-11-09' }));
    await assertFails(como('ana').doc('medidas/ana_20261109').set(medidas({ biceps: 30 })));
    await assertFails(como('ana').doc('medidas/ana_20261109').set(medidas({ data: '09/11/2026' })));
  });

  it('não grava em nome de outro usuário', async () => {
    await assertFails(como('ana').doc('medidas/beto_20261109').set(medidas({ userId: 'beto' })));
  });

  it('só o dono lê e exclui: nem outro usuário nem o admin', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('medidas/ana_20261109').set(medidas()));
    await assertSucceeds(como('ana').doc('medidas/ana_20261109').get());
    await assertFails(como('beto').doc('medidas/ana_20261109').get());
    await assertFails(como('adm').doc('medidas/ana_20261109').get());
    await assertFails(como('beto').doc('medidas/ana_20261109').delete());
    await assertSucceeds(como('ana').doc('medidas/ana_20261109').delete());
  });

  it('usuário não aprovado não acessa', async () => {
    await assertFails(como('novo').doc('medidas/novo_20261109').set(medidas({ userId: 'novo' })));
  });
});
