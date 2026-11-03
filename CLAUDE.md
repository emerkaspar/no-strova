# Contexto de infraestrutura e stack

Aplicação nova: **No Strova**, sem relação de negócio com nenhum projeto anterior. Quero **reaproveitar a mesma infraestrutura, linguagem, banco e cloud**. Use este documento como fonte de verdade sobre a stack e os padrões técnicos. O domínio da aplicação está em `docs/dominio.md`.

## 1. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Vite + JavaScript vanilla modular (sem React/Vue/Angular) |
| Backend | Firebase Functions v2, TypeScript, Node 22 (o Node 20 foi descontinuado para deploy em 30/10/2026) |
| Banco | Cloud Firestore |
| Arquivos | Firebase Storage, com acesso por URLs assinadas |
| Autenticação | Firebase Authentication (e-mail/senha) |
| Hosting | Firebase Hosting + PWA (Workbox) |
| IA (se necessário) | Genkit, com modelos Gemini |
| PDF | pdf-lib (geração) e pdfjs-dist (visualização) |
| Outros | qrcode (QR), bwip-js (código de barras), PapaParse (CSV) |

- Região das Functions: `southamerica-east1`.
- Idioma da interface, dos textos e das respostas: português do Brasil.
- As versões são referência. Fixe versões compatíveis entre si ao criar o projeto.

## 2. Estrutura do repositório (monorepo)

```
/
├─ package.json             # npm workspaces: apps/*, packages/*
├─ packages/
│  └─ domain/               # @no-strova/domain: regras de negócio puras (sem Firebase, sem DOM), testáveis, compartilhadas por web e functions
├─ apps/
│  ├─ web/                  # frontend (Vite)
│  │  └─ src/
│  │     ├─ application/    # casos de uso: orquestram @no-strova/domain + infrastructure
│  │     ├─ infrastructure/ # repositórios Firestore, storage, exportadores
│  │     ├─ modules/        # UI por funcionalidade (telas, eventos, DOM)
│  │     ├─ core/           # db.js (wrapper Firestore), auth.js, functions.js (callables), constants.js
│  │     └─ utils/          # formatters (moeda, número, máscaras), componentes genéricos
│  └─ functions/
│     └─ src/
│        ├─ modules/<feature>/   # *.functions.ts, serviços e tipos por feature
│        └─ index.ts             # exporta as functions
├─ firebase.json            # na raiz: o CLI trata a pasta do firebase.json como raiz do projeto e não aceita apps/functions fora dela
├─ .firebaserc              # aliases homolog / production
├─ firebase/                # firestore.rules, storage.rules, indexes/firestore.indexes.json, tests/ (regras)
├─ .env.homolog
└─ .env.production
```

Regras de arquitetura:
- A dependência vai em um sentido: `modules → application → @no-strova/domain` (`packages/domain`), e `infrastructure` implementa o acesso a dados. O `domain` nunca importa Firebase nem toca no DOM.
- Arquivos no Storage: o caminho das atividades inclui o dono (`atividades/{userId}/{atividadeId}/...`) para que as regras validem o dono sem consultar o Firestore. Detalhes em `docs/dominio.md`.
- Todo acesso ao Firestore no frontend passa por `core/db.js` ou por um repositório em `infrastructure/`. Nenhuma tela chama o SDK direto.
- Operações sensíveis ou que alteram estado crítico passam por **Cloud Functions callable**. O cliente chama e o servidor valida e grava (Admin SDK).

## 3. Ambientes e deploy

- Dois ambientes, cada um com seu projeto Firebase: **homolog** e **production**.
- Configuração por `.env.homolog` e `.env.production`, com scripts separados no `package.json`:
  - `dev`, `build:homolog`, `build:prod`
  - `deploy:hosting:homolog` / `deploy:hosting:prod`
  - `deploy:functions:homolog` / `deploy:functions:prod`
  - `deploy:rules:*`
- O fluxo é: desenvolver, validar em homolog e só então promover para produção.
- Nunca commitar segredos. Use Secret Manager (`defineSecret`) nas Functions e variáveis `VITE_*` apenas para configuração pública do cliente.
- O Hosting usa **rewrites** para expor Functions HTTP públicas sob `/api/...`, quando precisar de endpoints sem login.

## 4. Modelo de dados e acesso

