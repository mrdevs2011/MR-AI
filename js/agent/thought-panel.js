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
import { highlightBash, formatIOOutput } from '../chat/io-card.js';

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

// STEP UI — Claude Code uslubidagi step ikonkalari (lucide-uslubidagi
// oddiy, ikki rangli chiziqli SVG'lar). action nomi bo'yicha tanlanadi;
// noma'lum action bo'lsa terminal ikonkasi (STEP_ICONS.command) default
// bo'lib qoladi.
const STEP_ICONS = {
  command: '<svg class="thought-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>',
  read_file: '<svg class="thought-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  list_dir: '<svg class="thought-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  web_search: '<svg class="thought-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  write_file: '<svg class="thought-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>',
};

// STEP UI — panel yopilganda ("finish()") ko'rsatiladigan yig'ma xulosa,
// masalan "Ran 4 commands, viewed a file, edited a file" (rasmda ko'rsatilgan
// Claude Code uslubi). DIQQAT — bu grammatik jihatdan soddalashtirilgan
// (ayniqsa ruscha ko'plik shakllari: 2-4 va 5+ uchun to'g'ri forma farqi
// hisobga OLINMAGAN) — maqsad "canli, taniqli" hissiyot, 100% grammatika
// emas. Xohlasang keyinroq to'liq pluralization qo'shamiz.
const _STEP_PHRASES = {
  uz: { command: n => `${n} ta buyruq bajardi`, read_file: n => n === 1 ? "faylni ko'rdi" : `${n} ta faylni ko'rdi`, list_dir: n => n === 1 ? "papkani ko'rdi" : `${n} ta papkani ko'rdi`, web_search: n => "internetdan qidirdi", write_file: n => n === 1 ? "faylni tahrirladi" : `${n} ta faylni tahrirladi` },
  ru: { command: n => `выполнил ${n} команд`, read_file: n => n === 1 ? "просмотрел файл" : `просмотрел файлы (${n})`, list_dir: n => n === 1 ? "просмотрел папку" : `просмотрел папки (${n})`, web_search: n => "искал в интернете", write_file: n => n === 1 ? "отредактировал файл" : `отредактировал файлы (${n})` },
  en: { command: n => `Ran ${n} command${n === 1 ? "" : "s"}`, read_file: n => n === 1 ? "viewed a file" : `viewed ${n} files`, list_dir: n => n === 1 ? "listed a directory" : `listed ${n} directories`, web_search: n => "searched the web", write_file: n => n === 1 ? "edited a file" : `edited ${n} files` },
};
const _DEFAULT_TOGGLE_LABEL = { uz: "Fikrlash jarayoni", ru: "Процесс мышления", en: "Thinking process" };

