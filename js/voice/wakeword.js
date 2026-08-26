/* =====================================================================
   voice/wakeword.js — IKKI REJIMLI ovoz boshqaruvi:

   1) "wake" rejimi — doim fonda tinglaydi, faqat wake-word so'zlarni
      ("bratan", "bratishka", "hey agent", "agent", "mragent") qidiradi.
      Topilsa: ack ovoz chalinadi ("Hello sir"), "dictation" rejimiga
      o'tadi.
   2) "dictation" rejimi — endi HAMMA gapni tinglaydi va composer
      (#message) ichiga jonli yozib boradi. Foydalanuvchi 2.5 soniya
      jim tursa (SILENCE_MS), yig'ilgan matn avtomatik yuboriladi
      (window.sendMessage()) va listener yana "wake" rejimiga qaytadi.

   QACHON start/stop qilinishi kerak:
   - startWakeWordListener() — auth true bo'lgach (main.js showApp()
     ichida) "wake" rejimida boshlanadi.
   - stopWakeWordListener() — logout bo'lganda (auth/session.js
     doLogout() ichida) — qaysi rejimda bo'lishidan qat'iy nazar
     to'liq to'xtaydi.

   MUHIM (achiq haqiqat):
   1) TIL ALMASHINUVI: "wake" rejimida lang="en-US" (chunki asosiy
      trigger so'zlar inglizcha), "dictation" rejimida lang="uz-UZ"
      (chunki haqiqiy buyruqlar o'zbekcha kutiladi). Ikkala holatda ham
      recognition object QAYTA YARATILADI (lang start()dan OLDIN
      o'rnatilishi kerak, ishlab turgan instance'da o'zgartirib
      bo'lmaydi) — shuning uchun rejim almashinuvi bir zumlik "uzilish"
      bilan keladi (kod jihatidan muammo emas, lekin bilib qo'y).
   2) FEEDBACK-LOOP XAVFI: "agent" so'zi juda umumiy, ilova javob
      berayotganda TTS orqali shu so'zni aytsa, mikrofon uni eshitib
      qolib o'zi-o'ziga trigger bo'lishi mumkin.
   3) OFFLINE EMAS: webkitSpeechRecognition ovozni brauzer vendor
      serveriga yuboradi, 100% maxfiy emas.
   4) DICTATION AUTO-SEND: bu funksiya window.sendMessage() ni
      chaqiradi — bu main.js'da window ga yozilgan global bridge
      (send-message.js dagi haqiqiy funksiyaga ulangan). Agar u hali
      mavjud bo'lmasa (nazariy holat, chunki wake-word faqat
      showApp()dan keyin ishga tushadi, showApp() paytida esa
      main.js allaqachon to'liq yuklangan bo'ladi), jim hech narsa
      qilmaydi.
   ===================================================================== */

import { playAckSound } from "./wakeword-audio.js";

const WAKE_WORD_RE = /\b(bratan|bratishka|hey,?\s+agent|mragent|agent)\b/i;
const SILENCE_MS = 2500; // 2.5s jimlikdan keyin dictation avtomatik yuboriladi
const RESTART_DELAY_MS = 250; // Android Chrome onend/start race condition uchun

let recognition = null;
let active = false; // umumiy on/off — false bo'lsa hech qanday rejim ishlamaydi
let mode = "wake"; // "wake" | "dictation"
let dictationFinalText = "";
let silenceTimer = null;

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getComposerInput() {
  return document.getElementById("message");
}

// Composer'ga matn yozib, uning o'z "input" listenerlarini (auto-resize
// va h.k.) ham ishga tushiramiz — shu bilan composer boshqa hech narsa
// bilishi shart emas, u faqat oddiy foydalanuvchi yozayotganday ko'radi.
function setComposerText(text) {
  const input = getComposerInput();
  if (!input) return;
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

// Dictation paytida har bir yangi natija kelganda shu chaqiriladi —
// "hali gapiryapti" degani, taymerni boshidan boshlaydi.
function resetSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = setTimeout(finishDictationAndSend, SILENCE_MS);
}

// SILENCE_MS davomida yangi natija kelmasa — foydalanuvchi gapini
// tugatgan deb hisoblaymiz: composer'dagi matnni yuboramiz va "wake"
// rejimiga qaytamiz.
function finishDictationAndSend() {
  clearSilenceTimer();
  const finalText = dictationFinalText.trim();
  dictationFinalText = "";

  if (finalText) {
    setComposerText(finalText);
    // main.js'da window.sendMessage = sendMessage (send-message.js)
    // qilib bog'langan — xuddi foydalanuvchi Enter bosganidek ishlaydi.
    window.sendMessage?.();
  }

  if (active) startRecognizer("wake");
}

