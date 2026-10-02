import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

/**
 * Renders a built report to a downloadable file. A report is
 * `{ title, subtitle, summary: [{ label, value }], columns: [{ header, key, width }], rows }`
 * where each row is a plain object keyed by the column keys; `width` is a
 * relative weight (roughly characters) used by both formats.
 */

function cellValue(value) {
  if (value == null) return ''
  if (value instanceof Date) return value
  return value
}

function formatForPdf(value) {
  if (value == null || value === '') return '—'
  if (value instanceof Date) return value.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return String(value)
}

export async function reportToXlsx(report) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Facility Management'
  wb.created = new Date()
  const ws = wb.addWorksheet(report.title.slice(0, 31))

  ws.addRow([report.title]).font = { bold: true, size: 14 }
  ws.addRow([report.subtitle]).font = { color: { argb: 'FF6B7280' } }
  ws.addRow([])
  for (const s of report.summary) {
    const row = ws.addRow([s.label, s.value])
    row.getCell(1).font = { color: { argb: 'FF6B7280' } }
    row.getCell(2).font = { bold: true }
    row.getCell(2).alignment = { horizontal: 'left' }
  }
  ws.addRow([])

  const header = ws.addRow(report.columns.map((c) => c.header))
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F6B6B' } }
    cell.alignment = { vertical: 'middle' }
  })
  const headerRowNumber = header.number

  for (const r of report.rows) {
    const row = ws.addRow(report.columns.map((c) => cellValue(r[c.key])))
    report.columns.forEach((c, i) => {
      if (r[c.key] instanceof Date) row.getCell(i + 1).numFmt = 'dd mmm yyyy'
    })
  }

  report.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(c.width ?? 14, c.header.length + 2)
  })
  ws.views = [{ state: 'frozen', ySplit: headerRowNumber }]
  if (report.rows.length) {
    ws.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: report.columns.length } }
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function reportToPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const bottom = doc.page.height - doc.page.margins.bottom

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111').text(report.title, left, doc.y)
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text(report.subtitle)
    doc.moveDown(0.8)

    // Summary as a row of label/value pairs.
    if (report.summary.length) {
      const boxW = usable / Math.min(report.summary.length, 6)
      let x = left
      let y = doc.y
      report.summary.forEach((s, i) => {
        if (i > 0 && i % 6 === 0) {
          x = left
          y += 34
        }
        doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(s.label, x, y, { width: boxW - 8 })
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(String(s.value), x, y + 11, { width: boxW - 8 })
        x += boxW
      })
      doc.y = y + 40
    }

    const totalWeight = report.columns.reduce((n, c) => n + (c.width ?? 14), 0)
    const widths = report.columns.map((c) => (usable * (c.width ?? 14)) / totalWeight)
    const rowH = 18
    // A fixed one-line height makes pdfkit truncate with an ellipsis instead of
    // wrapping into the next row (lineBreak:false alone still wraps).
    const cell = (w) => ({ width: w - 10, height: 11, ellipsis: true })

    const drawHeader = () => {
      const y = doc.y
      doc.rect(left, y, usable, rowH).fill('#0F6B6B')
      let x = left
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF')
      report.columns.forEach((c, i) => {
        doc.text(c.header, x + 5, y + 5, cell(widths[i]))
        x += widths[i]
      })
      doc.y = y + rowH
    }

    drawHeader()
    if (!report.rows.length) {
      doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('No data for this selection.', left, doc.y + 8)
    }
    report.rows.forEach((r, idx) => {
      if (doc.y + rowH > bottom) {
        doc.addPage()
        drawHeader()
      }
      const y = doc.y
      if (idx % 2 === 1) doc.rect(left, y, usable, rowH).fill('#F4F6F5')
      let x = left
      doc.font('Helvetica').fontSize(8.5).fillColor('#222222')
      report.columns.forEach((c, i) => {
        doc.text(formatForPdf(r[c.key]), x + 5, y + 5, cell(widths[i]))
        x += widths[i]
      })
      doc.y = y + rowH
    })

    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      // Writing inside the bottom margin would otherwise trigger an automatic page break.
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(7.5).fillColor('#9CA3AF')
      doc.text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 24, { width: usable, align: 'right', lineBreak: false })
    }
    doc.end()
  })
}
