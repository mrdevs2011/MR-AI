/* =====================================================================
   message-render.js — chat pufakchalari (bubble), retry/confirm
   tugmalari, copy tugmasi, typewriter effekt.
   script.js'dan ko'chirildi: addMessage (1524), addMessageTyped (1879),
   escapeHtml (1844), addRetryButton (1751), addConfirmButton (1769),
   addDangerConfirmCard (1791), wireCopyButton (1858).

   Qo'shimcha (roadmap ro'yxatida yo'q, lekin shu funksiyalar uchun
   shart bo'lgan yordamchi konstantalar, qator 1851-1856): COPY_BTN_HTML,
   COPY_ICON, CHECK_ICON. Bular boshqa hech qayerda ishlatilmaydi,
   shuning uchun shu faylga qo'shildi.

   DIQQAT — bu faylda createThoughtPanel(), _detectLangJs(),
   _SENDING_LABEL YO'Q. Ular script.js'da fizik jihatdan shu funksiyalar
   ORASIDA joylashgan (qator 1684-1745), lekin roadmap ularni aniq
   Step 9'ga (agent/thought-panel.js) tayinlagan. Ularni bu yerga
   ko'chirmaslik — o'zboshimchalik emas, roadmap'ning o'ziga rioya qilish.

   Cross-module ko'priklar (Step 9-10 hali yo'q, achiq belgilangan):
   - addRetryButton() -> sendMessage() (main.js, Step 10)
   - addConfirmButton(), addDangerConfirmCard() -> confirmCommand()
     (agent/job-polling.js, Step 9)
   Ikkalasi ham window.X?.() orqali, Step 7'dagi bir xil pattern.
   ===================================================================== */

import { getActiveChat, saveChats } from './chat-storage.js';

function getEls() {
  return {
    chat: document.getElementById("chat-inner"),
    chatScroll: document.getElementById("chat"),
    input: document.getElementById("message"),
  };
}

const COPY_BTN_HTML = `
  <button type="button" class="msg-action-btn copy-btn" title="Copy">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>`;
const COPY_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function wireCopyButton(btn, text) {
  if (!btn) return;
  btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(text).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.classList.add("just-copied");
      btn.closest(".msg-actions")?.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove("just-copied");
        btn.closest(".msg-actions")?.classList.remove("copied");
      }, 1200);
    }).catch(() => {});
  });
}

export function addMessage(text, kind = "bot", persist = true) {
  const { chat, chatScroll } = getEls();
  const div = document.createElement("div");
  const isUser = kind === "user";
  const isPending = kind === "pending";
  const isError = kind === "error";
  div.className = `flex ${isUser ? "justify-end" : "justify-start"}`;
  if (isUser) {
    div.innerHTML = `
      <div class="max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed bubble-user">
        <pre class="whitespace-pre-wrap font-sans">${escapeHtml(text)}</pre>
      </div>`;
  } else if (isPending) {
    div.innerHTML = `
      <div class="max-w-full w-full text-[15px] leading-relaxed bubble-pending rounded-2xl px-4 py-2.5">
        <pre class="whitespace-pre-wrap font-sans">${escapeHtml(text)}</pre>
      </div>`;
  } else if (isError) {
    div.innerHTML = `
      <div class="max-w-full w-full text-[15px] leading-relaxed bubble-error rounded-2xl px-4 py-2.5">
        <pre class="whitespace-pre-wrap font-sans">${escapeHtml(text)}</pre>
      </div>`;
  } else {
    const html = (typeof marked !== "undefined")
      ? marked.parse(text, { breaks: true })
      : escapeHtml(text);
    div.innerHTML = `
      <div class="max-w-full w-full">
        <div class="text-[15px] bubble-bot prose-bot">${html}</div>
        <div class="msg-actions">${COPY_BTN_HTML}</div>
      </div>`;
  }
  chat.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;

  if (!isUser && !isPending && !isError) {
    wireCopyButton(div.querySelector(".copy-btn"), text);
  }

  if (persist) {
    const active = getActiveChat();
    if (active) {
      active.messages.push({ text, kind });
      if (isUser && active.title === "New chat") {
        active.title = text.slice(0, 40);
        import('./chat-history.js').then(({ renderChatHistory, updateChatTitle }) => {
          renderChatHistory();
          updateChatTitle();
        });
      }
      saveChats();
    }
  }
  return div;
}

// OpenRouter (bepul model) band bo'lib chaqiruv butunlay
// muvaffaqiyatsiz tugaganda backend "error" kind yuboradi.
export function addRetryButton(originalMessage) {
  const { chat, chatScroll, input } = getEls();
  const div = document.createElement("div");
  div.className = "flex justify-start";
  div.innerHTML = `
    <button class="bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[13px] px-4 py-2 rounded-full transition">
      Qayta urinib ko'rish
    </button>`;
  div.querySelector("button").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "sending...";
    div.remove();
    input.value = originalMessage;
    // main.js Step 10'gacha mavjud emas — window orqali (Step 7 pattern).
    await window.sendMessage?.();
  });
  chat.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

