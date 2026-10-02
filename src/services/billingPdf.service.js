import { readFileSync } from 'node:fs'
import PDFDocument from 'pdfkit'

// TeamGenix letterhead, used when the enterprise hasn't uploaded its own logo.
const BRAND_LOGO = readFileSync(new URL('../assets/NavbarLogo.png', import.meta.url))

const inr = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

async function fetchLogo(url) {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!/image\/(png|jpe?g)/.test(type)) return null // pdfkit embeds PNG/JPEG only
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Renders a quotation or invoice as an A4 PDF.
 * @param {'quotation'|'invoice'} kind
 */
export async function billingDocToPdf(kind, doc, { enterprise, client, site }) {
  const logo = (await fetchLogo(enterprise?.logoUrl)) ?? BRAND_LOGO
  // The brand banner is wide (552×243); an uploaded logo is assumed squarish.
  const logoBox = logo === BRAND_LOGO ? [136, 60] : [60, 60]
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true })
    const chunks = []
    pdf.on('data', (c) => chunks.push(c))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)

    const left = pdf.page.margins.left
    const width = pdf.page.width - left - pdf.page.margins.right
    const right = left + width
    const accent = '#0F6B6B'

    // Header: enterprise on the left, document title on the right.
    let y = pdf.y
    let textX = left
    try {
      pdf.image(logo, left, y, { fit: logoBox })
      textX = left + logoBox[0] + 12
    } catch {
      /* unsupported image — skip */
    }
    pdf.font('Helvetica-Bold').fontSize(14).fillColor('#111').text(enterprise?.name ?? '', textX, y, { width: 200 })
    pdf.font('Helvetica').fontSize(8.5).fillColor('#555')
    for (const line of [enterprise?.address, [enterprise?.phone, enterprise?.supportEmail].filter(Boolean).join(' · '), enterprise?.gstin ? `GSTIN: ${enterprise.gstin}` : '']) {
      if (line) pdf.text(line, textX, pdf.y, { width: 200 })
    }
    pdf.font('Helvetica-Bold').fontSize(20).fillColor(accent).text(kind === 'invoice' ? 'TAX INVOICE' : 'QUOTATION', left, y, { width, align: 'right' })
    pdf.font('Helvetica').fontSize(9).fillColor('#333')
    const meta =
      kind === 'invoice'
        ? [`Invoice no: ${doc.code}`, `Date: ${fmtDate(doc.issueDate ?? doc.createdAt)}`, `Due: ${fmtDate(doc.dueDate)}`]
        : [`Quotation no: ${doc.code}`, `Date: ${fmtDate(doc.sentAt ?? doc.createdAt)}`, `Valid until: ${fmtDate(doc.validUntil)}`]
    for (const m of meta) pdf.text(m, left, pdf.y, { width, align: 'right' })

    y = Math.max(pdf.y, y + 70) + 14
    pdf.moveTo(left, y).lineTo(right, y).strokeColor('#DDDDDD').lineWidth(1).stroke()
    y += 12

    // Bill to.
    pdf.font('Helvetica-Bold').fontSize(8).fillColor('#888').text(kind === 'invoice' ? 'BILL TO' : 'PREPARED FOR', left, y)
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(client?.companyName ?? '', left, pdf.y + 2, { width: width / 2 })
    pdf.font('Helvetica').fontSize(9).fillColor('#444')
    for (const line of [client?.contactPerson, client?.address, site ? `Site: ${site.name}${site.address ? `, ${site.address}` : ''}` : '', client?.gstin ? `GSTIN: ${client.gstin}` : '']) {
      if (line) pdf.text(line, left, pdf.y, { width: width / 2 + 60 })
    }
    pdf.moveDown(0.8)
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(doc.title, left, pdf.y, { width })
    pdf.moveDown(0.6)

    // Line items.
    const cols = [
      { h: '#', w: 0.05, align: 'left' },
      { h: 'Description', w: 0.41, align: 'left' },
      { h: 'Qty', w: 0.1, align: 'right' },
      { h: 'Rate', w: 0.14, align: 'right' },
      { h: 'GST', w: 0.1, align: 'right' },
      { h: 'Amount', w: 0.2, align: 'right' },
    ].map((c) => ({ ...c, w: c.w * width }))
    const drawRow = (cells, { bold = false, fill = null } = {}) => {
      const rowY = pdf.y
      const heights = cells.map((c, i) => pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).heightOfString(String(c), { width: cols[i].w - 8 }))
      const h = Math.max(...heights) + 10
      if (rowY + h > pdf.page.height - pdf.page.margins.bottom - 120) {
        pdf.addPage()
        return drawRow(cells, { bold, fill })
      }
      if (fill) pdf.rect(left, rowY, width, h).fill(fill)
      let x = left
      cells.forEach((c, i) => {
        pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(fill === accent ? '#FFFFFF' : '#222').text(String(c), x + 4, rowY + 5, { width: cols[i].w - 8, align: cols[i].align })
        x += cols[i].w
      })
      pdf.y = rowY + h
    }
    drawRow(cols.map((c) => c.h), { bold: true, fill: accent })
    doc.items.forEach((it, i) =>
      drawRow([i + 1, it.description, `${it.quantity} ${it.unit || ''}`.trim(), inr(it.rate), `${it.taxPercent}%`, inr(it.amount)], { fill: i % 2 ? '#F5F7F6' : null }),
    )

    // Totals.
    pdf.moveDown(0.6)
    const totals = [
      ['Subtotal', inr(doc.subtotal)],
      ['GST', inr(doc.taxTotal)],
      ['Total', inr(doc.total)],
    ]
    if (kind === 'invoice' && doc.amountPaid > 0) totals.push(['Paid', inr(doc.amountPaid)], ['Balance due', inr(doc.balance)])
    for (const [label, value] of totals) {
      const bold = label === 'Total' || label === 'Balance due'
      const rowY = pdf.y
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor('#222')
      pdf.text(label, right - 240, rowY, { width: 110, align: 'right' })
      pdf.text(value, right - 125, rowY, { width: 125, align: 'right' })
      pdf.y = rowY + (bold ? 17 : 14)
    }

    for (const [heading, body] of [
      ['Notes', doc.notes],
      ['Terms & conditions', doc.terms],
    ]) {
      if (!body) continue
      pdf.moveDown(0.8)
      pdf.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(heading, left, pdf.y, { width })
      pdf.font('Helvetica').fontSize(8.5).fillColor('#444').text(body, left, pdf.y + 2, { width })
    }

    const range = pdf.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i)
      pdf.page.margins.bottom = 0
      pdf.font('Helvetica').fontSize(7.5).fillColor('#999')
      pdf.text(
        `${kind === 'invoice' ? 'This is a computer-generated invoice.' : 'This quotation is valid until the date shown above.'}  Page ${i + 1} of ${range.count}`,
        left,
        pdf.page.height - 28,
        { width, align: 'center', lineBreak: false },
      )
    }
    pdf.end()
  })
}
