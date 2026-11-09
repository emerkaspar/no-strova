// Cria `intervalsConexoes/{uid}` para quem já tinha conectado o intervals.icu antes de a sincronização automática existir.
// Sem esse documento, a rotina diária não enxerga o usuário (ela parte de `intervalsConexoes`, não varre as chaves guardadas).
// É opcional: o documento também é criado sozinho quando o usuário abre o app e a conexão é consultada. Rodar o script só
// adianta isso para todos de uma vez. É seguro repetir: quem já tem o documento é pulado.
//
// Uso (com credenciais do Google instaladas via `gcloud auth application-default login`):
//   GCLOUD_PROJECT=<id-do-projeto> node scripts/preencher-intervals.mjs            (grava)
//   GCLOUD_PROJECT=<id-do-projeto> node scripts/preencher-intervals.mjs --plano    (só mostra o que faria)
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.GCLOUD_PROJECT) {
  console.error('Uso: GCLOUD_PROJECT=<projeto> node scripts/preencher-intervals.mjs [--plano]');
  process.exit(1);
}
const soPlano = process.argv.includes('--plano');

if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

const usuarios = await db.collection('users').select().get();
let comChave = 0;
let criados = 0;
let jaTinham = 0;

for (const usuario of usuarios.docs) {
  const uid = usuario.id;
  const [chave, conexao] = await Promise.all([db.doc(`users/${uid}/segredos/intervals`).get(), db.doc(`intervalsConexoes/${uid}`).get()]);
  if (!chave.exists || typeof chave.get('chaveCifrada') !== 'string') continue;
  comChave += 1;
  if (conexao.exists) {
    jaTinham += 1;
    continue;
  }
  const criadaEm = chave.get('criadaEm');
  if (!soPlano) {
    await db.doc(`intervalsConexoes/${uid}`).set({
      status: 'ativa',
      conectadaEm: criadaEm instanceof Timestamp ? criadaEm : Timestamp.now(),
      falhasSeguidas: 0,
    });
  }
  criados += 1;
}

console.log(
  `${usuarios.size} usuários, ${comChave} com o intervals.icu conectado: ${criados} ${soPlano ? 'seriam criados' : 'criados'}, ${jaTinham} já tinham.`,
);
