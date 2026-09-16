// Database-free smoke check. Builds must already exist; never loads repository .env files.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const port = 13001;
const base = `http://127.0.0.1:${port}`;
const api = spawn(process.execPath, [path.resolve(__dirname, '../apps/api/dist/index.js')], {
  cwd: os.tmpdir(),
  env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    NODE_ENV: 'production', PORT: String(port),
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
    JWT_SECRET: 'smoke-test-only-secret', RESEND_API_KEY: 're_test_only',
    CORS_ORIGIN: 'http://localhost:5173,https://frontend.example',
    CLIENT_URL: 'https://frontend.example',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
api.stdout.on('data', (chunk) => { output += chunk; });
api.stderr.on('data', (chunk) => { output += chunk; });
const sockets = [];
async function connected(socket) {
  await Promise.race([
    once(socket, 'connect'),
    once(socket, 'connect_error').then(([error]) => { throw error; }),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 8000);
      timer.unref();
    }),
  ]);
}

(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 600; i++) {
      if (api.exitCode !== null) throw new Error(`API exited: ${output}`);
      if (output.includes('Server is running')) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `API startup timed out: ${output}`);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'smart-qr-api' });
    for (const origin of ['http://localhost:5173', 'https://frontend.example', 'https://untrusted.example']) {
      const response = await fetch(`${base}/health`, { headers: { Origin: origin } });
      assert.equal(response.headers.get('access-control-allow-origin'),
        origin.includes('untrusted') ? null : origin);
    }
    const handshake = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: 'https://frontend.example' },
    });
    assert.equal(handshake.headers.get('access-control-allow-origin'), 'https://frontend.example');
    assert.ok((await handshake.text()).startsWith('0'));
    for (const transports of [['polling'], ['websocket'], ['polling', 'websocket']]) {
      const socket = io(base, {
        transports, auth: { guestId: 'migration-smoke-test' },
        extraHeaders: { Origin: 'https://frontend.example' },
        reconnectionDelay: 50,
      });
      sockets.push(socket);
      await connected(socket);
      if (transports.length === 2 && socket.io.engine.transport.name !== 'websocket') {
        await once(socket.io.engine, 'upgrade');
        assert.equal(socket.io.engine.transport.name, 'websocket');
      }
      const reconnected = connected(socket);
      socket.io.engine.close();
      await reconnected;
      socket.disconnect();
    }
    console.log('PASS: health, HTTP CORS, Socket.IO CORS, polling, WebSocket, upgrade, reconnect');
  } finally {
    for (const socket of sockets) socket.disconnect();
    api.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
