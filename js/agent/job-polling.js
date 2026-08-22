/* =====================================================================
   job-polling.js — JOB POLLING: /chat va /confirm endi SSE stream
   QAYTARMAYDI. Ikkalasi ham darhol {job_id} bilan javob beradi, ish esa
   backend'da (server process ichidagi alohida Thread'da) davom etadi.
   Bu fayl o'sha job_id'ni localStorage'ga yozadi va har ~1.2 sekundda
   /job/<id>/poll orqali yangi event'larni so'rab turadi.
   script.js'dan ko'chirildi: saveActiveJob (1970), clearActiveJob (1974),
   loadActiveJob (1978), pollJob (1992), resumeActiveJobIfAny (2128),
   confirmCommand (2147).

   ENG MUHIM FARQI ESKI KOD BILAN: eski kod res.body.getReader() bilan
   BITTA HTTP connection'ni ochiq ushlab turardi — refresh yoki tab
   yopilsa o'sha reader o'lardi va bir joyda qolib qolardi (backend'da
   ham, chunki generator to'xtardi). Endi har bir poll — mustaqil, tez
   tugaydigan so'rov. Sahifani refresh qilsang, activeJobId localStorage-
   dan o'qib olinadi va poll davom etadi — xuddi hech narsa bo'lmagandek,
   chunki ishning o'zi hech qachon browser'ga bog'liq bo'lmagan.

   Dependency graph: eng yuqori qavat — sse-parser.js, event-handler.js,
   thought-panel.js, va chat/ moduli funksiyalariga bog'liq.
   confirmCommand() message-render.js'dagi addDangerConfirmCard() va
   addConfirmButton() ichidan window.confirmCommand?.() orqali
   chaqiriladi (main.js Step 10'da window'ga bog'lanadi).
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders, markActive } from '../auth/session.js';
import { getActiveChat } from '../chat/chat-storage.js';
import { addMessage } from '../chat/message-render.js';
import { createThoughtPanel } from './thought-panel.js';
import { parseSseChunk } from './sse-parser.js';
import { handleAgentEvent } from './event-handler.js';

const ACTIVE_JOB_KEY = "MRagent_active_job"; // { job_id, category, filename }
let currentPollTimer = null;
let currentPollAfter = 0;

export function saveActiveJob(jobId, category, filename) {
  localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ job_id: jobId, category, filename }));
}

export function clearActiveJob() {
  localStorage.removeItem(ACTIVE_JOB_KEY);
}

export function loadActiveJob() {
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// pollJob: bitta job_id tugaguncha (status === "done" bo'lguncha)
// takroriy so'rov yuboradi. Har chaqiruvda faqat YANGI event'larni
// (?after= orqali) so'raymiz — allaqachon ko'rilganlarini qayta
// yubormaydi, shuning uchun trafik kichik va oldin chizilgan box'lar
// qayta chizilib, ekranda ikki marta paydo bo'lmaydi.
export async function pollJob(jobId, panel, originalMessage) {
  currentPollAfter = 0;
  let sawAnyEvent = false;

  function stopPolling() {
    if (currentPollTimer) {
      clearTimeout(currentPollTimer);
      currentPollTimer = null;
    }
  }

  return new Promise((resolve) => {
    async function tick() {
      let res;
      try {
        res = await fetch(`${API_BASE}/job/${encodeURIComponent(jobId)}/poll?after=${currentPollAfter}`, {
          method: "GET",
          headers: authHeaders({}),
        });
      } catch (err) {
        // Tarmoq vaqtincha uzilishi (wifi, sleep va h.k.) — job_id
        // hali ham localStorage'da, keyingi tick qayta urinadi.
        // Ishni bekor qilmaymiz, faqat keyingi tickgacha kutamiz.
        currentPollTimer = setTimeout(tick, 1500);
        return;
      }

      if (res.status === 401) {
        stopPolling();
        clearActiveJob();
        panel?.remove();
        const { handleAuthFailure } = await import('../auth/login.js');
        await handleAuthFailure(res);
        resolve();
        return;
      }

      if (res.status === 404) {
        // Job serverda topilmadi — yoki juda eski (tozalangan), yoki
        // server qayta ishga tushgan bo'lishi mumkin (xotiradagi
        // JOBS shu bilan yo'qoladi). Foydalanuvchiga rost gapni
        // aytamiz, uni cheksiz "thinking" holatida ushlab turmaymiz.
        stopPolling();
        clearActiveJob();
        panel?.remove();
        if (!sawAnyEvent) {
          addMessage("Bu so'rov topilmadi (server qayta ishga tushgan bo'lishi mumkin). Qayta yozib ko'r.", "bot");
        }
        resolve();
        return;
      }

      if (!res.ok) {
        stopPolling();
        clearActiveJob();
        panel?.remove();
        addMessage("Serverdan javob olishda xatolik yuz berdi.", "bot");
        resolve();
        return;
      }

      const data = await res.json();
      currentPollAfter = data.next_after ?? currentPollAfter;

      for (const rawFrame of data.events || []) {
        // Backend har bir event'ni "data: {...}\n\n" (SSE frame)
        // ko'rinishida yuboradi — buni eski parseSseChunk bilan
        // parse qilamiz, shu bilan pastdagi barcha "evt.type"
        // ishlov berish mantig'i o'zgarishsiz qoladi.
        const { events } = parseSseChunk(rawFrame);
        for (const evt of events) {
          sawAnyEvent = true;
          handleAgentEvent(evt, panel, originalMessage, (p) => { panel = p; });
        }
      }

      if (data.status === "done") {
        stopPolling();
        clearActiveJob();
        if (!sawAnyEvent) {
          panel?.remove();
          addMessage("No response from the backend.", "bot");
        }
        resolve();
        return;
      }

      currentPollTimer = setTimeout(tick, 1200);
    }

    tick();
  });
}

// Sahifa yuklanganda: agar oldingi session'dan tugallanmagan job qolgan
// bo'lsa (masalan foydalanuvchi javob kutayotib refresh bosgan yoki
// boshqa qurilmadan shu chat'ga kirgan), shu joydan poll'ni qayta
// boshlaymiz — xuddi hech qanday uzilish bo'lmagandek. Buni chaqiruvchi
// (showApp/loadChats dan keyin) chaqiradi.
export async function resumeActiveJobIfAny() {
  const saved = loadActiveJob();
  if (!saved || !saved.job_id) return;

  const active = getActiveChat();
  // Faqat hozir ochiq turgan chat aynan shu job tegishli chatga mos
  // kelsa davom ettiramiz — boshqa chatga o'tib ketilgan bo'lsa, eski
  // job baribir backend'da davom etadi, faqat UI uni shu yerda
  // ko'rsatmaydi (keyingi safar o'sha chatga qaytilganda ham job
  // allaqachon tugagan bo'ladi, chat tarixi /chats orqali normal
  // ko'rinadi).
  if (active && (active.category !== saved.category || active.filename !== saved.filename)) {
    return;
  }

  const panel = createThoughtPanel();
  await pollJob(saved.job_id, panel, null);
}

export async function confirmCommand(commandId, typedConfirmation) {
  try {
    const body = { command_id: commandId };
    if (typedConfirmation !== undefined) body.typed_confirmation = typedConfirmation;
    const res = await fetch(`${API_BASE}/confirm`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      const { handleAuthFailure } = await import('../auth/login.js');
      await handleAuthFailure(res);
      return false;
    }
    markActive();
    // typed_confirmation_mismatch hali ham oddiy JSON (400) — bu SSE
    // stream boshlanishidan OLDIN, backend darhol shu xatoni qaytaradi.
    // Shuning uchun bu tekshiruv consumeAgentStream()dan oldin turadi.
    if (res.status === 400) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "typed_confirmation_mismatch") {
        // Not consumed on the backend — caller (danger card) shows an
        // inline error and lets the user retry typing.
        return false;
      }
      addMessage(data.error || "Confirm failed.", "bot");
      return true;
    }
    if (res.status === 403 || res.status === 404) {
      const data = await res.json().catch(() => ({}));
      addMessage(data.error || "Confirm failed.", "bot");
      return true;
    }

    // Muvaffaqiyatli confirm endi darhol {job_id} qaytaradi — asl ish
    // (run_agent_loop davomi) backend'da background Thread'da ketadi.
    // Shu bilan bir marta ishlab to'xtab qolish o'rniga, agent qolgan
    // rejasini (keyingi zona-2/3 amalgacha) o'zi bajaradi, VA refresh
    // bossang ham bu ish to'xtamaydi.
    const data = await res.json().catch(() => ({}));
    if (!data.job_id) {
      addMessage("Confirm failed: no job_id from backend.", "bot");
      return true;
    }
    const active = getActiveChat();
    saveActiveJob(data.job_id, (active && active.category) || "general", (active && active.filename) || "chat");
    const panel = createThoughtPanel();
    await pollJob(data.job_id, panel, null);
    return true;
  } catch (err) {
    addMessage("The confirm request failed.", "bot");
    return false;
  }
}
