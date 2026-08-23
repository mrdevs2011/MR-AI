/* =====================================================================
   login.js — login ekrani: parol + OTP ikki bosqichli oqim, tunnel
   URL'ni Firestore'dan yuklash.
   script.js'dan ko'chirildi: showLogin (1276), handleAuthFailure (1325),
   requestOtp (1396), verifyLogin (1407), submitOtp (1424),
   loadTunnelUrl (1339), showTunnelRetry (1376).

   MUHIM (achiq haqiqat — cross-module bog'liqliklar):
   1) showLogin(), submitOtp() ichida stopInactivityWatcher(),
      stopOtpTimer() session.js/otp.js'dan chaqiriladi — statik import,
      circular emas (session.js bu faylni import qilmaydi).
   2) otp.js bu faylni dynamic import qiladi (submitOtp uchun) — shuning
      uchun bu faylda otp.js statik import qilinadi, lekin otp.js'da bu
      faylga qarab statik import YO'Q (circular oldini olish, Step 7
      pattern).
   3) doLogout() session.js'da — showLogin() uni chaqirmaydi, lekin
      submitOtp() muvaffaqiyatli bo'lganda showApp()ni chaqiradi, u esa
      chat/agent modullariga bog'liq (Step 8-10) — shuning uchun
      window.showApp() orqali (script.js'dagi asl global pattern,
      main.js Step 10'da buni window'ga yozadi).
   ===================================================================== */

import { API_BASE, setLoginPass, setSessionId } from '../state/store.js';
import {
  stopInactivityWatcher, startInactivityWatcher, markActive,
} from './session.js';
import {
  clearOtpBoxes, focusFirstOtpBox, startOtpTimer, stopOtpTimer,
  setOtpBoxesDisabled,
} from './otp.js';

const bootScreen = document.getElementById("boot-screen");
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginPass = document.getElementById("login-pass");
const loginPassWrap = document.getElementById("login-pass-wrap");
const loginOtp = document.getElementById("login-otp");
const loginOtpWrap = document.getElementById("login-otp-wrap");
const loginOtpTimer = document.getElementById("login-otp-timer");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const loginTunnelStatus = document.getElementById("login-tunnel-status");
const logoutBtn = document.getElementById("logout-btn");

// Ikki bosqichli login: avval faqat parol ko'rinadi. Continue
// bosilganda parol tekshirilib (send-otp orqali) emailga OTP
// yuboriladi va shu ekrandayoq OTP maydoni ochiladi — parol input
// qulflanib qoladi, uni qayta kiritish shart emas. "otpStage=true"
// bo'lganda submit endi /login'ni pass+otp bilan chaqiradi.
let otpStage = false;
let otpSubmitting = false;

export function showLogin(errorMsg) {
  bootScreen.classList.add("hidden");
  appScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  setLoginPass("");
  setSessionId("");
  localStorage.removeItem("MRagent_pass");
  localStorage.removeItem("MRagent_session");
  localStorage.removeItem("MRagent_last_active");
  stopInactivityWatcher();
  loginBtn.disabled = false;
  loginBtn.textContent = "Continue";
  otpStage = false;
  loginOtpWrap.classList.add("hidden");
  loginPassWrap.classList.remove("hidden");
  loginPass.disabled = false;
  stopOtpTimer();
  loginOtpTimer.classList.add("hidden");
  loginOtpTimer.textContent = "";

  // doLogout() reload qilishdan oldin sessionStorage'ga yozib qoldirgan
  // sabab-xabar bormi — bo'lsa, shuni ko'rsatamiz (masalan "session
  // expired"). errorMsg to'g'ridan-to'g'ri argument sifatida kelgan
  // holatlar ustunroq, chunki ular reload'siz, shu turdagi chaqiruv
  // ichida darhol keladi.
  let deferredMsg = null;
  try {
    deferredMsg = sessionStorage.getItem("MRagent_post_reload_msg");
    if (deferredMsg) sessionStorage.removeItem("MRagent_post_reload_msg");
  } catch (_) {}
  const finalMsg = errorMsg || deferredMsg;

  if (finalMsg) {
    loginError.textContent = finalMsg;
    loginError.classList.remove("hidden");
  } else {
    loginError.classList.add("hidden");
  }
  loginPass.value = "";
  clearOtpBoxes();
  loginPass.focus();
}

// Har qanday himoyalangan so'rov 401 qaytarganda chaqiriladi — sabab
// backend'dan keladi ('unauthorized' — PASS o'zi noto'g'ri, odatda u
// mragent-set-pass bilan o'zgartirilgan bo'lsa; 'session_expired' —
// PASS to'g'ri, lekin 24 soatlik sessiya muddati tugagan). Ikkala
// holatda ham to'liq logout: eski pass/session hech qanday holatda
// brauzerda qolib ketmaydi.
export async function handleAuthFailure(res) {
  let reason = "unauthorized";
  try {
    const data = await res.json();
    if (data && data.error) reason = data.error;
  } catch (e) {
    // body yo'q yoki JSON emas — standart xabar bilan davom etamiz
  }
  const message = reason === "session_expired"
    ? "Your session expired after a day of inactivity — please sign in again."
    : "Password changed — please sign in again.";
  // session.js'dagi doLogout() — dynamic import (login.js<->session.js
  // orasida circular bo'lmasin: session.js bu faylni import qilmaydi,
  // lekin xavfsizlik uchun bir xil pattern saqlanadi).
  const { doLogout } = await import('./session.js');
  doLogout(message);
}