export function addConfirmButton(commandId) {
  const { chat, chatScroll } = getEls();
  const div = document.createElement("div");
  div.className = "flex justify-start";
  div.innerHTML = `
    <button class="bg-amber-600 hover:bg-amber-500 text-[13px] px-4 py-2 rounded-full transition" data-cmdid="${commandId}">
      Confirm and run
    </button>`;
  div.querySelector("button").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "running...";
    // agent/job-polling.js Step 9'gacha mavjud emas — window orqali.
    await window.confirmCommand?.(commandId);
    div.remove();
  });
  chat.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// Qaytarib bo'lmaydigan xavfli komandalar uchun: tugma yetarli emas,
// foydalanuvchi komandani ANIQ qayta o'zi qo'lda yozishi kerak.
export function addDangerConfirmCard(commandId, commandText) {
  const { chat, chatScroll } = getEls();
  const div = document.createElement("div");
  div.className = "flex justify-start";
  div.innerHTML = `
    <div class="max-w-full w-full rounded-2xl px-4 py-3 space-y-2" style="background:#3a1414; border:1px solid #5c1f1f;">
      <div class="text-[13px] font-semibold" style="color:#ff6b6b;">
        DANGEROUS, IRREVERSIBLE COMMAND
      </div>
      <div class="text-[13px] font-mono px-2 py-1.5 rounded" style="background:#1a0d0d; color:#ffb4b4; white-space:pre-wrap; word-break:break-all;">${escapeHtml(commandText)}</div>
      <div class="text-[12px]" style="color:#e8a0a0;">Retype the command EXACTLY to confirm:</div>
      <input type="text" class="danger-typed w-full bg-transparent border rounded px-2 py-1.5 text-[13px] font-mono focus:outline-none" style="border-color:#5c1f1f; color:#ffb4b4;" placeholder="${escapeHtml(commandText)}" autocomplete="off" spellcheck="false" />
      <div class="danger-error text-[12px] hidden" style="color:#ff6b6b;">Doesn't match — try again.</div>
      <button class="danger-btn w-full bg-red-800 text-[13px] px-4 py-2 rounded-full transition opacity-40 cursor-not-allowed" disabled>
        Confirm and run
      </button>
    </div>`;

  const inputEl = div.querySelector(".danger-typed");
  const btn = div.querySelector(".danger-btn");
  const errorEl = div.querySelector(".danger-error");

  function refreshBtnState() {
    const match = inputEl.value === commandText;
    btn.disabled = !match;
    btn.classList.toggle("opacity-40", !match);
    btn.classList.toggle("cursor-not-allowed", !match);
    btn.classList.toggle("bg-red-800", !match);
    btn.classList.toggle("bg-red-600", match);
    btn.classList.toggle("hover:bg-red-500", match);
  }
  inputEl.addEventListener("input", () => {
    errorEl.classList.add("hidden");
    refreshBtnState();
  });

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "running...";
    // agent/job-polling.js Step 9'gacha mavjud emas — window orqali.
    const ok = await window.confirmCommand?.(commandId, inputEl.value);
    if (ok) {
      div.remove();
    } else {
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Confirm and run";
    }
  });

  chat.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// Cosmetic typewriter reveal for final bot replies.
export function addMessageTyped(text) {
  const { chat, chatScroll } = getEls();
  const div = document.createElement("div");
  div.className = "flex justify-start";
  const container = document.createElement("div");
  container.className = "max-w-full w-full";
  const inner = document.createElement("div");
  inner.className = "text-[15px] bubble-bot prose-bot";
  container.appendChild(inner);
  div.appendChild(container);
  chat.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;

  function finish() {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.innerHTML = COPY_BTN_HTML;
    container.appendChild(actions);
    wireCopyButton(actions.querySelector(".copy-btn"), text);

    const active = getActiveChat();
    if (active) {
      active.messages.push({ text, kind: "bot" });
      saveChats();
    }
  }

  // Kod bloki (```...```) bo'lgan javoblarda harf-baharf slice qilib
  // marked.parse()ga berish xato: yarim ochilgan fence noto'g'ri, chala
  // parse qilinadi. Shuning uchun bunday javoblarda animatsiyani
  // o'tkazib yuborib, to'liq matnni bir martada render qilamiz.
  if (text.includes("```")) {
    inner.innerHTML = (typeof marked !== "undefined")
      ? marked.parse(text, { breaks: true })
      : escapeHtml(text);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    finish();
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let i = 0;
    const msPerChar = 28;
    let lastTime = null;

    function tick(now) {
      if (lastTime === null) lastTime = now;
      const elapsed = now - lastTime;
      const charsToShow = Math.min(text.length, Math.floor(elapsed / msPerChar));
      if (charsToShow > i) {
        i = charsToShow;
        const slice = text.slice(0, i);
        inner.innerHTML = (typeof marked !== "undefined")
          ? marked.parse(slice, { breaks: true })
          : escapeHtml(slice);
        chatScroll.scrollTop = chatScroll.scrollHeight;
      }
      if (i < text.length) {
        requestAnimationFrame(tick);
      } else {
        finish();
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}
