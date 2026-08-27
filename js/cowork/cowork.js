/* =====================================================================
   cowork.js — "Cowork" rejimi: bitta uzoq/ko'p bosqichli vazifani yozib
   jo'natib qo'yish, keyin fon Thread'da avtonom ishlab, natijani jonli
   kuzatish (Claude Cowork uslubi). Backend tomoni main.py'dagi
   /cowork/start, /cowork/list, /cowork/<id>, /cowork/<id>/cancel va
   mavjud /job/<id>/poll, /confirm endpoint'lariga tayanadi.

   Bu fayl term-panel/terminal.js bilan bir xil naqshda yozilgan: modul
   yuklanganda o'zi DOM'ga bog'lanadi (index.html'ga import qilinishi
   kifoya, boshqa hech narsa chaqirish shart emas).
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders } from '../auth/session.js';
import { parseSseChunk } from '../agent/sse-parser.js';

const chatPanel = document.getElementById("chat-panel");
const termPanel = document.getElementById("term-panel");
const coworkPanel = document.getElementById("cowork-panel");
const coworkBtn = document.getElementById("cowork-btn");
const coworkCloseBtn = document.getElementById("cowork-close-btn");
const coworkNewBtn = document.getElementById("cowork-new-btn");
const coworkBody = document.getElementById("cowork-body");

const STATUS_LABEL = {
  running: "Ishlayapti",
  paused_confirm: "Tasdiqlash kerak",
  done: "Tugadi",
  error: "Xatolik",
  cancelled: "Bekor qilindi",
  interrupted: "Uzildi (server qayta ishga tushgan)",
};
const STATUS_COLOR = {
  running: "#e0a020",
  paused_confirm: "#4c9dff",
  done: "#3fb950",
  error: "#f2555a",
  cancelled: "#8e8e8e",
  interrupted: "#8e8e8e",
};

let detailPollTimer = null;
let detailPollAfter = 0;
let detailPollJobId = null;
let detailPollCoworkId = null;

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function stopDetailPolling() {
  if (detailPollTimer) { clearTimeout(detailPollTimer); detailPollTimer = null; }
  detailPollJobId = null;
  detailPollCoworkId = null;
}

export function openCowork() {
  if (!API_BASE) return;
  chatPanel.classList.add("hidden");
  termPanel.classList.add("hidden");
  termPanel.classList.remove("flex");
  coworkPanel.classList.remove("hidden");
  coworkPanel.classList.add("flex");
  renderList();
}

export function closeCowork() {
  coworkPanel.classList.add("hidden");
  coworkPanel.classList.remove("flex");
  chatPanel.classList.remove("hidden");
  stopDetailPolling();
}

async function fetchJson(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders({}), ...opts });
  if (res.status === 401) {
    const { handleAuthFailure } = await import('../auth/login.js');
    await handleAuthFailure(res);
    throw new Error("auth");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function renderList() {
  stopDetailPolling();
  coworkBody.innerHTML = `<div class="text-[13px] text-[#8e8e8e] px-1 py-4">Yuklanmoqda...</div>`;
  let data;
  try {
    data = await fetchJson("/cowork/list");
  } catch (e) {
    if (e.message === "auth") return;
    coworkBody.innerHTML = `<div class="text-[13px]" style="color:#f2555a;">Ro'yxatni yuklab bo'lmadi: ${esc(e.message)}</div>`;
    return;
  }
  const jobs = data.jobs || [];
  if (!jobs.length) {
    coworkBody.innerHTML = `<div class="text-[13px] text-[#8e8e8e] px-1 py-4">Hali cowork vazifalari yo'q. "+ Yangi vazifa" bilan boshlang.</div>`;
    return;
  }
  coworkBody.innerHTML = "";
  const list = document.createElement("div");
  list.className = "space-y-2";
  for (const job of jobs) {
    const card = document.createElement("button");
    card.className = "w-full text-left rounded-lg px-3 py-2.5 hover:bg-[#2a2a2a] transition-colors";
    card.style.border = "1px solid #2a2a2a";
    const color = STATUS_COLOR[job.status] || "#8e8e8e";
    const label = STATUS_LABEL[job.status] || job.status;
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="inline-flex items-center gap-1.5 text-[11px]" style="color:${color};">
          <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${color};"></span>${esc(label)}
        </span>
        <span class="text-[11px] text-[#6a6a6a]">${esc((job.created_at || "").slice(0, 16).replace("T", " "))}</span>
      </div>
      <div class="text-[13px] text-[#ececec] truncate">${esc(job.prompt)}</div>
      <div class="text-[11px] text-[#6a6a6a] mt-0.5">${job.step_count || 0} qadam &middot; ${esc(job.autonomy)}</div>`;
    card.addEventListener("click", () => openDetail(job.id));
    list.appendChild(card);
  }
  coworkBody.appendChild(list);
}

function renderNewTaskForm() {
  stopDetailPolling();
  coworkBody.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "space-y-3 max-w-[520px]";
  wrap.innerHTML = `
    <button id="cowork-back-list" class="text-[12px] text-[#8e8e8e] hover:text-[#ececec]">&larr; Orqaga</button>
    <div class="text-[15px] font-medium text-[#ececec]">Yangi cowork vazifa</div>
    <textarea id="cowork-prompt-input" rows="5" placeholder="Nima qilishim kerak? Uzoq/ko'p bosqichli vazifani batafsil yozing..."
      class="w-full rounded-lg px-3 py-2 text-[13px] text-[#ececec]"
      style="background:#1a1a1a;border:1px solid #2a2a2a;outline:none;resize:vertical;"></textarea>
    <div class="flex items-center gap-3">
      <label class="text-[12px] text-[#a8a8a8]">Ruxsat darajasi:</label>
      <select id="cowork-autonomy-select" class="text-[12px] rounded-md px-2 py-1"
        style="background:#1a1a1a;border:1px solid #2a2a2a;color:#ececec;">
        <option value="safe_write">safe_write &mdash; fayl yozadi, komandalar tasdiq talab qiladi</option>
        <option value="full">full &mdash; xavfsiz komandalarni ham o'zi bajaradi</option>
      </select>
    </div>
    <button id="cowork-start-btn" class="rounded-lg px-4 py-2 text-[13px] font-medium"
      style="background:#D97757;color:#0b0b0b;">Boshlash</button>
    <div id="cowork-start-error" class="text-[12px]" style="color:#f2555a;"></div>`;
  coworkBody.appendChild(wrap);
  document.getElementById("cowork-back-list").addEventListener("click", renderList);
  document.getElementById("cowork-start-btn").addEventListener("click", async () => {
    const prompt = document.getElementById("cowork-prompt-input").value.trim();
    const autonomy = document.getElementById("cowork-autonomy-select").value;
    const errEl = document.getElementById("cowork-start-error");
    if (!prompt) { errEl.textContent = "Vazifa matnini yozing."; return; }
    errEl.textContent = "";
    const btn = document.getElementById("cowork-start-btn");
    btn.disabled = true; btn.textContent = "Boshlanyapti...";
    try {
      const data = await fetchJson("/cowork/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, autonomy, category: "cowork" }),
      });
      await openDetail(data.cowork_id);
    } catch (e) {
      if (e.message === "auth") return;
      errEl.textContent = "Boshlab bo'lmadi: " + e.message;
      btn.disabled = false; btn.textContent = "Boshlash";
    }
  });
}

function messageRowHtml(m) {
  if (m.role === "user") {
    return `<div class="text-[13px] text-[#ececec] px-3 py-2 rounded-lg self-end" style="background:#2a2a2a;">${esc(m.content)}</div>`;
  }
  if (m.role === "assistant") {
    return `<div class="text-[13px] text-[#ececec] whitespace-pre-wrap">${esc(m.content)}</div>`;
  }
  if (m.role === "action") {
    const blocked = m.blocked;
    return `<div class="text-[12px] rounded-md px-2.5 py-2" style="background:#1a1a1a;border:1px solid ${blocked ? "#f2555a" : "#2a2a2a"};">
      <div class="font-mono" style="color:${blocked ? "#f2555a" : "#a8a8a8"};">${esc(m.input)}</div>
      ${m.output ? `<div class="font-mono text-[#6a6a6a] mt-1 whitespace-pre-wrap">${esc(m.output)}</div>` : ""}
    </div>`;
  }
  if (m.role === "pending") {
    return `<div class="text-[12px] px-2.5 py-2 rounded-md" style="background:#1a1a1a;border:1px solid #4c9dff;color:#4c9dff;">${esc(m.content)}</div>`;
  }
  if (m.role === "error") {
    return `<div class="text-[12px] px-2.5 py-2 rounded-md" style="background:#1a1a1a;border:1px solid #f2555a;color:#f2555a;">${esc(m.content)}</div>`;
  }
  return "";
}

async function openDetail(coworkId) {
  stopDetailPolling();
  coworkBody.innerHTML = `<div class="text-[13px] text-[#8e8e8e] px-1 py-4">Yuklanmoqda...</div>`;
  let data;
  try {
    data = await fetchJson(`/cowork/${encodeURIComponent(coworkId)}`);
  } catch (e) {
    if (e.message === "auth") return;
    coworkBody.innerHTML = `<div class="text-[13px]" style="color:#f2555a;">Topilmadi: ${esc(e.message)}</div>`;
    return;
  }
  renderDetail(data.job, data.messages || []);
}

function renderDetail(job, messages) {
  coworkBody.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "space-y-3 max-w-[680px]";
  const color = STATUS_COLOR[job.status] || "#8e8e8e";
  const label = STATUS_LABEL[job.status] || job.status;
  wrap.innerHTML = `
    <button id="cowork-back-list2" class="text-[12px] text-[#8e8e8e] hover:text-[#ececec]">&larr; Ro'yxatga</button>
    <div class="flex items-center justify-between gap-2">
      <span id="cowork-detail-status" class="inline-flex items-center gap-1.5 text-[12px]" style="color:${color};">
        <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${color};"></span>${esc(label)}
      </span>
      <button id="cowork-cancel-btn" class="text-[11px] text-[#8e8e8e] hover:text-[#f2555a] px-2 py-1"
        style="display:${job.status === "running" || job.status === "paused_confirm" ? "inline" : "none"};">Bekor qilish</button>
    </div>
    <div id="cowork-detail-log" class="space-y-2"></div>
    <div id="cowork-detail-live" class="space-y-2"></div>
    <div id="cowork-confirm-slot"></div>`;
  coworkBody.appendChild(wrap);

  document.getElementById("cowork-back-list2").addEventListener("click", renderList);
  document.getElementById("cowork-cancel-btn").addEventListener("click", async () => {
    try { await fetchJson(`/cowork/${encodeURIComponent(job.id)}/cancel`, { method: "POST" }); } catch (e) {}
    openDetail(job.id);
  });

  const logEl = document.getElementById("cowork-detail-log");
  for (const m of messages) {
    const html = messageRowHtml(m);
    if (html) logEl.insertAdjacentHTML("beforeend", html);
  }

  if (job.status === "paused_confirm" && job.pending_command_id) {
    renderConfirmButton(job.id, job.pending_command_id);
  }

  if ((job.status === "running") && job.job_id) {
    pollDetail(job.id, job.job_id);
  }
}

function renderConfirmButton(coworkId, commandId) {
  const slot = document.getElementById("cowork-confirm-slot");
  if (!slot) return;
  slot.innerHTML = `<button id="cowork-confirm-btn" class="rounded-lg px-4 py-2 text-[13px] font-medium"
    style="background:#3fb950;color:#0b0b0b;">Tasdiqlash va davom ettirish</button>`;
  document.getElementById("cowork-confirm-btn").addEventListener("click", async () => {
    const btn = document.getElementById("cowork-confirm-btn");
    btn.disabled = true; btn.textContent = "Tasdiqlanyapti...";
    try {
      const data = await fetchJson("/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command_id: commandId }),
      });
      slot.innerHTML = "";
      if (data.job_id) pollDetail(coworkId, data.job_id);
    } catch (e) {
      btn.disabled = false; btn.textContent = "Tasdiqlash va davom ettirish";
    }
  });
}

function pollDetail(coworkId, jobId) {
  detailPollAfter = 0;
  detailPollJobId = jobId;
  detailPollCoworkId = coworkId;
  const liveEl = document.getElementById("cowork-detail-live");
  const statusEl = document.getElementById("cowork-detail-status");

  async function tick() {
    if (detailPollJobId !== jobId) return; // user navigated away from this job
    let res;
    try {
      res = await fetch(`${API_BASE}/job/${encodeURIComponent(jobId)}/poll?after=${detailPollAfter}`, {
        headers: authHeaders({}),
      });
    } catch (e) {
      detailPollTimer = setTimeout(tick, 1800);
      return;
    }
    if (!res.ok) { detailPollTimer = setTimeout(tick, 1800); return; }
    const data = await res.json();
    detailPollAfter = data.next_after ?? detailPollAfter;

    for (const raw of data.events || []) {
      const { events } = parseSseChunk(raw);
      for (const evt of events) {
        if (evt.type === "thinking") {
          if (liveEl) liveEl.innerHTML = `<div class="text-[12px] text-[#8e8e8e] italic">${esc(evt.label || "...")}</div>`;
        } else if (evt.type === "step_result") {
          if (liveEl) liveEl.innerHTML = "";
          const target = evt.command || evt.path || evt.action || "";
          document.getElementById("cowork-detail-log")?.insertAdjacentHTML("beforeend", `
            <div class="text-[12px] rounded-md px-2.5 py-2" style="background:#1a1a1a;border:1px solid #2a2a2a;">
              <div class="font-mono text-[#a8a8a8]">${esc(evt.action)} ${esc(target)}</div>
              ${evt.result ? `<div class="font-mono text-[#6a6a6a] mt-1 whitespace-pre-wrap">${esc(evt.result)}</div>` : ""}
            </div>`);
        } else if (evt.type === "final") {
          if (liveEl) liveEl.innerHTML = "";
          if (evt.response) {
            document.getElementById("cowork-detail-log")?.insertAdjacentHTML("beforeend",
              `<div class="text-[13px] text-[#ececec] whitespace-pre-wrap">${esc(evt.response)}</div>`);
          }
          if (evt.kind === "cowork_paused_confirm" && evt.command_id) {
            if (statusEl) { statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#4c9dff;"></span>Tasdiqlash kerak`; statusEl.style.color = "#4c9dff"; }
            renderConfirmButton(coworkId, evt.command_id);
          } else if (statusEl) {
            const st = evt.kind === "cancelled" ? "cancelled" : (evt.kind === "cowork_error" || evt.kind === "cowork_budget" ? "error" : "done");
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${STATUS_COLOR[st]};"></span>${esc(STATUS_LABEL[st])}`;
            statusEl.style.color = STATUS_COLOR[st];
          }
        }
      }
    }

    if (data.status === "done") { stopDetailPolling(); return; }
    detailPollTimer = setTimeout(tick, 1500);
  }
  tick();
}

coworkBtn?.addEventListener("click", openCowork);
coworkCloseBtn?.addEventListener("click", closeCowork);
coworkNewBtn?.addEventListener("click", renderNewTaskForm);
