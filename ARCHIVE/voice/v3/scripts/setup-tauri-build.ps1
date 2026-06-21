#!/usr/bin/env pwsh
# Auto-install Rust via rustup and build the Tauri desktop app for Casa Companion.
# Run from the voice/v3 directory.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $root 'tools'
$rustRoot = Join-Path $toolsDir 'rust'
$rustupHome = Join-Path $rustRoot 'rustup'
$cargoHome = Join-Path $rustRoot 'cargo'
$rustupInit = Join-Path $toolsDir 'rustup-init.exe'

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
New-Item -ItemType Directory -Force -Path $rustRoot | Out-Null

$env:RUSTUP_HOME = $rustupHome
$env:CARGO_HOME = $cargoHome
$env:PATH = "$cargoHome\bin;$env:PATH"

# Download rustup-init if needed.
if (!(Test-Path $rustupInit)) {
    Write-Host "Downloading rustup-init..."
    Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $rustupInit -UseBasicParsing
}

# Install Rust if not already present.
if (!(Test-Path "$cargoHome\bin\cargo.exe")) {
    Write-Host "Installing Rust toolchain..."
    & $rustupInit -y --default-toolchain stable --profile minimal --default-host x86_64-pc-windows-msvc
}

# Ensure cargo is usable.
$env:PATH = "$cargoHome\bin;$env:PATH"

# Build Tauri.
Write-Host "Building Tauri desktop app..."
Set-Location $root
npm run tauri:build

Write-Host "Done. EXE should be at: $root\src-tauri\target\release\CasaCompanion.exe"
