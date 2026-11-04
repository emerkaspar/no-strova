<#
.SYNOPSIS
  Automatiza o deploy do No Strova: testes -> build -> deploy homolog -> commit/push
  (-> producao + merge, quando o ambiente de producao existir).

.DESCRIPTION
  - Trabalha na branch atual (hoje: master). Nao troca de branch para o deploy de homolog.
  - Producao so e' usada quando .firebaserc tem um projeto real em "production"
    (hoje e' o placeholder TROCAR-no-strova-prod, entao o script faz so' homolog).
  - Descobre o que publicar comparando o codigo com as tags git deployed/homolog e
    deployed/prod (marcam o ultimo deploy bem-sucedido de cada ambiente).
  - Antes de publicar, roda os testes (npm test).

.PARAMETER Message
  Mensagem do commit. Sem ela, o script sugere uma (via IA, se o comando claude existir)
  e pergunta.

.PARAMETER Only
  Alvo do firebase deploy --only. Ex: hosting, firestore:rules, functions,
  functions:processarArquivoAtividade. Sem ele, o script sugere pelas mudancas.

.PARAMETER SkipProd
  Forca somente homolog, sem perguntar nada (uso em scripts).

.PARAMETER Auto
  Modo automatico: descobre o que deployar, mostra o plano, espera 5s e executa.
  Se nao houver nada para deployar, sai sem fazer nada.

.PARAMETER Plano
  Simulacao: mostra o plano (ambientes, o que seria publicado e por que, testes e
  verificacoes) e sai. NAO faz pull, teste, build, deploy, commit nem push.

.PARAMETER SkipTests
  Pula o portao de testes antes do deploy (nao recomendado).

.EXAMPLE
  ./deploy.ps1 -Plano
  ./deploy.ps1 -Auto
  ./deploy.ps1 -Message "ajusta o bloco de forma do inicio"
  ./deploy.ps1 -Message "atualiza regras" -Only "firestore:rules"
#>
param(
    [string]$Message,

    [string]$Only,

    [switch]$SkipProd,

    [switch]$Auto,

    [switch]$Plano,

    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# O Firebase CLI carrega o codigo de functions localmente pra descobrir os triggers
# antes do deploy, com timeout fixo de 10s. No Windows isso as vezes estoura
# ("Cannot determine backend specification. Timeout after 10000"). Sobe pra 60s.
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"

# ---- Configuracao ------------------------------------------------------------
$AliasHomolog = "homolog"      # alias em .firebaserc
$AliasProd = "production"      # alias em .firebaserc
$BranchProd = "main"           # branch que recebe o merge depois do deploy de producao

# Limite de functions por rodada de deploy. A API do Google limita mutacoes por
# minuto por regiao (~60); acima disso o CLI toma 429 e desiste de algumas functions.
$LoteFunctions = 25
$PausaEntreLotesSeg = 60
$TentativasDeploy = 3

# ---- Utilitarios -------------------------------------------------------------
function Step($desc, [scriptblock]$cmd) {
    Write-Host ">> $desc" -ForegroundColor Cyan
    & $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FALHOU: $desc" -ForegroundColor Red
        exit 1
    }
}

# Firebase CLI do proprio projeto (devDependency), sem exigir instalacao global.
function Invoke-Firebase {
    & npx firebase @args
}

function Get-BranchAtual { return (git rev-parse --abbrev-ref HEAD).Trim() }

function Tem-Remoto { return [bool](git remote) }

# A branch atual acompanha uma branch remota? (git config nao escreve em stderr)
function Tem-Upstream($branch) {
    $r = git config --get "branch.$branch.remote"
    return ($LASTEXITCODE -eq 0 -and [bool]$r)
}

function Branch-Existe($nome) {
    $null = git show-ref --verify --quiet "refs/heads/$nome"
    return ($LASTEXITCODE -eq 0)
}

