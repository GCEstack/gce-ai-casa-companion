/**
 * Casa Companion WebSocket Relay
 *
 * Simple broadcast relay that lets the ESP32-S3 firmware and the React frontend
 * talk to each other through a shared public endpoint.
 *
 * Deployment options:
 *   - Local dev:   node ws-relay.js           (ws://localhost:8080)
 *   - Render:      push this file to a Render Web Service (wss://casa-relay.onrender.com)
 *   - Railway/fly: similar, set PORT env var
 *
 * Protocol: JSON messages as defined in firmware/main/common.h
 *   device -> relay -> frontend  { type: "voice_stream", data: "<base64_pcm>", character: "coniglio" }
 *   frontend -> relay -> device  { type: "voice_input", data: "<base64_pcm>" }
 *   frontend -> relay -> device  { type: "mode_select", mode: "story-time", character: "coniglio" }
 *   frontend -> relay -> device  { type: "connect", character: "coniglio" }
 *   device -> relay -> frontend  { type: "status", state: "online|offline|listening|speaking", battery: 85 }
 *   device -> relay -> frontend  { type: "mode_change", mode: "story-time" }
 */

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const PING_INTERVAL_MS = 30000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'casa-companion-relay',
    status: 'ok',
    connections: wss.clients.size,
  }));
});

const wss = new WebSocket.Server({ server });

function broadcast(sender, data, isBinary) {
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
      sent++;
    }
  });
  return sent;
}

function logMessage(direction, data, isBinary) {
  if (isBinary) {
    console.log(`[${direction}] binary ${data.length} bytes`);
    return;
  }
  const text = data.toString('utf8');
  // Truncate very long voice_stream payloads so logs stay readable.
  let preview = text;
  try {
    const obj = JSON.parse(text);
    if (obj.type === 'voice_stream' && obj.data && obj.data.length > 80) {
      obj.data = obj.data.substring(0, 80) + '...';
      preview = JSON.stringify(obj);
    }
  } catch (e) {
    // Not JSON, leave as-is.
  }
  console.log(`[${direction}] ${preview}`);
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`Client connected from ${ip}, total clients: ${wss.clients.size}`);

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data, isBinary) => {
    const receivedCount = wss.clients.size;
    const sentCount = broadcast(ws, data, isBinary);
    logMessage('relay', data, isBinary);
    if (sentCount === 0) {
      console.log('  -> no other clients connected to receive message');
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected, total clients: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// Keep-alive / dead-connection cleanup.
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(pingInterval);
});

server.listen(PORT, () => {
  console.log(`Casa Companion relay listening on port ${PORT}`);
  console.log(`Local dev URI: ws://localhost:${PORT}`);
});
