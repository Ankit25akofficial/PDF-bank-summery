const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const { createCanvas } = require("canvas");

async function createPdf({ title, category, analysis, outputPath }) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  let yPos = height - 50;
  const margin = 50;

  // Helper: Check Page Break
  const checkPageBreak = (neededSpace) => {
      if (yPos - neededSpace < 50) {
          page = pdfDoc.addPage();
          yPos = height - 50;
      }
  };

  // --- Header ---
  page.drawText(`Financial Report: ${title}`, { x: margin, y: yPos, size: 20, font: boldFont, color: rgb(0, 0.2, 0.4) });
  yPos -= 30;
  page.drawText(`Generated on: ${new Date().toDateString()}`, { x: margin, y: yPos, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
  yPos -= 40;

  // --- Executive Summary ---
  page.drawText("Executive Summary", { x: margin, y: yPos, size: 14, font: boldFont, color: rgb(0, 0.2, 0.4) });
  yPos -= 20;

  const summaryLines = analysis.summary.split('\n');
  for (const line of summaryLines) {
      if (line.trim() === "") continue;
      // Skip the old generic lines if they duplicate what we are about to show
      if (line.includes("Transaction Type")) continue; 
      page.drawText(line, { x: margin, y: yPos, size: 10, font });
      yPos -= 15;
  }
  yPos -= 20;

  // --- Quick Spend Summary (New Feature) ---
  checkPageBreak(100);
  page.drawText("Quick Spend Summary", { x: margin, y: yPos, size: 14, font: boldFont, color: rgb(0, 0.2, 0.4) });
  yPos -= 20;
  
  // Construct summary from groups
  let totalIn = analysis.groups["Incoming / Credits"].reduce((a,b)=>a+b.amount,0);
  let totalFood = analysis.groups["Food & Beverages"].reduce((a,b)=>a+b.amount,0);
  let totalGroc = analysis.groups["Groceries / Small Purchases"].reduce((a,b)=>a+b.amount,0);
  let totalTrans = analysis.groups["Personal Transfers (Sent)"].reduce((a,b)=>a+b.amount,0);
  
  const quickStats = [
      `• Money Received: Rs. ${totalIn.toFixed(2)}`,
      `• Food & Drinks: Rs. ${totalFood.toFixed(2)}`,
      `• Groceries: Rs. ${totalGroc.toFixed(2)}`,
      `• Transfers (Sent): Rs. ${totalTrans.toFixed(2)}`
  ];

  for (const stat of quickStats) {
      page.drawText(stat, { x: margin + 10, y: yPos, size: 11, font, color: rgb(0, 0.4, 0) });
      yPos -= 18;
  }
  yPos -= 20;

  // --- Category Breakdown Tables ---
  const tableHeaders = ["Incoming / Credits", "Food & Beverages", "Groceries / Small Purchases", "Personal Transfers (Sent)", "Unclear / Needs Review"];
  
  for (const catName of tableHeaders) {
      const items = analysis.groups[catName];
      if (!items || items.length === 0) continue;

      checkPageBreak(100); // Check enough space for header + at least 1 row
      
      // Category Header
      page.drawText(catName, { x: margin, y: yPos, size: 12, font: boldFont, color: rgb(0, 0, 0) });
      yPos -= 20;

      // Table Header Row
      page.drawRectangle({ x: margin, y: yPos - 5, width: width - 100, height: 20, color: rgb(0.9, 0.9, 0.9) });
      page.drawText("Date", { x: margin + 5, y: yPos, size: 9, font: boldFont });
      page.drawText("Description", { x: margin + 80, y: yPos, size: 9, font: boldFont });
      page.drawText("Amount", { x: width - margin - 60, y: yPos, size: 9, font: boldFont });
      yPos -= 20;

      // Rows
      for (const item of items) {
          checkPageBreak(20);
          page.drawText(item.date || "-", { x: margin + 5, y: yPos, size: 9, font });
          
          // Truncate description to fit
          let desc = item.desc.length > 50 ? item.desc.substring(0, 47) + "..." : item.desc;
          page.drawText(desc, { x: margin + 80, y: yPos, size: 9, font });
          
          page.drawText(`Rs.${item.amount.toFixed(2)}`, { x: width - margin - 60, y: yPos, size: 9, font });
          yPos -= 15;
      }
      yPos -= 10; // Extra spacing after table
  }


  // --- Visualization Section (Charts) ---
  checkPageBreak(300); // Need substantial space for charts
  page.drawText("Visual Analysis", { x: margin, y: yPos, size: 14, font: boldFont, color: rgb(0, 0.2, 0.4) });
  yPos -= 250; 

  // 1. Pie Chart
  const pieBuffer = await generatePieChartImage(analysis.chartData);
  const pieImage = await pdfDoc.embedPng(pieBuffer);
  const pieDims = pieImage.scale(0.5);
  
  page.drawImage(pieImage, {
      x: margin,
      y: yPos,
      width: pieDims.width,
      height: pieDims.height,
  });

  // 2. Bar Chart (Next to Pie if fits, otherwise new line)
  const barBuffer = await generateBarChartImage(analysis.chartData);
  const barImage = await pdfDoc.embedPng(barBuffer);
  const barDims = barImage.scale(0.5);

  page.drawImage(barImage, {
      x: margin + 220,
      y: yPos,
      width: barDims.width,
      height: barDims.height,
  });
  
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

// Helper: Custom Colors for Chart
const CHART_COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

async function generatePieChartImage(data) {
    const width = 400;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Bg
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    let startAngle = 0;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 100;

    let i = 0;
    for (const [label, value] of Object.entries(data)) {
        if (value <= 0) continue;
        const sliceAngle = (value / 100) * 2 * Math.PI;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.fill();

        // Legend
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.fillText(`${label} (${value}%)`, 10, 20 + (i * 15));
        
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.fillRect(160, 10 + (i * 15), 10, 10);

        startAngle += sliceAngle;
        i++;
    }
    return canvas.toBuffer('image/png');
}

async function generateBarChartImage(data) {
    const width = 400;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    const padding = 40;
    const chartHeight = height - (padding * 2);
    
    // Axes
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    let xPos = padding + 15;
    const barWidth = 30;
    let i = 0;

    for (const [label, value] of Object.entries(data)) {
        if (value <= 0) continue;
        const barHeight = (value / 100) * chartHeight;
        
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.fillRect(xPos, height - padding - barHeight, barWidth, barHeight);

        // Label (Rotated if needed, but keeping simple here)
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.fillText(label.split(' ')[0], xPos, height - padding + 15); // Just first word of label
        ctx.fillText(`${value}%`, xPos, height - padding - barHeight - 5);

        xPos += barWidth + 25;
        i++;
    }

    return canvas.toBuffer('image/png');
}

module.exports = createPdf;
