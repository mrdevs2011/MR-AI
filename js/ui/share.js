/* =====================================================================
   share.js — header'dagi "Share" tugmasi: joriy chat uchun PUBLIC,
   login talab qilmaydigan faqat-o'qish havola yaratadi.

   Oqim:
   1. Tugma bosilganda — kichik dropdown ochiladi: "1 soat / 1 kun /
      7 kun / Cheksiz". Foydalanuvchi bittasini tanlaydi (har safar
      qayta tanlanadi — fixed default emas, ataylab shunday so'ralgan).
   2. Faol chat (getActiveChat) topiladi — category/filename olinadi.
   3. Backend'ga POST /share (auth bilan, {category, filename,
      expires_in}) yuboriladi. Backend 64 xonali hex room_id qaytaradi
      (bir chatga bitta doimiy link — qayta bossang ham o'sha eskisi
      qaytadi, FAQAT expires_at yangilanadi, main.py/create_share'ga
      qarang — ya'ni linkning o'zi o'zgarmaydi, muddati yangilanadi).
   4. Havola: `${origin}/share.html?room=<room_id>` — static fayl,
      auth/firebase session'siz ishlaydi, shuning uchun uni ochgan har
      KIM (login qilmasdan) o'sha chatni faqat o'qish rejimida ko'radi
      — TO MUDDAT o'tguncha (backend/get_public_chat muddatni tekshiradi).
   5. Clipboard'ga copy qilinadi + muddatni eslatadigan toast.

   MUHIM (achiq haqiqat): bu havolani bilgan har kim chatni ko'radi —
   parolsiz, muddat tugagunga qadar. Shuning uchun faqat foydalanuvchi
   ONGLI ravishda bossagina yaratiladi (avtomatik emas), va backend'da
   revoke uchun DELETE /share/<category>/<filename> allaqachon tayyor
   turibdi — frontend'da "linkni bekor qil" tugmasi hozircha yo'q,
   keyin kerak bo'lsa osongina qo'shiladi.
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders } from '../auth/session.js';
import { getActiveChat } from '../chat/chat-storage.js';

const shareBtn = document.getElementById("header-share-btn");

const EXPIRY_OPTIONS = [
  { value: "1h", label: "1 soat" },
  { value: "1d", label: "1 kun" },
  { value: "7d", label: "7 kun" },
  { value: "never", label: "Cheksiz" },
];

let menuEl = null;
let backdropEl = null;

function showToast(text, isError = false) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: ${isError ? "#4a1f1f" : "#2a2a2a"};
    color: #ececec; border: 1px solid ${isError ? "#7a3a3a" : "#3a3a3a"};
    padding: 10px 16px; border-radius: 10px; font-size: 13px;
    z-index: 9999; box-shadow: 0 4px 16px rgba(0,0,0,.4);
    opacity: 0; transition: opacity .15s ease; max-width: 90vw; text-align: center;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API rad etsa (masalan http/permission) — fallback.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }
}

function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  if (backdropEl) { backdropEl.remove(); backdropEl = null; }
  document.removeEventListener("keydown", onKeydown);
}

function onKeydown(e) {
  if (e.key === "Escape") closeMenu();
}

function openExpiryMenu() {
  backdropEl = document.createElement("div");
  backdropEl.style.cssText = "position:fixed;inset:0;background:transparent;z-index:998;";
  backdropEl.addEventListener("click", closeMenu);
  document.body.appendChild(backdropEl);

  const rect = shareBtn.getBoundingClientRect();
  menuEl = document.createElement("div");
  menuEl.style.cssText = `
    position:fixed; top:${rect.bottom + 6}px; right:${window.innerWidth - rect.right}px;
    background:#1e1e1e; border:1px solid #3a3a3a; border-radius:12px;
    box-shadow:0 12px 32px rgba(0,0,0,.5); z-index:999; overflow:hidden;
    min-width:160px; padding:4px;
  `;

  const title = document.createElement("div");
  title.textContent = "Link muddati";
  title.style.cssText = "font-size:11px;color:#8e8e8e;padding:8px 10px 4px;";
  menuEl.appendChild(title);

  for (const opt of EXPIRY_OPTIONS) {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = opt.label;
    item.style.cssText = "display:block;width:100%;text-align:left;padding:8px 10px;border-radius:8px;background:none;border:none;color:#ececec;font-size:13px;cursor:pointer;";
    item.onmouseenter = () => item.style.background = "#2a2a2a";
    item.onmouseleave = () => item.style.background = "none";
    item.addEventListener("click", () => {
      closeMenu();
      createAndCopyLink(opt.value, opt.label);
    });
    menuEl.appendChild(item);
  }

  document.body.appendChild(menuEl);
  document.addEventListener("keydown", onKeydown);
}

async function createAndCopyLink(expiresIn, expiresLabel) {
  const chat = getActiveChat();
  if (!chat || !chat.category || !chat.filename || !chat.messages || chat.messages.length === 0) {
    showToast("Avval kamida bitta xabar yubor — bo'sh chatni share qilib bo'lmaydi.", true);
    return;
  }

  shareBtn.disabled = true;
  const originalText = shareBtn.textContent;
  shareBtn.textContent = "...";

  try {
    const res = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ category: chat.category, filename: chat.filename, expires_in: expiresIn }),
    });
    const data = await res.json();
    if (!res.ok || !data.room_id) {
      throw new Error(data.error || "share yaratib bo'lmadi");
    }
    const url = `${window.location.origin}/share.html?room=${data.room_id}`;
    const copied = await copyToClipboard(url);
    const expiryText = expiresIn === "never" ? "muddatsiz" : `${expiresLabel}dan keyin tugaydi`;
    showToast(copied ? `Public link nusxalandi — ${expiryText}.` : url);
  } catch (e) {
    console.error("Share xato:", e);
    showToast("Link yaratib bo'lmadi. Qayta urinib ko'r.", true);
  } finally {
    shareBtn.disabled = false;
    shareBtn.textContent = originalText;
  }
}

if (shareBtn) {
  shareBtn.addEventListener("click", () => {
    if (menuEl) { closeMenu(); return; } // toggle: qayta bosilsa yopiladi
    openExpiryMenu();
  });
}
