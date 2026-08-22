/* =====================================================================
   path-autocomplete.js — "/" path autocomplete: composer textarea'da
   "/..." tokeni yozilayotganda backend'dan haqiqiy fayl/papka
   ro'yxatini ko'rsatadi (breadcrumb + items list).
   script.js'dan ko'chirildi: hidePathDropdown (2334), positionPathDropdown
   (2343), typedPathParts (2352), renderBreadcrumb (2356), jumpBreadcrumbTo
   (2395), applyTypedParts (2405), stepBreadcrumbBack (2419),
   stepBreadcrumbForward (2429), renderPathDropdown (2438),
   currentPathToken (2456), refreshPathDropdown (2471), applyPathPick
   (2514), shuningdek pathDropdown/pathBreadcrumb/pathItemsList DOM
   qurilishi va input listener'lari (2313-2573).

   MUHIM: autoResizeInput() utils/dom.js'dan keladi va `input`ni
   parametr sifatida talab qiladi (dom.js'dagi izohga qarang) — bu
   yerda shunga mos chaqiriladi.
   ===================================================================== */

import { API_BASE } from '../state/store.js';
import { authHeaders } from '../auth/session.js';
import { getActiveChat } from '../chat/chat-storage.js';
import { autoResizeInput } from '../utils/dom.js';

const input = document.getElementById("message");

// ---- "/" path autocomplete: while typing a "/..." token in the
// textarea, show a live dropdown of real files/folders from the
// backend (relative to this chat's current session cwd — same
// resolve_path() rules the AI itself uses, including the "/chats/..."
// virtual root), so what you pick is guaranteed to be a real path.
const pathDropdown = document.createElement("div");
pathDropdown.style.cssText = "position:absolute;z-index:50;display:none;max-width:min(420px,90vw);background:#1c1c1c;border:1px solid #333;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);overflow:hidden;";
document.body.appendChild(pathDropdown);

// Breadcrumb bar: sits on top of the items list, inside the same box.
// Fixed root the user always stands in — everything typed after "/"
// is appended live as extra segments (mragent / user / chats / ...).
const PATH_ROOT_SEGMENTS = ["mragent", "user"];
const pathBreadcrumb = document.createElement("div");
pathBreadcrumb.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:2px;padding:7px 10px;font-size:12px;color:#999;border-bottom:1px solid #2a2a2a;background:#181818;user-select:none;";
pathDropdown.appendChild(pathBreadcrumb);

const pathItemsList = document.createElement("div");
pathItemsList.style.cssText = "max-height:220px;overflow-y:auto;padding:4px;";
pathDropdown.appendChild(pathItemsList);

let pathDropdownItems = [];
let pathDropdownActiveIndex = -1;
let pathDropdownTokenStart = -1; // index in input.value where the current "/token" begins
let pathDropdownBaseDir = ""; // the stable "/a/b/" directory part items are listed under — set once per fetch, read by syncInputWithActiveItem so preview text doesn't drift as it mutates the input
let pathBrowseAbortController = null;
let blurHideTimer = null; // handle for the delayed hidePathDropdown() below — must be cancelable, see blur listener

export function hidePathDropdown() {
  // Kill any in-flight browse-path fetch FIRST — otherwise it can
  // resolve after we've already cleared state below and repopulate
  // pathDropdownItems/pathDropdownBaseDir for a dropdown that's
  // supposed to be dead (a "zombie" state: invisible but stale data
  // sitting in module state, ready to corrupt the NEXT open if any
  // function reads it before a fresh fetch overwrites it).
  if (pathBrowseAbortController) {
    pathBrowseAbortController.abort();
    pathBrowseAbortController = null;
  }
  pathDropdown.style.display = "none";
  pathBreadcrumb.innerHTML = "";
  pathItemsList.innerHTML = "";
  pathDropdownItems = [];
  pathDropdownActiveIndex = -1;
  pathDropdownTokenStart = -1;
  pathDropdownBaseDir = "";
}

export function positionPathDropdown() {
  const rect = input.getBoundingClientRect();
  pathDropdown.style.left = rect.left + "px";
  pathDropdown.style.width = Math.max(240, rect.width) + "px";
  pathDropdown.style.top = (rect.top - 8 + window.scrollY) + "px";
  pathDropdown.style.transform = "translateY(-100%)"; // open upward, composer sits at the bottom
}

// Rebuilds "/typed/text" -> ["chats", "proj1"] (typed parts only, no leading slash).
export function typedPathParts(tokenText) {
  return tokenText.slice(1).split("/").filter(Boolean);
}

