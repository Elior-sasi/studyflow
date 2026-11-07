import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCards, formatBody, diffWords, diffHTML, diffStats, retrieve, hash, speechText } from '../content.mjs';

test('headings split a summary into titled cards; plain text groups paragraphs', () => {
  const cards = splitCards('סטטיסטיקה', 'פתיחה\n# א\nגוף א\n## ב\nגוף ב');
  assert.deepEqual(cards.map(c => c.title), ['סטטיסטיקה', 'א', 'ב']);
  const plain = splitCards('t', Array.from({ length: 6 }, (_, i) => 'פסקה '.repeat(40) + i).join('\n\n'));
  assert.ok(plain.length >= 2);
  assert.ok(plain.every(c => c.body.length <= 1300));
  assert.deepEqual(splitCards('t', '   '), []);
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
});

test('card ids are stable and whitespace-insensitive', () => {
  assert.equal(hash('a  b\n'), hash('a b'));
  assert.notEqual(hash('a'), hash('b'));
  assert.match(hash('שלום'), /^[0-9a-f]{8}$/);
});

test('formatting escapes HTML before applying lists and bold', () => {
  const html = formatBody('<img src=x onerror=alert(1)>\n- **חשוב** נקודה\n1. ראשון');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /<ul><li><strong>חשוב<\/strong> נקודה<\/li><\/ul>/);
  assert.match(html, /<ol><li>ראשון<\/li><\/ol>/);
  assert.equal(speechText({ title: 'כותרת', body: '- **נקודה**' }), 'כותרת. נקודה');
});

test('word diff reconstructs both versions and marks changes without color only', () => {
  const a = 'משפט הגבול המרכזי אומר שממוצעים מתפלגים נורמלית', b = 'משפט הגבול המרכזי קובע שממוצעים של מדגמים גדולים מתפלגים בקירוב נורמלית';
  const parts = diffWords(a, b);
  assert.equal(parts.filter(p => p.op !== 'ins').map(p => p.text).join(''), a);
  assert.equal(parts.filter(p => p.op !== 'del').map(p => p.text).join(''), b);
  const s = diffStats(parts);
  assert.ok(s.added > 0 && s.removed > 0);
  const html = diffHTML(diffWords('<b>', '<i>'));
  assert.doesNotMatch(html, /<b>|<i>/);
  assert.match(html, /\[הוספה: /);
  assert.match(html, /\[מחיקה: /);
});

test('retrieval ranks matching cards and labels the source card', () => {
  const docs = [{ noteId: 'n1', courseId: 'c1', label: 'סטטיסטיקה · סיכום', cards: splitCards('x', '# התפלגות נורמלית\nפעמון וסטיית תקן\n# רגרסיה\nקו ישר ושיפוע') }];
  const r = retrieve('מה זו סטיית תקן בהתפלגות?', docs);
  assert.equal(r[0].card, 0);
  assert.match(r[0].label, /כרטיס 1/);
  assert.deepEqual(retrieve('בננה', docs), []);
});
