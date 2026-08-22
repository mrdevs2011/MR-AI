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
    titleBtn.textContent = c.title || "New chat";
    titleBtn.title = c.title || "New chat";
    titleBtn.addEventListener("click", () => switchChat(c.id));

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
  const { addIOCard } = await import('./io-card.js');
  const { addOutputCard } = await import('./output-card.js');
  const { addMessage } = await import('./message-render.js');
  active.messages.forEach(m => {
    if (m.kind === "io") {
      addIOCard(m.input, m.output, false, null, !!m.blocked);
    } else if (m.kind === "output_file") {
      addOutputCard(m.file, active.category, active.filename, false);
    } else {
      addMessage(m.text, m.kind, false);
    }
  });
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
