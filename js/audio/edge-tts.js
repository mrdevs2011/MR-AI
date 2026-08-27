/* =====================================================================
   audio/edge-tts.js — Microsoft Edge brauzerining "Read Aloud"
   funksiyasi ishlatadigan NORASMIY (hujjatlashtirilmagan) TTS
   endpointiga to'g'ridan-to'g'ri, hech qanday API key'siz ulanadi.
   Ovoz: "uz-UZ-SardorNeural" (o'zbekcha erkak, Azure Neural ovozi).

   MUHIM (achiq haqiqat — buni ochiq aytish SHART):
   1) BU RASMIY API EMAS. Bu Microsoft Edge brauzerining o'zi ichki
      ishlatadigan endpoint — hech qachon ochiq hujjatlashtirilmagan,
      hech qanday SLA yo'q, istalgan payt Microsoft tomonidan
      o'zgartirilishi yoki butunlay yopilishi mumkin (bu community'da
      keng tanilgan "edge-tts" texnikasi — Python/Node'da minglab
      loyihalar shu protokoldan foydalanadi, lekin baribir norasmiy).
   2) MEN BUNI TEST QILA OLMADIM. Mening sandbox muhitim
      speech.platform.bing.com domenига tarmoq ruxsatiga ega emas
      (faqat GitHub/npm/PyPI kabi paket repolariga chiqadi), shuning
      uchun bu kodni haqiqiy brauzerda ishlab-ishlamasligini o'zim
      tekshira olmadim. Protokol keng tanilgan reverse-engineered
      spetsifikatsiyaga asoslangan, lekin real testdan o'tmagan —
      birinchi safar ishlatganda F12 Console'ni albatta ochib tur.
   3) FALLBACK BOR: agar bu ishlamasa (WebSocket ochilmasa, audio
      kelmasa va h.k.), chaqiruvchi tomon (event-handler.js) avtomatik
      audio/tts.js dagi ElevenLabs speak()ga qaytadi — ilova
      "jim qolib ketmaydi".
   ===================================================================== */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const VOICE = "uz-UZ-SardorNeural";
const WS_TIMEOUT_MS = 10000; // 10s ichida javob kelmasa, fallback'ga o'tkazamiz

let currentAudio = null;

function randomHex32() {
  // 32 ta hex belgi, chiziqchasiz — protokol shu formatni kutadi.
  let out = "";
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function escapeSsml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Binary WebSocket frame'lari "header\r\n\r\n<audio bytes>" formatida
// keladi, header uzunligi frame'ning birinchi 2 baytida (big-endian)
// yoziladi. Header o'zi audio metadata (Path:audio va h.k.) — bizga
// faqat undan keyingi xom mp3 baytlari kerak.
function extractAudioBytes(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  if (buf.length < 2) return null;
  const headerLen = (buf[0] << 8) | buf[1];
  const bodyStart = 2 + headerLen;
  if (bodyStart >= buf.length) return null;
  return buf.slice(bodyStart);
}

/**
 * Berilgan matnni "Sardor" (uz-UZ) ovozida gapiradi. Muvaffaqiyatsiz
 * bo'lsa reject qiladi — chaqiruvchi tomon shu holatda boshqa TTS'ga
 * (ElevenLabs) o'tishi kerak.
 */
export function speakEdge(text) {
  return new Promise((resolve, reject) => {
    const clean = (text || "").trim();
    if (!clean) {
      resolve();
      return;
    }

    let ws;
    try {
      const connectionId = randomHex32();
      ws = new WebSocket(
        `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`
      );
    } catch (err) {
      reject(err);
      return;
    }

    ws.binaryType = "arraybuffer";

    const audioChunks = [];
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch (_) {}
      reject(new Error("Edge TTS: timeout — javob kelmadi"));
    }, WS_TIMEOUT_MS);

    function settleReject(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(err);
    }

    ws.onopen = () => {
      const requestId = randomHex32();
      const timestamp = new Date().toUTCString();

      const configMessage =
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: false,
                  wordBoundaryEnabled: false,
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });

      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='uz-UZ'>` +
        `<voice name='${VOICE}'>${escapeSsml(clean)}</voice>` +
        `</speak>`;

      const ssmlMessage =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;

      try {
        ws.send(configMessage);
        ws.send(ssmlMessage);
      } catch (err) {
        settleReject(err);
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        // Matnli xabarlar orasida "Path:turn.end" — gapirish tugadi
        // degani, shu yerda socket'ni yopamiz.
        if (event.data.includes("Path:turn.end")) {
          try { ws.close(); } catch (_) {}
        }
        return;
      }
      const audioBytes = extractAudioBytes(event.data);
      if (audioBytes && audioBytes.length) audioChunks.push(audioBytes);
    };

    ws.onerror = () => {
      settleReject(new Error("Edge TTS: WebSocket xatosi"));
    };

    ws.onclose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      if (!audioChunks.length) {
        reject(new Error("Edge TTS: audio ma'lumot kelmadi"));
        return;
      }

      try {
        if (currentAudio) {
          currentAudio.pause();
          currentAudio = null;
        }
        const blob = new Blob(audioChunks, { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        currentAudio = new Audio(url);
        currentAudio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        currentAudio.play().catch((err) => {
          URL.revokeObjectURL(url);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    };
  });
}

export function stopEdgeSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}
