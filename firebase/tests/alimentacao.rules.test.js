// Regras de `perfilAlimentar`, `alimentacaoIa` e `receitasFavoritas`. Roda no emulador do Firestore:
//   npx firebase emulators:exec --only firestore --project demo-nostrova "npx vitest run --no-file-parallelism firebase/tests"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

const perfil = (extra = {}) => ({ userId: 'ana', objetivo: 'manter', usarMetaDePeso: true, restricoes: ['amendoim'], contexto: 'Trabalho em escritório.', refeicoesPorDia: 5, ...extra });
const favorita = (extra = {}) => ({
  userId: 'ana',
  chave: 'levar_torrada',
  item: { bloco: 'levar', nome: 'Torrada com queijo', tipo: 'salgado', porQue: 'Energia.', tempoMin: 5, ingredientes: ['pão', 'queijo'], preparo: ['Torre o pão.'], equipamento: ['torradeira'], vespera: false },
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
    await db.doc('users/adm').set({ aprovado: true, ativo: true, role: 'admin' });
  });
});

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('perfilAlimentar', () => {
  it('o dono grava e lê o próprio perfil', async () => {
    await assertSucceeds(como('ana').doc('perfilAlimentar/ana').set(perfil()));
    await assertSucceeds(como('ana').doc('perfilAlimentar/ana').get());
  });

  it('recusa objetivo, refeições, restrições e campo inválidos', async () => {
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ objetivo: 'secar' })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ refeicoesPorDia: 9 })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ restricoes: Array.from({ length: 21 }, (_, i) => `r${i}`) })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ contexto: 'x'.repeat(601) })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ extra: 1 })));
  });

  it('aceita a escolha de refeições e recusa lista vazia, valor inválido ou o bloco antigo', async () => {
    await assertSucceeds(como('ana').doc('perfilAlimentar/ana').set(perfil({ refeicoes: ['levar', 'jantar'] })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ refeicoes: [] })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ refeicoes: ['lanchonete'] })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ refeicoes: 'levar' })));
    await assertFails(como('ana').doc('perfilAlimentar/ana').set(perfil({ refeicoes: ['casa'] })));
  });

  it('não grava nem lê o perfil de outro usuário, nem o admin', async () => {
    await assertFails(como('ana').doc('perfilAlimentar/beto').set(perfil({ userId: 'beto' })));
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('perfilAlimentar/ana').set(perfil()));
    await assertFails(como('beto').doc('perfilAlimentar/ana').get());
    await assertFails(como('adm').doc('perfilAlimentar/ana').get());
  });
});

describe('alimentacaoIa', () => {
  it('o dono lê, ninguém grava pelo cliente', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('alimentacaoIa/ana').set({ userId: 'ana', dia: {} }));
    await assertSucceeds(como('ana').doc('alimentacaoIa/ana').get());
    await assertFails(como('beto').doc('alimentacaoIa/ana').get());
    await assertFails(como('ana').doc('alimentacaoIa/ana').set({ userId: 'ana', dia: {} }));
  });
});

describe('receitasFavoritas', () => {
  it('o dono cria com o id certo e lê', async () => {
    await assertSucceeds(como('ana').doc('receitasFavoritas/ana_levar_torrada').set(favorita()));
    await assertSucceeds(como('ana').doc('receitasFavoritas/ana_levar_torrada').get());
  });

  it('aceita as refeições novas e o bloco antigo', async () => {
    await assertSucceeds(como('ana').doc('receitasFavoritas/ana_jantar_omelete').set(favorita({ chave: 'jantar_omelete', item: { ...favorita().item, bloco: 'jantar' } })));
    await assertSucceeds(como('ana').doc('receitasFavoritas/ana_casa_bolo').set(favorita({ chave: 'casa_bolo', item: { ...favorita().item, bloco: 'casa' } })));
  });

  it('recusa id que não bate com a chave, item inválido e outro dono', async () => {
    await assertFails(como('ana').doc('receitasFavoritas/qualquer').set(favorita()));
    await assertFails(como('ana').doc('receitasFavoritas/ana_levar_torrada').set(favorita({ item: { ...favorita().item, tipo: 'azedo' } })));
    await assertFails(como('ana').doc('receitasFavoritas/beto_levar_torrada').set(favorita({ userId: 'beto' })));
  });

  it('só o dono apaga e não edita', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('receitasFavoritas/ana_levar_torrada').set(favorita()));
    await assertFails(como('ana').doc('receitasFavoritas/ana_levar_torrada').update({ chave: 'levar_outra' }));
    await assertFails(como('beto').doc('receitasFavoritas/ana_levar_torrada').delete());
    await assertSucceeds(como('ana').doc('receitasFavoritas/ana_levar_torrada').delete());
  });
});
