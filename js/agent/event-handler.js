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
  } else if (evt.type === "action") {
    panel?.setLabel(evt.label || evt.target || "...");
  } else if (evt.type === "step_result") {
    panel?.commitLine(evt.label || `${evt.action} — ${evt.command || evt.path || evt.query || ""}`);
    const inputText = evt.command || evt.path || evt.query || "";
    addIOCard(inputText, evt.result || "", true, panel?.el || null);
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
