/* =====================================================================
   output-card.js — AI /output/ ga yozgan, foydalanuvchiga tayyor
   berilgan faylning yuklab olish kartochkasi (Claude.ai file-card
   uslubida: chapda ikonka, o'rtada nom+tur, o'ngda "Download" tugmasi).

   MUHIM: event-handler.js bu faylni allaqachon import qilib turardi
   (`import { addOutputCard } from '../chat/output-card.js'`) va
   chaqirardi ham, lekin fayl o'zi hech qachon yozilmagan edi — shu
   sabab har safar AI /output/ ga fayl yozganda front-end import
   xatosiga uchrardi. Shu yerda to'ldirildi.

   Auth eslatmasi: bu loyihada auth cookie orqali emas, custom header
   (X-Login-Pass / X-Session-Id, ko'r auth/session.js -> authHeaders())
   orqali ishlaydi. Shuning uchun oddiy <a href="..."> tugmasi ishlamaydi
   (headersiz so'rov 401 qaytaradi) — fetch() bilan authHeaders() qo'shib
   olib, blob'ni Object URL orqali yuklab beramiz.
   ===================================================================== */

import { getActiveChat, saveChats } from './chat-storage.js';
import { authHeaders } from '../auth/session.js';

function getEls() {
  return {
    chat: document.getElementById("chat-inner"),
    chatScroll: document.getElementById("chat"),
  };
}

// Fayl kengaytmasidan "turi" yorlig'ini chiqarib beradi (rasmdagi kabi
// "HTML", "PY", "TXT"...). Kengaytma bo'lmasa umumiy "FILE".
function fileTypeLabel(name) {
  const base = name.split("/").pop() || name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "FILE";
  return base.slice(dot + 1).toUpperCase();
}

function baseName(name) {
  return name.split("/").pop() || name;
}

const FILE_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke-linejoin="round"/>
    <path d="M15 2v5h5" stroke-linejoin="round"/>
  </svg>`;

async function downloadFile(btn, file, category, filename) {
  const { API_BASE } = await import('../state/store.js');
  const original = btn.textContent;
  btn.textContent = "...";
  btn.disabled = true;
  try {
    const url = `${API_BASE}/download-output/${encodeURIComponent(category)}/${encodeURIComponent(filename)}/${file.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error("download failed: " + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = baseName(file);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (e) {
    btn.textContent = "Xato";
    setTimeout(() => { btn.textContent = original; }, 1500);
    return;
  } finally {
    btn.disabled = false;
  }
  btn.textContent = original;
}

// Bir turn ichida model bir xil faylni (masalan /output/index.html)
// bir necha marta qayta yozib chiqsa (loop/qayta urinish), oldingi
// kartochkani takrorlash o'rniga MAVJUDINI YANGILAYMIZ — shu tufayli
// foydalanuvchi bitta so'rovdan keyin 10 ta bir xil "index.html /
// Download" kartochkasini ko'rmaydi, faqat oxirgi (eng yangi) versiyasi
// qoladi. Dedup kaliti: fayl nomi (baseName) — chunki bir xil nom har
// doim "shu faylning yangi versiyasi" degani, boshqa fayl emas.
const _liveCardsByName = new Map();

export function addOutputCard(file, category, filename, persist = true, beforeEl = null) {
  const { chat, chatScroll } = getEls();
  const name = baseName(file);
  const type = fileTypeLabel(file);

  // Shu turnda (page hali refresh bo'lmagan holatda) bu nom uchun
  // kartochka allaqachon chizilgan bo'lsa — uni qayta yaratmasdan,
  // faqat "file" qiymatini yangilab qo'yamiz (path o'zgarmagan bo'lsa
  // ham bu no-op, farq qilsa yangi path'ga ishora qiladi).
  const existing = _liveCardsByName.get(name);
  if (existing && existing.parentNode) {
    const btn = existing.querySelector(".output-card-download");
    if (btn) {
      const newBtn = btn.cloneNode(true);
      btn.replaceWith(newBtn);
      newBtn.addEventListener("click", () => downloadFile(newBtn, file, category, filename));
    }
    if (persist) {
      const active = getActiveChat();
      if (active && active.messages.length) {
        // Persisted ro'yxatdagi shu nomga tegishli oxirgi output_file
        // yozuvini yangilaymiz (yangisini qo'shmasdan) — shu bilan
        // refresh'dan keyin ham duplikat kartochka qaytadan chizilmaydi.
        for (let i = active.messages.length - 1; i >= 0; i--) {
          const m = active.messages[i];
          if (m.kind === "output_file" && baseName(m.file) === name) {
            m.file = file;
            saveChats();
            break;
          }
        }
      }
    }
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return existing;
  }

  const div = document.createElement("div");
  div.className = "flex justify-start w-full";

  div.innerHTML = `
    <div class="output-card">
      <div class="output-card-icon">${FILE_ICON_SVG}</div>
      <div class="output-card-info">
        <div class="output-card-name">${name}</div>
        <div class="output-card-type">${type}</div>
      </div>
      <button type="button" class="output-card-download">Download</button>
    </div>`;

  const btn = div.querySelector(".output-card-download");
  btn.addEventListener("click", () => downloadFile(btn, file, category, filename));

  if (beforeEl && beforeEl.parentNode === chat) {
    chat.insertBefore(div, beforeEl);
  } else {
    chat.appendChild(div);
  }
  chatScroll.scrollTop = chatScroll.scrollHeight;

  _liveCardsByName.set(name, div);

  if (persist) {
    const active = getActiveChat();
    if (active) {
      active.messages.push({ kind: "output_file", file });
      saveChats();
    }
  }
  return div;
}

// Yangi turn/so'rov boshlanganda chaqirilishi kerak (masalan xabar
// yuborilganda) — aks holda oldingi turndagi "index.html" kartochkasi
// bilan bu turndagi "index.html" bir xil deb hisoblanib, ustidan
// yozilib ketishi mumkin. job-polling.js/chat.js dan yangi so'rov
// boshlanganda chaqiring: resetOutputCardDedup().
export function resetOutputCardDedup() {
  _liveCardsByName.clear();
}
