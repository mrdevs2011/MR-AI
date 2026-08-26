/* =====================================================================
   voice/wakeword-audio.js — "bratan" wake-word aniqlangach chalinadigan
   tasdiqlash (ack) ovozini ijro etadi. Statik /assets/audio/ faylni
   Audio() bilan chaladi — hech qanday backend so'rov yo'q (audio/tts.js
   dan farqi shu: tts.js ElevenLabs'dan dinamik generatsiya qiladi,
   bu yerda esa oldindan yozib qo'yilgan bitta fayl bor xolos).

   MUHIM (achiq haqiqat): brauzer autoplay siyosati birinchi Audio.play()
   chaqiruvi foydalanuvchi interaction'idan (klik, tugma bosish va h.k.)
   keyin bo'lishini talab qiladi. Bu yerda muammo emas, chunki bu funksiya
   faqat auth muvaffaqiyatli bo'lgach (login tugmasi bosilgach) ishga
   tushadigan wake-word listener orqali chaqiriladi — demak interaction
   allaqachon bo'lgan bo'ladi.
   ===================================================================== */

let currentAckAudio = null;

/**
 * "Ha janob, eshityapman" ack ovozini chaladi.
 * Agar oldingi ijro hali tugamagan bo'lsa (masalan "bratan" ketma-ket
 * tez aytilsa), oldingisini to'xtatib, yangisini boshidan boshlaydi —
 * overlap (bir necha ovoz bir vaqtda ustma-ust chalinishi) bo'lmasin deb.
 */
/**
 * "Ha janob, eshityapman" ack ovozini chaladi. Promise audio TABIIY
 * tugaganda (yoki xato bo'lsa, darhol) resolve bo'ladi — chaqiruvchi
 * tomon (wakeword.js) shu Promise'ni kutib, keyin dictation
 * recognizer'ni yoqadi. Buning sababi: agar mikrofon ack ovoz hali
 * chiqayotganda tinglashni boshlasa, o'z karnayidan chiqqan tovushni
 * "buyruq" deb eshitib qolishi mumkin (feedback loop).
 * Agar oldingi ijro hali tugamagan bo'lsa (masalan "bratan" ketma-ket
 * tez aytilsa), oldingisini to'xtatib, yangisini boshidan boshlaydi —
 * overlap (bir necha ovoz bir vaqtda ustma-ust chalinishi) bo'lmasin deb.
 */
export function playAckSound() {
  return new Promise((resolve) => {
    try {
      if (currentAckAudio) {
        currentAckAudio.pause();
        currentAckAudio.currentTime = 0;
      }
      currentAckAudio = new Audio("/assets/audio/ack-ha-janob.mp3");
      currentAckAudio.onended = () => resolve();
      currentAckAudio.onerror = () => resolve();
      currentAckAudio.play().catch((err) => {
        // Fayl topilmasa yoki brauzer autoplay'ni bloklasa — ilovani
        // buzmaymiz, faqat ogohlantiramiz va darhol resolve qilamiz
        // (dictation recognizer'ni abadiy kutib turmasin).
        console.warn("Wake-word ack ovozini chalib bo'lmadi:", err);
        resolve();
      });
    } catch (err) {
      console.warn("Wake-word ack ovozini chalib bo'lmadi:", err);
      resolve();
    }
  });
}