function createRecognition(kind) {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.continuous = true;

  if (kind === "wake") {
    rec.interimResults = false;
    // "Hey Agent"/"agent"/"mragent" inglizcha, shuning uchun en-US.
    rec.lang = "en-US";
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const transcript = result[0]?.transcript?.toLowerCase() ?? "";
        console.debug("Wake-word transkript:", transcript); // tuning uchun
        if (WAKE_WORD_RE.test(transcript)) {
          // Avval wake recognizer'ni DARHOL to'xtatamiz — ack ovoz
          // karnaydan chiqayotganda mikrofon hech narsani tinglamasin
          // (feedback-loop xavfi, yuqoridagi izohga qarang). Faqat ack
          // ovoz TABIIY tugagach (playAckSound() Promise'i resolve
          // bo'lgach) dictation recognizer'ni yoqamiz.
          mode = "ack"; // vaqtinchalik — hech qanday recognizer ishlamaydi
          try {
            rec.stop();
          } catch (_) {}
          playAckSound().then(() => {
            if (active) startRecognizer("dictation");
          });
          return; // shu tsikldan chiqamiz — recognition allaqachon to'xtatildi
        }
      }
    };
  } else {
    // "dictation" — endi haqiqiy buyruqni tinglaymiz, shuning uchun
    // interimResults YOQILGAN (composer'da jonli ko'rinsin) va til
    // o'zbekchaga o'tkazilgan.
    rec.interimResults = true;
    rec.lang = "uz-UZ";
    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          dictationFinalText += (dictationFinalText ? " " : "") + transcript.trim();
        } else {
          interimText += transcript;
        }
      }
      setComposerText((dictationFinalText + " " + interimText).trim());
      resetSilenceTimer(); // har bir yangi so'z — "hali gapiryapti" belgisi
    };
  }

  rec.onerror = (event) => {
    // Android Chrome'da "no-speech" jimlikdan keyin tez-tez chiqadi —
    // normal holat, onend keyin avtomatik qayta ishga tushadi.
    console.warn(`Wake-word recognition xatosi (${kind}):`, event.error);
    if (event.error === "not-allowed") {
      active = false;
      clearSilenceTimer();
    }
  };

  rec.onend = () => {
    // BUG FIX (achiq haqiqat, oldingi versiyada shu yerda edi): agar shu
    // `rec` instance endi global `recognition`'ga teng bo'lmasa — demak
    // u ESKIRGAN (startRecognizer() boshqa rejimga o'tib ketgan, masalan
    // wake -> dictation), va uni QAYTA ISHGA TUSHIRMASLIK kerak.
    // Avvalgi versiyada `rec.start()` shartsiz chaqirilardi — bu ESKI
    // recognizer'ni "zombi" holida tiriltirib, yangi (masalan dictation)
    // recognizer bilan BIR VAQTDA ishlab turishiga sabab bo'lardi. Ikkalasi
    // ham mikrofonni tinglagani uchun, ack ovoz karnaydan chiqqanda eski
    // (zombi) wake recognizer o'sha ovozdan "agent" so'ziga o'xshash narsa
    // eshitib, o'z-o'zidan yana playAckSound()ni chaqirardi — bu esa hali
    // tugamagan audio'ni pause+restart qilib, "hel-lo-s-s-si-s-r" kabi
    // bo'lib-bo'lib chiqadigan ovoz effektiga sabab bo'lgan.
    if (active && rec === recognition && mode === kind) {
      setTimeout(() => {
        if (!active || rec !== recognition || mode !== kind) return;
        try {
          rec.start();
        } catch (err) {
          console.warn(`Wake-word qayta ishga tushmadi (${kind}, onend restart):`, err);
        }
      }, RESTART_DELAY_MS);
    }
  };

  return rec;
}

// Recognition instance'ni to'xtatib, berilgan rejim (kind) uchun
// qaytadan yaratib, ishga tushiradi. Rejim almashinuvining o'zagi shu.
function startRecognizer(kind) {
  if (recognition) {
    try {
      recognition.stop();
    } catch (_) {}
  }

  mode = kind;
  if (kind === "wake") dictationFinalText = "";

  recognition = createRecognition(kind);
  if (!recognition) return;

  try {
    recognition.start();
  } catch (err) {
    console.warn(`Wake-word listener ishga tushmadi (${kind}):`, err);
  }
}

/**
 * Wake-word tinglashni boshlaydi ("wake" rejimidan). Bir nechta marta
 * chaqirilsa ham xavfsiz.
 */
export function startWakeWordListener() {
  if (!getSpeechRecognitionCtor()) {
    console.warn(
      "Wake-word: bu brauzerda SpeechRecognition/webkitSpeechRecognition yo'q (masalan Firefox) — feature o'chirilgan holda qoladi."
    );
    return;
  }

  if (recognition && active) return; // allaqachon ishlayapti

  active = true;
  startRecognizer("wake");
}

/**
 * Wake-word/dictation'ni to'liq to'xtatadi (masalan logout'da). Hali
 * boshlanmagan bo'lsa ham xato bermaydi.
 */
export function stopWakeWordListener() {
  active = false;
  clearSilenceTimer();
  dictationFinalText = "";
  mode = "wake";
  if (!recognition) return;
  try {
    recognition.stop();
  } catch (_) {
    // hali boshlanmagan yoki allaqachon to'xtagan bo'lishi mumkin — jim
  }
}
