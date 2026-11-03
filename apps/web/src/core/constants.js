export const NOME_APP = 'No Strova';
export const REGIAO_FUNCTIONS = 'southamerica-east1';
export const USAR_EMULADORES = import.meta.env.VITE_USE_EMULATORS === 'true';

export const EMULADORES = Object.freeze({
  auth: 'http://127.0.0.1:9099',
  firestore: { host: '127.0.0.1', port: 8080 },
  functions: { host: '127.0.0.1', port: 5001 },
  storage: { host: '127.0.0.1', port: 9199 },
});

export const SENHA_MINIMA = 8;

export const TAMANHO_MAXIMO_ARQUIVO_BYTES = 15 * 1024 * 1024;
