$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "backend")

$venvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"
$venvWorks = $false
if (Test-Path $venvPython) {
    & $venvPython --version *> $null
    $venvWorks = ($LASTEXITCODE -eq 0)
}

if (-not $venvWorks) {
    if (Test-Path ".venv") { Remove-Item -Recurse -Force ".venv" }
    Write-Host "Creating SYNAPSE virtual environment with Python 3.11..." -ForegroundColor Cyan
    py -3.11 -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.11 was not found by the Python launcher. Check with: py -0p"
    }
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }

if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
    Write-Host "Created backend\.env. Add your OpenRouter and Tavily keys, save, then run this script again." -ForegroundColor Yellow
    Start-Process notepad.exe (Join-Path (Get-Location) ".env")
    exit
}

& $venvPython -m uvicorn app.main:app --reload --port 8000
