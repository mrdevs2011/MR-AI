/* =====================================================================
   voice/wakeword.js — "Hey Agent" wake-word listener. Brauzerning ichki
   Web Speech API'si (webkitSpeechRecognition) orqali uzluksiz tinglaydi,
   transkriptda "hey agent" frazasini topsa, wakeword-audio.js dagi
   playAckSound() ni chaqiradi.

   QACHON start/stop qilinishi kerak:
   - startWakeWordListener() — auth true bo'lgach (main.js showApp()
     ichida) chaqiriladi.
   - stopWakeWordListener() — logout bo'lganda (auth/session.js
     doLogout() ichida) chaqiriladi. Mikrofon auth false holatda
     ASLO tinglamasligi kerak.

   MUHIM (achiq haqiqat — bu offline EMAS): webkitSpeechRecognition
   ovozni brauzer vendor serveriga (Chrome bo'lsa — Google) yuborib,
   o'sha yerda transkripsiya qilinadi va natija qaytariladi. Ya'ni har bir
   gapiring narsa tarmoq orqali uchinchi tomonga ketadi. Bu hozircha eng
   tez/oddiy yechim, lekin 100% maxfiy emasligini bilib qo'y.
   ===================================================================== */

import { playAckSound } from "./wakeword-audio.js";

const WAKE_WORD_RE = /\bhey,?\s+agent\b/i;

let recognition = null;
let active = false; // true bo'lsa, onend kelganda avtomatik qayta boshlaymiz

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function createRecognition() {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  // "Hey Agent" — INGLIZCHA fraza, shuning uchun lang ham en-US bo'lishi
  // SHART. uz-UZ qoldirilsa, brauzer inglizcha so'zlarni fonetik jihatdan
  // noto'g'ri transkripsiya qilishi mumkin (masalan kirill harflar bilan
  // yoki umuman boshqa so'z sifatida) — bu wake-word'ni ishlamay qo'yadi.
  rec.lang = "en-US";

  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const transcript = result[0]?.transcript?.toLowerCase() ?? "";
      if (WAKE_WORD_RE.test(transcript)) {
        playAckSound();
      }
    }
  };

  rec.onerror = (event) => {
    console.warn("Wake-word recognition xatosi:", event.error);
    if (event.error === "not-allowed") {
      // Mikrofonga ruxsat berilmagan — qayta-qayta urinib, konsolni
      // spam qilishning hech qanday foydasi yo'q, shuning uchun to'xtatamiz.
      active = false;
    }
  };

  rec.onend = () => {
    // Brauzer recognition'ni vaqti-vaqti bilan o'zi to'xtatib qo'yadi
    // (masalan uzoq jimlikdan keyin) — agar hali "active" bo'lsak,
    // buni kompensatsiya qilib qayta ishga tushiramiz.
    if (active) {
      try {
        rec.start();
      } catch (_) {
        // "already started" kabi holatlarni jim yutamiz
      }
    }
  };

  return rec;
}

/**
 * Wake-word tinglashni boshlaydi. Bir nechta marta chaqirilsa ham
 * xavfsiz — singleton recognition instance, avval to'xtatib, keyin
 * qayta boshlaydi.
 */
export function startWakeWordListener() {
  if (!getSpeechRecognitionCtor()) {
    console.warn(
      "Wake-word: bu brauzerda SpeechRecognition/webkitSpeechRecognition yo'q (masalan Firefox) — feature o'chirilgan holda qoladi."
    );
    return;
  }

  if (recognition && active) {
    // Allaqachon ishlayapti — qayta boshlash shart emas.
    return;
  }

  if (recognition) {
    try {
      recognition.stop();
    } catch (_) {}
  }

  recognition = createRecognition();
  if (!recognition) return;

  active = true;
  try {
    recognition.start();
  } catch (err) {
    console.warn("Wake-word listener ishga tushmadi:", err);
  }
}

/**
 * Wake-word tinglashni to'xtatadi (masalan logout'da). Hali umuman
 * boshlanmagan bo'lsa ham xato bermaydi.
 */
export function stopWakeWordListener() {
  active = false;
  if (!recognition) return;
  try {
    recognition.stop();
  } catch (_) {
    // hali boshlanmagan yoki allaqachon to'xtagan bo'lishi mumkin — jim
  }
}
