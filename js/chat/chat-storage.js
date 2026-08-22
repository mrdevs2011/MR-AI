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
//
// `outputs` — GET /chats endi har bir chat uchun identifier.json'dan
// o'qilgan ro'yxatni ham qaytaradi: [{after_message_index, file, size,
// ts}, ...]. Har biri "shu USER xabaridan keyin AI bu faylni yozgan"
// degani — shuning uchun uni aynan o'sha indeksdan KEYINGI o'ringa
// (before the assistant's following reply, matching the live-stream
// chronology: write_file happens mid-turn, "done" text comes last)
// "output_file" kind sifatida qistirib qo'yamiz. Bir nechta output bir
// xil indeksga tegishli bo'lsa (bitta turnda bir nechta fayl), ular
// keyin qayd etilgan ketma-ketlikda joylashadi — shuning uchun avval
// after_message_index bo'yicha barqaror (stable) saralanadi.
export function backendMessagesToUi(messages, outputs) {
  const ui = (messages || []).map(m => {
    if (m.role === "action") {
      // Bug #5 frontend fix: parse_chat_file() backend'da ACTION+RESULT
      // juftini {role:"action", input, output, blocked} shaklida qaytaradi,
      // lekin bu mapping ularni tekshirmasdan hammasini "bot" qilib,
      // yo'q .content maydonini olib text:undefined chiqarardi. addIOCard()
      // chat-history.js:132da kind==="io"ni kutadi — shu shaklga o'giramiz.
      // blocked flag endi addIOCard()ga to'g'ridan-to'g'ri uzatiladi (5-chi
      // parametr, io-card.js), u yerda haqiqiy CSS (io-card-blocked,
      // io-blocked-badge) bilan ko'rsatiladi — shuning uchun bu yerda output
      // matnini o'zgartirish (masalan "[BLOCKED]" prefiks qo'shish) shart
      // emas, xom output shaklini saqlab qolamiz.
      return { kind: "io", input: m.input, output: m.output, blocked: !!m.blocked };
    }
    if (m.role === "pending" || m.role === "error") {
      return { text: m.content, kind: "bot" };
    }
    return {
      text: m.content,
      kind: m.role === "USER" ? "user" : "bot",
    };
  });
  if (outputs && outputs.length) {
    const sorted = [...outputs].sort((a, b) => a.after_message_index - b.after_message_index);
    let offset = 0;
    for (const o of sorted) {
      const insertAt = o.after_message_index + 1 + offset;
      if (insertAt < 0 || insertAt > ui.length) continue; // buzilgan/eski yozuv — jim o'tkazib yuboramiz
      ui.splice(insertAt, 0, { kind: "output_file", file: o.file });
      offset++;
    }
  }
  return ui;
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
      messages: backendMessagesToUi(c.messages, c.outputs),
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
