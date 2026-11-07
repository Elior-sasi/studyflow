// Pure text utilities: lesson cards, safe light formatting, word diff and source retrieval.
// No DOM access, so everything here is unit-tested in Node.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Short stable FNV-1a hash used to remember which card text was read. */
export function hash(text) {
  let h = 0x811c9dc5;
  const s = String(text).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const CARD_TARGET = 650;

/**
 * Split a summary into reader cards.
 * Markdown headings (#, ##, ###) start a new card. Without headings,
 * paragraphs are grouped into cards of roughly CARD_TARGET characters.
 */
export function splitCards(title, text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!src) return [];
  const lines = src.split('\n');
  const hasHeadings = lines.some(l => /^#{1,3}\s+\S/.test(l));
  const cards = [];
  if (hasHeadings) {
    let current = null;
    for (const line of lines) {
      const m = /^#{1,3}\s+(.+)$/.exec(line);
      if (m) {
        if (current && (current.body.trim() || current.title)) cards.push(current);
        current = { title: m[1].trim(), body: '' };
      } else {
        current ??= { title: title || '', body: '' };
        current.body += line + '\n';
      }
    }
    if (current) cards.push(current);
  } else {
    const paragraphs = src.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let body = '';
    for (const p of paragraphs) {
      if (body && body.length + p.length > CARD_TARGET) {
        cards.push({ title: '', body });
        body = '';
      }
      body += (body ? '\n\n' : '') + p;
    }
    if (body) cards.push({ title: '', body });
  }
  // Very long single cards are split further so speech and reading stay manageable.
  const out = [];
  for (const c of cards) {
    const body = c.body.trim();
    if (body.length <= CARD_TARGET * 2) { out.push({ title: c.title, body }); continue; }
    const parts = body.match(/[\s\S]{1,1100}(?:\n|\.\s|$)|[\s\S]{1,1100}/g) || [body];
    parts.forEach((p, i) => out.push({ title: c.title + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''), body: p.trim() }));
  }
  return out.slice(0, 400).map((c, index) => ({ index, title: c.title, body: c.body, id: hash(c.title + '\n' + c.body) }));
}

/** Escape first, then apply a tiny, safe subset of formatting: bullet lists, numbered lists and **bold**. */
export function formatBody(text) {
  const lines = esc(text).split('\n');
  let html = '', list = '';
  const close = () => { if (list) { html += `</${list}>`; list = ''; } };
  const inline = s => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  for (const line of lines) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line), numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (list !== type) { close(); html += `<${type}>`; list = type; }
      html += `<li>${inline((bullet || numbered)[1])}</li>`;
    } else if (!line.trim()) {
      close();
    } else {
      close();
      html += `<p>${inline(line)}</p>`;
    }
  }
  close();
  return html;
}

/** Plain text for speech: removes markdown markers. */
export function speechText(card) {
  const clean = s => String(s || '').replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/gm, '').replace(/^#+\s*/gm, '').trim();
  return [clean(card.title), clean(card.body)].filter(Boolean).join('. ');
}

function tokens(s) {
  return String(s).match(/\s+|[^\s]+/g) || [];
}

/**
 * Word-level diff (LCS). Falls back to a line diff for very large inputs to keep it fast.
 * Returns [{op:'eq'|'del'|'ins', text}].
 */
export function diffWords(a, b) {
  let A = tokens(a), B = tokens(b);
  if (A.length * B.length > 4_000_000) {
    A = String(a).split(/(?<=\n)/);
    B = String(b).split(/(?<=\n)/);
  }
  if (A.length * B.length > 16_000_000) return [{ op: 'del', text: a }, { op: 'ins', text: b }];
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const push = (op, text) => { const last = out.at(-1); if (last && last.op === op) last.text += text; else out.push({ op, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('eq', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++]);
    else push('ins', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('ins', B[j++]);
  return out;
}

export function diffStats(parts) {
  const count = op => parts.filter(p => p.op === op).reduce((a, p) => a + (p.text.match(/\S+/g) || []).length, 0);
  return { added: count('ins'), removed: count('del') };
}

/** Accessible diff markup: <ins>/<del> plus hidden text, so the change is not conveyed by color alone. */
export function diffHTML(parts) {
  return parts.map(p => {
    const t = esc(p.text);
    if (p.op === 'eq') return t;
    if (p.op === 'ins') return `<ins><span class="sr-only">[הוספה: </span>${t}<span class="sr-only">]</span></ins>`;
    return `<del><span class="sr-only">[מחיקה: </span>${t}<span class="sr-only">]</span></del>`;
  }).join('');
}

const STOP = new Set('של את על עם זה זו גם או אם כי לא כן מה מי איך למה כמה הוא היא הם הן אני אתה את יש אין עוד רק כל בין אל לי לך לו לה the a an of to in is and or for on what how why'.split(' '));
function words(s) {
  return (String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .map(w => w.replace(/^[והבכלמש](?=[\p{L}]{3,})/u, ''))
    .filter(w => w.length > 1 && !STOP.has(w));
}

/**
 * Pick the most relevant cards for a question (simple term overlap scoring).
 * docs: [{noteId, courseId, label, cards:[{index,title,body}]}]
 */
export function retrieve(question, docs, limit = 6) {
  const q = new Set(words(question));
  const scored = [];
  for (const d of docs) for (const c of d.cards) {
    const w = words(c.title + ' ' + c.body);
    let score = 0;
    for (const t of w) if (q.has(t)) score++;
    for (const t of words(c.title)) if (q.has(t)) score += 2;
    if (score) scored.push({ score: score / Math.sqrt(w.length + 5), noteId: d.noteId, courseId: d.courseId, card: c.index, label: `${d.label} · כרטיס ${c.index + 1}`, text: (c.title ? c.title + '\n' : '') + c.body });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
