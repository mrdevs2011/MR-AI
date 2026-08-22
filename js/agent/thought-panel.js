/* =====================================================================
   thought-panel.js — "jonli fikrlash" paneli (thinking indicator + log).
   script.js'dan ko'chirildi: createThoughtPanel (qator 1705), shu bilan
   birga uning yonida turgan _SENDING_LABEL konstantasi (qator 1691) —
   faqat shu funksiya ichida ishlatiladi.

   Dependency graph: faqat DOM manipulyatsiya + utils/lang-detect.js'ga
   bog'liq (placeholder til aniqlash uchun). sse-parser.js'dan keyingi
   qavat — event-handler.js buni ishlatadi.

   DIQQAT: escapeHtml() message-render.js'da (chat/ moduli) — bu yerga
   import qilingan, chunki commitLine() xavfsiz HTML chiqarish uchun
   shunga muhtoj.
   ===================================================================== */

import { _detectLangJs } from '../utils/lang-detect.js';
import { escapeHtml } from '../chat/message-render.js';

function getEls() {
  return {
    chat: document.getElementById("chat-inner"),
    chatScroll: document.getElementById("chat"),
  };
}

// Mirrors backend detect_lang()/action_label() just enough for the
// placeholder shown before the FIRST real SSE "thinking" event arrives
// (which overwrites it immediately via setLabel — this only covers the
// brief gap while the request is in flight). `sourceText`, when given, is
// the message the user just sent; for the /confirm flow there's no fresh
// message, so it falls back to a language-neutral "..." instead of
// guessing wrong.
const _SENDING_LABEL = { uz: "So'rov yuborilmoqda", ru: "Отправка запроса", en: "Sending request" };

export function createThoughtPanel(sourceText) {
  const { chat, chatScroll } = getEls();
  const lang = _detectLangJs(sourceText);
  const initialLabel = lang ? _SENDING_LABEL[lang] : "...";
  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-start w-full";
  wrapper.innerHTML = `
    <div class="max-w-full w-full rounded-2xl px-4 py-3">
      <div class="thought-log" id="thought-log"></div>
      <div class="thinking-row" id="thinking-row">
        <video class="thinking-orb-video" src="assets/circle2_transparent.webm" autoplay loop muted playsinline></video>
        <span id="thinking-label">${initialLabel}</span>
        <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
      </div>
    </div>`;
  chat.appendChild(wrapper);
  chatScroll.scrollTop = chatScroll.scrollHeight;

  const logEl = wrapper.querySelector("#thought-log");
  const rowEl = wrapper.querySelector("#thinking-row");
  const labelEl = wrapper.querySelector("#thinking-label");

  return {
    el: wrapper,
    setLabel(text) {
      labelEl.textContent = text;
      chatScroll.scrollTop = chatScroll.scrollHeight;
    },
    commitLine(text) {
      // Freeze the current line into the log with a checkmark, then
      // keep the animated row going for whatever comes next.
      const line = document.createElement("div");
      line.className = "thought-line";
      line.innerHTML = `<span class="check">·</span><span>${escapeHtml(text)}</span>`;
      logEl.appendChild(line);
      chatScroll.scrollTop = chatScroll.scrollHeight;
    },
    remove() {
      wrapper.remove();
    }
  };
}
