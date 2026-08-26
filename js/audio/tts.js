/* =====================================================================
   audio/tts.js — AI javobini ElevenLabs orqali ovozga aylantirib
   pleer qiladi. Backend'dagi /api/tts endpointini chaqiradi (key
   frontendda hech qachon ko'rinmaydi).
   ===================================================================== */

import { authHeaders } from '../auth/session.js';
import { API_BASE } from '../state/store.js';

let currentAudio = null;
let voiceEnabled = true; // toggleVoice() orqali o'zgaradi

// Markdown belgilarini olib tashlaydi — ElevenLabs "yulduzcha yulduzcha"
// deb o'qib bermasin deb. Kod bloklarini butunlay o'qitmaymiz (foydasiz
// va uzun bo'ladi).
function stripForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " kod bloki. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_#>~]/g, "")
    .trim();
}

export function setVoiceEnabled(value) {
  voiceEnabled = value;
  if (!value) stopSpeaking();
}

export function isVoiceEnabled() {
  return voiceEnabled;
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

// onEnd (ixtiyoriy) — chaqiruvchi tomon (masalan, msg-actions'dagi
// read-btn) audio TABIIY tugaganda ikonkani qaytarish uchun beradi.
// Eski chaqiruvchilar (event-handler.js) buni bermaydi — orqaga
// mos (backward compatible), hech nima buzilmaydi.
export async function speak(text, onEnd) {
  if (!voiceEnabled) return;
  const clean = stripForSpeech(text);
  if (!clean) return;

  stopSpeaking(); // oldingi javob hali gapirayotgan bo'lsa, to'xtat

  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text: clean }),
    });
    if (!res.ok) {
      console.warn("TTS so'rovi muvaffaqiyatsiz:", res.status);
      onEnd?.();
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play().catch((e) => {
      console.warn("Audio play bloklandi:", e);
      onEnd?.();
    });
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      onEnd?.();
    };
  } catch (err) {
    console.warn("TTS xatosi:", err);
    onEnd?.();
  }
}
