/* =====================================================================
   chat-history.js — sidebar ro'yxati, chatlar orasida almashish, va
   chat sarlavhasi render.
   script.js'dan ko'chirildi: renderChatHistory (698), switchChat (770),
   updateChatTitle (779), setEmptyState (611), renderMessages (755).

   Bundan tashqari: placeComposer (605) — roadmap buni na Step 8, na
   Step 10'da alohida sanamagan (yana bitta roadmap kamchiligi, achiq
   aytaman). setEmptyState() unga bog'liq, kichik va faqat shu yerda
   ishlatiladi, shuning uchun shu faylga qo'shildi. Agar keyinchalik
   ui/ composer.js kerak bo'lsa — bu yerdan ko'chirish oson.

   Cross-module ko'priklar (Step 9-10 hali yo'q, achiq belgilangan):
   - switchChat() -> closeSidebarOnMobile() (ui/sidebar.js, Step 10)
     window.closeSidebarOnMobile?.() orqali, Step 7'dagi bir xil pattern.
   ===================================================================== */

import { activeChatId, setActiveChatId } from '../state/store.js';
import {
  getChats, removeChatById, getActiveChat,
  deleteChat, createNewChat,
} from './chat-storage.js';

function getEls() {
  return {
    chatHistoryEl: document.getElementById("chat-history"),
    chatTitleEl: document.getElementById("chat-title"),
    chat: document.getElementById("chat-inner"),
    chatScroll: document.getElementById("chat"),
    emptyState: document.getElementById("empty-state"),
    chatFooter: document.getElementById("chat-footer"),
    composerSlotEmpty: document.getElementById("composer-slot-empty"),
    composerSlotFooter: document.getElementById("composer-slot-footer"),
    input: document.getElementById("message"),
  };
}

let chatSearchQuery = "";

const chatSearchInput = document.getElementById("chat-search");
chatSearchInput?.addEventListener("input", (e) => {
  chatSearchQuery = e.target.value || "";
  renderChatHistory();
});

// Moves the composer's actual DOM node between the centered slot and
// the footer slot. (Roadmap gap — see file header.)
function placeComposer(inFooter) {
  const { composerSlotEmpty, composerSlotFooter, input } = getEls();
  const targetSlot = inFooter ? composerSlotFooter : composerSlotEmpty;
  if (targetSlot.contains(input)) return;
  document.querySelectorAll('[data-composer-part]').forEach(n => targetSlot.appendChild(n));
}

export function setEmptyState(isEmpty) {
  const { emptyState, chatFooter, input } = getEls();
  emptyState.classList.toggle("hidden", !isEmpty);
  chatFooter.classList.toggle("hidden", isEmpty);
  placeComposer(!isEmpty);
  if (isEmpty) input.focus();
}

