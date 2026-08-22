/* =====================================================================
   firebase.js — Firebase init + Firestore instance.
   script.js'dagi qator ~1-16'dan ko'chirildi (o'zgartirilmadi).

   MUHIM (achiq haqiqat, xavfsizlik eslatmasi): quyidagi apiKey va h.k.
   Firebase CLIENT config — bu public bo'lishi normal (Firestore Security
   Rules himoya qiladi, key o'zi maxfiy emas). Agar repo public bo'lsa va
   bu yerda BOSHQA maxfiy narsa (masalan backend service-account kaliti)
   paydo bo'lsa — o'sha .gitignore'ga tushishi SHART. Hozir bu faylda
   faqat client config bor, muammo yo'q.

   Bog'liqlik: bu fayl `firebase` global obyektiga tayanadi — u
   index.html'da <script> orqali CDN'dan (compat build) yuklanadi,
   MODUL sifatida emas. Shuning uchun bu faylning o'zi ES module bo'lsa
   ham, `firebase` o'zgaruvchisi global scope'dan keladi (import qilinmaydi).
   ===================================================================== */

export const firebaseConfig = {
  apiKey: "AIzaSyDYkT1b_SOg5T76yhpyRuqnem9YsG53Qn0",
  authDomain: "mragent-2d280.firebaseapp.com",
  projectId: "mragent-2d280",
  storageBucket: "mragent-2d280.firebasestorage.app",
  messagingSenderId: "654437071743",
  appId: "1:654437071743:web:7281d306d8c6cd054c784a",
  measurementId: "G-MZEC0M55WH"
};

firebase.initializeApp(firebaseConfig);
export const db = firebase.firestore();
// Ba'zi tarmoqlar/provayderlar Firestore'ning odatiy WebChannel
// (streaming) ulanishini sekinlashtiradi yoki bloklaydi — bu holatda
// uzoq muddatli long-polling'ga avtomatik o'tish barqarorlikni oshiradi.
db.settings({ experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false });
