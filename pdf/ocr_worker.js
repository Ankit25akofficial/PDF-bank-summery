const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { createCanvas } = require("canvas");

// Disable worker logging for cleaner output, or set to true for debugging
const DEBUG = false;

const filePath = process.argv[2];

if (!filePath) {
  process.exit(1);
}

async function performOCR(filePath) {
  let worker = null;
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = new Uint8Array(dataBuffer);

    // Load PDF
    const loadingTask = pdfjsLib.getDocument({
      data: data,
      verbosity: 0,
    });
    const doc = await loadingTask.promise;

    // Initialize Tesseract Worker (v6/v7 syntax)
    // createWorker('eng') handles loading and initialization automatically
    worker = await createWorker('eng');
    
    // Legacy v5 calls removed (loadLanguage, initialize)

    let fullText = "";

    console.error(`Debug: Processing ${doc.numPages} pages`);

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 4.0 }); 
        
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d");

        await page.render({
            canvasContext: context,
            viewport: viewport,
        }).promise;

        const buffer = canvas.toBuffer('image/png');
        // fs.writeFileSync(`debug_page_${i}.png`, buffer); // Debug saving disabled

        const { data: { text } } = await worker.recognize(buffer);
        fullText += text + "\n";
    }

    process.stdout.write(JSON.stringify({ text: fullText }));
  } catch (err) {
      console.error("OCR Worker Error:", err);
      process.exit(1);
  } finally {
      if (worker) {
          await worker.terminate();
      }
  }
}

performOCR(filePath);