export function renderBreadcrumb(tokenText) {
  pathBreadcrumb.innerHTML = "";
  const typedParts = typedPathParts(tokenText);
  const isGhost = typedParts.length === 0; // bare "/" -> show "chats" as a dim placeholder
  const segments = isGhost ? [...PATH_ROOT_SEGMENTS, "chats"] : [...PATH_ROOT_SEGMENTS, ...typedParts];

  segments.forEach((seg, i) => {
    const isLast = i === segments.length - 1;
    const ghost = isGhost && isLast;
    const clickable = !ghost; // every real segment can be clicked to jump back

    const chip = document.createElement("span");
    chip.textContent = seg;
    chip.style.cssText = "padding:2px 4px;border-radius:4px;white-space:nowrap;" +
      (ghost ? "color:#666;font-style:italic;" : "color:#bbb;") +
      (isLast && !ghost ? "color:#fff;font-weight:600;" : "") +
      (clickable ? "cursor:pointer;" : "cursor:default;");
    if (clickable) {
      chip.addEventListener("mouseenter", () => { chip.style.background = "#2e2e2e"; });
      chip.addEventListener("mouseleave", () => { chip.style.background = "transparent"; });
      chip.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep textarea focus
        jumpBreadcrumbTo(i);
      });
    }
    pathBreadcrumb.appendChild(chip);

    if (!isLast) {
      const sep = document.createElement("span");
      sep.textContent = "/";
      sep.style.cssText = "color:#555;padding:0 1px;";
      pathBreadcrumb.appendChild(sep);
    }
  });
}

// Clicking a breadcrumb chip at index i truncates the typed token back
// to that level. i counts across PATH_ROOT_SEGMENTS + typed parts, so
// clicking "mragent" or "user" (the fixed root) collapses to a bare "/".
export function jumpBreadcrumbTo(i) {
  const token = currentPathToken();
  if (!token) return;
  const typedParts = typedPathParts(token.text);
  const rootLen = PATH_ROOT_SEGMENTS.length;
  const keep = Math.max(0, i - rootLen + 1); // how many typed parts survive
  applyTypedParts(token, typedParts.slice(0, keep));
}

// Writes newParts back into the current "/token" and re-renders.
export function applyTypedParts(token, newParts) {
  const newToken = "/" + newParts.join("/") + (newParts.length ? "/" : "");
  const before = input.value.slice(0, token.start);
  const after = input.value.slice(token.start + token.text.length);
  input.value = before + newToken + after;
  const newCaret = (before + newToken).length;
  input.focus();
  input.setSelectionRange(newCaret, newCaret);
  autoResizeInput(input);
  refreshPathDropdown(true);
}

// ArrowLeft at the end of the token: drill OUT to the parent folder
// (go up one level, dropping the last typed segment).
export function stepBreadcrumbBack() {
  const token = currentPathToken();
  if (!token) return;
  const typedParts = typedPathParts(token.text);
  if (!typedParts.length) return; // already at bare "/", nothing to go up from
  applyTypedParts(token, typedParts.slice(0, -1));
}

// ArrowRight at the end of the token: drill INTO the currently
// highlighted folder in the items list below (Right = go deeper).
export function stepBreadcrumbForward() {
  const token = currentPathToken();
  if (!token) return;
  const picked = pathDropdownItems[pathDropdownActiveIndex];
  if (!picked || !picked.is_dir) return; // only folders can be entered
  const typedParts = typedPathParts(token.text);
  applyTypedParts(token, [...typedParts, picked.name]);
}

export function renderPathDropdown() {
  pathItemsList.innerHTML = "";
  pathDropdownItems.forEach((item, i) => {
    const row = document.createElement("div");
    row.textContent = (item.is_dir ? "📁 " : "📄 ") + item.name;
    row.style.cssText = "padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" + (i === pathDropdownActiveIndex ? "background:#333;" : "");
    row.addEventListener("mouseenter", () => {
      pathDropdownActiveIndex = i;
      renderPathDropdown();
      syncInputWithActiveItem();
    });
    row.addEventListener("mousedown", (e) => {
      e.preventDefault(); // don't steal focus from the textarea before we apply the pick
      applyPathPick(item);
    });
    pathItemsList.appendChild(row);
  });
}

