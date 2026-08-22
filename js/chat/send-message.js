/* =====================================================================
   send-message.js — sendMessage() va uning composer wiring'i.
   script.js'dan ko'chirildi: sendMessage (2222), autoResizeInput
   wiring + Enter-to-send keydown (2285-2306).

   Roadmap Step 10 shu funksiyani "main.js ichida yoki alohida
   js/chat/send-message.js'da qoldirish mumkin, ikkalasi ham to'g'ri"
   deb belgilagan — shu yerga chiqarildi, chunki main.js'ni faqat
   orkestratsiya (import tartibi + DOMContentLoaded) uchun toza
   saqlash maqsadga muvofiq (Uch oltin qoida #3: main.js'ga to'g'ridan-
   to'g'ri kod yozilmaydi).

   MUHIM: bu fayl chat/, agent/, ui/ uchtasiga ham bog'liq — roadmap
   buni aynan shunday tasvirlagan (path autocomplete, image attach, va
   job polling shu yerdan chaqiriladi).
   ===================================================================== */

import { authHeaders, markActive } from '../auth/session.js';
import { API_BASE } from '../state/store.js';
import { getActiveChat } from './chat-storage.js';
import { setEmptyState } from './chat-history.js';
import { addMessage } from './message-render.js';
import { autoResizeInput } from '../utils/dom.js';
import { getPendingImageDataUrl, clearPendingImage } from '../ui/attach.js';
import { createThoughtPanel } from '../agent/thought-panel.js';
import { saveActiveJob, pollJob } from '../agent/job-polling.js';
import { resetOutputCardDedup } from './output-card.js';

const input = document.getElementById("message");
const sendBtn = document.getElementById("send");

export async function sendMessage() {
  if (!API_BASE) return;
  const message = input.value.trim();
  if (!message) return;

  // Yangi so'rov = yangi turn: output-card dedup xotirasini tozalab
  // qo'yamiz, aks holda bu turndagi "index.html" o'tgan turndagi
  // "index.html" kartochkasi bilan bir xil deb hisoblanib, ustidan
  // yozilib ketadi.
  resetOutputCardDedup();

  const active = getActiveChat();
  const category = (active && active.category) || "general";
  const filename = (active && active.filename) || "chat";
  const tier = document.getElementById("tier").value || "high";
  const mode = document.getElementById("mode").value || "general";
  const provider = document.getElementById("provider").value || "auto";

  // If an image is staged (see attach handler below), it rides along
  // with this one message so the model can look at it, then gets
  // cleared — same one-shot-per-turn behavior as typing a question
  // about a picture you just showed someone.
  const imageToSend = getPendingImageDataUrl();
  clearPendingImage();

  addMessage(message, "user");
  setEmptyState(false);
  input.value = "";
  autoResizeInput(input);
  sendBtn.disabled = true;

  const panel = createThoughtPanel(message);

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message, category, filename, tier, mode, provider, image: imageToSend || undefined })
    });

    if (res.status === 401) {
      panel.remove();
      const { handleAuthFailure } = await import('../auth/login.js');
      await handleAuthFailure(res);
      return;
    }
    markActive();

    const data = await res.json().catch(() => ({}));
    if (!data.job_id) {
      panel.remove();
      addMessage(data.error || "No job_id from backend.", "bot");
      return;
    }
    // job_id'ni localStorage'ga yozib qo'yamiz — shu bilan refresh
    // bossang ham, sahifani qayta ochsang ham, resumeActiveJobIfAny()
    // aynan shu ish qayerda qolgan bo'lsa, o'sha yerdan davom
    // ettirishni biladi, chunki ishning o'zi backend'da tirik.
    saveActiveJob(data.job_id, category, filename);
    await pollJob(data.job_id, panel, message);
  } catch (err) {
    panel.remove();
    addMessage("Couldn't reach the backend.\nTry again in a moment.", "bot");
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ---- composer textarea auto-grow (1 line -> up to ~200px, then scrolls) ----
input.addEventListener("input", () => autoResizeInput(input));
requestAnimationFrame(() => autoResizeInput(input));
