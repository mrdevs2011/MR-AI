/* =====================================================================
   dom.js — DOM bilan bog'liq umumiy yordamchi funksiyalar.
   script.js'dan ko'chirildi: autoResizeInput (qator 2300).

   `$` helper: roadmap "agar mavjud bo'lsa" deb so'ragan edi — script.js
   ichida QIDIRDIM, YO'Q EKAN (hech qanday `document.querySelector`
   wrapper topilmadi). Demak bu fayl hozircha faqat autoResizeInput'ni
   ushlaydi, `$` qo'shilmadi — mavjud bo'lmagan narsani ixtiro qilib
   qo'ymaslik kerak.

   MUHIM (achiq haqiqat — bu funksiya "qayta yozilishi kerak" bo'lgan
   holat, roadmap'ning o'zi shunga ruxsat bergan): original script.js'da
   bu funksiya `input` o'zgaruvchisini TASHQI closure'dan olardi
   (const input = document.getElementById("message"), qator 475) — ya'ni
   o'zi hech qanday parametr qabul qilmasdan ishlardi. Modul sifatida
   ajratilganda bu closure endi mavjud emas, shuning uchun `input`ni
   PARAMETR qildim. Step 10'da main.js orkestratsiya qilinganda, original
   chaqiruv joylari ham shunga mos o'zgartirilishi kerak:

     // ESKI (script.js, qator 2305-2306):
     input.addEventListener("input", autoResizeInput);
     requestAnimationFrame(autoResizeInput);

     // YANGI (Step 10'da main.js yoki ui/ ichida):
     input.addEventListener("input", () => autoResizeInput(input));
     requestAnimationFrame(() => autoResizeInput(input));

   Bu — mantiqiy o'zgarish emas, faqat "qanday chaqirilishi" o'zgaradi.
   Funksiya ichidagi HAR BIR qator original bilan bir xil.
   ===================================================================== */

export function autoResizeInput(input) {
  input.style.height = "auto";
  const h = Math.max(input.scrollHeight, 24);
  input.style.height = Math.min(h, 200) + "px";
}
