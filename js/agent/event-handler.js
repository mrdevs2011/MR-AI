/* =====================================================================
   event-handler.js — bitta SSE event'ni qanday chizishni hal qiladi.
   script.js'dan ko'chirildi: handleAgentEvent (qator 2090).

   Dependency graph: sse-parser.js va thought-panel.js'dan keyingi
   qavat — bu ikkisi (parsed event + panel obyekti)ni ishlatadi,
   shuningdek chat/ moduli funksiyalariga (addOutputCard, addMessage,
   addMessageTyped, addConfirmButton, addDangerConfirmCard) bog'liq.
   job-polling.js — bu faylni chaqiradigan eng yuqori qavat.
   ===================================================================== */

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
    // PONDER WORDS: bu event LLM javob generatsiya qilib bo'lgunicha
    // (birinchi haqiqiy action/delta kelgunicha) faqat BIR MARTA keladi
    // — backend'dagi statik "So'rov yuborilmoqda..." label o'rniga endi
    // Claude uslubidagi tasodifiy, aylanib turuvchi so'zlar (Pondering/
    // Picturing/Mulling va h.k.) ko'rsatiladi. Har qanday keyingi HAQIQIY
    // event (action/step_result/model_thinking_delta) kelgan zahoti
    // panel ichida avtomatik to'xtaydi (qarang: thought-panel.js
    // stopPondering() chaqiruvlari).
    panel?.startPondering();
  } else if (evt.type === "model_thinking") {
    // XATO FIX: avval backend bu event'ni ham {"type": "thinking", ...}
    // deb yuborardi (yuqoridagi loading-indicator bilan bir xil nom) —
    // shu sabab evt.label yo'qligi uchun panel "..." deb qolib, haqiqiy
    // model fikrlash matni (evt.text) hech qachon ko'rinmasdi, hech
    // qanday xato ham bermasdan. Endi backend buni "model_thinking" deb
    // alohida yuboradi. THINKING FEATURE — 3-QADAM: bu endi faqat
    // job_id yo'q (nazariy) holatdagi fallback — oddiy oqimda backend
    // buning o'rniga "model_thinking_delta" yuboradi (pastda).
    panel?.addThought(evt.text);
  } else if (evt.type === "model_thinking_delta") {
    // THINKING FEATURE — 3-QADAM: canli, harf-harf oqim (Claude uslubi).
    // Backend har bir yangi bo'lakni model javobi HALI kelayotganda
    // (call_openrouter() qaytishini kutmasdan) yuboradi — panel shu
    // matnni mavjud qatorga qo'shib boradi, evt.step o'zgarganda esa
    // yangi qator ochadi (keyingi agent qadami boshlanganini bildiradi).
    panel?.appendThoughtDelta(evt.text, evt.step);
  } else if (evt.type === "action") {
    panel?.setLabel(evt.label || evt.target || "...");
  } else if (evt.type === "step_result") {
    // STEP UI: endi har bir step o'zining ochiladigan/yopiladigan
    // blokchasi sifatida to'g'ridan-to'g'ri thinking panel ICHIGA
    // qo'shiladi (Claude Code uslubi) — eski commitLine() (matn qatori)
    // + tashqi addIOCard() (alohida, doim ochiq karta) kombinatsiyasi
    // o'rniga. write_file "/output/<nom>" konvensiyasi bilan yozilgan
    // bo'lsa, addStep() shunchaki qisqa yozuv qoladi (ochilmaydi), ASL
    // yuklab olish kartochkasini esa hamon addOutputCard() chizadi —
    // bu ikkalasi bir-birini to'ldiradi, bittasi ikkinchisini
    // almashtirmaydi.
    panel?.addStep(evt);
    if (evt.output_file) {
      const active = getActiveChat();
      if (active) {
        // ENDI: output-card chat'ga alohida emas, panel.logEl ICHIGA
        // qo'shiladi — shu bilan panel collapse bo'lganda download
        // kartochkasi ham step boxlar bilan birga yopiladi/ochiladi.
        // beforeEl endi kerak emas (tartib logEl ichida table
        // qo'shilish tartibi bilan o'zi to'g'ri keladi).
        addOutputCard(evt.output_file, active.category, active.filename, true, null, panel?.logEl || null);
        panel?.markHasContent();
      }
    }
  } else if (evt.type === "final") {
    // finish(): "remove()"dan farqli — agar panelda haqiqiy thinking/
    // action yozuvlari bo'lsa, ularni yo'qotmasdan, faqat animatsion
    // qatorni olib tashlab, yopiq/ochiladigan blokka aylantiradi (bo'sh
    // panel bo'lsa, hamon oddiy remove() kabi butunlay o'chadi).
    panel?.finish();
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