export async function loadTunnelUrl() {
  const { db } = await import('../config/firebase.js');
  loginTunnelStatus.textContent = "connecting...";
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
      const { setApiBase } = await import('../state/store.js');
      setApiBase(doc.data().url.replace(/\/$/, ""));
      loginTunnelStatus.textContent = "";
    } else {
      loginTunnelStatus.textContent = "couldn't connect — try again";
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

export function showTunnelRetry() {
  let btn = document.getElementById("tunnel-retry-btn");
  if (btn) return; // allaqachon ko'rsatilgan
  btn = document.createElement("button");
  btn.id = "tunnel-retry-btn";
  btn.type = "button";
  btn.textContent = "Retry";
  btn.className = "w-full text-[13px] text-[#ececec] bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-xl py-2 mt-2 transition";
  btn.addEventListener("click", () => {
    btn.remove();
    loadTunnelUrl();
  });
  loginTunnelStatus.insertAdjacentElement("afterend", btn);
}

// Ikki bosqichli login. 1-bosqich: faqat PASS yuboriladi -> backend
// /send-otp orqali parolni tekshiradi va to'g'ri bo'lsa emailga
// 60 soniyalik bir martalik OTP kod jo'natadi. 2-bosqich: shu ekranda
// ochilgan OTP maydoniga kod kiritilib, /login PASS+OTP bilan
// chaqiriladi va session ochiladi.
export async function requestOtp(pass) {
  const res = await fetch(`${API_BASE}/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    body: JSON.stringify({ pass })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 200 && data.ok) return { ok: true, error: null, ttlSeconds: data.ttl_seconds || 60 };
  return { ok: false, error: data.error || null, ttlSeconds: null };
}

export async function verifyLogin(pass, otp) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    body: JSON.stringify({ pass, otp })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status !== 200) return { sessionId: null, error: data.error || null };
  if (!data.session_id) return { sessionId: null, error: "mismatch" };
  return { sessionId: data.session_id, error: null };
}

// --- 2-bosqich: OTP bilan haqiqiy login (tugmasiz, avtomatik) ---
// 8-chi raqam kiritilgan zahoti (yoki paste orqali to'liq kod tushsa)
// chaqiriladi — foydalanuvchi hech qanday tugma bosmaydi.
export async function submitOtp() {
  if (otpSubmitting) return;
  const pass = loginPass.value.trim();
  const otp = loginOtp.value.trim();
  if (otp.length !== 8) return;

  otpSubmitting = true;
  setOtpBoxesDisabled(true);
  loginError.classList.add("hidden");

  try {
    const { sessionId, error } = await verifyLogin(pass, otp);
    if (sessionId) {
      stopOtpTimer();
      setLoginPass(pass);
      setSessionId(sessionId);
      localStorage.setItem("MRagent_pass", pass);
      localStorage.setItem("MRagent_session", sessionId);
      markActive();
      startInactivityWatcher();
      // ui/chat/agent modullariga bog'liq (Step 8-10) — script.js'da
      // global qoladi, window orqali chaqiriladi.
      await window.showApp();
    } else if (error === "invalid_or_expired_otp") {
      // Noto'g'ri OTP kiritilsa — showLogin() bilan qayta chizib
      // o'tirmaymiz, to'g'ridan-to'g'ri sahifani reload qilamiz.
      // sessionStorage'ga xabar yozib qo'yamiz, reload'dan keyin
      // showLogin() shu xabarni o'qib login xato joyida ko'rsatadi.
      try { sessionStorage.setItem("MRagent_post_reload_msg", "OTP code is wrong or expired — please sign in again."); } catch (_) {}
      window.location.reload();
      return;
    } else {
      showLogin("Wrong password.");
    }
  } catch (err) {
    showLogin("Couldn't reach the backend. Try again in a moment.");
  } finally {
    otpSubmitting = false;
    setOtpBoxesDisabled(false);
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!API_BASE) {
    loginError.textContent = "Not connected yet, wait a moment and try again.";
    loginError.classList.remove("hidden");
    return;
  }
  const pass = loginPass.value.trim();

  if (otpStage) {
    // OTP bosqichida forma submit bo'lishi kerak emas (tugma yo'q,
    // Enter bosilsa ham hech narsa qilmaydi) — tekshiruv faqat
    // 8 xona to'lganda avtomatik ishga tushadi (submitOtp).
    return;
  }

  // --- 1-bosqich: parolni yuborib OTP so'rash ---
  if (!pass) {
    loginError.textContent = "Enter your password.";
    loginError.classList.remove("hidden");
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Checking...";
  loginError.classList.add("hidden");
  try {
    const { ok, error, ttlSeconds } = await requestOtp(pass);
    if (ok) {
      otpStage = true;
      loginPass.disabled = true;
      loginPassWrap.classList.add("hidden");
      loginOtpWrap.classList.remove("hidden");
      loginBtn.classList.add("hidden");
      focusFirstOtpBox();
      startOtpTimer(ttlSeconds);
    } else if (error === "unauthorized") {
      showLogin("Wrong password.");
    } else if (error === "email_not_configured_or_failed") {
      loginError.textContent = "Couldn't send the email — try again in a moment.";
      loginError.classList.remove("hidden");
    } else if (error === "rate_limited") {
      loginError.textContent = "Juda ko'p urinish. Biroz kutib qayta urining.";
      loginError.classList.remove("hidden");
    } else {
      loginError.textContent = "Couldn't send OTP. Try again.";
      loginError.classList.remove("hidden");
    }
  } catch (err) {
    showLogin("Couldn't reach the backend. Try again in a moment.");
  } finally {
    loginBtn.disabled = false;
    if (!otpStage) loginBtn.textContent = "Continue";
  }
});

logoutBtn.addEventListener("click", async () => {
  const { doLogout } = await import('./session.js');
  doLogout();
});
