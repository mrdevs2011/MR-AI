/* =====================================================================
   attach.js — "+" attach button: rasm fayllar keyingi xabar bilan
   birga ketadigan inline preview sifatida staged qilinadi; boshqa
   fayllar to'g'ridan-to'g'ri /upload orqali diskka yuklanadi.
   script.js'dan ko'chirildi: clearPendingImage (2590),
   showPendingImagePreview (2598), va ularning atrofidagi attachBtn/
   attachInput DOM qurilishi + change listener (2581-2674).

   `pendingImageDataUrl` — bu modulning ichki holati. sendMessage()
   (main.js/send-message) buni o'qish uchun getPendingImageDataUrl()
   orqali murojaat qiladi, chunki ES modul ichidagi `let` tashqaridan
   to'g'ridan-to'g'ri o'zgartirilolmaydi (store.js'dagi izohga qarang).
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders, markActive } from '../auth/session.js';
import { getActiveChat } from '../chat/chat-storage.js';
import { addMessage } from '../chat/message-render.js';
import { setEmptyState } from '../chat/chat-history.js';

const attachBtn = document.getElementById("attach-btn");
const attachInput = document.createElement("input");
attachInput.type = "file";
attachInput.className = "visually-hidden-select"; // reuse existing hide-but-keep-in-DOM class
document.body.appendChild(attachInput);

let pendingImageDataUrl = null;
let pendingImagePreviewEl = null;

export function getPendingImageDataUrl() {
  return pendingImageDataUrl;
}

export function clearPendingImage() {
  pendingImageDataUrl = null;
  if (pendingImagePreviewEl) {
    pendingImagePreviewEl.remove();
    pendingImagePreviewEl = null;
  }
}

export function showPendingImagePreview(dataUrl, fileName) {
  clearPendingImage();
  pendingImageDataUrl = dataUrl;

  const chip = document.createElement("div");
  chip.style.cssText = "display:flex;align-items:center;gap:8px;max-width:720px;margin:0 auto 8px;padding:6px 10px;border-radius:10px;background:#1c1c1c;border:1px solid #333;";
  chip.innerHTML = `
    <img src="${dataUrl}" alt="${fileName}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;" />
    <span style="flex:1;font-size:12px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fileName} — will be analyzed with your next message</span>
    <button type="button" title="Remove" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;line-height:1;">×</button>
  `;
  chip.querySelector("button").addEventListener("click", clearPendingImage);

  // Insert right above whichever composer copy is currently visible
  // (empty-state slot or bottom-pinned footer slot).
  const activeComposer = document.querySelector("#composer-slot-empty .composer-box, #composer-slot-footer .composer-box");
  const composerSlotEmpty = document.getElementById("composer-slot-empty");
  (activeComposer || composerSlotEmpty).parentElement.insertBefore(chip, activeComposer || composerSlotEmpty.firstChild);
  pendingImagePreviewEl = chip;
}

attachBtn?.addEventListener("click", () => {
  if (!API_BASE) return;
  attachInput.value = ""; // allow re-picking the same file twice in a row
  attachInput.click();
});

attachInput.addEventListener("change", async () => {
  const file = attachInput.files && attachInput.files[0];
  if (!file) return;

  if (file.type && file.type.startsWith("image/")) {
    // Stage it — no network call yet. It gets attached to /chat's
    // JSON body the moment the user actually sends a message.
    const reader = new FileReader();
    reader.onload = () => showPendingImagePreview(reader.result, file.name);
    reader.onerror = () => addMessage("Couldn't read that image file.", "bot");
    reader.readAsDataURL(file);
    return;
  }

  // Non-image files: unchanged behavior, straight to disk.
  const active = getActiveChat();
  const category = (active && active.category) || "general";
  const filename = (active && active.filename) || "chat";

  addMessage(`Uploading ${file.name}…`, "user", false);
  setEmptyState(false);

  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  form.append("filename", filename);

  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: authHeaders(), // no Content-Type here — the browser sets
                               // the multipart boundary itself for FormData
      body: form
    });

    if (res.status === 401) {
      const { handleAuthFailure } = await import('../auth/login.js');
      await handleAuthFailure(res);
      return;
    }
    markActive();

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.uploaded) {
      addMessage(data.error || "Upload failed.", "bot");
      return;
    }
    addMessage(`Uploaded "${data.filename}" (${data.size} bytes).`, "bot");
  } catch (err) {
    addMessage("Couldn't reach the backend to upload the file.", "bot");
  }
});
