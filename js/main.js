/* =====================================================================
   main.js — ENTRY POINT, orkestratsiya. Barcha modullarni to'g'ri
   tartibda import qiladi va asl DOMContentLoaded/boot ketma-ketligini
   saqlaydi.
   script.js'dan ko'chirildi: setGreeting (948), showApp (955),
   newChatBtn click listener (812), va eng oxirgi boot IIFE
   (2709-2718: loadTunnelUrl() + tryAutoLogin()).

   IMPORT TARTIBI MUHIM:
   1) composer.js birinchi — u #mode/#tier/#message/#send DOM
      elementlarini yaratadi, boshqa modullar shularni getElementById
      bilan qidiradi.
   2) selects.js, sidebar.js, terminal.js — o'zini avtomatik ishga
      tushiradigan modullar (top-level side-effect bor), composer
      tayyor bo'lgandan keyin yuklanishi kerak.
   3) attach.js — composer ichidagi #attach-btn'ga bog'liq.
   4) send-message.js — hammasidan keyin, chunki sendMessage() ularning
      barchasini ishlatadi.
   5) auth/session.js, auth/login.js — mustaqil, lekin showApp()
      window'ga yozilishi kerak ULAR chaqirilishidan OLDIN (login.js
      submitOtp() va session.js tryAutoLogin() ikkalasi ham
      window.showApp() orqali chaqiradi).

   window.showApp, window.sendMessage, window.confirmCommand,
   window.closeSidebarOnMobile, window.teardownTerminal,
   window.closeTerminal — bular Step 7-9'dagi fayllarda "hali mavjud
   emas" deb belgilangan cross-module ko'priklar edi. Endi main.js
   ularning barchasini haqiqiy funksiyalarga bog'laydi.
   ===================================================================== */

import './ui/composer.js';
import './ui/selects.js';
import './ui/sidebar.js';
import './ui/terminal.js';
import './ui/attach.js';

import { sendMessage } from './chat/send-message.js';
import { closeSidebarOnMobile } from './ui/sidebar.js';
import { teardownTerminal, closeTerminal } from './ui/terminal.js';
import { confirmCommand, resumeActiveJobIfAny } from './agent/job-polling.js';
import { loadChats } from './chat/chat-storage.js';
import { ensureActiveChat } from './chat/chat-storage.js';
import { tryAutoLogin } from './auth/session.js';
import { loadTunnelUrl } from './auth/login.js';
import { startWakeWordListener } from './voice/wakeword.js';

// Cross-module ko'priklar — Step 7-9'dagi fayllar bularni
// window.X?.() orqali "hali yo'q" deb optional-chain qilib chaqirgan
// edi (bir xil pattern). Endi barchasi haqiqiy funksiyalarga ulanadi.
window.sendMessage = sendMessage;
window.closeSidebarOnMobile = closeSidebarOnMobile;
window.teardownTerminal = teardownTerminal;
window.closeTerminal = closeTerminal;
window.confirmCommand = confirmCommand;

const bootScreen = document.getElementById("boot-screen");
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const tunnelStatus = document.getElementById("tunnel-status");
const chatHistoryEl = document.getElementById("chat-history");
const welcomeEl = document.getElementById("welcome");
const newChatBtn = document.getElementById("new-chat-btn");
const input = document.getElementById("message");

// ---- empty-state greeting, time-of-day aware like Claude's own
// "Good morning/afternoon/evening" welcome. ----
function setGreeting() {
  if (!welcomeEl) return;
  const h = new Date().getHours();
  const part = h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  welcomeEl.textContent = `Good ${part}. What are we building today?`;
}

async function showApp() {
  bootScreen.classList.add("hidden");
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  tunnelStatus.textContent = "connected";
  tunnelStatus.classList.add("text-green-500");
  chatHistoryEl.innerHTML = `<p class="text-xs text-gray-600 px-2 py-1">loading chats...</p>`;
  setGreeting();
  await loadChats();
  await ensureActiveChat();
  input.focus();

  // "Hey Agent" wake-word listener — auth muvaffaqiyatli bo'lgandagina
  // (ya'ni shu showApp() chaqirilganda) mikrofon tinglashni boshlaydi.
  // Logout bo'lganda auth/session.js doLogout() ichida to'xtatiladi.
  startWakeWordListener();

  // Sahifa (qayta) ochilganda — agar oldingi urinishda javob kutib
  // turgan job qolgan bo'lsa (refresh, tab yopilishi, boshqa
  // qurilmadan kirish), shu yerdan avtomatik davom ettiramiz. Bu
  // qism butun fix'ning yuragi: ish backend'da hech qachon to'xtamagan,
  // faqat UI uni ko'rsatishni to'xtatgan edi — shuni tiklaymiz.
  resumeActiveJobIfAny();
}
// login.js/session.js Step 7'da "showApp() Step 10'gacha script.js'da
// global qoladi" deb belgilagan edi — endi shu yerda haqiqiy
// funksiyaga bog'lanadi.
window.showApp = showApp;

newChatBtn.addEventListener("click", async () => {
  const { createNewChat } = await import('./chat/chat-storage.js');
  createNewChat();
});

document.addEventListener('DOMContentLoaded', async () => {
  // Tunnel URL HECH QACHON keshlanmaydi — har boot'da to'g'ridan-to'g'ri
  // Firestore'dan o'qiladi. Cloudflared quick tunnel har restart'da
  // yangi random subdomen beradi, shuning uchun eski keshdagi URL bilan
  // urinish har doim DNS xatosiga olib kelishi mumkin (ERR_NAME_NOT_RESOLVED).
  // Parol/token bundan mustasno — ular sessiyalar orasida o'zgarmaydi,
  // shuning uchun localStorage'da qolaveradi (auto-login tezligi uchun).
  await loadTunnelUrl();
  await tryAutoLogin();
});
