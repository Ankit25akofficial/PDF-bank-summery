const fs = require("fs");
// pdfjs-dist v2 legacy build for Node.js
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const filePath = process.argv[2];

if (!filePath) {
  process.exit(1);
}

const dataBuffer = fs.readFileSync(filePath);
const data = new Uint8Array(dataBuffer);

const loadingTask = pdfjsLib.getDocument({
  data: data,
  verbosity: 0
});

loadingTask.promise.then(async function(doc) {
  let fullText = "";
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += strings.join(" ") + "\n";
  }
  
  process.stdout.write(JSON.stringify({ text: fullText }));
}).catch(function(err) {
  console.error("Worker Error details written to worker_error.log");
  fs.writeFileSync("worker_error.log", err.toString());
  process.exit(1);
});
