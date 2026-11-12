'use strict';
/** Word export: brief, summary, action items, and the full transcript. */

const fs = require('fs');
const path = require('path');
// Guarded so the exporter can also be exercised outside Electron (tools/).
let app = null;
try { ({ app } = require('electron')); } catch { /* plain node */ }

async function exportMeeting(m) {
  if (!m) return { ok: false, error: 'Meeting not found.' };

  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
  } = require('docx');

  const H = (text, level = HeadingLevel.HEADING_2) =>
    new Paragraph({ text, heading: level, spacing: { before: 260, after: 110 } });
  const P = (text, opts = {}) =>
    new Paragraph({ children: [new TextRun({ text: String(text ?? ''), ...opts })], spacing: { after: 90 } });
  const Bullet = (text) =>
    new Paragraph({ children: [new TextRun(String(text ?? ''))], bullet: { level: 0 }, spacing: { after: 60 } });

  const b = m.brief || {};
  const s = m.summary || null;
  const when = new Date(m.createdAt);
  const title = b.title || b.company || 'Meeting';

  const kids = [];

  kids.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 36 })],
    alignment: AlignmentType.LEFT, spacing: { after: 60 },
  }));
  kids.push(P(`${when.toLocaleDateString()} · ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    { color: '767676', size: 20 }));

  // --- brief
  const briefRows = [
    ['Type', b.kind], ['Company / client', b.company], ['My role', b.role],
    ['Talking to', b.otherSide], ['Goal', b.goal],
  ].filter(([, v]) => v && String(v).trim());

  if (briefRows.length) {
    kids.push(H('Brief'));
    kids.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: briefRows.map(([k, v]) => new TableRow({
        children: [
          new TableCell({ width: { size: 26, type: WidthType.PERCENTAGE }, children: [P(k, { bold: true, size: 20 })] }),
          new TableCell({ children: [P(v, { size: 20 })] }),
        ],
      })),
    }));
  }

  // --- summary
  if (s) {
    if (s.summary) { kids.push(H('Summary')); kids.push(P(s.summary)); }
    if (s.keyPoints?.length) { kids.push(H('Key points')); s.keyPoints.forEach((x) => kids.push(Bullet(x))); }
    if (s.decisions?.length) { kids.push(H('Decisions')); s.decisions.forEach((x) => kids.push(Bullet(x))); }
    if (s.actionItems?.length) {
      kids.push(H('Action items'));
      s.actionItems.forEach((a) => kids.push(Bullet(
        typeof a === 'string' ? a : `${a.who === 'me' ? 'Me' : a.who === 'them' ? 'Them' : (a.who || '')}: ${a.what}${a.due ? ` — ${a.due}` : ''}`,
      )));
    }
    if (s.questionsRaised?.length) { kids.push(H('Questions raised')); s.questionsRaised.forEach((x) => kids.push(Bullet(x))); }
    if (s.followUp) { kids.push(H('Suggested follow-up')); kids.push(P(s.followUp, { italics: true })); }
  }

  if (m.notes?.length) { kids.push(H('Notes')); m.notes.forEach((n) => kids.push(Bullet(n.text))); }

  // --- transcript
  kids.push(H('Full transcript'));
  if (!m.transcript?.length) {
    kids.push(P('(nothing was recorded)', { italics: true, color: '767676' }));
  } else {
    for (const t of m.transcript) {
      kids.push(new Paragraph({
        children: [
          new TextRun({ text: (t.role === 'them' ? 'THEM' : 'ME') + '  ', bold: true, size: 17, color: t.role === 'them' ? '1F6FB2' : '4B7A2B' }),
          new TextRun({ text: t.text, size: 21 }),
        ],
        spacing: { after: 80 },
      }));
    }
  }

  const doc = new Document({
    creator: 'Meeting Copilot',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: {}, children: kids }],
  });

  const buf = await Packer.toBuffer(doc);

  const dir = app ? app.getPath('downloads') : process.cwd();
  const safe = String(title).replace(/[^\w\d\- ]+/g, '').trim().slice(0, 60) || 'meeting';
  let file = path.join(dir, `${safe} - ${m.id}.docx`);
  let n = 1;
  while (fs.existsSync(file)) file = path.join(dir, `${safe} - ${m.id} (${n++}).docx`);

  fs.writeFileSync(file, buf);
  return { ok: true, path: file };
}

module.exports = { exportMeeting };
