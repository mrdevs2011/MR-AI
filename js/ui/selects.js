/* =====================================================================
   selects.js — mode/tier pill dot ranglari + combo select dropdown
   (composer'dagi "General Super" tugmasi).
   script.js'dan ko'chirildi: updateModeDot (492), updateTierDot (493),
   updateComboActiveState (529), updateComboLabel (537), selectTier
   (548), toggleSudo (555), updateSudoBanner (480), buildComboDropdown
   (566), openComboDropdown (580), closeComboDropdown (587),
   handleOutsideComboClick (591).

   MUHIM: bu fayl modul yuklanganda o'zini avtomatik ishga tushiradi —
   asl script.js'dagi kabi, addEventListener chaqiruvlari va
   buildComboDropdown()/updateComboLabel() darhol module top-level'da
   bajariladi.
   ===================================================================== */

const modeSelect = document.getElementById("mode");
const sudoBanner = document.getElementById("sudoBanner");
const modeDot = document.getElementById("mode-dot");
const tierSelect = document.getElementById("tier");
const tierDot = document.getElementById("tier-dot");

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
// COMBO SELECT — single button that replaces the old side-by-side
// mode/tier pill-selects. The two <select> elements above stay in the
// DOM (hidden) purely as the value store, so every other place in this
// file that reads document.getElementById("mode"/"tier").value keeps
// working untouched. Clicking the button opens a Claude-model-picker
// style dropdown: one pill row per mode+tier combo, sized to its own
// label instead of stretched full-width.
// ---------------------------------------------------------------------
const comboWrap = document.getElementById("combo-wrap");
const comboBtn = document.getElementById("combo-btn");
const comboDropdown = document.getElementById("combo-dropdown");
const comboLabel = document.getElementById("combo-label");

// Mode (general/sudo) and tier (omni/super/nano) are ORTHOGONAL state —
// one is a toggle, the other a 3-way pick. They used to be flattened into
// a 2x3 = 6-item combo list (one row per mode+tier pair), which meant
// duplicating every tier label under both "General" and "Sudo" groups.
// Now tier renders once as a real 3-item list, and mode lives as a single
// switch row underneath. Adding a 4th tier later is one array entry, not
// two new rows.
const TIER_OPTS = [
  { value: "high", label: "Omni", model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
  { value: "medium", label: "Super", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { value: "low", label: "Nano", model: "nvidia/nemotron-3-nano-30b-a3b:free" },
];
const comboItemsWrap = document.getElementById("combo-items");
const sudoToggleRow = document.getElementById("sudo-toggle-row");
const sudoSwitch = document.getElementById("sudo-switch");

export function updateComboActiveState() {
  comboDropdown.querySelectorAll(".combo-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tier === tierSelect.value);
  });
  sudoSwitch.classList.toggle("on", modeSelect.value === "sudo");
  sudoToggleRow.classList.toggle("danger", modeSelect.value === "sudo");
}

export function updateComboLabel() {
  const m = modeSelect.value === "sudo" ? "Extended" : "General";
  const t = TIER_OPTS.find(x => x.value === tierSelect.value);
  comboLabel.textContent = [m, t && t.label].filter(Boolean).join(" ");
  updateComboActiveState();
}

// Tier pick and sudo toggle each update state + UI on their own — no
// shared "selectCombo(mode, tier)" needed since they no longer change
// together. Tier picks close the dropdown (it's a real choice); the
// toggle leaves it open (people flip it and immediately reconsider).
export function selectTier(tierValue) {
  tierSelect.value = tierValue;
  updateTierDot();
  updateComboLabel();
  closeComboDropdown();
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
  TIER_OPTS.forEach(t => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combo-item";
    btn.dataset.tier = t.value;
    btn.innerHTML = `<span class="combo-item-text"><span class="combo-item-label">${t.label}</span><span class="combo-item-model">${t.model}</span></span>`;
    btn.addEventListener("click", () => selectTier(t.value));
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
