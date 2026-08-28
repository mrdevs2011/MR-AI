/* =====================================================================
   replay.js — REPLAY MODE paneli.
   OS darajasidagi mouse/keyboard harakatlarini yozib olish (evdev) va
   qayta ijro etish (ydotool). Backend: assets/hcz/hcz5_replay.py,
   route'lar main.py'da (/replay/*). LLM ishtirokisiz — token sarflanmaydi.

   terminal.js bilan bir xil panel-toggle naqshi: chat-panel yashiriladi,
   bu panel ko'rsatiladi. Auth uchun mavjud authHeaders()/handleAuthFailure()
   helper'laridan foydalanadi — boshqa hech qanday route bilan bir xil
   pattern, alohida ixtiro qilinmagan.
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders, markActive } from '../auth/session.js';
import { handleAuthFailure } from '../auth/login.js';

const chatPanel = document.getElementById("chat-panel");
const replayBtn = document.getElementById("replay-btn");
const replayPanel = document.getElementById("replay-panel");
const replayListEl = document.getElementById("replay-list");
const addReplayBtn = document.getElementById("add-replay-project-btn");
const replayCloseBtn = document.getElementById("replay-close-btn");

let isRecording = false;

export function openReplayPanel() {
  chatPanel.classList.add("hidden");
  replayPanel.classList.remove("hidden");
  replayPanel.classList.add("flex");
  refreshReplayList();
}

export function closeReplayPanel() {
  replayPanel.classList.add("hidden");
  replayPanel.classList.remove("flex");
  chatPanel.classList.remove("hidden");
}

async function refreshReplayList() {
  try {
    const res = await fetch(`${API_BASE}/replay/list`, { headers: authHeaders() });
    if (res.status === 401) {
      await handleAuthFailure(res);
      return;
    }
    if (!res.ok) throw new Error("bad status " + res.status);
    markActive();
    const data = await res.json();
    renderReplayList(data.items || []);
  } catch (e) {
    replayListEl.innerHTML = `<div class="text-[#f2555a] px-2 py-2">Ro'yxatni yuklab bo'lmadi: ${e.message}</div>`;
  }
}

function renderReplayList(items) {
  replayListEl.innerHTML = "";
  if (items.length === 0) {
    replayListEl.innerHTML = `<div class="text-[#8e8e8e] px-2 py-2">Hali hech qanday replay saqlanmagan.</div>`;
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between px-2 py-2 rounded-lg hover:bg-[#2a2a2a]";
    row.innerHTML = `
      <span class="text-[#ececec] truncate">${item.name}</span>
      <div class="flex gap-1.5 shrink-0">
        <button data-id="${item.id}" class="replay-play-btn text-[11px] px-2 py-1 rounded"
                style="background:#1f6b3a; color:#fff;">Start</button>
        <button data-id="${item.id}" class="replay-del-btn text-[11px] px-2 py-1 rounded"
                style="background:#6b1f24; color:#fff;">O'chir</button>
      </div>`;
    replayListEl.appendChild(row);
  });
}

async function startRecording() {
  try {
    const res = await fetch(`${API_BASE}/replay/start`, { method: "POST", headers: authHeaders() });
    if (res.status === 401) {
      await handleAuthFailure(res);
      return;
    }
    markActive();
    isRecording = true;
    addReplayBtn.textContent = "Yozishni to'xtatish";
    addReplayBtn.style.background = "#6b1f24";
  } catch (e) {
    alert("Recording'ni boshlab bo'lmadi: " + e.message);
  }
}

async function stopRecording() {
  const name = prompt("Replay nomi:");
  addReplayBtn.textContent = "+ Add Replay Project";
  addReplayBtn.style.background = "#2a2a2a";
  isRecording = false;
  if (!name || !name.trim()) return; // bekor qilindi, lekin recorder allaqachon to'xtagan bo'lishi kerak edi — pastda ham stop yuboramiz
  try {
    const res = await fetch(`${API_BASE}/replay/stop`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.status === 401) {
      await handleAuthFailure(res);
      return;
    }
    markActive();
    const data = await res.json();
    if (!data.ok) {
      alert("Saqlab bo'lmadi: " + (data.error || "noma'lum xato"));
    }
    refreshReplayList();
  } catch (e) {
    alert("Saqlashda xato: " + e.message);
  }
}

addReplayBtn?.addEventListener("click", () => {
  if (isRecording) stopRecording();
  else startRecording();
});

replayListEl?.addEventListener("click", async (e) => {
  const playBtn = e.target.closest(".replay-play-btn");
  const delBtn = e.target.closest(".replay-del-btn");

  if (playBtn) {
    const id = playBtn.dataset.id;
    const original = playBtn.textContent;
    playBtn.disabled = true;
    let secondsLeft = 5;
    playBtn.textContent = `${secondsLeft}s...`;
    const countdown = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) playBtn.textContent = `${secondsLeft}s...`;
    }, 1000);
    try {
      const res = await fetch(`${API_BASE}/replay/play/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        await handleAuthFailure(res);
        clearInterval(countdown);
        return;
      }
      markActive();
    } catch (err) {
      alert("Ijro qilishda xato: " + err.message);
    }
    setTimeout(() => {
      clearInterval(countdown);
      playBtn.textContent = original;
      playBtn.disabled = false;
    }, 5200);
  }

  if (delBtn) {
    const id = delBtn.dataset.id;
    if (!confirm("Rostdan ham bu replay o'chirilsinmi?")) return;
    try {
      const res = await fetch(`${API_BASE}/replay/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        await handleAuthFailure(res);
        return;
      }
      markActive();
      refreshReplayList();
    } catch (err) {
      alert("O'chirishda xato: " + err.message);
    }
  }
});

replayBtn?.addEventListener("click", openReplayPanel);
replayCloseBtn?.addEventListener("click", closeReplayPanel);
