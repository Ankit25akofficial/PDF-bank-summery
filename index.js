const fs = require("fs-extra"); // Use fs-extra for better ensureDir
const path = require("path");

const downloadPDFs = require("./puppeteer/downloadDrivePDFs.js"); 

const readPdf = require("./pdf/readPdf");
const createPdf = require("./pdf/createPdf");
const { categorizeText, analyzeForChart } = require("./ai/chatAndCategorize");

const DOWNLOADS = path.resolve(__dirname, "downloads");
const OUTPUT = path.resolve(__dirname, "output");

const readline = require("readline");

async function main() {
  console.log("=== Auto PDF Automation Started ===");
  
  // 0. Get User Input
  const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
  });

  const url = await new Promise(resolve => {
      rl.question("👉 Paste Google Drive Folder Link (or press Enter for default): ", (answer) => {
          resolve(answer.trim());
          rl.close();
      });
  });

  // 1. Download PDFs
  await downloadPDFs(url);

  // 2. Setup Output
  if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT);

  // 3. Process Files
  if (fs.existsSync(DOWNLOADS)) {
    const files = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".pdf"));

    if (files.length === 0) {
      console.log("⚠️ No PDFs found in downloads folder.");
      return;
    }

    console.log(`🔎 Found ${files.length} PDFs. Processing...`);

    for (const file of files) {
      const filePath = path.join(DOWNLOADS, file);
      
      try {
        console.log(`📄 Reading: ${file}`);
        const text = await readPdf(filePath);

        console.log(`🤖 Analyzing with Offline Logic...`);
        const category = categorizeText(text, file);
        const analysis = analyzeForChart(text, file); // Replaces chatWithPdf

        const categoryDir = path.join(OUTPUT, category);
        if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir);

        console.log(`✍️ Creating Report with Pie Chart in ${category}...`);
        await createPdf({
          title: file,
          category,
          analysis,
          outputPath: path.join(categoryDir, `Report_${file}`), 
        });

        console.log(`✅ Completed: ${file}`);
      } catch (err) {
        console.error(`❌ Failed to process ${file}:`, err);
        fs.writeFileSync("error_log.txt", `Error processing ${file}: ${err.stack}\n`);
      }
    }
  } else {
    console.error("❌ Downloads folder not found!");
  }
  
  console.log("=== Automation Finished ===");
}

main();
