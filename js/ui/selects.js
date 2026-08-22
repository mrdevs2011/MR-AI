/* =====================================================================
   selects.js — mode/tier/provider pill dot ranglari + combo select
   dropdown (composer'dagi "Auto Super" tugmasi).

   MODEL TANLASH — bitta FLAT ro'yxat, faqat BITTA qator har doim
   tanlangan bo'ladi (checkmark bitta joyda). Har qator "Provider ·
   Tier" juftligini bildiradi (masalan "Groq · Super" = Groq orqali
   openai/gpt-oss-120b chaqiriladi). Bu ataylab flatten qilingan —
   Tier va Provider'ni ikkita ALOHIDA tanlov sifatida ko'rsatish
   chalkashtiradi (masalan OpenRouter'ning "Super" modeli Nemotron
   120B, Groq'ning "Super" modeli esa gpt-oss-120b — battamom boshqa
   model, lekin ikkalasi ham "Super" deb ko'rinardi). Flat ro'yxatda
   har bir tanlov nima ekanligi bir qarashda aniq: label + haqiqiy
   model nomi bitta qatorda.

   MUHIM: bu fayl modul yuklanganda o'zini avtomatik ishga tushiradi.
   ===================================================================== */

const modeSelect = document.getElementById("mode");
const sudoBanner = document.getElementById("sudoBanner");
const modeDot = document.getElementById("mode-dot");
const tierSelect = document.getElementById("tier");
const tierDot = document.getElementById("tier-dot");
const providerSelect = document.getElementById("provider");

const MODE_COLORS = { general: "#4caf7a", sudo: "#ff6b6b" };
const TIER_COLORS = { high: "#8e5cf7", medium: "#f5a623", low: "#6b6b6b" };

export function updateSudoBanner() {
  sudoBanner.classList.toggle("hidden", modeSelect.value !== "sudo");
}
modeSelect.addEventListener("change", updateSudoBanner);
updateSudoBanner();

export function updateModeDot() { if (modeDot) modeDot.style.background = MODE_COLORS[modeSelect.value] || "#8e8e8e"; }
export function updateTierDot() { if (tierDot) tierDot.style.background = TIER_COLORS[tierSelect.value] || "#8e8e8e"; }
modeSelect.addEventListener("change", updateModeDot);
tierSelect.addEventListener("change", updateTierDot);
updateModeDot();
updateTierDot();

// ---------------------------------------------------------------------
// COMBO SELECT — single button + dropdown. DOM'dagi #tier va #provider
// <select>lar hamon qiymat-saqlagich sifatida qoladi (boshqa fayllar
// getElementById("tier"/"provider").value o'qishda davom etaveradi),
// lekin UI'da endi IKKITA guruh emas — BITTA flat ro'yxat ko'rsatiladi.
// ---------------------------------------------------------------------
const comboWrap = document.getElementById("combo-wrap");
const comboBtn = document.getElementById("combo-btn");
const comboDropdown = document.getElementById("combo-dropdown");
const comboLabel = document.getElementById("combo-label");
const comboItemsWrap = document.getElementById("combo-items");
const sudoToggleRow = document.getElementById("sudo-toggle-row");
const sudoSwitch = document.getElementById("sudo-switch");

