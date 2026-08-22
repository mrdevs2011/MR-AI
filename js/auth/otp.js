/* =====================================================================
   otp.js — 8 xonali OTP kiritish qutilari, taymer.
   script.js'dan ko'chirildi: buildOtpBoxes (58), syncOtpHiddenValue (112),
   clearOtpBoxes (116), focusFirstOtpBox (121), startOtpTimer (131),
   stopOtpTimer (155), setOtpBoxesDisabled (1464).

   MUHIM (achiq haqiqat — cross-module bog'liqlik):
   - buildOtpBoxes() ichidagi input listener submitOtp()ni chaqiradi —
     bu login.js'da yashaydi. Circular import (login.js ham bu faylni
     import qiladi) oldini olish uchun dynamic import ishlatildi.
   - startOtpTimer() muddat tugaganda sessionStorage'ga xabar yozib
     window.location.reload() qiladi — bu original xatti-harakat,
     o'zgarmagan.

   `otpDigitInputs`, `OTP_LENGTH`, `otpTimerInterval` — bu modulning
   o'z ichki holati, boshqa modul ularni to'g'ridan-to'g'ri o'qimaydi
   (loginOtp.value orqali chat-storage kabi joylardan o'qiladi).
   ===================================================================== */

const loginOtp = document.getElementById("login-otp"); // hidden, combined value
const loginOtpBoxes = document.getElementById("login-otp-boxes");
const loginOtpTimer = document.getElementById("login-otp-timer");

const OTP_LENGTH = 8;
export let otpDigitInputs = [];
let otpTimerInterval = null;

export function buildOtpBoxes() {
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
        // login.js'ni statik import qilsak circular bo'ladi (login.js
        // ham otp.js'ni import qiladi) — shuning uchun dynamic import.
        import('./login.js').then(({ submitOtp }) => submitOtp());
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
        import('./login.js').then(({ submitOtp }) => submitOtp());
      }
    });

    loginOtpBoxes.appendChild(box);
    otpDigitInputs.push(box);
  }
}

export function syncOtpHiddenValue() {
  loginOtp.value = otpDigitInputs.map((b) => b.value).join("");
}

export function clearOtpBoxes() {
  otpDigitInputs.forEach((b) => { b.value = ""; });
  loginOtp.value = "";
}

export function focusFirstOtpBox() {
  if (otpDigitInputs[0]) otpDigitInputs[0].focus();
}

// OTP jonli sanoq: backend qaytargan ttl_seconds'dan boshlab har
// soniyada 1 kamayib turadi (59, 58, 57...). Muddati tugasa, kod
// eskirganini ko'rsatib, foydalanuvchini yangi kod so'rashga
// yo'naltiradi (otpStage qaytadan false qilinadi).
export function startOtpTimer(ttlSeconds) {
  stopOtpTimer();
  let remaining = Math.max(0, Math.floor(ttlSeconds));
  loginOtpTimer.classList.remove("hidden");
  const render = () => {
    if (remaining > 0) {
      loginOtpTimer.textContent = `Code expires in ${remaining}s`;
    } else {
      // 60s tugadi — endi "expired" holatida osilib turmaymiz,
      // to'g'ridan-to'g'ri reload qilamiz. Xabarni sessionStorage'ga
      // yozib qo'yamiz, reload'dan keyin showLogin() shuni o'qib
      // login xato joyida ko'rsatadi.
      stopOtpTimer();
      try { sessionStorage.setItem("MRagent_post_reload_msg", "Code expired — please sign in again."); } catch (_) {}
      window.location.reload();
    }
  };
  render();
  otpTimerInterval = setInterval(() => {
    remaining -= 1;
    render();
  }, 1000);
}

export function stopOtpTimer() {
  if (otpTimerInterval) {
    clearInterval(otpTimerInterval);
    otpTimerInterval = null;
  }
}

export function setOtpBoxesDisabled(disabled) {
  otpDigitInputs.forEach((b) => { b.disabled = disabled; });
}

// Original script.js called this once immediately after definition
// (module load time) so the 8 boxes exist before any login attempt.
buildOtpBoxes();
