<#
.SYNOPSIS
  Prepara o ambiente de desenvolvimento local do No Strova e sobe o app.

.DESCRIPTION
  Executa a sequencia recomendada antes de comecar a desenvolver:
    git pull (se a branch acompanha um remoto)
    npm install (se as dependencias estao desatualizadas ou ausentes)
    npm run dev   (app local contra o projeto de homolog)

  Com -Emulador, em vez do homolog real sobe os emuladores do Firebase (Auth, Firestore,
  Functions e Storage) numa janela separada e o app apontando para eles
  (npm run dev:emulator). Os dados do emulador somem ao fechar a janela.

.PARAMETER Emulador
  Usa os emuladores locais em vez do projeto de homolog.

.PARAMETER SemPull
  Nao faz git pull (util com alteracoes locais em andamento).

.EXAMPLE
  ./iniciar.ps1
  ./iniciar.ps1 -Emulador
#>
param(
    [switch]$Emulador,

    [switch]$SemPull
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Etapa($texto) { Write-Host "==> $texto" -ForegroundColor Cyan }

# Node 20.19+ (o Vite 7 exige) -- as Functions rodam em Node 22 no Firebase.
Etapa "verificando Node"
$nodeVersao = (node -v).Trim().TrimStart('v')
$partes = $nodeVersao.Split('.')
$maior = [int]$partes[0]; $menor = [int]$partes[1]
if ($maior -lt 20 -or ($maior -eq 20 -and $menor -lt 19)) {
    Write-Host "Node $nodeVersao e' antigo: o projeto precisa de 20.19 ou superior (recomendado 22)." -ForegroundColor Red
    exit 1
}
Write-Host "Node $nodeVersao" -ForegroundColor DarkGray

# git pull apenas se a branch atual acompanha uma branch remota.
if (-not $SemPull) {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    $remotoDaBranch = git config --get "branch.$branch.remote"
    if ($LASTEXITCODE -eq 0 -and $remotoDaBranch) {
        Etapa "git pull ($branch)"
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            Write-Host "git pull falhou (alteracoes locais em conflito?). Resolva ou use -SemPull." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Branch '$branch' sem remoto: pulando git pull." -ForegroundColor DarkGray
    }
}

# Instala dependencias se faltarem ou se o package-lock for mais novo que a instalacao.
$lockInstalado = "node_modules/.package-lock.json"
$precisaInstalar = (-not (Test-Path "node_modules")) -or (-not (Test-Path $lockInstalado)) -or
    ((Get-Item "package-lock.json").LastWriteTime -gt (Get-Item $lockInstalado).LastWriteTime)
if ($precisaInstalar) {
    Etapa "npm install"
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Host "npm install falhou." -ForegroundColor Red; exit 1 }
}

if ($Emulador) {
    # Emuladores do Firebase precisam de Java (17 ou superior).
    $java = Get-Command java -ErrorAction SilentlyContinue
    if (-not $java) {
        Write-Host "Java nao encontrado no PATH: os emuladores do Firestore e do Storage precisam dele (JDK 17+)." -ForegroundColor Red
        exit 1
    }

    Etapa "build das Functions (os emuladores carregam o codigo compilado)"
    npm run build -w apps/functions
    if ($LASTEXITCODE -ne 0) { Write-Host "Build das Functions falhou." -ForegroundColor Red; exit 1 }

    Etapa "subindo os emuladores em outra janela (painel: http://localhost:4000)"
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", "Set-Location '$PSScriptRoot'; npm run emulators")
    Write-Host "Aguardando os emuladores iniciarem..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 12

    Etapa "npm run dev:emulator"
    npm run dev:emulator
} else {
    if (-not (Test-Path ".env.homolog")) {
        Write-Host "Falta o arquivo .env.homolog (copie de .env.homolog.example e preencha), ou use ./iniciar.ps1 -Emulador." -ForegroundColor Red
        exit 1
    }
    Etapa "npm run dev (app local contra o projeto de homolog)"
    npm run dev
}
