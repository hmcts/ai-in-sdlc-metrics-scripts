const PDFDocument = require('pdfkit');

function createDoc(outputPath) {
  const doc = new PDFDocument({ autoFirstPage: false });
  const fs = require('fs');
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);
  return { doc, stream };
}

function drawSectionHeader(doc, title) {
  const margin = 40;
  const headerHeight = 35;
  const radius = 10;
  const pageWidth = doc.page.width - margin * 2;
  const y = doc.y;

  doc.save()
    .roundedRect(margin, y, pageWidth, headerHeight, radius)
    .fill('#182549');
  doc.restore();

  doc.fillColor('white').fontSize(18).text(title, margin + 15, y + 10);
  doc.moveDown(2);
  doc.fillColor('black');
}

function addChartsGrid(doc, charts) {
  const margin = 40;
  const cols = 2;
  const cellWidthGap = margin;
  const cellWidth = (doc.page.width - margin * (cols + 1)) / cols;
  const cellHeight = 160;
  const startY = doc.y;

  charts.forEach((chart, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = margin + col * (cellWidth + cellWidthGap);
    const y = startY + row * cellHeight;

    doc.image(chart.buffer, x, y, {
      fit: [cellWidth, cellHeight],
      align: 'left',
      valign: 'top'
    });
  });
}

module.exports = { createDoc, drawSectionHeader, addChartsGrid };
