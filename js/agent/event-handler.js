/* =====================================================================
   event-handler.js — bitta SSE event'ni qanday chizishni hal qiladi.
   script.js'dan ko'chirildi: handleAgentEvent (qator 2090).

   Dependency graph: sse-parser.js va thought-panel.js'dan keyingi
   qavat — bu ikkisi (parsed event + panel obyekti)ni ishlatadi,
   shuningdek chat/ moduli funksiyalariga (addIOCard, addMessage,
   addMessageTyped, addConfirmButton, addDangerConfirmCard) bog'liq.
   job-polling.js — bu faylni chaqiradigan eng yuqori qavat.
   ===================================================================== */

import { addIOCard } from '../chat/io-card.js';
import { addOutputCard } from '../chat/output-card.js';
import { getActiveChat } from '../chat/chat-storage.js';
import {
  addMessage, addMessageTyped, addConfirmButton, addDangerConfirmCard,
  addRetryButton,
} from '../chat/message-render.js';

// handleAgentEvent: bitta SSE event'ni qanday chizishni hal qiladi —
// avvalgi consumeAgentStream ichidagi mantiqning o'zi, faqat endi
// alohida funksiyaga chiqarilgan, chunki uni ikki joydan chaqiramiz:
// (1) oddiy poll paytida, (2) sahifa refresh bo'lib, davom etayotgan
// job'ga qayta ulanganda.
export function handleAgentEvent(evt, panel, originalMessage, setPanel) {
  if (evt.type === "thinking") {
    panel?.setLabel(evt.label || "...");
  } else if (evt.type === "model_thinking") {
    // XATO FIX: avval backend bu event'ni ham {"type": "thinking", ...}
    // deb yuborardi (yuqoridagi loading-indicator bilan bir xil nom) —
    // shu sabab evt.label yo'qligi uchun panel "..." deb qolib, haqiqiy
    // model fikrlash matni (evt.text) hech qachon ko'rinmasdi, hech
    // qanday xato ham bermasdan. Endi backend buni "model_thinking" deb
    // alohida yuboradi, va bu yerda alohida chizamiz.
    panel?.addThought(evt.text);
  } else if (evt.type === "action") {
    panel?.setLabel(evt.label || evt.target || "...");
  } else if (evt.type === "step_result") {
    panel?.commitLine(evt.label || `${evt.action} — ${evt.command || evt.path || evt.query || ""}`);
    // write_file "/output/<nom>" konvensiyasi bilan yozilgan bo'lsa,
    // backend step_result'ga "output_file" maydonini qo'shadi — bunday
    // holda oddiy bash-uslubidagi input/output kartochkasi (addIOCard)
    // o'rniga haqiqiy yuklab olish kartochkasi ko'rsatiladi. category/
    // filename shu yerda YO'Q (SSE payload'da kelmaydi) — lekin live
    // oqim faqat HOZIR ochiq turgan chat uchun ishlaydi, shuning uchun
    // getActiveChat() xavfsiz manba.
    if (evt.output_file) {
      const active = getActiveChat();
      if (active) {
        addOutputCard(evt.output_file, active.category, active.filename, true, panel?.el || null);
      } else {
        addIOCard(evt.command || evt.path || evt.query || "", evt.result || "", true, panel?.el || null, !!evt.blocked);
      }
    } else {
      const inputText = evt.command || evt.path || evt.query || "";
      addIOCard(inputText, evt.result || "", true, panel?.el || null, !!evt.blocked);
    }
  } else if (evt.type === "final") {
    panel?.remove();
    setPanel(null);

    if (evt.kind === "pending_confirmation") {
      addMessage(evt.response, "pending");
      if (evt.requires_typed_confirmation) {
        addDangerConfirmCard(evt.command_id, evt.command);
      } else {
        addConfirmButton(evt.command_id);
      }
    } else if (evt.kind === "blocked") {
      addMessage(evt.response, "error");
    } else if (evt.kind === "error") {
      addMessage(evt.response, "error");
      if (evt.retryable && originalMessage) {
        addRetryButton(originalMessage);
      }
    } else {
      addMessageTyped(evt.response || "No response");
    }
  }
}
