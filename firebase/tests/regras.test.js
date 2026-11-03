import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
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

describe('Firestore: treinosPlanejados', () => {
  const treino = { userId: 'aprovado', data: '2026-11-10', esporte: 'ciclismo', duracaoMin: 60, zona: 'Z2', status: 'planejado', estresseEstimado: 62.5, estresseManual: null, observacoes: 'Serra', atividadeId: null };
  const ref = (db, id = 't1') => doc(db, `treinosPlanejados/${id}`);

  it('o dono cria, lê, move de dia, vincula e apaga', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(ref(db), treino));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(updateDoc(ref(db), { data: '2026-11-12' }));
    await assertSucceeds(updateDoc(ref(db), { status: 'realizado', atividadeId: 'abc12345' }));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  it('rejeita valores implausíveis', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    for (const ruim of [
      { esporte: 'natacao' }, { zona: 'Z9' }, { status: 'feito' }, { duracaoMin: 3 }, { duracaoMin: 2000 }, { duracaoMin: 45.5 },
      { data: 'amanhã' }, { estresseManual: 9999 }, { estresseManual: 0 }, { estresseEstimado: -1 }, { observacoes: 'x'.repeat(501) },
      { atividadeId: 'x'.repeat(41) },
    ]) {
      await assertFails(setDoc(ref(db, 'ruim'), { ...treino, ...ruim }));
    }
  });

  it('rejeita campos extras, campos faltando e userId de outro', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertFails(setDoc(ref(db, 'x1'), { ...treino, extra: 1 }));
    const { zona, ...semZona } = treino;
    await assertFails(setDoc(ref(db, 'x2'), semZona));
    await assertFails(setDoc(ref(db, 'x3'), { ...treino, userId: 'outro' }));
  });

  it('não troca o dono nem deixa o treino inválido numa edição', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(ref(db), treino));
    await assertFails(updateDoc(ref(db), { userId: 'outro' }));
    await assertFails(updateDoc(ref(db), { duracaoMin: 1 }));
    await assertFails(updateDoc(ref(db), { data: '10/11/2026' }));
  });

  it('outro usuário, admin e pendente não leem nem gravam', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(ref(ctx.firestore()), treino);
    });
    await assertFails(getDoc(ref(env.authenticatedContext('outro').firestore())));
    await assertFails(getDoc(ref(env.authenticatedContext('admin').firestore())));
    await assertFails(updateDoc(ref(env.authenticatedContext('outro').firestore()), { data: '2026-11-11' }));
    await assertFails(deleteDoc(ref(env.authenticatedContext('outro').firestore())));
    await assertFails(setDoc(ref(env.authenticatedContext('pendente').firestore(), 'p'), { ...treino, userId: 'pendente' }));
  });
});

describe('Firestore: treino planejado estruturado e modelos de treino', () => {
  const passos = [
    { tipo: 'bloco', papel: 'aquecimento', duracaoS: 600, zona: 'Z2' },
    { tipo: 'serie', repeticoes: 5, esforco: { duracaoS: 180, zona: 'Z5' }, recuperacao: { duracaoS: 180, zona: 'Z1' } },
  ];
  const treino = { userId: 'aprovado', data: '2026-11-10', esporte: 'ciclismo', duracaoMin: 62, zona: 'Z5', status: 'planejado', estresseEstimado: 88.4, estresseManual: null, observacoes: '', atividadeId: null, nomeTreino: '5 × 3 min no VO2', modeloId: 'vo2-5x3-ciclismo', passos };
  const modelo = { userId: 'aprovado', nome: 'Meu intervalado', esporte: 'corrida', foco: 'sprint', nivel: 'intermediario', descricao: 'Forte.', passos };

  it('treino planejado com passos, nome e modelo de origem é aceito; o limite de passos e de nome vale', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(doc(db, 'treinosPlanejados/e1'), treino));
    await assertSucceeds(setDoc(doc(db, 'treinosPlanejados/e2'), { ...treino, modeloId: null }));
    for (const ruim of [{ passos: [] }, { passos: 'x' }, { passos: Array.from({ length: 31 }, () => passos[0]) }, { nomeTreino: '' }, { nomeTreino: 'x'.repeat(61) }, { modeloId: 'x'.repeat(81) }, { modeloId: 5 }, { extra: 1 }]) {
      await assertFails(setDoc(doc(db, 'treinosPlanejados/ruim'), { ...treino, ...ruim }));
    }
  });

  it('modelos próprios: o dono cria, lê, edita e apaga', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    const ref = doc(db, 'treinosModelos/m1');
    await assertSucceeds(setDoc(ref, modelo));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { nome: 'Meu intervalado 2' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('modelos próprios: rejeita nome, esporte, foco, nível, descrição, passos e campos inválidos', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    for (const ruim of [{ nome: 'ab' }, { nome: 'x'.repeat(61) }, { esporte: 'natacao' }, { foco: 'x' }, { nivel: 'x' }, { descricao: 'x'.repeat(501) }, { passos: [] }, { passos: 'x' }, { userId: 'outro' }, { extra: 1 }]) {
      await assertFails(setDoc(doc(db, 'treinosModelos/ruim'), { ...modelo, ...ruim }));
    }
    const { nivel, ...semNivel } = modelo;
    await assertFails(setDoc(doc(db, 'treinosModelos/ruim'), semNivel));
  });

  it('modelos próprios: outro usuário, admin, pendente e bloqueado não leem nem gravam', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'treinosModelos/m1'), modelo);
    });
    for (const uid of ['outro', 'admin']) {
      await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), 'treinosModelos/m1')));
    }
    await assertFails(updateDoc(doc(env.authenticatedContext('outro').firestore(), 'treinosModelos/m1'), { nome: 'Roubado' }));
    await assertFails(deleteDoc(doc(env.authenticatedContext('outro').firestore(), 'treinosModelos/m1')));
    for (const uid of ['pendente', 'bloqueado']) {
      await assertFails(setDoc(doc(env.authenticatedContext(uid).firestore(), 'treinosModelos/x'), { ...modelo, userId: uid }));
    }
  });

  it('preferências: o nível dos treinos aceita só os três níveis e convive com a calibração', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    const ref = doc(db, 'preferencias/aprovado');
    await assertSucceeds(setDoc(ref, { userId: 'aprovado', nivelTreinos: 'avancado' }));
    await assertSucceeds(setDoc(ref, { userId: 'aprovado', calibracaoAtiva: false, nivelTreinos: 'iniciante' }));
    await assertFails(setDoc(ref, { userId: 'aprovado', nivelTreinos: 'lenda' }));
    await assertFails(setDoc(ref, { userId: 'aprovado', calibracaoAtiva: 'sim' }));
  });
});

