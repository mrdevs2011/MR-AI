/* =====================================================================
   chat-storage.js — chat ro'yxati (backend'dan yuklash, saqlash-yo'q,
   o'chirish) va `chats` massivining yagona egasi.
   script.js'dan ko'chirildi: saveChats (671), getActiveChat (673),
   createNewChat (787), ensureActiveChat (804), deleteChat (677),
   loadChats (642).

   MUHIM (achiq haqiqat — Step 6/7'dagi bir xil muammo, bu safar `chats`
   bilan): original script.js'da `let chats = []` va `let activeChatId`
   bitta umumiy scope'da edi, va `renderChatHistory()` (chat-history.js,
   boshqa fayl!) ularga TO'G'RIDAN-TO'G'RI yozardi
   (`chats = chats.filter(...)`, `activeChatId = null`).

   Bu — store.js'dagi SESSION_ID muammosining aynan o'zi: import qilingan
   `let`ni tashqaridan qayta yozib bo'lmaydi. `activeChatId` uchun
   store.js'ning setActiveChatId() bor edi. `chats` uchun esa hech narsa
   yo'q edi — roadmap buni sanamagan (Step 6'da LOGIN_PASS'ni ham
   sanamagani kabi). Shuning uchun bu yerda `chats`ning o'zi uchun ham
   getter/setter/mutator eksport qilindi, xuddi store.js pattern'iga mos:
   boshqa hech qaysi modul o'z ichida bu massivning nusxasini saqlamasin,
   hammasi shu yerdan import qilsin.
   ===================================================================== */

import { activeChatId, setActiveChatId } from '../state/store.js';
import { authHeaders, markActive } from '../auth/session.js';

let chats = [];

export function getChats() {
  return chats;
}

export function getChatsCount() {
  return chats.length;
}

// Backend roles are USER/ASSISTANT; the UI's own message shape uses
// kind "user"/"bot". This maps one to the other on load.
export function backendMessagesToUi(messages) {
  return (messages || []).map(m => ({
    text: m.content,
    kind: m.role === "USER" ? "user" : "bot",
  }));
}

export async function loadChats() {
  // API_BASE ni to'g'ridan-to'g'ri emas, authHeaders() orqali chaqiramiz —
  // lekin fetch URL uchun API_BASE kerak, shuning uchun store'dan olamiz.
  const { API_BASE } = await import('../state/store.js');
  const { handleAuthFailure } = await import('../auth/login.js');
  try {
    const res = await fetch(`${API_BASE}/chats`, {
      headers: authHeaders(),
    });
    if (res.status === 401) {
      await handleAuthFailure(res);
      return;
    }
    if (!res.ok) throw new Error("bad status " + res.status);
    markActive();
    const data = await res.json();
    chats = data.map(c => ({
      id: `${c.category}::${c.filename}`,
      title: (c.messages.find(m => m.role === "USER") || {}).content || "New chat",
      category: c.category,
      filename: c.filename,
      messages: backendMessagesToUi(c.messages),
    }));
  } catch (e) {
    console.error("Chatlarni yuklab bo'lmadi:", e);
    chats = [];
  }
}

// No-op kept only so existing call sites (createNewChat, message push
// after send/confirm) don't need to change — history is already
// persisted server-side by /chat and /confirm on every turn, so there
// is nothing left to write here.
export function saveChats() {}

export function getActiveChat() {
  return chats.find(c => c.id === activeChatId) || null;
}

export async function deleteChat(category, filename) {
  const { API_BASE } = await import('../state/store.js');
  try {
    await fetch(`${API_BASE}/chats/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    markActive();
  } catch (e) {
    console.error("Chatni o'chirib bo'lmadi:", e);
  }
}

// chat-history.js'ning delete-handler'i shu orqali `chats` massividan
// bitta chatni olib tashlaydi (avval to'g'ridan-to'g'ri `chats = ...`
// yozilardi — fayl boshidagi izohga qarang).
export function removeChatById(id) {
  chats = chats.filter(x => x.id !== id);
}

export async function createNewChat() {
  // Not written to the backend yet — chats/<category>/<filename>.log
  // is only created server-side the moment the first real message is
  // sent via /chat. Until then this only exists in memory so the UI
  // has somewhere to type into.
  const category = "chat_" + Date.now().toString(36);
  const newChat = {
    id: `${category}::session`,
    title: "New chat",
    messages: [],
    category,
    filename: "session"
  };
  chats.push(newChat);
  // switchChat() chat-history.js'da — dynamic import, chunki
  // chat-history.js ham shu faylni import qiladi (circular oldini olish,
  // otp.js/login.js'dagi bir xil pattern, Step 7'ga qarang). `await`
  // bilan — original sinxron chaqiruv tartibini iloji boricha saqlaymiz.
  const { switchChat } = await import('./chat-history.js');
  await switchChat(newChat.id);
}

export async function ensureActiveChat() {
  if (chats.length === 0) {
    await createNewChat();
  } else if (!activeChatId) {
    const { switchChat } = await import('./chat-history.js');
    await switchChat(chats[chats.length - 1].id);
  }
}
