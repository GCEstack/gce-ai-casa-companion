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
 * Authentication (production):
 *   - Set the RELAY_TOKEN env var to a long random secret.
 *   - Every client must send { "type": "auth", "token": "..." } within 5 seconds
 *     of connecting. Unauthenticated clients are disconnected and cannot
 *     broadcast or receive messages.
 *   - If RELAY_TOKEN is not set, the relay runs unauthenticated (local-dev behavior).
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
const RELAY_TOKEN = process.env.RELAY_TOKEN;
const AUTH_TIMEOUT_MS = 5000;
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
    if (client !== sender && client.authenticated && client.readyState === WebSocket.OPEN) {
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

function closeWithReason(ws, code, reason) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close(code, reason);
  } else {
    ws.terminate();
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.isAlive = true;
  ws.authenticated = !RELAY_TOKEN;

  if (RELAY_TOKEN) {
    ws.authTimer = setTimeout(() => {
      console.log(`Authentication timeout for client ${ip}; closing connection`);
      closeWithReason(ws, 1008, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);
  }

  console.log(`Client connected from ${ip}, authenticated: ${ws.authenticated}, total clients: ${wss.clients.size}`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data, isBinary) => {
    if (RELAY_TOKEN && !ws.authenticated) {
      if (isBinary) {
        console.log(`Rejecting binary message from unauthenticated client ${ip}`);
        closeWithReason(ws, 1008, 'Authentication required');
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString('utf8'));
      } catch (e) {
        console.log(`Rejecting invalid JSON from unauthenticated client ${ip}`);
        closeWithReason(ws, 1008, 'Invalid JSON');
        return;
      }

      if (message && message.type === 'auth' && message.token === RELAY_TOKEN) {
        ws.authenticated = true;
        if (ws.authTimer) {
          clearTimeout(ws.authTimer);
          ws.authTimer = null;
        }
        console.log(`Client ${ip} authenticated successfully`);
      } else {
        console.log(`Rejecting unauthenticated client ${ip} (invalid auth message)`);
        closeWithReason(ws, 1008, 'Authentication required');
      }
      return;
    }

    const sentCount = broadcast(ws, data, isBinary);
    logMessage('relay', data, isBinary);
    if (sentCount === 0) {
      console.log('  -> no other authenticated clients connected to receive message');
    }
  });

  ws.on('close', () => {
    if (ws.authTimer) {
      clearTimeout(ws.authTimer);
      ws.authTimer = null;
    }
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
  if (!RELAY_TOKEN) {
    console.warn('WARNING: RELAY_TOKEN is not set; relay is running unauthenticated');
  } else {
    console.log('Authentication enabled: clients must send { type: "auth", token: "..." } within 5 seconds');
  }
});
