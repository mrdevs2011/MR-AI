/* =====================================================================
   composer.js — bitta jismoniy composer DOM fragmentini (mode/tier
   select, textarea, tugmalar) quradi va boshlang'ich holatda
   #composer-slot-empty ichiga joylaydi. chat-history.js'dagi
   placeComposer()/setEmptyState() keyinchalik shu tugunlarni footer
   slot bilan almashtirib turadi.
   script.js'dan ko'chirildi: composer DOM qurilishi (422-473-qatorlar).

   MUHIM: bu fayl ui/selects.js, ui/path-autocomplete.js, ui/attach.js,
   chat/*, agent/* — bularning barchasidan OLDIN yuklanishi kerak,
   chunki ular composer ichidagi #mode, #tier, #message, #send va
   boshqa elementlarni document.getElementById orqali qidiradi. main.js
   shu tartibni ta'minlaydi (avval composer.js import qilinadi).
   ===================================================================== */

const composerSlotEmpty = document.getElementById("composer-slot-empty");

// ---------------------------------------------------------------------
// COMPOSER — one physical set of controls (mode/tier/input/send) that
// gets moved between the centered empty-state slot and the bottom-
// pinned footer slot depending on whether the active chat has any
// messages yet. Avoids keeping two copies of the same inputs in sync.
// ---------------------------------------------------------------------
const composer = document.createElement("div");
composer.innerHTML = `
  <div id="sudoBanner" data-composer-part class="max-w-[720px] mx-auto mb-2 hidden rounded-lg px-3 py-2 text-[12px] font-medium" style="background:#3a1414; color:#ff6b6b; border:1px solid #5c1f1f;">
    EXTENDED MODE ON — reversible risky commands (orange) now run automatically without confirmation. Irreversible commands (rm -rf /, mkfs, etc.) are never auto-run, even in this mode.
  </div>
  <div data-composer-part class="max-w-[720px] mx-auto composer-box">
    <textarea id="message" rows="1" placeholder="Write a message..."
           class="composer-textarea" autocomplete="off"></textarea>
    <div class="composer-toolbar">
      <button id="attach-btn" type="button" title="Attach a file"
              class="composer-icon-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
      </button>
      <div class="composer-toolbar-right">
        <div class="combo-select-wrap" id="combo-wrap">
          <select id="mode" class="visually-hidden-select" tabindex="-1" aria-hidden="true">
            <option value="general" selected>General</option>
            <option value="sudo">Sudo</option>
          </select>
          <select id="tier" class="visually-hidden-select" tabindex="-1" aria-hidden="true">
            <option value="high">Omni</option>
            <option value="medium" selected>Super</option>
            <option value="low">Nano</option>
          </select>
          <button type="button" id="combo-btn" class="combo-btn" title="Mode & speed">
            <span class="pill-dot" id="mode-dot"></span>
            <span id="combo-label">General Super</span>
            <svg class="combo-caret" width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div id="combo-dropdown" class="combo-dropdown hidden">
            <div class="combo-group-label">General</div>
            <div id="combo-items"></div>
            <div class="combo-group-divider"></div>
            <button type="button" id="sudo-toggle-row" class="combo-toggle-row">
              <span class="combo-item-dot" style="background:#ff6b6b"></span>
              <span class="combo-toggle-label">Extended mode</span>
              <span id="sudo-switch" class="switch"><span class="switch-knob"></span></span>
            </button>
          </div>
        </div>
        <button id="send" class="send-btn transition disabled:opacity-30" title="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  </div>`;
// Move all top-level children of the fragment into the empty-state slot
// initially; placeComposer() relocates them later without re-creating
// anything, so listeners/state stay attached.
while (composer.firstChild) composerSlotEmpty.appendChild(composer.firstChild);
