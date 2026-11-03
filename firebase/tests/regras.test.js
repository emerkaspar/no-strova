import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

// Requer os emuladores de Firestore e Storage: `npm run test:rules`.
const PROJECT_ID = 'demo-no-strova';
const dir = resolve(import.meta.dirname, '..');
const MB = 1024 * 1024;

let env;

const perfilBase = { nome: 'Fulano', email: 'f@x.com', role: 'atleta', aprovado: true, ativo: true, dataNascimento: null };

async function semear() {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/aprovado'), perfilBase);
    await setDoc(doc(db, 'users/pendente'), { ...perfilBase, aprovado: false });
    await setDoc(doc(db, 'users/bloqueado'), { ...perfilBase, ativo: false });
    await setDoc(doc(db, 'users/admin'), { ...perfilBase, role: 'admin' });
    await setDoc(doc(db, 'users/outro'), perfilBase);
    await setDoc(doc(db, 'pesagens/p1'), { userId: 'aprovado', data: '2026-11-01', pesoKg: 70 });
    await setDoc(doc(db, 'atividades/a1'), { userId: 'aprovado', hrss: 80 });
    await setDoc(doc(db, 'atividades/a1/series/fc'), { pontos: [1, 2] });
    await setDoc(doc(db, 'iaUso/aprovado_20261103'), { userId: 'aprovado', chamadas: 1 });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(dir, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(resolve(dir, 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(semear);

describe('Firestore: users', () => {
  it('o dono lê o próprio perfil, mesmo pendente ou bloqueado', async () => {
    for (const uid of ['aprovado', 'pendente', 'bloqueado']) {
      await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), `users/${uid}`)));
    }
  });

  it('usuário comum não lê perfil de outro; admin lê', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('aprovado').firestore(), 'users/outro')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('admin').firestore(), 'users/outro')));
  });

  it('anônimo não lê nada', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/aprovado')));
  });

  it('o dono edita só nome e dataNascimento', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/aprovado'), { nome: 'Novo Nome', dataNascimento: '1990-01-31' }));
    await assertFails(updateDoc(doc(db, 'users/aprovado'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'users/pendente'), { aprovado: true }));
    await assertFails(updateDoc(doc(db, 'users/aprovado'), { nome: 'A' }));
    await assertFails(updateDoc(doc(db, 'users/aprovado'), { dataNascimento: 'ontem' }));
  });

  it('pendente e bloqueado não editam o perfil; ninguém cria ou apaga', async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext('pendente').firestore(), 'users/pendente'), { nome: 'Novo' }));
    await assertFails(updateDoc(doc(env.authenticatedContext('bloqueado').firestore(), 'users/bloqueado'), { nome: 'Novo' }));
    await assertFails(setDoc(doc(env.authenticatedContext('novo').firestore(), 'users/novo'), perfilBase));
    await assertFails(deleteDoc(doc(env.authenticatedContext('aprovado').firestore(), 'users/aprovado')));
  });
});

describe('Firestore: configsAtleta', () => {
  const config = {
    userId: 'aprovado',
    vigenteDesde: '2026-01-01',
    fcMax: 190,
    fcRepouso: 50,
    lthr: 170,
    sexo: 'masculino',
    pesoKg: 72.5,
    alturaCm: 178,
  };
  const docConfig = (db, id = 'aprovado_20260101') => doc(db, `configsAtleta/${id}`);

  it('o dono grava uma configuração válida, lê, edita e apaga', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(docConfig(db), config));
    await assertSucceeds(getDoc(docConfig(db)));
    await assertSucceeds(setDoc(docConfig(db), { ...config, fcMax: 192 }));
    await assertSucceeds(deleteDoc(docConfig(db)));
  });

  it('rejeita valores implausíveis ou fora da ordem repouso < LTHR <= máxima', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    for (const ruim of [
      { fcMax: 400 },
      { fcMax: 90 },
      { fcRepouso: 10 },
      { fcRepouso: 190 },
      { lthr: 40 },
      { lthr: 195 },
      { sexo: 'x' },
      { pesoKg: 5 },
      { alturaCm: 400 },
      { fcMax: 190.5 },
      { vigenteDesde: 'ontem' },
    ]) {
      await assertFails(setDoc(docConfig(db, 'ruim'), { ...config, ...ruim }));
    }
  });

  it('rejeita campos extras, campos faltando e userId de outro', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertFails(setDoc(docConfig(db, 'x1'), { ...config, extra: 1 }));
    const { lthr, ...semLthr } = config;
    await assertFails(setDoc(docConfig(db, 'x2'), semLthr));
    await assertFails(setDoc(docConfig(db, 'x3'), { ...config, userId: 'outro' }));
  });

  it('outro usuário e usuário pendente não leem nem gravam', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(docConfig(ctx.firestore()), config);
    });
    await assertFails(getDoc(docConfig(env.authenticatedContext('outro').firestore())));
    await assertFails(getDoc(docConfig(env.authenticatedContext('admin').firestore())));
    await assertFails(
      setDoc(docConfig(env.authenticatedContext('pendente').firestore(), 'p'), { ...config, userId: 'pendente' }),
    );
  });
});

