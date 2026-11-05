// Empacota as Functions em lib/index.js, embutindo o workspace @no-strova/domain.
// O deploy do Firebase não resolve pacotes de workspace, então só firebase-admin e
// firebase-functions, genkit e @genkit-ai/google-genai ficam como dependências externas (declaradas no package.json).
// @no-strova/domain NÃO pode constar no package.json desta pasta: o Cloud Build roda `npm install`
// aqui e não o encontraria no registry. Localmente ele resolve pelo link de workspace da raiz.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*', 'genkit', 'genkit/*', '@genkit-ai/*'],
  logLevel: 'info',
});
