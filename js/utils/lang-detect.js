/* =====================================================================
   lang-detect.js — foydalanuvchi xabaridan til aniqlash (uz/ru/en).
   script.js'dan ko'chirildi: _detectLangJs (qator 1692).

   Bu — original faylda topilgan eng "toza" funksiyalardan biri: hech
   qanday tashqi closure'ga bog'liq emas, faqat o'z parametri (text)
   bilan ishlaydi. Hech narsa o'zgartirilmadi, faqat `export` qo'shildi.
   ===================================================================== */

export function _detectLangJs(text) {
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
