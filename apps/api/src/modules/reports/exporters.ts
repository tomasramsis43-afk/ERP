import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Lang, Table } from './export-tables';

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

export async function renderXlsx(table: Table, lang: Lang): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP';
  const ws = wb.addWorksheet(table.title.slice(0, 31), { views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 3 }] });
  ws.columns = table.columns.map((c) => ({ key: c.key, width: c.width }));
  ws.addRow([table.title]).font = { bold: true, size: 14 };
  ws.addRow([table.subtitle ?? '']);
  const head = ws.addRow(table.columns.map((c) => c.header));
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  const bold = new Set(table.boldRows ?? []);
  table.rows.forEach((r, i) => {
    // Numbers are written as numbers so the sheet can be summed and sorted.
    const row = ws.addRow(table.columns.map((c) => (c.numeric && r[c.key] !== undefined && r[c.key] !== '' ? Number(r[c.key]) : r[c.key] ?? '')));
    if (bold.has(i)) row.font = { bold: true };
    table.columns.forEach((c, ci) => {
      if (c.numeric) row.getCell(ci + 1).numFmt = '#,##0.00;[Red]-#,##0.00';
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * PDF export uses the built-in Latin fonts, which cannot shape Arabic; Arabic PDFs are
 * produced by printing the web view. Arabic data in an English PDF is refused rather than garbled.
 */
export function renderPdf(table: Table): Promise<Buffer> {
  const everything = [table.title, table.subtitle ?? '', ...table.columns.map((c) => c.header), ...table.rows.flatMap((r) => Object.values(r))];
  if (everything.some(hasArabic)) throw new BadRequestException('PDF export supports English only; use lang=en or export Excel');
  const landscape = table.columns.length > 4;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const usable = doc.page.width - 72;
  const totalWidth = table.columns.reduce((a, c) => a + c.width, 0);
  const widths = table.columns.map((c) => (c.width / totalWidth) * usable);
  const bold = new Set(table.boldRows ?? []);
  const fmt = (v: string, numeric?: boolean) =>
    numeric && v !== '' && v !== undefined ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v ?? '';

  const drawRow = (cells: string[], isBold: boolean) => {
    const y = doc.y;
    let x = 36;
    doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    cells.forEach((text, i) => {
      doc.text(text, x, y, { width: widths[i] - 6, align: table.columns[i].numeric ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + 14;
  };

  doc.font('Helvetica-Bold').fontSize(15).text(table.title, 36, 36);
  doc.font('Helvetica').fontSize(9).text(table.subtitle ?? '');
  doc.moveDown(0.8);
  drawRow(table.columns.map((c) => c.header), true);
  doc.moveTo(36, doc.y).lineTo(36 + usable, doc.y).stroke();
  doc.y += 3;
  table.rows.forEach((r, i) => {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      doc.y = 36;
    }
    drawRow(table.columns.map((c) => fmt(r[c.key], c.numeric)), bold.has(i));
  });
  doc.end();
  return done;
}