export function renderChatHistory() {
  const { chatHistoryEl } = getEls();
  const chats = getChats();
  chatHistoryEl.innerHTML = "";
  const q = chatSearchQuery.trim().toLowerCase();
  const list = q ? chats.filter(c => (c.title || "").toLowerCase().includes(q)) : chats;

  if (chats.length === 0) {
    chatHistoryEl.innerHTML = `<p class="text-xs text-gray-600 px-2 py-1">no chats yet</p>`;
    return;
  }
  if (list.length === 0) {
    chatHistoryEl.innerHTML = `<p class="text-xs text-gray-600 px-2 py-1">no matches</p>`;
    return;
  }

  [...list].reverse().forEach(c => {
    const isActive = c.id === activeChatId;
    const row = document.createElement("div");
    row.className = `chat-item-row sidebar-item${isActive ? " active" : ""}`;

    const titleBtn = document.createElement("button");
    titleBtn.type = "button";
    titleBtn.className = "chat-item-title";
    titleBtn.title = c.title || "New chat";
    titleBtn.addEventListener("click", () => switchChat(c.id));
    // Claude.ai uslubidagi kichik bullet — sof vizual belgi, hech qanday
    // state/click logikasiga bog'liq emas. textContent o'rniga innerHTML
    // + alohida span ishlatildi, chunki chat sarlavhasi endi ikkita
    // vizual qismdan (bullet + matn) iborat.
    const bulletSpan = document.createElement("span");
    bulletSpan.className = "chat-item-bullet";
    bulletSpan.setAttribute("aria-hidden", "true");
    const titleSpan = document.createElement("span");
    titleSpan.className = "chat-item-title-text";
    titleSpan.textContent = c.title || "New chat";
    titleBtn.appendChild(bulletSpan);
    titleBtn.appendChild(titleSpan);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "chat-item-delete";
    delBtn.title = "Delete chat";
    delBtn.setAttribute("aria-label", "Delete chat");
    delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${c.title || "New chat"}"?`)) return;
      delBtn.disabled = true;
      await deleteChat(c.category, c.filename);
      removeChatById(c.id);
      if (activeChatId === c.id) {
        setActiveChatId(null);
        const remaining = getChats();
        if (remaining.length) {
          switchChat(remaining[remaining.length - 1].id);
        } else {
          createNewChat();
        }
      } else {
        renderChatHistory();
      }
    });

    row.appendChild(titleBtn);
    row.appendChild(delBtn);
    chatHistoryEl.appendChild(row);
  });
}