describe('Firestore: o app grava exatamente como as regras esperam', () => {
  it('criar treino (com serverTimestamp) e editar com o conjunto completo de campos', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    const r = doc(db, 'treinosPlanejados/app1');
    await assertSucceeds(
      setDoc(r, {
        userId: 'aprovado', esporte: 'ciclismo', data: '2026-11-10', duracaoMin: 60, zona: 'Z2', estresseManual: null,
        observacoes: '', estresseEstimado: null, status: 'planejado', atividadeId: null, criadoEm: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(r, { esporte: 'corrida', data: '2026-11-11', duracaoMin: 90, zona: 'Z4', estresseManual: 120.5, observacoes: 'Intervalado', estresseEstimado: 88.2 }),
    );
    await assertSucceeds(updateDoc(r, { status: 'pulado' }));
    await assertSucceeds(updateDoc(r, { status: 'planejado', atividadeId: null }));
  });

  it('definir meta: o lote desativa a anterior e cria a nova com serverTimestamp', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'metasForma/antiga'), { userId: 'aprovado', formaAlvo: 5, dataAlvo: '2026-11-10', ativa: true });
    });
    const db = env.authenticatedContext('aprovado').firestore();
    const lote = writeBatch(db);
    lote.update(doc(db, 'metasForma/antiga'), { ativa: false });
    lote.set(doc(db, 'metasForma/nova'), { userId: 'aprovado', formaAlvo: 10.5, dataAlvo: '2026-11-20', ativa: true, criadoEm: serverTimestamp() });
    await assertSucceeds(lote.commit());
  });

  it('um lote com meta inválida falha por inteiro (nada é gravado)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'metasForma/antiga2'), { userId: 'aprovado', formaAlvo: 5, dataAlvo: '2026-11-10', ativa: true });
    });
    const db = env.authenticatedContext('aprovado').firestore();
    const lote = writeBatch(db);
    lote.update(doc(db, 'metasForma/antiga2'), { ativa: false });
    lote.set(doc(db, 'metasForma/ruim'), { userId: 'aprovado', formaAlvo: 999, dataAlvo: '2026-11-20', ativa: true });
    await assertFails(lote.commit());
    let ativaDepois;
    await env.withSecurityRulesDisabled(async (ctx) => {
      ativaDepois = (await getDoc(doc(ctx.firestore(), 'metasForma/antiga2'))).data().ativa;
    });
    expect(ativaDepois).toBe(true);
  });
});

