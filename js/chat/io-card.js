/* =====================================================================
   io-card.js — bash input/output kartasi (highlight bilan).
   script.js'dan ko'chirildi: addIOCard (1637), highlightBash (1601),
   formatIOOutput (1628), va ular ishlatadigan BASH_COMMANDS (1595)
   konstantasi.

   escapeHtml() message-render.js'dan import qilinadi — ikkalasi ham
   xavfsiz HTML chiqarish uchun bir xil funksiyaga muhtoj.
   ===================================================================== */

import { escapeHtml } from './message-render.js';
import { getActiveChat, saveChats } from './chat-storage.js';

function getEls() {
  return {
    chat: document.getElementById("chat-inner"),
    chatScroll: document.getElementById("chat"),
  };
}

// -----------------------------------------------------------------
// Light bash syntax highlighting (no real parser, just enough to look
// like a real terminal/code block — commands, flags, quoted strings,
// operators like && ; | get their own color, everything else is left
// as plain path/argument text).
const BASH_COMMANDS = new Set([
  "cd","ls","zip","unzip","cp","mv","rm","mkdir","touch","cat","echo",
  "grep","find","sed","awk","curl","wget","git","npm","node","python",
  "python3","pip","pip3","bash","sh","chmod","chown","tar","kill",
  "ps","top","df","du","head","tail","sort","uniq","wc","xargs","export"
]);

export function highlightBash(cmd) {
  const parts = cmd.split(/(\s*(?:&&|\|\||[;|>]{1,2})\s*)/g);
  let atCmdStart = true;
  return parts.map(part => {
    if (/^\s*(?:&&|\|\||[;|>]{1,2})\s*$/.test(part)) {
      atCmdStart = true;
      return `<span class="tok-op">${escapeHtml(part)}</span>`;
    }
    const tokens = part.split(/(\s+|"[^"]*"|'[^']*')/g);
    return tokens.map(tok => {
      if (!tok) return "";
      if (/^\s+$/.test(tok)) return tok;
      if (/^["'].*["']$/.test(tok)) return `<span class="tok-str">${escapeHtml(tok)}</span>`;
      if (/^-{1,2}[a-zA-Z-]+/.test(tok)) return `<span class="tok-flag">${escapeHtml(tok)}</span>`;
      if (atCmdStart && BASH_COMMANDS.has(tok)) {
        atCmdStart = false;
        return `<span class="tok-cmd">${escapeHtml(tok)}</span>`;
      }
      atCmdStart = false;
      return `<span class="tok-path">${escapeHtml(tok)}</span>`;
    }).join("");
  }).join("");
}

// Formats output text, turning a trailing "[Exit code: N]" marker (or
// "exit code N" already in that shape) into a small colored line
// instead of raw bracketed text.
export function formatIOOutput(out) {
  const m = out.match(/^([\s\S]*?)\s*\[Exit code:\s*(-?\d+)\]\s*$/);
  if (!m) return escapeHtml(out);
  const [, body, code] = m;
  const cls = code === "0" ? "io-exit-ok" : "io-exit-err";
  const bodyHtml = body.trim() ? escapeHtml(body.trim()) + "\n\n" : "";
  return `${bodyHtml}<span class="${cls}">exit code ${escapeHtml(code)}</span>`;
}

export function addIOCard(inputText, outputText, persist = true, beforeEl = null, blocked = false) {
  const { chat, chatScroll } = getEls();
  const div = document.createElement("div");
  div.className = "flex justify-start w-full";
  const out = (outputText && outputText.trim()) ? outputText : "(no output)";
  const isErr = blocked || /\[Exit code: [1-9]/.test(out) || /^Execution error:/.test(out) || /^Command timed out/.test(out);
  div.innerHTML = `
    <div class="max-w-full w-full io-card${blocked ? " io-card-blocked" : ""}">
      <div class="io-section">
        <div class="io-header">bash${blocked ? ` <span class="io-blocked-badge">BLOCKED</span>` : ""}</div>
        <pre class="io-content">${highlightBash(inputText || "")}</pre>
      </div>
      <div class="io-section">
        <div class="io-header">Output</div>
        <pre class="io-content${isErr ? " io-output-err" : ""}">${formatIOOutput(out)}</pre>
      </div>
    </div>`;
  // beforeEl beriladi -> shu element (masalan hali faol "thinking"
  // qatori)dan OLDIN kiritamiz, aks holda yangi box doim eng pastga —
  // hali ishlab turgan thinking indikatoridan HAM pastga tushib
  // qolardi, tartib teskari ko'rinardi (terminaldagidek: bajarilgan
  // komanda tepada, "hozir ishlayapti" belgisi doim eng pastda turishi
  // kerak).
  if (beforeEl && beforeEl.parentNode === chat) {
    chat.insertBefore(div, beforeEl);
  } else {
    chat.appendChild(div);
  }
  chatScroll.scrollTop = chatScroll.scrollHeight;

  if (persist) {
    const active = getActiveChat();
    if (active) {
      active.messages.push({ kind: "io", input: inputText, output: outputText, blocked });
      saveChats();
    }
  }

  return div;
}
