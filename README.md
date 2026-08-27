# Cowork patch — qanday joylashtirish kerak

## 1) Backend
`main.py` ni mragent/assets/main.py o'rniga qo'ying (to'liq fayl, sizning
eski funksiyalaringiz saqlangan, ustiga qo'shilgan).

Qo'shilgan narsalar:
- COWORK_JOBS_FILE / cowork_jobs.json — vazifalar tarixi (diskda)
- run_cowork_job() — avtonom, ko'p bosqichli dvigatel
- Route'lar: POST /cowork/start, GET /cowork/list, GET /cowork/<id>,
  POST /cowork/<id>/cancel
- /confirm endpointi cowork-resume'ni ham qo'llab-quvvatlaydi

## 2) Frontend (MR-AI-main ustiga qo'ying, xuddi shu joylashuvda)
- js/ui/composer.js        -> almashtiring (Chat/Cowork pill qo'shildi)
- js/chat/chat-mode.js     -> YANGI fayl
- js/chat/send-message.js  -> almashtiring (cowork rejimida /cowork/start'ga yuboradi)
- css/layout.css           -> almashtiring (.chat-mode-toggle stillari qo'shildi)
- js/cowork/cowork.js      -> BONUS, ixtiyoriy: alohida "Cowork tarixi" paneli
  (hozircha index.html/main.js'ga ulanmagan — agar keyinchalik alohida
  "barcha cowork vazifalarim" ro'yxatini ko'radigan sahifa kerak bo'lsa,
  shu fayl tayyor, faqat sidebar'ga tugma va index.html'ga panel qo'shish
  kerak bo'ladi).

main.js'ga hech narsa qo'shish shart EMAS — chat-mode.js send-message.js
orqali avtomatik yuklanadi (composer.js'dan keyin, chunki main.js
composer.js'ni birinchi import qiladi).

## Qanday ishlaydi
Composer pastida "Chat | Cowork" pill paydo bo'ladi (+ tugmasi yonida).
"Cowork" tanlab xabar yozsangiz, u /cowork/start'ga ketadi — vazifa
"safe_write" avtonomiya bilan fon Thread'ida ishlaydi (fayl yozadi,
lekin haqiqiy terminal komandalari tasdiq so'raydi — mavjud "Confirm"
tugmasi orqali). Progress xuddi oddiy chat kabi jonli ko'rinadi, sahifani
yopib qo'ysangiz ham backend'da davom etadi.
