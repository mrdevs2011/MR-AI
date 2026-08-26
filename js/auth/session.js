/* =====================================================================
   session.js — sessiya boshqaruvi (inactivity watcher, auth header,
   to'liq logout + kesh tozalash animatsiyasi).
   script.js'dan ko'chirildi: authHeaders (978), markActive (990),
   isSessionStale (994), startInactivityWatcher (1001),
   stopInactivityWatcher (1010), bytesForString (1040),
   measureLocalStorageBytes (1046), measureSessionStorageBytes (1055),
   measureAndCollectIndexedDbDatabases (1068),
   measureCacheStorageBytes (1116), formatBytes (1139),
   animateCounterAndBar (1145), actuallyClearEverything (1170),
   doLogout (1203), tryAutoLogin (2691).

   MUHIM (achiq haqiqat — cross-module bog'liqlik, roadmap aytmagan):

   1) doLogout() ichida original kod `teardownTerminal?.()` va
      `closeTerminal?.()` chaqiradi — bular Step 10'dagi ui/terminal.js
      moduliga tegishli, hali mavjud emas. Optional chaining (?.) bilan
      yozilgan bo'lsa ham, agar bu nomlar global scope'da UMUMAN
      aniqlanmagan bo'lsa — ReferenceError chiqadi (?. faqat "mavjud
      lekin null/undefined" holatini yashiradi, "umuman yo'q" holatini
      emas). Shuning uchun bu ikki chaqiruv `window.teardownTerminal?.()`
      formatiga o'tkazildi — bu window ustida xavfsiz optional-chain,
      ui/terminal.js Step 10'da qo'shilgach avtomatik ishlay boshlaydi,
      hozircha jim o'tkazib yuboriladi.

   2) tryAutoLogin() ichida original kod `showApp()`ni chaqiradi —
      showApp() chat/agent/ui modullariga bog'liq (Step 8-10), shuning
      uchun script.js'da global qoladi va shu yerdan window.showApp()
      orqali chaqiriladi (login.js'dagi bir xil izohga qarang).
   ===================================================================== */

import { API_BASE, SESSION_ID, LOGIN_PASS, setSessionId, setLoginPass } from '../state/store.js';
import { stopWakeWordListener } from '../voice/wakeword.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
let inactivityWatcherId = null;

// Har bir himoyalangan so'rovga qo'shiladigan header'lar.
// "ngrok-skip-browser-warning" — ngrok free-tier tunnel har bir brauzerdan
// kelgan so'rovga (Accept: text/html bo'lsa) avval o'zining ogohlantirish
// interstitial sahifasini qaytaradi, unda CORS header umuman yo'q —
// shuning uchun brauzerda "CORS policy blocked" xatosi chiqadi, curl'da
// esa yo'q (curl brauzer emas). Bu header shu interstitialni bypass qiladi.
export function authHeaders(extra) {
  return Object.assign(
    {
      "X-Login-Pass": LOGIN_PASS,
      "X-Session-Id": SESSION_ID,
      "ngrok-skip-browser-warning": "true",
    },
    extra || {}
  );
}

export function markActive() {
  localStorage.setItem("MRagent_last_active", String(Date.now()));
}

export function isSessionStale() {
  const lastActive = parseInt(localStorage.getItem("MRagent_last_active") || "0", 10);
  return !lastActive || (Date.now() - lastActive > SESSION_TTL_MS);
}

export function startInactivityWatcher() {
  if (inactivityWatcherId) clearInterval(inactivityWatcherId);
  inactivityWatcherId = setInterval(() => {
    if (isSessionStale()) {
      doLogout("You were inactive for over a day — please sign in again.");
    }
  }, 5 * 60 * 1000);
}

export function stopInactivityWatcher() {
  if (inactivityWatcherId) {
    clearInterval(inactivityWatcherId);
    inactivityWatcherId = null;
  }
}

// ---------------------------------------------------------------------
// TO'LIQ LOGOUT + KESH TOZALASH ANIMATSIYASI
// ---------------------------------------------------------------------

export function bytesForString(str) {
  return str ? new Blob([str]).size : 0;
}

export async function measureLocalStorageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    total += bytesForString(key) + bytesForString(localStorage.getItem(key));
  }
  return total;
}

export async function measureSessionStorageBytes() {
  let total = 0;
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    total += bytesForString(key) + bytesForString(sessionStorage.getItem(key));
  }
  return total;
}

export async function measureAndCollectIndexedDbDatabases() {
  let totalBytes = 0;
  let dbNames = [];
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      dbNames = dbs.map((d) => d.name).filter(Boolean);
    }
  } catch (_) {}

  for (const name of dbNames) {
    try {
      const size = await new Promise((resolve) => {
        const req = indexedDB.open(name);
        req.onerror = () => resolve(0);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const storeNames = Array.from(db.objectStoreNames);
            if (storeNames.length === 0) { db.close(); resolve(0); return; }
            const tx = db.transaction(storeNames, "readonly");
            let storeBytes = 0;
            let pending = storeNames.length;
            storeNames.forEach((storeName) => {
              const store = tx.objectStore(storeName);
              const cursorReq = store.openCursor();
              cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                  try { storeBytes += bytesForString(JSON.stringify(cursor.value)); } catch (_) {}
                  cursor.continue();
                }
              };
            });
            tx.oncomplete = () => { db.close(); pending -= 1; resolve(storeBytes); };
            tx.onerror = () => { db.close(); resolve(storeBytes); };
          } catch (_) {
            db.close();
            resolve(0);
          }
        };
      });
      totalBytes += size;
    } catch (_) {}
  }
  return { totalBytes, dbNames };
}