- **Sem multi-tenancy.** Não existe `municipioId` nem separação por organização. As coleções de negócio ficam na raiz do Firestore (`<colecao>/{id}`), com subcoleções quando fizer sentido.
- O acesso é controlado por **papel** e por **dono do registro** (`userId`/`criadoPor`), nunca por tenant.
- Coleção `users/{uid}`: `nome`, `email`, `role`, `aprovado` (boolean) e campos de perfil.
- Papéis (`role`) em hierarquia, ajustada ao meu domínio. O mínimo é `admin` (gerencia usuários e configurações), um ou mais papéis operacionais e, se fizer sentido, um papel externo restrito aos próprios dados.
- Fluxo de acesso:
  1. O cadastro cria o usuário no Auth (trigger `bootstrapUserOnCreate`).
  2. Uma callable (`ensureUserProfile`) completa o perfil com `aprovado: false`.
  3. Um admin aprova (`aprovado: true`).
  4. Só então o usuário acessa o sistema.
- Dados públicos (verificação por QR/código, listas de apoio) ficam em coleções separadas e legíveis sem login. Elas guardam apenas o mínimo necessário e nunca dados privados.
- Dados internos que o usuário final não pode ler ou alterar ficam em subcoleções protegidas. Elas têm leitura restrita à equipe e **escrita apenas via Admin SDK**.

## 5. Segurança (Firestore/Storage Rules)

- Regras por papel e por dono do registro. Nunca confie no cliente: se um usuário pode gravar um documento, nenhuma decisão de backend deve ler campos sensíveis desse documento. A fonte autoritativa fica em local que só o Admin SDK escreve.
- Coleções sensíveis negam acesso direto e só são acessadas via callable.
- Arquivos no Storage ficam organizados por entidade (por exemplo `<entidade>/{id}/...`) e são entregues por **URL assinada** gerada em callable.
- Dados pessoais (LGPD): anonimize ou mascare em documentos públicos ou impressos. Exemplo de CPF: `123.***.***-90`.
- Valide entradas nas Functions (tipos, tamanhos, papel do chamador) antes de gravar.

## 6. Padrões de código

**Backend (TypeScript):**
- Callables em `onCall` v2, com `region: "southamerica-east1"`.
- Cada feature em `modules/<feature>/` com `*.functions.ts`, serviços e tipos. As Functions só validam e delegam.
- Triggers Firestore para agregações e denormalizações. Scheduled functions para rotinas.
- Erros com `HttpsError` e mensagens em português.

**Frontend (JS vanilla modular):**
- ES Modules, sem framework. Cada módulo exporta `init`/`render`, e o estado fica em módulos `state.js`.
- Wrappers de callable em `core/functions.js`.
- Formatação centralizada em `utils/formatters.js`:
  - Moeda: `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`.
  - Parsing: remove pontos de milhar, troca vírgula por ponto.
  - Máscaras de input em tempo real.
- Componentes próprios, sem dependências pesadas (por exemplo, autocomplete custom com input, hidden input e dropdown).
- Listeners do Firestore (`onSnapshot`) devem ser cancelados ao sair da tela.

**UI:**
- Tema via CSS variables (`--bg-main`, `--text-primary`, `--border`, `--primary`, `--surface-light`), com dark mode.
- Cards com padding de 28px, raio de 12px e borda de 1px. Grids com `repeat(auto-fit, minmax(200px, 1fr))` e coluna única abaixo de 768px.
- Tabelas com ordenação clicável, busca em tempo real e scroll horizontal no mobile.
- Mobile-first e instalável como PWA, com service worker (Workbox) e notificações push opcionais.

## 7. Qualidade e operação

- Índices compostos declarados em `firebase/indexes/firestore.indexes.json` e versionados.
- Lógica de `domain/` com testes unitários, sem depender de emulador.
- Toda mudança visível ao usuário atualiza a documentação ou a ajuda do produto na mesma tarefa.
- Commits e deploys são feitos por mim. Você edita o código e roda os testes, mas **não faz commit nem deploy** sem eu pedir.

## 8. O que eu espero de você agora

1. Confirme que entendeu a stack e os padrões acima.
2. Com base no domínio descrito na seção 9, proponha:
   - o modelo de dados no Firestore (coleções, subcoleções, campos, índices);
   - os papéis e permissões;
   - as Cloud Functions necessárias;
   - a estrutura de módulos do frontend.
3. Só depois de eu aprovar, gere o scaffolding do monorepo (configs do Firebase, Vite, scripts de ambiente, regras e a estrutura de pastas) e implemente por etapas.

Pergunte antes de assumir qualquer decisão de negócio. As decisões técnicas acima já estão tomadas e não precisam ser rediscutidas.

## 9. Domínio da nova aplicação

Nome do sistema: **No Strova**.
Ver `docs/dominio.md` (fonte de verdade do domínio e das regras de negócio).
Cópia do Elevate para consulta (somente leitura): `../elevate-ref`.
