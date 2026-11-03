# No Strova

Planejamento e análise de treino para quem pedala e corre. Stack, arquitetura e padrões em [CLAUDE.md](CLAUDE.md); domínio e regras de negócio em [docs/dominio.md](docs/dominio.md).

## Começando

Requisitos: Node 20.19 ou superior (as Functions rodam em Node 22 no Firebase; recomenda-se Node 22 também localmente) e Java 17+ (emuladores do Firebase).

```bash
npm install
npm test                 # testes do domain e do web
npm run emulators        # Auth, Firestore, Functions, Storage (build das Functions antes: npm run build -w apps/functions)
npm run dev:emulator     # web contra os emuladores (em outro terminal)
npm run test:rules       # testes das regras do Firestore/Storage (sobe os emuladores sozinho)
```

### Primeiro administrador

Crie a conta pela tela de cadastro e promova-a:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=demo-no-strova npm run admin:promover -- email@exemplo.com
```

Em homolog/produção, rode o mesmo comando sem as variáveis de emulador e com `GCLOUD_PROJECT=<id-do-projeto>` e credenciais (`gcloud auth application-default login`).

## Ambientes

Copie `.env.homolog.example` para `.env.homolog` e `.env.production.example` para `.env.production` e preencha com a configuração do app web de cada projeto Firebase. Ajuste os IDs em `.firebaserc`. Scripts: `build:homolog`, `build:prod`, `deploy:hosting:*`, `deploy:functions:*`, `deploy:rules:*`.