export async function measureCacheStorageBytes() {
  let total = 0;
  try {
    if (window.caches && caches.keys) {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        for (const req of reqs) {
          try {
            const res = await cache.match(req);
            if (res) {
              const blob = await res.clone().blob();
              total += blob.size;
            }
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  return total;
}

export function formatBytes(n) {
  if (n < 1024) return `${n.toFixed(3)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(3)} KB`;
  return `${(n / (1024 * 1024)).toFixed(3)} MB`;
}

export function animateCounterAndBar(targetBytes, durationMs) {
  return new Promise((resolve) => {
    const bar = document.getElementById("logout-progress-bar");
    const label = document.getElementById("logout-bytes-text");
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const shown = targetBytes * eased;
      if (label) label.textContent = `${formatBytes(shown)} cleared`;
      if (bar) bar.style.width = `${(eased * 100).toFixed(1)}%`;
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        if (label) label.textContent = `${formatBytes(targetBytes)} cleared`;
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

export async function actuallyClearEverything(dbNames) {
  try { localStorage.clear(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}

  await Promise.all(
    (dbNames || []).map(
      (name) =>
        new Promise((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          } catch (_) {
            resolve();
          }
        })
    )
  );

  try {
    if (window.caches && caches.keys) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch (_) {}
}

export async function doLogout(message) {
  const overlay = document.getElementById("logout-overlay");
  const statusText = document.getElementById("logout-status-text");
  const bytesText = document.getElementById("logout-bytes-text");
  const bar = document.getElementById("logout-progress-bar");

  if (overlay) overlay.classList.remove("hidden");
  if (bar) bar.style.width = "0%";
  if (bytesText) bytesText.textContent = "0.000 B cleared";
  if (statusText) statusText.textContent = "Measuring local data…";

  stopInactivityWatcher();
  // "Hey Agent" wake-word mikrofonini o'chiramiz — auth false bo'lgach
  // tinglash davom etmasligi SHART (voice/wakeword.js to'g'ridan-to'g'ri
  // import qilingan, chunki u session.js'ga bog'liq emas — circular
  // import xavfi yo'q, shuning uchun window bridge shart emas edi).
  stopWakeWordListener();
  // ui/terminal.js Step 10'gacha mavjud emas — window orqali xavfsiz
  // optional chain (yuqoridagi fayl izohiga qarang).
  window.teardownTerminal?.();
  window.closeTerminal?.();

  const sidToInvalidate = SESSION_ID;
  if (API_BASE && sidToInvalidate) {
    fetch(`${API_BASE}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({ session_id: sidToInvalidate }),
    }).catch(() => {});
  }

  const lsBytes = await measureLocalStorageBytes();
  const ssBytes = await measureSessionStorageBytes();
  if (statusText) statusText.textContent = "Scanning IndexedDB (Firestore cache)…";
  const { totalBytes: idbBytes, dbNames } = await measureAndCollectIndexedDbDatabases();
  if (statusText) statusText.textContent = "Checking cache storage…";
  const cacheBytes = await measureCacheStorageBytes();

  const totalBytes = lsBytes + ssBytes + idbBytes + cacheBytes;

  if (statusText) statusText.textContent = "Clearing everything…";
  await animateCounterAndBar(totalBytes, 2200);

  await actuallyClearEverything(dbNames);
  setSessionId("");

  if (statusText) statusText.textContent = "Done. Reloading…";

  if (message) {
    try { sessionStorage.setItem("MRagent_post_reload_msg", message); } catch (_) {}
  }

  setTimeout(() => {
    window.location.reload();
  }, 350);
}

// tryAutoLogin() haqida MUHIM eslatma (fayl boshidagi izohga qarang):
// showApp() Step 10'gacha script.js'da global qoladi.
export async function tryAutoLogin() {
  const savedPass = localStorage.getItem("MRagent_pass");
  const savedSession = localStorage.getItem("MRagent_session");
  if (!savedPass || !savedSession || !API_BASE) {
    // login.js session.js'ni import qiladi (stopInactivityWatcher,
    // doLogout va h.k.) — statik teskari import circular bo'lardi,
    // shuning uchun dynamic import (otp.js'dagi bir xil pattern).
    const { showLogin } = await import('./login.js');
    showLogin();
    return;
  }
  if (isSessionStale()) {
    doLogout("You were away for more than a day — please sign in again.");
    return;
  }
  setLoginPass(savedPass);
  setSessionId(savedSession);
  markActive();
  startInactivityWatcher();
  await window.showApp();
}