export async function renderMessages() {
  const { chat } = getEls();
  chat.innerHTML = "";
  const active = getActiveChat();
  const isEmpty = !active || active.messages.length === 0;
  setEmptyState(isEmpty);
  if (isEmpty) return;
  const { addOutputCard } = await import('./output-card.js');
  const { addMessage, escapeHtml } = await import('./message-render.js');
  const { highlightBash, formatIOOutput } = await import('./io-card.js');
  const { summarizeStepCounts, STEP_ICONS } = await import('../agent/thought-panel.js');
  const { _detectLangJs } = await import('../utils/lang-detect.js');
  const { chat: chatEl, chatScroll } = getEls();

  // XATO FIX (2026-08-23): avval "io"/"thought"/"output_file" har biri
  // ALOHIDA, thinking panel'siz to'g'ridan-to'g'ri chat oqimiga
  // chiqardi — refresh/reload'dan keyin bash/kod bloklari "thinking"
  // ichidan chiqib, oddiy chat pufakchalaridek ko'rinardi. Live SSE
  // paytida esa BARCHASI (thought-panel.js: addThought/addStep va
  // event-handler.js orqali addOutputCard) BITTA panel logEl ICHIGA
  // yig'iladi va finish()da yopiq/ochiladigan blokka aylanadi. Endi
  // reload paytida ham xuddi shu tuzilma qo'lda qayta quriladi: ketma-
  // ket kelgan "io"/"thought"/"output_file" xabarlar guruhlanib, bitta
  // .thought-log-toggle + .thought-log.thought-log-collapsed blokka
  // yig'iladi — live'dagi finish() natijasi bilan bir xil ko'rinish.
  function renderThoughtGroup(group, sourceText) {
    const lang = _detectLangJs(sourceText) || "uz";
    const wrapper = document.createElement("div");
    wrapper.className = "flex justify-start w-full";
    const inner = document.createElement("div");
    inner.className = "max-w-full w-full rounded-2xl px-4 py-3";

    const logEl = document.createElement("div");
    logEl.className = "thought-log thought-log-collapsed";

    // Saqlangan "io" xabarlar aniq action turini (command/read_file/...)
    // saqlamaydi — har doim generik "bash" step sifatida ko'rsatiladi,
    // xuddi eski addIOCard() har doim "bash" sarlavhasini chiqargani
    // kabi. Shuning uchun hisoblash ham hammasini "command" deb sanaydi.
    const counts = { command: 0, read_file: 0, list_dir: 0, web_search: 0, write_file: 0 };

    group.forEach(gm => {
      if (gm.kind === "thought") {
        const line = document.createElement("div");
        line.className = "thought-reasoning";
        line.innerHTML = `<span>${escapeHtml(gm.text || "")}</span>`;
        logEl.appendChild(line);
      } else if (gm.kind === "io") {
        counts.command += 1;
        const wrap = document.createElement("div");
        wrap.className = "thought-step";

        const header = document.createElement("button");
        header.type = "button";
        header.className = "thought-step-header";
        const labelText = (gm.input || "").split("\n")[0] || "bash";
        header.innerHTML = `${STEP_ICONS.command}<span class="thought-step-label">${escapeHtml(labelText)}</span><span class="thought-step-chevron">▸</span>`;
        wrap.appendChild(header);

        const body = document.createElement("div");
        body.className = "thought-step-body io-card" + (gm.blocked ? " io-card-blocked" : "");
        const out = (gm.output && gm.output.trim()) ? gm.output : "(no output)";
        const isErr = gm.blocked || /\[Exit code: [1-9]/.test(out) || /^Execution error:/.test(out) || /^Command timed out/.test(out);
        body.innerHTML = `
          <div class="io-section">
            <div class="io-header">bash${gm.blocked ? ` <span class="io-blocked-badge">BLOCKED</span>` : ""}</div>
            <pre class="io-content">${highlightBash(gm.input || "")}</pre>
          </div>
          <div class="io-section">
            <div class="io-header">Output</div>
            <pre class="io-content${isErr ? " io-output-err" : ""}">${formatIOOutput(out)}</pre>
          </div>`;
        wrap.appendChild(body);
        header.addEventListener("click", () => {
          const open = wrap.classList.toggle("thought-step-open");
          header.querySelector(".thought-step-chevron").textContent = open ? "▾" : "▸";
        });
        logEl.appendChild(wrap);
      } else if (gm.kind === "output_file") {
        // persist=false — bu xabar allaqachon backend'da saqlangan,
        // qayta yozib yuborish shart emas, faqat ko'rsatamiz.
        addOutputCard(gm.file, active.category, active.filename, false, null, logEl);
      }
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "thought-log-toggle";
    toggle.textContent = summarizeStepCounts(lang, counts);
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const isOpen = logEl.classList.toggle("thought-log-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    inner.appendChild(toggle);
    inner.appendChild(logEl);
    wrapper.appendChild(inner);
    chatEl.appendChild(wrapper);
  }

  const GROUPED_KINDS = new Set(["io", "thought", "output_file"]);
  let lastUserText = "";
  let idx = 0;
  while (idx < active.messages.length) {
    const m = active.messages[idx];
    if (GROUPED_KINDS.has(m.kind)) {
      const group = [];
      while (idx < active.messages.length && GROUPED_KINDS.has(active.messages[idx].kind)) {
        group.push(active.messages[idx]);
        idx++;
      }
      renderThoughtGroup(group, lastUserText);
      continue;
    }
    if (m.kind === "user") lastUserText = m.text || "";
    addMessage(m.text, m.kind, false);
    idx++;
  }
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

export async function switchChat(id) {
  const { chatTitleEl, input } = getEls();
  setActiveChatId(id);
  renderChatHistory();
  await renderMessages();
  updateChatTitle();
  // ui/sidebar.js Step 10'gacha mavjud emas — window orqali xavfsiz
  // optional chain (Step 7'dagi bir xil pattern).
  window.closeSidebarOnMobile?.();
  input.focus();
}

export function updateChatTitle() {
  const { chatTitleEl } = getEls();
  const active = getActiveChat();
  chatTitleEl.textContent = (active && active.title) ? active.title : "MRagent";
  chatTitleEl.style.animation = "none";
  void chatTitleEl.offsetWidth;
  chatTitleEl.style.animation = "";
}

// backendMessagesToUi — chat-storage.js'da yashaydi (loadChats() unga
// muhtoj), lekin roadmap uni chat-history.js ro'yxatida ham sanagan.
// Qayta eksport — ikkala joydan ham import qilish mumkin bo'lsin.
export { backendMessagesToUi } from './chat-storage.js';
