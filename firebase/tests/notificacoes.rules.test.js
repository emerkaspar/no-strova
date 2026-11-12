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

describe('intervalsConexoes (estado da conexão com o intervals.icu)', () => {
  it('nem o dono nem o admin leem ou escrevem pelo cliente: só o Admin SDK', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('intervalsConexoes/ana').set({ status: 'ativa' });
    });
    await assertFails(como('ana').doc('intervalsConexoes/ana').get());
    await assertFails(como('adm').doc('intervalsConexoes/ana').get());
    await assertFails(como('ana').doc('intervalsConexoes/ana').set({ status: 'ativa' }));
    await assertFails(como('ana').doc('intervalsConexoes/ana').update({ status: 'chaveInvalida' }));
    await assertFails(como('ana').doc('intervalsConexoes/ana').delete());
    await assertFails(como('ana').collection('intervalsConexoes').get());
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

  it('aceita o tipo de aviso da chave do intervals.icu', async () => {
    await assertSucceeds(como('ana').doc('preferencias/ana').set(prefs({ tipos: { intervalsChaveInvalida: false } })));
  });

  it('segue aceitando preferências sem o campo de notificações', async () => {
    await assertSucceeds(como('ana').doc('preferencias/ana').set({ userId: 'ana', calibracaoAtiva: true }));
  });

  it('aceita a escolha de push por tipo e recusa tipo desconhecido ou valor não booleano no push', async () => {
    await assertSucceeds(como('ana').doc('preferencias/ana').set(prefs({ tiposPush: { treinoHoje: true, pesar: false } })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ tiposPush: { inventado: true } })));
    await assertFails(como('ana').doc('preferencias/ana').set(prefs({ tiposPush: { pesar: 'sim' } })));
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

describe('semana montada pela IA (semanaIa e planoIaAutomatico)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('semanaIa/ana').set({ userId: 'ana', inicio: '2026-11-16', status: 'gerada' });
    });
  });

  it('o dono lê a semana; outro usuário não; ninguém escreve', async () => {
    await assertSucceeds(como('ana').doc('semanaIa/ana').get());
    await assertFails(como('beto').doc('semanaIa/ana').get());
    await assertFails(como('ana').doc('semanaIa/ana').set({ userId: 'ana', status: 'gerada' }));
  });

  it('o dono liga o planoIaAutomatico (só booleano)', async () => {
    await assertSucceeds(como('ana').doc('preferencias/ana').set({ userId: 'ana', planoIaAutomatico: true }));
    await assertFails(como('ana').doc('preferencias/ana').set({ userId: 'ana', planoIaAutomatico: 'sim' }));
  });

  it('o tipo semanaIa é aceito nas preferências de notificação', async () => {
    await assertSucceeds(como('ana').doc('preferencias/ana').set({ userId: 'ana', notificacoes: { tipos: { semanaIa: false }, tiposPush: { semanaIa: true } } }));
  });

  it('o cliente edita um treino criado pela IA mantendo a marca geradoPorIa', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('treinosPlanejados/t1').set({ userId: 'ana', data: '2026-11-16', esporte: 'ciclismo', duracaoMin: 60, zona: 'Z2', status: 'planejado', geradoPorIa: true });
    });
    await assertSucceeds(como('ana').doc('treinosPlanejados/t1').update({ data: '2026-11-17' }));
  });
});
