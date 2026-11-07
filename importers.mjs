// File importers that run fully in the browser: a minimal ZIP reader and PowerPoint (.pptx) text extraction.
// Uses DecompressionStream('deflate-raw') (Safari 16.4+, Chrome, Firefox, Node 18+). No third-party code.

const MAX_ENTRY = 8_000_000;

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length > MAX_ENTRY) throw Error('קובץ פנימי גדול מדי.');
  return out;
}

/** Read a ZIP archive into a Map(name -> async () => Uint8Array). */
export function readZip(buffer) {
  const data = new Uint8Array(buffer), view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Error('הקובץ אינו קובץ PowerPoint תקין.');
  const count = view.getUint16(eocd + 10, true), dirOffset = view.getUint32(eocd + 16, true);
  if (count > 5000) throw Error('הקובץ מכיל יותר מדי פריטים.');
  const entries = new Map(), dec = new TextDecoder();
  let p = dirOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw Error('מבנה הקובץ פגום.');
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true), usize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true), local = view.getUint32(p + 42, true);
    const name = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, async () => {
      if (usize > MAX_ENTRY) throw Error('קובץ פנימי גדול מדי.');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = data.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return inflate(raw);
      throw Error('שיטת דחיסה לא נתמכת.');
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const decodeXML = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/** Paragraph texts of one shape tree XML, with whether each belongs to a title placeholder. */
export function slideParagraphs(xml) {
  const out = [];
  for (const sp of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []) {
    const isTitle = /<p:ph\b[^>]*type="(title|ctrTitle)"/.test(sp);
    for (const para of sp.match(/<a:p\b[\s\S]*?<\/a:p>/g) || []) {
      const text = decodeXML((para.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map(t => t.replace(/<\/?a:t>/g, '')).join('')).replace(/\s+/g, ' ').trim();
      if (text) out.push({ text, isTitle, level: Number(/<a:pPr\b[^>]*lvl="(\d)"/.exec(para)?.[1] || 0) });
    }
  }
  // tables
  for (const cell of xml.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []) {
    const text = decodeXML((cell.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map(t => t.replace(/<\/?a:t>/g, '')).join(' ')).trim();
    if (text && !out.some(o => o.text === text)) out.push({ text, isTitle: false, level: 0 });
  }
  return out;
}

/** Extract a PowerPoint file into lesson markdown: one "# " card per slide, bullets, and speaker notes. */
export async function pptxToMarkdown(buffer) {
  const zip = readZip(buffer);
  const dec = new TextDecoder();
  const slides = [...zip.keys()].map(n => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)).filter(Boolean).sort((a, b) => a[1] - b[1]);
  if (!slides.length) throw Error('לא נמצאו שקופיות בקובץ.');
  const parts = [];
  for (const [name, num] of slides.slice(0, 300)) {
    const paras = slideParagraphs(dec.decode(await zip.get(name)()));
    const title = paras.find(p => p.isTitle)?.text || `שקופית ${num}`;
    const body = paras.filter(p => !p.isTitle || p.text !== title).map(p => '  '.repeat(Math.min(p.level, 2)) + '- ' + p.text);
    // Notes are linked through the slide's relationships, not by matching numbers.
    const relsName = `ppt/slides/_rels/slide${num}.xml.rels`;
    const rels = zip.has(relsName) ? dec.decode(await zip.get(relsName)()) : '';
    const target = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1];
    const notesName = target ? 'ppt/notesSlides/' + target : '';
    let notes = '';
    if (notesName && zip.has(notesName)) {
      notes = slideParagraphs(dec.decode(await zip.get(notesName)())).filter(p => !/^\d+$/.test(p.text)).map(p => p.text).join(' ');
    }
    parts.push(`# ${title}\n${body.join('\n')}${notes ? `\n\nהערות המרצה: ${notes}` : ''}`);
  }
  return { markdown: parts.join('\n\n').trim(), slides: slides.length };
}
