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
  let hasContent = false; // true as soon as anything lands in logEl — decides whether finish() leaves a collapsible block behind or removes the whole panel

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
      hasContent = true;
      chatScroll.scrollTop = chatScroll.scrollHeight;
    },
    addThought(text) {
      // Model'ning ichki fikrlash matni (backend "model_thinking" SSE
      // event'i) — bu "step_result" emas (hech qanday action bajarilmadi),
      // shuning uchun commitLine()dagi checkmark uslubi mos emas.
      // Vizual jihatdan italic/muted, oddiy action qatorlaridan alohida
      // ko'rinishi kerak — "thought-line" emas, alohida "thought-reasoning"
      // klassi bilan.
      if (!text) return;
      const line = document.createElement("div");
      line.className = "thought-reasoning";
      line.innerHTML = `<span>${escapeHtml(text)}</span>`;
      logEl.appendChild(line);
      hasContent = true;
      chatScroll.scrollTop = chatScroll.scrollHeight;
    },
    remove() {
      wrapper.remove();
    },
    // finish(): "final" event kelganda chaqiriladi. remove()dan farqi —
    // butun panelni o'chirib tashlamaydi. Buning o'rniga faqat animatsion
    // thinking-row'ni (orb + shimmer label + nuqtalar) yo'q qiladi, va
    // agar log ichida haqiqatan biror narsa yozilgan bo'lsa (commitLine/
    // addThought hech bo'lmasa bir marta chaqirilgan bo'lsa), logEl'ni
    // Claude uslubidagi yopiq/ochiladigan blokka o'raydi — shu bilan
    // "qanday o'ylagani" yakuniy javobdan pastda (aslida undan OLDIN,
    // DOM tartibida) turib qoladi, foydalanuvchi xohlasa ochib ko'radi.
    // Agar hech narsa yozilmagan bo'lsa (masalan juda qisqa/tez javob,
    // hech qanday thinking/action bo'lmagan holat) — bo'sh qobiqni
    // chatda qoldirishning ma'nosi yo'q, shuning uchun butunlay
    // o'chiramiz, xuddi eski remove() kabi.
    finish() {
      if (!hasContent) {
        wrapper.remove();
        return;
      }
      rowEl.remove();
      logEl.classList.add("thought-log-collapsed");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "thought-log-toggle";
      toggle.textContent = "Fikrlash jarayoni";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const isOpen = logEl.classList.toggle("thought-log-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
      wrapper.querySelector("div").insertBefore(toggle, logEl);
    }
  };
}
