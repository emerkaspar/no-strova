# No Strova

Planejamento e análise de treino para quem pedala e corre. Stack, arquitetura e padrões em [CLAUDE.md](CLAUDE.md); domínio e regras de negócio em [docs/dominio.md](docs/dominio.md).

## Começando

Requisitos: Node 20.19 ou superior (as Functions rodam em Node 22 no Firebase; recomenda-se Node 22 também localmente).

```bash
npm install
npm run dev              # web contra o projeto de homolog
```

### Primeiro administrador

Crie a conta pela tela de cadastro e promova-a, com `GCLOUD_PROJECT=<id-do-projeto>` e credenciais (`gcloud auth application-default login`):

```bash
GCLOUD_PROJECT=<id-do-projeto> npm run admin:promover -- email@exemplo.com
```

## IA (Gemini)

As sugestões de treino e de peso usam o Gemini pelas Functions. A chave fica no Secret Manager (nunca no código): crie uma chave no Google AI Studio e rode, em cada projeto Firebase (precisa do plano Blaze):

```bash
firebase functions:secrets:set GEMINI_API_KEY --project homolog
```

Depois publique as Functions (`deploy:functions:homolog` ou o `deploy.ps1`). Sem a chave, as telas mostram "A IA ainda não está configurada".

## Ambientes

Copie `.env.homolog.example` para `.env.homolog` e `.env.production.example` para `.env.production` e preencha com a configuração do app web de cada projeto Firebase. Ajuste os IDs em `.firebaserc`. Scripts: `build:homolog`, `build:prod`, `deploy:hosting:*`, `deploy:functions:*`, `deploy:rules:*`.

## Scripts de apoio (PowerShell)

- **`./iniciar.ps1`**: prepara e sobe o app local. Faz `git pull` (se a branch tem remoto), `npm install` (se faltar ou o lock mudou) e `npm run dev` contra o projeto de homolog. `-SemPull` pula o pull.
- **`./deploy.ps1`**: deploy guiado. Descobre o que mudou desde o último deploy (tags git `deployed/homolog` e `deployed/prod`), sugere o `--only` mínimo (hosting, regras, índices ou só as functions afetadas, seguindo os imports), roda os testes (`npm test`), faz o build do web, publica em homolog, commita, dá push e marca o deploy. Opções: **`-Plano`** (simula e mostra o plano, sem executar nada), `-Auto` (sem perguntas, com 5 s para cancelar), `-Message`, `-Only`, `-SkipTests`.
- **Produção:** enquanto `production` em `.firebaserc` for o placeholder `TROCAR-...`, o script publica só em homolog. Com um projeto real configurado (e `.env.production`), ele passa a oferecer homolog + prod e, depois do deploy de produção, faz o merge da branch atual na `main` (se ela existir).
- Os scripts são mantidos em ASCII (sem acentos) por causa do PowerShell 5.1. Se o PowerShell bloquear a execução, use `powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -Plano`.
