// Promove um usuário JÁ CADASTRADO (existente no Firebase Auth) a administrador.
// É a forma de criar o primeiro admin, porque nenhuma callable concede o papel admin.
//
// Uso (com credenciais do Google instaladas via `gcloud auth application-default login`):
//   GCLOUD_PROJECT=<id-do-projeto> node scripts/promover-admin.mjs email@exemplo.com
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2];
if (!email || !process.env.GCLOUD_PROJECT) {
  console.error('Uso: GCLOUD_PROJECT=<projeto> node scripts/promover-admin.mjs <email>');
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const usuario = await getAuth().getUserByEmail(email);
await getFirestore()
  .doc(`users/${usuario.uid}`)
  .set({ role: 'admin', aprovado: true, ativo: true, email }, { merge: true });

console.log(`${email} (${usuario.uid}) agora é admin em ${process.env.GCLOUD_PROJECT}.`);