describe('Firestore: calibracoes e preferencias', () => {
  const calibracao = { userId: 'aprovado', chaves: { ciclismo_Z2: { n: 3, mediana: 60, amostras: [] } } };

  it('calibracoes: o dono lê; ninguém escreve pelo cliente; outro usuário e admin não leem', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'calibracoes/aprovado'), calibracao);
    });
    const dono = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(getDoc(doc(dono, 'calibracoes/aprovado')));
    await assertFails(setDoc(doc(dono, 'calibracoes/aprovado'), { ...calibracao, chaves: {} }));
    await assertFails(deleteDoc(doc(dono, 'calibracoes/aprovado')));
    await assertFails(getDoc(doc(env.authenticatedContext('outro').firestore(), 'calibracoes/aprovado')));
    await assertFails(getDoc(doc(env.authenticatedContext('admin').firestore(), 'calibracoes/aprovado')));
  });

  it('preferencias: o dono cria e altera o próprio documento, só com o campo booleano', async () => {
    const dono = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(doc(dono, 'preferencias/aprovado'), { userId: 'aprovado', calibracaoAtiva: false }));
    await assertSucceeds(setDoc(doc(dono, 'preferencias/aprovado'), { userId: 'aprovado', calibracaoAtiva: true }));
    await assertSucceeds(getDoc(doc(dono, 'preferencias/aprovado')));
    await assertFails(setDoc(doc(dono, 'preferencias/aprovado'), { userId: 'aprovado', calibracaoAtiva: 'sim' }));
    await assertFails(setDoc(doc(dono, 'preferencias/aprovado'), { userId: 'aprovado', calibracaoAtiva: true, extra: 1 }));
    await assertFails(setDoc(doc(dono, 'preferencias/aprovado'), { userId: 'outro', calibracaoAtiva: true }));
    await assertFails(deleteDoc(doc(dono, 'preferencias/aprovado')));
  });

  it('preferencias: ninguém mexe no documento de outro; pendente e bloqueado não gravam', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('outro').firestore(), 'preferencias/aprovado'), { userId: 'outro', calibracaoAtiva: true }));
    await assertFails(getDoc(doc(env.authenticatedContext('outro').firestore(), 'preferencias/aprovado')));
    for (const uid of ['pendente', 'bloqueado']) {
      await assertFails(setDoc(doc(env.authenticatedContext(uid).firestore(), `preferencias/${uid}`), { userId: uid, calibracaoAtiva: true }));
    }
  });
});

describe('Firestore: metasForma', () => {
  const meta = { userId: 'aprovado', formaAlvo: 10.5, dataAlvo: '2026-11-20', ativa: true };
  const ref = (db, id = 'm1') => doc(db, `metasForma/${id}`);

  it('o dono cria, desativa e apaga a meta', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(ref(db), meta));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(updateDoc(ref(db), { ativa: false }));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  it('rejeita Forma fora de −60 a 60, data inválida, tipo errado, campos extras e dono trocado', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    for (const ruim of [{ formaAlvo: 99 }, { formaAlvo: -99 }, { formaAlvo: '10' }, { dataAlvo: 'logo' }, { ativa: 'sim' }, { extra: 1 }, { userId: 'outro' }]) {
      await assertFails(setDoc(ref(db, 'ruim'), { ...meta, ...ruim }));
    }
  });

  it('outro usuário não lê nem altera', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(ref(ctx.firestore()), meta);
    });
    await assertFails(getDoc(ref(env.authenticatedContext('outro').firestore())));
    await assertFails(updateDoc(ref(env.authenticatedContext('outro').firestore()), { ativa: false }));
  });
});

describe('Firestore: metasCondicionamento', () => {
  const meta = { userId: 'aprovado', condicionamentoAlvo: 45.5, condicionamentoInicial: 30.2, dataAlvo: '2026-12-20', ativa: true };
  const ref = (db, id = 'mc1') => doc(db, `metasCondicionamento/${id}`);

  it('o dono cria, desativa e apaga a meta (com ou sem o valor inicial)', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    await assertSucceeds(setDoc(ref(db), meta));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(updateDoc(ref(db), { ativa: false }));
    const { condicionamentoInicial, ...semInicial } = meta;
    await assertSucceeds(setDoc(ref(db, 'sem-inicial'), semInicial));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  it('rejeita alvo fora de 1 a 250, tipos errados, data inválida, campos extras e dono trocado', async () => {
    const db = env.authenticatedContext('aprovado').firestore();
    for (const ruim of [{ condicionamentoAlvo: 0 }, { condicionamentoAlvo: 300 }, { condicionamentoAlvo: '40' }, { condicionamentoInicial: -1 }, { condicionamentoInicial: '30' }, { dataAlvo: 'logo' }, { ativa: 'sim' }, { extra: 1 }, { userId: 'outro' }]) {
      await assertFails(setDoc(ref(db, 'ruim'), { ...meta, ...ruim }));
    }
  });

  it('outro usuário, pendente e bloqueado não leem nem gravam', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(ref(ctx.firestore()), meta);
    });
    await assertFails(getDoc(ref(env.authenticatedContext('outro').firestore())));
    await assertFails(updateDoc(ref(env.authenticatedContext('outro').firestore()), { ativa: false }));
    for (const uid of ['pendente', 'bloqueado']) {
      await assertFails(setDoc(ref(env.authenticatedContext(uid).firestore(), 'x'), { ...meta, userId: uid }));
    }
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
