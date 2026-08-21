const firebaseConfig = {
      apiKey: "AIzaSyDYkT1b_SOg5T76yhpyRuqnem9YsG53Qn0",
      authDomain: "mragent-2d280.firebaseapp.com",
      projectId: "mragent-2d280",
      storageBucket: "mragent-2d280.firebasestorage.app",
      messagingSenderId: "654437071743",
      appId: "1:654437071743:web:7281d306d8c6cd054c784a",
      measurementId: "G-MZEC0M55WH"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    // Ba'zi tarmoqlar/provayderlar Firestore'ning odatiy WebChannel
    // (streaming) ulanishini sekinlashtiradi yoki bloklaydi — bu holatda
    // uzoq muddatli long-polling'ga avtomatik o'tish barqarorlikni oshiradi.
    db.settings({ experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false });

    let API_BASE = null;
    let LOGIN_PASS = "";
    let SESSION_ID = "";
    // 1 kunlik harakatsizlik — backenddagi SESSION_TTL_SECONDS bilan bir xil
    // qiymat. Bu yerda ham nusxasi turadi, chunki tab OCHIQ qolib, hech
    // qanday so'rov yuborilmasa ham (masalan brauzer tab background'da
    // tinch turibdi), baribir 24 soatdan keyin o'zi chiqib ketishi kerak —
    // buni faqat client tomonda taymer bilan ta'minlash mumkin.
    const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
    let inactivityWatcherId = null;
    // Auth token butunlay olib tashlandi. Login endi faqat PASS + emailga
    // yuboriladigan bir martalik OTP kod bilan ishlaydi.

    const bootScreen = document.getElementById("boot-screen");
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    const loginForm = document.getElementById("login-form");
    const loginPass = document.getElementById("login-pass");
    const loginOtp = document.getElementById("login-otp"); // hidden, combined value
    const loginOtpBoxes = document.getElementById("login-otp-boxes");
    const loginOtpWrap = document.getElementById("login-otp-wrap");
    const loginOtpTimer = document.getElementById("login-otp-timer");
    const loginError = document.getElementById("login-error");
    // Ikki bosqichli login: avval faqat parol ko'rinadi. Continue
    // bosilganda parol tekshirilib (send-otp orqali) emailga OTP
    // yuboriladi va shu ekrandayoq OTP maydoni ochiladi — parol input
    // qulflanib qoladi, uni qayta kiritish shart emas. "otpStage=true"
    // bo'lganda submit endi /login'ni pass+otp bilan chaqiradi.
    let otpStage = false;
    let otpTimerInterval = null;

    // --- 8 ta alohida raqam katakchasi ---
    // Har bir katak bitta raqam qabul qiladi, kiritilgan zahoti keyingi
    // katakka fokus o'tadi; Backspace bo'sh katakda oldingisiga qaytaradi.
    // Barcha qiymatlar birlashtirilib yashirin #login-otp input'iga
    // yoziladi — qolgan kod (verifyLogin, showLogin) shu yerdan o'qiydi.
    const OTP_LENGTH = 8;
    let otpDigitInputs = [];

    function buildOtpBoxes() {
      loginOtpBoxes.innerHTML = "";
      otpDigitInputs = [];
      for (let i = 0; i < OTP_LENGTH; i++) {
        const box = document.createElement("input");
        box.type = "text";
        box.inputMode = "numeric";
        box.autocomplete = "one-time-code";
        box.maxLength = 1;
        box.className = "login-input rounded-xl text-center text-[17px] text-[#ececec] focus:outline-none";
        box.style.width = "0";
        box.style.flex = "1 1 0";
        box.style.height = "48px";
        box.style.minWidth = "0";
        box.dataset.index = String(i);

        box.addEventListener("input", () => {
          box.value = box.value.replace(/[^0-9]/g, "").slice(-1);
          syncOtpHiddenValue();
          if (box.value && i < OTP_LENGTH - 1) {
            otpDigitInputs[i + 1].focus();
          }
          if (loginOtp.value.length === OTP_LENGTH) {
            submitOtp();
          }
        });

        box.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" && !box.value && i > 0) {
            otpDigitInputs[i - 1].focus();
          }
        });

        box.addEventListener("paste", (e) => {
          const text = (e.clipboardData || window.clipboardData).getData("text");
          const digits = text.replace(/[^0-9]/g, "").slice(0, OTP_LENGTH);
          if (!digits) return;
          e.preventDefault();
          digits.split("").forEach((d, idx) => {
            if (otpDigitInputs[idx]) otpDigitInputs[idx].value = d;
          });
          syncOtpHiddenValue();
          const next = otpDigitInputs[Math.min(digits.length, OTP_LENGTH - 1)];
          if (next) next.focus();
          if (loginOtp.value.length === OTP_LENGTH) {
            submitOtp();
          }
        });

        loginOtpBoxes.appendChild(box);
        otpDigitInputs.push(box);
      }
    }

    function syncOtpHiddenValue() {
      loginOtp.value = otpDigitInputs.map((b) => b.value).join("");
    }

    function clearOtpBoxes() {
      otpDigitInputs.forEach((b) => { b.value = ""; });
      loginOtp.value = "";
    }

    function focusFirstOtpBox() {
      if (otpDigitInputs[0]) otpDigitInputs[0].focus();
    }

    buildOtpBoxes();

    // OTP jonli sanoq: backend qaytargan ttl_seconds'dan boshlab har
    // soniyada 1 kamayib turadi (59, 58, 57...). Muddati tugasa, kod
    // eskirganini ko'rsatib, foydalanuvchini yangi kod so'rashga
    // yo'naltiradi (otpStage qaytadan false qilinadi).
    function startOtpTimer(ttlSeconds) {
      stopOtpTimer();
      let remaining = Math.max(0, Math.floor(ttlSeconds));
      loginOtpTimer.classList.remove("hidden");
      const render = () => {
        if (remaining > 0) {
          loginOtpTimer.textContent = `Code expires in ${remaining}s`;
        } else {
          loginOtpTimer.textContent = "Code expired — press Continue to get a new one.";
          stopOtpTimer();
          otpStage = false;
          clearOtpBoxes();
        }
      };
      render();
      otpTimerInterval = setInterval(() => {
        remaining -= 1;
        render();
      }, 1000);
    }

    function stopOtpTimer() {
      if (otpTimerInterval) {
        clearInterval(otpTimerInterval);
        otpTimerInterval = null;
      }
    }
    const loginBtn = document.getElementById("login-btn");
    const loginTunnelStatus = document.getElementById("login-tunnel-status");

    const chatScroll = document.getElementById("chat");
    const chat = document.getElementById("chat-inner");
    const emptyState = document.getElementById("empty-state");
    const chatFooter = document.getElementById("chat-footer");
    const composerSlotEmpty = document.getElementById("composer-slot-empty");
    const composerSlotFooter = document.getElementById("composer-slot-footer");
    const tunnelStatus = document.getElementById("tunnel-status");
    const logoutBtn = document.getElementById("logout-btn");
    const newChatBtn = document.getElementById("new-chat-btn");

    // ---------------------------------------------------------------------
    // SIDEBAR TOGGLE — Claude ilovasidagi kabi ochilib-yopiladigan panel.
    // Holat localStorage'da SAQLANMAYDI (mavjud loyihada auth token'dan
    // tashqari localStorage ataylab ishlatilmaydi) — har sahifa
    // yangilanishida sidebar ochiq holatda boshlanadi.
    // ---------------------------------------------------------------------
    const sidebarEl = document.getElementById("sidebar");
    const headerMenuBtn = document.getElementById("header-menu-btn");
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");

    function isMobileLayout() { return window.innerWidth < 768; }
    // Sichqoncha/trackpad bilan hover qila oladigan qurilmami, yoki
    // faqat touch (barmoq bilan bosish) qurilmami — shunga qarab
    // sidebar ochilish usuli farqlanadi.
    function isTouchDevice() { return window.matchMedia("(hover: none), (pointer: coarse)").matches; }

    // ---- Claude.ai-style hover preview vs. pinned state -----------------
    // Two independent flags on #sidebar, not one "collapsed" boolean:
    //
    //   .pinned        — sidebar takes real layout space (chat panel shifts
    //                     over, width animates 0 -> normal). Set by CLICKING
    //                     the toggle icon. Persists until clicked again.
    //   .hover-preview — sidebar renders position:absolute ON TOP of the
    //                     chat panel, taking zero layout space, so the
    //                     toggle icon and everything behind the sidebar
    //                     never move. Set by MOUSING OVER the toggle icon
    //                     or the sidebar itself, and only while NOT pinned
    //                     (if already pinned, hovering is a no-op — it's
    //                     already fully open at full width, no preview
    //                     needed, and preview width is intentionally wider
    //                     than pinned width so this distinction matters).
    //
    // The icon's own screen position depends only on #chat-header's flex
    // layout, which never references #sidebar's width/position at all —
    // so the icon truly never shifts, no matter which state fires.
    let previewFadeOutTimer = null;
    let sidebarCloseTimer = null;
    const PREVIEW_FADE_MS = 220; // CSS opacity transition davomiyligi bilan bir xil
    const SIDEBAR_CLOSE_DELAY = 350; // ms — "sekin yopilish" uchun kutish vaqti

    function setSidebarPinned(pinned) {
      // Pin/unpin har doim pending preview holatini butunlay hal qiladi —
      // fade-out timer va sidebar-close timer ishlab turgan bo'lsa ham
      // bekor qilinadi. Buni qilmasak, tez-tez bosilganda eski timerlar
      // keyinroq ishga tushib klasslarni kutilmaganda o'zgartirib,
      // "diqir-diqir" effekt beradi.
      if (previewFadeOutTimer) { clearTimeout(previewFadeOutTimer); previewFadeOutTimer = null; }
      if (sidebarCloseTimer) { clearTimeout(sidebarCloseTimer); sidebarCloseTimer = null; }
      sidebarEl.classList.toggle("pinned", pinned);
      sidebarEl.classList.remove("hover-preview", "preview-visible");
      sidebarBackdrop.classList.toggle("hidden", !pinned || !isMobileLayout());
      requestAnimationFrame(positionHeaderMenuBtn);
    }
    function toggleSidebarPin() {
      setSidebarPinned(!sidebarEl.classList.contains("pinned"));
    }

    function showSidebarPreview() {
      if (sidebarEl.classList.contains("pinned")) return; // already fully open, nothing to preview
      if (previewFadeOutTimer) { clearTimeout(previewFadeOutTimer); previewFadeOutTimer = null; }
      sidebarEl.classList.add("hover-preview");
      // Bir frame kechikish bilan "preview-visible" qo'shiladi — shu orqali
      // brauzer avval opacity:0 holatini "sezib qoladi", keyingina 1'ga
      // o'tadi va CSS transition ishga tushadi (aks holda ikkalasi bitta
      // frame'da qo'shilsa, transition sezilmay, darrov 1 bo'lib qoladi).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => sidebarEl.classList.add("preview-visible"));
      });
    }
    function hideSidebarPreview() {
      if (!sidebarEl.classList.contains("hover-preview")) return;
      // Avval faqat opacity'ni 0'ga tushiramiz (fade OUT boshlanadi) —
      // "hover-preview" klassini darrov olib tashlamaymiz, aks holda
      // position:absolute/width darrov yo'qolib, fade-out ko'rinmay
      // qoladi. Fade tugagach (PREVIEW_FADE_MS) hover-preview'ni ham
      // olib tashlaymiz — shundagina sidebar butunlay flow'dan chiqadi.
      sidebarEl.classList.remove("preview-visible");
      if (previewFadeOutTimer) clearTimeout(previewFadeOutTimer);
      previewFadeOutTimer = setTimeout(() => {
        sidebarEl.classList.remove("hover-preview");
        previewFadeOutTimer = null;
      }, PREVIEW_FADE_MS);
    }

    // ---- Hover bilan ochilish / sekin yopilish (faqat sichqonchali,
    // desktop qurilmalarda) — Claude.ai'dagi kabi. Touch qurilmalarda
    // (telefon/planshet) esa oddiy tap-toggle ishlaydi, chunki ularda
    // "hover" degan holat umuman yo'q. ----
    function cancelSidebarCloseTimer() {
      if (sidebarCloseTimer) { clearTimeout(sidebarCloseTimer); sidebarCloseTimer = null; }
    }
    function scheduleSidebarClose() {
      cancelSidebarCloseTimer();
      sidebarCloseTimer = setTimeout(() => {
        hideSidebarPreview();
        sidebarCloseTimer = null;
      }, SIDEBAR_CLOSE_DELAY);
    }

    if (isTouchDevice()) {
      // Touch: icon'ga tap qilinganda ochiladi, yana tap qilinganda yopiladi.
      // Touch qurilmada "preview" degan tushuncha yo'q (hover mavjud emas),
      // shuning uchun tap to'g'ridan-to'g'ri pinned holatni almashtiradi.
      headerMenuBtn?.addEventListener("click", toggleSidebarPin);
    } else {
      // Desktop: icon ustiga hover qilinganda darrov PREVIEW sifatida
      // ochiladi (overlay, layout siljimaydi).
      headerMenuBtn?.addEventListener("mouseenter", () => {
        cancelSidebarCloseTimer();
        showSidebarPreview();
      });
      // Sichqoncha icon'dan yoki sidebar'ning o'zidan chiqib ketsa —
      // darrov emas, kichik kechikish bilan ("sekin") preview yopiladi.
      // Shu kechikish ichida sichqoncha sidebar ichiga o'tsa, yopilish
      // bekor qilinadi — shuning uchun ikkalasiga ham eventlar bor.
      // Agar sidebar allaqachon pinned bo'lsa, bu yopish hech narsaga
      // ta'sir qilmaydi (setSidebarPinned bosqichida hover-preview klass
      // allaqachon yo'q edi) — pinned holat faqat click bilan yopiladi.
      headerMenuBtn?.addEventListener("mouseleave", scheduleSidebarClose);
      sidebarEl?.addEventListener("mouseenter", cancelSidebarCloseTimer);
      sidebarEl?.addEventListener("mouseleave", scheduleSidebarClose);
      // Icon'ga click — PINNED holatni almashtiradi (doimiy ochiq/yopiq),
      // preview'dan farqli. Bu — asosiy "layout joy egallaydi" holat.
      headerMenuBtn?.addEventListener("click", toggleSidebarPin);
    }

    sidebarBackdrop?.addEventListener("click", () => setSidebarPinned(false));

    // ---- Sidebar'ning o'ziga (hover-preview paytida) 1 marta bosilsa —
    // shu preview PINNED holatga "qotib qoladi". Interaktiv elementlar
    // (chat qatorlari, New chat, Bash, qidiruv, sign out va h.k.) o'zining
    // click handleri bor — ular bosilganda pin qilish TALAB QILINMAYDI,
    // aks holda masalan chat tanlash bilan pin qilish bir bosishda ikki
    // ish qilib yuborardi. Shuning uchun faqat sidebar'ning "bo'sh joyi"ga
    // (masalan overlay foni) bosilsa pin bo'ladi — closest("button, input,
    // a") orqali interaktiv elementlar chetlab o'tiladi. ----
    sidebarEl?.addEventListener("click", (e) => {
      if (!sidebarEl.classList.contains("hover-preview")) return; // faqat preview holatida ishlaydi
      if (e.target.closest("button, input, a, [role='button']")) return; // interaktiv elementlar o'z ishini qilsin
      setSidebarPinned(true);
    });

    // ---- header-menu-btn: sidebar PINNED bo'lganda sidebar ICHIGA,
    // uning o'ng chetiga smooth "uchib o'tadi".
    //
    // MUHIM TUZATISH: shunchaki translateX bilan icon FLEX OQIMIDA joy
    // egallab qolaveradi (transform layout'ga ta'sir qilmaydi) — bu
    // hisoblashda ikki marta hisoblanishga va iconning sidebar chegarasidan
    // "otilib chiqishiga" olib kelgan (screenshot'dagi bug shu edi).
    // Yechim: pinned bo'lganda icon `position: fixed`ga o'tkaziladi — bu
    // uni butunlay flex oqimidan chiqarib tashlaydi va endi u faqat
    // ekrandagi aniq x/y koordinataga qarab joylashadi (viewport'ga
    // nisbatan), xuddi sidebar panelining bir qismidek. #chat-title esa
    // icon bo'shatgan joyni margin-left bilan egallaydi (bu haqiqiy layout
    // o'zgarishi, transform emas — shuning uchun aniq va barqaror).
    const headerTitleEl = document.getElementById("chat-title");
    const HEADER_BTN_SIZE = 36; // w-9 h-9 = 36px
    const HEADER_BTN_MARGIN = 8; // sidebar o'ng chetidan bo'shliq

    function positionHeaderMenuBtn() {
      if (!headerMenuBtn || !sidebarEl) return;
      const pinned = sidebarEl.classList.contains("pinned");
      const brandEl = document.getElementById("sidebar-brand");
      if (!pinned) {
        headerMenuBtn.style.position = "";
        headerMenuBtn.style.top = "";
        headerMenuBtn.style.left = "";
        if (headerTitleEl) headerTitleEl.style.marginLeft = "";
        if (brandEl) brandEl.classList.add("hidden");
        return;
      }
      const sbRect = sidebarEl.getBoundingClientRect();
      const headerRect = document.getElementById("chat-header")?.getBoundingClientRect();
      const topY = headerRect ? headerRect.top + (headerRect.height - HEADER_BTN_SIZE) / 2 : 10;
      // Icon endi position:fixed — viewport koordinatasi bo'yicha, sidebar
      // o'ng chetidan HEADER_BTN_MARGIN qadar ichkariga qo'yiladi.
      headerMenuBtn.style.position = "fixed";
      headerMenuBtn.style.top = `${topY}px`;
      headerMenuBtn.style.left = `${sbRect.right - HEADER_BTN_SIZE - HEADER_BTN_MARGIN}px`;
      // Title endi icon flow'dan chiqib ketgani uchun bo'shagan joyni
      // margin-left bilan egallaydi — icon kengligi + orasidagi bo'shliq
      // qadar chapdan bo'sh joy qoldiradi, shu bilan sidebar tagidan
      // "sizib chiqib" o'z-o'zidan to'g'ri joyga o'tiradi.
      if (headerTitleEl) {
        headerTitleEl.style.marginLeft = `${HEADER_BTN_SIZE + 4}px`;
      }
      // Icon sidebar ICHIGA o'tib, o'ng chetga joylashgach — sidebar'ning
      // o'zida "MRagent" logo+yozuv paydo bo'ladi (xuddi icon o'ng chetga
      // o'tib, o'z o'rnini shu brendga bo'shatib bergandek).
      if (brandEl) brandEl.classList.remove("hidden");
    }

    let headerBtnTrackRAF = null;
    // Sidebar width'i CSS transition orqali .22s ichida 0 <-> 320px
    // o'zgaradi. Icon/title shu bilan bir xil tezlikda "suzib" borishi
    // uchun, bitta getBoundingClientRect emas — transition davomida har
    // frame'da qayta o'lchab, positionHeaderMenuBtn'ni qayta chaqiramiz.
    // ~260ms (transition + bir oz zaxira) dan keyin avtomatik to'xtaydi.
    function trackHeaderMenuBtnDuringTransition() {
      if (headerBtnTrackRAF) cancelAnimationFrame(headerBtnTrackRAF);
      const start = performance.now();
      const DURATION = 260;
      function step(now) {
        positionHeaderMenuBtn();
        if (now - start < DURATION) {
          headerBtnTrackRAF = requestAnimationFrame(step);
        } else {
          headerBtnTrackRAF = null;
        }
      }
      headerBtnTrackRAF = requestAnimationFrame(step);
    }

    window.addEventListener("resize", () => positionHeaderMenuBtn());

    // Default holat: sidebar YOPIQ boshlanadi — ham mobile, ham desktop'da.
    // (Ilgari desktop'da pinned=true bo'lardi, endi hamma qurilmada yopiq
    // holatdan boshlanadi; desktop foydalanuvchisi hover yoki click bilan
    // ochadi.)
    setSidebarPinned(false);
    // Ekran kengligi o'zgarsa (masalan, tablet burilganda) backdrop
    // holatini shunga moslab qayta hisoblaymiz.
    window.addEventListener("resize", () => {
      if (!isMobileLayout()) sidebarBackdrop.classList.add("hidden");
    });
    // Mobil rejimda: chatga kirilganda (yangi chat yoki mavjud chat
    // tanlanganda) sidebar avtomatik yopilsin — foydalanuvchi ChatGPT/
    // Claude ilovalaridagidek to'g'ridan-to'g'ri suhbatga tushadi.
    function closeSidebarOnMobile() {
      if (isMobileLayout()) setSidebarPinned(false);
    }


    const chatPanel = document.getElementById("chat-panel");
    const bashBtn = document.getElementById("bash-btn");
    const termPanel = document.getElementById("term-panel");
    const termContainer = document.getElementById("term-container");
    const termCloseBtn = document.getElementById("term-close-btn");
    const termStatusDot = document.getElementById("term-status-dot");
    const termStatusText = document.getElementById("term-status-text");

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
    // initially; showComposerIn() relocates them later without re-creating
    // anything, so listeners/state stay attached.
    while (composer.firstChild) composerSlotEmpty.appendChild(composer.firstChild);

    const input = document.getElementById("message");
    const sendBtn = document.getElementById("send");
    const modeSelect = document.getElementById("mode");
    const sudoBanner = document.getElementById("sudoBanner");

    function updateSudoBanner() {
      sudoBanner.classList.toggle("hidden", modeSelect.value !== "sudo");
    }
    modeSelect.addEventListener("change", updateSudoBanner);
    updateSudoBanner();

    // ---- pill dot colors: quick visual cue instead of emoji ----
    const modeDot = document.getElementById("mode-dot");
    const tierSelect = document.getElementById("tier");
    const tierDot = document.getElementById("tier-dot");
    const MODE_COLORS = { general: "#4caf7a", sudo: "#ff6b6b" };
    const TIER_COLORS = { high: "#8e5cf7", medium: "#f5a623", low: "#6b6b6b" };
    function updateModeDot() { if (modeDot) modeDot.style.background = MODE_COLORS[modeSelect.value] || "#8e8e8e"; }
    function updateTierDot() { if (tierDot) tierDot.style.background = TIER_COLORS[tierSelect.value] || "#8e8e8e"; }
    modeSelect.addEventListener("change", updateModeDot);
    tierSelect.addEventListener("change", updateTierDot);
    updateModeDot();
    updateTierDot();

    // ---------------------------------------------------------------------
    // COMBO SELECT — single button that replaces the old side-by-side
    // mode/tier pill-selects. The two <select> elements above stay in the
    // DOM (hidden) purely as the value store, so every other place in this
    // file that reads document.getElementById("mode"/"tier").value keeps
    // working untouched. Clicking the button opens a Claude-model-picker
    // style dropdown: one pill row per mode+tier combo, sized to its own
    // label instead of stretched full-width.
    // ---------------------------------------------------------------------
    const comboWrap = document.getElementById("combo-wrap");
    const comboBtn = document.getElementById("combo-btn");
    const comboDropdown = document.getElementById("combo-dropdown");
    const comboLabel = document.getElementById("combo-label");

    // Mode (general/sudo) and tier (omni/super/nano) are ORTHOGONAL state —
    // one is a toggle, the other a 3-way pick. They used to be flattened into
    // a 2x3 = 6-item combo list (one row per mode+tier pair), which meant
    // duplicating every tier label under both "General" and "Sudo" groups.
    // Now tier renders once as a real 3-item list, and mode lives as a single
    // switch row underneath. Adding a 4th tier later is one array entry, not
    // two new rows.
    const TIER_OPTS = [
      { value: "high", label: "Omni", model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
      { value: "medium", label: "Super", model: "nvidia/nemotron-3-super-120b-a12b:free" },
      { value: "low", label: "Nano", model: "nvidia/nemotron-3-nano-30b-a3b:free" },
    ];
    const comboItemsWrap = document.getElementById("combo-items");
    const sudoToggleRow = document.getElementById("sudo-toggle-row");
    const sudoSwitch = document.getElementById("sudo-switch");

    function updateComboActiveState() {
      comboDropdown.querySelectorAll(".combo-item").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tier === tierSelect.value);
      });
      sudoSwitch.classList.toggle("on", modeSelect.value === "sudo");
      sudoToggleRow.classList.toggle("danger", modeSelect.value === "sudo");
    }

    function updateComboLabel() {
      const m = modeSelect.value === "sudo" ? "Extended" : "General";
      const t = TIER_OPTS.find(x => x.value === tierSelect.value);
      comboLabel.textContent = [m, t && t.label].filter(Boolean).join(" ");
      updateComboActiveState();
    }

    // Tier pick and sudo toggle each update state + UI on their own — no
    // shared "selectCombo(mode, tier)" needed since they no longer change
    // together. Tier picks close the dropdown (it's a real choice); the
    // toggle leaves it open (people flip it and immediately reconsider).
    function selectTier(tierValue) {
      tierSelect.value = tierValue;
      updateTierDot();
      updateComboLabel();
      closeComboDropdown();
    }

    function toggleSudo() {
      modeSelect.value = modeSelect.value === "sudo" ? "general" : "sudo";
      updateSudoBanner();
      updateModeDot();
      updateComboLabel();
    }
    sudoToggleRow.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSudo();
    });

    function buildComboDropdown() {
      comboItemsWrap.innerHTML = "";
      TIER_OPTS.forEach(t => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "combo-item";
        btn.dataset.tier = t.value;
        btn.innerHTML = `<span class="combo-item-text"><span class="combo-item-label">${t.label}</span><span class="combo-item-model">${t.model}</span></span>`;
        btn.addEventListener("click", () => selectTier(t.value));
        comboItemsWrap.appendChild(btn);
      });
      updateComboActiveState();
    }

    function openComboDropdown() {
      comboDropdown.classList.remove("hidden");
      const btnRect = comboBtn.getBoundingClientRect();
      const dropRect = comboDropdown.getBoundingClientRect();
      comboDropdown.classList.toggle("open-below", btnRect.top - dropRect.height < 8);
      document.addEventListener("click", handleOutsideComboClick);
    }
    function closeComboDropdown() {
      comboDropdown.classList.add("hidden");
      document.removeEventListener("click", handleOutsideComboClick);
    }
    function handleOutsideComboClick(e) {
      if (!comboWrap.contains(e.target)) closeComboDropdown();
    }
    comboBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (comboDropdown.classList.contains("hidden")) openComboDropdown();
      else closeComboDropdown();
    });

    buildComboDropdown();
    updateComboLabel();

    // Moves the composer's actual DOM node (the whole fragment we built
    // above) between the centered slot and the footer slot.
    function placeComposer(inFooter) {
      const targetSlot = inFooter ? composerSlotFooter : composerSlotEmpty;
      if (targetSlot.contains(input)) return; // already there
      document.querySelectorAll('[data-composer-part]').forEach(n => targetSlot.appendChild(n));
    }

    function setEmptyState(isEmpty) {
      emptyState.classList.toggle("hidden", !isEmpty);
      chatFooter.classList.toggle("hidden", isEmpty);
      placeComposer(!isEmpty);
      if (isEmpty) input.focus();
    }

    const chatHistoryEl = document.getElementById("chat-history");
    const welcomeEl = document.getElementById("welcome");
    const chatTitleEl = document.getElementById("chat-title");

    // ---------------------------------------------------------------------
    // CHAT HISTORY — lives on the backend (chats/<category>/<filename>
    // log files), NOT in localStorage. Every /chat and /confirm call
    // already appends to those files server-side; this section just reads
    // them back via GET /chats so a page refresh or a different browser
    // sees the exact same history. Each chat in memory:
    // { id, title, messages: [{text, kind}], category, filename }
    // ---------------------------------------------------------------------
    let chats = [];
    let activeChatId = null;

    // Backend roles are USER/ASSISTANT; the UI's own message shape uses
    // kind "user"/"bot". This maps one to the other on load.
    function backendMessagesToUi(messages) {
      return (messages || []).map(m => ({
        text: m.content,
        kind: m.role === "USER" ? "user" : "bot",
      }));
    }

    async function loadChats() {
      try {
        const res = await fetch(`${API_BASE}/chats`, {
          headers: authHeaders(),
        });
        if (res.status === 401) {
          await handleAuthFailure(res);
          return;
        }
        if (!res.ok) throw new Error("bad status " + res.status);
        markActive();
        const data = await res.json();
        chats = data.map(c => ({
          id: `${c.category}::${c.filename}`,
          title: (c.messages.find(m => m.role === "USER") || {}).content || "New chat",
          category: c.category,
          filename: c.filename,
          messages: backendMessagesToUi(c.messages),
        }));
      } catch (e) {
        console.error("Chatlarni yuklab bo'lmadi:", e);
        chats = [];
      }
    }

    // No-op kept only so existing call sites (createNewChat, message push
    // after send/confirm) don't need to change — history is already
    // persisted server-side by /chat and /confirm on every turn, so there
    // is nothing left to write here.
    function saveChats() {}

    function getActiveChat() {
      return chats.find(c => c.id === activeChatId) || null;
    }

    async function deleteChat(category, filename) {
      try {
        await fetch(`${API_BASE}/chats/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        markActive();
      } catch (e) {
        console.error("Chatni o'chirib bo'lmadi:", e);
      }
    }

    // ---- sidebar chat search — client-side filter over c.title, like
    // Claude's "Search chats" box. Nothing hits the backend for this. ----
    const chatSearchInput = document.getElementById("chat-search");
    let chatSearchQuery = "";
    chatSearchInput?.addEventListener("input", (e) => {
      chatSearchQuery = e.target.value || "";
      renderChatHistory();
    });

    function renderChatHistory() {
      chatHistoryEl.innerHTML = "";
      const q = chatSearchQuery.trim().toLowerCase();
      const list = q ? chats.filter(c => (c.title || "").toLowerCase().includes(q)) : chats;

      if (chats.length === 0) {
        chatHistoryEl.innerHTML = `<p class="text-xs text-gray-600 px-2 py-1">no chats yet</p>`;
        return;
      }
      if (list.length === 0) {
        chatHistoryEl.innerHTML = `<p class="text-xs text-gray-600 px-2 py-1">no matches</p>`;
        return;
      }

      // newest first
      [...list].reverse().forEach(c => {
        const isActive = c.id === activeChatId;
        const row = document.createElement("div");
        row.className = `chat-item-row sidebar-item${isActive ? " active" : ""}`;

        const titleBtn = document.createElement("button");
        titleBtn.type = "button";
        titleBtn.className = "chat-item-title";
        titleBtn.textContent = c.title || "New chat";
        titleBtn.title = c.title || "New chat";
        titleBtn.addEventListener("click", () => switchChat(c.id));

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "chat-item-delete";
        delBtn.title = "Delete chat";
        delBtn.setAttribute("aria-label", "Delete chat");
        delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${c.title || "New chat"}"?`)) return;
          delBtn.disabled = true;
          await deleteChat(c.category, c.filename);
          chats = chats.filter(x => x.id !== c.id);
          if (activeChatId === c.id) {
            activeChatId = null;
            if (chats.length) {
              switchChat(chats[chats.length - 1].id);
            } else {
              createNewChat();
            }
          } else {
            renderChatHistory();
          }
        });

        row.appendChild(titleBtn);
        row.appendChild(delBtn);
        chatHistoryEl.appendChild(row);
      });
    }

    function renderMessages() {
      chat.innerHTML = "";
      const active = getActiveChat();
      const isEmpty = !active || active.messages.length === 0;
      setEmptyState(isEmpty);
      if (isEmpty) return;
      active.messages.forEach(m => {
        if (m.kind === "io") {
          addIOCard(m.input, m.output, false);
        } else {
          addMessage(m.text, m.kind, false);
        }
      });
    }

    function switchChat(id) {
      activeChatId = id;
      renderChatHistory();
      renderMessages();
      updateChatTitle();
      closeSidebarOnMobile();
      input.focus();
    }

    function updateChatTitle() {
      const active = getActiveChat();
      chatTitleEl.textContent = (active && active.title) ? active.title : "MRagent";
      chatTitleEl.style.animation = "none";
      void chatTitleEl.offsetWidth;
      chatTitleEl.style.animation = "";
    }

    function createNewChat() {
      // Not written to the backend yet — chats/<category>/<filename>.log
      // is only created server-side the moment the first real message is
      // sent via /chat. Until then this only exists in memory so the UI
      // has somewhere to type into.
      const category = "chat_" + Date.now().toString(36);
      const newChat = {
        id: `${category}::session`,
        title: "New chat",
        messages: [],
        category,
        filename: "session"
      };
      chats.push(newChat);
      switchChat(newChat.id);
    }

    function ensureActiveChat() {
      if (chats.length === 0) {
        createNewChat();
      } else if (!activeChatId) {
        switchChat(chats[chats.length - 1].id);
      }
    }

    newChatBtn.addEventListener("click", createNewChat);

    // -----------------------------------------------------------------
    // REAL BASH TERMINAL — no AI involved anywhere in this path.
    // Opens a WebSocket straight to a PTY (pseudo-terminal) running real
    // bash on the machine, through the same cloudflared tunnel as
    // everything else. Every keystroke goes to bash's stdin, every byte
    // bash writes comes straight back — this is functionally SSH over
    // the tunnel, gated by the same password + session.
    // -----------------------------------------------------------------
    let termInstance = null;
    let termFitAddon = null;
    let termSocket = null;
    let termResizeHandler = null;

    function setTermStatus(text, color) {
      termStatusText.textContent = text;
      termStatusDot.style.background = color;
    }

    function openTerminal() {
      if (!API_BASE) return;
      chatPanel.classList.add("hidden");
      termPanel.classList.remove("hidden");
      termPanel.classList.add("flex");

      if (termSocket) return; // already connected/connecting, just switched view back to it

      termContainer.innerHTML = "";
      termInstance = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
        scrollback: 5000,
        theme: {
          background: "#0b0b0b",
          foreground: "#ececec",
          cursor: "#ececec",
          cursorAccent: "#0b0b0b",
          selectionBackground: "#3a3a3a",
          black: "#0b0b0b",
          red: "#f2555a",
          green: "#3fb950",
          yellow: "#e0a020",
          blue: "#4c9dff",
          magenta: "#c678dd",
          cyan: "#39c5cf",
          white: "#d4d4d4",
          brightBlack: "#6a6a6a",
          brightRed: "#ff7b80",
          brightGreen: "#56d364",
          brightYellow: "#f0c040",
          brightBlue: "#6fb3ff",
          brightMagenta: "#e0a0f0",
          brightCyan: "#5ee6f2",
          brightWhite: "#ffffff",
        },
      });
      termFitAddon = new FitAddon.FitAddon();
      termInstance.loadAddon(termFitAddon);
      termInstance.open(termContainer);
      termFitAddon.fit();

      setTermStatus("connecting...", "#e0a020");

      // Browser WebSocket API can't set custom headers on the handshake,
      // so auth travels as query params here instead of the X-Login-Pass /
      // X-Session-Id headers the rest of the app uses.
      const wsBase = API_BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
      const wsUrl = `${wsBase}/ws/term?pass=${encodeURIComponent(LOGIN_PASS)}&session=${encodeURIComponent(SESSION_ID)}`;
      const socket = new WebSocket(wsUrl);
      termSocket = socket;

      socket.addEventListener("open", () => {
        setTermStatus("connected", "#3fb950");
        markActive();
        const { cols, rows } = termInstance;
        socket.send(`\x01RESIZE:${cols},${rows}`);
        termInstance.focus();
      });
      socket.addEventListener("message", (evt) => {
        termInstance.write(evt.data);
      });
      socket.addEventListener("close", () => {
        setTermStatus("disconnected", "#f2555a");
        termSocket = null;
      });
      socket.addEventListener("error", () => {
        setTermStatus("connection error", "#f2555a");
      });

      termInstance.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      });

      termResizeHandler = () => {
        if (!termFitAddon) return;
        termFitAddon.fit();
        if (socket.readyState === WebSocket.OPEN) {
          const { cols, rows } = termInstance;
          socket.send(`\x01RESIZE:${cols},${rows}`);
        }
      };
      window.addEventListener("resize", termResizeHandler);
    }

    function closeTerminal() {
      termPanel.classList.add("hidden");
      termPanel.classList.remove("flex");
      chatPanel.classList.remove("hidden");
    }

    function teardownTerminal() {
      if (termSocket) {
        termSocket.close();
        termSocket = null;
      }
      if (termResizeHandler) {
        window.removeEventListener("resize", termResizeHandler);
        termResizeHandler = null;
      }
      if (termInstance) {
        termInstance.dispose();
        termInstance = null;
      }
      termFitAddon = null;
    }

    bashBtn.addEventListener("click", openTerminal);
    termCloseBtn.addEventListener("click", () => {
      teardownTerminal();
      closeTerminal();
    });

    // ---- empty-state greeting, time-of-day aware like Claude's own
    // "Good morning/afternoon/evening" welcome. ----
    function setGreeting() {
      if (!welcomeEl) return;
      const h = new Date().getHours();
      const part = h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
      welcomeEl.textContent = `Good ${part}. What are we building today?`;
    }

    async function showApp() {
      bootScreen.classList.add("hidden");
      loginScreen.classList.add("hidden");
      appScreen.classList.remove("hidden");
      tunnelStatus.textContent = "connected";
      tunnelStatus.classList.add("text-green-500");
      chatHistoryEl.innerHTML = `<p class="text-xs text-gray-600 px-2 py-1">loading chats...</p>`;
      setGreeting();
      await loadChats();
      ensureActiveChat();
      input.focus();
    }

    // Har bir himoyalangan so'rovga qo'shiladigan header'lar — session_id
    // shu yerda markazlashtirilgan, shuning uchun uni qo'shishni unutib
    // qo'yadigan yangi fetch chaqiruvi paydo bo'lmaydi.
    function authHeaders(extra) {
      return Object.assign(
        { "X-Login-Pass": LOGIN_PASS, "X-Session-Id": SESSION_ID },
        extra || {}
      );
    }

    // Har qanday muvaffaqiyatli himoyalangan so'rovdan keyin chaqiriladi —
    // "oxirgi faollik" vaqtini localStorage'ga yozadi. Backend'dagi
    // touch_session() bilan bir xil g'oya: 24 soatlik hisob har harakatda
    // qaytadan boshlanadi (sliding), faqat CHINDAN 1 kun hech narsa
    // qilinmasa avto-logout ishga tushadi.
    function markActive() {
      localStorage.setItem("MRagent_last_active", String(Date.now()));
    }

    function isSessionStale() {
      const lastActive = parseInt(localStorage.getItem("MRagent_last_active") || "0", 10);
      return !lastActive || (Date.now() - lastActive > SESSION_TTL_MS);
    }

    // Tab OCHIQ turgan holatda ham (hech qanday so'rov yubormasdan) 24
    // soatdan keyin avto-logout bo'lishi uchun — davriy tekshiruv.
    function startInactivityWatcher() {
      if (inactivityWatcherId) clearInterval(inactivityWatcherId);
      inactivityWatcherId = setInterval(() => {
        if (isSessionStale()) {
          doLogout("You were inactive for over a day — please sign in again.");
        }
      }, 5 * 60 * 1000); // har 5 daqiqada tekshiradi — real-vaqtga yaqin, arzon
    }

    function stopInactivityWatcher() {
      if (inactivityWatcherId) {
        clearInterval(inactivityWatcherId);
        inactivityWatcherId = null;
      }
    }

    // TO'LIQ logout: serverdagi session_id'ni bekor qiladi (best-effort —
    // tarmoq yo'q bo'lsa ham baribir mahalliy tozalashni davom ettiradi),
    // so'ng har qanday qoldiq holat/keshni (pass, token, session_id,
    // oxirgi-faollik vaqti) mahalliy tozalaydi va login ekraniga qaytaradi.
    // Bu — sen so'ragan "barcha kesh lar tozalanishi kerak" talabining
    // aynan o'zi: na eski parol, na eski token, na eski session — hech
    // narsa brauzerda qolmaydi.
    function doLogout(message) {
      stopInactivityWatcher();
      teardownTerminal?.();
      closeTerminal?.();
      const sidToInvalidate = SESSION_ID;
      if (API_BASE && sidToInvalidate) {
        fetch(`${API_BASE}/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sidToInvalidate }),
        }).catch(() => {});
      }
      localStorage.removeItem("MRagent_session");
      localStorage.removeItem("MRagent_last_active");
      SESSION_ID = "";
      showLogin(message);
    }

    function showLogin(errorMsg) {
      bootScreen.classList.add("hidden");
      appScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      LOGIN_PASS = "";
      SESSION_ID = "";
      localStorage.removeItem("MRagent_pass");
      localStorage.removeItem("MRagent_session");
      localStorage.removeItem("MRagent_last_active");
      stopInactivityWatcher();
      loginBtn.disabled = false;
      loginBtn.textContent = "Continue";
      otpStage = false;
      loginOtpWrap.classList.add("hidden");
      loginPass.disabled = false;
      stopOtpTimer();
      loginOtpTimer.classList.add("hidden");
      loginOtpTimer.textContent = "";
      if (errorMsg) {
        loginError.textContent = errorMsg;
        loginError.classList.remove("hidden");
      } else {
        loginError.classList.add("hidden");
      }
      loginPass.value = "";
      clearOtpBoxes();
      loginPass.focus();
    }

    // Har qanday himoyalangan so'rov 401 qaytarganda chaqiriladi — sabab
    // backend'dan keladi ('unauthorized' — PASS o'zi noto'g'ri, odatda u
    // mragent-set-pass bilan o'zgartirilgan bo'lsa; 'session_expired' —
    // PASS to'g'ri, lekin 24 soatlik sessiya muddati tugagan). Ikkala
    // holatda ham to'liq logout: eski pass/session hech qanday holatda
    // brauzerda qolib ketmaydi.
    async function handleAuthFailure(res) {
      let reason = "unauthorized";
      try {
        const data = await res.json();
        if (data && data.error) reason = data.error;
      } catch (e) {
        // body yo'q yoki JSON emas — standart xabar bilan davom etamiz
      }
      const message = reason === "session_expired"
        ? "Your session expired after a day of inactivity — please sign in again."
        : "Password changed — please sign in again.";
      doLogout(message);
    }

    async function loadTunnelUrl() {
      loginTunnelStatus.textContent = "looking for tunnel...";
      try {
        // Firestore'ning o'z "offline" deb qaror qilishi ichki SDK
        // darajasida juda uzoq davom etishi mumkin (ayniqsa ad-blocker
        // ulanishni qayta-qayta bloklab, retry-loop hosil qilsa — 30-60+
        // soniyagacha). Foydalanuvchini shuncha kutdirish o'rniga, o'zimiz
        // 6 soniyadan keyin to'xtatamiz va aniq xabar + retry beramiz.
        // { source: "server" } — Firestore'ga mahalliy keshni (IndexedDB/
        // memory cache) chetlab o'tib, HAR SAFAR to'g'ridan-to'g'ri
        // serverdan o'qishni majburlaydi. Buni qo'shmasak, cloudflared
        // tunnel har restart'da yangi URL chiqarganda, brauzer ba'zida
        // eski (keshlangan) manzilni qaytarib yuborardi va "Failed to
        // fetch" xatosi shundan kelib chiqardi.
        const docPromise = db.collection("config").doc("tunnel").get({ source: "server" });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15000)
        );
        const doc = await Promise.race([docPromise, timeoutPromise]);

        if (doc.exists && doc.data().url) {
          API_BASE = doc.data().url.replace(/\/$/, "");
          loginTunnelStatus.textContent = "tunnel connected, enter your password and token";
        } else {
          loginTunnelStatus.textContent = "tunnel not found (Firestore empty)";
          showTunnelRetry();
        }
      } catch (e) {
        const isTimeout = e && e.message === "timeout";
        loginTunnelStatus.textContent = isTimeout
          ? "connection is slow/blocked — check your ad-blocker, then retry"
          : "Firestore error — check your connection";
        console.error(e);
        showTunnelRetry();
      }
    }

    function showTunnelRetry() {
      let btn = document.getElementById("tunnel-retry-btn");
      if (btn) return; // allaqachon ko'rsatilgan
      btn = document.createElement("button");
      btn.id = "tunnel-retry-btn";
      btn.type = "button";
      btn.textContent = "Retry";
      btn.className = "w-full text-[13px] text-[#ececec] bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-xl py-2 mt-2 transition";
      btn.addEventListener("click", () => {
        btn.remove();
        loadTunnelUrl();
      });
      loginTunnelStatus.insertAdjacentElement("afterend", btn);
    }

    // Ikki bosqichli login. 1-bosqich: faqat PASS yuboriladi -> backend
    // /send-otp orqali parolni tekshiradi va to'g'ri bo'lsa emailga
    // 60 soniyalik bir martalik OTP kod jo'natadi. 2-bosqich: shu ekranda
    // ochilgan OTP maydoniga kod kiritilib, /login PASS+OTP bilan
    // chaqiriladi va session ochiladi.
    async function requestOtp(pass) {
      const res = await fetch(`${API_BASE}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200 && data.ok) return { ok: true, error: null, ttlSeconds: data.ttl_seconds || 60 };
      return { ok: false, error: data.error || null, ttlSeconds: null };
    }

    async function verifyLogin(pass, otp) {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass, otp })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status !== 200) return { sessionId: null, error: data.error || null };
      if (!data.session_id) return { sessionId: null, error: "mismatch" };
      return { sessionId: data.session_id, error: null };
    }

    // --- 2-bosqich: OTP bilan haqiqiy login (tugmasiz, avtomatik) ---
    // 8-chi raqam kiritilgan zahoti (yoki paste orqali to'liq kod tushsa)
    // chaqiriladi — foydalanuvchi hech qanday tugma bosmaydi.
    let otpSubmitting = false;

    async function submitOtp() {
      if (otpSubmitting) return;
      const pass = loginPass.value.trim();
      const otp = loginOtp.value.trim();
      if (otp.length !== OTP_LENGTH) return;

      otpSubmitting = true;
      setOtpBoxesDisabled(true);
      loginError.classList.add("hidden");

      try {
        const { sessionId, error } = await verifyLogin(pass, otp);
        if (sessionId) {
          stopOtpTimer();
          LOGIN_PASS = pass;
          SESSION_ID = sessionId;
          localStorage.setItem("MRagent_pass", LOGIN_PASS);
          localStorage.setItem("MRagent_session", SESSION_ID);
          markActive();
          startInactivityWatcher();
          await showApp();
        } else if (error === "invalid_or_expired_otp") {
          showLogin("OTP code is wrong or expired — enter your password again.");
        } else {
          showLogin("Wrong password.");
        }
      } catch (err) {
        showLogin("Couldn't reach the backend. Is the tunnel up?");
      } finally {
        otpSubmitting = false;
        setOtpBoxesDisabled(false);
      }
    }

    function setOtpBoxesDisabled(disabled) {
      otpDigitInputs.forEach((b) => { b.disabled = disabled; });
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!API_BASE) {
        loginError.textContent = "Tunnel not found yet, wait a moment and try again.";
        loginError.classList.remove("hidden");
        return;
      }
      const pass = loginPass.value.trim();

      if (otpStage) {
        // OTP bosqichida forma submit bo'lishi kerak emas (tugma yo'q,
        // Enter bosilsa ham hech narsa qilmaydi) — tekshiruv faqat
        // 8 xona to'lganda avtomatik ishga tushadi (submitOtp).
        return;
      }

      // --- 1-bosqich: parolni yuborib OTP so'rash ---
      if (!pass) {
        loginError.textContent = "Enter your password.";
        loginError.classList.remove("hidden");
        return;
      }
      loginBtn.disabled = true;
      loginBtn.textContent = "Checking...";
      loginError.classList.add("hidden");
      try {
        const { ok, error, ttlSeconds } = await requestOtp(pass);
        if (ok) {
          otpStage = true;
          loginPass.disabled = true;
          loginOtpWrap.classList.remove("hidden");
          loginBtn.classList.add("hidden");
          focusFirstOtpBox();
          startOtpTimer(ttlSeconds);
        } else if (error === "unauthorized") {
          showLogin("Wrong password.");
        } else if (error === "email_not_configured_or_failed") {
          loginError.textContent = "Couldn't send the email — try again in a moment.";
          loginError.classList.remove("hidden");
        } else {
          loginError.textContent = "Couldn't send OTP. Try again.";
          loginError.classList.remove("hidden");
        }
      } catch (err) {
        showLogin("Couldn't reach the backend. Is the tunnel up?");
      } finally {
        loginBtn.disabled = false;
        if (!otpStage) loginBtn.textContent = "Continue";
      }
    });

    logoutBtn.addEventListener("click", () => {
      doLogout();
    });

    function addMessage(text, kind = "bot", persist = true) {
      const div = document.createElement("div");
      const isUser = kind === "user";
      const isPending = kind === "pending";
      const isError = kind === "error";
      div.className = `flex ${isUser ? "justify-end" : "justify-start"}`;
      if (isUser) {
        div.innerHTML = `
          <div class="max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed bubble-user">
            <pre class="whitespace-pre-wrap font-sans">${escapeHtml(text)}</pre>
          </div>`;
      } else if (isPending) {
        // Command/file confirmations show the raw command verbatim —
        // monospace is correct here, this isn't prose.
        div.innerHTML = `
          <div class="max-w-full w-full text-[15px] leading-relaxed bubble-pending rounded-2xl px-4 py-2.5">
            <pre class="whitespace-pre-wrap font-sans">${escapeHtml(text)}</pre>
          </div>`;
      } else if (isError) {
        // OpenRouter band/timeout bo'lganda backend shu turdagi xabar
        // yuboradi — bu model javobi emas, tizim holati, shuning uchun
        // alohida (qizil) ko'rinishda, oddiy chat pufagidan ajratib.
        div.innerHTML = `
          <div class="max-w-full w-full text-[15px] leading-relaxed bubble-error rounded-2xl px-4 py-2.5">
            <pre class="whitespace-pre-wrap font-sans">${escapeHtml(text)}</pre>
          </div>`;
      } else {
        // Normal bot replies: render as markdown, like a real assistant
        // reply instead of a terminal dump.
        const html = (typeof marked !== "undefined")
          ? marked.parse(text, { breaks: true })
          : escapeHtml(text);
        div.innerHTML = `
          <div class="max-w-full w-full">
            <div class="text-[15px] bubble-bot prose-bot">${html}</div>
            <div class="msg-actions">${COPY_BTN_HTML}</div>
          </div>`;
      }
      chat.appendChild(div);
      chatScroll.scrollTop = chatScroll.scrollHeight;

      if (!isUser && !isPending && !isError) {
        wireCopyButton(div.querySelector(".copy-btn"), text);
      }

      if (persist) {
        const active = getActiveChat();
        if (active) {
          active.messages.push({ text, kind });
          if (isUser && active.title === "New chat") {
            active.title = text.slice(0, 40);
            renderChatHistory();
            updateChatTitle();
          }
          saveChats();
        }
      }
      return div;
    }

    // -----------------------------------------------------------------
    // INPUT / OUTPUT CARD
    // Shows exactly what the AI ran (input) and exactly what the
    // terminal returned (output) as two clearly separated boxes, instead
    // of folding the command + result into one prose-style bot bubble.
    // Persisted with kind "io" so it survives switching between chats.
    // -----------------------------------------------------------------
    // Light bash syntax highlighting (no real parser, just enough to look
    // like a real terminal/code block — commands, flags, quoted strings,
    // operators like && ; | get their own color, everything else is left
    // as plain path/argument text).
    const BASH_COMMANDS = new Set([
      "cd","ls","zip","unzip","cp","mv","rm","mkdir","touch","cat","echo",
      "grep","find","sed","awk","curl","wget","git","npm","node","python",
      "python3","pip","pip3","bash","sh","chmod","chown","tar","kill",
      "ps","top","df","du","head","tail","sort","uniq","wc","xargs","export"
    ]);
    function highlightBash(cmd) {
      const parts = cmd.split(/(\s*(?:&&|\|\||[;|>]{1,2})\s*)/g);
      let atCmdStart = true;
      return parts.map(part => {
        if (/^\s*(?:&&|\|\||[;|>]{1,2})\s*$/.test(part)) {
          atCmdStart = true;
          return `<span class="tok-op">${escapeHtml(part)}</span>`;
        }
        const tokens = part.split(/(\s+|"[^"]*"|'[^']*')/g);
        return tokens.map(tok => {
          if (!tok) return "";
          if (/^\s+$/.test(tok)) return tok;
          if (/^["'].*["']$/.test(tok)) return `<span class="tok-str">${escapeHtml(tok)}</span>`;
          if (/^-{1,2}[a-zA-Z-]+/.test(tok)) return `<span class="tok-flag">${escapeHtml(tok)}</span>`;
          if (atCmdStart && BASH_COMMANDS.has(tok)) {
            atCmdStart = false;
            return `<span class="tok-cmd">${escapeHtml(tok)}</span>`;
          }
          atCmdStart = false;
          return `<span class="tok-path">${escapeHtml(tok)}</span>`;
        }).join("");
      }).join("");
    }

    // Formats output text, turning a trailing "[Exit code: N]" marker (or
    // "exit code N" already in that shape) into a small colored line
    // instead of raw bracketed text.
    function formatIOOutput(out) {
      const m = out.match(/^([\s\S]*?)\s*\[Exit code:\s*(-?\d+)\]\s*$/);
      if (!m) return escapeHtml(out);
      const [, body, code] = m;
      const cls = code === "0" ? "io-exit-ok" : "io-exit-err";
      const bodyHtml = body.trim() ? escapeHtml(body.trim()) + "\n\n" : "";
      return `${bodyHtml}<span class="${cls}">exit code ${escapeHtml(code)}</span>`;
    }

    function addIOCard(inputText, outputText, persist = true, beforeEl = null) {
      const div = document.createElement("div");
      div.className = "flex justify-start w-full";
      const out = (outputText && outputText.trim()) ? outputText : "(no output)";
      const isErr = /\[Exit code: [1-9]/.test(out) || /^Execution error:/.test(out) || /^Command timed out/.test(out);
      div.innerHTML = `
        <div class="max-w-full w-full io-card">
          <div class="io-section">
            <div class="io-header">bash</div>
            <pre class="io-content">${highlightBash(inputText || "")}</pre>
          </div>
          <div class="io-section">
            <div class="io-header">Output</div>
            <pre class="io-content${isErr ? " io-output-err" : ""}">${formatIOOutput(out)}</pre>
          </div>
        </div>`;
      // beforeEl beriladi -> shu element (masalan hali faol "thinking"
      // qatori)dan OLDIN kiritamiz, aks holda yangi box doim eng pastga —
      // hali ishlab turgan thinking indikatoridan HAM pastga tushib
      // qolardi, tartib teskari ko'rinardi (terminaldagidek: bajarilgan
      // komanda tepada, "hozir ishlayapti" belgisi doim eng pastda turishi
      // kerak).
      if (beforeEl && beforeEl.parentNode === chat) {
        chat.insertBefore(div, beforeEl);
      } else {
        chat.appendChild(div);
      }
      chatScroll.scrollTop = chatScroll.scrollHeight;

      if (persist) {
        const active = getActiveChat();
        if (active) {
          active.messages.push({ kind: "io", input: inputText, output: outputText });
          saveChats();
        }
      }
      return div;
    }

    // -----------------------------------------------------------------
    // LIVE THOUGHT-PROCESS PANEL
    // Backend streams real Server-Sent Events for every step of its
    // agent loop: "thinking" while the model is deciding, "action" once
    // it picked something, "step_result" once that action finished. This
    // renders that live, instead of a fake spinner — every line reflects
    // something that is actually happening on the backend right now.
    // -----------------------------------------------------------------
// Mirrors backend detect_lang()/action_label() just enough for the
// placeholder shown before the FIRST real SSE "thinking" event arrives
// (which overwrites it immediately via setLabel — this only covers the
// brief gap while the request is in flight). `sourceText`, when given, is
// the message the user just sent; for the /confirm flow there's no fresh
// message, so it falls back to a language-neutral "..." instead of
// guessing wrong.
const _SENDING_LABEL = { uz: "So'rov yuborilmoqda", ru: "Отправка запроса", en: "Sending request" };
function _detectLangJs(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (/[\u0400-\u04FF]/.test(t)) {
    return /[ўқғҳ]/.test(t) ? "uz" : "ru";
  }
  const words = new Set(t.match(/[a-z']+/g) || []);
  const uzWords = ["va", "bilan", "uchun", "keyin", "nima", "qanday", "salom", "rahmat", "bratan", "kerak", "iltimos"];
  const enWords = ["the", "is", "are", "you", "please", "help", "and", "for", "with", "what", "how", "can"];
  if (uzWords.some((w) => words.has(w))) return "uz";
  if (enWords.some((w) => words.has(w))) return "en";
  return null;
}
function createThoughtPanel(sourceText) {
  const lang = _detectLangJs(sourceText);
  const initialLabel = lang ? _SENDING_LABEL[lang] : "...";
  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-start w-full";
  wrapper.innerHTML = `
    <div class="max-w-full w-full rounded-2xl px-4 py-3">
      <div class="thought-log" id="thought-log"></div>
      <div class="thinking-row" id="thinking-row">
        <video class="thinking-orb-video" src="circle2_transparent.webm" autoplay loop muted playsinline></video>
        <span id="thinking-label">${initialLabel}</span>
        <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
      </div>
    </div>`;
  chat.appendChild(wrapper);
  chatScroll.scrollTop = chatScroll.scrollHeight;

      const logEl = wrapper.querySelector("#thought-log");
      const rowEl = wrapper.querySelector("#thinking-row");
      const labelEl = wrapper.querySelector("#thinking-label");

      return {
        el: wrapper,
        setLabel(text) {
          labelEl.textContent = text;
          chatScroll.scrollTop = chatScroll.scrollHeight;
        },
        commitLine(text) {
          // Freeze the current line into the log with a checkmark, then
          // keep the animated row going for whatever comes next.
          const line = document.createElement("div");
          line.className = "thought-line";
          line.innerHTML = `<span class="check">·</span><span>${escapeHtml(text)}</span>`;
          logEl.appendChild(line);
          chatScroll.scrollTop = chatScroll.scrollHeight;
        },
        remove() {
          wrapper.remove();
        }
      };
    }

    // OpenRouter (bepul model) band bo'lib chaqiruv butunlay
    // muvaffaqiyatsiz tugaganda backend "error" kind yuboradi. Bu odatda
    // vaqtinchalik (navbat/rate-limit) bo'lgani uchun bir tugma bosib
    // xuddi shu xabarni qayta yuborish imkonini beramiz.
    function addRetryButton(originalMessage) {
      const div = document.createElement("div");
      div.className = "flex justify-start";
      div.innerHTML = `
        <button class="bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[13px] px-4 py-2 rounded-full transition">
          Qayta urinib ko'rish
        </button>`;
      div.querySelector("button").addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.textContent = "sending...";
        div.remove();
        input.value = originalMessage;
        await sendMessage();
      });
      chat.appendChild(div);
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    function addConfirmButton(commandId) {
      const div = document.createElement("div");
      div.className = "flex justify-start";
      div.innerHTML = `
        <button class="bg-amber-600 hover:bg-amber-500 text-[13px] px-4 py-2 rounded-full transition" data-cmdid="${commandId}">
          Confirm and run
        </button>`;
      div.querySelector("button").addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.textContent = "running...";
        await confirmCommand(commandId);
        div.remove();
      });
      chat.appendChild(div);
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    // Qaytarib bo'lmaydigan xavfli komandalar (sudo mode + hard-block
    // pattern) uchun: oddiy tugma yetarli emas, foydalanuvchi komandani
    // ANIQ, xatosiz qayta o'zi qo'lda yozishi kerak — xuddi GitHub'ning
    // "type the repo name to delete" tasdig'i kabi. Tugma matn mos
    // kelmaguncha disabled turadi.
    function addDangerConfirmCard(commandId, commandText) {
      const div = document.createElement("div");
      div.className = "flex justify-start";
      div.innerHTML = `
        <div class="max-w-full w-full rounded-2xl px-4 py-3 space-y-2" style="background:#3a1414; border:1px solid #5c1f1f;">
          <div class="text-[13px] font-semibold" style="color:#ff6b6b;">
            DANGEROUS, IRREVERSIBLE COMMAND
          </div>
          <div class="text-[13px] font-mono px-2 py-1.5 rounded" style="background:#1a0d0d; color:#ffb4b4; white-space:pre-wrap; word-break:break-all;">${escapeHtml(commandText)}</div>
          <div class="text-[12px]" style="color:#e8a0a0;">Retype the command EXACTLY to confirm:</div>
          <input type="text" class="danger-typed w-full bg-transparent border rounded px-2 py-1.5 text-[13px] font-mono focus:outline-none" style="border-color:#5c1f1f; color:#ffb4b4;" placeholder="${escapeHtml(commandText)}" autocomplete="off" spellcheck="false" />
          <div class="danger-error text-[12px] hidden" style="color:#ff6b6b;">Doesn't match — try again.</div>
          <button class="danger-btn w-full bg-red-800 text-[13px] px-4 py-2 rounded-full transition opacity-40 cursor-not-allowed" disabled>
            Confirm and run
          </button>
        </div>`;

      const input = div.querySelector(".danger-typed");
      const btn = div.querySelector(".danger-btn");
      const errorEl = div.querySelector(".danger-error");

      function refreshBtnState() {
        const match = input.value === commandText;
        btn.disabled = !match;
        btn.classList.toggle("opacity-40", !match);
        btn.classList.toggle("cursor-not-allowed", !match);
        btn.classList.toggle("bg-red-800", !match);
        btn.classList.toggle("bg-red-600", match);
        btn.classList.toggle("hover:bg-red-500", match);
      }
      input.addEventListener("input", () => {
        errorEl.classList.add("hidden");
        refreshBtnState();
      });

      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "running...";
        const ok = await confirmCommand(commandId, input.value);
        if (ok) {
          div.remove();
        } else {
          errorEl.classList.remove("hidden");
          btn.disabled = false;
          btn.textContent = "Confirm and run";
        }
      });

      chat.appendChild(div);
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    function escapeHtml(text) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ---- shared "copy" action under assistant replies (Claude-style hover
    // action bar). Markup is a template so both the instant addMessage()
    // path and the typewriter addMessageTyped() path render identically. ----
    const COPY_BTN_HTML = `
      <button type="button" class="msg-action-btn copy-btn" title="Copy">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    const COPY_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const CHECK_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    function wireCopyButton(btn, text) {
      if (!btn) return;
      btn.addEventListener("click", () => {
        navigator.clipboard?.writeText(text).then(() => {
          btn.innerHTML = CHECK_ICON;
          btn.classList.add("just-copied");
          btn.closest(".msg-actions")?.classList.add("copied");
          setTimeout(() => {
            btn.innerHTML = COPY_ICON;
            btn.classList.remove("just-copied");
            btn.closest(".msg-actions")?.classList.remove("copied");
          }, 1200);
        }).catch(() => {});
      });
    }

    // Cosmetic typewriter reveal for final bot replies. NOTE: this is a
    // display trick, not real token streaming — the full text already
    // arrived from the backend (the JSON-action format doesn't support
    // streaming a "done" message mid-generation). It's here purely so the
    // reply doesn't just "pop in" all at once, which reads as more natural.
    function addMessageTyped(text) {
      const div = document.createElement("div");
      div.className = "flex justify-start";
      const container = document.createElement("div");
      container.className = "max-w-full w-full";
      const inner = document.createElement("div");
      inner.className = "text-[15px] bubble-bot prose-bot";
      container.appendChild(inner);
      div.appendChild(container);
      chat.appendChild(div);
      chatScroll.scrollTop = chatScroll.scrollHeight;

      return new Promise(resolve => {
        let i = 0;
        // Time-based reveal (~28ms per character) instead of a fixed
        // frame-count split — short replies now visibly type out too,
        // instead of resolving in 1–2 frames.
        const msPerChar = 28;
        let lastTime = null;

        function tick(now) {
          if (lastTime === null) lastTime = now;
          const elapsed = now - lastTime;
          const charsToShow = Math.min(text.length, Math.floor(elapsed / msPerChar));
          if (charsToShow > i) {
            i = charsToShow;
            const slice = text.slice(0, i);
            inner.innerHTML = (typeof marked !== "undefined")
              ? marked.parse(slice, { breaks: true })
              : escapeHtml(slice);
            chatScroll.scrollTop = chatScroll.scrollHeight;
          }
          if (i < text.length) {
            requestAnimationFrame(tick);
          } else {
            const actions = document.createElement("div");
            actions.className = "msg-actions";
            actions.innerHTML = COPY_BTN_HTML;
            container.appendChild(actions);
            wireCopyButton(actions.querySelector(".copy-btn"), text);

            const active = getActiveChat();
            if (active) {
              active.messages.push({ text, kind: "bot" });
              saveChats();
            }
            resolve();
          }
        }
        requestAnimationFrame(tick);
      });
    }

    // sendMessage() va confirmCommand() ikkalasi ham backend'dan SSE stream
    // qaytaradi (ROADMAP: /confirm endi run_agent_loop'ga qaytib, zanjirni
    // avtomatik davom ettiradi — oldin oddiy JSON qaytarardi). Bu funksiya
    // ikkalasi uchun ham umumiy: bitta fetch Response'ni oladi, SSE
    // frame'larni o'qib, thought panel + xabar kartalarini yangilaydi.
    async function consumeAgentStream(res, panel, originalMessage) {
      let sawAnyEvent = false;

      // Ba'zi holatlarda backend hali ham oddiy JSON qaytarishi mumkin
      // (masalan __mragent_auth_check__ yoki xato javoblar) — shuni SSE
      // deb noto'g'ri o'qishga urinmaslik uchun avval content-type'ni
      // tekshiramiz.
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json();
        panel?.remove();
        if (data.error && !data.type) {
          addMessage(data.error, "bot");
        } else {
          addMessage(data.response || "No response", "bot");
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseChunk(buffer);
        buffer = remainder;

        for (const evt of events) {
          sawAnyEvent = true;

          if (evt.type === "thinking") {
            // Backend endi aynan qaysi matnni ko'rsatish kerakligini
            // `label` maydonida yuboradi — frontend o'zidan "Thinking"
            // kabi status nomini o'ylab topmaydi, faqat kelganini chiqaradi.
            panel?.setLabel(evt.label || "...");
          } else if (evt.type === "action") {
            panel?.setLabel(evt.label || evt.target || "...");
          } else if (evt.type === "step_result") {
            panel?.commitLine(evt.label || `${evt.action} — ${evt.command || evt.path || evt.query || ""}`);
            // Box'ni HOZIR, shu step tugagan zahoti chizamiz — "final"
            // kelguncha kutib, hammasini birdaniga tashlamaymiz. Shuning
            // uchun har bir komanda/fayl amali real vaqtda, ketma-ket
            // ekranga chiqib boradi, xuddi terminalda ishlayotgandek.
            const inputText = evt.command || evt.path || evt.query || "";
            addIOCard(inputText, evt.result || "", true, panel?.el || null);
          } else if (evt.type === "final") {
            panel?.remove();
            panel = null; // keyingi "thinking" eventi kelsa (confirm zanjiri
                           // davom etib, yana bir bosqich chiqsa), yangi panel
                           // kerak bo'ladi — buni chaqiruvchi tomon boshqaradi.

            if (evt.kind === "pending_confirmation") {
              // Box'lar allaqachon step_result orqali jonli chizilgan —
              // shu yerda evt.steps'ni qayta aylantirish ularni EKANGA
              // TAKRORLAB chiqarardi (ikki marta ko'rinardi).
              addMessage(evt.response, "pending");
              if (evt.requires_typed_confirmation) {
                addDangerConfirmCard(evt.command_id, evt.command);
              } else {
                addConfirmButton(evt.command_id);
              }
            } else if (evt.kind === "blocked") {
              // ZONA 3 (qaytarib bo'lmaydigan amal) — hech qanday tasdiq
              // yoki tugma yo'q, faqat aniq qizil xabar bilan nega
              // bajarilmaganini tushuntiramiz.
              addMessage(evt.response, "error");
            } else if (evt.kind === "error") {
              addMessage(evt.response, "error");
              if (evt.retryable && originalMessage) {
                addRetryButton(originalMessage);
              }
            } else {
              await addMessageTyped(evt.response || "No response");
            }
          }
        }
      }

      if (!sawAnyEvent) {
        panel?.remove();
        addMessage("No response from the backend.", "bot");
      }
    }

    async function confirmCommand(commandId, typedConfirmation) {
      try {
        const body = { command_id: commandId };
        if (typedConfirmation !== undefined) body.typed_confirmation = typedConfirmation;
        const res = await fetch(`${API_BASE}/confirm`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body)
        });
        if (res.status === 401) {
          await handleAuthFailure(res);
          return false;
        }
        markActive();
        // typed_confirmation_mismatch hali ham oddiy JSON (400) — bu SSE
        // stream boshlanishidan OLDIN, backend darhol shu xatoni qaytaradi.
        // Shuning uchun bu tekshiruv consumeAgentStream()dan oldin turadi.
        if (res.status === 400) {
          const data = await res.json().catch(() => ({}));
          if (data.error === "typed_confirmation_mismatch") {
            // Not consumed on the backend — caller (danger card) shows an
            // inline error and lets the user retry typing.
            return false;
          }
          addMessage(data.error || "Confirm failed.", "bot");
          return true;
        }
        if (res.status === 403 || res.status === 404) {
          const data = await res.json().catch(() => ({}));
          addMessage(data.error || "Confirm failed.", "bot");
          return true;
        }

        // Muvaffaqiyatli confirm endi SSE stream — /chat bilan bir xil
        // "thinking / action / step_result / final" event ketma-ketligini
        // qaytaradi, chunki backend shu yerdan run_agent_loop'ni davom
        // ettiradi. Shuning uchun bir marta ishlab, to'xtab qolish o'rniga
        // agent qolgan rejasini (keyingi zona-2/3 amalgacha) o'zi bajaradi.
        const panel = createThoughtPanel();
        await consumeAgentStream(res, panel);
        return true;
      } catch (err) {
        addMessage("The confirm request failed.", "bot");
        return false;
      }
    }

    // Parses one or more "data: {...}\n\n" SSE frames out of a raw text
    // buffer, returning the parsed events plus whatever partial frame is
    // still incomplete (to be prepended to the next chunk).
    function parseSseChunk(buffer) {
      const events = [];
      const parts = buffer.split("\n\n");
      const remainder = parts.pop(); // last part may be incomplete
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          events.push(JSON.parse(jsonStr));
        } catch (e) {
          console.error("Bad SSE frame:", jsonStr, e);
        }
      }
      return { events, remainder };
    }

    async function sendMessage() {
      if (!API_BASE) return;
      const message = input.value.trim();
      if (!message) return;

      const active = getActiveChat();
      const category = (active && active.category) || "general";
      const filename = (active && active.filename) || "chat";
      const tier = document.getElementById("tier").value || "high";
      const mode = document.getElementById("mode").value || "general";

      addMessage(message, "user");
      setEmptyState(false);
      input.value = "";
      autoResizeInput();
      sendBtn.disabled = true;

      const panel = createThoughtPanel(message);

      try {
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ message, category, filename, tier, mode })
        });

        if (res.status === 401) {
          panel.remove();
          await handleAuthFailure(res);
          return;
        }
        markActive();

        await consumeAgentStream(res, panel, message);
      } catch (err) {
        panel.remove();
        addMessage("Couldn't reach the backend.\nIs the tunnel up?", "bot");
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // ---- composer textarea auto-grow (1 line -> up to ~200px, then scrolls) ----
    function autoResizeInput() {
      input.style.height = "auto";
      const h = Math.max(input.scrollHeight, 24);
      input.style.height = Math.min(h, 200) + "px";
    }
    input.addEventListener("input", autoResizeInput);
    requestAnimationFrame(autoResizeInput);

    // ---- "+" attach button: no upload endpoint on the backend yet, so
    // this is an honest stub for now instead of a fake working button.
    const attachBtn = document.getElementById("attach-btn");
    attachBtn?.addEventListener("click", () => {
      alert("File upload isn't wired up on the backend yet — this button is a placeholder for a future version.");
    });

    // On load: if localStorage has a saved session, jump straight into the
    // chat screen — no separate "verify on boot" ping needed, because
    // showApp() immediately calls loadChats(), which is itself an
    // authenticated GET /chats request. If the saved credentials are stale
    // (PASS was rotated via mragent-set-pass, or PASS is fine but the
    // session simply timed out) that first request comes back 401 and
    // loadChats() calls handleAuthFailure() right away — so a bad login is
    // always caught on the very first real network round-trip, never
    // silently trusted. On TOP of that, we also fail fast client-side
    // before even touching the network: if MRagent_last_active shows more
    // than SESSION_TTL_MS has passed since the last authenticated request
    // (or there's no session_id saved at all — e.g. an older version of
    // this page, or a logout that never fully completed), we go straight
    // to the login screen instead of wasting a round-trip on credentials
    // we already know are dead.
    async function tryAutoLogin() {
      const savedPass = localStorage.getItem("MRagent_pass");
      const savedSession = localStorage.getItem("MRagent_session");
      if (!savedPass || !savedSession || !API_BASE) {
        showLogin();
        return;
      }
      if (isSessionStale()) {
        doLogout("You were away for more than a day — please sign in again.");
        return;
      }
      LOGIN_PASS = savedPass;
      SESSION_ID = savedSession;
      markActive();
      startInactivityWatcher();
      await showApp();
    }

    (async () => {
      // Tunnel URL HECH QACHON keshlanmaydi — har boot'da to'g'ridan-to'g'ri
      // Firestore'dan o'qiladi. Cloudflared quick tunnel har restart'da
      // yangi random subdomen beradi, shuning uchun eski keshdagi URL bilan
      // urinish har doim DNS xatosiga olib kelishi mumkin (ERR_NAME_NOT_RESOLVED).
      // Parol/token bundan mustasno — ular sessiyalar orasida o'zgarmaydi,
      // shuning uchun localStorage'da qolaveradi (auto-login tezligi uchun).
      await loadTunnelUrl();
      await tryAutoLogin();
    })();