// Tartib ataylab shunday: avval provider bo'yicha guruhlangan (Auto
// birinchi — bu default va eng "xavfsiz" tanlov), har provider ichida
// tier tartibi doim bir xil (Omni -> Super -> Nano), shunda foydalanuvchi
// ro'yxatni yodlab qolgach ko'z bilan tez topadi, har safar qidirmaydi.
const MODEL_OPTS = [
  { tier: "high",   provider: "auto",       label: "Auto",       sub: "Omni",   model: "OpenRouter \u2192 Groq \u2192 Gemini fallback" },
  { tier: "medium", provider: "auto",       label: "Auto",       sub: "Super",  model: "OpenRouter \u2192 Groq \u2192 Gemini fallback" },
  { tier: "low",    provider: "auto",       label: "Auto",       sub: "Nano",   model: "OpenRouter \u2192 Groq \u2192 Gemini fallback" },

  { tier: "high",   provider: "openrouter", label: "OpenRouter", sub: "Omni",   model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
  { tier: "medium", provider: "openrouter", label: "OpenRouter", sub: "Super",  model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { tier: "low",    provider: "openrouter", label: "OpenRouter", sub: "Nano",   model: "nvidia/nemotron-3-nano-30b-a3b:free" },

  { tier: "high",   provider: "groq",       label: "Groq",       sub: "Omni",   model: "openai/gpt-oss-120b" },
  { tier: "medium", provider: "groq",       label: "Groq",       sub: "Super",  model: "openai/gpt-oss-120b" },
  { tier: "low",    provider: "groq",       label: "Groq",       sub: "Nano",   model: "openai/gpt-oss-20b" },

  { tier: "high",   provider: "gemini",     label: "Gemini",     sub: "Omni",   model: "gemini-2.0-flash" },
  { tier: "medium", provider: "gemini",     label: "Gemini",     sub: "Super",  model: "gemini-2.0-flash" },
  { tier: "low",    provider: "gemini",     label: "Gemini",     sub: "Nano",   model: "gemini-2.0-flash" },
];

function currentModelOpt() {
  return MODEL_OPTS.find(o => o.tier === tierSelect.value && o.provider === providerSelect.value)
      || MODEL_OPTS[1]; // fallback: Auto · Super
}

export function updateComboActiveState() {
  comboDropdown.querySelectorAll(".combo-item[data-tier]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tier === tierSelect.value && btn.dataset.provider === providerSelect.value);
  });
  sudoSwitch.classList.toggle("on", modeSelect.value === "sudo");
  sudoToggleRow.classList.toggle("danger", modeSelect.value === "sudo");
}

export function updateComboLabel() {
  const opt = currentModelOpt();
  comboLabel.textContent = `${opt.label} ${opt.sub}`;
  updateComboActiveState();
}

// Model pick (provider+tier birga, bitta klik = bitta aniq tanlov) va
// sudo toggle mustaqil holatlar. Model tanlash dropdown'ni yopadi (real
// tanlov); toggle ochiq qoldiradi (odamlar bosib darrov fikrini
// o'zgartirishi mumkin).
export function selectModel(tierValue, providerValue) {
  tierSelect.value = tierValue;
  providerSelect.value = providerValue;
  updateTierDot();
  updateComboLabel();
  closeComboDropdown();
}

// Orqaga moslik: eski kod selectTier(tierValue) chaqirishi mumkin —
// bunda provider o'zgarmasdan, faqat tier almashadi.
export function selectTier(tierValue) {
  selectModel(tierValue, providerSelect.value);
}

export function selectProvider(providerValue) {
  selectModel(tierSelect.value, providerValue);
}

export function toggleSudo() {
  modeSelect.value = modeSelect.value === "sudo" ? "general" : "sudo";
  updateSudoBanner();
  updateModeDot();
  updateComboLabel();
}
sudoToggleRow.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSudo();
});

export function buildComboDropdown() {
  comboItemsWrap.innerHTML = "";
  MODEL_OPTS.forEach(o => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combo-item";
    btn.dataset.tier = o.tier;
    btn.dataset.provider = o.provider;
    btn.innerHTML = `<span class="combo-item-text"><span class="combo-item-label">${o.label} \u00b7 ${o.sub}</span><span class="combo-item-model">${o.model}</span></span>`;
    btn.addEventListener("click", () => selectModel(o.tier, o.provider));
    comboItemsWrap.appendChild(btn);
  });
  updateComboActiveState();
}

export function openComboDropdown() {
  comboDropdown.classList.remove("hidden");
  const btnRect = comboBtn.getBoundingClientRect();
  const dropRect = comboDropdown.getBoundingClientRect();
  comboDropdown.classList.toggle("open-below", btnRect.top - dropRect.height < 8);
  document.addEventListener("click", handleOutsideComboClick);
}
export function closeComboDropdown() {
  comboDropdown.classList.add("hidden");
  document.removeEventListener("click", handleOutsideComboClick);
}
export function handleOutsideComboClick(e) {
  if (!comboWrap.contains(e.target)) closeComboDropdown();
}
comboBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (comboDropdown.classList.contains("hidden")) openComboDropdown();
  else closeComboDropdown();
});

buildComboDropdown();
updateComboLabel();
