'use strict';
/**
 * Companion view: the same answers, on your phone.
 *
 * Why this exists: on a GPU without Windows Graphics Capture, a window CANNOT be
 * excluded from an entire-screen capture. Measured on a 2012 Windows laptop, twice,
 * through the real getDisplayMedia API and again with WGC forced -- the overlay
 * always leaves a dark rectangle. No window flag fixes that.
 *
 * The only way to be invisible in every share mode is to not be on the shared
 * screen at all. So we serve the live transcript and the answer over the local
 * network, and you read them off a phone lying next to the laptop. Nothing is on
 * screen, so there is nothing to capture -- entire screen, window, tab, or a
 * recording made by the other side.
 *
 * Bound to the LAN, protected by a random token in the URL, and only reachable
 * while a meeting is running.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { WebSocketServer } = require('ws');

const PAGE = path.join(__dirname, '..', 'companion', 'index.html');

/** Best-guess LAN address, so the printed URL is one a phone can actually reach. */
function lanAddress() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Prefer real Wi-Fi/Ethernet over virtual adapters (VirtualBox, WSL, VPNs).
      const virt = /virtual|vmware|vbox|hyper-v|loopback|wsl|docker|tap|tun/i.test(name);
      candidates.push({ address: a.address, virt, name });
    }
  }
  candidates.sort((a, b) => Number(a.virt) - Number(b.virt));
  return candidates.length ? candidates[0].address : '127.0.0.1';
}

class Companion {
  constructor() {
    this.server = null;
    this.wss = null;
    this.port = null;
    this.token = null;
    this.clients = new Set();
    this.history = [];          // replayed to a phone that connects mid-meeting
    this.enabled = false;
  }

  get url() {
    if (!this.port) return null;
    return `http://${lanAddress()}:${this.port}/?k=${this.token}`;
  }

  get connected() {
    return this.clients.size;
  }

  start(port = 8899) {
    if (this.server) return this.url;
    this.token = crypto.randomBytes(8).toString('hex');

    this.server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.searchParams.get('k') !== this.token) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Not for you.');
      }
      if (u.pathname !== '/' && u.pathname !== '/index.html') {
        res.writeHead(404);
        return res.end();
      }
      let html;
      try { html = fs.readFileSync(PAGE, 'utf8'); }
      catch (e) { res.writeHead(500); return res.end(String(e.message)); }
      html = html.replace('__TOKEN__', this.token);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    });

    this.wss = new WebSocketServer({ noServer: true });
    this.server.on('upgrade', (req, socket, head) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.searchParams.get('k') !== this.token) { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.clients.add(ws);
        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
        // Catch the phone up on what it missed.
        for (const m of this.history.slice(-40)) {
          try { ws.send(JSON.stringify(m)); } catch { /* ignore */ }
        }
      });
    });

    this.server.listen(port, '0.0.0.0');
    this.port = port;
    this.enabled = true;
    return this.url;
  }

  send(type, payload) {
    if (!this.enabled) return;
    const msg = { t: type, ...payload };
    // Keep only what a late-joining phone needs to make sense of the meeting.
    if (type === 'turn' || type === 'answer' || type === 'suggest') {
      this.history.push(msg);
      if (this.history.length > 120) this.history = this.history.slice(-80);
    }
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      try { ws.send(data); } catch { this.clients.delete(ws); }
    }
  }

  clearHistory() {
    this.history = [];
  }

  stop() {
    this.enabled = false;
    for (const ws of this.clients) { try { ws.close(); } catch { /* ignore */ } }
    this.clients.clear();
    try { this.wss && this.wss.close(); } catch { /* ignore */ }
    try { this.server && this.server.close(); } catch { /* ignore */ }
    this.server = null;
    this.wss = null;
    this.port = null;
  }
}

module.exports = { Companion, lanAddress };
