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
    let AUTH_TOKEN = "";
    // Eski usul: token Firestore'dan avtomatik olinardi. Endi backend
    // (main.py) endi TOKEN'ni Firestore'ga yozmaydi — xavfsizlik uchun,
    // PASS bilmagan odam ham Firestore'dan o'qiy olmasin deb. Shuning
    // uchun endi login formasi PASS bilan birga TOKEN'ni ham qo'lda
    // so'raydi.

    const bootScreen = document.getElementById("boot-screen");
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    const loginForm = document.getElementById("login-form");
    const loginPass = document.getElementById("login-pass");
    const loginToken = document.getElementById("login-token");
    const loginError = document.getElementById("login-error");
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

    function setSidebarCollapsed(collapsed) {
      sidebarEl.classList.toggle("collapsed", collapsed);
      sidebarBackdrop.classList.toggle("hidden", collapsed || !isMobileLayout());
    }
    function toggleSidebar() {
      setSidebarCollapsed(!sidebarEl.classList.contains("collapsed"));
    }

    headerMenuBtn?.addEventListener("click", toggleSidebar);
    sidebarBackdrop?.addEventListener("click", () => setSidebarCollapsed(true));

    // Mobile boshlanishida sidebar yopiq (slide-over), desktopda ochiq.
    setSidebarCollapsed(isMobileLayout());
    // Ekran kengligi o'zgarsa (masalan, tablet burilganda) backdrop
    // holatini shunga moslab qayta hisoblaymiz.
    window.addEventListener("resize", () => {
      if (!isMobileLayout()) sidebarBackdrop.classList.add("hidden");
    });
    // Mobil rejimda: chatga kirilganda (yangi chat yoki mavjud chat
    // tanlanganda) sidebar avtomatik yopilsin — foydalanuvchi ChatGPT/
    // Claude ilovalaridagidek to'g'ridan-to'g'ri suhbatga tushadi.
    function closeSidebarOnMobile() {
      if (isMobileLayout()) setSidebarCollapsed(true);
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
        SUDO MODE YOQIQ — hard block yo'q, faqat confirmation card himoyalaydi. Xavfli komandalarni ham confirm bossang, bajariladi.
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
                <option value="high">Smart</option>
                <option value="medium" selected>Fast</option>
                <option value="low">Turbo</option>
              </select>
              <button type="button" id="combo-btn" class="combo-btn" title="Mode & speed">
                <span class="pill-dot" id="mode-dot"></span>
                <span id="combo-label">General Fast</span>
                <svg class="combo-caret" width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div id="combo-dropdown" class="combo-dropdown hidden"></div>
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

    const MODE_OPTS = [
      { value: "general", label: "General" },
      { value: "sudo", label: "Sudo" },
    ];
    const TIER_OPTS = [
      { value: "high", label: "Smart" },
      { value: "medium", label: "Fast" },
      { value: "low", label: "Turbo" },
    ];

    function updateComboActiveState() {
      comboDropdown.querySelectorAll(".combo-item").forEach(btn => {
        btn.classList.toggle(
          "active",
          btn.dataset.mode === modeSelect.value && btn.dataset.tier === tierSelect.value
        );
      });
    }

    function updateComboLabel() {
      const m = MODE_OPTS.find(x => x.value === modeSelect.value);
      const t = TIER_OPTS.find(x => x.value === tierSelect.value);
      comboLabel.textContent = [m && m.label, t && t.label].filter(Boolean).join(" ");
      updateComboActiveState();
    }

    function selectCombo(modeValue, tierValue) {
      modeSelect.value = modeValue;
      tierSelect.value = tierValue;
      updateSudoBanner();
      updateModeDot();
      updateTierDot();
      updateComboLabel();
      closeComboDropdown();
    }

    function buildComboDropdown() {
      comboDropdown.innerHTML = "";
      MODE_OPTS.forEach((m, mi) => {
        if (mi > 0) {
          const divider = document.createElement("div");
          divider.className = "combo-group-divider";
          comboDropdown.appendChild(divider);
        }
        const label = document.createElement("div");
        label.className = "combo-group-label";
        label.textContent = m.label;
        comboDropdown.appendChild(label);
        TIER_OPTS.forEach(t => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "combo-item";
          btn.dataset.mode = m.value;
          btn.dataset.tier = t.value;
          btn.innerHTML = `<span class="combo-item-dot" style="background:${MODE_COLORS[m.value]}"></span>${t.label}`;
          btn.addEventListener("click", () => selectCombo(m.value, t.value));
          comboDropdown.appendChild(btn);
        });
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
          headers: { "X-Auth-Token": AUTH_TOKEN, "X-Login-Pass": LOGIN_PASS },
        });
        if (res.status === 401) {
          forceLogoutInvalidToken();
          return;
        }
        if (!res.ok) throw new Error("bad status " + res.status);
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
          headers: { "X-Auth-Token": AUTH_TOKEN, "X-Login-Pass": LOGIN_PASS },
        });
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
    // the tunnel, gated by the same password + auth token.
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
        fontFamily: "'SF Mono', Menlo, Consolas, monospace",
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
      // so auth travels as query params here instead of the X-Auth-Token /
      // X-Login-Pass headers the rest of the app uses.
      const wsBase = API_BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
      const wsUrl = `${wsBase}/ws/term?token=${encodeURIComponent(AUTH_TOKEN)}&pass=${encodeURIComponent(LOGIN_PASS)}`;
      const socket = new WebSocket(wsUrl);
      termSocket = socket;

      socket.addEventListener("open", () => {
        setTermStatus("connected", "#3fb950");
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

    function showLogin(errorMsg) {
      bootScreen.classList.add("hidden");
      appScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      LOGIN_PASS = "";
      AUTH_TOKEN = "";
      localStorage.removeItem("MRagent_pass");
      localStorage.removeItem("MRagent_token");
      loginBtn.disabled = false;
      loginBtn.textContent = "Continue";
      if (errorMsg) {
        loginError.textContent = errorMsg;
        loginError.classList.remove("hidden");
      } else {
        loginError.classList.add("hidden");
      }
      loginPass.value = "";
      loginToken.value = "";
      loginPass.focus();
    }

    // Backend token'ni qayta yaratgan/o'zgartirgan bo'lsa (mragent-auth-token),
    // saqlangan eski token endi noto'g'ri hisoblanadi. Har qanday /chat,
    // /confirm yoki /chats so'rovi 401 qaytarsa, shu funksiya darhol
    // chaqiriladi — login ekraniga qaytaradi va eski token/parolni tozalaydi.
    function forceLogoutInvalidToken() {
      showLogin("Token o'zgargan — qaytadan kirishing.");
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
      btn.textContent = "Qayta urinib ko'rish";
      btn.className = "w-full text-[13px] text-[#ececec] bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-xl py-2 mt-2 transition";
      btn.addEventListener("click", () => {
        btn.remove();
        loadTunnelUrl();
      });
      loginTunnelStatus.insertAdjacentElement("afterend", btn);
    }

    // No dedicated endpoint exists just to check credentials, so we ping
    // /chat with a harmless sentinel message and read the status code.
    // This never triggers a real action, it only confirms auth.
    async function verifyToken(pass, token) {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": token,
          "X-Login-Pass": pass
        },
        body: JSON.stringify({ message: "__mragent_auth_check__", category: "_auth", filename: "check" })
      });
      return res.status !== 401;
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!API_BASE) {
        loginError.textContent = "Tunnel not found yet, wait a moment and try again.";
        loginError.classList.remove("hidden");
        return;
      }
      const pass = loginPass.value.trim();
      const token = loginToken.value.trim();
      if (!pass || !token) {
        loginError.textContent = "Password and auth token are both required.";
        loginError.classList.remove("hidden");
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = "Checking...";
      loginError.classList.add("hidden");

      try {
        const ok = await verifyToken(pass, token);
        if (ok) {
          LOGIN_PASS = pass;
          AUTH_TOKEN = token;
          localStorage.setItem("MRagent_pass", LOGIN_PASS);
          localStorage.setItem("MRagent_token", AUTH_TOKEN);
          await showApp();
        } else {
          showLogin("Wrong password or token.");
        }
      } catch (err) {
        showLogin("Couldn't reach the backend. Is the tunnel up?");
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Continue";
      }
    });

    logoutBtn.addEventListener("click", () => {
      teardownTerminal();
      closeTerminal();
      showLogin();
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
    function addIOCard(inputText, outputText, persist = true) {
      const div = document.createElement("div");
      div.className = "flex justify-start w-full";
      const out = (outputText && outputText.trim()) ? outputText : "(no output)";
      const isErr = /\[Exit code: [1-9]/.test(out) || /^Execution error:/.test(out) || /^Command timed out/.test(out);
      div.innerHTML = `
        <div class="max-w-full w-full io-card">
          <div class="io-section">
            <div class="io-header">Input</div>
            <pre class="io-content">${escapeHtml(inputText || "")}</pre>
          </div>
          <div class="io-section">
            <div class="io-header">Output</div>
            <pre class="io-content${isErr ? " io-output-err" : ""}">${escapeHtml(out)}</pre>
          </div>
        </div>`;
      chat.appendChild(div);
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

    const ACTION_LABELS = {
      command: "command",
      read_file: "read",
      write_file: "write",
      list_dir: "folder",
      web_search: "search"
    };

    const ACTION_VERBS = {
      command: "Running command",
      read_file: "Reading file",
      write_file: "Writing file",
      list_dir: "Listing folder",
      web_search: "Searching the web"
    };

    // -----------------------------------------------------------------
    // LIVE THOUGHT-PROCESS PANEL
    // Backend streams real Server-Sent Events for every step of its
    // agent loop: "thinking" while the model is deciding, "action" once
    // it picked something, "step_result" once that action finished. This
    // renders that live, instead of a fake spinner — every line reflects
    // something that is actually happening on the backend right now.
    // -----------------------------------------------------------------
    function createThoughtPanel() {
      const wrapper = document.createElement("div");
      wrapper.className = "flex justify-start w-full";
      wrapper.innerHTML = `
        <div class="max-w-full w-full rounded-2xl px-4 py-3" style="background:#262626;">
          <div class="thought-log" id="thought-log"></div>
          <div class="thinking-row" id="thinking-row">
            <video class="thinking-orb-video" src="circle2_transparent.webm" autoplay loop muted playsinline></video>
            <span id="thinking-label">Thinking</span>
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

    function addStepsTrail(steps) {
      if (!steps || !steps.length) return;
      const div = document.createElement("div");
      div.className = "flex justify-start w-full";
      const items = steps.map(s => {
        const label = ACTION_LABELS[s.action] || s.action;
        const target = s.command || s.path || s.query || "";
        const result = (s.result || "").slice(0, 400);
        return `
          <details class="text-[13px] text-[#a8a8a8]">
            <summary class="cursor-pointer select-none py-1 hover:text-[#ececec]">${label} — ${escapeHtml(target)}</summary>
            <pre class="whitespace-pre-wrap font-mono text-[12px] text-[#8e8e8e] pl-4 pb-2">${escapeHtml(result)}</pre>
          </details>`;
      }).join("");
      div.innerHTML = `<div class="max-w-full w-full rounded-2xl px-4 py-2" style="background:#262626;">${items}</div>`;
      chat.appendChild(div);
      chatScroll.scrollTop = chatScroll.scrollHeight;
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
        e.target.textContent = "yuborilmoqda...";
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
            XAVFLI, QAYTARIB BO'LMAYDIGAN KOMANDA
          </div>
          <div class="text-[13px] font-mono px-2 py-1.5 rounded" style="background:#1a0d0d; color:#ffb4b4; white-space:pre-wrap; word-break:break-all;">${escapeHtml(commandText)}</div>
          <div class="text-[12px]" style="color:#e8a0a0;">Tasdiqlash uchun komandani XATOSIZ qayta yoz:</div>
          <input type="text" class="danger-typed w-full bg-transparent border rounded px-2 py-1.5 text-[13px] font-mono focus:outline-none" style="border-color:#5c1f1f; color:#ffb4b4;" placeholder="${escapeHtml(commandText)}" autocomplete="off" spellcheck="false" />
          <div class="danger-error text-[12px] hidden" style="color:#ff6b6b;">Mos kelmadi yoki noto'g'ri — qaytadan urin.</div>
          <button class="danger-btn w-full bg-red-800 text-[13px] px-4 py-2 rounded-full transition opacity-40 cursor-not-allowed" disabled>
            Tasdiqlab bajarish
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
          btn.textContent = "Tasdiqlab bajarish";
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

    async function confirmCommand(commandId, typedConfirmation) {
      try {
        const body = { command_id: commandId };
        if (typedConfirmation !== undefined) body.typed_confirmation = typedConfirmation;
        const res = await fetch(`${API_BASE}/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": AUTH_TOKEN,
            "X-Login-Pass": LOGIN_PASS
          },
          body: JSON.stringify(body)
        });
        if (res.status === 401) {
          forceLogoutInvalidToken();
          return false;
        }
        const data = await res.json();
        if (res.status === 400 && data.error === "typed_confirmation_mismatch") {
          // Not consumed on the backend — caller (danger card) shows an
          // inline error and lets the user retry typing.
          return false;
        }
        if (data.error && !data.type) {
          addMessage(data.error, "bot");
          return true;
        }
        // Show exactly what ran (input) and exactly what came back
        // (output) as two separate boxes, instead of one prose bubble.
        if (data.type === "command") {
          addIOCard(data.command, data.result);
        } else if (data.type === "write_file") {
          addIOCard(`write_file: ${data.path}`, data.result);
        } else {
          addMessage(data.response || data.error || "No response", "bot");
        }
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

      const panel = createThoughtPanel();
      let sawAnyEvent = false;

      try {
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": AUTH_TOKEN,
            "X-Login-Pass": LOGIN_PASS
          },
          body: JSON.stringify({ message, category, filename, tier, mode })
        });

        if (res.status === 401) {
          panel.remove();
          forceLogoutInvalidToken();
          return;
        }

        // Non-streaming fallback (e.g. plain JSON error responses)
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          const data = await res.json();
          panel.remove();
          addMessage(data.response || data.error || "No response", "bot");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalSteps = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSseChunk(buffer);
          buffer = remainder;

          for (const evt of events) {
            sawAnyEvent = true;

            if (evt.type === "thinking") {
              panel.setLabel(
                evt.step > 1 ? `Thinking about the next step (${evt.step}/${evt.max_steps})` : "Thinking"
              );
            } else if (evt.type === "action") {
              const verb = ACTION_VERBS[evt.action] || "Working on it";
              panel.setLabel(`${verb}: ${evt.target}`);
            } else if (evt.type === "step_result") {
              const verb = ACTION_LABELS[evt.action] || evt.action;
              const target = evt.command || evt.path || evt.query || "";
              panel.commitLine(`${verb} — ${target}`);
            } else if (evt.type === "final") {
              finalSteps = evt.steps;
              panel.remove();

              if (evt.kind === "pending_confirmation") {
                addStepsTrail(evt.steps);
                addMessage(evt.response, "pending");
                if (evt.requires_typed_confirmation) {
                  addDangerConfirmCard(evt.command_id, evt.command);
                } else {
                  addConfirmButton(evt.command_id);
                }
              } else if (evt.kind === "blocked") {
                addStepsTrail(evt.steps);
                addMessage(evt.response, "pending");
              } else if (evt.kind === "error") {
                addStepsTrail(evt.steps);
                addMessage(evt.response, "error");
                if (evt.retryable) {
                  addRetryButton(message);
                }
              } else {
                addStepsTrail(evt.steps);
                await addMessageTyped(evt.response || "No response");
              }
            }
          }
        }

        if (!sawAnyEvent) {
          panel.remove();
          addMessage("No response from the backend.", "bot");
        }
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
      alert("Fayl yuklash hali backendda yo'q — bu tugma keyingi versiya uchun joyi tayyorlab qo'yildi.");
    });

    // On load: if localStorage has a saved token, jump straight into the
    // chat screen — no separate "verify on boot" ping needed, because
    // showApp() immediately calls loadChats(), which is itself an
    // authenticated GET /chats request. If the saved token is stale
    // (backend token was rotated via mragent-auth-token), that first
    // request comes back 401 and loadChats() calls forceLogoutInvalidToken()
    // right away — so an invalid token is caught on the very first
    // real network round-trip, not silently trusted.
    async function tryAutoLogin() {
      const savedPass = localStorage.getItem("MRagent_pass");
      const savedToken = localStorage.getItem("MRagent_token");
      if (!savedPass || !savedToken || !API_BASE) {
        showLogin();
        return;
      }
      LOGIN_PASS = savedPass;
      AUTH_TOKEN = savedToken;
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
