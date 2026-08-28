/* =====================================================================
   sidebar.js — Claude.ai-uslubidagi ochilib-yopiladigan sidebar: pin,
   hover-preview, mobile tap-toggle, header-menu-btn joylashuvi.
   script.js'dan ko'chirildi: setSidebarPinned (215), toggleSidebarPin
   (228), showSidebarPreview (232), hideSidebarPreview (244),
   cancelSidebarCloseTimer (263), scheduleSidebarClose (266),
   closeSidebarOnMobile (403), positionHeaderMenuBtn (334),
   trackHeaderMenuBtnDuringTransition (373), shuningdek isMobileLayout
   (185) va isTouchDevice (189) — bular sidebar/mobile aniqlash uchun
   shu yerga qo'shildi, chunki faqat shu modul ichida ishlatiladi.

   MUHIM: bu fayl modul yuklanganda o'zini avtomatik ishga tushiradi
   (asl script.js'dagi kabi — addEventListener chaqiruvlari va
   setSidebarPinned(false) darhol bajariladi module top-level'da).
   ===================================================================== */

const sidebarEl = document.getElementById("sidebar");
const headerMenuBtn = document.getElementById("header-menu-btn");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
// MUHIM: sidebar pinned bo'lganda header-menu-btn shu elementning CHAP
// tomonidan joy talab qiladi (pastda positionHeaderMenuBtn() marginLeft
// beradi) — shuning uchun endi "chat-title" span emas, uni o'rab turgan
// "chat-title-btn" tugmasi olinadi (chevron header'ga qo'shilgach, span
// endi shu tugma ICHIDA joylashgan; agar faqat span'ga margin berilsa,
// tugmaning o'zi joyida qolib, chevron hamon fixed icon ostida qolib
// ketardi). Eski versiya bilan orqaga moslik uchun tugma topilmasa
// span'ning o'ziga tushadi.
const headerTitleEl = document.getElementById("chat-title-btn") || document.getElementById("chat-title");

export function isMobileLayout() { return window.innerWidth < 768; }
// Sichqoncha/trackpad bilan hover qila oladigan qurilmami, yoki
// faqat touch (barmoq bilan bosish) qurilmami — shunga qarab
// sidebar ochilish usuli farqlanadi.
export function isTouchDevice() { return window.matchMedia("(hover: none), (pointer: coarse)").matches; }

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

export function setSidebarPinned(pinned) {
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
export function toggleSidebarPin() {
  setSidebarPinned(!sidebarEl.classList.contains("pinned"));
}

export function showSidebarPreview() {
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
export function hideSidebarPreview() {
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
export function cancelSidebarCloseTimer() {
  if (sidebarCloseTimer) { clearTimeout(sidebarCloseTimer); sidebarCloseTimer = null; }
}
export function scheduleSidebarClose() {
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
// Yechim: pinned bo'lganda icon `position: fixed`ga o'tkaziladi.
const HEADER_BTN_SIZE = 32;
const HEADER_BTN_MARGIN = 8;

export function positionHeaderMenuBtn() {
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
export function trackHeaderMenuBtnDuringTransition() {
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
export function closeSidebarOnMobile() {
  if (isMobileLayout()) setSidebarPinned(false);
}

// ---- KUTILMAGAN NARSA #3: yashirin easter egg. Pastdagi footer logo
// (#footer-logo) 5 marta, 2.5 soniya ichida bosilsa — logo bir marta
// sokin aylanadi va yonida bir zumga kichik yozuv chiqib, o'zi so'nadi.
// Baqiriq/konfetti emas: umumiy ilova ohangiga ("shoshmasdan, silliq,
// juda hazil emas") mos, faqat izlaganlar topadigan darajada past
// ovozli kichik syurpriz. ----
const _EASTER_EGG_CLICKS_NEEDED = 5;
const _EASTER_EGG_WINDOW_MS = 2500;
const _EASTER_EGG_MESSAGES = [
  "You found this.",
  "Curious, huh?",
  "Nothing else here — just this.",
];
(function armFooterLogoEasterEgg() {
  const wrap = document.getElementById("footer-logo-wrap");
  const logo = document.getElementById("footer-logo");
  if (!wrap || !logo) return;

  let clickCount = 0;
  let windowTimer = null;
  let lastMsgIdx = -1;

  function resetWindow() {
    clickCount = 0;
    if (windowTimer) { clearTimeout(windowTimer); windowTimer = null; }
  }

  logo.addEventListener("click", (e) => {
    e.stopPropagation(); // sidebar-item'ning o'z click handleri (agar bo'lsa) bilan aralashmasin
    clickCount += 1;
    if (windowTimer) clearTimeout(windowTimer);
    windowTimer = setTimeout(resetWindow, _EASTER_EGG_WINDOW_MS);

    if (clickCount < _EASTER_EGG_CLICKS_NEEDED) return;
    resetWindow();

    // Bir marta sokin aylanish — takroriy bosishlarda ham xavfsiz
    // (klass olib tashlanib, reflow orqali qayta qo'shiladi).
    logo.classList.remove("logo-easter-spin");
    void logo.offsetWidth; // reflow — animatsiyani qayta boshlash uchun
    logo.classList.add("logo-easter-spin");

    let idx = Math.floor(Math.random() * _EASTER_EGG_MESSAGES.length);
    if (_EASTER_EGG_MESSAGES.length > 1 && idx === lastMsgIdx) {
      idx = (idx + 1) % _EASTER_EGG_MESSAGES.length;
    }
    lastMsgIdx = idx;

    const note = document.createElement("span");
    note.className = "footer-logo-note";
    note.textContent = _EASTER_EGG_MESSAGES[idx];
    wrap.appendChild(note);
    requestAnimationFrame(() => note.classList.add("visible"));
    setTimeout(() => {
      note.classList.remove("visible");
      setTimeout(() => note.remove(), 320); // opacity transition tugashini kutamiz
    }, 1800);
  });
})();
