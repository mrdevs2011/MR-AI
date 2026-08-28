/* =====================================================================
   store.js — yagona source of truth global holat uchun. script.js'dan
   ko'chirildi: API_BASE (qator 18), SESSION_ID (qator 20), activeChatId
   (qator 631, roadmap'da "activeChat" deb qisqartirilgan nom bilan
   eslatilgan).

   Boshqa hech qaysi modul o'z ichida bu uch narsaning nusxasini
   saqlamasin — hammasi shu yerdan import qilsin.

   MUHIM (achiq haqiqat — roadmap aytmagan, lekin bilishing SHART):
   ES modullarda `export let x` — BOSHQA modul uni import qilib O'QIY
   oladi (live binding, qiymat yangilansa ko'radi), lekin TASHQARIDAN
   qayta yozolmaydi:

     // boshqa faylda:
     import { SESSION_ID } from '../state/store.js';
     SESSION_ID = "123";  // <-- SyntaxError: Assignment to constant/import binding

   Shuning uchun har biriga alohida setter funksiya qo'shdim. Step 7'da
   `session.js`, `login.js` va h.k. SESSION_ID'ni to'g'ridan-to'g'ri
   `SESSION_ID = ...` deb yozgan joylarning barchasini
   `setSessionId(...)` chaqiruviga almashtirishga to'g'ri keladi —
   bu "qayta yozish" emas, faqat modul chegarasi talab qiladigan
   texnik moslashuv. O'sha joyga yetganimda alohida ogohlantiraman.

   TUZATISH (Step 7'da topildi): Step 6 roadmap `LOGIN_PASS`ni
   sanamagan edi, lekin u xuddi SESSION_ID kabi global auth state —
   authHeaders(), showLogin(), submitOtp(), tryAutoLogin() barchasi
   shu o'zgaruvchiga tayanadi. script.js'da qator 19'da turadi.
   Shu yerga qo'shildi, chunki qoida aniq: "boshqa hech qaysi modul
   o'z ichida global state saqlamasin, hammasi shu yerdan import
   qilsin" — LOGIN_PASS ham shu qoidaga bo'ysunadi.

   FIRESTORE OLIB TASHLANDI: ilgari API_BASE Firestore'dagi
   config/tunnel hujjatidan boot vaqtida o'qilardi, chunki tunnel
   (cloudflared quick tunnel) har restart'da yangi random URL berardi.
   Endi backend ngrok'ning RESERVED/STATIC domenida ishlaydi
   (start.sh'dagi NGROK_DOMAIN) — bu domen hech qachon o'zgarmaydi,
   shuning uchun sync mexanizmi umuman keraksiz edi. API_BASE endi
   shu yerda to'g'ridan-to'g'ri hardcode qilingan.
   ===================================================================== */

export const TUNNEL_URL = "https://satisfy-endurance-mooned.ngrok-free.dev";

export let API_BASE = TUNNEL_URL;
export let SESSION_ID = "";
export let activeChatId = null;
export let LOGIN_PASS = "";

export function setApiBase(value) { API_BASE = value; }
export function setSessionId(value) { SESSION_ID = value; }
export function setActiveChatId(value) { activeChatId = value; }
export function setLoginPass(value) { LOGIN_PASS = value; }
