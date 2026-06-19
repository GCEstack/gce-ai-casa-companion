#Requires -RunAsAdministrator
<#
    Casa Voice V3 — Start server and show easy connection info.
    Run this as Administrator. It opens the firewall, picks your local IP,
    and prints a QR code for the phone.
#>

$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa_voice_V3_dual"
$port = 8081

Set-Location $projectRoot

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║              Casa Voice V3 is starting...                  ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Show-QRCode {
    param([string]$Text)
    try {
        $qrScript = @"
import qrcode
url = r'''$Text'''
qr = qrcode.QRCode(border=1)
qr.add_data(url)
qr.make()
for row in qr.modules:
    print(''.join('##' if cell else '  ' for cell in row))
"@
        $ascii = python -c $qrScript 2>$null
        if ($ascii) {
            Write-Host "  Scan this QR code with your phone camera:" -ForegroundColor Yellow
            Write-Host $ascii
        }
    } catch {
        # qrcode not available — fall back to printing the URL
    }
}

Write-Banner

# Admin check
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Please run this script as Administrator." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check Python / uvicorn
if (-not (Test-Command "python") -or -not (Test-Command "uvicorn")) {
    Write-Host "Casa Voice isn't set up yet. Run 'Install Casa Voice.bat' first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check .env
$envFile = Join-Path $projectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "No .env file found. Run 'Install Casa Voice.bat' first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch "OPENROUTER_API_KEY\s*=\s*[^\s#]+" -or $envContent -match "OPENROUTER_API_KEY\s*=\s*your_openrouter") {
    Write-Host "OPENROUTER_API_KEY is missing or still set to the placeholder in .env" -ForegroundColor Red
    Write-Host "Add your real key, then try again." -ForegroundColor Red
    notepad $envFile
    Read-Host "Press Enter to exit"
    exit 1
}

# Kill any Python process already listening on the chosen port
$existing = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne 0 } | Select-Object -First 1
if ($existing) {
    $proc = Get-Process -Id $existing.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match "python") {
        Write-Host "Stopping old Casa Voice process (PID $($proc.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

# Get active local IP (prioritize DHCP Wi-Fi / Ethernet over loopback)
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    ($_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*") -and
    $_.PrefixOrigin -eq "Dhcp"
} | Select-Object -First 1).IPAddress

if (-not $ip) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*"
    } | Select-Object -First 1).IPAddress
}

if (-not $ip) {
    Write-Host "Could not detect your local Wi-Fi IP. Make sure you're connected to the router." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Open Windows Firewall for the chosen port
$ruleName = "Casa Voice $port"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
    Write-Host "Firewall opened for port $port." -ForegroundColor Green
} else {
    Write-Host "Firewall already open for port $port." -ForegroundColor Green
}

$phoneUrl = "http://$ip`:$port/client/audio-device.html?session_id=kitchen"
$dashboardUrl = "http://$ip`:$port/client/index.html?mode=dashboard&session_id=kitchen"

Write-Host ""
Write-Host "  🏠  Your Casa Voice server is ready on the home network" -ForegroundColor Green
Write-Host ""
Write-Host "  Phone (microphone) URL:" -ForegroundColor Yellow
Write-Host "  $phoneUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard URL:" -ForegroundColor Yellow
Write-Host "  $dashboardUrl" -ForegroundColor Cyan
Write-Host ""

Show-QRCode -Text $phoneUrl

Write-Host ""
Write-Host "  Steps:" -ForegroundColor Yellow
Write-Host "    1. Pair your Bluetooth speaker to your phone." -ForegroundColor White
Write-Host "    2. Open the Phone URL above on your phone (or scan the QR code)." -ForegroundColor White
Write-Host "    3. Tap 'Connect as Audio Device' and allow microphone access." -ForegroundColor White
Write-Host "    4. Say: 'Hey Casa, tell me a joke'" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C here to stop the server." -ForegroundColor DarkGray
Write-Host ""

# Optionally open dashboard on this PC
$openDashboard = Read-Host "Open dashboard on this computer now? (Y/n)"
if ($openDashboard -ne "n") {
    Start-Process $dashboardUrl
}

uvicorn main:app --host 0.0.0.0 --port $port
