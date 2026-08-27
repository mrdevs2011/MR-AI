/* =====================================================================
   chat-mode.js — composer ichidagi "Chat / Cowork" pill-toggle holati.
   composer-state.js (idle/generating) bilan ARALASHTIRILMAYDI — bu
   butunlay boshqa narsa: keyingi yuboriladigan xabar /chat'ga (oddiy,
   interaktiv) yoki /cowork/start'ga (fon, avtonom, ko'p bosqichli)
   ketishini belgilaydi. send-message.js shu holatni o'qib, qaysi
   endpoint'ga yuborishni tanlaydi.
   ===================================================================== */

const chatBtn = document.getElementById("chat-mode-chat-btn");
const coworkBtn = document.getElementById("chat-mode-cowork-btn");
const input = document.getElementById("message");

let currentMode = "chat"; // "chat" | "cowork"

const PLACEHOLDERS = {
  chat: "Write a message...",
  cowork: "Describe the task — I'll work on it in the background...",
};

export function getChatMode() {
  return currentMode;
}

export function setChatMode(mode) {
  currentMode = mode === "cowork" ? "cowork" : "chat";
  chatBtn?.classList.toggle("active", currentMode === "chat");
  coworkBtn?.classList.toggle("active", currentMode === "cowork");
  chatBtn?.setAttribute("aria-selected", String(currentMode === "chat"));
  coworkBtn?.setAttribute("aria-selected", String(currentMode === "cowork"));
  if (input) input.placeholder = PLACEHOLDERS[currentMode];
}

chatBtn?.addEventListener("click", () => setChatMode("chat"));
coworkBtn?.addEventListener("click", () => setChatMode("cowork"));
