/* =====================================================================
   voice/wakeword.js — ko'p-so'zli wake-word listener ("bratan",
   "bratishka", "hey agent", "agent", "mragent"). Brauzerning ichki
   Web Speech API'si (webkitSpeechRecognition) orqali uzluksiz tinglaydi,
   transkriptda shu so'zlardan birini topsa, wakeword-audio.js dagi
   playAckSound() ni chaqiradi.

   MUHIM (achiq haqiqat — bu sen so'ragan narsaning real narxi):
   1) TIL MUAMMOSI: so'zlar aralash — "bratan"/"bratishka" o'zbekcha-
      ruscha, "agent"/"mragent"/"hey agent" inglizcha. Web Speech API
      BITTA tilni tinglaydi (rec.lang), ikkalasini bir vaqtda "native"
      aniq tanimaydi. en-US tanlandi (aksariyat trigger so'zlar
      inglizcha bo'lgani uchun) — demak "bratan"/"bratishka" ba'zan
      noto'g'ri transkript bo'lib, umuman aniqlanmasligi mumkin. Agar
      shu ikkisi tez-tez ishlamasa — bu kutilgan holat, uz-UZ'ga
      qaytarish variant, lekin o'shanda "agent" so'zlari yomonlashadi.
      Debug uchun har bir transkript console.debug bilan chiqadi — F12
      Console'ni ochib, aslida nima "eshitilgan"ini ko'rib, so'zlarni
      shunga moslab sozlash mumkin.
   2) FEEDBACK-LOOP XAVFI: "agent" — juda umumiy so'z, ustiga ilova
      nomi ham "MRagent". Agar TTS (audio/tts.js) javob berayotganda
      shu so'zni aytsa va mikrofon uni "eshitib qolsa" (dinamikdan
      chiqqan tovush qayta mikrofonga tushsa), wake-word o'zi-o'ziga
      trigger bo'lib ketishi mumkin — cheksiz loop emas (bitta ack
      chaladi, keyin jim), lekin kutilmagan joyda chaqirib qolishi
      mumkin. Agar bu muammo bo'lsa, "agent" ni yolg'iz so'z sifatida
      regexdan olib tashlash kerak bo'ladi (faqat "hey agent"/"mragent"
      qoldirilsa xavf kamayadi).
   3) OFFLINE EMAS: webkitSpeechRecognition ovozni brauzer vendor
      serveriga (Chrome bo'lsa — Google) yuborib, o'sha yerda
      transkripsiya qiladi. 100% maxfiy emas.
   ===================================================================== */

import { playAckSound } from "./wakeword-audio.js";

const WAKE_WORD_RE = /\b(bratan|bratishka|hey,?\s+agent|mragent|agent)\b/i;

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
      console.debug("Wake-word transkript:", transcript); // tuning uchun — kerak bo'lmasa o'chirib tashla
      if (WAKE_WORD_RE.test(transcript)) {
        playAckSound();
      }
    }
  };

  rec.onerror = (event) => {
    // Android Chrome'da "no-speech" 5-10 soniya jimlikdan keyin tez-tez
    // chiqadi — bu normal, onend keyin avtomatik qayta ishga tushadi.
    // Log qoldiryapmiz shunchaki, muammoni ko'rish uchun.
    console.warn("Wake-word recognition xatosi:", event.error);
    if (event.error === "not-allowed") {
      // Mikrofonga ruxsat berilmagan — qayta-qayta urinib, konsolni
      // spam qilishning hech qanday foydasi yo'q, shuning uchun to'xtatamiz.
      active = false;
    }
  };

  rec.onend = () => {
    // Brauzer recognition'ni vaqti-vaqti bilan o'zi to'xtatib qo'yadi
    // (masalan uzoq jimlikdan keyin, yoki Android Chrome'da "no-speech"
    // xatosidan keyin — bu mobil brauzerlarda ayniqsa tez-tez bo'ladi).
    // Agar hali "active" bo'lsak, buni kompensatsiya qilib qayta ishga
    // tushiramiz.
    //
    // MUHIM BUG FIX (achiq haqiqat): oldingi versiyada rec.start() shu
    // yerda DARHOL chaqirilardi. Android Chrome'da recognition obyekti
    // hali to'liq "yopilmagan" holatda bo'ladi (native tomonda), shuning
    // uchun darhol start() chaqirilsa "InvalidStateError" chiqadi — bu
    // xato try/catch bilan JIM yutilardi, demak listener butunlay
    // to'xtab qolardi, hech qanday console chiqishi ham bo'lmasdi (aynan
    // sen ko'rgan holat: hech narsa bo'lmayapti). Kichik kechikish (250ms)
    // bilan bu race condition oldini oladi.
    if (active) {
      setTimeout(() => {
        if (!active) return; // shu 250ms ichida stopWakeWordListener() chaqirilgan bo'lishi mumkin
        try {
          rec.start();
        } catch (err) {
          console.warn("Wake-word qayta ishga tushmadi (onend restart):", err);
        }
      }, 250);
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