function _summarizeSteps(lang, counts) {
  const L = _STEP_PHRASES[lang] || _STEP_PHRASES.en;
  const order = ["command", "read_file", "list_dir", "web_search", "write_file"];
  const parts = order.filter(k => counts[k] > 0).map(k => L[k](counts[k]));
  if (!parts.length) return (_DEFAULT_TOGGLE_LABEL[lang] || _DEFAULT_TOGGLE_LABEL.uz);
  // Birinchi harfni katta qilamiz — ru/en'da gap boshida katta harf
  // odatiy, uz'da unchalik qattiq qoida emas lekin baribir chiroyli.
  const joined = parts.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

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

  // STEP UI: har action turi bo'yicha necha marta bajarilganini sanaymiz —
  // finish()da "Ran 4 commands, viewed a file, edited a file" uslubidagi
  // yig'ma sarlavha shundan quriladi.
  const stepCounts = { command: 0, read_file: 0, list_dir: 0, web_search: 0, write_file: 0 };

  // THINKING FEATURE — 3-QADAM: bitta agent "step"iga tegishli barcha
  // delta'lar BITTA <span>ga to'planishi kerak (aks holda har harf o'z
  // qatorida chiqib ketadi). liveStep — hozir qaysi step'ning matni
  // yozilayotganini kuzatadi; evt.step o'zgarsa (keyingi agent qadami
  // boshlangani), eski qatorni "yopiq" deb belgilab, yangisini ochamiz.
  let liveStep = null;
  let liveSpanEl = null;

  return {
    el: wrapper,
    setLabel(text) {
      labelEl.textContent = text;
      chatScroll.scrollTop = chatScroll.scrollHeight;
    },
    // STEP UI: eski commitLine() shunchaki bitta matn qatorini yozardi,
    // haqiqiy bash input/output esa BUTUNLAY BOSHQA joyda — chat oqimida,
    // panel'dan alohida, doim ochiq addIOCard() sifatida chiqardi (io-card.js).
    // Bu ikkisini bittaga birlashtiramiz: har bir step_result endi shu
    // panel ICHIDA, o'zining ochiladigan/yopiladigan blokchasi bo'ladi —
    // xuddi Claude Code'dagidek: header (ikonka + label, bosilsa ochiladi)
    // + ichida "bash"/"read"/"search" kiritma va "Output" natija.
    // write_file uchun (haqiqiy fayl tahriri, /output yuklab olish EMAS)
    // ochiladigan blok o'rniga inline diff badge ko'rsatiladi ("main.py
    // +12 -3") — backend _line_diff_stats() orqali hisoblab beradi.
    addStep(evt) {
      const action = evt.action || "command";
      if (stepCounts[action] !== undefined) stepCounts[action] += 1;
      hasContent = true;

      const wrap = document.createElement("div");
      wrap.className = "thought-step";

      const isEdit = action === "write_file" && typeof evt.diff_added === "number";
      const canExpand = !isEdit && !evt.output_file; // download-kartochkasi (addOutputCard) allaqachon alohida ko'rsatiladi

      const labelText = evt.label || `${action} — ${evt.command || evt.path || evt.query || ""}`;
      const icon = STEP_ICONS[action] || STEP_ICONS.command;

      let badgeHtml = "";
      if (isEdit) {
        const fname = (evt.path || "").split("/").pop() || evt.path || "";
        badgeHtml = `<span class="thought-step-badge"><span class="diff-file">${escapeHtml(fname)}</span> <span class="diff-add">+${evt.diff_added}</span> <span class="diff-remove">-${evt.diff_removed ?? 0}</span></span>`;
      }

      const header = document.createElement(canExpand ? "button" : "div");
      header.className = "thought-step-header" + (canExpand ? "" : " thought-step-header-static");
      if (canExpand) header.type = "button";
      header.innerHTML = `${icon}<span class="thought-step-label">${escapeHtml(labelText)}</span>${badgeHtml}${canExpand ? '<span class="thought-step-chevron">▸</span>' : ""}`;
      wrap.appendChild(header);

      if (canExpand) {
        const body = document.createElement("div");
        body.className = "thought-step-body io-card" + (evt.blocked ? " io-card-blocked" : "");
        const inputLabel = action === "command" ? "bash" : action === "read_file" ? "read" : action === "list_dir" ? "list" : action === "web_search" ? "search" : "input";
        const inputText = evt.command || evt.path || evt.query || "";
        const inputHtml = action === "command" ? highlightBash(inputText) : escapeHtml(inputText);
        const out = (evt.result && evt.result.trim()) ? evt.result : "(no output)";
        const isErr = evt.blocked || /\[Exit code: [1-9]/.test(out) || /^Execution error:/.test(out) || /^Command timed out/.test(out);
        body.innerHTML = `
          <div class="io-section">
            <div class="io-header">${inputLabel}${evt.blocked ? ` <span class="io-blocked-badge">BLOCKED</span>` : ""}</div>
            <pre class="io-content">${inputHtml}</pre>
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
      }

      logEl.appendChild(wrap);
      chatScroll.scrollTop = chatScroll.scrollHeight;
      return wrap;
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
    appendThoughtDelta(delta, step) {
      // Claude uslubidagi canli terish: har bo'lak kelgan zahoti mavjud
      // qatorga qo'shiladi (textContent += — innerHTML emas, shu bilan
      // XSS xavfsiz va tez, escapeHtml() har harfda chaqirilmaydi).
      if (!delta) return;
      if (liveStep !== step || !liveSpanEl) {
        // Yangi agent qadami boshlandi (yoki bu — shu panelning birinchi
        // delta'si) — oldingi qatorni "muzlatib", yangisini ochamiz.
        liveStep = step;
        const line = document.createElement("div");
        line.className = "thought-reasoning";
        liveSpanEl = document.createElement("span");
        line.appendChild(liveSpanEl);
        logEl.appendChild(line);
        hasContent = true;
      }
      liveSpanEl.textContent += delta;
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
      toggle.textContent = _summarizeSteps(lang, stepCounts);
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const isOpen = logEl.classList.toggle("thought-log-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
      wrapper.querySelector("div").insertBefore(toggle, logEl);
    }
  };
}