// While arrowing through the dropdown (or hovering a row), live-preview
// the highlighted item's name into the textarea's current "/token" —
// WITHOUT closing the dropdown or resetting the fetch/filter state
// (unlike applyPathPick, which commits the pick and may trigger a
// fresh browse). Only called from explicit navigation (arrow keys,
// mouse hover) — NOT from every renderPathDropdown() call, since that
// also fires on the initial fetch before the user has picked anything,
// which would overwrite their typed text unprompted.
//
// MUHIM: dirPart pathDropdownBaseDir'dan olinadi (refreshPathDropdown
// har fetch boshida qayd etadi), currentPathToken()'ning HOZIRGI
// matnidan EMAS. Sabab: bu funksiya inputni har chaqirilganda
// o'zgartiradi, shuning uchun keyingi chaqiriqda currentPathToken()
// endi o'zimiz yozib qo'ygan (allaqachon mutatsiyaga uchragan) matnni
// o'qib, "/chats/" o'rniga "/chats/chat_foo/" kabi noto'g'ri chuqurroq
// dirPart hisoblab chiqarardi — natijada har ArrowDown bosilganda
// tanlov noto'g'ri (aslida hali fetch qilinmagan) chuqurlikka yozilib,
// ro'yxat elementlari orqaga-oldinga "sakrab" ko'rinar edi.
function syncInputWithActiveItem() {
  const item = pathDropdownItems[pathDropdownActiveIndex];
  if (!item) return;
  if (pathDropdownTokenStart === -1) return;
  const preview = pathDropdownBaseDir + item.name + (item.is_dir ? "/" : "");
  const currentTokenText = input.value.slice(pathDropdownTokenStart, input.selectionStart);
  if (preview === currentTokenText) return; // already showing this — avoid pointless caret resets
  const before = input.value.slice(0, pathDropdownTokenStart);
  const after = input.value.slice(input.selectionStart);
  input.value = before + preview + after;
  const newCaret = (before + preview).length;
  input.setSelectionRange(newCaret, newCaret);
  autoResizeInput(input);
}

export function currentPathToken() {
  // Finds the "/..." token that touches the caret, if any — e.g. with
  // "look at /chats/foo/im" and caret at the end, returns
  // { start, text: "/chats/foo/im" }.
  const caret = input.selectionStart;
  const upToCaret = input.value.slice(0, caret);
  const start = upToCaret.lastIndexOf("/");
  if (start === -1) return null;
  // Bail if there's whitespace between the "/" and the caret's word —
  // i.e. only trigger inside one unbroken path token.
  const between = upToCaret.slice(start);
  if (/\s/.test(between)) return null;
  return { start, text: between };
}

export async function refreshPathDropdown(forceRefresh = false) {
  // Any pending blur-close is stale the moment we're actively
  // refreshing the dropdown (typing, or a forced refresh after a
  // pick) — cancel it so it can't sneak in and close a dropdown
  // that's clearly still in use.
  if (blurHideTimer) { clearTimeout(blurHideTimer); blurHideTimer = null; }
  const token = currentPathToken();
  if (!token || token.text.length < 1) { // needs at least the "/" itself
    hidePathDropdown();
    return;
  }
  pathDropdownTokenStart = token.start;

  // Breadcrumb shows immediately on a bare "/" — no need to wait for
  // the backend. The items list underneath only fetches once there's
  // at least one more typed char, same as before — UNLESS forceRefresh
  // is set (used right after picking a folder via Tab/Enter/click/
  // ArrowRight), in which case we always fetch so the next level opens
  // immediately without requiring the user to type anything.
  renderBreadcrumb(token.text);
  pathDropdown.style.display = "block";
  positionPathDropdown();

  if (!forceRefresh && token.text.length < 2) { // "/" plus at least 1 more char
    // BUG FIX: this branch used to just clear pathDropdownItems and
    // return WITHOUT touching pathBrowseAbortController. If a fetch
    // for a longer token was already in flight (user typed "/ab",
    // request went out, then hit backspace back down to "/a"), that
    // in-flight response would land seconds later and silently
    // repopulate pathDropdownItems with entries for the WRONG,
    // already-abandoned directory — the dropdown would show stale
    // results the user never asked for. Abort it here too.
    if (pathBrowseAbortController) { pathBrowseAbortController.abort(); pathBrowseAbortController = null; }
    pathDropdownItems = [];
    pathDropdownActiveIndex = -1;
    renderPathDropdown();
    return;
  }

  const active = getActiveChat();
  const category = (active && active.category) || "general";
  const filename = (active && active.filename) || "chat";

  // Snapshot the directory part NOW, before the async fetch, so later
  // ArrowUp/Down syncs always write into the same slot regardless of
  // how many times the input got mutated while the request was in
  // flight or afterwards.
  pathDropdownBaseDir = token.text.endsWith("/") ? token.text : token.text.slice(0, token.text.lastIndexOf("/") + 1);

  if (pathBrowseAbortController) pathBrowseAbortController.abort();
  pathBrowseAbortController = new AbortController();

  try {
    const url = `${API_BASE}/browse-path?path=${encodeURIComponent(token.text)}&category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`;
    const res = await fetch(url, { headers: authHeaders(), signal: pathBrowseAbortController.signal });
    if (res.status === 401) { hidePathDropdown(); return; }
    const data = await res.json().catch(() => ({}));
    pathDropdownItems = Array.isArray(data.entries) ? data.entries : [];
    pathDropdownActiveIndex = pathDropdownItems.length ? 0 : -1;
    positionPathDropdown();
    renderPathDropdown();
  } catch (err) {
    if (err.name !== "AbortError") hidePathDropdown();
  }
}

