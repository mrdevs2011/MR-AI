/* =====================================================================
   terminal.js — Bash terminal paneli (xterm.js + WebSocket).
   script.js'dan ko'chirildi: setTermStatus (827), openTerminal (832),
   closeTerminal (918), teardownTerminal (924).

   MUHIM: bu fayl `Terminal` va `FitAddon` global obyektlariga tayanadi —
   ular index.html'da <script> orqali CDN'dan yuklanadi (xterm.js),
   modul sifatida emas.
   ===================================================================== */

import { API_BASE, LOGIN_PASS, SESSION_ID } from '../state/store.js';
import { markActive } from '../auth/session.js';

const chatPanel = document.getElementById("chat-panel");
const bashBtn = document.getElementById("bash-btn");
const termPanel = document.getElementById("term-panel");
const termContainer = document.getElementById("term-container");
const termCloseBtn = document.getElementById("term-close-btn");
const termStatusDot = document.getElementById("term-status-dot");
const termStatusText = document.getElementById("term-status-text");

let termSocket = null;
let termInstance = null;
let termFitAddon = null;
let termResizeHandler = null;

export function setTermStatus(text, color) {
  termStatusText.textContent = text;
  termStatusDot.style.background = color;
}

export function openTerminal() {
  if (!API_BASE) return;
  chatPanel.classList.add("hidden");
  termPanel.classList.remove("hidden");
  termPanel.classList.add("flex");

  if (termSocket) return; // already connected/connecting, just switched view back to it

  termContainer.innerHTML = "";
  termInstance = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
    scrollback: 5000,
    theme: {
      background: "#0b0b0b",
      foreground: "#ececec",
      cursor: "#ececec",
      cursorAccent: "#0b0b0b",
      selectionBackground: "#3a3a3a",
      black: "#0b0b0b",
      red: "#f2555a",
      green: "#3fb950",
      yellow: "#e0a020",
      blue: "#4c9dff",
      magenta: "#c678dd",
      cyan: "#39c5cf",
      white: "#d4d4d4",
      brightBlack: "#6a6a6a",
      brightRed: "#ff7b80",
      brightGreen: "#56d364",
      brightYellow: "#f0c040",
      brightBlue: "#6fb3ff",
      brightMagenta: "#e0a0f0",
      brightCyan: "#5ee6f2",
      brightWhite: "#ffffff",
    },
  });
  termFitAddon = new FitAddon.FitAddon();
  termInstance.loadAddon(termFitAddon);
  termInstance.open(termContainer);
  termFitAddon.fit();

  setTermStatus("connecting...", "#e0a020");

  // Browser WebSocket API can't set custom headers on the handshake,
  // so auth travels as query params here instead of the X-Login-Pass /
  // X-Session-Id headers the rest of the app uses.
  const wsBase = API_BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const wsUrl = `${wsBase}/ws/term?pass=${encodeURIComponent(LOGIN_PASS)}&session=${encodeURIComponent(SESSION_ID)}`;
  const socket = new WebSocket(wsUrl);
  termSocket = socket;

  socket.addEventListener("open", () => {
    setTermStatus("connected", "#3fb950");
    markActive();
    const { cols, rows } = termInstance;
    socket.send(`\x01RESIZE:${cols},${rows}`);
    termInstance.focus();
  });
  socket.addEventListener("message", (evt) => {
    termInstance.write(evt.data);
  });
  socket.addEventListener("close", () => {
    setTermStatus("disconnected", "#f2555a");
    termSocket = null;
  });
  socket.addEventListener("error", () => {
    setTermStatus("connection error", "#f2555a");
  });

  termInstance.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  });

  termResizeHandler = () => {
    if (!termFitAddon) return;
    termFitAddon.fit();
    if (socket.readyState === WebSocket.OPEN) {
      const { cols, rows } = termInstance;
      socket.send(`\x01RESIZE:${cols},${rows}`);
    }
  };
  window.addEventListener("resize", termResizeHandler);
}

export function closeTerminal() {
  termPanel.classList.add("hidden");
  termPanel.classList.remove("flex");
  chatPanel.classList.remove("hidden");
}

export function teardownTerminal() {
  if (termSocket) {
    termSocket.close();
    termSocket = null;
  }
  if (termResizeHandler) {
    window.removeEventListener("resize", termResizeHandler);
    termResizeHandler = null;
  }
  if (termInstance) {
    termInstance.dispose();
    termInstance = null;
  }
  termFitAddon = null;
}

bashBtn.addEventListener("click", openTerminal);
termCloseBtn.addEventListener("click", () => {
  teardownTerminal();
  closeTerminal();
});
