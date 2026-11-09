// Regras da coleção `notificacoes` e das preferências de notificação (dentro de `preferencias`). Roda no emulador:
//   npx firebase emulators:exec --only firestore --project demo-nostrova "npx vitest run --no-file-parallelism firebase/tests"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

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
    await db.doc('notificacoes/ana_pesar_nunca').set({ userId: 'ana', tipo: 'pesar', lida: false });
  });
});

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('notificacoes', () => {
  it('o dono lê a própria notificação', async () => {
    await assertSucceeds(como('ana').doc('notificacoes/ana_pesar_nunca').get());
  });

  it('outro usuário e o admin não leem notificação alheia', async () => {
    await assertFails(como('beto').doc('notificacoes/ana_pesar_nunca').get());
    await assertFails(como('adm').doc('notificacoes/ana_pesar_nunca').get());
  });

  it('quem não foi aprovado não lê', async () => {
    await assertFails(como('novo').collection('notificacoes').where('userId', '==', 'novo').get());
  });

  it('o dono lista as próprias notificações', async () => {
    await assertSucceeds(como('ana').collection('notificacoes').where('userId', '==', 'ana').get());
  });

  it('ninguém escreve pelo cliente (nem o dono marcando como lida)', async () => {
    await assertFails(como('ana').doc('notificacoes/ana_pesar_nunca').update({ lida: true }));
    await assertFails(como('ana').doc('notificacoes/ana_nova').set({ userId: 'ana', tipo: 'pesar', lida: false }));
    await assertFails(como('ana').doc('notificacoes/ana_pesar_nunca').delete());
    await assertFails(como('adm').doc('notificacoes/ana_pesar_nunca').update({ lida: true }));
  });
});

describe('preferências de notificação', () => {
  const prefs = (notificacoes) => ({ userId: 'ana', notificacoes });

  it('aceita tipos ligados/desligados e intervalos dentro dos limites', async () => {
    await assertSucceeds(
      como('ana')
        .doc('preferencias/ana')
        .set(prefs({ tipos: { pesar: false, medidas: true }, intervaloPesoDias: 7, intervaloMedidasDias: 30, intervaloLthrSemanas: 8 })),
    );
  });

  it('segue aceitando preferências sem o campo de notificações', async () => {
    await assertSucceeds(como('ana').doc('preferencias/ana').set({ userId: 'ana', calibracaoAtiva: true }));
  });

  it('recusa intervalo fora dos limites ou não inteiro', async () => {
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ intervaloPesoDias: 0 })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ intervaloMedidasDias: 3 })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ intervaloLthrSemanas: 99 })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ intervaloPesoDias: 7.5 })));
  });

  it('recusa tipo desconhecido, valor não booleano e campo extra', async () => {
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ tipos: { inventado: true } })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ tipos: { pesar: 'sim' } })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ extra: 1 })));
  });
});
