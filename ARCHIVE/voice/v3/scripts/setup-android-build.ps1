# Auto-install Android SDK command-line tools and build a debug APK for Casa Companion.
# Run from the voice/v3 directory.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdkRoot = Join-Path $root 'tools\android-sdk'
$toolsDir = Join-Path $root 'tools'
$zipFile = Join-Path $toolsDir 'cmdline-tools.zip'
$cmdlineRoot = Join-Path $sdkRoot 'cmdline-tools'
$latestDir = Join-Path $cmdlineRoot 'latest'

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
New-Item -ItemType Directory -Force -Path $sdkRoot | Out-Null

# Skip download/extract if sdkmanager is already in place.
$sdkManager = Join-Path $latestDir 'bin\sdkmanager.bat'
if (!(Test-Path $sdkManager)) {
    if (!(Test-Path $zipFile)) {
        Write-Host "Downloading Android command-line tools..."
        Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -OutFile $zipFile -UseBasicParsing
    }

    # Clean previous partial extraction.
    if (Test-Path $cmdlineRoot) {
        Remove-Item -Recurse -Force $cmdlineRoot -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Force -Path $cmdlineRoot | Out-Null

    # Extract using Windows tar (more reliable than Expand-Archive with long paths).
    Write-Host "Extracting command-line tools..."
    $windowsTar = "C:\Windows\System32\tar.exe"
    & $windowsTar -xf $zipFile -C $cmdlineRoot

    # The zip extracts to cmdline-tools/; we need cmdline-tools/latest/.
    $extracted = Join-Path $cmdlineRoot 'cmdline-tools'
    if (Test-Path $extracted) {
        Move-Item -Path $extracted -Destination $latestDir -Force
    }
} else {
    Write-Host "Using existing Android command-line tools."
}

# Set environment for this session.
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:PATH = "$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:PATH"

# Accept licenses by piping a bunch of y's.
$yesFile = Join-Path $toolsDir 'yes.txt'
"y`n" * 100 | Set-Content -Path $yesFile -NoNewline
Write-Host "Accepting SDK licenses..."
Get-Content $yesFile | sdkmanager.bat --licenses

# Install required SDK components.
Write-Host "Installing SDK platforms and build-tools..."
Get-Content $yesFile | sdkmanager.bat 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'

# Tell Gradle where the SDK lives.
$localProps = Join-Path $root 'android\local.properties'
"sdk.dir=$($sdkRoot -replace '\\', '\\')" | Set-Content -Path $localProps

# Build the debug APK.
Write-Host "Building debug APK..."
$androidDir = Join-Path $root 'android'
Set-Location $androidDir
& .\gradlew.bat assembleDebug --no-daemon

Write-Host "Done. APK should be at: $root\android\app\build\outputs\apk\debug\app-debug.apk"
