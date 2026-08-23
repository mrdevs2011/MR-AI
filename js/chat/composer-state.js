/* =====================================================================
   composer-state.js — send-btn'ning IDLE/GENERATING holatini
   boshqaruvchi YAGONA joy (single source of truth).

   NEGA ALOHIDA FAYL: setComposerState() ham send-message.js'ga (tugma
   qayerda yaratilgan), ham job-polling.js'ga (job qачон tugashini
   biladigan joy) kerak. Agar shu funksiya to'g'ridan-to'g'ri
   send-message.js ICHIDA turganida, job-polling.js uni import qilishi
   kerak bo'lardi — lekin send-message.js O'ZI ALLAQACHON job-polling.js
   dan pollJob/cancelCurrentJob import qiladi. Natija: A→B, B→A —
   circular import. Bu funksiyani uchinchi, mustaqil faylga chiqarish
   bilan ikkalasi ham faqat SHU faylga bog'liq bo'ladi, bir-biriga emas.
   ===================================================================== */

const sendBtn = document.getElementById("send");

const SEND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const STOP_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;

// "idle" — hech narsa yubormayapmiz, tugma strelka, bosilsa sendMessage()
//   chaqiriladi (send-message.js'dagi click listener shuni hal qiladi).
// "generating" — job backend'da davom etyapti, tugma kvadrat (stop),
//   bosilsa cancelCurrentJob() chaqiriladi. MUHIM: bu holatda tugma
//   DISABLED BO'LMAYDI — eski koddagi kabi kulrang qilib bosilmas holga
//   keltirilmaydi, aynan shu payt foydalanuvchiga stop bosish imkoniyati
//   kerak bo'ladi.
export function setComposerState(state) {
  sendBtn.dataset.state = state;
  sendBtn.innerHTML = state === "generating" ? STOP_ICON : SEND_ICON;
  sendBtn.title = state === "generating" ? "Stop" : "Send";
}