export function applyPathPick(item) {
  if (pathDropdownTokenStart === -1) return;
  const token = currentPathToken();
  if (!token) return;
  const dirPart = token.text.slice(0, token.text.lastIndexOf("/") + 1); // keeps the "/a/b/" so far
  const replacement = dirPart + item.name + (item.is_dir ? "/" : "");
  const before = input.value.slice(0, pathDropdownTokenStart);
  const after = input.value.slice(pathDropdownTokenStart + token.text.length);
  input.value = before + replacement + after;
  const newCaret = (before + replacement).length;
  input.focus();
  input.setSelectionRange(newCaret, newCaret);
  autoResizeInput(input);
  if (item.is_dir) {
    refreshPathDropdown(true); // stay open, drill into the folder just picked — no typing required
  } else {
    hidePathDropdown();
  }
}

input.addEventListener("input", () => {
  refreshPathDropdown();
});

input.addEventListener("keydown", (e) => {
  if (pathDropdown.style.display !== "block") return;
  const token = currentPathToken();
  const caretAtTokenEnd = token && input.selectionStart === token.start + token.text.length;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    pathDropdownActiveIndex = Math.min(pathDropdownActiveIndex + 1, pathDropdownItems.length - 1);
    renderPathDropdown();
    syncInputWithActiveItem();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    pathDropdownActiveIndex = Math.max(pathDropdownActiveIndex - 1, 0);
    renderPathDropdown();
    syncInputWithActiveItem();
  } else if (e.key === "ArrowLeft" && caretAtTokenEnd) {
    // Only hijack Left/Right when the caret sits at the end of the
    // "/token" (the normal spot while autocompleting) — mid-token
    // editing keeps native caret movement untouched.
    e.preventDefault();
    stepBreadcrumbBack();
  } else if (e.key === "ArrowRight" && caretAtTokenEnd) {
    e.preventDefault();
    stepBreadcrumbForward();
  } else if (e.key === "Tab" || (e.key === "Enter" && pathDropdownActiveIndex >= 0)) {
    e.preventDefault();
    if (pathDropdownItems[pathDropdownActiveIndex]) applyPathPick(pathDropdownItems[pathDropdownActiveIndex]);
  } else if (e.key === "Escape") {
    hidePathDropdown();
  }
});

input.addEventListener("blur", () => {
  // Small delay so a mousedown-triggered pick on the dropdown still
  // registers before the dropdown gets torn down on blur.
  //
  // BUG FIX: this timer used to be fire-and-forget. If the textarea
  // blurred and refocused within the 150ms window (tab-away-and-back,
  // clicking a breadcrumb chip, fast refocus on mobile), the OLD timer
  // was still armed and would fire hidePathDropdown() ~150ms later —
  // silently killing a dropdown the user had just reopened by typing.
  // Fix: track the timer handle and clear any previous one before
  // arming a new one, so only the LATEST blur can ever close it, and
  // an input/focus cycle within the window cancels it via
  // refreshPathDropdown() below.
  if (blurHideTimer) clearTimeout(blurHideTimer);
  blurHideTimer = setTimeout(() => {
    blurHideTimer = null;
    hidePathDropdown();
  }, 150);
});
input.addEventListener("focus", () => {
  if (blurHideTimer) { clearTimeout(blurHideTimer); blurHideTimer = null; }
});
window.addEventListener("resize", () => { if (pathDropdown.style.display === "block") positionPathDropdown(); });

// Exposed so main.js's Enter-to-send keydown handler (registered
// separately, before this file's dropdown existed in the original
// script.js load order) can check dropdown state without a circular
// import.
export function isPathDropdownOpenWithSelection() {
  return pathDropdown.style.display === "block" && pathDropdownActiveIndex >= 0 && pathDropdownItems.length > 0;
}
