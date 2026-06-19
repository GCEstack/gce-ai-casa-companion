# Casa Voice V3 — start server + public HTTPS tunnel for phone testing.
#
# Why: browsers block microphone access on http://<local-ip> because it's not a
# secure context. localtunnel gives you a public https:// URL so the phone mic works.
#
# Usage:
#   Right-click this file -> "Run with PowerShell"
# Then open the printed https:// URL on your phone and click the localtunnel
# "Click to Continue" button. Navigate to:
#   /client/audio-device.html?session_id=kitchen
#
# Note: localtunnel is a public relay — don't use it for real conversations.

$project = "C:\Users\Dekan AI Brother\Projects\ACTIVE\apps-platforms\casa-companion\casa_voice_V3_dual"
Set-Location $project

# Start uvicorn in a minimized window so it keeps running.
Start-Process powershell `
    -ArgumentList "-NoExit", "-Command", "cd '$project'; uvicorn main:app --host 0.0.0.0 --port 8081" `
    -WindowStyle Minimized

Write-Host "Starting HTTPS tunnel to localhost:8081 ..." -ForegroundColor Green
Write-Host "On your phone, open the URL below, tap 'Click to Continue', then go to /client/audio-device.html?session_id=kitchen" -ForegroundColor Yellow

# --yes accepts the install prompt if localtunnel isn't already cached.
npx --yes localtunnel --port 8081
