# Run the Casa-Pipecat voice agent on port 8001
$venv = "C:\Users\Dekan AI Brother\kid-voice-companion\backend\.venv\Scripts\uvicorn.exe"
$app = "main:app"
$listenHost = "127.0.0.1"
$listenPort = 8001

Set-Location -Path "C:\Users\Dekan AI Brother\casa-pipecat-voice-agent\backend\src"
& $venv $app --host $listenHost --port $listenPort --reload