# Projeto Firebase de um alias; $null se o alias nao existir.
function Get-ProjetoFirebase($alias) {
    $rc = Get-Content ".firebaserc" -Raw | ConvertFrom-Json
    return $rc.projects.$alias
}

# Producao existe quando o alias aponta para um projeto real (nao o placeholder TROCAR-...).
function Producao-Configurada {
    $p = Get-ProjetoFirebase $AliasProd
    return ($p -and $p -notlike "TROCAR*")
}

function Sugerir-MensagemIA($diffText) {
    if (-not $diffText) { return $null }
    # O diff pode chegar como lista de linhas: junta em um texto unico antes de cortar.
    $diffText = ($diffText | Out-String)
    if ($diffText.Length -gt 6000) { $diffText = $diffText.Substring(0, 6000) }
    $prompt = "Gere uma mensagem de commit curta em portugues, no estilo: comeca com verbo, sem ponto final, max 70 caracteres. Responda SOMENTE com a mensagem, sem aspas, sem explicacao. Diff:`n`n$diffText"
    try {
        $claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
        if (-not $claudeCmd) { return $null }
        $resultado = $prompt | claude -p 2>$null
        if ($LASTEXITCODE -eq 0 -and $resultado) {
            $linha = ($resultado -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
            return $linha.Trim().Trim('"')
        }
    } catch {}
    return $null
}

# ---- Grafo de imports de apps/functions/src ---------------------------------
# Chave = arquivo, valor = arquivos que o importam diretamente.
$script:GrafoImportadores = $null
function Montar-GrafoImportadores {
    $g = @{}
    $arquivos = Get-ChildItem "apps/functions/src" -Recurse -Filter *.ts -File
    $raiz = (Resolve-Path ".").Path.TrimEnd('\') + '\'
    foreach ($a in $arquivos) {
        $rel = ($a.FullName.Substring($raiz.Length)) -replace '\\', '/'
        $dir = Split-Path $a.FullName -Parent
        $texto = Get-Content $a.FullName -Raw
        foreach ($m in [regex]::Matches($texto, '(?:from\s+|import\s*\(\s*|require\s*\(\s*)["''](\.[^"'']+)["'']')) {
            $alvo = Join-Path $dir ($m.Groups[1].Value -replace '\.js$', '')
            foreach ($cand in @("$alvo.ts", (Join-Path $alvo 'index.ts'))) {
                if (Test-Path $cand -PathType Leaf) {
                    $c = ((Resolve-Path $cand).Path.Substring($raiz.Length)) -replace '\\', '/'
                    if (-not $g.ContainsKey($c)) { $g[$c] = New-Object System.Collections.Generic.List[string] }
                    $g[$c].Add($rel)
                    break
                }
            }
        }
    }
    $script:GrafoImportadores = $g
}

# Arquivos *.functions.ts que dependem (direta ou indiretamente) de $arquivo.
# Retorna $null se nao for possivel concluir (nenhuma function depende dele): o chamador
# cai no deploy de todas as functions, que e' o lado seguro.
function Get-FunctionsDependentes($arquivo) {
    if (-not $script:GrafoImportadores) { Montar-GrafoImportadores }
    $g = $script:GrafoImportadores
    $visto = New-Object System.Collections.Generic.HashSet[string]
    $fila = New-Object System.Collections.Generic.Queue[string]
    $null = $visto.Add($arquivo); $fila.Enqueue($arquivo)
    $funcs = @()
    while ($fila.Count -gt 0) {
        $atual = $fila.Dequeue()
        if ($atual -like 'apps/functions/src/*.functions.ts') { $funcs += $atual }
        if ($g.ContainsKey($atual)) {
            foreach ($imp in $g[$atual]) { if ($visto.Add($imp)) { $fila.Enqueue($imp) } }
        }
    }
    if ($funcs.Count -eq 0) { return $null }
    return $funcs
}

# Nomes das functions exportadas por um arquivo *.functions.ts (e re-exportadas em index.ts).
function Get-NomesFunctions($arquivo, $indexTs) {
    $nomes = @()
    $conteudo = Get-Content $arquivo -Raw
    foreach ($m in [regex]::Matches($conteudo, '(?m)^export const (\w+)\s*=\s*(?:on[A-Z]\w*|functionsV1)\b')) {
        $nome = $m.Groups[1].Value
        if ($indexTs -and $indexTs -match "\b$nome\b") { $nomes += $nome }
    }
    return $nomes
}

# Olha os arquivos alterados e sugere o --only minimo necessario.
# Retorna @{ Only = "..."; Motivo = "..." } ou $null se nada precisa ser publicado.
function Sugerir-Only($arquivos) {
    if (-not $arquivos) { return $null }
    $alvos = New-Object System.Collections.Generic.List[string]
    $motivos = New-Object System.Collections.Generic.List[string]
    $functionsCompleto = $false
    $nomesFunctions = New-Object System.Collections.Generic.List[string]
    $indexTs = Get-Content "apps/functions/src/index.ts" -Raw -ErrorAction SilentlyContinue

    foreach ($raw in $arquivos) {
        $f = ($raw -replace '\\', '/').Trim('"')

        # Nunca exigem deploy: testes, documentacao, scripts, arte original, lock e config de dev.
        if ($f -like '*.test.js' -or $f -like '*.test.ts' -or $f -like 'firebase/tests/*' -or
            $f -like '*.md' -or $f -like 'docs/*' -or $f -like '*.ps1' -or $f -like 'scripts/*' -or
            $f -like 'apps/web/scripts/*' -or $f -like 'apps/web/assets/*' -or $f -like 'apps/functions/lib/*' -or
            $f -eq 'package.json' -or $f -eq 'package-lock.json' -or $f -eq '.gitignore' -or
            $f -like '.env*' -or $f -eq '.firebaserc') { continue }

        if ($f -like 'apps/web/*') {
            if (-not $alvos.Contains('hosting')) { $alvos.Add('hosting'); $motivos.Add('frontend mudou') }
        }
        elseif ($f -like 'packages/domain/*') {
            # o dominio e' usado pelo frontend e embutido no bundle de todas as functions
            if (-not $alvos.Contains('hosting')) { $alvos.Add('hosting') }
            $functionsCompleto = $true
            if (-not $motivos.Contains('regras do dominio mudaram (frontend e todas as functions)')) { $motivos.Add('regras do dominio mudaram (frontend e todas as functions)') }
        }
        elseif ($f -eq 'firebase/firestore.rules') {
            if (-not $alvos.Contains('firestore:rules')) { $alvos.Add('firestore:rules'); $motivos.Add('regras do Firestore mudaram') }
        }
        elseif ($f -eq 'firebase/storage.rules') {
            if (-not $alvos.Contains('storage')) { $alvos.Add('storage'); $motivos.Add('regras do Storage mudaram') }
        }
        elseif ($f -like 'firebase/indexes/*') {
            if (-not $alvos.Contains('firestore:indexes')) { $alvos.Add('firestore:indexes'); $motivos.Add('indices do Firestore mudaram') }
        }
        elseif ($f -eq 'firebase.json') {
            foreach ($t in @('hosting', 'functions', 'firestore', 'storage')) { if (-not $alvos.Contains($t)) { $alvos.Add($t) } }
            $motivos.Add('firebase.json mudou (deploy completo)')
        }
        elseif ($f -like 'apps/functions/src/*.functions.ts' -and (Test-Path $f)) {
            $nomes = Get-NomesFunctions $f $indexTs
            # exports nao reconhecidos (alias, wrapper...): nao arrisca, publica todas
            if ($nomes.Count -eq 0) { $functionsCompleto = $true }
            foreach ($n in $nomes) { if (-not $nomesFunctions.Contains($n)) { $nomesFunctions.Add($n) } }
        }
        elseif ($f -eq 'apps/functions/src/index.ts') {
            # index.ts so' re-exporta: functions novas ou alteradas aparecem pelos proprios *.functions.ts
            continue
        }
        elseif ($f -like 'apps/functions/src/*.ts') {
            # modulo compartilhado: segue os imports e pega so' as functions que dependem dele
            $deps = Get-FunctionsDependentes $f
            if ($null -eq $deps) { $functionsCompleto = $true; continue }
            foreach ($arq in $deps) {
                foreach ($n in (Get-NomesFunctions $arq $indexTs)) { if (-not $nomesFunctions.Contains($n)) { $nomesFunctions.Add($n) } }
            }
        }
        elseif ($f -like 'apps/functions/*') {
            # package.json, tsconfig, build.mjs...: todas as functions dependem
            $functionsCompleto = $true
            if (-not $motivos.Contains('configuracao das functions mudou')) { $motivos.Add('configuracao das functions mudou') }
        }
    }

    if ($functionsCompleto) {
        if (-not $alvos.Contains('functions')) { $alvos.Add('functions') }
    } elseif ($nomesFunctions.Count -gt 0) {
        foreach ($n in $nomesFunctions) { $alvos.Add("functions:$n") }
        $motivos.Add("$($nomesFunctions.Count) function(s) alterada(s)")
    }

    if ($alvos.Count -eq 0) { return $null }
    return @{ Only = ($alvos -join ','); Motivo = ($motivos -join '; ') }
}

# Roda firebase deploy; se falhar em alvo com functions (tipicamente 429 de cota),
# espera e repete. O CLI pula functions ja atualizadas, entao cada nova tentativa
# so reenvia as que falharam.
function Invoke-FirebaseDeploy($projeto, $only) {
    $itens = @()
    if ($only) { $itens = $only -split ',' | Where-Object { $_ } }
    $fnItens = @($itens | Where-Object { $_ -like 'functions:*' })
    $outros = @($itens | Where-Object { $_ -notlike 'functions:*' })

    # monta os lotes (cada lote e' uma string de --only; $null = deploy sem --only)
    $lotes = @()
    if ($fnItens.Count -gt $LoteFunctions) {
        for ($i = 0; $i -lt $fnItens.Count; $i += $LoteFunctions) {
            $fim = [Math]::Min($i + $LoteFunctions, $fnItens.Count) - 1
            $lote = @($fnItens[$i..$fim])
            if ($i -eq 0) { $lote = $outros + $lote }
            $lotes += ,($lote -join ',')
        }
    } elseif ($itens.Count -gt 0) {
        $lotes += ,($itens -join ',')
    } else {
        $lotes += ,$null
    }

    for ($n = 0; $n -lt $lotes.Count; $n++) {
        $lote = $lotes[$n]
        $comFunctions = (-not $lote) -or ($lote -match '(^|,)functions(:|,|$)')
        $maxTentativas = if ($comFunctions) { $TentativasDeploy } else { 1 }
        $ok = $false
        for ($t = 1; $t -le $maxTentativas; $t++) {
            if ($lotes.Count -gt 1) { Write-Host "   lote $($n + 1)/$($lotes.Count), tentativa $t" -ForegroundColor DarkGray }
            elseif ($t -gt 1) { Write-Host "   tentativa $t de $maxTentativas" -ForegroundColor DarkGray }
            if ($lote) { Invoke-Firebase deploy --project $projeto --only $lote }
            else       { Invoke-Firebase deploy --project $projeto }
            if ($LASTEXITCODE -eq 0) { $ok = $true; break }
            if ($t -lt $maxTentativas) {
                Write-Host "Deploy falhou (provavel cota da API ou permissao ainda propagando). Aguardando ${PausaEntreLotesSeg}s para tentar de novo so as que faltam..." -ForegroundColor Yellow
                Start-Sleep -Seconds $PausaEntreLotesSeg
            }
        }
        if (-not $ok) { $global:LASTEXITCODE = 1; return }
        if ($n -lt $lotes.Count - 1) {
            Write-Host "Pausa de ${PausaEntreLotesSeg}s entre lotes (cota da API)..." -ForegroundColor DarkGray
            Start-Sleep -Seconds $PausaEntreLotesSeg
        }
    }
    $global:LASTEXITCODE = 0
}

# ---- Marcas de deploy --------------------------------------------------------
# Tags git deployed/<ambiente> apontam pro commit do ultimo deploy bem-sucedido de cada
# ambiente. Ficam no remoto (se houver), entao valem em qualquer maquina.
function Get-ArquivosPendentes($ambiente) {
    $ref = "refs/tags/deployed/$ambiente"
    $null = git rev-parse -q --verify $ref
    if ($LASTEXITCODE -eq 0) {
        # tudo que difere do ultimo deploy: commitado, nao commitado e arquivos novos
        $lista = @(git -c core.quotepath=off diff --name-only $ref)
        $lista += @(git -c core.quotepath=off ls-files --others --exclude-standard)
        return @{ Arquivos = ($lista | Where-Object { $_ } | Select-Object -Unique); Base = (git rev-parse --short $ref) }
    }
    # sem marca (primeiro uso neste ambiente): so' o que esta nao commitado
    $lista = @(git -c core.quotepath=off status --porcelain -uall | ForEach-Object { $_.Substring(3) })
    return @{ Arquivos = $lista; Base = $null }
}

# O --only escolhido cobre tudo que a sugestao pedia? Se nao, a marca de deploy
# nao deve avancar (senao as mudancas nao deployadas ficariam "esquecidas").
function Cobre-Sugestao($only, $sugestao) {
    if (-not $sugestao) { return $true }
    if (-not $only) { return $true }
    $escolhidos = $only -split ','
    foreach ($s in ($sugestao.Only -split ',')) {
        if ($escolhidos -contains $s) { continue }
        if ($s -like 'functions:*' -and $escolhidos -contains 'functions') { continue }
        if ($s -like 'firestore:*' -and $escolhidos -contains 'firestore') { continue }
        return $false
    }
    return $true
}

function Atualizar-MarcaDeploy($ambiente) {
    if (-not $script:MarcarDeploy) {
        Write-Host "Marca deployed/$ambiente NAO atualizada: o deploy escolhido nao cobriu tudo que estava pendente." -ForegroundColor Yellow
        return
    }
    git tag -f "deployed/$ambiente" HEAD
    if ($LASTEXITCODE -ne 0) { return }
    if (Tem-Remoto) { git push origin "+refs/tags/deployed/$ambiente" }
}

# =============================================================================
# Fluxo principal
# =============================================================================
$Branch = Get-BranchAtual
$ProdOk = Producao-Configurada
$TemRemoto = Tem-Remoto
$ProjetoHomolog = Get-ProjetoFirebase $AliasHomolog
if (-not $ProjetoHomolog -or $ProjetoHomolog -like "TROCAR*") {
    Write-Host "O alias '$AliasHomolog' em .firebaserc nao aponta para um projeto real. Ajuste antes de deployar." -ForegroundColor Red
    exit 1
}

# Ambientes: producao so' entra quando existir (.firebaserc com projeto real).
if ($SkipProd) {
    $FazerHomolog = $true; $FazerProd = $false
} elseif (-not $ProdOk) {
    $FazerHomolog = $true; $FazerProd = $false
    Write-Host "Producao ainda nao configurada (.firebaserc: $AliasProd) - somente homolog ($ProjetoHomolog)." -ForegroundColor Yellow
} elseif ($Auto -or $Plano) {
    $FazerHomolog = $true; $FazerProd = $true
} else {
    Write-Host "Deployar em qual ambiente?"
    Write-Host "  1) Homolog e Prod (padrao)"
    Write-Host "  2) Somente Homolog"
    Write-Host "  3) Somente Prod"
    $opcaoAmbiente = Read-Host "Escolha [1]"
    switch ($opcaoAmbiente) {
        "2" { $FazerHomolog = $true;  $FazerProd = $false }
        "3" { $FazerHomolog = $false; $FazerProd = $true }
        default { $FazerHomolog = $true; $FazerProd = $true }
    }
}

# Sincroniza com o remoto e busca as marcas de deploy (a simulacao nao altera nada).
if (-not $Plano) {
    if ($TemRemoto) {
        if (Tem-Upstream $Branch) { Step "pull $Branch" { git pull --ff-only } }
        Step "buscar marcas de deploy" { git fetch origin "+refs/tags/deployed/*:refs/tags/deployed/*" }
    } else {
        Write-Host "Sem remoto git configurado: pulando pull/fetch/push." -ForegroundColor Yellow
    }
}

# Pendencias = uniao do que falta deployar nos ambientes escolhidos. Deployar a
# mais num ambiente e' inofensivo; deployar a menos nao.
$arquivosPendentes = @()
foreach ($amb in @(@{ N = "homolog"; Ativo = $FazerHomolog }, @{ N = "prod"; Ativo = $FazerProd })) {
    if (-not $amb.Ativo) { continue }
    $p = Get-ArquivosPendentes $amb.N
    $arquivosPendentes += $p.Arquivos
    if ($p.Base) {
        Write-Host "$($amb.N): ultimo deploy no commit $($p.Base) - $(@($p.Arquivos).Count) arquivo(s) alterado(s) desde entao" -ForegroundColor DarkGray
    } else {
        Write-Host "$($amb.N): sem marca de deploy (primeiro uso) - considerando so' o que esta nao commitado ($(@($p.Arquivos).Count) arquivo(s))" -ForegroundColor Yellow
    }
}
$arquivosPendentes = $arquivosPendentes | Where-Object { $_ } | Select-Object -Unique
$sugestaoOnly = Sugerir-Only $arquivosPendentes

$ambTxt = if ($FazerHomolog -and $FazerProd) { "homolog + prod" } elseif ($FazerProd) { "prod" } else { "homolog" }

# ---- Simulacao ---------------------------------------------------------------
if ($Plano) {
    Write-Host ""
    Write-Host "===== Plano (simulacao, nada sera executado) =====" -ForegroundColor Cyan
    Write-Host "Branch:      $Branch$(if ($TemRemoto) { ' (remoto: origin)' } else { ' (sem remoto)' })"
    Write-Host "Ambientes:   $ambTxt$(if (-not $ProdOk) { '  [producao nao configurada]' })"
    Write-Host "Projeto:     $ProjetoHomolog (homolog)"
    if ($Only) {
        Write-Host "Deploy:      $Only  (informado em -Only)"
    } elseif ($sugestaoOnly) {
        Write-Host "Deploy:      $($sugestaoOnly.Only)"
        Write-Host "Motivo:      $($sugestaoOnly.Motivo)"
    } else {
        Write-Host "Deploy:      nada para publicar desde o ultimo deploy"
    }
    Write-Host "Testes:      $(if ($SkipTests) { 'pulados (-SkipTests)' } else { 'npm test' })"
    $precisaWeb = ($Only -match '(^|,)hosting(,|$)') -or ((-not $Only) -and $sugestaoOnly -and ($sugestaoOnly.Only -match '(^|,)hosting(,|$)'))
    Write-Host "Build web:   $(if ($precisaWeb) { 'npm run build:homolog -w apps/web' } else { 'nao necessario' })"
    if (-not (Test-Path ".env.homolog")) { Write-Host "ATENCAO:     .env.homolog nao existe (o build de homolog sairia sem configuracao)" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Arquivos considerados ($(@($arquivosPendentes).Count)):" -ForegroundColor DarkGray
    $arquivosPendentes | Select-Object -First 40 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    if (@($arquivosPendentes).Count -gt 40) { Write-Host "  ... e mais $(@($arquivosPendentes).Count - 40)" -ForegroundColor DarkGray }
    Write-Host ""
    Write-Host "Simulacao concluida. Nada foi executado." -ForegroundColor Green
    exit 0
}

# ---- Decide o que publicar ---------------------------------------------------
if (-not $Only -and $Auto) {
    if (-not $sugestaoOnly) {
        Write-Host "Nada para deployar desde o ultimo deploy. Nada foi feito." -ForegroundColor Green
        exit 0
    }
    $Only = $sugestaoOnly.Only
    Write-Host ""
    Write-Host "===== Plano (automatico) =====" -ForegroundColor Cyan
    Write-Host "Ambientes: $ambTxt"
    Write-Host "Deploy:    $Only"
    Write-Host "Motivo:    $($sugestaoOnly.Motivo)"
    Write-Host "Ctrl+C em 5s para cancelar..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
}

if (-not $Only) {
    Write-Host "Tipo de deploy:"
    Write-Host "  1) hosting (default sem sugestao)"
    Write-Host "  2) firestore:rules"
    Write-Host "  3) firestore:indexes"
    Write-Host "  4) functions (todas)"
    Write-Host "  5) storage"
    Write-Host "  6) hosting,firestore:rules,functions"
    Write-Host "  7) tudo (deploy completo, sem --only)"
    Write-Host "  8) outro (digite manualmente)"
    if ($sugestaoOnly) {
        Write-Host "  S) sugerido pelas mudancas: $($sugestaoOnly.Only)" -ForegroundColor Green
        Write-Host "     ($($sugestaoOnly.Motivo))" -ForegroundColor DarkGray
        $opcao = Read-Host "Escolha [S]"
    } else {
        $opcao = Read-Host "Escolha [1]"
    }
    switch ($opcao) {
        "1" { $Only = "hosting" }
        "2" { $Only = "firestore:rules" }
        "3" { $Only = "firestore:indexes" }
        "4" { $Only = "functions" }
        "5" { $Only = "storage" }
        "6" { $Only = "hosting,firestore:rules,functions" }
        "7" { $Only = "" }
        "8" { $Only = Read-Host "Digite o valor de --only" }
        default {
            if ($sugestaoOnly) { $Only = $sugestaoOnly.Only } else { $Only = "hosting" }
        }
    }
}

# ---- Mensagem do commit ------------------------------------------------------
$changed = git status --porcelain | ForEach-Object { $_.Substring(3) }
if (-not $Message) {
    if ($changed) {
        Write-Host ""
        Write-Host "Arquivos alterados:" -ForegroundColor Yellow
        $changed | Select-Object -First 40 | ForEach-Object { Write-Host "  $_" }
        if (@($changed).Count -gt 40) { Write-Host "  ... e mais $(@($changed).Count - 40)" }

        Write-Host ""
        Write-Host "Gerando sugestao com IA..." -ForegroundColor DarkGray
        $sugestaoIA = Sugerir-MensagemIA (git diff HEAD)

        if ($sugestaoIA) {
            $sugestao = $sugestaoIA
        } else {
            $sugestao = "Atualiza: " + (($changed | Select-Object -First 5) -join ", ")
            if (@($changed).Count -gt 5) { $sugestao += "..." }
        }

        Write-Host "Sugestao: $sugestao" -ForegroundColor Cyan
        if ($Auto) {
            $Message = $sugestao
        } else {
            $Message = Read-Host "Mensagem do commit (Enter aceita sugestao)"
            if (-not $Message) { $Message = $sugestao }
        }
    } elseif ($Auto) {
        $Message = "Deploy automatico"
    } else {
        $Message = Read-Host "Mensagem do commit"
    }
}

# Aspas duplas embutidas na mensagem quebram a passagem de argumentos do PowerShell 5.1
# pra executaveis nativos (git.exe recebe a linha cortada em pedacos). Sanitiza.
$Message = $Message -replace '"', "'"

# ---- Verificacoes antes de publicar -----------------------------------------
if ($FazerHomolog -and -not (Test-Path ".env.homolog")) {
    Write-Host "Falta o arquivo .env.homolog (copie de .env.homolog.example e preencha). Sem ele o build sai sem configuracao do Firebase." -ForegroundColor Red
    exit 1
}
if ($FazerProd -and -not (Test-Path ".env.production")) {
    Write-Host "Falta o arquivo .env.production (copie de .env.production.example e preencha)." -ForegroundColor Red
    exit 1
}

# Portao de testes: nada vai ao ar com teste quebrado.
if (-not $SkipTests) {
    Step "testes (domain, web, functions)" { npm test }
} else {
    Write-Host "Testes pulados (-SkipTests)." -ForegroundColor Yellow
}

# Build do front so' e' necessario quando hosting entra no deploy (ou deploy completo).
# O build das functions roda sozinho no predeploy do firebase.json.
$PrecisaBuildWeb = (-not $Only) -or ($Only -match '(^|,)hosting(,|$)')

# So avanca as marcas de deploy se o que foi deployado cobre tudo que estava pendente.
$MarcarDeploy = Cobre-Sugestao $Only $sugestaoOnly

# ---- Homolog -----------------------------------------------------------------
if ($FazerHomolog) {
    if ($PrecisaBuildWeb) { Step "build homolog (web)" { npm run build:homolog -w apps/web } }
    $descHomolog = if ($Only) { "deploy homolog ($Only)" } else { "deploy homolog (tudo)" }
    Step $descHomolog { Invoke-FirebaseDeploy $AliasHomolog $Only }
}

Step "git add" { git add . }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Step "git commit" { git commit -m $Message }
} else {
    Write-Host "Nada novo para commitar (mudancas ja estavam commitadas)." -ForegroundColor DarkGray
}
if ($TemRemoto) {
    if (Tem-Upstream $Branch) { Step "git push $Branch" { git push origin $Branch } }
    else { Step "git push -u $Branch" { git push -u origin $Branch } }
}
if ($FazerHomolog) { Step "marcar deploy homolog" { Atualizar-MarcaDeploy "homolog" } }

# ---- Producao (so' quando existir) ------------------------------------------
if ($FazerProd) {
    if ($PrecisaBuildWeb) { Step "build prod (web)" { npm run build:prod -w apps/web } }
    $descProd = if ($Only) { "deploy prod ($Only)" } else { "deploy prod (tudo)" }
    Step $descProd { Invoke-FirebaseDeploy $AliasProd $Only }
    Step "marcar deploy prod" { Atualizar-MarcaDeploy "prod" }

    # Promove o codigo para a branch de producao, se ela existir e for outra branch.
    if ($BranchProd -ne $Branch -and (Branch-Existe $BranchProd)) {
        Step "checkout $BranchProd" { git checkout $BranchProd }
        if ($TemRemoto -and (Tem-Upstream $BranchProd)) { Step "pull $BranchProd" { git pull --ff-only } }
        Step "merge $Branch -> $BranchProd" { git merge $Branch --no-edit -m "Merge branch '$Branch' into $BranchProd" }
        if ($TemRemoto) { Step "push $BranchProd" { git push origin $BranchProd } }
        Step "checkout $Branch" { git checkout $Branch }
    } elseif ($BranchProd -ne $Branch) {
        Write-Host "Branch '$BranchProd' nao existe: merge de producao pulado." -ForegroundColor Yellow
    }
}

Write-Host "Deploy completo." -ForegroundColor Green