describe('Firestore: dados de negócio', () => {
  it('o dono aprovado lê e escreve os próprios dados', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(getDoc(doc(db, 'pesagens/p1')));
    await assertSucceeds(setDoc(doc(db, 'pesagens/p2'), { userId: 'aprovado', data: '2026-11-02', pesoKg: 69.5 }));
    await assertSucceeds(deleteDoc(doc(db, 'pesagens/p1')));
  });

  it('não grava registro em nome de outro usuário nem troca o dono', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertFails(setDoc(doc(db, 'pesagens/p3'), { userId: 'outro', data: '2026-11-02', pesoKg: 70 }));
    await assertFails(updateDoc(doc(db, 'pesagens/p1'), { userId: 'outro' }));
  });

  it('outro usuário, inclusive admin, não lê pesagens alheias', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('outro').firestore(), 'pesagens/p1')));
    await assertFails(getDoc(doc(env.authenticatedContext('admin').firestore(), 'pesagens/p1')));
  });

  it('pendente e bloqueado não acessam dados de negócio', async () => {
    for (const uid of ['pendente', 'bloqueado']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(setDoc(doc(db, 'pesagens/x'), { userId: uid, data: '2026-11-02', pesoKg: 70 }));
    }
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pesagens/dp'), { userId: 'pendente', pesoKg: 80 });
    });
    await assertFails(getDoc(doc(env.authenticatedContext('pendente').firestore(), 'pesagens/dp')));
  });

  it('atividades e série: dono lê, ninguém escreve pelo cliente', async () => {
    const dono = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(getDoc(doc(dono, 'atividades/a1')));
    await assertSucceeds(getDoc(doc(dono, 'atividades/a1/series/fc')));
    await assertFails(updateDoc(doc(dono, 'atividades/a1'), { hrss: 999 }));
    await assertFails(setDoc(doc(dono, 'atividades/a2'), { userId: 'aprovado', hrss: 999 }));
    const outro = env.authenticatedContext('outro').firestore();
    await assertFails(getDoc(doc(outro, 'atividades/a1')));
    await assertFails(getDoc(doc(outro, 'atividades/a1/series/fc')));
  });

  it('estresseDiario: dono lê, ninguém escreve pelo cliente', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'estresseDiario/aprovado_20261101'), { userId: 'aprovado', data: '2026-11-01', estresse: 80 });
    });
    const dono = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(getDoc(doc(dono, 'estresseDiario/aprovado_20261101')));
    await assertFails(setDoc(doc(dono, 'estresseDiario/aprovado_20261101'), { userId: 'aprovado', data: '2026-11-01', estresse: 999 }));
    await assertFails(deleteDoc(doc(dono, 'estresseDiario/aprovado_20261101')));
    await assertFails(getDoc(doc(env.authenticatedContext('outro').firestore(), 'estresseDiario/aprovado_20261101')));
    await assertFails(getDoc(doc(env.authenticatedContext('admin').firestore(), 'estresseDiario/aprovado_20261101')));
  });

  it('iaUso e vinculosTreinador não têm acesso direto', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertFails(getDoc(doc(db, 'iaUso/aprovado_20261103')));
    await assertFails(setDoc(doc(db, 'iaUso/aprovado_20261103'), { userId: 'aprovado', chamadas: 0 }));
    await assertFails(getDoc(doc(db, 'vinculosTreinador/v1')));
  });
});

describe('Storage: upload de atividade', () => {
  const bytes = (n) => new Uint8Array(n);
  // clearStorage não remove objetos entre testes no emulador: cada teste usa um id novo.
  let sequencia = 0;
  const caminho = (uid, nome = 'original.fit', id = `atv${Date.now()}${sequencia++}`) =>
    `atividades/${uid}/${id}/${nome}`;
  const storageDe = (uid) => env.authenticatedContext(uid).storage();

  it('o dono aprovado envia .fit, .gpx e .tcx', async () => {
    for (const ext of ['fit', 'gpx', 'tcx']) {
      await assertSucceeds(uploadBytes(ref(storageDe('aprovado'), caminho('aprovado', `original.${ext}`, `atv-${ext}-123`)), bytes(1024)));
    }
  });

  it('aceita até 15 MB e rejeita acima disso ou vazio', async () => {
    await assertSucceeds(uploadBytes(ref(storageDe('aprovado'), caminho('aprovado')), bytes(15 * MB)));
    await assertFails(uploadBytes(ref(storageDe('aprovado'), caminho('aprovado', 'original.gpx')), bytes(15 * MB + 1)));
    await assertFails(uploadBytes(ref(storageDe('aprovado'), caminho('aprovado', 'original.tcx')), bytes(0)));
  });

  it('rejeita extensão ou nome fora do padrão', async () => {
    for (const nome of ['original.exe', 'original.FIT', 'outro.fit', 'original.fit.exe', 'original.zip']) {
      await assertFails(uploadBytes(ref(storageDe('aprovado'), caminho('aprovado', nome)), bytes(1024)));
    }
  });

  it('rejeita id de atividade fora do padrão', async () => {
    await assertFails(uploadBytes(ref(storageDe('aprovado'), caminho('aprovado', 'original.fit', 'curto')), bytes(1024)));
  });

  it('rejeita enviar para a pasta de outro usuário e anônimo', async () => {
    await assertFails(uploadBytes(ref(storageDe('aprovado'), caminho('outro')), bytes(1024)));
    await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), caminho('aprovado')), bytes(1024)));
  });

  it('pendente e bloqueado não enviam', async () => {
    await assertFails(uploadBytes(ref(storageDe('pendente'), caminho('pendente')), bytes(1024)));
    await assertFails(uploadBytes(ref(storageDe('bloqueado'), caminho('bloqueado')), bytes(1024)));
  });

  it('não sobrescreve, não lê e não apaga pelo cliente', async () => {
    const arquivo = ref(storageDe('aprovado'), caminho('aprovado'));
    await assertSucceeds(uploadBytes(arquivo, bytes(1024)));
    await assertFails(uploadBytes(arquivo, bytes(2048)));
    await assertFails(getBytes(arquivo));
    await assertFails(deleteObject(arquivo));
  });

  it('nega qualquer outro caminho do bucket', async () => {
    await assertFails(uploadBytes(ref(storageDe('aprovado'), 'qualquer/coisa.txt'), bytes(10)));
  });
});
