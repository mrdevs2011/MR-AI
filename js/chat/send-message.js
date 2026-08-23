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
import { addMessage, activateQueuedMessage } from './message-render.js';
import { autoResizeInput } from '../utils/dom.js';
import { getPendingImageDataUrl, clearPendingImage } from '../ui/attach.js';
import { createThoughtPanel } from '../agent/thought-panel.js';
import { saveActiveJob, pollJob, cancelCurrentJob } from '../agent/job-polling.js';
import { resetOutputCardDedup } from './output-card.js';
import { setComposerState } from './composer-state.js';

const input = document.getElementById("message");
const sendBtn = document.getElementById("send");

// MESSAGE QUEUE: AI hali oldingi job'ni ("generating") tugatmagan
// paytda foydalanuvchi yana biror narsa yozib yuborsa, uni darhol
// backend'ga otib yubormaymiz (ikkita job bir vaqtda tirbandlik
// qilmasin), lekin foydalanuvchini ham kutdirib qo'ymaymiz — xabar
// KULRANG (queued) holatda chatga darhol chiqadi, navbatga (bu
// modul-darajasidagi array) qo'shiladi. dispatchMessage() joriy
// job tugagach (pollJob resolve bo'lgach) o'zining finally blokida
// processQueueNext()ni chaqiradi — shu yerda navbatdagi xabar
// aktivlashadi (kulrang -> normal) va aynan shu funksiya orqali
// haqiqatan ham backend'ga yuboriladi. Bitta array bo'lgani uchun
// ketma-ket kelgan bir nechta xabar ham tartib bilan, birma-bir
// ishlanadi.
const messageQueue = [];

function isGenerating() {
  return sendBtn.dataset.state === "generating";
}

// dispatchMessage — HAQIQIY yuborish: fetch /chat, panel, pollJob.
// Ikki joydan chaqiriladi: (1) sendMessage() to'g'ridan-to'g'ri, agent
// bo'sh bo'lsa; (2) processQueueNext(), navbatdagi xabar uchun.
// queuedBubble berilsa (holat #2), yangi user pufakchasi chizmaydi —
// o'rniga o'sha kulrang pufakchani joyida normal holatga o'tkazadi.
async function dispatchMessage(message, imageToSend, settings, queuedBubble) {
  resetOutputCardDedup();

  const { category, filename, tier, mode, provider } = settings;

  if (queuedBubble) {
    activateQueuedMessage(queuedBubble, message);
  } else {
    addMessage(message, "user");
  }
  setEmptyState(false);

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
    input.focus();
    // Joriy job (shu jumladan mana shu dispatchMessage() o'zi
    // boshlagani) endi tugadi — composer "idle"ga qaytdi (pollJob
    // stopPolling()'i buni allaqachon qo'ygan). Navbatda kutib turgan
    // xabar bo'lsa, shuni endi ishga tushiramiz.
    processQueueNext();
  }
}

function processQueueNext() {
  if (isGenerating()) return; // xavfsizlik uchun — hali band bo'lsa, tegmaymiz
  const next = messageQueue.shift();
  if (!next) return;
  dispatchMessage(next.message, next.imageToSend, next.settings, next.bubble);
}

export async function sendMessage() {
  if (!API_BASE) return;
  const message = input.value.trim();
  if (!message) return;

  const active = getActiveChat();
  const settings = {
    category: (active && active.category) || "general",
    filename: (active && active.filename) || "chat",
    tier: document.getElementById("tier").value || "high",
    mode: document.getElementById("mode").value || "general",
    provider: document.getElementById("provider").value || "auto",
  };

  // If an image is staged (see attach handler below), it rides along
  // with this one message so the model can look at it, then gets
  // cleared — same one-shot-per-turn behavior as typing a question
  // about a picture you just showed someone.
  const imageToSend = getPendingImageDataUrl();
  clearPendingImage();

  input.value = "";
  autoResizeInput(input);

  if (isGenerating()) {
    // AI hozir band — xabarni kulrang holda chatga chiqaramiz va
    // navbatga qo'yamiz. persist=false: hali backend'ga yuborilmagan,
    // shuning uchun chat tarixiga ham hali yozilmaydi (activateQueuedMessage
    // buni navbat ishga tushganda o'zi qiladi).
    const bubble = addMessage(message, "user-queued", false);
    setEmptyState(false);
    messageQueue.push({ message, imageToSend, settings, bubble });
    return;
  }

  await dispatchMessage(message, imageToSend, settings, null);
}

sendBtn.addEventListener("click", () => {
  // STATE MACHINE BRANCH: bitta tugma, ikki xatti-harakat. dataset.state
  // — yagona haqiqat manbai (setComposerState() yozadi), shuning uchun
  // bu yerda alohida "hozir job ketyaptimi" flag'i tekshirilmaydi —
  // agar ikkalasi sinxronizatsiyadan chiqib qolsa, xatoni topish
  // qiyinlashadi. Faqat shu dataset'ni o'qiymiz.
  if (sendBtn.dataset.state === "generating") {
    cancelCurrentJob();
  } else {
    sendMessage();
  }
});
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ---- composer textarea auto-grow (1 line -> up to ~200px, then scrolls) ----
input.addEventListener("input", () => autoResizeInput(input));
requestAnimationFrame(() => autoResizeInput(input));

// Boshlang'ich holat — sahifa yuklanganda tugma "idle" (strelka).
// resumeActiveJobIfAny() (job-polling.js, agar refresh'dan keyin
// tugallanmagan job qolgan bo'lsa) buni keyinroq "generating"ga
// o'zgartiradi — qarang: job-polling.js'dagi resumeActiveJobIfAny().
setComposerState("idle");
