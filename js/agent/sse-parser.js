/* =====================================================================
   sse-parser.js — SSE frame'larni parse qilish.
   script.js'dan ko'chirildi: parseSseChunk (qator 2204).

   Bu — eng "toza" funksiya (roadmap Step 9'ning o'zi shunday deydi):
   tashqi dependency yo'q, faqat parametr bilan ishlaydi. Dependency
   graph'ning eng past qavati — hech kimga bog'liq emas, lekin
   event-handler.js va job-polling.js shunga bog'liq.
   ===================================================================== */

// Parses one or more "data: {...}\n\n" SSE frames out of a raw text
// buffer, returning the parsed events plus whatever partial frame is
// still incomplete (to be prepended to the next chunk).
export function parseSseChunk(buffer) {
  const events = [];
  const parts = buffer.split("\n\n");
  const remainder = parts.pop(); // last part may be incomplete
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith("data:")) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr) continue;
    try {
      events.push(JSON.parse(jsonStr));
    } catch (e) {
      console.error("Bad SSE frame:", jsonStr, e);
    }
  }
  return { events, remainder };
}
