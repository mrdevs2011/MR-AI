/* =====================================================================
   files.js — header'dagi file-icon tugmasi ("Files"): joriy chatga
   tegishli ikkala tomonni ham bitta panelda ko'rsatadi:
     - foydalanuvchi YUKLAGAN fayllar (attach.js/+ tugmasi orqali)
     - AI TAYYORLAB bergan fayllar (output-card.js'dagi bilan bir xil
       ro'yxat, lekin bu yerda BUTUN chat tarixi bo'yicha, faqat oxirgi
       xabar emas)

   Ma'lumot backend/GET /files/<category>/<filename>'dan keladi
   (main.py/list_chat_files — disk holatidan o'qiydi, chat log matnini
   parse qilib emas).

   Auth eslatmasi (output-card.js'dagi bilan bir xil sabab): bu loyiha
   custom header (X-Login-Pass/X-Session-Id) bilan ishlaydi, oddiy
   <a href> headersiz so'rov yuboradi va 401 qaytaradi — shuning uchun
   yuklab olish ham fetch()+blob+ObjectURL orqali.
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders } from '../auth/session.js';
import { getActiveChat } from '../chat/chat-storage.js';

const fileBtn = document.getElementById("header-file-btn");

let panelEl = null;
let backdropEl = null;

function formatBytes(n) {
  if (n == null || isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function closePanel() {
  if (panelEl) { panelEl.remove(); panelEl = null; }
  if (backdropEl) { backdropEl.remove(); backdropEl = null; }
  document.removeEventListener("keydown", onKeydown);
}

function onKeydown(e) {
  if (e.key === "Escape") closePanel();
}

async function downloadEntry(btn, entry, category, filename) {
  const original = btn.textContent;
  btn.textContent = "...";
  btn.disabled = true;
  try {
    const base = entry.kind === "upload" ? "download-upload" : "download-output";
    const url = `${API_BASE}/${base}/${encodeURIComponent(category)}/${encodeURIComponent(filename)}/${entry.name.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error("download failed: " + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = entry.name.split("/").pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    btn.textContent = original;
  } catch (e) {
    console.error("Fayl yuklab bo'lmadi:", e);
    btn.textContent = "Xato";
    setTimeout(() => { btn.textContent = original; }, 1500);
  } finally {
    btn.disabled = false;
  }
}

const FILE_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="16" height="16">
    <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke-linejoin="round"/>
    <path d="M15 2v5h5" stroke-linejoin="round"/>
  </svg>`;

function renderRow(entry, category, filename) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;";
  row.onmouseenter = () => row.style.background = "#2a2a2a";
  row.onmouseleave = () => row.style.background = "transparent";

  const iconWrap = document.createElement("div");
  iconWrap.style.cssText = "flex-shrink:0;width:28px;height:28px;border-radius:8px;background:#2f2f2f;display:flex;align-items:center;justify-content:center;color:#ececec;";
  iconWrap.innerHTML = FILE_ICON_SVG;

  const info = document.createElement("div");
  info.style.cssText = "flex:1;min-width:0;";
  const nameEl = document.createElement("div");
  nameEl.textContent = entry.name.split("/").pop();
  nameEl.style.cssText = "font-size:13px;color:#ececec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  const metaEl = document.createElement("div");
  metaEl.textContent = [entry.kind === "upload" ? "Uploaded" : "Generated", formatBytes(entry.size)].filter(Boolean).join(" · ");
  metaEl.style.cssText = "font-size:11px;color:#8e8e8e;";
  info.appendChild(nameEl);
  info.appendChild(metaEl);

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.textContent = "Download";
  dlBtn.style.cssText = "flex-shrink:0;font-size:12px;padding:5px 10px;border-radius:8px;background:#2f2f2f;color:#ececec;border:1px solid #3a3a3a;cursor:pointer;";
  dlBtn.addEventListener("click", () => downloadEntry(dlBtn, entry, category, filename));

  row.appendChild(iconWrap);
  row.appendChild(info);
  row.appendChild(dlBtn);
  return row;
}

async function openPanel() {
  const chat = getActiveChat();
  if (!chat || !chat.category || !chat.filename || chat.filename === "session") {
    return; // bo'sh chatda ko'rsatadigan hech narsa yo'q
  }

  backdropEl = document.createElement("div");
  backdropEl.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:998;";
  backdropEl.addEventListener("click", closePanel);
  document.body.appendChild(backdropEl);

  panelEl = document.createElement("div");
  panelEl.style.cssText = `
    position:fixed;top:64px;right:12px;width:min(360px,calc(100vw - 24px));
    max-height:min(480px,calc(100vh - 90px));background:#1e1e1e;border:1px solid #3a3a3a;
    border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.5);z-index:999;
    display:flex;flex-direction:column;overflow:hidden;
  `;

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #2f2f2f;flex-shrink:0;";
  header.innerHTML = `<span style="font-size:13px;font-weight:500;color:#ececec;">Files</span>`;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "\u2715";
  closeBtn.style.cssText = "background:none;border:none;color:#8e8e8e;cursor:pointer;font-size:14px;line-height:1;padding:4px;";
  closeBtn.addEventListener("click", closePanel);
  header.appendChild(closeBtn);
  panelEl.appendChild(header);

  const body = document.createElement("div");
  body.style.cssText = "overflow-y:auto;padding:6px;flex:1;";
  body.innerHTML = `<div style="padding:20px;text-align:center;color:#8e8e8e;font-size:13px;">Loading...</div>`;
  panelEl.appendChild(body);

  document.body.appendChild(panelEl);
  document.addEventListener("keydown", onKeydown);

  try {
    const res = await fetch(`${API_BASE}/files/${encodeURIComponent(chat.category)}/${encodeURIComponent(chat.filename)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("bad status " + res.status);
    const data = await res.json();
    const all = [...(data.uploads || []), ...(data.outputs || [])];

    body.innerHTML = "";
    if (!all.length) {
      body.innerHTML = `<div style="padding:20px;text-align:center;color:#8e8e8e;font-size:13px;">Bu chatda hali fayl yo\u02bbq.</div>`;
      return;
    }
    for (const entry of all) {
      body.appendChild(renderRow(entry, chat.category, chat.filename));
    }
  } catch (e) {
    console.error("Fayllar ro'yxatini yuklab bo'lmadi:", e);
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#8e8e8e;font-size:13px;">Fayllarni yuklab bo\u02bblmadi.</div>`;
  }
}

if (fileBtn) {
  fileBtn.addEventListener("click", () => {
    if (panelEl) { closePanel(); return; } // toggle: qayta bosilsa yopiladi
    openPanel();
  });
}
