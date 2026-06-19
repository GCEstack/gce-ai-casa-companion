#Requires -RunAsAdministrator
<#
    Casa Voice V3 — One-time setup script.
    Run this as Administrator. It installs dependencies, checks your .env file,
    and creates a "Casa Voice" shortcut on the desktop.
#>

$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa_voice_V3_dual"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Casa Voice.lnk"
$startScript = Join-Path $desktop "start-casa.ps1"

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║              Casa Voice V3 — Setup Wizard                  ║" -ForegroundColor Cyan
    Write-Host "║       Phone ↔ Wi-Fi Router ↔ This PC ↔ Bluetooth Speaker   ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

Write-Banner

# 1. Admin check
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This setup needs Administrator rights. Right-click → Run as administrator." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Python check
if (-not (Test-Command "python")) {
    Write-Host "Python is not installed or not in PATH. Install Python 3.10+ first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$pyVersion = python --version 2>&1
Write-Host "Found $pyVersion" -ForegroundColor Green

# 3. Make sure the project folder is where we expect
if (-not (Test-Path $projectRoot)) {
    Write-Host "Project folder not found at:`n  $projectRoot" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Set-Location $projectRoot

# 4. Install / upgrade dependencies
Write-Host "Installing Casa Voice dependencies..." -ForegroundColor Yellow
python -m pip install --upgrade pip | Out-Null
python -m pip install -e "." | Out-Null
Write-Host "Dependencies installed." -ForegroundColor Green

# 5. .env check
$envFile = Join-Path $projectRoot ".env"
$exampleFile = Join-Path $projectRoot ".env.example"

if (-not (Test-Path $envFile)) {
    Write-Host "No .env file found. Creating one from the template..." -ForegroundColor Yellow
    Copy-Item $exampleFile $envFile
    Write-Host "Created .env at $envFile" -ForegroundColor Yellow
    Write-Host "Please edit it and add your API keys, then run this setup again." -ForegroundColor Red
    Write-Host "Recommended: GROQ_API_KEY + OPENAI_API_KEY. Fallback: OPENROUTER_API_KEY." -ForegroundColor Cyan
    notepad $envFile
    Read-Host "Press Enter after saving .env"
}

# 6. Verify required keys
$envContent = Get-Content $envFile -Raw
function Test-EnvKey($name) {
    return ($envContent -match "$name\s*=\s*[^\s#]+") -and ($envContent -notmatch "$name\s*=\s*your_")
}

$hasGroq = Test-EnvKey "GROQ_API_KEY"
$hasOpenAI = Test-EnvKey "OPENAI_API_KEY"
$hasOpenRouter = Test-EnvKey "OPENROUTER_API_KEY"

$hasTTS = $hasOpenAI -or $hasOpenRouter

if ($hasGroq -and $hasOpenRouter) {
    Write-Host ".env looks good (Groq STT/LLM + OpenRouter TTS — recommended)." -ForegroundColor Green
} elseif ($hasGroq -and $hasOpenAI) {
    Write-Host ".env looks good (Groq STT/LLM + OpenAI TTS — optional fastest TTS)." -ForegroundColor Green
} elseif ($hasOpenRouter) {
    Write-Host ".env looks good (OpenRouter STT/TTS/LLM fallback)." -ForegroundColor Green
} else {
    Write-Host "Missing or placeholder API keys in .env." -ForegroundColor Red
    Write-Host "Add one of the following:" -ForegroundColor Cyan
    Write-Host "  - GROQ_API_KEY + OPENROUTER_API_KEY   (recommended, no OpenAI key needed)" -ForegroundColor Cyan
    Write-Host "  - OPENROUTER_API_KEY                  (fallback, all-in-one)" -ForegroundColor Cyan
    Write-Host "  - GROQ_API_KEY + OPENAI_API_KEY       (optional faster TTS)" -ForegroundColor Cyan
    notepad $envFile
    Read-Host "Press Enter to exit"
    exit 1
}

# 7. Create / update the desktop start script
if (-not (Test-Path $startScript)) {
    $sourceStart = Join-Path $projectRoot "scripts\start-casa.ps1"
    if (Test-Path $sourceStart) {
        Copy-Item $sourceStart $startScript -Force
        Write-Host "Created desktop start script: $startScript" -ForegroundColor Green
    } else {
        Write-Host "Warning: could not find scripts\start-casa.ps1" -ForegroundColor Yellow
    }
}

# 8. Create desktop shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$startScript`""
$Shortcut.WorkingDirectory = $projectRoot
$Shortcut.IconLocation = "powershell.exe,0"
$Shortcut.Description = "Start Casa Voice V3"
$Shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath" -ForegroundColor Green

Write-Host ""
Write-Host "Setup complete! " -ForegroundColor Green -NoNewline
Write-Host "Double-click the 'Casa Voice' shortcut on your desktop to start." -ForegroundColor Cyan
Write-Host ""

$startNow = Read-Host "Start Casa Voice now? (Y/n)"
if ($startNow -ne "n") {
    & $startScript
}
