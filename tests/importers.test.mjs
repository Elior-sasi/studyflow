import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pptxToMarkdown, readZip, slideParagraphs } from '../importers.mjs';

test('PowerPoint import keeps slide order, titles, bullet levels, entities and speaker notes', async () => {
  const buf = await readFile(new URL('./fixtures/sample.pptx', import.meta.url));
  const { markdown, slides } = await pptxToMarkdown(buf);
  assert.equal(slides, 2);
  assert.equal(markdown, '# מבוא לסטטיסטיקה\n- שיעור 1 & "חזרה"\n\n# התפלגות נורמלית\n- צורת פעמון\n  - ממוצע וסטיית תקן\n\nהערות המרצה: להדגיש את כלל 68-95-99.7');
});

test('non-PowerPoint input is rejected with a Hebrew message', async () => {
  assert.throws(() => readZip(new TextEncoder().encode('not a zip')), /אינו קובץ PowerPoint/);
  assert.deepEqual(slideParagraphs('<p:sp><a:p><a:r><a:t>&lt;b&gt;</a:t></a:r></a:p></p:sp>'), [{ text: '<b>', isTitle: false, level: 0 }]);
});
